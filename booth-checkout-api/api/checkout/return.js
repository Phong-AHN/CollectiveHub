import { redirect, withParam } from '../../lib/http.js';
import { checkBoothForSale, setBoothOnHold } from '../../lib/expofp.js';
import { captureIdOf, captureOrder } from '../../lib/paypal.js';
import { expireSession, retrieveSession } from '../../lib/stripe.js';
import { fulfil, releaseHold } from '../../lib/fulfil.js';
import { getCheckout, patchCheckout, trackHold } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

/**
 * Where the gateway sends the buyer back. It settles the payment straight away
 * so the visitor sees a real answer; the gateway's webhook covers the buyer
 * who closes the tab before landing here.
 *
 * Every answer below comes from the gateway's API, never from the query
 * string - a URL can be typed by anyone.
 */
async function handler(request) {
  const url = new URL(request.url);
  const checkoutId = url.searchParams.get('cid') || '';
  const cancelled = url.searchParams.get('cancel') === '1';

  const record = checkoutId ? await getCheckout(checkoutId) : null;
  const page = record?.returnPage || process.env.CHECKOUT_PAGE_URL || '/';
  const back = (status) => redirect(withParam(page, 'status', status));

  if (!record) {
    console.error('[checkout/return] unknown checkout', checkoutId);
    return back('error');
  }

  const gateway = record.gateway || 'paypal';

  if (cancelled) {
    if (gateway === 'stripe' && record.stripeSessionId) {
      // Close the session before releasing the booth: otherwise the buyer can
      // press Back and pay for a booth someone else may already be holding.
      await expireSession(record.stripeSessionId).catch((error) => {
        // Already expired or completed - either way it can no longer be paid.
        console.warn('[checkout/return] expire session:', error.message);
      });
    }
    await releaseHold(checkoutId);
    return back('cancel');
  }

  try {
    if (gateway === 'stripe') return back(await settleStripe(checkoutId, record));
    return back(await settlePaypal(checkoutId, record));
  } catch (error) {
    console.error('[checkout/return]', checkoutId, error.message, error.payload || '');
    return back('error');
  }
}

async function settleStripe(checkoutId, record) {
  // Our own stored session id, not the session_id in the URL.
  const session = await retrieveSession(record.stripeSessionId);

  if (session.client_reference_id !== checkoutId) {
    console.error('[checkout/return] session does not belong to checkout', checkoutId, session.id);
    return 'error';
  }

  if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
    const result = await fulfil(checkoutId, {
      reference: session.id,
      transaction: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    });
    // The money is taken either way; a failed ExpoFP write is ours to retry,
    // not something to show the buyer as a failed purchase.
    if (!result.ok) console.error('[checkout/return] fulfilment pending', checkoutId, result.reason);
    return 'success';
  }

  // Completed but still settling (delayed payment methods): the
  // checkout.session.async_payment_* webhook finishes the job.
  if (session.status === 'complete') return 'pending';

  return 'error';
}

async function settlePaypal(checkoutId, record) {
  // Our hold lasts HOLD_MINUTES; PayPal keeps an order approvable for hours.
  // Nothing is taken until we capture, so if the hold already ran out, check
  // the booth again and refuse to capture when someone else has it now.
  if (record.status === 'expired') {
    const check = await checkBoothForSale(record.booth);
    if (!check.ok) {
      console.warn('[checkout/return] late PayPal approval, booth gone:', checkoutId, check.reason);
      return 'unavailable';
    }
    const hold = await setBoothOnHold(record.booth, true);
    await patchCheckout(checkoutId, { status: 'pending', held: hold.held });
    // If the capture below fails, the sweep releases this again.
    if (hold.held) await trackHold(checkoutId, Date.now() + 10 * 60_000);
  }

  // PayPal also puts the order id in ?token=, but only our stored one is ours.
  const capture = await captureOrder(record.paypalOrderId, checkoutId);

  if (capture.status !== 'COMPLETED') {
    console.error('[checkout/return] capture not completed', checkoutId, capture.status);
    return 'pending';
  }

  const result = await fulfil(checkoutId, {
    reference: capture.id,
    transaction: captureIdOf(capture),
  });
  if (!result.ok) console.error('[checkout/return] fulfilment pending', checkoutId, result.reason);
  return 'success';
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
