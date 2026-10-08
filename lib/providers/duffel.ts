import "server-only";
import { round2, serviceFee, toDisplay } from "../money";
import {
  ProviderError,
  type BaggageService,
  type Carrier,
  type CreateOrderInput,
  type Endpoint,
  type Offer,
  type Order,
  type Place,
  type SearchParams,
  type SeatElement,
  type SeatMap,
  type Slice,
} from "../types";
import type { FlightProvider } from "./types";

// ---------------------------------------------------------------------------
// Duffel provider — https://duffel.com/docs/api
// All calls run on the server; the access token never reaches the browser.
// ---------------------------------------------------------------------------

const API = "https://api.duffel.com";
const LOGO = (code: string) =>
  `https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/${code}.svg`;

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

async function duffel<T = J>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) throw new ProviderError("Duffel is not configured.", 500);
  const res = await fetch(API + path, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Duffel-Version": "v2",
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify({ data: init.body }) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: J = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const err = json?.errors?.[0];
    const msg = err?.message || err?.title || `Supplier error (${res.status})`;
    console.error("[duffel]", init.method || "GET", path, res.status, JSON.stringify(json?.errors ?? text).slice(0, 800));
    throw new ProviderError(msg, res.status === 404 ? 404 : res.status >= 500 ? 502 : 400);
  }
  return json?.data as T;
}

