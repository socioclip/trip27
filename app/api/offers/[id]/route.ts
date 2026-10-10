import { NextResponse } from "next/server";
import { getProvider, modeFor } from "@/lib/providers";
import { isJinkoId } from "@/lib/providers/jinko";
import { fail } from "@/lib/http";
import { ckoPublicConfig } from "@/lib/checkout-com";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const details = await getProvider(id).getOffer(id);
    const demo = id.startsWith("demo_");
    // Jinko fares are paid on Jinko's own hosted checkout, not Checkout.com.
    const jinko = isJinkoId(id);
    return NextResponse.json({
      ...details,
      mode: modeFor(id),
      payments: demo || jinko ? null : ckoPublicConfig(),
      checkout: jinko ? "jinko" : demo ? "demo" : ckoPublicConfig() ? "card" : "direct",
    });
  } catch (e) {
    return fail(e);
  }
}
