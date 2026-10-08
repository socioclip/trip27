import type { CabinClass, SearchParams } from "./types";

// Search params <-> URL query string. Shared by client and server.
// ?trip=oneway|round|multi&s=DXB-LHR-2026-11-02,LHR-DXB-2026-11-09&ad=1&ch=0&in=0&cabin=economy

export type TripType = "oneway" | "round" | "multi";
const CABINS: CabinClass[] = ["economy", "premium_economy", "business", "first"];
const IATA = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toQuery(p: SearchParams, trip: TripType) {
  const q = new URLSearchParams();
  q.set("trip", trip);
  q.set("s", p.slices.map((s) => `${s.origin}-${s.destination}-${s.date}`).join(","));
  q.set("ad", String(p.adults));
  q.set("ch", String(p.children));
  q.set("in", String(p.infants));
  q.set("cabin", p.cabin);
  return q.toString();
}

export function fromQuery(q: URLSearchParams | Record<string, string | undefined>): { params: SearchParams; trip: TripType } | { error: string } {
  const get = (k: string) => (q instanceof URLSearchParams ? q.get(k) : q[k]) ?? "";
  const trip = (["oneway", "round", "multi"].includes(get("trip")) ? get("trip") : "oneway") as TripType;
  const slices = get("s")
    .split(",")
    .filter(Boolean)
    .map((x) => {
      const [o, d, ...date] = x.split("-");
      return { origin: (o || "").toUpperCase(), destination: (d || "").toUpperCase(), date: date.join("-") };
    });
  const adults = clamp(Number(get("ad") || 1), 1, 9);
  const children = clamp(Number(get("ch") || 0), 0, 8);
  const infants = clamp(Number(get("in") || 0), 0, adults);
  const cabin = (CABINS.includes(get("cabin") as CabinClass) ? get("cabin") : "economy") as CabinClass;
  const params = { slices, adults, children, infants, cabin };
  const err = validate(params);
  return err ? { error: err } : { params, trip };
}

export function validate(p: SearchParams): string | null {
  if (!p.slices.length || p.slices.length > 4) return "Please add between 1 and 4 flights.";
  for (const s of p.slices) {
    if (!IATA.test(s.origin) || !IATA.test(s.destination)) return "Please choose valid airports.";
    if (s.origin === s.destination) return "Origin and destination must be different.";
    if (!DATE.test(s.date)) return "Please choose a valid date.";
  }
  for (let i = 1; i < p.slices.length; i++) if (p.slices[i].date < p.slices[i - 1].date) return "Flight dates must be in order.";
  if (p.adults + p.children > 9) return "A maximum of 9 seated passengers per booking.";
  if (p.infants > p.adults) return "Each infant must travel with an adult.";
  return null;
}

function clamp(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : lo;
}
