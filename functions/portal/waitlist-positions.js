/**
 * waitlistPositions - where the caller's own athletes stand on a session's
 * waitlist, in the EXACT order promotion uses (owner rulings 2026-10-01).
 *
 * The app used to count places by join time, but the server puts athletes
 * holding a bonus token first, so "You're #1" could be wrong. Bonus tokens
 * are family-scoped in the rules and, with this release, so is the
 * waitlist itself, so a client cannot work the order out. This callable
 * does, with the same `orderedCandidates` promotion runs
 * (portal/waitlist-order.js), and answers only about the caller's own
 * athletes: a parent's household, an athlete login's own athlete.
 *
 *   in   {sessionIds: string[]}                 1 to 50 ids
 *   out  {positions: {[sessionId]: {[athleteId]: number}}}   1-based
 *
 * An unknown session, a session with no entries, or one the caller has no
 * entry on answers `{}` for that id. Read only.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const lib = require('./lib');
const order = require('./waitlist-order');

const {HttpsError} = functions.https;

/** The most session ids one call may ask about. */
const MAX_SESSIONS = 50;
/** Longest id accepted; real session ids are far shorter. */
const MAX_ID_LENGTH = 200;

/**
 * The validated, de-duplicated session ids of a call.
 * @param {*} data The callable payload.
 * @return {!Array<string>} The ids.
 */
function sessionIdsOf(data) {
  const ids = data && data.sessionIds;
  const ok = Array.isArray(ids) && ids.length >= 1 &&
      ids.length <= MAX_SESSIONS &&
      ids.every((id) => typeof id === 'string' && id.length > 0 &&
          id.length <= MAX_ID_LENGTH && !id.includes('/'));
  if (!ok) {
    throw new HttpsError('invalid-argument',
        `Send 1 to ${MAX_SESSIONS} session ids.`,
        {reason: 'bad-session-ids'});
  }
  return Array.from(new Set(ids));
}

/**
 * The athletes the caller may be told about: its household's athletes for
 * a parent, its own athlete for an athlete login, nobody otherwise.
 * @param {!Object} store An admin Firestore.
 * @param {string} uid The caller.
 * @return {!Promise<!Set<string>>} Athlete ids.
 */
async function ownAthleteIds(store, uid) {
  const snap = await store.collection('users').doc(uid).get();
  const user = snap.exists ? snap.data() || {} : {};
  if (user.role === 'athlete' && user.athleteId) {
    return new Set([user.athleteId]);
  }
  if (user.role === 'parent' && user.householdId) {
    const kids = await store.collection('athletes')
        .where('householdId', '==', user.householdId).get();
    return new Set(kids.docs.map((d) => d.id));
  }
  return new Set();
}

/**
 * One session's places for the caller's athletes.
 * @param {!Object} store An admin Firestore.
 * @param {string} sessionId The session.
 * @param {!Set<string>} own The caller's athlete ids.
 * @param {{today: string, now: !Date}} clock The clock.
 * @return {!Promise<!Object<string, number>>} `{athleteId: place}`.
 */
async function positionsFor(store, sessionId, own, clock) {
  const entries = await order.sessionEntries(order.PLAIN, store, sessionId);
  // Most sessions asked about hold no entry of the caller's: stop before
  // the per-entry reads the order needs.
  if (!entries.some((e) => own.has(e.athleteId))) return {};
  const sessionSnap = await store.collection('sessions').doc(sessionId).get();
  if (!sessionSnap.exists) return {};
  const ordered = await order.orderedCandidates(order.PLAIN, store, {
    sessionId,
    session: sessionSnap.data() || {},
    entries,
    today: clock.today,
    now: clock.now,
  });
  const places = {};
  ordered.forEach((cand, i) => {
    if (own.has(cand.athleteId)) places[cand.athleteId] = i + 1;
  });
  return places;
}

/**
 * The callable's body, exported so the unit tests can call it in-process.
 * @param {*} data `{sessionIds: string[]}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps The
 *     Firestore and the clock, injectable for tests.
 * @return {!Promise<{positions: !Object}>} The places, by session id.
 */
async function waitlistPositionsHandler(data, context, deps) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.',
        {reason: 'signed-out'});
  }
  const sessionIds = sessionIdsOf(data);
  const store = (deps && deps.db) || admin.firestore();
  const now = deps && deps.now instanceof Date ? deps.now : new Date();
  const clock = {today: lib.todayISO(now), now};
  const own = await ownAthleteIds(store, auth.uid);
  const positions = {};
  for (const id of sessionIds) positions[id] = {};
  if (own.size === 0) return {positions};
  await Promise.all(sessionIds.map(async (id) => {
    positions[id] = await positionsFor(store, id, own, clock);
  }));
  return {positions};
}

// Binds no secret; `runWith({secrets: []})` like the other callables so
// `grep runWith` finds every function (portal/family.js).
const waitlistPositions = functions.runWith({secrets: []}).https.onCall(
    (data, context) => waitlistPositionsHandler(data, context));

module.exports = {waitlistPositions, waitlistPositionsHandler};
