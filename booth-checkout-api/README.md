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
| `GET /api/gateway/keys` | Whether payment keys are saved, and a hint (`sk_live_****4242`) — never a key |
| `POST /api/gateway/keys` | Saves the client's keys from the storefront setup section; needs `SETUP_PASSCODE` when one is set |
| `DELETE /api/gateway/keys` | Forgets the saved keys so the setup section reappears; needs the `CRON_SECRET` bearer |
| `GET /api/extras` | The add-on catalogue the checkout page offers (ids, names, prices) |
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
| `500 gateway_keys_unreadable` | `SECRETS_KEY` is not the value the saved keys were encrypted with | Restore that value, or have the client save the keys again in the setup section |
| `401 passcode_wrong` from the setup form | Wrong setup code | It is `SETUP_PASSCODE` on this deployment; `/api/health` → `gateway.setupPasscode` says whether one is set. The form reveals the code field after the first refusal, so a code switched on later needs no theme change |
| `429 too_many_attempts` | Ten wrong codes from that address within an hour | Wait an hour, or save from another connection |

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
| list extras | `/api/v1/list-extras` | `{ token, eventId }` → `{ extras, boothExtras }` — confirmed; **two** arrays: `extras` are bought once per company, `boothExtras` per booth (Power Plugs is one). Either `id` is an `extraId` |
| exhibitor's extras | `/api/v1/list-exhibitor-extras` | `{ token, exhibitorId }` → one array of both kinds — confirmed; a booth extra carries `booths`, an exhibitor extra does not |
| add extra | `/api/v1/add-exhibitor-extra` | `{ token, exhibitorId, extraId, quantity }` — confirmed, all three numeric. Quantity **adds** to what they hold, so what they hold is read first; over `limitPerExhibitor` is refused |

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

1. Create a Vercel project from this repository (Root Directory: the repo root).
2. **Connect an Upstash Redis store — required.** Vercel → project → Storage →
   Create Database → Upstash for Redis (Marketplace; the free plan is enough),
   connected to Production and Preview. It injects `KV_REST_API_URL` /
   `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`;
   either pair works. (Vercel KV itself is deprecated.) Every `/api` file is a
   separate function with its own memory, so without Redis the return page and
   webhooks can never find a checkout: `checkout/start` refuses with
   `503 storage_not_configured` rather than take money it cannot follow up.
   `/api/health` shows `"storage": "redis"` once it is connected.
3. Copy `.env.example` into the project's environment variables and fill it in.
   `SECRETS_KEY` (`openssl rand -base64 32`) is what lets the client save their
   own payment keys from the storefront; `SETUP_PASSCODE` is optional and
   decides whether saving takes a code — see "Payment keys".
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
7. Set the same address on the **Payment Gateway Setup** section. Their key is
   encrypted the moment it arrives and cannot be read back, by them or by us;
   `/api/health` only ever shows a hint. If `SETUP_PASSCODE` is set, give the
   client that code privately — the form asks for it in the last field.

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
   - Upstash QStash schedules — same account as the Redis store.

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
   Setup section, as saved by `POST /api/gateway/keys`;
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

## Add-ons

`lib/extras.js` holds the catalogue — by default one entry, **Power Plugs at
$20**. Replace it with `BOOTH_EXTRAS`, a JSON array of
`{ id, name, price, description }` (add `expofpName` when ExpoFP spells the
extra differently). The checkout page reads `/api/extras` rather than carrying
its own list, so a price is set in one place and what the page shows is what
gets charged.

The page sends **ids only**; prices come from the catalogue here, the same way
the booth price comes from ExpoFP. An unknown id is dropped, not charged.
Stripe gets one line per thing bought, so the receipt itemises booth and
add-ons; PayPal takes a single amount and names the add-ons in the description.

Putting the add-ons onto the ExpoFP exhibitor record is **off by default**:
`add-exhibitor-extra`'s request body is the one this service has not seen, and
ExpoFP only accepts extras that already exist on the expo. Set
`EXPOFP_ASSIGN_EXTRAS=1` once both are settled. Either way, what was bought is
written into the exhibitor's `adminNotes`, and a failure there never fails a
fulfilment.

### Which booths an add-on fits

Power Plugs only reaches the tables with wall space: **2, 3, 4, 5, 30, 31, 32**
(`POWER_PLUGS_BOOTHS`, or `booths` on a `BOOTH_EXTRAS` entry; no list means
every booth). The limit is enforced in two places for two different reasons:
`GET /api/extras?booth=5` decides what the checkout page shows, and
`checkout/start` re-checks against the booth ExpoFP confirmed, so a request
that asks for Power Plugs on booth 7 gets the booth and no add-on rather than
a $20 line nobody can install.

### Add-ons on the floor plan

The catalogue in `lib/extras.js` is ours (the page sends ids, never prices);
ExpoFP needs a numeric `extraId`, which `assignExtras` resolves from
`list-extras` by name, or from `expofpExtraId` in `BOOTH_EXTRAS`. On expo
36986 "Power Plugs" is a **booth extra**, id `17477`, $20.

