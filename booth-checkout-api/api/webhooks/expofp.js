import { json } from '../../lib/http.js';
import { normalizeEvent, verifyWebhook } from '../../lib/expofp.js';
import { consumeAssigned, firstDelivery, rememberAssigned } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

/**
 * Inbound sync from ExpoFP.
 *
 * Things the docs warn about and this handler accounts for:
 *  - one booth assignment produces TWO deliveries: booth_assigned, then a
 *    booth_reserved carrying the same values. Only that follow-up is dropped;
 *    a booth_reserved that stands on its own (a reservation made in ExpoFP,
 *    or the Test webhook button) is always handled;
 *  - booth events use PascalCase ("Type", "BoothId") while exhibitor events use
 *    camelCase ("type", "exhibitorId");
 *  - the Test webhook button sends a JSON array, real events a single object.
 */
const BOM = 0xfeff;

const pairKey = (event) => [event.expoId, event.boothId, event.boothKey, event.exhibitorId].join('|');

async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // 1. Raw bytes, before anything decodes or parses them.
  const raw = Buffer.from(await request.arrayBuffer());

  // 2-4. Verify over those exact bytes; reject on mismatch and on absence.
  const verified = verifyWebhook(raw, request.headers.get('x-expofp-signature-256'));
  if (!verified.ok) {
    console.error('[webhooks/expofp] signature rejected:', verified.reason);
    return json({ error: 'invalid_signature' }, 401);
  }
  if (verified.skipped) {
    console.warn('[webhooks/expofp] EXPOFP_WEBHOOK_SECRET is not set - deliveries are NOT verified');
  }

  // 5. Parse only now. A leading BOM is legal on the wire but not in JSON.
  let text = raw.toString('utf8');
  if (text.charCodeAt(0) === BOM) text = text.slice(1);

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    return json({ error: 'invalid_json' }, 400);
  }

  // 7. Re-sent events keep their delivery id; answer 200 so ExpoFP stops.
  // Only present on signed deliveries.
  const deliveryId = request.headers.get('x-expofp-delivery');
  if (deliveryId && !(await firstDelivery(deliveryId))) {
    return json({ ok: true, duplicate: deliveryId });
  }

  const events = (Array.isArray(payload) ? payload : [payload])
    .map(normalizeEvent)
    .filter(Boolean);

  const handled = [];
  for (const event of events) {
    if (event.type === 'booth_assigned') {
      // Always handled - it is the first of the pair.
      await rememberAssigned(pairKey(event));
    } else if (event.type === 'booth_reserved' && await consumeAssigned(pairKey(event))) {
      handled.push({ type: event.type, skipped: 'follows_booth_assigned' });
      continue;
    }

    console.log('[webhooks/expofp]', JSON.stringify({
      type: event.type,
      expoId: event.expoId,
      boothId: event.boothId,
      boothKey: event.boothKey,
      exhibitorId: event.exhibitorId,
      isOnHold: event.isOnHold,
      deliveryId,
    }));

    handled.push({ type: event.type, ok: true });
  }

  return json({ ok: true, received: events.length, handled });
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
