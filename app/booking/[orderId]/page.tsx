import Confirmation from "@/components/Confirmation";

export const metadata = { title: "Booking confirmed" };

export default async function BookingPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <Confirmation orderId={decodeURIComponent(orderId)} />;
}
