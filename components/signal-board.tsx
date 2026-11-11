// "What is the AI thinking right now?" — each watched asset's latest combined score on a
// −1…+1 scale. Bars that cross a dashed line are what trigger a BUY or SELL.
import { Badge } from "@/components/ui/badge";
import { relative } from "@/lib/format";
import { assetName } from "@/lib/plain-language";
import type { AiDecision } from "@/lib/types";

const toPct = (v: number) => ((Math.max(-1, Math.min(1, v)) + 1) / 2) * 100;

export function SignalBoard({ assets, latest }: { assets: string[]; latest: Map<string, AiDecision> }) {
  const any = [...latest.values()][0]?.signal_inputs;
  const buy = any?.thresholds.buy ?? 0.25;
  const sell = any?.thresholds.sell ?? -0.25;
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {assets.map((asset) => {
          const d = latest.get(asset);
          const s = d?.signal_inputs;
          if (!d || !s) {
            return (
              <li key={asset} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-sm">
                <span className="font-medium" title={asset}>{assetName(asset)}</span>
                <span className="text-xs text-muted-foreground">No opinion yet — press &ldquo;Run the AI now&rdquo;.</span>
              </li>
            );
          }
          const score = s.combined_score;
          const zone = score >= buy ? "buy" : score <= sell ? "sell" : "hold";
          const fill = zone === "buy" ? "bg-emerald-400" : zone === "sell" ? "bg-orange-400" : "bg-zinc-400";
          const left = Math.min(toPct(0), toPct(score));
          const width = Math.abs(toPct(score) - toPct(0));
          const toBuy = score < buy ? `${(buy - score).toFixed(2)} below buy line` : "past buy line";
          return (
            <li key={asset} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm">
              <span className="font-medium" title={asset}>{assetName(asset)}</span>
              <div
                className="relative h-6"
                title={`${asset}: score ${score} (momentum ${s.momentum.score}, sentiment ${s.sentiment.score}) — ${toBuy}`}
              >
                <div className="absolute inset-y-[11px] right-0 left-0 rounded-full bg-muted" />
                <div className={`absolute inset-y-1.5 rounded-[4px] ${fill}`} style={{ left: `${left}%`, width: `${Math.max(width, 0.6)}%` }} />
                <div className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: "50%" }} aria-hidden />
                <div className="absolute inset-y-0 border-l border-dashed border-orange-300/70" style={{ left: `${toPct(sell)}%` }} aria-hidden />
                <div className="absolute inset-y-0 border-l border-dashed border-emerald-300/70" style={{ left: `${toPct(buy)}%` }} aria-hidden />
              </div>
              <span className="flex items-center gap-2 tabular-nums">
                <span className="w-12 text-right font-mono text-xs">{score > 0 ? "+" : ""}{score.toFixed(2)}</span>
                <Badge tone={d.action}>{d.action === "hold" ? "waiting" : d.action === "buy" ? "bought" : "sold"}</Badge>
              </span>
              <span className="col-span-2 col-start-2 -mt-2 text-xs text-muted-foreground">
                price trend {s.momentum.score > 0 ? "+" : ""}{s.momentum.score.toFixed(2)} · news mood {s.sentiment.score > 0 ? "+" : ""}
                {s.sentiment.score.toFixed(2)} ({s.sentiment.headline_count} headlines) · {relative(d.created_at)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Left = leaning sell · right = leaning buy</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 border-l border-dashed border-emerald-300" /> buy line {buy}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 border-l border-dashed border-orange-300" /> sell line {sell}
        </span>
        <span>Between the lines, the AI waits.</span>
      </p>
    </div>
  );
}
