import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, LineChart, ShieldCheck, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "TrustVest — transparent AI investing",
  description: "Automated investing where every decision is explained and sealed in a tamper-evident ledger.",
};

const FEATURES = [
  {
    icon: Sparkles,
    title: "Explainable AI cycles",
    body: "Momentum, sentiment, and risk rules drive each buy, sell, or hold — with the reasoning visible on every decision card.",
  },
  {
    icon: ShieldCheck,
    title: "Tamper-evident ledger",
    body: "Deposits, trades, and AI outputs are chained with cryptographic hashes so you can verify nothing was altered.",
  },
  {
    icon: LineChart,
    title: "Paper trading ready",
    body: "Connect Alpaca paper keys for live quotes, or run in simulated mode while you explore the engine.",
  },
  {
    icon: BookOpen,
    title: "Full audit trail",
    body: "Browse the decision log and ledger anytime — built for trust, not black-box automation.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            TrustVest
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Sign in
            </Link>
            <Link href="/join" className={cn(buttonVariants({ size: "sm" }))}>
              Join
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6 sm:py-24">
        <section className="mx-auto max-w-3xl space-y-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
            Research prototype · paper trading only
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            AI investing you can actually audit
          </h1>
          <p className="text-lg text-muted-foreground text-pretty">
            TrustVest automates watchlist trading with clear explanations and a hash-linked ledger — so every deposit,
            trade, and model decision stays accountable.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/join" className={cn(buttonVariants({ size: "lg" }))}>
              Join TrustVest
            </Link>
            <Link href="/login" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
              I already have an account
            </Link>
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Icon className="size-5" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-base">{title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="mt-16">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
              <div className="space-y-1">
                <p className="text-lg font-semibold">Ready to explore the dashboard?</p>
                <p className="text-sm text-muted-foreground">Create an account in under a minute — email or Google.</p>
              </div>
              <Link href="/join" className={cn(buttonVariants({ size: "lg" }))}>
                Get started
              </Link>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-8">
        <p className="mx-auto max-w-6xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          TrustVest is a transparency-first research build — not financial advice.
        </p>
      </footer>
    </div>
  );
}
