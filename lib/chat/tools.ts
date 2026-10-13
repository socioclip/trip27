import "server-only";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { getProvider, modeFor, providerMode, searchAll } from "../providers";
import { isJinkoId } from "../providers/jinko";
import { searchLocalAirports, CITY_CODES } from "../airports";
import { toQuery, validate, type TripType } from "../search";
import { applyFilters, emptyFilters, groupOffers, sortGroups, type SortKey } from "../group";
import { cabinLabel, duration, formatMoney, hhmm, prettyDate, stopsLabel, timeBucket, todayYmd } from "../format";
import type { CabinClass, ItineraryGroup, Offer, Place, SearchParams } from "../types";
import { ProviderError } from "../types";
import type { ChatEvent, ChatRef, OfferCard } from "./protocol";

// ---------------------------------------------------------------------------
// The assistant's tools. They wrap the same code the website uses, so chat
// results match normal search: the admin supplier switches, AED pricing and the
// service fee all apply. None of them books or takes payment: start_checkout
// only hands the chosen fare to the normal checkout page.
// ---------------------------------------------------------------------------

export const TOOLS: Tool[] = [
  {
    name: "find_airports",
    description:
      "Look up IATA airport or city codes by city, airport or country name. Use it whenever you are not certain of a code. Returns up to 8 matches.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "City, airport or country name, e.g. 'Tbilisi' or 'Sharjah'." } },
      required: ["query"],
    },
  },
  {
    name: "search_flights",
    description:
      "Search live fares on trip27 and show the best matches to the customer as cards they can book. Returns a compact summary with fare refs (F1, F2, …) for get_fare_details and start_checkout. Searches can take 10-25 seconds, so search only once you have origin, destination and dates.",
    input_schema: {
      type: "object",
      properties: {
        trip: { type: "string", enum: ["oneway", "round", "multi"], description: "round = two slices, outbound then return." },
        slices: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              origin: { type: "string", description: "3-letter IATA airport or city code." },
              destination: { type: "string", description: "3-letter IATA airport or city code." },
              date: { type: "string", description: "YYYY-MM-DD departure date (local)." },
            },
            required: ["origin", "destination", "date"],
          },
        },
        adults: { type: "integer", minimum: 1, maximum: 9 },
        children: { type: "integer", minimum: 0, maximum: 8, description: "Aged 2-11." },
        infants: { type: "integer", minimum: 0, maximum: 9, description: "Under 2, on an adult's lap." },
        cabin: { type: "string", enum: ["economy", "premium_economy", "business", "first"] },
        sort: { type: "string", enum: ["best", "cheapest", "fastest"], description: "Default best (price, duration and stops balanced)." },
        max_stops: { type: "integer", minimum: 0, maximum: 2, description: "0 = non-stop only." },
        max_price_aed: { type: "number", description: "Maximum total price in AED for all travellers." },
        checked_bag: { type: "boolean", description: "Only itineraries with a fare that includes a checked bag." },
        refundable: { type: "boolean", description: "Only itineraries with a refundable fare." },
        departure_time: {
          type: "string",
          enum: ["early", "morning", "afternoon", "evening"],
          description: "First flight departs: early 00-06, morning 06-12, afternoon 12-18, evening 18-24.",
        },
        return_departure_time: { type: "string", enum: ["early", "morning", "afternoon", "evening"], description: "Same, for the return flight of a round trip." },
        airline: { type: "string", description: "2-letter IATA code of the selling airline, e.g. EK, FZ, G9." },
        limit: { type: "integer", minimum: 1, maximum: 6, description: "How many itineraries to show (default 4)." },
      },
      required: ["trip", "slices"],
    },
  },
  {
    name: "get_fare_details",
    description:
      "Re-check one fare's current price and its full details: flight numbers, aircraft, baggage, refund and change rules, and when the price expires. Use before answering detailed questions about a fare.",
    input_schema: {
      type: "object",
      properties: { ref: { type: "string", description: "A fare ref from search_flights, e.g. F3." } },
      required: ["ref"],
    },
  },
  {
    name: "start_checkout",
    description:
      "When the customer has chosen a fare and wants to book it, show them a button that opens trip27's secure checkout with that fare. The checkout collects traveller details, seats, bags and payment. This does not book anything.",
    input_schema: {
      type: "object",
      properties: { ref: { type: "string", description: "The fare ref the customer chose, e.g. F2." } },
      required: ["ref"],
    },
  },
];

