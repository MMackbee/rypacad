#!/usr/bin/env node
/**
 * Daily membership export — the audit for what the Stripe webhook (functions
 * lane) does live (contract v2.1, Sprint 13 pin H / tokens-and-billing-
 * contract.md §14: "webhooks act, the export audits"). One CSV row per
 * household, to stdout. READ-ONLY: this script never writes anything, to
 * Firestore or to Stripe.
 *
 *   node scripts/export-memberships.mjs                    # emulator (Stripe column reads 'skipped')
 *   npm run export:emulator                                # same, via scripts/emulator.env
 *   node scripts/export-memberships.mjs --prod              # production, Stripe SKIPPED unless STRIPE_SECRET_KEY is set
 *   STRIPE_SECRET_KEY=sk_... node scripts/export-memberships.mjs --prod > memberships.csv
 *
 * Columns:
 *   householdId, name, appStatus, stripeCustomerId, stripeSubscriptionStatus,
 *   currentPeriodStart, currentPeriodEnd, athletes, openConfirmedBookings,
 *   openWaitlistEntries, mismatch
 *
 * `athletes` is one household's per-athlete token position, semicolon-joined
 * (`athleteId:granted/used/reserved/grace`) — the pin asks for ONE ROW PER
 * HOUSEHOLD (not per athlete), so a household's several kids are summarized
 * in this one cell rather than splitting the CSV's grain. Each number comes
 * from the SAME `tokensFor()` (frontend/src/portal/data/packages.js,
 * bundled here exactly like seed-firestore.mjs bundles it — never
 * reimplemented) that every live screen reads, over the athlete's CURRENT
 * period (`periodFor(today, household.periodAnchorDay)`), so the export can
 * never disagree with what a parent sees in the app by construction.
 *
 * `appStatus` is `households.membership.status`, absent == 'active' (the
 * same rule the schema uses everywhere). `stripeSubscriptionStatus` is
 * pulled LIVE from the Stripe API via `households.stripeSubscriptionId`
 * (never cached, never the app's own copy of it) so a webhook the app missed
 * still shows up as a mismatch here. It reads 'skipped' in emulator mode
 * (STRIPE_SECRET_KEY meaningless against fake ids) or whenever
 * STRIPE_SECRET_KEY is unset; 'not-linked' when the household itself has no
 * `stripeSubscriptionId` on file (a different "can't tell" reason, kept
 * distinct in the column so a blank demo household doesn't read as a
 * dropped webhook). `mismatch` reads 'skipped' too whenever the Stripe
 * column could not be resolved — asserting agreement/disagreement without
 * live data would be a guess, not an audit.
 *
 * Target: the emulator (FIRESTORE_EMULATOR_HOST) by default, `--prod` for
 * production (scripts/lib/prod-auth.mjs, the same sanctioned-writer
 * mechanism sync-calendar-sessions.mjs/sweep-waitlist.mjs use for auth —
 * this script only ever GETs, never writes, but the read still needs an
 * authenticated principal against production, since rules don't grant a
 * script one). Dependency-free (Node >= 20 global fetch).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleFrontend, fwdPath } from './lib/bundle-frontend.mjs';
import { resolveTarget, queryCollection, eqFilter, cmpFilter, andFilter, getDoc } from './lib/firestore-rest.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(repoRoot, 'frontend', 'src', 'portal', 'data');

const PROD = process.argv.includes('--prod');
// Emulator-mode detection for the Stripe-skip rule (pin H): true whenever
// we are NOT targeting production, i.e. whenever FIRESTORE_EMULATOR_HOST is
// what resolveTarget() is about to use.
const EMULATOR_MODE = !PROD;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || null;

if (PROD && process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing --prod while FIRESTORE_EMULATOR_HOST is set — the target is ambiguous.\n' +
      'Unset the variable to export production, or drop --prod to export the emulator.'
  );
  process.exit(1);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadPortalData() {
  return bundleFrontend(repoRoot, [
    `export { ALL_PACKAGES, packageById, periodFor, tokensFor, normalizeAnchorDay } from '${fwdPath(path.join(dataDir, 'packages.js'))}';`,
  ], { tmpPrefix: 'ryp-export-' });
}

// ---------------------------------------------------------------------------
// Stripe REST — read-only, GET requests only. Never called in emulator mode.
// ---------------------------------------------------------------------------

async function fetchStripeSubscription(subscriptionId) {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    return { error: `Stripe ${res.status}: ${body.slice(0, 200)}` };
  }
  return await res.json();
}

/** Normalizes a Stripe subscription.status into the app's three-state model,
 * for the MISMATCH comparison — not stored, not sent back anywhere. */
