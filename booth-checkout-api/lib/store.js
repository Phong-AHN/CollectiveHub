/**
 * Pending checkouts and booth holds.
 *
 * Backed by Vercel KV. Without KV credentials it falls back to process memory,
 * which is fine for `vercel dev` but useless across serverless invocations —
 * the warning below is deliberately loud.
 */
let kv = null;
let memory = null;

async function client() {
  if (kv || memory) return { kv, memory };

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    ({ kv } = await import('@vercel/kv'));
    return { kv, memory };
  }

  console.warn('[store] KV is not configured - falling back to in-process memory. ' +
    'Holds and idempotency will not survive across invocations.');
  memory = { records: new Map(), holds: new Map() };
  return { kv, memory };
}

const key = (id) => `checkout:${id}`;
const HOLDS = 'holds:due';

export async function putCheckout(id, data, ttlSeconds) {
  const { kv: k, memory: m } = await client();
  const record = { ...data, id, updatedAt: Date.now() };
  if (k) await k.set(key(id), record, { ex: ttlSeconds });
  else m.records.set(id, record);
  return record;
}

export async function getCheckout(id) {
  const { kv: k, memory: m } = await client();
  if (k) return (await k.get(key(id))) || null;
  return m.records.get(id) || null;
}

export async function patchCheckout(id, patch) {
  const current = await getCheckout(id);
  if (!current) return null;
  return putCheckout(id, { ...current, ...patch }, Number(process.env.RECORD_TTL_SECONDS || 60 * 60 * 24 * 30));
}

/**
 * Claims fulfilment for this checkout. Returns false when someone already has
 * it, so the PayPal return and the PayPal webhook cannot both write to ExpoFP.
 */
export async function claimFulfilment(id) {
  const { kv: k, memory: m } = await client();
  if (k) {
    const won = await k.set(`${key(id)}:fulfilling`, '1', { nx: true, ex: 300 });
    return won === 'OK' || won === true;
  }
  if (m.records.get(`${id}:fulfilling`)) return false;
  m.records.set(`${id}:fulfilling`, '1');
  return true;
}

export async function releaseClaim(id) {
  const { kv: k, memory: m } = await client();
  if (k) await k.del(`${key(id)}:fulfilling`);
  else m.records.delete(`${id}:fulfilling`);
}

export async function trackHold(id, expiresAtMs) {
  const { kv: k, memory: m } = await client();
  if (k) await k.zadd(HOLDS, { score: expiresAtMs, member: id });
  else m.holds.set(id, expiresAtMs);
}

/**
 * Removes a hold from the schedule. Returns true only for the caller that
 * actually removed it - ZREM is atomic, so this doubles as the claim that
 * stops two releasers from both talking to ExpoFP.
 */
export async function untrackHold(id) {
  const { kv: k, memory: m } = await client();
  if (k) return Number(await k.zrem(HOLDS, id)) > 0;
  return m.holds.delete(id);
}

export async function dueHolds(nowMs, limit = 100) {
  const { kv: k, memory: m } = await client();
  if (k) return (await k.zrange(HOLDS, 0, nowMs, { byScore: true, count: limit, offset: 0 })) || [];
  return [...m.holds.entries()].filter(([, at]) => at <= nowMs).slice(0, limit).map(([id]) => id);
}
