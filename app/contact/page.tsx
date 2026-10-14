import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get in touch with the trip27 team — email, WhatsApp or phone. We're based in Dubai, UAE.",
};

const EMAIL = "sarfarazfresh@gmail.com";
const PHONE_DISPLAY = "+971 58 561 5781";
const PHONE_INTL = "971585615781";

function Mail() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function Chat() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 20l1.4-4.2A8.5 8.5 0 1 1 21 11.5Z" />
    </svg>
  );
}
function Pin() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export default function ContactPage() {
  const cards = [
    { icon: <Mail />, title: "Email", value: EMAIL, href: `mailto:${EMAIL}`, note: "Best for booking questions and anything with details to share." },
    { icon: <Chat />, title: "WhatsApp", value: PHONE_DISPLAY, href: `https://wa.me/${PHONE_INTL}`, note: "Quick questions and fare help — fastest way to reach us." },
    { icon: <Pin />, title: "Based in", value: "Dubai, United Arab Emirates", note: "Support in your time zone across the GCC and India." },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-extrabold">Contact us</h1>
      <p className="text-muted mt-2 max-w-xl">
        Questions about a fare, a booking or a payment? The trip27 team is happy to help. We usually reply within a few hours.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.title} className="card p-5">
            <div className="flex items-center gap-2.5 text-brand-700">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50">{c.icon}</span>
              <span className="label !mb-0">{c.title}</span>
            </div>
            {c.href ? (
              <a href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="mt-3 block text-lg font-bold text-ink hover:text-brand-700 break-words">
                {c.value}
              </a>
            ) : (
              <p className="mt-3 text-lg font-bold text-ink">{c.value}</p>
            )}
            <p className="text-sm text-muted mt-1">{c.note}</p>
          </div>
        ))}
        <div className="card p-5 flex flex-col justify-center gap-3 bg-brand-50/50">
          <p className="font-bold">Already booked?</p>
          <p className="text-sm text-muted">Pull up your trip with your order number before you get in touch — it helps us help you faster.</p>
          <Link href="/manage" className="btn-brand w-fit">Manage your booking</Link>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <a href={`mailto:${EMAIL}`} className="btn-primary">Email us</a>
        <a href={`https://wa.me/${PHONE_INTL}`} target="_blank" rel="noreferrer" className="btn-ghost">Message on WhatsApp</a>
        <Link href="/help" className="btn-ghost">Browse the Help centre</Link>
      </div>
    </div>
  );
}
