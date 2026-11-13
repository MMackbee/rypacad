/**
 * Yannick's hooks (spec 5): the Athletes list, one athlete's page and one
 * note. Seed mode (isLive() false) reads mentalFixtures(academyDateISO())
 * from data/seed.js and echoes writes locally; live mode reads and writes
 * through ./mentalLive and ./live. The contract board and the page's
 * contract reads are gone (owner 2026-11-12/13: the contract runs on a
 * paper calendar), so a refused contract read can never blank his page.
 *
 * Role 'mental' screens only: firestore.rules refuses the notes reads to
 * every other role. "Today" is the academy's America/Chicago date, never
 * the device's.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ERR, fetchAllAthletes, fetchAllHouseholds, fetchAthlete, isLive } from './live';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import {
  MENTAL_NOTES_KEY, deleteMentalEntry, fetchAllMentalBookings, fetchAllMentalEntries,
  fetchHouseholdContact, fetchMentalBookings, fetchMentalEntries, householdContact, saveMentalEntry,
} from './mentalLive';
import { MENTAL_CONSENT_KEY, fetchAllConsents, fetchConsent } from './mentalConsentLive';
import { seedConsentRecordMap } from './mentalConsent';
import { consentSeedPaperRecord } from '../data/consentSeed';
import { mentalFixtures } from '../data/seed';
import { ageOn } from '../data/contractRule';
import { groupEntries, kindOf, mentalAthleteRows } from '../data/mentalNotes';
import { academyDateISO } from '../data/calendar';
import { staffConsentSummary, utcTodayISO } from '../data/mentalConsent';
import { isAdultOnDate } from '../data/signup';

/** A save still running after this long shows "still trying" (the assessments tracker's value). */
export const SLOW_SAVE_MS = 8000;

/* ------------------------------------------------------------ Athletes -- */

// Consent never blanks Yannick's screens: a refused read is null on the list (no consent line) and undefined on the page (unavailable).
const byAthleteId = (list) => Object.fromEntries(list.map((r) => [r.athleteId ?? r.id, r]));

function liveMentalAthletes(today, utcToday) {
  return Promise.all([fetchAllAthletes(), fetchAllHouseholds(), fetchAllMentalBookings(), fetchAllMentalEntries(), fetchAllConsents().catch(() => null)])
    .then(([athletes, households, bookings, entries, consents]) =>
      mentalAthleteRows({ athletes, households, bookings, entries, today, utcToday, records: consents ? byAthleteId(consents) : null }));
}

/** `{ data: Row[] | null, loading, error }`, rows from mentalAthleteRows (data/mentalNotes.js), with each athlete's consent status. */
export function useMentalAthletes() {
  const live = isLive();
  const now = new Date();
  const today = academyDateISO(now);
  const utcToday = utcTodayISO(now);
  const notesGen = useInvalidation(MENTAL_NOTES_KEY);
  const bookingsGen = useInvalidation('bookings');
  const consentsGen = useInvalidation(MENTAL_CONSENT_KEY);
  return useSeedResource(
    live ? null : mentalAthleteRows({ ...mentalFixtures(today), today, utcToday, records: seedConsentRecordMap() }),
    live ? { source: () => liveMentalAthletes(today, utcToday), deps: ['mental-athletes', today, notesGen, bookingsGen, consentsGen] } : undefined
  );
}

/* ------------------------------------------------------- One athlete -- */

const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date));

/**
 * The consent card's payload and the contact line it changes: an athlete
 * 18+ on the UTC date with a record or a login email is reached directly -
 * their login email and the consent's emergency contact, never the guardian
 * (spec 5). `record` undefined means the consent read failed.
 */
function consentParts({ athlete, contact, record, utcToday }) {
  const unavailable = record === undefined;
  const rec = record ?? null;
  const consent = { record: rec, summary: unavailable ? null : staffConsentSummary({ athlete, record: rec, utcToday }), unavailable };
  if (!isAdultOnDate(athlete.dob, utcToday) || !(rec || athlete.loginEmail)) return { consent, contact };
  const ec = rec?.choices?.emergencyContact;
  return {
    consent,
    contact: { familyName: contact?.familyName ?? null, guardianName: null, email: athlete.loginEmail ?? null, phone: null, emergency: ec?.name ? ec : null },
  };
}

