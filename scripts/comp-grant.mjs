#!/usr/bin/env node
/**
 * Make a login's family free before it signs up (owner 2026-11-05, the
 * Ollhoff family: "make it so that the database is ready to comp anything
 * under his account" - Mike wants nobody to step in after the family signs
 * up). Writes the grant createFamily and addAthletes read
 * (functions/portal/comp-grant.js): every athlete then created under this
 * login on a monthly package (token packages or Elite; never the one-time
 * single token) is marked paid at sign-up - billing active, nothing billed,
 * every Stripe id null, comp true - and the receipt shows no Pay button.
 *
 *   node scripts/comp-grant.mjs --prod --email parent@example.com \
 *     [--until 2027-02-27] [--note "..."] [--elite-only] --dry-run
 *   node scripts/comp-grant.mjs --prod --email parent@example.com --revoke --dry-run
 *   (the same with --yes writes it; the owner runs that one)
 *
 * What it writes, in ONE commit: compGrants/{email} (email, the login's uid
 * when one exists, until, note, packages, revoked false, createdAt), under a
 * precondition (must not exist, or the updateTime it was read at). If the
 * family has ALREADY signed up, its unpaid Elite athletes are comped in the
 * same commit exactly as scripts/comp-membership.mjs would (same refusals);
 * anything else already there is listed, not touched. --revoke sets
 * revoked: true and touches no athlete: athletes already comped stay comped.
 *
 * Needs createFamily and addAthletes deployed from the commit that added
 * comp-grant.js; before that, sign-ups ignore the grant.
 * Nothing ends a comp: compUntil is a record, the season-end work ends it.
 * Production auth is scripts/lib/prod-auth.mjs; the emulator without --prod.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveTarget, queryCollection, eqFilter, getDoc, docName, fsFields, fsDecode, commit, PROJECT_ID } from './lib/firestore-rest.mjs';
import { authTarget, lookup } from './mark-email-verified.mjs';
import { refusal, buildWrites } from './comp-membership.mjs';

const lib = createRequire(import.meta.url)('../functions/portal/lib.js');

const USAGE = 'Usage: node scripts/comp-grant.mjs [--prod] --email <parent login> [--until YYYY-MM-DD] [--note "<text>"] [--elite-only] [--revoke] (--dry-run | --yes)';
const DEFAULT_UNTIL = '2027-02-27';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEASON_END = 'Nothing ends these comps automatically: add the family to the season-end list.';

/** True for a real calendar date written YYYY-MM-DD. */
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Pure (pass `today`, Chicago 'YYYY-MM-DD').
 * @return {{prod, email, until, note, packages, revoke, dryRun, yes} | {error}}
 */
