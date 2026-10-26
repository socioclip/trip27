"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Config = { provider: "razorpay"; keyId: string; mode: "test" | "live" } | null;

interface RzpSuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RzpInstance {
  open(): void;
  on(event: "payment.failed", cb: (r: { error: { code?: string; description?: string; reason?: string; metadata?: { payment_id?: string } } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RzpInstance;
  }
}

const SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

function loadScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const s = existing || document.createElement("script");
    s.addEventListener("load", () => resolve(true));
    s.addEventListener("error", () => resolve(false));
    if (!existing) {
      s.src = SCRIPT;
      s.async = true;
      document.body.appendChild(s);
    }
  });
}

type Log = { t: string; kind: "info" | "ok" | "err"; msg: string };

export default function RazorpayTest({ config }: { config: Config }) {
  const [amount, setAmount] = useState("499");
  const [currency, setCurrency] = useState("INR");
  const [name, setName] = useState("Test Traveller");
  const [email, setEmail] = useState("test@trip27.me");
  const [contact, setContact] = useState("9999999999");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [log, setLog] = useState<Log[]>([]);
  const [result, setResult] = useState<null | { ok: boolean; title: string; detail: string }>(null);

  const add = (kind: Log["kind"], msg: string) => setLog((l) => [...l, { t: new Date().toLocaleTimeString(), kind, msg }]);

  useEffect(() => {
    if (config) loadScript().then(setReady);
  }, [config]);

  if (!config)
    return (
      <div className="card p-5 text-sm">
        <p className="font-bold">Razorpay isn&apos;t configured on this deployment.</p>
        <p className="mt-2 text-muted">
          Add <code>RAZORPAY_KEY_ID</code> and <code>RAZORPAY_KEY_SECRET</code> (test keys from Razorpay Dashboard → Account &amp; Settings → API Keys) to the Vercel project, then redeploy.
        </p>
      </div>
    );

  if (config.mode !== "test")
    return (
      <div className="card p-5 text-sm">
        <p className="font-bold">Live Razorpay keys detected.</p>
        <p className="mt-2 text-muted">This page only runs with test keys (<code>rzp_test_…</code>) so it can never charge a real card.</p>
      </div>
    );

  async function pay() {
    setBusy(true);
    setResult(null);
    setLog([]);
    try {
      if (!window.Razorpay && !(await loadScript())) throw new Error("Couldn't load Razorpay Checkout (checkout.razorpay.com). Check ad-blockers or your connection.");

      add("info", `Creating order for ${currency} ${amount}…`);
      const r = await fetch(api("/api/razorpay/order"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), currency, name, email }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't create the order.");
      const order = j.order as { id: string; amount: number; currency: string; receipt: string };
      add("ok", `Order ${order.id} created (receipt ${order.receipt}).`);

      const rzp = new window.Razorpay!({
        key: config!.keyId,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        name: "trip27",
        description: "Test payment",
        prefill: { name, email, contact },
        notes: { source: "razorpay-test-page" },
        theme: { color: "#5a2fe0" },
        modal: {
          ondismiss: () => {
            add("err", "Checkout closed before payment finished.");
            setBusy(false);
          },
        },
        handler: async (resp: RzpSuccess) => {
          add("ok", `Razorpay returned payment ${resp.razorpay_payment_id}.`);
          add("info", "Verifying signature and capturing on the server…");
          try {
            const v = await fetch(api("/api/razorpay/verify"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(resp),
            });
            const vj = await v.json();
            if (!v.ok || !vj.ok) {
              add("err", vj.error || `Payment status: ${vj.payment?.status || "unknown"}`);
              setResult({ ok: false, title: "Payment not confirmed", detail: vj.error || `Status: ${vj.payment?.status}` });
            } else {
              add("ok", `Signature valid. Payment ${vj.payment.status} (${vj.payment.method}).`);
              setResult({
                ok: true,
                title: "Payment captured",
                detail: `${vj.payment.currency} ${vj.payment.amount} · ${vj.payment.method} · ${vj.payment.id}`,
              });
            }
          } catch {
            add("err", "Verification request failed.");
            setResult({ ok: false, title: "Verification failed", detail: "Check the payment in the Razorpay Dashboard." });
          } finally {
            setBusy(false);
          }
        },
      });
      rzp.on("payment.failed", (f) => {
        add("err", `Payment failed: ${f.error.description || f.error.reason || f.error.code}`);
        setResult({ ok: false, title: "Payment failed", detail: f.error.description || "Declined" });
      });
      add("info", "Opening Razorpay Checkout…");
      rzp.open();
    } catch (e) {
      add("err", e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Test mode — no real money moves. Easiest options in the checkout: <b>UPI</b> with ID <b>success@razorpay</b> (or <b>failure@razorpay</b> to test a decline), or <b>Netbanking</b> → pick any bank → <b>Success</b>. For cards, use one from{" "}
          <a className="underline" href="https://razorpay.com/docs/payments/payments/test-card-details/" target="_blank" rel="noreferrer">Razorpay&apos;s test card list</a>.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Amount</span>
            <input className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="block">
            <span className="label">Currency</span>
            <select className="field" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="INR">INR</option>
              <option value="AED">AED (needs international payments on)</option>
              <option value="USD">USD (needs international payments on)</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Name</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Phone</span>
            <input className="field" inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value.replace(/[^\d+]/g, ""))} />
          </label>
        </div>
        <button type="button" className="btn-primary mt-5 w-full" onClick={pay} disabled={busy || !ready || !Number(amount)}>
          {busy ? "Processing…" : !ready ? "Loading Razorpay…" : `Pay ${currency} ${amount || 0}`}
        </button>
        <p className="mt-2 text-center text-xs text-muted">Key: {config.keyId.slice(0, 13)}…</p>
      </div>

      {result && (
        <div className={`card p-5 border-2 ${result.ok ? "border-mint-500" : "border-accent-500"}`}>
          <p className={`font-extrabold ${result.ok ? "text-mint-500" : "text-accent-600"}`}>{result.title}</p>
          <p className="mt-1 text-sm break-all">{result.detail}</p>
        </div>
      )}

      {log.length > 0 && (
        <div className="card p-5">
          <p className="label">Steps</p>
          <ol className="mt-2 space-y-1 font-mono text-xs">
            {log.map((l, i) => (
              <li key={i} className={l.kind === "err" ? "text-accent-600" : l.kind === "ok" ? "text-mint-500" : "text-muted"}>
                <span className="text-muted">{l.t}</span> {l.msg}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
