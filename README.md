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

- **Customer payments.** Orders are paid from your Duffel balance (`payments: [{ type: "balance" }]`). The card form in `components/checkout/Payment.tsx` only checks the card in the browser and never sends card data to the server. Before taking real bookings, replace it with your gateway's hosted card fields (for example Stripe, Checkout.com, Network International or Duffel Payments). Charge the customer first, then call `/api/orders`.
- **Safety switch.** With a `duffel_live_…` token, bookings are blocked until you set `ALLOW_LIVE_BOOKINGS=true`.
- **Currency.** Duffel prices come in your account's currency. Non-AED prices are converted for display using `FX_RATES_TO_AED`, and the supplier is always paid the exact original amount. Use a live FX feed in production, or ask Duffel to bill in AED.
- **Your margin.** `SERVICE_FEE_AED` adds a per-booking fee to the displayed total, which you collect through your gateway.
- **Emails.** Hook a provider (Resend, SES, SendGrid) into `app/api/orders/route.ts` after a successful order.
- **Booking lookup.** `/booking/[orderId]` shows any order by ID. Add a check against email or last name before exposing it publicly.

## Deploy

Push to GitHub and import into Vercel (or run `npm run build && npm start` on any Node 20+ host). Add the environment variables in the host's settings. Search can take 20–25 s on some routes, so allow at least 60 s for API functions (`maxDuration` is already set).

## Project map

```
app/
  page.tsx                       Home + search widget
  flights/page.tsx               Results (filters, sorting, fare families)
  flights/checkout/[offerId]/    Travellers → Seats → Extras → Payment
  booking/[orderId]/             Confirmation / itinerary
  manage/                        Find a booking
  api/places | search | offers/[id] | offers/[id]/seats | orders | orders/[id]
lib/
  providers/duffel.ts            Duffel API integration (server-only)
  providers/demo.ts              Demo data provider
  types.ts                       Shared, provider-agnostic types
  group.ts                       Grouping fares by itinerary, sort & filters
components/                      UI (search, results, checkout, flight views)
```

Every supplier call runs on the server, so the Duffel token never reaches the browser. Prices for seats and bags are re-checked against Duffel when the order is created and are never trusted from the browser.
