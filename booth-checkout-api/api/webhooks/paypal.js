import { json } from '../../lib/http.js';
import { verifyWebhook } from '../../lib/paypal.js';
import { fulfil, releaseHold } from '../../lib/fulfil.js';

export const config = { runtime: 'nodejs' };

const PAID = new Set(['PAYMENT.CAPTURE.COMPLETED', 'CHECKOUT.ORDER.COMPLETED']);
const FAILED = new Set(['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED', 'CHECKOUT.ORDER.VOIDED']);

export default async function handler(request) {
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

  if (PAID.has(event.event_type)) {
    const result = await fulfil(checkoutId, {
      orderId: resource.supplementary_data?.related_ids?.order_id || resource.id,
      captureId: resource.id,
    });
    // Always 200: a non-2xx makes PayPal redeliver, and fulfil() already
    // records the failure for our own retry.
    return json({ ok: true, result });
  }

  if (FAILED.has(event.event_type)) {
    await releaseHold(checkoutId);
    return json({ ok: true, released: true });
  }

  return json({ ok: true, ignored: event.event_type });
}