An add-on that the expo does not offer is still charged and written into the
exhibitor's admin notes — it simply is not assigned, and the booth sale goes
through either way. `EXPOFP_ASSIGN_EXTRAS=0` turns assignment off entirely.

## Confirmation emails

Once the booth is assigned and its hold cleared, two emails go out through
Resend (`lib/email.js`, one POST each to `https://api.resend.com/emails` - no
SDK):

- **The buyer's receipt** - the booth, its type and size, every add-on, the
  total, the payment reference and the order id, with a button to the floor
  plan.
- **The organiser's notice** (`ORGANISER_EMAIL`) - written for whoever runs the
  event, not a copy of the buyer's letter: it leads with the booth and the
  company, and carries the buyer's email and phone, the gateway, the payment
  and transaction references and the ExpoFP exhibitor id. Its reply-to is the
  buyer, so answering it reaches the exhibitor.

- **Only after the sale is real.** It is sent at the end of `fulfil()`, so an
  email never promises a booth that failed to land on the floor plan.
- **Once each, tracked apart.** The record keeps `emailedAt` and
  `organiserEmailedAt`, and each request carries its own
  `Idempotency-Key` (`receipt-<id>` / `organiser-<id>`), which Resend honours
  for 24 hours. The gateway's return page and its webhook cannot both mail
  anyone, and a notice that failed is retried without re-sending a receipt that
  went through.
- **Never fatal.** No key, or nobody to send to, is recorded (`emailSkipped` /
  `organiserEmailSkipped`) and the sale stands - an order without a buyer's
  address still notifies the organiser. A 5xx or timeout goes on the same retry
  queue as the ExpoFP writes; the retry sends only what is still owed. A 4xx
  (bad key, unverified sender domain) is recorded rather than retried for ever -
  `/api/health` → `receipts` says which variables are missing.

Set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain verified in Resend);
`ORGANISER_EMAIL`, `EMAIL_REPLY_TO`, `EMAIL_BCC`, `SHOP_NAME` and
`FLOOR_PLAN_URL` are optional.

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
- Clearing the booth's hold is the last step, **after** the assignment: until
  then the hold is what keeps the booth off the market, but left on it also
  makes an assigned booth read as On Hold instead of Reserved on the floor
  plan. If that call fails the sale still stands and the retry queue comes back
  for just that flag.

**Late PayPal approvals.** The booth hold lasts `HOLD_MINUTES`, but PayPal keeps
an order approvable for hours. Nothing is charged until this service captures,
so a buyer who approves after the hold ran out gets the booth re-checked first:
still free, it is held again and captured; taken, the order is not captured
and the page shows `status=unavailable`. (Stripe cannot hit this: its session
expires before the hold does.)

## Payment keys

Credentials come from the environment first (`STRIPE_SECRET_KEY`, or
`PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET`), and otherwise from what the
client saved through the storefront's Payment Gateway Setup section. That
section posts to `/api/gateway/keys` here — it is the only way in:

- **Encrypted at rest.** `lib/secrets.js` encrypts the keys with AES-256-GCM
  under `SECRETS_KEY` before `lib/store.js` writes them to Redis. The key lives
  on Vercel and the ciphertext lives in Redis, so neither on its own is enough;
  a database dump reads as noise, and altered ciphertext fails to decrypt
  rather than returning something wrong.
- **Write-only.** No endpoint returns a key. `GET /api/gateway/keys` answers
  `{ configured, gateway, hint, savedAt }`, where the hint is
  `sk_live_****4242` — enough for the form to know a key is there, never enough
  to use. `/api/health` shows the same hint. Nothing logs a key.
- **The passcode, if you want one.** With `SETUP_PASSCODE` set, `POST` needs it
  (compared in constant time) and the form asks the client for it — that is what
  stops a stranger who finds the endpoint from redirecting the client's payments
  to their own Stripe account. Ten wrong tries an hour from one address and that
  address is refused. Leave it unset and the form saves with no code: `GET`
  answers `passcodeRequired: false`, the field hides itself, and the endpoint is
  open to whoever reads the storefront's page source. Turning it on or off is one
  environment variable — the theme needs no change either way.
- **No keys without Redis.** On Vercel, a `POST` without a Redis store is
  refused (`storage_not_configured`) rather than accepting a key it would lose.

Once keys are saved, the storefront section hides itself (`hide_when_configured`),
so handing the shop to someone else means forgetting them first:

```
curl -X DELETE -H "Authorization: Bearer $CRON_SECRET"   https://<deployment>/api/gateway/keys
```

The section comes back on the next page load — the browser flag it keeps is
cleared as soon as `GET` answers `configured: false`.

Rotating `SECRETS_KEY` makes the saved keys unreadable: checkout then fails
with `gateway_keys_unreadable`, and the client has to paste the keys again.
Setting the environment variables instead keeps everything in Vercel's own
secret storage, and the section can stay in place for the first collection.

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
