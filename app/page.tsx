import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { DecisionCard } from "@/components/decision-card";
import { DepositForm } from "@/components/deposit-form";
import { PerformanceChart } from "@/components/performance-chart";
import { RunCycleButton } from "@/components/run-cycle-button";
import { VerifyPanel } from "@/components/verify-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWatchlist } from "@/lib/config";
import { loadDecisions, loadTransactions, loadWallet, priceHoldings } from "@/lib/data";
import { money, pct, qty, signedMoney } from "@/lib/format";
import { verifyLedger } from "@/lib/ledger";
import { getMarketProvider } from "@/lib/market";
import { computePerformance, PERIODS, type PeriodKey } from "@/lib/performance";
import { createClient } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

// The dashboard sits at app/page.tsx (not inside the (app) group) and wraps itself in the shell.
export default function Page(props: PageProps<"/">) {
  return (
    <AppShell>
      <DashboardPage {...props} />
    </AppShell>
  );
}

async function DashboardPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const period = (typeof sp.period === "string" && sp.period in PERIODS ? sp.period : "1m") as PeriodKey;

  const db = await createClient();
  const wallet = await loadWallet(db);
  if (!wallet) return <SetupNeeded />;

  const [transactions, decisions, verification] = await Promise.all([
    loadTransactions(db),
    loadDecisions(db, 6),
    verifyLedger(db).catch((e: Error) => ({ error: e.message })),
  ]);
  const holdings = await priceHoldings(transactions);
  const holdingsValue = holdings.reduce((s, h) => s + h.value, 0);
  const total = Number(wallet.balance) + holdingsValue;
  const reserved = transactions.filter((t) => t.status === "pending" && t.type === "buy").reduce((s, t) => s + Number(t.amount), 0);
  const txById = new Map(transactions.map((t) => [t.transaction_id, t]));
  const [latest, ...recent] = decisions;
  const cur = wallet.currency;

  return (
    <div className="space-y-6">
      <div className="grid items-start gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Portfolio value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{money(total, cur)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {money(holdingsValue, cur)} invested · {holdings.length} holding{holdings.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Wallet cash</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{money(wallet.balance, cur)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {reserved > 0 ? `${money(reserved, cur)} reserved for open orders` : "No open orders"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ledger integrity</CardTitle>
          </CardHeader>
          <CardContent>
            <VerifyPanel initial={verification} compact />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Latest AI decision</CardTitle>
            <Link href="/decisions" className="text-sm text-primary hover:underline">
              Full decision log →
            </Link>
          </CardHeader>
          <CardContent>
            {latest ? (
              <DecisionCard decision={latest} transaction={latest.transaction_id ? txById.get(latest.transaction_id) : null} currency={cur} showInputs />
            ) : (
              <p className="text-sm text-muted-foreground">No decisions yet. Deposit funds, then run a decision cycle.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Watching {getWatchlist().join(", ")}. The scheduler also runs a cycle every weekday at market open.</p>
              <RunCycleButton />
            </div>
            <DepositForm currency={cur} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          {holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">The AI holds no assets yet — everything is in cash.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">Asset</th>
                    <th className="py-2 pr-4 text-right font-medium">Quantity</th>
                    <th className="py-2 pr-4 text-right font-medium">Avg cost</th>
                    <th className="py-2 pr-4 text-right font-medium">Price</th>
                    <th className="py-2 pr-4 text-right font-medium">Value</th>
                    <th className="py-2 text-right font-medium">Unrealised P/L</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {holdings.map((h) => (
                    <tr key={h.asset} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{h.asset}</td>
                      <td className="py-2.5 pr-4 text-right">{qty(h.quantity)}</td>
                      <td className="py-2.5 pr-4 text-right">{money(h.avgCost, cur)}</td>
                      <td className="py-2.5 pr-4 text-right">{h.price !== null ? money(h.price, cur) : <span className="text-amber-300">unavailable</span>}</td>
                      <td className="py-2.5 pr-4 text-right">{money(h.value, cur)}</td>
                      <td className={cn("py-2.5 text-right", h.unrealisedPnl === null || Math.abs(h.unrealisedPnl) < 0.005 ? "" : h.unrealisedPnl > 0 ? "text-emerald-300" : "text-orange-300")}>
                        {h.unrealisedPnl === null ? "—" : signedMoney(h.unrealisedPnl, cur)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Performance vs buy-and-hold</CardTitle>
          <nav className="flex gap-1" aria-label="Period">
            {(Object.keys(PERIODS) as PeriodKey[]).map((k) => (
              <Link
                key={k}
                href={`/?period=${k}`}
                scroll={false}
                aria-current={k === period ? "true" : undefined}
                className={cn("rounded-md px-2.5 py-1 text-xs", k === period ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {PERIODS[k].label}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent>
          <Suspense key={period} fallback={<div className="h-72 animate-pulse rounded-lg bg-muted/40" />}>
            <Performance transactions={transactions} period={period} currency={cur} />
          </Suspense>
        </CardContent>
      </Card>

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Earlier decisions</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {recent.map((d) => (
              <div key={d.decision_id} className="py-4 first:pt-0 last:pb-0">
                <DecisionCard decision={d} transaction={d.transaction_id ? txById.get(d.transaction_id) : null} currency={cur} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function Performance({ transactions, period, currency }: { transactions: Transaction[]; period: PeriodKey; currency: string }) {
  const watchlist = getWatchlist();
  const traded = transactions.filter((t) => t.type !== "deposit").map((t) => t.asset);
  const assets = Array.from(new Set([...watchlist, ...traded]));
  const now = new Date();
  const start = new Date(now.getTime() - PERIODS[period].days * 86_400_000);
  const market = getMarketProvider();

  const closes: Record<string, Awaited<ReturnType<typeof market.getDailyCloses>>> = {};
  const latestPrices: Record<string, number> = {};
  const failed: string[] = [];
  await Promise.all(
    assets.map(async (a) => {
      try {
        // A few extra days so weekends at the start of the period can be forward-filled.
        closes[a] = await market.getDailyCloses(a, new Date(start.getTime() - 7 * 86_400_000));
        latestPrices[a] = await market.getLatestPrice(a);
      } catch {
        failed.push(a);
      }
    }),
  );

  const perf = computePerformance({ transactions, closes, benchmarkAssets: watchlist.filter((a) => !failed.includes(a)), start, now, latestPrices });
  if (perf.points.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough history yet — the chart appears after the wallet has existed for at least a day.</p>;
  }
  const diff = (perf.aiReturnPct ?? 0) - (perf.benchmarkReturnPct ?? 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Stat label="TrustVest AI" value={pct(perf.aiReturnPct)} />
        <Stat label="Buy & hold (equal-weight watchlist)" value={pct(perf.benchmarkReturnPct)} />
        <Stat label="AI vs benchmark" value={`${diff >= 0 ? "+" : ""}${diff.toFixed(2)} pts`} tone={diff >= 0 ? "text-emerald-300" : "text-orange-300"} />
      </div>
      <PerformanceChart points={perf.points} currency={currency} />
      <p className="text-xs text-muted-foreground">
        Returns are on {money(perf.contributed, currency)} contributed (value at the start of the period plus later deposits). The benchmark
        receives the same deposits on the same days, split equally across the watchlist and never traded.
        {failed.length > 0 && ` Price history unavailable for ${failed.join(", ")}.`}
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function SetupNeeded() {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Almost there</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>You are signed in, but the database has no wallet yet.</p>
        <p className="text-muted-foreground">
          Run <code className="rounded bg-muted px-1.5 py-0.5">npm run seed</code> once to create the wallet, then reload.
        </p>
      </CardContent>
    </Card>
  );
}
