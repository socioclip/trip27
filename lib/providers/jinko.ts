import "server-only";
import { randomUUID } from "crypto";
import { seal, unseal } from "../auth";
import { getFlags, jinkoKey, liveBookingsSwitch, type JinkoEnv } from "../suppliers";
import { airport, CITY_CODES } from "../airports";
import { round2, toDisplay } from "../money";
import {
  ProviderError,
  type Carrier,
  type CreateOrderInput,
  type Endpoint,
  type Money,
  type Offer,
  type OfferPassenger,
  type Order,
  type SearchParams,
  type Segment,
  type Slice,
} from "../types";
import type { FlightProvider } from "./types";

// ---------------------------------------------------------------------------
// Jinko provider — https://docs.gojinko.com
//
// Jinko is a second flight source next to Duffel. Two things differ:
//
// 1. Payment. Jinko is the merchant: the traveller pays on Jinko's own hosted
//    checkout page (Stripe), not through trip27's Checkout.com flow. trip27
//    builds the trip (fare + travellers), asks Jinko for a checkout URL and
//    sends the traveller there. Jinko books and tickets after payment and
//    emails the traveller; trip27 polls the trip for the result.
//
// 2. No database. Jinko's search returns a short-lived trip_item_token, and
//    its trip/booking reads don't echo the flight details back. So the fare is
//    kept as a signed, compressed snapshot inside trip27's own IDs:
//      offer id  jnko_<snapshot>            (valid until the fare expires)
//      order id  jnkb_<trip_id>~<snapshot>  (long-lived, shows the itinerary)
//    The snapshot is signed with AUTH_SECRET, so it can't be edited in the
//    browser. Jinko re-prices at checkout and the customer pays Jinko's price.
// ---------------------------------------------------------------------------

const PROD = "https://api.gojinko.com";
const SANDBOX = "https://api.sandbox.gojinko.com";
const LOGO = (code: string) =>
  `https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/${code}.svg`;

export const JINKO_OFFER_PREFIX = "jnko_";
export const JINKO_ORDER_PREFIX = "jnkb_";

const env = (k: string) => (process.env[k] || "").trim();

/** Jinko fares come from one environment; old IDs without one are sandbox. */
const envOf = (snap: { e?: JinkoEnv }): JinkoEnv => (snap.e === "prod" ? "prod" : "sandbox");
const modeOf = (e: JinkoEnv) => (e === "prod" ? ("live" as const) : ("test" as const));

export const isJinkoId = (id: string) => id.startsWith(JINKO_OFFER_PREFIX) || id.startsWith(JINKO_ORDER_PREFIX);

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

async function jinko<T = J>(e: JinkoEnv, path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const key = jinkoKey(e);
  if (!key) throw new ProviderError("This supplier is not configured.", 503);
  const base = (env(e === "prod" ? "JINKO_API_BASE_PROD" : "JINKO_API_BASE") || (e === "prod" ? PROD : SANDBOX)).replace(/\/$/, "");
  const requestId = randomUUID();
  let res: Response;
  try {
    res = await fetch(base + path, {
      method: init.method || "GET",
      headers: {
        "X-API-Key": key,
        "X-Request-ID": requestId,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(init.timeoutMs ?? 30000),
    });
  } catch (e) {
    console.error("[jinko]", e, init.method || "GET", path, requestId, (e as Error).message);
    throw new ProviderError("The flight supplier didn't respond. Please try again.", 502);
  }
  const text = await res.text();
  let json: J = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const code: string = json?.error?.code || "";
    console.error("[jinko]", e, init.method || "GET", path, res.status, code, requestId, (json?.error?.message || text).slice(0, 800));
    if (res.status === 410 || code === "QUOTE_EXPIRED" || code === "OFFER_EXPIRED" || code === "TRIP_EXPIRED")
      throw new ProviderError("This fare has expired or sold out. Please search again.", 410);
    if (res.status === 404) throw new ProviderError("Not found.", 404);
    if (res.status === 401) throw new ProviderError(`Flight supplier login failed. Check the Jinko ${e} API key.`, 502);
    const msg = res.status >= 500 ? "The flight supplier had a problem. Please try again." : json?.error?.message || `Supplier error (${res.status})`;
    throw new ProviderError(msg, res.status >= 500 || res.status === 429 ? 502 : 400);
  }
  return json as T;
}

// ---- money ------------------------------------------------------------------

