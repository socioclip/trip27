import { NextResponse } from "next/server";
import { providerMode, searchAll } from "@/lib/providers";
import { fromQuery } from "@/lib/search";
import { fail } from "@/lib/http";
import { todayYmd } from "@/lib/format";

export const maxDuration = 60;

export async function GET(req: Request) {
  const parsed = fromQuery(new URL(req.url).searchParams);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (parsed.params.slices[0].date < todayYmd()) {
    return NextResponse.json({ error: "The departure date is in the past." }, { status: 400 });
  }
  try {
    const offers = await searchAll(parsed.params);
    return NextResponse.json({ offers, mode: await providerMode() });
  } catch (e) {
    return fail(e);
  }
}
