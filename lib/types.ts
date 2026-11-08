// Row types mirroring supabase/migrations/*.sql.
// numeric columns arrive from PostgREST as numbers (or strings for very large values),
// so readers should wrap them in Number().

export type TransactionType = "buy" | "sell" | "deposit";
export type TransactionStatus = "pending" | "verified" | "released" | "failed";
export type DecisionAction = "buy" | "hold" | "sell";
export type LedgerKind = "deposit" | "decision" | "settlement";

export interface Wallet {
  wallet_id: string;
  balance: number;
  currency: string;
  updated_at: string;
}

export interface Transaction {
  transaction_id: string;
  wallet_id: string;
  type: TransactionType;
  amount: number;
  asset: string;
  status: TransactionStatus;
  created_at: string;
  quantity: number | null;
  price: number | null;
  broker_order_id: string | null;
  failure_reason: string | null;
  updated_at: string;
}

export interface AiDecision {
  decision_id: string;
  transaction_id: string | null;
  asset: string;
  reasoning: string;
  signal_inputs: SignalInputs;
  action: DecisionAction;
  confidence: number | null;
  created_at: string;
}

export interface LedgerEntry {
  entry_id: string;
  seq: number;
  kind: LedgerKind;
  transaction_id: string | null;
  decision_id: string | null;
  previous_hash: string;
  payload: Record<string, unknown>;
  hash: string;
  created_at: string;
}

export interface Headline {
  headline: string;
  url?: string | null;
  source?: string | null;
  created_at: string;
}

export interface ScoredHeadline extends Headline {
  compound: number;
}

/** Everything the engine looked at, stored verbatim in ai_decision.signal_inputs. */
export interface SignalInputs {
  data_source: "alpaca" | "simulated";
  asset: string;
  as_of: string;
  price: number;
  momentum: {
    sma_short: number;
    sma_long: number;
    sma_gap_pct: number;
    return_5d_pct: number;
    score: number;
    bars_used: number;
  };
  sentiment: {
    score: number;
    headline_count: number;
    headlines: ScoredHeadline[];
  };
  combined_score: number;
  weights: { momentum: number; sentiment: number };
  thresholds: { buy: number; sell: number };
  portfolio: {
    available_cash: number;
    position_qty: number;
    position_value: number;
    portfolio_value: number;
    pending_order: boolean;
  };
  order?: { side: "buy" | "sell"; notional?: number; qty?: number };
}
