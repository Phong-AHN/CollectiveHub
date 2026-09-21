/**
 * ============================================================================
 * FILL THIS IN BEFORE GOING LIVE.
 * ============================================================================
 *
 * The ExpoFP JSON API reference sits behind an account login, so the exact
 * paths and field names below are NOT verified. Everything else in this
 * service is written against this one file, so correcting it here is the only
 * change needed.
 *
 * Get the spec:
 *   curl -H "X-API-Token: <your token>" \
 *     https://app.expofp.com/api-docs/json-api-v1.yaml -o expofp-api.yaml
 *
 * Then set each PATH to the real route and each field name in FIELDS to the
 * real property name. Every value can also be overridden with an environment
 * variable, so you can correct production without a redeploy.
 *
 * What is confirmed from the public docs:
 *   - base host is app.expofp.com
 *   - auth is a single `token` sent as a field in the request body
 *     (never in the URL)
 *   - the operations we need are Add Exhibitor, Add Exhibitor Booth and
 *     (optionally) Add Exhibitor Extra
 */

const UNVERIFIED = '__UNVERIFIED__';

export const BASE_URL = process.env.EXPOFP_BASE_URL || 'https://app.expofp.com';

export const PATHS = {
  addExhibitor: process.env.EXPOFP_PATH_ADD_EXHIBITOR || UNVERIFIED,
  addExhibitorBooth: process.env.EXPOFP_PATH_ADD_EXHIBITOR_BOOTH || UNVERIFIED,
  addExhibitorExtra: process.env.EXPOFP_PATH_ADD_EXHIBITOR_EXTRA || UNVERIFIED,
  setBoothStatus: process.env.EXPOFP_PATH_SET_BOOTH_STATUS || UNVERIFIED,
};

/** Property names used in request bodies. */
export const FIELDS = {
  token: process.env.EXPOFP_FIELD_TOKEN || 'token',
  expoId: process.env.EXPOFP_FIELD_EXPO_ID || 'expoId',
  exhibitorId: process.env.EXPOFP_FIELD_EXHIBITOR_ID || 'exhibitorId',
  boothId: process.env.EXPOFP_FIELD_BOOTH_ID || 'boothId',
  boothKey: process.env.EXPOFP_FIELD_BOOTH_KEY || 'boothKey',
  isOnHold: process.env.EXPOFP_FIELD_IS_ON_HOLD || 'isOnHold',
  name: process.env.EXPOFP_FIELD_NAME || 'name',
  email: process.env.EXPOFP_FIELD_EMAIL || 'email',
  phone: process.env.EXPOFP_FIELD_PHONE || 'phone',
  website: process.env.EXPOFP_FIELD_WEBSITE || 'website',
  externalId: process.env.EXPOFP_FIELD_EXTERNAL_ID || 'externalId',
};

/** Where the exhibitor id sits in the Add Exhibitor response. */
export const RESPONSE_PATHS = {
  exhibitorId: (process.env.EXPOFP_RESPONSE_EXHIBITOR_ID || 'exhibitorId').split('.'),
};

export function assertConfigured(operation) {
  const path = PATHS[operation];
  if (!path || path === UNVERIFIED) {
    throw new Error(
      `ExpoFP endpoint for "${operation}" is not configured. Open lib/expofp-endpoints.js ` +
      `or set the matching EXPOFP_PATH_* environment variable using your copy of ` +
      `https://app.expofp.com/api-docs/json-api-v1.yaml`,
    );
  }
  return path;
}

export function isConfigured(operation) {
  const path = PATHS[operation];
  return Boolean(path) && path !== UNVERIFIED;
}
