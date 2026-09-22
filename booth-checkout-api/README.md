# Booth Checkout API

Takes over from the ExpoFP floor plan at the moment a visitor clicks Reserve/Buy,
collects the money through PayPal, then writes the exhibitor and the booth back
onto the floor plan.

## Why this exists

When ExpoFP is set to send the visitor to a page on your website, it hands over
the booth on the query string and stops being involved. **No reservation is
created and the booth still reads Available.** Everything after the click is
ours: holding the booth, taking payment, and pushing the result back through the
ExpoFP JSON API.

## Flow

```
floor plan --click Reserve/Buy--> /pages/booth-checkout (SHOPLINE theme)
                                         |
                                         v
                               POST /api/checkout/start
                                 - hold the booth on ExpoFP
                                 - create a PayPal order
                                 - return the approval URL
                                         |
                                         v
                                  PayPal approval
                                         |
                    +--------------------+--------------------+
                    v                                         v
        GET /api/checkout/return                  POST /api/webhooks/paypal
         (buyer came back)                         (buyer closed the tab)
                    |                                         |
                    +--------------------+--------------------+
                                         v
                                 capture + fulfil()
                                 - Add Exhibitor  -> exhibitorId
                                 - Add Exhibitor Booth
                                 - drop the hold
```

Both paths call the same `fulfil()`, which takes a claim first, so the booth is
written to ExpoFP exactly once no matter which arrives first or how often
PayPal retries.

## Endpoints

| Route | Purpose |
| --- | --- |
| `POST /api/checkout/start` | Validate, hold the booth, open a PayPal order or Stripe Checkout Session, return `{ checkoutId, gateway, url }` |
| `GET /api/checkout/return` | Return/cancel target for both gateways: settles, fulfils, redirects back to the page |
| `POST /api/webhooks/paypal` | `PAYMENT.CAPTURE.COMPLETED` fulfils; denials release the hold — both only after PayPal's API confirms |
| `POST /api/webhooks/stripe` | `checkout.session.completed` / `async_payment_succeeded` fulfil; `expired` / `async_payment_failed` release — both only after Stripe's API confirms |
| `POST /api/webhooks/expofp` | Inbound sync; verifies HMAC and de-duplicates the assigned/reserved pair |
| `GET/POST /api/cron/release-holds` | Releases expired holds and retries failed fulfilments (see "Releasing holds", "Retrying") |
| `GET /api/health` | Configuration report — what is set, never the values; `?deep=1` (cron secret) proves the ExpoFP token |

## Troubleshooting

