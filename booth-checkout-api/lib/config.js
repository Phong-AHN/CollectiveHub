import { HttpError } from './http.js';
import { decryptSecret, encryptSecret, keyHint } from './secrets.js';
import { readSecret, saveSecret } from './store.js';

/**
 * Payment gateway selection and credentials.
 *
 * The storefront's "Payment Gateway Setup" section posts the client's keys to
 * this service, which encrypts them and keeps them in Redis - no endpoint ever
 * gives a key back, only a hint like sk_live_****4242. Environment variables
 * still win, so a deployment can be pinned to keys held by Vercel instead.
 */
export const GATEWAYS = ['paypal', 'stripe'];

const norm = (value) => String(value || '').trim().toLowerCase();
const SECRET_NAME = 'gateway';

let cached = null;
let cachedAt = 0;
const TTL_MS = 60_000;

/** What the client saved, decrypted. Null when they have saved nothing. */
async function storedCredentials() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  const record = await readSecret(SECRET_NAME);
  if (!record || !record.blob) return null;

  let secrets;
  try {
    secrets = JSON.parse(decryptSecret(record.blob));
  } catch (error) {
    // Almost always SECRETS_KEY changed: the keys are still there, just no
    // longer readable. Say so, rather than letting it surface as a 500.
    throw new HttpError(500, 'gateway_keys_unreadable',
      'The saved payment keys cannot be decrypted - SECRETS_KEY is not the value they were saved with. '
      + 'Restore that value, or save the keys again through the Payment Gateway Setup section.');
  }

  cached = { gateway: norm(record.gateway), savedAt: record.savedAt, hint: record.hint, ...secrets };
  cachedAt = Date.now();
  return cached;
}

/** Encrypts and stores what the setup form submitted. */
export async function saveGatewayCredentials({ gateway, stripeSecretKey: stripeKey, paypalClientId, paypalClientSecret }) {
  const secrets = gateway === 'stripe'
    ? { stripeSecretKey: stripeKey }
    : { paypalClientId, paypalClientSecret };

  const record = {
    gateway,
    savedAt: new Date().toISOString(),
    hint: keyHint(gateway === 'stripe' ? stripeKey : paypalClientId),
    blob: encryptSecretPayload(secrets),
  };

  await saveSecret(SECRET_NAME, record);
  cached = null;
  cachedAt = 0;
  return { gateway: record.gateway, hint: record.hint, savedAt: record.savedAt };
}

/** What the setup section shows: enough to recognise, never enough to use. */
export async function gatewayStatus() {
  const envStripe = Boolean(envValue('STRIPE_SECRET_KEY'));
  const envPaypal = Boolean(envValue('PAYPAL_CLIENT_ID') && envValue('PAYPAL_CLIENT_SECRET'));
  if (envStripe || envPaypal) {
    return { configured: true, source: 'environment', gateway: envStripe ? 'stripe' : 'paypal', hint: null, savedAt: null };
  }

  const stored = await storedCredentials();
  if (!stored) return { configured: false, source: null, gateway: null, hint: null, savedAt: null };
  return { configured: true, source: 'saved', gateway: stored.gateway, hint: stored.hint, savedAt: stored.savedAt };
}

/**
 * Which gateway a new checkout should use:
 *   1. PAYMENT_GATEWAY, when set - an explicit override;
 *   2. otherwise whatever the client most recently chose in the storefront
 *      section, as saved by this service;
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
    const stored = await storedCredentials();
    if (stored && GATEWAYS.includes(stored.gateway)) return stored.gateway;
  } catch (error) {
    // Unreadable stored keys must not hide a gateway configured in env.
    console.error('[config] stored gateway credentials unreadable:', error.message);
  }

  if (envValue('PAYPAL_CLIENT_ID') && envValue('PAYPAL_CLIENT_SECRET')) return 'paypal';
  if (envValue('STRIPE_SECRET_KEY')) return 'stripe';

  throw new HttpError(500, 'gateway_not_configured',
    'No payment gateway configured: submit keys through the Payment Gateway Setup section, ' +
    'or set PayPal / Stripe credentials in the environment.');
}

export async function paypalCredentials() {
  if (envValue('PAYPAL_CLIENT_ID') && envValue('PAYPAL_CLIENT_SECRET')) {
    return {
      clientId: envValue('PAYPAL_CLIENT_ID'),
      clientSecret: envValue('PAYPAL_CLIENT_SECRET'),
      source: 'env',
    };
  }

  const stored = await storedCredentials();
  if (!stored?.paypalClientId || !stored?.paypalClientSecret) {
    throw new HttpError(500, 'gateway_keys_missing',
      'No PayPal credentials: set PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET, or submit them through the Payment Gateway Setup section.');
  }

  return {
    clientId: String(stored.paypalClientId).trim(),
    clientSecret: String(stored.paypalClientSecret).trim(),
    source: 'saved',
  };
}

/**
 * Stripe secret key. Checkout Sessions are created server-side, which needs a
 * secret (sk_) or restricted (rk_) key - a publishable key (pk_) cannot do it,
 * and is the easiest one to paste by mistake.
 */
export async function stripeSecretKey() {
  const raw = envValue('STRIPE_SECRET_KEY') || (await storedCredentials())?.stripeSecretKey;
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

// Kept at the bottom so encryptSecret's import does not shadow the export above.
function encryptSecretPayload(secrets) {
  return encryptSecret(JSON.stringify(secrets));
}
