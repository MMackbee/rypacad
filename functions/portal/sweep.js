/**
 * The waitlist sweep (contract v2.5, TEAM.md Sprint 17 pins) — the last
 * leg of the token model that used to run by hand (scripts/sweep-waitlist.mjs
 * stays for manual runs and must agree with this file).
 *
 * A waitlist entry whose session date has passed without a promotion is
 * CLOSED: the entry is deleted, which frees the token it held, and the
 * family gets one notice. NOTHING IS MINTED (owner ruling 2026-10-01: no
 * bonus token from a waitlist, for anyone; contract section 4). The delete
 * and the notice are portal/waitlist-close.js, shared with the "academy
 * cancelled the session" path. Idempotent: the entry is gone after the
 * first run, and the notice's ledger id is
 * `{sessionId}_{athleteId}_waitlist_{joinedAtMillis}`.
 *
 * An entry still waiting on the day of its session is never promoted (no
 * same-day promotion, portal/promotion.js) and is closed here the next
 * morning.
 *
 * The body is a plain exported function on a fixed clock so the emulator
 * harness can drive it; index.js schedules it daily at 06:00 Chicago.
 */

'use strict';

const admin = require('firebase-admin');
const lib = require('./lib');
const close = require('./waitlist-close');

/**
 * Daily 06:00 America/Chicago: close every waitlist entry dated before
 * today. A second run on the same day finds nothing to close.
 * @param {{now: (?Date|undefined), db: (?Object|undefined)}=} args The
 *     fixed clock and Firestore.
 * @return {!Promise<{today: string, expired: number, skipped: number,
 *     notified: number}>} A summary; `skipped` counts entries with no
 *     athlete or session, deleted without a notice.
 */
async function runWaitlistSweep(args) {
  const a = args || {};
  const now = a.now instanceof Date ? a.now : new Date();
  const store = a.db || admin.firestore();
  const today = lib.todayISO(now);
  const ctx = close.readersFor(store);
  const snap = await store.collection('waitlist')
      .where('date', '<', today).get();
  const summary = {today, expired: snap.size, skipped: 0, notified: 0};
  for (const doc of snap.docs) {
    const entry = Object.assign({id: doc.id}, doc.data() || {});
    try {
      const res = await close.closeEntry(store, entry, ctx);
      if (res.skipped) {
        console.warn(`waitlist/${doc.id} has no athleteId/sessionId - ` +
            'deleted, nobody told');
        summary.skipped += 1;
      }
      if (res.notified) summary.notified += 1;
    } catch (err) {
      console.error(`waitlist/${doc.id} could not be closed:`, err);
    }
  }
  console.log(`runWaitlistSweep ${today}: expired=${summary.expired} ` +
      `skipped=${summary.skipped} notified=${summary.notified}`);
  return summary;
}

module.exports = {runWaitlistSweep};
