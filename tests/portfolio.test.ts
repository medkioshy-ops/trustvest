import { describe, expect, it } from "vitest";
import { cashAt, computeHoldings } from "@/lib/portfolio";
import { computePerformance } from "@/lib/performance";
import type { Transaction } from "@/lib/types";

let n = 0;
const tx = (type: Transaction["type"], amount: number, asset: string, at: string, quantity?: number): Transaction => ({
  transaction_id: `t${++n}`,
  wallet_id: "w",
  type,
  amount,
  asset,
  status: "released",
  created_at: at,
  updated_at: at,
  quantity: quantity ?? null,
  price: quantity ? amount / quantity : null,
  broker_order_id: null,
  failure_reason: null,
});

const txs = [
  tx("deposit", 1000, "USD", "2026-10-01T08:00:00Z"),
  tx("buy", 500, "AAPL", "2026-10-02T15:00:00Z", 5),
  tx("buy", 300, "AAPL", "2026-10-03T15:00:00Z", 2),
  tx("sell", 360, "AAPL", "2026-10-04T15:00:00Z", 3),
];

describe("holdings", () => {
  it("uses average cost and realises P/L on sells", () => {
    const h = computeHoldings(txs).get("AAPL")!;
    expect(h.quantity).toBeCloseTo(4);
    expect(h.avgCost).toBeCloseTo(800 / 7);
    expect(h.realisedPnl).toBeCloseTo(360 - (800 * 3) / 7);
  });
  it("replays cash to any point in time", () => {
    expect(cashAt(txs, new Date("2026-10-02T23:00:00Z"))).toBe(500);
    expect(cashAt(txs, new Date("2026-10-05T00:00:00Z"))).toBe(560);
  });
  it("ignores pending and failed trades", () => {
    const p = { ...tx("buy", 100, "MSFT", "2026-10-02T10:00:00Z", 1), status: "pending" as const };
    expect(computeHoldings([...txs, p]).has("MSFT")).toBe(false);
  });
});

describe("performance vs buy-and-hold", () => {
  it("starts both lines at the same value and tracks deposits", () => {
    const closes = {
      AAPL: [
        { date: "2026-10-01", close: 100 },
        { date: "2026-10-02", close: 100 },
        { date: "2026-10-03", close: 150 },
        { date: "2026-10-04", close: 120 },
      ],
    };
    const r = computePerformance({
      transactions: [...txs, tx("deposit", 200, "USD", "2026-10-04T09:00:00Z")],
      closes,
      benchmarkAssets: ["AAPL"],
      start: new Date("2026-09-01T00:00:00Z"),
      now: new Date("2026-10-04T23:00:00Z"),
    });
    expect(r.points[0].date).toBe("2026-10-01");
    expect(r.points[0].ai).toBe(1000);
    expect(r.points[0].benchmark).toBe(1000);
    // Benchmark: 10 AAPL from day 1, +200/120 units on day 4 → 1400 at 120
    expect(r.points.at(-1)!.benchmark).toBe(1400);
    // AI: cash 560 + 200 + 4 × 120
    expect(r.points.at(-1)!.ai).toBe(1240);
    expect(r.contributed).toBe(1200);
    expect(r.benchmarkReturnPct).toBeCloseTo(16.67, 1);
    expect(r.aiReturnPct).toBeCloseTo(3.33, 1);
  });
  it("returns no points before any money exists", () => {
    const r = computePerformance({ transactions: [], closes: {}, benchmarkAssets: ["AAPL"], start: new Date(), now: new Date() });
    expect(r.points).toEqual([]);
  });
});
