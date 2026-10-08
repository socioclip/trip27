import type { Slice } from "@/lib/types";
import { duration, hhmm, minutesBetween, prettyDate } from "@/lib/format";
import AirlineLogo from "./AirlineLogo";

// Full segment-by-segment timeline with layovers.
export default function SliceDetails({ slice, title }: { slice: Slice; title?: string }) {
  return (
    <div>
      {title && (
        <p className="text-sm font-bold mb-3">
          {title} <span className="text-muted font-medium">· {prettyDate(slice.departingAt)} · {duration(slice.durationMin)}</span>
        </p>
      )}
      <ol className="space-y-0">
        {slice.segments.map((s, i) => {
          const next = slice.segments[i + 1];
          const lay = next ? minutesBetween(s.arrivingAt, next.departingAt) : 0;
          return (
            <li key={s.id}>
              <div className="grid grid-cols-[56px_18px_1fr] gap-x-3">
                <div className="text-right">
                  <p className="font-bold">{hhmm(s.departingAt)}</p>
                  <p className="text-[11px] text-muted">{prettyDate(s.departingAt).replace(/^\w+, /, "")}</p>
                </div>
                <div className="flex flex-col items-center pt-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-brand-600 bg-white" />
                  <span className="flex-1 w-px bg-brand-200 my-1" />
                </div>
                <div className="pb-3">
                  <p className="font-semibold">{s.origin.city} ({s.origin.code})</p>
                  <p className="text-xs text-muted">{s.origin.name}{s.origin.terminal ? ` · Terminal ${s.origin.terminal}` : ""}</p>
                  <div className="mt-3 mb-1 flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
                    <AirlineLogo carrier={s.carrier} size={30} />
                    <div className="text-xs leading-relaxed min-w-0">
                      <p className="font-semibold text-ink">{s.carrier.name} · {s.flightNumber}</p>
                      <p className="text-muted truncate">
                        {s.cabin}{s.aircraft ? ` · ${s.aircraft}` : ""} · {duration(s.durationMin)}
                        {s.operatingCarrier ? ` · Operated by ${s.operatingCarrier.name}` : ""}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-[56px_18px_1fr] gap-x-3">
                <div className="text-right">
                  <p className="font-bold">{hhmm(s.arrivingAt)}</p>
                  <p className="text-[11px] text-muted">{prettyDate(s.arrivingAt).replace(/^\w+, /, "")}</p>
                </div>
                <div className="flex flex-col items-center pt-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-600" />
                </div>
                <div className="pb-2">
                  <p className="font-semibold">{s.destination.city} ({s.destination.code})</p>
                  <p className="text-xs text-muted">{s.destination.name}{s.destination.terminal ? ` · Terminal ${s.destination.terminal}` : ""}</p>
                </div>
              </div>
              {next && (
                <div className="my-3 ml-[86px] rounded-lg border border-dashed border-accent-400/60 bg-accent-400/5 px-3 py-2 text-xs font-semibold text-accent-600">
                  {duration(lay)} layover in {s.destination.city}
                  {next.origin.code !== s.destination.code ? ` · change airport to ${next.origin.code}` : ""}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
