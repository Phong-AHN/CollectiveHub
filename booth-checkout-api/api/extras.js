import { corsHeaders, json, preflight } from '../lib/http.js';
import { resolveEvent } from '../lib/events.js';
import { sweepIfDue } from '../lib/fulfil.js';
import { extrasCatalogue, extrasForBooth } from '../lib/extras.js';

export const config = { runtime: 'nodejs' };

/**
 * The add-ons the checkout page offers, with their prices.
 *
 * The page reads this instead of carrying its own price list, so a price is
 * only ever set in one place - and what the page shows is what gets charged.
 *
 * ?booth=<name> narrows it to what that booth can have: Power Plugs only
 * reaches the tables with wall space. Without a booth the whole catalogue
 * comes back, each entry carrying the `booths` it is limited to.
 */
async function handler(request) {
  const pre = preflight(request);
  if (pre) return pre;

  const cors = corsHeaders(request);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  const params = new URL(request.url).searchParams;
  const booth = params.get('booth');

  let event;
  try {
    event = resolveEvent(params.get('event'));
  } catch (error) {
    return json({ error: error.code, detail: error.detail }, error.status || 400, cors);
  }

  // Someone is looking at a booth: a good moment to put abandoned ones back
  // on sale. Throttled in Redis, so this costs nothing on a busy page.
  await sweepIfDue({ limit: 3, everySeconds: 60 });

  const extras = booth ? extrasForBooth(booth, event) : extrasCatalogue(event);

  return json({
    currency: (process.env.DEFAULT_CURRENCY || 'USD').toUpperCase(),
    event: event.key,
    booth: booth || null,
    extras,
  }, 200, { ...cors, 'Cache-Control': 'public, max-age=60' });
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
