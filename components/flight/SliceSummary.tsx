import type { Slice } from "@/lib/types";
import { dayDiff, duration, hhmm, stopsLabel } from "@/lib/format";

// One-line slice view: 08:15 DXB ——(1 stop)—— 13:40 LHR
export default function SliceSummary({ slice }: { slice: Slice }) {
  const plus = dayDiff(slice.departingAt, slice.arrivingAt);
  const via = slice.segments.slice(0, -1).map((s) => s.destination.code);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-5">
      <div className="text-left">
        <p className="text-lg sm:text-xl font-extrabold leading-none">{hhmm(slice.departingAt)}</p>
        <p className="text-xs sm:text-sm font-semibold text-muted mt-1">{slice.origin.code}</p>
      </div>
      <div className="text-center min-w-0">
        <p className="text-xs text-muted">{duration(slice.durationMin)}</p>
        <div className="relative my-1.5 h-px bg-line">
          <span className="absolute -left-0.5 -top-[3px] w-1.5 h-1.5 rounded-full bg-muted/50" />
          <span className="absolute -right-0.5 -top-[3px] w-1.5 h-1.5 rounded-full bg-muted/50" />
          {via.map((v, i) => (
            <span key={v + i} className="absolute -top-[4px] w-2 h-2 rounded-full bg-white border-2 border-accent-500" style={{ left: `${((i + 1) / (via.length + 1)) * 100}%` }} />
          ))}
        </div>
        <p className={`text-xs font-semibold truncate ${slice.stops ? "text-accent-600" : "text-mint-500"}`}>
          {stopsLabel(slice.stops)}{via.length ? ` · ${via.join(", ")}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="text-lg sm:text-xl font-extrabold leading-none">
          {hhmm(slice.arrivingAt)}
          {plus > 0 && <sup className="text-[10px] text-accent-600 font-bold ml-0.5">+{plus}</sup>}
        </p>
        <p className="text-xs sm:text-sm font-semibold text-muted mt-1">{slice.destination.code}</p>
      </div>
    </div>
  );
}
