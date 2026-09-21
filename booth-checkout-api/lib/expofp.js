import crypto from 'node:crypto';
import { BASE_URL, FIELDS, PATHS, RESPONSE_PATHS, assertConfigured, isConfigured } from './expofp-endpoints.js';
import { requiredEnv } from './config.js';

async function call(operation, body) {
  const path = assertConfigured(operation);
  const url = `${BASE_URL.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Auth is a token field in the body - never in the URL.
    body: JSON.stringify({ [FIELDS.token]: requiredEnv('EXPOFP_API_TOKEN'), ...body }),
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

const expoId = () => requiredEnv('EXPOFP_EXPO_ID');

export async function addExhibitor(exhibitor, externalId) {
  const payload = await call('addExhibitor', {
    [FIELDS.expoId]: expoId(),
    [FIELDS.name]: exhibitor.company,
    [FIELDS.email]: exhibitor.email,
    [FIELDS.phone]: exhibitor.phone || '',
    [FIELDS.website]: exhibitor.website || '',
    [FIELDS.externalId]: externalId,
  });

  const id = dig(payload, RESPONSE_PATHS.exhibitorId);
  if (!id) {
    throw new Error('ExpoFP addExhibitor returned no exhibitor id - check EXPOFP_RESPONSE_EXHIBITOR_ID');
  }
  return id;
}

export async function addExhibitorBooth(exhibitorId, booth) {
  return call('addExhibitorBooth', {
    [FIELDS.expoId]: expoId(),
    [FIELDS.exhibitorId]: exhibitorId,
    ...(booth.boothId ? { [FIELDS.boothId]: booth.boothId } : {}),
    ...(booth.booth ? { [FIELDS.boothKey]: booth.booth } : {}),
  });
}

export async function addExhibitorExtra(exhibitorId, extra) {
  if (!isConfigured('addExhibitorExtra')) return null;
  return call('addExhibitorExtra', {
    [FIELDS.expoId]: expoId(),
    [FIELDS.exhibitorId]: exhibitorId,
    ...extra,
  });
}

/**
 * Best-effort hold. ExpoFP creates no reservation when it hands the visitor
 * over, so the booth reads Available for the whole checkout unless we hold it.
 * If the endpoint is not configured yet we carry on rather than block a sale -
 * the caller records that the booth was never held.
 */
export async function setBoothOnHold(booth, onHold) {
  if (!isConfigured('setBoothStatus')) {
    console.warn('[expofp] setBoothStatus is not configured - booth stays Available during checkout');
    return { held: false, reason: 'not_configured' };
  }

  try {
    await call('setBoothStatus', {
      [FIELDS.expoId]: expoId(),
      ...(booth.boothId ? { [FIELDS.boothId]: booth.boothId } : {}),
      ...(booth.booth ? { [FIELDS.boothKey]: booth.booth } : {}),
      [FIELDS.isOnHold]: Boolean(onHold),
    });
    return { held: Boolean(onHold) };
  } catch (error) {
    console.error('[expofp] hold failed', error.message, error.payload || '');
    return { held: false, reason: 'request_failed' };
  }
}

/**
 * ExpoFP signs webhook deliveries with HMAC-SHA256 over the raw body bytes.
 * Header: X-ExpoFP-Signature-256, value "sha256=<lowercase hex>".
 */
export function verifyWebhook(rawBody, signatureHeader) {
  const secret = process.env.EXPOFP_WEBHOOK_SECRET;
  if (!secret) return { ok: true, skipped: true };
  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, reason: ok ? undefined : 'mismatch' };
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
