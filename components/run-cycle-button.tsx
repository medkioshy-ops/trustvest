"use client";
import { useState, useTransition } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runCycleAction, type CycleState } from "@/app/(app)/actions";
import { assetName } from "@/lib/plain-language";

const did = { buy: "bought", sell: "sold", hold: "waited on" } as Record<string, string>;

/** Turn the engine's execution note into words a beginner understands. */
function outcome(execution?: string) {
  if (!execution) return null;
  if (execution.startsWith("filled")) return "order completed";
  if (execution.startsWith("awaiting fill")) return "order placed — it completes when the market trades";
  if (execution.startsWith("failed")) return `order didn't go through (${execution.replace(/^failed:\s*/, "")})`;
  return execution;
}

export function RunCycleButton() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<CycleState | null>(null);

  return (
    <div className="space-y-3">
      <Button size="lg" disabled={pending} onClick={() => start(async () => setState(await runCycleAction()))}>
        <Play />
        {pending ? "The AI is checking the market…" : "Run the AI now"}
      </Button>
      {pending && <p className="text-xs text-muted-foreground">This takes about 10–20 seconds.</p>}
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          Something went wrong: {state.error}
        </p>
      )}
      {state?.report && (
        <div className="space-y-1 rounded-lg border bg-background/40 p-3 text-sm" aria-live="polite">
          <p className="font-medium">
            Done — the AI made {state.report.decisions.length} decision{state.report.decisions.length === 1 ? "" : "s"}:
          </p>
          <ul className="space-y-0.5">
            {state.report.decisions.map((d) => (
              <li key={d.asset}>
                {did[d.action] ?? d.action} <span className="font-medium">{assetName(d.asset)}</span>
                {outcome(d.execution) ? <span className="text-muted-foreground"> — {outcome(d.execution)}</span> : null}
              </li>
            ))}
            {state.report.errors.map((e, i) => (
              <li key={i} className="text-amber-300">
                Couldn&rsquo;t check {assetName(e.asset)}: {e.message}
              </li>
            ))}
          </ul>
          <p className="pt-1 text-xs text-muted-foreground">The reasons for each decision are below and in &ldquo;AI decisions&rdquo;.</p>
        </div>
      )}
    </div>
  );
}
