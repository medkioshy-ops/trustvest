"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PerformancePoint } from "@/lib/performance";

// Validated with the dataviz palette checker against the dark card surface.
export const SERIES = {
  ai: { label: "TrustVest AI", color: "#22a596" },
  benchmark: { label: "Buy & hold", color: "#d95926" },
  cash: { label: "Cash only", color: "#8b8b8b" },
} as const;

export function PerformanceChart({ points, currency }: { points: PerformancePoint[]; currency: string }) {
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, notation: v >= 100_000 ? "compact" : "standard", maximumFractionDigits: 0 }).format(v);
  const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
        {(Object.keys(SERIES) as (keyof typeof SERIES)[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={SERIES[k].color} strokeWidth="2" strokeDasharray={k === "cash" ? "4 3" : undefined} />
            </svg>
            {SERIES[k].label}
          </li>
        ))}
      </ul>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={32} />
            <YAxis tickFormatter={fmt} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={72} domain={["auto", "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--foreground)" }}
              itemStyle={{ color: "var(--foreground)" }}
              labelFormatter={(d) => dayLabel(String(d))}
              formatter={(v, name) => [fmt(Number(v)), SERIES[name as keyof typeof SERIES]?.label ?? name]}
            />
            <Line type="monotone" dataKey="cash" stroke={SERIES.cash.color} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="benchmark" stroke={SERIES.benchmark.color} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="ai" stroke={SERIES.ai.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
