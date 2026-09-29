/**
 * Secret NAMES bound per function with `.runWith({secrets})` (contract 6.4,
 * spec 8, decision D4: this module is the one source; index.js requires it
 * and exports only functions). 1st-gen functions only see a secret they
 * declare; a declared secret that does not exist in Secret Manager fails
 * the deploy, which is why COURIER_AUTH_TOKEN is not listed. Values never
 * appear in the repo.
 */
'use strict';

/** The SMTP path (`email.js:51-53`). @const {!Array<string>} */
const MAIL_SECRETS = ['SMTP_USER', 'SMTP_PASS'];
/** `revoke.js` sends from inside the webhook. @const {!Array<string>} */
const STRIPE_WEBHOOK_SECRETS = [
  'STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', ...MAIL_SECRETS,
];
/** @const {!Array<string>} */
const CHECKOUT_SECRETS = ['STRIPE_SECRET_KEY'];
/** @const {!Array<string>} */
const CALENDLY_SECRETS = ['CALENDLY_WEBHOOK_SIGNING_KEY'];

module.exports = {
  CALENDLY_SECRETS, CHECKOUT_SECRETS, MAIL_SECRETS, STRIPE_WEBHOOK_SECRETS,
};