export function parseArgs(argv, { today = lib.todayISO() } = {}) {
  const out = { prod: false, email: null, until: null, note: null, packages: null, revoke: false, dryRun: false, yes: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prod') out.prod = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (a === '--revoke') out.revoke = true;
    else if (a === '--elite-only') out.packages = ['elite'];
    else if (['--email', '--until', '--note'].includes(a)) {
      if (seen.has(a)) return { error: `${a} may be given only once.` };
      seen.add(a);
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value.` };
      out[a.slice(2)] = v;
    } else return { error: `Unknown argument: ${a}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  out.email = (out.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(out.email)) return { error: 'Pass --email with the parent\'s portal login.' };
  if (out.revoke && (out.until || out.note || out.packages)) return { error: '--revoke takes only --email.' };
  out.until = out.until ?? DEFAULT_UNTIL;
  if (!validDate(out.until)) return { error: '--until must be a real date written YYYY-MM-DD.' };
  if (!out.revoke && out.until < today) return { error: `--until must be today (${today}) or later.` };
  out.note = out.note ?? `Owner comp (Makel, Mike, Luke): free through ${out.until}, 2026-27 season`;
  if (!out.note.trim() || out.note.length > 200) return { error: '--note must be 1 to 200 characters.' };
  return out;
}

/** Pure: the grant document, as comp-grant.js reads it. */
export function grantFields(args, uid) {
  return { email: args.email, uid: uid || null, until: args.until, note: args.note, packages: args.packages, revoked: false, createdBy: 'comp-grant' };
}

/** Pure: the one grant write - create (must not exist) or replace/revoke (the updateTime read). */
export function grantWrite({ args, uid, existing }) {
  const name = docName('compGrants', args.email);
  if (args.revoke) {
    if (!existing?.updateTime) throw new Error('No grant to revoke.');
    return {
      update: { name, fields: fsFields({ revoked: true }) },
      updateMask: { fieldPaths: ['revoked'] },
      updateTransforms: [{ fieldPath: 'revokedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { updateTime: existing.updateTime },
    };
  }
  return {
    update: { name, fields: fsFields(grantFields(args, uid)) },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: existing?.updateTime ? { updateTime: existing.updateTime } : { exists: false },
  };
}

/** One read of a doc and its updateTime together. */
async function readWithTime(target, collection, id) {
  const res = await fetch(`${target.base}/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`, { headers: { Authorization: target.auth } });
  if (res.status === 404) return { data: null, updateTime: null };
  if (!res.ok) throw new Error(`Read ${collection}/${id} failed (${res.status})`);
  const body = await res.json();
  return { data: { id, ...fsDecode(body.fields || {}) }, updateTime: body.updateTime };
}

/** `lookupLogin` (email -> Auth user or null) replaces the Auth lookup in tests. */
export async function main(argv = process.argv.slice(2), { nowMs = Date.now(), lookupLogin = null } = {}) {
  const args = parseArgs(argv, { today: lib.todayISO(new Date(nowMs)) });
  if (args.error) { console.error(`${args.error}\n${USAGE}`); return 1; }
  const target = await resolveTarget({ prod: args.prod });
  console.log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);

  let login;
  if (lookupLogin) login = await lookupLogin(args.email);
  else {
    const authT = await authTarget({ prod: args.prod });
    if (authT.error) { console.error(authT.error); return 1; }
    login = await lookup(authT, args.email);
  }
  console.log(`  login     ${login ? `${login.localId} (email ${login.emailVerified ? 'verified' : 'not verified'})` : 'none yet: the grant matches the email when they sign up'}`);
  const existing = await readWithTime(target, 'compGrants', args.email);
  const g = existing.data;
  console.log(`  grant     ${g ? `until ${g.until}, ${g.revoked ? 'REVOKED' : 'live'}, packages ${g.packages ? g.packages.join(', ') : 'any monthly'}, login ${g.uid || 'any with this email'}` : 'none yet'}`);
  if (args.revoke && (!g || g.revoked)) { console.error('There is no live grant to revoke. Nothing written.'); return 1; }

  // A family that already signed up: its unpaid Elite athletes are comped now (comp-membership's checks).
  const users = await queryCollection(target, { from: [{ collectionId: 'users' }], where: eqFilter('email', args.email) });
  const householdIds = [...new Set(users.map((u) => u.householdId).filter(Boolean))];
  if (householdIds.length > 1) { console.error(`${args.email} belongs to more than one family (${householdIds.join(', ')}). Check the users docs first.`); return 1; }
  const rows = [];
  if (householdIds.length && !args.revoke) {
    const [householdId] = householdIds;
    const household = { id: householdId, ...(await getDoc(target, 'households', householdId)) };
    const athletes = await queryCollection(target, { from: [{ collectionId: 'athletes' }], where: eqFilter('householdId', householdId) });
    console.log(`  family    already signed up: ${household.name ?? '(no name)'} (${householdId})`);
    for (const a of athletes) {
      const { data, updateTime } = await readWithTime(target, 'athletes', a.id);
      const pkg = data.packageId ? await getDoc(target, 'packages', data.packageId) : null;
      const why = refusal({ athlete: data, pkg, household, nowMs });
      const covered = args.packages === null || args.packages.includes(data.packageId);
      if (!why && covered) rows.push({ athlete: data, updateTime });
      console.log(`  athlete   ${data.name}: ${!why && covered ? 'comp now (Elite, unpaid)' : `left as is - ${why || 'not a package this grant covers'}`}`);
    }
  } else if (!args.revoke) {
    console.log('  family    not signed up yet: the grant applies when they do');
  }
  console.log(args.revoke ? '  change    revoke: later sign-ups are no longer comped; athletes already comped stay comped'
    : `  change    ${g ? 'replace' : 'create'} grant: until ${args.until}, packages ${args.packages ? args.packages.join(', ') : 'any monthly package (never the single token)'}, note "${args.note}"`);
  if (args.dryRun) { console.log(`Run again with --yes instead of --dry-run to write it.${args.revoke ? '' : `\n${SEASON_END}`}`); return 0; }

  try {
    const compArgs = { until: args.until, note: args.note };
    await commit(target, [grantWrite({ args, uid: login?.localId, existing }), ...buildWrites({ athletes: rows, args: compArgs })]);
  } catch (e) {
    console.error(`Not written: ${e.message}\nIf something changed since it was read, run it again (dry run first).`);
    return 1;
  }
  const after = await getDoc(target, 'compGrants', args.email);
  if (args.revoke) {
    console.log(after?.revoked === true ? 'Revoked. New athletes under this login are no longer comped.' : 'Written, but the grant does not read back as revoked. Check it.');
    return after?.revoked === true ? 0 : 1;
  }
  const bad = [];
  for (const r of rows) {
    const a = await getDoc(target, 'athletes', r.athlete.id);
    if (!(a?.billing?.status === 'active' && a.billing.comp === true)) bad.push(r.athlete.name);
  }
  if (!after || after.until !== args.until || after.revoked !== false || bad.length) {
    console.error(`Written, but it does not read back as expected${bad.length ? ` (${bad.join(', ')} not comped)` : ''}. Check it.`);
    return 1;
  }
  console.log(`Ready. Every athlete ${args.email} signs up on ${args.packages ? 'Elite' : 'a monthly package'} is free through ${args.until}, with no Pay step.${rows.length ? ` Comped now: ${rows.map((r) => r.athlete.name).join(', ')}.` : ''}\n${SEASON_END}`);
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
