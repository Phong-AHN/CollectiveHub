#!/usr/bin/env node
/**
 * Finds the ExpoFP JSON API routes this service needs and prints ready-to-review
 * EXPOFP_PATH_* / EXPOFP_FIELD_* lines.
 *
 *   node scripts/inspect-expofp-api.mjs              # download with your token
 *   node scripts/inspect-expofp-api.mjs --file x.json # read a spec you saved
 *   node scripts/inspect-expofp-api.mjs --save spec.json
 *
 * The token comes from EXPOFP_API_TOKEN, or from .env.local next to package.json.
 * It is sent only to app.expofp.com, in the X-API-Token header, and is never
 * printed - so the output is safe to share.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SPEC_URL = 'https://app.expofp.com/api-docs/json-api-v1.json';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

function readEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

async function loadSpec() {
  const file = argValue('--file');
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));

  const token = process.env.EXPOFP_API_TOKEN || readEnvLocal().EXPOFP_API_TOKEN;
  if (!token) {
    console.error('No token: set EXPOFP_API_TOKEN, or put it in .env.local (from https://app.expofp.com/profile).');
    process.exit(1);
  }

  const response = await fetch(SPEC_URL, { headers: { 'X-API-Token': token, Accept: 'application/json' } });
  const type = response.headers.get('content-type') || '';
  if (response.status === 401 || response.status === 403) {
    console.error(`ExpoFP refused the token (HTTP ${response.status}). Check EXPOFP_API_TOKEN on ` +
      'https://app.expofp.com/profile - or your ExpoFP plan may not include the JSON API.');
    process.exit(1);
  }
  if (!response.ok || !type.includes('json')) {
    console.error(`Unexpected answer: HTTP ${response.status}, ${type}`);
    console.error((await response.text()).slice(0, 300));
    process.exit(1);
  }

  const spec = await response.json();
  const save = argValue('--save');
  if (save) {
    fs.writeFileSync(save, JSON.stringify(spec, null, 2));
    console.log(`(spec saved to ${save})\n`);
  }
  return spec;
}

// ---------------------------------------------------------------- schema ---
function resolve(spec, schema, seen = new Set()) {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return {};
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((n, k) => n?.[k], spec);
    return resolve(spec, target, new Set([...seen, schema.$ref]));
  }
  if (schema.allOf) {
    const merged = { type: 'object', properties: {}, required: [] };
    for (const part of schema.allOf.map((s) => resolve(spec, s, seen))) {
      Object.assign(merged.properties, part?.properties || {});
      merged.required.push(...(part?.required || []));
    }
    return merged;
  }
  if (schema.oneOf || schema.anyOf) return resolve(spec, (schema.oneOf || schema.anyOf)[0], seen);
  return schema;
}

function typeOf(spec, schema) {
  const s = resolve(spec, schema) || {};
  if (s.type === 'array') return `${typeOf(spec, s.items)}[]`;
  return s.type || (s.properties ? 'object' : s.enum ? 'enum' : '?');
}

/** name -> { type, required } for a JSON body, one level deep. */
function fields(spec, schema) {
  const s = resolve(spec, schema) || {};
  const required = new Set(s.required || []);
  return Object.entries(s.properties || {}).map(([name, sub]) => ({
    name, type: typeOf(spec, sub), required: required.has(name),
  }));
}

/** Dot paths to every property whose name looks like an id. */
function idPaths(spec, schema, prefix = '', depth = 0, out = []) {
  const s = resolve(spec, schema) || {};
  if (depth > 4) return out;
  if (s.type === 'array') return idPaths(spec, s.items, `${prefix}0.`, depth + 1, out);
  for (const [name, sub] of Object.entries(s.properties || {})) {
    const full = `${prefix}${name}`;
    if (/^(id|exhibitor.?id)$/i.test(name)) out.push(`${full} (${typeOf(spec, sub)})`);
    idPaths(spec, sub, `${full}.`, depth + 1, out);
  }
  return out;
}

const jsonBody = (content) => content?.['application/json']?.schema || Object.values(content || {})[0]?.schema;

function operations(spec) {
  const ops = [];
  for (const [route, item] of Object.entries(spec.paths || {})) {
    for (const method of METHODS) {
      const op = item?.[method];
      if (!op) continue;
      const ok = op.responses?.['200'] || op.responses?.['201'] || Object.values(op.responses || {})[0];
      ops.push({
        method: method.toUpperCase(),
        route,
        id: op.operationId || '',
        summary: op.summary || op.description?.split('\n')[0] || '',
        request: fields(spec, jsonBody(resolve(spec, op.requestBody)?.content)),
        responseIds: idPaths(spec, jsonBody(resolve(spec, ok)?.content)),
      });
    }
  }
  return ops;
}

// ------------------------------------------------------------ matching ---
const text = (op) => `${op.route} ${op.id} ${op.summary}`.toLowerCase();
const hasField = (op, re) => op.request.some((f) => re.test(f.name));
// Everything this service calls is a write; never suggest a read.
const isRead = (op) => op.method === 'GET'
  || /(^|[^a-z])(get|list|read|fetch|search|find)([^a-z]|$)/.test(`${op.id.replace(/([A-Z])/g, ' $1')} ${op.summary}`.toLowerCase());
const rank = (op) => (op.method === 'POST' ? 2 : 0) + (hasField(op, /hold/i) ? 3 : 0);

