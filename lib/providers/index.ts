import "server-only";
import { demoProvider } from "./demo";
import { duffelProvider } from "./duffel";
import { isJinkoId, jinkoModeForId, jinkoProvider } from "./jinko";
import type { FlightProvider } from "./types";
import type { Offer, Order, SearchParams } from "../types";
import { credentials, duffelToken, getFlags, liveBookingsSwitch, type SupplierFlags } from "../suppliers";

// Accept the Duffel token under an alternative variable name as well.
if (!process.env.DUFFEL_ACCESS_TOKEN) {
  const alt = duffelToken();
  if (alt) process.env.DUFFEL_ACCESS_TOKEN = alt;
}

const duffelConfigured = () => !!process.env.DUFFEL_ACCESS_TOKEN;
/** No supplier credentials at all: the site runs on built-in demo data. */
const demoOnly = () => {
  const c = credentials();
  return !c.duffel && !c.jinkoSandbox && !c.jinkoProd;
};

/**
 * The provider that owns an offer or order ID. Without an ID, the provider for
 * place lookups (Duffel, or local airport data when Duffel isn't configured).
 * Owners are fixed by ID, so a customer mid-checkout finishes with the supplier
 * they chose even if an admin switches suppliers in the meantime.
 */
export function getProvider(offerOrOrderId?: string): FlightProvider {
  if (offerOrOrderId && isJinkoId(offerOrOrderId)) return jinkoProvider;
  // Demo IDs are always served by the demo provider, so links keep working
  // even after a Duffel token is added.
  if (offerOrOrderId && (offerOrOrderId.startsWith("demo_") || offerOrOrderId.startsWith("ord_demo_"))) return demoProvider;
  return duffelConfigured() ? duffelProvider : demoProvider;
}

/** Suppliers switched on in the admin flags (or demo data if nothing is configured). */
function searchProviders(flags: SupplierFlags): FlightProvider[] {
  if (demoOnly()) return [demoProvider];
  const list: FlightProvider[] = [];
  if (flags.duffel) list.push(duffelProvider);
  if (flags.jinko !== "off") list.push(jinkoProvider);
  return list;
}

/**
 * Searches every enabled supplier in parallel and merges the offers. One
 * supplier failing or timing out never hides the others' results; the search
 * only fails if every supplier fails.
 */
export async function searchAll(params: SearchParams): Promise<Offer[]> {
  const providers = searchProviders(await getFlags());
  if (!providers.length) {
    console.warn("[search] every flight supplier is switched off in the admin flags");
    return [];
  }
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
  const c = credentials();
  return c.duffelMode ?? ("demo" as const);
}

/** Mode shown to customers for the current search: demo, test (any sandbox supplier on) or live. */
export async function providerMode() {
  if (demoOnly()) return "demo" as const;
  const f = await getFlags();
  const modes = [f.duffel ? duffelMode() : null, f.jinko === "sandbox" ? "test" : f.jinko === "prod" ? "live" : null].filter(Boolean);
  if (!modes.length) return "live" as const;
  return modes.includes("test") ? ("test" as const) : ("live" as const);
}

/** Mode for one offer or order. */
export function modeFor(id: string) {
  if (id.startsWith("demo_") || id.startsWith("ord_demo_")) return "demo" as const;
  if (isJinkoId(id)) return jinkoModeForId(id);
  return duffelMode();
}

// Safety switch: with a LIVE Duffel token, orders are paid from your Duffel
// balance and real tickets are issued. Keep this off until a customer
// payment gateway is wired into the checkout (see README).
export function liveBookingsAllowed() {
  return duffelMode() !== "live" || liveBookingsSwitch();
}

/** Every booking made with this email, across providers, newest first. */
export async function listOrdersForEmail(email: string): Promise<Order[]> {
  const sources: FlightProvider[] = [demoProvider];
  if (duffelConfigured()) sources.push(duffelProvider);
  const lists = await Promise.all(sources.map((p) => p.listOrders(email)));
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
