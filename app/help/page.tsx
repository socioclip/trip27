import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Answers to common questions about searching, booking, payment, changes and baggage on trip27.",
};

const groups: { title: string; faqs: { q: string; a: string }[] }[] = [
  {
    title: "Searching & fares",
    faqs: [
      { q: "How are prices shown?", a: "All fares are shown in UAE Dirham (AED) with taxes and fees included. If a service fee applies, it is shown clearly before you pay — the total you see is the total you pay." },
      { q: "Why did a fare change between search and checkout?", a: "Airlines update fares and seat availability in real time. If a price changes while you are booking, we show you the new price before any payment is taken, so you are never charged more than you agreed to." },
      { q: "Are these the cheapest fares available?", a: "We compare fares from multiple suppliers at once to give you a strong spread of options, but no site can guarantee the lowest price on every route. It's always worth checking a couple of dates and nearby airports." },
    ],
  },
  {
    title: "Booking & payment",
    faqs: [
      { q: "Do I need an account to book?", a: "No. You can search and book as a guest. You'll just need a valid email address and the travellers' details to complete the booking." },
      { q: "Which payment methods are accepted?", a: "We accept major debit and credit cards through our secure payment provider. Your card details are entered on a secure, encrypted page and are never stored by trip27." },
      { q: "When will I get my confirmation?", a: "Your confirmation and e-ticket details are emailed to you once the airline confirms the booking — usually within a few minutes. If you don't see it, check your spam folder before contacting us." },
    ],
  },
  {
    title: "Changes, cancellations & baggage",
    faqs: [
      { q: "Can I change or cancel my flight?", a: "Changes and cancellations follow the fare rules of the airline you booked. Some fares allow changes for a fee, others are non-refundable. Have your order number ready and contact us and we'll walk you through the options for your specific fare." },
      { q: "How much baggage is included?", a: "Baggage allowance is set by the airline and depends on the fare you choose. Each fare shows whether checked baggage is included or cabin-bag only before you book." },
      { q: "What if my flight is changed or cancelled by the airline?", a: "If the airline changes or cancels your flight, they'll contact you with the options available (rebooking or a refund per their policy). Reach out to us and we'll help you sort it out." },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-extrabold">Help centre</h1>
      <p className="text-muted mt-2 max-w-xl">
        Quick answers to the questions we hear most. Can&apos;t find what you need?{" "}
        <Link href="/contact" className="text-brand-700 font-semibold hover:underline">Contact us</Link> and we&apos;ll help.
      </p>

      <div className="mt-8 space-y-8">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted mb-3">{g.title}</h2>
            <div className="card divide-y divide-line">
              {g.faqs.map((f) => (
                <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                    {f.q}
                    <span className="text-muted transition group-open:rotate-45 text-xl leading-none">+</span>
                  </summary>
                  <p className="text-sm text-muted mt-3 leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="card p-6 mt-8 bg-brand-50/50 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-bold">Still need a hand?</p>
          <p className="text-sm text-muted">Reach the team by email or WhatsApp — we usually reply within a few hours.</p>
        </div>
        <Link href="/contact" className="btn-brand shrink-0">Contact us</Link>
      </div>
    </div>
  );
}