/** The athlete page's payload, one shape for seed and live. `bookings` are fetchMentalBookings rows. */
function athletePayload({ athlete, contact: householdContactLine, bookings, entries, today, utcToday, record }) {
  const noteIds = new Set(entries.map((e) => e.id));
  const { consent, contact } = consentParts({ athlete, contact: householdContactLine, record, utcToday });
  return {
    athlete: { id: athlete.id, name: athlete.name ?? null, age: ageOn(athlete.dob ?? null, today), dob: athlete.dob ?? null, householdId: athlete.householdId ?? null },
    contact,
    consent,
    sessions: bookings.map((b) => ({ sessionId: b.sessionId, date: b.date, time: b.time, status: b.status, attendee: b.attendee, hasNote: noteIds.has(b.sessionId) })),
    notes: groupEntries(entries),
  };
}

function seedMentalAthlete(athleteId, today, utcToday, demoRecord = null) {
  const f = mentalFixtures(today);
  const athlete = f.athletes.find((a) => a.id === athleteId);
  if (!athlete) return null;
  const household = f.households[athlete.householdId];
  const timeOf = new Map(f.sessions.map((s) => [s.id, s.time]));
  const bookings = f.bookings
    .filter((b) => b.athleteId === athleteId && b.type === 'mental')
    .map((b) => ({ id: b.id, sessionId: b.sessionId, date: b.date, time: timeOf.get(b.sessionId) ?? null, status: b.status, attendee: b.attendee ?? 'athlete' }))
    .sort(byDateDesc);
  return athletePayload({
    athlete, contact: household ? householdContact(household) : null, bookings,
    entries: f.entries.filter((e) => e.athleteId === athleteId), today,
    utcToday, record: demoRecord === 'paper' ? consentSeedPaperRecord(athleteId) : seedConsentRecordMap()[athleteId] ?? null,
  });
}

/** The athlete doc, or null when there is none (a mistyped or stale link); other failures still throw. */
const athleteOrNull = (athleteId) => fetchAthlete(athleteId).catch((err) => {
  if (err && err.code === ERR.NOT_FOUND) return null;
  throw err;
});

async function liveMentalAthlete(athleteId, today, utcToday) {
  const [athlete, bookings, entries, record] = await Promise.all([
    athleteOrNull(athleteId),
    fetchMentalBookings(athleteId),
    fetchMentalEntries(athleteId),
    fetchConsent(athleteId).catch(() => undefined),
  ]);
  if (!athlete) return null;
  const contact = await fetchHouseholdContact(athlete.householdId);
  return athletePayload({ athlete, contact, bookings, entries, today, utcToday, record });
}

/**
 * `{ data: { athlete, contact, consent, sessions, notes } | null,
 * loading, error }` for one athlete's page; sessions newest first;
 * `consent = { record, summary, unavailable }`. An id with no athlete (not a
 * fixture athlete in seed mode, no athletes doc live) answers null data,
 * which the screen shows as not found. `demoUtcToday` (ages on another UTC
 * date) and `demoRecord: 'paper'` are the review harness's: the seed branch
 * alone reads them.
 */
export function useMentalAthlete(athleteId, { demoUtcToday = null, demoRecord = null } = {}) {
  const live = isLive();
  const now = new Date();
  const today = academyDateISO(now);
  const utcToday = utcTodayISO(now);
  const notesGen = useInvalidation(MENTAL_NOTES_KEY);
  const consentsGen = useInvalidation(MENTAL_CONSENT_KEY);
  return useSeedResource(
    live ? null : seedMentalAthlete(athleteId, today, demoUtcToday ?? utcToday, demoRecord),
    live ? { source: () => liveMentalAthlete(athleteId, today, utcToday), deps: ['mental-athlete', athleteId, today, notesGen, consentsGen] } : undefined
  );
}

/* ------------------------------------------------------------ One note -- */

/**
 * One note and its autosave state. The note is read once per
 * (athleteId, entryId) and never re-read on invalidation: the editor owns
 * the text and a save must never blank it (Review Focus 5). A stored note
 * opens with saveState 'saved' and savedAt its updatedAtMs; a new one
 * 'idle'. `save(body)` never rejects (the editor reads saveState: saving ->
 * saved, 'slow' after SLOW_SAVE_MS, 'error' on failure, which the editor
 * retries on its next tick); `remove()` rejects when the delete
 * fails, so the screen stays on the note. A save already running when the
 * delete starts may update the note but never create it again (its
 * transaction re-runs after the delete lands). `athleteName` is the argument, or
 * the athlete's name resolved once per athleteId (a refresh or a deep link).
 */
