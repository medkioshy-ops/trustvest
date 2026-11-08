// FR5 — explainable buy/hold/sell decision from momentum (FR3) + sentiment (FR4).
// Pure function: same inputs always give the same decision, which is what makes
// the logged signal_inputs a complete, re-checkable explanation.
import type { EngineConfig } from "./config";
import { round } from "./sentiment";
import type { DecisionAction, ScoredHeadline, SignalInputs } from "./types";

export const SMA_SHORT = 5;
export const SMA_LONG = 20;
export const MIN_BARS = SMA_LONG + 1;

export interface DecisionContext {
  asset: string;
  dataSource: "alpaca" | "simulated";
  asOf: string;
  closes: number[]; // daily closes, oldest → newest
  price: number; // latest trade price
  sentiment: { score: number; headlines: ScoredHeadline[] };
  availableCash: number;
  positionQty: number;
  portfolioValue: number;
  pendingOrder: boolean;
  currency: string;
}

export interface Decision {
  action: DecisionAction;
  confidence: number;
  reasoning: string;
  signalInputs: SignalInputs;
}

const sma = (xs: number[], n: number) => xs.slice(-n).reduce((s, x) => s + x, 0) / n;

export function computeMomentum(closes: number[]) {
  if (closes.length < MIN_BARS) {
    throw new Error(`Need at least ${MIN_BARS} daily bars for momentum, got ${closes.length}`);
  }
  const smaShort = sma(closes, SMA_SHORT);
  const smaLong = sma(closes, SMA_LONG);
  const gap = (smaShort - smaLong) / smaLong;
  const last = closes[closes.length - 1];
  const fiveAgo = closes[closes.length - 1 - 5];
  const ret5 = last / fiveAgo - 1;
  // A 2% SMA gap and a 5% five-day return each count as "one unit" of trend.
  const raw = 0.5 * (gap / 0.02) + 0.5 * (ret5 / 0.05);
  return {
    sma_short: round(smaShort, 4),
    sma_long: round(smaLong, 4),
    sma_gap_pct: round(gap * 100, 3),
    return_5d_pct: round(ret5 * 100, 3),
    score: round(Math.tanh(raw), 4),
    bars_used: closes.length,
  };
}

