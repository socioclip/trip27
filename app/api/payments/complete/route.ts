import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { getProvider } from "@/lib/providers";
import { sendConfirmation } from "@/lib/email";
import { capturePayment, ckoEnabled, getPayment, verify, voidPayment, type BookingToken } from "@/lib/checkout-com";
import { ProviderError } from "@/lib/types";

export const maxDuration = 60;

// Step 2 of a paid booking: confirm the card was authorised for the signed
// amount, book with the airline, then capture. If booking fails, void.
export async function POST(req: Request) {
  if (!ckoEnabled()) return NextResponse.json({ error: "Payments are not configured." }, { status: 503 });
  let paymentId = "";
  let reference = "";
  try {
    const body = (await req.json()) as { paymentId?: string; token?: string };
    paymentId = String(body.paymentId || "");
    const t = verify<BookingToken>(body.token || "");
    reference = t.reference;

    const p = await getPayment(paymentId);
    if (p.reference !== t.reference || p.amount !== t.amountMinor || p.currency !== t.currency)
      throw new ProviderError("Payment details don't match this booking.", 400);
    if (p.status === "Captured") throw new ProviderError("This payment has already been used for a booking.", 409);
    if (p.status !== "Authorized") throw new ProviderError(p.status === "Declined" ? "Your card was declined. Please try another card." : `Payment not completed (${p.status}).`, 402);
    if (Date.now() > t.exp) {
      await voidPayment(paymentId, t.reference).catch(() => {});
      throw new ProviderError("This booking session expired. You have not been charged. Please search again.", 410);
    }

    let order;
    try {
      order = await getProvider(t.booking.offerId).createOrder(t.booking);
    } catch (e) {
      // Release the hold on the customer's card.
      await voidPayment(paymentId, t.reference).catch((err) => console.error("[payments] void failed", paymentId, err));
      const msg = e instanceof ProviderError ? e.message : "The airline couldn't confirm this booking.";
      throw new ProviderError(`${msg} Your card has not been charged.`, 409);
    }

    try {
      await capturePayment(paymentId, t.reference);
    } catch (e) {
      // The ticket exists: never fail the customer here. Flag for manual capture.
      console.error("[payments] CAPTURE FAILED – capture manually in Checkout.com", paymentId, order.id, e);
    }

    // Show the customer the amount actually charged.
    order.total = { amount: t.amount, currency: t.currency };
    const base = new URL(req.url).origin + (process.env.NEXT_PUBLIC_BASE_PATH || "");
    order.emailSent = await sendConfirmation(order, t.booking.contact.email, `${base}/booking/${encodeURIComponent(order.id)}`);
    return NextResponse.json({ order, paymentId, reference });
  } catch (e) {
    if (!(e instanceof ProviderError)) console.error("[payments] complete error", paymentId, reference, e);
    return fail(e);
  }
}
