// FR3 / FR6 — Alpaca market data, news and paper-trading orders over REST.
// Docs: https://docs.alpaca.markets/reference
import { isCrypto } from "../config";
import type { Headline } from "../types";
import type { BrokerOrder, DailyClose, MarketProvider, OrderRequest } from "./types";

const DATA_URL = "https://data.alpaca.markets";

export class AlpacaError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export class AlpacaProvider implements MarketProvider {
  readonly source = "alpaca" as const;
  private headers: Record<string, string>;
  private tradingUrl: string;

  constructor(keyId: string, secret: string, paper = true) {
    this.headers = {
      "APCA-API-KEY-ID": keyId,
      "APCA-API-SECRET-KEY": secret,
      accept: "application/json",
    };
    // Paper by default (FR6). Live is deliberately only reachable via ALPACA_PAPER=false.
    this.tradingUrl = paper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
  }

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, { headers: this.headers, cache: "no-store" });
    if (!res.ok) {
      throw new AlpacaError(`Alpaca ${res.status} on GET ${new URL(url).pathname}: ${await safeText(res)}`, res.status);
    }
    return res.json() as Promise<T>;
  }

  async getDailyCloses(symbol: string, start: Date): Promise<DailyClose[]> {
    const crypto = isCrypto(symbol);
    const out: DailyClose[] = [];
    let pageToken: string | undefined;
    do {
      const qs = new URLSearchParams({
        symbols: symbol,
        timeframe: "1Day",
        start: start.toISOString(),
        limit: "10000",
      });
      if (!crypto) {
        qs.set("feed", "iex"); // free feed
        qs.set("adjustment", "all");
      }
      if (pageToken) qs.set("page_token", pageToken);
      const path = crypto ? "/v1beta3/crypto/us/bars" : "/v2/stocks/bars";
      const body = await this.get<{
        bars: Record<string, { t: string; c: number }[]> | null;
        next_page_token?: string | null;
      }>(`${DATA_URL}${path}?${qs}`);
      for (const b of body.bars?.[symbol] ?? []) out.push({ date: b.t.slice(0, 10), close: b.c });
      pageToken = body.next_page_token ?? undefined;
    } while (pageToken);
    return out;
  }

  async getLatestPrice(symbol: string): Promise<number> {
    const crypto = isCrypto(symbol);
    const qs = new URLSearchParams({ symbols: symbol });
    if (!crypto) qs.set("feed", "iex");
    const path = crypto ? "/v1beta3/crypto/us/latest/trades" : "/v2/stocks/trades/latest";
    const body = await this.get<{ trades: Record<string, { p: number }> }>(`${DATA_URL}${path}?${qs}`);
    const p = body.trades?.[symbol]?.p;
    if (!p || p <= 0) throw new Error(`No latest trade price for ${symbol}`);
    return p;
  }

  async getNews(symbol: string, since: Date): Promise<Headline[]> {
    const qs = new URLSearchParams({
      symbols: symbol.replace("/", ""), // news uses BTCUSD, not BTC/USD
      start: since.toISOString(),
      limit: "20",
      sort: "desc",
    });
    const body = await this.get<{
      news: { headline: string; url?: string; source?: string; created_at: string }[];
    }>(`${DATA_URL}/v1beta1/news?${qs}`);
    return (body.news ?? []).map((n) => ({
      headline: n.headline,
      url: n.url ?? null,
      source: n.source ?? null,
      created_at: n.created_at,
    }));
  }

  async submitOrder(req: OrderRequest): Promise<BrokerOrder> {
    const body: Record<string, string> = {
      symbol: req.symbol,
      side: req.side,
      type: "market",
      time_in_force: isCrypto(req.symbol) ? "gtc" : "day",
      client_order_id: req.clientOrderId, // = transaction_id → idempotent retries
    };
    if (req.notional !== undefined) body.notional = req.notional.toFixed(2);
    else if (req.qty !== undefined) body.qty = String(req.qty);
    else throw new Error("Order needs notional or qty");

    const res = await fetch(`${this.tradingUrl}/v2/orders`, {
      method: "POST",
      headers: { ...this.headers, "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new AlpacaError(`Alpaca rejected order: ${res.status} ${await safeText(res)}`, res.status);
    }
    return toOrder(await res.json());
  }

  async getOrder(id: string): Promise<BrokerOrder> {
    return toOrder(await this.get(`${this.tradingUrl}/v2/orders/${encodeURIComponent(id)}`));
  }
}

function toOrder(o: unknown): BrokerOrder {
  const r = o as { id: string; status: string; filled_qty?: string | null; filled_avg_price?: string | null };
  return {
    id: r.id,
    status: r.status,
    filledQty: Number(r.filled_qty ?? 0),
    filledAvgPrice: r.filled_avg_price ? Number(r.filled_avg_price) : null,
  };
}

async function safeText(res: Response) {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
