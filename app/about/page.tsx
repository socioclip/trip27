import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About trip27",
  description: "trip27 compares fares from hundreds of airlines and lets you book in minutes, with prices shown in UAE Dirham.",
};

export default function AboutPage() {
  const points = [
    { h: "One search, many airlines", p: "We pull live fares from multiple flight suppliers at once and show them side by side, so you see a real spread of options instead of one airline's prices." },
    { h: "Prices in AED, no surprises", p: "Fares are shown in UAE Dirham with taxes included, and the price you see is the price you pay. Any service fee is always shown before you book." },
    { h: "Book in minutes", p: "Pick a fare, add passenger details, pay securely and get your confirmation by email. No account needed to book." },
    { h: "Your booking, in your pocket", p: "Look up any trip anytime with your order number to view details and manage it." },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-extrabold">About trip27</h1>
      <p className="text-muted mt-3 text-lg leading-relaxed">
        trip27 is a flight search and booking service built for travellers in the UAE and the wider region. We compare fares
        from hundreds of airlines so you can find a good deal quickly, book it in a few taps, and get on with your trip.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {points.map((x) => (
          <div key={x.h} className="card p-5">
            <h2 className="font-bold">{x.h}</h2>
            <p className="text-sm text-muted mt-1.5 leading-relaxed">{x.p}</p>
          </div>
        ))}
      </div>

      <div className="card p-6 mt-8">
        <h2 className="text-lg font-extrabold">Who we are</h2>
        <p className="text-sm text-muted mt-2 leading-relaxed">
          trip27 is an independent travel-tech project based in Dubai, United Arab Emirates, built by a team that has spent
          years in online travel distribution. We&apos;re focused on making flight booking simpler, clearer and faster for the
          way people in this region actually travel.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/contact" className="btn-brand">Get in touch</Link>
          <Link href="/help" className="btn-ghost">Help centre</Link>
        </div>
      </div>
    </div>
  );
}
