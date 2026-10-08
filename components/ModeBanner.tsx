export default function ModeBanner({ mode }: { mode: string }) {
  if (mode === "demo")
    return (
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        <b>Demo mode:</b> flights and prices are sample data. Add a Duffel access token to show real airline fares.
      </div>
    );
  if (mode === "test")
    return (
      <div className="mb-4 rounded-xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
        <b>Test mode:</b> results come from Duffel&apos;s sandbox. Bookings are not ticketed and no money is taken.
      </div>
    );
  return null;
}
