// One decision cycle (Level-1 DFD processes 1.0–5.0):
//   reconcile open orders → for each watched asset: pull prices (FR3) + news (FR4)
//   → decide (FR5) → seal the decision in the ledger (FR7) → execute on Alpaca (FR6)
//   → settle the wallet and seal the settlement (FR7).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEngineConfig, getWatchlist } from "./config";
import { decide, MIN_BARS } from "./engine";
import { appendLedgerEntry, snapshotDecision, snapshotTransaction } from "./ledger";
import { getMarketProvider, type MarketProvider } from "./market";
import { TERMINAL_UNFILLED, type BrokerOrder } from "./market/types";
import { computeHoldings } from "./portfolio";
import { scoreHeadlines } from "./sentiment";
import type { AiDecision, Transaction, Wallet } from "./types";

export interface CycleReport {
  dataSource: "alpaca" | "simulated";
  startedAt: string;
  finishedAt: string;
  reconciled: { asset: string; outcome: string }[];
  decisions: { asset: string; action: string; confidence: number; execution?: string }[];
  errors: { asset: string; message: string }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function loadState(db: SupabaseClient) {
  const [{ data: wallet, error: wErr }, { data: txs, error: tErr }] = await Promise.all([
    db.from("wallet").select("*").limit(1).maybeSingle(),
    db.from("transaction").select("*").in("status", ["pending", "released"]),
  ]);
  if (wErr) throw new Error(`Reading wallet failed: ${wErr.message}`);
  if (!wallet) throw new Error("No wallet found — run `npm run seed` first");
  if (tErr) throw new Error(`Reading transactions failed: ${tErr.message}`);
  return { wallet: wallet as Wallet, transactions: (txs ?? []) as Transaction[] };
}

/** Settle or fail a pending trade according to the broker's view of its order. */
async function applyOrderState(db: SupabaseClient, tx: Transaction, order: BrokerOrder): Promise<string> {
  const done = order.status === "filled" || (TERMINAL_UNFILLED.has(order.status) && order.filledQty > 0);
  if (done && order.filledAvgPrice) {
    const { data, error } = await db.rpc("settle_transaction", {
      p_transaction_id: tx.transaction_id,
      p_quantity: order.filledQty,
      p_price: order.filledAvgPrice,
    });
    if (error) throw new Error(`Settling ${tx.asset} failed: ${error.message}`);
    const settled = data as Transaction;
    await appendLedgerEntry(db, {
      kind: "settlement",
      transaction_id: settled.transaction_id,
      payload: { kind: "settlement", transaction: snapshotTransaction(settled), broker_order: order },
    });
    return `filled ${order.filledQty} @ ${order.filledAvgPrice}`;
  }
  if (TERMINAL_UNFILLED.has(order.status)) {
    return failTrade(db, tx, `Broker order ${order.status} with no fill`, order);
  }
  return `awaiting fill (broker status: ${order.status})`;
}

async function failTrade(db: SupabaseClient, tx: Transaction, reason: string, order?: BrokerOrder) {
  const { data, error } = await db.rpc("fail_transaction", { p_transaction_id: tx.transaction_id, p_reason: reason });
  if (error) throw new Error(`Marking ${tx.asset} failed: ${error.message}`);
  const failed = data as Transaction;
  await appendLedgerEntry(db, {
    kind: "settlement",
    transaction_id: failed.transaction_id,
    payload: { kind: "settlement", transaction: snapshotTransaction(failed), broker_order: order ?? null },
  });
  return `failed: ${reason}`;
}

async function reconcilePending(db: SupabaseClient, market: MarketProvider, report: CycleReport) {
  const { data, error } = await db.from("transaction").select("*").eq("status", "pending");
  if (error) throw new Error(`Reading pending orders failed: ${error.message}`);
  for (const tx of (data ?? []) as Transaction[]) {
    try {
      if (!tx.broker_order_id) {
        // Order submission never completed (e.g. crash between insert and submit).
        const ageMin = (Date.now() - new Date(tx.created_at).getTime()) / 60_000;
        if (ageMin > 10) report.reconciled.push({ asset: tx.asset, outcome: await failTrade(db, tx, "Order was never submitted to the broker") });
        continue;
      }
      const order = await market.getOrder(tx.broker_order_id);
      report.reconciled.push({ asset: tx.asset, outcome: await applyOrderState(db, tx, order) });
    } catch (e) {
      report.errors.push({ asset: tx.asset, message: `Reconcile: ${errMsg(e)}` });
    }
  }
}

export async function runCycle(db: SupabaseClient, market: MarketProvider = getMarketProvider()): Promise<CycleReport> {
  const cfg = getEngineConfig();
  const watchlist = getWatchlist();
  const report: CycleReport = {
    dataSource: market.source,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    reconciled: [],
    decisions: [],
    errors: [],
  };

  await reconcilePending(db, market, report);

  const barsStart = new Date(Date.now() - 60 * 86_400_000); // ~40 trading days
  const newsSince = new Date(Date.now() - cfg.newsLookbackHours * 3_600_000);

  // Prices for every asset we hold or watch, so portfolio value is complete.
  const initial = await loadState(db);
  const held = [...computeHoldings(initial.transactions).values()].filter((h) => h.quantity > 0).map((h) => h.asset);
  const prices: Record<string, number> = {};
  for (const asset of new Set([...watchlist, ...held])) {
    try {
      prices[asset] = await market.getLatestPrice(asset);
    } catch (e) {
      report.errors.push({ asset, message: `Price: ${errMsg(e)}` });
    }
  }

  for (const asset of watchlist) {
    try {
      if (!(asset in prices)) continue;
      const price = prices[asset];
      const [bars, news] = await Promise.all([market.getDailyCloses(asset, barsStart), market.getNews(asset, newsSince)]);
      if (bars.length < MIN_BARS) {
        report.errors.push({ asset, message: `Only ${bars.length} daily bars available; need ${MIN_BARS}` });
        continue;
      }

      const { wallet, transactions } = await loadState(db);
      const holdings = computeHoldings(transactions);
      const pending = transactions.filter((t) => t.status === "pending");
      const reserved = pending.filter((t) => t.type === "buy").reduce((s, t) => s + Number(t.amount), 0);
      const availableCash = Math.max(0, Number(wallet.balance) - reserved);
      let portfolioValue = Number(wallet.balance);
      for (const h of holdings.values()) portfolioValue += h.quantity * (prices[h.asset] ?? h.avgCost);

      const decision = decide(
        {
          asset,
          dataSource: market.source,
          asOf: new Date().toISOString(),
          closes: bars.map((b) => b.close),
          price,
          sentiment: scoreHeadlines(news),
          availableCash,
          positionQty: holdings.get(asset)?.quantity ?? 0,
          portfolioValue,
          pendingOrder: pending.some((t) => t.asset === asset),
          currency: wallet.currency,
        },
        cfg,
      );

      // --- record the transaction intent (trades only) -----------------------------
      let tx: Transaction | null = null;
      if (decision.action !== "hold") {
        const order = decision.signalInputs.order!;
        const amount = order.notional ?? Math.max(0.01, Math.round(order.qty! * price * 100) / 100);
        const { data, error } = await db
          .from("transaction")
          .insert({
            wallet_id: wallet.wallet_id,
            type: decision.action,
            amount,
            asset,
            status: "pending",
            quantity: order.qty ?? null,
          })
          .select()
          .single();
        if (error) throw new Error(`Recording transaction failed: ${error.message}`);
        tx = data as Transaction;
      }

      // --- record + seal the decision -------------------------------------------
      const { data: dRow, error: dErr } = await db
        .from("ai_decision")
        .insert({
          transaction_id: tx?.transaction_id ?? null,
          asset,
          action: decision.action,
          reasoning: decision.reasoning,
          signal_inputs: decision.signalInputs,
          confidence: decision.confidence,
        })
        .select()
        .single();
      if (dErr) throw new Error(`Recording decision failed: ${dErr.message}`);
      const saved = dRow as AiDecision;
      await appendLedgerEntry(db, {
        kind: "decision",
        decision_id: saved.decision_id,
        payload: {
          kind: "decision",
          decision: snapshotDecision(saved),
          transaction: tx ? snapshotTransaction(tx) : null,
        },
      });

      const entry: CycleReport["decisions"][number] = { asset, action: decision.action, confidence: decision.confidence };
      report.decisions.push(entry);
      if (!tx) continue;

      // --- execute on the broker -------------------------------------------------
      let order: BrokerOrder;
      try {
        const o = decision.signalInputs.order!;
        order = await market.submitOrder({ symbol: asset, side: o.side, notional: o.notional, qty: o.qty, clientOrderId: tx.transaction_id });
      } catch (e) {
        entry.execution = await failTrade(db, tx, errMsg(e));
        continue;
      }
      const { error: uErr } = await db.from("transaction").update({ broker_order_id: order.id, updated_at: new Date().toISOString() }).eq("transaction_id", tx.transaction_id);
      if (uErr) report.errors.push({ asset, message: `Saving broker order id failed: ${uErr.message}` });

      // Paper market orders usually fill within a second or two during market hours.
      for (let i = 0; i < 3 && order.status !== "filled" && !TERMINAL_UNFILLED.has(order.status); i++) {
        await sleep(1500);
        order = await market.getOrder(order.id);
      }
      entry.execution = await applyOrderState(db, tx, order);
    } catch (e) {
      report.errors.push({ asset, message: errMsg(e) });
    }
  }

  report.finishedAt = new Date().toISOString();
  return report;
}
