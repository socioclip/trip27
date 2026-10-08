import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="mt-16 bg-brand-900 text-white/80">
      <div className="mx-auto max-w-7xl px-4 py-12 grid gap-8 md:grid-cols-4 text-sm">
        <div className="md:col-span-2 space-y-3">
          <Logo light />
          <p className="max-w-sm text-white/60">Compare fares from hundreds of airlines and book in minutes. Prices shown in UAE Dirham (AED).</p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-white">Support</p>
          <p>Help centre</p>
          <p>Manage booking</p>
          <p>Contact us</p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold text-white">Company</p>
          <p>About trip27</p>
          <p>Terms of use</p>
          <p>Privacy policy</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">© {new Date().getFullYear()} trip27. All rights reserved.</div>
    </footer>
  );
}
