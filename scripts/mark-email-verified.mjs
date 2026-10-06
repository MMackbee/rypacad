#!/usr/bin/env node
/**
 * Mark one portal login's email as verified, for a family whose Firebase
 * verification email never arrives (owner, 2026-10-06). A password login
 * cannot pay until its email is verified (functions/portal/checkout.js), and
 * a student login cannot claim the invite a parent entered
 * (functions/portal/family.js). This sets the one flag both gates read and
 * changes nothing else on the account.
 *
 *   node scripts/mark-email-verified.mjs --prod --email someone@example.com --dry-run   # read only: show the account
 *   node scripts/mark-email-verified.mjs --prod --email someone@example.com --yes       # mark it verified
 *
 * Without --prod it targets the Auth emulator (FIREBASE_AUTH_EMULATOR_HOST,
 * local hosts only). Production auth is scripts/lib/prod-auth.mjs, the
 * developer's firebase-tools login. The --yes run against production is the
 * owner's to make, like every other production writer.
 *
 * Only mark an address the owner knows belongs to the family: a verified
 * email is the app's proof that whoever holds the login owns the mailbox.
 *
 * Afterwards the parent taps I've verified on the yellow card, or Pay: both
 * reload the account and refresh its token before retrying
 * (components/PayButton.js), so nobody has to sign out. The script prints
 * the step that fits the login's role.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodAccessToken } from './lib/prod-auth.mjs';
import { PROJECT_ID, LOCAL_HOSTS, resolveTarget, getDoc } from './lib/firestore-rest.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string[]} argv process.argv.slice(2)
 * @return {{prod: boolean, email: string, dryRun: boolean, yes: boolean} | {error: string}}
 */
export function parseArgs(argv) {
  const out = { prod: false, email: null, dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--prod') out.prod = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--yes') out.yes = true;
    else if (arg === '--email') out.email = argv[++i] ?? null;
    else return { error: `Unknown argument: ${arg}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  const email = (out.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Pass --email with the address the login was created with.' };
  return { ...out, email };
}

/**
 * Where the Identity Toolkit admin API lives: production, or a LOCAL Auth
 * emulator (never a remote host without --prod).
 * @return {Promise<{label: string, base: string, auth: string} | {error: string}>}
 */
export async function authTarget({ prod, env = process.env, token = prodAccessToken }) {
  if (prod) {
    return {
      label: `production (project ${PROJECT_ID})`,
      base: `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`,
      auth: `Bearer ${await token()}`,
    };
  }
  const host = env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!host) return { error: 'FIREBASE_AUTH_EMULATOR_HOST is not set. Pass --prod for production.' };
  if (!LOCAL_HOSTS.has(host.replace(/:\d+$/, ''))) {
    return { error: `Refusing to run: FIREBASE_AUTH_EMULATOR_HOST="${host}" is not a local address.` };
  }
  return {
    label: `Auth emulator at ${host}`,
    base: `http://${host}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}`,
    auth: 'Bearer owner',
  };
}

const when = (ms) => (ms ? new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'never');

/**
 * The few fields worth printing. The lookup also returns the password hash
 * and salt; nothing outside this list is ever printed.
 */
export function summarize(user) {
  return {
    uid: user.localId,
    email: user.email,
    providers: (user.providerUserInfo || []).map((p) => p.providerId),
    emailVerified: user.emailVerified === true,
    disabled: user.disabled === true,
    created: when(user.createdAt),
    lastSignIn: when(user.lastLoginAt),
  };
}

/** @return {{action: 'refuse' | 'none' | 'verify', reason: string}} */
export function decide(user) {
  if (!user) {
    return { action: 'refuse', reason: 'No login has this email. They create one at portal.rypacademy.com first.' };
  }
  if (user.disabled === true) {
    return { action: 'refuse', reason: 'This login is disabled. Re-enable it in the Firebase console first, if that is intended.' };
  }
  if (user.emailVerified === true) return { action: 'none', reason: 'Already verified. Nothing to do.' };
  return { action: 'verify', reason: 'Not verified yet.' };
}

