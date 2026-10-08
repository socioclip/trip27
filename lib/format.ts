import type { Money } from "./types";

export function formatMoney(m: Money | { amount: number; currency: string }, opts: { decimals?: boolean } = {}) {
  const decimals = opts.decimals ?? false;
  try {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency: m.currency,
      currencyDisplay: "code",
      minimumFractionDigits: decimals ? 2 : 0,
      maximumFractionDigits: decimals ? 2 : 0,
    })
      .format(m.amount)
      .replace(/ /g, " ");
  } catch {
    return `${m.currency} ${m.amount.toFixed(decimals ? 2 : 0)}`;
  }
}

// Times from airlines are local to the airport and come without a zone,
// so we parse the string parts directly instead of using Date's TZ logic.
export function hhmm(iso: string) {
  return iso.slice(11, 16);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseYmd(ymd: string) {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymdStr: string, n: number) {
  const d = parseYmd(ymdStr);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}

export function todayYmd() {
  const now = new Date();
  return ymd(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function prettyDate(ymdStr: string, withYear = false) {
  const d = parseYmd(ymdStr);
  const s = `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withYear ? `${s} ${d.getUTCFullYear()}` : s;
}

export function shortDate(ymdStr: string) {
  const d = parseYmd(ymdStr);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function dayDiff(fromIso: string, toIso: string) {
  return Math.round((parseYmd(toIso).getTime() - parseYmd(fromIso).getTime()) / 86400000);
}

export function duration(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function minutesBetween(aIso: string, bIso: string) {
  const a = Date.parse(aIso.slice(0, 16) + ":00Z");
  const b = Date.parse(bIso.slice(0, 16) + ":00Z");
  return Math.round((b - a) / 60000);
}

export function stopsLabel(n: number) {
  return n === 0 ? "Non-stop" : n === 1 ? "1 stop" : `${n} stops`;
}

export function cabinLabel(c: string) {
  return (
    { economy: "Economy", premium_economy: "Premium Economy", business: "Business", first: "First" } as Record<string, string>
  )[c] || c;
}

export function timeBucket(iso: string): "early" | "morning" | "afternoon" | "evening" {
  const h = Number(iso.slice(11, 13));
  if (h < 6) return "early";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
