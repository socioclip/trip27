import "server-only";
import { demoProvider } from "./demo";
import { duffelProvider } from "./duffel";
import { isJinkoId, jinkoEnabled, jinkoMode, jinkoProvider } from "./jinko";
import type { FlightProvider } from "./types";
import type { Offer, Order, SearchParams } from "../types";

// Accept the Duffel token under an alternative variable name as well.
if (!process.env.DUFFEL_ACCESS_TOKEN) {
  const alt = process.env.DUFFEL_AccessToken || process.env.DUFFEL_TOKEN;
  if (alt) process.env.DUFFEL_ACCESS_TOKEN = alt.trim();
}

const duffelEnabled = () => !!process.env.DUFFEL_ACCESS_TOKEN;

/**
 * The provider that owns an offer or order ID. Without an ID, the provider for
 * place lookups (Duffel, or demo data when Duffel isn't configured).
 */
export function getProvider(offerOrOrderId?: string): FlightProvider {
  if (offerOrOrderId && isJinkoId(offerOrOrderId)) return jinkoProvider;
  // Demo IDs are always served by the demo provider, so links keep working
  // even after a Duffel token is added.
  if (offerOrOrderId && (offerOrOrderId.startsWith("demo_") || offerOrOrderId.startsWith("ord_demo_"))) return demoProvider;
  return duffelEnabled() ? duffelProvider : demoProvider;
}

/** Providers that answer flight searches: Duffel and/or Jinko, else demo data. */
function searchProviders(): FlightProvider[] {
  const list: FlightProvider[] = [];
  if (duffelEnabled()) list.push(duffelProvider);
  if (jinkoEnabled()) list.push(jinkoProvider);
  return list.length ? list : [demoProvider];
}

/**
 * Searches every configured provider in parallel and merges the offers. One
 * provider failing or timing out never hides the others' results; the search
 * only fails if every provider fails.
 */
export async function searchAll(params: SearchParams): Promise<Offer[]> {
  const providers = searchProviders();
  const results = await Promise.allSettled(providers.map((p) => p.search(params)));
  const offers: Offer[] = [];
  let firstError: unknown = null;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") offers.push(...r.value);
    else {
      console.error(`[search] ${providers[i].name} failed`, (r.reason as Error)?.message);
      firstError ??= r.reason;
    }
  });
  if (firstError && results.every((r) => r.status === "rejected")) throw firstError;
  return offers;
}

function duffelMode() {
  const t = process.env.DUFFEL_ACCESS_TOKEN || "";
  if (!t) return "demo" as const;
  return t.startsWith("duffel_live") ? ("live" as const) : ("test" as const);
}

/** Mode shown to customers: demo, test (any sandbox source) or live. */
export function providerMode() {
  if (!duffelEnabled() && !jinkoEnabled()) return "demo" as const;
  const modes = [duffelEnabled() ? duffelMode() : null, jinkoEnabled() ? jinkoMode() : null].filter(Boolean);
  return modes.includes("test") ? ("test" as const) : ("live" as const);
}

/** Mode for one offer or order. */
export function modeFor(id: string) {
  if (id.startsWith("demo_") || id.startsWith("ord_demo_")) return "demo" as const;
  if (isJinkoId(id)) return jinkoMode();
  return duffelMode();
}

// Safety switch: with a LIVE Duffel token, orders are paid from your Duffel
// balance and real tickets are issued. Keep this off until a customer
// payment gateway is wired into the checkout (see README).
export function liveBookingsAllowed() {
  return duffelMode() !== "live" || process.env.ALLOW_LIVE_BOOKINGS === "true";
}

/** Every booking made with this email, across providers, newest first. */
export async function listOrdersForEmail(email: string): Promise<Order[]> {
  const sources: FlightProvider[] = [demoProvider];
  if (duffelEnabled()) sources.push(duffelProvider);
  const lists = await Promise.all(sources.map((p) => p.listOrders(email)));
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
