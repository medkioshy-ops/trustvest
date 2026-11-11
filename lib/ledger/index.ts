// FR7 / FR8 — append to and verify the hash-chain ledger.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiDecision, LedgerEntry, LedgerKind, Transaction } from "../types";
import {
  GENESIS_HASH,
  canonicalJson,
  canonicalTimestamp,
  computeEntryHash,
  normalisePayload,
  verifyChain,
  type ChainProblem,
} from "./hash";

// ---------------------------------------------------------------------------
// Snapshots — exactly what gets frozen into a ledger payload
// ---------------------------------------------------------------------------
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function snapshotTransaction(t: Transaction) {
  return {
    transaction_id: t.transaction_id,
    wallet_id: t.wallet_id,
    type: t.type,
    asset: t.asset,
    amount: n(t.amount),
    status: t.status,
    quantity: n(t.quantity),
    price: n(t.price),
    broker_order_id: t.broker_order_id,
    failure_reason: t.failure_reason,
    created_at: canonicalTimestamp(t.created_at),
  };
}

export function snapshotDecision(d: AiDecision) {
  return {
    decision_id: d.decision_id,
    wallet_id: d.wallet_id,
    transaction_id: d.transaction_id,
    asset: d.asset,
    action: d.action,
    confidence: n(d.confidence),
    reasoning: d.reasoning,
    signal_inputs: d.signal_inputs,
    created_at: canonicalTimestamp(d.created_at),
  };
}

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------
export async function appendLedgerEntry(
  db: SupabaseClient,
  entry: {
    walletId: string;
    kind: LedgerKind;
    transaction_id?: string;
    decision_id?: string;
    payload: Record<string, unknown>;
  },
): Promise<LedgerEntry> {
  const payload = normalisePayload(entry.payload);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: head, error: headErr } = await db
      .from("ledger_entry")
      .select("hash")
      .eq("wallet_id", entry.walletId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (headErr) throw new Error(`Reading ledger head failed: ${headErr.message}`);

    const previous_hash = head?.hash ?? GENESIS_HASH;
    const created_at = new Date().toISOString();
    const hash = computeEntryHash(previous_hash, payload, created_at);

    const { data, error } = await db
      .from("ledger_entry")
      .insert({
        wallet_id: entry.walletId,
        kind: entry.kind,
        transaction_id: entry.transaction_id ?? null,
        decision_id: entry.decision_id ?? null,
        previous_hash,
        payload,
        hash,
        created_at,
      })
      .select()
      .single();
    if (!error) return data as LedgerEntry;
    // 23505 on (wallet_id, previous_hash): another writer appended to this wallet's chain first —
    // re-read the head and retry.
    if (error.code === "23505" && /previous_hash|wallet_prev/.test(error.message)) continue;
    throw new Error(`Ledger append failed: ${error.message}`);
  }
  throw new Error("Ledger append failed after 5 attempts (heavy contention)");
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------
export interface LedgerProblem {
  seq: number | null;
  entry_id: string | null;
  problem: ChainProblem["problem"] | "record_mismatch" | "missing_entry";
  detail: string;
}

export interface VerificationResult {
  ok: boolean;
  checkedAt: string;
  entryCount: number;
  headHash: string | null;
  problems: LedgerProblem[];
}

