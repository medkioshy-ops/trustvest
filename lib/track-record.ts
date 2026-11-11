// Live evidence about the AI, computed from what it actually did:
//  1. Track record — after each executed BUY/SELL, did the price move the way the AI bet?
//  2. Consistency — does every stored decision follow from its own stored inputs?
//     (recomputes the combined score and checks the action against the written rules)
import type { AiDecision, SignalInputs } from "./types";

export interface TrackedCall {
  decision_id: string;
  asset: string;
  action: "buy" | "sell";
  created_at: string;
  priceThen: number;
  priceNow: number;
  movePct: number;
  /** null = price has not moved enough yet to judge (|move| < 0.05%). */
  right: boolean | null;
}

export interface TrackRecord {
  calls: TrackedCall[];
  judged: number;
  right: number;
  hitRatePct: number | null;
}

const FLAT_PCT = 0.05;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A buy is "right" if the price has since risen; a sell is right if it has since fallen. */
export function trackRecord(decisions: AiDecision[], prices: Record<string, number>): TrackRecord {
  const calls: TrackedCall[] = [];
  for (const d of decisions) {
    if (d.action === "hold") continue;
    const then = Number(d.signal_inputs?.price);
    const now = prices[d.asset];
    if (!then || !now) continue;
    const movePct = r2((now / then - 1) * 100);
    calls.push({
      decision_id: d.decision_id,
      asset: d.asset,
      action: d.action,
      created_at: d.created_at,
      priceThen: then,
      priceNow: now,
      movePct,
      right: Math.abs(movePct) < FLAT_PCT ? null : d.action === "buy" ? movePct > 0 : movePct < 0,
    });
  }
  const judged = calls.filter((c) => c.right !== null).length;
  const right = calls.filter((c) => c.right === true).length;
  return { calls, judged, right, hitRatePct: judged ? r2((right / judged) * 100) : null };
}

export interface ConsistencyResult {
  checked: number;
  consistent: number;
  problems: { decision_id: string; asset: string; detail: string }[];
}

/** Which actions the written rules allow for these inputs (holds can be forced by risk rules). */
export function allowedActions(s: SignalInputs): Set<string> {
  if (s.portfolio.pending_order) return new Set(["hold"]);
  if (s.combined_score >= s.thresholds.buy) return new Set(["buy", "hold"]); // hold = cap / low cash
  if (s.combined_score <= s.thresholds.sell) return new Set(s.portfolio.position_qty > 0 ? ["sell"] : ["hold"]);
  return new Set(["hold"]);
}

export function checkConsistency(decisions: AiDecision[]): ConsistencyResult {
  const problems: ConsistencyResult["problems"] = [];
  let checked = 0;
  for (const d of decisions) {
    const s = d.signal_inputs;
    if (!s?.momentum || !s?.sentiment || !s?.weights || !s?.thresholds) continue;
    checked++;
    const recomputed = s.weights.momentum * s.momentum.score + s.weights.sentiment * s.sentiment.score;
    if (Math.abs(recomputed - s.combined_score) > 0.0002) {
      problems.push({
        decision_id: d.decision_id,
        asset: d.asset,
        detail: `stored score ${s.combined_score} but inputs give ${recomputed.toFixed(4)}`,
      });
      continue;
    }
    if (!allowedActions(s).has(d.action)) {
      problems.push({
        decision_id: d.decision_id,
        asset: d.asset,
        detail: `${d.action.toUpperCase()} is not allowed by the rules for score ${s.combined_score}`,
      });
    }
  }
  return { checked, consistent: checked - problems.length, problems };
}
