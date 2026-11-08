import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Wallet } from "@/lib/types";

export async function getUserWallet(db: SupabaseClient, userId: string): Promise<Wallet | null> {
  const { data, error } = await db.from("wallet").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Reading wallet failed: ${error.message}`);
  return data as Wallet | null;
}

export async function requireUserWallet(user: User): Promise<Wallet> {
  const db = await createClient();
  const wallet = await getUserWallet(db, user.id);
  if (!wallet) throw new Error("No wallet found — complete sign-up or run `npm run seed` for admin.");
  return wallet;
}
