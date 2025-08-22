# Integration Setup Guide

## 🔥 **Firebase Configuration (Maximize Usage)**

### **Step 1: Enable All Firebase Services**
1. **Firebase Console** → Your Project → Project Settings
2. Enable these services:

#### **✅ Already Using:**
- **Authentication** - User login/signup
- **Firestore** - Database
- **Hosting** - Web app hosting

#### **🆕 Enable These Additional Services:**

**Firebase Functions** (Backend API)
```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Functions in your project
firebase init functions

# Choose JavaScript and ESLint
# This creates a /functions folder with backend code
```

**Firebase Storage** (File uploads)
```bash
# Initialize Storage
firebase init storage

# Rules for secure file access
# storage.rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        (request.auth.token.role == 'admin' || request.auth.token.role == 'coach');
    }
  }
}
```

**Firebase Analytics** (User behavior tracking)
```bash
# Install analytics
npm install firebase/analytics

# Initialize in your app
import { getAnalytics, logEvent } from "firebase/analytics";
const analytics = getAnalytics(app);

# Track events
logEvent(analytics, 'package_purchased', {
  package_type: 'youth-starter',
  price: 200
});
```

**Firebase Performance** (App performance monitoring)
```bash
# Install performance monitoring
npm install firebase/performance

# Initialize
import { getPerformance } from "firebase/performance";
const perf = getPerformance(app);
```

**Firebase Crashlytics** (Error tracking)
```bash
# Install crashlytics
npm install firebase/crashlytics

# Initialize
import { getCrashlytics } from "firebase/crashlytics";
const crashlytics = getCrashlytics(app);

# Log errors
import { log } from "firebase/crashlytics";
log(crashlytics, "User purchased package", {
  packageId: "youth-starter",
  userId: user.uid
});
```

**Firebase Cloud Messaging** (Push notifications)
```bash
# Install messaging
npm install firebase/messaging

# Initialize
import { getMessaging, getToken, onMessage } from "firebase/messaging";
const messaging = getMessaging(app);

# Request permission and get token
const requestNotificationPermission = async () => {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    const token = await getToken(messaging, {
      vapidKey: 'your_vapid_key'
    });
    // Save token to user profile
  }
};
```

**Firebase Remote Config** (Feature flags)
```bash
# Install remote config
npm install firebase/remote-config

# Initialize
import { getRemoteConfig, fetchAndActivate } from "firebase/remote-config";
const remoteConfig = getRemoteConfig(app);

# Set defaults
remoteConfig.defaultConfig = {
  "new_package_feature": false,
  "discount_percentage": 20
};

# Fetch and activate
await fetchAndActivate(remoteConfig);
```

### **Step 2: Firebase Functions Setup (Backend API)**
Create `/functions/index.js`:

