import { json } from '../../lib/http.js';
import { normalizeEvent, verifyWebhook } from '../../lib/expofp.js';

export const config = { runtime: 'nodejs' };

/**
 * Inbound sync from ExpoFP.
 *
 * Two things the docs warn about and this handler accounts for:
 *  - one booth assignment produces TWO deliveries, booth_assigned followed by
 *    booth_reserved carrying the same values, so acting on both double-counts;
 *  - booth events use PascalCase ("Type", "BoothId") while exhibitor events use
 *    camelCase ("type", "exhibitorId").
 *
 * Test deliveries arrive as a JSON array, production events as a single object.
 */
const seen = new Map();
const DEDUPE_MS = 60_000;

function isDuplicate(event) {
  const key = [event.type, event.expoId, event.boothId, event.boothKey, event.exhibitorId].join('|');
  const now = Date.now();

  for (const [existing, at] of seen) {
    if (now - at > DEDUPE_MS) seen.delete(existing);
  }

  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // Must be the raw bytes: the signature is computed over the body as sent.
  const raw = await request.text();

  const verified = verifyWebhook(raw, request.headers.get('x-expofp-signature-256'));
  if (!verified.ok) {
    console.error('[webhooks/expofp] signature rejected:', verified.reason);
    return json({ error: 'invalid_signature' }, 401);
  }
  if (verified.skipped) {
    console.warn('[webhooks/expofp] EXPOFP_WEBHOOK_SECRET is not set - deliveries are NOT verified');
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    return json({ error: 'invalid_json' }, 400);
  }

  const events = (Array.isArray(payload) ? payload : [payload])
    .map(normalizeEvent)
    .filter(Boolean);

  const handled = [];
  for (const event of events) {
    // booth_assigned is always followed by booth_reserved with the same values;
    // treat the pair as one change.
    if (event.type === 'booth_assigned' && isDuplicate({ ...event, type: 'booth_pair' })) {
      handled.push({ type: event.type, skipped: 'duplicate_of_pair' });
      continue;
    }
    if (event.type === 'booth_reserved' && isDuplicate({ ...event, type: 'booth_pair' })) {
      handled.push({ type: event.type, skipped: 'duplicate_of_pair' });
      continue;
    }

    console.log('[webhooks/expofp]', JSON.stringify({
      type: event.type,
      expoId: event.expoId,
      boothId: event.boothId,
      boothKey: event.boothKey,
      exhibitorId: event.exhibitorId,
      isOnHold: event.isOnHold,
      deliveryId: request.headers.get('x-expofp-delivery'),
    }));

    handled.push({ type: event.type, ok: true });
  }

  return json({ ok: true, received: events.length, handled });
}
