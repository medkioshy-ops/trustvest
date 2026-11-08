import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · TrustVest" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">TrustVest</h1>
          <p className="text-sm text-muted-foreground">
            Automated investing where every decision is explained and sealed in a tamper-evident ledger.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <LoginForm />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Single-user research prototype · paper trading only
        </p>
      </div>
    </main>
  );
}
