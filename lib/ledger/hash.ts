import { createHash } from "node:crypto";

/** previous_hash of the very first ledger entry (fixed seed, Phase 3 Table 3). */
export const GENESIS_HASH = "0".repeat(64);

/**
 * Deterministic JSON: object keys sorted, undefined dropped.
 * Needed because Postgres jsonb does not preserve key order, so the payload read
 * back from the database must serialise to exactly the same string that was hashed.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error("Ledger payloads cannot contain NaN or Infinity");
    }
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/** Round-trip through JSON so the stored payload equals what is hashed (dates → strings, undefined removed). */
export function normalisePayload<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload)) as T;
}

/** Timestamps are hashed in one canonical form regardless of how Postgres formats them. */
export function canonicalTimestamp(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid timestamp: ${ts}`);
  return d.toISOString();
}

/** hash = SHA-256(previous_hash | canonical(payload) | created_at) */
export function computeEntryHash(previousHash: string, payload: unknown, createdAt: string): string {
  return createHash("sha256")
    .update(`${previousHash}|${canonicalJson(payload)}|${canonicalTimestamp(createdAt)}`)
    .digest("hex");
}

export interface ChainEntry {
  seq: number;
  entry_id: string;
  previous_hash: string;
  payload: unknown;
  hash: string;
  created_at: string;
}

export interface ChainProblem {
  seq: number;
  entry_id: string;
  problem: "hash_mismatch" | "broken_link";
  detail: string;
}

/**
 * Walk the chain in seq order and report every entry whose stored hash does not
 * match a fresh computation, or whose previous_hash does not point at the entry before it.
 * Catches edits, insertions, deletions and reordering of any entry except deletion of the newest.
 */
export function verifyChain(entries: ChainEntry[]): ChainProblem[] {
  const problems: ChainProblem[] = [];
  let expectedPrev = GENESIS_HASH;
  for (const e of entries) {
    if (e.previous_hash !== expectedPrev) {
      problems.push({
        seq: e.seq,
        entry_id: e.entry_id,
        problem: "broken_link",
        detail: `previous_hash ${short(e.previous_hash)} does not match the preceding entry's hash ${short(expectedPrev)}`,
      });
    }
    const recomputed = computeEntryHash(e.previous_hash, e.payload, e.created_at);
    if (recomputed !== e.hash) {
      problems.push({
        seq: e.seq,
        entry_id: e.entry_id,
        problem: "hash_mismatch",
        detail: `stored hash ${short(e.hash)} ≠ recomputed ${short(recomputed)} — payload or timestamp was altered`,
      });
    }
    expectedPrev = e.hash;
  }
  return problems;
}

function short(h: string) {
  return h.length > 12 ? `${h.slice(0, 12)}…` : h;
}
