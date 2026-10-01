/**
 * Waitlist promotion (contract v2.1, TEAM.md Sprint 13 pin F).
 *
 * Replaces the 2025 `onSessionUpdateNotifyWaitlist`, which read
 * `sessions.participants` / `sessions.waitlist` arrays that no v1+ session
 * has ever carried and so could never fire.
 *
 * A seat opens when `sessions.booked` DECREASES (a member cancelling, the
 * Stripe handler revoking on lapse), when `capacity` is RAISED, or when a
 * cancelled session is set back to scheduled. The one sessions trigger then
 * walks the waitlist and promotes while seats and entries remain. The same
 * trigger closes the waitlist when the academy CANCELS the session
 * (portal/waitlist-close.js).
 *
 * Rules are bypassed under the admin SDK, so every gate a normal booking
 * passes is applied before a promotion; the gates and the order live in
 * portal/waitlist-order.js, shared with the position families are shown.
 * Charging never branches on `sessions.type`: one pool (design keystone).
 *
 * OWNER RULINGS 2026-10-01, all enforced here:
 *   - No same-day promotion: a session dated today or earlier is never
 *     promoted into (the family could not cancel). Entries still waiting
 *     are closed by the next morning's sweep.
 *   - A candidate who fails a gate is removed from the list AND told why.
 *   - The seat count is the real one: the larger of `sessions.booked` and
 *     the session's non-cancelled bookings. A full session is never
 *     promoted into, whatever the counter says.
 *
 * AUTO-CONFIRM, no acceptance window (owner's ruling, pinned Sprint 12).
 *
 * Single token (owner rulings 2026-09-29/30, portal/single.js): a purchased
 * `single_{cs}` token is good all season, so it may have been spent in ANY
 * period. portal/waitlist-order.js already reads every candidate's token
 * spends across periods, and a single athlete's OTHER waitlist entries hold
 * tokens (`tokensPosition` `held`). A purchased token is inventory, not a
 * debt the Academy owes, so it earns no queue priority
 * (`candidateGraceExpiry`, in waitlist-order.js with the rest of the order).
 * A promotion that spends one is checked by portal/single-guard.js like any
 * other spend.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// See the note in portal/stripe.js: admin.firestore.FieldValue does not
// survive the Functions emulator's admin stub; the modular export does.
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const close = require('./waitlist-close');
const order = require('./waitlist-order');
const tell = require('./waitlist-notices');
const {MAIL_SECRETS} = require('./secrets');

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
 * What a notice needs about one candidate, promoted or dropped.
 * @param {!Object} cand A loaded candidate.
 * @param {string} sessionId The session.
 * @param {!Object} session The session body.
 * @return {!Object} The record `fillOpenSeats` hands to the notices.
 */
function recordOf(cand, sessionId, session) {
  return {
    athleteId: cand.athleteId,
    householdId: cand.householdId,
    athleteName: (cand.athlete && cand.athlete.name) || null,
    joinedAt: order.joinedAtMillis(cand.entry.joinedAt),
    reason: cand.reason,
    sessionId,
    session,
  };
}

/**
 * Fill exactly one seat, in one transaction. Reads the session, its live
 * bookings and its waitlist, loads every candidate in order, deletes the
 * ones ahead of the first that passes (they failed a gate - the athlete's
 * own circumstances, not a supply failure, and `fillOpenSeats` tells them),
 * and promotes the first that passes.
 * @param {string} sessionId The session.
 * @param {{today: string, now: !Date}} clock Today in America/Chicago and
 *     the instant it was read from.
 * @param {!Object=} store An admin Firestore; the default one when absent.
 * @return {!Promise<{done: boolean, promoted: ?Object, dropped:
 *     !Array<!Object>, reason: ?string}>} What happened.
 */
async function promoteOneSeat(sessionId, clock, store) {
  const fs = store || db();
  const sessionRef = fs.collection('sessions').doc(sessionId);
  return fs.runTransaction(async (tx) => {
    const stop = (reason, dropped) =>
      ({done: true, promoted: null, dropped: dropped || [], reason});

    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists) return stop('session-missing');
    const session = sessionSnap.data() || {};
    if (sessionStatus(session) !== 'scheduled') {
      return stop('session-not-scheduled');
    }
    // No same-day promotion (owner ruling 2026-10-01): from midnight the
    // family could not cancel. The 06:00 sweep closes what is still waiting.
    if (session.date && session.date <= clock.today) {
      return stop('same-day-or-past');
    }

    // The real seat count: the counter can be written by any signed-in
    // client, so a seat must be free by the counter AND by the roster.
    const booked = Number(session.booked || 0);
    const capacity = Number(session.capacity || 0);
    const live = lib.rows(await tx.get(fs.collection('bookings')
        .where('sessionId', '==', sessionId)))
        .filter((b) => b.status !== 'cancelled').length;
    const taken = Math.max(live, booked);
    // A counter below the roster is wrong: write the true count back.
    const heal = () => {
      if (live > booked) tx.update(sessionRef, {booked: live});
    };
    if (taken >= capacity) {
      heal();
      return stop('full');
    }

    const entries = await order.sessionEntries(tx, fs, sessionId);
    if (entries.length === 0) {
      heal();
      return stop('waitlist-empty');
    }
    const ordered = await order.orderedCandidates(tx, fs, {
      sessionId,
      session,
      entries,
      today: clock.today,
      now: clock.now,
    });
    // ---- every read happens above this line ----

    const dropped = [];
    let promoted = null;
    for (const cand of ordered) {
      if (cand.ok) {
        promoted = cand;
        break;
      }
      dropped.push(recordOf(cand, sessionId, session));
      tx.delete(fs.collection('waitlist').doc(cand.entry.id));
    }

    if (!promoted) {
      heal();
      return stop('no-candidate', dropped);
    }

    tx.set(
        fs.collection('bookings')
            .doc(lib.bookingId(promoted.athleteId, sessionId)),
        promotedBooking(promoted, sessionId, session));
    tx.update(sessionRef, {booked: taken + 1});
    tx.delete(fs.collection('waitlist').doc(promoted.entry.id));

    return {
      done: false,
      dropped,
      reason: null,
      promoted: Object.assign(recordOf(promoted, sessionId, session), {
        attendee: promoted.entry.attendee || null,
        chargedFrom: promoted.charge.chargedFrom,
        graceTokenId: promoted.charge.graceTokenId,
        periodKey: promoted.period.periodKey,
      }),
    };
  });
}

