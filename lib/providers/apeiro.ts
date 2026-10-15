import "server-only";
import { airport, CITY_CODES } from "../airports";
import { round2, toDisplay } from "../money";
import { currentApeiroToken, getFlags } from "../suppliers";
import { ProviderError, type CabinClass, type Carrier, type Endpoint, type Money, type Offer, type OfferPassenger, type SearchParams, type Segment, type Slice } from "../types";
import type { FlightProvider } from "./types";

// ---------------------------------------------------------------------------
// Apeirotrip provider — fares from apeirotrip.com's Amadeus Online Suite
// low-fare search (flight.amadeusonlinesuite.com/api/v2/offer/lowfare).
//
// Search only, for comparing prices: trip27 has no booking access on this
// account, so Apeirotrip fares are shown with a "compare only" label and can't
// be selected for checkout.
//
// Prices come back in the agency currency (INR). They're converted to the
// display currency with the exchange rate Apeirotrip sends with each fare
// (`roe`, AED -> INR), falling back to FX_RATES_TO_AED.
// ---------------------------------------------------------------------------

export const APEIRO_OFFER_PREFIX = "apro_";
export const isApeiroId = (id: string) => id.startsWith(APEIRO_OFFER_PREFIX);

const env = (k: string) => (process.env[k] || "").trim();
const URL_DEFAULT = "https://flight.amadeusonlinesuite.com/api/v2/offer/lowfare";
const LOGO = (code: string) => `https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/${code}.svg`;
const MAX_OFFERS = 150;

