const ALLOWED = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  // No allowlist configured means same-origin only: reflect nothing.
  const allow = ALLOWED.includes(origin) ? origin : ALLOWED.includes('*') ? '*' : '';

  const headers = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (allow) headers['Access-Control-Allow-Origin'] = allow;
  return headers;
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}

export function preflight(request) {
  if (request.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export function redirect(url) {
  return new Response(null, { status: 303, headers: { Location: url } });
}

/** Adds `key` to `url` without clobbering whatever query it already carries. */
export function withParam(url, key, value) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(key, value);
    return parsed.toString();
  } catch (error) {
    return url;
  }
}

/** Only ever send visitors back to a page we recognise. */
export function safeReturnUrl(candidate) {
  const fallback = process.env.CHECKOUT_PAGE_URL || '';
  if (!candidate) return fallback;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return fallback;
    if (!ALLOWED.length || ALLOWED.includes('*')) return parsed.toString();
    return ALLOWED.some((origin) => origin === parsed.origin) ? parsed.toString() : fallback;
  } catch (error) {
    return fallback;
  }
}

export class HttpError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}
