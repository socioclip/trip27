import "server-only";
import { CITY_CODES, airport, distanceKm, searchLocalAirports } from "../airports";
import { round2, serviceFee, toDisplay } from "../money";
import {
  ProviderError,
  type BaggageService,
  type Carrier,
  type CreateOrderInput,
  type Offer,
  type OfferDetails,
  type OfferPassenger,
  type Order,
  type SearchParams,
  type SeatElement,
  type SeatMap,
  type Segment,
  type Slice,
} from "../types";
import type { FlightProvider } from "./types";

// ---------------------------------------------------------------------------
// Demo provider: deterministic, realistic-looking flights so the whole flow can
// be used without a supplier account. Offer IDs encode the search, so the
// provider is stateless (works on serverless hosting).
// ---------------------------------------------------------------------------

const LOGO = (code: string) =>
  `https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/${code}.svg`;

interface Airline {
  code: string;
  name: string;
  hub: string;
  lcc?: boolean;
  wide?: boolean;
}

const AIRLINES: Airline[] = [
  { code: "EK", name: "Emirates", hub: "DXB", wide: true },
  { code: "EY", name: "Etihad Airways", hub: "AUH", wide: true },
  { code: "FZ", name: "flydubai", hub: "DXB", lcc: true },
  { code: "G9", name: "Air Arabia", hub: "SHJ", lcc: true },
  { code: "QR", name: "Qatar Airways", hub: "DOH", wide: true },
  { code: "SV", name: "Saudia", hub: "JED", wide: true },
  { code: "XY", name: "flynas", hub: "RUH", lcc: true },
  { code: "GF", name: "Gulf Air", hub: "BAH" },
  { code: "WY", name: "Oman Air", hub: "MCT" },
  { code: "KU", name: "Kuwait Airways", hub: "KWI" },
  { code: "RJ", name: "Royal Jordanian", hub: "AMM" },
  { code: "MS", name: "EgyptAir", hub: "CAI" },
  { code: "TK", name: "Turkish Airlines", hub: "IST", wide: true },
  { code: "PC", name: "Pegasus Airlines", hub: "SAW", lcc: true },
  { code: "BA", name: "British Airways", hub: "LHR", wide: true },
  { code: "LH", name: "Lufthansa", hub: "FRA", wide: true },
  { code: "AF", name: "Air France", hub: "CDG", wide: true },
  { code: "KL", name: "KLM", hub: "AMS", wide: true },
  { code: "AI", name: "Air India", hub: "DEL", wide: true },
  { code: "6E", name: "IndiGo", hub: "BOM", lcc: true },
  { code: "PK", name: "PIA", hub: "KHI" },
  { code: "TG", name: "Thai Airways", hub: "BKK", wide: true },
  { code: "SQ", name: "Singapore Airlines", hub: "SIN", wide: true },
  { code: "CX", name: "Cathay Pacific", hub: "HKG", wide: true },
  { code: "ET", name: "Ethiopian Airlines", hub: "ADD", wide: true },
];
const GULF_HUBS = ["EK", "EY", "QR", "TK", "SV", "GF", "WY"];

function carrier(a: Airline): Carrier {
  return { code: a.code, name: a.name, logo: LOGO(a.code) };
}

// --- seeded RNG ------------------------------------------------------------
function hash(s: string) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- encoding --------------------------------------------------------------
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const unb64 = <T,>(s: string): T => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

interface OfferKey {
  p: SearchParams;
  i: number; // itinerary index
  b: number; // brand index
}

// --- geometry & time helpers ---------------------------------------------------
function resolveAirport(code: string) {
  const c = code.toUpperCase();
  const city = CITY_CODES[c];
  const a = airport(city ? city.airports[0] : c);
  if (!a) throw new ProviderError(`Demo mode doesn't know the airport "${code}". Try a major airport such as DXB, LHR or BOM.`);
  return a;
}

function addMinutes(localIso: string, min: number) {
  const t = Date.parse(localIso + "Z") + min * 60000;
  return new Date(t).toISOString().slice(0, 19);
}

