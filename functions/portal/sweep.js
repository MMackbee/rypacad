/**
 * The waitlist sweep (contract v2.5, TEAM.md Sprint 17 pins) — the last
 * leg of the token model that used to run by hand (scripts/sweep-waitlist.mjs
 * stays for manual runs and must agree with this file).
 *
 * A waitlist entry whose session date has passed without a promotion is
 * EXPIRED: the reservation it held is released, and because the Academy
 * could not honour the seat the athlete gets a 'waitlist-expired' bonus
 * token (30 days), then one notice. Idempotent twice over: the grace doc
 * id is `{sessionId}_{athleteId}_waitlist` (create-only), and an athlete
 * who already holds a 'waitlist-expired' token for that session — under
 * this id or the manual script's older `sweep-…` ids — is not minted again.
 *
 * The body is a plain exported function on a fixed clock so the emulator
 * harness can drive it; index.js schedules it daily at 06:00 Chicago.
 */

'use strict';

const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const notices = require('./notices');
const notify = require('./notify');

/** Bonus-token life, in days (contract §4). */
const GRACE_DAYS = 30;

/**
 * The deterministic grace-token id for an expired waitlist entry.
 * @param {string} sessionId The session.
 * @param {string} athleteId The athlete.
 * @return {string} The id.
 */
function graceIdFor(sessionId, athleteId) {
  return `${sessionId}_${athleteId}_waitlist`;
}

/**
 * `'YYYY-MM-DD'` plus N days, UTC-noon arithmetic (no DST edge).
 * @param {string} dateISO `'YYYY-MM-DD'`.
 * @param {number} days Days to add.
 * @return {string} `'YYYY-MM-DD'`.
 */
function addDays(dateISO, days) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/**
 * Whether this athlete already holds a 'waitlist-expired' token for the
 * session — any id, so a token the manual script minted counts too.
 * @param {!Object} store An admin Firestore.
 * @param {string} athleteId The athlete.
 * @param {string} sessionId The session.
 * @return {!Promise<boolean>} True when one exists.
 */
async function alreadyMinted(store, athleteId, sessionId) {
  const snap = await store.collection('graceTokens')
      .where('athleteId', '==', athleteId)
      .where('sourceSessionId', '==', sessionId)
      .get();
  return snap.docs.some((d) => (d.data() || {}).reason === 'waitlist-expired');
}

/**
 * Expire one entry: mint (unless already minted), delete, notify.
 * @param {!Object} store An admin Firestore.
 * @param {!Object} entry `{id, ...waitlist doc}`.
 * @param {{today: string, expiresAt: string, athletes: !Function,
 *     sessions: !Function}} ctx The run.
 * @return {!Promise<{minted: boolean, notified: boolean}>} What happened.
 */
async function expireEntry(store, entry, ctx) {
  const graceId = graceIdFor(entry.sessionId, entry.athleteId);
  const graceRef = store.collection('graceTokens').doc(graceId);
  const entryRef = store.collection('waitlist').doc(entry.id);
  const minted =
      !(await alreadyMinted(store, entry.athleteId, entry.sessionId));
  const batch = store.batch();
  if (minted) {
    batch.create(graceRef, {
      athleteId: entry.athleteId,
      householdId: entry.householdId || null,
      expiresAt: ctx.expiresAt,
      reason: 'waitlist-expired',
      sourceSessionId: entry.sessionId,
      createdBy: 'sweep',
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  batch.delete(entryRef);
  await batch.commit();

  let notified = false;
  if (minted) {
    const [athlete, session] = await Promise.all([
      ctx.athletes(entry.athleteId),
      ctx.sessions(entry.sessionId),
    ]);
    const copy = notices.waitlistExpired({
      athlete, session, expiresAt: ctx.expiresAt,
    });
    const res = await notify.sendNotice({
      kind: 'waitlist-expired',
      category: 'schedule',
      householdId: entry.householdId ||
          (athlete && athlete.householdId) || null,
      athleteId: entry.athleteId,
      sessionId: entry.sessionId,
      subjectKey: graceId,
      title: copy.title,
      body: copy.body,
    });
    notified = Boolean(res && res.sent);
  }
  return {minted, notified};
}

/**
 * A memoized document reader.
 * @param {!Object} store An admin Firestore.
 * @param {string} collection The collection.
 * @return {function(?string): !Promise<?Object>} The reader.
 */
function cachedReader(store, collection) {
  const cache = new Map();
  return async (id) => {
    if (!id) return null;
    if (!cache.has(id)) {
      const snap = await store.collection(collection).doc(id).get();
      cache.set(id, snap.exists ? snap.data() : null);
    }
    return cache.get(id);
  };
}

/**
 * Daily 06:00 America/Chicago: expire every waitlist entry dated before
 * today. A second run on the same day finds nothing to expire.
 * @param {{now: (?Date|undefined), db: (?Object|undefined)}=} args The
 *     fixed clock and Firestore.
 * @return {!Promise<{today: string, expired: number, minted: number,
 *     skipped: number, notified: number}>} A summary.
 */
async function runWaitlistSweep(args) {
  const a = args || {};
  const now = a.now instanceof Date ? a.now : new Date();
  const store = a.db || admin.firestore();
  const today = lib.todayISO(now);
  const ctx = {
    today,
    expiresAt: addDays(today, GRACE_DAYS),
    athletes: cachedReader(store, 'athletes'),
    sessions: cachedReader(store, 'sessions'),
  };
  const snap = await store.collection('waitlist')
      .where('date', '<', today).get();
  const summary = {
    today, expired: snap.size, minted: 0, skipped: 0, notified: 0,
  };
  for (const doc of snap.docs) {
    const entry = Object.assign({id: doc.id}, doc.data() || {});
    if (!entry.athleteId || !entry.sessionId) {
      console.warn(`waitlist/${doc.id} has no athleteId/sessionId - ` +
          'deleted, nothing minted');
      await doc.ref.delete();
      summary.skipped += 1;
      continue;
    }
    try {
      const res = await expireEntry(store, entry, ctx);
      if (res.minted) summary.minted += 1;
      else summary.skipped += 1;
      if (res.notified) summary.notified += 1;
    } catch (err) {
      console.error(`waitlist/${doc.id} could not be expired:`, err);
    }
  }
  console.log(`runWaitlistSweep ${today}: expired=${summary.expired} ` +
      `minted=${summary.minted} skipped=${summary.skipped} ` +
      `notified=${summary.notified}`);
  return summary;
}

module.exports = {
  GRACE_DAYS,
  addDays,
  alreadyMinted,
  graceIdFor,
  runWaitlistSweep,
};
