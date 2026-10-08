"use client";
import { useCallback, useRef, useState } from "react";
import type { CabinClass } from "@/lib/types";
import { cabinLabel } from "@/lib/format";
import { useOutside } from "../useOutside";

export interface Pax { adults: number; children: number; infants: number; cabin: CabinClass }

export default function Travellers({ value, onChange }: { value: Pax; onChange: (v: Pax) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);
  const total = value.adults + value.children + value.infants;
  const seated = value.adults + value.children;

  const row = (key: "adults" | "children" | "infants", title: string, sub: string, min: number, max: number) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-muted">{sub}</p>
      </div>
      <div className="flex items-center gap-3">
        <Step label={`Fewer ${title}`} disabled={value[key] <= min} onClick={() => onChange(fix({ ...value, [key]: value[key] - 1 }))}>−</Step>
        <span className="w-5 text-center font-bold" aria-live="polite">{value[key]}</span>
        <Step label={`More ${title}`} disabled={value[key] >= max} onClick={() => onChange(fix({ ...value, [key]: value[key] + 1 }))}>+</Step>
      </div>
    </div>
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full text-left rounded-xl border border-line bg-white px-4 py-2.5 h-[64px] hover:border-brand-300">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Travellers & class</span>
        <span className="block font-bold text-[15px] truncate">{total} {total === 1 ? "Traveller" : "Travellers"}, {cabinLabel(value.cabin)}</span>
      </button>
      {open && (
        <div className="absolute z-50 right-0 mt-2 card shadow-xl p-4 w-[320px]">
          <div className="divide-y divide-line">
            {row("adults", "Adults", "12 years and over", 1, 9 - value.children)}
            {row("children", "Children", "2 – 11 years", 0, 9 - value.adults)}
            {row("infants", "Infants", "Under 2, on lap", 0, value.adults)}
          </div>
          {seated >= 9 && <p className="text-xs text-muted mt-1">Up to 9 seated travellers per booking.</p>}
          <p className="label mt-4">Cabin class</p>
          <div className="grid grid-cols-2 gap-2">
            {(["economy", "premium_economy", "business", "first"] as CabinClass[]).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => onChange({ ...value, cabin: c })}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold ${value.cabin === c ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line hover:border-brand-300"}`}
              >
                {cabinLabel(c)}
              </button>
            ))}
          </div>
          <button type="button" className="btn-brand w-full mt-4 !py-2.5" onClick={() => setOpen(false)}>Done</button>
        </div>
      )}
    </div>
  );
}

function fix(v: Pax): Pax {
  return { ...v, infants: Math.min(v.infants, v.adults) };
}

function Step({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="w-8 h-8 rounded-full border border-brand-300 text-brand-700 font-bold grid place-items-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-50">
      {children}
    </button>
  );
}
