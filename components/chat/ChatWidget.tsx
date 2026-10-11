"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { ChatEvent, ChatMessage, ChatRef, OfferCard } from "@/lib/chat/protocol";
import { MAX_USER_MESSAGE } from "@/lib/chat/protocol";
import type { Offer } from "@/lib/types";
import ChatOfferCard from "./ChatOfferCard";

// "Ask trip27": a chat that searches flights with the same suppliers as the
// search form and hands the chosen fare to the normal checkout. The browser
// keeps the conversation (sessionStorage); the server is stateless.

type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "offers"; cards: OfferCard[]; total: number; searchUrl: string; mode: string }
  | { kind: "checkout"; ref: string; url: string; offer: Offer; partner: boolean }
  | { kind: "error"; text: string };

interface Saved {
  items: Item[];
  history: ChatMessage[];
  refs: Record<string, ChatRef>;
}

const STORE = "trip27:chat:v1";
const OPEN_EVENT = "trip27:open-chat";
const HIDDEN = [/^\/admin/, /^\/flights\/checkout\//, /^\/payment\//, /^\/login/];

const SUGGESTIONS = [
  "Cheapest weekend in Tbilisi from Dubai next month",
  "Non-stop Dubai to London in early December, back a week later",
  "Family of 4 (2 kids) from Sharjah to Istanbul over New Year",
];

/** Opens the chat from anywhere on the site, optionally sending a first message. */
export function openChat(prompt?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { prompt } }));
}

function load(): Saved {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { items: [], history: [], refs: {} };
}

export default function ChatWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<Saved>({ items: [], history: [], refs: {} });
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    fetch(api("/api/chat"), { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setEnabled(!!j.enabled))
      .catch(() => setEnabled(false));
    setState(load());
  }, []);

  const save = useCallback((next: Saved) => {
    setState(next);
    try {
      sessionStorage.setItem(STORE, JSON.stringify(next));
    } catch {}
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [state.items, streaming, status, open]);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim().slice(0, MAX_USER_MESSAGE);
      if (!message || busy) return;
      const start = stateRef.current;
      let items: Item[] = [...start.items, { kind: "user", text: message }];
      let refs = { ...start.refs };
      save({ ...start, items });
      setDraft("");
      setBusy(true);
      setStreaming("");
      setStatus(null);

      let text_ = "";
      // Text before a tool call is its own bubble, so cards land in the right place.
      const flushText = () => {
        if (text_.trim()) items = [...items, { kind: "assistant", text: text_.trim() }];
        text_ = "";
        setStreaming("");
      };
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch(api("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history: start.history, message, refs }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Sorry, something went wrong. Please try again.");
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let done: ChatMessage[] | null = null;
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const e = JSON.parse(line) as ChatEvent;
            if (e.type === "text") {
              text_ += e.delta;
              setStreaming(text_);
              setStatus(null);
            } else if (e.type === "status") {
              flushText();
              setStatus(e.text);
              save({ ...stateRef.current, items });
            } else if (e.type === "offers") {
              refs = { ...refs, ...e.refs };
              items = [...items, { kind: "offers", cards: e.cards, total: e.total, searchUrl: e.searchUrl, mode: e.mode }];
              setStatus(null);
              save({ ...stateRef.current, items, refs });
            } else if (e.type === "checkout") {
              items = [...items, { kind: "checkout", ref: e.ref, url: e.url, offer: e.offer, partner: e.partner }];
              setStatus(null);
              save({ ...stateRef.current, items });
            } else if (e.type === "refs") {
              refs = { ...refs, ...e.refs };
            } else if (e.type === "done") {
              done = e.messages;
            } else if (e.type === "error") {
              throw new Error(e.message);
            }
          }
        }
        flushText();
        if (!done) throw new Error("The connection dropped. Please try again.");
        save({ items, refs, history: [...start.history, { role: "user", content: message }, ...done] });
      } catch (e) {
        flushText();
        // A failed turn isn't added to the history, so the next message starts clean.
        if (!ctrl.signal.aborted) items = [...items, { kind: "error", text: (e as Error).message }];
        save({ ...stateRef.current, items, refs });
      } finally {
        setBusy(false);
        setStatus(null);
        setStreaming("");
        abort.current = null;
      }
    },
    [busy, save]
  );

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const prompt = (e as CustomEvent<{ prompt?: string }>).detail?.prompt;
      if (prompt) send(prompt);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [send]);

  const book = (ref: string, offer?: Offer) => {
    const r = stateRef.current.refs[ref];
    if (!r) return;
    setBooking(ref);
    try {
      if (offer && offer.id === r.id) sessionStorage.setItem("trip27:offer:" + r.id, JSON.stringify(offer));
    } catch {}
    setOpen(false);
    router.push(`/flights/checkout/${encodeURIComponent(r.id)}?${r.qs}`);
    setTimeout(() => setBooking(null), 1500);
  };

  const reset = () => {
    abort.current?.abort();
    save({ items: [], history: [], refs: {} });
  };

  if (!enabled || HIDDEN.some((re) => re.test(pathname || ""))) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="no-print fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-brand-700 text-white pl-4 pr-5 py-3.5 font-bold shadow-[0_10px_30px_rgba(36,18,96,0.35)] hover:bg-brand-800 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          aria-haspopup="dialog"
        >
          <SparkIcon /> Ask trip27
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="trip27 flight assistant"
          className="no-print fixed z-50 inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[420px] sm:h-[min(680px,calc(100vh-40px))] flex flex-col bg-surface sm:rounded-2xl sm:border sm:border-line shadow-2xl overflow-hidden"
        >
          <header className="bg-brand-900 text-white px-4 py-3 flex items-center gap-3 shrink-0">
            <span className="w-9 h-9 rounded-xl bg-white/10 grid place-items-center"><SparkIcon /></span>
            <div className="min-w-0 flex-1">
              <p className="font-extrabold leading-tight">Ask trip27</p>
              <p className="text-xs text-white/70">Tell me where and when. I&apos;ll find the flights.</p>
            </div>
            {state.items.length > 0 && (
              <button type="button" onClick={reset} className="text-xs font-semibold text-white/80 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10">
                New chat
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/10">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </header>

          <div ref={scroller} className="flex-1 overflow-y-auto px-3 py-4 space-y-3" aria-live="polite">
            {state.items.length === 0 && !busy && (
              <div className="px-1">
                <div className="rounded-2xl bg-white border border-line p-4">
                  <p className="font-bold">Hi! Plan your trip in plain words.</p>
                  <p className="text-sm text-muted mt-1">
                    Say where you&apos;re flying, roughly when, and who&apos;s coming. I&apos;ll compare fares across our airlines and you book on the usual secure checkout.
                  </p>
                </div>
                <p className="label mt-4 px-1">Try</p>
                <div className="grid gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="text-left text-sm rounded-xl border border-line bg-white px-3 py-2.5 hover:border-brand-300 hover:bg-brand-50 transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {state.items.map((it, i) => (
              <Fragment key={i}>{renderItem(it, book, booking)}</Fragment>
            ))}

            {streaming && <Bubble role="assistant" text={streaming} />}
            {busy && !streaming && (
              <div className="flex items-center gap-2 text-sm text-muted px-1">
                <span className="inline-flex gap-1" aria-hidden>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" />
                </span>
                {status || "Thinking…"}
              </div>
            )}
          </div>

          <form
            className="shrink-0 border-t border-line bg-white p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                rows={1}
                maxLength={MAX_USER_MESSAGE}
                placeholder={busy ? "Searching…" : "e.g. Dubai to Baku, 12–16 Dec, 2 adults"}
                aria-label="Message"
                className="field !py-2.5 resize-none max-h-32 min-h-[44px]"
              />
              <button type="submit" disabled={busy || !draft.trim()} className="btn-primary !px-4 !py-2.5 h-[44px]" aria-label="Send">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" /></svg>
              </button>
            </div>
            <p className="text-[11px] text-muted mt-2">
              AI assistant: double-check details before paying. Never share card or passport numbers here.
            </p>
          </form>
        </div>
      )}
    </>
  );
}

