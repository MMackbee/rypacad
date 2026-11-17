/**
 * The Facility door staff screen's Firestore half (docs/portal/plans/
 * 2026-11-17-door-button/00-spec.md 4, 6): owner and ops read
 * doorConfig/main, doorPauses and the latest 50 doorEvents, and write
 * doorConfig/main and doorPauses exactly as firestore.rules allows - the
 * listed keys only, serverTimestamp() for the time, the signed-in uid.
 * The server alone writes doorEvents, doorRules and doorLimits.
 *
 * A config change is a MERGE of only the fields it changes (review
 * 2026-11-17 rules-1, app-2): two staff screens open at once never undo
 * each other's switch or location, and the Off switch stays the emergency
 * stop. The config is read back after each save and whenever the page comes
 * back into view, so a screen left open does not stay stale.
 *
 * Seed mode (isLive() false) reads and writes no Firestore: the screen shows
 * an Off door with no location, and changes stay on the page. Imports shared
 * primitives FROM ./live, never the other way (the parallaxLive.js precedent).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { isLive, requireUser, wrap } from './live';
import { configPatch, configWrite, normalizeConfig } from '../data/doorAdmin';

/** How many events Recent activity lists. */
export const EVENTS_SHOWN = 50;

const configRef = () => doc(db, 'doorConfig', 'main');

/** doorConfig/main, normalized (missing is Off). */
export async function fetchDoorConfig() {
  try {
    const snap = await getDoc(configRef());
    return normalizeConfig(snap.exists() ? snap.data() : null);
  } catch (err) {
    throw wrap(err, 'fetchDoorConfig');
  }
}

/** Merges configPatch's fields into doorConfig/main with the server's time and the signed-in uid. */
export async function saveDoorConfig(fields) {
  const { uid } = requireUser();
  try {
    await setDoc(configRef(), { ...fields, updatedAt: serverTimestamp(), updatedByUid: uid }, { merge: true });
  } catch (err) {
    throw wrap(err, 'saveDoorConfig');
  }
  return uid;
}

/** Every doorPauses doc: `{ householdId, pausedAt, pausedByUid, note? }`. */
export async function fetchDoorPauses() {
  try {
    const snap = await getDocs(collection(db, 'doorPauses'));
    return snap.docs.map((d) => ({ ...d.data(), householdId: d.data().householdId ?? d.id }));
  } catch (err) {
    throw wrap(err, 'fetchDoorPauses');
  }
}

/** Pauses door unlocking for one household (create only: the rules allow no update). */
export async function pauseDoorHousehold(householdId) {
  const { uid } = requireUser();
  try {
    await setDoc(doc(db, 'doorPauses', householdId), { householdId, pausedAt: serverTimestamp(), pausedByUid: uid });
  } catch (err) {
    throw wrap(err, 'pauseDoorHousehold');
  }
  return uid;
}

export async function unpauseDoorHousehold(householdId) {
  requireUser();
  try {
    await deleteDoc(doc(db, 'doorPauses', householdId));
  } catch (err) {
    throw wrap(err, 'unpauseDoorHousehold');
  }
}

