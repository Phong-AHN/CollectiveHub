import { redirect, withParam } from '../../lib/http.js';
import { captureIdOf, captureOrder } from '../../lib/paypal.js';
import { fulfil, releaseHold } from '../../lib/fulfil.js';
import { getCheckout } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

/**
 * Where PayPal sends the buyer back. Captures straight away so the visitor
 * sees a real answer; the PayPal webhook covers the case where the buyer
 * closes the tab before landing here.
 */
export default async function handler(request) {
  const url = new URL(request.url);
  const checkoutId = url.searchParams.get('cid') || '';
  const cancelled = url.searchParams.get('cancel') === '1';
  const orderId = url.searchParams.get('token') || '';

  const record = checkoutId ? await getCheckout(checkoutId) : null;
  const page = record?.returnPage || process.env.CHECKOUT_PAGE_URL || '/';

  if (!record) {
    console.error('[checkout/return] unknown checkout', checkoutId);
    return redirect(withParam(page, 'status', 'error'));
  }

  if (cancelled) {
    await releaseHold(checkoutId);
    return redirect(withParam(page, 'status', 'cancel'));
  }

  try {
    const capture = await captureOrder(orderId || record.paypalOrderId, checkoutId);

    if (capture.status !== 'COMPLETED') {
      console.error('[checkout/return] capture not completed', checkoutId, capture.status);
      return redirect(withParam(page, 'status', 'pending'));
    }

    const result = await fulfil(checkoutId, {
      orderId: capture.id,
      captureId: captureIdOf(capture),
    });

    // The money is taken either way; a failed ExpoFP write is ours to retry,
    // not something to show the buyer as a failed purchase.
    if (!result.ok) console.error('[checkout/return] fulfilment pending', checkoutId, result.reason);

    return redirect(withParam(page, 'status', 'success'));
  } catch (error) {
    console.error('[checkout/return]', checkoutId, error.message, error.payload || '');
    return redirect(withParam(page, 'status', 'error'));
  }
}
