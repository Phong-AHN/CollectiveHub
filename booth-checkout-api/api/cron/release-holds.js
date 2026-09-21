import { json } from '../../lib/http.js';
import { dueHolds } from '../../lib/store.js';
import { releaseHold } from '../../lib/fulfil.js';

export const config = { runtime: 'nodejs' };

/**
 * Puts abandoned booths back on sale. Without this a visitor who starts
 * checkout and walks away leaves the booth held forever.
 */
export default async function handler(request) {
  // Vercel Cron sends this header; reject anything else so the endpoint
  // cannot be driven from outside.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  }

  const ids = await dueHolds(Date.now());
  const released = [];

  for (const id of ids) {
    const result = await releaseHold(id);
    released.push({ id, ...result });
  }

  if (released.length) console.log('[cron/release-holds] released', released.length);
  return json({ ok: true, checked: ids.length, released });
}
