import { HttpError } from './http.js';

/**
 * Payment gateway selection and credentials.
 *
 * The storefront's "Payment Gateway Setup" section lets the client pick PayPal
 * or Stripe and stores their keys at GATEWAY_KEYS_URL. Environment variables
 * always win over that store, so production can move to real secret storage
 * without touching this code or the storefront section.
 */
export const GATEWAYS = ['paypal', 'stripe'];

const USABLE = {
  paypal: (record) => Boolean(record.clientId && record.clientscrect),
  stripe: (record) => Boolean(record.stripeapikey),
};

const norm = (value) => String(value || '').trim().toLowerCase();

let records = null;
let recordsAt = 0;
const TTL_MS = 60_000;

/** Records submitted through the storefront section, newest first. */
async function gatewayRecords() {
  if (records && Date.now() - recordsAt < TTL_MS) return records;

  const url = process.env.GATEWAY_KEYS_URL;
  if (!url) return [];

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new HttpError(502, 'gateway_keys_unreachable', `Keys endpoint returned ${response.status}`);
  }

  const payload = await response.json();
  records = (Array.isArray(payload) ? payload : [payload])
    .filter((record) => record && typeof record === 'object')
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  recordsAt = Date.now();
  return records;
}

async function latestRecord(gateway) {
  return (await gatewayRecords()).find(
    (record) => norm(record.paymentgateway) === gateway && USABLE[gateway](record),
  ) || null;
}

/**
 * Which gateway a new checkout should use:
 *   1. PAYMENT_GATEWAY, when set - an explicit override;
 *   2. otherwise whatever the client most recently chose in the storefront
 *      section (the newest usable record at GATEWAY_KEYS_URL);
 *   3. otherwise whichever gateway has credentials in the environment,
 *      PayPal first.
 */
export async function activeGateway() {
  const forced = norm(process.env.PAYMENT_GATEWAY);
  if (forced) {
    if (!GATEWAYS.includes(forced)) {
      throw new HttpError(500, 'gateway_invalid', `PAYMENT_GATEWAY must be one of ${GATEWAYS.join(', ')}.`);
    }
    return forced;
  }

  try {
    const newest = (await gatewayRecords()).find((record) => {
      const gateway = norm(record.paymentgateway);
      return GATEWAYS.includes(gateway) && USABLE[gateway](record);
    });
    if (newest) return norm(newest.paymentgateway);
  } catch (error) {
    // The key store being down should not block a gateway configured in env.
    console.error('[config] gateway records unavailable:', error.message);
  }

  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) return 'paypal';
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';

  throw new HttpError(500, 'gateway_not_configured',
    'No payment gateway configured: submit keys through the Payment Gateway Setup section, ' +
    'or set PayPal / Stripe credentials in the environment.');
}

export async function paypalCredentials() {
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    return {
      clientId: process.env.PAYPAL_CLIENT_ID.trim(),
      clientSecret: process.env.PAYPAL_CLIENT_SECRET.trim(),
      source: 'env',
    };
  }

  const record = await latestRecord('paypal');
  if (!record) {
    throw new HttpError(500, 'gateway_keys_missing',
      'No PayPal credentials: set PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET, or submit them through the Payment Gateway Setup section.');
  }

  return {
    clientId: String(record.clientId).trim(),
    // Field name follows the storefront/API spelling, which is "clientscrect".
    clientSecret: String(record.clientscrect).trim(),
    source: 'gateway_keys_url',
  };
}

/**
 * Stripe secret key. Checkout Sessions are created server-side, which needs a
 * secret (sk_) or restricted (rk_) key - a publishable key (pk_) cannot do it,
 * and is the easiest one to paste by mistake.
 */
export async function stripeSecretKey() {
  const raw = process.env.STRIPE_SECRET_KEY || (await latestRecord('stripe'))?.stripeapikey;
  if (!raw) {
    throw new HttpError(500, 'gateway_keys_missing',
      'No Stripe key: set STRIPE_SECRET_KEY, or submit one through the Payment Gateway Setup section.');
  }

  const key = String(raw).trim();
  if (key.startsWith('pk_')) {
    throw new HttpError(500, 'stripe_publishable_key',
      'That is a Stripe publishable key (pk_...). Checkout needs the secret key (sk_test_... / sk_live_...) or a restricted key (rk_...).');
  }
  if (!/^(sk|rk)_(test|live)_/.test(key)) {
    throw new HttpError(500, 'stripe_key_invalid',
      'The Stripe key should start with sk_test_, sk_live_, rk_test_ or rk_live_.');
  }
  return key;
}

/**
 * An env var, with the whitespace and wrapping quotes that pasting into a
 * dashboard tends to add taken off - a token with a trailing space is a 401.
 */
export function envValue(name) {
  return String(process.env[name] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
}

export function requiredEnv(name) {
  const value = envValue(name);
  if (!value) {
    const error = new HttpError(500, 'missing_env', `Environment variable ${name} is not set.`);
    error.envName = name;
    throw error;
  }
  return value;
}

export const HOLD_MINUTES = Number(process.env.HOLD_MINUTES || 30);
