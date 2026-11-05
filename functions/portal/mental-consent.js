/**
 * Mental performance consent on the server (spec 6.3; plan 2026-10-30
 * Tasks 4-5): the switch, the audience, the booking trigger's ask, the
 * day-before reminder's ask and the signed receipt. index.js and jobs.js
 * only call in; the copy is portal/consent-notices.js, the status mirror
 * portal/mental-consent-status.js, the gate portal/notify-gates.js.
 *
 * THE SWITCH. `config/mentalConsent {notices: boolean, enabledAt}`, written
 * only by scripts/set-mental-consent-flag.mjs; a missing doc is off. While
 * it is off the booking trigger and the day-before job send no ask (the
 * callable answers 'disabled'). The receipt is not gated: only a family
 * that can reach the consent screens can sign, and they are told it worked.
 *
 * THE AUDIENCE. A minor, or an 18+ athlete with no claimed login: the
 * household's parents only (`householdId` set, `athleteId: null`, so a
 * child's own login is never addressed and the row never shows in its
 * RecentNotices). An 18+ athlete with a claimed login: that login only
 * (`householdId: null`). "Claimed" is the rules' test,
 * `loginInvites/{athlete.loginEmail}.status == 'claimed'`, plus the
 * self-created 18+ member (the household's `createdBy` user is this
 * athlete). A provisioned athlete login with no invite counts as unclaimed.
 *
 * Held Calendly sessions (`sessions/cal-<uuid>`, `unresolved: true`) have no
 * booking and never reach here: every consent decision starts from a booking
 * with an `athleteId`. Every send goes through `notify.sendNotice`, called
 * on the module so the tests can replace it.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const notify = require('./notify');
const {MAIL_SECRETS} = require('./secrets');
const {consentNeeded, consentReminder, consentSigned} =
    require('./consent-notices');
const {shouldNoticeConsentNeeded} = require('./notify-gates');
const {consentStatusFor, isAdultOn, utcToday} =
    require('./mental-consent-status');

/**
 * One document body, or null (no read for a missing or unsafe id).
 * @param {!Object} store An admin Firestore.
 * @param {string} collection The collection.
 * @param {?string} id The document id.
 * @return {!Promise<?Object>} The body, or null.
 */
async function bodyOf(store, collection, id) {
  if (typeof id !== 'string' || id.length === 0 || id.includes('/')) {
    return null;
  }
  const snap = await store.collection(collection).doc(id).get();
  return snap.exists ? snap.data() || {} : null;
}

/**
 * The switch. Anything but `notices === true` is off.
 * @param {!Object} store An admin Firestore.
 * @return {!Promise<{notices: boolean, enabledAt: ?string}>} The switch.
 */
async function readConsentConfig(store) {
  const doc = await bodyOf(store, 'config', 'mentalConsent');
  if (!doc) return {notices: false, enabledAt: null};
  return {
    notices: doc.notices === true,
    enabledAt: typeof doc.enabledAt === 'string' ? doc.enabledAt : null,
  };
}

/**
 * Who hears about an athlete's consent (the header's audience rule).
 * @param {{store: !Object, athleteId: string, athlete: ?Object,
 *     household: ?Object, householdId: ?string, now: !Date}} args The
 *     athlete, its household doc and id, and the clock (18 is counted on
 *     the UTC date).
 * @return {!Promise<{householdId: ?string, athleteId: ?string,
 *     toAthlete: boolean}>} The `sendNotice` addressing.
 */
async function consentAudience(args) {
  const {store, athleteId, athlete, household, householdId, now} = args;
  const parents = {householdId: householdId || null, athleteId: null,
    toAthlete: false};
  if (!athlete || !isAdultOn(athlete.dob, utcToday(now))) return parents;
  const alone = {householdId: null, athleteId, toAthlete: true};
  const invite = await bodyOf(store, 'loginInvites', athlete.loginEmail);
  if (invite && invite.status === 'claimed') return alone;
  const creator = household && household.createdBy;
  if (creator) {
    const user = await bodyOf(store, 'users', creator);
    if (user && user.athleteId === athleteId) return alone;
  }
  return parents;
}

/**
 * The ask's facts for one booking: the gate, then status and audience.
 * @param {{booking: !Object, athlete: ?Object, household: ?Object,
 *     record: ?Object, config: ?Object, store: !Object, now: !Date}} args
 *     The booking and its documents.
 * @return {!Promise<?{status: string, audience: !Object}>} Null when no
 *     ask is owed.
 */
async function askFor(args) {
  const {booking, athlete, household, record, config, store, now} = args;
  if (!shouldNoticeConsentNeeded({booking, athlete, household, record,
    config, now})) {
    return null;
  }
  const audience = await consentAudience({store, athleteId: booking.athleteId,
    athlete, household,
    householdId: booking.householdId || athlete.householdId || null, now});
  return {status: consentStatusFor(athlete, record, utcToday(now)), audience};
}

/**
 * Send one consent notice and map the answer.
 * @param {!Object} args The `sendNotice` arguments.
 * @return {!Promise<string>} 'duplicate' or 'sent'.
 */
async function send(args) {
  const res = await notify.sendNotice(args);
  return res && res.duplicate ? 'duplicate' : 'sent';
}

