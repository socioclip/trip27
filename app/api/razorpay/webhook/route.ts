import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/razorpay";

// Razorpay webhooks (Dashboard → Webhooks → URL https://trip27.me/api/razorpay/webhook).
// Backup confirmation for payments whose browser tab closed before /verify ran.
// Set RAZORPAY_WEBHOOK_SECRET to the secret you enter in the dashboard.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") || ""))
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  let evt: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string; amount?: number; currency?: string } } } };
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const p = evt.payload?.payment?.entity;
  console.log("[razorpay webhook]", evt.event, p?.id, p?.order_id, p?.status, p?.amount, p?.currency);
  return NextResponse.json({ received: true });
}
