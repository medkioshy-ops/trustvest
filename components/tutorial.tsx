"use client";
// Guided tour for first-time users. Opens automatically on the first dashboard visit,
// highlights each part of the screen, and can be reopened from "Guide" in the header.
import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GraduationCap, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Step = { title: string; body: string; target?: string; cta?: { label: string; href: string } };

const STEPS: Step[] = [
  {
    title: "Welcome to TrustVest 👋",
    body: "An AI invests practice money for you — and shows you exactly why it does everything. It's a safe place to learn: the money is pretend, the prices are real.",
  },
  {
    target: "balances",
    title: "Your money at a glance",
    body: "“Portfolio value” is everything you own right now. “Cash” is the part not yet invested — the AI spends a small slice of it each time it buys.",
  },
  {
    target: "deposit",
    title: "Step 1 — add practice money",
    body: "Type an amount such as 10000 and press Deposit. Nothing real is charged; it just gives the AI something to work with.",
  },
  {
    target: "run",
    title: "Step 2 — let the AI decide",
    body: "“Run the AI now” makes it check every asset on its watchlist and decide: buy, sell, or wait. It also does this by itself every weekday when the US market opens.",
  },
  {
    target: "signals",
    title: "What the AI is thinking",
    body: "Each bar is the AI's opinion of one asset, from strong sell (left) to strong buy (right). It only trades when a bar crosses a dashed line — in between, it waits.",
  },
  {
    target: "allocation",
    title: "Where your money sits",
    body: "How your account is split between cash and each investment. The dashed line is a safety rule: the AI never puts more than 30% into one thing.",
  },
  {
    target: "latest",
    title: "Every decision, in plain English",
    body: "The first line tells you what the AI did and why. Open “Show the full reasoning” for the exact numbers and the news headlines it read.",
  },
  {
    target: "integrity",
    title: "Nothing can be changed behind your back",
    body: "Every deposit, decision and trade is locked in a tamper-evident ledger. “All records untouched ✓” means nothing has been altered since it was written.",
  },
  {
    title: "Is the AI actually any good?",
    body: "The “Is the AI working?” page tests the AI honestly: it replays its rules on a year of real prices and compares them with simply buying and holding. It doesn't always win — and it tells you so.",
    cta: { label: "Open that page", href: "/ai" },
  },
  {
    title: "You're ready",
    body: "Look for the small “?” icons whenever a word is unfamiliar. You can replay this tour any time from “Guide” at the top of the page.",
  },
];

// Tiny external store so opening the tour never calls setState inside an effect.
const KEY = "trustvest-tour-done";
let state = { open: false, step: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const store = {
  subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  get: () => state,
  set: (next: Partial<typeof state>) => {
    state = { ...state, ...next };
    emit();
  },
};
const serverState = { open: false, step: 0 };

function markDone() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable — the tour will simply offer itself again next time */
  }
}

export function TutorialButton({ variant = "ghost" }: { variant?: "ghost" | "primary" }) {
  return (
    <Button
      type="button"
      variant={variant === "primary" ? "default" : "ghost"}
      size="sm"
      onClick={() => store.set({ open: true, step: 0 })}
      aria-label="Open the guided tour"
    >
      <GraduationCap />
      {variant === "primary" ? "Take the tour" : <span className="hidden sm:inline">Guide</span>}
    </Button>
  );
}

export function Tutorial() {
  const { open, step } = useSyncExternalStore(store.subscribe, store.get, () => serverState);
  const path = usePathname();
  const router = useRouter();

  // First visit to the dashboard → open automatically.
  useEffect(() => {
    if (path !== "/dashboard") return;
    let done = false;
    try {
      done = localStorage.getItem(KEY) === "1";
    } catch {
      done = false;
    }
    if (!done) store.set({ open: true, step: 0 });
  }, [path]);

  // Highlight the part of the page the current step talks about.
  useEffect(() => {
    if (!open) return;
    const target = STEPS[step]?.target;
    const el = target ? document.querySelector<HTMLElement>(`[data-tour="${target}"]`) : null;
    if (!el) return;
    // On phones the tour card covers the bottom of the screen, so bring the target to the top instead.
    el.scrollIntoView({ block: window.innerWidth < 768 ? "start" : "center", behavior: "smooth" });
    const cls = ["ring-2", "ring-primary", "ring-offset-4", "ring-offset-background", "transition-shadow"];
    el.classList.add(...cls);
    return () => el.classList.remove(...cls);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") store.set({ step: Math.min(store.get().step + 1, STEPS.length - 1) });
      if (e.key === "ArrowLeft") store.set({ step: Math.max(store.get().step - 1, 0) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    markDone();
    store.set({ open: false });
  }

  if (!open) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const onDashboard = path === "/dashboard";
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-primary/40 bg-popover p-5 text-popover-foreground shadow-2xl sm:right-6 sm:left-auto sm:mx-0"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Guided tour · {step + 1} of {STEPS.length}
        </p>
        <button type="button" onClick={close} aria-label="Close the tour" className="text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <h2 id="tour-title" className="mt-2 text-lg font-semibold">
        {s.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
      {s.target && !onDashboard && (
        <p className="mt-2 text-xs text-amber-300">This part is on the Dashboard — open it to see the highlight.</p>
      )}
      <div className="mt-4 flex items-center gap-1" aria-hidden>
        {STEPS.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2">
        {step > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => store.set({ step: step - 1 })}>
            Back
          </Button>
        )}
        {!last && (
          <button type="button" onClick={close} className="text-xs text-muted-foreground hover:text-foreground">
            Skip tour
          </button>
        )}
        <div className="ml-auto flex gap-2">
          {s.cta && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                close();
                router.push(s.cta!.href);
              }}
            >
              {s.cta.label}
            </Button>
          )}
          <Button type="button" size="sm" onClick={() => (last ? close() : store.set({ step: step + 1 }))}>
            {last ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
