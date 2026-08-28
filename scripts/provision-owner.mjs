#!/usr/bin/env node
/**
 * Provision a users/{uid} role document in PRODUCTION Firestore.
 *
 *   node scripts/provision-owner.mjs --uid <authUid> --email <email> --role owner
 *   node scripts/provision-owner.mjs --uid ... --email ... --role owner --dry-run
 *
 * Why this exists: the v1 security rules key every request off
 * users/{request.auth.uid}, and no client can create its own role doc (a
 * self-writable role is a privilege-escalation path). Role docs are therefore
 * provisioned out-of-band. This script authenticates as the developer's own
 * firebase-tools CLI login (the token in the CLI's local configstore) and
 * writes over the Firestore REST API as that IAM principal — rules do not
 * apply to IAM-authenticated admin traffic, which is the point.
 *
 * Safety posture:
 *   - This is one of exactly two sanctioned production writers (the other is
 *     the future billing integration). Everything else is emulator-only.
 *   - It writes a single document, only in the `users` collection, and prints
 *     what it wrote. It never prints tokens.
 *   - Running it is a PM/user-gated action per docs/portal/TEAM.md.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'rypacad';
const ROLES = ['athlete', 'parent', 'coach', 'mental', 'ops', 'owner'];

// firebase-tools' public installed-app OAuth client (embedded in the
// open-source CLI); the refresh token below is the developer's own login.
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
}
const DRY_RUN = process.argv.includes('--dry-run');

const uid = arg('uid');
const email = arg('email');
const role = arg('role');
const displayName = arg('name') ?? null;

if (!uid || !email || !ROLES.includes(role)) {
  console.error('Usage: node scripts/provision-owner.mjs --uid <authUid> --email <email> --role <' + ROLES.join('|') + '> [--name "Display Name"] [--dry-run]');
  process.exit(1);
}

function cliRefreshToken() {
  const store = path.join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  try {
    const cfg = JSON.parse(readFileSync(store, 'utf8'));
    const token = cfg?.tokens?.refresh_token;
    if (!token) throw new Error('no refresh_token in configstore');
    return token;
  } catch (e) {
    console.error(`Could not read the firebase-tools login (${store}): ${e.message}`);
    console.error('Run `npx firebase-tools login` first.');
    process.exit(1);
  }
}

async function accessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: cliRefreshToken(),
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    console.error(`Token exchange failed (${res.status}). Re-run \`npx firebase-tools login\`.`);
    process.exit(1);
  }
  return (await res.json()).access_token;
}

const fields = {
  role: { stringValue: role },
  email: { stringValue: email },
  displayName: displayName ? { stringValue: displayName } : { nullValue: null },
  athleteId: { nullValue: null },
  householdId: { nullValue: null },
};

const url =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}` +
  '?updateMask.fieldPaths=role&updateMask.fieldPaths=email&updateMask.fieldPaths=displayName' +
  '&updateMask.fieldPaths=athleteId&updateMask.fieldPaths=householdId';

console.log(`users/${uid} <- { role: '${role}', email: '${email}', displayName: ${JSON.stringify(displayName)} }  [project ${PROJECT_ID}]`);
if (DRY_RUN) {
  console.log('--dry-run: nothing written.');
  process.exit(0);
}

const token = await accessToken();
const res = await fetch(url, {
  method: 'PATCH',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ fields }),
});

if (!res.ok) {
  console.error(`Write failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const doc = await res.json();
console.log(`Written. Server time: ${doc.updateTime}`);
