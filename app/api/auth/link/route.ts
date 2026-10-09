import { NextResponse } from "next/server";
import { clearCookie, CHALLENGE_COOKIE, sessionCookie, unsign } from "@/lib/auth";
import { safeNext } from "@/lib/next-path";

// One-click sign-in from the email.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const t = unsign<{ email: string; exp: number }>("link", url.searchParams.get("t"));
  if (!t) return NextResponse.redirect(new URL(`${base}/login?expired=1`, url.origin));
  const res = NextResponse.redirect(new URL(base + safeNext(url.searchParams.get("next")), url.origin));
  const s = sessionCookie(t.email);
  res.cookies.set(s.name, s.value, s.options);
  const c = clearCookie(CHALLENGE_COOKIE);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
