/* eslint-disable no-undef */
/*
 * Firebase Cloud Messaging service worker (contract v2.3, Sprint 15).
 *
 * Registered by src/portal/hooks/push.js with the app's Firebase config in
 * the query string, so this static file never hardcodes project ids and the
 * one source of truth stays the REACT_APP_FIREBASE_* environment (Railway /
 * frontend/.env). With the worker registered, a `notification` message sent
 * while the portal is in the background is shown by the browser and a tap
 * opens the link the function attached (webpush.fcmOptions.link); in the
 * foreground the page's own onMessage listener refreshes Recent notices.
 *
 * The compat build version must stay in step with the "firebase" package in
 * package.json (9.x).
 */
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

var params = new URL(self.location.href).searchParams;
var config = null;
try {
  config = JSON.parse(params.get('config') || 'null');
} catch (err) {
  config = null;
}

if (config && config.projectId && config.messagingSenderId) {
  firebase.initializeApp(config);
  // Instantiating messaging is what turns on background handling.
  firebase.messaging();
}
