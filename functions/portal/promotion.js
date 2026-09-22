/**
 * Waitlist promotion (contract v2.1, TEAM.md Sprint 13 pin F).
 *
 * Replaces the 2025 `onSessionUpdateNotifyWaitlist`, which read
 * `sessions.participants` / `sessions.waitlist` arrays that no v1+ session
 * has ever carried and so could never fire.
 *
 * A seat opening is `sessions.booked` DECREASING. Every path that frees a
 * seat goes through it: a member cancelling, staff cancelling a session, and
 * the Stripe handler revoking on lapse. The trigger then walks the session's
 * waitlist and promotes while seats and entries remain.
 *
 * Rules are bypassed under the admin SDK, so this module replicates EVERY
 * client gate itself — membership not past_due/lapsed, the period cap
 * counted exactly as `tokensFor` counts it, and the grace-first charge
 * order. It never branches on `sessions.type`: one pool (design keystone).
 *
 * AUTO-CONFIRM, no acceptance window (owner's ruling, pinned Sprint 12).
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// See the note in portal/stripe.js: admin.firestore.FieldValue does not
// survive the Functions emulator's admin stub; the modular export does.
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const notify = require('./notify');

/** A safety stop; a session's capacity is 15, so this can never bind. */
const MAX_PROMOTIONS_PER_EVENT = 25;

/**
 * A session's effective status. Sessions written by the season generator
 * carry NO `status` field at all - only calendar-synced production sessions
 * and the hand-seeded specialist slots do - so ABSENT MEANS SCHEDULED (db
 * lane reconciliation, Sprint 13). Gating on a bare `!== 'scheduled'` would
 * silently refuse to promote into every generated block, which is most of
 * the schedule.
 * @param {?Object} session A `sessions/{id}` document body.
 * @return {string} 'scheduled' or 'cancelled'.
 */
function sessionStatus(session) {
  const s = session && session.status;
  return s === undefined || s === null ? 'scheduled' : s;
}

/**
 * @return {!Object} The admin Firestore, resolved lazily.
 */
function db() {
  return admin.firestore();
}

/**
 * Milliseconds from a `joinedAt` that may be a Firestore Timestamp, a Date
 * or an ISO string (the seed writes one shape, the client another).
 * @param {*} value The stored `joinedAt`.
 * @return {number} Epoch millis; `Infinity` sorts an unusable value last.
 */
function joinedAtMillis(value) {
  if (!value) return Infinity;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Infinity;
}

/**
 * Everything one waitlist entry's gates need. READ ONLY — a Firestore
 * transaction requires every read before any write, so the caller loads all
 * candidates first and only then decides and writes.
 * @param {!Object} tx The transaction.
 * @param {!Object} entry `{id, ...}` from the waitlist query.
 * @param {!Object} session The session body.
 * @param {string} sessionId The session id.
 * @param {string} today Today in America/Chicago.
 * @return {!Promise<!Object>} A candidate: the entry, its gate verdict and,
 *     when it passes, the charge that would pay for it.
 */
async function loadCandidate(tx, entry, session, sessionId, today) {
  const base = {entry, ok: false, reason: null, graceExpiry: null};
  const athleteId = entry.athleteId;
  if (!athleteId) return Object.assign(base, {reason: 'no-athlete'});

  const athleteSnap = await tx.get(db().collection('athletes').doc(athleteId));
  if (!athleteSnap.exists) return Object.assign(base, {reason: 'no-athlete'});
  const athlete = athleteSnap.data() || {};
  const householdId = athlete.householdId || entry.householdId || null;

  let household = null;
  if (householdId) {
    const hhSnap = await tx.get(
        db().collection('households').doc(householdId));
    household = hhSnap.exists ? hhSnap.data() : null;
  }
  if (!lib.membershipAllowsBooking(household)) {
    return Object.assign(base, {reason: 'membership-inactive'});
  }

  // The period is derived from the SESSION's date and the household's own
  // anchor — never from the entry's stored periodKey, which a client wrote.
  const anchorDay = household && household.periodAnchorDay;
  const period = lib.periodFor(session.date, anchorDay);

  let pkg = null;
  if (athlete.packageId) {
    const pkgSnap = await tx.get(
        db().collection('packages').doc(athlete.packageId));
    pkg = pkgSnap.exists ? pkgSnap.data() : null;
  }
  if (!pkg) return Object.assign(base, {reason: 'no-package'});

  const tpSnap = await tx.get(db().collection('tokenPeriods')
      .doc(lib.tokenPeriodId(athleteId, period.periodKey)));
  const tokenPeriod = tpSnap.exists ? tpSnap.data() : null;

  const bookingSnap = await tx.get(
      lib.periodBookingsQuery(db(), athleteId, period));
  const bookings = lib.rows(bookingSnap);
  const already = bookings.find(
      (b) => b.id === lib.bookingId(athleteId, sessionId) &&
          b.status !== 'cancelled');
  if (already) return Object.assign(base, {reason: 'already-booked'});

  const waitSnap = await tx.get(db().collection('waitlist')
      .where('athleteId', '==', athleteId));
  const graceSnap = await tx.get(db().collection('graceTokens')
      .where('athleteId', '==', athleteId));

  const position = lib.tokensPosition({
    pkg,
    tokenPeriod,
    bookings,
    // The entry being promoted IS the reservation now being spent, so it
    // must not also count against the cap it is paying into.
    waitlist: lib.rows(waitSnap).map((w) => ({
      id: w.id,
      periodKey: lib.periodFor(w.date || session.date, anchorDay).periodKey,
    })),
    ignoreWaitlistIds: [entry.id],
    graceTokens: lib.rows(graceSnap),
    periodKey: period.periodKey,
    today,
  });
  const charge = lib.chargeFor({position, sessionDate: session.date});
  if (!charge.chargedFrom) {
    return Object.assign(base, {reason: charge.reason || 'no-tokens-left'});
  }
  return {
    entry,
    ok: true,
    reason: null,
    athlete,
    athleteId,
    householdId,
    period,
    charge,
    // Ordering key: the grace token this candidate would actually spend.
    graceExpiry: charge.chargedFrom === 'grace' ?
        (position.grace[0] && position.grace[0].expiresAt) || '9999-12-31' :
        null,
  };
}

