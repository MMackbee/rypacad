/*
 * The cold-start role hint (speed work 2026-11-17). Opening the app waits on
 * auth, then users/{uid}, then the landing's own reads. The last verified
 * { uid, role, specialistId } is kept in localStorage so that, once auth has
 * restored the SAME uid, RequireRole can render the landing (and start its
 * reads and its chunk) while users/{uid} is still in flight. If the fresh
 * read disagrees, RequireRole re-routes on the verified user.
 *
 * Two UI flags ride along (review 2026-11-17): selfManaged and assessor, so
 * the tab bar, the athlete's home and Admin paint as the verified user will
 * instead of reflowing when the read lands (useAuthSession seeds their
 * stores from the hint while it loads).
 *
 * UI only: no other profile field, and nothing security-relevant reads it -
 * firestore.rules check the real users doc on every request. Written by
 * useAuthSession after a verified read, cleared on sign-out (sessionStore's
 * resetSession), when the account has no users doc, and when a verified read
 * finds a role with no landing (review 2026-11-17). Every storage call is
 * guarded: private mode or blocked site data just means no hint.
 *
 * A users read that fails for any other reason (offline, unavailable,
 * refused) stops the hint for the rest of the page load (review 2026-11-17):
 * RequireRole sends the visitor to sign-in, and sign-in following the same
 * hint back to the landing bounced between the two for as long as the read
 * kept failing. The stored copy stays for the next launch; the next verified
 * read lifts the stop.
 */
export const ROLE_HINT_KEY = 'ryp.portal.roleHint';

const ROLES = ['athlete', 'parent', 'coach', 'mental', 'ops', 'owner'];

let suppressed = false; // memory only: this page load

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
    return {
      uid: hint.uid,
      role: hint.role,
      specialistId: typeof hint.specialistId === 'string' ? hint.specialistId : null,
      selfManaged: hint.selfManaged === true,
      assessor: hint.assessor === true,
    };
  } catch (err) {
    return null;
  }
}

/**
 * After a verified users read: keep the three routing facts and the two UI
 * flags, nothing else.
 * A role with no landing (null, or one this build does not know - a
 * departed coach set to null) retires the last hint instead of keeping it.
 */
export function writeRoleHint(user) {
  if (!user || typeof user.uid !== 'string') return;
  suppressed = false; // a read succeeded
  if (!ROLES.includes(user.role)) {
    clearRoleHint();
    return;
  }
  const hint = {
    uid: user.uid,
    role: user.role,
    specialistId: typeof user.specialistId === 'string' ? user.specialistId : null,
    selfManaged: user.selfManaged === true,
    assessor: user.assessor === true,
  };
  try {
    storage()?.setItem(ROLE_HINT_KEY, JSON.stringify(hint));
  } catch (err) {
    /* no storage, no hint */
  }
}

export function clearRoleHint() {
  suppressed = false;
  try {
    storage()?.removeItem(ROLE_HINT_KEY);
  } catch (err) {
    /* nothing to clear */
  }
}

/** A users read failed: offer no hint until a read succeeds (see above). */
export function suppressRoleHint() {
  suppressed = true;
}

/** The hint when it belongs to `uid` (the account auth restored), else null. */
export function roleHintFor(uid) {
  if (!uid || suppressed) return null;
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
