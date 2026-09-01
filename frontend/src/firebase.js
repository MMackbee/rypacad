import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  signInWithCustomToken,
  signOut as fbSignOut,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// RYP Golf Firebase configuration
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Validate required environment variables
const requiredEnvVars = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required Firebase environment variables:', missingVars);
  console.error('Please check your .env file and ensure all Firebase configuration variables are set.');
  
  // In development, show a helpful error message
  if (process.env.NODE_ENV === 'development') {
    throw new Error(`Missing Firebase environment variables: ${missingVars.join(', ')}. Please check your .env file.`);
  }
}

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  console.error('Error initializing Firebase:', error);
  throw new Error('Failed to initialize Firebase. Please check your configuration.');
}

// Initialize Firebase Analytics (commented out for now)
// const analytics = getAnalytics(app);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Initialize Firebase Storage and get a reference to the service
export const storage = getStorage(app);

/**
 * Emulator mode — the QA sandbox (docs/portal/TEAM.md, "QA testing").
 *
 * REACT_APP_USE_EMULATORS=true points auth + Firestore at the local
 * emulators and exposes window.__rypTestAuth, a role-switching hook for
 * automated testing: `signInAs(uid)` signs in as any seeded test account
 * via an UNSIGNED custom token (the auth emulator accepts alg:none tokens
 * — no passwords exist anywhere in this flow). The hook and the emulator
 * connection are dead code unless the variable is set at build time, so
 * nothing here can reach the production build or production Firebase.
 */
if (process.env.REACT_APP_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  const b64url = (obj) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unsignedCustomToken = (uid) => {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'none', typ: 'JWT' };
    const claims = {
      iss: 'firebase-auth-emulator@example.com',
      sub: 'firebase-auth-emulator@example.com',
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      uid,
      iat: now,
      exp: now + 3600,
    };
    return `${b64url(header)}.${b64url(claims)}.`;
  };

  window.__rypTestAuth = {
    signInAs: (uid) => signInWithCustomToken(auth, unsignedCustomToken(uid)),
    signOut: () => fbSignOut(auth),
  };
}

export default app;