function flightMinutes(fromCode: string, toCode: string) {
  const a = resolveAirport(fromCode);
  const b = resolveAirport(toCode);
  const km = distanceKm(a, b);
  return Math.max(45, Math.round((km / 820) * 60 + 30));
}

function endpoint(code: string) {
  const a = resolveAirport(code);
  return { code: a.code, name: a.name, city: a.city, terminal: String(1 + (hash(a.code) % 3)) };
}

// --- itinerary generation --------------------------------------------------------
interface SliceOption {
  airline: Airline;
  route: string[]; // airports
  depMin: number; // minutes after midnight
  layovers: number[];
}

function sliceOptions(origin: string, destination: string, date: string, seed: string): SliceOption[] {
  const r = rng(seed);
  const o = resolveAirport(origin).code;
  const d = resolveAirport(destination).code;
  if (o === d) throw new ProviderError("Origin and destination must be different.");
  const km = distanceKm(resolveAirport(o), resolveAirport(d));
  const opts: SliceOption[] = [];
  const depSlots = () => Math.round((r() * 22 + 0.5) * 12) * 5; // 5-minute grid

  // Direct services by airlines based at either end.
  const based = AIRLINES.filter((a) => a.hub === o || a.hub === d || (a.code === "FZ" && (o === "DXB" || d === "DXB")));
  for (const a of based) {
    if (a.lcc && km > 5000) continue;
    const n = km < 2500 ? 2 + Math.floor(r() * 3) : 1 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) opts.push({ airline: a, route: [o, d], depMin: depSlots(), layovers: [] });
  }
  // A couple of extra direct carriers on popular short/medium routes.
  if (km < 4500) {
    const extra = AIRLINES.filter((a) => !based.includes(a) && (a.code === "EK" || a.code === "FZ" || a.code === "G9"));
    for (const a of extra) {
      if (r() < 0.35) opts.push({ airline: a, route: [o, d], depMin: depSlots(), layovers: [] });
    }
  }
  // Connections through big hubs.
  for (const a of AIRLINES) {
    if (a.hub === o || a.hub === d) continue;
    const hub = a.hub;
    if (!airport(hub)) continue;
    const viaKm = distanceKm(resolveAirport(o), airport(hub)!) + distanceKm(airport(hub)!, resolveAirport(d));
    if (viaKm > km * 1.6 + 600) continue;
    const weight = GULF_HUBS.includes(a.code) ? 0.9 : 0.45;
    if (r() > weight) continue;
    const n = 1 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      opts.push({
        airline: a,
        route: [o, hub, d],
        depMin: depSlots(),
        layovers: [70 + Math.round(r() * 30) * 10],
      });
    }
  }
  // Occasional two-stop options for variety on long routes.
  if (km > 3000 && opts.length < 14) {
    const a = AIRLINES[Math.floor(r() * AIRLINES.length)];
    const hub2 = ["IST", "DOH", "FRA", "BAH"].find((h) => h !== o && h !== d && h !== a.hub) || "IST";
    if (a.hub !== o && a.hub !== d && a.hub !== hub2) {
      opts.push({ airline: a, route: [o, a.hub, hub2, d], depMin: depSlots(), layovers: [95, 140] });
    }
  }
  if (!opts.length) {
    const a = AIRLINES[Math.floor(r() * 4)];
    opts.push({ airline: a, route: [o, a.hub === o || a.hub === d ? d : a.hub, d].filter((x, i, arr) => arr.indexOf(x) === i), depMin: depSlots(), layovers: [120] });
  }
  void date;
  return opts;
}

