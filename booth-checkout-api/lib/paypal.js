import { paypalCredentials } from './config.js';
import { HttpError } from './http.js';

const LIVE = 'https://api-m.paypal.com';
const SANDBOX = 'https://api-m.sandbox.paypal.com';

export function paypalBase() {
  return String(process.env.PAYPAL_ENV || 'sandbox').toLowerCase() === 'live' ? LIVE : SANDBOX;
}

let token = null;
let tokenExpiresAt = 0;

async function accessToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;

  const { clientId, clientSecret } = await paypalCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new HttpError(502, 'paypal_auth_failed', `Token request returned ${response.status}`);
  }

  const payload = await response.json();
  token = payload.access_token;
  tokenExpiresAt = Date.now() + Number(payload.expires_in || 3000) * 1000;
  return token;
}

async function api(path, { method = 'POST', body, requestId } = {}) {
  const headers = {
    Authorization: `Bearer ${await accessToken()}`,
    'Content-Type': 'application/json',
  };
  // Makes retries safe: PayPal returns the original order instead of a second one.
  if (requestId) headers['PayPal-Request-Id'] = requestId;

  const response = await fetch(`${paypalBase()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new HttpError(502, 'paypal_request_failed', `${method} ${path} returned ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function createOrder({ checkoutId, amount, currency, description, returnUrl, cancelUrl }) {
  const order = await api('/v2/checkout/orders', {
    requestId: checkoutId,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          // Comes back on the capture and on the webhook, so we can find our record.
          custom_id: checkoutId,
          description: description.slice(0, 127),
          amount: {
            currency_code: currency,
            value: Number(amount).toFixed(2),
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: returnUrl,
            cancel_url: cancelUrl,
          },
        },
      },
    },
  });

  const approve = (order.links || []).find((link) => link.rel === 'payer-action' || link.rel === 'approve');
  if (!approve) throw new HttpError(502, 'paypal_no_approve_link', 'Order carried no approval link');

  return { id: order.id, url: approve.href };
}

export async function captureOrder(orderId, checkoutId) {
  return api(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { requestId: `cap-${checkoutId}` });
}

export async function getOrder(orderId) {
  return api(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
}

/** Asks PayPal to verify a webhook delivery rather than checking the signature ourselves. */
export async function verifyWebhook(headers, rawBody) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.warn('[paypal] PAYPAL_WEBHOOK_ID is not set - webhook signature is NOT verified');
    return { ok: true, skipped: true };
  }

  const payload = await api('/v1/notifications/verify-webhook-signature', {
    body: {
      auth_algo: headers.get('paypal-auth-algo'),
      cert_url: headers.get('paypal-cert-url'),
      transmission_id: headers.get('paypal-transmission-id'),
      transmission_sig: headers.get('paypal-transmission-sig'),
      transmission_time: headers.get('paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    },
  });

  return { ok: payload.verification_status === 'SUCCESS' };
}

export function captureIdOf(captureResponse) {
  const unit = captureResponse?.purchase_units?.[0];
  return unit?.payments?.captures?.[0]?.id || null;
}
