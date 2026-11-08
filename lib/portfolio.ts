// FR2 — holdings derived from settled transactions (average-cost method).
import type { Transaction } from "./types";

export interface Holding {
  asset: string;
  quantity: number;
  avgCost: number;
  costBasis: number;
  realisedPnl: number;
}

const QTY_EPS = 1e-9;

/** Money moves when a transaction is released, which is its last update. */
export const settledAt = (t: Transaction) => new Date(t.updated_at ?? t.created_at);

export function computeHoldings(transactions: Transaction[], until?: Date): Map<string, Holding> {
  const rows = transactions
    .filter((t) => t.status === "released" && (t.type === "buy" || t.type === "sell"))
    .filter((t) => !until || settledAt(t) <= until)
    .sort((a, b) => settledAt(a).getTime() - settledAt(b).getTime());

  const map = new Map<string, Holding>();
  for (const t of rows) {
    const qty = Number(t.quantity ?? 0);
    const amount = Number(t.amount);
    const h = map.get(t.asset) ?? { asset: t.asset, quantity: 0, avgCost: 0, costBasis: 0, realisedPnl: 0 };
    if (t.type === "buy") {
      h.quantity += qty;
      h.costBasis += amount;
    } else {
      const sellQty = Math.min(qty, h.quantity);
      const costOut = h.quantity > 0 ? (h.costBasis * sellQty) / h.quantity : 0;
      h.realisedPnl += amount - costOut;
      h.quantity -= sellQty;
      h.costBasis -= costOut;
    }
    if (h.quantity < QTY_EPS) {
      h.quantity = 0;
      h.costBasis = 0;
    }
    h.avgCost = h.quantity > 0 ? h.costBasis / h.quantity : 0;
    map.set(t.asset, h);
  }
  return map;
}

/** Wallet cash as of a point in time, replayed from released transactions. */
export function cashAt(transactions: Transaction[], until: Date): number {
  let cash = 0;
  for (const t of transactions) {
    if (t.status !== "released" || settledAt(t) > until) continue;
    const amt = Number(t.amount);
    cash += t.type === "buy" ? -amt : amt;
  }
  return Math.round(cash * 100) / 100;
}
