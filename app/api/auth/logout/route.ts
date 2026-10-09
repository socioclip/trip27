import { NextResponse } from "next/server";
import { clearCookie, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  const c = clearCookie(SESSION_COOKIE);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}
