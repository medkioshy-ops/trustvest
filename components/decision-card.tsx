import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge";
import { dateTime, money, relative } from "@/lib/format";
import { assetLabel, plainSummary } from "@/lib/plain-language";
import type { AiDecision, Transaction } from "@/lib/types";

const statusTone = { pending: "warn", verified: "primary", released: "good", failed: "bad" } as const;
const statusText = { pending: "waiting to fill", verified: "confirmed", released: "done", failed: "failed" } as const;
const actionText = { buy: "bought", sell: "sold", hold: "waited" } as const;

export function ActionBadge({ action }: { action: AiDecision["action"] }) {
  return <Badge tone={action}>{actionText[action]}</Badge>;
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
  const amount =
    transaction && transaction.status === "released"
      ? money(transaction.amount, currency)
      : s?.order?.notional
        ? money(s.order.notional, currency)
        : undefined;
  return (
    <article className="space-y-3">
      <header className="flex flex-wrap items-center gap-2">
        <ActionBadge action={decision.action} />
        <span className="font-semibold">{assetLabel(decision.asset)}</span>
        {decision.confidence !== null && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            signal strength {Math.round(Number(decision.confidence) * 100)}%
            <InfoTip term="confidence" label="Signal strength" />
          </span>
        )}
        {transaction && (
          <Badge tone={statusTone[transaction.status]} title={transaction.failure_reason ?? undefined}>
            {statusText[transaction.status]}
            {transaction.status === "released" ? ` · ${money(transaction.amount, currency)}` : ""}
          </Badge>
        )}
        {s?.data_source === "simulated" && <Badge tone="warn">demo data</Badge>}
        <time className="ml-auto text-xs text-muted-foreground" dateTime={decision.created_at} title={dateTime(decision.created_at)}>
          {relative(decision.created_at)}
        </time>
      </header>

      <p className="text-base leading-relaxed">{plainSummary(decision, amount)}</p>

      {transaction?.status === "failed" && transaction.failure_reason && (
        <p className="text-sm text-red-300">The order didn&rsquo;t go through: {transaction.failure_reason}</p>
      )}
      {transaction?.status === "pending" && (
        <p className="text-sm text-amber-300">The order is placed and waiting for the market to fill it (stock orders fill during US market hours).</p>
      )}

      <details className="group rounded-lg border bg-background/40 p-3 text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show the full reasoning{showInputs && s ? " and the numbers" : ""}</summary>
        <p className="mt-3 leading-relaxed text-foreground/90">{decision.reasoning}</p>
        {showInputs && s && (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-3 sm:grid-cols-4">
              <Item k="Price at the time" v={money(s.price, currency)} />
              <Item k={<>Price trend <InfoTip term="momentum" label="Price trend (momentum)" /></>} v={signedNum(s.momentum.score)} />
              <Item k="Week vs month average" v={`${s.momentum.sma_gap_pct}%`} />
              <Item k="Change over 5 days" v={`${s.momentum.return_5d_pct}%`} />
              <Item k={<>News mood <InfoTip term="sentiment" label="News mood (sentiment)" /></>} v={signedNum(s.sentiment.score)} />
              <Item k="Headlines read" v={s.sentiment.headline_count} />
              <Item k={<>Overall score <InfoTip term="score" label="Overall score" align="right" /></>} v={signedNum(s.combined_score)} />
              <Item k="Sell line / buy line" v={`${s.thresholds.sell} / ${s.thresholds.buy}`} />
            </dl>
            {s.sentiment.headlines.length > 0 && (
              <div className="mt-3 border-t pt-3">
                <p className="mb-2 text-xs text-muted-foreground">News it read (score: − bad · + good)</p>
                <ul className="space-y-1">
                  {s.sentiment.headlines.map((h, i) => (
                    <li key={i} className="flex gap-3">
                      <span
                        className={`w-14 shrink-0 font-mono text-xs ${h.compound > 0.05 ? "text-emerald-300" : h.compound < -0.05 ? "text-orange-300" : "text-muted-foreground"}`}
                      >
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
              </div>
            )}
          </>
        )}
      </details>
    </article>
  );
}

const signedNum = (n: number) => `${n > 0 ? "+" : ""}${n}`;

function Item({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">{k}</dt>
      <dd className="font-mono">{v}</dd>
    </div>
  );
}
