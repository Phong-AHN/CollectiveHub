import { json } from '../../lib/http.js';
import { retrieveSession, verifyWebhook } from '../../lib/stripe.js';
import { fulfil, releaseHold } from '../../lib/fulfil.js';

export const config = { runtime: 'nodejs' };

const PAID = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const DEAD = new Set(['checkout.session.expired', 'checkout.session.async_payment_failed']);

/**
 * Stripe events for our Checkout Sessions.
 *
 * Register this URL in the Stripe Dashboard (Developers > Webhooks) for:
 *   checkout.session.completed, checkout.session.async_payment_succeeded,
 *   checkout.session.async_payment_failed, checkout.session.expired
 */
async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Raw bytes: the signature covers the body exactly as sent.
  const raw = Buffer.from(await request.arrayBuffer());

  const verified = verifyWebhook(raw, request.headers.get('stripe-signature'));
  if (!verified.ok) {
    console.error('[webhooks/stripe] signature rejected:', verified.reason);
    return json({ error: 'invalid_signature', reason: verified.reason }, 400);
  }
  if (verified.skipped) {
    console.warn('[webhooks/stripe] STRIPE_WEBHOOK_SECRET is not set - deliveries are NOT verified');
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (error) {
    return json({ error: 'invalid_json' }, 400);
  }

  const object = event?.data?.object || {};
  const checkoutId = object.client_reference_id || object.metadata?.checkoutId || null;

  if (!checkoutId || object.object !== 'checkout.session') {
    return json({ ok: true, ignored: event?.type || 'unknown' });
  }

  if (PAID.has(event.type)) {
    // Trust Stripe's API, not the payload: re-read the session so a forged or
    // replayed event can never turn into a booth nobody paid for.
    const session = await retrieveSession(object.id);
    const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';

    if (!paid || session.client_reference_id !== checkoutId) {
      // completed-but-unpaid is normal for delayed payment methods; the
      // async_payment_succeeded event will follow.
      return json({ ok: true, waiting: session.payment_status });
    }

    const result = await fulfil(checkoutId, {
      reference: session.id,
      transaction: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    });
    // Always 2xx: fulfil() records its own failure for retry, and a non-2xx
    // would only make Stripe redeliver the same event.
    return json({ ok: true, result });
  }

  if (DEAD.has(event.type)) {
    // Same rule for releasing: a forged "expired" must not free a booth that
    // someone is in the middle of paying for.
    const session = await retrieveSession(object.id);
    const dead = session.client_reference_id === checkoutId
      && (
        session.status === 'expired'
        || (event.type === 'checkout.session.async_payment_failed' && session.payment_status === 'unpaid')
      );
    if (!dead) return json({ ok: true, ignored: 'session_not_dead' });

    await releaseHold(checkoutId);
    return json({ ok: true, released: true });
  }

  return json({ ok: true, ignored: event.type });
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
