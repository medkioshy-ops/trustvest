"use client";
// How each asset's combined score moved over the AI's recent decisions, against the
// buy and sell lines. Shows whether the AI is reacting to changing conditions or stuck.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Fixed categorical order (validated dark-surface palette); colour follows the asset, never its rank.
export const ASSET_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

// Fixed zone so server and browser render identical labels (avoids hydration mismatches).
const DISPLAY_TZ = process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE || "Africa/Johannesburg";

export interface ScorePoint {
  t: string; // ISO time of the cycle
  [asset: string]: number | string | null;
}

export function ScoreHistoryChart({
  points,
  assets,
  buy,
  sell,
}: {
  points: ScorePoint[];
  assets: string[];
  buy: number;
  sell: number;
}) {
  const label = (iso: string) =>
    new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TZ });
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="Legend">
        {assets.map((a, i) => (
          <li key={a} className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={ASSET_COLORS[i % ASSET_COLORS.length]} strokeWidth="2" />
            </svg>
            {a}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" stroke="#8b8b8b" strokeWidth="1.5" strokeDasharray="4 3" />
          </svg>
          buy / sell lines
        </li>
      </ul>
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={label} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={40} />
            <YAxis domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
            <ReferenceLine y={buy} stroke="#8b8b8b" strokeDasharray="4 3" label={{ value: "buy", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />
            <ReferenceLine y={sell} stroke="#8b8b8b" strokeDasharray="4 3" label={{ value: "sell", position: "insideBottomRight", fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--foreground)" }}
              itemStyle={{ color: "var(--foreground)" }}
              labelFormatter={(t) => label(String(t))}
              formatter={(v, name) => [Number(v).toFixed(3), String(name)]}
            />
            {assets.map((a, i) => (
              <Line key={a} type="monotone" dataKey={a} stroke={ASSET_COLORS[i % ASSET_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
