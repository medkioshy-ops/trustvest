import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-muted text-foreground",
  buy: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  sell: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  hold: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/30",
  good: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  bad: "bg-red-500/15 text-red-300 ring-red-500/30",
  warn: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  primary: "bg-primary/15 text-primary ring-primary/30",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ring-1 ring-transparent ring-inset",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