export function decide(ctx: DecisionContext, cfg: EngineConfig): Decision {
  const momentum = computeMomentum(ctx.closes);
  const { weights, thresholds } = cfg;
  const combined = round(weights.momentum * momentum.score + weights.sentiment * ctx.sentiment.score, 4);
  const positionValue = round(ctx.positionQty * ctx.price, 2);

  const signalInputs: SignalInputs = {
    data_source: ctx.dataSource,
    asset: ctx.asset,
    as_of: ctx.asOf,
    price: ctx.price,
    momentum,
    sentiment: {
      score: ctx.sentiment.score,
      headline_count: ctx.sentiment.headlines.length,
      headlines: ctx.sentiment.headlines.slice(0, 10),
    },
    combined_score: combined,
    weights,
    thresholds,
    portfolio: {
      available_cash: round(ctx.availableCash, 2),
      position_qty: ctx.positionQty,
      position_value: positionValue,
      portfolio_value: round(ctx.portfolioValue, 2),
      pending_order: ctx.pendingOrder,
    },
  };

  const why: string[] = [describeMomentum(momentum), describeSentiment(ctx.sentiment)];
  const scoreLine = `Combined score ${fmtSigned(combined)} (${weights.momentum} × momentum ${fmtSigned(momentum.score)} + ${weights.sentiment} × sentiment ${fmtSigned(ctx.sentiment.score)}).`;
  why.push(scoreLine);

  const money = (n: number) => `${ctx.currency} ${n.toFixed(2)}`;
  let action: DecisionAction = "hold";
  let verdict: string;
  // True when the signal was strong but a portfolio rule stopped the trade.
  let blocked = false;

  if (ctx.pendingOrder) {
    blocked = Math.abs(combined) >= Math.min(thresholds.buy, -thresholds.sell);
    verdict = `HOLD: an earlier order for ${ctx.asset} is still waiting to fill, so no new order is placed.`;
  } else if (combined >= thresholds.buy) {
    const capRoom = cfg.maxPositionPct * ctx.portfolioValue - positionValue;
    const notional = round(Math.min(ctx.availableCash * cfg.positionSizePct, capRoom), 2);
    if (capRoom < cfg.minOrderNotional) {
      blocked = true;
      verdict = `HOLD: signal is bullish (≥ buy threshold ${thresholds.buy}) but ${ctx.asset} already makes up ${pct(positionValue / ctx.portfolioValue)} of the portfolio, at the ${pct(cfg.maxPositionPct)} cap.`;
    } else if (notional < cfg.minOrderNotional) {
      blocked = true;
      verdict = `HOLD: signal is bullish but available cash (${money(ctx.availableCash)}) is too low for the minimum order of ${money(cfg.minOrderNotional)}.`;
    } else {
      action = "buy";
      signalInputs.order = { side: "buy", notional };
      verdict = `BUY ${money(notional)} of ${ctx.asset}: combined score is at or above the buy threshold ${thresholds.buy}. Size = ${pct(cfg.positionSizePct)} of available cash, capped so the position stays under ${pct(cfg.maxPositionPct)} of the portfolio.`;
    }
  } else if (combined <= thresholds.sell) {
    if (ctx.positionQty > 0) {
      action = "sell";
      signalInputs.order = { side: "sell", qty: ctx.positionQty };
      verdict = `SELL the full ${ctx.asset} position (${ctx.positionQty} units, ≈ ${money(positionValue)}): combined score is at or below the sell threshold ${thresholds.sell}.`;
    } else {
      blocked = true;
      verdict = `HOLD: signal is bearish (≤ sell threshold ${thresholds.sell}) but there is no ${ctx.asset} position to sell.`;
    }
  } else {
    verdict = `HOLD: combined score is between the sell (${thresholds.sell}) and buy (${thresholds.buy}) thresholds — not a strong enough signal to trade.`;
  }

  // Confidence = strength of the signal behind the outcome: for trades and rule-blocked
  // holds that is |combined|; for neutral holds it is how firmly neutral the signal is.
  const confidence =
    action === "hold" && !blocked
      ? round(Math.max(0, 1 - Math.abs(combined) / Math.max(thresholds.buy, -thresholds.sell)), 3)
      : round(Math.min(1, Math.abs(combined)), 3);

  return {
    action,
    confidence,
    reasoning: [verdict, ...why].join(" "),
    signalInputs,
  };
}

function describeMomentum(m: ReturnType<typeof computeMomentum>) {
  const dir = m.score > 0.15 ? "positive" : m.score < -0.15 ? "negative" : "flat";
  return `Price momentum is ${dir} (score ${fmtSigned(m.score)}): the ${SMA_SHORT}-day average is ${fmtSigned(m.sma_gap_pct)}% vs the ${SMA_LONG}-day average and the 5-day return is ${fmtSigned(m.return_5d_pct)}%.`;
}

function describeSentiment(s: { score: number; headlines: ScoredHeadline[] }) {
  if (s.headlines.length === 0) {
    return "No recent news headlines were found, so sentiment is treated as neutral (0).";
  }
  const tone = s.score > 0.05 ? "positive" : s.score < -0.05 ? "negative" : "neutral";
  const strongest = [...s.headlines].sort((a, b) => Math.abs(b.compound) - Math.abs(a.compound))[0];
  return `News sentiment is ${tone} (average VADER ${fmtSigned(s.score)} across ${s.headlines.length} headline${s.headlines.length === 1 ? "" : "s"}); strongest: “${truncate(strongest.headline, 110)}” (${fmtSigned(strongest.compound)}).`;
}

const fmtSigned = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const pct = (n: number) => `${round(n * 100, 1)}%`;
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
