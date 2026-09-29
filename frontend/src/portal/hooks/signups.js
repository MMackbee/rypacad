/**
 * Sign-up era reads (Sprint 20, spec 3.2 + 7): loginInvites here; the
 * admin sign-ups report's queries and useSignups are appended by Task 13.
 * New surface, kept out of live.js/index.js (the grace.js/waitlist.js
 * precedent); imports shared primitives FROM ./live, never the other way.
 */
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, wrap } from './live';

/**
 * loginInvites/{emailLower}, or null when there is none OR the viewer may
 * not read it. Rules (Task 5) grant the read to the verified owner, the
 * household's parent and ops/owner; a coach opening AthleteDetail is
 * denied, which is not an error here - data/signups.js#loginStateFor
 * renders a null invite behind a loginEmail as 'invited'. Any other
 * failure (offline, unavailable) still throws.
 */
export async function fetchLoginInvite(email) {
  if (!email || typeof email !== 'string') return null;
  try {
    const snap = await getDoc(doc(db, 'loginInvites', email.trim().toLowerCase()));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    const wrapped = wrap(err, 'fetchLoginInvite');
    if (wrapped.code === ERR.PERMISSION) return null;
    throw wrapped;
  }
}
