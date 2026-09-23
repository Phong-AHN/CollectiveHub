import crypto from 'node:crypto';
import { HttpError, corsHeaders, json, preflight, safeReturnUrl } from '../../lib/http.js';
import { HOLD_MINUTES, activeGateway, paypalCredentials, stripeSecretKey } from '../../lib/config.js';
import { checkBoothForSale, setBoothOnHold } from '../../lib/expofp.js';
import { priceSelectedExtras } from '../../lib/extras.js';
import { sweepExpiredHolds } from '../../lib/fulfil.js';
import { createOrder } from '../../lib/paypal.js';
import { createCheckoutSession } from '../../lib/stripe.js';
import {
  claimBooth, persistentStorageConfigured, putCheckout, releaseBoothClaim, trackHold,
} from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

// Stripe only accepts a Checkout Session expiry 30 minutes to 24 hours out.
const STRIPE_MIN_EXPIRY_S = 30 * 60 + 60;
const STRIPE_MAX_EXPIRY_S = 24 * 60 * 60 - 60;
// The hold outlives the payment window by this much, so a payment made in the
// last second of the window can never land after the booth was released.
const HOLD_GRACE_MS = 2 * 60_000;

async function handler(request) {
  const pre = preflight(request);
  if (pre) return pre;

  const cors = corsHeaders(request);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    // On Vercel each /api file runs in its own function, so a checkout kept in
    // memory here is invisible to the return page and the webhooks: the buyer
    // would pay, the booth would never be assigned, and its hold never
    // released. Refuse before touching the booth or the gateway.
    if (process.env.VERCEL && !persistentStorageConfigured() && !process.env.ALLOW_MEMORY_STORE) {
      const error = new HttpError(503, 'storage_not_configured',
        'No Redis connected: add an Upstash Redis store to the Vercel project and redeploy.');
      error.reason = 'storage_not_configured';
      throw error;
    }

    const body = await request.json();
    const booth = body.booth || {};
    const exhibitor = body.exhibitor || {};

    // The floor plan hands over a booth; without one there is nothing to sell.
    if (!clean(booth.booth) && !clean(booth.boothId)) {
      throw new HttpError(400, 'booth_missing', 'No booth identifier in the request.');
    }

    // The price on the hand-over link is only kept for the log: anyone can
    // edit a query string. What we charge comes from ExpoFP, below.
    const linkPrice = Number(String(booth.price ?? '').replace(/[^0-9.]/g, ''));

    for (const field of ['company', 'contactName', 'email']) {
      if (!clean(exhibitor[field])) {
        throw new HttpError(400, 'exhibitor_incomplete', `Missing ${field}.`);
      }
    }

    // Decide the gateway and check its credentials before touching the booth,
    // so a misconfiguration (say, a Stripe pk_ key) fails fast without
    // leaving a hold behind.
    const gateway = await activeGateway();
    if (gateway === 'stripe') await stripeSecretKey();
    else await paypalCredentials();

    const checkoutId = crypto.randomUUID();
    const currency = clean(booth.currency, 3).toUpperCase() || 'USD';
    const returnPage = safeReturnUrl(body.returnUrl);
    const origin = new URL(request.url).origin;
    const returnBase = `${origin}/api/checkout/return?cid=${checkoutId}`;

    const record = {
      status: 'pending',
      gateway,
      booth: {
        booth: clean(booth.booth),
        boothId: clean(booth.boothId),
        type: clean(booth.type),
        size: clean(booth.size),
        price: null,
        currency,
      },
      exhibitor: {
        company: clean(exhibitor.company),
        contactName: clean(exhibitor.contactName),
        email: clean(exhibitor.email, 254),
        phone: clean(exhibitor.phone, 40),
        website: clean(exhibitor.website, 300),
      },
      source: body.source && typeof body.source === 'object' ? body.source : {},
      returnPage,
      createdAt: Date.now(),
    };

    // Put abandoned booths back on sale before taking a new hold. On the
    // Hobby plan the cron only runs daily, so this is what keeps holds short.
    // It runs first, never after, so it cannot release the hold made below.
    // Capped and never fatal: cleanup must not cost us this sale.
    await sweepExpiredHolds(5).catch((error) => {
      console.error('[checkout/start] sweep failed', error.message);
    });

    // Ask ExpoFP, not the visitor: is the booth still for sale, and for how much?
    let check;
    try {
      check = await checkBoothForSale(record.booth);
    } catch (error) {
      // Without ExpoFP's price the only price left is the editable one on the
      // link - so refuse rather than guess.
      console.error('[checkout/start] booth check failed', error.message, error.payload || '');
      const failure = new HttpError(503, 'booth_check_failed', 'Could not confirm the booth with ExpoFP.');
      // A short cause, never a secret: enough to fix it without reading logs.
      failure.reason = error.envName ? `missing_env:${error.envName}`
        : error.status ? `expofp_http_${error.status}` : 'expofp_unreachable';
      throw failure;
    }
    if (!check.ok) {
      if (check.reason === 'booth_unknown') throw new HttpError(400, 'booth_unknown', 'ExpoFP has no such booth.');
      throw new HttpError(409, 'booth_unavailable', check.reason);
    }
    if (Number.isFinite(linkPrice) && Math.abs(linkPrice - check.price) > 0.005) {
      console.warn('[checkout/start] link price', linkPrice, 'differs from ExpoFP price', check.price,
        'for booth', check.name, '- charging the ExpoFP price');
    }
    record.booth.booth = check.name;
    record.booth.price = check.price;
    record.booth.type = record.booth.type || clean(check.type);
    record.booth.size = record.booth.size || clean(check.size);

    // Add-ons: the page sends ids, the prices come from our own catalogue -
    // and so does the answer to whether this booth may have them at all.
    const extras = priceSelectedExtras(body.extras, check.name);
    if (extras.unknown.length) {
      console.warn('[checkout/start] ignoring add-ons not offered for booth', check.name + ':',
        extras.unknown.join(', '));
    }
    record.extras = extras.items;
    record.extrasTotal = extras.total;

    const amount = check.price + extras.total;
    record.amount = amount;

    // One checkout per booth: the ExpoFP check and the hold below are two
    // calls, so two buyers could both pass the check - only one gets the claim.
    const claimSeconds = Math.max(HOLD_MINUTES * 60, STRIPE_MIN_EXPIRY_S) + HOLD_GRACE_MS / 1000 + 60;
    if (!(await claimBooth(check.name, checkoutId, claimSeconds))) {
      throw new HttpError(409, 'booth_unavailable', 'booth_in_checkout');
    }

    // Hold the booth: ExpoFP leaves it Available during checkout, so without
    // this other visitors still see it as free on the floor plan.
    const hold = await setBoothOnHold(record.booth, true);
    record.held = hold.held;
    record.holdSkipped = hold.reason || null;

    const label = `Booth ${record.booth.booth || record.booth.boothId}`;
    const detail = [record.booth.type, record.booth.size].filter(Boolean).join(' - ');
    const lineItems = [
      { name: label, description: detail, amount: check.price },
      ...extras.items.map((extra) => ({ name: extra.name, description: extra.description, amount: extra.price })),
    ];
    let paymentUrl;
    let holdUntil;

    try {
      if (gateway === 'stripe') {
        const nowS = Math.floor(Date.now() / 1000);
        const expiresAt = nowS + Math.min(STRIPE_MAX_EXPIRY_S, Math.max(STRIPE_MIN_EXPIRY_S, HOLD_MINUTES * 60));
        const session = await createCheckoutSession({
          checkoutId,
          items: lineItems,
          currency,
          email: record.exhibitor.email,
          // Stripe substitutes {CHECKOUT_SESSION_ID}; we look the session up by
          // our own record anyway, so a tampered id in the URL changes nothing.
          successUrl: `${returnBase}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${returnBase}&cancel=1`,
          expiresAt,
        });
        record.stripeSessionId = session.id;
        paymentUrl = session.url;
        // Stripe refuses payment once the session expires, so holding until
        // just after that makes a late payment on a released booth impossible.
        holdUntil = (session.expiresAt || expiresAt) * 1000 + HOLD_GRACE_MS;
      } else {
        const order = await createOrder({
          checkoutId,
          amount,
          currency,
          // PayPal takes one amount, so the add-ons ride in the description.
          description: [label, ...extras.items.map((extra) => extra.name)].join(' + '),
          returnUrl: returnBase,
          cancelUrl: `${returnBase}&cancel=1`,
        });
        record.paypalOrderId = order.id;
        paymentUrl = order.url;
        holdUntil = Date.now() + HOLD_MINUTES * 60_000;
      }
    } catch (error) {
      // No record will be saved, so nothing would ever release this hold.
      if (record.held) {
        await setBoothOnHold(record.booth, false).catch((releaseError) => {
          console.error('[checkout/start] could not release hold after failure', releaseError.message);
        });
      }
      await releaseBoothClaim(check.name, checkoutId).catch(() => {});
      throw error;
    }

    const ttl = Number(process.env.RECORD_TTL_SECONDS || 60 * 60 * 24 * 30);
    await putCheckout(checkoutId, record, ttl);
    if (record.held) await trackHold(checkoutId, holdUntil);

    return json({
      checkoutId,
      gateway,
      url: paymentUrl,
      currency,
      amount,
      booth: { name: record.booth.booth, price: record.booth.price },
      extras: record.extras,
      holdUntil: record.held ? new Date(holdUntil).toISOString() : null,
    }, 200, cors);
  } catch (error) {
    if (error instanceof HttpError) {
      console.error('[checkout/start]', error.code, error.detail || '');
      return json({ error: error.code, detail: error.detail, reason: error.reason }, error.status, cors);
    }
    console.error('[checkout/start]', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
