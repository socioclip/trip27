import { NextResponse } from "next/server";
import { fail } from "@/lib/http";
import { capturePayment, getOrder, getPayment, razorpayEnabled, verifyCheckoutSignature } from "@/lib/razorpay";

// Step 2: checkout.js hands back (order_id, payment_id, signature).
// We check the signature, confirm the payment belongs to that order and
// matches its amount, and capture it if it is only authorised.
export async function POST(req: Request) {
  if (!razorpayEnabled()) return NextResponse.json({ error: "Razorpay is not configured." }, { status: 503 });
  let body: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const orderId = String(body.razorpay_order_id || "");
  const paymentId = String(body.razorpay_payment_id || "");
  const signature = String(body.razorpay_signature || "");
  if (!orderId || !paymentId || !signature) return NextResponse.json({ error: "Missing payment details." }, { status: 400 });

  if (!verifyCheckoutSignature(orderId, paymentId, signature))
    return NextResponse.json({ ok: false, signatureValid: false, error: "Signature check failed — this payment response was not from Razorpay." }, { status: 400 });

  try {
    const [order, payment0] = await Promise.all([getOrder(orderId), getPayment(paymentId)]);
    if (payment0.order_id !== order.id || payment0.amount !== order.amount || payment0.currency !== order.currency)
      return NextResponse.json({ ok: false, signatureValid: true, error: "Payment does not match the order." }, { status: 400 });

    let payment = payment0;
    if (payment.status === "authorized") payment = await capturePayment(payment.id, order.amount, order.currency);

    return NextResponse.json({
      ok: payment.status === "captured",
      signatureValid: true,
      payment: { id: payment.id, status: payment.status, method: payment.method, amount: payment.amount / 100, currency: payment.currency },
      order: { id: order.id, receipt: order.receipt },
    });
  } catch (e) {
    return fail(e);
  }
}
