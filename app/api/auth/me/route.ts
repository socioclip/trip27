import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  return NextResponse.json({ email: s?.email ?? null }, { headers: { "Cache-Control": "no-store" } });
}
