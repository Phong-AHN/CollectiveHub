import crypto from 'node:crypto';
import { HttpError, corsHeaders, json, preflight } from '../../lib/http.js';
import { envValue } from '../../lib/config.js';
import { checkBoothForSale } from '../../lib/expofp.js';
import { priceSelectedExtras } from '../../lib/extras.js';
import { fulfil } from '../../lib/fulfil.js';
import { sameSecret } from '../../lib/secrets.js';
import {
  attemptCount, claimBooth, countAttempt, getCheckout, persistentStorageConfigured, putCheckout,
  releaseBoothClaim,
} from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

// Guessing the passcode is the only way in, so make guessing impractical.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_S = 60 * 60;
const CLAIM_SECONDS = 5 * 60;

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);

/**
 * Books a booth without a payment - the organiser's own tool, for a sponsor, a
 * comp, or a booth already paid for by bank transfer.
 *
 * It does not skip the work, only the money: the same `fulfil()` the gateways
 * use creates the exhibitor, assigns the booth on ExpoFP, assigns the add-ons
 * and sends both emails. So an admin booking is indistinguishable from a paid
 * one afterwards, and the retry queue covers it if ExpoFP is briefly down.
 *
 * Needs ADMIN_PASSCODE. Without one the endpoint refuses outright rather than
 * standing open: it can give away booths.
 */