export function useMentalNote({ athleteId, entryId, sessionDate = null, athleteName = null }) {
  const live = isLive();
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [savedAt, setSavedAt] = useState(null);
  const [resolved, setResolved] = useState({ athleteId: null, name: null });
  const mounted = useRef(true);
  const entryRef = useRef(null);
  const noteGen = useRef(0); // moves when (athleteId, entryId) changes: an older save no longer lands
  const saveSeq = useRef(0); // moves on every save: only the latest one reports its state
  // The delete under way: every save of note `gen` up to `seq` started before it and may not create.
  const deleting = useRef(null);

  const putEntry = useCallback((next) => { entryRef.current = next; setEntry(next); }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    noteGen.current += 1;
    saveSeq.current += 1;
    putEntry(null);
    setError(null);
    setSaveState('idle');
    setSavedAt(null);
    // A stored note opens as saved, at its last update; a new one as idle.
    const loaded = (found) => {
      putEntry(found);
      setSaveState(found ? 'saved' : 'idle');
      setSavedAt(found?.updatedAtMs ?? null);
      setLoading(false);
    };
    if (!live) {
      loaded(mentalFixtures(academyDateISO()).entries.find((e) => e.athleteId === athleteId && e.id === entryId) || null);
      return undefined;
    }
    setLoading(true);
    fetchMentalEntries(athleteId)
      .then((rows) => {
        if (!alive) return;
        loaded(rows.find((e) => e.id === entryId) || null);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [athleteId, entryId, live, putEntry]);

  useEffect(() => {
    if (athleteName != null || !athleteId || resolved.athleteId === athleteId) return undefined;
    if (!live) {
      const a = mentalFixtures(academyDateISO()).athletes.find((x) => x.id === athleteId);
      setResolved({ athleteId, name: a?.name ?? null });
      return undefined;
    }
    let alive = true;
    fetchAthlete(athleteId)
      .then((a) => { if (alive) setResolved({ athleteId, name: a?.name ?? null }); })
      .catch(() => {}); // the name stays null; the screen says "Athlete"
    return () => { alive = false; };
  }, [athleteId, athleteName, live, resolved.athleteId]);

  const save = useCallback(async (body) => {
    const gen = noteGen.current;
    const seq = ++saveSeq.current;
    const current = () => mounted.current && noteGen.current === gen;
    const latest = () => current() && saveSeq.current === seq;
    setSaveState('saving');
    const slow = setTimeout(() => { if (latest()) setSaveState((s) => (s === 'saving' ? 'slow' : s)); }, SLOW_SAVE_MS);
    const kind = kindOf(entryId);
    const sessionId = kind === 'session' ? entryId : null;
    // A deep link has no sessionDate; keep the one the note already has.
    const date = sessionDate ?? entryRef.current?.sessionDate ?? null;
    // Asked on each transaction attempt: a retry after a confirmed delete never recreates the note.
    const mayCreate = () => !(deleting.current && deleting.current.gen === gen && seq <= deleting.current.seq);
    try {
      if (live) await saveMentalEntry({ athleteId, entryId, kind, sessionId, sessionDate: date, body, mayCreate });
      if (!current()) return;
      const now = Date.now();
      putEntry({ ...(entryRef.current || { id: entryId, athleteId, kind, sessionId, createdAtMs: now }), body, sessionDate: date, updatedAtMs: now });
      if (latest()) {
        setSaveState('saved');
        setSavedAt(now);
      }
    } catch (err) {
      if (latest()) setSaveState('error');
    } finally {
      clearTimeout(slow);
    }
  }, [athleteId, entryId, sessionDate, live, putEntry]);

  const remove = useCallback(async () => {
    const gen = noteGen.current;
    const mark = { gen, seq: saveSeq.current }; // set before the delete goes out
    deleting.current = mark;
    try {
      if (live) await deleteMentalEntry({ athleteId, entryId });
    } catch (err) {
      if (deleting.current === mark) deleting.current = null; // not deleted: a running save may create again
      throw err;
    }
    if (!mounted.current || noteGen.current !== gen) return;
    saveSeq.current += 1;
    putEntry(null);
    setSaveState('idle');
    setSavedAt(null);
  }, [athleteId, entryId, live, putEntry]);

  const name = athleteName ?? (resolved.athleteId === athleteId ? resolved.name : null);
  return { entry, athleteName: name, loading, error, save, remove, saveState, savedAt };
}
