/**
 * Pending checkouts, booth holds and claims.
 *
 * Backed by Upstash Redis (the Vercel Marketplace integration; Vercel KV itself
 * is deprecated). Without credentials it falls back to process memory, which
 * only works when everything runs in one process - tests, a local script. On
 * Vercel every /api file is its own function with its own memory, so a
 * checkout started in one could never be found by another; checkout/start
 * therefore refuses to run there without Redis.
 */
let kv = null;
let memory = null;

// The Upstash integration may inject either naming scheme.
const redisUrl = () => (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').trim();
const redisToken = () => (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '').trim();

export function persistentStorageConfigured() {
  return Boolean(redisUrl() && redisToken());
}

async function client() {
  if (kv || memory) return { kv, memory };

  if (persistentStorageConfigured()) {
    const { Redis } = await import('@upstash/redis');
    kv = new Redis({ url: redisUrl(), token: redisToken() });
    return { kv, memory };
  }

  const log = process.env.VERCEL_ENV === 'production' ? console.error : console.warn;
  log('[store] No Redis/KV credentials found - falling back to in-process memory. ' +
    'Holds and idempotency will not survive across invocations. Connect an Upstash Redis store.');
  memory = { records: new Map(), holds: new Map(), retries: new Map() };
  return { kv, memory };
}

const key = (id) => `checkout:${id}`;
const HOLDS = 'holds:due';
const RETRIES = 'fulfil:retry';

/**
 * Long-lived configuration, such as the encrypted payment keys. No TTL: this
 * is the only copy and it is meant to outlive every checkout.
 */
export async function saveSecret(name, value) {
  const { kv: k, memory: m } = await client();
  if (k) await k.set(`secret:${name}`, value);
  else m.records.set(`secret:${name}`, value);
}

export async function readSecret(name) {
  const { kv: k, memory: m } = await client();
  if (k) return (await k.get(`secret:${name}`)) || null;
  return m.records.get(`secret:${name}`) || null;
}

/**
 * Counts attempts within a window - used to stop someone guessing the setup
 * passcode. Returns how many have been made, this one included.
 */
export async function countAttempt(name, windowSeconds) {
  const { kv: k, memory: m } = await client();
  const name_ = `attempts:${name}`;
  if (k) {
    const count = Number(await k.incr(name_));
    if (count === 1) await k.expire(name_, windowSeconds);
    return count;
  }
  const entry = m.records.get(name_);
  const now = Date.now();
  if (!entry || entry.until <= now) {
    m.records.set(name_, { count: 1, until: now + windowSeconds * 1000 });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

/**
 * Paid checkouts whose ExpoFP write failed, scored by when to try again.
 * The cron (and any external scheduler) works through them.
 */
export async function scheduleRetry(id, atMs) {
  const { kv: k, memory: m } = await client();
  if (k) await k.zadd(RETRIES, { score: atMs, member: id });
  else m.retries.set(id, atMs);
}

export async function clearRetry(id) {
  const { kv: k, memory: m } = await client();
  if (k) await k.zrem(RETRIES, id);
  else m.retries.delete(id);
}

export async function dueRetries(nowMs, limit = 20) {
  const { kv: k, memory: m } = await client();
  if (k) return (await k.zrange(RETRIES, 0, nowMs, { byScore: true, count: limit, offset: 0 })) || [];
  return [...m.retries.entries()].filter(([, at]) => at <= nowMs).slice(0, limit).map(([id]) => id);
}

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

/**
 * One checkout per booth at a time. Checking the booth on ExpoFP and then
 * holding it are two calls, so two buyers pressing Pay together could both see
 * it free; this claim (SET NX) lets only the first one through. It expires on
 * its own, so a crashed checkout cannot lock a booth for good.
 */
export async function claimBooth(boothName, checkoutId, ttlSeconds) {
  const { kv: k, memory: m } = await client();
  const name = `booth:${String(boothName).toLowerCase()}`;
  if (k) {
    const won = await k.set(name, checkoutId, { nx: true, ex: ttlSeconds });
    return won === 'OK' || won === true;
  }
  const held = m.records.get(name);
  if (held && held.until > Date.now()) return false;
  m.records.set(name, { checkoutId, until: Date.now() + ttlSeconds * 1000 });
  return true;
}

/** Frees the booth claim, but only if this checkout still owns it. */
export async function releaseBoothClaim(boothName, checkoutId) {
  const { kv: k, memory: m } = await client();
  const name = `booth:${String(boothName).toLowerCase()}`;
  if (k) {
    if ((await k.get(name)) === checkoutId) await k.del(name);
    return;
  }
  if (m.records.get(name)?.checkoutId === checkoutId) m.records.delete(name);
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
