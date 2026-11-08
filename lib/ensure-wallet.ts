import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Ensures the signed-in user has a wallet row (one per auth.users id). */
export async function ensureWalletRow(userId: string): Promise<void> {
  if (!userId) throw new Error("userId is required");
  const db = createAdminClient();
  const { data: wallet, error: readErr } = await db
    .from("wallet")
    .select("wallet_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw new Error(`Reading wallet failed: ${readErr.message}`);
  if (wallet) return;

  const currency = (process.env.SEED_WALLET_CURRENCY || process.env.ADMIN_WALLET_CURRENCY || "USD").toUpperCase();
  const { error } = await db.from("wallet").insert({ user_id: userId, currency, balance: 0 });
  if (error) throw new Error(`Creating wallet failed: ${error.message}`);
}
