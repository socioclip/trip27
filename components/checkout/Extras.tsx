"use client";
import type { BaggageService, Offer, PassengerInput } from "@/lib/types";
import { formatMoney } from "@/lib/format";

export default function Extras({
  offer,
  baggage,
  pax,
  bags,
  setBags,
}: {
  offer: Offer;
  baggage: BaggageService[];
  pax: PassengerInput[];
  bags: Record<string, number>;
  setBags: (b: Record<string, number>) => void;
}) {
  const included = offer.checkedBags;
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-lg font-extrabold">Baggage</h2>
        <p className="text-sm text-muted">
          Your fare includes {offer.carryOnBags || 1} cabin bag{included ? ` and ${included} checked bag${included > 1 ? "s" : ""}` : ""} per traveller.
          {baggage.length ? " Add more now — it's usually cheaper than at the airport." : ""}
        </p>
        {!baggage.length ? (
          <p className="mt-4 rounded-xl bg-surface p-4 text-sm text-muted">The airline doesn&apos;t sell extra baggage online for this fare. You can add bags with the airline after booking.</p>
        ) : (
          <div className="mt-4 divide-y divide-line">
            {pax.filter((p) => p.type !== "infant_without_seat").map((p, i) => {
              const items = baggage.filter((b) => b.passengerIds.includes(p.id));
              if (!items.length) return null;
              return (
                <div key={p.id} className="py-4">
                  <p className="font-bold mb-2">{p.givenName ? `${p.givenName} ${p.familyName}` : `Traveller ${i + 1}`}</p>
                  <div className="space-y-2">
                    {items.map((b) => {
                      const q = bags[b.id] || 0;
                      return (
                        <div key={b.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                          <span className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 grid place-items-center shrink-0" aria-hidden>
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M9 2h6v3h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-1v1h-2v-1H9v1H7v-1H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3V2Zm2 3h2V4h-2v1Zm-3 4v8h2V9H8Zm6 0v8h2V9h-2Z"/></svg>
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{b.label}</p>
                            <p className="text-xs text-muted">{formatMoney(b.price, { decimals: true })} each{b.maxQuantity > 1 ? ` · up to ${b.maxQuantity}` : ""}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" aria-label="Remove bag" disabled={q === 0} onClick={() => setBags({ ...bags, [b.id]: q - 1 })} className="w-8 h-8 rounded-full border border-brand-300 text-brand-700 font-bold disabled:opacity-30">−</button>
                            <span className="w-4 text-center font-bold">{q}</span>
                            <button type="button" aria-label="Add bag" disabled={q >= b.maxQuantity} onClick={() => setBags({ ...bags, [b.id]: q + 1 })} className="w-8 h-8 rounded-full border border-brand-300 text-brand-700 font-bold disabled:opacity-30">+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
