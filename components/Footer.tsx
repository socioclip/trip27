import Link from "next/link";
import Logo from "./Logo";

const support = [
  { label: "Help centre", href: "/help" },
  { label: "Manage booking", href: "/manage" },
  { label: "Contact us", href: "/contact" },
];
const company = [
  { label: "About trip27", href: "/about" },
  { label: "Terms of use", href: "/terms" },
  { label: "Privacy policy", href: "/privacy" },
];

function Col({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold text-white">{title}</p>
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="block text-white/70 hover:text-white transition">
          {l.label}
        </Link>
      ))}
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="mt-16 bg-brand-900 text-white/80">
      <div className="mx-auto max-w-7xl px-4 py-12 grid gap-8 md:grid-cols-4 text-sm">
        <div className="md:col-span-2 space-y-3">
          <Logo light />
          <p className="max-w-sm text-white/60">Compare fares from hundreds of airlines and book in minutes. Prices shown in UAE Dirham (AED).</p>
        </div>
        <Col title="Support" links={support} />
        <Col title="Company" links={company} />
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">© {new Date().getFullYear()} trip27. All rights reserved.</div>
    </footer>
  );
}
