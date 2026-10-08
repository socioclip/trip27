"use client";
import type { Offer, PassengerInput } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import SliceDetails from "../flight/SliceDetails";
import { Field } from "./PassengerForms";
import type { SeatSelections } from "./SeatSelection";

export interface Card {
  name: string;
  number: string;
  expiry: string;
  cvc: string;
  agree: boolean;
}

function luhn(num: string) {
  const d = num.replace(/\D/g, "");
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export function validateCard(c: Card): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.name.trim().length < 2) e.name = "Enter the name on the card";
  if (!luhn(c.number)) e.number = "Enter a valid card number";
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(c.expiry);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) e.expiry = "Use MM/YY";
  else {
    const now = new Date();
    const exp = new Date(2000 + Number(m[2]), Number(m[1]), 1);
    if (exp <= now) e.expiry = "This card has expired";
  }
  if (!/^\d{3,4}$/.test(c.cvc)) e.cvc = "3 or 4 digits";
  if (!c.agree) e.agree = "Please accept the fare rules and terms";
  return e;
}

export default function Payment({
  offer,
  pax,
  seats,
  bags,
  card,
  setCard,
  errors,
  sliceLabels,
  mode,
}: {
  offer: Offer;
  pax: PassengerInput[];
  seats: SeatSelections;
  bags: { label: string; qty: number }[];
  card: Card;
  setCard: (c: Card) => void;
  errors: Record<string, string>;
  sliceLabels: string[];
  mode: string;
}) {
  const brand = /^4/.test(card.number) ? "Visa" : /^(5[1-5]|2[2-7])/.test(card.number) ? "Mastercard" : /^3[47]/.test(card.number) ? "Amex" : "";
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h2 className="text-lg font-extrabold mb-4">Review your trip</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {offer.slices.map((s, i) => (
            <SliceDetails key={i} slice={s} title={`${sliceLabels[i]}: ${s.origin.city} → ${s.destination.city}`} />
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-line grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="label">Travellers</p>
            {pax.map((p) => {
              const ps = Object.entries(seats).filter(([k]) => k.endsWith("|" + p.id)).map(([, v]) => v.designator);
              return (
                <p key={p.id}>
                  <b>{p.title.toUpperCase()} {p.givenName} {p.familyName}</b>
                  <span className="text-muted"> · {p.type === "infant_without_seat" ? "Infant" : p.type === "child" ? "Child" : "Adult"}{ps.length ? ` · Seats ${ps.join(", ")}` : ""}</span>
                </p>
              );
            })}
          </div>
          <div>
            <p className="label">Baggage</p>
            <p>{offer.carryOnBags || 1} cabin bag{offer.checkedBags ? ` + ${offer.checkedBags} checked` : ""} per traveller</p>
            {bags.map((b) => <p key={b.label} className="text-muted">+ {b.qty} × {b.label}</p>)}
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-surface p-3 text-xs text-muted">
          <b className="text-ink">Fare rules: </b>
          {offer.conditions.changeable === false ? "Changes not permitted. " : offer.conditions.changePenalty?.amount ? `Changes allowed for ${formatMoney(offer.conditions.changePenalty)} plus any fare difference. ` : offer.conditions.changeable ? "Free changes (fare difference may apply). " : "Changes subject to airline rules. "}
          {offer.conditions.refundable === false ? "Non-refundable." : offer.conditions.refundPenalty?.amount ? `Refundable for a fee of ${formatMoney(offer.conditions.refundPenalty)}.` : offer.conditions.refundable ? "Fully refundable." : "Refunds subject to airline rules."}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-extrabold">Payment</h2>
          <span className="text-xs text-muted inline-flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden><path d="M12 1 4 4.5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11v-6L12 1Zm0 11h6c-.5 4-3 7.5-6 8.5V12H6V6l6-2.6V12Z"/></svg>
            Secure payment
          </span>
        </div>
        {mode !== "live" && (
          <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {mode === "demo" ? "Demo" : "Test"} mode: no card is charged. Use test card <b>4242 4242 4242 4242</b>, any future date and any CVC.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name on card" error={errors.name}>
            <input className="field" autoComplete="cc-name" value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} />
          </Field>
          <Field label={`Card number${brand ? ` · ${brand}` : ""}`} error={errors.number}>
            <input className="field tracking-wider" inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" value={card.number}
              onChange={(e) => setCard({ ...card, number: e.target.value.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim() })} />
          </Field>
          <Field label="Expiry" error={errors.expiry}>
            <input className="field" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.expiry}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                setCard({ ...card, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d });
              }} />
          </Field>
          <Field label="CVC" error={errors.cvc}>
            <input className="field" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          </Field>
        </div>
        <label className="mt-4 flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" className="w-4 h-4 mt-0.5" checked={card.agree} onChange={(e) => setCard({ ...card, agree: e.target.checked })} />
          <span>I confirm the traveller details are correct and accept the fare rules, the airline&apos;s conditions of carriage and trip27&apos;s terms of use.</span>
        </label>
        {errors.agree && <p role="alert" className="text-xs font-medium text-accent-600 mt-1">{errors.agree}</p>}
      </div>
    </div>
  );
}
