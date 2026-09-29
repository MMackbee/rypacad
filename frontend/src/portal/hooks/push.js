/**
 * Web push for this device (contract v2.3, Sprint 15 - the phone channel,
 * replacing SMS). Firebase Cloud Messaging through the browser: the member
 * grants permission once, the device's FCM token goes on their own
 * `users.pushTokens` list (the third and last member self-write on users),
 * and the Cloud Functions send to every token the member holds.
 *
 * What this device knows about itself lives in localStorage (its own token)
 * - a per-viewer convenience only; the list on the users doc is the truth
 * the functions read. Foreground messages don't pop a system notification,
 * so the listener just refreshes Recent notices.
 */

import { useCallback, useEffect, useState } from 'react';
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore';
import app, { db } from '../../firebase';
import { bump } from './invalidate';
import { isLive, requireUser } from './live';

// firebase/messaging (and the installations SDK it drags in) is loaded on
// demand: every visitor paid for it at boot, but only a member turning push
// on ever uses it. Jest's dynamic import resolves to the same mocked module.
const messaging = () => import('firebase/messaging');

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY || '';
const SW_PATH = '/firebase-messaging-sw.js';
const STORAGE_KEY = 'ryp.pushToken';

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true
  );
}

/**
 * What this browser can do: 'ready' | 'blocked' | 'ios-install' (Safari on
 * iPhone before Add to Home Screen) | 'unsupported' | 'unconfigured' (no
 * VAPID key in the build).
 */
export async function pushSupport() {
  const hasApis = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  let supported = hasApis;
  if (supported) {
    try {
      const { isSupported } = await messaging();
      supported = await isSupported();
    } catch (err) {
      supported = false;
    }
  }
  if (!supported) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  if (!VAPID_KEY) return 'unconfigured';
  if (window.Notification.permission === 'denied') return 'blocked';
  return 'ready';
}

function storedToken() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    return null;
  }
}

function storeToken(token) {
  try {
    if (token) window.localStorage.setItem(STORAGE_KEY, token);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    /* private mode or blocked storage - the users doc is still the truth */
  }
}

async function registerWorker() {
  const config = encodeURIComponent(JSON.stringify(app.options || {}));
  return navigator.serviceWorker.register(`${SW_PATH}?config=${config}`);
}

async function rememberOnServer(token, add) {
  if (!isLive()) return;
  const user = requireUser();
  await updateDoc(doc(db, 'users', user.uid), {
    pushTokens: add ? arrayUnion(token) : arrayRemove(token),
  });
  bump('users');
}

/**
 * Ask permission, register the worker, mint this device's token and put it
 * on the member's users doc. Returns `{ status: 'enabled' | 'blocked' |
 * 'dismissed' }`.
 */
export async function enablePush() {
  const support = await pushSupport();
  if (support !== 'ready') return { status: support };
  const permission = await window.Notification.requestPermission();
  if (permission !== 'granted') return { status: permission === 'denied' ? 'blocked' : 'dismissed' };
  const registration = await registerWorker();
  const { getMessaging, getToken } = await messaging();
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error('This browser did not issue a push token.');
  await rememberOnServer(token, true);
  storeToken(token);
  return { status: 'enabled', token };
}

/** Forget this device: drop the token on the users doc and at FCM. */
export async function disablePush() {
  const token = storedToken();
  if (token) {
    try {
      const { deleteToken, getMessaging } = await messaging();
      await deleteToken(getMessaging(app));
    } catch (err) {
      /* already gone at FCM - the list is what matters */
    }
    await rememberOnServer(token, false);
  }
  storeToken(null);
  return { status: 'disabled' };
}

/** A foreground message refreshes Recent notices; returns the unsubscribe. */
export function listenForeground() {
  let unsubscribe = null;
  let cancelled = false;
  messaging()
    .then(({ getMessaging, onMessage }) => {
      if (cancelled) return;
      unsubscribe = onMessage(getMessaging(app), () => bump('notifications'));
    })
    .catch(() => {
      /* messaging unavailable here - nothing to listen to */
    });
  return () => {
    cancelled = true;
    if (unsubscribe) unsubscribe();
  };
}

/**
 * `{ support, enabled, busy, error, enable, disable }` for the Settings
 * card. `support` is null until the browser has been asked.
 */
export default function usePush() {
  const [support, setSupport] = useState(null);
  const [enabled, setEnabled] = useState(() => Boolean(storedToken()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    pushSupport().then((s) => {
      if (alive) setSupport(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || support !== 'ready') return undefined;
    return listenForeground();
  }, [enabled, support]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await enablePush();
      if (result.status === 'enabled') setEnabled(true);
      else if (result.status === 'blocked') setSupport('blocked');
      return result;
    } catch (err) {
      setError(err && err.message ? err.message : 'Push could not be turned on. Try again.');
      return { status: 'error' };
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await disablePush();
      setEnabled(false);
    } catch (err) {
      setError(err && err.message ? err.message : 'Push could not be turned off. Try again.');
    } finally {
      setBusy(false);
    }
  }, []);

  return { support, enabled, busy, error, enable, disable };
}
