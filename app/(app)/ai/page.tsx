// "Is the AI working?" — four independent kinds of evidence, each with its limits stated:
//   1. Backtest: the exact production engine replayed on a year of real prices vs buy-and-hold.
//   2. Live track record: did the price move the way each real BUY/SELL bet it would?
//   3. Consistency: does every stored decision follow from its own stored inputs?
//   4. Behaviour over time: are the scores reacting to the market, crossing the lines as designed?
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PerformanceChart } from "@/components/performance-chart";
import { ScoreHistoryChart, type ScorePoint } from "@/components/score-history-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { runBacktest } from "@/lib/backtest";
import { getEngineConfig, getWatchlist } from "@/lib/config";
import { loadDecisions, loadTransactions } from "@/lib/data";
import { money, pct, relative } from "@/lib/format";
import { getMarketProvider } from "@/lib/market";
import { createClient } from "@/lib/supabase/server";
import { checkConsistency, trackRecord } from "@/lib/track-record";
import type { AiDecision } from "@/lib/types";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/info-tip";
import { getUserWallet } from "@/lib/wallet-scope";

export const metadata: Metadata = { title: "Is the AI working? · TrustVest" };
export const maxDuration = 60;

const WINDOWS = { "3m": { label: "3 months", days: 91 }, "6m": { label: "6 months", days: 182 }, "1y": { label: "1 year", days: 365 } } as const;
type WindowKey = keyof typeof WINDOWS;

