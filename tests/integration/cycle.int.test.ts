// End-to-end: decision cycle → transactions → wallet → ledger → verification → tamper detection,
// against the real SQL migrations on a real Postgres.
// Run with: TEST_DATABASE_URL=postgres://... npm run test:integration
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCycle } from "@/lib/cycle";
import { appendLedgerEntry, snapshotTransaction, verifyLedger } from "@/lib/ledger";
import { SimulatedProvider } from "@/lib/market/simulated";
import type { BrokerOrder, DailyClose, OrderRequest } from "@/lib/market/types";
import { cashAt, computeHoldings } from "@/lib/portfolio";
import type { Transaction } from "@/lib/types";
import { pgSupabase } from "./pg-supabase";

const URL = process.env.TEST_DATABASE_URL;
const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");

/** Deterministic market: chosen trend per symbol, configurable broker behaviour. */
class ScriptedMarket extends SimulatedProvider {
  trend: Record<string, number> = {};
  broker: "fill" | "queue" | "reject" = "fill";
  queued = new Map<string, { req: OrderRequest; price: number }>();
  news: Record<string, string[]> = {};

  async getDailyCloses(symbol: string): Promise<DailyClose[]> {
    const g = this.trend[symbol] ?? 0;
    return Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 20 + i)).toISOString().slice(0, 10),
      close: Math.round(100 * (1 + g) ** i * 100) / 100,
    }));
  }
  async getLatestPrice(symbol: string) {
    const c = await this.getDailyCloses(symbol);
    return c[c.length - 1].close;
  }
  async getNews(symbol: string) {
    return (this.news[symbol] ?? []).map((headline) => ({ headline, created_at: new Date().toISOString(), source: "test" }));
  }
  async submitOrder(req: OrderRequest): Promise<BrokerOrder> {
    if (this.broker === "reject") throw new Error("insufficient buying power (test)");
    if (this.broker === "queue") {
      const id = `q_${req.clientOrderId}`;
      this.queued.set(id, { req, price: await this.getLatestPrice(req.symbol) });
      return { id, status: "accepted", filledQty: 0, filledAvgPrice: null };
    }
    return super.submitOrder(req);
  }
  async getOrder(id: string): Promise<BrokerOrder> {
    const q = this.queued.get(id);
    if (!q) return super.getOrder(id);
    if (this.broker === "queue") return { id, status: "accepted", filledQty: 0, filledAvgPrice: null };
    const qty = q.req.qty ?? Math.floor((q.req.notional! / q.price) * 1e9) / 1e9;
    return { id, status: "filled", filledQty: qty, filledAvgPrice: q.price };
  }
}

const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

