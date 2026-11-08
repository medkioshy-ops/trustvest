import type { Headline } from "../types";

export interface DailyClose {
  date: string; // YYYY-MM-DD (UTC)
  close: number;
}

export interface OrderRequest {
  symbol: string;
  side: "buy" | "sell";
  notional?: number;
  qty?: number;
  clientOrderId: string;
}

export interface BrokerOrder {
  id: string;
  status: string;
  filledQty: number;
  filledAvgPrice: number | null;
}

export interface MarketProvider {
  readonly source: "alpaca" | "simulated";
  getDailyCloses(symbol: string, start: Date): Promise<DailyClose[]>;
  getLatestPrice(symbol: string): Promise<number>;
  getNews(symbol: string, since: Date): Promise<Headline[]>;
  submitOrder(req: OrderRequest): Promise<BrokerOrder>;
  getOrder(id: string): Promise<BrokerOrder>;
}

/** Alpaca order states that will never fill further. */
export const TERMINAL_UNFILLED = new Set(["canceled", "expired", "rejected", "done_for_day", "suspended", "stopped"]);