/**
 * The booking trigger's consent branch: a confirmed 1:1 with Yannick was
 * booked (by Calendly, the app or a script) for an athlete who has not
 * signed. index.js calls it first in onBookingCreated, in its own
 * try/catch, before the booking-confirmed gate that skips every Calendly
 * booking. Keyed `consent:<athleteId>:<date>`: two 1:1s on one day ask once.
 * @param {{booking: ?Object, bookingId: string, store: !Object,
 *     now: !Date}} args The new booking.
 * @return {!Promise<string>} 'sent' | 'duplicate' | 'skipped'.
 */
async function onMentalBookingCreated(args) {
  const {booking, bookingId, store, now} = args;
  if (!booking || booking.type !== 'mental') return 'skipped';
  const [config, athlete, record] = await Promise.all([
    readConsentConfig(store),
    bodyOf(store, 'athletes', booking.athleteId),
    bodyOf(store, 'mentalConsents', booking.athleteId),
  ]);
  const household = await bodyOf(store, 'households',
      booking.householdId || (athlete && athlete.householdId));
  const ask = await askFor({booking, athlete, household, record, config,
    store, now});
  if (!ask) return 'skipped';
  const copy = consentNeeded({athlete, date: booking.date,
    attendee: booking.attendee || 'athlete', status: ask.status,
    toAthlete: ask.audience.toAthlete});
  return send({
    kind: 'consent-needed',
    category: 'schedule',
    householdId: ask.audience.householdId,
    athleteId: ask.audience.athleteId,
    sessionId: booking.sessionId || null,
    bookingId,
    subjectKey: `consent:${booking.athleteId}:${booking.date}`,
    title: copy.title,
    body: copy.body,
  });
}

/**
 * The 17:00 job's consent branch, for one 1:1 with Yannick dated tomorrow.
 * jobs.runSessionReminders calls it before its Calendly skip, in its own
 * try/catch, with its memoized readers.
 * @param {{booking: !Object, bookingId: string, store: !Object,
 *     config: ?Object, now: !Date, readers: {athletes: !Function,
 *     households: !Function, records: !Function}}} args The booking, the
 *     switch as the job read it, the clock and `(id) => Promise<?Object>`
 *     readers for athletes, households and consent records.
 * @return {!Promise<string>} 'sent' | 'duplicate' | 'skipped'.
 */
async function remindConsentFor(args) {
  const {booking, bookingId, store, config, now, readers} = args;
  if (!config || config.notices !== true) return 'skipped';
  if (!booking || booking.type !== 'mental' || !booking.athleteId) {
    return 'skipped';
  }
  const athlete = await readers.athletes(booking.athleteId);
  const household = await readers.households(
      booking.householdId || (athlete && athlete.householdId));
  const record = await readers.records(booking.athleteId);
  const ask = await askFor({booking, athlete, household, record, config,
    store, now});
  if (!ask) return 'skipped';
  const copy = consentReminder({athlete, date: booking.date,
    attendee: booking.attendee || 'athlete', status: ask.status,
    toAthlete: ask.audience.toAthlete});
  return send({
    kind: 'consent-reminder',
    category: 'schedule',
    householdId: ask.audience.householdId,
    athleteId: ask.audience.athleteId,
    sessionId: booking.sessionId || null,
    bookingId,
    subjectKey: `consent-reminder:${booking.athleteId}:${booking.date}`,
    title: copy.title,
    body: copy.body,
  });
}

/**
 * The receipt: a family signed in the portal (`method: 'portal'`). A paper
 * record sends nothing; the switch is not consulted. Keyed on the athlete,
 * so a record is receipted once.
 * @param {!Object} snap The created `mentalConsents/{athleteId}` snapshot.
 * @param {{params: {athleteId: string}}} context The trigger context.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps
 *     Injectable Firestore and clock.
 * @return {!Promise<string>} 'sent' | 'duplicate' | 'skipped'.
 */
async function onConsentSignedHandler(snap, context, deps) {
  const d = deps || {};
  const store = d.db || admin.firestore();
  const now = d.now instanceof Date ? d.now : new Date();
  const record = (snap && snap.data && snap.data()) || {};
  if (record.method !== 'portal') return 'skipped';
  const athleteId = (context && context.params && context.params.athleteId) ||
      (snap && snap.id);
  const athlete = await bodyOf(store, 'athletes', athleteId);
  const householdId = record.householdId ||
      (athlete && athlete.householdId) || null;
  if (!householdId) return 'skipped';
  const household = await bodyOf(store, 'households', householdId);
  const audience = await consentAudience({store, athleteId, athlete,
    household, householdId, now});
  const copy = consentSigned({athlete, adultRecord: record.adult === true,
    toAthlete: audience.toAthlete});
  return send({
    kind: 'consent-signed',
    category: 'schedule',
    householdId: audience.householdId,
    athleteId: audience.athleteId,
    subjectKey: athleteId,
    title: copy.title,
    body: copy.body,
  });
}

/**
 * `mentalConsents/{athleteId}` onCreate: the signed receipt. Never throws -
 * the family's signature is already saved.
 */
const onMentalConsentSigned = functions
    .runWith({secrets: MAIL_SECRETS})
    .firestore
    .document('mentalConsents/{athleteId}')
    .onCreate(async (snap, context) => {
      try {
        await onConsentSignedHandler(snap, context);
      } catch (err) {
        console.error('onMentalConsentSigned error:', err);
      }
      return null;
    });

module.exports = {
  bodyOf,
  consentAudience,
  onConsentSignedHandler,
  onMentalBookingCreated,
  onMentalConsentSigned,
  readConsentConfig,
  remindConsentFor,
};