function renderItem(it: Item, book: (ref: string, offer?: Offer) => void, booking: string | null) {
  if (it.kind === "user") return <Bubble role="user" text={it.text} />;
  if (it.kind === "assistant") return <Bubble role="assistant" text={it.text} />;
  if (it.kind === "error")
    return <div role="alert" className="rounded-xl border border-accent-400 bg-accent-500/10 px-3 py-2 text-sm font-medium text-accent-600">{it.text}</div>;
  if (it.kind === "checkout")
    return (
      <div className="rounded-xl border-2 border-brand-200 bg-white p-3">
        <p className="text-[13px] font-bold">{it.offer.owner.name} · {it.offer.fareBrand}</p>
        <p className="text-sm text-muted">
          {it.offer.slices.map((s) => `${s.origin.code} → ${s.destination.code}`).join(" · ")} · <b className="text-ink">{formatMoney(it.offer.total)}</b>
        </p>
        <button type="button" onClick={() => book(it.ref, it.offer)} disabled={!!booking} className="btn-primary w-full mt-3">
          {booking === it.ref ? "Opening checkout…" : "Continue to secure checkout"}
        </button>
        <p className="text-[11px] text-muted mt-2">
          {it.partner ? "Payment is taken on our partner's secure page, in USD." : "You'll add traveller details, seats and bags, then pay by card."} Nothing is booked until you pay.
        </p>
      </div>
    );
  // offers
  return (
    <div className="space-y-2">
      {it.mode === "demo" && <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Demo mode: sample flights, not real fares.</p>}
      {it.mode === "test" && <p className="text-[11px] font-semibold text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5">Test mode: sandbox fares, bookings aren&apos;t ticketed.</p>}
      {it.cards.map((c) => (
        <ChatOfferCard key={c.ref} card={c} busy={booking} onBook={(ref) => book(ref, ref === c.ref ? c.offer : undefined)} />
      ))}
      {it.total > it.cards.length && (
        <Link href={it.searchUrl} className="block text-center text-sm font-semibold text-brand-600 hover:underline py-1">
          See all {it.total} results with filters →
        </Link>
      )}
    </div>
  );
}

function Bubble({ role, text }: { role: "user" | "assistant"; text: string }) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${mine ? "bg-brand-600 text-white rounded-br-md" : "bg-white border border-line rounded-bl-md"}`}>
        {mine ? <p className="whitespace-pre-wrap break-words">{text}</p> : <Rich text={text} />}
      </div>
    </div>
  );
}

/** Minimal formatting for the assistant: paragraphs, bullet lists and **bold**. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2 break-words">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-•*]\s+/.test(l)))
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>)}
            </ul>
          );
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>));
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden>
      <path d="M12 2.5c.4 3.9 1.9 6.6 4.4 8.1 1.4.8 3.1 1.2 5.1 1.4-3.9.4-6.6 1.9-8.1 4.4-.8 1.4-1.2 3.1-1.4 5.1-.4-3.9-1.9-6.6-4.4-8.1C6.2 12.6 4.5 12.2 2.5 12c3.9-.4 6.6-1.9 8.1-4.4.8-1.4 1.2-3.1 1.4-5.1Z" />
    </svg>
  );
}
