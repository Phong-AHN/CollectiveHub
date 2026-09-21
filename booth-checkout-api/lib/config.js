import { HttpError } from './http.js';

/**
 * PayPal credentials.
 *
 * The storefront has a "Payment Gateway Setup" section where the client enters
 * the keys they want to use; it stores them at GATEWAY_KEYS_URL. Environment
 * variables win when they are set, so production can be switched over to real
 * secret storage without touching this code or the storefront section.
 */
let cached = null;
let cachedAt = 0;
const TTL_MS = 60_000;

export async function paypalCredentials() {
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    return {
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      source: 'env',
    };
  }

  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const url = process.env.GATEWAY_KEYS_URL;
  if (!url) {
    throw new HttpError(500, 'gateway_not_configured',
      'Set PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET, or GATEWAY_KEYS_URL pointing at the keys the client submitted.');
  }

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new HttpError(502, 'gateway_keys_unreachable', `Keys endpoint returned ${response.status}`);
  }

  const records = await response.json();
  const list = Array.isArray(records) ? records : [records];

  // The client can submit more than once; the newest PayPal record wins.
  const paypal = list
    .filter((record) => record && String(record.paymentgateway).toLowerCase() === 'paypal')
    .filter((record) => record.clientId && record.clientscrect)
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];

  if (!paypal) {
    throw new HttpError(500, 'gateway_keys_missing',
      'No PayPal record with clientId and clientscrect found at GATEWAY_KEYS_URL.');
  }

  cached = {
    clientId: String(paypal.clientId).trim(),
    // Field name follows the storefront/API spelling, which is "clientscrect".
    clientSecret: String(paypal.clientscrect).trim(),
    source: 'gateway_keys_url',
  };
  cachedAt = Date.now();
  return cached;
}

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new HttpError(500, 'missing_env', `Environment variable ${name} is not set.`);
  return value;
}

export const HOLD_MINUTES = Number(process.env.HOLD_MINUTES || 30);
