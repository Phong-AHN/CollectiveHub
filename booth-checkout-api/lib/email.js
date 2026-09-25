import { envValue } from './config.js';
import { defaultEvent } from './events.js';

/**
 * The two emails a sale sends: the buyer's receipt, and the organiser's
 * notice of who just bought what.
 *
 * Sent through Resend's HTTP API - no SDK, one POST each. They go out at the
 * end of fulfilment, after the booth is assigned on the floor plan, so an email
 * never promises a booth that did not land. Sending is best effort: a failure
 * is retried by the same queue that retries the ExpoFP writes, and never undoes
 * a sale. The two are tracked separately, so one failing cannot re-send the
 * other.
 */
const API = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export function emailConfigured() {
  return Boolean(envValue('RESEND_API_KEY') && envValue('EMAIL_FROM'));
}

/** Who at the event gets told about a sale. Empty = nobody, and that is fine. */
export function organiserAddresses(event) {
  return addresses((event || defaultEvent())?.organiser || envValue('ORGANISER_EMAIL'));
}

/** "a@b.test, c@d.test" -> ['a@b.test', 'c@d.test'] */
function addresses(value) {
  return String(value || '').split(/[,;]/).map((one) => one.trim()).filter(Boolean);
}

export function formatMoney(amount, currency = 'USD') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch (error) {
    // An unknown currency code should not cost anyone their receipt.
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Everything that reaches the HTML comes from a buyer's form. Escape it. */
const escape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * The lines of the receipt, as data: the text and the HTML are two renderings
 * of this one list, so they can never drift apart.
 */
function receiptRows(record) {
  const booth = record.booth || {};
  const exhibitor = record.exhibitor || {};
  const currency = booth.currency || 'USD';
  const extras = record.extras || [];

  return [
    ['Booth', booth.booth],
    booth.type ? ['Type', booth.type] : null,
    booth.size ? ['Size', booth.size] : null,
    ['Booth price', formatMoney(booth.price, currency)],
    ...extras.map((extra) => [extra.name, formatMoney(extra.price, currency)]),
    ['Total paid', formatMoney(record.amount ?? booth.price, currency)],
    ['Company', exhibitor.company],
    ['Contact', [exhibitor.contactName, exhibitor.phone].filter(Boolean).join(' · ')],
    record.paymentReference ? ['Payment reference', record.paymentReference] : null,
    ['Order reference', record.id],
  ].filter(Boolean).filter(([, value]) => String(value ?? '').trim());
}

export function receiptMessage(record, event) {
  const booth = record.booth || {};
  const exhibitor = record.exhibitor || {};
  const where = event || defaultEvent();
  // Two expos, two floor plans: a receipt that links to the wrong one sends
  // the exhibitor to a plan their booth is not on.
  const shop = where?.name || envValue('SHOP_NAME') || 'Collective Hub';
  const floorPlan = where?.floorPlan || envValue('FLOOR_PLAN_URL');
  const rows = receiptRows(record);
  const subject = `Booth ${booth.booth} is confirmed - ${shop}`;

  const text = [
    `Hi ${exhibitor.contactName || 'there'},`,
    '',
    `Your payment went through and booth ${booth.booth} is now yours at ${shop}.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    floorPlan ? `See it on the floor plan: ${floorPlan}` : null,
    '',
    'Keep this email as your confirmation. Reply to it if anything looks wrong.',
    '',
    shop,
  ].filter((line) => line !== null).join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17130f;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a7f75;">${escape(shop)}</p>
          <h1 style="margin:0;font-size:22px;line-height:1.3;">Booth ${escape(booth.booth)} is confirmed</h1>
          <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#4a423b;">
            Hi ${escape(exhibitor.contactName || 'there')}, your payment went through and the booth is now held in your name on the floor plan.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px 4px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;">
            ${rows.map(([label, value], index) => `<tr>
              <td style="padding:8px 0;color:#6e645c;border-top:${index ? '1px solid #eee7dd' : '0'};">${escape(label)}</td>
              <td style="padding:8px 0;text-align:right;font-weight:600;border-top:${index ? '1px solid #eee7dd' : '0'};">${escape(value)}</td>
            </tr>`).join('')}
          </table>
        </td>
      </tr>
      ${floorPlan ? `<tr>
        <td style="padding:16px 28px 0;">
          <a href="${escape(floorPlan)}" style="display:inline-block;padding:12px 20px;background:#17130f;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View the floor plan</a>
        </td>
      </tr>` : ''}
      <tr>
        <td style="padding:20px 28px 28px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#8a7f75;">
            Keep this email as your confirmation. Reply to it if anything looks wrong.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

/**
 * What the organiser needs: who bought, how to reach them, and what was paid.
 * Written for someone running the event, not for the buyer - so it leads with
 * the booth and the company, and carries the contact details in full.
 */
export function organiserMessage(record, event) {
  const booth = record.booth || {};
  const exhibitor = record.exhibitor || {};
  const currency = booth.currency || 'USD';
  const total = formatMoney(record.amount ?? booth.price, currency);
  const shop = (event || defaultEvent())?.name || envValue('SHOP_NAME') || 'Collective Hub';
  const extras = (record.extras || []).map((extra) => `${extra.name} (${formatMoney(extra.price, currency)})`);

  const subject = `Booth ${booth.booth} sold - ${exhibitor.company || 'unknown company'} - ${total}`;

  const rows = [
    ['Booth', [booth.booth, booth.type, booth.size].filter(Boolean).join(' · ')],
    ['Total paid', total],
    ['Add-ons', extras.length ? extras.join(', ') : 'none'],
    ['Company', exhibitor.company],
    ['Contact', exhibitor.contactName],
    ['Email', exhibitor.email],
    ['Phone', exhibitor.phone],
    ['Paid with', record.gateway],
    ['Payment reference', record.paymentReference],
    ['Transaction', record.paymentTransaction],
    ['ExpoFP exhibitor id', record.exhibitorId],
    ['Order reference', record.id],
  ].filter(([, value]) => String(value ?? '').trim());

  const text = [
    `${booth.booth} went to ${exhibitor.company || 'an unnamed company'} for ${total}.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Reply to this email to reach the buyer directly.',
    '',
    shop,
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f2ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#17130f;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#8a7f75;">${escape(shop)} · booth sold</p>
          <h1 style="margin:0;font-size:22px;line-height:1.3;">Booth ${escape(booth.booth)} - ${escape(exhibitor.company || 'unnamed company')}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;">
            ${rows.map(([label, value], index) => `<tr>
              <td style="padding:8px 0;color:#6e645c;border-top:${index ? '1px solid #eee7dd' : '0'};">${escape(label)}</td>
              <td style="padding:8px 0;text-align:right;font-weight:600;border-top:${index ? '1px solid #eee7dd' : '0'};">${escape(value)}</td>
            </tr>`).join('')}
          </table>
          <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#8a7f75;">Reply to this email to reach the buyer directly.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

/**
 * One POST to Resend. Returns why it did not send rather than throwing, so the
 * caller can tell "nothing to send" from "try again later".
 *
 * Resend de-duplicates on Idempotency-Key for 24 hours, so a retry after a
 * reply we never saw cannot mail the same person twice.
 */
async function post({ to, message, idempotencyKey, replyTo = [], bcc = [] }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${envValue('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: envValue('EMAIL_FROM'),
        to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(replyTo.length ? { reply_to: replyTo } : {}),
        ...(bcc.length ? { bcc } : {}),
      }),
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      // 4xx is ours to fix (bad key, unverified domain) and retrying will not
      // help, but the sale is already done - so say which it is and move on.
      return {
        sent: false,
        reason: response.status >= 500 || response.status === 429 ? 'send_failed' : 'rejected',
        error: `resend ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    let id = null;
    try { id = JSON.parse(body).id ?? null; } catch (error) { /* an id is nice, not required */ }
    return { sent: true, id };
  } catch (error) {
    return { sent: false, reason: 'send_failed', error: error.name === 'AbortError' ? 'resend timed out' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

/** The buyer's receipt. */
export async function sendReceipt(record, event) {
  if (!emailConfigured()) return { sent: false, reason: 'not_configured' };

  const to = addresses(record.exhibitor?.email);
  if (!to.length) return { sent: false, reason: 'no_address' };

  return post({
    to,
    message: receiptMessage(record, event),
    idempotencyKey: `receipt-${record.id}`,
    replyTo: addresses(envValue('EMAIL_REPLY_TO')),
    bcc: addresses(envValue('EMAIL_BCC')),
  });
}

/**
 * The organiser's notice. Its reply-to is the buyer, so answering a question
 * about a sale reaches the exhibitor without anyone copying an address out.
 */
export async function sendOrganiserNotice(record, event) {
  if (!emailConfigured()) return { sent: false, reason: 'not_configured' };

  const to = organiserAddresses(event);
  if (!to.length) return { sent: false, reason: 'no_address' };

  return post({
    to,
    message: organiserMessage(record, event),
    idempotencyKey: `organiser-${record.id}`,
    replyTo: addresses(record.exhibitor?.email),
  });
}
