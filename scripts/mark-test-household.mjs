#!/usr/bin/env node
/**
 * Mark one household (and its athletes) as a TEST household: `test: true`.
 * Every staff count and report leaves such a household out (admin dashboard,
 * sign-ups, Households card, the membership export, Yannick's contract board
 * and his Monday check-in email), the way scripts/provision-test-family.mjs
 * provisions the RYP Test Family. Use it for an owner's own trial sign-up
 * that sits beside real families in production (owner, 2026-10-29).
 *
 *   node scripts/mark-test-household.mjs --prod --household <householdId> --dry-run
 *   node scripts/mark-test-household.mjs --prod --household <householdId> --yes     (the owner runs this)
 *
 * Without --prod it targets the local emulator. Writes exactly one field,
 * `test: true`, on the household doc and on each athlete doc of that household
 * (merge, nothing else touched), and only when the docs exist. It REFUSES a
 * household that looks real: one with a Stripe subscription, an athlete whose
 * billing is active with a subscription, or any confirmed booking. Nothing is
 * deleted; a flagged family can still sign in.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commit, docName, eqFilter, fsFields, getDoc, queryCollection, resolveTarget } from './lib/firestore-rest.mjs';

const USAGE = 'Usage: node scripts/mark-test-household.mjs [--prod] --household <householdId> (--dry-run | --yes)';

/** @return {{prod, householdId, dryRun, yes} | {error: string}} */
export function parseArgs(argv) {
  const out = { prod: false, householdId: null, dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prod') out.prod = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (a === '--household') out.householdId = argv[++i] ?? null;
    else return { error: `Unknown argument: ${a}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  if (!out.householdId || !/^[A-Za-z0-9_-]{1,64}$/.test(out.householdId)) return { error: 'Pass --household with the household document id.' };
  return out;
}

/** Why this household must not be flagged, or null. Pure. */
export function refusal(household, athletes, confirmedBookings) {
  if (!household) return 'No such household. Nothing written.';
  if (household.stripeSubscriptionId) return `Household has a Stripe subscription (${household.stripeSubscriptionId}); it looks real. Nothing written.`;
  const paying = athletes.find((a) => a.billing?.status === 'active' && a.billing?.subscriptionId);
  if (paying) return `Athlete ${paying.name ?? paying.id} has an active paid subscription; it looks real. Nothing written.`;
  if (confirmedBookings > 0) return `Household has ${confirmedBookings} confirmed booking(s); flag it only after those are cancelled. Nothing written.`;
  return null;
}

/** The merge writes: `test: true` on the household and each athlete, each requiring the doc to exist. Pure. */
export function planWrites(householdId, athletes) {
  const one = (collection, id) => ({
    update: { name: docName(collection, id), fields: fsFields({ test: true }) },
    updateMask: { fieldPaths: ['test'] },
    currentDocument: { exists: true },
  });
  return [one('households', householdId), ...athletes.map((a) => one('athletes', a.id))];
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;
  const args = parseArgs(argv);
  if (args.error) { error(args.error); error(USAGE); return 1; }
  const target = deps.target ?? (await resolveTarget({ prod: args.prod }));
  log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);

  const household = await getDoc(target, 'households', args.householdId);
  const athletes = household ? await queryCollection(target, { from: [{ collectionId: 'athletes' }], where: eqFilter('householdId', args.householdId) }) : [];
  const bookings = household ? await queryCollection(target, { from: [{ collectionId: 'bookings' }], where: eqFilter('householdId', args.householdId) }) : [];
  const confirmed = bookings.filter((b) => b.status === 'confirmed').length;

  const why = refusal(household, athletes, confirmed);
  if (why) { error(`Refusing: ${why}`); return 1; }

  log(`  household  ${args.householdId}  ${household.name ?? '(no name)'}  guardian ${household.guardian?.email ?? '-'}  membership ${household.membership?.status ?? 'active (absent)'}  test ${household.test === true ? 'already true' : 'not set'}`);
  for (const a of athletes) log(`  athlete    ${a.id}  ${a.name ?? '(no name)'}  package ${a.packageId ?? '-'}  billing ${a.billing?.status ?? 'absent'}  test ${a.test === true ? 'already true' : 'not set'}`);
  log(`  bookings   ${bookings.length} total, ${confirmed} confirmed`);

  const writes = planWrites(args.householdId, athletes);
  if (household.test === true && athletes.every((a) => a.test === true)) { log('Nothing to do: already marked test.'); return 0; }
  if (args.dryRun) { log(`Would set test: true on ${writes.length} doc(s). Run again with --yes instead of --dry-run.`); return 0; }

  await commit(target, writes);
  const after = await getDoc(target, 'households', args.householdId);
  const afterAthletes = await queryCollection(target, { from: [{ collectionId: 'athletes' }], where: eqFilter('householdId', args.householdId) });
  if (after?.test !== true || afterAthletes.some((a) => a.test !== true)) { error('Written, but the flag does not read back on every doc. Check the Firebase console.'); return 1; }
  log(`Marked test: true on ${writes.length} doc(s). ${household.name ?? args.householdId} is out of every staff count from now on.`);
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
