"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { CreateOrderInput, Order } from "@/lib/types";

// Checkout.com Flow: card details are entered in Checkout.com's own secure
// component. Our server only ever sees a payment ID.

export interface PaymentsConfig {
  provider: "checkout";
  publicKey: string;
  environment: "sandbox" | "production";
}

const SCRIPT = "https://checkout-web-components.checkout.com/index.js";
type CWC = (opts: Record<string, unknown>) => Promise<{ create: (type: string, o?: Record<string, unknown>) => { mount: (el: HTMLElement) => void; unmount?: () => void } }>;

function loadScript(): Promise<CWC> {
  const w = window as unknown as { CheckoutWebComponents?: CWC };
  if (w.CheckoutWebComponents) return Promise.resolve(w.CheckoutWebComponents);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SCRIPT}"]`) as HTMLScriptElement | null;
    const s = existing || document.createElement("script");
    s.addEventListener("load", () => (w.CheckoutWebComponents ? resolve(w.CheckoutWebComponents) : reject(new Error("Payment form failed to load."))));
    s.addEventListener("error", () => reject(new Error("Payment form failed to load. Check your connection and try again.")));
    if (!existing) {
      s.src = SCRIPT;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

export const PENDING_KEY = "trip27:pendingPayment";

export async function completePayment(paymentId: string, token: string): Promise<Order> {
  const r = await fetch(api("/api/payments/complete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId, token }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "We couldn't complete your booking.");
  return j.order as Order;
}

export default function CardPayment({
  booking,
  onBooked,
  onBusy,
}: {
  booking: CreateOrderInput;
  onBooked: (order: Order) => void;
  onBusy: (busy: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "processing" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return; // React strict-mode double run
    started.current = attempt;
    let cancelled = false;
    let component: { unmount?: () => void } | null = null;
    (async () => {
      setPhase("loading");
      setError(null);
      try {
        const r = await fetch(api("/api/payments/session"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(booking),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Couldn't start the payment.");
        const token: string = j.token;
        try {
          sessionStorage.setItem(PENDING_KEY, JSON.stringify({ token, at: Date.now() }));
        } catch {}
        const CheckoutWebComponents = await loadScript();
        if (cancelled) return;
        const checkout = await CheckoutWebComponents({
          publicKey: j.config.publicKey,
          environment: j.config.environment,
          locale: "en",
          paymentSession: j.paymentSession,
          onReady: () => !cancelled && setPhase("ready"),
          onPaymentCompleted: async (_c: unknown, res: { id: string }) => {
            setPhase("processing");
            onBusy(true);
            try {
              const order = await completePayment(res.id, token);
              try {
                sessionStorage.removeItem(PENDING_KEY);
              } catch {}
              onBooked(order);
            } catch (e) {
              setError((e as Error).message);
              setPhase("error");
              onBusy(false);
            }
          },
          onError: (_c: unknown, err: { message?: string }) => {
            // Card declines etc. are shown inside Flow; surface anything else.
            if (err?.message) setError(err.message);
          },
        });
        if (cancelled || !ref.current) return;
        const flow = checkout.create("flow");
        flow.mount(ref.current);
        component = flow;
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      try {
        component?.unmount?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <div>
      {phase === "loading" && (
        <div className="flex items-center gap-3 rounded-xl bg-surface p-4 text-sm text-muted">
          <span className="w-5 h-5 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
          Preparing secure payment…
        </div>
      )}
      {phase === "processing" && (
        <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-sm font-semibold text-brand-800">
          <span className="w-5 h-5 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
          Payment approved. Confirming your seats with the airline…
        </div>
      )}
      <div ref={ref} className={phase === "processing" ? "hidden" : ""} />
      {error && (
        <div role="alert" className="mt-3 rounded-xl border border-accent-400 bg-accent-500/10 px-4 py-3 text-sm font-medium text-accent-600">
          {error}
          {phase === "error" && (
            <button type="button" className="ml-2 underline" onClick={() => setAttempt((a) => a + 1)}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
