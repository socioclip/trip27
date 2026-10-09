import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CHALLENGE_COOKIE, attemptsLeft, challengeCookie, clearCookie, cleanCode, codeMatches, sessionCookie, unsign, type Challenge } from "@/lib/auth";

// Step 2 of sign-in: check the code and start a session.
export async function POST(req: Request) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const jar = await cookies();
  const ch = unsign<Challenge>("challenge", jar.get(CHALLENGE_COOKIE)?.value);
  if (!ch) return NextResponse.json({ error: "This code has expired. Please request a new one.", expired: true }, { status: 410 });
  if (attemptsLeft(ch) <= 0) {
    const res = NextResponse.json({ error: "Too many wrong codes. Please request a new one.", expired: true }, { status: 429 });
    const c = clearCookie(CHALLENGE_COOKIE);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  }

  if (cleanCode(body.code || "").length !== 8 || !codeMatches(ch, body.code || "")) {
    const next = { ...ch, a: ch.a + 1 };
    const left = attemptsLeft(next);
    const res = NextResponse.json(
      { error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Please request a new one.", expired: left <= 0 },
      { status: 400 }
    );
    const c = challengeCookie(next);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  }

  const res = NextResponse.json({ ok: true, email: ch.email });
  const s = sessionCookie(ch.email);
  res.cookies.set(s.name, s.value, s.options);
  const c = clearCookie(CHALLENGE_COOKIE);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
