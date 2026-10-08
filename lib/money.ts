import "server-only";
import type { Money } from "./types";

// Server-side currency handling. Supplier prices are converted into the
// display currency for customers; the original amount is kept for payment.

export const DISPLAY_CURRENCY = (process.env.DISPLAY_CURRENCY || "AED").toUpperCase();

function parseRates(): Record<string, number> {
  const raw =
    process.env.FX_RATES_TO_AED ||
    "USD:3.6725,EUR:4.28,GBP:4.93,SAR:0.979,QAR:1.009,KWD:11.98,BHD:9.74,OMR:9.55";
  const out: Record<string, number> = { AED: 1 };
  for (const pair of raw.split(",")) {
    const [k, v] = pair.split(":").map((s) => s.trim());
    const n = Number(v);
    if (k && Number.isFinite(n) && n > 0) out[k.toUpperCase()] = n;
  }
  return out;
}
const RATES = parseRates();

export function toDisplay(amount: string | number | null | undefined, currency: string): Money {
  const n = typeof amount === "number" ? amount : Number(amount ?? 0);
  const cur = (currency || DISPLAY_CURRENCY).toUpperCase();
  if (cur === DISPLAY_CURRENCY) return { amount: round2(n), currency: cur };
  const fromRate = RATES[cur];
  const toRate = RATES[DISPLAY_CURRENCY];
  if (!fromRate || !toRate) return { amount: round2(n), currency: cur }; // unknown: show as-is
  return { amount: round2((n * fromRate) / toRate), currency: DISPLAY_CURRENCY };
}

export function serviceFee(): Money {
  const n = Number(process.env.SERVICE_FEE_AED || 0);
  return toDisplay(Number.isFinite(n) ? n : 0, "AED");
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
