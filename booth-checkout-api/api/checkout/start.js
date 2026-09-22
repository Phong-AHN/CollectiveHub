import crypto from 'node:crypto';
import { HttpError, corsHeaders, json, preflight, safeReturnUrl } from '../../lib/http.js';
import { HOLD_MINUTES } from '../../lib/config.js';
import { setBoothOnHold } from '../../lib/expofp.js';
import { sweepExpiredHolds } from '../../lib/fulfil.js';
import { createOrder } from '../../lib/paypal.js';
import { putCheckout, trackHold } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

async function handler(request) {
  const pre = preflight(request);
  if (pre) return pre;

  const cors = corsHeaders(request);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const body = await request.json();
    const booth = body.booth || {};
    const exhibitor = body.exhibitor || {};

    // The floor plan hands over a booth; without one there is nothing to sell.
    if (!clean(booth.booth) && !clean(booth.boothId)) {
      throw new HttpError(400, 'booth_missing', 'No booth identifier in the request.');
    }

    const amount = Number(String(booth.price ?? '').replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'price_missing', 'No usable booth price in the request.');
    }

    for (const field of ['company', 'contactName', 'email']) {
      if (!clean(exhibitor[field])) {
        throw new HttpError(400, 'exhibitor_incomplete', `Missing ${field}.`);
      }
    }

    const checkoutId = crypto.randomUUID();
    const currency = clean(booth.currency, 3).toUpperCase() || 'USD';
    const returnPage = safeReturnUrl(body.returnUrl);
    const origin = new URL(request.url).origin;

    const record = {
      status: 'pending',
      booth: {
        booth: clean(booth.booth),
        boothId: clean(booth.boothId),
        type: clean(booth.type),
        size: clean(booth.size),
        price: amount,
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

    // Hold the booth first: ExpoFP leaves it Available during checkout, so
    // without this two people can pay for the same booth.
    const hold = await setBoothOnHold(record.booth, true);
    record.held = hold.held;
    record.holdSkipped = hold.reason || null;

    const order = await createOrder({
      checkoutId,
      amount,
      currency,
      description: `Booth ${record.booth.booth || record.booth.boothId}`,
      returnUrl: `${origin}/api/checkout/return?cid=${checkoutId}`,
      cancelUrl: `${origin}/api/checkout/return?cid=${checkoutId}&cancel=1`,
    });

    record.paypalOrderId = order.id;

    const ttl = Number(process.env.RECORD_TTL_SECONDS || 60 * 60 * 24 * 30);
    await putCheckout(checkoutId, record, ttl);
    if (record.held) await trackHold(checkoutId, Date.now() + HOLD_MINUTES * 60_000);

    return json({ checkoutId, url: order.url, holdMinutes: record.held ? HOLD_MINUTES : null }, 200, cors);
  } catch (error) {
    if (error instanceof HttpError) {
      console.error('[checkout/start]', error.code, error.detail || '');
      return json({ error: error.code, detail: error.detail }, error.status, cors);
    }
    console.error('[checkout/start]', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
