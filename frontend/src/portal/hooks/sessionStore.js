/*
 * The signed-in account's users/{uid} profile, read once per sign-in and
 * shared (F4, speed work 2026-11-17). Every useAuthSession instance - each
 * route wrapper mounts its own - and every hook that calls live.js's
 * fetchCurrentUser used to read the doc again, a serial round trip before
 * most screens could start their own reads.
 *
 * Two layers, both module-level and memory only:
 * - the profile: what fetchCurrentUser returns. One read in flight at a
 *   time; served from memory for PROFILE_TTL_MS, and read again sooner after
 *   a bump('users') (the member's own prefs or phone) or when a caller asks
 *   for a fresh copy (refresh(), a visible page, the TTL).
 * - the session user: useAuthSession's resolved user, so a route wrapper
 *   that mounts after it is known starts resolved instead of rendering
 *   nothing for a round trip, and a re-read that finds a new role reaches
 *   every open session.
 *
 * Both belong to one `scope`, the uid the auth listener last reported. A
 * different uid or a sign-out drops everything, and a read that started
 * under an older scope never lands. Rules still enforce every request
 * (firestore.rules me() reads users/{uid} itself); this is UI state only.
 */
import { generationOf } from './invalidate';
import { clearRoleHint } from './roleHint';
import { setCacheScope } from './resourceCache';

export const PROFILE_TTL_MS = 5 * 60 * 1000;

let scope; // undefined until the auth listener first reports; null once it said "signed out"
let epoch = 0;
let profile = null; // { uid, value, at, gen, n }
let reads = 0;
let flight = null; // { uid, epoch, fresh, promise }
let sessionUser = null; // { uid, user, at }
const listeners = new Set();

const copy = (value) => ({ ...value });

/** The uid this page is serving, or null (signed out, or not known yet). */
export function sessionScope() {
  return scope || null;
}

/** True once the auth listener has reported no account (and none since). */
export function signedOutKnown() {
  return scope === null;
}

/**
 * The auth listener's account. A different uid (or null) drops the last
 * account's profile, its session user and the screens' data cache
 * (resourceCache.js). Returns whether the scope changed.
 */
export function setSessionScope(uid) {
  const next = uid || null;
  if (next === scope) return false;
  scope = next;
  epoch += 1;
  profile = null;
  flight = null;
  sessionUser = null;
  setCacheScope(next);
  return true;
}

/** Sign-out: forget the account, its cold-start role hint included. */
export function resetSession() {
  setSessionScope(null);
  clearRoleHint();
}

function profileFresh(uid) {
  return Boolean(profile) && profile.uid === uid && Date.now() - profile.at < PROFILE_TTL_MS && profile.gen === generationOf('users');
}

/**
 * The profile for `uid` through `read` (live.js's own getDoc). Only the
 * scope's account is shared; anyone else reads straight through. A failed
 * read (NOT_FOUND included) is never kept, so the next caller reads again.
 * `fresh` skips the remembered copy but joins a fresh read already in flight.
 */
export function loadProfile(uid, read, { fresh = false } = {}) {
  if (!uid || uid !== scope) return read();
  if (!fresh && profileFresh(uid)) return Promise.resolve(copy(profile.value));
  if (flight && flight.uid === uid && flight.epoch === epoch && (flight.fresh || !fresh)) return flight.promise.then(copy);
  const gen = generationOf('users');
  const mine = { uid, epoch, fresh, n: ++reads, promise: null };
  mine.promise = Promise.resolve()
    .then(read)
    .then((value) => {
      // A slower, older read never overwrites a newer one.
      if (mine.epoch === epoch && !(profile && profile.n > mine.n)) profile = { uid, value, at: Date.now(), gen, n: mine.n };
      return value;
    })
    .finally(() => {
      if (flight === mine) flight = null;
    });
  flight = mine;
  return mine.promise.then(copy);
}

/** The resolved session user for `uid` ({ user, at }), or null. */
export function peekSessionUser(uid) {
  return sessionUser && uid && sessionUser.uid === uid && uid === scope ? sessionUser : null;
}

/** True when the session user for `uid` is missing or older than the TTL. */
export function sessionUserStale(uid) {
  const known = peekSessionUser(uid);
  return !known || Date.now() - known.at >= PROFILE_TTL_MS;
}

const sameUser = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A verified resolution of the scope's account. Listeners hear only a
 * change, so an unchanged re-read re-renders nothing.
 */
export function publishSessionUser(user) {
  if (!user || !user.uid || user.uid !== scope) return;
  const changed = !sessionUser || sessionUser.uid !== user.uid || !sameUser(sessionUser.user, user);
  sessionUser = { uid: user.uid, user: changed ? user : sessionUser.user, at: Date.now() };
  if (changed) listeners.forEach((listener) => listener(sessionUser.user));
}

/** The account has no usable profile any more (NOT_FOUND, an error). */
export function forgetSessionUser(uid) {
  if (sessionUser && sessionUser.uid === uid) sessionUser = null;
}

/** Hear every changed session user; returns an unsubscribe function. */
export function subscribeSessionUser(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
