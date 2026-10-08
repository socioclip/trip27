import { NextResponse } from "next/server";
import { getProvider, liveBookingsAllowed } from "@/lib/providers";
import { fail } from "@/lib/http";
import { sendConfirmation } from "@/lib/email";
import { validateBooking } from "@/lib/booking";
import { ckoEnabled } from "@/lib/checkout-com";
import type { CreateOrderInput } from "@/lib/types";

export const maxDuration = 60;

// Books WITHOUT taking a payment. Used for demo fares, and for supplier test
// mode only while no payment gateway is configured.
export async function POST(req: Request) {
  let raw: CreateOrderInput;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const body = validateBooking(raw);
    const demo = body.offerId.startsWith("demo_");
    if (!demo && ckoEnabled()) return NextResponse.json({ error: "Payment is required to complete this booking." }, { status: 402 });
    if (!demo && !liveBookingsAllowed()) return NextResponse.json({ error: "Online booking is not enabled yet." }, { status: 503 });
    const order = await getProvider(body.offerId).createOrder(body);
    // The booking is made; an email failure must never turn it into an error.
    const base = new URL(req.url).origin + (process.env.NEXT_PUBLIC_BASE_PATH || "");
    order.emailSent = await sendConfirmation(order, body.contact.email, `${base}/booking/${encodeURIComponent(order.id)}`);
    return NextResponse.json({ order });
  } catch (e) {
    return fail(e);
  }
}
