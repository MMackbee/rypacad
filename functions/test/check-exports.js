/* Static check: functions/index.js exports exactly the 13 launch functions
 * and each declares the secrets contract 6.4 binds (spec 8). No emulator:
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
  sweepWaitlist: MAIL,
  onSessionBookedDecrease: MAIL,
};

assert.deepEqual(Object.keys(index).sort(), Object.keys(EXPECTED).sort(),
    'the 13 launch functions, nothing else');
for (const [name, secrets] of Object.entries(EXPECTED)) {
  const ep = index[name].__endpoint || {};
  const got = (ep.secretEnvironmentVariables || []).map((s) => s.key);
  assert.deepEqual(got, secrets, `${name} secrets`);
}
console.log(`ok  ${Object.keys(EXPECTED).length} functions exported, ` +
    'secrets bound per contract 6.4');