/** Jinko money -> major units. `value` is always minor units; `amount` is minor only when decimal_places is present. */
function major(m: J): { amount: number; currency: string; dp: number } | null {
  if (!m || !m.currency) return null;
  const dp = typeof m.decimal_places === "number" ? m.decimal_places : null;
  if (typeof m.value === "number") return { amount: m.value / 10 ** (dp ?? 2), currency: m.currency, dp: dp ?? 2 };
  if (typeof m.amount === "number") return dp != null ? { amount: m.amount / 10 ** dp, currency: m.currency, dp } : { amount: m.amount, currency: m.currency, dp: 2 };
  return null;
}

// ---- normalisation ------------------------------------------------------------

/** RFC 3339 with offset -> local wall-clock ISO without zone, as the UI expects. */
function localIso(s: string | undefined): string {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(:\d{2})?/.exec(s || "");
  return m ? m[1] + (m[2] || ":00") : "";
}

function minutesBetweenLocal(a: string, b: string) {
  return Math.round((Date.parse(b + "Z") - Date.parse(a + "Z")) / 60000);
}

function carrier(code: string | undefined, name?: string): Carrier {
  const c = (code || "").toUpperCase();
  return { code: c, name: name || c, logo: c ? LOGO(c) : "" };
}

// Jinko's *_city fields are often IATA city codes ("LON", "DXB"), not names.
function cityName(city: string | undefined, airportCode: string | undefined): string {
  const c = (city || "").trim();
  const a = airportCode ? airport(airportCode) : undefined;
  if (c && !/^[A-Z]{3}$/.test(c)) return c;
  return CITY_CODES[c]?.city || a?.city || (c ? airport(c)?.city : undefined) || c || airportCode || "";
}

function endpoint(code: string | undefined, city?: string): Endpoint {
  const a = code ? airport(code) : undefined;
  const name = cityName(city, code);
  return { code: code || "", name: a?.name || name || code || "", city: name, terminal: null };
}

// Jinko sends IATA aircraft codes ("388"); name the common long-haul ones.
const AIRCRAFT: Record<string, string> = {
  "388": "Airbus A380-800", "380": "Airbus A380", "359": "Airbus A350-900", "351": "Airbus A350-1000", "35K": "Airbus A350-1000",
  "333": "Airbus A330-300", "332": "Airbus A330-200", "339": "Airbus A330-900neo", "321": "Airbus A321", "32Q": "Airbus A321neo",
  "32N": "Airbus A320neo", "320": "Airbus A320", "319": "Airbus A319", "77W": "Boeing 777-300ER", "773": "Boeing 777-300",
  "772": "Boeing 777-200", "77L": "Boeing 777-200LR", "789": "Boeing 787-9", "788": "Boeing 787-8", "78X": "Boeing 787-10",
  "744": "Boeing 747-400", "74H": "Boeing 747-8", "738": "Boeing 737-800", "7M8": "Boeing 737 MAX 8", "7M9": "Boeing 737 MAX 9",
};
const aircraftName = (code: string | undefined) => (code ? AIRCRAFT[code.toUpperCase()] || code : "");

function flightNumber(airline: string, raw: string | undefined) {
  let n = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  if (airline && n.startsWith(airline)) n = n.slice(airline.length);
  n = n.replace(/^0+(?=\d)/, "");
  return `${airline} ${n}`.trim();
}

function normLeg(leg: J, idx: number, fare: J): Slice {
  const checked = fare?.included_baggage?.pieces ?? 0;
  const carry = fare?.carry_on_baggage?.pieces ?? 1;
  const cabin = fare?.brand_name || fare?.cabin_class || "";
  const segs: Segment[] = (leg?.segments || []).map((g: J, i: number): Segment => {
    const dep = localIso(g.departure_time);
    const arr = localIso(g.arrival_time);
    const code = (g.airline || leg.airline || "").toUpperCase();
    return {
      id: `seg_${idx}_${i}`,
      origin: endpoint(g.departure_airport, g.departure_city),
      destination: endpoint(g.arrival_airport, g.arrival_city),
      departingAt: dep,
      arrivingAt: arr,
      durationMin: g.duration_minutes || (dep && arr ? minutesBetweenLocal(dep, arr) : 0),
      carrier: carrier(code, g.airline_name || leg.airline_name),
      operatingCarrier: g.operating_carrier && g.operating_carrier.toUpperCase() !== code ? carrier(g.operating_carrier) : null,
      flightNumber: flightNumber(code, g.flight_number),
      aircraft: aircraftName(g.aircraft),
      cabin,
      checkedBags: checked,
      carryOnBags: carry,
    };
  });
  const first = segs[0];
  const last = segs[segs.length - 1];
  return {
    id: `sli_${idx}`,
    origin: first?.origin || endpoint(leg?.origin),
    destination: last?.destination || endpoint(leg?.destination),
    departingAt: first?.departingAt || localIso(leg?.departure_datetime),
    arrivingAt: last?.arrivingAt || localIso(leg?.arrival_datetime),
    durationMin: leg?.duration_minutes || segs.reduce((n, s) => n + s.durationMin, 0),
    stops: leg?.stops ?? Math.max(0, segs.length - 1),
    segments: segs,
    fareBrand: fare?.brand_name || null,
  };
}

