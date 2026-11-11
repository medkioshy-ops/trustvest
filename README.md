# TrustVest

AI-driven, transparent automated investing with a tamper-evident audit ledger. Final-year university project (single-user research prototype, paper trading only).

> **GitHub does not run this app.** The repo page is documentation only. **Do not use GitHub Pages** (`medkioshy-ops.github.io/trustvest`) — that URL only renders this README and will never show login or the dashboard. Use **Vercel’s `*.vercel.app` URL** (after deploy) or **localhost**.

## What it does

| Req | How it is met | Where |
| --- | --- | --- |
| FR1 | Supabase Auth (email + Google), admin via `npm run seed`; public landing at `/`; `proxy.ts` gates app routes | `app/`, `app/login`, `app/join`, `app/auth/callback`, `proxy.ts`, `scripts/seed.mjs` |
| FR2 | Dashboard shows portfolio value, wallet cash and holdings (average-cost P/L) | `app/(app)/dashboard/page.tsx`, `lib/portfolio.ts` |
| FR3 | Daily bars + latest trade from Alpaca Market Data (free IEX feed; crypto included) | `lib/market/alpaca.ts` |
| FR4 | Alpaca News headlines scored locally with VADER | `lib/sentiment.ts` |
| FR5 | Momentum (5/20-day SMA gap + 5-day return) × 0.6 + sentiment × 0.4 → buy/hold/sell with a written reason and the full inputs stored | `lib/engine.ts` |
| FR6 | Market orders on the Alpaca **paper** API; pending → verified → released settlement | `lib/cycle.ts`, `settle_transaction()` SQL |
| FR7 | Every deposit, decision and settlement is sealed in a SHA-256 hash chain | `lib/ledger/` |
| FR8 | "Verify now" + `GET /api/ledger/verify` recompute the chain **and** compare each sealed snapshot to the live rows, naming the exact entry and field | `lib/ledger/index.ts` |
| FR9 | AI vs equal-weight buy-and-hold vs cash, 1W/1M/3M/All | `lib/performance.ts` |
| AI evidence | `/ai`: backtest of the live engine vs buy-and-hold, live track record of real calls, rule-consistency check of every stored decision, score history | `app/(app)/ai/page.tsx`, `lib/backtest.ts`, `lib/track-record.ts` |
| NFR2 | Supabase Realtime pushes changes; the page refreshes itself (indicator top-right) | `components/live-refresh.tsx` |
| NFR4 | Append-only triggers + coverage check (every decision/finished trade must have an entry) | migrations, `verifyLedger()` |
| NFR5 | All configuration through env vars; same build runs locally and on Vercel | `.env.example` |

No Alpaca keys yet? The app runs in a clearly labelled **simulated market mode** (deterministic prices, sample headlines, instant fills) so you can develop and demo the full pipeline. Every decision made this way is tagged `simulated` in the database and UI.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind v4, shadcn/ui) · Supabase (Postgres, Auth, Realtime) · Alpaca paper trading · VADER · Recharts · Vitest. Hosted on Vercel's free tier. Recurring cost: R0.

## Setup (about 15 minutes)

1. **Install**: `npm install`
2. **Supabase project** (free): create one at supabase.com.
   - SQL Editor → run `20261025000001_core_schema.sql`, `…000002_security_realtime.sql`, then `…000003_per_user_wallet.sql`.
   - Authentication → Sign In / Providers → turn **off** "Allow new users to sign up".
3. **Alpaca** (optional, free): app.alpaca.markets → switch to **Paper** → generate API keys.
4. **Env**: copy `.env.example` to `.env.local` and fill it in.
5. **Seed** the login and wallet: `npm run seed`
6. **Run**: `npm run dev` → http://localhost:3000 → sign in → deposit funds → **Run decision cycle now**.

### Run online (deploy from GitHub — not “Open” on a file)

GitHub stores the code; it does not execute Next.js. To get a public app URL:

1. Go to [vercel.com](https://vercel.com) and sign in with the same GitHub account (**medkioshy-ops**).
2. **Add New… → Project** → import **medkioshy-ops/trustvest** (framework: Next.js — not “Other”).
3. **Environment variables** (check **Production**): copy every value from local `.env.local` — at minimum `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. Missing vars → blank or 500 errors on `/`.
4. **Deploy**, then open the URL from Vercel **Deployments → Visit** (e.g. `https://trustvest-xxx.vercel.app/login`). If you only see the README table, you are on **GitHub** or **GitHub Pages**, not Vercel.
5. **Supabase** → Authentication → URL configuration → set **Site URL** to your Vercel URL and add `https://<your-app>.vercel.app/**` under **Redirect URLs** (required for sign-in).
6. Repo **Settings → Pages** on GitHub: turn Pages **off** if enabled (it conflicts with what students expect and only publishes the README).
7. Your Supabase user already exists; you do **not** need `npm run seed` on Vercel for the same project.

`vercel.json` schedules `/api/cycle` every weekday at 15:00 UTC (Hobby plan: one cron run per day). Set `CRON_SECRET` in the Vercel dashboard.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Unit tests (hash chain, engine, sentiment, holdings, benchmark, simulator) |
| `TEST_DATABASE_URL=postgres://… npm run test:integration` | End-to-end cycle against the real SQL schema on any Postgres 15+ (it **drops the `public` schema** — use a throwaway database) |
| `npm run typecheck` / `lint` | Static checks |
| `npm run seed` | Create/refresh the single user and the wallet |

## Demonstrating tamper detection

`supabase/demo/tamper-demo.sql` contains three attacks (rewrite a decision's reasoning, inflate a sealed amount, delete a mid-chain entry). Run one in the Supabase SQL editor, then press **Verify now** on the Ledger page: each is reported with the entry number and the changed field. Use a demo project — the damage is permanent.

## Folder structure

- `app/` — routes: `login/`, `(app)/` (dashboard, `decisions/`, `ledger/`, server actions), `api/cycle`, `api/ledger/verify`
- `components/` — UI (`ui/` holds shadcn-style primitives)
- `lib/` — engine, sentiment, market providers, ledger, portfolio, performance, Supabase clients
- `supabase/migrations/` — schema, constraints, triggers, RLS; `supabase/demo/` — tamper script
- `tests/` — Vitest unit tests; `tests/integration/` — Postgres end-to-end; `tests/e2e/` — local Supabase mock used for browser smoke tests

See `DEVLOG.md` for what each increment built, how it was verified, and every deliberate deviation from the Phase 3 design.
