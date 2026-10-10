import "server-only";
import { getSession } from "./auth";

// Back-office access: signed-in customers whose email is listed in ADMIN_EMAILS
// (comma-separated). With ADMIN_EMAILS empty, nobody can open the admin pages.

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** The signed-in email, and whether it may use the admin pages. */
export async function adminSession(): Promise<{ email: string | null; isAdmin: boolean }> {
  const s = await getSession();
  const email = s?.email?.toLowerCase() || null;
  return { email, isAdmin: !!email && adminEmails().includes(email) };
}

/** Rejects cross-site POSTs: the Origin must match the host the request came to. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") || req.headers.get("host"));
  } catch {
    return false;
  }
}
