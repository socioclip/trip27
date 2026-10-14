import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How trip27 collects, uses and protects your personal information.",
};

const UPDATED = "15 October 2026";
const EMAIL = "sarfarazfresh@gmail.com";

const sections: { h: string; body: string[]; list?: string[] }[] = [
  {
    h: "1. Introduction",
    body: [
      "This policy explains what personal information trip27 (\"we\", \"us\") collects when you use our site, how we use it, and the choices you have. We only collect what we need to search for flights and complete your bookings.",
    ],
  },
  {
    h: "2. Information we collect",
    body: ["Depending on how you use trip27, we may collect:"],
    list: [
      "Search details — the routes, dates and traveller counts you search for.",
      "Booking details — passenger names, dates of birth and, where a trip requires it, travel-document information.",
      "Contact details — the email address and phone number you provide for your booking.",
      "Payment information — handled directly by our payment provider on a secure page. We do not store your full card number.",
      "Usage data — basic, mostly anonymous information about how the site is used, to keep it working and improve it.",
    ],
  },
  {
    h: "3. How we use your information",
    body: ["We use your information to:"],
    list: [
      "Search for fares and complete the bookings you ask us to make.",
      "Send you booking confirmations and important updates about your trip.",
      "Provide customer support when you contact us.",
      "Keep the service secure and prevent fraud and abuse.",
    ],
  },
  {
    h: "4. Who we share it with",
    body: [
      "To complete a booking we share the necessary details with the airline and the flight supplier fulfilling your trip, and with our payment provider to take payment and our email provider to send your confirmation. We share your information only as needed to provide the service, and we do not sell your personal data.",
    ],
  },
  {
    h: "5. Payment security",
    body: [
      "Card payments are processed by a third-party payment provider over an encrypted connection. Your card details are entered on their secure page; trip27 does not see or store your full card details.",
    ],
  },
  {
    h: "6. Data retention",
    body: [
      "We keep booking information for as long as needed to provide the service, support your trip and meet legal and accounting requirements, and then delete or anonymise it.",
    ],
  },
  {
    h: "7. Your rights",
    body: [
      "You can ask us what personal information we hold about you, ask us to correct it, or ask us to delete it where we are not required to keep it. To make a request, contact us using the details below.",
    ],
  },
  {
    h: "8. Cookies",
    body: [
      "We use a small number of cookies and similar technologies to keep the site working (for example, to remember your session) and to understand usage in aggregate. You can control cookies through your browser settings.",
    ],
  },
  {
    h: "9. Contact & governing law",
    body: [
      `For any privacy question or request, email us at ${EMAIL}. This policy is governed by the laws of the United Arab Emirates.`,
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-extrabold">Privacy policy</h1>
      <p className="text-sm text-muted mt-2">Last updated {UPDATED}</p>

      <div className="mt-8 space-y-7">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-bold">{s.h}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-sm text-muted mt-2 leading-relaxed">{p}</p>
            ))}
            {s.list && (
              <ul className="mt-3 space-y-1.5">
                {s.list.map((li) => (
                  <li key={li} className="text-sm text-muted leading-relaxed flex gap-2.5">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                    <span>{li}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <p className="text-sm text-muted leading-relaxed">
          Questions? <Link href="/contact" className="text-brand-700 font-semibold hover:underline">Contact us</Link>.
        </p>
      </div>
    </div>
  );
}
