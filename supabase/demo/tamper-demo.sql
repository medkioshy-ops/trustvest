-- TrustVest tamper demonstration (FR8). Run ONE block at a time in the Supabase
-- SQL editor, then press "Verify now" on the Ledger page to see it caught.
-- These blocks deliberately damage data — only use them on a demo project.

-- 1) Rewrite the reasoning of the most recent BUY decision (source table edited,
--    ledger untouched) → verification reports "record_mismatch ... reasoning".
alter table public.ai_decision disable trigger ai_decision_append_only;
update public.ai_decision
   set reasoning = 'Edited after the fact to look smarter.'
 where decision_id = (select decision_id from public.ai_decision where action = 'buy' order by created_at desc limit 1);
alter table public.ai_decision enable trigger ai_decision_append_only;

-- 2) Inflate the amount stored inside the first ledger entry
--    → "hash_mismatch" at #1 (and a record_mismatch against the live deposit).
alter table public.ledger_entry disable trigger ledger_entry_append_only;
update public.ledger_entry
   set payload = jsonb_set(payload, '{transaction,amount}', '999999')
 where seq = (select min(seq) from public.ledger_entry);
alter table public.ledger_entry enable trigger ledger_entry_append_only;

-- 3) Quietly delete an entry from the middle of the chain
--    → "broken_link" on the entry after it, plus a "missing_entry" for its record.
alter table public.ledger_entry disable trigger ledger_entry_append_only;
delete from public.ledger_entry where seq = (select min(seq) + 2 from public.ledger_entry);
alter table public.ledger_entry enable trigger ledger_entry_append_only;

-- Note: attack 2 is detected even if the attacker also recomputes that entry's
-- hash, because the NEXT entry's previous_hash no longer matches. Only rewriting
-- the entire chain from the edit onwards would evade it — the accepted
-- limitation documented in Phase 2 §2.6 (future work: anchor the head hash externally).
