import { HttpError, corsHeaders, json, preflight } from '../../lib/http.js';
import { envValue } from '../../lib/config.js';
import { listBoothsWithStatus } from '../../lib/expofp.js';
import { sameSecret } from '../../lib/secrets.js';
import { attemptCount, countAttempt, readCache, writeCache } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_S = 60 * 60;
// Reading 54 booths takes a moment; a list this fresh is fresh enough for
// someone picking one, and a page reload should not repeat all of it.
const CACHE_SECONDS = Number(process.env.ADMIN_BOOTHS_CACHE_SECONDS || 30);

/**
 * Every booth with its status, for the admin page's picker.
 *
 * Behind ADMIN_PASSCODE (header `X-Admin-Passcode`, so the code stays out of
 * the URL and the logs): it lists who holds which booth, which is nobody
 * else's business.
 *
 *   available    - free, priced, and bookable
 *   on_hold      - someone is paying for it right now, or a hold was left on it
 *   booked       - assigned to an exhibitor
 *   not_for_sale - a special section, or no price on the plan
 */
async function handler(request) {
  const pre = preflight(request);
  if (pre) return pre;

  const cors = corsHeaders(request);
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);

  try {
    const passcode = envValue('ADMIN_PASSCODE');
    if (!passcode) {
      throw new HttpError(503, 'admin_passcode_missing',
        'Set ADMIN_PASSCODE before anyone can book a booth without paying.');
    }

    const url = new URL(request.url);
    const given = request.headers.get('x-admin-passcode') || url.searchParams.get('passcode');

    const attemptKey = `admin:${clientKey(request)}`;
    if (await attemptCount(attemptKey) > MAX_ATTEMPTS) {
      throw new HttpError(429, 'too_many_attempts', 'Too many attempts. Try again in an hour.');
    }
    if (!sameSecret(given, passcode)) {
      await countAttempt(attemptKey, ATTEMPT_WINDOW_S);
      throw new HttpError(401, 'passcode_wrong', 'That admin code is not right.');
    }

    const fresh = url.searchParams.get('refresh') === '1';
    const cached = fresh ? null : await readCache('admin:booths');
    const booths = cached || await listBoothsWithStatus();
    if (!cached) await writeCache('admin:booths', booths, CACHE_SECONDS);

    const counts = booths.reduce((all, booth) => ({ ...all, [booth.status]: (all[booth.status] || 0) + 1 }), {});

    return json({ booths, counts, cached: Boolean(cached) }, 200, { ...cors, 'Cache-Control': 'no-store' });
  } catch (error) {
    if (error instanceof HttpError) {
      console.error('[admin/booths]', error.code, error.detail || '');
      return json({ error: error.code, detail: error.detail }, error.status, cors);
    }
    // A missing token or a refusal from ExpoFP lands here.
    console.error('[admin/booths]', error);
    return json({
      error: 'booth_list_failed',
      reason: error.envName ? `missing_env:${error.envName}`
        : error.status ? `expofp_http_${error.status}` : 'expofp_unreachable',
    }, 503, cors);
  }
}

/** Per-IP, so one person guessing cannot lock everyone else out. */
function clientKey(request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return (forwarded.split(',')[0] || 'unknown').trim().slice(0, 45) || 'unknown';
}

// Vercel runs /api files as Web handlers only through this shape (or named
// GET/POST exports). A bare default-exported function is called as a legacy
// Node (req, res) handler instead, where Request/Response APIs do not exist.
export default { fetch: handler };
