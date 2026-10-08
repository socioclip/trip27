"use client";
import { api } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/types";
import { useOutside } from "../useOutside";

export default function AirportInput({
  label,
  value,
  onChange,
  placeholder,
  icon,
  autoFocusNext,
}: {
  label: string;
  value: Place | null;
  onChange: (p: Place) => void;
  placeholder: string;
  icon: "from" | "to";
  autoFocusNext?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Place[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(api(`/api/places?q=${encodeURIComponent(q)}`), { signal: ctrl.signal });
        const j = await r.json();
        setItems(j.places || []);
        setActive(0);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, q ? 180 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const pick = (p: Place) => {
    onChange(p);
    setOpen(false);
    setQ("");
    autoFocusNext?.();
  };

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full text-left rounded-xl border border-line bg-white px-4 py-2.5 hover:border-brand-300 focus-visible:outline-2 focus-visible:outline-brand-500 h-[64px]"
        aria-haspopup="listbox"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted flex items-center gap-1.5">
          <Icon kind={icon} /> {label}
        </span>
        {value ? (
          <span className="block truncate">
            <span className="font-bold text-[17px]">{value.city}</span>{" "}
            <span className="text-muted text-sm">{value.code}{value.type === "city" ? " · All airports" : ""}</span>
          </span>
        ) : (
          <span className="block text-muted/80 text-[15px] mt-0.5">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 left-0 top-0 w-full min-w-[300px] sm:w-[380px] card shadow-xl overflow-hidden">
          <div className="p-2 border-b border-line">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === "Enter" && items[active]) { e.preventDefault(); pick(items[active]); }
              }}
              placeholder="City or airport"
              className="field !py-2.5"
              aria-label={label}
              role="combobox"
              aria-expanded
              aria-controls={`list-${label}`}
            />
          </div>
          <ul id={`list-${label}`} role="listbox" className="max-h-80 overflow-auto py-1">
            {!q && <li className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Popular</li>}
            {loading && !items.length && <li className="px-4 py-3 text-sm text-muted">Searching…</li>}
            {!loading && q && !items.length && <li className="px-4 py-3 text-sm text-muted">No airports found</li>}
            {items.map((p, i) => (
              <li
                key={p.type + p.code + i}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 ${i === active ? "bg-brand-50" : ""} ${p.type === "airport" && items[i - 1]?.type === "city" && items[i - 1]?.city === p.city ? "pl-9" : ""}`}
              >
                <span className="w-8 h-8 rounded-lg bg-surface grid place-items-center text-brand-600 shrink-0">
                  {p.type === "city" ? <CityIcon /> : <Icon kind="from" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold truncate">{p.city}{p.type === "city" ? " (All airports)" : ""}</span>
                  <span className="block text-xs text-muted truncate">{p.type === "airport" ? p.name + ", " : ""}{p.country}</span>
                </span>
                <span className="text-xs font-bold text-brand-700 bg-brand-50 rounded-md px-1.5 py-0.5">{p.code}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Icon({ kind }: { kind: "from" | "to" }) {
  return kind === "from" ? (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden><path d="M2.5 19h19v2h-19v-2Zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10 8 3.57l-1.91.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49L21 11.49c.81-.23 1.28-1.05 1.07-1.85Z"/></svg>
  ) : (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden><path d="M2.5 19h19v2h-19v-2Zm7.18-5.73 4.35 1.16 5.31 1.42c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.62-1.06-1.84l-5.31-1.42-2.76-9.02L10.12 2v8.28L5.15 8.95l-.93-2.32-1.45-.39v5.17l1.6.43 5.31 1.43Z"/></svg>
  );
}
function CityIcon() {
  return <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden><path d="M15 11V5l-3-3-3 3v2H3v14h18V11h-6Zm-8 8H5v-2h2v2Zm0-4H5v-2h2v2Zm0-4H5V9h2v2Zm6 8h-2v-2h2v2Zm0-4h-2v-2h2v2Zm0-4h-2V9h2v2Zm0-4h-2V5h2v2Zm6 12h-2v-2h2v2Zm0-4h-2v-2h2v2Z"/></svg>;
}
