import { NextResponse } from "next/server";
import { getProvider, providerMode } from "@/lib/providers";
import { fail } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const details = await getProvider(id).getOffer(id);
    return NextResponse.json({ ...details, mode: id.startsWith("demo_") ? "demo" : providerMode() });
  } catch (e) {
    return fail(e);
  }
}
