import crypto from 'node:crypto';
import { BASE_URL, FIELDS, PATHS, RESPONSE_PATHS, assertConfigured, isConfigured } from './expofp-endpoints.js';
import { requiredEnv } from './config.js';

async function call(operation, body) {
  const path = assertConfigured(operation);
  const url = `${BASE_URL.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const token = requiredEnv('EXPOFP_API_TOKEN');
  const response = await fetch(url, {
    method: 'POST',
    // The reference asks for the token in the JSON body; its own examples also
    // send it as X-API-Token. Both, then - and never in the URL.
    headers: { 'Content-Type': 'application/json', 'X-API-Token': token },
    body: JSON.stringify({ [FIELDS.token]: token, ...body }),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`ExpoFP ${operation} failed with ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function dig(object, pathParts) {
  return pathParts.reduce((node, part) => (node == null ? node : node[part]), object);
}

// eventId / expoId are int32 in the reference, and ExpoFP's webhooks carry ids
// as numbers too, but env vars and query strings are text: send digit-only ids
// as numbers. Booth keys like "A-101" or "7" go exactly as given, and so does
// add-exhibitor-booth's exhibitorId, which the reference wants as a string.
const asId = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(value) : value);

const expoId = () => asId(requiredEnv('EXPOFP_EXPO_ID'));

// ---- booths: documented bodies ---------------------------------------------

/** get-booth { token, eventId, name }. Null when the expo has no such booth. */
export async function getBooth(name) {
  try {
    return await call('getBooth', { eventId: expoId(), name: String(name) });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/** list-booths { token, expoId } - note expoId here, eventId on the others. */
export async function listBooths() {
  const payload = await call('listBooths', { expoId: expoId() });
  return Array.isArray(payload) ? payload : [];
}

/**
 * The booth's name as drawn on the floor plan - what get-booth and
 * update-booth look booths up by. Taken from the hand-over link when it
 * carries one; otherwise mapped from ExpoFP's numeric booth id.
 */
export async function resolveBoothName(booth) {
  if (booth.booth) return String(booth.booth);
  if (!booth.boothId) return null;
  const match = (await listBooths()).find((b) => String(b.id) === String(booth.boothId));
  return match ? String(match.name) : null;
}

/**
 * Is this booth for sale right now, and at what price?
 *
 * The price comes from ExpoFP, never from the visitor: the hand-over link puts
 * the price on the query string, where anyone can edit it.
 */
export async function checkBoothForSale(booth) {
  const name = await resolveBoothName(booth);
  if (!name) return { ok: false, reason: 'booth_unknown' };

  const info = await getBooth(name);
  if (!info) return { ok: false, reason: 'booth_unknown', name };
  if (info.isSpecialSection) return { ok: false, reason: 'booth_not_for_sale', name };
  if (info.isOnHold) return { ok: false, reason: 'booth_on_hold', name };
  if (Array.isArray(info.exhibitors) && info.exhibitors.length) return { ok: false, reason: 'booth_taken', name };

  const price = Number(info.price);
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'booth_not_for_sale', name };

  return { ok: true, name: String(info.name || name), price, title: info.title, type: info.type, size: info.size };
}

/**
 * Every booth on the plan with what an organiser needs to choose one: its
 * price and whether it is free, on hold, or already someone's.
 *
 * list-booths gives the names and the exhibitors but neither the price nor the
 * hold flag, so each booth is read individually - in parallel, because 54
 * round trips one after another is a long wait for a page.
 */
export async function listBoothsWithStatus({ concurrency = 8 } = {}) {
  const booths = await listBooths();
  const detailed = new Array(booths.length);

  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, booths.length) }, async () => {
    while (next < booths.length) {
      const index = next;
      next += 1;
      const booth = booths[index];
      try {
        detailed[index] = describeBooth(booth, await getBooth(booth.name));
      } catch (error) {
        // One unreadable booth must not cost the organiser the whole list.
        console.error('[expofp] could not read booth', booth.name, error.message);
        detailed[index] = describeBooth(booth, null);
      }
    }
  });
  await Promise.all(workers);

  return detailed.filter(Boolean).sort(byBoothName);
}

/** "2" before "10", and names without a number last. */
function byBoothName(a, b) {
  const left = Number(a.name);
  const right = Number(b.name);
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  if (Number.isFinite(left)) return -1;
  if (Number.isFinite(right)) return 1;
  return String(a.name).localeCompare(String(b.name));
}

function describeBooth(listed, full) {
  const exhibitors = (full?.exhibitors || listed.exhibitors || [])
    .map((one) => String(one?.name || one?.company || one?.id || '').trim())
    .filter(Boolean);

  const price = Number(full?.price);
  const status = !full ? 'unknown'
    : exhibitors.length ? 'booked'
      : full.isOnHold ? 'on_hold'
        : full.isSpecialSection || !Number.isFinite(price) || price <= 0 ? 'not_for_sale'
          : 'available';

  return {
    name: String(full?.name || listed.name),
    title: String(full?.title || listed.title || ''),
    type: full?.type || null,
    size: full?.size || null,
    price: Number.isFinite(price) ? price : null,
    status,
    exhibitors,
  };
}

