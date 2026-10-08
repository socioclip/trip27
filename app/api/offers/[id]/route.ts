import { NextResponse } from "next/server";
import { getProvider, providerMode } from "@/lib/providers";
import { fail } from "@/lib/http";
import { ckoPublicConfig } from "@/lib/checkout-com";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const details = await getProvider(id).getOffer(id);
    const demo = id.startsWith("demo_");
    return NextResponse.json({ ...details, mode: demo ? "demo" : providerMode(), payments: demo ? null : ckoPublicConfig() });
  } catch (e) {
    return fail(e);
  }
}
