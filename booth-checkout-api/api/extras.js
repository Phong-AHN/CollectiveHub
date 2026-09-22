import { corsHeaders, json, preflight } from '../lib/http.js';
import { extrasCatalogue } from '../lib/extras.js';

export const config = { runtime: 'nodejs' };

/**
 * The add-ons the checkout page offers, with their prices.
 *
 * The page reads this instead of carrying its own price list, so a price is
 * only ever set in one place - and what the page shows is what gets charged.
 */
async function handler(request) {
  const pre = preflight(request);
  if (pre) return pre;

  const cors = corsHeaders(request);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  return json({
    currency: (process.env.DEFAULT_CURRENCY || 'USD').toUpperCase(),
    extras: extrasCatalogue(),
  }, 200, { ...cors, 'Cache-Control': 'public, max-age=60' });
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
