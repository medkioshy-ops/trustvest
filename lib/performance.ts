// FR9 — AI portfolio vs a buy-and-hold benchmark (and vs holding cash).
//
// Buy-and-hold benchmark: on the first day of the period the AI portfolio's value is
// split equally across the watchlist and held untouched. Every later deposit is split
// the same way on the day it lands, so both lines receive identical cash inflows.
import { cashAt, computeHoldings, settledAt } from "./portfolio";
import type { Transaction } from "./types";
import type { DailyClose } from "./market/types";

export interface PerformancePoint {
  date: string;
  ai: number;
  benchmark: number;
  cash: number;
}

export interface PerformanceResult {
  points: PerformancePoint[];
  contributed: number;
  aiReturnPct: number | null;
  benchmarkReturnPct: number | null;
}

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function dayKeys(start: Date, end: Date): string[] {
  const out: string[] = [];
  let t = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  for (; t <= end.getTime(); t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Last known close on or before each day (forward-filled over weekends/holidays). */
function closeLookup(closes: DailyClose[]) {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  return (day: string): number | null => {
    let found: number | null = null;
    for (const c of sorted) {
      if (c.date > day) break;
      found = c.close;
    }
    return found;
  };
}

export function computePerformance(opts: {
  transactions: Transaction[];
  closes: Record<string, DailyClose[]>;
  benchmarkAssets: string[];
  start: Date;
  now: Date;
  latestPrices?: Record<string, number>;
}): PerformanceResult {
  const { transactions, benchmarkAssets, now } = opts;
  const lookups = Object.fromEntries(Object.entries(opts.closes).map(([s, c]) => [s, closeLookup(c)]));
  const today = now.toISOString().slice(0, 10);
  const priceOn = (asset: string, day: string) =>
    (day === today ? opts.latestPrices?.[asset] : undefined) ?? lookups[asset]?.(day) ?? null;

  const released = transactions.filter((t) => t.status === "released");
  const firstMoney = released.length ? Math.min(...released.map((t) => settledAt(t).getTime())) : null;
  if (firstMoney === null) return { points: [], contributed: 0, aiReturnPct: null, benchmarkReturnPct: null };

  const start = new Date(Math.max(opts.start.getTime(), firstMoney));
  const days = dayKeys(start, now);

  const aiValueOn = (day: string) => {
    const eod = day === today ? now : new Date(`${day}T23:59:59.999Z`);
    let value = cashAt(released, eod);
    for (const h of computeHoldings(released, eod).values()) {
      const p = priceOn(h.asset, day);
      if (p !== null) value += h.quantity * p;
      else value += h.costBasis; // no price yet: carry at cost rather than drop it
    }
    return value;
  };

  const units: Record<string, number> = {};
  let benchCash = 0; // money waiting for an asset that has no price yet
  const invest = (amount: number, day: string) => {
    const priced = benchmarkAssets.filter((a) => priceOn(a, day) !== null);
    if (priced.length === 0) {
      benchCash += amount;
      return;
    }
    const share = amount / priced.length;
    for (const a of priced) units[a] = (units[a] ?? 0) + share / priceOn(a, day)!;
  };

  const points: PerformancePoint[] = [];
  let contributed = 0;
  let prevEod = new Date(new Date(`${days[0]}T00:00:00.000Z`).getTime() - 1);

  days.forEach((day, i) => {
    const eod = day === today ? now : new Date(`${day}T23:59:59.999Z`);
    if (i === 0) {
      contributed = aiValueOn(day);
      invest(contributed, day);
    } else {
      const deposits = released
        .filter((t) => t.type === "deposit" && settledAt(t) > prevEod && settledAt(t) <= eod)
        .reduce((s, t) => s + Number(t.amount), 0);
      if (deposits > 0) {
        contributed += deposits;
        invest(deposits, day);
      }
      if (benchCash > 0) {
        const waiting = benchCash;
        benchCash = 0;
        invest(waiting, day);
      }
    }
    let bench = benchCash;
    for (const [a, u] of Object.entries(units)) bench += u * (priceOn(a, day) ?? 0);
    points.push({ date: day, ai: r2(aiValueOn(day)), benchmark: r2(bench), cash: r2(contributed) });
    prevEod = eod;
  });

  const last = points[points.length - 1];
  const pct = (v: number) => (contributed > 0 ? Math.round(((v - contributed) / contributed) * 10000) / 100 : null);
  return {
    points,
    contributed: r2(contributed),
    aiReturnPct: pct(last.ai),
    benchmarkReturnPct: pct(last.benchmark),
  };
}

export const PERIODS = {
  "1w": { label: "1W", days: 7 },
  "1m": { label: "1M", days: 30 },
  "3m": { label: "3M", days: 90 },
  all: { label: "All", days: 3650 },
} as const;
export type PeriodKey = keyof typeof PERIODS;
