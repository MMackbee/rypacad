/**
 * Cloud Functions for the RYP Academy portal.
 *
 * Sprint 12 (TEAM.md "Sprint 12 pins", section I): the 2025 unauthenticated
 * onRequest endpoints - createPaymentIntent, handlePaymentSuccess,
 * processRefund, notifyWaitlist, sendSMS, sendBookingConfirmation,
 * sendSessionReminder, testCourier, addTokens, useTokens, getUserTokens,
 * linkParentToChild, fundChildAccount - and the 2025-model helpers they
 * wrapped (userTokens / families / the old package maps) are deleted. None
 * of them could ship under a token model: open CORS, no auth, and addTokens
 * wrote balances for any caller. sendDailyReminders went with them - it
 * read a `participants` array no v1+ session carries and called an HTTP
 * handler as if it were a function.
 *
 * What stays is the internal API the Part 2 trigger and Stripe handler will
 * call: the Courier helper, the Twilio SMS helper + log, the two Firestore
 * triggers (onSessionUpdateNotifyWaitlist is rewritten in Part 2 - it still
 * reads the 2025 participants/waitlist arrays and so never fires today), and
 * handleSMSResponse behind Twilio signature verification.
 *
 * Stripe is re-required in Part 2 for the webhook; the dependency stays in
 * package.json.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const twilioLib = require('twilio');
const twilio = twilioLib(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const { CourierClient } = require('@trycourier/courier');

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

// Initialize Courier
const courierAuthToken = process.env.COURIER_AUTH_TOKEN;
const courier = courierAuthToken ? CourierClient({ authorizationToken: courierAuthToken }) : null;

async function sendCourierNotification({ toProfile = {}, toUserId = null, eventId = null, content = {}, channels = {} }) {
  if (!courier) {
    console.warn('Courier client not configured. Skipping notification.');
    return { skipped: true };
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
      message.profile = toProfile; // { email, phone_number, fcm: { token }, etc }
    }
    if (channels && Object.keys(channels).length > 0) {
      message.channels = channels; // e.g., { sms: {}, email: {} }
    }
    const resp = await courier.send({ message });
    return resp;
  } catch (err) {
    console.error('Courier send error:', err);
    return { error: err.message };
  }
}

// ==========================================================================
// WAITLIST NOTIFICATIONS (Courier)
// ==========================================================================

async function getUserProfile(userId) {
  if (!userId) return null;
  const snap = await db.collection('users').doc(userId).get();
  return snap.exists ? snap.data() : null;
}

async function notifyWaitlistForSession(sessionId, maxToNotify = 1) {
  const sessionRef = db.collection('sessions').doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) return { skipped: 'session_not_found' };
  const session = sessionSnap.data() || {};

  const capacity = Number(session.capacity || 0);
  const participants = Array.isArray(session.participants) ? session.participants : [];
  const waitlist = Array.isArray(session.waitlist) ? session.waitlist : [];

  const available = Math.max(capacity - participants.length, 0);
  if (available <= 0 || waitlist.length === 0) {
    return { skipped: true, available, waitlist: waitlist.length };
  }

  const toNotifyCount = Math.min(available, maxToNotify, waitlist.length);
  const notifyUserIds = waitlist.slice(0, toNotifyCount);

  const results = [];
  for (const uid of notifyUserIds) {
    const user = await getUserProfile(uid);
    if (!user) {
      results.push({ uid, error: 'user_not_found' });
      continue;
    }
    const title = 'A spot just opened up!';
    const body = `Session: ${session.type || 'Training'} on ${session.date || ''} at ${session.time || ''}.`;
    const resp = await sendCourierNotification({
      eventId: process.env.COURIER_EVENT_WAITLIST_OPEN || null,
      toProfile: {
        email: user.email,
        phone_number: user.phoneNumber,
      },
      content: { title, body },
    });
    results.push({ uid, resp });
  }

  return { notified: results.length, results };
}

// Firestore trigger: when a session is updated, if capacity opens up, notify waitlist
exports.onSessionUpdateNotifyWaitlist = functions.firestore
  .document('sessions/{sessionId}')
  .onUpdate(async (change, context) => {
    try {
      const before = change.before.data() || {};
      const after = change.after.data() || {};

      const capacity = Number(after.capacity || 0);
      const beforeParticipants = Array.isArray(before.participants) ? before.participants.length : 0;
      const afterParticipants = Array.isArray(after.participants) ? after.participants.length : 0;
      const waitlistLength = Array.isArray(after.waitlist) ? after.waitlist.length : 0;

      // Only act when available slots increased and there is a waitlist
      const beforeAvailable = Math.max(capacity - beforeParticipants, 0);
      const afterAvailable = Math.max(capacity - afterParticipants, 0);
      if (afterAvailable > beforeAvailable && waitlistLength > 0 && capacity > 0) {
        const delta = afterAvailable - beforeAvailable;
        await notifyWaitlistForSession(context.params.sessionId, delta);
      }
    } catch (err) {
      console.error('onSessionUpdateNotifyWaitlist error:', err);
    }
  });

// ==========================================================================
// PARENT-BOOKED CHILD NOTIFICATION (Courier)
// ==========================================================================

exports.onBookingCreateNotifyChild = functions.firestore
  .document('bookings/{bookingId}')
  .onCreate(async (snap, context) => {
    try {
      const booking = snap.data() || {};
      const parentId = booking.parentId;
      const userId = booking.userId; // who the booking is for (child or self)
      const childId = booking.childId || (parentId && parentId !== userId ? userId : null);

      // Only notify when a parent books for a child (parentId present and distinct)
      if (!parentId || !childId || parentId === childId) return;

      const [childProfile, parentProfile] = await Promise.all([
        getUserProfile(childId),
        getUserProfile(parentId)
      ]);

      if (!childProfile) return;

      const sessionType = booking.sessionType || booking.packageType || 'Training Session';
      const dateStr = booking.date || (booking.sessionData && booking.sessionData.date) || '';
      const timeStr = booking.time || (booking.sessionData && booking.sessionData.time) || '';
      const location = booking.location || (booking.sessionData && booking.sessionData.location) || '';
      const parentName = (parentProfile && (parentProfile.displayName || parentProfile.email)) || 'Your parent';

      const title = 'You have a new session booked';
      const body = `${parentName} booked a ${sessionType}${dateStr || timeStr ? ' on ' : ''}${[dateStr, timeStr].filter(Boolean).join(' at ')}${location ? ' • ' + location : ''}.`;

      await sendCourierNotification({
        eventId: process.env.COURIER_EVENT_CHILD_BOOKED || null,
        toProfile: {
          email: childProfile.email,
          phone_number: childProfile.phoneNumber,
        },
        content: { title, body },
        channels: { sms: {}, email: {} }
      });
    } catch (err) {
      console.error('onBookingCreateNotifyChild error:', err);
    }
  });

// ==========================================================================
// SMS (Twilio) - internal helper + log
// ==========================================================================

/** Send one SMS through Twilio and log it; the internal API the reply handler uses. */
async function sendSms({ to, message, type = 'notification' }) {
  const sms = await twilio.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: to
  });
  await logSMS(to, message, type, sms.sid);
  return sms.sid;
}

