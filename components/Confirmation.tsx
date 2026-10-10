"use client";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Order } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import SliceDetails from "./flight/SliceDetails";

type Stored = Order & { sliceLabels?: string[] };
type PayInfo = { url: string; charge?: { amount: number; currency: string }; priceChanged?: boolean; sliceLabels?: string[] };

// Orders paid on a supplier's hosted page (Jinko) are watched until they settle.
const POLL_MS = 5000;
const POLL_FOR_MS = 45 * 60_000;
const settled = (o: Order) => o.status === "confirmed" || o.status === "failed";

export default function Confirmation({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Stored | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pay, setPay] = useState<PayInfo | null>(null);
  const supplierHosted = orderId.startsWith("jnkb_");

  useEffect(() => {
    let local: Stored | null = null;
    try {
      const s = sessionStorage.getItem("trip27:order:" + orderId);
      if (s) local = JSON.parse(s);
      const p = sessionStorage.getItem("trip27:pay:" + orderId);
      if (p) setPay(JSON.parse(p));
    } catch {}
    if (local && !supplierHosted) {
      setOrder(local);
      return;
    }
    let stop = false;
    let loaded = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const load = () =>
      fetch(api(`/api/orders/${encodeURIComponent(orderId)}`), { cache: "no-store" })
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "Booking not found.");
          if (stop) return;
          loaded = true;
          setOrder(j.order);
          if (supplierHosted && !settled(j.order) && Date.now() - started < POLL_FOR_MS) timer = setTimeout(load, POLL_MS);
        })
        .catch((e) => {
          if (stop) return;
          // Once the booking has shown, ride out brief errors and keep polling.
          if (loaded && Date.now() - started < POLL_FOR_MS) timer = setTimeout(load, POLL_MS * 2);
          else setError(e.message);
        });
    load();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, supplierHosted]);

  if (error)
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-xl font-extrabold">We couldn&apos;t find that booking</p>
        <p className="text-muted mt-2">{error}</p>
        <Link href="/" className="btn-primary mt-6">Search flights</Link>
      </div>
    );
  if (!order) return <div className="mx-auto max-w-3xl px-4 py-10"><div className="skeleton h-96 rounded-2xl" /></div>;

  const labels = order.sliceLabels || pay?.sliceLabels || order.slices.map((_, i) => (order.slices.length === 2 && order.slices[0].origin.code === order.slices[1].destination.code ? ["Outbound", "Return"][i] : `Flight ${i + 1}`));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="card overflow-hidden">
        <div className="bg-brand-900 text-white p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-60" aria-hidden style={{ background: "radial-gradient(600px 240px at 100% 0%, #6c44f5 0%, transparent 60%)" }} />
          <div className="relative flex flex-wrap items-center gap-4 justify-between">
            <div>
              <span className={`inline-flex items-center gap-2 rounded-full text-white text-xs font-bold px-3 py-1 ${order.status === "failed" ? "bg-accent-600" : order.status === "confirmed" || order.status === "pending" ? "bg-mint-500" : "bg-amber-500"}`}>
                {order.status === "confirmed" ? "✓ Booking confirmed" : order.status === "pending" ? (supplierHosted ? "Issuing ticket…" : "✓ Booking received") : order.status === "failed" ? "Booking not completed" : "Awaiting payment"}
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold mt-3">
                {order.status === "failed"
                  ? "We couldn't complete this booking"
                  : order.status === "awaiting_payment"
                    ? "Complete your payment"
                    : `You're going to ${order.slices[0]?.destination.city}!`}
              </h1>
              <p className="text-white/70 text-sm mt-1">
                {order.statusNote && order.status !== "confirmed"
                  ? order.statusNote
                  : order.emailSent && order.contactEmail
                    ? `Confirmation sent to ${order.contactEmail}`
                    : supplierHosted && order.contactEmail
                      ? `Your e-ticket confirmation is emailed to ${order.contactEmail}.`
                      : "Keep your booking reference handy."}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 border border-white/20 px-5 py-3 text-center">
              <p className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">Booking reference</p>
              <p className="text-3xl font-extrabold tracking-[0.2em]">{order.bookingReference}</p>
            </div>
          </div>
        </div>

        {order.status === "awaiting_payment" && (
          <div className="mx-6 mt-5 rounded-xl border border-line bg-surface px-4 py-3 text-sm flex flex-wrap items-center gap-3 justify-between">
            <span>
              {pay?.url ? "The secure payment page opened in a new tab. This page updates by itself once you've paid." : "Finish paying on the secure payment page that opened in a new tab. This page updates by itself."}
              {pay?.charge && <> Amount: <b>{formatMoney(pay.charge, { decimals: true })}</b>{pay.priceChanged ? " (the airline updated the price since your search)" : ""}.</>}
            </span>
            {pay?.url && <a href={pay.url} target="_blank" rel="noopener noreferrer" className="btn-primary">Open payment page</a>}
          </div>
        )}

        {!order.live && (
          <p className="mx-6 mt-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            This is a test booking. No ticket was issued and no payment was taken.
          </p>
        )}

        <div className="p-6 sm:p-8 grid gap-8 md:grid-cols-2">
          {order.slices.map((s, i) => <SliceDetails key={i} slice={s} title={`${labels[i]}: ${s.origin.city} → ${s.destination.city}`} />)}
        </div>

        <div className="border-t border-line p-6 sm:p-8 grid gap-6 sm:grid-cols-3 text-sm">
          <div>
            <p className="label">Travellers</p>
            {order.passengers.map((p, i) => <p key={i} className="font-semibold">{p.name}</p>)}
          </div>
          <div>
            <p className="label">Extras</p>
            {order.services.length ? order.services.map((s, i) => <p key={i}>{s.quantity > 1 ? `${s.quantity} × ` : ""}{s.label}</p>) : <p className="text-muted">None</p>}
          </div>
          <div className="sm:text-right">
            <p className="label">{order.status === "confirmed" || order.status === "pending" ? "Total paid" : "Total"}</p>
            <p className="text-2xl font-extrabold text-brand-800">{formatMoney(order.total, { decimals: true })}</p>
            <p className="text-xs text-muted break-all">{order.supplierReference ? `Reference ${order.supplierReference}` : `Order ${order.id}`}</p>
          </div>
        </div>

        <div className="border-t border-line p-6 flex flex-wrap gap-3 no-print">
          <button type="button" className="btn-ghost" onClick={() => window.print()}>Print itinerary</button>
          <Link href="/" className="btn-primary">Book another flight</Link>
        </div>
      </div>
    </div>
  );
}