/**
 * update-booth { token, eventId, name, isOnHold }. ExpoFP creates no
 * reservation when it hands the visitor over, so the booth reads Available for
 * the whole checkout unless we hold it. Best effort: a failure is recorded on
 * the checkout rather than blocking the sale.
 */
export async function setBoothOnHold(booth, onHold) {
  if (!isConfigured('setBoothStatus')) {
    console.warn('[expofp] setBoothStatus is not configured - booth stays Available during checkout');
    return { held: false, reason: 'not_configured' };
  }

  const name = booth.booth ? String(booth.booth) : null;
  if (!name) {
    console.warn('[expofp] no booth name to hold - update-booth finds booths by name');
    return { held: false, reason: 'no_booth_name' };
  }

  try {
    await call('setBoothStatus', { eventId: expoId(), name, isOnHold: Boolean(onHold) });
    return { held: Boolean(onHold) };
  } catch (error) {
    console.error('[expofp] hold failed', error.message, error.payload || '');
    return { held: false, reason: 'request_failed' };
  }
}

// ---- exhibitors ---------------------------------------------------------------

/** A website the visitor typed as "acme.com" still becomes a valid URL. */
function normalizeWebsite(value) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch (error) {
    return undefined; // an unusable URL must not cost the booth assignment
  }
}

