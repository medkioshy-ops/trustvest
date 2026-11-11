import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Wallet } from "@/lib/types";

/** Ensures the signed-in user has a wallet row (one per auth.users id) and returns it. */
export async function ensureWalletRow(userId: string): Promise<Wallet> {
  if (!userId) throw new Error("userId is required");
  const db = createAdminClient();
  const { data: wallet, error: readErr } = await db
    .from("wallet")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw new Error(`Reading wallet failed: ${readErr.message}`);
  if (wallet) return wallet as Wallet;

  const currency = (process.env.SEED_WALLET_CURRENCY || process.env.ADMIN_WALLET_CURRENCY || "USD").toUpperCase();
  const { data: created, error } = await db.from("wallet").insert({ user_id: userId, currency, balance: 0 }).select("*").single();
  if (error) throw new Error(`Creating wallet failed: ${error.message}`);
  return created as Wallet;
}
