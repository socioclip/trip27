import "server-only";
import { demoProvider } from "./demo";
import { duffelProvider } from "./duffel";
import type { FlightProvider } from "./types";
import type { Order } from "../types";

// Accept the Duffel token under an alternative variable name as well.
if (!process.env.DUFFEL_ACCESS_TOKEN) {
  const alt = process.env.DUFFEL_AccessToken || process.env.DUFFEL_TOKEN;
  if (alt) process.env.DUFFEL_ACCESS_TOKEN = alt.trim();
}

export function getProvider(offerOrOrderId?: string): FlightProvider {
  // Demo IDs are always served by the demo provider, so links keep working
  // even after a Duffel token is added.
  if (offerOrOrderId && (offerOrOrderId.startsWith("demo_") || offerOrOrderId.startsWith("ord_demo_"))) return demoProvider;
  return process.env.DUFFEL_ACCESS_TOKEN ? duffelProvider : demoProvider;
}

export function providerMode() {
  const t = process.env.DUFFEL_ACCESS_TOKEN || "";
  if (!t) return "demo" as const;
  return t.startsWith("duffel_live") ? ("live" as const) : ("test" as const);
}

// Safety switch: with a LIVE Duffel token, orders are paid from your Duffel
// balance and real tickets are issued. Keep this off until a customer
// payment gateway is wired into the checkout (see README).
export function liveBookingsAllowed() {
  return providerMode() !== "live" || process.env.ALLOW_LIVE_BOOKINGS === "true";
}

/** Every booking made with this email, across providers, newest first. */
export async function listOrdersForEmail(email: string): Promise<Order[]> {
  const sources: FlightProvider[] = [demoProvider];
  if (process.env.DUFFEL_ACCESS_TOKEN) sources.push(duffelProvider);
  const lists = await Promise.all(sources.map((p) => p.listOrders(email)));
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
