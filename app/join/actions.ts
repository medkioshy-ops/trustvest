"use server";

import { redirect } from "next/navigation";
import { ensureWalletRow } from "@/lib/ensure-wallet";
import { createClient } from "@/lib/supabase/server";

export type JoinState = { error?: string; email?: string; confirmEmail?: boolean };

export async function signUp(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };
  if (password.length < 10) return { error: "Password must be at least 10 characters.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return { error: error.message === "User already registered" ? "An account with this email already exists — try signing in." : "Could not create your account. Try again or use Google.", email };
  }

  if (!data.session) {
    return {
      confirmEmail: true,
      email,
      error: undefined,
    };
  }

  const userId = data.user?.id;
  if (!userId) return { error: "Account created but user id missing — try signing in.", email };

  try {
    await ensureWalletRow(userId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Wallet setup failed";
    return { error: message, email };
  }

  redirect("/dashboard");
}
