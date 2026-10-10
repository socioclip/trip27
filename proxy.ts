import { NextResponse, type NextRequest } from "next/server";

// admin.<domain> (e.g. admin.trip27.me) opens the back office at its root.
// The same page is also at /admin on every domain.
export function proxy(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (host.startsWith("admin.")) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
