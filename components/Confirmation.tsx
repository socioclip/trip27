"use client";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Order } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import SliceDetails from "./flight/SliceDetails";

type Stored = Order & { sliceLabels?: string[] };

export default function Confirmation({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Stored | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let local: Stored | null = null;
    try {
      const s = sessionStorage.getItem("trip27:order:" + orderId);
      if (s) local = JSON.parse(s);
    } catch {}
    if (local) {
      setOrder(local);
      return;
    }
    fetch(api(`/api/orders/${encodeURIComponent(orderId)}`))
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Booking not found.");
        setOrder(j.order);
      })
      .catch((e) => setError(e.message));
  }, [orderId]);

  if (error)
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-xl font-extrabold">We couldn&apos;t find that booking</p>
        <p className="text-muted mt-2">{error}</p>
        <Link href="/" className="btn-primary mt-6">Search flights</Link>
      </div>
    );
  if (!order) return <div className="mx-auto max-w-3xl px-4 py-10"><div className="skeleton h-96 rounded-2xl" /></div>;

  const labels = order.sliceLabels || order.slices.map((_, i) => (order.slices.length === 2 && order.slices[0].origin.code === order.slices[1].destination.code ? ["Outbound", "Return"][i] : `Flight ${i + 1}`));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="card overflow-hidden">
        <div className="bg-brand-900 text-white p-6 sm:p-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-60" aria-hidden style={{ background: "radial-gradient(600px 240px at 100% 0%, #6c44f5 0%, transparent 60%)" }} />
          <div className="relative flex flex-wrap items-center gap-4 justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-mint-500 text-white text-xs font-bold px-3 py-1">✓ {order.status === "confirmed" ? "Booking confirmed" : "Booking received"}</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold mt-3">You&apos;re going to {order.slices[0]?.destination.city}!</h1>
              <p className="text-white/70 text-sm mt-1">{order.emailSent && order.contactEmail ? `Confirmation sent to ${order.contactEmail}` : "Keep your booking reference handy."}</p>
            </div>
            <div className="rounded-2xl bg-white/10 border border-white/20 px-5 py-3 text-center">
              <p className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">Booking reference</p>
              <p className="text-3xl font-extrabold tracking-[0.2em]">{order.bookingReference}</p>
            </div>
          </div>
        </div>

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
            <p className="label">Total paid</p>
            <p className="text-2xl font-extrabold text-brand-800">{formatMoney(order.total, { decimals: true })}</p>
            <p className="text-xs text-muted">Order {order.id}</p>
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