/** The latest EVENTS_SHOWN doorEvents, newest first (atMs alone: the automatic index). */
export async function fetchDoorEvents() {
  try {
    const snap = await getDocs(query(collection(db, 'doorEvents'), orderBy('atMs', 'desc'), limit(EVENTS_SHOWN)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchDoorEvents');
  }
}

/**
 * `{ config, pauses, events, loading, error, eventsError, saveConfig(patch),
 * pause(householdId), unpause(householdId), refreshEvents(), reload() }`.
 * saveConfig shows the change at once, writes only the changed fields, and
 * reads the stored config back once no other save is in flight (a refused
 * write reads it back too). pause answers 'paused', or 'already' when its
 * write was refused because the family was paused meanwhile (the list is
 * read again). Activity loads on its own, so a failed list never blocks the
 * switch.
 */
export function useDoorAdmin() {
  const live = isLive();
  const [config, setConfig] = useState(() => (live ? null : normalizeConfig(null)));
  const [pauses, setPauses] = useState(() => (live ? null : []));
  const [events, setEvents] = useState(() => (live ? null : []));
  const [loading, setLoading] = useState(live);
  const [error, setError] = useState(null);
  const [eventsError, setEventsError] = useState(null);
  const latest = useRef(config);
  const inflight = useRef(0);
  const mounted = useRef(true);
  const [gen, setGen] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** The stored config on screen, unless a save is still on its way. */
  const readBack = useCallback(async () => {
    const truth = await fetchDoorConfig().catch(() => null);
    if (!truth || !mounted.current || inflight.current > 0) return;
    latest.current = truth;
    setConfig(truth);
  }, []);

  useEffect(() => {
    if (!live || typeof document === 'undefined') return undefined;
    const onShow = () => {
      if (document.visibilityState !== 'visible' || !latest.current) return;
      readBack();
      fetchDoorPauses().then((p) => { if (mounted.current) setPauses(p); }, () => {});
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [live, readBack]);

  const refreshEvents = useCallback(async () => {
    if (!live) return;
    try {
      const rows = await fetchDoorEvents();
      setEvents(rows);
      setEventsError(null);
    } catch (err) {
      setEventsError(err);
    }
  }, [live]);

  useEffect(() => {
    if (!live) return undefined;
    let current = true;
    setLoading(true);
    setError(null);
    Promise.all([fetchDoorConfig(), fetchDoorPauses()]).then(
      ([c, p]) => {
        if (!current) return;
        latest.current = c;
        setConfig(c);
        setPauses(p);
        setLoading(false);
      },
      (err) => {
        if (!current) return;
        setError(err);
        setLoading(false);
      }
    );
    refreshEvents();
    return () => { current = false; };
  }, [live, gen, refreshEvents]);

  const saveConfig = useCallback(async (patch) => {
    const before = latest.current;
    // Not loaded yet: a write now would put the defaults over the stored config.
    if (!before) throw new Error('The door settings have not loaded yet.');
    const fields = configPatch(before, patch);
    const optimistic = { ...normalizeConfig(configWrite(before, patch)), updatedAtMs: before?.updatedAtMs ?? null, updatedByUid: before?.updatedByUid ?? null };
    latest.current = optimistic;
    setConfig(optimistic);
    if (!live) return optimistic;
    inflight.current += 1;
    let uid;
    try {
      uid = await saveDoorConfig(fields);
    } catch (err) {
      inflight.current -= 1;
      const truth = await fetchDoorConfig().catch(() => before);
      latest.current = truth;
      setConfig(truth);
      throw err;
    }
    inflight.current -= 1;
    const saved = { ...latest.current, updatedAtMs: Date.now(), updatedByUid: uid };
    latest.current = saved;
    setConfig(saved);
    // What is stored now, another staff member's change included.
    if (inflight.current === 0) await readBack();
    return latest.current;
  }, [live, readBack]);

  const pause = useCallback(async (householdId) => {
    let uid = 'seed';
    if (live) {
      try {
        uid = await pauseDoorHousehold(householdId);
      } catch (err) {
        const fresh = await fetchDoorPauses().catch(() => null);
        if (fresh && mounted.current) setPauses(fresh);
        if (fresh && fresh.some((p) => p.householdId === householdId)) return 'already';
        throw err;
      }
    }
    setPauses((list) => [...(list || []).filter((p) => p.householdId !== householdId), { householdId, pausedAt: Date.now(), pausedByUid: uid }]);
    return 'paused';
  }, [live]);

  const unpause = useCallback(async (householdId) => {
    if (live) await unpauseDoorHousehold(householdId);
    setPauses((list) => (list || []).filter((p) => p.householdId !== householdId));
  }, [live]);

  const reload = useCallback(() => setGen((g) => g + 1), []);

  return { config, pauses, events, loading, error, eventsError, saveConfig, pause, unpause, refreshEvents, reload };
}
