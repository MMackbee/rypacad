/**
 * Notification helpers shared by the Firestore triggers.
 *
 * `sendCourierNotification` and `getUserProfile` were inline in index.js
 * since 2025; Sprint 13 pin F needs them from `portal/promotion.js` too, so
 * they move here rather than being duplicated or re-exported through a
 * circular require. Behaviour is unchanged: with no COURIER_AUTH_TOKEN the
 * helper logs and skips, so an unconfigured emulator never fails a write
 * that already committed.
 */

'use strict';

const admin = require('firebase-admin');
const {CourierClient} = require('@trycourier/courier');

let courierClient;
let courierResolved = false;

/**
 * The Courier client, or null when the token is not configured. Resolved
 * lazily so requiring this module never depends on load order.
 * @return {?Object} A Courier client or null.
 */
function courier() {
  if (!courierResolved) {
    const token = process.env.COURIER_AUTH_TOKEN;
    // @trycourier/courier v5 exports CourierClient as a FACTORY, not a
    // constructor - `new` would change what comes back. The capitalized name
    // is the SDK's, so the lint rule is wrong about this one call site.
    // eslint-disable-next-line new-cap
    courierClient = token ? CourierClient({authorizationToken: token}) : null;
    courierResolved = true;
  }
  return courierClient;
}

/**
 * Firestore, resolved lazily so this module can be required before
 * `admin.initializeApp()` runs in index.js.
 * @return {!Object} The admin Firestore.
 */
function db() {
  return admin.firestore();
}

/**
 * Send one Courier message. Never throws: a notification failure must not
 * roll back a booking that already committed.
 * @param {{toProfile: (!Object|undefined), toUserId: (?string|undefined),
 *     eventId: (?string|undefined), content: (!Object|undefined),
 *     channels: (!Object|undefined)}} args The message.
 * @return {!Promise<!Object>} Courier's response, or `{skipped}`/`{error}`.
 */
async function sendCourierNotification(args) {
  const {
    toProfile = {},
    toUserId = null,
    eventId = null,
    content = {},
    channels = {},
  } = args || {};
  const client = courier();
  if (!client) {
    console.warn('Courier client not configured. Skipping notification.');
    return {skipped: true};
  }
  try {
    const message = {};
    if (eventId) {
      message.eventId = eventId; // Courier Studio template event id
    } else {
      message.content = content; // Ad-hoc content if no template
    }
    if (toUserId) {
      message.recipient = toUserId;
    } else {
      message.profile = toProfile; // { email, phone_number, ... }
    }
    if (channels && Object.keys(channels).length > 0) {
      message.channels = channels; // e.g., { sms: {}, email: {} }
    }
    return await client.send({message});
  } catch (err) {
    console.error('Courier send error:', err);
    return {error: err.message};
  }
}

/**
 * One `users/{uid}` document body.
 * @param {?string} userId The uid.
 * @return {!Promise<?Object>} The document body, or null.
 */
async function getUserProfile(userId) {
  if (!userId) return null;
  const snap = await db().collection('users').doc(userId).get();
  return snap.exists ? snap.data() : null;
}

/**
 * A Courier profile from a `users` document.
 *
 * NOTE for the DB lane: DATA-MODEL's `users` table documents no phone field
 * at all (`households.guardian.phone` is the only documented number). The
 * 2025 helper read `phoneNumber`; both spellings are accepted here so
 * whichever the lane settles on works, and an absent number simply means
 * Courier sends email only.
 * @param {?Object} user A `users` document body.
 * @return {?{email: ?string, phone_number: ?string}} A Courier profile.
 */
function profileFor(user) {
  if (!user) return null;
  const email = user.email || null;
  const phone = user.phoneNumber || user.phone || null;
  if (!email && !phone) return null;
  return {email, phone_number: phone};
}

/**
 * The accounts told about an athlete's booking: the athlete's own `users`
 * doc (`users.athleteId == athleteId`) and the household's parent accounts
 * (`users.householdId == householdId and role == 'parent'`). Two equality
 * filters need no composite index — Firestore merges the single-field ones.
 * @param {string} athleteId The athlete.
 * @param {?string} householdId The household.
 * @return {!Promise<!Array<{uid: string, profile: !Object}>>} Recipients,
 *     de-duplicated by uid.
 */
async function recipientsForAthlete(athleteId, householdId) {
  const queries = [
    db().collection('users').where('athleteId', '==', athleteId).get(),
  ];
  if (householdId) {
    queries.push(db().collection('users')
        .where('householdId', '==', householdId)
        .where('role', '==', 'parent')
        .get());
  }
  const snaps = await Promise.all(queries);
  const seen = new Map();
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      const profile = profileFor(doc.data());
      if (profile) seen.set(doc.id, {uid: doc.id, profile});
    }
  }
  return Array.from(seen.values());
}

/**
 * Tell an athlete and their household that a waitlist entry was promoted
 * into a confirmed booking (pin F: auto-confirm, no acceptance window, so
 * this is an FYI and not a call to action).
 * @param {{athleteId: string, householdId: ?string, athleteName: ?string,
 *     session: !Object, sessionId: string}} args The promotion.
 * @return {!Promise<{notified: number}>} How many accounts were messaged.
 */
async function notifyWaitlistPromotion(args) {
  const {session, athleteId, householdId} = args;
  const who = args.athleteName ? `${args.athleteName} is` : 'You are';
  const when = [session.date, session.time].filter(Boolean).join(' at ');
  const title = 'A spot opened up — you are in';
  const body = `${who} off the waitlist and booked into the ` +
      `${session.label || session.type || 'training'} block` +
      `${when ? ` on ${when}` : ''}. One token was spent. ` +
      'Cancel from My Schedule if you cannot make it.';
  let notified = 0;
  const recipients = await recipientsForAthlete(athleteId, householdId);
  for (const r of recipients) {
    const resp = await sendCourierNotification({
      eventId: process.env.COURIER_EVENT_WAITLIST_PROMOTED ||
          process.env.COURIER_EVENT_WAITLIST_OPEN || null,
      toProfile: r.profile,
      content: {title, body},
      channels: {sms: {}, email: {}},
    });
    if (!resp || !resp.skipped) notified += 1;
  }
  return {notified};
}

module.exports = {
  getUserProfile,
  notifyWaitlistPromotion,
  profileFor,
  recipientsForAthlete,
  sendCourierNotification,
};
