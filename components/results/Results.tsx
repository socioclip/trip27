"use client";
import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Offer } from "@/lib/types";
import { fromQuery, toQuery } from "@/lib/search";
import { addDays, cabinLabel, formatMoney, prettyDate, shortDate, todayYmd } from "@/lib/format";
import { applyFilters, emptyFilters, groupOffers, sortGroups, totalDuration, type SortKey } from "@/lib/group";
import { placeFromCode } from "../search/SearchForm";
import SearchForm from "../search/SearchForm";
import FiltersPanel from "./FiltersPanel";
import ItineraryCard from "./ItineraryCard";
import ModeBanner from "../ModeBanner";

const PAGE = 15;

export default function Results() {
  const sp = useSearchParams();
  const router = useRouter();
  const qs = sp.toString();
  const parsed = useMemo(() => fromQuery(new URLSearchParams(qs)), [qs]);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [mode, setMode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [sort, setSort] = useState<SortKey>("best");
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    if ("error" in parsed) return;
    const ctrl = new AbortController();
    setOffers(null);
    setError(null);
    setFilters(emptyFilters());
    setShown(PAGE);
    fetch(api(`/api/search?${qs}`), { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Search failed");
        setOffers(j.offers);
        setMode(j.mode);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, [qs, parsed]);

  const groups = useMemo(() => (offers ? groupOffers(offers) : []), [offers]);
  const filtered = useMemo(() => applyFilters(groups, filters), [groups, filters]);
  const sorted = useMemo(() => sortGroups(filtered, sort), [filtered, sort]);

  if ("error" in parsed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg font-bold">{parsed.error}</p>
        <Link href="/" className="btn-primary mt-6">New search</Link>
      </div>
    );
  }

  const { params, trip } = parsed;
  const travellers = params.adults + params.children + params.infants;
  const first = params.slices[0];
  const sliceLabels =
    trip === "round" ? ["Outbound", "Return"] : params.slices.map((s, i) => (params.slices.length > 1 ? `Flight ${i + 1}` : "Outbound"));
  const filterSliceLabels = params.slices.map((s) => `${placeFromCode(s.origin).city} → ${placeFromCode(s.destination).city}`);
  const currency = offers?.[0]?.total.currency || "AED";

  const cheapest = sortGroups(filtered, "cheapest")[0];
  const fastest = sortGroups(filtered, "fastest")[0];
  const best = sortGroups(filtered, "best")[0];

  const shiftDate = (n: number) => {
    const delta = n;
    const slices = params.slices.map((s) => ({ ...s, date: addDays(s.date, delta) }));
    return `/flights?${toQuery({ ...params, slices }, trip)}`;
  };

  const select = (o: Offer) => {
    setSelecting(o.id);
    try {
      sessionStorage.setItem("trip27:offer:" + o.id, JSON.stringify(o));
    } catch {}
    router.push(`/flights/checkout/${encodeURIComponent(o.id)}?${qs}`);
  };

  return (
    <div>
      {/* Summary bar */}
      <div className="bg-brand-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-4">
          {!editing ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="min-w-0">
                <p className="text-lg font-extrabold truncate">
                  {params.slices.map((s, i) => (
                    <span key={i}>{i > 0 && trip === "multi" ? " · " : ""}{i === 0 || trip === "multi" ? `${placeFromCode(s.origin).city} → ${placeFromCode(s.destination).city}` : ""}</span>
                  ))}
                  {trip === "round" && <span className="text-white/60 font-semibold text-sm"> (round-trip)</span>}
                </p>
                <p className="text-sm text-white/70">
                  {params.slices.map((s) => shortDate(s.date)).join(" – ")} · {travellers} {travellers === 1 ? "traveller" : "travellers"} · {cabinLabel(params.cabin)}
                </p>
              </div>
              <button type="button" onClick={() => setEditing(true)} className="ml-auto btn border border-white/30 hover:bg-white/10 px-4 py-2 text-sm">Modify search</button>
            </div>
          ) : (
            <div className="text-ink">
              <SearchForm initial={params} initialTrip={trip} onSubmitted={() => setEditing(false)} />
              <button type="button" className="mt-2 text-sm text-white/80 hover:text-white" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        <ModeBanner mode={mode} />

        {/* Date strip */}
        {trip !== "multi" && (
          <div className="card p-1.5 mb-5 grid grid-cols-5 sm:grid-cols-7 gap-1 text-center">
            {[-3, -2, -1, 0, 1, 2, 3].map((n) => {
              const d = addDays(first.date, n);
              const past = d < todayYmd();
              const cls = `rounded-xl py-2 ${n === 0 ? "bg-brand-600 text-white" : past ? "text-muted/40 pointer-events-none" : "hover:bg-brand-50"} ${Math.abs(n) === 3 ? "hidden sm:block" : ""}`;
              return n === 0 || past ? (
                <span key={n} className={cls}>
                  <span className="block text-sm font-bold">{prettyDate(d).split(",")[0]}</span>
                  <span className="block text-xs opacity-80">{shortDate(d)}</span>
                </span>
              ) : (
                <Link key={n} href={shiftDate(n)} className={cls}>
                  <span className="block text-sm font-bold">{prettyDate(d).split(",")[0]}</span>
                  <span className="block text-xs opacity-80">{shortDate(d)}</span>
                </Link>
              );
            })}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="hidden lg:block">
            {offers && groups.length > 0 && (
              <div className="card p-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-auto">
                <FiltersPanel groups={groups} filters={filters} setFilters={(f) => { setFilters(f); setShown(PAGE); }} currency={currency} sliceLabels={filterSliceLabels} onReset={() => setFilters(emptyFilters())} />
              </div>
            )}
          </aside>

          <section aria-live="polite">
            {error && (
              <div className="card p-8 text-center">
                <p className="text-lg font-bold">We couldn&apos;t complete your search</p>
                <p className="text-muted mt-1">{error}</p>
                <button type="button" onClick={() => setEditing(true)} className="btn-primary mt-5">Change search</button>
              </div>
            )}

            {!offers && !error && <Loading from={placeFromCode(first.origin).city} to={placeFromCode(first.destination).city} />}

            {offers && groups.length === 0 && (
              <div className="card p-8 text-center">
                <p className="text-lg font-bold">No flights found</p>
                <p className="text-muted mt-1">Try different dates or nearby airports.</p>
              </div>
            )}

            {offers && groups.length > 0 && (
              <>
                <div className="grid grid-cols-3 card p-1.5 gap-1 mb-4" role="tablist">
                  {(
                    [
                      ["best", "Recommended", best],
                      ["cheapest", "Cheapest", cheapest],
                      ["fastest", "Fastest", fastest],
                    ] as const
                  ).map(([k, l, g]) => (
                    <button key={k} role="tab" aria-selected={sort === k} type="button" onClick={() => setSort(k)}
                      className={`rounded-xl px-2 py-2.5 text-left sm:text-center ${sort === k ? "bg-brand-50 ring-1 ring-brand-300" : "hover:bg-surface"}`}>
                      <span className="block text-sm font-bold">{l}</span>
                      {g && <span className="block text-xs text-muted">{formatMoney(g.cheapest.total)}{k === "fastest" ? ` · ${Math.round(totalDuration(g) / 60)}h` : ""}</span>}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-muted"><b className="text-ink">{filtered.length}</b> of {groups.length} flights</p>
                  <button type="button" className="lg:hidden btn-ghost !py-2 text-sm" onClick={() => setDrawer(true)}>Filters</button>
                </div>

                {sorted.length === 0 ? (
                  <div className="card p-8 text-center">
                    <p className="font-bold">No flights match your filters</p>
                    <button type="button" className="btn-ghost mt-4" onClick={() => setFilters(emptyFilters())}>Clear filters</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sorted.slice(0, shown).map((g) => (
                      <ItineraryCard key={g.key} group={g} sliceLabels={sliceLabels} travellers={travellers} onSelect={select} selecting={selecting}
                        badge={g === cheapest ? "Cheapest" : g === fastest ? "Fastest" : undefined} />
                    ))}
                    {shown < sorted.length && (
                      <button type="button" className="btn-ghost w-full" onClick={() => setShown((n) => n + PAGE)}>Show more flights ({sorted.length - shown} more)</button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 w-[min(90vw,360px)] bg-white p-4 overflow-auto">
            <FiltersPanel groups={groups} filters={filters} setFilters={setFilters} currency={currency} sliceLabels={filterSliceLabels} onReset={() => setFilters(emptyFilters())} />
            <button type="button" className="btn-brand w-full mt-4 sticky bottom-0" onClick={() => setDrawer(false)}>Show {filtered.length} flights</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Loading({ from, to }: { from: string; to: string }) {
  return (
    <div className="space-y-3">
      <div className="card p-5 flex items-center gap-4">
        <span className="relative w-10 h-10">
          <span className="absolute inset-0 rounded-full border-4 border-brand-100" />
          <span className="absolute inset-0 rounded-full border-4 border-brand-600 border-t-transparent animate-spin" />
        </span>
        <div>
          <p className="font-bold">Searching flights from {from} to {to}</p>
          <p className="text-sm text-muted">Comparing fares across airlines. This can take up to 20 seconds.</p>
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card p-5 grid md:grid-cols-[1fr_200px] gap-4">
          <div className="space-y-3">
            <div className="skeleton h-4 w-40 rounded" />
            <div className="skeleton h-8 w-full rounded" />
          </div>
          <div className="skeleton h-16 rounded-xl" />
        </div>
      ))}
    </div>
  );
}