function normalizeStripeStatus(stripeStatus) {
  if (['active', 'trialing'].includes(stripeStatus)) return 'active';
  if (['past_due', 'unpaid'].includes(stripeStatus)) return 'past_due';
  if (['canceled', 'incomplete_expired'].includes(stripeStatus)) return 'lapsed';
  return stripeStatus; // incomplete/paused/etc. — compared literally, will read as a mismatch
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

const HEADER = [
  'householdId', 'name', 'appStatus', 'stripeCustomerId', 'stripeSubscriptionStatus',
  'currentPeriodStart', 'currentPeriodEnd', 'athletes', 'openConfirmedBookings',
  'openWaitlistEntries', 'mismatch',
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const target = await resolveTarget({ prod: PROD });
  const today = todayISO();

  console.error(`# export-memberships: target=${target.label} today=${today} stripe=${STRIPE_SECRET_KEY && !EMULATOR_MODE ? 'live' : 'skipped'}`);

  const { packageById, periodFor, tokensFor } = loadPortalData();

  const households = await queryCollection(target, { from: [{ collectionId: 'households' }] });
  const allAthletes = await queryCollection(target, { from: [{ collectionId: 'athletes' }] });
  const athletesByHousehold = new Map();
  for (const a of allAthletes) {
    const list = athletesByHousehold.get(a.householdId) || [];
    list.push(a);
    athletesByHousehold.set(a.householdId, list);
  }

  const lines = [csvRow(HEADER)];

  for (const h of households) {
    const appStatus = h.membership?.status ?? 'active';

    // Open confirmed bookings / waitlist entries — household-wide.
    // `bookings where householdId == :id and date >= today` rides the
    // existing `(householdId ASC, date ASC)` index (DATA-MODEL.md index 3,
    // the parent-household-view query); `status` is filtered in memory, the
    // same "extra dimension in memory" discipline every other bookings
    // composite read in this schema already uses.
    const householdBookings = await queryCollection(target, {
      from: [{ collectionId: 'bookings' }],
      where: andFilter(eqFilter('householdId', h.id), cmpFilter('date', 'GREATER_THAN_OR_EQUAL', today)),
    });
    const openConfirmedBookings = householdBookings.filter((b) => b.status === 'confirmed').length;

    // waitlist has no composite for a bare householdId equality filter — it
    // doesn't need one (a single equality filter rides the automatic
    // single-field index, same reasoning DATA-MODEL.md gives for
    // `athletes where householdId == :id`).
    const householdWaitlist = await queryCollection(target, {
      from: [{ collectionId: 'waitlist' }],
      where: eqFilter('householdId', h.id),
    });

    // Stripe — live, read-only, skipped in emulator mode or with no key.
    let stripeStatus = 'skipped';
    let mismatch = 'skipped';
    if (!EMULATOR_MODE) {
      if (!h.stripeSubscriptionId) {
        stripeStatus = 'not-linked';
      } else if (!STRIPE_SECRET_KEY) {
        stripeStatus = 'skipped';
      } else {
        const sub = await fetchStripeSubscription(h.stripeSubscriptionId);
        stripeStatus = sub.error ? `error: ${sub.error}` : sub.status;
      }
    }
    if (stripeStatus !== 'skipped' && !stripeStatus.startsWith('error:') && stripeStatus !== 'not-linked') {
      mismatch = normalizeStripeStatus(stripeStatus) === appStatus ? 'false' : 'true';
    } else if (stripeStatus === 'not-linked') {
      mismatch = ''; // nothing to compare against — not an error, just no Stripe link yet (demo/seed household)
    }

    // Per-athlete token position — the athlete's OWN current period (their
    // household's anchor may differ from another athlete's if households
    // ever diverge, though today every athlete inherits its own household's
    // anchor), via the exact tokensFor() every live screen reads.
    const athletes = athletesByHousehold.get(h.id) || [];
    const athleteCells = [];
    for (const a of athletes) {
      const pkg = packageById(a.packageId);
      const anchor = h.periodAnchorDay ?? 1;
      const { periodKey } = periodFor(today, anchor);
      const [athleteBookings, athleteWaitlist, athleteGrace, tokenPeriodDoc] = await Promise.all([
        queryCollection(target, { from: [{ collectionId: 'bookings' }], where: eqFilter('athleteId', a.id) }),
        queryCollection(target, { from: [{ collectionId: 'waitlist' }], where: eqFilter('athleteId', a.id) }),
        queryCollection(target, { from: [{ collectionId: 'graceTokens' }], where: eqFilter('athleteId', a.id) }),
        getDoc(target, 'tokenPeriods', `${a.id}_${periodKey}`),
      ]);
      const pos = tokensFor(a, pkg, athleteBookings, athleteWaitlist, athleteGrace, periodKey, {
        today,
        tokenPeriod: tokenPeriodDoc || undefined,
      });
      const grantedStr = pos.unlimited ? 'unlimited' : pos.granted;
      athleteCells.push(`${a.id}:${grantedStr}/${pos.used}/${pos.reserved}/${pos.grace.length}`);
    }

    lines.push(csvRow([
      h.id,
      h.name ?? '',
      appStatus,
      h.stripeCustomerId ?? '',
      stripeStatus,
      h.membership?.currentPeriodStart ?? '',
      h.membership?.currentPeriodEnd ?? '',
      athleteCells.join(';'),
      openConfirmedBookings,
      householdWaitlist.length,
      mismatch,
    ]));
  }

  console.log(lines.join('\n'));
  console.error(`# ${households.length} household(s) exported.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
