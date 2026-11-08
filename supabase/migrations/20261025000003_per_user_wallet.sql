-- Per-user wallets: one row per auth user (replaces singleton index).
-- Run in Supabase SQL editor after the first two migration files.

alter table public.wallet
  add column if not exists user_id uuid;

-- Attach the legacy singleton wallet to the earliest Supabase auth user when present.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'auth' and table_name = 'users'
  ) then
    update public.wallet w
       set user_id = sub.id
      from (select id from auth.users order by created_at asc limit 1) sub
     where w.user_id is null
       and sub.id is not null;
  end if;
end $$;

drop index if exists public.wallet_singleton;

delete from public.wallet where user_id is null;

create unique index if not exists wallet_one_per_user on public.wallet (user_id);

alter table public.wallet
  alter column user_id set not null;

-- Deposits target a specific user's wallet (service role supplies user id).
create or replace function public.make_deposit(p_user_id uuid, p_amount numeric)
returns public.transaction
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.wallet;
  t public.transaction;
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Deposit amount must be greater than 0';
  end if;
  select * into w from public.wallet where user_id = p_user_id for update;
  if not found then
    raise exception 'No wallet for user % — sign up or run seed', p_user_id;
  end if;

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

revoke all on function public.make_deposit(uuid, numeric) from public;
grant execute on function public.make_deposit(uuid, numeric) to service_role;

-- Drop legacy single-argument overload if present.
drop function if exists public.make_deposit(numeric);

-- RLS: each user sees only their wallet and related rows.
drop policy if exists "wallet readable by signed-in user" on public.wallet;
drop policy if exists "transactions readable by signed-in user" on public.transaction;

create policy "wallet readable by owner"
  on public.wallet for select to authenticated
  using (user_id = auth.uid());

create policy "transactions readable by owner"
  on public.transaction for select to authenticated
  using (
    wallet_id in (select wallet_id from public.wallet where user_id = auth.uid())
  );