interface Pax {
  a: number;
  c: number;
  i: number;
}

function passengers(p: Pax): OfferPassenger[] {
  let n = 0;
  return [
    ...Array.from({ length: p.a }, () => ({ id: `pax_${++n}`, type: "adult" as const })),
    ...Array.from({ length: p.c }, () => ({ id: `pax_${++n}`, type: "child" as const })),
    ...Array.from({ length: p.i }, () => ({ id: `pax_${++n}`, type: "infant_without_seat" as const })),
  ];
}

function international(slices: Slice[]) {
  for (const s of slices) {
    const a = airport(s.origin.code) || airport(CITY_CODES[s.origin.code]?.airports[0] || "");
    const b = airport(s.destination.code) || airport(CITY_CODES[s.destination.code]?.airports[0] || "");
    if (!a || !b || a.country !== b.country) return true; // unknown airport: ask for passports to be safe
  }
  return false;
}

// ---- snapshots (signed, compressed fare data carried in our IDs) --------------

interface Snapshot {
  v: 1;
  e?: JinkoEnv; // environment the fare came from (absent on early sandbox IDs)
  t: string; // trip_item_token
  o: J; // Jinko FlightOffer with only the chosen fare
  p: Pax;
  exp: number;
}

const OFFER_PURPOSE = "jinko-offer";
const ORDER_PURPOSE = "jinko-order";

function offerId(s: Snapshot) {
  return JINKO_OFFER_PREFIX + seal(OFFER_PURPOSE, s);
}

function readOfferId(id: string): Snapshot {
  const s = id.startsWith(JINKO_OFFER_PREFIX) ? unseal<Snapshot>(OFFER_PURPOSE, id.slice(JINKO_OFFER_PREFIX.length)) : null;
  if (!s) throw new ProviderError("This fare has expired. Please search again.", 410);
  return s;
}

function orderId(tripId: string, s: Snapshot) {
  const token = seal(ORDER_PURPOSE, { ...s, exp: Date.now() + 3 * 365 * 86_400_000 });
  return `${JINKO_ORDER_PREFIX}${tripId}~${token}`;
}

function readOrderId(id: string): { tripId: string; snap: Snapshot } | null {
  if (!id.startsWith(JINKO_ORDER_PREFIX)) return null;
  const rest = id.slice(JINKO_ORDER_PREFIX.length);
  const cut = rest.lastIndexOf("~");
  if (cut < 1) return null;
  const snap = unseal<Snapshot>(ORDER_PURPOSE, rest.slice(cut + 1));
  return snap ? { tripId: rest.slice(0, cut), snap } : null;
}

function toOffer(s: Snapshot, id: string): Offer {
  const o = s.o;
  const fare = o.fares?.[0] || {};
  const slices = [o.outbound, o.inbound, ...(o.additional_legs || [])].filter(Boolean).map((l: J, i: number) => normLeg(l, i, fare));
  const price = major(fare.total_price);
  if (!price) throw new ProviderError("This fare has no price. Please search again.", 410);
  const total = toDisplay(price.amount, price.currency);
  const owner = slices[0]?.segments[0]?.carrier || carrier(o.outbound?.airline, o.outbound?.airline_name);
  return {
    id,
    // Jinko charges the traveller directly, so trip27 can't add a service fee.
    total,
    base: null,
    tax: null,
    serviceFee: { amount: 0, currency: total.currency },
    supplierAmount: price.amount.toFixed(price.dp),
    supplierCurrency: price.currency,
    owner,
    slices,
    passengers: passengers(s.p),
    conditions: {
      refundable: typeof fare.is_refundable === "boolean" ? fare.is_refundable : null,
      refundPenalty: null,
      changeable: typeof fare.is_changeable === "boolean" ? fare.is_changeable : null,
      changePenalty: null,
    },
    expiresAt: fare.expires_at || new Date(s.exp).toISOString(),
    requiresDocuments: international(slices),
    fareBrand: fare.brand_name || fare.cabin_class || "Standard",
    itineraryKey: owner.code + ":" + slices.map((sl) => sl.segments.map((g) => g.flightNumber + g.departingAt).join(",")).join("|"),
    checkedBags: fare.included_baggage?.pieces ?? 0,
    carryOnBags: fare.carry_on_baggage?.pieces ?? 1,
  };
}

