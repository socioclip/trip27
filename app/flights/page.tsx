import { Suspense } from "react";
import Results from "@/components/results/Results";

export const metadata = { title: "Flight results" };

export default function FlightsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl px-4 py-10 text-muted">Loading…</div>}>
      <Results />
    </Suspense>
  );
}
