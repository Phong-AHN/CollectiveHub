import { sendOrganiserNotice, sendReceipt } from './email.js';
import { addExhibitor, addExhibitorBooth, assignExtras, setBoothOnHold } from './expofp.js';
import {
  claimFulfilment, clearRetry, dueHolds, dueRetries, getCheckout, patchCheckout,
  releaseBoothClaim, releaseClaim, scheduleRetry, untrackHold,
} from './store.js';

// After a failed ExpoFP write: try again in 1 min, 5, 15, 1 h, 3 h, 6 h, 12 h,
// then daily, and stop after MAX_ATTEMPTS - by then it needs a person.
const RETRY_BACKOFF_MIN = [1, 5, 15, 60, 180, 360, 720, 1440];
const MAX_ATTEMPTS = 12;

// Money is in (or the booth is being assigned): never put these back on sale.
const PAID_STATES = new Set(['paid', 'fulfilment_failed', 'fulfilled']);

/** Internal note on the exhibitor - adminNotes is never shown to visitors. */
function adminNoteFor(record, payment) {
  const b = record.booth || {};
  const e = record.exhibitor || {};
  const extras = (record.extras || []).map((extra) => `${extra.name} ${extra.price}`).join(', ');
  return [
    `Booth ${b.booth} paid ${record.amount ?? b.price} ${b.currency} via ${record.gateway || 'paypal'}`,
    extras ? `add-ons: ${extras}` : null,
    payment.reference || record.paymentReference ? `ref ${payment.reference || record.paymentReference}` : null,
    `contact ${e.contactName || '-'} <${e.email || '-'}>${e.phone ? ` ${e.phone}` : ''}`,
    `checkout ${record.id}`,
  ].filter(Boolean).join(' | ');
}

/**
 * Turns a paid checkout into an exhibitor + booth assignment on the floor plan.
 *
 * The gateway's return page and its webhook both call this; whichever arrives
 * first wins the claim and the other becomes a no-op. A failure is scheduled
 * for retry, so a paid booth is assigned even if ExpoFP was briefly down.
 * Callers must have confirmed with the gateway's own API that the money is
 * really in - never on the strength of a webhook payload alone.
 *
 * payment.reference   - PayPal order id / Stripe Checkout Session id
 * payment.transaction - PayPal capture id / Stripe PaymentIntent id
 */
/**
 * Takes the ExpoFP hold off a booth that has just been assigned.
 *
 * The hold is what keeps the booth off the market while the buyer pays, but it
 * also overrides how the booth reads on the floor plan: left on, an assigned
 * booth still shows as On Hold instead of Reserved. Clearing it any earlier
 * would put the booth back on sale mid-payment.
 *
 * Best effort: the booth is already assigned and paid for, so a failure here
 * is cosmetic - record it and let the retry queue come back to it.
 */
async function clearHoldAfterAssignment(checkoutId, record) {
  const result = await setBoothOnHold(record.booth, false);
  const cleared = !result.reason;

  await patchCheckout(checkoutId, { holdCleared: cleared });
  if (!cleared) {
    console.error('[fulfil] booth assigned but its hold is still on', checkoutId, record.booth?.booth, result.reason);
    await scheduleRetry(checkoutId, Date.now() + 5 * 60_000);
  }
  return cleared;
}

/**
 * A sale sends two emails: the buyer's receipt, and the organiser's notice of
 * who bought what. Each is tracked on its own fields, so one failing never
 * sends the other a second time.
 */
const MAILINGS = [
  { name: 'receipt', send: sendReceipt, sentAt: 'emailedAt', id: 'emailId', skipped: 'emailSkipped', error: 'emailError' },
  {
    name: 'organiser notice',
    send: sendOrganiserNotice,
    sentAt: 'organiserEmailedAt',
    id: 'organiserEmailId',
    skipped: 'organiserEmailSkipped',
    error: 'organiserEmailError',
  },
];