// Mark the end of the tool list for prompt caching (tools + system prompt are the same on every call).
TOOLS[TOOLS.length - 1] = { ...TOOLS[TOOLS.length - 1], cache_control: { type: "ephemeral" } };

export interface ToolContext {
  refs: Record<string, ChatRef>;
  emit: (e: ChatEvent) => void;
  searches: number;
}

export const MAX_SEARCHES_PER_MESSAGE = 3;

type Input = Record<string, unknown>;

export async function runTool(name: string, input: Input, ctx: ToolContext): Promise<string> {
  switch (name) {
    case "find_airports":
      return findAirports(String(input.query || ""));
    case "search_flights":
      return searchFlights(input, ctx);
    case "get_fare_details":
      return fareDetails(String(input.ref || ""), ctx);
    case "start_checkout":
      return startCheckout(String(input.ref || ""), ctx);
    default:
      throw new ProviderError(`Unknown tool ${name}.`);
  }
}

/** Short status line shown in the chat while a tool runs. */
export function toolStatus(name: string, input: Input): string {
  if (name === "search_flights") {
    const s = Array.isArray(input.slices) ? (input.slices as Input[]) : [];
    const route = s.length ? `${s[0].origin} → ${s[0].destination}` : "";
    return `Searching flights ${route}${s.length === 2 && input.trip === "round" ? " and back" : ""}…`;
  }
  if (name === "find_airports") return `Looking up "${String(input.query || "").slice(0, 40)}"…`;
  if (name === "get_fare_details") return "Checking the latest price and fare rules…";
  if (name === "start_checkout") return "Preparing checkout…";
  return "Working…";
}

// ---- find_airports ----------------------------------------------------------

async function findAirports(query: string): Promise<string> {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return "Give at least 2 characters.";
  let places: Place[] = [];
  try {
    places = await getProvider().searchPlaces(q);
  } catch {
    // fall back to the local list below
  }
  if (!places.length) places = searchLocalAirports(q, 8);
  const metro = Object.entries(CITY_CODES)
    .filter(([code, c]) => c.city.toLowerCase().startsWith(q.toLowerCase()) || code === q.toUpperCase())
    .map(([code, c]) => `${code} — all ${c.city} airports (${c.airports.join(", ")}), ${c.country} [city code]`);
  const lines = [...metro, ...places.slice(0, 8).map((p) => `${p.code} — ${p.name}, ${p.city}, ${p.country}${p.type === "city" ? " [city code]" : ""}`)];
  return lines.length ? lines.join("\n") : `No airports found for "${q}". Ask the customer to check the spelling or name a nearby city.`;
}

// ---- search_flights ---------------------------------------------------------

const CABINS: CabinClass[] = ["economy", "premium_economy", "business", "first"];
const BUCKETS = ["early", "morning", "afternoon", "evening"];
const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

function nextRef(refs: Record<string, ChatRef>) {
  let max = 0;
  for (const k of Object.keys(refs)) {
    const n = Number(k.slice(1));
    if (k.startsWith("F") && Number.isFinite(n) && n > max) max = n;
  }
  return () => `F${++max}`;
}