/** The Apeirotrip agency account the search runs under (overridable from env). */
function account() {
  return {
    OrgId: env("APEIRO_ORG_ID") || "2505090951404389063",
    AgencyId: env("APEIRO_AGENCY_ID") || "2510140731447478170",
    AgencyCode: env("APEIRO_AGENCY_CODE") || "A0000002415",
    BookingUserType: env("APEIRO_BOOKING_USER_TYPE") || "210526104324609462",
    SubAgencyId: env("APEIRO_SUB_AGENCY_ID") || "2510140731442288883",
    CompanyId: env("APEIRO_COMPANY_ID") || "2505090953235681553",
    EntityId: env("APEIRO_ENTITY_ID") || "2505090953236143318",
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

const CLASS: Record<CabinClass, string> = { economy: "Y", premium_economy: "W", business: "C", first: "F" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-10-28 -> "28 Oct 2026" */
function apeiroDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]} ${y}`;
}

/** "Wed, Oct 28, 2026" + "22:30" -> "2026-10-28T22:30:00" */
function localIso(date: string | undefined, time: string | undefined) {
  const m = /([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})/.exec(date || "");
  const t = /^(\d{1,2}):(\d{2})/.exec(time || "");
  if (!m || !t) return "";
  const mon = MONTHS.indexOf(m[1]) + 1;
  if (!mon) return "";
  return `${m[3]}-${String(mon).padStart(2, "0")}-${m[2].padStart(2, "0")}T${t[1].padStart(2, "0")}:${t[2]}:00`;
}

const mins = (h: unknown, m: unknown) => (Number(h) || 0) * 60 + (Number(m) || 0);

function countryOf(code: string) {
  return airport(code)?.country || airport(CITY_CODES[code]?.airports[0] || "")?.country || "";
}

function carrier(code: string | undefined, name?: string | null): Carrier {
  const c = (code || "").toUpperCase();
  return { code: c, name: name || c, logo: c ? LOGO(c) : "" };
}

function endpoint(code: string, full: string | undefined, city: string | undefined, terminal: string | undefined): Endpoint {
  const a = airport(code);
  const name = (full || "").split("~")[0] || a?.name || code;
  return { code, name, city: city || a?.city || code, terminal: terminal || null };
}

/** Checked bags from Apeirotrip's allowance: N = pieces, W = weight (any weight counts as one bag). */
function checkedBags(cb: J): number {
  const n = Number(cb?.bga) || 0;
  if (!n) return 0;
  return String(cb?.bgt).toUpperCase() === "N" ? n : 1;
}

function normSlice(fsg: J, idx: number, cabin: string, bags: number, carry: number): Slice {
  const segs: Segment[] = (fsg?.flg || []).map((l: J, i: number): Segment => {
    const mk = carrier(l.mcc, l.mcn);
    const op = l.occ && l.occ !== l.mcc ? carrier(l.occ, l.ocn) : null;
    return {
      id: `seg_${idx}_${i}`,
      origin: endpoint(l.dac, l.dan, l.dcin, l.dat),
      destination: endpoint(l.aac, l.aan, l.acin, l.aat),
      departingAt: localIso(l.ddt, l.dti),
      arrivingAt: localIso(l.adt, l.ati),
      durationMin: mins(l.tfdh, l.tfdm),
      carrier: mk,
      operatingCarrier: op,
      flightNumber: `${mk.code} ${String(l.fnm || "").replace(/^0+(?=\d)/, "")}`.trim(),
      aircraft: String(l.act).toUpperCase() === "BUS" ? "Bus" : l.actn || l.act || "",
      cabin,
      checkedBags: bags,
      carryOnBags: carry,
    };
  });
  const first = segs[0];
  const last = segs[segs.length - 1];
  return {
    id: `sli_${idx}`,
    origin: first.origin,
    destination: last.destination,
    departingAt: first.departingAt,
    arrivingAt: last.arrivingAt,
    durationMin: mins(fsg.ttdh, fsg.ttdm) || segs.reduce((n, s) => n + s.durationMin, 0),
    stops: Math.max(0, segs.length - 1),
    segments: segs,
    fareBrand: null,
  };
}

function passengers(p: SearchParams): OfferPassenger[] {
  let n = 0;
  return [
    ...Array.from({ length: p.adults }, () => ({ id: `pax_${++n}`, type: "adult" as const })),
    ...Array.from({ length: p.children }, () => ({ id: `pax_${++n}`, type: "child" as const })),
    ...Array.from({ length: p.infants }, () => ({ id: `pax_${++n}`, type: "infant_without_seat" as const })),
  ];
}

/** Converts an Apeirotrip amount to the display currency, preferring the fare's own exchange rate. */
function display(amount: number, currency: string, fpb: J): Money {
  const roe = Number(fpb?.roe);
  if (String(fpb?.supCurrency).toUpperCase() === "AED" && currency.toUpperCase() !== "AED" && roe > 0) {
    return toDisplay(amount / roe, "AED");
  }
  return toDisplay(amount, currency);
}

function toOffer(item: J, idx: number, p: SearchParams, cabin: string): Offer | null {
  const fo = item?.fo;
  const fr = fo?.fr?.[0];
  if (!fo || !fr || !Array.isArray(item.fsg) || !item.fsg.length) return null;
  const total = Number(fo.total);
  if (!(total > 0)) return null;
  const currency = String(fo.currency || "INR");
  const fpb = fr.pfi?.[0]?.fpb || {};
  const bags = checkedBags(fr.cb?.[0]);
  const carry = Number(fr.cbnb?.[0]?.cbga) > 0 ? 1 : 0;
  // Apeirotrip reports allowances in kg (bgu/cbgu = "K"). Only weight-type checked
  // allowances (bgt = "W") carry a real kg figure; piece-type ones don't.
  const cb0 = fr.cb?.[0];
  const cbnb0 = fr.cbnb?.[0];
  const checkedWeightKg = cb0 && String(cb0.bgu).toUpperCase() === "K" && String(cb0.bgt).toUpperCase() === "W" && Number(cb0.bga) > 0 ? Number(cb0.bga) : null;
  const carryOnWeightKg = cbnb0 && String(cbnb0.cbgu).toUpperCase() === "K" && Number(cbnb0.cbga) > 0 ? Number(cbnb0.cbga) : null;
  const brand = fr.fcc?.[0]?.bbf || fr.nm || cabin;
  const slices: Slice[] = item.fsg.map((s: J, i: number) => normSlice(s, i, brand, bags, carry));
  if (slices.some((s) => !s.segments.length || !s.departingAt)) return null;

  const base = (fr.pfi || []).reduce((n: number, x: J) => n + (Number(x?.fpb?.baseFare) || 0), 0);
  const tax = (fr.pfi || []).reduce((n: number, x: J) => n + (Number(x?.fpb?.totalTax) || 0), 0);
  const shown = display(total, currency, fpb);
  const owner = carrier(fr.vkc || slices[0].segments[0].carrier.code, null);
  owner.name = slices.flatMap((s) => s.segments).find((g) => g.carrier.code === owner.code)?.carrier.name || owner.name;

  return {
    id: `${APEIRO_OFFER_PREFIX}${idx}_${String(fo.key || item.fii || idx).replace(/[^\w-]/g, "")}`,
    total: shown,
    base: base > 0 ? display(base, currency, fpb) : null,
    tax: tax > 0 ? display(tax, currency, fpb) : null,
    serviceFee: { amount: 0, currency: shown.currency },
    supplierAmount: round2(total).toFixed(2),
    supplierCurrency: currency,
    owner,
    slices,
    passengers: passengers(p),
    conditions: { refundable: typeof fo.ir === "boolean" ? fo.ir : null, refundPenalty: null, changeable: null, changePenalty: null },
    expiresAt: null,
    requiresDocuments: true,
    fareBrand: brand,
    // Kept apart from other suppliers' fares for the same flights, so a
    // compare-only fare never hides a bookable one in the same card.
    itineraryKey: "apeiro:" + owner.code + ":" + slices.map((s) => s.segments.map((g) => g.flightNumber + g.departingAt).join(",")).join("|"),
    checkedBags: bags,
    carryOnBags: carry,
    carryOnWeightKg,
    checkedWeightKg,
    supplier: "Apeirotrip",
    bookable: false,
  };
}

/** One-way and round trips only. */
function itineraries(p: SearchParams, cls: string) {
  const [a, b] = p.slices;
  const leg = (s: { origin: string; destination: string; date: string }) => ({
    DepartureCode: s.origin,
    ArrivalCode: s.destination,
    DepartureDate: apeiroDate(s.date),
    DepartureTime: null,
    Ticketclass: cls,
    IsChanged: false,
    DepartureCountry: null,
    ArrivalCountry: null,
  });
  if (p.slices.length === 1) return { list: [leg(a)], tripType: "1", key: "OW" };
  if (p.slices.length === 2 && b.origin === a.destination && b.destination === a.origin) return { list: [leg(a), leg(b)], tripType: "2", key: "RT" };
  return null;
}

/** One search with an explicit token (used by both live search and the admin token test). */
async function runSearch(p: SearchParams, token: string): Promise<Offer[]> {
  const cls = CLASS[p.cabin] || "Y";
  const trip = itineraries(p, cls);
  if (!trip) return [];
  const codes = p.slices.flatMap((s) => [s.origin, s.destination]);
  const countries = new Set(codes.map(countryOf));
  const domestic = countries.size === 1 && !countries.has("");

  const body = {
    Itineraries: trip.list,
    IsNearbyAirports: false,
    TripType: trip.tripType,
    Adults: String(p.adults),
    Children: String(p.children),
    Infants: String(p.infants),
    LangCode: "EN",
    AirlineCode: "",
    CorporateCodes: null,
    RecommendedAirline: null,
    AlternateAirports: null,
    IsContentAggregation: false,
    IsDirectFlight: false,
    PassengerFareType: "",
    IsBaggageOnly: false,
    Refundable: false,
    IsFlexiCalendar: false,
    SearchSection: null,
    IsDomesticRoundTrip: domestic && trip.key === "RT",
    IsSeparateCombination: false,
    IsHFare: false,
    SalesChannel: 0,
    TargetCurrency: env("APEIRO_CURRENCY") || "INR",
    JouneyType: domestic ? "Domestic" : "International",
    IsMeta: false,
    Index: "",
    SessionId: null,
    MetaSource: "",
    MetaReferenceId: "",
    TripTypeKey: trip.key,
    ...account(),
  };

  const url = `${(env("APEIRO_API_URL") || URL_DEFAULT).replace(/\/$/, "")}?_ts=${Date.now()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json; charset=UTF-8",
        origin: "https://www.apeirotrip.com",
        referer: "https://www.apeirotrip.com/",
        token,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(40000),
    });
  } catch (e) {
    console.error("[apeiro] search request failed", (e as Error).message);
    throw new ProviderError("Apeirotrip didn't respond. Please try again.", 502);
  }
  const text = await res.text();
  if (!res.ok) {
    console.error("[apeiro] search", res.status, text.slice(0, 500));
    if (res.status === 401 || res.status === 403) throw new ProviderError("Apeirotrip rejected the token — it has probably expired. Paste a fresh one.", 401);
    throw new ProviderError("Apeirotrip had a problem. Please try again.", 502);
  }
  let data: J;
  try {
    data = JSON.parse(text);
  } catch {
    console.error("[apeiro] non-JSON response", text.slice(0, 300));
    throw new ProviderError("Apeirotrip sent an unexpected response.", 502);
  }
  if (data?.error) console.warn("[apeiro] search error field", JSON.stringify(data.error).slice(0, 300));

  const items: J[] = (data?.fop || []).flatMap((g: J) => g?.fop || []);
  const offers: Offer[] = [];
  items.forEach((it, i) => {
    try {
      const o = toOffer(it, i, p, cls === "Y" ? "Economy" : cls === "W" ? "Premium Economy" : cls === "C" ? "Business" : "First");
      if (o) offers.push(o);
    } catch {
      /* skip malformed fares */
    }
  });
  return offers.sort((a, b) => a.total.amount - b.total.amount).slice(0, MAX_OFFERS);
}

