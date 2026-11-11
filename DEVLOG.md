# TrustVest development log

Material for the project report. One entry per completed increment.

## 2026-08-27 — Step 1: project scaffold

- **What was built:** Next.js App Router + TypeScript + Tailwind CSS v4 + shadcn/ui (nova preset, dark-first `html` class). Folders `app/`, `components/ui/`, `lib/`, `supabase/`. `.env.example` with Supabase placeholders. README and this log. Git initialized.
- **Why this approach:** One Next.js app on Vercel avoids a separate paid Node host. shadcn copies components into the repo (no lock-in to a paid UI kit). Teal is a single restrained “trust + growth” accent instead of a rainbow of dashboard colours.
- **How it was verified/tested:** `npm run dev` → http://localhost:3000 shows the TrustVest scaffold page and a shadcn Button.
- **Known limitations / TODOs:** No Supabase client yet (Step 2). Schema, auth, dashboard, and ledger are out of scope for this increment. `.gitignore` ignores `.env*` except `.env.example`.

## 2026-10-25 — Step 2: full FR1–FR9 implementation

- **What was built:**
  - Database (`supabase/migrations/`): the four Phase 3 entities with every Table 3 constraint, append-only triggers on `ledger_entry` and `ai_decision`, no-delete on `transaction`, atomic SQL functions `make_deposit`, `settle_transaction` (pending → verified → released) and `fail_transaction`, RLS (signed-in user = read-only, all writes via the server-only service role), Realtime publication.
  - Decision cycle (`lib/cycle.ts`): reconcile open orders → per asset: Alpaca bars + news → VADER → engine → record transaction intent → record decision → seal in ledger → place paper order → settle wallet → seal settlement.
  - Explainable engine (`lib/engine.ts`): pure function; reason text quotes the actual numbers and strongest headline; position sizing (10% of cash), 30% position cap, no stacking while an order is open.
  - Ledger (`lib/ledger/`): canonical-JSON SHA-256 chain with a fork-proof `UNIQUE(previous_hash)` + retry; three-layer verification (chain, snapshot-vs-live-record, coverage).
  - UI: login, dashboard (value, cash, integrity, latest decision, controls, holdings, performance chart, recent decisions), decision log with filters and stored inputs, ledger explorer with per-entry problem highlighting.
  - Scheduler endpoint `/api/cycle` (Vercel Cron, `CRON_SECRET`) and `/api/ledger/verify` (200 intact / 409 tampered).
  - Simulated market provider for keyless development, always labelled in data and UI.
- **Deviations from the Phase 3 data dictionary (for the Phase 4 report):**
  1. `transaction.status` adds `failed` — a rejected order is recorded, not deleted.
  2. `transaction` adds `quantity`, `price`, `broker_order_id`, `failure_reason`, `updated_at` — needed to derive holdings and reconcile with Alpaca.
  3. `ai_decision.transaction_id` is nullable (still UNIQUE) and `ai_decision.asset` was added — HOLD decisions create no transaction but must still be logged (FR5/NFR4). A CHECK enforces "buy/sell ⇔ has transaction".
  4. `ledger_entry` adds `seq` (display order), `kind` (deposit/decision/settlement) and `decision_id`; exactly one of `transaction_id`/`decision_id` is set. A trade is therefore sealed twice — once when decided, once when settled — so the reason is tamper-evident before the order is even sent.
  5. Hash input is `previous_hash | canonical_json(payload) | created_at(ISO-8601 UTC)` — keys sorted because Postgres `jsonb` does not keep key order.
  6. The wallet is seeded in USD because the Alpaca paper account is USD (the column default stays `ZAR`).
  7. The Phase 1 Express + Python services were replaced by Next.js server code + a local JS VADER port (already the direction set in Phase 2 and Step 1), keeping everything on one free Vercel deployment.
