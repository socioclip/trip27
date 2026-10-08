"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Place, SearchParams } from "@/lib/types";
import { toQuery, validate, type TripType } from "@/lib/search";
import { addDays, todayYmd } from "@/lib/format";
import { airport, CITY_CODES } from "@/lib/airports";
import AirportInput from "./AirportInput";
import DatePicker from "./DatePicker";
import Travellers, { type Pax } from "./Travellers";

interface Leg {
  origin: Place | null;
  destination: Place | null;
  date: string;
}

export function placeFromCode(code: string): Place {
  const c = code.toUpperCase();
  const city = CITY_CODES[c];
  const a = airport(c);
  if (a && !city) return { code: a.code, name: a.name, city: a.city, country: a.country, type: "airport" };
  if (city) return { code: c, name: "All airports", city: city.city, country: city.country, type: "city" };
  return { code: c, name: c, city: c, country: "", type: "airport" };
}

export default function SearchForm({
  initial,
  initialTrip = "round",
  compact = false,
  onSubmitted,
}: {
  initial?: SearchParams;
  initialTrip?: TripType;
  compact?: boolean;
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const today = todayYmd();
  const [trip, setTrip] = useState<TripType>(initialTrip);
  const [legs, setLegs] = useState<Leg[]>(() => {
    if (initial?.slices.length) {
      const base = initial.slices.map((s) => ({ origin: placeFromCode(s.origin), destination: placeFromCode(s.destination), date: s.date }));
      return initialTrip === "round" ? [base[0]] : base;
    }
    return [{ origin: placeFromCode("DXB"), destination: null, date: addDays(today, 14) }];
  });
  const [ret, setRet] = useState<string>(() =>
    initialTrip === "round" && initial?.slices[1] ? initial.slices[1].date : initial ? "" : addDays(today, 21)
  );
  const [pax, setPax] = useState<Pax>({
    adults: initial?.adults ?? 1,
    children: initial?.children ?? 0,
    infants: initial?.infants ?? 0,
    cabin: initial?.cabin ?? "economy",
  });
  const [error, setError] = useState<string | null>(null);

  const setLeg = (i: number, patch: Partial<Leg>) =>
    setLegs((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l));
      // Multi-city: chain the next leg's origin from this destination.
      if (patch.destination && next[i + 1] && !next[i + 1].origin) next[i + 1] = { ...next[i + 1], origin: patch.destination };
      return next;
    });

  const changeTrip = (t: TripType) => {
    setTrip(t);
    setError(null);
    if (t === "multi" && legs.length < 2) {
      const l0 = legs[0];
      setLegs([l0, { origin: l0.destination, destination: null, date: addDays(l0.date || today, 4) }]);
    }
    if (t !== "multi") setLegs((ls) => [ls[0]]);
    if (t === "round" && !ret) setRet(addDays(legs[0].date || today, 7));
  };

  const swap = (i: number) => setLeg(i, { origin: legs[i].destination, destination: legs[i].origin });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const slices = legs.map((l) => ({ origin: l.origin?.code || "", destination: l.destination?.code || "", date: l.date }));
    if (slices.some((s) => !s.origin)) return setError("Please choose where you're flying from.");
    if (slices.some((s) => !s.destination)) return setError("Please choose your destination.");
    if (trip === "round") {
      if (!ret) return setError("Please choose a return date.");
      slices.push({ origin: slices[0].destination, destination: slices[0].origin, date: ret });
    }
    const params: SearchParams = { slices, ...pax };
    const err = validate(params);
    if (err) return setError(err);
    setError(null);
    onSubmitted?.();
    router.push(`/flights?${toQuery(params, trip)}`);
  };

  return (
    <form onSubmit={submit} className={compact ? "" : "card p-4 sm:p-6 shadow-[0_20px_60px_-20px_rgba(36,18,96,0.35)]"}>
      <div className="flex flex-wrap items-center gap-2 mb-4" role="radiogroup" aria-label="Trip type">
        {(
          [
            ["round", "Round-trip"],
            ["oneway", "One-way"],
            ["multi", "Multi-city"],
          ] as [TripType, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={trip === k}
            onClick={() => changeTrip(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${trip === k ? "bg-brand-600 text-white" : "bg-surface text-ink hover:bg-brand-50"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {legs.map((leg, i) => (
          <div key={i} className={`grid gap-3 ${trip === "multi" ? "lg:grid-cols-[1fr_1fr_220px_auto]" : "lg:grid-cols-[1fr_1fr_minmax(260px,1fr)_minmax(200px,0.8fr)]"}`}>
            <div className="relative grid sm:grid-cols-2 gap-3 lg:col-span-2">
              <AirportInput label="From" icon="from" placeholder="Leaving from" value={leg.origin} onChange={(p) => setLeg(i, { origin: p })} />
              <AirportInput label="To" icon="to" placeholder="Going to" value={leg.destination} onChange={(p) => setLeg(i, { destination: p })} />
              <button
                type="button"
                onClick={() => swap(i)}
                aria-label="Swap origin and destination"
                className="hidden sm:grid absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white border border-line place-items-center text-brand-600 hover:rotate-180 transition shadow-sm"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></svg>
              </button>
            </div>
            {trip === "round" ? (
              <DatePicker mode="range" start={leg.date} end={ret} min={today} onChange={(s, e) => { setLeg(0, { date: s }); setRet(e || ""); }} />
            ) : (
              <DatePicker
                mode="single"
                start={leg.date}
                min={i > 0 ? legs[i - 1].date || today : today}
                labels={[trip === "multi" ? `Flight ${i + 1}` : "Departure", "Return"]}
                onChange={(s) => setLeg(i, { date: s })}
                onAddReturn={trip === "oneway" ? () => changeTrip("round") : undefined}
              />
            )}
            {i === 0 && trip !== "multi" && <Travellers value={pax} onChange={setPax} />}
            {trip === "multi" && (
              <div className="flex items-center">
                {legs.length > 2 && (
                  <button type="button" onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))} className="text-sm text-muted hover:text-accent-600 px-2" aria-label={`Remove flight ${i + 1}`}>
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {trip === "multi" && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_minmax(200px,0.45fr)]">
          <div>
            {legs.length < 4 && (
              <button
                type="button"
                onClick={() => setLegs((ls) => [...ls, { origin: ls[ls.length - 1].destination, destination: null, date: addDays(ls[ls.length - 1].date || today, 3) }])}
                className="btn-ghost text-sm text-brand-700"
              >
                + Add another flight
              </button>
            )}
          </div>
          <Travellers value={pax} onChange={setPax} />
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        {error ? <p role="alert" className="text-sm font-medium text-accent-600 flex-1">{error}</p> : <span className="flex-1" />}
        <button type="submit" className="btn-primary text-base px-10 py-3.5 w-full sm:w-auto">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" /></svg>
          Search flights
        </button>
      </div>
    </form>
  );
}
