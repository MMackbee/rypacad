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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ERR, LiveDataError, fetchAllAthletes, fetchAllHouseholds, fetchAthlete, fetchSessionsInRange, isLive } from './live';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import {
  CHECKINS_KEY, MENTAL_NOTES_KEY, deleteMentalEntry, fetchAllMentalBookings, fetchAllMentalEntries, fetchBookingsBetween, fetchCheckinsForAthletes,
  fetchContractConfig, fetchContractLogsBetween, fetchHouseholdContact, fetchMentalBookings, fetchMentalEntries,
  householdContact, saveMentalEntry, setCheckin as writeCheckin, setCheckinNote as writeCheckinNote,
} from './mentalLive';
import { mentalFixtures } from '../data/seed';
import { addDays, ageOn, contractMinutesFor, weekStartFor, weekSummary } from '../data/contractRule';
import { boardRows, latestCheckin, visitsByAthlete } from '../data/contractBoard';
import { groupEntries, kindOf, mentalAthleteRows } from '../data/mentalNotes';
import { academyDateISO } from '../data/calendar';

/** A save still running after this long shows "still trying" (the assessments tracker's value). */
export const SLOW_SAVE_MS = 8000;

/* ------------------------------------------------------------ Athletes -- */

function liveMentalAthletes(today) {
  return Promise.all([fetchAllAthletes(), fetchAllHouseholds(), fetchAllMentalBookings(), fetchAllMentalEntries()])
    .then(([athletes, households, bookings, entries]) => mentalAthleteRows({ athletes, households, bookings, entries, today }));
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
      lastCheckin: latestCheckin(athlete.id, checkins)?.date ?? null,
      lastCheckinNote: latestCheckin(athlete.id, checkins)?.note ?? null,
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

/** The athlete doc, or null when there is none (a mistyped or stale link); other failures still throw. */
const athleteOrNull = (athleteId) => fetchAthlete(athleteId).catch((err) => {
  if (err && err.code === ERR.NOT_FOUND) return null;
  throw err;
});

async function liveMentalAthlete(athleteId, today) {
  const week = weekStartFor(today);
  const [athlete, bookings, entries, logs, checkins] = await Promise.all([
    athleteOrNull(athleteId),
    fetchMentalBookings(athleteId),
    fetchMentalEntries(athleteId),
    fetchContractLogsBetween({ athleteIds: [athleteId], fromISO: week, toISO: addDays(week, 6) }),
    fetchCheckinsForAthletes([athleteId]),
  ]);
  if (!athlete) return null;
  const contact = await fetchHouseholdContact(athlete.householdId);
  return athletePayload({ athlete, contact, bookings, entries, logsByDate: logs[athleteId], checkins, today });
}

/**
 * `{ data: { athlete, contact, sessions, notes, contract } | null, loading,
 * error }` for one athlete's page; sessions newest first. An id with no
 * athlete (not a fixture athlete in seed mode, no athletes doc live) answers
 * null data, which the screen shows as not found.
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

/* ------------------------------------------------------- Contract board -- */

/** What the board is computed from; the rows are derived in the hook so a toggle never re-reads. */
async function liveBoardInputs(weekStartISO) {
  const weekEnd = addDays(weekStartISO, 6);
  const [athletes, households, logsByAthlete, checkins, config, bookings, sessions] = await Promise.all([
    fetchAllAthletes(),
    fetchAllHouseholds(),
    fetchContractLogsBetween({ fromISO: addDays(weekStartISO, -7), toISO: weekEnd }),
    fetchCheckinsForAthletes(null),
    fetchContractConfig(),
    fetchBookingsBetween({ fromISO: weekStartISO, toISO: weekEnd }),
    fetchSessionsInRange(weekStartISO, weekEnd),
  ]);
  return { athletes, households, logsByAthlete, checkins, config, bookings, sessions };
}

const checkinId = (c) => c.id ?? `${c.athleteId}_${c.weekStart}`;

/** The check-ins as read, with this board's own toggles on top (id -> doc, or null for unchecked). */
function withOwn(checkins, own) {
  const ownIds = Object.keys(own);
  if (ownIds.length === 0) return checkins || [];
  const rest = (checkins || []).filter((c) => !(checkinId(c) in own));
  return [...rest, ...ownIds.map((id) => own[id]).filter(Boolean)];
}

/**
 * The board for the week starting `weekStartISO`: `{ rows: { due, thisWeek,
 * checkedIn } | null, config, setCheckin({ athleteId, checkedIn }), loading,
 * error }`. The households feed boardRows' on-contract gate, the same one
 * the Monday email applies (Review Focus 4).
 *
 * A Checked in tap is optimistic: the row moves at once (the tap's own
 * check-in is applied over what was read), the write runs, and a failed
 * write puts the row back to what the server holds (the read, or the last
 * write of this board that landed) and rejects. The board never re-reads on its own
 * toggle (CHECKINS_KEY is not in its deps), so the list never blanks to
 * skeletons and the scroll stays where Yannick is. Seed mode keeps the
 * toggle local.
 */
export function useContractBoard(weekStartISO) {
  const live = isLive();
  const today = academyDateISO();
  const logsGen = useInvalidation('contractLogs');
  const athletesGen = useInvalidation('athletes');
  let seed = null;
  if (!live) {
    const f = mentalFixtures(today);
    seed = { athletes: f.athletes, households: f.households, logsByAthlete: f.logsByAthlete, checkins: f.checkins, config: f.config, bookings: f.bookings, sessions: f.sessions };
  }
  const state = useSeedResource(
    seed,
    live ? { source: () => liveBoardInputs(weekStartISO), deps: ['contract-board', weekStartISO, today, logsGen, athletesGen] } : undefined
  );

  const [own, setOwn] = useState({});
  const ownRef = useRef(own);
  // Per check-in id: what the server holds (`server`: the read, or the last
  // write that landed), the latest tap, and whether that tap was refused.
  const flights = useRef({});
  const putOwn = useCallback((next) => { ownRef.current = next; setOwn(next); }, []);
  const showServer = useCallback((id, server) => {
    const next = { ...ownRef.current };
    if (server.had) next[id] = server.doc;
    else delete next[id]; // back to what was read
    putOwn(next);
  }, [putOwn]);

  const inputs = state.data;
  const rows = useMemo(() => (inputs
    ? boardRows({
      athletes: inputs.athletes, households: inputs.households, logsByAthlete: inputs.logsByAthlete,
      checkins: withOwn(inputs.checkins, own), today, enabledAt: inputs.config?.enabledAt ?? null, weekStartISO,
      visits: visitsByAthlete({ bookings: inputs.bookings, sessions: inputs.sessions, weekStartISO }),
    })
    : null), [inputs, own, today, weekStartISO]);

  const setCheckin = useCallback(async ({ athleteId, checkedIn }) => {
    const id = `${athleteId}_${weekStartISO}`;
    const now = checkedIn ? { id, athleteId, weekStart: weekStartISO, checkedIn: true, by: 'mental', at: today } : null;
    if (!live) {
      putOwn({ ...ownRef.current, [id]: now });
      return { id, checkedIn: Boolean(checkedIn) };
    }
    // The first tap on a row records what is on screen, which is what the server holds.
    const f = flights.current[id] || (flights.current[id] = {
      server: { had: Object.prototype.hasOwnProperty.call(ownRef.current, id), doc: ownRef.current[id] },
    });
    const token = {};
    f.latest = token;
    f.refused = false;
    putOwn({ ...ownRef.current, [id]: now });
    try {
      const pending = writeCheckin({ athleteId, weekStartISO, checkedIn });
      f.pending = pending; // a note typed before this lands waits for it (setCheckinNote)
      const out = await pending;
      f.server = { had: true, doc: now };
      if (f.refused) showServer(id, f.server); // the latest tap was refused before this write landed
      return out;
    } catch (err) {
      // A refused write shows what the server holds, never an earlier tap's
      // optimistic row; a refused earlier tap leaves the latest tap's row alone.
      if (f.latest === token) {
        f.refused = true;
        showServer(id, f.server);
      }
      throw err;
    }
  }, [live, weekStartISO, today, putOwn, showServer]);

  /**
   * The note on the displayed week's check-in for `athleteId` (Yannick,
   * 2026-10-30). Optimistic like the tick: the row shows the note at once; a
   * failed write puts the previous note back and rejects. Waits for the
   * tick's own write when that is still in flight (the doc must exist for
   * the partial update), and fails the way that write failed. A blank note
   * removes the stored one. Rejects NOT_FOUND when the row is not checked
   * in that week.
   */
  const setCheckinNote = useCallback(async ({ athleteId, note }) => {
    const id = `${athleteId}_${weekStartISO}`;
    const text = typeof note === 'string' && note.trim() ? note.trim() : null;
    const current = Object.prototype.hasOwnProperty.call(ownRef.current, id)
      ? ownRef.current[id]
      : (inputs?.checkins || []).find((c) => checkinId(c) === id && c.checkedIn === true) || null;
    if (!current) throw new LiveDataError(ERR.NOT_FOUND, 'setCheckinNote: that week has no check-in to note.');
    const before = current;
    const after = { ...current, id, note: text };
    putOwn({ ...ownRef.current, [id]: after });
    if (!live) return { id, note: text };
    try {
      const f = flights.current[id];
      if (f && f.pending) await f.pending;
      const out = await writeCheckinNote({ athleteId, weekStartISO, note: text });
      if (flights.current[id]) flights.current[id].server = { had: true, doc: after };
      return out;
    } catch (err) {
      if (ownRef.current[id] === after) putOwn({ ...ownRef.current, [id]: before });
      throw err;
    }
  }, [live, weekStartISO, inputs, putOwn]);

  return { rows, config: inputs?.config ?? null, setCheckin, setCheckinNote, loading: state.loading, error: state.error };
}