describe.skipIf(!URL)("decision cycle against Postgres", () => {
  let pool: pg.Pool;
  let db: ReturnType<typeof pgSupabase>;
  let walletId: string;
  const market = new ScriptedMarket();

  beforeAll(async () => {
    process.env.WATCHLIST = "AAPL,MSFT,TSLA";
    pool = new pg.Pool({ connectionString: URL, options: "-c TimeZone=UTC" });
    await pool.query(`drop schema if exists public cascade; create schema public;
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
        if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
      end $$;
      grant usage on schema public to anon, authenticated, service_role;
      -- Minimal stand-in for Supabase's auth schema so the RLS policies can be created and exercised.
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key, created_at timestamptz not null default now());
      create or replace function auth.uid() returns uuid language sql stable
        as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
      grant usage on schema auth to anon, authenticated, service_role;`);
    for (const f of readdirSync(MIGRATIONS).sort()) await pool.query(readFileSync(path.join(MIGRATIONS, f), "utf8"));
    const w = await pool.query(`insert into wallet (currency, user_id) values ('USD', $1) returning wallet_id`, [TEST_USER_ID]);
    walletId = w.rows[0].wallet_id as string;
    db = pgSupabase(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  const txs = async () => (await pool.query(`select * from transaction order by created_at`)).rows as Transaction[];
  const balance = async () => Number((await pool.query(`select balance from wallet`)).rows[0].balance);

  it("records a deposit and seals it as the first (genesis-linked) entry", async () => {
    const { data, error } = await db.rpc("make_deposit", { p_user_id: TEST_USER_ID, p_amount: 10_000 });
    expect(error).toBeNull();
    const tx = data as Transaction;
    const e = await appendLedgerEntry(db, { walletId, kind: "deposit", transaction_id: tx.transaction_id, payload: { kind: "deposit", transaction: snapshotTransaction(tx) } });
    expect(e.previous_hash).toBe("0".repeat(64));
    expect(await balance()).toBe(10_000);
  });

  it("buys an uptrend, holds a flat market, ignores a downtrend with nothing to sell", async () => {
    market.trend = { AAPL: 0.01, MSFT: 0, TSLA: -0.01 };
    market.news = { AAPL: ["Apple beats expectations as iPhone sales surge"] };
    const report = await runCycle(db, walletId, market);
    expect(report.errors).toEqual([]);
    expect(Object.fromEntries(report.decisions.map((d) => [d.asset, d.action]))).toEqual({ AAPL: "buy", MSFT: "hold", TSLA: "hold" });
    const aapl = (await txs()).find((t) => t.asset === "AAPL")!;
    expect(aapl.status).toBe("released");
    expect(await balance()).toBeCloseTo(10_000 - Number(aapl.amount), 2);
  });

  it("every decision carries a human-readable reason and its raw inputs", async () => {
    const { rows } = await pool.query(`select * from ai_decision`);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.reasoning.length).toBeGreaterThan(80);
      expect(r.signal_inputs.momentum.score).toEqual(expect.any(Number));
    }
    const aapl = rows.find((r) => r.asset === "AAPL");
    expect(aapl.reasoning).toMatch(/BUY .* of AAPL/);
    expect(aapl.signal_inputs.sentiment.headline_count).toBe(1);
  });

  it("sells the position when the trend reverses", async () => {
    market.trend = { AAPL: -0.012, MSFT: 0, TSLA: 0 };
    market.news = {};
    const report = await runCycle(db, walletId, market);
    expect(report.decisions.find((d) => d.asset === "AAPL")!.action).toBe("sell");
    expect(computeHoldings(await txs()).get("AAPL")!.quantity).toBe(0);
  });

  it("keeps a queued order pending, refuses to stack another, then settles it on reconcile", async () => {
    market.trend = { AAPL: 0, MSFT: 0.01, TSLA: 0 };
    market.broker = "queue";
    let report = await runCycle(db, walletId, market);
    expect(report.decisions.find((d) => d.asset === "MSFT")!.execution).toMatch(/awaiting fill/);
    const pendingBefore = (await txs()).filter((t) => t.status === "pending");
    expect(pendingBefore).toHaveLength(1);

    report = await runCycle(db, walletId, market); // still queued → MSFT must HOLD
    expect(report.decisions.find((d) => d.asset === "MSFT")!.action).toBe("hold");

    market.broker = "fill";
    market.trend = { AAPL: 0, MSFT: 0, TSLA: 0 };
    report = await runCycle(db, walletId, market);
    expect(report.reconciled[0].outcome).toMatch(/^filled/);
    expect((await txs()).filter((t) => t.status === "pending")).toHaveLength(0);
  });

  it("records a broker rejection as a failed transaction, not a silent gap", async () => {
    market.trend = { AAPL: 0, MSFT: 0, TSLA: 0.01 };
    market.broker = "reject";
    const report = await runCycle(db, walletId, market);
    expect(report.decisions.find((d) => d.asset === "TSLA")!.execution).toMatch(/^failed/);
    const tsla = (await txs()).find((t) => t.asset === "TSLA")!;
    expect(tsla.status).toBe("failed");
    market.broker = "fill";
  });

  it("wallet balance equals a full replay of released transactions", async () => {
    expect(await balance()).toBeCloseTo(cashAt(await txs(), new Date(Date.now() + 1000)), 2);
  });

  it("verifies the untouched ledger: 100% coverage, intact chain", async () => {
    const r = await verifyLedger(db, walletId);
    const counts = (await pool.query(`select (select count(*) from ai_decision) d, (select count(*) from transaction where status in ('released','failed')) t`)).rows[0];
    expect(r.problems).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.entryCount).toBe(Number(counts.d) + Number(counts.t));
  });

  it("keeps a second account's decisions and chain completely separate", async () => {
    const OTHER = "00000000-0000-4000-8000-000000000002";
    const w2 = (await pool.query(`insert into wallet (currency, user_id) values ('USD', $1) returning wallet_id`, [OTHER])).rows[0].wallet_id as string;
    const { data } = await db.rpc("make_deposit", { p_user_id: OTHER, p_amount: 5_000 });
    const tx = data as Transaction;
    const first = await appendLedgerEntry(db, { walletId: w2, kind: "deposit", transaction_id: tx.transaction_id, payload: { kind: "deposit", transaction: snapshotTransaction(tx) } });
    expect(first.previous_hash).toBe("0".repeat(64)); // own genesis
    market.trend = { AAPL: 0.01, MSFT: 0, TSLA: 0 };
    await runCycle(db, w2, market);

    const [mine, theirs] = [await verifyLedger(db, walletId), await verifyLedger(db, w2)];
    expect(mine.problems).toEqual([]);
    expect(theirs.problems).toEqual([]);
    const own = Number((await pool.query(`select count(*) from ledger_entry where wallet_id = $1`, [walletId])).rows[0].count);
    expect(mine.entryCount).toBe(own);
    // RLS: signed in as the first user, only that user's decisions and ledger are visible.
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [TEST_USER_ID]);
      await c.query("set local role authenticated");
      const vis = (await c.query(`select (select count(distinct wallet_id) from ai_decision) d, (select count(distinct wallet_id) from ledger_entry) l, (select count(*) from ledger_entry) n`)).rows[0];
      expect([Number(vis.d), Number(vis.l), Number(vis.n)]).toEqual([1, 1, own]);
    } finally {
      await c.query("rollback");
      c.release();
    }
    const leaked = (await pool.query(`select count(*) from ai_decision d join transaction t using (transaction_id) where d.wallet_id <> t.wallet_id`)).rows[0].count;
    expect(Number(leaked)).toBe(0);
  });

  it("the ledger refuses UPDATE and DELETE", async () => {
    await expect(pool.query(`update ledger_entry set payload = '{}' where seq = 1`)).rejects.toThrow(/append-only/);
    await expect(pool.query(`delete from ledger_entry where seq = 1`)).rejects.toThrow(/append-only/);
  });

  it("pinpoints a rewritten decision reason (source table tampered, ledger untouched)", async () => {
    const { rows } = await pool.query(`select decision_id from ai_decision where asset='AAPL' and action='buy' limit 1`);
    await pool.query(`alter table ai_decision disable trigger ai_decision_append_only;
      update ai_decision set reasoning = 'Totally safe trade' where decision_id = '${rows[0].decision_id}';
      alter table ai_decision enable trigger ai_decision_append_only;`);
    const r = await verifyLedger(db, walletId);
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([expect.objectContaining({ problem: "record_mismatch", detail: expect.stringMatching(/reasoning/) })]);
  });

  it("pinpoints an edited ledger payload and a deleted entry", async () => {
    await pool.query(`alter table ledger_entry disable trigger ledger_entry_append_only;
      update ledger_entry set payload = jsonb_set(payload, '{transaction,amount}', '999999') where seq = 1;
      delete from ledger_entry where seq = 4;
      alter table ledger_entry enable trigger ledger_entry_append_only;`);
    const r = await verifyLedger(db, walletId);
    const kinds = r.problems.map((p) => `${p.seq}:${p.problem}`);
    expect(kinds).toContain("1:hash_mismatch");
    expect(kinds).toContain("5:broken_link");
    expect(r.problems.some((p) => p.problem === "missing_entry")).toBe(true);
  });
});