async function fetchAll<T>(db: SupabaseClient, table: string, order: string, walletId: string): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("wallet_id", walletId)
      .order(order, { ascending: true })
      .range(from, from + page - 1);
    if (error) throw new Error(`Reading ${table} failed: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) return out;
  }
}

/**
 * 1. Chain check — recompute every hash and link (catches edits to the ledger itself).
 * 2. Record check — compare each frozen snapshot with the live decision/transaction row
 *    (catches someone editing the source tables while leaving the ledger alone).
 * 3. Coverage check — every decision and every finished transaction must have an entry (NFR4).
 */
/** Verifies ONE wallet's chain. Each wallet has its own genesis-linked chain. */
export async function verifyLedger(db: SupabaseClient, walletId: string): Promise<VerificationResult> {
  const [entries, decisions, transactions] = await Promise.all([
    fetchAll<LedgerEntry>(db, "ledger_entry", "seq", walletId),
    fetchAll<AiDecision>(db, "ai_decision", "created_at", walletId),
    fetchAll<Transaction>(db, "transaction", "created_at", walletId),
  ]);

  const problems: LedgerProblem[] = verifyChain(entries.map((e) => ({ ...e, seq: Number(e.seq) })));

  const decisionById = new Map(decisions.map((d) => [d.decision_id, d]));
  const txById = new Map(transactions.map((t) => [t.transaction_id, t]));
  const decisionsInLedger = new Set<string>();
  const txInLedger = new Set<string>();

  for (const e of entries) {
    const seq = Number(e.seq);
    if (e.decision_id) {
      decisionsInLedger.add(e.decision_id);
      const live = decisionById.get(e.decision_id);
      const frozen = (e.payload as { decision?: unknown }).decision;
      if (!live) {
        problems.push({ seq, entry_id: e.entry_id, problem: "record_mismatch", detail: `decision ${e.decision_id} no longer exists` });
      } else if (canonicalJson(snapshotDecision(live)) !== canonicalJson(frozen)) {
        problems.push({
          seq,
          entry_id: e.entry_id,
          problem: "record_mismatch",
          detail: `ai_decision ${short(e.decision_id)} (${live.asset}) differs from the version sealed in the ledger: ${diffKeys(snapshotDecision(live), frozen)}`,
        });
      }
    }
    if (e.transaction_id) {
      txInLedger.add(e.transaction_id);
      const live = txById.get(e.transaction_id);
      const frozen = (e.payload as { transaction?: unknown }).transaction;
      if (!live) {
        problems.push({ seq, entry_id: e.entry_id, problem: "record_mismatch", detail: `transaction ${e.transaction_id} no longer exists` });
      } else if (canonicalJson(snapshotTransaction(live)) !== canonicalJson(frozen)) {
        problems.push({
          seq,
          entry_id: e.entry_id,
          problem: "record_mismatch",
          detail: `transaction ${short(e.transaction_id)} (${live.type} ${live.asset}) differs from the version sealed in the ledger: ${diffKeys(snapshotTransaction(live), frozen)}`,
        });
      }
    }
  }

  for (const d of decisions) {
    if (!decisionsInLedger.has(d.decision_id)) {
      problems.push({ seq: null, entry_id: null, problem: "missing_entry", detail: `decision ${short(d.decision_id)} (${d.action} ${d.asset}) has no ledger entry` });
    }
  }
  for (const t of transactions) {
    const finished = t.status === "released" || t.status === "failed";
    if (finished && !txInLedger.has(t.transaction_id)) {
      problems.push({ seq: null, entry_id: null, problem: "missing_entry", detail: `${t.status} transaction ${short(t.transaction_id)} (${t.type} ${t.asset}) has no ledger entry` });
    }
  }

  return {
    ok: problems.length === 0,
    checkedAt: new Date().toISOString(),
    entryCount: entries.length,
    headHash: entries.length ? entries[entries.length - 1].hash : null,
    problems: problems.sort((a, b) => (a.seq ?? Infinity) - (b.seq ?? Infinity)),
  };
}

function diffKeys(live: Record<string, unknown>, frozen: unknown): string {
  if (!frozen || typeof frozen !== "object") return "snapshot missing";
  const f = frozen as Record<string, unknown>;
  const keys = Object.keys(live).filter((k) => canonicalJson(live[k]) !== canonicalJson(f[k]));
  return keys.length ? `changed field(s): ${keys.join(", ")}` : "structure changed";
}

const short = (id: string) => id.slice(0, 8);
