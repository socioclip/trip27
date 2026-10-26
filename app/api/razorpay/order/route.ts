import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { fail } from "@/lib/http";
import { createOrder, razorpayEnabled, razorpayPublicConfig, razorpayTestMode } from "@/lib/razorpay";

// Creates a Razorpay order for the /payments/razorpay-test page.
// Only works with TEST keys, so this endpoint can never take real money.
const CURRENCIES = ["INR", "AED", "USD"];
const MAX = 100_000; // largest test amount, in major units

export async function POST(req: Request) {
  if (!razorpayEnabled()) return NextResponse.json({ error: "Razorpay is not configured." }, { status: 503 });
  if (!razorpayTestMode()) return NextResponse.json({ error: "The test page only runs with Razorpay test keys." }, { status: 403 });

  let body: { amount?: unknown; currency?: unknown; name?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const amount = Number(body.amount);
  const currency = String(body.currency || "INR").toUpperCase();
  if (!CURRENCIES.includes(currency)) return NextResponse.json({ error: `Currency must be one of ${CURRENCIES.join(", ")}.` }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 1 || amount > MAX) return NextResponse.json({ error: `Amount must be between 1 and ${MAX.toLocaleString()}.` }, { status: 400 });

  try {
    const amountMinor = Math.round(amount * 100); // INR, AED and USD all use 2 decimals
    const receipt = "T27-TEST-" + randomBytes(5).toString("hex").toUpperCase();
    const order = await createOrder({
      amountMinor,
      currency,
      receipt,
      notes: { purpose: "razorpay-test-page", ...(body.email ? { email: String(body.email).slice(0, 100) } : {}) },
    });
    return NextResponse.json({ order, config: razorpayPublicConfig() });
  } catch (e) {
    return fail(e);
  }
}
