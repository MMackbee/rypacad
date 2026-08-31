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
 *   - This is one of the sanctioned production writers (with
 *     provision-family.mjs, sync-calendar-sessions.mjs --prod, and the future
 *     billing integration). Everything else is emulator-only.
 *   - It writes a single document, only in the `users` collection, and prints
 *     what it wrote. It never prints tokens.
 *   - Running it is a PM/user-gated action per docs/portal/TEAM.md.
 */

import { prodAccessToken } from './lib/prod-auth.mjs';

const PROJECT_ID = 'rypacad';
const ROLES = ['athlete', 'parent', 'coach', 'mental', 'ops', 'owner'];

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

const token = await prodAccessToken();
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
