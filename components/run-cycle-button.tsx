"use client";
import { useState, useTransition } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runCycleAction, type CycleState } from "@/app/(app)/actions";

export function RunCycleButton() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<CycleState | null>(null);

  return (
    <div className="space-y-3">
      <Button size="lg" disabled={pending} onClick={() => start(async () => setState(await runCycleAction()))}>
        <Play />
        {pending ? "Running decision cycle…" : "Run decision cycle now"}
      </Button>
      {state?.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      {state?.report && (
        <div className="space-y-1 text-sm" aria-live="polite">
          <p className="text-muted-foreground">
            {state.report.decisions.length} decision{state.report.decisions.length === 1 ? "" : "s"} recorded
            {state.report.reconciled.length ? ` · ${state.report.reconciled.length} open order(s) checked` : ""}
          </p>
          <ul className="space-y-0.5">
            {state.report.decisions.map((d) => (
              <li key={d.asset}>
                <span className="font-medium">{d.asset}</span>: {d.action.toUpperCase()}
                {d.execution ? <span className="text-muted-foreground"> — {d.execution}</span> : null}
              </li>
            ))}
            {state.report.errors.map((e, i) => (
              <li key={i} className="text-amber-300">
                {e.asset}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
