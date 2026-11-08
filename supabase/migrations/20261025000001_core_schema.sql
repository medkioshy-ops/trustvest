-- TrustVest core schema (Phase 3 data dictionary, Table 3) + Phase 4 extensions.
-- Extensions beyond the Phase 3 dictionary are marked "EXT:" and explained in DEVLOG.md.

-- ---------------------------------------------------------------------------
-- WALLET — single row for the single-user scope
-- ---------------------------------------------------------------------------
create table public.wallet (
  wallet_id  uuid primary key not null default gen_random_uuid(),
  balance    numeric(14,2) not null default 0 check (balance >= 0),
  currency   text not null default 'ZAR',
  updated_at timestamptz not null default now()
);
-- EXT: enforce the "single row" note from the data dictionary at DB level.
create unique index wallet_singleton on public.wallet ((true));

-- ---------------------------------------------------------------------------
-- TRANSACTION — deposits and broker trades
-- ---------------------------------------------------------------------------
create table public.transaction (
  transaction_id  uuid primary key not null default gen_random_uuid(),
  wallet_id       uuid not null references public.wallet (wallet_id) on delete restrict,
  type            text not null check (type in ('buy','sell','deposit')),
  amount          numeric(14,2) not null check (amount > 0),
  asset           text not null,
  -- EXT: 'failed' added so a rejected/cancelled broker order is recorded honestly
  -- instead of being silently deleted.
  status          text not null default 'pending'
                  check (status in ('pending','verified','released','failed')),
  created_at      timestamptz not null default now(),
  -- EXT: fields needed to derive holdings and reconcile with Alpaca.
  quantity        numeric(24,9) check (quantity > 0),
  price           numeric(18,6) check (price > 0),
  broker_order_id text unique,
  failure_reason  text,
  updated_at      timestamptz not null default now(),
  constraint trade_has_quantity_when_settled
    check (type = 'deposit' or status in ('pending','failed') or (quantity is not null and price is not null))
);
create index transaction_status_idx on public.transaction (status);
create index transaction_asset_idx  on public.transaction (asset, created_at);

-- ---------------------------------------------------------------------------
-- AI_DECISION — one per decision; 1-to-1 with the transaction it triggers
-- ---------------------------------------------------------------------------
create table public.ai_decision (
  decision_id    uuid primary key not null default gen_random_uuid(),
  -- EXT: nullable so HOLD decisions (which trigger no transaction) are still logged.
  -- UNIQUE keeps the 1-to-1 cardinality whenever a transaction exists.
  transaction_id uuid unique references public.transaction (transaction_id) on delete restrict,
  asset          text not null,   -- EXT: needed for HOLD rows that have no transaction
  reasoning      text not null,
  signal_inputs  jsonb not null,
  action         text not null check (action in ('buy','hold','sell')),
  confidence     numeric(4,3) check (confidence between 0 and 1),
  created_at     timestamptz not null default now(),
  constraint trade_decision_has_transaction
    check ((action = 'hold') = (transaction_id is null))
);
create index ai_decision_created_idx on public.ai_decision (created_at desc);

-- ---------------------------------------------------------------------------
-- LEDGER_ENTRY — tamper-evident hash chain
-- ---------------------------------------------------------------------------
create table public.ledger_entry (
  entry_id       uuid primary key not null default gen_random_uuid(),
  -- EXT: explicit chain position (not part of the hash; order is proven by previous_hash).
  seq            bigint generated always as identity unique,
  -- EXT: what kind of event this entry records.
  kind           text not null check (kind in ('deposit','decision','settlement')),
  transaction_id uuid unique references public.transaction (transaction_id) on delete restrict,
  decision_id    uuid unique references public.ai_decision (decision_id) on delete restrict,
  -- UNIQUE previous_hash stops two writers forking the chain from the same parent.
  previous_hash  text not null unique,
  payload        jsonb not null,
  hash           text not null unique check (hash ~ '^[0-9a-f]{64}$'),
  created_at     timestamptz not null default now(),
  constraint ledger_links_exactly_one check (num_nonnulls(transaction_id, decision_id) = 1)
);

