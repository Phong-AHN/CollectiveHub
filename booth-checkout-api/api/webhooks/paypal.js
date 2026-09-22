import { json } from '../../lib/http.js';
import { getOrder, verifyWebhook } from '../../lib/paypal.js';
import { fulfil, releaseHold } from '../../lib/fulfil.js';
import { getCheckout } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

const PAID = new Set(['PAYMENT.CAPTURE.COMPLETED', 'CHECKOUT.ORDER.COMPLETED']);
const FAILED = new Set(['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED', 'CHECKOUT.ORDER.VOIDED']);
const DEAD_CAPTURE = new Set(['DECLINED', 'DENIED', 'FAILED']);

async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = await request.text();

  const verified = await verifyWebhook(request.headers, raw).catch((error) => {
    console.error('[webhooks/paypal] verification error', error.message);
    return { ok: false };
  });
  if (!verified.ok) return json({ error: 'invalid_signature' }, 401);

  let event;
  try {
    event = JSON.parse(raw);
  } catch (error) {
    return json({ error: 'invalid_json' }, 400);
  }

  const resource = event.resource || {};
  // custom_id rides along from the order we created in checkout/start.
  const checkoutId = resource.custom_id
    || resource.purchase_units?.[0]?.custom_id
    || null;

  if (!checkoutId) {
    console.warn('[webhooks/paypal] no custom_id on', event.event_type);
    return json({ ok: true, ignored: 'no_custom_id' });
  }

  const interesting = PAID.has(event.event_type) || FAILED.has(event.event_type);
  if (!interesting) return json({ ok: true, ignored: event.event_type });

  // Trust PayPal's API, not the payload - whether or not PAYPAL_WEBHOOK_ID is
  // set, a forged event must not be able to hand out or release a booth.
  // Look the order up by the id WE stored, not one named in the event.
  const record = await getCheckout(checkoutId);
  if (!record?.paypalOrderId) return json({ ok: true, ignored: 'unknown_checkout' });

  const order = await getOrder(record.paypalOrderId);
  const unit = order?.purchase_units?.[0];
  if (unit?.custom_id !== checkoutId) {
    console.error('[webhooks/paypal] order does not belong to checkout', checkoutId, order?.id);
    return json({ ok: true, ignored: 'order_mismatch' });
  }
  const capture = unit?.payments?.captures?.[0] || null;

  if (PAID.has(event.event_type)) {
    if (order.status !== 'COMPLETED' || capture?.status !== 'COMPLETED') {
      return json({ ok: true, waiting: capture?.status || order.status });
    }
    const result = await fulfil(checkoutId, { reference: order.id, transaction: capture.id });
    // Always 200: a non-2xx makes PayPal redeliver, and fulfil() already
    // records the failure for our own retry.
    return json({ ok: true, result });
  }

  // FAILED: release only if PayPal agrees the payment is dead.
  if (order.status === 'VOIDED' || DEAD_CAPTURE.has(capture?.status)) {
    await releaseHold(checkoutId);
    return json({ ok: true, released: true });
  }
  return json({ ok: true, ignored: 'payment_not_dead' });
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