function buildSlice(opt: SliceOption, date: string, cabin: string, sliceIdx: number, brand: Brand): Slice {
  const segments: Segment[] = [];
  let t = `${date}T${String(Math.floor(opt.depMin / 60) % 24).padStart(2, "0")}:${String(opt.depMin % 60).padStart(2, "0")}:00`;
  const fnSeed = rng(`${opt.airline.code}${opt.route.join("")}${opt.depMin}`);
  let total = 0;
  for (let s = 0; s < opt.route.length - 1; s++) {
    const from = opt.route[s];
    const to = opt.route[s + 1];
    const fm = flightMinutes(from, to);
    const tzDiff = (resolveAirport(to).tz - resolveAirport(from).tz) * 60;
    const arr = addMinutes(t, fm + tzDiff);
    const longHaul = fm > 300;
    segments.push({
      id: `seg_${sliceIdx}_${s}`,
      origin: endpoint(from),
      destination: endpoint(to),
      departingAt: t,
      arrivingAt: arr,
      durationMin: fm,
      carrier: carrier(opt.airline),
      operatingCarrier: null,
      flightNumber: `${opt.airline.code} ${100 + Math.floor(fnSeed() * 899)}`,
      aircraft: opt.airline.lcc
        ? "Boeing 737 MAX 8"
        : longHaul && opt.airline.wide
          ? fnSeed() > 0.5 ? "Boeing 777-300ER" : "Airbus A350-900"
          : "Airbus A321neo",
      cabin: cabinName(cabin),
      checkedBags: brand.bags,
      carryOnBags: 1,
    });
    total += fm;
    if (s < opt.layovers.length) {
      total += opt.layovers[s] + 0;
      t = addMinutes(arr, opt.layovers[s]);
    }
  }
  const first = segments[0];
  const last = segments[segments.length - 1];
  // Elapsed time accounts for timezones, so compute from UTC.
  const depUtc = Date.parse(first.departingAt + "Z") - resolveAirport(first.origin.code).tz * 3600000;
  const arrUtc = Date.parse(last.arrivingAt + "Z") - resolveAirport(last.destination.code).tz * 3600000;
  return {
    id: `sli_${sliceIdx}`,
    origin: first.origin,
    destination: last.destination,
    departingAt: first.departingAt,
    arrivingAt: last.arrivingAt,
    durationMin: Math.round((arrUtc - depUtc) / 60000) || total,
    stops: segments.length - 1,
    segments,
    fareBrand: brand.name,
  };
}

function cabinName(c: string) {
  return { economy: "Economy", premium_economy: "Premium Economy", business: "Business", first: "First" }[c] || "Economy";
}

interface Brand {
  name: string;
  mult: number;
  bags: number;
  refundable: boolean;
  refundPenalty: number | null;
  changeable: boolean;
  changePenalty: number | null;
}

function brandsFor(a: Airline, cabin: string): Brand[] {
  if (cabin === "business" || cabin === "first") {
    const label = cabin === "first" ? "First" : "Business";
    return [
      { name: `${label} Saver`, mult: 1, bags: 2, refundable: true, refundPenalty: 600, changeable: true, changePenalty: 300 },
      { name: `${label} Flex`, mult: 1.22, bags: 2, refundable: true, refundPenalty: 0, changeable: true, changePenalty: 0 },
    ];
  }
  if (a.lcc) {
    return [
      { name: "Lite", mult: 1, bags: 0, refundable: false, refundPenalty: null, changeable: true, changePenalty: 150 },
      { name: "Value", mult: 1.18, bags: 1, refundable: false, refundPenalty: null, changeable: true, changePenalty: 75 },
      { name: "Flex", mult: 1.42, bags: 1, refundable: true, refundPenalty: 100, changeable: true, changePenalty: 0 },
    ];
  }
  return [
    { name: "Economy Light", mult: 1, bags: 0, refundable: false, refundPenalty: null, changeable: true, changePenalty: 250 },
    { name: "Economy Classic", mult: 1.14, bags: 1, refundable: true, refundPenalty: 300, changeable: true, changePenalty: 150 },
    { name: "Economy Flex", mult: 1.36, bags: 2, refundable: true, refundPenalty: 0, changeable: true, changePenalty: 0 },
  ];
}

