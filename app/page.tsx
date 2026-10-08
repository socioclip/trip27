import Link from "next/link";
import SearchForm from "@/components/search/SearchForm";
import { addDays, todayYmd } from "@/lib/format";

const DESTS = [
  { code: "LON", city: "London", country: "United Kingdom", from: "DXB", tone: "from-[#3a1d93] to-[#8a6bff]" },
  { code: "IST", city: "Istanbul", country: "Türkiye", from: "DXB", tone: "from-[#c2410c] to-[#ff8a5b]" },
  { code: "CAI", city: "Cairo", country: "Egypt", from: "DXB", tone: "from-[#a16207] to-[#facc15]" },
  { code: "BKK", city: "Bangkok", country: "Thailand", from: "DXB", tone: "from-[#0f766e] to-[#2dd4bf]" },
  { code: "BOM", city: "Mumbai", country: "India", from: "DXB", tone: "from-[#be123c] to-[#fb7185]" },
  { code: "TBS", city: "Tbilisi", country: "Georgia", from: "DXB", tone: "from-[#1d4ed8] to-[#60a5fa]" },
];

export const revalidate = 3600;

export default function Home() {
  const d1 = addDays(todayYmd(), 21);
  const d2 = addDays(todayYmd(), 28);
  return (
    <>
      <section className="relative overflow-hidden bg-brand-900">
        <div className="absolute inset-0 opacity-70" aria-hidden style={{ background: "radial-gradient(1200px 500px at 85% -10%, #6c44f5 0%, transparent 60%), radial-gradient(800px 400px at 0% 110%, #ff6a33 0%, transparent 55%)" }} />
        <div className="relative mx-auto max-w-7xl px-4 pt-12 pb-28 sm:pt-16">
          <h1 className="text-white text-3xl sm:text-5xl font-extrabold tracking-tight max-w-2xl leading-tight">
            Where to next? <span className="text-accent-400">Fly for less.</span>
          </h1>
          <p className="text-white/75 mt-3 text-base sm:text-lg max-w-xl">Compare fares from hundreds of airlines, pick your seat and add bags, all in one booking.</p>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 -mt-20 z-10">
        <SearchForm />
      </section>

      <section className="mx-auto max-w-7xl px-4 mt-12 grid gap-4 sm:grid-cols-3">
        {[
          ["Best fares, no surprises", "Taxes and fees are included in the price you see."],
          ["Choose your seat & bags", "Add seats and extra baggage when you book, where the airline allows it."],
          ["Instant confirmation", "Your booking reference and itinerary arrive by email straight away."],
        ].map(([t, d], i) => (
          <div key={t} className="card p-5 flex gap-4">
            <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 grid place-items-center font-extrabold shrink-0">{i + 1}</span>
            <div>
              <p className="font-bold">{t}</p>
              <p className="text-sm text-muted mt-1">{d}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 mt-12">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-2xl font-extrabold">Popular from Dubai</h2>
            <p className="text-muted text-sm">Round-trips in three weeks&apos; time</p>
          </div>
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          {DESTS.map((d) => (
            <Link
              key={d.code}
              href={`/flights?trip=round&s=${d.from}-${d.code}-${d1},${d.code}-${d.from}-${d2}&ad=1&ch=0&in=0&cabin=economy`}
              className={`group relative h-36 sm:h-44 rounded-2xl overflow-hidden bg-gradient-to-br ${d.tone} p-5 flex flex-col justify-end text-white`}
            >
              <span className="absolute right-4 top-3 text-5xl sm:text-6xl font-extrabold opacity-20 tracking-tighter">{d.code}</span>
              <span className="text-xl sm:text-2xl font-extrabold">{d.city}</span>
              <span className="text-sm text-white/80">{d.country}</span>
              <span className="mt-2 text-sm font-semibold inline-flex items-center gap-1 group-hover:gap-2 transition-all">See flights →</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