async function searchFlights(input: Input, ctx: ToolContext): Promise<string> {
  if (ctx.searches >= MAX_SEARCHES_PER_MESSAGE)
    return "Search limit for this message reached. Show the customer what you found so far and ask how they'd like to narrow it down.";
  ctx.searches++;

  const trip: TripType = input.trip === "round" || input.trip === "multi" ? input.trip : "oneway";
  const rawSlices = Array.isArray(input.slices) ? (input.slices as Input[]) : [];
  const slices = rawSlices.slice(0, 4).map((s) => ({
    origin: String(s.origin || "").trim().toUpperCase(),
    destination: String(s.destination || "").trim().toUpperCase(),
    date: String(s.date || "").trim(),
  }));
  const adults = int(input.adults, 1, 9, 1);
  const params: SearchParams = {
    slices,
    adults,
    children: int(input.children, 0, 8, 0),
    infants: int(input.infants, 0, adults, 0),
    cabin: CABINS.includes(input.cabin as CabinClass) ? (input.cabin as CabinClass) : "economy",
  };
  if (trip === "round" && slices.length !== 2) return "A round trip needs exactly two slices: outbound and return.";
  const err = validate(params);
  if (err) return `Can't search: ${err}`;
  if (slices[0].date < todayYmd()) return "Can't search: the departure date is in the past.";

  // The assistant only offers fares it can hand to checkout.
  const offers = (await searchAll(params)).filter((o) => o.bookable !== false);
  const mode = await providerMode();
  const qs = toQuery(params, trip);
  const searchUrl = `/flights?${qs}`;
  const travellers = params.adults + params.children + params.infants;
  if (!offers.length) {
    ctx.emit({ type: "offers", cards: [], refs: {}, total: 0, searchUrl, mode });
    return "No flights found for this search. Suggest nearby dates or airports.";
  }

  const f = emptyFilters();
  const maxStops = input.max_stops === undefined ? null : int(input.max_stops, 0, 2, 2);
  if (maxStops !== null && maxStops < 2) for (let i = 0; i <= maxStops; i++) f.stops.add(i);
  if (typeof input.max_price_aed === "number" && input.max_price_aed > 0) f.maxPrice = input.max_price_aed;
  if (input.checked_bag === true) f.bagIncluded = true;
  if (input.refundable === true) f.refundable = true;
  if (typeof input.airline === "string" && /^[A-Z0-9]{2}$/i.test(input.airline)) f.airlines.add(input.airline.toUpperCase());
  if (BUCKETS.includes(input.departure_time as string)) f.depTimes[0] = new Set([input.departure_time as string]);
  if (trip === "round" && BUCKETS.includes(input.return_departure_time as string)) f.depTimes[1] = new Set([input.return_departure_time as string]);

  const all = groupOffers(offers);
  const matching = applyFilters(all, f);
  const sort: SortKey = input.sort === "cheapest" || input.sort === "fastest" ? input.sort : "best";
  const shown = sortGroups(matching, sort).slice(0, int(input.limit, 1, 6, 4));

  const ref = nextRef(ctx.refs);
  const newRefs: Record<string, ChatRef> = {};
  const cards: OfferCard[] = shown.map((g) => {
    const fares = g.fares.slice(0, 4).map((o) => {
      const r = ref();
      newRefs[r] = { id: o.id, qs };
      return { ref: r, offer: o };
    });
    return {
      ref: fares[0].ref,
      offer: fares[0].offer,
      fares: fares.map(({ ref, offer }) => ({
        ref,
        brand: offer.fareBrand,
        price: offer.total,
        checkedBags: offer.checkedBags,
        refundable: offer.conditions.refundable,
      })),
      qs,
      travellers,
    };
  });
  Object.assign(ctx.refs, newRefs);
  ctx.emit({ type: "offers", cards, refs: newRefs, total: matching.length, searchUrl, mode });

  const cheapestAll = sortGroups(all, "cheapest")[0];
  const head = [
    `${matching.length} itineraries match${matching.length !== all.length ? ` (of ${all.length} found)` : ""}; showing ${shown.length} as cards, sorted ${sort}.`,
    `Prices are totals in ${cards[0]?.offer.total.currency || "AED"} for ${travellers} traveller${travellers > 1 ? "s" : ""}, taxes included.`,
    mode === "demo" ? "DEMO MODE: these are sample flights, not real fares." : mode === "test" ? "TEST MODE: supplier sandbox fares; bookings are not ticketed." : "",
    !matching.length ? `Nothing matched the filters. Cheapest without filters: ${formatMoney(cheapestAll.cheapest.total)} on ${cheapestAll.owner.name}.` : "",
  ].filter(Boolean);
  return [...head, ...shown.map((g, i) => describeGroup(g, cards[i], trip))].join("\n");
}

function sliceLine(s: Offer["slices"][number]) {
  const flights = s.segments.map((x) => x.flightNumber).join("/");
  const via = s.stops ? ` via ${s.segments.slice(0, -1).map((x) => x.destination.code).join(", ")}` : "";
  return `${prettyDate(s.departingAt)} ${s.origin.code} ${hhmm(s.departingAt)} → ${s.destination.code} ${hhmm(s.arrivingAt)} (${timeBucket(s.departingAt)}), ${stopsLabel(s.stops)}${via}, ${duration(s.durationMin)}, ${flights}`;
}

