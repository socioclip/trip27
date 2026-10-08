"use client";
import { useState } from "react";
import type { Offer, PassengerInput, SeatElement, SeatMap, SeatService } from "@/lib/types";
import { formatMoney } from "@/lib/format";

export interface SeatChoice {
  serviceId: string;
  designator: string;
  amount: number; // display
  currency: string;
  supplierAmount: string;
}
export type SeatSelections = Record<string, SeatChoice>; // key: segmentId|passengerId

export default function SeatSelection({
  offer,
  seatMaps,
  pax,
  seats,
  setSeats,
}: {
  offer: Offer;
  seatMaps: SeatMap[] | null;
  pax: PassengerInput[];
  seats: SeatSelections;
  setSeats: (s: SeatSelections) => void;
}) {
  const segments = offer.slices.flatMap((s) => s.segments);
  const withMaps = segments.filter((g) => seatMaps?.some((m) => m.segmentId === g.id));
  const [segIdx, setSegIdx] = useState(0);
  const seated = pax.filter((p) => p.type !== "infant_without_seat");
  const [activePax, setActivePax] = useState(seated[0]?.id);

  if (seatMaps === null)
    return (
      <div className="card p-8 text-center text-muted">
        <span className="inline-block w-8 h-8 rounded-full border-4 border-brand-600 border-t-transparent animate-spin" />
        <p className="mt-3">Loading seat map…</p>
      </div>
    );

  if (!withMaps.length)
    return (
      <div className="card p-6">
        <h2 className="text-lg font-extrabold">Seat selection</h2>
        <p className="text-muted mt-1">The airline doesn&apos;t offer advance seat selection for this booking. Seats will be assigned free of charge at check-in.</p>
      </div>
    );

  const seg = withMaps[Math.min(segIdx, withMaps.length - 1)];
  const map = seatMaps.find((m) => m.segmentId === seg.id)!;
  const key = (pid: string) => `${seg.id}|${pid}`;
  const takenBy = new Map(Object.entries(seats).filter(([k]) => k.startsWith(seg.id + "|")).map(([k, v]) => [v.designator, k.split("|")[1]]));
  const paxName = (p: PassengerInput, i: number) => (p.givenName ? `${p.givenName} ${p.familyName}`.trim() : `Traveller ${i + 1}`);

  const choose = (el: SeatElement) => {
    if (!activePax) return;
    const svc: SeatService | undefined = el.services.find((s) => s.passengerId === activePax);
    if (!svc || !el.designator) return;
    const occupant = takenBy.get(el.designator);
    const next = { ...seats };
    if (occupant === activePax) {
      delete next[key(activePax)];
      setSeats(next);
      return;
    }
    if (occupant) return;
    next[key(activePax)] = { serviceId: svc.id, designator: el.designator, amount: svc.price.amount, currency: svc.price.currency, supplierAmount: svc.supplierAmount };
    setSeats(next);
    // move on to the next traveller without a seat on this flight
    const nextPax = seated.find((p) => p.id !== activePax && !next[key(p.id)]);
    if (nextPax) setActivePax(nextPax.id);
  };

  // Column letters for the header from the first full row.
  const headerRow = map.cabins[0]?.rows.find((r) => r.sections.every((s) => s.elements.some((e) => e.type === "seat")));

  return (
    <div className="card p-5">
      <h2 className="text-lg font-extrabold">Choose your seats</h2>
      <p className="text-sm text-muted">Optional. Skip to get a seat assigned at check-in.</p>

      <div className="flex gap-2 overflow-x-auto mt-4 pb-1">
        {withMaps.map((g, i) => (
          <button key={g.id} type="button" onClick={() => setSegIdx(i)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left ${i === segIdx ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-300"}`}>
            <span className="block text-sm font-bold">{g.origin.code} → {g.destination.code}</span>
            <span className="block text-[11px] text-muted">{g.flightNumber} · {g.aircraft}</span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-5 mt-4">
        <div className="space-y-2">
          {seated.map((p, i) => {
            const sel = seats[key(p.id)];
            return (
              <button key={p.id} type="button" onClick={() => setActivePax(p.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left flex items-center justify-between gap-2 ${activePax === p.id ? "border-brand-500 bg-brand-50" : "border-line"}`}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{paxName(p, i)}</span>
                  <span className="block text-xs text-muted">{sel ? (sel.amount > 0 ? formatMoney({ amount: sel.amount, currency: sel.currency }) : "Free") : "No seat selected"}</span>
                </span>
                <span className={`w-10 h-10 rounded-lg grid place-items-center text-sm font-bold ${sel ? "bg-brand-600 text-white" : "bg-surface text-muted"}`}>{sel?.designator || "—"}</span>
              </button>
            );
          })}
          <div className="pt-3 text-xs space-y-1.5 text-muted">
            <Legend cls="bg-white border-2 border-mint-500">Free</Legend>
            <Legend cls="bg-brand-100 border-2 border-brand-300">Paid</Legend>
            <Legend cls="bg-brand-600">Selected</Legend>
            <Legend cls="bg-line">Unavailable</Legend>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="mx-auto w-fit rounded-[40px_40px_16px_16px] border-2 border-line bg-surface/50 px-4 pt-8 pb-4">
            {headerRow && (
              <div className="flex gap-5 justify-center mb-2 pl-8">
                {headerRow.sections.map((s, si) => (
                  <div key={si} className="flex gap-1">
                    {s.elements.map((e, ei) => <span key={ei} className="w-8 text-center text-[11px] font-bold text-muted">{e.designator?.replace(/^\d+/, "")}</span>)}
                  </div>
                ))}
              </div>
            )}
            {map.cabins.map((cabin, ci) => (
              <div key={ci} className="space-y-1">
                {cabin.rows.map((row, ri) => {
                  const rowNo = row.sections.flatMap((s) => s.elements).find((e) => e.designator)?.designator?.match(/^\d+/)?.[0];
                  const isExit = row.sections.every((s) => s.elements.every((e) => e.type === "exit_row"));
                  if (isExit) return <div key={ri} className="text-center text-[10px] font-bold uppercase tracking-wider text-accent-600 py-1">◂ Exit ▸</div>;
                  return (
                    <div key={ri} className="flex items-center gap-5">
                      <span className="w-6 -mr-2 text-right text-[11px] font-semibold text-muted">{rowNo}</span>
                      {row.sections.map((sec, si) => (
                        <div key={si} className="flex gap-1">
                          {sec.elements.map((el, ei) => {
                            if (el.type !== "seat") return <span key={ei} className="w-8 h-8 grid place-items-center text-[9px] text-muted">{el.type === "lavatory" ? "WC" : el.type === "galley" ? "G" : ""}</span>;
                            const occupant = el.designator ? takenBy.get(el.designator) : undefined;
                            const svc = el.services.find((s) => s.passengerId === activePax);
                            const available = !!svc;
                            const mine = occupant === activePax;
                            const free = svc && svc.price.amount === 0;
                            const cls = occupant
                              ? mine ? "bg-brand-600 text-white ring-2 ring-brand-300" : "bg-brand-400 text-white"
                              : !available ? "bg-line text-transparent cursor-not-allowed"
                              : free ? "bg-white border-2 border-mint-500 hover:bg-mint-500/10"
                              : "bg-brand-100 border-2 border-brand-300 hover:bg-brand-200";
                            return (
                              <button key={ei} type="button" disabled={!available || (!!occupant && !mine)} onClick={() => choose(el)}
                                title={`${el.designator}${svc ? ` · ${svc.price.amount ? formatMoney(svc.price) : "Free"}` : " · Unavailable"}${el.disclosures?.length ? "\n" + el.disclosures.join(" ") : ""}`}
                                aria-label={`Seat ${el.designator}${svc ? (svc.price.amount ? `, ${formatMoney(svc.price)}` : ", free") : ", unavailable"}`}
                                className={`w-8 h-8 rounded-t-lg rounded-b-sm text-[10px] font-bold transition ${cls}`}>
                                {occupant ? el.designator?.replace(/^\d+/, "") : ""}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <p className="flex items-center gap-2"><span className={`w-4 h-4 rounded ${cls}`} />{children}</p>;
}
