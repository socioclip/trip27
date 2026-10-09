import "server-only";
import type { Order } from "./types";

// Booking confirmation emails, sent through Resend (https://resend.com).
// Set RESEND_API_KEY and EMAIL_FROM to enable. Without them, nothing is sent.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function esc(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
function day(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[dt.getUTCDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}
const time = (iso: string) => iso.slice(11, 16);
function dur(min: number) {
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}
function money(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function emailEnabled() {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function confirmationEmail(order: Order, bookingUrl: string) {
  const dest = order.slices[0]?.destination.city || "your destination";
  const roundTrip = order.slices.length === 2 && order.slices[0].origin.code === order.slices[1].destination.code;
  const label = (i: number) => (roundTrip ? ["Outbound", "Return"][i] : order.slices.length > 1 ? `Flight ${i + 1}` : "Flight");

  const slices = order.slices
    .map((s, i) => {
      const segs = s.segments
        .map(
          (g) => `
          <tr><td style="padding:10px 0;border-top:1px solid #eceef6">
            <div style="font-size:15px;font-weight:700;color:#13112b">${time(g.departingAt)} ${esc(g.origin.code)} &rarr; ${time(g.arrivingAt)} ${esc(g.destination.code)}</div>
            <div style="font-size:13px;color:#6b6f86;margin-top:2px">${esc(g.origin.city)} to ${esc(g.destination.city)} &middot; ${esc(g.carrier.name)} ${esc(g.flightNumber)} &middot; ${esc(g.cabin)} &middot; ${dur(g.durationMin)}</div>
          </td></tr>`
        )
        .join("");
      return `
        <tr><td style="padding:18px 0 4px">
          <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5a2fe0">${label(i)} &middot; ${day(s.departingAt)}</div>
          <div style="font-size:13px;color:#6b6f86;margin-top:2px">${esc(s.origin.city)} to ${esc(s.destination.city)} &middot; ${s.stops === 0 ? "Non-stop" : s.stops === 1 ? "1 stop" : `${s.stops} stops`} &middot; ${dur(s.durationMin)}</div>
        </td></tr>${segs}`;
    })
    .join("");

  const travellers = order.passengers.map((p) => `<div style="font-size:14px;color:#13112b">${esc(p.name)}</div>`).join("");
  const extras = order.services.length
    ? order.services.map((s) => `<div style="font-size:14px;color:#13112b">${s.quantity > 1 ? `${s.quantity} &times; ` : ""}${esc(s.label)}</div>`).join("")
    : `<div style="font-size:14px;color:#6b6f86">None</div>`;
  const testNote = order.live
    ? ""
    : `<tr><td style="padding:12px 16px;background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;font-size:13px;color:#78350f">This is a test booking. No ticket was issued and no payment was taken.</td></tr><tr><td style="height:12px"></td></tr>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f5f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e7f0">
  <tr><td style="background:#241260;padding:28px 28px 24px">
    <div style="font-size:22px;font-weight:800;color:#ffffff">trip<span style="color:#ff6a33">27</span></div>
    <div style="font-size:24px;font-weight:800;color:#ffffff;margin-top:18px">You're going to ${esc(dest)}!</div>
    <div style="font-size:14px;color:#cfc3ff;margin-top:4px">Your booking is ${order.status === "confirmed" ? "confirmed" : "received"}.</div>
    <div style="margin-top:18px;display:inline-block;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:10px 16px">
      <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#cfc3ff">Booking reference</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:.18em;color:#ffffff">${esc(order.bookingReference)}</div>
    </div>
  </td></tr>
  <tr><td style="padding:22px 28px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${testNote}${slices}</table>
  </td></tr>
  <tr><td style="padding:10px 28px 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eceef6">
      <tr>
        <td valign="top" style="padding:16px 8px 0 0;width:50%"><div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b6f86;margin-bottom:6px">Travellers</div>${travellers}</td>
        <td valign="top" style="padding:16px 0 0 8px;width:50%"><div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6b6f86;margin-bottom:6px">Extras</div>${extras}</td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:20px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fb;border-radius:12px"><tr>
      <td style="padding:14px 16px;font-size:14px;color:#6b6f86">Total paid</td>
      <td align="right" style="padding:14px 16px;font-size:20px;font-weight:800;color:#3a1d93">${money(order.total.amount, order.total.currency)}</td>
    </tr></table>
  </td></tr>
  <tr><td align="center" style="padding:0 28px 26px">
    <a href="${esc(bookingUrl)}" style="display:inline-block;background:#ff6a33;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">View your booking</a>
    <div style="font-size:12px;color:#6b6f86;margin-top:16px;line-height:1.5">Check in online with ${esc(order.owner.name)} using your booking reference. Please make sure your travel documents are valid for your trip.</div>
  </td></tr>
</table>
<div style="font-size:11px;color:#9a9db2;margin-top:14px">Order ${esc(order.id)} &middot; trip27</div>
</td></tr></table></body></html>`;

  const text = [
    `You're going to ${dest}!`,
    `Booking reference: ${order.bookingReference}`,
    order.live ? "" : "This is a test booking. No ticket was issued and no payment was taken.",
    "",
    ...order.slices.flatMap((s, i) => [
      `${label(i)} - ${day(s.departingAt)}`,
      ...s.segments.map((g) => `  ${time(g.departingAt)} ${g.origin.code} -> ${time(g.arrivingAt)} ${g.destination.code}  ${g.carrier.name} ${g.flightNumber}`),
    ]),
    "",
    `Travellers: ${order.passengers.map((p) => p.name).join(", ")}`,
    `Total paid: ${money(order.total.amount, order.total.currency)}`,
    `View your booking: ${bookingUrl}`,
  ].join("\n");

  return { subject: `Booking confirmed: ${dest} (${order.bookingReference})`, html, text };
}

export async function sendConfirmation(order: Order, to: string, bookingUrl: string): Promise<boolean> {
  if (!emailEnabled() || !to) return false;
  const { subject, html, text } = confirmationEmail(order, bookingUrl);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject,
        html,
        text,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
        ...(process.env.EMAIL_BCC ? { bcc: [process.env.EMAIL_BCC] } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("[email] Resend error", res.status, (await res.text()).slice(0, 500));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] send failed", (e as Error).message);
    return false;
  }
}

/** Sign-in email with a one-time code and a one-click link. */
export async function sendSignInCode(to: string, code: string, link: string): Promise<boolean> {
  if (!emailEnabled() || !to) return false;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e7f0">
  <tr><td style="background:#241260;padding:22px 28px">
    <div style="font-size:22px;font-weight:800;color:#ffffff">trip<span style="color:#ff6a33">27</span></div>
  </td></tr>
  <tr><td style="padding:26px 28px 8px">
    <div style="font-size:20px;font-weight:800;color:#13112b">Your sign-in code</div>
    <div style="font-size:14px;color:#6b6f86;margin-top:6px;line-height:1.5">Enter this code on trip27 to see your bookings. It expires in 10 minutes.</div>
    <div style="margin:20px 0;background:#f3f0ff;border:1px solid #cfc3ff;border-radius:12px;padding:16px;text-align:center;font-size:30px;font-weight:800;letter-spacing:.18em;color:#3a1d93;font-family:ui-monospace,Menlo,Consolas,monospace">${esc(code)}</div>
  </td></tr>
  <tr><td align="center" style="padding:0 28px 26px">
    <a href="${esc(link)}" style="display:inline-block;background:#ff6a33;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">Or sign in with one click</a>
    <div style="font-size:12px;color:#6b6f86;margin-top:16px;line-height:1.5">If you didn't ask to sign in, you can ignore this email. Nobody can get into your account without this code.</div>
  </td></tr>
</table>
</td></tr></table></body></html>`;
  const text = `Your trip27 sign-in code: ${code}\n\nIt expires in 10 minutes. Or sign in with one click: ${link}\n\nIf you didn't ask to sign in, ignore this email.`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject: `${code} is your trip27 sign-in code`, html, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("[email] Resend error (sign-in)", res.status, (await res.text()).slice(0, 500));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] sign-in send failed", (e as Error).message);
    return false;
  }
}
