import { NextResponse } from "next/server";
import { allow, authConfigured, challengeCookie, isEmail, linkToken, makeChallenge, newCode, normalizeEmail, prettyCode } from "@/lib/auth";
import { emailEnabled, sendSignInCode } from "@/lib/email";
import { providerMode } from "@/lib/providers";
import { safeNext } from "@/lib/next-path";

// Step 1 of sign-in: email the customer a one-time code.
export async function POST(req: Request) {
  let body: { email?: string; next?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = normalizeEmail(body.email || "");
  if (!isEmail(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (!authConfigured()) return NextResponse.json({ error: "Sign-in isn't set up yet." }, { status: 503 });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  if (!allow("email:" + email, 5, 15 * 60_000) || !allow("ip:" + ip, 20, 15 * 60_000))
    return NextResponse.json({ error: "Too many sign-in attempts. Please wait a few minutes and try again." }, { status: 429 });

  const code = newCode();
  const challenge = makeChallenge(email, code);
  const origin = new URL(req.url).origin + (process.env.NEXT_PUBLIC_BASE_PATH || "");
  const link = `${origin}/api/auth/link?t=${encodeURIComponent(linkToken(email))}&next=${encodeURIComponent(safeNext(body.next))}`;

  let devCode: string | undefined;
  if (emailEnabled()) {
    const sent = await sendSignInCode(email, prettyCode(code), link);
    if (!sent) return NextResponse.json({ error: "We couldn't send the sign-in email. Please check the address and try again." }, { status: 502 });
  } else if ((await providerMode()) === "demo" || process.env.NODE_ENV !== "production") {
    // Demo site with no email service: show the code on screen so the flow can be tried.
    devCode = prettyCode(code);
  } else {
    return NextResponse.json({ error: "Sign-in by email isn't set up yet." }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true, email, ...(devCode ? { devCode } : {}) });
  const c = challengeCookie(challenge);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