/**
 * Sends one of them, once.
 *
 * Returns true when there is nothing left to do - sent, or nothing we can send
 * (no Resend key, nobody to send it to). A failure that could pass on its own
 * goes back on the retry queue: the booth is already theirs, only the paperwork
 * is late.
 */
async function sendMailingOnce(checkoutId, record, mailing) {
  if (record[mailing.sentAt] || record[mailing.skipped]) return true;

  const result = await mailing.send(record);
  if (result.sent) {
    await patchCheckout(checkoutId, {
      [mailing.sentAt]: Date.now(), [mailing.id]: result.id, [mailing.error]: null,
    });
    return true;
  }

  if (result.reason === 'not_configured' || result.reason === 'no_address' || result.reason === 'rejected') {
    console.error('[fulfil] no', mailing.name, 'sent for', checkoutId, '-', result.reason, result.error || '');
    await patchCheckout(checkoutId, { [mailing.skipped]: result.reason, [mailing.error]: result.error ?? null });
    return true;
  }

  console.error('[fulfil]', mailing.name, 'failed for', checkoutId, result.error || result.reason);
  await patchCheckout(checkoutId, { [mailing.error]: result.error || result.reason });
  await scheduleRetry(checkoutId, Date.now() + 5 * 60_000);
  return false;
}

/** Both emails. Returns true only when neither has anything left to try. */
async function sendReceiptOnce(checkoutId, record) {
  let done = true;
  let current = record;
  for (const mailing of MAILINGS) {
    // Re-read between sends: the first one just wrote its own flags, and the
    // second must not overwrite them from a stale copy.
    const sent = await sendMailingOnce(checkoutId, current, mailing);
    done = done && sent;
    current = { ...current, ...(await getCheckout(checkoutId)) };
  }
  return done;
}

export async function fulfil(checkoutId, payment = {}) {
  const record = await getCheckout(checkoutId);
  if (!record) return { ok: false, reason: 'unknown_checkout' };
  if (record.status === 'fulfilled') {
    // Everything is done except, possibly, clearing the hold flag - so a
    // booth left reading On Hold heals itself on the next retry sweep.
    const holdCleared = !record.held || record.holdCleared
      ? true
      : await clearHoldAfterAssignment(checkoutId, record);
    const emailed = await sendReceiptOnce(checkoutId, record);

    // Only stop retrying once there is nothing left to do.
    if (holdCleared && emailed) await clearRetry(checkoutId);
    return { ok: true, already: true, record, holdCleared, emailed };
  }

  const claimed = await claimFulfilment(checkoutId);
  if (!claimed) return { ok: true, inFlight: true };

  const attempts = (record.attempts || 0) + 1;

  try {
    await patchCheckout(checkoutId, {
      status: 'paid',
      paymentReference: payment.reference || record.paymentReference || null,
      paymentTransaction: payment.transaction || record.paymentTransaction || null,
      paidAt: record.paidAt || Date.now(),
      attempts,
    });

    // Paid: take the booth off the release schedule BEFORE any ExpoFP write
    // that could fail. Its ExpoFP hold stays on until it is assigned, so the
    // booth cannot go back on sale while a retry is pending.
    await untrackHold(checkoutId);

    const exhibitorId = record.exhibitorId
      || await addExhibitor(record.exhibitor, checkoutId, { adminNotes: adminNoteFor(record, payment) });

    // Keep the id before assigning, so a failure halfway does not create a
    // second exhibitor on the next retry.
    await patchCheckout(checkoutId, { exhibitorId });

    await addExhibitorBooth(exhibitorId, record.booth);

    // Add-ons are recorded in the exhibitor's admin notes regardless; this
    // also puts them on the ExpoFP record where that is switched on.
    const extras = await assignExtras(exhibitorId, record.extras);
    if (record.extras?.length) await patchCheckout(checkoutId, { extrasAssigned: extras.assigned });

    // Assigned - now, and only now, the booth can stop reading as On Hold.
    const holdCleared = record.held ? await clearHoldAfterAssignment(checkoutId, record) : true;

    // The booth is theirs: tell them so, with what they bought.
    const emailed = await sendReceiptOnce(checkoutId, {
      ...record,
      exhibitorId,
      paymentReference: payment.reference || record.paymentReference || null,
    });

    if (holdCleared && emailed) await clearRetry(checkoutId);
    await patchCheckout(checkoutId, {
      status: 'fulfilled',
      fulfilledAt: Date.now(),
      // Keep the pending attempt when only the hold flag is left to clear.
      ...(holdCleared && emailed ? { nextAttemptAt: null } : {}),
    });
    return { ok: true, exhibitorId, holdCleared, emailed };
  } catch (error) {
    const giveUp = attempts >= MAX_ATTEMPTS;
    const delay = RETRY_BACKOFF_MIN[Math.min(attempts - 1, RETRY_BACKOFF_MIN.length - 1)] * 60_000;
    const nextAttemptAt = giveUp ? null : Date.now() + delay;

    console.error('[fulfil] failed', checkoutId, `attempt ${attempts}`, error.message, error.payload || '');
    await patchCheckout(checkoutId, {
      status: 'fulfilment_failed',
      lastError: error.message,
      // ExpoFP's error body usually names the field it wanted.
      lastErrorPayload: error.payload ?? null,
      nextAttemptAt,
    });

    if (nextAttemptAt) {
      await scheduleRetry(checkoutId, nextAttemptAt);
    } else {
      await clearRetry(checkoutId);
      console.error(`[fulfil] GIVING UP on ${checkoutId} after ${attempts} attempts - ` +
        `booth ${record.booth?.booth} is paid for: assign it by hand in ExpoFP`);
    }

    await releaseClaim(checkoutId);
    return { ok: false, reason: 'expofp_write_failed', error: error.message, nextAttemptAt };
  }
}

