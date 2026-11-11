// "Does the AI work?" — replay the exact production engine (lib/engine.ts → decide())
// over historical daily prices and compare it with simply buying and holding.
//
// Honest limits, shown on the page as well:
//  • News sentiment is not replayed (historical headlines are not stored), so the
//    backtest scores sentiment as neutral (0) — exactly what the live engine does
//    when it finds no headlines. The backtest therefore tests the momentum half.
//  • Trades fill at that day's close with no fees or slippage.
import type { EngineConfig } from "./config";
import { decide, MIN_BARS } from "./engine";
import type { DailyClose } from "./market/types";
import type { PerformancePoint } from "./performance";

export interface BacktestTrade {
  date: string;
  asset: string;
  side: "buy" | "sell";
  price: number;
  amount: number;
  pnl?: number; // sells only: proceeds − cost of the units sold
}

export interface BacktestResult {
  points: PerformancePoint[];
  startCapital: number;
  ai: { finalValue: number; returnPct: number; maxDrawdownPct: number };
  benchmark: { finalValue: number; returnPct: number; maxDrawdownPct: number };
  trades: BacktestTrade[];
  closedTrades: number;
  winningTrades: number;
  winRatePct: number | null;
  avgInvestedPct: number;
  decisions: { buy: number; sell: number; hold: number };
  assets: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function maxDrawdown(values: number[]) {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.min(worst, v / peak - 1);
  }
  return r2(worst * 100);
}

export function runBacktest(opts: {
  closes: Record<string, DailyClose[]>;
  assets: string[];
  cfg: EngineConfig;
  start: string; // YYYY-MM-DD — first day decisions are allowed (earlier bars are warm-up)
  startCapital?: number;
  dataSource?: "alpaca" | "simulated";
}): BacktestResult | null {
  const startCapital = opts.startCapital ?? 10_000;
  const assets = opts.assets.filter((a) => (opts.closes[a]?.length ?? 0) >= MIN_BARS);
  if (assets.length === 0) return null;

  const series = Object.fromEntries(
    assets.map((a) => [a, [...opts.closes[a]].sort((x, y) => x.date.localeCompare(y.date))]),
  ) as Record<string, DailyClose[]>;
  const days = Array.from(new Set(assets.flatMap((a) => series[a].map((c) => c.date))))
    .filter((d) => d >= opts.start)
    .sort();
  if (days.length < 2) return null;

  // Cursor per asset: index of the last bar on or before the current day.
  const cursor: Record<string, number> = Object.fromEntries(assets.map((a) => [a, -1]));
  const lastClose = (a: string) => (cursor[a] >= 0 ? series[a][cursor[a]].close : null);

  let cash = startCapital;
  const pos: Record<string, { qty: number; cost: number }> = {};
  const trades: BacktestTrade[] = [];
  const counts = { buy: 0, sell: 0, hold: 0 };
  const benchUnits: Record<string, number> = {};
  let benchCash = startCapital;
  const points: PerformancePoint[] = [];
  let investedShareSum = 0;

  const portfolioValue = () => cash + assets.reduce((s, a) => s + (pos[a]?.qty ?? 0) * (lastClose(a) ?? 0), 0);

  for (const day of days) {
    const traded: string[] = [];
    for (const a of assets) {
      const before = cursor[a];
      while (cursor[a] + 1 < series[a].length && series[a][cursor[a] + 1].date <= day) cursor[a]++;
      if (cursor[a] !== before && series[a][cursor[a]].date === day) traded.push(a);
    }

    // Benchmark: put each asset's equal share to work the first day it has a price.
    for (const a of assets) {
      if (benchUnits[a] === undefined && lastClose(a) !== null) {
        const share = startCapital / assets.length;
        benchUnits[a] = share / lastClose(a)!;
        benchCash -= share;
      }
    }

    // AI: one decision per asset per bar, same order and rules as the live cycle.
    for (const a of traded) {
      const history = series[a].slice(Math.max(0, cursor[a] - 39), cursor[a] + 1).map((c) => c.close);
      if (history.length < MIN_BARS) continue;
      const price = history[history.length - 1];
      const p = pos[a] ?? { qty: 0, cost: 0 };
      const d = decide(
        {
          asset: a,
          dataSource: opts.dataSource ?? "alpaca",
          asOf: `${day}T21:00:00.000Z`,
          closes: history,
          price,
          sentiment: { score: 0, headlines: [] },
          availableCash: cash,
          positionQty: p.qty,
          portfolioValue: portfolioValue(),
          pendingOrder: false,
          currency: "USD",
        },
        opts.cfg,
      );
      counts[d.action]++;
      if (d.action === "buy" && d.signalInputs.order?.notional) {
        const amount = Math.min(d.signalInputs.order.notional, cash);
        const qty = amount / price;
        pos[a] = { qty: p.qty + qty, cost: p.cost + amount };
        cash -= amount;
        trades.push({ date: day, asset: a, side: "buy", price, amount: r2(amount) });
      } else if (d.action === "sell" && p.qty > 0) {
        const proceeds = p.qty * price;
        cash += proceeds;
        trades.push({ date: day, asset: a, side: "sell", price, amount: r2(proceeds), pnl: r2(proceeds - p.cost) });
        pos[a] = { qty: 0, cost: 0 };
      }
    }

    const ai = portfolioValue();
    const bench = benchCash + assets.reduce((s, a) => s + (benchUnits[a] ?? 0) * (lastClose(a) ?? 0), 0);
    investedShareSum += ai > 0 ? (ai - cash) / ai : 0;
    points.push({ date: day, ai: r2(ai), benchmark: r2(bench), cash: startCapital });
  }

  const sells = trades.filter((t) => t.side === "sell");
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0).length;
  const last = points[points.length - 1];
  const pct = (v: number) => r2((v / startCapital - 1) * 100);
  return {
    points,
    startCapital,
    ai: { finalValue: last.ai, returnPct: pct(last.ai), maxDrawdownPct: maxDrawdown(points.map((p) => p.ai)) },
    benchmark: {
      finalValue: last.benchmark,
      returnPct: pct(last.benchmark),
      maxDrawdownPct: maxDrawdown(points.map((p) => p.benchmark)),
    },
    trades,
    closedTrades: sells.length,
    winningTrades: wins,
    winRatePct: sells.length ? r2((wins / sells.length) * 100) : null,
    avgInvestedPct: r2((investedShareSum / points.length) * 100),
    decisions: counts,
    assets,
  };
}
