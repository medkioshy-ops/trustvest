import { describe, expect, it } from "vitest";
import { computeMomentum, decide, type DecisionContext } from "@/lib/engine";
import { scoreHeadlines } from "@/lib/sentiment";

const cfg = {
  weights: { momentum: 0.6, sentiment: 0.4 },
  thresholds: { buy: 0.25, sell: -0.25 },
  positionSizePct: 0.1,
  maxPositionPct: 0.3,
  minOrderNotional: 10,
  newsLookbackHours: 72,
};
const rising = Array.from({ length: 30 }, (_, i) => 100 * 1.01 ** i);
const falling = Array.from({ length: 30 }, (_, i) => 100 * 0.99 ** i);
const flat = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 ? 0.1 : -0.1));

const ctx = (over: Partial<DecisionContext>): DecisionContext => ({
  asset: "AAPL",
  dataSource: "simulated",
  asOf: "2026-10-25T10:00:00.000Z",
  closes: flat,
  price: 100,
  sentiment: { score: 0, headlines: [] },
  availableCash: 10_000,
  positionQty: 0,
  portfolioValue: 10_000,
  pendingOrder: false,
  currency: "USD",
  ...over,
});

describe("momentum", () => {
  it("is positive for a rising series and negative for a falling one", () => {
    expect(computeMomentum(rising).score).toBeGreaterThan(0.5);
    expect(computeMomentum(falling).score).toBeLessThan(-0.5);
    expect(Math.abs(computeMomentum(flat).score)).toBeLessThan(0.1);
  });
  it("refuses too little history", () => {
    expect(() => computeMomentum(rising.slice(0, 10))).toThrow(/at least/);
  });
});

describe("sentiment", () => {
  it("scores positive and negative headlines with VADER", () => {
    const pos = scoreHeadlines([{ headline: "Apple beats expectations, shares surge on strong growth", created_at: "x" }]);
    const neg = scoreHeadlines([{ headline: "Apple faces lawsuit, shares crash amid fraud fears", created_at: "x" }]);
    expect(pos.score).toBeGreaterThan(0.2);
    expect(neg.score).toBeLessThan(-0.2);
    expect(scoreHeadlines([]).score).toBe(0);
  });
});

describe("decide", () => {
  it("buys on strong momentum with a sized, explained order", () => {
    const d = decide(ctx({ closes: rising, price: rising.at(-1)! }), cfg);
    expect(d.action).toBe("buy");
    expect(d.signalInputs.order).toEqual({ side: "buy", notional: 1000 });
    expect(d.reasoning).toMatch(/^BUY USD 1000\.00 of AAPL/);
    expect(d.reasoning).toMatch(/momentum is positive/);
    expect(d.confidence).toBeGreaterThan(0);
    expect(d.confidence).toBeLessThanOrEqual(1);
  });

  it("sells the whole position on a bearish signal", () => {
    const d = decide(ctx({ closes: falling, positionQty: 3 }), cfg);
    expect(d.action).toBe("sell");
    expect(d.signalInputs.order).toEqual({ side: "sell", qty: 3 });
  });

  it("holds when bearish with nothing to sell", () => {
    const d = decide(ctx({ closes: falling }), cfg);
    expect(d.action).toBe("hold");
    expect(d.reasoning).toMatch(/no AAPL position to sell/);
  });

  it("holds on a neutral signal and says why", () => {
    const d = decide(ctx({}), cfg);
    expect(d.action).toBe("hold");
    expect(d.reasoning).toMatch(/between the sell/);
    expect(d.reasoning).toMatch(/No recent news headlines/);
  });

  it("does not stack orders while one is pending", () => {
    expect(decide(ctx({ closes: rising, pendingOrder: true }), cfg).action).toBe("hold");
  });

  it("respects the position cap", () => {
    const d = decide(ctx({ closes: rising, price: 100, positionQty: 30, portfolioValue: 10_000 }), cfg);
    expect(d.action).toBe("hold");
    expect(d.reasoning).toMatch(/cap/);
  });

  it("caps the buy so the position stays under the limit", () => {
    const d = decide(ctx({ closes: rising, price: 100, positionQty: 28, portfolioValue: 10_000 }), cfg);
    expect(d.signalInputs.order).toEqual({ side: "buy", notional: 200 });
  });

  it("holds when cash is below the minimum order", () => {
    expect(decide(ctx({ closes: rising, availableCash: 50 }), cfg).action).toBe("hold");
  });

  it("lets strong negative news pull a mild uptrend below the buy threshold", () => {
    const mild = Array.from({ length: 30 }, (_, i) => 100 * 1.002 ** i);
    const bullish = decide(ctx({ closes: mild }), cfg);
    const withBadNews = decide(ctx({ closes: mild, sentiment: { score: -0.8, headlines: [{ headline: "x", created_at: "y", compound: -0.8 }] } }), cfg);
    expect(withBadNews.signalInputs.combined_score).toBeLessThan(bullish.signalInputs.combined_score);
  });
});

describe("confidence", () => {
  it("reflects signal strength when a strong signal is blocked by a rule", () => {
    const d = decide(ctx({ closes: falling }), cfg);
    expect(d.action).toBe("hold");
    expect(d.confidence).toBeGreaterThan(0.25);
  });
  it("is high for a firmly neutral hold", () => {
    expect(decide(ctx({}), cfg).confidence).toBeGreaterThan(0.6);
  });
});
