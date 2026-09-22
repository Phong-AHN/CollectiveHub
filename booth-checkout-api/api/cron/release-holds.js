import { json } from '../../lib/http.js';
import { sweepExpiredHolds } from '../../lib/fulfil.js';

export const config = { runtime: 'nodejs' };

/**
 * Puts abandoned booths back on sale.
 *
 * Triggered three ways, all safe to overlap:
 *  - Vercel Cron, once a day (the most the Hobby plan allows);
 *  - every POST /api/checkout/start, which sweeps before holding;
 *  - optionally an external scheduler (cron-job.org, Upstash QStash, ...)
 *    calling this URL every few minutes with the CRON_SECRET bearer token.
 * Accepts GET and POST so any of those can call it.
 */
async function handler(request) {
  // Vercel Cron sends this header itself; an external scheduler must send it
  // too. Without a secret configured the endpoint is open.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  }

  const results = await sweepExpiredHolds(100);
  const released = results.filter((r) => r.released).length;

  if (results.length) console.log('[cron/release-holds] due', results.length, 'released', released);
  return json({ ok: true, checked: results.length, released, results });
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