/**
 * The promotion order (pin F): entries whose athlete holds an unconsumed,
 * unexpired grace token first, soonest expiry first, then `joinedAt` asc.
 * "Grace holders first" is the old rollover priority under tokens — a family
 * the Academy already failed once goes to the front.
 * @param {!Array<!Object>} candidates Loaded candidates.
 * @return {!Array<!Object>} A new, ordered array.
 */
function orderCandidates(candidates) {
  return candidates.slice().sort((a, b) => {
    if (a.graceExpiry && !b.graceExpiry) return -1;
    if (!a.graceExpiry && b.graceExpiry) return 1;
    if (a.graceExpiry && b.graceExpiry && a.graceExpiry !== b.graceExpiry) {
      return a.graceExpiry < b.graceExpiry ? -1 : 1;
    }
    return joinedAtMillis(a.entry.joinedAt) - joinedAtMillis(b.entry.joinedAt);
  });
}

/**
 * The booking a promotion writes (pin F). No `pool` — it is retired.
 * @param {!Object} cand An ordered, passing candidate.
 * @param {string} sessionId The session.
 * @param {!Object} session The session body.
 * @return {!Object} The `bookings/{athleteId}_{sessionId}` body.
 */
function promotedBooking(cand, sessionId, session) {
  const body = {
    athleteId: cand.athleteId,
    sessionId,
    householdId: cand.householdId || null,
    date: session.date,
    type: session.type || null,
    status: 'confirmed',
    periodKey: cand.period.periodKey,
    graceTokenId: cand.charge.graceTokenId,
    chargedFrom: cand.charge.chargedFrom,
    createdBy: 'system',
    promotedFromWaitlist: true,
    createdAt: FieldValue.serverTimestamp(),
  };
  // Contract v2.1: a family that chose the parent for a Yannick 1:1 keeps
  // that choice through promotion - it is the same seat they waited for.
  if (session.type === 'mental' && cand.entry.attendee === 'parent') {
    body.attendee = 'parent';
  }
  return body;
}

/**
 * Fill exactly one seat, in one transaction. Reads the session and its
 * waitlist, loads every candidate, orders them, deletes the ones that fail a
 * gate (no grace token — the athlete's own circumstances, not a supply
 * failure), and promotes the first that passes.
 * @param {string} sessionId The session.
 * @param {string} today Today in America/Chicago.
 * @return {!Promise<{done: boolean, promoted: ?Object, dropped:
 *     !Array<!Object>, reason: ?string}>} What happened.
 */