// ISO-8601 duration (e.g. P1DT2H35M) to minutes
function isoMinutes(d: string | null | undefined) {
  if (!d) return 0;
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(d);
  if (!m) return 0;
  return Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

function carrier(c: J): Carrier {
  return { code: c?.iata_code || "", name: c?.name || "", logo: c?.logo_symbol_url || (c?.iata_code ? LOGO(c.iata_code) : "") };
}

function endpoint(p: J, terminal?: string | null): Endpoint {
  return { code: p?.iata_code || "", name: p?.name || "", city: p?.city_name || p?.city?.name || p?.name || "", terminal: terminal ?? null };
}

function minutesBetweenLocal(a: string, b: string) {
  return Math.round((Date.parse(b.slice(0, 16) + ":00Z") - Date.parse(a.slice(0, 16) + ":00Z")) / 60000);
}

function normSlice(s: J, idx: number): Slice {
  const segs = (s.segments || []).map((g: J) => {
    const pax0 = g.passengers?.[0];
    const bags = pax0?.baggages || [];
    const checked = bags.filter((b: J) => b.type === "checked").reduce((n: number, b: J) => n + (b.quantity || 0), 0);
    const carry = bags.filter((b: J) => b.type === "carry_on").reduce((n: number, b: J) => n + (b.quantity || 0), 0);
    return {
      id: g.id,
      origin: endpoint(g.origin, g.origin_terminal),
      destination: endpoint(g.destination, g.destination_terminal),
      departingAt: g.departing_at,
      arrivingAt: g.arriving_at,
      durationMin: isoMinutes(g.duration) || minutesBetweenLocal(g.departing_at, g.arriving_at),
      carrier: carrier(g.marketing_carrier),
      operatingCarrier: g.operating_carrier && g.operating_carrier.iata_code !== g.marketing_carrier?.iata_code ? carrier(g.operating_carrier) : null,
      flightNumber: `${g.marketing_carrier?.iata_code ?? ""} ${g.marketing_carrier_flight_number ?? ""}`.trim(),
      aircraft: g.aircraft?.name || "",
      cabin: pax0?.cabin_class_marketing_name || pax0?.cabin_class || "",
      checkedBags: checked,
      carryOnBags: carry,
    };
  });
  const first = segs[0];
  const last = segs[segs.length - 1];
  return {
    id: s.id || `sli_${idx}`,
    origin: endpoint(s.origin, first?.origin.terminal),
    destination: endpoint(s.destination, last?.destination.terminal),
    departingAt: first?.departingAt,
    arrivingAt: last?.arrivingAt,
    durationMin: isoMinutes(s.duration) || segs.reduce((n: number, x: { durationMin: number }) => n + x.durationMin, 0),
    stops: Math.max(0, segs.length - 1),
    segments: segs,
    fareBrand: s.fare_brand_name || null,
  };
}

function normOffer(o: J): Offer {
  const fee = serviceFee();
  const total = toDisplay(o.total_amount, o.total_currency);
  const slices: Slice[] = (o.slices || []).map(normSlice);
  const refund = o.conditions?.refund_before_departure;
  const change = o.conditions?.change_before_departure;
  const brand = slices.map((s) => s.fareBrand).filter(Boolean)[0] || slices[0]?.segments[0]?.cabin || "Standard";
  return {
    id: o.id,
    total: { amount: round2(total.amount + (total.currency === fee.currency ? fee.amount : 0)), currency: total.currency },
    base: o.base_amount ? toDisplay(o.base_amount, o.base_currency || o.total_currency) : null,
    tax: o.tax_amount ? toDisplay(o.tax_amount, o.tax_currency || o.total_currency) : null,
    serviceFee: total.currency === fee.currency ? fee : { amount: 0, currency: total.currency },
    supplierAmount: o.total_amount,
    supplierCurrency: o.total_currency,
    owner: carrier(o.owner),
    slices,
    passengers: (o.passengers || []).map((p: J) => ({ id: p.id, type: p.type || (p.age != null && p.age < 2 ? "infant_without_seat" : p.age != null && p.age < 12 ? "child" : "adult"), age: p.age ?? undefined })),
    conditions: {
      refundable: refund ? !!refund.allowed : null,
      refundPenalty: refund?.penalty_amount ? toDisplay(refund.penalty_amount, refund.penalty_currency) : null,
      changeable: change ? !!change.allowed : null,
      changePenalty: change?.penalty_amount ? toDisplay(change.penalty_amount, change.penalty_currency) : null,
    },
    expiresAt: o.expires_at || null,
    requiresDocuments: !!o.passenger_identity_documents_required,
    fareBrand: brand,
    itineraryKey:
      (o.owner?.iata_code || "") +
      ":" +
      slices.map((s) => s.segments.map((g) => g.flightNumber + g.departingAt).join(",")).join("|"),
    checkedBags: slices[0]?.segments[0]?.checkedBags ?? 0,
    carryOnBags: slices[0]?.segments[0]?.carryOnBags ?? 0,
  };
}

function normBaggage(o: J, offer: Offer): BaggageService[] {
  const segLabel = (ids: string[]) => {
    const slice = offer.slices.find((s) => s.segments.some((g) => ids.includes(g.id)));
    return slice ? `${slice.origin.code} → ${slice.destination.code}` : "";
  };
  return (o.available_services || [])
    .filter((s: J) => s.type === "baggage")
    .map((s: J) => {
      const kind = s.metadata?.type === "carry_on" ? "Extra cabin bag" : "Extra checked bag";
      const kg = s.metadata?.maximum_weight_kg ? `, ${s.metadata.maximum_weight_kg} kg` : "";
      return {
        id: s.id,
        label: `${kind}${kg} — ${segLabel(s.segment_ids || [])}`,
        price: toDisplay(s.total_amount, s.total_currency),
        supplierAmount: s.total_amount,
        maxQuantity: s.maximum_quantity || 1,
        passengerIds: s.passenger_ids || [],
        segmentIds: s.segment_ids || [],
      };
    });
}

function normOrder(o: J, contactEmail: string): Order {
  const total = toDisplay(o.total_amount, o.total_currency);
  const fee = serviceFee();
  return {
    id: o.id,
    bookingReference: o.booking_reference,
    status: o.payment_status?.awaiting_payment ? "pending" : "confirmed",
    createdAt: o.created_at,
    total: { amount: round2(total.amount + (total.currency === fee.currency ? fee.amount : 0)), currency: total.currency },
    supplierAmount: o.total_amount,
    supplierCurrency: o.total_currency,
    slices: (o.slices || []).map(normSlice),
    owner: carrier(o.owner),
    passengers: (o.passengers || []).map((p: J) => ({
      name: `${(p.title || "").toUpperCase()} ${p.given_name} ${p.family_name}`.trim(),
      type: p.type || "adult",
    })),
    services: (o.services || []).map((s: J) => ({
      label: s.type === "seat" ? `Seat ${s.metadata?.designator ?? ""}`.trim() : s.type === "baggage" ? "Extra bag" : s.type,
      quantity: s.quantity || 1,
    })),
    contactEmail: contactEmail || o.passengers?.[0]?.email || "",
    live: o.live_mode === true,
  };
}

export const duffelProvider: FlightProvider = {
  name: "duffel",
  live: true,

  async searchPlaces(q) {
    if (q.trim().length < 2) return [];
    const data = await duffel<J[]>(`/places/suggestions?query=${encodeURIComponent(q.trim())}`);
    const out: Place[] = [];
    for (const p of data || []) {
      if (p.type === "city") {
        out.push({ code: p.iata_code, name: "All airports", city: p.name, country: p.iata_country_code, type: "city" });
        for (const a of p.airports || []) {
          out.push({ code: a.iata_code, name: a.name, city: a.city_name || p.name, country: a.iata_country_code, type: "airport" });
        }
      } else if (p.iata_code) {
        out.push({ code: p.iata_code, name: p.name, city: p.city_name || p.city?.name || p.name, country: p.iata_country_code, type: "airport" });
      }
    }
    const seen = new Set<string>();
    return out.filter((p) => (seen.has(p.type + p.code) ? false : (seen.add(p.type + p.code), true))).slice(0, 10);
  },

  async search(p: SearchParams) {
    const passengers = [
      ...Array.from({ length: p.adults }, () => ({ type: "adult" })),
      ...Array.from({ length: p.children }, () => ({ age: 8 })),
      ...Array.from({ length: p.infants }, () => ({ age: 1 })),
    ];
    const data = await duffel<J>(`/air/offer_requests?return_offers=true&supplier_timeout=25000`, {
      method: "POST",
      body: {
        slices: p.slices.map((s) => ({ origin: s.origin, destination: s.destination, departure_date: s.date })),
        passengers,
        cabin_class: p.cabin,
        max_connections: 2,
      },
    });
    return (data?.offers || []).map(normOffer);
  },

  async getOffer(offerId) {
    const o = await duffel<J>(`/air/offers/${encodeURIComponent(offerId)}?return_available_services=true`);
    const offer = normOffer(o);
    return { offer, baggage: normBaggage(o, offer) };
  },

  async getSeatMaps(offerId) {
    let data: J[] = [];
    try {
      data = await duffel<J[]>(`/air/seat_maps?offer_id=${encodeURIComponent(offerId)}`);
    } catch (e) {
      // Many airlines don't provide seat maps; treat as "no seat selection".
      console.warn("[duffel] seat maps unavailable", (e as Error).message);
      return [];
    }
    return (data || []).map((m: J) => ({
      id: m.id,
      segmentId: m.segment_id,
      sliceId: m.slice_id,
      cabins: (m.cabins || []).map((c: J) => ({
        cabinClass: c.cabin_class,
        aisles: c.aisles ?? 1,
        rows: (c.rows || []).map((r: J) => ({
          sections: (r.sections || []).map((s: J) => ({
            elements: (s.elements || []).map(
              (e: J): SeatElement => ({
                type: e.type,
                designator: e.designator,
                disclosures: e.disclosures,
                services: (e.available_services || []).map((sv: J) => ({
                  id: sv.id,
                  passengerId: sv.passenger_id,
                  price: toDisplay(sv.total_amount, sv.total_currency),
                  supplierAmount: sv.total_amount,
                })),
              })
            ),
          })),
        })),
      })),
    }));
  },

  async createOrder(input: CreateOrderInput) {
    // Always re-fetch the offer so prices come from the supplier, never the browser.
    const raw = await duffel<J>(`/air/offers/${encodeURIComponent(input.offerId)}?return_available_services=true`);
    const svcPrices = new Map<string, number>();
    for (const s of raw.available_services || []) svcPrices.set(s.id, Number(s.total_amount));
    // Seat prices only come from the seat map.
    const needsSeatLookup = input.services.some((s) => !svcPrices.has(s.id));
    if (needsSeatLookup) {
      const maps = await duffel<J[]>(`/air/seat_maps?offer_id=${encodeURIComponent(input.offerId)}`).catch(() => []);
      for (const m of maps || [])
        for (const c of m.cabins || [])
          for (const r of c.rows || [])
            for (const s of r.sections || [])
              for (const e of s.elements || [])
                for (const sv of e.available_services || []) svcPrices.set(sv.id, Number(sv.total_amount));
    }
    let extras = 0;
    for (const s of input.services) {
      const unit = svcPrices.get(s.id);
      if (unit == null) throw new ProviderError("One of the selected extras is no longer available. Please go back and reselect.");
      extras += unit * s.quantity;
    }
    const amount = (Number(raw.total_amount) + extras).toFixed(2);

    const passengers = input.passengers.map((p) => ({
      id: p.id,
      title: p.title,
      gender: p.gender,
      given_name: p.givenName.trim(),
      family_name: p.familyName.trim(),
      born_on: p.bornOn,
      email: p.email || input.contact.email,
      phone_number: p.phone || input.contact.phone,
      ...(p.infantPassengerId ? { infant_passenger_id: p.infantPassengerId } : {}),
      ...(p.passportNumber
        ? {
            identity_documents: [
              {
                type: "passport",
                unique_identifier: p.passportNumber.trim(),
                issuing_country_code: (p.passportCountry || "").toUpperCase(),
                expires_on: p.passportExpiry,
              },
            ],
          }
        : {}),
    }));

    const order = await duffel<J>(`/air/orders`, {
      method: "POST",
      body: {
        type: "instant",
        selected_offers: [input.offerId],
        passengers,
        services: input.services.map((s) => ({ id: s.id, quantity: s.quantity })),
        payments: [{ type: "balance", currency: raw.total_currency, amount }],
        metadata: { source: "trip27" },
      },
    });
    return normOrder(order, input.contact.email);
  },

  async getOrder(id) {
    try {
      const o = await duffel<J>(`/air/orders/${encodeURIComponent(id)}`);
      return normOrder(o, "");
    } catch (e) {
      if (e instanceof ProviderError && e.status === 404) return null;
      throw e;
    }
  },
};