/** get-exhibitor-id { token, eventId, externalId } -> id, or null when unknown (404). */
export async function getExhibitorId(externalId) {
  try {
    const payload = await call('getExhibitorId', { eventId: expoId(), externalId: String(externalId) });
    return payload?.id ?? null;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/**
 * add-exhibitor { token, eventId, name, externalId, ... } -> { id }.
 *
 * externalId must be unused within the expo, which makes it an idempotency key:
 * if an earlier attempt created the exhibitor but died before its id was saved,
 * the retry gets a 400, looks the exhibitor up by that key and reuses it.
 *
 * The contact's email goes to privateEmail, which visitors never see -
 * publicEmail is left for the exhibitor to fill in themselves.
 */
export async function addExhibitor(exhibitor, externalId, { adminNotes } = {}) {
  const body = {
    eventId: expoId(),
    name: String(exhibitor.company || '').trim().slice(0, 100),
    externalId: String(externalId),
    contactName: exhibitor.contactName || undefined,
    contactPhone: exhibitor.phone || undefined,
    privateEmail: exhibitor.email || undefined,
    website: normalizeWebsite(exhibitor.website),
    adminNotes: adminNotes || undefined,
  };

  try {
    const payload = await call('addExhibitor', body);
    const id = dig(payload, RESPONSE_PATHS.exhibitorId);
    if (id) return id;
    throw new Error('ExpoFP add-exhibitor answered without an id - check EXPOFP_RESPONSE_EXHIBITOR_ID');
  } catch (error) {
    if (error.status === 400) {
      const existing = await getExhibitorId(externalId);
      if (existing) return existing;
    }
    throw error;
  }
}

/**
 * add-exhibitor-booth { token, eventId, boothName, exhibitorId }.
 *
 * exhibitorId goes as a STRING: the reference says either ExpoFP's numeric id
 * or our externalId resolves when sent as a string - so it is the one id here
 * that must not become a JSON number. Success is 200 with no body, or 200
 * "Already added" when the exhibitor is on the booth already; that makes a
 * retry harmless.
 */
export async function addExhibitorBooth(exhibitorId, booth) {
  if (!booth.booth) throw new Error('No booth name to assign - add-exhibitor-booth takes the booth key');
  return call('addExhibitorBooth', {
    eventId: expoId(),
    boothName: String(booth.booth),
    exhibitorId: String(exhibitorId),
  });
}

/**
 * Everything the expo sells, both kinds in one list.
 *
 * list-extras answers { extras, boothExtras }: `extras` are bought once by a
 * company (a listing upgrade), `boothExtras` are bought per booth (furniture,
 * power). Either id is the `extraId` that add-exhibitor-extra takes, so the
 * two are merged here - Power Plugs, for one, is a booth extra.
 */
export async function listExtras() {
  const data = await call('listExtras', { eventId: expoId() });
  if (Array.isArray(data)) return data;
  return [
    ...(Array.isArray(data?.extras) ? data.extras.map((e) => ({ ...e, kind: 'exhibitor' })) : []),
    ...(Array.isArray(data?.boothExtras) ? data.boothExtras.map((e) => ({ ...e, kind: 'booth' })) : []),
  ];
}

/**
 * What one exhibitor already holds. Exhibitor extras and booth extras come
 * back in one array, each with the quantity that exhibitor has of it; an extra
 * they do not hold is absent rather than present with quantity zero.
 */
export async function listExhibitorExtras(exhibitorId) {
  const data = await call('listExhibitorExtras', { exhibitorId: asId(exhibitorId) });
  return Array.isArray(data) ? data : Array.isArray(data?.extras) ? data.extras : [];
}

/**
 * Finds the expo's extra for one of our catalogue entries: its configured
 * `expofpExtraId` first, otherwise the expo's extra of the same name.
 */
async function resolveExtraId(extra, catalogue) {
  if (Number.isInteger(extra.expofpExtraId)) return extra.expofpExtraId;

  const wanted = String(extra.expofpName || extra.name).trim().toLowerCase();
  const match = catalogue.find((one) => String(one.name).trim().toLowerCase() === wanted);
  if (!match) return null;

  console.log(`[expofp] "${extra.name}" is ${match.kind || 'an'} extra ${match.id} on this expo`);
  return asId(match.id);
}

/**
 * Puts the add-ons someone paid for onto their exhibitor record.
 *
 * add-exhibitor-extra takes numeric ids - { token, exhibitorId, extraId,
 * quantity } - so the extra has to exist on the expo first. Its quantity ADDS
 * to what the exhibitor already holds, so a retried fulfilment would hand out
 * a second one: what they hold is read back first, and an extra already there
 * is left alone. Going over limitPerExhibitor is refused by ExpoFP, and
 * nothing is written.
 *
 * Never throws and never fails a fulfilment: the booth and the money matter
 * more, and what was bought is written into the exhibitor's admin notes either
 * way. Set EXPOFP_ASSIGN_EXTRAS=0 to stop assigning altogether.
 */
export async function assignExtras(exhibitorId, extras = []) {
  if (!extras.length) return { assigned: 0, skipped: 'none' };
  if (process.env.EXPOFP_ASSIGN_EXTRAS === '0') return { assigned: 0, skipped: 'disabled' };

  let catalogue = [];
  let held = [];
  try {
    [catalogue, held] = await Promise.all([listExtras(), listExhibitorExtras(exhibitorId)]);
  } catch (error) {
    console.error('[expofp] could not read the expo extras:', error.message);
    return { assigned: 0, skipped: 'lookup_failed' };
  }

  let assigned = 0;
  for (const extra of extras) {
    try {
      const extraId = await resolveExtraId(extra, catalogue);
      if (!extraId) {
        console.error(`[expofp] the expo has no extra named "${extra.name}" - paid for but not assigned. ` +
          'Create it on the expo, then set its id as expofpExtraId in BOOTH_EXTRAS.');
        continue;
      }

      if (held.some((one) => asId(one.id) === extraId && Number(one.quantity) > 0)) {
        console.log('[expofp] exhibitor already holds', extra.name, '- not adding another');
        continue;
      }

      await call('addExhibitorExtra', {
        exhibitorId: asId(exhibitorId),
        extraId,
        quantity: Number(extra.quantity) > 0 ? Number(extra.quantity) : 1,
      });
      assigned += 1;
    } catch (error) {
      console.error('[expofp] add-exhibitor-extra failed for', extra.name, error.message, error.payload || '');
    }
  }
  return { assigned };
}

/**
 * Accepted webhook secrets. Comma or whitespace separated, so that during a
 * rotation both the current and the replacement secret verify - ExpoFP signs
 * with exactly one, and the overlap has to live on our side.
 */
function webhookSecrets() {
  return (process.env.EXPOFP_WEBHOOK_SECRET || '')
    .split(/[\s,]+/)
    .map((secret) => secret.trim())
    .filter(Boolean);
}

/**
 * ExpoFP signs deliveries with HMAC-SHA256:
 *   key     = UTF-8 bytes of the secret string, whsec_ prefix included
 *   message = the raw request body bytes, exactly as they arrived
 * Header: X-ExpoFP-Signature-256: sha256=<64 lowercase hex chars>
 *
 * `rawBytes` must be the untouched body (a Buffer). Decoding it to a string
 * first can drop a BOM or alter invalid sequences, and the hash then fails.
 */
export function verifyWebhook(rawBytes, signatureHeader) {
  const secrets = webhookSecrets();
  if (!secrets.length) return { ok: true, skipped: true };
  // With a secret configured, an unsigned delivery is indistinguishable from
  // a forged one: reject on absence as well as on mismatch.
  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };

  const given = Buffer.from(String(signatureHeader).trim(), 'utf8');
  for (const secret of secrets) {
    const digest = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBytes).digest('hex');
    const expected = Buffer.from(`sha256=${digest}`, 'utf8');
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'mismatch' };
}

/**
 * Booth events arrive in PascalCase ("Type", "BoothId"); exhibitor events in
 * camelCase ("type", "exhibitorId"). Normalise both into one shape.
 */
export function normalizeEvent(event) {
  if (!event || typeof event !== 'object') return null;
  return {
    type: event.Type || event.type || null,
    expoId: event.ExpoId ?? event.expoId ?? null,
    exhibitorId: event.ExhibitorId ?? event.exhibitorId ?? null,
    boothId: event.BoothId ?? event.boothId ?? null,
    boothKey: event.BoothKey ?? event.boothKey ?? null,
    isOnHold: event.IsOnHold ?? event.isOnHold ?? null,
    externalId: event.ExternalId ?? event.externalId ?? null,
    raw: event,
  };
}

export { PATHS };
