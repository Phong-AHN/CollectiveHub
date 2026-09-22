import { json } from '../../lib/http.js';
import { retryFailedFulfilments, sweepExpiredHolds } from '../../lib/fulfil.js';

export const config = { runtime: 'nodejs' };

/**
 * Housekeeping:
 *  1. puts abandoned booths back on sale (expired holds);
 *  2. retries paid checkouts whose ExpoFP write failed.
 *
 * Triggered three ways, all safe to overlap:
 *  - Vercel Cron, once a day (the most the Hobby plan allows);
 *  - every POST /api/checkout/start sweeps holds (not retries) before holding;
 *  - optionally an external scheduler (cron-job.org, Upstash QStash, ...)
 *    calling this URL every few minutes with the CRON_SECRET bearer token.
 * Accepts GET and POST so any of those can call it.
 *
 * ?retry=all retries every failed fulfilment now, ignoring its backoff - for
 * use right after fixing whatever made them fail.
 */
async function handler(request) {
  // Vercel Cron sends this header itself; an external scheduler must send it
  // too. Without a secret configured the endpoint is open.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  }

  const all = new URL(request.url).searchParams.get('retry') === 'all';

  const holds = await sweepExpiredHolds(100);
  const retries = await retryFailedFulfilments({ limit: 20, all });

  const released = holds.filter((r) => r.released).length;
  const fulfilled = retries.filter((r) => r.ok && !r.inFlight).length;
  if (holds.length || retries.length) {
    console.log('[cron] holds due', holds.length, 'released', released,
      '| retries', retries.length, 'fulfilled', fulfilled);
  }

  return json({
    ok: true,
    holds: { checked: holds.length, released, results: holds },
    retries: { attempted: retries.length, fulfilled, results: retries },
  });
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
