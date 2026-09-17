/**
 * Cloud Functions for the RYP Academy portal.
 *
 * Sprint 12 (TEAM.md "Sprint 12 pins", section I) deleted the 2025
 * unauthenticated onRequest endpoints - createPaymentIntent,
 * handlePaymentSuccess, processRefund, notifyWaitlist, sendSMS,
 * sendBookingConfirmation, sendSessionReminder, testCourier, addTokens,
 * useTokens, getUserTokens, linkParentToChild, fundChildAccount - and the
 * 2025-model helpers they wrapped. None of them could ship under a token
 * model: open CORS, no auth, and addTokens wrote balances for any caller.
 *
 * Sprint 13 (pins F, H, I) adds the first two production server-side
 * WRITERS this app has, both under the admin SDK, both in ./portal:
 *
 *   stripeWebhook            portal/stripe.js     - signature-verified,
 *                                                   idempotent on event.id
 *   onSessionBookedDecrease  portal/promotion.js  - waitlist promotion
 *
 * Sprint 14 (contract v2.2) adds the notification pipeline. Every sender is
 * portal/notify.js's `sendNotice`, which is idempotent on the ledger row
 * `notifications/{kind}_{subjectKey}`; the triggers and jobs below only
 * decide WHEN a notice is owed and build its copy (portal/notices.js):
 *
 *   onBookingCreated       bookings onCreate, status 'confirmed'
 *   onBookingCancelled     bookings onUpdate, cancelReason 'session-cancelled'
 *   onHouseholdMembership  households onUpdate, membership.status changed
 *   sessionReminders       daily 17:00 America/Chicago
 *   tokenExpiryReminders   daily 09:00 America/Chicago
 *
 * The 2025 `onBookingCreateNotifyChild` is DELETED with them: it read
 * `parentId` / `userId` / `childId`, fields no v1+ booking has ever carried,
 * so it could never fire. `booking-revoked` is NOT a trigger - portal/
 * revoke.js knows the count after its batch and sends one notice per
 * household per Stripe event.
 *
 * Sprint 15 (contract v2.3) retires SMS: the Twilio sender, the YES/NO
 * reply webhook (handleSMSResponse) and the smsLogs sweep (cleanupSMSLogs)
 * are deleted. The phone channel is web push through Firebase Cloud
 * Messaging (portal/push.js, no vendor, no key); email goes through
 * portal/email.js (SMTP or Courier).
 *
 * `onSessionUpdateNotifyWaitlist` and `notifyWaitlistForSession` are DELETED
 * here: they read `sessions.participants` / `sessions.waitlist` arrays that
 * no v1+ session has ever carried, so the trigger could never fire.
 * portal/promotion.js replaces them against the real `waitlist` collection.
 *
 * THE FUNCTIONS ENTRY POINT IS firebase-functions/v1 ON PURPOSE. In
 * firebase-functions v6 the package's main export is the v2 namespace, where
 * `functions.firestore.document` and `functions.pubsub.schedule` do not
 * exist - requiring this file through the bare 'firebase-functions' specifier
 * threw `functions.firestore.document is not a function` at load, so NOTHING
 * here was deployable. Importing v1 explicitly keeps every kept 2025 trigger
 * behaving exactly as written. Migrating these to v2 is a separate,
 * deliberate change.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// Initialize Firebase Admin before anything reads Firestore.
admin.initializeApp();

const db = admin.firestore();

const notify = require('./portal/notify');
const notices = require('./portal/notices');
const jobs = require('./portal/jobs');
const {stripeWebhook} = require('./portal/stripe');
const {onSessionBookedDecrease} = require('./portal/promotion');

// ==========================================================================
// PORTAL SERVER-SIDE WRITERS (Sprint 13, contract v2.1)
// ==========================================================================

exports.stripeWebhook = stripeWebhook;
exports.onSessionBookedDecrease = onSessionBookedDecrease;

// ==========================================================================
// NOTIFICATION TRIGGERS (Sprint 14, contract v2.2)
// ==========================================================================

/**
 * One document body, or null.
 * @param {string} collection The collection.
 * @param {?string} id The document id.
 * @return {!Promise<?Object>} The body or null.
 */
async function docBody(collection, id) {
  if (!id) return null;
  const snap = await db.collection(collection).doc(id).get();
  return snap.exists ? snap.data() : null;
}

/**
 * The expiry date of the grace token minted for one athlete by one
 * session's cancellation, when one exists. Two equality filters need no
 * composite index.
 * @param {?string} athleteId The athlete.
 * @param {?string} sessionId The cancelled session.
 * @return {!Promise<?string>} `'YYYY-MM-DD'`, or null when none was minted.
 */
async function graceExpiryFor(athleteId, sessionId) {
  if (!athleteId || !sessionId) return null;
  const snap = await db.collection('graceTokens')
      .where('athleteId', '==', athleteId)
      .where('sourceSessionId', '==', sessionId)
      .get();
  const dates = snap.docs
      .map((d) => (d.data() || {}).expiresAt)
      .filter(Boolean)
      .sort();
  return dates.length > 0 ? dates[0] : null;
}

/**
 * A household's effective membership status; absent == active (DATA-MODEL
 * households.membership).
 * @param {?Object} household A `households/{id}` document body.
 * @return {string} The status.
 */
