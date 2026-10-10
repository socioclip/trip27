import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { allow } from "@/lib/auth";
import { validateBooking } from "@/lib/booking";
import { isJinkoId, jinkoBookingsAllowed, jinkoEnabled, startJinkoCheckout } from "@/lib/providers/jinko";
import type { CreateOrderInput } from "@/lib/types";

export const maxDuration = 60;

// Jinko fares: create the Jinko trip (fare + travellers), price it, and return
// Jinko's hosted payment page. The traveller pays Jinko directly; nothing is
// charged by trip27. The returned orderId opens the booking page, which polls
// Jinko until the ticket is issued.
export async function POST(req: Request) {
  if (!jinkoEnabled()) return NextResponse.json({ error: "This supplier is not configured." }, { status: 503 });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!allow(`jinko-checkout:${ip}`, 10, 10 * 60_000))
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });

  let raw: CreateOrderInput;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    const booking = validateBooking(raw);
    if (!isJinkoId(booking.offerId)) return NextResponse.json({ error: "Invalid fare." }, { status: 400 });
    if (!jinkoBookingsAllowed()) return NextResponse.json({ error: "Online booking is not enabled yet." }, { status: 503 });
    const result = await startJinkoCheckout(booking);
    return NextResponse.json(result);
  } catch (e) {
    return fail(e);
  }
}