async function call(target, method, body) {
  const res = await fetch(`${target.base}/${method}`, {
    method: 'POST',
    headers: { authorization: target.auth, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} against ${target.label} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** The one account with exactly this email, or null; more than one is refused. */
export async function lookup(target, email) {
  const body = await call(target, 'accounts:lookup', { email: [email] });
  const matches = (body.users || []).filter((u) => (u.email || '').toLowerCase() === email);
  if (matches.length > 1) throw new Error('More than one login has this email. Nothing written.');
  return matches[0] || null;
}

/**
 * Who the login belongs to in the portal, for the owner to check it is the
 * right family. `role` is undefined when the record could not be read and
 * null when there is none yet.
 */
async function portalRecord(prod, uid) {
  try {
    const store = await resolveTarget({ prod, requireEmulatorHost: false });
    if (!store) return { text: 'not read (no Firestore emulator set)' };
    const user = await getDoc(store, 'users', uid);
    if (!user) return { text: 'no portal record yet (sign-up not finished)', role: null };
    const household = user.householdId ? await getDoc(store, 'households', user.householdId) : null;
    const family = household && household.name ? `, household ${household.name} (${user.householdId})` : '';
    return { text: `${user.role || 'no role'}${family}`, role: user.role || null };
  } catch (err) {
    return { text: `could not read (${err.message.split('\n')[0]})` };
  }
}

/**
 * What to tell the family once the flag is set. Their open tab still holds
 * the old token; the buttons named here reload the account and refresh it
 * (PayButton.js, useAuthSession.checkInvite), so nobody signs out.
 */
export function nextStep(role) {
  if (role === 'parent') return "Tell them: tap I've verified on the yellow card, or Pay if no card is showing.";
  if (role === null) {
    return "Tell them: a parent finishes sign-up, then taps Pay. A student login taps I've verified on the screen asking them to verify.";
  }
  if (role === 'athlete') return "Tell them: tap I've verified where the portal asks them to verify, or Pay.";
  return "Tell them: tap I've verified where the portal asks them to verify, or Pay. No sign-out needed.";
}

function print(summary, record) {
  console.log(`  uid            ${summary.uid}`);
  console.log(`  email          ${summary.email}`);
  console.log(`  signs in with  ${summary.providers.join(', ') || 'unknown'}`);
  console.log(`  verified       ${summary.emailVerified ? 'yes' : 'no'}`);
  console.log(`  disabled       ${summary.disabled ? 'yes' : 'no'}`);
  console.log(`  created        ${summary.created}`);
  console.log(`  last sign-in   ${summary.lastSignIn}`);
  console.log(`  portal         ${record.text}`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) {
    console.error(args.error);
    console.error('Usage: node scripts/mark-email-verified.mjs [--prod] --email <address> (--dry-run | --yes)');
    return 1;
  }
  const target = await authTarget({ prod: args.prod });
  if (target.error) {
    console.error(target.error);
    return 1;
  }
  console.log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);

  const user = await lookup(target, args.email);
  const record = user ? await portalRecord(args.prod, user.localId) : null;
  if (user) print(summarize(user), record);
  const verdict = decide(user);
  console.log(verdict.reason);
  if (verdict.action === 'refuse') return 1;
  if (verdict.action === 'none') return 0;
  if (args.dryRun) {
    console.log('Would mark this email verified. Run again with --yes instead of --dry-run to do it.');
    return 0;
  }

  // Read again right before writing: the same login, still unverified.
  const again = await lookup(target, args.email);
  if (!again || again.localId !== user.localId) {
    console.error('The login changed since it was read. Nothing written; run the dry run again.');
    return 1;
  }
  const now = decide(again);
  if (now.action !== 'verify') {
    console.log(now.reason);
    return now.action === 'none' ? 0 : 1;
  }
  await call(target, 'accounts:update', { localId: user.localId, emailVerified: true });
  const after = await lookup(target, args.email);
  if (!after || after.localId !== user.localId || after.emailVerified !== true) {
    console.error('The write returned, but the login still reads unverified. Check it in the Firebase console.');
    return 1;
  }
  console.log(`Marked ${args.email} verified.`);
  console.log(nextStep(record.role));
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then((code) => { process.exitCode = code; }, (err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
