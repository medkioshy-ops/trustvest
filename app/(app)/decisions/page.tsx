import type { Metadata } from "next";
import Link from "next/link";
import { DecisionCard } from "@/components/decision-card";
import { Card, CardContent } from "@/components/ui/card";
import { loadDecisions, loadTransactions, loadWallet } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Decision log · TrustVest" };

const FILTERS = ["all", "buy", "sell", "hold"] as const;

export default async function DecisionsPage({ searchParams }: PageProps<"/decisions">) {
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f === sp.action) ?? "all";
  const db = await createClient();
  const [wallet, decisions, transactions] = await Promise.all([loadWallet(db), loadDecisions(db, 300), loadTransactions(db)]);
  const txById = new Map(transactions.map((t) => [t.transaction_id, t]));
  const shown = filter === "all" ? decisions : decisions.filter((d) => d.action === filter);
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? decisions.length : decisions.filter((d) => d.action === f).length]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Decision log</h1>
          <p className="text-sm text-muted-foreground">Every decision the engine made, with the reason and the exact inputs it used.</p>
        </div>
        <nav className="flex gap-1" aria-label="Filter by action">
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={f === "all" ? "/decisions" : `/decisions?action=${f}`}
              aria-current={f === filter ? "true" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm capitalize", f === filter ? "bg-muted" : "text-muted-foreground hover:text-foreground")}
            >
              {f} <span className="text-xs text-muted-foreground">{counts[f]}</span>
            </Link>
          ))}
        </nav>
      </div>
      <Card>
        <CardContent className="divide-y pt-5">
          {shown.length === 0 && <p className="text-sm text-muted-foreground">No decisions to show.</p>}
          {shown.map((d) => (
            <div key={d.decision_id} className="py-5 first:pt-0 last:pb-0">
              <DecisionCard
                decision={d}
                transaction={d.transaction_id ? txById.get(d.transaction_id) : null}
                currency={wallet?.currency ?? "USD"}
                showInputs
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
