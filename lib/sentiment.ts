// FR4 — news-headline sentiment with VADER (local lexicon, no paid NLP API).
import vader from "vader-sentiment";
import type { Headline, ScoredHeadline } from "./types";

export function scoreHeadline(text: string): number {
  const { compound } = vader.SentimentIntensityAnalyzer.polarity_scores(text);
  return round(compound, 4);
}

export function scoreHeadlines(headlines: Headline[]): {
  score: number;
  headlines: ScoredHeadline[];
} {
  const scored = headlines.map((h) => ({ ...h, compound: scoreHeadline(h.headline) }));
  if (scored.length === 0) return { score: 0, headlines: [] };
  const mean = scored.reduce((s, h) => s + h.compound, 0) / scored.length;
  return { score: round(mean, 4), headlines: scored };
}

export function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