/**
 * Promote while seats and entries remain, then tell each promoted family
 * and each family whose entry was removed. Notices are sent AFTER their
 * transaction commits: a send is not transactional, and a failed one must
 * never roll back a seat. A seat whose transaction throws ends the run
 * without losing the notices for the seats before it.
 * @param {string} sessionId The session with a seat to fill.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps The
 *     Firestore and the clock, injectable for tests.
 * @return {!Promise<{promoted: number, dropped: number}>} A summary.
 */
async function fillOpenSeats(sessionId, deps) {
  const opts = deps || {};
  const now = opts.now instanceof Date ? opts.now : new Date();
  const clock = {today: lib.todayISO(now), now};
  const promotions = [];
  const removals = [];
  for (let i = 0; i < MAX_PROMOTIONS_PER_EVENT; i += 1) {
    // A seat that throws stops the run, but the seats already committed
    // stay booked, so their notices below must still go out.
    let result;
    try {
      result = await promoteOneSeat(sessionId, clock, opts.db);
    } catch (err) {
      console.error(`promotion stopped: session=${sessionId} ` +
          `seat=${i + 1}:`, err);
      break;
    }
    removals.push(...result.dropped);
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
      await tell.promoted(p);
    } catch (err) {
      console.error('promotion notification failed:', err);
    }
  }
  for (const r of removals) {
    try {
      await tell.removed(r);
    } catch (err) {
      console.error('waitlist removal notification failed:', err);
    }
  }
  return {promoted: promotions.length, dropped: removals.length};
}

/**
 * Whether a session update opened a seat the waitlist may fill: the
 * session is scheduled with room, and `booked` went down, `capacity` went
 * up, or the session came back from cancelled.
 *
 * A promotion only INCREASES `booked` (as does writing a true count back),
 * so the trigger can never re-enter itself.
 * @param {!Object} before The session before the update.
 * @param {!Object} after The session after it.
 * @return {boolean} True when promotion should run.
 */
function seatOpened(before, after) {
  if (sessionStatus(after) !== 'scheduled') return false;
  const booked = Number(after.booked || 0);
  const capacity = Number(after.capacity || 0);
  if (!(booked < capacity)) return false;
  return booked < Number(before.booked || 0) ||
      capacity > Number(before.capacity || 0) ||
      sessionStatus(before) !== 'scheduled';
}

/**
 * The trigger's body, exported so the unit tests can drive it.
 * @param {!Object} before The session before the update.
 * @param {!Object} after The session after it.
 * @param {string} sessionId The session.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps The
 *     Firestore and the clock, injectable for tests.
 * @return {!Promise<null>} Always null; a failure is logged, never thrown.
 */
async function handleSessionUpdate(before, after, sessionId, deps) {
  try {
    if (sessionStatus(before) !== 'cancelled' &&
        sessionStatus(after) === 'cancelled') {
      // It re-reads the session: a late cancel event closes nothing.
      const summary = await close.closeSessionWaitlist(
          (deps && deps.db) || db(), sessionId);
      console.log(`onSessionBookedDecrease: session=${sessionId} ` +
          `cancelled, waitlist closed=${summary.closed} ` +
          `notified=${summary.notified}`);
      return null;
    }
    if (!seatOpened(before, after)) return null;
    const summary = await fillOpenSeats(sessionId, deps);
    console.log(`onSessionBookedDecrease: session=${sessionId} ` +
        `promoted=${summary.promoted} dropped=${summary.dropped}`);
  } catch (err) {
    console.error('onSessionBookedDecrease error:', err);
  }
  return null;
}

/**
 * The one trigger on `sessions/{sessionId}`. The name is the deployed one
 * and stays (renaming a function deletes and recreates it); it now also
 * answers a raised capacity, an un-cancel and an academy cancel.
 */
const onSessionBookedDecrease = functions
    .runWith({secrets: MAIL_SECRETS})
    .firestore
    .document('sessions/{sessionId}')
    .onUpdate((change, context) => handleSessionUpdate(
        change.before.data() || {}, change.after.data() || {},
        context.params.sessionId));

module.exports = {
  candidateGraceExpiry: order.candidateGraceExpiry,
  fillOpenSeats,
  handleSessionUpdate,
  joinedAtMillis: order.joinedAtMillis,
  onSessionBookedDecrease,
  orderCandidates: order.orderCandidates,
  promoteOneSeat,
  seatOpened,
  sessionStatus,
};