```javascript
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret_key);
const twilio = require('twilio')(
  functions.config().twilio.account_sid,
  functions.config().twilio.auth_token
);

admin.initializeApp();

// Stripe webhook
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = functions.config().stripe.webhook_secret;
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    await handlePaymentSuccess(paymentIntent);
  }

  res.json({received: true});
});

// SMS sending
exports.sendSMS = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const message = await twilio.messages.create({
      body: data.message,
      from: functions.config().twilio.phone_number,
      to: data.to
    });

    // Log to Firestore
    await admin.firestore().collection('sms_logs').add({
      to: data.to,
      from: functions.config().twilio.phone_number,
      message: data.message,
      twilioMessageId: message.sid,
      status: 'sent',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, messageId: message.sid };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// New user registration notification
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  // Send welcome SMS
  if (user.phoneNumber) {
    await twilio.messages.create({
      body: `🎉 Welcome to RYP Golf, ${user.displayName || 'Golfer'}! Your account is ready.`,
      from: functions.config().twilio.phone_number,
      to: user.phoneNumber
    });
  }

  // Send Slack notification
  await sendSlackNotification({
    text: `🎯 New user registered: ${user.email}`,
    channel: '#new-registrations'
  });

  // Create user profile in Firestore
  await admin.firestore().collection('users').doc(user.uid).set({
    email: user.email,
    displayName: user.displayName,
    phoneNumber: user.phoneNumber,
    role: 'student',
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
});

// Session reminder automation
exports.sendSessionReminders = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const sessionsRef = admin.firestore().collection('sessions');
  const snapshot = await sessionsRef
    .where('date', '==', tomorrow.toISOString().split('T')[0])
    .get();

  const promises = snapshot.docs.map(async (doc) => {
    const session = doc.data();
    const usersRef = admin.firestore().collection('users');
    const usersSnapshot = await usersRef
      .where('role', '==', 'student')
      .get();

    const smsPromises = usersSnapshot.docs.map(async (userDoc) => {
      const user = userDoc.data();
      if (user.phoneNumber) {
        await twilio.messages.create({
          body: `⏰ RYP Golf Session Reminder\n\n📅 Tomorrow: ${session.date} at ${session.time}\n📍 ${session.location}\n👨‍🏫 ${session.instructor}\n\nPlease arrive 10 minutes early!`,
          from: functions.config().twilio.phone_number,
          to: user.phoneNumber
        });
      }
    });

    await Promise.all(smsPromises);
  });

  await Promise.all(promises);
});
```

### **Step 3: Firebase Configuration**
Set up environment variables for Firebase Functions:

```bash
# Set Stripe config
firebase functions:config:set stripe.secret_key="sk_test_your_stripe_secret_key"
firebase functions:config:set stripe.webhook_secret="whsec_your_webhook_secret"

# Set Twilio config
firebase functions:config:set twilio.account_sid="your_twilio_account_sid"
firebase functions:config:set twilio.auth_token="your_twilio_auth_token"
firebase functions:config:set twilio.phone_number="+1234567890"

# Set Slack config
firebase functions:config:set slack.webhook_url="https://hooks.slack.com/services/your/webhook/url"
```

---

## 🐛 **Sentry Error Tracking Setup**

