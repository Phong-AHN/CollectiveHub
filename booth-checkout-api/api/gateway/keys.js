import { HttpError, corsHeaders, json, preflight } from '../../lib/http.js';
import { GATEWAYS, envValue, gatewayStatus, saveGatewayCredentials } from '../../lib/config.js';
import { sameSecret } from '../../lib/secrets.js';
import { countAttempt, persistentStorageConfigured } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

// Guessing the passcode is the only way in, so make guessing impractical.
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_S = 60 * 60;

/**
 * The payment keys behind the storefront's "Payment Gateway Setup" section.
 *
 * GET  - whether keys are saved, and a hint like sk_live_****4242. Never a key.
 * POST - saves keys, encrypted. Needs the setup passcode, so a stranger who
 *        finds this URL cannot point the checkout at their own Stripe account.
 *
 * The keys only ever travel one way: in. Nothing here can read one back out.
 */
async function handler(request) {
  const pre = preflight(request);
  if (pre) return pre;

  const cors = corsHeaders(request);

  try {
    if (request.method === 'GET') return json(await gatewayStatus(), 200, { ...cors, 'Cache-Control': 'no-store' });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);

    if (process.env.VERCEL && !persistentStorageConfigured()) {
      throw new HttpError(503, 'storage_not_configured',
        'No Redis connected: keys would be lost. Add an Upstash Redis store and redeploy.');
    }

    const passcode = envValue('SETUP_PASSCODE');
    if (!passcode) {
      throw new HttpError(503, 'setup_passcode_missing',
        'Set SETUP_PASSCODE before anyone can save payment keys.');
    }

    const body = await request.json();

    // Count first: a wrong guess costs an attempt whether or not it was close.
    const attempts = await countAttempt(`setup:${clientKey(request)}`, ATTEMPT_WINDOW_S);
    if (attempts > MAX_ATTEMPTS) {
      throw new HttpError(429, 'too_many_attempts', 'Too many attempts. Try again in an hour.');
    }
    if (!sameSecret(body.passcode, passcode)) {
      throw new HttpError(401, 'passcode_wrong', 'That setup code is not right.');
    }

    const gateway = String(body.gateway || '').trim().toLowerCase();
    if (!GATEWAYS.includes(gateway)) {
      throw new HttpError(400, 'gateway_invalid', `Choose one of ${GATEWAYS.join(', ')}.`);
    }

    const credentials = gateway === 'stripe'
      ? { gateway, stripeSecretKey: readStripeKey(body) }
      : { gateway, ...readPaypal(body) };

    const saved = await saveGatewayCredentials(credentials);
    console.log('[gateway/keys] saved', saved.gateway, saved.hint);
    return json({ ok: true, ...saved }, 200, cors);
  } catch (error) {
    if (error instanceof HttpError) {
      console.error('[gateway/keys]', error.code, error.detail || '');
      return json({ error: error.code, detail: error.detail }, error.status, cors);
    }
    console.error('[gateway/keys]', error);
    return json({ error: 'internal_error' }, 500, cors);
  }
}

/** Per-IP, so one person guessing cannot lock everyone else out. */
function clientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return (forwarded.split(',')[0] || 'unknown').trim().slice(0, 45) || 'unknown';
}

function readStripeKey(body) {
  const key = String(body.stripeSecretKey || '').trim();
  if (!key) throw new HttpError(400, 'key_missing', 'Paste your Stripe secret key.');
  if (key.startsWith('pk_')) {
    throw new HttpError(400, 'stripe_publishable_key',
      'That is the publishable key (pk_...). Checkout needs the secret key, which starts with sk_.');
  }
  if (!/^(sk|rk)_(test|live)_/.test(key)) {
    throw new HttpError(400, 'stripe_key_invalid', 'A Stripe secret key starts with sk_test_ or sk_live_.');
  }
  return key;
}

function readPaypal(body) {
  const paypalClientId = String(body.paypalClientId || '').trim();
  const paypalClientSecret = String(body.paypalClientSecret || '').trim();
  if (!paypalClientId || !paypalClientSecret) {
    throw new HttpError(400, 'key_missing', 'Paste both the PayPal client ID and secret.');
  }
  return { paypalClientId, paypalClientSecret };
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