// ---- search ---------------------------------------------------------------------

/** Jinko searches one-way and round trips. Returns null for anything else. */
function jinkoTrip(p: SearchParams) {
  const [a, b] = p.slices;
  if (p.slices.length === 1) return { trip_type: "oneway" as const, origin: a.origin, destination: a.destination, departure_date: a.date };
  if (p.slices.length === 2 && b.origin === a.destination && b.destination === a.origin)
    return { trip_type: "roundtrip" as const, origin: a.origin, destination: a.destination, departure_date: a.date, return_date: b.date };
  return null;
}

async function search(p: SearchParams): Promise<Offer[]> {
  const e = (await getFlags()).jinko;
  if (e === "off") return [];
  const trip = jinkoTrip(p);
  if (!trip) return [];
  const data = await jinko<J>(e, "/v1/flight_search", {
    method: "POST",
    timeoutMs: 28000,
    body: {
      ...trip,
      ...(CITY_CODES[trip.origin] ? { origin_type: "city" } : {}),
      ...(CITY_CODES[trip.destination] ? { destination_type: "city" } : {}),
      cabin_class: p.cabin,
      adults: p.adults,
      children: p.children,
      infants: p.infants,
      max_stops: 2,
      limit: 100,
      currency: env("JINKO_CURRENCY") || "USD",
    },
  });
  const pax: Pax = { a: p.adults, c: p.children, i: p.infants };
  const out: Offer[] = [];
  for (const o of data?.offers || []) {
    for (const fare of o.fares || []) {
      if (!fare?.trip_item_token || !fare.total_price) continue;
      const exp = Math.min(Date.parse(fare.expires_at || "") || Infinity, Date.now() + 30 * 60_000);
      const snap: Snapshot = { v: 1, e, t: fare.trip_item_token, o: { ...o, fares: [fare] }, p: pax, exp };
      try {
        out.push(toOffer(snap, offerId(snap)));
      } catch {
        /* skip malformed fares */
      }
    }
  }
  return out;
}

// ---- checkout -------------------------------------------------------------------

const PAX_TYPE = { adult: "ADULT", child: "CHILD", infant_without_seat: "INFANT" } as const;

export interface JinkoCheckout {
  orderId: string;
  checkoutUrl: string;
  expiresAt: string | null;
  /** What the traveller will be charged on Jinko's page, in Jinko's currency. */
  charge: Money;
  /** The same amount converted for display. */
  total: Money;
  priceChanged: boolean;
}

/**
 * Builds a Jinko trip (fare + travellers + contact), prices it and returns the
 * hosted checkout URL. No money moves here: the traveller pays on Jinko's page.
 */
export async function startJinkoCheckout(input: CreateOrderInput): Promise<JinkoCheckout> {
  const snap = readOfferId(input.offerId);
  const offer = toOffer(snap, input.offerId);
  if (input.passengers.length !== offer.passengers.length) throw new ProviderError("Passenger details are incomplete.");
  if (input.services.length) throw new ProviderError("Seats and extra bags can't be added to this fare yet.");
  const e = envOf(snap);
  // Real tickets and real money need the ALLOW_LIVE_BOOKINGS switch as well as Jinko production being on.
  if (e === "prod" && !liveBookingsSwitch()) throw new ProviderError("Online booking is not enabled yet.", 503);

  const travelers = input.passengers.map((p) => ({
    first_name: p.givenName.trim(),
    last_name: p.familyName.trim(),
    date_of_birth: p.bornOn,
    gender: p.gender === "f" ? "FEMALE" : "MALE",
    passenger_type: PAX_TYPE[p.type],
    ...(p.passportNumber
      ? {
          passport_number: p.passportNumber.trim(),
          passport_expiry: p.passportExpiry,
          passport_country: (p.passportCountry || "").toUpperCase(),
          nationality: (p.passportCountry || "").toUpperCase(),
        }
      : {}),
  }));

  const trip = await jinko<J>(e, "/v1/trip", {
    method: "POST",
    body: {
      add_item: { trip_item_token: snap.t },
      upsert_travelers: { travelers, contact: { email: input.contact.email.trim(), phone: input.contact.phone } },
    },
  });
  const tripId: string = trip?.trip_id;
  if (!tripId) throw new ProviderError("The supplier couldn't create this booking. Please try again.", 502);

  // Pricing happens here, synchronously. It can fail with 410 if the fare is gone.
  const co = await jinko<J>(e, "/v1/checkout", { method: "POST", timeoutMs: 55000, body: { trip_id: tripId } });
  if (!co?.checkout_url) throw new ProviderError("The supplier didn't return a payment page. Please try again.", 502);

  const charge = major(co.total_amount_money) || major(co.total_amount) || { amount: Number(offer.supplierAmount), currency: offer.supplierCurrency, dp: 2 };
  const priceChanged =
    (co.items || []).some((i: J) => i?.price_changed) || Math.abs(round2(charge.amount) - round2(Number(offer.supplierAmount))) >= 0.01;

  return {
    orderId: orderId(tripId, snap),
    checkoutUrl: co.checkout_url,
    expiresAt: co.expires_at || null,
    charge: { amount: round2(charge.amount), currency: charge.currency },
    total: toDisplay(charge.amount, charge.currency),
    priceChanged,
  };
}