### **Step 1: Create Sentry Account**
1. Go to [sentry.io](https://sentry.io) and create account
2. Create new project for "RYP Golf Web App"
3. Get your DSN (Data Source Name)

### **Step 2: Install Sentry**
```bash
npm install @sentry/react @sentry/tracing
```

### **Step 3: Initialize Sentry**
In `src/index.js`:

```javascript
import * as Sentry from "@sentry/react";
import { BrowserTracing } from "@sentry/tracing";

Sentry.init({
  dsn: "https://your-sentry-dsn@sentry.io/123456",
  integrations: [new BrowserTracing()],
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
  beforeSend(event) {
    // Don't send errors in development
    if (process.env.NODE_ENV === 'development') {
      return null;
    }
    return event;
  },
});
```

### **Step 4: Error Boundary**
Create `src/components/ErrorBoundary.js`:

```javascript
import React from 'react';
import * as Sentry from "@sentry/react";

function ErrorBoundary({ children }) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, componentStack, resetError }) => (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Something went wrong!</h2>
          <p>We've been notified and are working to fix this.</p>
          <button onClick={resetError}>Try again</button>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

export default ErrorBoundary;
```

### **Step 5: Track User Actions**
```javascript
// Track package purchases
Sentry.addBreadcrumb({
  category: 'purchase',
  message: 'User purchased package',
  level: 'info',
  data: {
    packageId: 'youth-starter',
    price: 200
  }
});

// Track errors
Sentry.captureException(error);
```

---

## 📱 **React Native / Expo App Development**

### **Step 1: Install Expo CLI**
```bash
npm install -g @expo/cli
```

### **Step 2: Create Expo Project**
```bash
# Create new Expo project
npx create-expo-app RYPGolfApp --template blank

# Navigate to project
cd RYPGolfApp

# Install dependencies
npm install @react-navigation/native @react-navigation/stack
npm install firebase
npm install @stripe/stripe-react-native
npm install expo-notifications
npm install expo-device
npm install expo-constants
```

### **Step 3: Firebase Configuration**
Create `firebase.js`:

```javascript
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
```

### **Step 4: Push Notifications**
In `App.js`:

```javascript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        alert('Failed to get push token for push notification!');
        return;
      }
      
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      // Save token to user profile
    }
  };

  return (
    // Your app components
  );
}
```

### **Step 5: Build for Production**
```bash
# Build for iOS
expo build:ios

# Build for Android
expo build:android

# Or use EAS Build (recommended)
npm install -g @expo/eas-cli
eas build --platform ios
eas build --platform android
```

---

## 🍎 **App Store Connect Setup**

### **Step 1: Apple Developer Account**
1. Enroll in Apple Developer Program ($99/year)
2. Access App Store Connect at [appstoreconnect.apple.com](https://appstoreconnect.apple.com)

### **Step 2: Create App**
1. **My Apps** → **+** → **New App**
2. Fill in app information:
   - **Name**: RYP Golf Academy
   - **Bundle ID**: com.rypgolf.academy
   - **SKU**: RYPGolfAcademy2024
   - **User Access**: Full Access

### **Step 3: App Information**
```yaml
# App Store Information
Name: RYP Golf Academy
Subtitle: Golf Training & Coaching
Description: |
  RYP Golf Academy is your complete golf training solution. 
  Book sessions with professional coaches, track your progress, 
  and improve your game with personalized training programs.

  Features:
  • Book coaching sessions
  • Track progress and goals
  • Mental performance training
  • Fitness programs
  • Tournament preparation
  • Real-time notifications

Keywords: golf,coaching,training,academy,lessons,sports,fitness,mental,performance

Category: Sports
Subcategory: Health & Fitness
```

### **Step 4: Screenshots & Metadata**
- **Screenshots**: 6.7" iPhone, 5.5" iPhone, 12.9" iPad
- **App Icon**: 1024x1024 PNG
- **App Preview**: 30-second video

### **Step 5: Pricing & Availability**
- **Price**: Free (with in-app purchases)
- **Availability**: United States, Canada
- **Age Rating**: 4+ (No objectionable content)

---

## 🤖 **Google Play Console Setup**

### **Step 1: Google Play Console Account**
1. Go to [play.google.com/console](https://play.google.com/console)
2. Pay one-time $25 registration fee
3. Complete account setup

### **Step 2: Create App**
1. **All apps** → **Create app**
2. Fill in app information:
   - **App name**: RYP Golf Academy
   - **Default language**: English
   - **App or game**: App
   - **Free or paid**: Free

### **Step 3: App Information**
```yaml
# Play Store Information
Title: RYP Golf Academy
Short description: Professional golf training and coaching app
Full description: |
  Transform your golf game with RYP Golf Academy - the complete 
  training solution for golfers of all levels.

  🏌️‍♂️ Professional Coaching
  Book sessions with certified golf instructors and track your 
  progress over time.

  🧠 Mental Performance
  Work with mental performance coaches to develop focus, 
  confidence, and tournament strategies.

  💪 Fitness Training
  Golf-specific strength and conditioning programs designed 
  to improve your game.

  🏆 Tournament Prep
  Specialized training programs to prepare for competitive 
  tournaments and events.

  📊 Progress Tracking
  Monitor your improvement with detailed analytics and 
  performance metrics.

  🔔 Smart Notifications
  Get reminders for sessions, progress updates, and 
  important announcements.

Category: Sports
Tags: golf, coaching, training, fitness, mental performance
```

### **Step 4: Content Rating**
- **Content Rating**: Everyone
- **Interactive Elements**: Users interact
- **Digital Purchases**: Yes

### **Step 5: App Bundle**
```bash
# Generate signed app bundle
eas build --platform android --profile production
```

---

## 📅 **Calendly Integration**

### **Step 1: Create Calendly Account**
1. Go to [calendly.com](https://calendly.com) and sign up
2. Choose Professional plan ($12/month) for team features

### **Step 2: Set Up Event Types**
Create these event types:

**Coach Consultation (30 min)**
- Duration: 30 minutes
- Buffer time: 5 minutes before/after
- Location: RYP Golf Facility
- Description: Initial consultation to discuss goals and create training plan

**Golf Session (60 min)**
- Duration: 60 minutes
- Buffer time: 10 minutes before/after
- Location: RYP Golf Facility
- Description: Individual or group golf training session

**Mental Performance Session (45 min)**
- Duration: 45 minutes
- Buffer time: 5 minutes before/after
- Location: RYP Golf Facility or Virtual
- Description: Mental game training with Coach Yannick

**Fitness Assessment (30 min)**
- Duration: 30 minutes
- Buffer time: 5 minutes before/after
- Location: RYP Academy Fitness Center
- Description: Initial fitness assessment with Coach Phil

### **Step 3: Team Members**
Add coaches as team members:
- **Coach 1**: [coach1@rypgolf.com](mailto:coach1@rypgolf.com)
- **Coach 2**: [coach2@rypgolf.com](mailto:coach2@rypgolf.com)
- **Coach Yannick**: [yannick@rypgolf.com](mailto:yannick@rypgolf.com)
- **Coach Phil**: [phil@rypgolf.com](mailto:phil@rypgolf.com)

### **Step 4: Integration with App**
Add Calendly widget to your app:

```javascript
// Install Calendly widget
npm install react-calendly

// Use in component
import { InlineWidget } from 'react-calendly';

function BookingPage() {
  return (
    <div>
      <h2>Book Your Session</h2>
      <InlineWidget
        url="https://calendly.com/rypgolf/coach-consultation"
        styles={{
          height: '700px',
          width: '100%'
        }}
      />
    </div>
  );
}
```

### **Step 5: Webhook Integration**
Set up webhooks for booking confirmations:

```javascript
// In Firebase Functions
exports.calendlyWebhook = functions.https.onRequest(async (req, res) => {
  const event = req.body;
  
  if (event.event_type === 'invitee.created') {
    const invitee = event.payload.invitee;
    const eventType = event.payload.event_type;
    
    // Send confirmation SMS
    await twilio.messages.create({
      body: `✅ RYP Golf: Your ${eventType.name} is confirmed!\n\n📅 ${invitee.start_time}\n📍 ${eventType.location}\n\nWe'll send a reminder 24 hours before.`,
      from: functions.config().twilio.phone_number,
      to: invitee.phone
    });
    
    // Send Slack notification
    await sendSlackNotification({
      text: `📅 New booking: ${invitee.name} - ${eventType.name}`,
      channel: '#bookings'
    });
  }
  
  res.json({status: 'success'});
});
```

---

## 📅 **Google Calendar Integration**

### **Step 1: Google Calendar API**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable Google Calendar API
3. Create service account and download credentials

### **Step 2: Install Google APIs**
```bash
npm install googleapis
```

### **Step 3: Calendar Integration**
Create `src/services/calendarService.js`:

```javascript
import { google } from 'googleapis';

