/*
 * The cold-start role hint (speed work 2026-11-17). Opening the app waits on
 * auth, then users/{uid}, then the landing's own reads. The last verified
 * { uid, role, specialistId } is kept in localStorage so that, once auth has
 * restored the SAME uid, RequireRole can render the landing (and start its
 * reads and its chunk) while users/{uid} is still in flight. If the fresh
 * read disagrees, RequireRole re-routes on the verified user.
 *
 * UI only: no other profile field, and nothing security-relevant reads it -
 * firestore.rules check the real users doc on every request. Written by
 * useAuthSession after a verified read, cleared on sign-out (sessionStore's
 * resetSession) and when the account has no users doc. Every storage call is
 * guarded: private mode or blocked site data just means no hint.
 */
export const ROLE_HINT_KEY = 'ryp.portal.roleHint';

const ROLES = ['athlete', 'parent', 'coach', 'mental', 'ops', 'owner'];

function storage() {
  try {
    return window.localStorage || null;
  } catch (err) {
    return null;
  }
}

/** The stored hint, or null when there is none or it is not one we wrote. */
export function readRoleHint() {
  try {
    const raw = storage()?.getItem(ROLE_HINT_KEY);
    if (!raw) return null;
    const hint = JSON.parse(raw);
    if (!hint || typeof hint.uid !== 'string' || !hint.uid || !ROLES.includes(hint.role)) return null;
    return { uid: hint.uid, role: hint.role, specialistId: typeof hint.specialistId === 'string' ? hint.specialistId : null };
  } catch (err) {
    return null;
  }
}

/** After a verified users read: keep the three routing facts, nothing else. */
export function writeRoleHint(user) {
  if (!user || typeof user.uid !== 'string' || !ROLES.includes(user.role)) return;
  const hint = { uid: user.uid, role: user.role, specialistId: typeof user.specialistId === 'string' ? user.specialistId : null };
  try {
    storage()?.setItem(ROLE_HINT_KEY, JSON.stringify(hint));
  } catch (err) {
    /* no storage, no hint */
  }
}

export function clearRoleHint() {
  try {
    storage()?.removeItem(ROLE_HINT_KEY);
  } catch (err) {
    /* nothing to clear */
  }
}

/** The hint when it belongs to `uid` (the account auth restored), else null. */
export function roleHintFor(uid) {
  if (!uid) return null;
  const hint = readRoleHint();
  return hint && hint.uid === uid ? hint : null;
}

/**
 * Who a route renders for: the verified user, or - only while that user is
 * still loading - the hint. For what the screen SHOWS (its tab bar, the
 * specialist's day); a redirect or a write waits for the verified user.
 */
export function viewerOf(session) {
  if (!session) return null;
  if (session.user) return session.user;
  return session.loading ? session.hint || null : null;
}
