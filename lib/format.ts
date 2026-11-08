const TZ = process.env.NEXT_PUBLIC_DISPLAY_TIMEZONE || "Africa/Johannesburg";

export function money(n: number | string | null | undefined, currency = "USD") {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function qty(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 4 });
}

export function dateTime(iso: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function relative(iso: string, now = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const pct = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(dp)}%`;

export const shortHash = (h: string | null | undefined) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");

export function signedMoney(n: number, currency = "USD") {
  const cents = Math.round(n * 100) / 100;
  if (cents === 0) return money(0, currency);
  return `${cents > 0 ? "+" : "−"}${money(Math.abs(cents), currency)}`;
}
