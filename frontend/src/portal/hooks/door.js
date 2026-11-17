/**
 * The facility door button, the client half (docs/portal/plans/
 * 2026-11-17-door-button/00-spec.md 7). The unlockDoor callable decides
 * everything (who, where, the rules, the rate); this file asks it, with a
 * fresh press id and the phone's location, and says nothing it did not answer.
 *
 * Seed and practice modes never call: useDoorStatus answers no status there
 * (so the card stays hidden), and pressUnlock / signDoorRules refuse before
 * any call. The practice check short-circuits before isLive(), the onboarding
 * invariant (hooks/index.js header). No call goes out offline either.
 *
 * Never imports hooks/index.js or hooks/useAuthSession.js (the dashboard
 * tests mock both partially); new code stays out of the grandfathered live.js.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ERR, LiveDataError, isLive } from './live';
import { callSignDoorRules, callUnlockDoor } from './callables';
import { DOOR_TERMS_VERSION, doorCopy } from '../data/doorRules';
import { OPEN_SECONDS_MAX, OPEN_SECONDS_MIN } from '../data/doorAdmin';

/** getCurrentPosition's options (spec 7). */
export const LOCATION_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 };
/** Some phones never call back at all: give up on our own this long after location is allowed. */
export const LOCATION_WATCHDOG_MS = 12000;
/**
 * The wait while the browser may still be asking "Allow location?" (review
 * 2026-11-17 app-3): the 12 s start only once the permission is granted, so
 * reading and answering the question never eats into them.
 */
export const LOCATION_PROMPT_WATCHDOG_MS = 45000;
/** The open time when the server's answer carries none in range (doorConfig's default). */
export const DEFAULT_OPEN_SECONDS = 5;

const NOT_LIVE = 'The door button only works in the live app.';

/** A refusal the app itself makes, worded like the server's. */
function refusal(reason, cause = null) {
  return new LiveDataError(ERR.INVALID, doorCopy(reason) || NOT_LIVE, cause, reason);
}

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** The geolocation PermissionStatus, or null (no Permissions API, or the query failed). Never rejects. */
function geoPermission() {
  try {
    const p = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!p || typeof p.query !== 'function') return Promise.resolve(null);
    return Promise.resolve(p.query({ name: 'geolocation' })).catch(() => null);
  } catch (err) {
    return Promise.resolve(null);
  }
}

/**
 * The phone's position as the server reads it: `{ lat, lng, accuracy }` (m).
 * No geolocation, a refusal, no fix, the browser's 10 s timeout or our own
 * watchdog all reject 'location-needed'. The watchdog is 12 s once location
 * is allowed (from the answer when the browser asks), and 45 s while it
 * may still be asking or the browser cannot say. `fresh` (the staff
 * screen setting the academy's own location) takes no cached fix.
 */
export function currentLocation({ fresh = false } = {}) {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  const options = fresh ? { ...LOCATION_OPTIONS, maximumAge: 0 } : LOCATION_OPTIONS;
  return new Promise((resolve, reject) => {
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      reject(refusal('location-needed'));
      return;
    }
    let settled = false;
    let timer = null;
    let status = null;
    const arm = (ms) => {
      if (settled) return;
      clearTimeout(timer);
      timer = setTimeout(() => finish(reject, refusal('location-needed')), ms);
    };
    const onChange = () => {
      if (status && status.state === 'granted') arm(LOCATION_WATCHDOG_MS);
    };
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (status && typeof status.removeEventListener === 'function') status.removeEventListener('change', onChange);
      fn(value);
    };
    arm(LOCATION_PROMPT_WATCHDOG_MS);
    geoPermission().then((s) => {
      if (settled || !s) return;
      status = s;
      if (s.state === 'granted') arm(LOCATION_WATCHDOG_MS);
      else if (typeof s.addEventListener === 'function') s.addEventListener('change', onChange);
    });
    const onFix = (pos) => {
      const c = (pos && pos.coords) || {};
      const fix = { lat: Number(c.latitude), lng: Number(c.longitude), accuracy: Number(c.accuracy) };
      const usable = Number.isFinite(fix.lat) && Number.isFinite(fix.lng) && Number.isFinite(fix.accuracy) && fix.accuracy >= 0;
      if (usable) finish(resolve, fix);
      else finish(reject, refusal('location-needed'));
    };
    try {
      geo.getCurrentPosition(onFix, (err) => finish(reject, refusal('location-needed', err)), options);
    } catch (err) {
      finish(reject, refusal('location-needed', err));
    }
  });
}

