// "Where is my money, and is the risk rule holding?" — share of the portfolio in cash and
// each holding, with the per-asset cap the engine enforces drawn as a dashed line.
import { money } from "@/lib/format";

export interface AllocationRow {
  label: string;
  value: number;
  kind: "cash" | "asset";
}

export function AllocationBars({ rows, total, capPct, currency }: { rows: AllocationRow[]; total: number; capPct: number; currency: string }) {
  if (total <= 0) return <p className="text-sm text-muted-foreground">Nothing to show yet — deposit funds first.</p>;
  const sorted = [...rows].sort((a, b) => (a.kind === b.kind ? b.value - a.value : a.kind === "cash" ? -1 : 1));
  const over = sorted.filter((r) => r.kind === "asset" && r.value / total > capPct);
  return (
    <div className="space-y-4">
      <ul className="space-y-2.5">
        {sorted.map((r) => {
          const share = (r.value / total) * 100;
          return (
            <li key={r.label} className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-3 text-sm">
              <span className={r.kind === "cash" ? "text-muted-foreground" : "font-medium"}>{r.label}</span>
              <div className="relative h-5" title={`${r.label}: ${money(r.value, currency)} (${share.toFixed(1)}%)`}>
                <div className="absolute inset-y-[9px] right-0 left-0 rounded-full bg-muted" />
                <div
                  className={`absolute inset-y-1 left-0 rounded-r-[4px] ${r.kind === "cash" ? "bg-zinc-500" : "bg-primary"}`}
                  style={{ width: `${Math.max(share, 0.5)}%` }}
                />
                {r.kind === "asset" && (
                  <div className="absolute inset-y-0 border-l border-dashed border-amber-300/80" style={{ left: `${capPct * 100}%` }} aria-hidden />
                )}
              </div>
              <span className="text-right tabular-nums">
                {share.toFixed(1)}% <span className="text-xs text-muted-foreground">{money(r.value, currency)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        <span className="mr-1.5 inline-block h-3 border-l border-dashed border-amber-300 align-middle" />
        Per-asset cap {Math.round(capPct * 100)}% — the AI stops buying an asset at this line.
        {over.length > 0 && ` ${over.map((o) => o.label).join(", ")} grew past it through price gains (the AI does not buy more, but also does not trim).`}
      </p>
    </div>
  );
}
