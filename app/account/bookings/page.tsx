import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listOrdersForEmail } from "@/lib/providers";
import { formatMoney, hhmm, prettyDate } from "@/lib/format";
import type { Order } from "@/lib/types";
import SignOutButton from "@/components/account/SignOutButton";

export const metadata = { title: "My bookings" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function route(o: Order) {
  const first = o.slices[0];
  if (!first) return "Booking";
  const roundTrip = o.slices.length === 2 && first.origin.code === o.slices[1].destination.code;
  const last = o.slices[o.slices.length - 1];
  return `${first.origin.city} ${roundTrip ? "⇄" : "→"} ${(roundTrip ? first : last).destination.city}`;
}

function dates(o: Order) {
  const a = o.slices[0]?.departingAt;
  const b = o.slices.length > 1 ? o.slices[o.slices.length - 1].departingAt : null;
  if (!a) return "";
  return b && b.slice(0, 10) !== a.slice(0, 10) ? `${prettyDate(a.slice(0, 10), true)} – ${prettyDate(b.slice(0, 10), true)}` : prettyDate(a.slice(0, 10), true);
}

function BookingCard({ o, past }: { o: Order; past?: boolean }) {
  const first = o.slices[0];
  return (
    <Link href={`/booking/${encodeURIComponent(o.id)}`} className={`card p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-brand-300 transition ${past ? "opacity-75" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${o.status === "confirmed" ? "bg-mint-500/10 text-mint-500" : "bg-amber-100 text-amber-800"}`}>
            {past ? "Completed" : o.status === "confirmed" ? "Confirmed" : "Pending"}
          </span>
          {!o.live && <span className="text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-surface text-muted">Test</span>}
        </div>
        <p className="text-lg font-extrabold mt-2 truncate">{route(o)}</p>
        <p className="text-sm text-muted mt-0.5">
          {dates(o)}
          {first ? ` · departs ${hhmm(first.departingAt)} from ${first.origin.code}` : ""}
        </p>
        <p className="text-sm text-muted mt-0.5 truncate">
          {o.owner?.name} · {o.passengers.length} {o.passengers.length === 1 ? "traveller" : "travellers"}
        </p>
      </div>
      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0">
        <div className="sm:text-right">
          <p className="text-[11px] uppercase tracking-widest text-muted font-semibold">Reference</p>
          <p className="text-lg font-extrabold tracking-[0.15em]">{o.bookingReference}</p>
        </div>
        <p className="text-sm font-bold text-brand-800">{formatMoney(o.total)}</p>
      </div>
    </Link>
  );
}

export default async function MyBookingsPage() {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent("/account/bookings")}`);

  let orders: Order[] = [];
  let error: string | null = null;
  try {
    orders = await listOrdersForEmail(session.email);
  } catch (e) {
    console.error("[account] list orders failed", e);
    error = "We couldn't load your bookings right now. Please try again in a moment.";
  }

  const now = new Date().toISOString();
  const endOf = (o: Order) => o.slices[o.slices.length - 1]?.arrivingAt || o.createdAt;
  const upcoming = orders.filter((o) => endOf(o) >= now).sort((a, b) => (a.slices[0]?.departingAt || "").localeCompare(b.slices[0]?.departingAt || ""));
  const past = orders.filter((o) => endOf(o) < now);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">My bookings</h1>
          <p className="text-sm text-muted mt-1">Bookings made with <span className="font-semibold text-ink">{session.email}</span></p>
        </div>
        <SignOutButton />
      </div>

      {error && <p className="mt-8 card p-5 text-accent-600" role="alert">{error}</p>}

      {!error && orders.length === 0 && (
        <div className="mt-8 card p-10 text-center">
          <p className="text-xl font-extrabold">No bookings yet</p>
          <p className="text-muted mt-2 max-w-md mx-auto">
            When you book with {session.email} as the contact email, your trips will show up here.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn-primary">Search flights</Link>
            <Link href="/manage" className="btn-ghost">Find a booking by number</Link>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted mb-3">Upcoming · {upcoming.length}</h2>
          <div className="space-y-3">{upcoming.map((o) => <BookingCard key={o.id} o={o} />)}</div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted mb-3">Past trips · {past.length}</h2>
          <div className="space-y-3">{past.map((o) => <BookingCard key={o.id} o={o} past />)}</div>
        </section>
      )}
    </div>
  );
}
