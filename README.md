# trip27 — flight booking site

A flights-only booking site (search → results & filters → fare options → travellers → seats → baggage → payment → confirmation), built with Next.js 16, React 19, Tailwind CSS 4 and the [Duffel](https://duffel.com) flights API. English, prices in AED.

## Run it

```bash
npm install
cp .env.example .env.local   # then edit
npm run dev                  # http://localhost:3000
```

With no `DUFFEL_ACCESS_TOKEN`, the site runs in **demo mode** on built-in sample flights (about 80 airports), so you can click through the full flow straight away.

## Connect real flights (Duffel)

1. Create an account at duffel.com, then go to **Developers → Access tokens** and create a **test** token (`duffel_test_…`).
2. Put it in `.env.local` as `DUFFEL_ACCESS_TOKEN=duffel_test_…` and restart.
3. Search any route. Test mode returns real schedules plus the "Duffel Airways" (ZZ) test airline, which supports seat maps and extra bags. Test orders are not ticketed.

Before going live:

- **Customer payments.** With the `CKO_*` variables set, customers pay by card through Checkout.com Flow (card data never touches this server). The flow is: `/api/payments/session` prices the booking on the server and opens a payment session (authorise only) → the customer pays in Flow → `/api/payments/complete` checks the authorised amount, books with the airline, then captures. If the airline booking fails the payment is voided, so the customer is never charged for a failed booking. Airlines are paid from your Duffel balance. Without `CKO_*` the checkout shows a demo card form that charges nothing.
- **Safety switch.** With a `duffel_live_…` token, bookings are blocked until you set `ALLOW_LIVE_BOOKINGS=true`.
- **Currency.** Duffel prices come in your account's currency. Non-AED prices are converted for display using `FX_RATES_TO_AED`, and the supplier is always paid the exact original amount. Use a live FX feed in production, or ask Duffel to bill in AED.
- **Your margin.** `SERVICE_FEE_AED` adds a per-booking fee to the displayed total, which you collect through your gateway.
- **Emails.** Booking confirmations are sent through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set (see `lib/email.ts`). To email any customer, verify your own domain in Resend. A failed email never fails the booking.
- **Customer accounts.** Customers sign in at `/login` with their email: they get an 8-character code (and a one-click link) by email, with no password and no database. A signed, httpOnly session cookie lasts 30 days. **My bookings** (`/account/bookings`) lists every order whose contact email matches, upcoming first. New orders store the email in Duffel order metadata (`contact_email`). Older orders are matched by passenger email. Set `AUTH_SECRET` in production, and verify your sending domain in Resend so codes reach every customer. Without email configured, the demo site shows the code on screen.
- **Booking lookup.** `/booking/[orderId]` shows any order by ID. Add a check against email or last name before exposing it publicly.

## Second flight source: Jinko

[Jinko](https://gojinko.com) fares can appear next to Duffel's. Add `JINKO_API_KEY_SANDBOX` and/or `JINKO_API_KEY_PROD` (keys from dashboard.gojinko.com), then choose which one runs on the admin page (below). Search runs every enabled supplier in parallel and merges the results; if one fails or times out, the others' fares still show.

How Jinko fares differ:

- **Jinko takes the payment.** After the travellers step, trip27 creates the Jinko trip, Jinko prices it, and its secure payment page (Stripe) opens in a new tab. The customer pays Jinko directly, in `JINKO_CURRENCY` (USD by default). The AED price is an estimate, and `SERVICE_FEE_AED` doesn't apply, because trip27 never handles that money. Your earnings depend on Jinko commissions, which you arrange with Jinko.
- **Booking status is polled.** Jinko's checkout has no return URL, so the trip27 tab goes to `/booking/jnkb_…`, which checks the trip every 5 seconds: awaiting payment → issuing ticket → confirmed (with the airline PNR) or not completed. Jinko emails the e-ticket confirmation.
- **No seats or extra bags yet**, and one-way and round trips only (Jinko doesn't search multi-city). Jinko does support ancillaries; they're a possible next step.
- **No database.** Jinko doesn't echo flight details back after booking, so the fare is kept as a signed, compressed snapshot inside the offer and order IDs (`jnko_…`, `jnkb_<trip>~…`), including which Jinko environment it came from. Set `AUTH_SECRET` in production: changing it invalidates those links.
- **Not in My bookings.** Jinko can't list trips by email; customers use the booking link or Jinko's email.
- **Live safety.** Real Jinko bookings need Jinko Production switched on in the admin page *and* `ALLOW_LIVE_BOOKINGS=true`.

In the sandbox, Jinko's test airline is Jinko Test Air (ZZ). Some ZZ flights simulate price changes, sell-outs and ticketing failures (see docs.gojinko.com/guides/testing-in-sandbox).

## Supplier switches (admin)

The back office at **/admin** (and at the root of **admin.<your domain>**, e.g. admin.trip27.me) switches suppliers on and off at runtime: Duffel on/off, and Jinko Off / Sandbox / Production (one Jinko environment at a time, so test and live fares never mix). Changes apply within seconds, with no redeploy. Keys stay in environment variables; the page only switches suppliers.

Setup, once:

1. **Global Config** (formerly Edge Config). In Vercel, Storage → Create → Global Config, then connect it to this project. That adds `GLOBAL_CONFIG`.
2. **Write access.** Create a Vercel access token (Account Settings → Tokens) with access to that store and add it as `VERCEL_API_TOKEN` (plus `VERCEL_TEAM_ID` if the store belongs to a team).
3. **Admins.** Add `ADMIN_EMAILS` (comma-separated). Admins sign in with the normal email code.
4. **Subdomain (optional).** Add `admin.trip27.me` under the project's Domains and create the DNS record Vercel shows.
5. Redeploy.

Without Global Config the page is read-only and the site runs with defaults: Duffel and Jinko Sandbox on if their keys are set, Jinko Production off. A supplier without a key can't be switched on. Bookings already in progress keep using the supplier and Jinko environment they started with, even if an admin switches suppliers meanwhile.

## Chat assistant ("Ask trip27")

A chat button on every page (except checkout, payment, sign-in and admin) lets customers plan a trip in plain words: "cheapest weekend in Tbilisi next month", "non-stop to London, back a week later, 2 adults". The model searches with trip27's own code and shows the best itineraries as cards; the customer books on the usual checkout.

- **Setup.** The chat runs on **Gemini** or **Claude** (`lib/chat/llm.ts`). Add `GEMINI_API_KEY` (Google AI Studio, has a free tier) and/or `ANTHROPIC_API_KEY`, and pick one with `CHAT_PROVIDER=gemini|anthropic` (empty = Gemini if its key is set). `CHAT_MODEL` overrides the model (defaults `gemini-3.8-flash` / `claude-sonnet-5-5`). Without a key the chat button doesn't appear. Note: on Gemini's free tier Google may use prompts to improve its products; switch to a paid tier before real customer traffic.
- **Same results as search.** The assistant's tools (`lib/chat/tools.ts`) call `searchAll`, `getOffer` and the grouping/filter code the results page uses, so the admin supplier switches, AED pricing and `SERVICE_FEE_AED` all apply, and Duffel and Jinko fares show side by side.
- **It never books or takes payment.** Tools: `find_airports`, `search_flights`, `get_fare_details` (re-prices a fare and reads its rules) and `start_checkout`, which only shows a button to `/flights/checkout/[offerId]`. Payment stays in Checkout.com Flow (or Jinko's page for Jinko fares). The assistant is told never to ask for card or passport details.
- **No database.** The browser keeps the conversation in sessionStorage and sends it back with each message; the server (`app/api/chat/route.ts`) re-validates it and streams the reply as NDJSON. Fares are referred to by short refs (F1, F2…) so long supplier IDs stay out of the model's context.
- **Cost controls.** 25 messages per IP per 15 minutes, up to 3 searches and 6 model round trips per message, trimmed history, prompt caching on Claude. Each message costs model usage plus supplier searches (Jinko searches use Jinko credits).
- **Off switch.** /admin has a "Chat assistant" switch (stored with the supplier flags in Global Config), so you can turn it off instantly without a redeploy.
- **Timeouts.** A message that searches can take 20–40 s; `/api/chat` allows 120 s.

## Analytics

Vercel Web Analytics (`@vercel/analytics`) counts visitors and page views; see the project's **Analytics** tab in Vercel. It's added in `components/SiteAnalytics.tsx`, which keeps the back office out of the stats, replaces booking and fare IDs in URLs with placeholders, and drops query strings except UTM tags. Analytics must be enabled for the project in Vercel (Analytics tab → Enable).

## Deploy

Push to GitHub and import into Vercel (or run `npm run build && npm start` on any Node 20+ host). Add the environment variables in the host's settings. Search can take 20–25 s on some routes, so allow at least 60 s for API functions (`maxDuration` is already set).

## Project map

```
app/
  page.tsx                       Home + search widget
  flights/page.tsx               Results (filters, sorting, fare families)
  flights/checkout/[offerId]/    Travellers → Seats → Extras → Payment
  booking/[orderId]/             Confirmation / itinerary
  manage/                        Find a booking by order number
  login/                         Email-code sign-in
  account/bookings/              My bookings (signed-in customers)
  admin/                         Back office: supplier switches
  api/places | search | offers/[id] | offers/[id]/seats | orders | orders/[id]
  api/jinko/checkout             Creates the Jinko trip and returns its payment page
  api/chat                       Chat assistant (Gemini or Claude + trip27 search tools, streaming)
  api/auth/request | verify | link | logout | me
lib/
  auth.ts                        Signed cookies, sign-in codes, session helpers
  providers/duffel.ts            Duffel API integration (server-only)
  providers/jinko.ts             Jinko API integration (search, hosted checkout, status)
  suppliers.ts                   Supplier switches (Global Config) and supplier credentials
  admin.ts                       Admin allowlist (ADMIN_EMAILS)
  chat/                          Chat assistant: model adapters, tools, system prompt, wire format
  providers/demo.ts              Demo data provider
  types.ts                       Shared, provider-agnostic types
  group.ts                       Grouping fares by itinerary, sort & filters
components/                      UI (search, results, checkout, flight views)
```

Every supplier call runs on the server, so the Duffel token never reaches the browser. Prices for seats and bags are re-checked against Duffel when the order is created and are never trusted from the browser.
