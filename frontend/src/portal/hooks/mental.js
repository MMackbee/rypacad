/**
 * Yannick's hooks (spec 5): the Athletes list, one athlete's page, one note
 * and the contract board. Seed mode (isLive() false) reads
 * mentalFixtures(academyDateISO()) from data/seed.js and echoes writes
 * locally; live mode reads and writes through ./mentalLive and ./live.
 *
 * Role 'mental' screens only, except the board (mental, ops, owner):
 * firestore.rules refuses the notes reads to every other role. "Today" is
 * the academy's America/Chicago date, never the device's.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAllAthletes, fetchAllHouseholds, fetchAthlete, isLive } from './live';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import {
  CHECKINS_KEY, MENTAL_NOTES_KEY, deleteMentalEntry, fetchAllMentalBookings, fetchAllMentalEntries, fetchCheckinsForAthletes,
  fetchContractConfig, fetchContractLogsBetween, fetchHouseholdContact, fetchMentalBookings, fetchMentalEntries,
  householdContact, saveMentalEntry, setCheckin as writeCheckin,
} from './mentalLive';
import { mentalFixtures } from '../data/seed';
import { addDays, ageOn, contractMinutesFor, weekStartFor, weekSummary } from '../data/contractRule';
import { boardRows, lastCheckinFor } from '../data/contractBoard';
import { groupEntries, kindOf, mentalAthleteRows } from '../data/mentalNotes';
import { academyDateISO } from '../data/calendar';

/** A save still running after this long shows "still trying" (the assessments tracker's value). */
export const SLOW_SAVE_MS = 8000;

/* ------------------------------------------------------------ Athletes -- */

function liveMentalAthletes(today) {
  return Promise.all([fetchAllAthletes(), fetchAllMentalBookings(), fetchAllMentalEntries()])
    .then(([athletes, bookings, entries]) => mentalAthleteRows({ athletes, bookings, entries, today }));
}

/** `{ data: Row[] | null, loading, error }`, rows from mentalAthleteRows (data/mentalNotes.js). */
export function useMentalAthletes() {
  const live = isLive();
  const today = academyDateISO();
  const notesGen = useInvalidation(MENTAL_NOTES_KEY);
  const bookingsGen = useInvalidation('bookings');
  return useSeedResource(
    live ? null : mentalAthleteRows({ ...mentalFixtures(today), today }),
    live ? { source: () => liveMentalAthletes(today), deps: ['mental-athletes', today, notesGen, bookingsGen] } : undefined
  );
}

/* ------------------------------------------------------- One athlete -- */

const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date));

/** The athlete page's payload, one shape for seed and live. `bookings` are fetchMentalBookings rows. */
function athletePayload({ athlete, contact, bookings, entries, logsByDate, checkins, today }) {
  const required = contractMinutesFor(athlete, today);
  const noteIds = new Set(entries.map((e) => e.id));
  return {
    athlete: { id: athlete.id, name: athlete.name ?? null, age: ageOn(athlete.dob ?? null, today), dob: athlete.dob ?? null, householdId: athlete.householdId ?? null, required },
    contact,
    sessions: bookings.map((b) => ({ sessionId: b.sessionId, date: b.date, time: b.time, status: b.status, attendee: b.attendee, hasNote: noteIds.has(b.sessionId) })),
    notes: groupEntries(entries),
    contract: {
      thisWeek: weekSummary({ logsByDate, weekStartISO: weekStartFor(today), required: (d) => contractMinutesFor(athlete, d) }),
      lastCheckin: lastCheckinFor(athlete.id, checkins),
      required,
    },
  };
}

function seedMentalAthlete(athleteId, today) {
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
    entries: f.entries.filter((e) => e.athleteId === athleteId), logsByDate: f.logsByAthlete[athleteId], checkins: f.checkins, today,
  });
}

async function liveMentalAthlete(athleteId, today) {
  const week = weekStartFor(today);
  const [athlete, bookings, entries, logs, checkins] = await Promise.all([
    fetchAthlete(athleteId),
    fetchMentalBookings(athleteId),
    fetchMentalEntries(athleteId),
    fetchContractLogsBetween({ athleteIds: [athleteId], fromISO: week, toISO: addDays(week, 6) }),
    fetchCheckinsForAthletes([athleteId]),
  ]);
  const contact = await fetchHouseholdContact(athlete.householdId);
  return athletePayload({ athlete, contact, bookings, entries, logsByDate: logs[athleteId], checkins, today });
}

