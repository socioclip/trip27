import Link from "next/link";
import Logo from "./Logo";
import AccountMenu from "./account/AccountMenu";

export default function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-line">
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-6">
        <Link href="/" className="shrink-0"><Logo /></Link>
        <nav className="hidden md:flex items-center gap-1 text-sm font-semibold">
          <Link href="/" className="px-3 py-2 rounded-lg text-brand-700 bg-brand-50 inline-flex items-center gap-2">
            <PlaneIcon /> Flights
          </Link>
          <span className="px-3 py-2 rounded-lg text-muted/70 cursor-not-allowed" title="Coming soon">Hotels</span>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="hidden sm:inline-flex chip">AED</span>
          <span className="hidden sm:inline-flex chip">English</span>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

export function PlaneIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z" />
    </svg>
  );
}
