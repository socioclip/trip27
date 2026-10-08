import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { fail } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ seatMaps: await getProvider(id).getSeatMaps(id) });
  } catch (e) {
    return fail(e);
  }
}
