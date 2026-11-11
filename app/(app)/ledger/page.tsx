import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifyPanel } from "@/components/verify-panel";
import { dateTime, money, shortHash } from "@/lib/format";
import { assetName } from "@/lib/plain-language";
import { verifyLedger } from "@/lib/ledger";
import { GENESIS_HASH } from "@/lib/ledger/hash";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getUserWallet } from "@/lib/wallet-scope";
import type { LedgerEntry } from "@/lib/types";

export const metadata: Metadata = { title: "Ledger · TrustVest" };

const KIND_LABEL = { deposit: "money in", decision: "AI decision", settlement: "trade result" } as const;
const DID = { buy: "Bought", sell: "Sold", hold: "Waited on" } as Record<string, string>;

function describe(e: LedgerEntry) {
  const p = e.payload as {
    decision?: { action: string; asset: string };
    transaction?: { type: string; asset: string; amount: number; status: string } | null;
  };
  if (e.kind === "decision" && p.decision) return `${DID[p.decision.action] ?? p.decision.action} ${assetName(p.decision.asset)}`;
  const t = p.transaction;
  if (!t) return "—";
  if (t.type === "deposit") return `Deposited ${money(t.amount, t.asset)}`;
  const verb = t.type === "buy" ? "Bought" : "Sold";
  return t.status === "failed" ? `${verb} ${assetName(t.asset)} — order failed` : `${verb} ${money(t.amount, "USD")} of ${assetName(t.asset)}`;
}

export default async function LedgerPage() {
  const user = await requireUser();
  const db = await createClient();
  const wallet = await getUserWallet(db, user.id);
  if (!wallet) return <p className="text-sm text-muted-foreground">No wallet yet — open the dashboard to finish setup.</p>;
  const [verification, { data, error }] = await Promise.all([
    verifyLedger(db, wallet.wallet_id).catch((e: Error) => ({ error: e.message })),
    db.from("ledger_entry").select("*").eq("wallet_id", wallet.wallet_id).order("seq", { ascending: false }).limit(200),
  ]);
  if (error) throw new Error(error.message);
  const entries = (data ?? []) as LedgerEntry[];
  const flagged = new Set("problems" in verification ? verification.problems.map((p) => p.seq).filter((s) => s !== null) : []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit ledger</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          A permanent, tamper-evident diary of everything that happened in your account: each deposit, each AI decision and each completed
          trade. Every record carries a digital fingerprint (a hash) of the record before it, like links in a chain. If anyone edited,
          deleted or reordered an old record, the chain would break and the check below would point to exactly where.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Has anything been changed?</CardTitle>
        </CardHeader>
        <CardContent>
          <VerifyPanel key={"checkedAt" in verification ? verification.checkedAt : verification.error} initial={verification} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries (newest first{entries.length === 200 ? ", latest 200" : ""})</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded yet. Your first deposit will be the first link in the chain.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">#</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 font-medium">What happened</th>
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Links to (previous fingerprint)</th>
                    <th className="py-2 font-medium">Fingerprint</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.entry_id} className={`border-b last:border-0 ${flagged.has(Number(e.seq)) ? "bg-red-500/10" : ""}`}>
                      <td className="py-2.5 pr-4 font-mono text-xs">{e.seq}</td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={e.kind === "decision" ? "primary" : "neutral"}>{KIND_LABEL[e.kind] ?? e.kind}</Badge>
                      </td>
                      <td className="py-2.5 pr-4">{describe(e)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">{dateTime(e.created_at)}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground" title={e.previous_hash}>
                        {e.previous_hash === GENESIS_HASH ? "start of chain" : shortHash(e.previous_hash)}
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