async function handler(request) {
  const pre = preflight(request);
  if (pre) return pre;

  const cors = corsHeaders(request);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

  let claimedBooth = null;
  let checkoutId = null;

  try {
    if (process.env.VERCEL && !persistentStorageConfigured() && !process.env.ALLOW_MEMORY_STORE) {
      throw new HttpError(503, 'storage_not_configured',
        'No Redis connected: add an Upstash Redis store to the Vercel project and redeploy.');
    }

    const passcode = envValue('ADMIN_PASSCODE');
    if (!passcode) {
      throw new HttpError(503, 'admin_passcode_missing',
        'Set ADMIN_PASSCODE before anyone can book a booth without paying.');
    }

    const body = await request.json();

    // Only wrong guesses count: an organiser booking twenty booths in an
    // afternoon must not lock themselves out. A blocked address stays blocked
    // for the hour even with the right code, so guessing cannot be resumed.
    const attemptKey = `admin:${clientKey(request)}`;
    if (await attemptCount(attemptKey) > MAX_ATTEMPTS) {
      throw new HttpError(429, 'too_many_attempts', 'Too many attempts. Try again in an hour.');
    }
    if (!sameSecret(body.passcode, passcode)) {
      await countAttempt(attemptKey, ATTEMPT_WINDOW_S);
      throw new HttpError(401, 'passcode_wrong', 'That admin code is not right.');
    }

    const boothName = clean(body.booth, 60);
    if (!boothName) throw new HttpError(400, 'booth_missing', 'Which booth?');

    const exhibitor = {
      company: clean(body.company, 120),
      contactName: clean(body.contactName, 120),
      email: clean(body.email, 160),
      phone: clean(body.phone, 60),
      website: clean(body.website, 200),
    };
    for (const field of ['company', 'contactName']) {
      if (!exhibitor[field]) throw new HttpError(400, 'exhibitor_incomplete', `Missing ${field}.`);
    }

    // The booth, and its price, as ExpoFP has them - never as the form says.
    let check;
    try {
      check = await checkBoothForSale({ booth: boothName });
    } catch (error) {
      const failure = new HttpError(503, 'booth_check_failed', 'Could not confirm the booth with ExpoFP.');
      failure.reason = error.envName ? `missing_env:${error.envName}`
        : error.status ? `expofp_http_${error.status}` : 'expofp_unreachable';
      throw failure;
    }
    if (!check.ok) {
      if (check.reason === 'booth_unknown') throw new HttpError(400, 'booth_unknown', 'ExpoFP has no such booth.');
      throw new HttpError(409, 'booth_unavailable', check.reason);
    }

    const extras = priceSelectedExtras(body.extras, check.name);
    const currency = (clean(body.currency, 3) || 'USD').toUpperCase();

    // Blank means "what it costs"; 0 is a real answer, for a comp or a sponsor.
    const override = body.amount === '' || body.amount === null || body.amount === undefined
      ? null : Number(body.amount);
    if (override !== null && (!Number.isFinite(override) || override < 0)) {
      throw new HttpError(400, 'amount_invalid', 'The amount must be a number, or left empty.');
    }
    const amount = override ?? (check.price + extras.total);

    // One booking per booth at a time: this is the same claim a paying
    // checkout takes, so an admin cannot book a booth someone is paying for.
    checkoutId = crypto.randomUUID();
    if (!(await claimBooth(check.name, checkoutId, CLAIM_SECONDS))) {
      throw new HttpError(409, 'booth_unavailable', 'in_checkout');
    }
    claimedBooth = check.name;

    const bookedBy = clean(body.bookedBy, 80);
    const note = clean(body.note, 300);
    const silent = body.sendEmails === false;

    await putCheckout(checkoutId, {
      status: 'paid',
      gateway: 'admin',
      held: false,
      booth: {
        booth: check.name,
        boothId: '',
        type: clean(check.type, 60),
        size: clean(check.size, 60),
        price: check.price,
        currency,
      },
      exhibitor,
      extras: extras.items,
      extrasTotal: extras.total,
      amount,
      paidAt: Date.now(),
      bookedBy: bookedBy || null,
      adminNote: [note, bookedBy ? `booked by ${bookedBy}` : null].filter(Boolean).join(' | ') || null,
      // An admin can book quietly - for a booth whose paperwork went by hand.
      ...(silent ? { emailSkipped: 'admin_skipped', organiserEmailSkipped: 'admin_skipped' } : {}),
    }, 60 * 60 * 24 * 30);

    const result = await fulfil(checkoutId, { reference: bookedBy ? `admin:${bookedBy}` : 'admin', transaction: note || null });
    if (!result.ok) {
      // The booth is not assigned, so let the next attempt have it back.
      await releaseBoothClaim(check.name, checkoutId);
      claimedBooth = null;
      throw new HttpError(502, 'expofp_write_failed', result.error || result.reason);
    }

    const saved = (await getCheckout(checkoutId)) || {};
    console.log('[admin/book]', check.name, 'to', exhibitor.company, bookedBy ? `by ${bookedBy}` : '');

    return json({
      ok: true,
      checkoutId,
      booth: check.name,
      exhibitorId: result.exhibitorId ?? saved.exhibitorId ?? null,
      amount,
      currency,
      extras: extras.items.map((extra) => ({ id: extra.id, name: extra.name, price: extra.price })),
      extrasAssigned: saved.extrasAssigned ?? 0,
      ignoredExtras: extras.unknown,
      emails: {
        buyer: mailState(saved, 'emailedAt', 'emailSkipped', 'emailError'),
        organiser: mailState(saved, 'organiserEmailedAt', 'organiserEmailSkipped', 'organiserEmailError'),
      },
    }, 200, cors);
  } catch (error) {
    if (claimedBooth && checkoutId) await releaseBoothClaim(claimedBooth, checkoutId).catch(() => {});

    if (error instanceof HttpError) {
      console.error('[admin/book]', error.code, error.detail || error.reason || '');
      return json({ error: error.code, detail: error.detail, reason: error.reason }, error.status, cors);
    }
    console.error('[admin/book]', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
}

/** "sent", "skipped: no_address" or "failed: ..." - what the admin needs to see. */
function mailState(record, sentAt, skipped, errorField) {
  if (record[sentAt]) return 'sent';
  if (record[skipped]) return `skipped: ${record[skipped]}`;
  if (record[errorField]) return `failed: ${record[errorField]} (will retry)`;
  return 'pending';
}

/** Per-IP, so one person guessing cannot lock everyone else out. */
function clientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return (forwarded.split(',')[0] || 'unknown').trim().slice(0, 45) || 'unknown';
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
