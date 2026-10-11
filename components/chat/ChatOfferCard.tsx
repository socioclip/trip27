"use client";
import type { OfferCard } from "@/lib/chat/protocol";
import { formatMoney, prettyDate } from "@/lib/format";
import AirlineLogo from "../flight/AirlineLogo";
import SliceSummary from "../flight/SliceSummary";

// Compact itinerary card inside the chat. Every fare option books through the
// normal checkout, exactly as from the results page.
export default function ChatOfferCard({ card, onBook, busy }: { card: OfferCard; onBook: (ref: string) => void; busy: string | null }) {
  const o = card.offer;
  const carriers = [...new Map(o.slices.flatMap((s) => s.segments.map((g) => [g.carrier.code, g.carrier]))).values()];
  const round = o.slices.length === 2 && o.slices[0].origin.code === o.slices[1].destination.code;
  return (
    <article className="rounded-xl border border-line bg-white p-3">
      <div className="flex items-center gap-2">
        <AirlineLogo carrier={o.owner} size={26} />
        <p className="text-[13px] font-semibold truncate flex-1">{carriers.map((c) => c.name).join(" · ")}</p>
        {o.id.startsWith("jnko_") && <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Partner</span>}
      </div>
      <div className="mt-2.5 space-y-2.5">
        {o.slices.map((s, i) => (
          <div key={s.id || i}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1">
              {round ? (i === 0 ? "Out" : "Return") : o.slices.length > 1 ? `Flight ${i + 1}` : "Flight"} · {prettyDate(s.departingAt)}
            </p>
            <SliceSummary slice={s} />
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-1.5">
        {card.fares.map((f) => (
          <button
            key={f.ref}
            type="button"
            onClick={() => onBook(f.ref)}
            disabled={!!busy}
            className="group flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-left hover:border-brand-300 hover:bg-brand-50 transition disabled:opacity-60"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold truncate">{f.brand}</span>
              <span className="block text-[11px] text-muted">
                {f.checkedBags > 0 ? `${f.checkedBags} checked bag` : "Cabin bag only"}
                {f.refundable ? " · Refundable" : f.refundable === false ? " · Non-refundable" : ""}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-[15px] font-extrabold text-brand-800">{formatMoney(f.price)}</span>
              <span className="block text-[11px] font-semibold text-accent-600 group-hover:underline">{busy === f.ref ? "Opening…" : "Book →"}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{card.travellers > 1 ? `Total for ${card.travellers} travellers` : "Per traveller"} · incl. taxes</p>
    </article>
  );
}
