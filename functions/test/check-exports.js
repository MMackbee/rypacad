/* Static check: functions/index.js exports exactly the 13 launch functions
 * plus waitlistPositions (waitlist hardening, 2026-10-01) and
 * onSingleTokenSpent (single token, 2026-09-30), submitScholarship
 * (the website's form, 2026-10-01) and submitFeedback (the portal's
 * Feedback button, 2026-10-15) and mentalCheckinReminders (Yannick's
 * Monday reminder, 2026-10-28) and requestMentalConsent and
 * onMentalConsentSigned (mental performance consent, 2026-11-05) and
 * moveBooking (booking changes, 2026-11-11) - 21 in all - and each declares
 * the secrets contract 6.4 binds (spec 8). No emulator:
 * it requires index.js in-process and reads each function's __endpoint.
 *   cd functions && node test/check-exports.js */
'use strict';

process.env.GCLOUD_PROJECT = 'rypacad';
const assert = require('node:assert/strict');
const index = require('../index');

const MAIL = ['SMTP_USER', 'SMTP_PASS'];
const EXPECTED = {
  stripeWebhook: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', ...MAIL],
  createCheckoutSession: ['STRIPE_SECRET_KEY'],
  calendlyWebhook: ['CALENDLY_WEBHOOK_SIGNING_KEY'],
  createFamily: [],
  addAthletes: [],
  claimInvite: [],
  onBookingCreated: MAIL,
  onBookingCancelled: MAIL,
  onHouseholdMembership: MAIL,
  sessionReminders: MAIL,
  tokenExpiryReminders: MAIL,
  mentalCheckinReminders: MAIL,
  sweepWaitlist: MAIL,
  onSessionBookedDecrease: MAIL,
  waitlistPositions: [],
  onSingleTokenSpent: MAIL,
  submitScholarship: MAIL,
  submitFeedback: ['SLACK_FEEDBACK_TOKEN'],
  requestMentalConsent: MAIL,
  onMentalConsentSigned: MAIL,
  moveBooking: [],
};

assert.deepEqual(Object.keys(index).sort(), Object.keys(EXPECTED).sort(),
    'the 13 launch functions, waitlistPositions, onSingleTokenSpent, ' +
    'submitScholarship, submitFeedback, mentalCheckinReminders, ' +
    'requestMentalConsent, onMentalConsentSigned, moveBooking, ' +
    'nothing else');
assert.equal(Object.keys(EXPECTED).length, 21, '21 functions');
for (const [name, secrets] of Object.entries(EXPECTED)) {
  const ep = index[name].__endpoint || {};
  const got = (ep.secretEnvironmentVariables || []).map((s) => s.key);
  assert.deepEqual(got, secrets, `${name} secrets`);
}
console.log(`ok  ${Object.keys(EXPECTED).length} functions exported, ` +
    'secrets bound per contract 6.4');
