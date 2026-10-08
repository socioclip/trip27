import { NextResponse } from "next/server";
import { getProvider, liveBookingsAllowed } from "@/lib/providers";
import { fail } from "@/lib/http";
import type { CreateOrderInput, PassengerInput } from "@/lib/types";

export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9]\d{6,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NAME = /^[A-Za-z][A-Za-z' -]{0,49}$/;

function check(p: PassengerInput): string | null {
  if (!p.id) return "Missing passenger.";
  if (!NAME.test(p.givenName?.trim() || "") || !NAME.test(p.familyName?.trim() || ""))
    return "Names must use English letters only, as shown in the passport.";
  if (!DATE.test(p.bornOn || "")) return "Please enter a valid date of birth.";
  if (!["mr", "ms", "mrs", "miss", "dr"].includes(p.title)) return "Please choose a title.";
  if (!["m", "f"].includes(p.gender)) return "Please choose a gender.";
  return null;
}

export async function POST(req: Request) {
  let body: CreateOrderInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body?.offerId || !Array.isArray(body.passengers) || !body.passengers.length)
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!EMAIL.test(body.contact?.email || "")) return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  if (!PHONE.test(body.contact?.phone || ""))
    return NextResponse.json({ error: "Please enter a valid mobile number with country code." }, { status: 400 });
  for (const p of body.passengers) {
    const err = check(p);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  if (!body.offerId.startsWith("demo_") && !liveBookingsAllowed())
    return NextResponse.json({ error: "Online booking is not enabled yet." }, { status: 503 });
  body.services = (body.services || []).filter((s) => s && s.id && s.quantity > 0);
  try {
    const order = await getProvider(body.offerId).createOrder(body);
    return NextResponse.json({ order });
  } catch (e) {
    return fail(e);
  }
}