async function search(p: SearchParams): Promise<Offer[]> {
  if (!(await getFlags()).apeiro) return [];
  const token = await currentApeiroToken();
  if (!token) return [];
  return runSearch(p, token);
}

/** Checks a pasted token with a throwaway DXB–MAA search, so the admin page can validate before saving. */
export async function testApeiroToken(token: string): Promise<{ ok: boolean; offers: number; message: string }> {
  if (!token.trim()) return { ok: false, offers: 0, message: "Paste a token first." };
  const date = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  const params: SearchParams = { slices: [{ origin: "DXB", destination: "MAA", date }], adults: 1, children: 0, infants: 0, cabin: "economy" };
  try {
    const offers = await runSearch(params, token.trim());
    if (!offers.length) return { ok: false, offers: 0, message: "The token was accepted but no fares came back. Try searching again or paste a fresh token." };
    return { ok: true, offers: offers.length, message: `Valid — ${offers.length} fares returned for a test DXB→MAA search.` };
  } catch (e) {
    return { ok: false, offers: 0, message: e instanceof ProviderError ? e.message : "Couldn't reach Apeirotrip. Please try again." };
  }
}

const compareOnly = () => new ProviderError("Apeirotrip fares are shown for comparison only and can't be booked on trip27.", 400);

export const apeiroProvider: FlightProvider = {
  name: "apeiro",
  live: true,
  async searchPlaces() {
    return [];
  },
  search,
  async getOffer() {
    throw compareOnly();
  },
  async getSeatMaps() {
    return [];
  },
  async createOrder() {
    throw compareOnly();
  },
  async getOrder() {
    return null;
  },
  async listOrders() {
    return [];
  },
};
