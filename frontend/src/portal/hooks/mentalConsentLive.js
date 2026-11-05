/**
 * Firestore reads and writes of mentalConsents/{athleteId} (mental consent
 * spec 6.1). Imports shared primitives FROM ./live, never the other way (the
 * mentalLive.js precedent). Records come back as stored - Timestamps stay
 * Timestamps - because every later write appends them to `history` and the
 * rules compare that array exactly (Review Focus 1).
 *
 * Reads, each provable for its role without an index (Review Focus 2): a
 * parent reads ONLY through the householdId query - the read rule tests
 * resource.data.householdId, so a parent's get of a record that does not
 * exist yet is refused, not "not found"; an athlete login gets its own doc
 * (allowed when missing: null); Yannick, ops and the owner read the
 * collection or one doc.
 *
 * Writes: the signature is a plain setDoc (a parent cannot read a missing
 * record inside a transaction); every later write is a transaction that
 * reads the record first and hands the snapshot's own data to the builder
 * (data/mentalConsentWrites.js). Every write bumps MENTAL_CONSENT_KEY.
 */
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, requireUser, wrap } from './live';
import { bump } from './invalidate';

export const MENTAL_CONSENT_KEY = 'mentalConsents';
const COLLECTION = 'mentalConsents';

const rowOf = (d) => ({ id: d.id, ...d.data() });
const consentRef = (athleteId) => doc(db, COLLECTION, athleteId);

/** The write stamp: the server's time, which the rules pin every signature and change to. */
export function consentStamp() {
  return serverTimestamp();
}

/** A parent's read: every record of the household, by the householdId equality the rules prove. */
export async function fetchHouseholdConsents(householdId) {
  if (!householdId) throw new LiveDataError(ERR.INVALID, 'fetchHouseholdConsents: householdId is required.');
  try {
    const snap = await getDocs(query(collection(db, COLLECTION), where('householdId', '==', householdId)));
    return snap.docs.map(rowOf);
  } catch (err) {
    throw wrap(err, 'fetchHouseholdConsents');
  }
}

async function fetchOne(athleteId, context) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, `${context}: athleteId is required.`);
  try {
    const snap = await getDoc(consentRef(athleteId));
    return snap.exists() ? rowOf(snap) : null;
  } catch (err) {
    throw wrap(err, context);
  }
}

/** An athlete login's own record, or null (the rules allow this get when the record is missing). */
export function fetchOwnConsent(athleteId) {
  return fetchOne(athleteId, 'fetchOwnConsent');
}

/** One record for Yannick, ops or the owner, or null. */
export function fetchConsent(athleteId) {
  return fetchOne(athleteId, 'fetchConsent');
}

/** Every record (Yannick, ops, owner): an unfiltered read of the collection. */
export async function fetchAllConsents() {
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map(rowOf);
  } catch (err) {
    throw wrap(err, 'fetchAllConsents');
  }
}

/**
 * The signature: one setDoc of the whole record. A refusal is re-read
 * through the caller's own read (`reread`, which never getDocs a parent):
 * when a record is there - the other parent, or the athlete's own login,
 * signed meanwhile - the answer is `{ status: 'already', record }`.
 */
export async function createConsent({ athleteId, doc: body, reread }) {
  requireUser();
  try {
    await setDoc(consentRef(athleteId), body);
  } catch (err) {
    const wrapped = wrap(err, 'createConsent');
    if (wrapped.code === ERR.PERMISSION && typeof reread === 'function') {
      const record = await Promise.resolve().then(reread).catch(() => null);
      if (record) {
        bump(MENTAL_CONSENT_KEY);
        return { status: 'already', record };
      }
    }
    throw wrapped;
  }
  bump(MENTAL_CONSENT_KEY);
  return { status: 'signed' };
}

/** Every later write: read the record in a transaction, update it with `build(snapshot.data())`. NOT_FOUND when there is none. */
export async function updateConsent({ athleteId, build }) {
  requireUser();
  const ref = consentRef(athleteId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      // A LiveDataError is not a FirebaseError, so the SDK does not retry it.
      if (!snap.exists()) throw new LiveDataError(ERR.NOT_FOUND, `updateConsent: no mentalConsents/${athleteId} yet.`);
      tx.update(ref, build(snap.data()));
    });
  } catch (err) {
    throw wrap(err, 'updateConsent');
  }
  bump(MENTAL_CONSENT_KEY);
}