const calendar = google.calendar('v3');

export const calendarService = {
  // Create session event
  async createSessionEvent(sessionData) {
    const auth = new google.auth.GoogleAuth({
      keyFile: 'path/to/service-account-key.json',
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const event = {
      summary: `RYP Golf: ${sessionData.type}`,
      location: sessionData.location,
      description: sessionData.focus,
      start: {
        dateTime: sessionData.startTime,
        timeZone: 'America/Chicago',
      },
      end: {
        dateTime: sessionData.endTime,
        timeZone: 'America/Chicago',
      },
      attendees: sessionData.students.map(student => ({
        email: student.email,
        displayName: student.name
      })),
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 },
        ],
      },
    };

    try {
      const response = await calendar.events.insert({
        auth: auth,
        calendarId: 'primary',
        resource: event,
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating calendar event:', error);
      throw error;
    }
  },

  // Update session event
  async updateSessionEvent(eventId, sessionData) {
    // Similar to create but with PATCH request
  },

  // Delete session event
  async deleteSessionEvent(eventId) {
    // Delete event from calendar
  }
};
```

### **Step 4: Sync with Firebase**
In Firebase Functions:

```javascript
// Sync sessions with Google Calendar
exports.syncSessionsToCalendar = functions.firestore
  .document('sessions/{sessionId}')
  .onWrite(async (change, context) => {
    const sessionData = change.after.data();
    const sessionId = context.params.sessionId;
    
    if (change.after.exists && !change.before.exists) {
      // New session - create calendar event
      await calendarService.createSessionEvent(sessionData);
    } else if (change.after.exists && change.before.exists) {
      // Updated session - update calendar event
      await calendarService.updateSessionEvent(sessionData.calendarEventId, sessionData);
    } else if (!change.after.exists && change.before.exists) {
      // Deleted session - delete calendar event
      await calendarService.deleteSessionEvent(change.before.data().calendarEventId);
    }
  });
```

---

## 💬 **Slack Notifications Setup**

### **Step 1: Create Slack Workspace**
1. Go to [slack.com](https://slack.com) and create workspace
2. Create channels:
   - `#new-registrations` - New user signups
   - `#bookings` - New session bookings
   - `#payments` - Payment confirmations
   - `#alerts` - System alerts and errors
   - `#coach-updates` - Coach activity updates

### **Step 2: Create Slack App**
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. **Create New App** → **From scratch**
3. Name: "RYP Golf Notifications"
4. Workspace: Your RYP Golf workspace

### **Step 3: Configure Webhooks**
1. **Incoming Webhooks** → **Activate Incoming Webhooks**
2. **Add New Webhook to Workspace**
3. Choose channel: `#new-registrations`
4. Copy webhook URL

### **Step 4: Install Slack SDK**
```bash
npm install @slack/webhook
```

### **Step 5: Slack Integration**
Create `src/services/slackService.js`:

```javascript
import { IncomingWebhook } from '@slack/webhook';

const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);

export const slackService = {
  // Send notification
  async sendNotification(message, channel = '#alerts') {
    try {
      await webhook.send({
        text: message,
        channel: channel,
        username: 'RYP Golf Bot',
        icon_emoji: ':golf:'
      });
    } catch (error) {
      console.error('Error sending Slack notification:', error);
    }
  },

  // New user registration
  async notifyNewRegistration(user) {
    const message = `🎉 *New User Registration*\n\n` +
      `*Name:* ${user.displayName || 'N/A'}\n` +
      `*Email:* ${user.email}\n` +
      `*Phone:* ${user.phoneNumber || 'N/A'}\n` +
      `*Time:* ${new Date().toLocaleString()}`;
    
    await this.sendNotification(message, '#new-registrations');
  },

  // New booking
  async notifyNewBooking(booking) {
    const message = `📅 *New Session Booking*\n\n` +
      `*Student:* ${booking.studentName}\n` +
      `*Session:* ${booking.sessionType}\n` +
      `*Date:* ${booking.date}\n` +
      `*Time:* ${booking.time}\n` +
      `*Coach:* ${booking.coachName}`;
    
    await this.sendNotification(message, '#bookings');
  },

  // Payment received
  async notifyPayment(payment) {
    const message = `💰 *Payment Received*\n\n` +
      `*Amount:* $${payment.amount}\n` +
      `*Package:* ${payment.packageType}\n` +
      `*User:* ${payment.userName}\n` +
      `*Status:* ${payment.status}`;
    
    await this.sendNotification(message, '#payments');
  },

  // System alert
  async notifyAlert(alert) {
    const message = `⚠️ *System Alert*\n\n` +
      `*Type:* ${alert.type}\n` +
      `*Message:* ${alert.message}\n` +
      `*Time:* ${new Date().toLocaleString()}`;
    
    await this.sendNotification(message, '#alerts');
  }
};
```

### **Step 6: Firebase Functions Integration**
In your Firebase Functions:

```javascript
const { slackService } = require('./slackService');

// New user registration
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  await slackService.notifyNewRegistration(user);
});

// New booking
exports.onBookingCreated = functions.firestore
  .document('bookings/{bookingId}')
  .onCreate(async (snap, context) => {
    const booking = snap.data();
    await slackService.notifyNewBooking(booking);
  });

// Payment success
exports.onPaymentSuccess = functions.https.onRequest(async (req, res) => {
  const payment = req.body;
  await slackService.notifyPayment(payment);
  res.json({status: 'success'});
});
```

---

## 🔧 **Environment Variables (Updated)**

### **Frontend (.env.local)**
```bash
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
REACT_APP_SENTRY_DSN=https://your-sentry-dsn@sentry.io/123456
REACT_APP_CALENDLY_URL=https://calendly.com/rypgolf
REACT_APP_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url
```

### **Backend (.env)**
```bash
# Firebase
FIREBASE_SERVICE_ACCOUNT_KEY=path/to/serviceAccountKey.json

# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url

# Google Calendar
GOOGLE_CALENDAR_CREDENTIALS=path/to/service-account-key.json

# Sentry
SENTRY_DSN=https://your-sentry-dsn@sentry.io/123456

# App Configuration
FLASK_ENV=production
SECRET_KEY=your_secret_key_here
```

---

## 📱 **Mobile App Configuration**

### **Expo Configuration (app.json)**
```json
{
  "expo": {
    "name": "RYP Golf Academy",
    "slug": "ryp-golf-academy",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.rypgolf.academy",
      "buildNumber": "1.0.0"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      },
      "package": "com.rypgolf.academy",
      "versionCode": 1
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#ffffff"
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "your-expo-project-id"
      }
    }
  }
}
```

---

## 🚀 **Deployment Checklist**

### **Phase 1: Core Setup (Week 1)**
- [ ] Firebase project configured with all services
- [ ] Stripe account and API keys
- [ ] Twilio account and phone number
- [ ] Basic backend functions deployed

### **Phase 2: Integrations (Week 2)**
- [ ] Sentry error tracking
- [ ] Slack notifications
- [ ] Calendly booking system
- [ ] Google Calendar sync

### **Phase 3: Mobile App (Week 3-4)**
- [ ] Expo project setup
- [ ] Basic mobile app functionality
- [ ] Push notifications
- [ ] App store listings prepared

### **Phase 4: Testing & Launch (Week 5)**
- [ ] End-to-end testing
- [ ] Payment flow testing
- [ ] SMS notification testing
- [ ] Mobile app testing
- [ ] Production deployment

---

## 💰 **Updated Cost Estimates**

### **Monthly Costs:**
- **Firebase**: $25-50 (depending on usage)
- **Stripe**: 2.9% + $0.30 per transaction
- **Twilio**: $15-30
- **Calendly**: $12
- **Slack**: $8
- **Sentry**: $26
- **Apple Developer**: $8.25 ($99/year)
- **Google Play**: $2.08 ($25 one-time, amortized)

**Total**: ~$100-150/month

### **One-time Costs:**
- **Apple Developer Program**: $99
- **Google Play Console**: $25
- **Domain name**: $12/year

---

**Next Steps**: Start with Phase 1 (Firebase + Stripe + Twilio), then add integrations one by one. Test thoroughly before going live!
