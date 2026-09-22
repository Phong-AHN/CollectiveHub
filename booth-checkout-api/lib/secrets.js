import crypto from 'node:crypto';
import { HttpError } from './http.js';

// Read here rather than from config.js: config.js reads this module back, and
// a cycle between them is not worth the two lines it would save.
const envValue = (name) => String(process.env[name] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();

/**
 * Encrypts the payment keys the client types into the storefront form.
 *
 * AES-256-GCM, keyed by SECRETS_KEY from the environment. The ciphertext lives
 * in Redis and the key lives on Vercel, so neither on its own is enough: a
 * leaked database dump cannot be read, and GCM's tag means altered ciphertext
 * fails to decrypt instead of returning something wrong.
 */
const VERSION = 'v1';

function encryptionKey() {
  const raw = envValue('SECRETS_KEY');
  if (!raw) {
    const error = new HttpError(500, 'missing_env', 'Environment variable SECRETS_KEY is not set.');
    error.envName = 'SECRETS_KEY';
    throw error;
  }
  // Any sufficiently random string works; this only widens it to 32 bytes.
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join(':');
}

export function decryptSecret(blob) {
  const [version, iv, tag, body] = String(blob || '').split(':');
  if (version !== VERSION || !iv || !tag || !body) throw new Error('Stored secret is not in the expected format');

  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}

/** Enough of a key to recognise it by, never enough to use: sk_live_...4242 */
export function keyHint(secret) {
  const value = String(secret || '');
  if (value.length < 8) return '****';
  const prefix = value.match(/^((sk|rk|pk)_(test|live)_)/)?.[1] || value.slice(0, 4);
  return `${prefix}****${value.slice(-4)}`;
}

/** Compares without leaking, through timing, how much of the value matched. */
export function sameSecret(given, expected) {
  const a = Buffer.from(String(given ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  if (!b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