export default async function AiCheckPage({ searchParams }: PageProps<"/ai">) {
  const sp = await searchParams;
  const win = (typeof sp.window === "string" && sp.window in WINDOWS ? sp.window : "1y") as WindowKey;
  const user = await requireUser();
  const db = await createClient();
  const wallet = await getUserWallet(db, user.id);
  if (!wallet) return <p className="text-sm text-muted-foreground">No wallet yet — open the dashboard to finish setup.</p>;

  const [decisions, transactions] = await Promise.all([loadDecisions(db, wallet.wallet_id, 500), loadTransactions(db, wallet.wallet_id)]);
  const executed = new Set(transactions.filter((t) => t.status === "released").map((t) => t.transaction_id));
  const executedCalls = decisions.filter((d) => d.transaction_id && executed.has(d.transaction_id));
  const consistency = checkConsistency(decisions);
  const cfg = getEngineConfig();
  const watchlist = getWatchlist();

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Is the AI working?</h1>
        <p className="text-sm text-muted-foreground">
          Two questions: does the AI follow its own rules every time, and do those rules actually do better than simply buying and holding?
          Below, the AI is tested on real past prices, checked against your live trades, and every decision is re-checked. Hover the{" "}
          <span className="font-medium text-foreground">?</span> icons for plain-English explanations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            1 · Practice run on real past prices <InfoTip term="backtest" />
          </CardTitle>
          <nav className="flex gap-1" aria-label="Backtest window">
            {(Object.keys(WINDOWS) as WindowKey[]).map((k) => (
              <Link
                key={k}
                href={`/ai?window=${k}`}
                scroll={false}
                aria-current={k === win ? "true" : undefined}
                className={cn("rounded-md px-2.5 py-1 text-xs", k === win ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {WINDOWS[k].label}
              </Link>
            ))}
          </nav>
        </CardHeader>
        <CardContent>
          <Suspense key={win} fallback={<div className="h-80 animate-pulse rounded-lg bg-muted/40" />}>
            <Backtest days={WINDOWS[win].days} label={WINDOWS[win].label} />
          </Suspense>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>2 · How its real (paper) trades turned out</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted/40" />}>
              <TrackRecord calls={executedCalls} />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              3 · Does every decision follow its own rules? <InfoTip term="score" align="right" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {consistency.checked === 0 ? (
              <p className="text-muted-foreground">No decisions yet — press &ldquo;Run the AI now&rdquo; on the dashboard.</p>
            ) : (
              <>
                <p className="text-3xl font-semibold tabular-nums">
                  {consistency.consistent} / {consistency.checked}
                  <span className="ml-2 align-middle">
                    <Badge tone={consistency.problems.length ? "bad" : "good"}>{consistency.problems.length ? "inconsistent" : "all consistent"}</Badge>
                  </span>
                </p>
                <p className="text-muted-foreground">
                  For each stored decision, the score is recomputed from its stored momentum and news inputs ({cfg.weights.momentum} × momentum +{" "}
                  {cfg.weights.sentiment} × news) and the action is checked against the rules: buy at or above {cfg.thresholds.buy}, sell at or
                  below {cfg.thresholds.sell} only when holding, otherwise hold. Risk rules (30% cap, minimum order, open order) may turn a buy into a
                  hold, never the reverse.
                </p>
                {consistency.problems.length > 0 && (
                  <ul className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                    {consistency.problems.slice(0, 8).map((p) => (
                      <li key={p.decision_id}>
                        <span className="font-medium">{p.asset}</span> <span className="text-muted-foreground">{p.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>4 · How the AI&rsquo;s opinion of each investment changed over time</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ScoreHistory decisions={decisions} assets={watchlist} buy={cfg.thresholds.buy} sell={cfg.thresholds.sell} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How the engine itself is tested</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground">Automated tests</span> cover every decision branch (buy, sell, hold, position cap, low cash, open order),
              VADER scoring of positive and negative headlines, and the backtest itself. They run with <code>npm test</code>.
            </li>
            <li>
              <span className="text-foreground">Deterministic:</span> the same prices and headlines always produce the same decision, so any stored
              decision can be re-derived (check 3 does this for all of yours).
            </li>
            <li>
              <span className="text-foreground">Tamper-evident:</span> each decision is sealed in your hash-chain ledger before its order is sent, so the
              reasoning cannot be rewritten after the outcome is known.
            </li>
            <li>
              <span className="text-foreground">What it is not:</span> a guarantee. A momentum strategy tends to lag at turning points and to underperform in
              choppy, sideways markets. Treat these results as evidence about this prototype, not financial advice.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

async function Backtest({ days, label }: { days: number; label: string }) {
  const market = getMarketProvider();
  const watchlist = getWatchlist();
  const { startDate, warmup } = backtestWindow(days);
  const closes: Record<string, Awaited<ReturnType<typeof market.getDailyCloses>>> = {};
  const failed: string[] = [];
  await Promise.all(
    watchlist.map(async (a) => {
      try {
        closes[a] = await market.getDailyCloses(a, warmup);
      } catch {
        failed.push(a);
      }
    }),
  );
  const r = runBacktest({ closes, assets: watchlist, cfg: getEngineConfig(), start: startDate.toISOString().slice(0, 10), dataSource: market.source });
  if (!r) return <p className="text-sm text-muted-foreground">Not enough price history to run a backtest{failed.length ? ` (no data for ${failed.join(", ")})` : ""}.</p>;

  const edge = r.ai.returnPct - r.benchmark.returnPct;
  const lessPain = r.ai.maxDrawdownPct - r.benchmark.maxDrawdownPct; // both negative; positive = AI fell less
  return (
    <div className="space-y-5">
      {market.source === "simulated" && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Simulated market mode: this backtest uses generated prices, so it only shows the engine behaving as designed. Add Alpaca keys for a
          backtest on real market history.
        </p>
      )}
      <div className="grid gap-4 text-sm sm:grid-cols-4">
        <Stat label={`AI rules, ${label}`} value={pct(r.ai.returnPct)} sub={`${money(r.startCapital, "USD")} → ${money(r.ai.finalValue, "USD")}`} />
        <Stat label="If you'd just bought & held" value={pct(r.benchmark.returnPct)} sub={`→ ${money(r.benchmark.finalValue, "USD")}`} />
        <Stat
          label="Worst fall from a high (AI vs buy & hold)"
          value={`${r.ai.maxDrawdownPct.toFixed(1)}% vs ${r.benchmark.maxDrawdownPct.toFixed(1)}%`}
          sub={lessPain >= 0 ? `AI fell ${lessPain.toFixed(1)} pts less` : `AI fell ${(-lessPain).toFixed(1)} pts more`}
          tone={lessPain >= 0 ? "text-emerald-300" : "text-orange-300"}
        />
        <Stat
          label="Trades that made money"
          value={r.winRatePct === null ? "—" : `${r.winningTrades} / ${r.closedTrades}`}
          sub={`${r.trades.length} trades · avg ${r.avgInvestedPct.toFixed(0)}% invested`}
        />
      </div>
      <p className={cn("text-sm font-medium", edge >= 0 ? "text-emerald-300" : "text-orange-300")}>
        Verdict: over the last {label} the AI&rsquo;s rules {edge >= 0 ? "beat" : "trailed"} buy-and-hold by {Math.abs(edge).toFixed(2)} percentage
        points{lessPain >= 0 ? `, with a smaller worst drop` : `, with a bigger worst drop`}.
        {edge < 0 &&
          r.avgInvestedPct < 50 &&
          (r.benchmark.returnPct > 0
            ? " It kept most money in cash, which protects against falls but misses part of a rising market."
            : " It kept most money in cash, which softened the falls; its own losses came from trades that reversed soon after it bought.")}
      </p>
      <PerformanceChart points={r.points} currency="USD" labels={{ ai: "AI rules (backtest)", benchmark: "Buy & hold", cash: "Starting capital" }} />
      <p className="text-xs text-muted-foreground">
        Replays the live engine (lib/engine.ts) once per daily bar for {r.assets.join(", ")}, with the same sizing (10% of cash), 30% cap and
        thresholds, starting from {money(r.startCapital, "USD")}. Limits: historical news is not replayed, so sentiment is treated as neutral (the
        backtest tests the momentum half); fills are at the daily close with no fees. Decisions: {r.decisions.buy} buy, {r.decisions.sell} sell,{" "}
        {r.decisions.hold} hold.
        {failed.length > 0 && ` No price history for ${failed.join(", ")}.`}
      </p>
    </div>
  );
}

async function TrackRecord({ calls }: { calls: AiDecision[] }) {
  if (calls.length === 0) {
    return <p className="text-sm text-muted-foreground">No executed trades yet. After the AI buys or sells, this shows whether the price then moved its way.</p>;
  }
  const market = getMarketProvider();
  const prices: Record<string, number> = {};
  await Promise.all(
    [...new Set(calls.map((c) => c.asset))].map(async (a) => {
      try {
        prices[a] = await market.getLatestPrice(a);
      } catch {
        /* skipped below */
      }
    }),
  );
  const tr = trackRecord(calls, prices);
  const waiting = tr.calls.length - tr.judged;
  return (
    <div className="space-y-3 text-sm">
      {tr.judged === 0 ? (
        <p className="text-xl font-semibold">Too early to judge</p>
      ) : (
        <p className="text-3xl font-semibold tabular-nums">
          {tr.right} / {tr.judged}
          <span className="ml-2 text-base font-normal text-muted-foreground">calls went the AI&rsquo;s way ({tr.hitRatePct}%)</span>
        </p>
      )}
      {waiting > 0 && (
        <p className="text-muted-foreground">
          {waiting} call{waiting === 1 ? "" : "s"} still waiting for the price to move (prices update when the market trades).
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        A buy counts as right if the price has risen since; a sell if it has fallen since. With only a few trades this is noise, not proof;
        it becomes meaningful after dozens of calls over several weeks.
      </p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-1.5 pr-3 font-medium">Call</th>
            <th className="py-1.5 pr-3 text-right font-medium">Then</th>
            <th className="py-1.5 pr-3 text-right font-medium">Now</th>
            <th className="py-1.5 text-right font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {tr.calls.slice(0, 12).map((c) => (
            <tr key={c.decision_id} className="border-b last:border-0">
              <td className="py-1.5 pr-3">
                <Badge tone={c.action}>{c.action}</Badge> <span className="font-medium">{c.asset}</span>{" "}
                <span className="text-xs text-muted-foreground">{relative(c.created_at)}</span>
              </td>
              <td className="py-1.5 pr-3 text-right">{money(c.priceThen, "USD")}</td>
              <td className="py-1.5 pr-3 text-right">{money(c.priceNow, "USD")}</td>
              <td className={cn("py-1.5 text-right", c.right === null ? "text-muted-foreground" : c.right ? "text-emerald-300" : "text-orange-300")}>
                {c.movePct > 0 ? "+" : ""}
                {c.movePct.toFixed(2)}% {c.right === null ? "· waiting" : c.right ? "✓ right" : "✗ wrong"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreHistory({ decisions, assets, buy, sell }: { decisions: AiDecision[]; assets: string[]; buy: number; sell: number }) {
  // Decisions made in the same cycle share a timestamp to the minute; group them into one point.
  const byCycle = new Map<string, ScorePoint>();
  for (const d of [...decisions].reverse()) {
    const key = d.created_at.slice(0, 16);
    const p = byCycle.get(key) ?? { t: d.created_at };
    p[d.asset] = d.signal_inputs?.combined_score ?? null;
    byCycle.set(key, p);
  }
  const points = [...byCycle.values()];
  if (points.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        Needs at least two decision cycles. Each cycle adds one point per asset; the scheduler runs one every weekday.
      </p>
    );
  }
  return (
    <>
      <ScoreHistoryChart points={points} assets={assets} buy={buy} sell={sell} />
      <p className="text-xs text-muted-foreground">
        A healthy engine shows scores that move with the market and only occasionally cross a dashed line. Scores pinned at one extreme, or never
        moving, would point to a data or logic problem.
      </p>
    </>
  );
}

/** Start of the scored window and of the warm-up bars the 20-day average needs. */
function backtestWindow(days: number) {
  const startDate = new Date(Date.now() - days * 86_400_000);
  return { startDate, warmup: new Date(startDate.getTime() - 60 * 86_400_000) };
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