function passengersFor(p: SearchParams): OfferPassenger[] {
  const out: OfferPassenger[] = [];
  for (let i = 0; i < p.adults; i++) out.push({ id: `pas_a${i}`, type: "adult" });
  for (let i = 0; i < p.children; i++) out.push({ id: `pas_c${i}`, type: "child", age: 8 });
  for (let i = 0; i < p.infants; i++) out.push({ id: `pas_i${i}`, type: "infant_without_seat", age: 1 });
  return out;
}

interface Itinerary {
  airline: Airline;
  options: SliceOption[];
  basePerAdult: number; // AED
}

function itineraries(p: SearchParams): Itinerary[] {
  const seedBase = JSON.stringify(p.slices) + p.cabin;
  const perSlice = p.slices.map((s, i) => sliceOptions(s.origin, s.destination, s.date, `${seedBase}|${i}`));
  const r = rng(seedBase + "combo");
  const result: Itinerary[] = [];
  const cabinMult = { economy: 1, premium_economy: 1.7, business: 3.6, first: 6 }[p.cabin] ?? 1;

  // Group by airline; airlines that can fly every slice produce combos.
  const airlines = new Set(perSlice[0].map((o) => o.airline.code));
  for (const code of airlines) {
    const lists = perSlice.map((opts) => opts.filter((o) => o.airline.code === code));
    if (lists.some((l) => !l.length)) continue;
    const combos = Math.min(4, lists.reduce((n, l) => n * l.length, 1));
    const seen = new Set<string>();
    for (let k = 0; k < combos * 2 && seen.size < combos; k++) {
      const pick = lists.map((l) => l[Math.floor(r() * l.length)]);
      const key = pick.map((x) => x.route.join("-") + x.depMin).join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const airline = pick[0].airline;
      const km = p.slices.reduce((sum, s) => sum + distanceKm(resolveAirport(s.origin), resolveAirport(s.destination)), 0);
      const stopsPenalty = pick.reduce((n, x) => n + (x.route.length - 2), 0);
      let base = 180 + km * (airline.lcc ? 0.17 : 0.24);
      base *= 1 - stopsPenalty * 0.07;
      base *= 0.85 + r() * 0.45;
      base *= cabinMult;
      result.push({ airline, options: pick, basePerAdult: Math.round(base / 5) * 5 });
    }
  }
  if (!result.length) {
    const pick = perSlice.map((l) => l[0]);
    result.push({ airline: pick[0].airline, options: pick, basePerAdult: 900 * cabinMult });
  }
  return result;
}

function buildOffer(p: SearchParams, i: number, b: number, its?: Itinerary[]): Offer {
  const list = its ?? itineraries(p);
  const it = list[i];
  if (!it) throw new ProviderError("This fare is no longer available. Please search again.", 404);
  const brands = brandsFor(it.airline, p.cabin);
  const brand = brands[b];
  if (!brand) throw new ProviderError("This fare is no longer available. Please search again.", 404);
  const slices = it.options.map((o, idx) => buildSlice(o, p.slices[idx].date, p.cabin, idx, brand));
  const pax = passengersFor(p);
  const perAdult = it.basePerAdult * brand.mult;
  const fare = Math.round(perAdult * p.adults + perAdult * 0.75 * p.children + perAdult * 0.1 * p.infants);
  const tax = Math.round(fare * 0.18 + 75 * (p.adults + p.children) * p.slices.length);
  const totalAed = round2(fare + tax);
  const fee = serviceFee();
  const t = toDisplay(totalAed, "AED");
  const id = "demo_" + b64({ p, i, b } satisfies OfferKey);
  const created = new Date();
  return {
    id,
    total: { amount: round2(t.amount + fee.amount), currency: t.currency },
    base: toDisplay(fare, "AED"),
    tax: toDisplay(tax, "AED"),
    serviceFee: fee,
    supplierAmount: totalAed.toFixed(2),
    supplierCurrency: "AED",
    owner: carrier(it.airline),
    slices,
    passengers: pax,
    conditions: {
      refundable: brand.refundable,
      refundPenalty: brand.refundPenalty == null ? null : toDisplay(brand.refundPenalty, "AED"),
      changeable: brand.changeable,
      changePenalty: brand.changePenalty == null ? null : toDisplay(brand.changePenalty, "AED"),
    },
    expiresAt: new Date(created.getTime() + 30 * 60000).toISOString(),
    requiresDocuments: p.slices.some((s) => resolveAirport(s.origin).country !== resolveAirport(s.destination).country),
    fareBrand: brand.name,
    itineraryKey: `${it.airline.code}:${slices.map((s) => s.segments.map((g) => g.flightNumber + g.departingAt).join(",")).join("|")}`,
    checkedBags: brand.bags,
    carryOnBags: 1,
  };
}