const NEEDS = {
  EXPOFP_PATH_ADD_EXHIBITOR: (op) =>
    /exhibitor/.test(text(op)) && /(add|create|insert|new|upsert)/.test(text(op))
    && !/(booth|extra|categor|delete|remove|contact|user)/.test(text(op)),
  EXPOFP_PATH_ADD_EXHIBITOR_BOOTH: (op) =>
    /exhibitor/.test(text(op)) && /booth/.test(text(op)) && /(add|assign|create|set|link)/.test(text(op))
    && !/(remove|delete|unassign)/.test(text(op)),
  EXPOFP_PATH_ADD_EXHIBITOR_EXTRA: (op) =>
    /exhibitor/.test(text(op)) && /extra/.test(text(op)) && /(add|create|set)/.test(text(op)),
  EXPOFP_PATH_SET_BOOTH_STATUS: (op) =>
    (/booth/.test(text(op)) && /(hold|status|reserv|update|edit)/.test(text(op))) || hasField(op, /hold/i),
};

// Our default body field names, and how to recognise the real ones.
const FIELD_PATTERNS = {
  EXPOFP_FIELD_TOKEN: ['token', /^token$/i],
  EXPOFP_FIELD_EXPO_ID: ['expoId', /^expo.?id$/i],
  EXPOFP_FIELD_EXHIBITOR_ID: ['exhibitorId', /^exhibitor.?id$/i],
  EXPOFP_FIELD_BOOTH_ID: ['boothId', /^booth.?id$/i],
  EXPOFP_FIELD_BOOTH_KEY: ['boothKey', /^booth.?(key|name|number|no)$/i],
  EXPOFP_FIELD_IS_ON_HOLD: ['isOnHold', /hold/i],
  EXPOFP_FIELD_NAME: ['name', /^(name|company.?name|company|title)$/i],
  EXPOFP_FIELD_EMAIL: ['email', /^e.?mail$/i],
  EXPOFP_FIELD_PHONE: ['phone', /^(phone|phone.?number|tel|telephone)$/i],
  EXPOFP_FIELD_WEBSITE: ['website', /^(website|web.?site|url|site)$/i],
  EXPOFP_FIELD_EXTERNAL_ID: ['externalId', /^external.?id$/i],
};

const fmtFields = (op) => op.request.length
  ? op.request.map((f) => `${f.name}${f.required ? '*' : ''}:${f.type}`).join(', ')
  : '(no JSON body in spec)';

// ---------------------------------------------------------------- report ---
const spec = await loadSpec();
const ops = operations(spec);

console.log(`${spec.info?.title || 'ExpoFP JSON API'} ${spec.info?.version || ''} - ${ops.length} operations`);
console.log('(* = required field)\n');
console.log('All operations:');
for (const op of ops) console.log(`  ${op.method.padEnd(6)} ${op.route}${op.id ? `  [${op.id}]` : ''}${op.summary ? `  - ${op.summary}` : ''}`);

const chosen = {};
for (const [envName, match] of Object.entries(NEEDS)) {
  const candidates = ops.filter((op) => !isRead(op) && match(op)).sort((a, b) => rank(b) - rank(a));
  console.log(`\n== ${envName} - ${candidates.length ? `${candidates.length} candidate(s)` : 'NO match found'}`);
  candidates.slice(0, 4).forEach((op, i) => {
    console.log(`  ${i + 1}. ${op.method} ${op.route}${op.summary ? `  - ${op.summary}` : ''}`);
    console.log(`     request : ${fmtFields(op)}`);
    if (op.responseIds.length) console.log(`     ids in response: ${op.responseIds.join(', ')}`);
    if (op.method !== 'POST') console.log('     ! not POST - this service only POSTs; mention it when you share this output');
  });
  if (candidates[0]) chosen[envName] = candidates[0];
}

console.log('\n== Suggested .env lines - REVIEW each against the candidates above ==');
for (const envName of Object.keys(NEEDS)) {
  console.log(chosen[envName] ? `${envName}=${chosen[envName].route}` : `# ${envName}=   (none found - see above)`);
}

const exhibitorOp = chosen.EXPOFP_PATH_ADD_EXHIBITOR;
const idPath = exhibitorOp?.responseIds.find((p) => /exhibitor.?id/i.test(p)) || exhibitorOp?.responseIds[0];
if (idPath) console.log(`EXPOFP_RESPONSE_EXHIBITOR_ID=${idPath.split(' ')[0]}`);

const used = Object.values(chosen).flatMap((op) => op.request);
const fieldLines = [];
for (const [envName, [ours, re]] of Object.entries(FIELD_PATTERNS)) {
  const real = used.find((f) => re.test(f.name));
  if (real && real.name !== ours) fieldLines.push(`${envName}=${real.name}`);
}
// This service sends digit-only expo / exhibitor / booth ids as JSON numbers
// (that is how ExpoFP's own webhooks carry them). Flag any spec that disagrees.
for (const envName of ['EXPOFP_FIELD_EXPO_ID', 'EXPOFP_FIELD_EXHIBITOR_ID', 'EXPOFP_FIELD_BOOTH_ID']) {
  const re = FIELD_PATTERNS[envName][1];
  for (const [need, op] of Object.entries(chosen)) {
    const f = op.request.find((x) => re.test(x.name));
    if (f && f.type === 'string') {
      fieldLines.push(`# ! ${f.name} is a string in ${need} (${op.route}); this service sends it as a number - mention it`);
    }
  }
}
if (!used.some((f) => /^token$/i.test(f.name)) && Object.keys(chosen).length) {
  fieldLines.push('# ! no "token" field in these request bodies - auth may be header-based; mention it');
}
console.log(fieldLines.length ? fieldLines.join('\n') : '# field names already match this service\'s defaults');
