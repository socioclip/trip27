"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { completePayment, PENDING_KEY } from "./CardPayment";

// Customers land here if their bank's 3D Secure step redirects away from the site.
export default function PaymentReturn() {
  const sp = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const paymentId = sp.get("cko-payment-id") || "";
    if (sp.get("failed")) {
      setError("Your payment wasn't completed, so you haven't been charged.");
      return;
    }
    let token = "";
    try {
      token = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "{}").token || "";
    } catch {}
    if (!paymentId || !token) {
      setError("We couldn't find your booking session. If you were charged, contact us with your payment reference.");
      return;
    }
    completePayment(paymentId, token)
      .then((order) => {
        try {
          sessionStorage.removeItem(PENDING_KEY);
          sessionStorage.setItem("trip27:order:" + order.id, JSON.stringify(order));
        } catch {}
        router.replace(`/booking/${encodeURIComponent(order.id)}`);
      })
      .catch((e) => setError((e as Error).message));
  }, [sp, router]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      {error ? (
        <>
          <p className="text-xl font-extrabold">Booking not completed</p>
          <p className="text-muted mt-2">{error}</p>
          <Link href="/" className="btn-primary mt-6">Search flights</Link>
        </>
      ) : (
        <>
          <span className="inline-block w-10 h-10 rounded-full border-4 border-brand-600 border-t-transparent animate-spin" />
          <p className="mt-4 text-lg font-bold">Confirming your booking…</p>
          <p className="text-muted text-sm">Please don&apos;t close this page.</p>
        </>
      )}
    </div>
  );
}
