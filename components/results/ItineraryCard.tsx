"use client";
import { useState } from "react";
import type { ItineraryGroup, Offer } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import AirlineLogo from "../flight/AirlineLogo";
import SliceSummary from "../flight/SliceSummary";
import SliceDetails from "../flight/SliceDetails";

export default function ItineraryCard({
  group,
  sliceLabels,
  travellers,
  badge,
  onSelect,
  selecting,
}: {
  group: ItineraryGroup;
  sliceLabels: string[];
  travellers: number;
  badge?: string;
  onSelect: (o: Offer) => void;
  selecting: string | null;
}) {
  const [open, setOpen] = useState<null | "fares" | "details">(null);
  const carriers = [...new Map(group.slices.flatMap((s) => s.segments.map((g) => [g.carrier.code, g.carrier]))).values()];
  const c = group.cheapest;

  return (
    <article className={`card overflow-hidden transition ${open ? "ring-2 ring-brand-200" : "hover:shadow-md"}`}>
      {badge && <div className="bg-mint-500/10 text-mint-500 text-xs font-bold px-5 py-1.5">{badge}</div>}
      <div className="grid md:grid-cols-[1fr_200px]">
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <AirlineLogo carrier={group.owner} size={30} />
            <p className="text-sm font-semibold truncate">{carriers.map((x) => x.name).join(" · ")}</p>
          </div>
          {group.slices.map((s, i) => (
            <div key={i} className="grid grid-cols-[64px_1fr] sm:grid-cols-[84px_1fr] items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{sliceLabels[i]}</span>
              <SliceSummary slice={s} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2 text-xs">
            <Tag>{c.slices[0]?.segments[0]?.cabin || "Economy"}</Tag>
            {c.checkedBags > 0 ? <Tag tone="ok">Checked bag included</Tag> : <Tag>Cabin bag only</Tag>}
            {group.fares.length > 1 && <Tag>{group.fares.length} fare options</Tag>}
            <button type="button" onClick={() => setOpen(open === "details" ? null : "details")} className="text-brand-600 font-semibold hover:underline ml-auto">
              {open === "details" ? "Hide details" : "Flight details"}
            </button>
          </div>
        </div>
        <div className="border-t md:border-t-0 md:border-l border-dashed border-line p-4 sm:p-5 flex md:flex-col items-center md:items-stretch justify-between gap-3 bg-surface/40">
          <div className="md:text-right">
            <p className="text-xs text-muted">{group.fares.length > 1 ? "From" : "Total"}</p>
            <p className="text-2xl font-extrabold text-brand-800 leading-tight">{formatMoney(c.total)}</p>
            <p className="text-[11px] text-muted">{travellers > 1 ? `Total for ${travellers} travellers` : "Per traveller"} · incl. taxes</p>
          </div>
          <button
            type="button"
            className="btn-primary !px-7"
            onClick={() => (group.fares.length === 1 ? onSelect(c) : setOpen(open === "fares" ? null : "fares"))}
            disabled={!!selecting}
            aria-expanded={open === "fares"}
          >
            {selecting === c.id ? "Loading…" : open === "fares" ? "Hide fares" : "Select"}
          </button>
        </div>
      </div>

      {open === "fares" && (
        <div className="border-t border-line bg-surface/60 p-4 sm:p-5">
          <p className="font-bold mb-3">Choose your fare</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.fares.map((o, i) => (
              <FareCard key={o.id} offer={o} base={c} recommended={group.fares.length > 2 && i === 1} onSelect={() => onSelect(o)} loading={selecting === o.id} disabled={!!selecting} />
            ))}
          </div>
        </div>
      )}
      {open === "details" && (
        <div className="border-t border-line p-4 sm:p-6 grid gap-6 lg:grid-cols-2">
          {group.slices.map((s, i) => (
            <SliceDetails key={i} slice={s} title={`${sliceLabels[i]}: ${s.origin.city} → ${s.destination.city}`} />
          ))}
        </div>
      )}
    </article>
  );
}

function FareCard({ offer, base, recommended, onSelect, loading, disabled }: { offer: Offer; base: Offer; recommended: boolean; onSelect: () => void; loading: boolean; disabled: boolean }) {
  const diff = offer.total.amount - base.total.amount;
  const cond = offer.conditions;
  const items: [boolean | null, string][] = [
    [true, `${offer.carryOnBags || 1} cabin bag`],
    [offer.checkedBags > 0, offer.checkedBags > 0 ? `${offer.checkedBags} checked bag${offer.checkedBags > 1 ? "s" : ""}` : "No checked bag"],
    [
      cond.changeable,
      cond.changeable == null ? "Changes: airline rules apply" : !cond.changeable ? "Not changeable" : cond.changePenalty && cond.changePenalty.amount > 0 ? `Change fee ${formatMoney(cond.changePenalty)}` : "Free changes",
    ],
    [
      cond.refundable,
      cond.refundable == null ? "Refunds: airline rules apply" : !cond.refundable ? "Non-refundable" : cond.refundPenalty && cond.refundPenalty.amount > 0 ? `Refund fee ${formatMoney(cond.refundPenalty)}` : "Fully refundable",
    ],
  ];
  return (
    <div className={`relative rounded-2xl bg-white border p-4 flex flex-col ${recommended ? "border-brand-500 shadow-md" : "border-line"}`}>
      {recommended && <span className="absolute -top-2.5 left-4 bg-brand-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5">Popular</span>}
      <p className="font-extrabold">{offer.fareBrand}</p>
      <ul className="mt-3 space-y-2 text-sm flex-1">
        {items.map(([ok, t]) => (
          <li key={t} className="flex gap-2">
            <span className={ok === true ? "text-mint-500" : ok === false ? "text-accent-600" : "text-muted"} aria-hidden>{ok === true ? "✓" : ok === false ? "✕" : "•"}</span>
            <span className={ok === false ? "text-muted" : ""}>{t}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <p className="text-xl font-extrabold text-brand-800">{formatMoney(offer.total)}</p>
          {diff > 0 && <p className="text-[11px] text-muted">+{formatMoney({ amount: diff, currency: offer.total.currency })}</p>}
        </div>
        <button type="button" onClick={onSelect} disabled={disabled} className="btn-brand !px-4 !py-2.5 text-sm">{loading ? "Loading…" : "Select"}</button>
      </div>
    </div>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "ok" }) {
  return <span className={`rounded-md px-2 py-1 font-semibold ${tone === "ok" ? "bg-mint-500/10 text-mint-500" : "bg-surface text-muted"}`}>{children}</span>;
}
