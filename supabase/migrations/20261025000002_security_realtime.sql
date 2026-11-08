-- Security (Phase 4.8 / Implementation 7): RLS, access rights, Realtime.
--
-- Access model for the single-user prototype:
--   anon           -> nothing
--   authenticated  -> read-only on all four tables (the dashboard)
--   service_role   -> all writes, server-side only (decision engine, deposits)
-- No INSERT/UPDATE/DELETE policies exist, so a leaked anon key or a logged-in
-- browser session cannot write or alter financial records.

alter table public.wallet       enable row level security;
alter table public.transaction  enable row level security;
alter table public.ai_decision  enable row level security;
alter table public.ledger_entry enable row level security;

create policy "wallet readable by signed-in user"
  on public.wallet for select to authenticated using (true);
create policy "transactions readable by signed-in user"
  on public.transaction for select to authenticated using (true);
create policy "decisions readable by signed-in user"
  on public.ai_decision for select to authenticated using (true);
create policy "ledger readable by signed-in user"
  on public.ledger_entry for select to authenticated using (true);

revoke all on public.wallet, public.transaction, public.ai_decision, public.ledger_entry from anon;
revoke insert, update, delete, truncate
  on public.wallet, public.transaction, public.ai_decision, public.ledger_entry from authenticated;
grant select on public.wallet, public.transaction, public.ai_decision, public.ledger_entry to authenticated;

revoke execute on function public.make_deposit(numeric) from anon, authenticated;
revoke execute on function public.settle_transaction(uuid, numeric, numeric) from anon, authenticated;
revoke execute on function public.fail_transaction(uuid, text) from anon, authenticated;
grant execute on function public.make_deposit(numeric) to service_role;
grant execute on function public.settle_transaction(uuid, numeric, numeric) to service_role;
grant execute on function public.fail_transaction(uuid, text) to service_role;

-- Realtime (NFR2): push row changes to the dashboard.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.wallet, public.transaction, public.ai_decision, public.ledger_entry;
  end if;
end $$;
