import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMarketProvider } from "./market";
import { computeHoldings, type Holding } from "./portfolio";
import type { AiDecision, Transaction, Wallet } from "./types";

export async function loadWallet(db: SupabaseClient): Promise<Wallet | null> {
  const { data, error } = await db.from("wallet").select("*").maybeSingle();
  if (error) throw new Error(`Reading wallet failed: ${error.message}`);
  return data as Wallet | null;
}

export async function loadTransactions(db: SupabaseClient, walletId: string): Promise<Transaction[]> {
  const { data, error } = await db.from("transaction").select("*").eq("wallet_id", walletId).order("created_at", { ascending: true }).limit(5000);
  if (error) throw new Error(`Reading transactions failed: ${error.message}`);
  return (data ?? []) as Transaction[];
}

export async function loadDecisions(db: SupabaseClient, walletId: string, limit: number): Promise<AiDecision[]> {
  const { data, error } = await db.from("ai_decision").select("*").eq("wallet_id", walletId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Reading decisions failed: ${error.message}`);
  return (data ?? []) as AiDecision[];
}

export interface PricedHolding extends Holding {
  price: number | null;
  value: number;
  unrealisedPnl: number | null;
}

export async function priceHoldings(transactions: Transaction[]): Promise<PricedHolding[]> {
  const market = getMarketProvider();
  const held = [...computeHoldings(transactions).values()].filter((h) => h.quantity > 0);
  return Promise.all(
    held.map(async (h) => {
      let price: number | null = null;
      try {
        price = await market.getLatestPrice(h.asset);
      } catch {
        price = null; // show at cost, flagged in the UI
      }
      const value = price !== null ? h.quantity * price : h.costBasis;
      return { ...h, price, value, unrealisedPnl: price !== null ? value - h.costBasis : null };
    }),
  );
}
