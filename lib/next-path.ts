/** Only allow same-site relative paths as post-login destinations. */
export function safeNext(n: string | null | undefined, fallback = "/account/bookings") {
  const s = String(n || "");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : fallback;
}