async function logSMS(to, message, type, messageId) {
  await db.collection('smsLogs').add({
    to,
    message,
    type,
    messageId,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

// Reply-handler stubs - a YES/NO reply confirms or cancels nothing yet. The
// real transition belongs to the Part 2 session/booking writers; until then
// this webhook only answers the sender.
async function confirmSession(phoneNumber, messageId) {
  // Update session status to confirmed
  // Implementation depends on your session management
}

async function cancelSession(phoneNumber, messageId) {
  // Update session status to cancelled
  // Implementation depends on your session management
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
  if (!authToken || !twilioLib.validateRequest(authToken, signature, url, req.body || {})) {
    res.status(403).send('Invalid Twilio signature');
    return;
  }
  try {
    const { From, Body, MessageSid } = req.body;
    const response = String(Body || '').trim().toUpperCase();

    if (response === 'YES') {
      await confirmSession(From, MessageSid);
      await sendSms({ to: From, message: '✅ Session confirmed! See you tomorrow.', type: 'confirmation_response' });
    } else if (response === 'NO') {
      await cancelSession(From, MessageSid);
      await sendSms({ to: From, message: '❌ Session cancelled. Contact us to reschedule.', type: 'cancellation_response' });
    } else {
      await sendSms({ to: From, message: 'Please reply YES to confirm or NO to cancel.', type: 'invalid_response' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error handling SMS response:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

// Clean up old SMS logs (keep last 30 days)
exports.cleanupSMSLogs = functions.pubsub.schedule('every day 02:00').onRun(async (context) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldLogsSnapshot = await db.collection('smsLogs')
      .where('timestamp', '<', thirtyDaysAgo)
      .get();

    const batch = db.batch();
    oldLogsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Cleaned up ${oldLogsSnapshot.docs.length} old SMS logs`);
  } catch (error) {
    console.error('Error cleaning up SMS logs:', error);
  }
});
