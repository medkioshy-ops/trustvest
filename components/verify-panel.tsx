"use client";
import { useState, useTransition } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyLedgerAction } from "@/app/(app)/actions";
import type { VerificationResult } from "@/lib/ledger";
import { shortHash } from "@/lib/format";

type Result = VerificationResult | { error: string };

export function VerifyPanel({ initial, compact = false }: { initial: Result; compact?: boolean }) {
  const [result, setResult] = useState<Result>(initial);
  const [pending, start] = useTransition();

  const rerun = (
    <Button variant="outline" size={compact ? "sm" : "lg"} disabled={pending} onClick={() => start(async () => setResult(await verifyLedgerAction()))}>
      {pending ? "Checking…" : "Check again"}
    </Button>
  );

  if ("error" in result) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Verification could not run: {result.error}</p>
        {rerun}
      </div>
    );
  }

  const time = new Date(result.checkedAt).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // Fixed zone so the server-rendered and hydrated text match.
    timeZone: process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE || "Africa/Johannesburg",
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {result.ok ? <ShieldCheck className="size-7 shrink-0 text-primary" /> : <ShieldAlert className="size-7 shrink-0 text-red-400" />}
        <div>
          <p className={`text-lg font-semibold ${result.ok ? "" : "text-red-300"}`}>
            {result.ok ? "All records untouched ✓" : `Tampering detected — ${result.problems.length} problem${result.problems.length === 1 ? "" : "s"}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {result.entryCount} record{result.entryCount === 1 ? "" : "s"} checked at {time}
            {!compact && result.headHash ? ` · head ${shortHash(result.headHash)}` : ""}
          </p>
        </div>
      </div>
      {!result.ok && (
        <ul className="space-y-1.5 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm">
          {result.problems.slice(0, compact ? 3 : 50).map((p, i) => (
            <li key={i}>
              <span className="font-mono text-xs text-red-300">{p.seq !== null ? `#${p.seq}` : "—"} {p.problem}</span>{" "}
              <span className="text-muted-foreground">{p.detail}</span>
            </li>
          ))}
          {compact && result.problems.length > 3 && <li className="text-muted-foreground">…see the Ledger page for all problems</li>}
        </ul>
      )}
      {rerun}
    </div>
  );
}