/**
 * `{ data: { athlete, contact, sessions, notes, contract } | null, loading,
 * error }` for one athlete's page; sessions newest first. Seed mode answers
 * null data for an id that is not a fixture athlete.
 */
export function useMentalAthlete(athleteId) {
  const live = isLive();
  const today = academyDateISO();
  const notesGen = useInvalidation(MENTAL_NOTES_KEY);
  const logsGen = useInvalidation('contractLogs');
  const checkinsGen = useInvalidation(CHECKINS_KEY);
  return useSeedResource(
    live ? null : seedMentalAthlete(athleteId, today),
    live ? { source: () => liveMentalAthlete(athleteId, today), deps: ['mental-athlete', athleteId, today, notesGen, logsGen, checkinsGen] } : undefined
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
 * fails, so the screen stays on the note. `athleteName` is the argument, or
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
    try {
      if (live) await saveMentalEntry({ athleteId, entryId, kind, sessionId, sessionDate: date, body });
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
    if (live) await deleteMentalEntry({ athleteId, entryId });
    if (!mounted.current || noteGen.current !== gen) return;
    saveSeq.current += 1;
    putEntry(null);
    setSaveState('idle');
    setSavedAt(null);
  }, [athleteId, entryId, live, putEntry]);

  const name = athleteName ?? (resolved.athleteId === athleteId ? resolved.name : null);
  return { entry, athleteName: name, loading, error, save, remove, saveState, savedAt };
}

/* ------------------------------------------------------- Contract board -- */

async function liveBoard(weekStartISO, today) {
  const [athletes, households, logsByAthlete, checkins, config] = await Promise.all([
    fetchAllAthletes(),
    fetchAllHouseholds(),
    fetchContractLogsBetween({ fromISO: addDays(weekStartISO, -7), toISO: addDays(weekStartISO, 6) }),
    fetchCheckinsForAthletes(null),
    fetchContractConfig(),
  ]);
  return { rows: boardRows({ athletes, households, logsByAthlete, checkins, today, enabledAt: config.enabledAt, weekStartISO }), config };
}

/**
 * The board for the week starting `weekStartISO`: `{ rows: { due, thisWeek,
 * checkedIn } | null, config, setCheckin({ athleteId, checkedIn }), loading,
 * error }`. The households feed boardRows' on-contract gate, the same one
 * the Monday email applies (Review Focus 4). Live, setCheckin writes and its
 * bump re-reads the board; seed, it moves the row locally.
 */
export function useContractBoard(weekStartISO) {
  const live = isLive();
  const today = academyDateISO();
  const logsGen = useInvalidation('contractLogs');
  const checkinsGen = useInvalidation(CHECKINS_KEY);
  const athletesGen = useInvalidation('athletes');
  const [seedCheckins, setSeedCheckins] = useState(() => (live ? [] : mentalFixtures(today).checkins));
  let seed = null;
  if (!live) {
    const f = mentalFixtures(today);
    seed = { rows: boardRows({ ...f, checkins: seedCheckins, today, enabledAt: f.config.enabledAt, weekStartISO }), config: f.config };
  }
  const state = useSeedResource(
    seed,
    live ? { source: () => liveBoard(weekStartISO, today), deps: ['contract-board', weekStartISO, today, logsGen, checkinsGen, athletesGen] } : undefined
  );

  const setCheckin = useCallback(async ({ athleteId, checkedIn }) => {
    if (live) return writeCheckin({ athleteId, weekStartISO, checkedIn });
    const id = `${athleteId}_${weekStartISO}`;
    setSeedCheckins((list) => {
      const rest = list.filter((c) => c.id !== id);
      return checkedIn ? [...rest, { id, athleteId, weekStart: weekStartISO, checkedIn: true, by: 'mental', at: today }] : rest;
    });
    return { id, checkedIn: Boolean(checkedIn) };
  }, [live, weekStartISO, today]);

  return { rows: state.data?.rows ?? null, config: state.data?.config ?? null, setCheckin, loading: state.loading, error: state.error };
}
