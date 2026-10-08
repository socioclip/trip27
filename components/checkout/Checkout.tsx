"use client";
import { api } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { BaggageService, CreateOrderInput, Offer, Order, PassengerInput, SeatMap, SelectedService } from "@/lib/types";
import { fromQuery } from "@/lib/search";
import { formatMoney } from "@/lib/format";
import PassengerForms, { validatePassengers, type Contact } from "./PassengerForms";
import SeatSelection, { type SeatSelections } from "./SeatSelection";
import Extras from "./Extras";
import Payment, { validateCard, type Card } from "./Payment";
import Summary from "./Summary";
import CardPayment, { type PaymentsConfig } from "./CardPayment";
import ModeBanner from "../ModeBanner";

const STEPS = ["Travellers", "Seats", "Extras", "Payment"] as const;

export default function Checkout({ offerId }: { offerId: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const qs = sp.toString();
  const parsed = useMemo(() => fromQuery(new URLSearchParams(qs)), [qs]);
  const trip = "error" in parsed ? "oneway" : parsed.trip;

  const [offer, setOffer] = useState<Offer | null>(null);
  const [baggage, setBaggage] = useState<BaggageService[]>([]);
  const [mode, setMode] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seatMaps, setSeatMaps] = useState<SeatMap[] | null>(null);
  const [step, setStep] = useState(0);
  const [pax, setPax] = useState<PassengerInput[]>([]);
  const [contact, setContact] = useState<Contact>({ email: "", dial: "971", phone: "" });
  const [seats, setSeats] = useState<SeatSelections>({});
  const [bags, setBags] = useState<Record<string, number>>({});
  const [card, setCard] = useState<Card>({ name: "", number: "", expiry: "", cvc: "", agree: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [payments, setPayments] = useState<PaymentsConfig | null>(null);
  const [flowBooking, setFlowBooking] = useState<CreateOrderInput | null>(null);

  // Load the latest offer (price can change since search).
  useEffect(() => {
    let cancelled = false;
    try {
      const cached = sessionStorage.getItem("trip27:offer:" + offerId);
      if (cached) setOffer(JSON.parse(cached));
    } catch {}
    fetch(api(`/api/offers/${encodeURIComponent(offerId)}`))
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "This fare is no longer available.");
        if (cancelled) return;
        setOffer(j.offer);
        setBaggage(j.baggage || []);
        setMode(j.mode);
        setPayments(j.payments || null);
        setPax((prev) =>
          prev.length
            ? prev
            : (j.offer as Offer).passengers.map((p) => ({
                id: p.id,
                type: p.type,
                title: p.type === "adult" ? "mr" : "mr",
                gender: "m",
                givenName: "",
                familyName: "",
                bornOn: "",
                email: "",
                phone: "",
              }))
        );
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    fetch(api(`/api/offers/${encodeURIComponent(offerId)}/seats`))
      .then((r) => r.json())
      .then((j) => !cancelled && setSeatMaps(j.seatMaps || []))
      .catch(() => !cancelled && setSeatMaps([]));
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sliceLabels = useMemo(
    () => (offer ? (trip === "round" ? ["Outbound", "Return"] : offer.slices.map((_, i) => (offer.slices.length > 1 ? `Flight ${i + 1}` : "Outbound"))) : []),
    [offer, trip]
  );

  const lines = useMemo(() => {
    if (!offer) return null;
    const cur = offer.total.currency;
    const seatSum = Object.values(seats).reduce((n, s) => n + s.amount, 0);
    const bagSum = Object.entries(bags).reduce((n, [id, q]) => n + (baggage.find((b) => b.id === id)?.price.amount || 0) * q, 0);
    const fee = offer.serviceFee.amount;
    const fare = offer.total.amount - fee;
    return { fare, seats: seatSum, bags: bagSum, fee, total: Math.round((fare + seatSum + bagSum + fee) * 100) / 100, currency: cur };
  }, [offer, seats, bags, baggage]);

  if (loadError && !offer)
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-xl font-extrabold">This fare is no longer available</p>
        <p className="text-muted mt-2">{loadError}</p>
        <Link href={"error" in parsed ? "/" : `/flights?${qs}`} className="btn-primary mt-6">Back to results</Link>
      </div>
    );

  if (!offer || !lines)
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">{[0, 1].map((i) => <div key={i} className="skeleton h-56 rounded-2xl" />)}</div>
        <div className="skeleton h-80 rounded-2xl" />
      </div>
    );

  const expiresIn = offer.expiresAt ? Math.max(0, Math.round((Date.parse(offer.expiresAt) - now) / 1000)) : null;

  const next = () => {
    setErrors({});
    if (step === 0) {
      const e = validatePassengers(offer, pax, contact);
      if (Object.keys(e).length) {
        setErrors(e);
        setTimeout(() => document.querySelector('[role="alert"]')?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
        return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const buildBooking = (): CreateOrderInput => {
    const phone = `+${contact.dial}${contact.phone.replace(/\D/g, "").replace(/^0+/, "")}`;
    // Infants travel on an adult's lap: link each infant to a different adult.
    const adults = pax.filter((p) => p.type === "adult");
    const infants = pax.filter((p) => p.type === "infant_without_seat");
    const passengers = pax.map((p) => {
      const ai = adults.findIndex((a) => a.id === p.id);
      return {
        ...p,
        email: contact.email,
        phone,
        infantPassengerId: ai >= 0 && infants[ai] ? infants[ai].id : undefined,
      };
    });
    const services: SelectedService[] = [
      ...Object.values(seats).map((s) => ({ id: s.serviceId, quantity: 1, supplierAmount: s.supplierAmount, displayAmount: s.amount, label: `Seat ${s.designator}` })),
      ...Object.entries(bags)
        .filter(([, q]) => q > 0)
        .map(([id, q]) => {
          const b = baggage.find((x) => x.id === id)!;
          return { id, quantity: q, supplierAmount: b.supplierAmount, displayAmount: b.price.amount, label: b.label };
        }),
    ];
    return { offerId: offer.id, passengers, services, contact: { email: contact.email, phone } };
  };

  const onBooked = (order: Order) => {
    try {
      sessionStorage.setItem("trip27:order:" + order.id, JSON.stringify({ ...order, sliceLabels }));
    } catch {}
    router.replace(`/booking/${encodeURIComponent(order.id)}`);
  };

  const pay = async () => {
    if (payments) {
      // Card details are collected by Checkout.com's secure component.
      if (!card.agree) return setErrors({ agree: "Please accept the fare rules and terms" });
      setErrors({});
      setSubmitError(null);
      setFlowBooking(buildBooking());
      return;
    }
    const e = validateCard(card);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    setSubmitError(null);
    // Demo / no gateway: card details are validated in the browser only and
    // never sent anywhere.
    try {
      const r = await fetch(api("/api/orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBooking()),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Booking failed. You have not been charged.");
      onBooked(j.order);
    } catch (err) {
      setSubmitError((err as Error).message);
      setSubmitting(false);
    }
  };

  const bagLines = Object.entries(bags)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => ({ label: baggage.find((b) => b.id === id)?.label || "Extra bag", qty: q }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link href={"error" in parsed ? "/" : `/flights?${qs}`} className="text-sm font-semibold text-brand-600 hover:underline">← Back to results</Link>

      <ol className="mt-4 mb-6 grid grid-cols-4 gap-2" aria-label="Booking steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" disabled={i > step} onClick={() => i < step && setStep(i)} className="w-full text-left group" aria-current={i === step ? "step" : undefined}>
              <span className={`block h-1.5 rounded-full ${i <= step ? "bg-brand-600" : "bg-line"}`} />
              <span className={`mt-2 flex items-center gap-2 text-xs sm:text-sm font-semibold ${i === step ? "text-ink" : i < step ? "text-brand-600" : "text-muted"}`}>
                <span className={`hidden sm:grid w-6 h-6 rounded-full place-items-center text-xs ${i < step ? "bg-brand-600 text-white" : i === step ? "bg-brand-100 text-brand-700" : "bg-line text-muted"}`}>{i < step ? "✓" : i + 1}</span>
                {s}
              </span>
            </button>
          </li>
        ))}
      </ol>

      <ModeBanner mode={mode} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
        <div>
          {step === 0 && <PassengerForms offer={offer} pax={pax} setPax={setPax} contact={contact} setContact={setContact} errors={errors} />}
          {step === 1 && <SeatSelection offer={offer} seatMaps={seatMaps} pax={pax} seats={seats} setSeats={setSeats} />}
          {step === 2 && <Extras offer={offer} baggage={baggage} pax={pax} bags={bags} setBags={setBags} />}
          {step === 3 && (
            <Payment
              offer={offer}
              pax={pax}
              seats={seats}
              bags={bagLines}
              card={card}
              setCard={(c) => {
                setCard(c);
                if (!c.agree) setFlowBooking(null);
              }}
              errors={errors}
              sliceLabels={sliceLabels}
              mode={mode}
              hosted={!!payments}
              hostedSlot={flowBooking ? <CardPayment booking={flowBooking} onBooked={onBooked} onBusy={setSubmitting} /> : null}
            />
          )}

          {submitError && <div role="alert" className="mt-4 rounded-xl border border-accent-400 bg-accent-500/10 px-4 py-3 text-sm font-medium text-accent-600">{submitError}</div>}

          <div className="mt-5 flex items-center justify-between gap-3">
            {step > 0 ? (
              <button type="button" className="btn-ghost" onClick={() => { setFlowBooking(null); setStep(step - 1); }} disabled={submitting}>Back</button>
            ) : <span />}
            {step < 3 ? (
              <button type="button" className="btn-primary px-8" onClick={next}>
                {step === 1 && !Object.keys(seats).length ? "Skip seats" : step === 2 && !bagLines.length ? "Continue without bags" : "Continue"}
              </button>
            ) : flowBooking ? (
              <span className="text-sm text-muted">Enter your card above to pay {formatMoney({ amount: lines.total, currency: lines.currency }, { decimals: true })}</span>
            ) : (
              <button type="button" className="btn-primary px-8 text-base" onClick={pay} disabled={submitting || expiresIn === 0}>
                {submitting
                  ? "Booking your flight…"
                  : payments
                    ? `Continue to pay ${formatMoney({ amount: lines.total, currency: lines.currency }, { decimals: true })}`
                    : `Pay ${formatMoney({ amount: lines.total, currency: lines.currency }, { decimals: true })}`}
              </button>
            )}
          </div>
        </div>
        <aside className="lg:sticky lg:top-20">
          <Summary offer={offer} lines={lines} sliceLabels={sliceLabels} expiresIn={expiresIn} />
        </aside>
      </div>
    </div>
  );
}
