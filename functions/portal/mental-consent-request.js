/**
 * requestMentalConsent - Yannick's "Send a reminder" on an athlete's
 * Consent card (spec 6.3; plan 2026-10-30 Task 5). Sends one
 * 'consent-needed' to the athlete's audience (portal/mental-consent.js),
 * naming the next confirmed 1:1 when there is one.
 *
 *   in   {athleteId: string}
 *   out  {status: 'sent' | 'duplicate'}
 *
 * Refusals are HttpsErrors with `details.reason`: 'not-mental'
 * (permission-denied), 'no-athlete' (invalid-argument, not-found),
 * 'disabled', 'no-household', 'test-household', 'already-signed', 'no-dob'
 * (failed-precondition), 'send-failed' (unavailable: the ledger row could
 * not be written, so nothing went out and the card must not say "Sent").
 *
 * KEYED `consent:<athleteId>:asked-<Chicago today>`, never
 * `consent:<athleteId>:<date>`: a booking made earlier for a session today
 * writes that key, and reusing it would answer "duplicate" when nothing was
 * sent today. "Already asked today" is any 'consent-needed' ledger row for
 * the athlete (a `subjectKey` range, since a parents-only row carries
 * `athleteId: null`) created on today's Chicago date.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const lib = require('./lib');
const notify = require('./notify');
const {MAIL_SECRETS} = require('./secrets');
const {consentNeeded} = require('./consent-notices');
const {bodyOf, consentAudience, readConsentConfig} =
    require('./mental-consent');
const {consentStatusFor, utcToday} = require('./mental-consent-status');

const {HttpsError} = functions.https;

/** Longest athlete id accepted; real ids are far shorter. */
const MAX_ID_LENGTH = 200;

/**
 * A refusal the card can explain.
 * @param {string} code The HttpsError code.
 * @param {string} reason `details.reason`.
 * @param {string} message What the card may show.
 * @return {!Error} The HttpsError.
 */
function refuse(code, reason, message) {
  return new HttpsError(code, message, {reason});
}

/**
 * Whether a 'consent-needed' notice for this athlete was created today.
 * @param {!Object} store An admin Firestore.
 * @param {string} athleteId The athlete.
 * @param {string} today The Chicago date.
 * @return {!Promise<boolean>} True when one was.
 */
async function askedToday(store, athleteId, today) {
  const snap = await store.collection('notifications')
      .where('subjectKey', '>=', `consent:${athleteId}:`)
      .where('subjectKey', '<', `consent:${athleteId};`)
      .get();
  return snap.docs.some((doc) => {
    const row = doc.data() || {};
    const at = row.createdAt;
    if (row.kind !== 'consent-needed' || !at) return false;
    const ms = typeof at.toMillis === 'function' ? at.toMillis() : at;
    return lib.chicagoDate(new Date(ms)) === today;
  });
}

/**
 * The athlete's next confirmed 1:1 with Yannick, today or later.
 * @param {!Object} store An admin Firestore.
 * @param {string} athleteId The athlete.
 * @param {string} today The Chicago date.
 * @return {!Promise<?{id: string, date: string, attendee: ?string,
 *     sessionId: ?string}>} The earliest, or null.
 */
async function nextMental(store, athleteId, today) {
  const snap = await store.collection('bookings')
      .where('athleteId', '==', athleteId).get();
  let next = null;
  for (const doc of snap.docs) {
    const b = doc.data() || {};
    if (b.type !== 'mental' || b.status !== 'confirmed') continue;
    if (typeof b.date !== 'string' || b.date < today) continue;
    if (!next || b.date < next.date) {
      next = {id: doc.id, date: b.date, attendee: b.attendee || null,
        sessionId: b.sessionId || null};
    }
  }
  return next;
}

/**
 * The callable's body, exported so the unit tests call it in-process.
 * @param {*} data `{athleteId}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps
 *     Injectable Firestore and clock.
 * @return {!Promise<{status: string}>} 'sent' or 'duplicate'.
 */
async function requestMentalConsentHandler(data, context, deps) {
  const d = deps || {};
  const store = d.db || admin.firestore();
  const now = d.now instanceof Date ? d.now : new Date();
  const auth = context && context.auth;
  if (!auth || !auth.uid) {
    throw refuse('unauthenticated', 'signed-out', 'Sign in to continue.');
  }
  const caller = await bodyOf(store, 'users', auth.uid);
  if (!caller || caller.role !== 'mental') {
    throw refuse('permission-denied', 'not-mental',
        'Only Yannick can send a consent reminder.');
  }
  const athleteId = data && data.athleteId;
  if (typeof athleteId !== 'string' || athleteId.length === 0 ||
      athleteId.length > MAX_ID_LENGTH || athleteId.includes('/')) {
    throw refuse('invalid-argument', 'no-athlete', 'Choose an athlete.');
  }
  if (!(await readConsentConfig(store)).notices) {
    throw refuse('failed-precondition', 'disabled',
        'Reminders are off until the academy turns them on.');
  }
  const athlete = await bodyOf(store, 'athletes', athleteId);
  if (!athlete) {
    throw refuse('not-found', 'no-athlete', 'That athlete was not found.');
  }
  const household = await bodyOf(store, 'households', athlete.householdId);
  if (!household) {
    throw refuse('failed-precondition', 'no-household',
        'This athlete has no family on file. Ops can fix it.');
  }
  if (household.test === true || athlete.test === true) {
    throw refuse('failed-precondition', 'test-household',
        'This is a test family; reminders never go to test families.');
  }
  const record = await bodyOf(store, 'mentalConsents', athleteId);
  const status = consentStatusFor(athlete, record, utcToday(now));
  if (status === 'signed') {
    throw refuse('failed-precondition', 'already-signed',
        'The consent is already signed.');
  }
  if (status === 'no-dob') {
    throw refuse('failed-precondition', 'no-dob',
        'The athlete has no date of birth on file yet.');
  }
  const today = lib.todayISO(now);
  if (await askedToday(store, athleteId, today)) return {status: 'duplicate'};
  const next = await nextMental(store, athleteId, today);
  const audience = await consentAudience({store, athleteId, athlete,
    household, householdId: athlete.householdId, now});
  const copy = consentNeeded({athlete, date: next ? next.date : null,
    attendee: (next && next.attendee) || 'athlete', status,
    toAthlete: audience.toAthlete});
  const res = await notify.sendNotice({
    kind: 'consent-needed',
    category: 'schedule',
    householdId: audience.householdId,
    athleteId: audience.athleteId,
    sessionId: next ? next.sessionId : null,
    bookingId: next ? next.id : null,
    subjectKey: `consent:${athleteId}:asked-${today}`,
    title: copy.title,
    body: copy.body,
  });
  if (res && res.duplicate) return {status: 'duplicate'};
  if (!res || !res.sent) {
    throw refuse('unavailable', 'send-failed',
        'The reminder could not be sent. Try again.');
  }
  return {status: 'sent'};
}

const requestMentalConsent = functions.runWith({secrets: MAIL_SECRETS})
    .https.onCall((data, context) =>
      requestMentalConsentHandler(data, context));

module.exports = {requestMentalConsent, requestMentalConsentHandler};
