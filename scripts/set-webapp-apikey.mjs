#!/usr/bin/env node
/**
 * Point the Firebase web app at a different browser API key (owner,
 * 2026-10-22). The incident clean-up deleted the old key and created a new
 * one, and the portal build was given the new key, but the Firebase web app
 * ("Portal WEB") still named the deleted key. Firebase's hosted auth pages
 * (rypacad.firebaseapp.com/__/auth/action for email verification and
 * password reset, served config from /__/firebase/init.json) read the key
 * from the web app, so every verification link failed with "API key expired".
 *
 *   node scripts/set-webapp-apikey.mjs --key-id <api key uid> --dry-run
 *   (the same with --yes writes it; the owner runs that one)
 *
 * Writes only the web app's apiKeyId (Firebase Management API, masked
 * update). Production auth is scripts/lib/prod-auth.mjs. Refuses a key id
 * that is not a live (undeleted) key in project rypacad.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodAccessToken } from './lib/prod-auth.mjs';

const PROJECT = 'rypacad';
const UID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** @return {{keyId, dryRun, yes} | {error}} */
export function parseArgs(argv) {
  const out = { keyId: null, dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (a === '--key-id') out.keyId = argv[++i] ?? null;
    else return { error: `Unknown argument: ${a}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  if (!UID_RE.test(out.keyId || '')) return { error: 'Pass --key-id with the API key uid (from the Google Cloud console, Credentials, the key\'s details).' };
  return out;
}

async function call(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${url.split('?')[0]} failed (${res.status}): ${body.error?.message || ''}`);
  return body;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) { console.error(args.error); return 1; }
  const token = await prodAccessToken();
  console.log(`Target: Firebase project ${PROJECT}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);

  const key = await call(token, `https://apikeys.googleapis.com/v2/projects/${PROJECT}/locations/global/keys/${args.keyId}`);
  if (key.deleteTime) { console.error(`Key ${args.keyId} (${key.displayName}) is deleted; pick a live key.`); return 1; }
  const apps = (await call(token, `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps`)).apps || [];
  if (apps.length !== 1) { console.error(`Expected one web app, found ${apps.length}: ${apps.map((a) => a.displayName).join(', ')}`); return 1; }
  const app = apps[0];
  console.log(`  web app   ${app.displayName} (${app.appId})\n  now       apiKeyId ${app.apiKeyId || '(none)'}\n  new       apiKeyId ${args.keyId} (${key.displayName}, created ${key.createTime})`);
  if (app.apiKeyId === args.keyId) { console.log('Already pointing at that key. Nothing to do.'); return 0; }
  if (args.dryRun) { console.log('Would update it. Run again with --yes instead of --dry-run.'); return 0; }

  await call(token, `https://firebase.googleapis.com/v1beta1/${app.name}?updateMask=apiKeyId`, { method: 'PATCH', body: JSON.stringify({ apiKeyId: args.keyId }) });
  const after = await call(token, `https://firebase.googleapis.com/v1beta1/${app.name}`);
  if (after.apiKeyId !== args.keyId) { console.error('Written, but the web app does not read back with the new key. Check it in the Firebase console.'); return 1; }
  console.log('Updated. Verification and password-reset links pick it up once Firebase refreshes /__/firebase/init.json (usually minutes).');
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