function describeGroup(g: ItineraryGroup, card: OfferCard, trip: TripType) {
  const labels = trip === "round" ? ["Out", "Return"] : g.slices.map((_, i) => (g.slices.length > 1 ? `Flight ${i + 1}` : "Flight"));
  const fares = card.fares
    .map((f) => {
      const o = g.fares.find((x) => x.fareBrand === f.brand)!;
      const bag = f.checkedBags > 0 ? `${f.checkedBags} checked bag` : "cabin bag only";
      const refund = f.refundable ? "refundable" : f.refundable === false ? "non-refundable" : "refund rules unknown";
      return `${f.ref} ${f.brand} ${formatMoney(f.price)} (${bag}, ${refund}${isJinkoId(o.id) ? ", partner checkout in USD" : ""})`;
    })
    .join("; ");
  return `- ${g.owner.name} | ${g.slices.map((s, i) => `${labels[i]}: ${sliceLine(s)}`).join(" | ")} | ${cabinLabel(g.cheapest.slices[0]?.segments[0]?.cabin || "economy")} | Fares: ${fares}`;
}

// ---- get_fare_details --------------------------------------------------------

function resolve(ref: string, ctx: ToolContext): ChatRef {
  const r = ctx.refs[ref.trim().toUpperCase()];
  if (!r) throw new ProviderError(`Unknown fare ref "${ref}". Use a ref from the latest search_flights result, or search again.`, 404);
  return r;
}

async function fareDetails(ref: string, ctx: ToolContext): Promise<string> {
  const r = resolve(ref, ctx);
  const { offer, baggage } = await getProvider(r.id).getOffer(r.id);
  const c = offer.conditions;
  const rule = (ok: boolean | null, pen: typeof c.refundPenalty, what: string) =>
    ok === null ? `${what}: unknown` : ok ? `${what}: allowed${pen ? `, fee ${formatMoney(pen)}` : ""}` : `${what}: not allowed`;
  const lines = [
    `${ref}: ${offer.owner.name} ${offer.fareBrand}, current total ${formatMoney(offer.total)}${offer.serviceFee.amount ? ` (incl. ${formatMoney(offer.serviceFee)} trip27 fee)` : ""}.`,
    ...offer.slices.flatMap((s) => [
      `${s.origin.city} → ${s.destination.city}: ${sliceLine(s)}`,
      ...s.segments.map(
        (x) =>
          `  ${x.flightNumber} ${x.origin.code}${x.origin.terminal ? ` T${x.origin.terminal}` : ""} ${x.departingAt.replace("T", " ").slice(0, 16)} → ${x.destination.code}${x.destination.terminal ? ` T${x.destination.terminal}` : ""} ${x.arrivingAt.replace("T", " ").slice(0, 16)}, ${x.aircraft || "aircraft n/a"}, ${x.cabin}${x.operatingCarrier && x.operatingCarrier.code !== x.carrier.code ? `, operated by ${x.operatingCarrier.name}` : ""}`
      ),
    ]),
    `Baggage per adult: ${offer.checkedBags} checked, ${offer.carryOnBags} carry-on.${baggage.length ? ` Extra bags can be added at checkout from ${formatMoney(baggage.reduce((m, b) => (b.price.amount < m.amount ? b.price : m), baggage[0].price))}.` : ""}`,
    `${rule(c.refundable, c.refundPenalty, "Refund")}. ${rule(c.changeable, c.changePenalty, "Changes")}.`,
    offer.requiresDocuments ? "Passport details are required at checkout." : "",
    offer.expiresAt ? `Price held until ${offer.expiresAt.replace("T", " ").slice(0, 16)} UTC, then it may change.` : "",
    isJinkoId(r.id)
      ? `Partner fare: paid on the partner's secure payment page in USD; the AED price is an estimate. No seat selection or extra bags.`
      : "Seats and extra bags (where the airline allows) are chosen at checkout.",
    modeFor(r.id) !== "live" ? `Mode: ${modeFor(r.id)} (not a real ticket).` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

// ---- start_checkout ---------------------------------------------------------

async function startCheckout(ref: string, ctx: ToolContext): Promise<string> {
  const key = ref.trim().toUpperCase();
  const r = resolve(key, ctx);
  // Re-check the fare so the button never leads to an expired offer.
  const { offer } = await getProvider(r.id).getOffer(r.id);
  const partner = isJinkoId(r.id);
  const url = `/flights/checkout/${encodeURIComponent(r.id)}?${r.qs}`;
  ctx.emit({ type: "checkout", ref: key, url, offer, partner });
  return [
    `Checkout button shown for ${offer.owner.name} ${offer.fareBrand}, current total ${formatMoney(offer.total)}.`,
    "The customer enters traveller details" + (partner ? " and pays on the partner's secure page." : ", picks seats and bags, and pays by card on the checkout page."),
    "Nothing is booked until they pay there.",
  ].join(" ");
}