-- Append-only: block UPDATE/DELETE on the ledger and on decisions.
-- (A DB owner can still disable this trigger — that is exactly the case the
-- hash-chain verification is there to catch.)
create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only (% blocked)', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end $$;

create trigger ledger_entry_append_only
  before update or delete on public.ledger_entry
  for each row execute function public.forbid_mutation();

create trigger ai_decision_append_only
  before update or delete on public.ai_decision
  for each row execute function public.forbid_mutation();

create trigger transaction_no_delete
  before delete on public.transaction
  for each row execute function public.forbid_mutation();

-- ---------------------------------------------------------------------------
-- Atomic money movement (escrow-style pending -> verified -> released)
-- ---------------------------------------------------------------------------
create or replace function public.make_deposit(p_amount numeric)
returns public.transaction
language plpgsql as $$
declare
  w public.wallet;
  t public.transaction;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Deposit amount must be greater than 0';
  end if;
  select * into w from public.wallet limit 1 for update;
  if not found then raise exception 'No wallet exists — run the seed script first'; end if;

  insert into public.transaction (wallet_id, type, amount, asset, status)
  values (w.wallet_id, 'deposit', round(p_amount, 2), w.currency, 'verified')
  returning * into t;

  update public.wallet
     set balance = balance + t.amount, updated_at = now()
   where wallet_id = w.wallet_id;

  update public.transaction
     set status = 'released', updated_at = now()
   where transaction_id = t.transaction_id
  returning * into t;
  return t;
end $$;

create or replace function public.settle_transaction(
  p_transaction_id uuid, p_quantity numeric, p_price numeric)
returns public.transaction
language plpgsql as $$
declare
  t public.transaction;
  v_amount numeric(14,2);
begin
  select * into t from public.transaction where transaction_id = p_transaction_id for update;
  if not found then raise exception 'Transaction % not found', p_transaction_id; end if;
  if t.status <> 'pending' then
    raise exception 'Transaction % is %, expected pending', p_transaction_id, t.status;
  end if;
  if t.type not in ('buy','sell') then raise exception 'Only trades can be settled'; end if;
  if p_quantity is null or p_quantity <= 0 or p_price is null or p_price <= 0 then
    raise exception 'Fill quantity and price must be positive';
  end if;

  v_amount := greatest(round(p_quantity * p_price, 2), 0.01);

  -- verified: the broker has confirmed the fill
  update public.transaction
     set status = 'verified', quantity = p_quantity, price = p_price,
         amount = v_amount, updated_at = now()
   where transaction_id = t.transaction_id;

  -- move the money (CHECK balance >= 0 aborts the whole settlement on overspend)
  update public.wallet
     set balance = balance + case when t.type = 'buy' then -v_amount else v_amount end,
         updated_at = now()
   where wallet_id = t.wallet_id;

  -- released: funds have moved
  update public.transaction
     set status = 'released', updated_at = now()
   where transaction_id = t.transaction_id
  returning * into t;
  return t;
end $$;

create or replace function public.fail_transaction(p_transaction_id uuid, p_reason text)
returns public.transaction
language plpgsql as $$
declare t public.transaction;
begin
  update public.transaction
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'unknown'), 500),
         updated_at = now()
   where transaction_id = p_transaction_id and status = 'pending'
  returning * into t;
  if not found then
    raise exception 'Transaction % not found or not pending', p_transaction_id;
  end if;
  return t;
end $$;

-- Only the server (service role) may move money.
revoke execute on function public.make_deposit(numeric) from public;
revoke execute on function public.settle_transaction(uuid, numeric, numeric) from public;
revoke execute on function public.fail_transaction(uuid, text) from public;
revoke execute on function public.forbid_mutation() from public;
