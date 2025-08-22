/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const twilio = require('twilio')(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const { CourierClient } = require('@trycourier/courier');
const cors = require('cors')({ origin: true });

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

// ============================================================================
// STRIPE PAYMENT FUNCTIONS
// ============================================================================

// Create payment intent for package or add-on purchase
exports.createPaymentIntent = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { amount, currency = 'usd', packageId, packageType, addOns = [], customerId } = req.body;

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency,
        metadata: {
          packageId: packageId || '',
          packageType: packageType || '',
          addOns: JSON.stringify(addOns),
          customerId: customerId || ''
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Handle successful payment
exports.handlePaymentSuccess = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { paymentIntentId, userId, packageId, addOns } = req.body;

      // Verify payment with Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Payment not successful');
      }

      // Add tokens to user account
      if (packageId) {
        const packageTokens = getPackageTokens(packageId);
        for (const [tokenType, quantity] of Object.entries(packageTokens)) {
          await addTokensToUser(userId, tokenType, quantity, 'package_purchase');
        }
      }

      // Add add-on tokens
      for (const addOn of addOns || []) {
        const addOnTokens = getAddOnTokens(addOn.id);
        for (const [tokenType, quantity] of Object.entries(addOnTokens)) {
          await addTokensToUser(userId, tokenType, quantity, 'addon_purchase');
        }
      }

      // Create booking record
      await createBookingRecord(userId, packageId, addOns, paymentIntentId);

      // Send confirmation via Courier (email/SMS based on profile)
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        const user = userDoc.exists ? userDoc.data() : {};
        await sendCourierNotification({
          eventId: process.env.COURIER_EVENT_PAYMENT_SUCCESS || null,
          toProfile: {
            email: user.email,
            phone_number: user.phoneNumber,
          },
          content: {
            title: 'Payment Confirmed',
            body: `Your purchase was successful${packageId ? ` for ${getPackageData(packageId).title}` : ''}.`
          }
        });
      } catch (e) {
        console.warn('Courier payment notification skipped:', e.message);
      }

      res.json({ success: true, message: 'Payment processed successfully' });
    } catch (error) {
      console.error('Error handling payment success:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Simple test endpoint to verify Courier configuration (no UI impact)
exports.testCourier = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { email, phone, message = 'Hello from RYP via Courier' } = req.body || {};
      const result = await sendCourierNotification({
        toProfile: { email, phone_number: phone },
        content: { title: 'Test Notification', body: message },
      });
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// Process refund
exports.processRefund = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { paymentIntentId, amount, reason } = req.body;

      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(amount * 100), // Convert to cents
        reason: reason || 'requested_by_customer'
      });

      res.json({ success: true, refund: refund });
    } catch (error) {
      console.error('Error processing refund:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================================
// TWILIO SMS FUNCTIONS
// ============================================================================

// Send SMS notification
exports.sendSMS = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { to, message, type = 'notification' } = req.body;

      const sms = await twilio.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: to
      });

      // Log SMS in database
      await logSMS(to, message, type, sms.sid);

      res.json({ success: true, messageId: sms.sid });
    } catch (error) {
      console.error('Error sending SMS:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Send booking confirmation SMS
exports.sendBookingConfirmation = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { userId, packageId, addOns } = req.body;

      // Get user phone number
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      if (!userData.phoneNumber) {
        throw new Error('User phone number not found');
      }

      // Create message
      let message = `🎉 Your RYP Golf Academy booking is confirmed!\n\n`;
      
      if (packageId) {
        const packageData = getPackageData(packageId);
        message += `Package: ${packageData.title}\n`;
        message += `Price: $${packageData.price}\n\n`;
      }

      if (addOns && addOns.length > 0) {
        message += `Add-ons:\n`;
        addOns.forEach(addOn => {
          message += `• ${addOn.title}: $${addOn.standalonePrice}\n`;
        });
        message += `\n`;
      }

      message += `Check your email for session details.\n`;
      message += `Questions? Call us at (555) 123-4567`;

      // Send SMS
      await sendSMS({
        to: userData.phoneNumber,
        message: message,
        type: 'booking_confirmation'
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error sending booking confirmation:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Send session reminder SMS
exports.sendSessionReminder = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { userId, sessionId, sessionData } = req.body;

      // Get user phone number
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      if (!userData.phoneNumber) {
        throw new Error('User phone number not found');
      }

      const message = `⏰ Session Reminder!\n\n` +
        `Your ${sessionData.type} session is tomorrow at ${sessionData.time}.\n` +
        `Location: ${sessionData.location}\n\n` +
        `Reply YES to confirm or NO to cancel.`;

      await sendSMS({
        to: userData.phoneNumber,
        message: message,
        type: 'session_reminder'
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error sending session reminder:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Handle SMS responses
exports.handleSMSResponse = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { From, Body, MessageSid } = req.body;

      const response = Body.trim().toUpperCase();
      
      if (response === 'YES') {
        // Confirm session
        await confirmSession(From, MessageSid);
        await sendSMS({
          to: From,
          message: '✅ Session confirmed! See you tomorrow.',
          type: 'confirmation_response'
        });
      } else if (response === 'NO') {
        // Cancel session
        await cancelSession(From, MessageSid);
        await sendSMS({
          to: From,
          message: '❌ Session cancelled. Contact us to reschedule.',
          type: 'cancellation_response'
        });
      } else {
        // Invalid response
        await sendSMS({
          to: From,
          message: 'Please reply YES to confirm or NO to cancel.',
          type: 'invalid_response'
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error handling SMS response:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================================
// TOKEN MANAGEMENT FUNCTIONS
// ============================================================================

// Add tokens to user account
exports.addTokens = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { userId, tokenType, quantity, source } = req.body;

      await addTokensToUser(userId, tokenType, quantity, source);

      res.json({ success: true });
    } catch (error) {
      console.error('Error adding tokens:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Use tokens for session booking
exports.useTokens = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { userId, tokenType, quantity, sessionId } = req.body;

      await useTokensForSession(userId, tokenType, quantity, sessionId);

      res.json({ success: true });
    } catch (error) {
      console.error('Error using tokens:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Get user token balance
exports.getUserTokens = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { userId } = req.query;

      const tokens = await getUserTokenBalance(userId);

      res.json({ tokens });
    } catch (error) {
      console.error('Error getting user tokens:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================================
// FAMILY/PARENT-CHILD FUNCTIONS
// ============================================================================

// Link parent to child
exports.linkParentToChild = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { parentId, childId, relationship = 'parent' } = req.body;

      await linkParentChild(parentId, childId, relationship);

      res.json({ success: true });
    } catch (error) {
      console.error('Error linking parent to child:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// Parent funds child account
exports.fundChildAccount = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { parentId, childId, amount } = req.body;

      // Verify parent-child relationship
      const isParent = await verifyParentChildRelationship(parentId, childId);
      if (!isParent) {
        throw new Error('Unauthorized: You can only fund accounts of your linked children');
      }

      // Process payment
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        metadata: {
          type: 'parent_funding',
          parentId,
          childId
        }
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error('Error funding child account:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function addTokensToUser(userId, tokenType, quantity, source) {
  const tokenRef = db.collection('userTokens').doc(userId);
  
  await tokenRef.set({
    [tokenType]: admin.firestore.FieldValue.increment(quantity),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // Add to history
  const historyEntry = {
    type: 'add',
    tokenType,
    quantity,
    source,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  };

  await tokenRef.update({
    history: admin.firestore.FieldValue.arrayUnion(historyEntry)
  });
}

async function useTokensForSession(userId, tokenType, quantity, sessionId) {
  const tokenRef = db.collection('userTokens').doc(userId);
  const tokenDoc = await tokenRef.get();
  
  if (!tokenDoc.exists) {
    throw new Error('User token account not found');
  }

  const currentTokens = tokenDoc.data();
  if (currentTokens[tokenType] < quantity) {
    throw new Error(`Insufficient ${tokenType} tokens`);
  }

  await tokenRef.update({
    [tokenType]: admin.firestore.FieldValue.increment(-quantity),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  });

  // Add to history
  const historyEntry = {
    type: 'use',
    tokenType,
    quantity,
    sessionId,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  };

  await tokenRef.update({
    history: admin.firestore.FieldValue.arrayUnion(historyEntry)
  });
}

async function getUserTokenBalance(userId) {
  const tokenRef = db.collection('userTokens').doc(userId);
  const tokenDoc = await tokenRef.get();
  
  if (!tokenDoc.exists) {
    // Initialize default tokens
    const defaultTokens = {
      userId,
      groupSessions: 0,
      tournaments: 0,
      fitnessSessions: 0,
      mentalSessions: 0,
      tournamentPrep: 0,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      history: []
    };
    
    await tokenRef.set(defaultTokens);
    return defaultTokens;
  }
  
  return tokenDoc.data();
}

async function createBookingRecord(userId, packageId, addOns, paymentIntentId) {
  await db.collection('bookings').add({
    userId,
    packageId,
    addOns,
    paymentIntentId,
    status: 'confirmed',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function sendPaymentConfirmationSMS(userId, packageId, addOns) {
  // This would integrate with the SMS function
  // Implementation depends on your SMS setup
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

async function confirmSession(phoneNumber, messageId) {
  // Update session status to confirmed
  // Implementation depends on your session management
}

async function cancelSession(phoneNumber, messageId) {
  // Update session status to cancelled
  // Implementation depends on your session management
}

async function linkParentChild(parentId, childId, relationship) {
  await db.collection('families').doc(`${parentId}_${childId}`).set({
    parentId,
    childId,
    relationship,
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function verifyParentChildRelationship(parentId, childId) {
  const familyDoc = await db.collection('families')
    .doc(`${parentId}_${childId}`)
    .get();
  
  return familyDoc.exists && familyDoc.data().status === 'active';
}

function getPackageTokens(packageId) {
  const packageTokens = {
    'youth-starter': { groupSessions: 4, tournaments: 2 },
    'youth-developer': { groupSessions: 8, tournaments: 3 },
    'youth-elite': { groupSessions: 12, tournaments: 4 },
    'youth-champion': { groupSessions: 16, tournaments: 4 },
    'adult-starter': { groupSessions: 4, tournaments: 2 },
    'adult-developer': { groupSessions: 8, tournaments: 3 },
    'adult-elite': { groupSessions: 12, tournaments: 4 },
    'adult-champion': { groupSessions: 16, tournaments: 4 }
  };

  return packageTokens[packageId] || {};
}

function getAddOnTokens(addOnId) {
  const addOnTokens = {
    'ryp-academy-starter': { fitnessSessions: 4 },
    'ryp-academy-developer': { fitnessSessions: 8 },
    'mental-starter': { mentalSessions: 2 },
    'mental-developer': { mentalSessions: 4 },
    'tournament-prep': { tournamentPrep: 1 }
  };

  return addOnTokens[addOnId] || {};
}

function getPackageData(packageId) {
  const packages = {
    'youth-starter': { title: 'Starter', price: 200 },
    'youth-developer': { title: 'Developer', price: 380 },
    'youth-elite': { title: 'Elite', price: 540 },
    'youth-champion': { title: 'Champion', price: 680 },
    'adult-starter': { title: 'Adult Starter', price: 240 },
    'adult-developer': { title: 'Adult Developer', price: 456 },
    'adult-elite': { title: 'Adult Elite', price: 648 },
    'adult-champion': { title: 'Adult Champion', price: 816 }
  };

  return packages[packageId] || { title: 'Unknown Package', price: 0 };
}

// ============================================================================
// SCHEDULED FUNCTIONS
// ============================================================================

// Send daily session reminders
exports.sendDailyReminders = functions.pubsub.schedule('every day 18:00').onRun(async (context) => {
  try {
    // Get tomorrow's sessions
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const sessionsSnapshot = await db.collection('sessions')
      .where('date', '==', tomorrow.toISOString().split('T')[0])
      .get();

    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      
      // Send reminder to each participant
      for (const userId of sessionData.participants) {
        await sendSessionReminder({
          userId,
          sessionId: sessionDoc.id,
          sessionData
        });
      }
    }

    console.log('Daily reminders sent successfully');
  } catch (error) {
    console.error('Error sending daily reminders:', error);
  }
});

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
