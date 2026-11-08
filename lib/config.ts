// All runtime configuration comes from environment variables (NFR5 portability).

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

export function getWatchlist(): string[] {
  const raw = process.env.WATCHLIST ?? "AAPL,MSFT,NVDA,BTC/USD";
  const list = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (list.length === 0) throw new Error("WATCHLIST is empty");
  return Array.from(new Set(list));
}

export function getEngineConfig() {
  return {
    weights: {
      momentum: num("ENGINE_MOMENTUM_WEIGHT", 0.6),
      sentiment: num("ENGINE_SENTIMENT_WEIGHT", 0.4),
    },
    thresholds: {
      buy: num("ENGINE_BUY_THRESHOLD", 0.25),
      sell: num("ENGINE_SELL_THRESHOLD", -0.25),
    },
    /** Fraction of available cash allocated to one buy. */
    positionSizePct: num("ENGINE_POSITION_SIZE_PCT", 0.1),
    /** No single asset may exceed this share of the portfolio. */
    maxPositionPct: num("ENGINE_MAX_POSITION_PCT", 0.3),
    minOrderNotional: num("ENGINE_MIN_ORDER", 10),
    newsLookbackHours: num("ENGINE_NEWS_LOOKBACK_HOURS", 72),
  };
}

export type EngineConfig = ReturnType<typeof getEngineConfig>;

export function alpacaConfigured(): boolean {
  return Boolean(process.env.ALPACA_API_KEY_ID && process.env.ALPACA_API_SECRET_KEY);
}

export function isCrypto(symbol: string): boolean {
  return symbol.includes("/");
}
