import { NextResponse } from "next/server";
import { adminSession, sameOrigin } from "@/lib/admin";
import { credentials, getAdminState, saveFlags, type JinkoChoice } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const { isAdmin } = await adminSession();
  if (!isAdmin) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  return NextResponse.json(await getAdminState(), { headers: NO_STORE });
}

export async function POST(req: Request) {
  const { email, isAdmin } = await adminSession();
  if (!isAdmin || !email) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  let body: { duffel?: unknown; jinko?: unknown; confirmLive?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const duffel = body.duffel === true;
  const jinko: JinkoChoice = body.jinko === "sandbox" || body.jinko === "prod" ? body.jinko : "off";
  if (body.jinko !== undefined && !["off", "sandbox", "prod"].includes(String(body.jinko)))
    return NextResponse.json({ error: "Unknown Jinko setting." }, { status: 400 });

  const c = credentials();
  if (duffel && !c.duffel) return NextResponse.json({ error: "Duffel has no access token set in Vercel." }, { status: 400 });
  if (jinko === "sandbox" && !c.jinkoSandbox) return NextResponse.json({ error: "Jinko Sandbox has no API key set in Vercel." }, { status: 400 });
  if (jinko === "prod" && !c.jinkoProd) return NextResponse.json({ error: "Jinko Production has no API key set in Vercel." }, { status: 400 });

  // Switching to production must be confirmed explicitly, every time.
  const current = await getAdminState();
  if (jinko === "prod" && current.flags.jinko !== "prod" && body.confirmLive !== true)
    return NextResponse.json({ error: "Confirm that Jinko Production sells real tickets." }, { status: 400 });

  try {
    await saveFlags({ duffel, jinko }, email);
    console.info("[admin] supplier flags changed", JSON.stringify({ by: email, duffel, jinko }));
    return NextResponse.json(await getAdminState(), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
