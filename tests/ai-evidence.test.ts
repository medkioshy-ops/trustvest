import { describe, expect, it } from "vitest";
import { runBacktest } from "@/lib/backtest";
import { decide } from "@/lib/engine";
import { checkConsistency, trackRecord } from "@/lib/track-record";
import type { AiDecision } from "@/lib/types";

const cfg = {
  weights: { momentum: 0.6, sentiment: 0.4 },
  thresholds: { buy: 0.25, sell: -0.25 },
  positionSizePct: 0.1,
  maxPositionPct: 0.3,
  minOrderNotional: 10,
  newsLookbackHours: 72,
};

const days = (n: number, f: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), close: f(i) }));

describe("backtest", () => {
  it("rides a steady uptrend and keeps the equity curve consistent", () => {
    const r = runBacktest({ closes: { UP: days(120, (i) => 100 * 1.01 ** i) }, assets: ["UP"], cfg, start: "2026-02-01" })!;
    expect(r.decisions.buy).toBeGreaterThan(0);
    expect(r.ai.returnPct).toBeGreaterThan(0);
    expect(r.points[0].ai).toBeCloseTo(10_000, 0);
    // only one asset with a 30% cap: buying stops at the cap (gains can lift it above, it never trims)
    expect(r.avgInvestedPct).toBeGreaterThan(0);
    expect(r.trades.filter((t) => t.side === "buy").length).toBeLessThan(10);
  });

  it("sells when a rally turns into a slump and records the closed trade", () => {
    const closes = days(160, (i) => (i < 80 ? 100 * 1.01 ** i : 100 * 1.01 ** 80 * 0.985 ** (i - 80)));
    const r = runBacktest({ closes: { X: closes }, assets: ["X"], cfg, start: "2026-02-01" })!;
    expect(r.decisions.sell).toBeGreaterThan(0);
    expect(r.closedTrades).toBeGreaterThan(0);
    expect(r.winRatePct).not.toBeNull();
    // the AI exits the slump, so it should lose less than buy-and-hold over the drop
    expect(r.ai.maxDrawdownPct).toBeGreaterThan(r.benchmark.maxDrawdownPct);
  });

  it("buy-and-hold benchmark starts at the same capital", () => {
    const r = runBacktest({ closes: { A: days(60, () => 50), B: days(60, () => 20) }, assets: ["A", "B"], cfg, start: "2026-01-25" })!;
    expect(r.points[0].benchmark).toBe(10_000);
    expect(r.points.at(-1)!.benchmark).toBe(10_000);
  });

  it("returns null without enough history", () => {
    expect(runBacktest({ closes: { A: days(10, () => 1) }, assets: ["A"], cfg, start: "2026-01-01" })).toBeNull();
  });
});

function stored(over: Partial<Parameters<typeof decide>[0]>, action?: AiDecision["action"]): AiDecision {
  const d = decide(
    {
      asset: "AAPL",
      dataSource: "simulated",
      asOf: "2026-11-01T00:00:00.000Z",
      closes: Array.from({ length: 30 }, (_, i) => 100 * 1.01 ** i),
      price: 133,
      sentiment: { score: 0.2, headlines: [] },
      availableCash: 10_000,
      positionQty: 0,
      portfolioValue: 10_000,
      pendingOrder: false,
      currency: "USD",
      ...over,
    },
    cfg,
  );
  return {
    decision_id: Math.random().toString(36),
    wallet_id: "w",
    transaction_id: null,
    asset: "AAPL",
    reasoning: d.reasoning,
    signal_inputs: d.signalInputs,
    action: action ?? d.action,
    confidence: d.confidence,
    created_at: "2026-11-01T00:00:00Z",
  };
}

describe("consistency check", () => {
  it("passes every decision the engine actually produced", () => {
    const ds = [stored({}), stored({ pendingOrder: true }), stored({ closes: Array.from({ length: 30 }, (_, i) => 100 * 0.99 ** i), positionQty: 2 })];
    expect(checkConsistency(ds)).toMatchObject({ checked: 3, consistent: 3, problems: [] });
  });

  it("flags an action that contradicts the stored inputs", () => {
    const r = checkConsistency([stored({}, "sell")]);
    expect(r.consistent).toBe(0);
    expect(r.problems[0].detail).toMatch(/SELL is not allowed/);
  });

  it("flags a tampered score", () => {
    const d = stored({});
    d.signal_inputs = { ...d.signal_inputs, combined_score: 0.99 };
    expect(checkConsistency([d]).problems[0].detail).toMatch(/inputs give/);
  });
});

describe("track record", () => {
  it("scores buys right when price rose and sells right when it fell", () => {
    const buy = stored({});
    const sell = { ...stored({ closes: Array.from({ length: 30 }, (_, i) => 100 * 0.99 ** i), positionQty: 2 }), asset: "MSFT" };
    sell.signal_inputs = { ...sell.signal_inputs, price: 100 };
    const r = trackRecord([buy, sell], { AAPL: 140, MSFT: 90 });
    expect(r.calls.map((c) => c.right)).toEqual([true, true]);
    expect(r.hitRatePct).toBe(100);
    expect(trackRecord([buy], { AAPL: 120 }).hitRatePct).toBe(0);
    // no movement yet → not judged, not counted as wrong
    const flat = trackRecord([buy], { AAPL: Number(buy.signal_inputs.price) });
    expect(flat).toMatchObject({ judged: 0, right: 0, hitRatePct: null });
  });
});
