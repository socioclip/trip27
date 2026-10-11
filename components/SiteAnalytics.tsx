"use client";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

// Vercel Web Analytics (visitors and page views), privacy-trimmed:
// - the back office (admin.* and /admin) isn't counted;
// - long booking and fare IDs in URLs are replaced with a placeholder, so
//   signed tokens never leave the browser and pages group cleanly;
// - query strings are dropped (they hold search details and sign-in tokens).
function trim(event: BeforeSendEvent): BeforeSendEvent | null {
  let url: URL;
  try {
    url = new URL(event.url);
  } catch {
    return event;
  }
  if (url.hostname.startsWith("admin.") || url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return null;
  url.pathname = url.pathname
    .replace(/^\/booking\/[^/]+/, "/booking/[orderId]")
    .replace(/^\/flights\/checkout\/[^/]+/, "/flights/checkout/[offerId]");
  // Keep only UTM tags, which Analytics reports on; drop everything else.
  const keep = new URLSearchParams();
  url.searchParams.forEach((v, k) => {
    if (k.startsWith("utm_")) keep.set(k, v);
  });
  url.search = keep.toString();
  url.hash = "";
  return { ...event, url: url.toString() };
}

export default function SiteAnalytics() {
  return <Analytics beforeSend={trim} />;
}
