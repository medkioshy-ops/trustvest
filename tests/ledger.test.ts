import { describe, expect, it } from "vitest";
import { GENESIS_HASH, canonicalJson, computeEntryHash, verifyChain, type ChainEntry } from "@/lib/ledger/hash";

function buildChain(payloads: unknown[]): ChainEntry[] {
  let prev = GENESIS_HASH;
  return payloads.map((payload, i) => {
    const created_at = new Date(Date.UTC(2026, 9, 25, 10, i)).toISOString();
    const hash = computeEntryHash(prev, payload, created_at);
    const e = { seq: i + 1, entry_id: `e${i + 1}`, previous_hash: prev, payload, hash, created_at };
    prev = hash;
    return e;
  });
}

describe("canonicalJson", () => {
  it("is independent of key order (jsonb reorders keys)", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: "x" } })).toBe(canonicalJson({ a: { c: "x", d: [1, 2] }, b: 1 }));
  });
  it("drops undefined like JSON.stringify", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
  it("rejects NaN", () => {
    expect(() => canonicalJson({ a: NaN })).toThrow();
  });
});

describe("hash chain", () => {
  const chain = buildChain([{ kind: "deposit", amount: 1000 }, { kind: "decision", action: "buy" }, { kind: "settlement", qty: 0.5 }]);

  it("verifies an untouched chain", () => {
    expect(verifyChain(chain)).toEqual([]);
  });

  it("treats Postgres timestamp formatting as the same instant", () => {
    const pgStyle = chain.map((e) => ({ ...e, created_at: e.created_at.replace("Z", "+00:00") }));
    expect(verifyChain(pgStyle)).toEqual([]);
  });

  it("locates an edited payload", () => {
    const tampered = chain.map((e) => (e.seq === 2 ? { ...e, payload: { kind: "decision", action: "sell" } } : e));
    const problems = verifyChain(tampered);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ seq: 2, problem: "hash_mismatch" });
  });

  it("detects a deleted middle entry", () => {
    const problems = verifyChain([chain[0], chain[2]]);
    expect(problems).toEqual([expect.objectContaining({ seq: 3, problem: "broken_link" })]);
  });

  it("detects reordering", () => {
    expect(verifyChain([chain[1], chain[0], chain[2]]).length).toBeGreaterThan(0);
  });

  it("detects a recomputed hash on an edited entry via the next link", () => {
    const e2 = { ...chain[1], payload: { kind: "decision", action: "sell" } };
    e2.hash = computeEntryHash(e2.previous_hash, e2.payload, e2.created_at);
    const problems = verifyChain([chain[0], e2, chain[2]]);
    expect(problems).toEqual([expect.objectContaining({ seq: 3, problem: "broken_link" })]);
  });
});
