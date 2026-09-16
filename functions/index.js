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
 * `onSessionUpdateNotifyWaitlist` and `notifyWaitlistForSession` are DELETED
 * here: they read `sessions.participants` / `sessions.waitlist` arrays that
 * no v1+ session has ever carried, so the trigger could never fire.
 * portal/promotion.js replaces them against the real `waitlist` collection.
 * The Courier helpers they used moved to portal/notify.js, which both this
 * file and the promotion trigger import.
 *
 * THE FUNCTIONS ENTRY POINT IS firebase-functions/v1 ON PURPOSE. In
 * firebase-functions v6 the package's main export is the v2 namespace, where
 * `functions.firestore.document` and `functions.pubsub.schedule` do not
 * exist - requiring this file through the bare 'firebase-functions' specifier
 * threw `functions.firestore.document is not a function` at load, so NOTHING
 * here was deployable. Importing v1 explicitly keeps every kept 2025 trigger
 * behaving exactly as written. Migrating these to v2 is a separate, deliberate
 * change.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const twilioLib = require('twilio');

// Initialize Firebase Admin before anything reads Firestore.
admin.initializeApp();

const db = admin.firestore();

const notify = require('./portal/notify');
const {stripeWebhook} = require('./portal/stripe');
const {onSessionBookedDecrease} = require('./portal/promotion');

const {getUserProfile, sendCourierNotification} = notify;

const twilio = twilioLib(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
);

// ==========================================================================
// PORTAL SERVER-SIDE WRITERS (Sprint 13, contract v2.1)
// ==========================================================================

exports.stripeWebhook = stripeWebhook;
exports.onSessionBookedDecrease = onSessionBookedDecrease;

// ==========================================================================
// PARENT-BOOKED CHILD NOTIFICATION (Courier)
// ==========================================================================

exports.onBookingCreateNotifyChild = functions.firestore
    .document('bookings/{bookingId}')
    .onCreate(async (snap, context) => {
      try {
        const booking = snap.data() || {};
        const parentId = booking.parentId;
        const userId = booking.userId; // who the booking is for
        const childId = booking.childId ||
            (parentId && parentId !== userId ? userId : null);

        // Only notify when a parent books for a child (parentId present and
        // distinct). A promotion writes createdBy: 'system' and neither id,
        // so portal/promotion.js sends its own notification instead.
        if (!parentId || !childId || parentId === childId) return;

        const [childProfile, parentProfile] = await Promise.all([
          getUserProfile(childId),
          getUserProfile(parentId),
        ]);

        if (!childProfile) return;

        const sessionData = booking.sessionData || {};
        const sessionType = booking.sessionType || booking.packageType ||
            'Training Session';
        const dateStr = booking.date || sessionData.date || '';
        const timeStr = booking.time || sessionData.time || '';
        const location = booking.location || sessionData.location || '';
        const parentName = (parentProfile &&
            (parentProfile.displayName || parentProfile.email)) ||
            'Your parent';

        const when = [dateStr, timeStr].filter(Boolean).join(' at ');
        const title = 'You have a new session booked';
        const body = `${parentName} booked a ${sessionType}` +
            `${when ? ' on ' + when : ''}` +
            `${location ? ' • ' + location : ''}.`;

        await sendCourierNotification({
          eventId: process.env.COURIER_EVENT_CHILD_BOOKED || null,
          toProfile: {
            email: childProfile.email,
            phone_number: childProfile.phoneNumber,
          },
          content: {title, body},
          channels: {sms: {}, email: {}},
        });
      } catch (err) {
        console.error('onBookingCreateNotifyChild error:', err);
      }
    });

// ==========================================================================
// SMS (Twilio) - internal helper + log
// ==========================================================================

/**
 * Send one SMS through Twilio and log it; the internal API the reply handler
 * uses.
 * @param {{to: string, message: string, type: (string|undefined)}} args The
 *     message.
 * @return {!Promise<string>} The Twilio message sid.
 */
async function sendSms(args) {
  const {to, message, type = 'notification'} = args;
  const sms = await twilio.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: to,
  });
  await logSMS(to, message, type, sms.sid);
  return sms.sid;
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
  await db.collection('smsLogs').add({
    to,
    message,
    type,
    messageId,
    timestamp: FieldValue.serverTimestamp(),
  });
}

// Reply-handler stubs - a YES/NO reply confirms or cancels nothing yet. The
// real transition needs a phone -> athlete mapping the data model does not
// have (DECISION-GAPS.md, "Functions (Part 2 blockers)"); Sprint 13 did not
// resolve it, so these stay stubs and only log.
/**
 * @param {string} phoneNumber The sender.
 * @param {string} messageId The Twilio sid.
 * @return {!Promise<void>} Resolves immediately.
 */
async function confirmSession(phoneNumber, messageId) {
  console.log(`SMS YES from ${phoneNumber} (${messageId}) - no booking ` +
      'transition is wired; needs a phone -> athlete mapping.');
}

/**
 * @param {string} phoneNumber The sender.
 * @param {string} messageId The Twilio sid.
 * @return {!Promise<void>} Resolves immediately.
 */
async function cancelSession(phoneNumber, messageId) {
  console.log(`SMS NO from ${phoneNumber} (${messageId}) - no booking ` +
      'transition is wired; needs a phone -> athlete mapping.');
}

/**
 * Twilio inbound-SMS webhook. Only Twilio may call it: the request must carry
 * a valid X-Twilio-Signature for this exact URL and body (the auth token is
 * the shared secret), otherwise 403. Twilio posts server-to-server, so there
 * is no CORS wrapper.
 */
exports.handleSMSResponse = functions.https.onRequest(async (req, res) => {
  const signature = req.header('X-Twilio-Signature') || '';
  const url = `https://${req.get('host')}${req.originalUrl}`;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken ||
      !twilioLib.validateRequest(authToken, signature, url, req.body || {})) {
    res.status(403).send('Invalid Twilio signature');
    return;
  }
  try {
    const {From, Body, MessageSid} = req.body;
    const response = String(Body || '').trim().toUpperCase();

    if (response === 'YES') {
      await confirmSession(From, MessageSid);
      await sendSms({
        to: From,
        message: '✅ Session confirmed! See you tomorrow.',
        type: 'confirmation_response',
      });
    } else if (response === 'NO') {
      await cancelSession(From, MessageSid);
      await sendSms({
        to: From,
        message: '❌ Session cancelled. Contact us to reschedule.',
        type: 'cancellation_response',
      });
    } else {
      await sendSms({
        to: From,
        message: 'Please reply YES to confirm or NO to cancel.',
        type: 'invalid_response',
      });
    }

    res.json({success: true});
  } catch (error) {
    console.error('Error handling SMS response:', error);
    res.status(500).json({error: error.message});
  }
});

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

// Clean up old SMS logs (keep last 30 days)
exports.cleanupSMSLogs = functions.pubsub.schedule('every day 02:00')
    .onRun(async (context) => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oldLogsSnapshot = await db.collection('smsLogs')
            .where('timestamp', '<', thirtyDaysAgo)
            .get();

        const batch = db.batch();
        oldLogsSnapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`Cleaned up ${oldLogsSnapshot.docs.length} old SMS logs`);
      } catch (error) {
        console.error('Error cleaning up SMS logs:', error);
      }
    });
