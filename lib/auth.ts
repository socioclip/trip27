import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";
import { deflateRawSync, inflateRawSync } from "zlib";
import { cookies } from "next/headers";

// ---------------------------------------------------------------------------
// Passwordless accounts, with no database.
//
// 1. The customer enters an email. We email them an 8-character code plus a
//    one-click sign-in link. A signed, short-lived "challenge" is kept in an
//    httpOnly cookie in their browser; it holds only a hash of the code.
// 2. They enter the code (or click the link). We check it against the
//    challenge and set a signed session cookie that lasts 30 days.
// 3. "My bookings" lists the supplier's orders whose contact email matches.
//
// Everything is signed with AUTH_SECRET (falls back to other server secrets
// so the site works before you add it, but set it in production).
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "t27_session";
export const CHALLENGE_COOKIE = "t27_challenge";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const LINK_MINUTES = 15;
const MAX_ATTEMPTS = 5;

// Unambiguous characters (no 0/O, 1/I/L). 30^8 ≈ 6.6e11 combinations, so the
// code can't be brute-forced in its 10-minute window even without a database.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ2346789";
const CODE_LEN = 8;

export type Session = { email: string; exp: number };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normalizeEmail = (e: string) => String(e || "").trim().toLowerCase();
export const isEmail = (e: string) => EMAIL_RE.test(e) && e.length <= 254;

function secret(): string {
  const direct = process.env.AUTH_SECRET || process.env.BOOKING_SIGNING_SECRET || process.env.CKO_SECRET_KEY;
  if (direct) return direct;
  // Derive a key from another server-only secret rather than failing outright.
  const base = process.env.DUFFEL_ACCESS_TOKEN || process.env.RESEND_API_KEY;
  if (base) return createHash("sha256").update("trip27-auth:" + base).digest("hex");
  if (process.env.NODE_ENV !== "production") return "trip27-dev-only-secret";
  throw new Error("AUTH_SECRET is not set.");
}

export function authConfigured() {
  try {
    secret();
    return true;
  } catch {
    return false;
  }
}

function mac(purpose: string, body: string) {
  return createHmac("sha256", secret()).update(purpose + "." + body).digest("base64url");
}

/** Signs a JSON payload for one purpose ("session", "challenge", "link"). */
export function sign(purpose: string, payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(purpose, body)}`;
}

/** Returns the payload if the signature and expiry are valid, else null. */
export function unsign<T extends { exp: number }>(purpose: string, token: string | undefined | null): T | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(purpose, body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Like sign(), but deflate-compresses the payload so it stays short enough to
 * live in a URL (used for supplier offer snapshots, since there's no database).
 */
export function seal(purpose: string, payload: object): string {
  const body = deflateRawSync(Buffer.from(JSON.stringify(payload))).toString("base64url");
  return `${body}.${mac(purpose, body)}`;
}

/** Opens a seal()ed token. Returns null if tampered with or expired. */
export function unseal<T extends { exp: number }>(purpose: string, token: string | undefined | null): T | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(mac(purpose, body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(inflateRawSync(Buffer.from(body, "base64url")).toString()) as T;
    if (typeof data.exp !== "number" || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

// ---- codes -----------------------------------------------------------------

export function newCode() {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}
/** Display form: ABCD-EFGH */
export const prettyCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
/** Accepts "abcd efgh", "ABCD-EFGH" etc. */
export const cleanCode = (c: string) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const codeHash = (email: string, code: string, nonce: string) => mac("code", `${email}:${code}:${nonce}`);

export type Challenge = { email: string; h: string; n: string; a: number; exp: number };

export function makeChallenge(email: string, code: string): Challenge {
  const n = newCode() + newCode();
  return { email, h: codeHash(email, code, n), n, a: 0, exp: Date.now() + CODE_MINUTES * 60_000 };
}

export function codeMatches(ch: Challenge, code: string) {
  const a = Buffer.from(codeHash(ch.email, cleanCode(code), ch.n));
  const b = Buffer.from(ch.h);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const attemptsLeft = (ch: Challenge) => MAX_ATTEMPTS - ch.a;

export function linkToken(email: string) {
  return sign("link", { email, exp: Date.now() + LINK_MINUTES * 60_000 });
}

// ---- cookies ---------------------------------------------------------------

const secure = process.env.NODE_ENV === "production";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "/";

export function sessionCookie(email: string) {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  return {
    name: SESSION_COOKIE,
    value: sign("session", { email, exp } satisfies Session),
    options: { httpOnly: true, secure, sameSite: "lax" as const, path: base, maxAge: SESSION_DAYS * 86_400 },
  };
}

export function challengeCookie(ch: Challenge) {
  return {
    name: CHALLENGE_COOKIE,
    value: sign("challenge", ch),
    options: { httpOnly: true, secure, sameSite: "lax" as const, path: base, maxAge: CODE_MINUTES * 60 },
  };
}

export const clearCookie = (name: string) => ({ name, value: "", options: { httpOnly: true, secure, sameSite: "lax" as const, path: base, maxAge: 0 } });

/** The signed-in customer, or null. Use in server components and route handlers. */
export async function getSession(): Promise<Session | null> {
  if (!authConfigured()) return null;
  const jar = await cookies();
  return unsign<Session>("session", jar.get(SESSION_COOKIE)?.value);
}

// ---- best-effort throttle (per server instance) ------------------------------

const g = globalThis as unknown as { __t27Throttle?: Map<string, number[]> };
const HITS: Map<string, number[]> = (g.__t27Throttle ??= new Map<string, number[]>());

/** Returns true if `key` has made fewer than `max` calls in the last `windowMs`. */
export function allow(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (HITS.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    HITS.set(key, list);
    return false;
  }
  list.push(now);
  HITS.set(key, list);
  if (HITS.size > 5000) HITS.clear();
  return true;
}