/** A fresh id for one press (the server's idempotency key): crypto.randomUUID where the browser has it. */
export function newPressId() {
  const c = typeof window !== 'undefined' ? window.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A failed call as the card reads it: the server's reason stands. With none,
 * no network now, or the SDK's own unavailable (no answer from anyone), is
 * 'offline'; anything else (a crash, our timeout - the door may have opened)
 * keeps no reason, and the card says the door did not answer.
 */
function pressError(err) {
  const wrapped = err instanceof LiveDataError ? err : new LiveDataError(ERR.UNKNOWN, String((err && err.message) || err), err, null);
  if (wrapped.reason) return wrapped;
  const raw = String((wrapped.cause && wrapped.cause.code) || '').replace(/^functions\//, '');
  if (offline() || raw === 'unavailable') return refusal('offline', wrapped);
  return wrapped;
}

/**
 * One press of Unlock: `{ outcome: 'opened' | 'coalesced' | 'test', openSeconds }`,
 * or a LiveDataError whose `reason` data/doorRules.js words. A family press
 * sends the phone's location; a staff press (`staff`, from the check) sends
 * none - the server lets staff in from anywhere. Nothing is called in seed
 * mode, offline, or without a location.
 */
export async function pressUnlock({ staff = false } = {}) {
  if (!isLive()) throw refusal('not-live');
  if (offline()) throw refusal('offline');
  const pressId = newPressId();
  const payload = { pressId };
  if (!staff) payload.location = await currentLocation();
  try {
    return await callUnlockDoor(payload);
  } catch (err) {
    throw pressError(err);
  }
}

/** Signs the door rules once for this login (spec 5.3); the name is the one typed, trimmed, 2 to 120 characters. */
export async function signDoorRules(name) {
  if (!isLive()) throw refusal('not-live');
  const trimmed = String(name ?? '').trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new LiveDataError(ERR.INVALID, 'Type your full name.', null, 'bad-request');
  }
  return callSignDoorRules({ name: trimmed, termsVersion: DOOR_TERMS_VERSION });
}

const validSeconds = (n) => Number.isInteger(n) && n >= OPEN_SECONDS_MIN && n <= OPEN_SECONDS_MAX;

function cleanStatus(data) {
  return {
    canUnlock: data?.canUnlock === true,
    reason: typeof data?.reason === 'string' ? data.reason : null,
    staff: data?.staff === true,
    openSeconds: validSeconds(data?.openSeconds) ? data.openSeconds : DEFAULT_OPEN_SECONDS,
  };
}

/**
 * `{ status: { canUnlock, reason, staff, openSeconds } | null, loading, error, recheck }`:
 * the check (`{ check: true }`) on mount, live and outside practice only.
 * `recheck()` asks again (after signing the rules, after staff change the
 * switch); the last answer stays on screen meanwhile. A failed check is no
 * status, which hides the family card.
 */
export function useDoorStatus({ practice = false } = {}) {
  const live = !practice && isLive();
  const [state, setState] = useState({ status: null, loading: live, error: null });
  const [gen, setGen] = useState(0);
  useEffect(() => {
    if (!live) {
      setState({ status: null, loading: false, error: null });
      return undefined;
    }
    let current = true;
    setState((s) => ({ ...s, loading: true }));
    callUnlockDoor({ check: true }).then(
      (data) => { if (current) setState({ status: cleanStatus(data), loading: false, error: null }); },
      (error) => { if (current) setState({ status: null, loading: false, error }); }
    );
    return () => { current = false; };
  }, [live, gen]);
  const recheck = useCallback(() => setGen((g) => g + 1), []);
  return { ...state, recheck };
}

/**
 * The press as a screen runs it: `{ busy, result, left, press }`. `busy` from
 * press to answer (a press meanwhile is dropped); `result` is
 * `{ kind: 'outcome', outcome, openSeconds }` or `{ kind: 'refusal', reason,
 * message }`; `left` counts an opened door's seconds down to 0. `onReason`
 * hears every refusal's reason, so the card can switch to that state.
 */
export function useDoorPress({ staff = false, openSeconds = DEFAULT_OPEN_SECONDS, onReason } = {}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [left, setLeft] = useState(0);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const tick = useRef(null);
  const stopCountdown = () => {
    clearInterval(tick.current);
    tick.current = null;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopCountdown();
    };
  }, []);

  const press = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    stopCountdown();
    setBusy(true);
    setResult(null);
    setLeft(0);
    try {
      const answer = await pressUnlock({ staff });
      if (!mounted.current) return;
      const secs = validSeconds(answer?.openSeconds) ? answer.openSeconds : openSeconds;
      setResult({ kind: 'outcome', outcome: answer?.outcome ?? null, openSeconds: secs });
      if (answer?.outcome === 'opened') {
        setLeft(secs);
        tick.current = setInterval(() => {
          setLeft((n) => {
            if (n <= 1) stopCountdown();
            return Math.max(0, n - 1);
          });
        }, 1000);
      }
    } catch (err) {
      if (!mounted.current) return;
      const reason = err && err.reason ? err.reason : null;
      setResult({ kind: 'refusal', reason, message: err && err.message ? String(err.message) : '' });
      if (onReason) onReason(reason);
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return { busy, result, left, press };
}
