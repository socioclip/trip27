import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { fail } from "@/lib/http";
import { liveBookingsAllowed } from "@/lib/providers";
import { isJinkoId } from "@/lib/providers/jinko";
import { quoteBooking, validateBooking } from "@/lib/booking";
import { ckoEnabled, ckoPublicConfig, createPaymentSession, sign, toMinor, type BookingToken } from "@/lib/checkout-com";
import type { CreateOrderInput } from "@/lib/types";

export const maxDuration = 60;

// Step 1 of a paid booking: price it on the server and open a Checkout.com
// payment session for exactly that amount.
export async function POST(req: Request) {
  if (!ckoEnabled()) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  let raw: CreateOrderInput;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const booking = validateBooking(raw);
    if (booking.offerId.startsWith("demo_")) return NextResponse.json({ error: "Demo fares can't be paid for." }, { status: 400 });
    if (isJinkoId(booking.offerId)) return NextResponse.json({ error: "This fare is paid on the supplier's checkout page." }, { status: 400 });
    if (!liveBookingsAllowed()) return NextResponse.json({ error: "Online booking is not enabled yet." }, { status: 503 });

    const { offer, total, currency } = await quoteBooking(booking);
    const amountMinor = toMinor(total, currency);
    const reference = "T27-" + createHash("sha256").update(JSON.stringify(booking) + Date.now()).digest("hex").slice(0, 10).toUpperCase();
    const lead = booking.passengers[0];
    const route = offer.slices.map((s) => `${s.origin.code}-${s.destination.code}`).join(" / ");
    const base = new URL(req.url).origin + (process.env.NEXT_PUBLIC_BASE_PATH || "");
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

    const session = await createPaymentSession({
      amountMinor,
      currency,
      reference,
      description: `Flight ${route}`,
      customer: { name: `${lead.givenName} ${lead.familyName}`.trim(), email: booking.contact.email },
      billingCountry: (lead.passportCountry || "AE").toUpperCase(),
      successUrl: `${base}/payment/return`,
      failureUrl: `${base}/payment/return?failed=1`,
      ip,
    });

    const token = sign({ booking, amount: total, amountMinor, currency, reference, exp: Date.now() + 30 * 60_000 } satisfies BookingToken);
    return NextResponse.json({ paymentSession: session, token, amount: total, currency, config: ckoPublicConfig() });
  } catch (e) {
    return fail(e);
  }
}