- **How it was verified/tested:**
  - 30 unit tests (`npm test`): canonical JSON, chain verification (edit, delete, reorder, recomputed-hash attack), momentum/sentiment, every engine branch, average-cost holdings, cash replay, benchmark arithmetic, simulator determinism.
  - 11 integration tests (`npm run test:integration`) on PostgreSQL 16 with the real migrations: deposit → buy/hold → sell on reversal → queued order held then settled on reconcile → broker rejection recorded as failed → wallet equals full replay → ledger 100% coverage → UPDATE/DELETE refused → rewritten reasoning, edited payload and deleted entry each located precisely.
  - SQL constraint checks run directly in `psql`: singleton wallet, overspend rejected by `CHECK (balance >= 0)`, `authenticated`/`anon` cannot write or call money functions.
  - Browser smoke test (Playwright) against a production build: wrong-password message, login, deposit, run cycle (4 decisions, 2 fills), dashboard/decision log/ledger render, chart with hover. Backdating three rows by SQL to fake history was itself flagged by "Verify now" as three `record_mismatch` problems on exactly those rows.
  - `next build`, `tsc --noEmit`, ESLint clean.
- **Known limitations / TODOs:**
  - Not yet run against a live Supabase project or real Alpaca keys from this environment — do `npm run seed` + one manual cycle as the first check.
  - Hash chain is tamper-evident, not tamper-proof: deleting the newest entry, or rewriting the whole chain from an edit onwards, needs an external anchor of the head hash (future work, Phase 2 §2.6).
  - Two cycles started at the same instant (cron + button) could both trade the same asset before either order is recorded; acceptable for one user, fix with an advisory lock if scheduling becomes more frequent.
  - Vercel Hobby cron = once a day. Stock market orders placed outside US hours stay pending and are settled by the next cycle.
  - Interview findings (Phase 3 Table 1) are still placeholders in the report.

## 2026-11-11 — Step 3: per-wallet ledger, AI evidence page, dashboard graphs

- **Bug fixed — false "Tampering detected" + privacy leak.** Migration 003 made wallets and transactions per user, but `ai_decision` and `ledger_entry` stayed shared. Users could read each other's decisions and ledger, and verification flagged other users' (RLS-hidden) transactions as "no longer exists". Migration 004 gives every wallet its own decision log and its own genesis-linked hash chain (`unique (wallet_id, previous_hash)`), with owner-only RLS. Because a shared chain cannot be split without rewriting hashes, 004 resets prototype activity (simulated trades/decisions/ledger) and keeps accounts.
- **Bug fixed — stale integrity tile.** The dashboard's "Ledger integrity" card kept its first result after deposits/cycles; it now remounts whenever the server re-verifies.
- **Lint errors cleared** (setState-in-effect in the OAuth hint, prefer-const, unused import). Integration tests repaired (they had been failing since 003 because the test DB had no `auth` schema).
- **Dashboard graphs, each answering one question:** "What the AI sees right now" (each asset's latest score on −1…+1 with the buy/sell lines — how close it is to trading) and "Where your money is" (cash vs holdings with the 30% per-asset cap line).
- **New page `/ai` — "Is the AI working?"** (1) Backtest: the production `decide()` replayed once per daily bar over 3/6/12 months vs equal-weight buy-and-hold, with return, worst drop, win rate of closed trades; (2) live track record: did each executed BUY/SELL's price move its way (unmoved calls are "waiting", not wrong); (3) consistency: every stored decision's score is recomputed from its stored inputs and its action checked against the rules; (4) score history across cycles vs the trade lines.
- **Limits stated on the page:** the backtest treats sentiment as neutral (historical headlines are not stored) and fills at the daily close without fees; in simulated mode it runs on generated prices.
- **Verified:** 38 unit + 12 integration tests (incl. a two-account isolation test that also checks RLS as the signed-in role), lint clean, `next build`, browser run of deposit → two cycles → dashboard, /ai and ledger with no console errors.
