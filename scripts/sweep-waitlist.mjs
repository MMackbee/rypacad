#!/usr/bin/env node
/**
 * Sweep expired waitlist entries: any `waitlist` doc whose session `date` has
 * already passed (the athlete was never promoted) is deleted, and the
 * athlete is minted one `graceTokens` doc (contract v2.1, Sprint 13 pin F —
 * "the session start passes with the athlete still waitlisted; their
 * reserved token is released and one grace token is minted").
 *
 *   node scripts/sweep-waitlist.mjs                 # emulator, DRY RUN (default — prints the plan)
 *   npm run sweep:emulator                          # same, via scripts/emulator.env
 *   node scripts/sweep-waitlist.mjs --yes            # emulator, WRITES
 *   node scripts/sweep-waitlist.mjs --prod           # production, dry run / read-only preview
 *   node scripts/sweep-waitlist.mjs --prod --yes     # production, WRITES — PM/user-gated
 *
 * Unlike sync-calendar-sessions.mjs (which writes by default and opts INTO a
 * dry run), this script is dry-run BY DEFAULT — printing the plan and writing
 * nothing until `--yes` is passed, for either target. This is a delete-and-
 * mint script running on a schedule (TEAM.md §14: "run it with the DB
 * cleanup for the token migration and keep running it daily"), so the safer
 * default is the one that requires an explicit opt-in to touch data at all,
 * not just to touch production.
 *
 * Target: the emulator (FIRESTORE_EMULATOR_HOST, same local-host refusal
 * posture as seed-firestore.mjs/sync-calendar-sessions.mjs) unless `--prod`
 * is passed, in which case it authenticates as the developer's own
 * firebase-tools CLI login (scripts/lib/prod-auth.mjs) — the same sanctioned-
 * writer mechanism sync-calendar-sessions.mjs --prod uses. Running it against
 * production is a PM/user-gated action per docs/portal/TEAM.md.
 *
 * IDEMPOTENT: an athlete who already holds an unconsumed-or-not
 * 'waitlist-expired' grace token for a given `sourceSessionId` is never
 * minted a second one for that same session — re-running the sweep after a
 * partial failure (or just running it twice) never double-mints. The stale
 * waitlist entry is still deleted either way; idempotency only guards the
 * mint, matching the "not minted twice" wording in the pin.
 *
 * Dependency-free (Node >= 20 global fetch), Firestore REST like every other
 * script in this repo. Never writes anywhere but `waitlist` (delete) and
 * `graceTokens` (create).
 */

import {
  resolveTarget,
  queryCollection,
  cmpFilter,
  commitInBatches,
  fsFields,
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

/** +30 days on an ISO date string, plain date math (no date-fns dependency
 * pulled in for one call) — mirrors seed-firestore.mjs's own inline style. */
function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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

  // Existing grace tokens, read once (small collection, same "filter the
  // extra dimension in memory" discipline this schema uses throughout) so
  // the idempotency check below is a single read, not one query per entry.
  const existingGrace = await queryCollection(target, { from: [{ collectionId: 'graceTokens' }] });
  const alreadyMinted = new Set(
    existingGrace
      .filter((g) => g.reason === 'waitlist-expired')
      .map((g) => `${g.athleteId}::${g.sourceSessionId}`)
  );

  console.log(`Today: ${today}. Expired waitlist entries: ${expired.length}.`);

  const deletes = [];
  const creates = [];
  const skippedMints = [];
  for (const entry of expired) {
    deletes.push({ delete: docName('waitlist', entry.id) });
    const key = `${entry.athleteId}::${entry.sessionId}`;
    if (alreadyMinted.has(key)) {
      skippedMints.push(entry);
      continue;
    }
    // Same id the sweepWaitlist Cloud Function mints (functions/portal/sweep.js,
    // Sprint 17) - the two sweeps must agree on it.
    const graceId = `${entry.sessionId}_${entry.athleteId}_waitlist`;
    const doc = {
      athleteId: entry.athleteId,
      householdId: entry.householdId,
      expiresAt: addDaysISO(today, 30),
      reason: 'waitlist-expired',
      sourceSessionId: entry.sessionId,
      createdBy: 'sweep',
      createdAt: new Date(),
    };
    creates.push({ update: { name: docName('graceTokens', graceId), fields: fsFields(doc) } });
    alreadyMinted.add(key); // guard against two expired entries for the same athlete+session in one run
    console.log(`  delete waitlist/${entry.id}  ->  mint graceTokens/${graceId} (expires ${doc.expiresAt})`);
  }
  for (const entry of skippedMints) {
    console.log(
      `  delete waitlist/${entry.id}  ->  SKIP mint: ${entry.athleteId} already holds a ` +
        `'waitlist-expired' grace token for sourceSessionId=${entry.sessionId}`
    );
  }

  console.log(
    `\nPlan: ${deletes.length} waitlist delete(s), ${creates.length} graceTokens mint(s), ` +
      `${skippedMints.length} mint(s) skipped (idempotent).`
  );

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

  await commitInBatches(target, [...deletes, ...creates], {
    onProgress: (done, totalW) => console.log(`  committed ${done}/${totalW}`),
  });
  console.log(`Done: ${deletes.length} waitlist entr${deletes.length === 1 ? 'y' : 'ies'} swept, ${creates.length} grace token(s) minted.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
