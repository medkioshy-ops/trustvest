// First-run checklist so a new user always knows the next step.
import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TutorialButton } from "@/components/tutorial";

export function GettingStarted({ hasDeposit, hasCycle, ledgerOk }: { hasDeposit: boolean; hasCycle: boolean; ledgerOk: boolean }) {
  const steps = [
    { done: hasDeposit, title: "Add practice money", body: "Type an amount (for example 10000) under “Add practice money” and press Deposit. It's pretend money — nothing real is at risk." },
    { done: hasCycle, title: "Let the AI make its first decisions", body: "Press “Run the AI now”. It checks each asset, decides buy / sell / wait, and explains why. After that it also runs by itself every weekday." },
    { done: hasCycle && ledgerOk, title: "See that nothing can be secretly changed", body: "The “Tamper check” box should say “All records untouched ✓” — every decision is locked in a tamper-evident record." },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <Card className="border-primary/40 bg-primary/5" data-tour="getting-started">
      <CardHeader>
        <div>
          <CardTitle className="text-base text-foreground">Getting started — 3 quick steps</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">New to investing apps? Follow these, or take the 1-minute guided tour.</p>
        </div>
        <TutorialButton variant="primary" />
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className={`rounded-lg border p-3 ${i === next ? "border-primary bg-background/60" : "bg-background/30"}`}>
              <p className="flex items-center gap-2 text-sm font-medium">
                {s.done ? <CheckCircle2 className="size-4 text-primary" aria-label="done" /> : <Circle className="size-4 text-muted-foreground" aria-label="to do" />}
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        {next === -1 && (
          <p className="mt-3 text-sm">
            All set. Next, see{" "}
            <Link href="/ai" className="text-primary hover:underline">
              whether the AI is actually any good →
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
