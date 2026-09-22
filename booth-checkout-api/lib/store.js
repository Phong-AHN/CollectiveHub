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

  // The Upstash Redis integration may inject either naming scheme.
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    const { createClient } = await import('@vercel/kv');
    kv = createClient({ url, token });
    return { kv, memory };
  }

  const log = process.env.VERCEL_ENV === 'production' ? console.error : console.warn;
  log('[store] No Redis/KV credentials found - falling back to in-process memory. ' +
    'Holds and idempotency will not survive across invocations. Connect an Upstash Redis store.');
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

/**
 * True the first time a webhook delivery id is seen. ExpoFP keeps
 * X-ExpoFP-Delivery stable when it re-sends an event, so this is the natural
 * idempotency key for inbound deliveries.
 */
export async function firstDelivery(deliveryId, ttlSeconds = 60 * 60 * 24 * 7) {
  const { kv: k, memory: m } = await client();
  const name = `expofp:delivery:${deliveryId}`;
  if (k) {
    const won = await k.set(name, '1', { nx: true, ex: ttlSeconds });
    return won === 'OK' || won === true;
  }
  if (m.records.has(name)) return false;
  m.records.set(name, '1');
  return true;
}

/**
 * ExpoFP follows every booth_assigned with a booth_reserved carrying the same
 * values. Remember the assignment briefly so that follow-up can be recognised -
 * and only that follow-up, never a reservation that stands on its own.
 */
export async function rememberAssigned(pairKey, ttlSeconds = 120) {
  const { kv: k, memory: m } = await client();
  const name = `expofp:assigned:${pairKey}`;
  if (k) {
    await k.set(name, '1', { ex: ttlSeconds });
    return;
  }
  m.records.set(name, Date.now() + ttlSeconds * 1000);
}

/**
 * True, once, when a matching booth_assigned was seen recently. DEL is atomic,
 * so two instances cannot both claim the same follow-up.
 */
export async function consumeAssigned(pairKey) {
  const { kv: k, memory: m } = await client();
  const name = `expofp:assigned:${pairKey}`;
  if (k) return Number(await k.del(name)) > 0;
  const until = m.records.get(name);
  m.records.delete(name);
  return typeof until === 'number' && until > Date.now();
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
