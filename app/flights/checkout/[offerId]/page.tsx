import { Suspense } from "react";
import Checkout from "@/components/checkout/Checkout";

export const metadata = { title: "Complete your booking" };

export default async function CheckoutPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  return (
    <Suspense fallback={null}>
      <Checkout offerId={decodeURIComponent(offerId)} />
    </Suspense>
  );
}
