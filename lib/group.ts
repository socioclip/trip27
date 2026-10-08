import type { ItineraryGroup, Offer } from "./types";
import { timeBucket } from "./format";

export function groupOffers(offers: Offer[]): ItineraryGroup[] {
  const map = new Map<string, Offer[]>();
  for (const o of offers) {
    const arr = map.get(o.itineraryKey);
    if (arr) arr.push(o);
    else map.set(o.itineraryKey, [o]);
  }
  const groups: ItineraryGroup[] = [];
  for (const [key, list] of map) {
    // Keep one offer per fare brand (the cheapest).
    const byBrand = new Map<string, Offer>();
    for (const o of list) {
      const prev = byBrand.get(o.fareBrand);
      if (!prev || o.total.amount < prev.total.amount) byBrand.set(o.fareBrand, o);
    }
    const fares = [...byBrand.values()].sort((a, b) => a.total.amount - b.total.amount);
    groups.push({ key, slices: fares[0].slices, owner: fares[0].owner, fares, cheapest: fares[0] });
  }
  return groups;
}

export type SortKey = "best" | "cheapest" | "fastest";

export function totalDuration(g: ItineraryGroup) {
  return g.slices.reduce((n, s) => n + s.durationMin, 0);
}

export function sortGroups(groups: ItineraryGroup[], key: SortKey) {
  const arr = [...groups];
  if (key === "cheapest") return arr.sort((a, b) => a.cheapest.total.amount - b.cheapest.total.amount || totalDuration(a) - totalDuration(b));
  if (key === "fastest") return arr.sort((a, b) => totalDuration(a) - totalDuration(b) || a.cheapest.total.amount - b.cheapest.total.amount);
  if (!arr.length) return arr;
  const minP = Math.min(...arr.map((g) => g.cheapest.total.amount));
  const minD = Math.min(...arr.map(totalDuration));
  const score = (g: ItineraryGroup) =>
    g.cheapest.total.amount / minP + (totalDuration(g) / minD) * 0.8 + g.slices.reduce((n, s) => n + s.stops, 0) * 0.15;
  return arr.sort((a, b) => score(a) - score(b));
}

export interface Filters {
  stops: Set<number>; // 0, 1, 2 (2 = 2+)
  airlines: Set<string>;
  maxPrice: number | null;
  maxDuration: number | null; // minutes per slice
  depTimes: Record<number, Set<string>>; // slice index -> buckets
  bagIncluded: boolean;
  refundable: boolean;
}

export const emptyFilters = (): Filters => ({
  stops: new Set(),
  airlines: new Set(),
  maxPrice: null,
  maxDuration: null,
  depTimes: {},
  bagIncluded: false,
  refundable: false,
});

export function applyFilters(groups: ItineraryGroup[], f: Filters) {
  return groups.filter((g) => {
    const maxStops = Math.max(...g.slices.map((s) => s.stops));
    if (f.stops.size && !f.stops.has(Math.min(2, maxStops))) return false;
    if (f.airlines.size && !f.airlines.has(g.owner.code)) return false;
    if (f.maxPrice != null && g.cheapest.total.amount > f.maxPrice) return false;
    if (f.maxDuration != null && g.slices.some((s) => s.durationMin > f.maxDuration!)) return false;
    for (const [i, set] of Object.entries(f.depTimes)) {
      const s = g.slices[Number(i)];
      if (set.size && s && !set.has(timeBucket(s.departingAt))) return false;
    }
    if (f.bagIncluded && !g.fares.some((o) => o.checkedBags > 0)) return false;
    if (f.refundable && !g.fares.some((o) => o.conditions.refundable)) return false;
    return true;
  });
}
