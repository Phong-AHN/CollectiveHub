import crypto from 'node:crypto';
import { stripeSecretKey } from './config.js';
import { HttpError } from './http.js';

const BASE = 'https://api.stripe.com';

// Amounts go to Stripe in the currency's smallest unit; these have none.
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

export function toMinorUnits(amount, currency) {
  const value = Number(amount);
  return ZERO_DECIMAL.has(String(currency).toUpperCase()) ? Math.round(value) : Math.round(value * 100);
}

/**
 * Stripe takes application/x-www-form-urlencoded with bracket notation:
 * { line_items: [{ price_data: { currency: 'usd' } }] }
 *   -> line_items[0][price_data][currency]=usd
 */
export function toForm(params, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === 'object') toForm(item, `${name}[${index}]`, out);
        else out.append(`${name}[${index}]`, String(item));
      });
    } else if (typeof value === 'object') {
      toForm(value, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

async function api(path, { method = 'POST', params, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${await stripeSecretKey()}` };
  let body;
  if (params) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = toForm(params).toString();
  }
  // Makes retries safe: Stripe replays the first result instead of creating twice.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`${BASE}${path}`, { method, headers, body });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new HttpError(502, 'stripe_request_failed',
      `${method} ${path} returned ${response.status}: ${payload?.error?.message || 'no message'}`);
    error.payload = payload?.error || payload;
    throw error;
  }
  return payload;
}

/**
 * Opens a Stripe Checkout Session for one booth.
 *
 * `expiresAt` (unix seconds) closes the session; Stripe accepts 30 minutes to
 * 24 hours from now. Once it passes nobody can pay on it, which is what lets
 * the booth hold end safely - see checkout/start.
 */
export async function createCheckoutSession({
  checkoutId, items, currency, email, successUrl, cancelUrl, expiresAt,
}) {
  const session = await api('/v1/checkout/sessions', {
    idempotencyKey: `cs-${checkoutId}`,
    params: {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Rides along on the session and on every webhook for it.
      client_reference_id: checkoutId,
      metadata: { checkoutId },
      payment_intent_data: { metadata: { checkoutId } },
      customer_email: email || undefined,
      expires_at: expiresAt,
      // One line per thing bought - the booth, then any add-ons - so the
      // Stripe page and the receipt itemise what the exhibitor is paying for.
      line_items: items.map((item) => ({
        quantity: 1,
        price_data: {
          currency: String(currency).toLowerCase(),
          unit_amount: toMinorUnits(item.amount, currency),
          product_data: {
            name: String(item.name).slice(0, 250),
            ...(item.description ? { description: String(item.description).slice(0, 500) } : {}),
          },
        },
      })),
    },
  });

  if (!session?.url) throw new HttpError(502, 'stripe_no_session_url', 'Checkout Session carried no URL');
  return { id: session.id, url: session.url, expiresAt: session.expires_at };
}

export async function retrieveSession(sessionId) {
  return api(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET' });
}

/** Closes an open session so it can no longer be paid. */
export async function expireSession(sessionId) {
  return api(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {});
}

/**
 * Stripe-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]
 *   signed payload = "<t>." + raw body bytes
 *   signature      = HMAC-SHA256(endpoint secret, signed payload), hex
 *
 * Unlike ExpoFP's, Stripe's timestamp is inside the signature, so it is safe
 * to reject old deliveries on it - that is the replay protection.
 * STRIPE_WEBHOOK_SECRET takes a comma-separated list for rotation.
 */
export function verifyWebhook(rawBytes, header, { toleranceSeconds = 300, nowMs = Date.now() } = {}) {
  const secrets = (process.env.STRIPE_WEBHOOK_SECRET || '')
    .split(/[\s,]+/)
    .map((secret) => secret.trim())
    .filter(Boolean);
  if (!secrets.length) return { ok: true, skipped: true };
  if (!header) return { ok: false, reason: 'missing_signature' };

  let timestamp = null;
  const candidates = [];
  for (const part of String(header).split(',')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') timestamp = value;
    else if (key === 'v1' && value) candidates.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || !candidates.length) {
    return { ok: false, reason: 'malformed_signature' };
  }
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > toleranceSeconds) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  const signed = Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), rawBytes]);
  for (const secret of secrets) {
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(signed).digest('hex'), 'utf8');
    for (const candidate of candidates) {
      const given = Buffer.from(candidate, 'utf8');
      if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return { ok: true };
    }
  }
  return { ok: false, reason: 'mismatch' };
}
