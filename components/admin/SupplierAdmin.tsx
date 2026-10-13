"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { AdminState, JinkoChoice } from "@/lib/suppliers";

type Row = {
  id: "duffel" | "sandbox" | "prod" | "apeiro";
  name: string;
  env: "Test" | "Live" | "—";
  envVar: string;
  hasKey: boolean;
  on: boolean;
  note: string;
};

function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${on ? "bg-brand-600" : "bg-line"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function when(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-AE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function SupplierAdmin({ initial, email }: { initial: AdminState; email: string }) {
  const [state, setState] = useState(initial);
  const [duffel, setDuffel] = useState(initial.flags.duffel);
  const [jinko, setJinko] = useState<JinkoChoice>(initial.flags.jinko);
  const [apeiro, setApeiro] = useState(initial.flags.apeiro !== false);
  const [chat, setChat] = useState(initial.flags.chat !== false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const c = state.credentials;
  const writable = state.edgeConfig.writable;
  const dirty = duffel !== state.flags.duffel || jinko !== state.flags.jinko || apeiro !== (state.flags.apeiro !== false) || chat !== (state.flags.chat !== false);

  const rows: Row[] = useMemo(
    () => [
      {
        id: "duffel",
        name: "Duffel",
        env: c.duffelMode === "live" ? "Live" : c.duffelMode === "test" ? "Test" : "—",
        envVar: "DUFFEL_ACCESS_TOKEN",
        hasKey: c.duffel,
        on: duffel,
        note: "Full checkout on trip27: seats, bags and card payment through Checkout.com.",
      },
      {
        id: "sandbox",
        name: "Jinko Sandbox",
        env: "Test",
        envVar: "JINKO_API_KEY_SANDBOX",
        hasKey: c.jinkoSandbox,
        on: jinko === "sandbox",
        note: "Test fares paid on Jinko's sandbox page. No real tickets or charges.",
      },
      {
        id: "prod",
        name: "Jinko Production",
        env: "Live",
        envVar: "JINKO_API_KEY_PROD",
        hasKey: c.jinkoProd,
        on: jinko === "prod",
        note: "Real fares. Customers pay Jinko and receive real tickets.",
      },
      {
        id: "apeiro",
        name: "Apeirotrip",
        env: "Live",
        envVar: "APEIRO_TOKEN",
        hasKey: c.apeiro,
        on: apeiro,
        note: "Live fares from apeirotrip.com (Amadeus Online Suite), shown for price comparison only. Not bookable on trip27.",
      },
    ],
    [c, duffel, jinko, apeiro]
  );

  const toggle = (r: Row, v: boolean) => {
    setSaved(false);
    setError(null);
    if (r.id === "duffel") return setDuffel(v);
    if (r.id === "apeiro") return setApeiro(v);
    // Only one Jinko environment at a time.
    setJinko(v ? r.id : "off");
  };

  const save = async (confirmLive = false) => {
    if (jinko === "prod" && state.flags.jinko !== "prod" && !confirmLive) return setConfirming(true);
    setConfirming(false);
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(api("/api/admin/suppliers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duffel, jinko, apeiro, chat, confirmLive }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't save.");
      setState(j);
      setDuffel(j.flags.duffel);
      setJinko(j.flags.jinko);
      setApeiro(j.flags.apeiro !== false);
      setChat(j.flags.chat !== false);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const running = state.running;
  const liveNow = [running.duffel && `Duffel (${c.duffelMode === "live" ? "live" : "test"})`, running.jinko === "sandbox" && "Jinko Sandbox", running.jinko === "prod" && "Jinko Production", running.apeiro && "Apeirotrip (compare only)"].filter(Boolean);
  const chatRunning = running.chat === true;
  const anyLiveSelected = jinko === "prod" || (duffel && c.duffelMode === "live");

  return (
    <div className="mt-6 space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>
          <span className="label inline mr-2">Running now</span>
          <b>{liveNow.length ? liveNow.join(" + ") : "No suppliers — searches return no flights"}</b>
          <span className="text-muted"> · chat {chatRunning ? "on" : "off"}</span>
        </span>
        {state.stored && state.flags.updatedAt && (
          <span className="text-muted">
            Last changed {when(state.flags.updatedAt)}
            {state.flags.updatedBy ? ` by ${state.flags.updatedBy}` : ""}
          </span>
        )}
        {!state.stored && <span className="text-muted">Using defaults from the keys set in Vercel (nothing saved yet).</span>}
      </div>

      {!writable && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Read-only: switches can&apos;t be saved yet</p>
          <p className="mt-1">
            {state.edgeConfig.connected ? (
              <>Global Config is connected, but saving also needs a Vercel access token in <code className="font-mono">VERCEL_API_TOKEN</code> (and <code className="font-mono">VERCEL_TEAM_ID</code> if the store belongs to a team), then a redeploy.</>
            ) : (
              <>Create a Global Config store in Vercel (Storage → Global Config) and connect it to this project, which adds <code className="font-mono">GLOBAL_CONFIG</code>. Then add a Vercel access token as <code className="font-mono">VERCEL_API_TOKEN</code> and redeploy.</>
            )}
          </p>
        </div>
      )}

      <div className="card divide-y divide-line">
        {rows.map((r) => (
          <div key={r.id} className="p-5 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-extrabold">{r.name}</h2>
                {r.env !== "—" && (
                  <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${r.env === "Live" ? "bg-accent-500/10 text-accent-600" : "bg-brand-50 text-brand-700"}`}>{r.env}</span>
                )}
                {(r.id === "sandbox" || r.id === "prod") && <span className="text-[11px] text-muted">one Jinko environment at a time</span>}
              </div>
              <p className="text-sm text-muted mt-1">{r.note}</p>
              <p className="text-xs mt-2">
                {r.hasKey ? (
                  <span className="text-mint-500 font-semibold">✓ Key set</span>
                ) : (
                  <span className="text-accent-600 font-semibold">Key missing</span>
                )}
                <span className="text-muted"> · <code className="font-mono">{r.envVar}</code></span>
              </p>
            </div>
            <Switch on={r.on} disabled={!r.hasKey || !writable || saving} onChange={(v) => toggle(r, v)} label={`${r.name} on or off`} />
          </div>
        ))}
      </div>

      <div className="card p-5 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-extrabold">Chat assistant</h2>
            <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">Site feature</span>
          </div>
          <p className="text-sm text-muted mt-1">
            &ldquo;Ask trip27&rdquo; on the site: customers describe a trip, the assistant searches the suppliers above and hands the chosen fare to the normal checkout. It never books or takes payment itself. Runs on Gemini or Claude (CHAT_PROVIDER). Each conversation uses AI model usage plus supplier searches.
          </p>
          <p className="text-xs mt-2">
            {c.chat ? <span className="text-mint-500 font-semibold">✓ Key set</span> : <span className="text-accent-600 font-semibold">Key missing</span>}
            <span className="text-muted"> · <code className="font-mono">GEMINI_API_KEY</code> or <code className="font-mono">ANTHROPIC_API_KEY</code></span>
          </p>
        </div>
        <Switch on={chat && c.chat} disabled={!c.chat || !writable || saving} onChange={(v) => { setSaved(false); setError(null); setChat(v); }} label="Chat assistant on or off" />
      </div>

      {anyLiveSelected && !state.liveBookings && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Live fares will show, but booking them is blocked.</b> Real bookings also need <code className="font-mono">ALLOW_LIVE_BOOKINGS=true</code> in Vercel, as a second safety switch.
        </div>
      )}

      {confirming && (
        <div role="alertdialog" aria-labelledby="live-title" className="rounded-2xl border-2 border-accent-500 bg-white p-5">
          <p id="live-title" className="font-extrabold text-lg">Switch Jinko to Production?</p>
          <p className="text-sm text-muted mt-1">
            Customers will see real fares, pay Jinko real money and receive real tickets. Jinko Sandbox will be switched off.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={() => save(true)} disabled={saving}>Yes, go live with Jinko</button>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={saving}>Cancel</button>
          </div>
        </div>
      )}

      {error && <div role="alert" className="rounded-xl border border-accent-400 bg-accent-500/10 px-4 py-3 text-sm font-medium text-accent-600">{error}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Signed in as {email}. Keys stay in Vercel environment variables; this page only switches suppliers on and off.</p>
        <div className="flex items-center gap-3">
          {saved && !dirty && <span className="text-sm font-semibold text-mint-500">✓ Saved — live within seconds</span>}
          {dirty && !confirming && (
            <button type="button" className="btn-ghost" onClick={() => { setDuffel(state.flags.duffel); setJinko(state.flags.jinko); setApeiro(state.flags.apeiro !== false); setChat(state.flags.chat !== false); setError(null); }} disabled={saving}>
              Discard
            </button>
          )}
          {!confirming && (
            <button type="button" className="btn-brand" onClick={() => save()} disabled={!dirty || saving || !writable}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
