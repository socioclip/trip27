import { NextResponse } from "next/server";
import { adminSession, sameOrigin } from "@/lib/admin";
import { apeiroTokenState, clearApeiroToken, saveApeiroToken } from "@/lib/suppliers";
import { testApeiroToken } from "@/lib/providers/apeiro";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

// Paste (and test) the Apeirotrip search token here instead of in Vercel.
// The token expires every ~15 minutes, so it lives in Global Config, not an env var.
export async function POST(req: Request) {
  const { email, isAdmin } = await adminSession();
  if (!isAdmin || !email) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "Paste a token." }, { status: 400 });

  // Validate against the live API before storing, so a dead token is never saved.
  const test = await testApeiroToken(token);
  if (!test.ok) return NextResponse.json({ error: test.message }, { status: 400, headers: NO_STORE });

  try {
    await saveApeiroToken(token, email);
    console.info("[admin] Apeirotrip token updated", JSON.stringify({ by: email, offers: test.offers }));
    return NextResponse.json({ ok: true, message: test.message, offers: test.offers, token: await apeiroTokenState() }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502, headers: NO_STORE });
  }
}

export async function DELETE(req: Request) {
  const { email, isAdmin } = await adminSession();
  if (!isAdmin || !email) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    await clearApeiroToken();
    console.info("[admin] Apeirotrip token cleared", JSON.stringify({ by: email }));
    return NextResponse.json({ ok: true, token: await apeiroTokenState() }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502, headers: NO_STORE });
  }
}
