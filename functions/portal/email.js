/**
 * Email: the one sender behind the notification pipeline (contract v2.3,
 * TEAM.md Sprint 15 pins).
 *
 * Two transports, chosen by what is configured, in this order:
 *   1. SMTP (`SMTP_HOST` / `SMTP_USER` / `SMTP_PASS`) through nodemailer -
 *      the simple path: a Google Workspace address and an app password.
 *   2. Courier (`COURIER_AUTH_TOKEN`) - kept for anyone who already has a
 *      Courier account with a provider connected; optional per-kind Studio
 *      templates via `COURIER_EVENT_<KIND>`.
 * With neither configured the sender reports 'skipped' and the ledger row
 * says so; nothing throws at require time or send time.
 */

'use strict';

const nodemailer = require('nodemailer');
const {CourierClient} = require('@trycourier/courier');

let courierClient;
let courierResolved = false;
let smtpTransport;
let smtpResolved = false;

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
 * The SMTP transport, or null when the three SMTP keys are not all set.
 * Port 465 with TLS by default (Gmail / Google Workspace); `SMTP_PORT` and
 * `SMTP_SECURE=false` cover STARTTLS relays on 587.
 * @return {?Object} A nodemailer transport or null.
 */
function smtp() {
  if (!smtpResolved) {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    smtpTransport = host && user && pass ?
        nodemailer.createTransport({
          host,
          port: Number(process.env.SMTP_PORT || 465),
          secure: String(process.env.SMTP_SECURE || 'true') !== 'false',
          auth: {user, pass},
        }) :
        null;
    smtpResolved = true;
  }
  return smtpTransport;
}

/**
 * The From header: `SMTP_FROM` ("RYP Academy <hello@...>") or the SMTP user.
 * @return {string} The sender address.
 */
function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || '';
}

/**
 * The Courier Studio template for a kind, when one is configured.
 * `booking-confirmed` -> `COURIER_EVENT_BOOKING_CONFIRMED`; unset means
 * ad-hoc `{title, body}` content.
 * @param {string} kind The notice kind.
 * @return {?string} An event id or null.
 */
function courierEventId(kind) {
  const key = 'COURIER_EVENT_' +
      String(kind || '').toUpperCase().replace(/-/g, '_');
  return process.env[key] || null;
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
      message.profile = toProfile; // { email, ... }
    }
    if (channels && Object.keys(channels).length > 0) {
      message.channels = channels; // e.g., { email: {} }
    }
    return await client.send({message});
  } catch (err) {
    console.error('Courier send error:', err);
    return {error: err.message};
  }
}

/**
 * Send one plain-text email to one address and report the outcome in the
 * ledger's vocabulary. Never throws.
 * @param {{to: ?string, subject: string, text: string,
 *     kind: (string|undefined)}} args The message.
 * @return {!Promise<{status: string, via: (string|undefined),
 *     error: (string|undefined)}>} 'sent' | 'skipped' | 'failed'.
 */
async function sendEmail(args) {
  const {to, subject, text, kind} = args || {};
  if (!to) return {status: 'skipped', reason: 'no-address'};
  const transport = smtp();
  if (transport) {
    try {
      const info = await transport.sendMail({
        from: fromAddress(), to, subject, text,
      });
      return {status: 'sent', via: 'smtp', id: info && info.messageId};
    } catch (err) {
      console.error('SMTP send error:', err);
      return {status: 'failed', via: 'smtp', error: err.message};
    }
  }
  const resp = await sendCourierNotification({
    eventId: courierEventId(kind),
    toProfile: {email: to},
    content: {title: subject, body: text},
    channels: {email: {}},
  });
  if (!resp || resp.error) {
    return {status: 'failed', via: 'courier', error: resp && resp.error};
  }
  if (resp.skipped) {
    console.warn('No email transport configured (SMTP_* or ' +
        'COURIER_AUTH_TOKEN). Skipping email.');
    return {status: 'skipped', reason: 'unconfigured'};
  }
  return {status: 'sent', via: 'courier'};
}

module.exports = {
  courierEventId,
  sendCourierNotification,
  sendEmail,
};
