import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms that govern your use of trip27 and bookings made through the site.",
};

const UPDATED = "15 October 2026";

const sections: { h: string; body: string[] }[] = [
  {
    h: "1. About these terms",
    body: [
      "These Terms of Use govern your access to and use of the trip27 website and the booking services offered through it (\"trip27\", \"we\", \"us\"). By searching for or booking a flight on trip27, you agree to these terms. If you do not agree, please do not use the site.",
    ],
  },
  {
    h: "2. What trip27 does",
    body: [
      "trip27 is an online travel service that lets you compare and book flights operated by third-party airlines. We act as an intermediary that facilitates your booking. The transport itself is provided by the airline, and your flight is also subject to that airline's own conditions of carriage and fare rules.",
    ],
  },
  {
    h: "3. Prices and currency",
    body: [
      "Fares are shown in UAE Dirham (AED) and include taxes and applicable fees. Where a fare is sourced in another currency, it is converted for display and the exact amount charged is shown before you pay.",
      "Fares and availability are provided by airlines in real time and can change or sell out at any moment until a booking is confirmed. If the price changes before you complete payment, we will show you the new price and you can choose whether to continue.",
    ],
  },
  {
    h: "4. Bookings and payment",
    body: [
      "You are responsible for making sure all passenger details — names, dates of birth and travel documents — exactly match the travellers' passports or IDs. Airlines may refuse boarding or charge correction fees for incorrect details.",
      "Payment is processed through our third-party payment provider over a secure, encrypted connection. A booking is only confirmed once the airline issues it and we send you a confirmation. If a booking cannot be confirmed, any amount held is released.",
    ],
  },
  {
    h: "5. Changes, cancellations and refunds",
    body: [
      "Changes, cancellations and refunds are governed by the fare rules of the airline you booked. Some fares are non-refundable or non-changeable. Where a change or refund is permitted, airline and service fees may apply. Contact us with your order number and we will help you with the options available for your fare.",
    ],
  },
  {
    h: "6. Your responsibilities",
    body: [
      "You are responsible for holding valid travel documents, visas and any health requirements for your journey, and for arriving at the airport in time for check-in. trip27 is not responsible for denied boarding or entry resulting from missing or invalid documents.",
    ],
  },
  {
    h: "7. Liability",
    body: [
      "trip27 provides the booking service with reasonable care but does not operate flights and is not liable for the acts or omissions of airlines, including delays, cancellations, schedule changes or denied boarding. To the fullest extent permitted by law, our liability in connection with a booking is limited to the service fee charged by trip27 for that booking.",
    ],
  },
  {
    h: "8. Intellectual property",
    body: [
      "The trip27 name, site design and content are owned by trip27 and may not be copied or reused without permission. Airline names and logos remain the property of their respective owners and are used only to identify services.",
    ],
  },
  {
    h: "9. Governing law",
    body: [
      "These terms are governed by the laws of the United Arab Emirates, and any dispute is subject to the jurisdiction of the courts of Dubai.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-extrabold">Terms of use</h1>
      <p className="text-sm text-muted mt-2">Last updated {UPDATED}</p>

      <div className="mt-8 space-y-7">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-bold">{s.h}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-sm text-muted mt-2 leading-relaxed">{p}</p>
            ))}
          </section>
        ))}
        <p className="text-sm text-muted leading-relaxed">
          Questions about these terms? <Link href="/contact" className="text-brand-700 font-semibold hover:underline">Contact us</Link>.
        </p>
      </div>
    </div>
  );
}
