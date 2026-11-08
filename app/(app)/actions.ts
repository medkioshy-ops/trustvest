"use server";
import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { runCycle, type CycleReport } from "@/lib/cycle";
import { appendLedgerEntry, snapshotTransaction, verifyLedger, type VerificationResult } from "@/lib/ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";

export type CycleState = { report?: CycleReport; error?: string };

export async function runCycleAction(): Promise<CycleState> {
  await requireUser();
  try {
    const report = await runCycle(createAdminClient());
    refresh();
    return { report };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export type DepositState = { ok?: string; error?: string };

export async function depositAction(_prev: DepositState, formData: FormData): Promise<DepositState> {
  await requireUser();
  const amount = Number(String(formData.get("amount") ?? "").replace(/[, ]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter an amount greater than 0." };
  if (amount > 1_000_000) return { error: "Maximum single deposit is 1,000,000." };
  if (Math.round(amount * 100) !== amount * 100) return { error: "Use at most 2 decimal places." };

  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("make_deposit", { p_amount: amount });
    if (error) return { error: error.message };
    const tx = data as Transaction;
    await appendLedgerEntry(db, {
      kind: "deposit",
      transaction_id: tx.transaction_id,
      payload: { kind: "deposit", transaction: snapshotTransaction(tx) },
    });
    refresh();
    return { ok: `Deposited ${amount.toFixed(2)} ${tx.asset}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function verifyLedgerAction(): Promise<VerificationResult | { error: string }> {
  await requireUser();
  try {
    // Read-only check, run with the user's own (RLS read-only) session.
    return await verifyLedger(await createClient());
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