function decode(offerId: string): OfferKey {
  if (!offerId.startsWith("demo_")) throw new ProviderError("Unknown offer.", 404);
  try {
    return unb64<OfferKey>(offerId.slice(5));
  } catch {
    throw new ProviderError("Unknown offer.", 404);
  }
}

function baggageFor(offer: Offer): BaggageService[] {
  const out: BaggageService[] = [];
  offer.slices.forEach((s, si) => {
    const km = s.segments.reduce((n, g) => n + g.durationMin, 0);
    const price = Math.round((95 + km * 0.35) / 5) * 5;
    for (const p of offer.passengers) {
      if (p.type === "infant_without_seat") continue;
      out.push({
        id: `bag_${si}_${p.id}`,
        label: `Extra checked bag, 23 kg — ${s.origin.code} → ${s.destination.code}`,
        price: toDisplay(price, "AED"),
        supplierAmount: price.toFixed(2),
        maxQuantity: 2,
        passengerIds: [p.id],
        segmentIds: s.segments.map((g) => g.id),
      });
    }
  });
  return out;
}

function seatMapsFor(offer: Offer): SeatMap[] {
  const maps: SeatMap[] = [];
  const cabin = offer.slices[0]?.segments[0]?.cabin || "Economy";
  const premium = /Business|First/.test(cabin);
  offer.slices.forEach((s, si) => {
    s.segments.forEach((g) => {
      const r = rng(offer.itineraryKey + g.id);
      const wide = /777|A350|787|A380/.test(g.aircraft);
      const letters = premium ? (wide ? ["A", "D", "G", "K"] : ["A", "C", "D", "F"]) : wide ? ["A", "B", "C", "D", "E", "F", "G", "H", "K"] : ["A", "B", "C", "D", "E", "F"];
      const groups = premium ? (wide ? [1, 2, 1] : [2, 2]) : wide ? [3, 3, 3] : [3, 3];
      const firstRow = premium ? 1 : wide ? 20 : 8;
      const rowsN = premium ? 8 : wide ? 32 : 24;
      const rows = [];
      for (let ri = 0; ri < rowsN; ri++) {
        const rowNo = firstRow + ri;
        const exit = !premium && (ri === 4 || ri === 15);
        const sections: { elements: SeatElement[] }[] = [];
        let li = 0;
        for (const size of groups) {
          const elements: SeatElement[] = [];
          for (let k = 0; k < size; k++) {
            const letter = letters[li++];
            const designator = `${rowNo}${letter}`;
            const available = r() > 0.38;
            const window = letter === letters[0] || letter === letters[letters.length - 1];
            const aisleOrWindow = window || letters.indexOf(letter) % 3 !== 1;
            const price = premium ? 0 : exit ? 120 : ri < 5 ? 75 : ri > rowsN - 10 ? 0 : aisleOrWindow ? 35 : 0;
            elements.push({
              type: "seat",
              designator,
              disclosures: exit ? ["Exit row: you must be over 15 and able to assist in an emergency."] : undefined,
              services: available
                ? offer.passengers
                    .filter((p) => p.type !== "infant_without_seat")
                    .map((p) => ({
                      id: `seat_${si}_${g.id}_${designator}_${p.id}`,
                      passengerId: p.id,
                      price: toDisplay(price, "AED"),
                      supplierAmount: price.toFixed(2),
                    }))
                : [],
            });
          }
          sections.push({ elements });
        }
        if (exit) rows.push({ sections: groups.map(() => ({ elements: [{ type: "exit_row" as const, services: [] }] })) });
        rows.push({ sections });
      }
      maps.push({ id: `sm_${g.id}`, segmentId: g.id, sliceId: s.id, cabins: [{ cabinClass: cabin, aisles: groups.length - 1, rows }] });
    });
  });
  return maps;
}

