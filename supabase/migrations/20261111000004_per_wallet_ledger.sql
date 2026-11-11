-- Per-wallet decision log and hash chain.
--
-- Migration 003 gave every user their own wallet and hid other users' transactions,
-- but ai_decision and ledger_entry stayed shared. That caused two bugs:
--   1. Privacy: every account could read every other account's decisions and ledger.
--   2. False tamper alarms: verification saw ledger entries for transactions it is
--      not allowed to read and reported them as "no longer exists".
-- Fix: each wallet owns its decisions and its own hash chain (own genesis entry).
--
-- An existing shared chain cannot be split per wallet without rewriting hashes,
-- which is exactly what the ledger forbids, so this migration RESETS PROTOTYPE
-- ACTIVITY (simulated trades, decisions and ledger) and sets wallet balances to 0.
-- Accounts and wallets are kept. Only run this on the prototype database.

-- 1. Reset prototype activity (append-only triggers are paused just for this).
alter table public.ledger_entry disable trigger ledger_entry_append_only;
alter table public.ai_decision  disable trigger ai_decision_append_only;
alter table public.transaction  disable trigger transaction_no_delete;

delete from public.ledger_entry;
delete from public.ai_decision;
delete from public.transaction;
update public.wallet set balance = 0, updated_at = now();

alter table public.ledger_entry enable trigger ledger_entry_append_only;
alter table public.ai_decision  enable trigger ai_decision_append_only;
alter table public.transaction  enable trigger transaction_no_delete;

-- 2. Owner columns.
alter table public.ai_decision
  add column if not exists wallet_id uuid not null references public.wallet (wallet_id) on delete restrict;
alter table public.ledger_entry
  add column if not exists wallet_id uuid not null references public.wallet (wallet_id) on delete restrict;

create index if not exists ai_decision_wallet_idx on public.ai_decision (wallet_id, created_at desc);
create index if not exists ledger_entry_wallet_idx on public.ledger_entry (wallet_id, seq);

-- 3. One chain per wallet: the fork guard is now "unique parent within a wallet".
alter table public.ledger_entry drop constraint if exists ledger_entry_previous_hash_key;
create unique index if not exists ledger_entry_wallet_prev_key on public.ledger_entry (wallet_id, previous_hash);

-- 4. RLS: owners only.
drop policy if exists "decisions readable by signed-in user" on public.ai_decision;
drop policy if exists "ledger readable by signed-in user" on public.ledger_entry;

create policy "decisions readable by owner"
  on public.ai_decision for select to authenticated
  using (wallet_id in (select wallet_id from public.wallet where user_id = auth.uid()));

create policy "ledger readable by owner"
  on public.ledger_entry for select to authenticated
  using (wallet_id in (select wallet_id from public.wallet where user_id = auth.uid()));
