import { describe, expect, it } from "vitest";
import { SimulatedProvider } from "@/lib/market/simulated";
import { MIN_BARS } from "@/lib/engine";

describe("simulated market", () => {
  const sim = new SimulatedProvider();
  it("is deterministic and has enough history", async () => {
    const start = new Date(Date.now() - 60 * 86_400_000);
    const a = await sim.getDailyCloses("AAPL", start);
    const b = await sim.getDailyCloses("AAPL", start);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(MIN_BARS);
  });
  it("fills orders and can re-read them by id", async () => {
    const o = await sim.submitOrder({ symbol: "MSFT", side: "buy", notional: 500, clientOrderId: "x" });
    expect(o.status).toBe("filled");
    expect(o.filledQty * o.filledAvgPrice!).toBeCloseTo(500, 0);
    expect(await sim.getOrder(o.id)).toEqual(o);
  });
});