async function promoteOneSeat(sessionId, today) {
  const sessionRef = db().collection('sessions').doc(sessionId);
  return db().runTransaction(async (tx) => {
    const none = {done: true, promoted: null, dropped: [], reason: null};

    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) {
      return Object.assign({}, none, {reason: 'session-missing'});
    }
    const session = sessionSnap.data() || {};
    if (sessionStatus(session) !== 'scheduled') {
      return Object.assign({}, none, {reason: 'session-not-scheduled'});
    }
    const booked = Number(session.booked || 0);
    const capacity = Number(session.capacity || 0);
    if (booked >= capacity) {
      return Object.assign({}, none, {reason: 'full'});
    }
    // Never promote into a block that has already happened; the waitlist
    // sweep (scripts/sweep-waitlist.mjs, db lane) is what retires those
    // entries, and it mints the grace token this path must not.
    if (session.date && session.date < today) {
      return Object.assign({}, none, {reason: 'session-past'});
    }

    const entriesSnap = await tx.get(db().collection('waitlist')
        .where('sessionId', '==', sessionId)
        .orderBy('joinedAt', 'asc'));
    if (entriesSnap.empty) {
      return Object.assign({}, none, {reason: 'waitlist-empty'});
    }
    const entries = lib.rows(entriesSnap);

    // ---- every read happens above this line ----
    const candidates = [];
    for (const entry of entries) {
      candidates.push(
          await loadCandidate(tx, entry, session, sessionId, today));
    }
    const ordered = orderCandidates(candidates);

    const dropped = [];
    let promoted = null;
    for (const cand of ordered) {
      if (cand.ok) {
        promoted = cand;
        break;
      }
      dropped.push({athleteId: cand.entry.athleteId, reason: cand.reason});
      tx.delete(db().collection('waitlist').doc(cand.entry.id));
    }

    if (!promoted) {
      return {done: true, promoted: null, dropped, reason: 'no-candidate'};
    }

    tx.set(
        db().collection('bookings')
            .doc(lib.bookingId(promoted.athleteId, sessionId)),
        promotedBooking(promoted, sessionId, session));
    tx.update(sessionRef, {booked: booked + 1});
    tx.delete(db().collection('waitlist').doc(promoted.entry.id));

    return {
      done: false,
      dropped,
      reason: null,
      promoted: {
        athleteId: promoted.athleteId,
        householdId: promoted.householdId,
        athleteName: promoted.athlete.name || null,
        attendee: promoted.entry.attendee || null,
        chargedFrom: promoted.charge.chargedFrom,
        graceTokenId: promoted.charge.graceTokenId,
        periodKey: promoted.period.periodKey,
        session,
      },
    };
  });
}

/**
 * Promote while seats and entries remain, then notify each promoted family.
 * Notifications are sent AFTER their transaction commits: Courier is not
 * transactional, and a failed send must never roll back a seat.
 * @param {string} sessionId The session whose `booked` dropped.
 * @return {!Promise<{promoted: number, dropped: number}>} A summary.
 */
async function fillOpenSeats(sessionId) {
  const today = lib.todayISO();
  const promotions = [];
  let dropped = 0;
  for (let i = 0; i < MAX_PROMOTIONS_PER_EVENT; i += 1) {
    const result = await promoteOneSeat(sessionId, today);
    dropped += result.dropped.length;
    for (const d of result.dropped) {
      console.log(
          `waitlist entry dropped: session=${sessionId} ` +
          `athlete=${d.athleteId} reason=${d.reason}`);
    }
    if (!result.promoted) {
      if (result.reason) {
        console.log(`promotion stopped: session=${sessionId} ` +
            `reason=${result.reason}`);
      }
      break;
    }
    promotions.push(result.promoted);
    console.log(
        `promoted from waitlist: session=${sessionId} ` +
        `athlete=${result.promoted.athleteId} ` +
        `chargedFrom=${result.promoted.chargedFrom} ` +
        `periodKey=${result.promoted.periodKey}`);
  }

  for (const p of promotions) {
    try {
      await notify.notifyWaitlistPromotion({
        athleteId: p.athleteId,
        householdId: p.householdId,
        athleteName: p.athleteName,
        attendee: p.attendee,
        sessionId,
        session: p.session,
      });
    } catch (err) {
      console.error('promotion notification failed:', err);
    }
  }
  return {promoted: promotions.length, dropped};
}

/**
 * The trigger itself: `sessions/{sessionId}` updated with `booked`
 * decreasing, `status == 'scheduled'` and a seat actually free.
 *
 * Promotion INCREASES `booked`, so this can never re-enter itself.
 */
const onSessionBookedDecrease = functions.firestore
    .document('sessions/{sessionId}')
    .onUpdate(async (change, context) => {
      const before = change.before.data() || {};
      const after = change.after.data() || {};
      const beforeBooked = Number(before.booked || 0);
      const afterBooked = Number(after.booked || 0);
      const capacity = Number(after.capacity || 0);

      if (!(afterBooked < beforeBooked)) return null;
      if (sessionStatus(after) !== 'scheduled') return null;
      if (!(afterBooked < capacity)) return null;

      try {
        const summary = await fillOpenSeats(context.params.sessionId);
        console.log(
            `onSessionBookedDecrease: session=${context.params.sessionId} ` +
            `promoted=${summary.promoted} dropped=${summary.dropped}`);
      } catch (err) {
        console.error('onSessionBookedDecrease error:', err);
      }
      return null;
    });

module.exports = {
  fillOpenSeats,
  joinedAtMillis,
  onSessionBookedDecrease,
  orderCandidates,
  promoteOneSeat,
  sessionStatus,
};
