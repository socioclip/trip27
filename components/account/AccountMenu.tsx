"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useOutside } from "../useOutside";

// Header account control. Loads the session in the browser so pages stay static.
export default function AccountMenu() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, close, open);

  useEffect(() => {
    let live = true;
    fetch(api("/api/auth/me"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => live && setEmail(j.email ?? null))
      .catch(() => live && setEmail(null));
    return () => {
      live = false;
    };
  }, [pathname]);

  async function signOut() {
    await fetch(api("/api/auth/logout"), { method: "POST" }).catch(() => {});
    setEmail(null);
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  if (email === undefined) return <span className="inline-block w-28 h-10 rounded-xl skeleton" aria-hidden />;

  if (!email)
    return (
      <div className="flex items-center gap-2">
        <Link href="/manage" className="hidden sm:inline-flex btn-ghost !py-2 text-sm">Find a booking</Link>
        <Link href={`/login?next=${encodeURIComponent("/account/bookings")}`} className="btn-brand !py-2 !px-4 text-sm">Sign in</Link>
      </div>
    );

  return (
    <div className="flex items-center gap-2">
      <Link href="/account/bookings" className="btn-ghost !py-2 text-sm">My bookings</Link>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-10 h-10 rounded-full bg-brand-600 text-white font-bold grid place-items-center hover:bg-brand-700"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account"
        >
          {email[0]?.toUpperCase()}
        </button>
        {open && (
          <div role="menu" className="absolute right-0 mt-2 w-64 card p-2 shadow-lg z-50">
            <p className="px-3 py-2 text-xs text-muted">Signed in as</p>
            <p className="px-3 pb-2 text-sm font-semibold truncate border-b border-line">{email}</p>
            <Link role="menuitem" href="/account/bookings" onClick={close} className="block px-3 py-2 mt-1 rounded-lg text-sm hover:bg-brand-50">My bookings</Link>
            <Link role="menuitem" href="/manage" onClick={close} className="block px-3 py-2 rounded-lg text-sm hover:bg-brand-50">Find a booking by number</Link>
            <button role="menuitem" type="button" onClick={signOut} className="w-full text-left px-3 py-2 rounded-lg text-sm text-accent-600 hover:bg-brand-50">Sign out</button>
          </div>
        )}
      </div>
    </div>
  );
}
