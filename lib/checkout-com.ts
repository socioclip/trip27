import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { ProviderError, type CreateOrderInput } from "./types";

export interface BookingToken {
  booking: CreateOrderInput;
  amount: number; // display currency
  amountMinor: number;
  currency: string;
  reference: string;
  exp: number; // ms epoch
}

// Checkout.com integration (Flow + Payments API).
// Customers pay by card on Checkout.com's hosted Flow component; card data
// never touches our servers. Payments are AUTHORISED first and only CAPTURED
// after the airline booking succeeds; if booking fails the payment is voided.

const env = (k: string) => (process.env[k] || "").trim();

export function ckoEnabled() {
  return !!(env("CKO_SECRET_KEY") && env("CKO_PUBLIC_KEY") && env("CKO_API_URL"));
}

export function ckoPublicConfig() {
  if (!ckoEnabled()) return null;
  return {
    provider: "checkout" as const,
    publicKey: env("CKO_PUBLIC_KEY"),
    environment: env("CKO_ENVIRONMENT") === "production" ? ("production" as const) : ("sandbox" as const),
  };
}

async function cko<T = unknown>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(env("CKO_API_URL").replace(/\/$/, "") + path, {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${env("CKO_SECRET_KEY")}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "Cko-Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  if (!res.ok) {
    console.error("[checkout.com]", init.method || "GET", path, res.status, text.slice(0, 800));
    const codes = (json as { error_codes?: string[] } | null)?.error_codes;
    throw new ProviderError(`Payment provider error${codes?.length ? ` (${codes.join(", ")})` : ""}.`, res.status >= 500 ? 502 : 400);
  }
  return json as T;
}

export interface SessionInput {
  amountMinor: number;
  currency: string;
  reference: string;
  description: string;
  customer: { name: string; email: string };
  billingCountry: string;
  successUrl: string;
  failureUrl: string;
  ip?: string | null;
}

export async function createPaymentSession(i: SessionInput) {
  const pc = env("CKO_PROCESSING_CHANNEL_ID");
  return cko<Record<string, unknown>>("/payment-sessions", {
    method: "POST",
    body: {
      amount: i.amountMinor,
      currency: i.currency,
      reference: i.reference,
      description: i.description.slice(0, 100),
      display_name: "trip27",
      payment_type: "Regular",
      capture: false,
      billing: { address: { country: i.billingCountry } },
      customer: i.customer,
      success_url: i.successUrl,
      failure_url: i.failureUrl,
      enabled_payment_methods: ["card"],
      "3ds": { enabled: true, attempt_n3d: true },
      ...(pc ? { processing_channel_id: pc } : {}),
      ...(i.ip ? { ip_address: i.ip } : {}),
      metadata: { source: "trip27" },
    },
  });
}

export interface CkoPayment {
  id: string;
  status: string; // Authorized | Captured | Declined | Pending | Voided | Card Verified ...
  amount: number;
  currency: string;
  reference?: string;
  approved?: boolean;
}

export function getPayment(id: string) {
  if (!/^pay_[a-z0-9]+$/i.test(id)) throw new ProviderError("Invalid payment.", 400);
  return cko<CkoPayment>(`/payments/${id}`);
}

export function capturePayment(id: string, reference: string) {
  return cko(`/payments/${id}/captures`, { method: "POST", body: { reference }, idempotencyKey: `cap-${id}` });
}

export function voidPayment(id: string, reference: string) {
  return cko(`/payments/${id}/voids`, { method: "POST", body: { reference }, idempotencyKey: `void-${id}` });
}

// ---- signed booking tokens --------------------------------------------------
// The booking request is signed when the payment session is created and
// verified when the payment completes, so the browser can't change what is
// booked or what it costs in between. No database needed.

function key() {
  return env("BOOKING_SIGNING_SECRET") || env("CKO_SECRET_KEY");
}

export function sign(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<T>(token: string): T {
  const [body, mac] = String(token || "").split(".");
  if (!body || !mac) throw new ProviderError("Invalid booking session. Please try again.", 400);
  const expected = createHmac("sha256", key()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    throw new ProviderError("Invalid booking session. Please try again.", 400);
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
}

// Minor units per ISO-4217 (Checkout.com uses 2 for AED/USD/etc., 3 for KWD/BHD/OMR/JOD).
export function toMinor(amount: number, currency: string) {
  const three = ["BHD", "KWD", "OMR", "JOD", "TND", "LYD", "IQD"];
  const zero = ["JPY", "KRW", "VND", "CLP", "ISK"];
  const exp = three.includes(currency) ? 3 : zero.includes(currency) ? 0 : 2;
  return Math.round(amount * 10 ** exp);
}
