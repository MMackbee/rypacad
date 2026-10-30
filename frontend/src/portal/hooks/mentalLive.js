/**
 * Firestore reads and writes for Yannick's tools (spec 4.1, 4.2, 6).
 * Imports shared primitives FROM ./live, never the other way (the
 * scholarships.js precedent). Every list read here is provable for role
 * 'mental' without an index: the notes group query is unfiltered, the
 * check-ins and bookings reads are single-field equality, the logs read
 * is a single-field date range.
 */
import { collection, collectionGroup, deleteDoc, deleteField, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, fetchBookings, fetchSessionsByIds, requireUser, wrap } from './live';
import { bump } from './invalidate';
import { NOTE_MAX } from '../data/mentalNotes';
import { CHECKIN_NOTE_MAX } from '../data/contractBoard';

export const MENTAL_NOTES_KEY = 'mentalNotes';
export const CHECKINS_KEY = 'contractCheckins';

const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);
const entryRow = (d) => {
  const { createdAt, updatedAt, ...rest } = d.data();
  return { id: d.id, ...rest, createdAtMs: ms(createdAt), updatedAtMs: ms(updatedAt) };
};
const noteRef = (athleteId, entryId) => doc(db, 'mentalNotes', athleteId, 'entries', entryId);

export async function fetchMentalEntries(athleteId) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, 'fetchMentalEntries: athleteId is required.');
  try {
    const snap = await getDocs(collection(db, 'mentalNotes', athleteId, 'entries'));
    return snap.docs.map(entryRow);
  } catch (err) { throw wrap(err, 'fetchMentalEntries'); }
}

export async function fetchAllMentalEntries() {
  try {
    const snap = await getDocs(collectionGroup(db, 'entries'));
    return snap.docs.map(entryRow);
  } catch (err) { throw wrap(err, 'fetchAllMentalEntries'); }
}

/**
 * Creates the note or updates it, in one transaction. `mayCreate()` is asked
 * on every attempt (the SDK re-runs the function when the note changed under
 * it); when it says no and the note is gone, the save is refused NOT_FOUND
 * rather than recreating a note a confirmed delete just removed.
 */
export async function saveMentalEntry({ athleteId, entryId, kind, sessionId = null, sessionDate = null, body, mayCreate = () => true }) {
  if (!athleteId || !entryId) throw new LiveDataError(ERR.INVALID, 'saveMentalEntry: athleteId and entryId are required.');
  if (typeof body !== 'string' || body.length > NOTE_MAX) throw new LiveDataError(ERR.INVALID, `saveMentalEntry: body must be a string of at most ${NOTE_MAX} characters.`);
  const user = requireUser();
  const ref = noteRef(athleteId, entryId);
  try {
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        tx.update(ref, { body, sessionDate, updatedBy: user.uid, updatedAt: serverTimestamp() });
        return false;
      }
      // A LiveDataError is not a FirebaseError, so the SDK does not retry it.
      if (!mayCreate()) throw new LiveDataError(ERR.NOT_FOUND, `saveMentalEntry: mentalNotes/${athleteId}/entries/${entryId} was deleted.`);
      tx.set(ref, { athleteId, kind, sessionId, sessionDate, body, createdBy: user.uid, updatedBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return true;
    });
    bump(MENTAL_NOTES_KEY);
    return { id: entryId, created };
  } catch (err) { throw wrap(err, 'saveMentalEntry'); }
}

export async function deleteMentalEntry({ athleteId, entryId }) {
  requireUser();
  try {
    await deleteDoc(noteRef(athleteId, entryId));
    bump(MENTAL_NOTES_KEY);
    return { id: entryId };
  } catch (err) { throw wrap(err, 'deleteMentalEntry'); }
}

const checkinRow = (d) => ({ id: d.id, ...d.data() });

export async function fetchCheckins({ weekStartISO }) {
  try {
    const snap = await getDocs(query(collection(db, 'contractCheckins'), where('weekStart', '==', weekStartISO)));
    return snap.docs.map(checkinRow);
  } catch (err) { throw wrap(err, 'fetchCheckins'); }
}

export async function fetchCheckinsForAthletes(athleteIds) {
  try {
    const snap = await getDocs(collection(db, 'contractCheckins'));
    const ids = athleteIds ? new Set(athleteIds) : null;
    return snap.docs.map(checkinRow).filter((c) => !ids || ids.has(c.athleteId));
  } catch (err) { throw wrap(err, 'fetchCheckinsForAthletes'); }
}