function membershipStatus(household) {
  const status = household && household.membership &&
      household.membership.status;
  return status || 'active';
}

/**
 * A confirmed booking was created: tell the athlete and their parents.
 *
 * A PROMOTION IS NOT THIS NOTICE. portal/promotion.js writes its booking
 * with `promotedFromWaitlist: true` and `createdBy: 'system'` and sends
 * 'promoted' itself, so this trigger steps over it - otherwise a promoted
 * family would get two messages about one seat.
 */
exports.onBookingCreated = functions.firestore
    .document('bookings/{bookingId}')
    .onCreate(async (snap, context) => {
      const booking = snap.data() || {};
      if (booking.status !== 'confirmed') return null;
      if (booking.promotedFromWaitlist === true ||
          booking.createdBy === 'system') {
        return null;
      }
      try {
        const [session, athlete] = await Promise.all([
          docBody('sessions', booking.sessionId),
          docBody('athletes', booking.athleteId),
        ]);
        const copy = notices.bookingConfirmed({athlete, session});
        await notify.sendNotice({
          kind: 'booking-confirmed',
          category: 'schedule',
          householdId: booking.householdId || null,
          athleteId: booking.athleteId || null,
          sessionId: booking.sessionId || null,
          bookingId: context.params.bookingId,
          subjectKey: context.params.bookingId,
          title: copy.title,
          body: copy.body,
        });
      } catch (err) {
        console.error('onBookingCreated error:', err);
      }
      return null;
    });

/**
 * The academy cancelled a whole session: tell everyone who was booked into
 * it, and name the bonus token's expiry when one was minted for them.
 *
 * Only `cancelReason == 'session-cancelled'` sends. A member's own cancel is
 * their own action (not notified in v1, TEAM.md "Open" 3) and a billing
 * revoke is one household notice from portal/revoke.js, not one per booking.
 */
exports.onBookingCancelled = functions.firestore
    .document('bookings/{bookingId}')
    .onUpdate(async (change, context) => {
      const before = change.before.data() || {};
      const after = change.after.data() || {};
      if (before.status !== 'confirmed' || after.status !== 'cancelled') {
        return null;
      }
      if (after.cancelReason !== 'session-cancelled') return null;
      try {
        const [session, athlete, graceExpiresAt] = await Promise.all([
          docBody('sessions', after.sessionId),
          docBody('athletes', after.athleteId),
          graceExpiryFor(after.athleteId, after.sessionId),
        ]);
        const copy = notices.sessionCancelled({
          athlete, session, graceExpiresAt,
        });
        await notify.sendNotice({
          kind: 'session-cancelled',
          category: 'schedule',
          householdId: after.householdId || null,
          athleteId: after.athleteId || null,
          sessionId: after.sessionId || null,
          bookingId: context.params.bookingId,
          subjectKey: context.params.bookingId,
          title: copy.title,
          body: copy.body,
        });
      } catch (err) {
        console.error('onBookingCancelled error:', err);
      }
      return null;
    });

/**
 * `households.membership.status` changed: tell the parents.
 *
 * The ledger id carries `context.eventId` - the trigger's own retry-stable
 * id - so a Firestore redelivery of the same change sends nothing twice,
 * while a genuine second flip (past_due -> lapsed) is its own notice.
 * 'active' only speaks after a freeze or a lapse; nothing else to say.
 */
exports.onHouseholdMembership = functions.firestore
    .document('households/{householdId}')
    .onUpdate(async (change, context) => {
      const before = membershipStatus(change.before.data());
      const after = membershipStatus(change.after.data());
      if (before === after) return null;
      if (after === 'active' &&
          before !== 'past_due' && before !== 'lapsed') {
        return null;
      }
      const copy = notices.membership({status: after});
      if (!copy) return null;
      try {
        const householdId = context.params.householdId;
        await notify.sendNotice({
          kind: 'membership',
          category: 'billing',
          householdId,
          athleteId: null,
          subjectKey: `${householdId}_${context.eventId}`,
          title: copy.title,
          body: copy.body,
        });
      } catch (err) {
        console.error('onHouseholdMembership error:', err);
      }
      return null;
    });

// ==========================================================================
// SCHEDULED NOTIFICATION JOBS (Sprint 14)
// ==========================================================================

/**
 * Daily 17:00 America/Chicago - tomorrow's confirmed bookings. The body is
 * portal/jobs.js's plain function so the emulator harness can run it with a
 * fixed clock; scheduled functions never fire in the emulator.
 */
exports.sessionReminders = functions.pubsub
    .schedule('0 17 * * *')
    .timeZone('America/Chicago')
    .onRun(async () => {
      try {
        await jobs.runSessionReminders({now: new Date(), db});
      } catch (err) {
        console.error('sessionReminders error:', err);
      }
      return null;
    });

/**
 * Daily 09:00 America/Chicago - period tokens and bonus tokens expiring in
 * exactly three days.
 */
exports.tokenExpiryReminders = functions.pubsub
    .schedule('0 9 * * *')
    .timeZone('America/Chicago')
    .onRun(async () => {
      try {
        await jobs.runTokenExpiryReminders({now: new Date(), db});
      } catch (err) {
        console.error('tokenExpiryReminders error:', err);
      }
      return null;
    });
