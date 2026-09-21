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
| `POST /api/checkout/start` | Validate, hold the booth, open a PayPal order, return `{ checkoutId, url }` |
| `GET /api/checkout/return` | PayPal's return/cancel target: captures, fulfils, redirects back to the page |
| `POST /api/webhooks/paypal` | `PAYMENT.CAPTURE.COMPLETED` fulfils; denials release the hold |
| `POST /api/webhooks/expofp` | Inbound sync; verifies HMAC and de-duplicates the assigned/reserved pair |
| `GET /api/cron/release-holds` | Every 10 minutes: puts abandoned booths back on sale |

## Before it can run

**`lib/expofp-endpoints.js` is unfinished on purpose.** The ExpoFP JSON API
reference is behind an account login, so the routes and field names were not
verifiable when this was written. Fetch your copy:

```bash
curl -H "X-API-Token: <your token>" \
  https://app.expofp.com/api-docs/json-api-v1.yaml -o expofp-api.yaml
```

Then fill in `EXPOFP_PATH_*`, `EXPOFP_FIELD_*` and `EXPOFP_RESPONSE_EXHIBITOR_ID`.
Any operation whose path is still blank throws a descriptive error rather than
calling a guessed URL — except the booth hold, which logs a warning and lets the
sale continue (see the race-condition note below).

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
5. Register the ExpoFP webhook at `https://<deployment>/api/webhooks/expofp`
   with a secret, and put that secret in `EXPOFP_WEBHOOK_SECRET`.
6. In the theme editor, set the Booth Checkout section's **API base URL** to
   `https://<deployment>/api`.

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
payment the booth is on sale to everyone. `checkout/start` calls
`setBoothOnHold(...)` first for that reason. If `EXPOFP_PATH_SET_BOOTH_STATUS`
is blank the sale still goes through, but two people can buy the same booth —
fill that path in before taking real money.

**The webhook pair.** One booth assignment produces two ExpoFP deliveries,
`booth_assigned` then `booth_reserved`, carrying identical values. Booth events
use PascalCase (`Type`, `BoothId`), exhibitor events camelCase (`type`,
`exhibitorId`). Both are handled in `lib/expofp.js` and `api/webhooks/expofp.js`.

The de-duplication window is per-instance memory, which is enough for a pair
that arrives milliseconds apart but is not a distributed lock. If you start
acting on these events rather than logging them, move the de-duplication into KV.
