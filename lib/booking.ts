import "server-only";
import { getProvider } from "./providers";
import { round2 } from "./money";
import { ProviderError, type CreateOrderInput, type PassengerInput } from "./types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9]\d{6,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NAME = /^[A-Za-z][A-Za-z' -]{0,49}$/;

function checkPassenger(p: PassengerInput): string | null {
  if (!p.id) return "Missing passenger.";
  if (!NAME.test(p.givenName?.trim() || "") || !NAME.test(p.familyName?.trim() || ""))
    return "Names must use English letters only, as shown in the passport.";
  if (!DATE.test(p.bornOn || "")) return "Please enter a valid date of birth.";
  if (!["mr", "ms", "mrs", "miss", "dr"].includes(p.title)) return "Please choose a title.";
  if (!["m", "f"].includes(p.gender)) return "Please choose a gender.";
  return null;
}

/** Validates and normalises a booking request. Throws ProviderError(400). */
export function validateBooking(body: CreateOrderInput): CreateOrderInput {
  if (!body?.offerId || !Array.isArray(body.passengers) || !body.passengers.length) throw new ProviderError("Invalid request.");
  if (!EMAIL.test(body.contact?.email || "")) throw new ProviderError("Please enter a valid email.");
  if (!PHONE.test(body.contact?.phone || "")) throw new ProviderError("Please enter a valid mobile number with country code.");
  for (const p of body.passengers) {
    const err = checkPassenger(p);
    if (err) throw new ProviderError(err);
  }
  return {
    offerId: body.offerId,
    passengers: body.passengers,
    contact: { email: body.contact.email.trim(), phone: body.contact.phone },
    services: (body.services || [])
      .filter((s) => s && s.id && s.quantity > 0)
      .map((s) => ({ id: s.id, quantity: Math.floor(s.quantity), supplierAmount: "", displayAmount: 0, label: s.label || "" })),
  };
}

/**
 * Prices a booking from the supplier's current data (never from the browser).
 * Returns the total the customer pays, in the display currency.
 */
export async function quoteBooking(input: CreateOrderInput) {
  const provider = getProvider(input.offerId);
  const { offer, baggage } = await provider.getOffer(input.offerId);
  if (input.passengers.length !== offer.passengers.length) throw new ProviderError("Passenger details are incomplete.");
  const prices = new Map<string, number>();
  for (const b of baggage) prices.set(b.id, b.price.amount);
  const needSeats = input.services.some((s) => !prices.has(s.id));
  if (needSeats) {
    const maps = await provider.getSeatMaps(input.offerId);
    for (const m of maps)
      for (const c of m.cabins)
        for (const r of c.rows) for (const sec of r.sections) for (const e of sec.elements) for (const sv of e.services) prices.set(sv.id, sv.price.amount);
  }
  let extras = 0;
  for (const s of input.services) {
    const unit = prices.get(s.id);
    if (unit == null) throw new ProviderError("One of the selected extras is no longer available. Please go back and reselect.");
    extras += unit * s.quantity;
  }
  return { offer, total: round2(offer.total.amount + extras), currency: offer.total.currency };
}
