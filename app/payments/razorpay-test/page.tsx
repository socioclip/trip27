import type { Metadata } from "next";
import RazorpayTest from "@/components/payments/RazorpayTest";
import { razorpayPublicConfig } from "@/lib/razorpay";

export const metadata: Metadata = {
  title: "Razorpay test payment",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function Page() {
  const config = razorpayPublicConfig();
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Internal · payments</p>
      <h1 className="mt-1 text-2xl font-extrabold">Razorpay test payment</h1>
      <p className="mt-2 text-sm text-muted">
        Opens Razorpay Checkout for a test order, then verifies the signature and captures the payment on the server — the same steps a real booking will use.
      </p>
      <div className="mt-6">
        <RazorpayTest config={config} />
      </div>
    </main>
  );
}
