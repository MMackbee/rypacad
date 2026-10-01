#!/usr/bin/env node
/**
 * Sweep expired waitlist entries: any `waitlist` doc whose session `date` has
 * already passed (the athlete was never promoted) is deleted. Deleting the
 * entry frees the token it held. NOTHING IS MINTED (owner ruling 2026-10-01:
 * no bonus token from a waitlist, for anyone - tokens-and-billing-contract.md
 * section 4). This is the manual mirror of the daily sweepWaitlist Cloud
 * Function (functions/portal/sweep.js) and must agree with it. One
 * difference: the function also sends the family a "waitlist closed"
 * notice; this script sends nothing, so prefer the function.
 *
 *   node scripts/sweep-waitlist.mjs                 # emulator, DRY RUN (default — prints the plan)
 *   npm run sweep:emulator                          # same, via scripts/emulator.env
 *   node scripts/sweep-waitlist.mjs --yes            # emulator, WRITES
 *   node scripts/sweep-waitlist.mjs --prod           # production, dry run / read-only preview
 *   node scripts/sweep-waitlist.mjs --prod --yes     # production, WRITES — PM/user-gated
 *
 * Unlike sync-calendar-sessions.mjs (which writes by default and opts INTO a
 * dry run), this script is dry-run BY DEFAULT — printing the plan and writing
 * nothing until `--yes` is passed, for either target. This is a delete
 * script, so the safer default is the one that requires an explicit opt-in
 * to touch data at all, not just to touch production.
 *
 * Target: the emulator (FIRESTORE_EMULATOR_HOST, same local-host refusal
 * posture as seed-firestore.mjs/sync-calendar-sessions.mjs) unless `--prod`
 * is passed, in which case it authenticates as the developer's own
 * firebase-tools CLI login (scripts/lib/prod-auth.mjs) — the same sanctioned-
 * writer mechanism sync-calendar-sessions.mjs --prod uses. Running it against
 * production is a PM/user-gated action per docs/portal/TEAM.md.
 *
 * IDEMPOTENT: a second run finds the entries already gone and does nothing.
 *
 * A single-token athlete (owner rulings 2026-09-29/30) needs no branch here:
 * the entry held one of their own purchased season tokens, and deleting it
 * frees that token like anyone else's.
 *
 * Dependency-free (Node >= 20 global fetch), Firestore REST like every other
 * script in this repo. Never writes anywhere but `waitlist` (delete).
 */

import {
  resolveTarget,
  queryCollection,
  cmpFilter,
  commitInBatches,
  docName,
} from './lib/firestore-rest.mjs';

const DRY_RUN = !process.argv.includes('--yes'); // dry-run is the DEFAULT; --yes is what unlocks writes
const PROD = process.argv.includes('--prod');

if (PROD && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing --prod while FIRESTORE_EMULATOR_HOST is set — the target is ambiguous.\n' +
      'Unset the variable to sweep production, or drop --prod to sweep the emulator.'
  );
  process.exit(1);
}

/** 'YYYY-MM-DD' for local "today" — the sweep's own clock, never hardcoded. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  const target = await resolveTarget({ prod: PROD });
  console.log(`Target: ${target.label}${DRY_RUN ? ' — DRY RUN (pass --yes to write)' : ''}`);

  const today = todayISO();

  // Expired entries: date < today. A single range filter on one field rides
  // Firestore's automatic single-field index on `date` — the same
  // range-on-one-field shape DATA-MODEL.md establishes as composite-free
  // throughout (e.g. the month-session-grid / season-standings notes).
  const expired = await queryCollection(target, {
    from: [{ collectionId: 'waitlist' }],
    where: cmpFilter('date', 'LESS_THAN', today),
  });

  console.log(`Today: ${today}. Expired waitlist entries: ${expired.length}.`);

  // Delete only: the held token is free the moment the entry is gone, and
  // nothing is minted (functions/portal/sweep.js does the same, then notifies).
  const deletes = [];
  for (const entry of expired) {
    deletes.push({ delete: docName('waitlist', entry.id) });
    console.log(`  delete waitlist/${entry.id}  (athlete ${entry.athleteId}, session ${entry.sessionId})`);
  }

  console.log(`\nPlan: ${deletes.length} waitlist delete(s). No token is minted and no notice is sent.`);

  if (deletes.length === 0) {
    console.log('Nothing expired. Nothing to do.');
    return;
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] nothing written. Re-run with --yes to apply this plan.');
    return;
  }
  if (PROD) {
    console.log('\nWriting to PRODUCTION...');
  }

  await commitInBatches(target, deletes, {
    onProgress: (done, totalW) => console.log(`  committed ${done}/${totalW}`),
  });
  console.log(`Done: ${deletes.length} waitlist entr${deletes.length === 1 ? 'y' : 'ies'} swept. Nothing minted.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
