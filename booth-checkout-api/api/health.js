import { allowedOrigins, json } from '../lib/http.js';
import {
  HOLD_MINUTES, activeGateway, envValue, gatewayStatus, paypalCredentials, stripeSecretKey,
} from '../lib/config.js';
import { listBooths } from '../lib/expofp.js';

export const config = { runtime: 'nodejs' };

/**
 * Configuration check. Open https://<deployment>/api/health in a browser.
 *
 * Reports only whether things are set - never a key, token or secret. The
 * expo id and allowed origins are shown because they are not secret and are
 * the values most often mistyped.
 *
 * ?deep=1 also calls ExpoFP (list-booths) to prove the token and expo id are
 * accepted. That makes a real API call, so it needs the CRON_SECRET bearer:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" "https://<deployment>/api/health?deep=1"
 */
/**
 * "redis", or what is wrong. The two common mistakes both leave a variable
 * behind that says what happened, so name it.
 */
function storageStatus(has) {
  if ((has('KV_REST_API_URL') || has('UPSTASH_REDIS_REST_URL'))
    && (has('KV_REST_API_TOKEN') || has('UPSTASH_REDIS_REST_TOKEN'))) return 'redis';

  // Redis Cloud (the Marketplace's "Redis") gives only a TCP URL. Upstash gives
  // REDIS_URL too, but always alongside the REST pair checked above.
  if (has('REDIS_URL') || has('KV_URL')) {
    return 'MEMORY - found REDIS_URL, a TCP Redis such as Redis Cloud. This service talks to Upstash ' +
      'over HTTP and needs KV_REST_API_URL + KV_REST_API_TOKEN: connect "Upstash for Redis" instead';
  }

  const prefixed = Object.keys(process.env).find((k) => /.+_(KV_REST_API_URL|UPSTASH_REDIS_REST_URL)$/.test(k));
  if (prefixed) {
    return `MEMORY - found ${prefixed}: the store was connected with a custom variable prefix. ` +
      'Reconnect it without a prefix so the names are KV_REST_API_URL / KV_REST_API_TOKEN';
  }

  return 'MEMORY - not persistent; connect an Upstash Redis store';
}

async function handler(request) {
  const url = new URL(request.url);
  const has = (name) => Boolean(envValue(name));
  const expoId = envValue('EXPOFP_EXPO_ID');
  const stripeKey = envValue('STRIPE_SECRET_KEY');

  const report = {
    expofp: {
      token: has('EXPOFP_API_TOKEN') ? 'set' : 'MISSING',
      expoId: expoId || 'MISSING',
      expoIdIsNumber: /^\d+$/.test(expoId),
      webhookSecret: has('EXPOFP_WEBHOOK_SECRET') ? 'set' : 'not set (deliveries are not verified)',
    },
    gateway: {
      forced: envValue('PAYMENT_GATEWAY') || null,
      stripeKeyInEnv: stripeKey ? (stripeKey.startsWith('pk_') ? 'WRONG KIND (pk_ publishable key)' : stripeKey.includes('_live_') ? 'live' : 'test') : 'no',
      stripeWebhookSecret: has('STRIPE_WEBHOOK_SECRET') ? 'set' : 'not set',
      paypalInEnv: has('PAYPAL_CLIENT_ID') && has('PAYPAL_CLIENT_SECRET') ? (envValue('PAYPAL_ENV') || 'sandbox') : 'no',
      setupPasscode: has('SETUP_PASSCODE') ? 'set'
        : 'not set - the setup form saves keys without a code, so anyone who finds the endpoint can replace them',
      secretsKey: has('SECRETS_KEY') ? 'set' : 'MISSING - saved keys cannot be encrypted',
      ...(has('GATEWAY_KEYS_URL')
        ? { legacyKeyStore: 'GATEWAY_KEYS_URL is still set and no longer used - unset it' }
        : {}),
    },
    storage: storageStatus(has),
    storefront: {
      allowedOrigins: allowedOrigins(),
      checkoutPage: envValue('CHECKOUT_PAGE_URL') || 'not set',
    },
    cronSecret: has('CRON_SECRET') ? 'set' : 'not set (cron endpoint is open)',
    holdMinutes: HOLD_MINUTES,
  };

  // Same checks checkout/start makes before it touches a booth.
  try {
    const status = await gatewayStatus();
    report.gateway.savedKeys = status.source === 'saved' ? `${status.gateway} ${status.hint} (saved ${status.savedAt})` : 'none';
    report.gateway.active = await activeGateway();
    if (report.gateway.active === 'stripe') await stripeSecretKey();
    else await paypalCredentials();
    report.gateway.credentials = 'ok';
  } catch (error) {
    report.gateway.active = report.gateway.active || null;
    report.gateway.credentials = 'PROBLEM';
    report.gateway.problem = error.code || error.message;
  }

  if (url.searchParams.get('deep') === '1') {
    const secret = envValue('CRON_SECRET');
    if (!secret) return json({ error: 'set CRON_SECRET to use deep=1' }, 403);
    if ((request.headers.get('authorization') || '') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);

    try {
      const booths = await listBooths();
      report.expofp.live = `ok - token and expo accepted, ${booths.length} booths`;
    } catch (error) {
      report.expofp.live = error.envName ? `missing_env:${error.envName}`
        : error.status ? `expofp_http_${error.status}` : `unreachable: ${error.message}`;
    }
  }

  report.ok = report.expofp.token === 'set'
    && report.expofp.expoIdIsNumber
    && report.gateway.credentials === 'ok'
    && report.storage === 'redis'
    && report.storefront.allowedOrigins.length > 0
    && (report.expofp.live ? report.expofp.live.startsWith('ok') : true);

  return json(report, 200, { 'Cache-Control': 'no-store' });
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
