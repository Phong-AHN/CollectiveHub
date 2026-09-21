import { addExhibitor, addExhibitorBooth, setBoothOnHold } from './expofp.js';
import { claimFulfilment, getCheckout, patchCheckout, releaseClaim, untrackHold } from './store.js';

/**
 * Turns a paid checkout into an exhibitor + booth assignment on the floor plan.
 *
 * Both the PayPal return and the PayPal webhook call this; whichever arrives
 * first wins the claim and the other becomes a no-op. Safe to retry.
 */
export async function fulfil(checkoutId, payment = {}) {
  const record = await getCheckout(checkoutId);
  if (!record) return { ok: false, reason: 'unknown_checkout' };
  if (record.status === 'fulfilled') return { ok: true, already: true, record };

  const claimed = await claimFulfilment(checkoutId);
  if (!claimed) return { ok: true, inFlight: true };

  try {
    await patchCheckout(checkoutId, {
      status: 'paid',
      paypalOrderId: payment.orderId || record.paypalOrderId || null,
      paypalCaptureId: payment.captureId || record.paypalCaptureId || null,
      paidAt: Date.now(),
    });

    const exhibitorId = record.exhibitorId
      || await addExhibitor(record.exhibitor, checkoutId);

    // Keep the id before assigning, so a failure halfway does not create a
    // second exhibitor on the next retry.
    await patchCheckout(checkoutId, { exhibitorId });

    await addExhibitorBooth(exhibitorId, record.booth);

    // The booth is assigned now, so the hold has done its job.
    await untrackHold(checkoutId);
    await patchCheckout(checkoutId, { status: 'fulfilled', fulfilledAt: Date.now() });

    return { ok: true, exhibitorId };
  } catch (error) {
    console.error('[fulfil] failed', checkoutId, error.message, error.payload || '');
    await patchCheckout(checkoutId, { status: 'fulfilment_failed', lastError: error.message });
    // Let the next delivery try again.
    await releaseClaim(checkoutId);
    return { ok: false, reason: 'expofp_write_failed', error: error.message };
  }
}

/** Drops the hold for a checkout that was abandoned or failed. */
export async function releaseHold(checkoutId) {
  const record = await getCheckout(checkoutId);
  await untrackHold(checkoutId);
  if (!record) return { ok: false, reason: 'unknown_checkout' };
  if (record.status === 'fulfilled') return { ok: true, kept: true };

  if (record.held) await setBoothOnHold(record.booth, false);
  await patchCheckout(checkoutId, { status: 'expired', held: false, expiredAt: Date.now() });
  return { ok: true };
}
