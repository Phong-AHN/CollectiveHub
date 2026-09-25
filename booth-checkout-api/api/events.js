import { corsHeaders, json, preflight } from '../lib/http.js';
import { listEvents } from '../lib/events.js';

export const config = { runtime: 'nodejs' };

/**
 * The expos this deployment sells for, so a page can offer a choice instead of
 * having the key typed into a setting.
 *
 * Public on purpose, and only what is already public: the key, the name and
 * the floor plan link. Booth availability and who holds what stay behind the
 * admin code.
 */
async function handler(request) {
  const pre = preflight(request);
  if (pre) return pre;

  const cors = corsHeaders(request);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  const events = listEvents().map((event) => ({
    key: event.key,
    name: event.name,
    floorPlan: event.floorPlan || null,
    isDefault: Boolean(event.isDefault),
  }));

  return json({ events }, 200, { ...cors, 'Cache-Control': 'public, max-age=60' });
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
