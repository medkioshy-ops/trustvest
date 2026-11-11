// Plain-English layer for first-time investors. The technical detail stays available
// (and sealed in the ledger); this only changes how it is explained on screen.
import type { AiDecision } from "./types";

const NAMES: Record<string, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  NVDA: "Nvidia",
  GOOGL: "Alphabet (Google)",
  AMZN: "Amazon",
  TSLA: "Tesla",
  META: "Meta",
  "BTC/USD": "Bitcoin",
  "ETH/USD": "Ethereum",
};

/** "Apple" for AAPL; falls back to the ticker. */
export const assetName = (ticker: string) => NAMES[ticker] ?? ticker;

/** "Apple (AAPL)" */
export const assetLabel = (ticker: string) => (NAMES[ticker] ? `${NAMES[ticker]} (${ticker})` : ticker);

/** Short, jargon-free definitions shown behind "?" icons. */
export const GLOSSARY = {
  paper: "Practice money. TrustVest trades with pretend dollars on a real market simulator, so nothing you do here can lose real money.",
  portfolio: "Everything in your account added together: the cash plus what your shares and coins are worth right now.",
  cash: "Money not yet invested. The AI uses a slice of this each time it decides to buy.",
  cycle:
    "One check-up by the AI. It looks at every asset on its watchlist, decides buy / sell / hold for each, writes down why, and seals that in the ledger. It also runs automatically every weekday.",
  momentum: "Is the price trending up or down lately? Compares the last week's average price with the last month's.",
  sentiment: "Is the recent news good or bad? Each headline is scored from −1 (very negative) to +1 (very positive) and averaged.",
  score:
    "The AI's overall opinion from −1 to +1: 60% price trend + 40% news mood. Above the buy line it buys; below the sell line it sells what it owns; in between it waits.",
  confidence: "How strong the signal behind this decision was. 100% means the score was far past a line; low means it was borderline.",
  ledger:
    "A tamper-evident diary. Every deposit, decision and trade is stored with a fingerprint (hash) of the entry before it, so changing any old entry breaks the chain and gets flagged.",
  integrity: "Re-checks every fingerprint in your ledger. 'Intact' means nothing has been changed or deleted since it was written.",
  cap: "Safety rule: the AI never puts more than 30% of your account into a single asset, so one bad pick can't sink everything.",
  gain: "How much more (or less) your shares are worth now than what the AI paid. It only becomes real money when they're sold.",
  benchmark:
    "The 'do-nothing' comparison: split the same money evenly across the watchlist on day one and never trade. If the AI can't beat this, its trading isn't adding value.",
  backtest: "A replay: we run today's exact AI rules on past prices to see how they would have done, before trusting them with the future.",
  drawdown: "The biggest fall from a high point to a low point. Smaller is safer — it's how much it would have hurt at the worst moment.",
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;

const signed = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));

function trendWords(m: number) {
  if (m > 0.5) return "its price has been rising strongly";
  if (m > 0.15) return "its price has been rising";
  if (m < -0.5) return "its price has been falling sharply";
  if (m < -0.15) return "its price has been falling";
  return "its price has been fairly flat";
}

function newsWords(s: number, count: number) {
  if (count === 0) return "there was no recent news";
  if (s > 0.3) return "the news is clearly positive";
  if (s > 0.05) return "the news is mildly positive";
  if (s < -0.3) return "the news is clearly negative";
  if (s < -0.05) return "the news is mildly negative";
  return "the news is mixed";
}

/** One sentence a first-time investor can read in five seconds. */
export function plainSummary(d: AiDecision, amountText?: string): string {
  const s = d.signal_inputs;
  const name = assetName(d.asset);
  if (!s?.momentum || !s?.sentiment) return d.reasoning.split(". ")[0] + ".";
  const why = `${trendWords(s.momentum.score)} and ${newsWords(s.sentiment.score, s.sentiment.headline_count)}`;
  if (d.action === "buy") return `Bought ${amountText ? `${amountText} of ` : ""}${name} because ${why}.`;
  if (d.action === "sell") return `Sold all of its ${name} because ${why}.`;

  // HOLD: say which rule stopped it, in plain words.
  const r = d.reasoning;
  if (s.portfolio.pending_order) return `Waited on ${name}: an earlier order is still being filled.`;
  if (/no .* position to sell/.test(r)) return `Waited on ${name}: the signals point down, but you don't own any to sell.`;
  if (/% of the portfolio, at the/.test(r)) return `Waited on ${name}: it already holds as much as the 30% safety limit allows.`;
  if (/too low for the minimum order/.test(r)) return `Waited on ${name}: the signals are good, but there isn't enough cash left to buy.`;
  return `Waited on ${name}: ${why}, which isn't a strong enough reason to trade (score ${signed(s.combined_score)}, needs ${signed(
    s.thresholds.buy,
  )} to buy).`;
}
