"use client";
import { useCallback, useRef, useState } from "react";
import { addDays, parseYmd, prettyDate, todayYmd, ymd } from "@/lib/format";
import { useOutside } from "../useOutside";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export default function DatePicker({
  mode,
  start,
  end,
  min,
  onChange,
  labels = ["Departure", "Return"],
  onAddReturn,
}: {
  mode: "single" | "range";
  start: string;
  end?: string;
  min?: string;
  onChange: (start: string, end?: string) => void;
  labels?: [string, string];
  onAddReturn?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [hover, setHover] = useState<string | null>(null);
  const minDate = min || todayYmd();
  const [view, setView] = useState(() => (start || minDate).slice(0, 7));
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);

  const openAt = (which: "start" | "end") => {
    setPicking(mode === "range" ? which : "start");
    setView(((which === "end" ? end : start) || start || minDate).slice(0, 7));
    setOpen(true);
  };

  const click = (d: string) => {
    if (mode === "single") {
      onChange(d);
      setOpen(false);
      return;
    }
    if (picking === "start") {
      onChange(d, end && end >= d ? end : undefined);
      setPicking("end");
    } else {
      if (d < start) {
        onChange(d, undefined);
        setPicking("end");
        return;
      }
      onChange(start, d);
      setOpen(false);
    }
  };

  const months = [view, nextMonth(view)];
  const rangeEnd = mode === "range" ? (picking === "end" && hover && hover > start ? hover : end) : undefined;

  return (
    <div ref={ref} className="relative">
      <div className={`grid ${mode === "range" || onAddReturn ? "grid-cols-2" : "grid-cols-1"} rounded-xl border border-line bg-white h-[64px] overflow-hidden`}>
        <button type="button" onClick={() => openAt("start")} className={`text-left px-4 py-2.5 hover:bg-brand-50/50 ${open && picking === "start" ? "bg-brand-50" : ""}`}>
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{labels[0]}</span>
          <span className="block font-bold text-[15px] truncate">{start ? prettyDate(start) : "Add date"}</span>
        </button>
        {mode === "range" ? (
          <button type="button" onClick={() => openAt("end")} className={`text-left px-4 py-2.5 border-l border-line hover:bg-brand-50/50 ${open && picking === "end" ? "bg-brand-50" : ""}`}>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{labels[1]}</span>
            <span className={`block font-bold text-[15px] truncate ${end ? "" : "text-muted/80 font-medium"}`}>{end ? prettyDate(end) : "Add date"}</span>
          </button>
        ) : onAddReturn ? (
          <button type="button" onClick={onAddReturn} className="text-left px-4 py-2.5 border-l border-line hover:bg-brand-50/50">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{labels[1]}</span>
            <span className="block text-[15px] text-brand-600 font-semibold">+ Add return</span>
          </button>
        ) : null}
      </div>

      {open && (
        <div className="absolute z-50 mt-2 right-0 lg:left-0 lg:right-auto card shadow-xl p-4 w-[min(92vw,640px)]">
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label="Previous month" className="w-9 h-9 rounded-full hover:bg-surface disabled:opacity-30" disabled={view <= minDate.slice(0, 7)} onClick={() => setView(prevMonth(view))}>‹</button>
            <span className="text-sm text-muted">{mode === "range" ? (picking === "start" ? "Select departure date" : "Select return date") : "Select date"}</span>
            <button type="button" aria-label="Next month" className="w-9 h-9 rounded-full hover:bg-surface" onClick={() => setView(nextMonth(view))}>›</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-6">
            {months.map((m, idx) => (
              <div key={m} className={idx === 1 ? "hidden sm:block" : ""}>
                <p className="text-center font-bold mb-2">{MONTHS[Number(m.slice(5, 7)) - 1]} {m.slice(0, 4)}</p>
                <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted mb-1">
                  {WD.map((w) => <span key={w}>{w}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHover(null)}>
                  {cells(m).map((d, i) => {
                    if (!d) return <span key={i} />;
                    const disabled = d < minDate || (mode === "range" && picking === "end" && false);
                    const isStart = d === start;
                    const isEnd = !!rangeEnd && d === rangeEnd;
                    const inRange = !!rangeEnd && d > start && d < rangeEnd;
                    return (
                      <button
                        type="button"
                        key={d}
                        disabled={disabled}
                        onMouseEnter={() => setHover(d)}
                        onClick={() => click(d)}
                        className={[
                          "h-10 text-sm font-medium relative",
                          disabled ? "text-muted/40 cursor-not-allowed" : "hover:text-brand-700",
                          inRange ? "bg-brand-50" : "",
                          isStart && rangeEnd ? "bg-gradient-to-r from-transparent from-50% to-brand-50 to-50%" : "",
                          isEnd ? "bg-gradient-to-l from-transparent from-50% to-brand-50 to-50%" : "",
                        ].join(" ")}
                        aria-label={prettyDate(d, true)}
                        aria-pressed={isStart || isEnd}
                      >
                        <span className={`mx-auto w-10 h-10 grid place-items-center rounded-full ${isStart || isEnd ? "bg-brand-600 text-white" : d === todayYmd() ? "ring-1 ring-brand-300" : ""}`}>
                          {Number(d.slice(8, 10))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" className="btn-brand !py-2 text-sm" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function nextMonth(m: string) {
  const d = parseYmd(m + "-01");
  d.setUTCMonth(d.getUTCMonth() + 1);
  return ymd(d).slice(0, 7);
}
function prevMonth(m: string) {
  const d = parseYmd(m + "-01");
  d.setUTCMonth(d.getUTCMonth() - 1);
  return ymd(d).slice(0, 7);
}
function cells(m: string): (string | null)[] {
  const first = parseYmd(m + "-01");
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const out: (string | null)[] = Array(offset).fill(null);
  let d = m + "-01";
  while (d.slice(0, 7) === m) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