/**
 * Works through failed fulfilments that are due. `all` ignores the schedule -
 * use it after fixing a configuration problem, rather than waiting it out.
 */
export async function retryFailedFulfilments({ limit = 20, all = false } = {}) {
  const ids = await dueRetries(all ? Number.MAX_SAFE_INTEGER : Date.now(), limit);
  const results = [];
  for (const id of ids) {
    try {
      results.push({ id, ...(await fulfil(id)) });
    } catch (error) {
      console.error('[retry] fulfil threw', id, error.message);
      results.push({ id, ok: false, error: error.message });
    }
  }
  return results;
}

/** Drops the hold for a checkout that was abandoned or failed. */
export async function releaseHold(checkoutId) {
  // Whoever takes the hold off the schedule is the one that releases it, so
  // the daily cron, the checkout-time sweep and an external scheduler can
  // overlap without releasing the same booth twice.
  const claimed = await untrackHold(checkoutId);

  const record = await getCheckout(checkoutId);
  if (!record) return { ok: false, reason: 'unknown_checkout' };
  // Paid - even if the ExpoFP write is still pending - means the booth is sold.
  if (PAID_STATES.has(record.status)) return { ok: true, kept: true };

  const released = claimed && record.held;
  if (released) await setBoothOnHold(record.booth, false);
  // Let the next buyer start a checkout for this booth straight away.
  if (record.booth?.booth) await releaseBoothClaim(record.booth.booth, checkoutId);

  if (record.status !== 'expired') {
    await patchCheckout(checkoutId, { status: 'expired', held: false, expiredAt: Date.now() });
  }
  return { ok: true, released };
}

/**
 * Releases holds whose time is up. Called by the cron and at the start of
 * every checkout, so abandoned booths go back on sale as soon as anyone is
 * buying - not only when the (daily, on Hobby) cron comes round.
 */
export async function sweepExpiredHolds(limit = 20) {
  const ids = await dueHolds(Date.now(), limit);
  const results = [];
  for (const id of ids) {
    try {
      results.push({ id, ...(await releaseHold(id)) });
    } catch (error) {
      console.error('[sweep] release failed', id, error.message);
      results.push({ id, ok: false, error: error.message });
    }
  }
  return results;
}
