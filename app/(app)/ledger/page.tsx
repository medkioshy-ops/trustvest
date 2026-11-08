import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyPanel } from "@/components/verify-panel";
import { dateTime, shortHash } from "@/lib/format";
import { verifyLedger } from "@/lib/ledger";
import { GENESIS_HASH } from "@/lib/ledger/hash";
import { createClient } from "@/lib/supabase/server";
import type { LedgerEntry } from "@/lib/types";

export const metadata: Metadata = { title: "Ledger · TrustVest" };

function describe(e: LedgerEntry) {
  const p = e.payload as {
    decision?: { action: string; asset: string };
    transaction?: { type: string; asset: string; amount: number; status: string } | null;
  };
  if (e.kind === "decision" && p.decision) return `${p.decision.action.toUpperCase()} ${p.decision.asset}`;
  if (p.transaction) return `${p.transaction.type} ${p.transaction.asset} · ${p.transaction.amount} · ${p.transaction.status}`;
  return "—";
}

export default async function LedgerPage() {
  const db = await createClient();
  const [verification, { data, error }] = await Promise.all([
    verifyLedger(db).catch((e: Error) => ({ error: e.message })),
    db.from("ledger_entry").select("*").order("seq", { ascending: false }).limit(200),
  ]);
  if (error) throw new Error(error.message);
  const entries = (data ?? []) as LedgerEntry[];
  const flagged = new Set("problems" in verification ? verification.problems.map((p) => p.seq).filter((s) => s !== null) : []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hash-chain ledger</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Each entry stores a snapshot of a decision, deposit or trade settlement plus the SHA-256 hash of the previous entry. Changing,
          removing or reordering any record breaks the chain, and verification points to exactly where.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integrity check</CardTitle>
        </CardHeader>
        <CardContent>
          <VerifyPanel initial={verification} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries (newest first{entries.length === 200 ? ", latest 200" : ""})</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">The ledger is empty. The first deposit creates the genesis-linked entry.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">#</th>
                    <th className="py-2 pr-4 font-medium">Kind</th>
                    <th className="py-2 pr-4 font-medium">Record</th>
                    <th className="py-2 pr-4 font-medium">Sealed</th>
                    <th className="py-2 pr-4 font-medium">Previous hash</th>
                    <th className="py-2 font-medium">Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.entry_id} className={`border-b last:border-0 ${flagged.has(Number(e.seq)) ? "bg-red-500/10" : ""}`}>
                      <td className="py-2.5 pr-4 font-mono text-xs">{e.seq}</td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={e.kind === "decision" ? "primary" : "neutral"}>{e.kind}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">{describe(e)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{dateTime(e.created_at)}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground" title={e.previous_hash}>
                        {e.previous_hash === GENESIS_HASH ? "genesis" : shortHash(e.previous_hash)}
                      </td>
                      <td className="py-2.5 font-mono text-xs" title={e.hash}>
                        {shortHash(e.hash)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
