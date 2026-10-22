#!/usr/bin/env node
/**
 * Point Firebase Auth's email links (verification, password reset, email
 * change) at a custom action page (owner, 2026-10-22). The incident clean-up
 * deleted the browser key that Firebase bakes into those links, so Firebase's
 * hosted page (rypacad.firebaseapp.com/__/auth/action) fails with "API key
 * expired". The portal's own page, /portal/auth/action (hotfix/auth-action),
 * ignores that key and uses the portal's. The Firebase console's "Customize
 * action URL" dialog errored, so this sets the same field through the
 * Identity Toolkit admin API.
 *
 *   node scripts/set-auth-action-url.mjs --dry-run
 *   node scripts/set-auth-action-url.mjs --yes           (the owner runs this)
 *   node scripts/set-auth-action-url.mjs --url https://rypacad.firebaseapp.com/__/auth/action --yes   (undo)
 *
 * Writes only notification.sendEmail.callbackUri. Refuses a URL whose host is
 * not one of Auth's authorized domains. Ship the portal page before switching.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodAccessToken } from './lib/prod-auth.mjs';

const CONFIG = 'https://identitytoolkit.googleapis.com/admin/v2/projects/rypacad/config';
const DEFAULT_URL = 'https://portal.rypacademy.com/portal/auth/action';

/** @return {{url, dryRun, yes} | {error}} */
export function parseArgs(argv) {
  const out = { url: DEFAULT_URL, dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (a === '--url') out.url = argv[++i] ?? '';
    else return { error: `Unknown argument: ${a}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  let u;
  try { u = new URL(out.url); } catch { return { error: `Not a URL: ${out.url}` }; }
  if (u.protocol !== 'https:' || u.search || u.hash) return { error: 'Use a plain https URL with no query or fragment.' };
  return { ...out, host: u.host };
}

async function call(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method || 'GET'} failed (${res.status}): ${body.error?.message || ''}`);
  return body;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) { console.error(args.error); return 1; }
  const token = await prodAccessToken();
  const cfg = await call(token, CONFIG);
  const now = cfg.notification?.sendEmail?.callbackUri || '(Firebase default)';
  console.log(`Target: Firebase Auth, project rypacad${args.dryRun ? ' (dry run, nothing is written)' : ''}\n  now  ${now}\n  new  ${args.url}`);
  if (!(cfg.authorizedDomains || []).includes(args.host)) { console.error(`${args.host} is not an authorized domain (${(cfg.authorizedDomains || []).join(', ')}).`); return 1; }
  if (now === args.url) { console.log('Already set. Nothing to do.'); return 0; }
  if (args.dryRun) { console.log('Would update it. Run again with --yes instead of --dry-run.'); return 0; }

  await call(token, `${CONFIG}?updateMask=notification.sendEmail.callbackUri`, {
    method: 'PATCH', body: JSON.stringify({ notification: { sendEmail: { callbackUri: args.url } } }),
  });
  const after = (await call(token, CONFIG)).notification?.sendEmail?.callbackUri;
  if (after !== args.url) { console.error(`Written, but it reads back as ${after}. Check Authentication > Templates.`); return 1; }
  console.log('Updated. New verification, reset and email-change emails link to it from now on; emails already sent keep their old link.');
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
