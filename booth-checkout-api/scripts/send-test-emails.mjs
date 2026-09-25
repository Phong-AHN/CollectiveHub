#!/usr/bin/env node
/**
 * Sends both sale emails - the buyer's receipt and the organiser's notice - to
 * one address, using a made-up order. For checking how they land in a real
 * inbox before a real booth is sold.
 *
 *   node scripts/send-test-emails.mjs you@example.com
 *   node scripts/send-test-emails.mjs you@example.com --booth 5
 *
 * Reads RESEND_API_KEY, EMAIL_FROM, SHOP_NAME and FLOOR_PLAN_URL from the
 * environment or .env.local. Without a verified sender domain, Resend only
 * accepts onboarding@resend.dev, and only to the account owner's own address -
 * which is what this falls back to.
 *
 * Nothing here touches ExpoFP, Stripe or the store: it is only the two emails.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const line of readEnvLocal()) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}

function readEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
}

const args = process.argv.slice(2);
const to = args.find((arg) => arg.includes('@'));
const boothName = args.includes('--booth') ? args[args.indexOf('--booth') + 1] : '5';

if (!to) {
  console.error('Usage: node scripts/send-test-emails.mjs you@example.com [--booth 5]');
  process.exit(1);
}

if (!process.env.RESEND_API_KEY) {
  console.error('No RESEND_API_KEY. Put it in .env.local (or export it) and run again.');
  process.exit(1);
}

// Unverified senders are refused, so fall back to Resend's own test sender.
if (!process.env.EMAIL_FROM) {
  process.env.EMAIL_FROM = `${process.env.SHOP_NAME || 'Collective Hub'} <onboarding@resend.dev>`;
  console.log(`EMAIL_FROM is not set - sending as ${process.env.EMAIL_FROM}`);
  console.log('(Resend only delivers that sender to your own account address.)');
}

// Both mails go to the same inbox for the comparison.
process.env.ORGANISER_EMAIL = to;

const { sendOrganiserNotice, sendReceipt } = await import('../lib/email.js');

const order = {
  id: `test-${Date.now().toString(36)}`,
  gateway: 'stripe',
  amount: 125,
  paymentReference: 'cs_test_SAMPLE0000',
  paymentTransaction: 'pi_test_SAMPLE0000',
  exhibitorId: 21185,
  booth: { booth: boothName, boothId: '', type: 'Table', size: '6 ft', price: 100, currency: 'USD' },
  exhibitor: {
    company: 'Acme Collectibles',
    contactName: 'Sample Buyer',
    email: to,
    phone: '+84 900 000 000',
  },
  extras: [{ id: 'power-plugs', name: 'Power Plugs', price: 25 }],
};

console.log(`\nSending both emails for a pretend sale of booth ${boothName} to ${to}\n`);

for (const [label, send] of [["buyer's receipt", sendReceipt], ["organiser's notice", sendOrganiserNotice]]) {
  const result = await send(order);
  if (result.sent) console.log(`  sent  ${label.padEnd(20)} resend id ${result.id}`);
  else console.log(`  FAILED ${label.padEnd(20)} ${result.reason}: ${result.error || ''}`);
}

console.log('\nOrder reference in both emails:', order.id);
