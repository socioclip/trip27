import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { searchLocalAirports } from "@/lib/airports";
import { fail } from "@/lib/http";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") || "";
  try {
    if (q.trim().length < 2) return NextResponse.json({ places: searchLocalAirports("", 8) });
    const places = await getProvider().searchPlaces(q);
    return NextResponse.json({ places: places.length ? places : searchLocalAirports(q, 8) });
  } catch (e) {
    // Fall back to the local list if the supplier is unavailable.
    const local = searchLocalAirports(q, 8);
    if (local.length) return NextResponse.json({ places: local });
    return fail(e);
  }
}
