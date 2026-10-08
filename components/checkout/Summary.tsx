"use client";
import type { Offer } from "@/lib/types";
import { formatMoney, hhmm, prettyDate, stopsLabel } from "@/lib/format";
import AirlineLogo from "../flight/AirlineLogo";

export interface PriceLines {
  fare: number;
  seats: number;
  bags: number;
  fee: number;
  total: number;
  currency: string;
}

export default function Summary({ offer, lines, sliceLabels, expiresIn }: { offer: Offer; lines: PriceLines; sliceLabels: string[]; expiresIn: number | null }) {
  const m = (n: number) => formatMoney({ amount: n, currency: lines.currency }, { decimals: true });
  return (
    <div className="space-y-3">
      {expiresIn != null && (
        <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${expiresIn < 300 ? "bg-accent-500/10 text-accent-600" : "bg-brand-50 text-brand-700"}`}>
          {expiresIn > 0 ? <>Price held for {Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2, "0")}</> : "This price has expired. Please search again."}
        </div>
      )}
      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <AirlineLogo carrier={offer.owner} size={36} />
          <div>
            <p className="font-bold leading-tight">{offer.owner.name}</p>
            <p className="text-xs text-muted">{offer.fareBrand}</p>
          </div>
        </div>
        <div className="space-y-3">
          {offer.slices.map((s, i) => (
            <div key={i} className="text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{sliceLabels[i]} · {prettyDate(s.departingAt)}</p>
              <p className="font-semibold">{hhmm(s.departingAt)} {s.origin.code} → {hhmm(s.arrivingAt)} {s.destination.code}</p>
              <p className="text-xs text-muted">{stopsLabel(s.stops)} · {s.segments.map((g) => g.flightNumber).join(", ")}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="card p-5 text-sm">
        <p className="font-extrabold text-base mb-3">Price details</p>
        <Row l={`Fare (${offer.passengers.length} traveller${offer.passengers.length > 1 ? "s" : ""})`} r={m(lines.fare)} />
        {offer.base && offer.tax && <p className="text-xs text-muted -mt-1 mb-2">Base {formatMoney(offer.base)} + taxes {formatMoney(offer.tax)}</p>}
        {lines.seats > 0 && <Row l="Seats" r={m(lines.seats)} />}
        {lines.bags > 0 && <Row l="Extra baggage" r={m(lines.bags)} />}
        {lines.fee > 0 && <Row l="Service fee" r={m(lines.fee)} />}
        <div className="border-t border-line mt-3 pt-3 flex items-end justify-between">
          <span className="font-bold">Total</span>
          <span className="text-2xl font-extrabold text-brand-800">{m(lines.total)}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-muted">{l}</span>
      <span className="font-semibold">{r}</span>
    </div>
  );
}
