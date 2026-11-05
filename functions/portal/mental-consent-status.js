/**
 * Mental performance consent status (spec 6.1, 7), pure and with no
 * requires, so the gates, the trigger bodies and the callable share one
 * answer.
 *
 * CHANGE ONE, CHANGE BOTH. This is a deliberate duplicate of
 * `consentStatusFor` and its date helpers in
 * `frontend/src/portal/data/mentalConsent.js` (ESM and CRA-only, so Cloud
 * Functions cannot import it). Both run the one case table
 * `functions/test/fixtures/consent-status-cases.json`; an edit to the order
 * below lands in both files, and the table, in the same commit.
 *
 * Age 18 is counted on the UTC date (`utcToday`), to match `adultOn` in
 * `firestore.rules`, which compares against `request.time`: from 18:00 or
 * 19:00 in Chicago the UTC date is already tomorrow, and the rules are the
 * authority on who may sign. Booking dates ("today", "tomorrow") stay
 * America/Chicago dates (`lib.todayISO`); the callers pass one `now` to
 * both.
 */

'use strict';

/** @const {number} */
const ADULT_AGE = 18;
/** The `firestore.rules` dob test (`mcDobOk`). @const {!RegExp} */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The UTC calendar date of an instant.
 * @param {?Date=} now The instant; defaults to the current time.
 * @return {string} `'YYYY-MM-DD'`.
 */
function utcToday(now) {
  return (now instanceof Date ? now : new Date()).toISOString().slice(0, 10);
}

/**
 * Whole years between a dob and a date, on the string arithmetic of
 * `lib.ageAt` (no `Date` in the comparison, so a Feb 29 birthday turns a
 * year older on Mar 1 of a common year).
 * @param {?string} dobISO `'YYYY-MM-DD'`.
 * @param {string} onISO `'YYYY-MM-DD'`.
 * @return {?number} The age, or null when either date is not `YYYY-MM-DD`.
 */
function ageOn(dobISO, onISO) {
  if (typeof dobISO !== 'string' || !ISO_DATE.test(dobISO)) return null;
  if (typeof onISO !== 'string' || !ISO_DATE.test(onISO)) return null;
  const [y, m, d] = dobISO.split('-').map(Number);
  const [ty, tm, td] = onISO.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

/**
 * Whether a dob makes an athlete 18 or older on a date.
 * @param {?string} dobISO `'YYYY-MM-DD'`.
 * @param {string} utcTodayISO The UTC date (`utcToday`).
 * @return {boolean} False too when the dob is missing or malformed.
 */
function isAdultOn(dobISO, utcTodayISO) {
  const age = ageOn(dobISO, utcTodayISO);
  return age !== null && age >= ADULT_AGE;
}

/**
 * Whether a record carries an adult's own signature: signed under section
 * 11 (`adult: true`) or re-signed at 18 (`adultSignature`).
 * @param {?Object} record A `mentalConsents/{athleteId}` body.
 * @return {boolean} True for an adult record.
 */
function isAdultRecord(record) {
  if (!record) return false;
  return record.adult === true || record.adultSignature != null;
}

/**
 * One athlete's consent status, in the Global Constraints' order: no valid
 * dob, no record, an adult record, signed as a minor and 18 now, signed. A
 * paper record and a record of an older version both count.
 * @param {?Object} athlete An `athletes/{id}` body.
 * @param {?Object} record The `mentalConsents/{athleteId}` body, or null.
 * @param {string} utcTodayISO The UTC date (`utcToday(now)`).
 * @return {string} `'no-dob' | 'unsigned' | 'signed' | 'needs-adult'`.
 */
function consentStatusFor(athlete, record, utcTodayISO) {
  const dob = athlete ? athlete.dob : null;
  if (ageOn(dob, utcTodayISO) === null) return 'no-dob';
  if (!record) return 'unsigned';
  if (isAdultRecord(record)) return 'signed';
  if (isAdultOn(dob, utcTodayISO)) return 'needs-adult';
  return 'signed';
}

module.exports = {
  ADULT_AGE,
  ageOn,
  consentStatusFor,
  isAdultOn,
  isAdultRecord,
  utcToday,
};
