import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { JoinForm } from "./join-form";

export const metadata: Metadata = { title: "Join · TrustVest" };

export default function JoinPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to home
        </Link>
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Join TrustVest</h1>
          <p className="text-sm text-muted-foreground">Create an account to access the auditable AI investing dashboard.</p>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <JoinForm />
        </div>
        <p className="text-center text-xs text-muted-foreground">Paper trading research prototype — not financial advice.</p>
      </div>
    </main>
  );
}
