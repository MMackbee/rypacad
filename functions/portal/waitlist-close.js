/**
 * Closing a waitlist entry without a spot (owner ruling 2026-10-01): the
 * entry is deleted, which frees the token it held at once, and the family
 * is told once. NOTHING IS MINTED, for anyone - a bonus token is only for a
 * session the academy cancels on a BOOKED athlete, and that path is not
 * here.
 *
 * Two callers: the daily sweep (portal/sweep.js), when the session's date
 * has passed, and the sessions trigger (portal/promotion.js), when the
 * academy cancels the session.
 */

'use strict';

const lib = require('./lib');
const tell = require('./waitlist-notices');

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
 * The cached readers one run of closes shares.
 * @param {!Object} store An admin Firestore.
 * @return {{athletes: !Function, sessions: !Function, packages: !Function}}
 *     The readers.
 */
function readersFor(store) {
  return {
    athletes: cachedReader(store, 'athletes'),
    sessions: cachedReader(store, 'sessions'),
    packages: cachedReader(store, 'packages'),
  };
}

/**
 * Close one entry: delete it, then tell the family. An entry with no
 * athlete or session is deleted and nobody is told. Nor is a family whose
 * athlete holds a live booking for that session - a stray entry left behind
 * by a direct booking, which never went without a spot.
 * @param {!Object} store An admin Firestore.
 * @param {!Object} entry `{id, ...waitlist doc}`.
 * @param {{athletes: !Function, sessions: !Function, packages: !Function,
 *     session: (?Object|undefined), cancelled: (boolean|undefined)}} ctx
 *     The readers, the session body when the caller already holds it, and
 *     whether the academy cancelled the session.
 * @return {!Promise<{notified: boolean, skipped: boolean}>} What happened.
 */
async function closeEntry(store, entry, ctx) {
  await store.collection('waitlist').doc(entry.id).delete();
  if (!entry.athleteId || !entry.sessionId) {
    return {notified: false, skipped: true};
  }
  const bookingSnap = await store.collection('bookings')
      .doc(lib.bookingId(entry.athleteId, entry.sessionId)).get();
  if (bookingSnap.exists &&
      (bookingSnap.data() || {}).status !== 'cancelled') {
    return {notified: false, skipped: false};
  }
  const athlete = await ctx.athletes(entry.athleteId);
  const session = ctx.session || await ctx.sessions(entry.sessionId);
  const pkg = athlete && athlete.packageId ?
      await ctx.packages(athlete.packageId) : null;
  const res = await tell.closed({
    entry,
    athlete,
    session,
    elite: lib.isUnlimited(pkg),
    cancelled: Boolean(ctx.cancelled),
  });
  return {notified: Boolean(res && res.sent), skipped: false};
}

/**
 * The academy cancelled a session: close every entry waiting on it. A
 * second run finds nothing left to close. A Calendly appointment that its
 * own invitee cancelled is not "cancelled by the academy", so anyone
 * waiting on one gets the plain "closed without a spot" copy instead.
 *
 * The STORED session decides, not the event that called this: Firestore
 * triggers are at-least-once and unordered, so a late or redelivered cancel
 * event can arrive after the session is scheduled again, and must not close
 * the list a family has since joined.
 * @param {!Object} store An admin Firestore.
 * @param {string} sessionId The cancelled session.
 * @return {!Promise<{closed: number, notified: number}>} A summary.
 */
async function closeSessionWaitlist(store, sessionId) {
  const sessionSnap = await store.collection('sessions').doc(sessionId).get();
  const session = sessionSnap.exists ? sessionSnap.data() || {} : null;
  if (!session || session.status !== 'cancelled') {
    return {closed: 0, notified: 0};
  }
  const snap = await store.collection('waitlist')
      .where('sessionId', '==', sessionId).get();
  const ctx = Object.assign(readersFor(store), {
    session,
    cancelled: session.source !== 'calendly',
  });
  const summary = {closed: 0, notified: 0};
  for (const doc of snap.docs) {
    const entry = Object.assign({id: doc.id}, doc.data() || {});
    try {
      const res = await closeEntry(store, entry, ctx);
      summary.closed += 1;
      if (res.notified) summary.notified += 1;
    } catch (err) {
      console.error(`waitlist/${doc.id} could not be closed:`, err);
    }
  }
  return summary;
}

module.exports = {cachedReader, closeEntry, closeSessionWaitlist, readersFor};
