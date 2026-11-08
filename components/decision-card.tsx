import { Badge } from "@/components/ui/badge";
import { dateTime, money, relative } from "@/lib/format";
import type { AiDecision, Transaction } from "@/lib/types";

const statusTone = { pending: "warn", verified: "primary", released: "good", failed: "bad" } as const;

export function ActionBadge({ action }: { action: AiDecision["action"] }) {
  return <Badge tone={action}>{action}</Badge>;
}

export function DecisionCard({
  decision,
  transaction,
  currency,
  showInputs = false,
}: {
  decision: AiDecision;
  transaction?: Transaction | null;
  currency: string;
  showInputs?: boolean;
}) {
  const s = decision.signal_inputs;
  return (
    <article className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <ActionBadge action={decision.action} />
        <span className="font-semibold">{decision.asset}</span>
        {decision.confidence !== null && (
          <span className="text-xs text-muted-foreground">confidence {Math.round(Number(decision.confidence) * 100)}%</span>
        )}
        {transaction && (
          <Badge tone={statusTone[transaction.status]} title={transaction.failure_reason ?? undefined}>
            {transaction.status}
            {transaction.status === "released" ? ` · ${money(transaction.amount, currency)}` : ""}
          </Badge>
        )}
        {s?.data_source === "simulated" && <Badge tone="warn">simulated data</Badge>}
        <time className="ml-auto text-xs text-muted-foreground" dateTime={decision.created_at} title={dateTime(decision.created_at)}>
          {relative(decision.created_at)}
        </time>
      </header>
      <p className="text-sm leading-relaxed text-foreground/90">{decision.reasoning}</p>
      {transaction?.status === "failed" && transaction.failure_reason && (
        <p className="text-sm text-red-300">Execution failed: {transaction.failure_reason}</p>
      )}
      {showInputs && s && (
        <details className="rounded-lg border bg-background/40 p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Signal inputs (as stored)</summary>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <Item k="Price" v={money(s.price, currency)} />
            <Item k="Momentum score" v={s.momentum.score} />
            <Item k="5d vs 20d SMA" v={`${s.momentum.sma_gap_pct}%`} />
            <Item k="5-day return" v={`${s.momentum.return_5d_pct}%`} />
            <Item k="Sentiment score" v={s.sentiment.score} />
            <Item k="Headlines" v={s.sentiment.headline_count} />
            <Item k="Combined" v={s.combined_score} />
            <Item k="Thresholds" v={`${s.thresholds.sell} / ${s.thresholds.buy}`} />
          </dl>
          {s.sentiment.headlines.length > 0 && (
            <ul className="mt-3 space-y-1 border-t pt-3">
              {s.sentiment.headlines.map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className={`w-14 shrink-0 font-mono text-xs ${h.compound > 0.05 ? "text-emerald-300" : h.compound < -0.05 ? "text-orange-300" : "text-muted-foreground"}`}>
                    {h.compound > 0 ? "+" : ""}
                    {h.compound.toFixed(2)}
                  </span>
                  {h.url ? (
                    <a href={h.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {h.headline}
                    </a>
                  ) : (
                    <span>{h.headline}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </article>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}