// In-memory order store (demo only; resets when the server restarts).
const g = globalThis as unknown as { __trip27Orders?: Map<string, Order> };
const ORDERS = (g.__trip27Orders ??= new Map<string, Order>());

function bookingRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export const demoProvider: FlightProvider = {
  name: "demo",
  live: false,

  async searchPlaces(q) {
    return searchLocalAirports(q, 8);
  },

  async search(p) {
    p.slices.forEach((s) => {
      resolveAirport(s.origin);
      resolveAirport(s.destination);
    });
    const its = itineraries(p);
    const offers: Offer[] = [];
    its.forEach((it, i) => {
      brandsFor(it.airline, p.cabin).forEach((_, b) => offers.push(buildOffer(p, i, b, its)));
    });
    await new Promise((r) => setTimeout(r, 450)); // feel like a real search
    return offers;
  },

  async getOffer(offerId) {
    const k = decode(offerId);
    const offer = buildOffer(k.p, k.i, k.b);
    return { offer, baggage: baggageFor(offer) };
  },

  async getSeatMaps(offerId) {
    const k = decode(offerId);
    return seatMapsFor(buildOffer(k.p, k.i, k.b));
  },

  async createOrder(input: CreateOrderInput) {
    const k = decode(input.offerId);
    const offer = buildOffer(k.p, k.i, k.b);
    // Validate services against the authoritative lists.
    const bags = new Map(baggageFor(offer).map((b) => [b.id, b]));
    const seats = new Map(
      seatMapsFor(offer).flatMap((m) =>
        m.cabins.flatMap((c) => c.rows.flatMap((r) => r.sections.flatMap((s) => s.elements.flatMap((e) => e.services.map((sv) => [sv.id, { sv, e }] as const)))))
      )
    );
    let extras = 0;
    const svcOut: Order["services"] = [];
    for (const s of input.services) {
      const bag = bags.get(s.id);
      const seat = seats.get(s.id);
      if (bag) {
        if (s.quantity < 1 || s.quantity > bag.maxQuantity) throw new ProviderError("Invalid baggage quantity.");
        extras += Number(bag.supplierAmount) * s.quantity;
        svcOut.push({ label: bag.label, quantity: s.quantity });
      } else if (seat) {
        extras += Number(seat.sv.supplierAmount);
        svcOut.push({ label: `Seat ${seat.e.designator}`, quantity: 1 });
      } else throw new ProviderError("One of the selected extras is no longer available.");
    }
    if (input.passengers.length !== offer.passengers.length) throw new ProviderError("Passenger details are incomplete.");
    const supplierTotal = Number(offer.supplierAmount) + extras;
    const disp = toDisplay(supplierTotal, "AED");
    const order: Order = {
      id: "ord_demo_" + Math.random().toString(36).slice(2, 12),
      bookingReference: bookingRef(),
      status: "confirmed",
      createdAt: new Date().toISOString(),
      total: { amount: round2(disp.amount + offer.serviceFee.amount), currency: disp.currency },
      supplierAmount: supplierTotal.toFixed(2),
      supplierCurrency: "AED",
      slices: offer.slices,
      owner: offer.owner,
      passengers: input.passengers.map((p) => ({ name: `${p.title.toUpperCase()} ${p.givenName} ${p.familyName}`, type: p.type })),
      services: svcOut,
      contactEmail: input.contact.email,
      live: false,
    };
    ORDERS.set(order.id, order);
    await new Promise((r) => setTimeout(r, 700));
    return order;
  },

  async getOrder(id) {
    return ORDERS.get(id) ?? null;
  },

  async listOrders(email) {
    const want = email.toLowerCase();
    return [...ORDERS.values()].filter((o) => o.contactEmail.toLowerCase() === want);
  },
};

