/**
 * ExpoFP JSON API routes and request field names.
 *
 * Source: the JSON API reference at https://app.expofp.com/api-docs/json-api-v1
 * (behind an account login), as read on 2026-09-22. Every call is an HTTP POST
 * to https://app.expofp.com with the API token as a `token` field in the JSON
 * body.
 *
 * CONFIRMED from the reference - routes and request bodies:
 *   get-booth        { token, eventId, name }              name = booth key on the plan
 *   update-booth     { token, eventId, name, isOnHold }    200 with no body, 404 unknown
 *   list-booths      { token, expoId }                     note: expoId here, eventId elsewhere
 *   add-exhibitor    { token, eventId, name, externalId, contactName, contactPhone,
 *                      privateEmail, website, adminNotes, ... }  -> { id }
 *                    name is 1-100 chars; a duplicate externalId is a 400
 *   get-exhibitor-id { token, eventId, externalId }        -> { id }, 404 when unknown
 *   add-exhibitor-booth { token, eventId, boothName, exhibitorId }
 *                    exhibitorId as a STRING (ExpoFP id or externalId);
 *                    200 empty, or 200 "Already added"; 404 unknown booth/exhibitor
 *
 * Every call the checkout makes is now confirmed. Only add-exhibitor-extra -
 * unused so far - still takes its field names from FIELDS below.
 *
 * Routes can be overridden with environment variables.
 */

export const BASE_URL = process.env.EXPOFP_BASE_URL || 'https://app.expofp.com';

export const PATHS = {
  getBooth: process.env.EXPOFP_PATH_GET_BOOTH || '/api/v1/get-booth',
  listBooths: process.env.EXPOFP_PATH_LIST_BOOTHS || '/api/v1/list-booths',
  setBoothStatus: process.env.EXPOFP_PATH_SET_BOOTH_STATUS || '/api/v1/update-booth',
  addExhibitor: process.env.EXPOFP_PATH_ADD_EXHIBITOR || '/api/v1/add-exhibitor',
  getExhibitorId: process.env.EXPOFP_PATH_GET_EXHIBITOR_ID || '/api/v1/get-exhibitor-id',
  addExhibitorBooth: process.env.EXPOFP_PATH_ADD_EXHIBITOR_BOOTH || '/api/v1/add-exhibitor-booth',
  addExhibitorExtra: process.env.EXPOFP_PATH_ADD_EXHIBITOR_EXTRA || '/api/v1/add-exhibitor-extra',
};

/**
 * Field names for add-exhibitor-extra, the one body not yet confirmed (the
 * checkout does not call it). Defaults follow the confirmed calls' naming.
 * `token` is shared by every call.
 */
export const FIELDS = {
  token: 'token',
  expoId: process.env.EXPOFP_FIELD_EXPO_ID || 'eventId',
  exhibitorId: process.env.EXPOFP_FIELD_EXHIBITOR_ID || 'exhibitorId',
};

/** Where the new exhibitor id sits in the add-exhibitor response: { "id": 21185 }. */
export const RESPONSE_PATHS = {
  exhibitorId: (process.env.EXPOFP_RESPONSE_EXHIBITOR_ID || 'id').split('.'),
};

export function assertConfigured(operation) {
  const path = PATHS[operation];
  if (!path) throw new Error(`ExpoFP endpoint for "${operation}" is not configured.`);
  return path;
}

export function isConfigured(operation) {
  return Boolean(PATHS[operation]);
}