export async function setCheckin({ athleteId, weekStartISO, checkedIn }) {
  const user = requireUser();
  const ref = doc(db, 'contractCheckins', `${athleteId}_${weekStartISO}`);
  try {
    if (checkedIn) await setDoc(ref, { athleteId, weekStart: weekStartISO, checkedIn: true, by: user.uid, at: serverTimestamp() });
    else await deleteDoc(ref);
    bump(CHECKINS_KEY);
    return { id: `${athleteId}_${weekStartISO}`, checkedIn: Boolean(checkedIn) };
  } catch (err) { throw wrap(err, 'setCheckin'); }
}

/**
 * The note on an existing check-in (Yannick, 2026-10-30: the tick prompts
 * for what was said). A partial update, so `at` (when the check-in
 * happened) is untouched; a blank note removes the field. Refuses a note
 * over CHECKIN_NOTE_MAX before any write. Resolves `{ id, note }` with the
 * note as stored (null when removed).
 */
export async function setCheckinNote({ athleteId, weekStartISO, note }) {
  requireUser();
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length > CHECKIN_NOTE_MAX) throw new LiveDataError(ERR.INVALID, `setCheckinNote: a note holds at most ${CHECKIN_NOTE_MAX} characters.`);
  const id = `${athleteId}_${weekStartISO}`;
  try {
    await updateDoc(doc(db, 'contractCheckins', id), { note: text ? text : deleteField() });
    bump(CHECKINS_KEY);
    return { id, note: text || null };
  } catch (err) { throw wrap(err, 'setCheckinNote'); }
}

/**
 * Every booking dated from `fromISO` to `toISO` inclusive, any athlete, any
 * type, as stored (the board's visits, data/contractBoard.js visitsByAthlete).
 * A single-field date range, provable for the staff read clause.
 */
export async function fetchBookingsBetween({ fromISO, toISO }) {
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('date', '>=', fromISO), where('date', '<=', toISO)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { throw wrap(err, 'fetchBookingsBetween'); }
}

export async function fetchContractLogsBetween({ athleteIds = null, fromISO, toISO }) {
  try {
    const snap = await getDocs(query(collection(db, 'contractLogs'), where('date', '>=', fromISO), where('date', '<=', toISO)));
    const ids = athleteIds ? new Set(athleteIds) : null;
    const out = {};
    for (const d of snap.docs) {
      const { athleteId, date, minutes } = d.data();
      if (ids && !ids.has(athleteId)) continue;
      (out[athleteId] = out[athleteId] || {})[date] = minutes || 0;
    }
    return out;
  } catch (err) { throw wrap(err, 'fetchContractLogsBetween'); }
}

export async function fetchMentalBookings(athleteId) {
  const bookings = (await fetchBookings(athleteId)).filter((b) => b.type === 'mental');
  const sessions = await fetchSessionsByIds(bookings.map((b) => b.sessionId));
  const byId = new Map(sessions.map((s) => [s.id, s]));
  return bookings
    .map((b) => ({ id: b.id, sessionId: b.sessionId, date: b.date, time: byId.get(b.sessionId)?.time ?? null, status: b.status, attendee: b.attendee ?? 'athlete' }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function fetchAllMentalBookings() {
  try {
    const snap = await getDocs(query(collection(db, 'bookings'), where('type', '==', 'mental')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) { throw wrap(err, 'fetchAllMentalBookings'); }
}

/** The four guardian-contact fields of a household doc (spec 3); hooks/mental.js uses it for the seed household too. */
export const householdContact = (h) => ({ familyName: h.name ?? null, guardianName: h.guardian?.name ?? null, email: h.guardian?.email ?? null, phone: h.guardian?.phone ?? null });

/** Guardian contact only (spec 3): nothing else from the household doc leaves this function. */
export async function fetchHouseholdContact(householdId) {
  if (!householdId) return null;
  try {
    const snap = await getDoc(doc(db, 'households', householdId));
    if (!snap.exists()) return null;
    return householdContact(snap.data());
  } catch (err) { return null; }
}

export async function fetchContractConfig() {
  try {
    const snap = await getDoc(doc(db, 'config', 'contract'));
    if (!snap.exists()) return { enabled: false, enabledAt: null };
    const c = snap.data();
    return { enabled: c.enabled === true, enabledAt: typeof c.enabledAt === 'string' ? c.enabledAt : null };
  } catch (err) { throw wrap(err, 'fetchContractConfig'); }
}