// ---- orders -----------------------------------------------------------------------

const DONE = new Set(["fulfilled", "partially_fulfilled"]);
const DEAD = new Set(["failed", "cancelled", "expired"]);
const PAID = new Set(["authorized", "captured"]);

function orderStatus(t: J): { status: Order["status"]; note?: string } {
  const s: string = t?.status || "";
  const f: string = t?.fulfillment?.status || "";
  const pay: string = t?.payment_attempt?.payment_status || "";
  if (DONE.has(s) || f === "completed" || f === "partial") return { status: "confirmed" };
  if (DEAD.has(s) || f === "failed")
    return { status: "failed", note: "The airline couldn't confirm this booking. Any payment hold is released automatically." };
  if (s === "fulfilling" || s === "fulfillment_prepared" || f || PAID.has(pay))
    return { status: "pending", note: "Payment received. The airline is issuing your ticket — this usually takes a few minutes." };
  return { status: "awaiting_payment", note: "Complete payment on the secure checkout page to confirm this booking." };
}

async function getOrder(id: string): Promise<Order | null> {
  const parsed = readOrderId(id);
  if (!parsed) return null;
  const { tripId, snap } = parsed;
  const e = envOf(snap);
  let t: J;
  try {
    t = await jinko<J>(e, `/v1/trip/${encodeURIComponent(tripId)}`);
  } catch (e) {
    if (e instanceof ProviderError && e.status === 404) return null;
    throw e;
  }
  const offer = toOffer(snap, id);
  const paid = major(t?.total_amount_money) || major(t?.total_amount);
  const b0 = (t?.bookings || [])[0] || {};
  const { status, note } = orderStatus(t);
  return {
    id,
    bookingReference: b0.pnr || b0.booking_reference || t?.booking_ref || "Pending",
    status,
    statusNote: note,
    supplierReference: t?.booking_ref || undefined,
    createdAt: t?.created_at || "",
    total: paid ? toDisplay(paid.amount, paid.currency) : offer.total,
    supplierAmount: paid ? paid.amount.toFixed(paid.dp) : offer.supplierAmount,
    supplierCurrency: paid?.currency || offer.supplierCurrency,
    slices: offer.slices,
    owner: offer.owner,
    passengers: (t?.travelers || []).map((p: J) => ({
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      type: String(p.passenger_type || "adult").toLowerCase(),
    })),
    services: [],
    contactEmail: t?.contact?.email || "",
    live: e === "prod",
    provider: "jinko",
  };
}

/** test / live for a Jinko offer or order ID, from the environment its fare came from. */
export function jinkoModeForId(id: string): "test" | "live" {
  const offer = id.startsWith(JINKO_OFFER_PREFIX) ? unseal<Snapshot>(OFFER_PURPOSE, id.slice(JINKO_OFFER_PREFIX.length)) : null;
  const snap = offer ?? readOrderId(id)?.snap ?? null;
  return modeOf(snap ? envOf(snap) : "sandbox");
}

export const jinkoProvider: FlightProvider = {
  name: "jinko",
  live: true,
  async searchPlaces() {
    return [];
  },
  search,
  async getOffer(id) {
    return { offer: toOffer(readOfferId(id), id), baggage: [] };
  },
  async getSeatMaps() {
    return [];
  },
  async createOrder() {
    // Jinko fares are paid on Jinko's hosted page: see startJinkoCheckout.
    throw new ProviderError("This fare is paid on the supplier's secure checkout page.", 400);
  },
  getOrder,
  async listOrders() {
    // Jinko can't list trips by email, and trip27 has no database.
    return [];
  },
};
