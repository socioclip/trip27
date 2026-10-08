import { Suspense } from "react";
import PaymentReturn from "@/components/checkout/PaymentReturn";

export const metadata = { title: "Completing your booking" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PaymentReturn />
    </Suspense>
  );
}
