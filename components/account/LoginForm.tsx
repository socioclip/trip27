"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export default function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(expired ? "That sign-in link has expired. Enter your email to get a new one." : null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(api("/api/auth/request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      setEmail(j.email);
      setDevCode(j.devCode || null);
      setCode("");
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(api("/api/auth/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (j.expired) setStep("email");
        throw new Error(j.error || "Something went wrong.");
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  // Format as ABCD-EFGH while typing.
  function onCode(v: string) {
    const c = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    setCode(c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
  }

  return (
    <div className="card p-6 sm:p-8">
      <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center mb-4" aria-hidden>
        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {step === "email" ? (
            <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>
          ) : (
            <><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>
          )}
        </svg>
      </div>

      {step === "email" ? (
        <>
          <h1 className="text-2xl font-extrabold">Sign in to trip27</h1>
          <p className="text-sm text-muted mt-1">Use the email you book with. We&apos;ll send you a code, so there&apos;s no password to remember.</p>
          <form className="mt-6 space-y-3" onSubmit={requestCode}>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="field" type="email" autoComplete="email" inputMode="email" required placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <p className="text-sm text-accent-600" role="alert">{error}</p>}
            <button className="btn-primary w-full" type="submit" disabled={busy || !email.trim()}>{busy ? "Sending…" : "Email me a code"}</button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold">Check your email</h1>
          <p className="text-sm text-muted mt-1">
            We sent an 8-character code to <span className="font-semibold text-ink">{email}</span>. You can also tap the link in that email.
          </p>
          {devCode && (
            <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Demo mode, no email service connected. Your code is <span className="font-mono font-bold tracking-wider">{devCode}</span>
            </p>
          )}
          <form className="mt-6 space-y-3" onSubmit={verify}>
            <label className="label" htmlFor="code">Sign-in code</label>
            <input
              id="code"
              ref={codeRef}
              className="field font-mono text-center text-xl tracking-[0.25em] uppercase"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="ABCD-EFGH"
              value={code}
              onChange={(e) => onCode(e.target.value)}
            />
            {error && <p className="text-sm text-accent-600" role="alert">{error}</p>}
            <button className="btn-primary w-full" type="submit" disabled={busy || code.replace("-", "").length !== 8}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <div className="mt-4 flex items-center justify-between text-sm">
            <button type="button" className="text-brand-600 font-semibold hover:underline" onClick={() => { setStep("email"); setError(null); }}>Use a different email</button>
            <button type="button" className="text-brand-600 font-semibold hover:underline disabled:opacity-50" disabled={busy} onClick={() => requestCode()}>Resend code</button>
          </div>
        </>
      )}

      <p className="mt-6 pt-5 border-t border-line text-sm text-muted">
        Just need one booking? <Link href="/manage" className="text-brand-600 font-semibold hover:underline">Find it by order number</Link>
      </p>
    </div>
  );
}
