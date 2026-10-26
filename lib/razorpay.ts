import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { ProviderError } from "./types";

// Razorpay Standard Checkout (Orders API + checkout.js).
// Flow: the server creates an Order for a fixed amount → the browser opens
// Razorpay's checkout with that order id → Razorpay returns
// (order_id, payment_id, signature) → the server verifies the HMAC signature
// with the key secret, then captures the payment if it is only authorised.
// Card data never touches our servers.

const env = (k: string) => (process.env[k] || "").trim();
const first = (...keys: string[]) => keys.map(env).find(Boolean) || "";

// Accept the usual names people give these variables in Vercel.
const keyId = () => first("RAZORPAY_KEY_ID", "NEXT_PUBLIC_RAZORPAY_KEY_ID", "RAZORPAY_KEY", "RAZORPAY_API_KEY");
const keySecret = () => first("RAZORPAY_KEY_SECRET", "RAZORPAY_SECRET", "RAZORPAY_API_SECRET", "RAZORPAY_SECRET_KEY");

export function razorpayEnabled() {
  return !!(keyId() && keySecret());
}

/** True when the configured key is a test key (rzp_test_…): no real money moves. */
export function razorpayTestMode() {
  return keyId().startsWith("rzp_test_");
}

export function razorpayPublicConfig() {
  if (!razorpayEnabled()) return null;
  return { provider: "razorpay" as const, keyId: keyId(), mode: razorpayTestMode() ? ("test" as const) : ("live" as const) };
}

async function rzp<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const auth = Buffer.from(`${keyId()}:${keySecret()}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1" + path, {
    method: init.method || "GET",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
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
    console.error("[razorpay]", init.method || "GET", path, res.status, text.slice(0, 800));
    const desc = (json as { error?: { description?: string } } | null)?.error?.description;
    throw new ProviderError(`Payment provider error${desc ? `: ${desc}` : "."}`, res.status >= 500 ? 502 : 400);
  }
  return json as T;
}

export interface RzpOrder {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status: string; // created | attempted | paid
}

export interface RzpPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string; // created | authorized | captured | refunded | failed
  method?: string;
  email?: string;
  contact?: string;
  captured?: boolean;
  error_description?: string | null;
}

export function createOrder(i: { amountMinor: number; currency: string; receipt: string; notes?: Record<string, string> }) {
  return rzp<RzpOrder>("/orders", {
    method: "POST",
    body: { amount: i.amountMinor, currency: i.currency, receipt: i.receipt.slice(0, 40), notes: { source: "trip27", ...(i.notes || {}) } },
  });
}

export function getOrder(id: string) {
  if (!/^order_[A-Za-z0-9]+$/.test(id)) throw new ProviderError("Invalid order.", 400);
  return rzp<RzpOrder>(`/orders/${id}`);
}

export function getPayment(id: string) {
  if (!/^pay_[A-Za-z0-9]+$/.test(id)) throw new ProviderError("Invalid payment.", 400);
  return rzp<RzpPayment>(`/payments/${id}`);
}

export function capturePayment(id: string, amountMinor: number, currency: string) {
  return rzp<RzpPayment>(`/payments/${id}/capture`, { method: "POST", body: { amount: amountMinor, currency } });
}

/** Checks the signature checkout.js returns: HMAC-SHA256(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const expected = createHmac("sha256", keySecret()).update(`${orderId}|${paymentId}`).digest();
  const given = Buffer.from(String(signature || ""), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Checks a webhook's X-Razorpay-Signature against RAZORPAY_WEBHOOK_SECRET. */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(String(signature || ""), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