The checkout page shows one generic message ("We could not start the
payment"). The cause is in the API response and the browser console — DevTools
→ Console shows e.g. `booth_check_failed missing_env:EXPOFP_API_TOKEN` — and
`https://<deployment>/api/health` lists what is missing.

| Response | Meaning | Fix |
| --- | --- | --- |
| `503 booth_check_failed`, `missing_env:EXPOFP_*` | That variable is not set **on this deployment** | Add it in Vercel → Settings → Environment Variables for **Production**, then **redeploy** — env changes only reach new deployments |
| `503 booth_check_failed`, `expofp_http_401` / `403` | ExpoFP refused the token | Copy the token again from app.expofp.com/profile |
| `503 booth_check_failed`, `expofp_unreachable` | ExpoFP did not answer | Retry; check status of app.expofp.com |
| `400 booth_unknown` | The booth name from the link is not in `EXPOFP_EXPO_ID`'s expo | Wrong expo id, or the booth parameter name on the checkout section is wrong (see its debug panel) |
| `409 booth_unavailable` | On hold, sold, or someone else is checking out | Working as intended |
| `500 gateway_*` / `stripe_*` | Payment keys missing or of the wrong kind | See `/api/health` → `gateway.problem` |

To prove the ExpoFP token and expo from the deployment itself:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "https://<deployment>/api/health?deep=1"
```

## Before it can run

**Every ExpoFP call is built in, with its documented body.** Taken from the
ExpoFP JSON API reference (`app.expofp.com/api-docs/json-api-v1`, behind a
login), every call is a POST with `token` in the JSON body (also sent as the
`X-API-Token` header, as the reference's own examples do). Nothing needs
configuring beyond `EXPOFP_API_TOKEN` and `EXPOFP_EXPO_ID`:

| Operation | Route (default) | Body |
| --- | --- | --- |
| get booth | `/api/v1/get-booth` | `{ token, eventId, name }` — confirmed |
| hold / release | `/api/v1/update-booth` | `{ token, eventId, name, isOnHold }` — confirmed |
| list booths | `/api/v1/list-booths` | `{ token, expoId }` — confirmed (note `expoId`, not `eventId`) |
| add exhibitor | `/api/v1/add-exhibitor` | `{ token, eventId, name, externalId, contactName, contactPhone, privateEmail, website, adminNotes }` → `{ id }` — confirmed |
| find exhibitor | `/api/v1/get-exhibitor-id` | `{ token, eventId, externalId }` → `{ id }` — confirmed |
| assign booth | `/api/v1/add-exhibitor-booth` | `{ token, eventId, boothName, exhibitorId }` — confirmed; `exhibitorId` **as a string**; 200 empty or 200 `Already added` |
| add extra | `/api/v1/add-exhibitor-extra` | not yet seen; not used by the checkout |

`name` on the booth calls is the booth key as drawn on the floor plan. The new
exhibitor gets `externalId` = the checkout id (so one exhibitor per purchase),
the contact's email in `privateEmail` (never shown to visitors), and an
`adminNotes` line with booth, amount, gateway, payment reference and contact.
A duplicate `externalId` means an earlier attempt already created it; that
exhibitor is found with `get-exhibitor-id` and reused.

Assigning is idempotent on ExpoFP's side (`Already added` is a 200), and if an
assignment fails anyway — ExpoFP down, a 404 — the checkout is
`fulfilment_failed`, ExpoFP's error body is saved on the record and logged, and
the retry queue picks it up. See "Retrying".

`eventId` / `expoId` are sent as JSON numbers (int32 in the reference); booth
keys go exactly as given; `exhibitorId` on add-exhibitor-booth goes as a
string, which the reference asks for.

If ExpoFP ever changes its API, `node scripts/inspect-expofp-api.mjs` downloads
the current OpenAPI document with your token (header only, never printed) and
lists the operations and body fields to compare against. Routes can be
overridden with `EXPOFP_PATH_*` without a code change.

**The price is ExpoFP's, never the link's.** The hand-over link carries the
price on the query string, where anyone can edit it. `checkout/start` reads the
booth with `get-booth` and charges that price; a different price on the link is
only logged. The same call refuses booths that are on hold, already have an
exhibitor, or are a special section (409 `booth_unavailable`), and unknown
booths (400 `booth_unknown`). If ExpoFP cannot be reached it answers 503 rather
than fall back to the editable price.

## Deploying

1. Create a Vercel project with **Root Directory** set to `booth-checkout-api`.
   The rest of this repository is a SHOPLINE theme and must not be part of the
   build; likewise, exclude this folder from theme uploads.
2. Add a **KV store** to the project. Without it, holds and idempotency fall
   back to process memory and will not survive between invocations.
3. Copy `.env.example` into the project's environment variables and fill it in.
4. Register the PayPal webhook at `https://<deployment>/api/webhooks/paypal`
   for `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED` and
   `CHECKOUT.ORDER.VOIDED`, then put its id in `PAYPAL_WEBHOOK_ID`.
5. Register the ExpoFP webhook at `https://<production-domain>/api/webhooks/expofp`
   on your ExpoFP profile page, generate a secret there (shown once — copy it
   straight away), put it in `EXPOFP_WEBHOOK_SECRET`, redeploy, then press
   **Test webhook**. Use the production domain, not a per-deployment preview
   URL: previews sit behind Vercel Deployment Protection and answer 401 before
   the function runs.
6. In the theme editor, set the Booth Checkout section's **API base URL** to
   `https://<deployment>/api`.

## Releasing holds

A booth held for a visitor who walks away has to be put back on sale, and
nothing on ExpoFP's side does that for us. Three triggers share the job:

1. **Every checkout.** `POST /api/checkout/start` sweeps up to 5 expired holds
   before it takes its own. While people are buying, abandoned booths come back
   within one checkout of expiring. The sweep runs *before* the new hold, never
   after, so it cannot release the booth it is about to hold.
2. **Vercel Cron, daily** (`0 10 * * *`, about 3 AM Pacific). This is the most
   the **Hobby plan** allows — a more frequent schedule is rejected at deploy
   with "Hobby accounts are limited to daily cron jobs". It is the backstop for
   quiet days.
3. **Optional: an external scheduler** for a tighter cadence without Pro. Point
   any of these at `https://<deployment>/api/cron/release-holds` every 5-10
   minutes, sending `Authorization: Bearer <CRON_SECRET>`:
   - [cron-job.org](https://cron-job.org) — free, set the header in "Advanced";
   - Upstash QStash schedules — same account as the KV store.

   On the Pro plan, change `vercel.json` to `*/10 * * * *` instead.

All three may overlap. `releaseHold()` only acts for the caller that removes the
hold from the schedule, and that removal is a single atomic `ZREM`, so a booth
is released on ExpoFP at most once.

Without (3), on a quiet day an abandoned booth can read On Hold on the floor
plan for up to a day. With `HOLD_MINUTES=30` and a 10-minute scheduler, it is
back on sale within 40 minutes.

## Choosing the gateway

PayPal and Stripe are both supported. `activeGateway()` in `lib/config.js`
picks one for each new checkout, and the choice is stored on the checkout
record, so the return page and webhooks always talk to the right provider:

1. `PAYMENT_GATEWAY=stripe|paypal`, when set;
2. otherwise what the client last chose in the storefront's Payment Gateway
   Setup section (newest usable record at `GATEWAY_KEYS_URL`);
3. otherwise whichever has credentials in the environment, PayPal first.

### Stripe specifics

- Needs the **secret** key (`sk_test_…` / `sk_live_…`) or a restricted key
  (`rk_…`). A publishable key (`pk_…`) is rejected with a clear error before
  the booth is held; the storefront section also refuses it before saving.
- The Checkout Session expires 30 minutes out (Stripe's minimum;
  `HOLD_MINUTES` if longer). The booth hold ends 2 minutes *after* that, so no
  payment can land on a booth that was already released.
- Cancelling expires the session before releasing the booth, so the buyer
  cannot press Back and pay for a booth someone else is now holding.
- Webhook: Stripe Dashboard → Developers → Webhooks → endpoint
  `https://<production-domain>/api/webhooks/stripe` with the four
  `checkout.session.*` events above; put its signing secret in
  `STRIPE_WEBHOOK_SECRET`. Signature checking is verified against the official
  `stripe` library in both directions, and rejects deliveries older than
  5 minutes (Stripe's timestamp is signed, so this is real replay protection).

Every path that fulfils or releases re-reads the session / order from the
gateway's API first. A webhook payload — signed or not — is never enough on
its own to hand out or free a booth.

## Retrying

A paid checkout whose ExpoFP write fails is not lost:

- The moment payment is confirmed the booth leaves the release schedule, and
  its ExpoFP hold stays on. A paid booth never goes back on sale while its
  assignment is pending.
- The failure is queued in KV and retried after 1, 5 and 15 minutes, then 1, 3,
  6 and 12 hours, then daily — 12 attempts in all. After that it is logged
  as `GIVING UP ... assign it by hand in ExpoFP`.
- Retries run from `/api/cron/release-holds` (daily Vercel cron, plus any
  external scheduler). After fixing whatever made them fail, call
  `/api/cron/release-holds?retry=all` with the `CRON_SECRET` bearer to retry
  every queued checkout at once instead of waiting out the backoff.
- The exhibitor id is saved as soon as it exists, so a retry only redoes the
  step that failed.

**Late PayPal approvals.** The booth hold lasts `HOLD_MINUTES`, but PayPal keeps
an order approvable for hours. Nothing is charged until this service captures,
so a buyer who approves after the hold ran out gets the booth re-checked first:
still free, it is held again and captured; taken, the order is not captured
and the page shows `status=unavailable`. (Stripe cannot hit this: its session
expires before the hold does.)

## Payment keys

`lib/config.js` resolves PayPal credentials in this order:

1. `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` from the environment;
2. otherwise the newest PayPal record at `GATEWAY_KEYS_URL` — the keys the
   client submits through the storefront's Payment Gateway Setup section.

Option 2 is what keeps that section useful, but note what it means: the client's
PayPal secret sits in a store that anyone with the URL can read, and the
storefront posts it straight from the browser. Setting the two environment
variables switches to real secret storage without changing any code, and the
setup section can stay in place for collecting the keys the first time.

## Two things that will bite

**The race.** ExpoFP creates no reservation, so between the click and the
payment the booth is on sale to everyone. `checkout/start` therefore checks
the booth, takes a per-booth claim in KV (`SET NX`, so two buyers pressing Pay
together cannot both pass), and holds it on ExpoFP with `update-booth
isOnHold: true`. The claim and the hold are released on cancel, expiry or
payment failure. Purchases that bypass this service — say, made inside ExpoFP
itself — are only caught by the `get-booth` check, not by the claim.

**Webhook signatures.** `api/webhooks/expofp.js` follows ExpoFP's
receiving-webhooks order: read raw bytes, verify HMAC-SHA256 over those bytes
in constant time, reject on mismatch *and* on absence, parse only afterwards,
de-duplicate on `X-ExpoFP-Delivery`. `EXPOFP_WEBHOOK_SECRET` takes a
comma-separated list so a rotation costs no failed deliveries. The
implementation is checked against ExpoFP's published offline test vector.

**The webhook pair.** One booth assignment produces two ExpoFP deliveries,
`booth_assigned` then `booth_reserved`, carrying identical values. Booth events
use PascalCase (`Type`, `BoothId`), exhibitor events camelCase (`type`,
`exhibitorId`). Both are handled in `lib/expofp.js` and `api/webhooks/expofp.js`.

Only the follow-up is dropped: a `booth_assigned` is remembered in KV for two
minutes, and a `booth_reserved` with the same expo/booth/exhibitor values
consumes that record (an atomic `DEL`) and is skipped. A `booth_reserved` with
no matching assignment — a reservation made inside ExpoFP, or the Test webhook
button — is always handled, however many times it arrives. `booth_assigned`
itself is never skipped.

Webhook URLs are set **per expo** (the JSON API reference says so, and has a
`set-webhook-url` call), while the signing secret belongs to the account. Make
sure the URL is set on the expo in `EXPOFP_EXPO_ID`. The handler only logs
today; filter on `expoId` before acting on events all the same.
