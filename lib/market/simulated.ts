// Offline stand-in used ONLY when Alpaca keys are not configured, so the app can be
// developed and demonstrated without credentials. Every decision it produces is
// labelled data_source = "simulated" in signal_inputs and on the dashboard.
import type { Headline } from "../types";
import type { BrokerOrder, DailyClose, MarketProvider, OrderRequest } from "./types";

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 0, 1);

const BASE: Record<string, number> = { AAPL: 230, MSFT: 430, NVDA: 140, "BTC/USD": 95_000, "ETH/USD": 3_400 };

const HEADLINES = [
  "{s} beats quarterly earnings expectations as revenue climbs",
  "Analysts upgrade {s} citing strong demand outlook",
  "{s} shares slip after cautious guidance",
  "Regulators open inquiry into {s} business practices",
  "{s} announces new product line, investors cheer",
  "{s} faces supply chain disruption, shares fall",
  "{s} holds steady as markets await inflation data",
  "Record inflows boost confidence in {s}",
  "{s} cuts jobs amid weak sales and rising costs",
  "{s} partners with major firm in landmark deal",
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic pseudo-random in [0,1) for a (symbol, day) pair. */
function rand(symbol: string, day: number, salt = 0): number {
  let t = (hash(symbol) + day * 2654435761 + salt * 97) >>> 0;
  t += 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function closeOn(symbol: string, dayIndex: number): number {
  // Random walk with slow regime changes so momentum actually varies over time.
  let price = BASE[symbol] ?? 50 + (hash(symbol) % 200);
  for (let d = 0; d <= dayIndex; d++) {
    const regime = Math.sin(d / 9 + (hash(symbol) % 7)) * 0.006;
    price *= 1 + regime + (rand(symbol, d) - 0.5) * 0.03;
  }
  return Math.round(price * 100) / 100;
}

const dayIndexOf = (t: number) => Math.floor((t - EPOCH) / DAY);

export class SimulatedProvider implements MarketProvider {
  readonly source = "simulated" as const;

  async getDailyCloses(symbol: string, start: Date): Promise<DailyClose[]> {
    const from = Math.max(0, dayIndexOf(start.getTime()));
    const to = dayIndexOf(Date.now());
    const out: DailyClose[] = [];
    for (let d = from; d <= to; d++) {
      out.push({ date: new Date(EPOCH + d * DAY).toISOString().slice(0, 10), close: closeOn(symbol, d) });
    }
    return out;
  }

  async getLatestPrice(symbol: string): Promise<number> {
    return closeOn(symbol, dayIndexOf(Date.now()));
  }

  async getNews(symbol: string, since: Date): Promise<Headline[]> {
    const today = dayIndexOf(Date.now());
    const out: Headline[] = [];
    for (let d = Math.max(0, dayIndexOf(since.getTime())); d <= today; d++) {
      const count = Math.floor(rand(symbol, d, 1) * 3);
      for (let i = 0; i < count; i++) {
        const tpl = HEADLINES[Math.floor(rand(symbol, d, 2 + i) * HEADLINES.length)];
        out.push({
          headline: tpl.replace("{s}", symbol.replace("/USD", "")),
          source: "simulated",
          url: null,
          created_at: new Date(EPOCH + d * DAY + (9 + i * 3) * 3_600_000).toISOString(),
        });
      }
    }
    return out.reverse();
  }

  async submitOrder(req: OrderRequest): Promise<BrokerOrder> {
    const price = await this.getLatestPrice(req.symbol);
    const qty = req.qty ?? Math.floor(((req.notional ?? 0) / price) * 1e9) / 1e9;
    if (qty <= 0) throw new Error("Simulated order quantity is zero");
    // The fill is encoded in the id so getOrder works across serverless invocations.
    const id = `sim_${Buffer.from(JSON.stringify({ q: qty, p: price })).toString("base64url")}`;
    return { id, status: "filled", filledQty: qty, filledAvgPrice: price };
  }

  async getOrder(id: string): Promise<BrokerOrder> {
    const { q, p } = JSON.parse(Buffer.from(id.replace(/^sim_/, ""), "base64url").toString());
    return { id, status: "filled", filledQty: q, filledAvgPrice: p };
  }
}
