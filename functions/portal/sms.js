/**
 * Twilio SMS: the one sender, its log, and the quiet-hours window
 * (contract v2.2, TEAM.md Sprint 14 pins).
 *
 * `sendSms` and `logSMS` moved here from index.js so the notification
 * pipeline and `handleSMSResponse` share one sender instead of duplicating
 * a client. THE CLIENT IS RESOLVED LAZILY, like `courier()` in notify.js:
 * index.js used to build it at require time from two env vars, so an
 * unconfigured deployment (or emulator) risked throwing before a single
 * function loaded - and a require-time throw means NOTHING in the codebase
 * loads. With no credentials this module now reports `'skipped'` and sends
 * nothing.
 *
 * Quiet hours (pin): an SMS never goes out before 08:00 or after 21:00
 * America/Chicago. A notice that lands outside the window records
 * `'skipped'` and is NEVER re-sent later - the ledger is written either way,
 * and a silent text at 3am is worse than no text at all.
 */

'use strict';

const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const twilioLib = require('twilio');

/** The Academy's wall clock. @const {string} */
const TZ = 'America/Chicago';
/** First hour an SMS may be sent, inclusive. @const {number} */
const SMS_WINDOW_START = 8;
/** First hour an SMS may NOT be sent, exclusive end. @const {number} */
const SMS_WINDOW_END = 21;

let twilioClient;
let twilioResolved = false;

const hourFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: '2-digit',
  hourCycle: 'h23',
});

/**
 * The Twilio client, or null when the credentials are not configured.
 * @return {?Object} A Twilio client or null.
 */
function twilio() {
  if (!twilioResolved) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    twilioClient = sid && token ? twilioLib(sid, token) : null;
    twilioResolved = true;
  }
  return twilioClient;
}

/** @return {!Object} The admin Firestore, resolved lazily. */
function db() {
  return admin.firestore();
}

/**
 * The hour of day (0..23) an instant falls on in America/Chicago.
 * @param {Date=} now Injectable for tests; absent == this instant.
 * @return {number} 0..23.
 */
function chicagoHour(now) {
  const when = now instanceof Date ? now : new Date();
  const part = hourFormat.formatToParts(when)
      .find((p) => p.type === 'hour');
  const hour = Number(part ? part.value : NaN);
  // h23 should never produce 24, but an older ICU build can; fold it to
  // midnight rather than letting a NaN-ish hour open the window.
  return hour === 24 ? 0 : hour;
}

/**
 * Whether an SMS may be sent right now (08:00 <= hour < 21:00 Chicago).
 * @param {Date=} now Injectable for tests.
 * @return {boolean} True inside the window.
 */
function withinSmsWindow(now) {
  const hour = chicagoHour(now);
  return Number.isFinite(hour) &&
      hour >= SMS_WINDOW_START && hour < SMS_WINDOW_END;
}

/**
 * Append one row to `smsLogs`; `cleanupSMSLogs` prunes it nightly.
 * @param {string} to The destination number.
 * @param {string} message The body.
 * @param {string} type A category for the log.
 * @param {string} messageId The Twilio sid.
 * @return {!Promise<void>} Resolves when written.
 */
async function logSMS(to, message, type, messageId) {
  await db().collection('smsLogs').add({
    to,
    message,
    type,
    messageId,
    timestamp: FieldValue.serverTimestamp(),
  });
}

/**
 * Send one SMS through Twilio and log it. NEVER THROWS: every caller is
 * either a trigger whose write already committed or an HTTPS handler that
 * must still answer, so a provider failure is an outcome, not an exception.
 * @param {{to: string, message: string, type: (string|undefined)}} args The
 *     message.
 * @return {!Promise<{status: string, sid: ?string, error: ?string}>} `status`
 *     is `'sent' | 'skipped' | 'failed'`; `'skipped'` means no credentials.
 */
async function sendSms(args) {
  const {to, message, type = 'notification'} = args || {};
  const client = twilio();
  if (!client) {
    console.warn('Twilio client not configured. Skipping SMS.');
    return {status: 'skipped', sid: null, error: null};
  }
  if (!to) return {status: 'skipped', sid: null, error: 'no-destination'};
  try {
    const sms = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    await logSMS(to, message, type, sms.sid);
    return {status: 'sent', sid: sms.sid, error: null};
  } catch (err) {
    console.error('Twilio send error:', err);
    return {status: 'failed', sid: null, error: err.message};
  }
}

module.exports = {
  SMS_WINDOW_END,
  SMS_WINDOW_START,
  chicagoHour,
  logSMS,
  sendSms,
  withinSmsWindow,
};
