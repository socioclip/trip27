import { NextResponse } from "next/server";
import { getProvider } from "@/lib/providers";
import { fail } from "@/lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const order = await getProvider(id).getOrder(id);
    if (!order) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (e) {
    return fail(e);
  }
}
