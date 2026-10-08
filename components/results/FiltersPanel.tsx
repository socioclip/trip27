"use client";
import type { ItineraryGroup } from "@/lib/types";
import type { Filters } from "@/lib/group";
import { duration, formatMoney } from "@/lib/format";

const BUCKETS: [string, string, string][] = [
  ["early", "Early morning", "00:00 – 05:59"],
  ["morning", "Morning", "06:00 – 11:59"],
  ["afternoon", "Afternoon", "12:00 – 17:59"],
  ["evening", "Evening", "18:00 – 23:59"],
];

export default function FiltersPanel({
  groups,
  filters,
  setFilters,
  currency,
  sliceLabels,
  onReset,
}: {
  groups: ItineraryGroup[];
  filters: Filters;
  setFilters: (f: Filters) => void;
  currency: string;
  sliceLabels: string[];
  onReset: () => void;
}) {
  const prices = groups.map((g) => g.cheapest.total.amount);
  const minPrice = Math.floor(Math.min(...prices));
  const maxPrice = Math.ceil(Math.max(...prices));
  const durs = groups.flatMap((g) => g.slices.map((s) => s.durationMin));
  const minDur = Math.min(...durs);
  const maxDur = Math.max(...durs);

  const stopMin = (n: number) => {
    const m = groups.filter((g) => Math.min(2, Math.max(...g.slices.map((s) => s.stops))) === n).map((g) => g.cheapest.total.amount);
    return m.length ? Math.min(...m) : null;
  };
  const airlines = new Map<string, { name: string; min: number }>();
  for (const g of groups) {
    const a = airlines.get(g.owner.code);
    if (!a || g.cheapest.total.amount < a.min) airlines.set(g.owner.code, { name: g.owner.name, min: g.cheapest.total.amount });
  }

  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1 pb-2">
        <p className="font-extrabold text-lg">Filters</p>
        <button type="button" onClick={onReset} className="text-sm font-semibold text-brand-600 hover:underline">Reset all</button>
      </div>

      <Section title="Stops">
        {[0, 1, 2].map((n) => {
          const m = stopMin(n);
          return (
            <Check key={n} disabled={m == null} checked={filters.stops.has(n)} onChange={() => setFilters({ ...filters, stops: toggle(filters.stops, n) })}
              label={n === 0 ? "Non-stop" : n === 1 ? "1 stop" : "2+ stops"} right={m == null ? "—" : formatMoney({ amount: m, currency })} />
          );
        })}
      </Section>

      {minPrice < maxPrice && (
        <Section title="Price">
          <div className="px-1">
            <input type="range" min={minPrice} max={maxPrice} step={Math.max(1, Math.round((maxPrice - minPrice) / 100))} value={filters.maxPrice ?? maxPrice}
              onChange={(e) => setFilters({ ...filters, maxPrice: Number(e.target.value) >= maxPrice ? null : Number(e.target.value) })}
              className="w-full" aria-label="Maximum price" />
            <div className="flex justify-between text-xs text-muted mt-1">
              <span>{formatMoney({ amount: minPrice, currency })}</span>
              <span className="font-semibold text-ink">Up to {formatMoney({ amount: filters.maxPrice ?? maxPrice, currency })}</span>
            </div>
          </div>
        </Section>
      )}

      <Section title="Fare includes">
        <Check checked={filters.bagIncluded} onChange={() => setFilters({ ...filters, bagIncluded: !filters.bagIncluded })} label="Checked baggage" />
        <Check checked={filters.refundable} onChange={() => setFilters({ ...filters, refundable: !filters.refundable })} label="Refundable fare" />
      </Section>

      {sliceLabels.map((label, i) => (
        <Section key={i} title={`Departure · ${label}`}>
          <div className="grid grid-cols-2 gap-2">
            {BUCKETS.map(([k, t, r]) => {
              const on = filters.depTimes[i]?.has(k);
              return (
                <button key={k} type="button" aria-pressed={!!on}
                  onClick={() => setFilters({ ...filters, depTimes: { ...filters.depTimes, [i]: toggle(filters.depTimes[i] || new Set(), k) } })}
                  className={`rounded-xl border px-2 py-2 text-left ${on ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-300"}`}>
                  <span className="block text-xs font-bold">{t}</span>
                  <span className="block text-[11px] text-muted">{r}</span>
                </button>
              );
            })}
          </div>
        </Section>
      ))}

      {minDur < maxDur && (
        <Section title="Flight duration">
          <div className="px-1">
            <input type="range" min={minDur} max={maxDur} step={15} value={filters.maxDuration ?? maxDur}
              onChange={(e) => setFilters({ ...filters, maxDuration: Number(e.target.value) >= maxDur ? null : Number(e.target.value) })}
              className="w-full" aria-label="Maximum duration" />
            <div className="flex justify-between text-xs text-muted mt-1">
              <span>{duration(minDur)}</span>
              <span className="font-semibold text-ink">Up to {duration(filters.maxDuration ?? maxDur)}</span>
            </div>
          </div>
        </Section>
      )}

      <Section title="Airlines">
        {[...airlines.entries()].sort((a, b) => a[1].min - b[1].min).map(([code, a]) => (
          <Check key={code} checked={filters.airlines.has(code)} onChange={() => setFilters({ ...filters, airlines: toggle(filters.airlines, code) })}
            label={a.name} right={formatMoney({ amount: a.min, currency })} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="group border-t border-line py-3">
      <summary className="list-none cursor-pointer flex items-center justify-between px-1 font-bold text-sm mb-2">
        {title}
        <span className="text-muted group-open:rotate-180 transition">⌄</span>
      </summary>
      <div className="space-y-1">{children}</div>
    </details>
  );
}

function Check({ checked, onChange, label, right, disabled }: { checked: boolean; onChange: () => void; label: string; right?: string; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm ${disabled ? "opacity-40" : "cursor-pointer hover:bg-surface"}`}>
      <input type="checkbox" className="w-4 h-4" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="flex-1 truncate">{label}</span>
      {right && <span className="text-xs text-muted">{right}</span>}
    </label>
  );
}
