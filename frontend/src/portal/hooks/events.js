/**
 * The workshop card's Firestore half (hq card 5, 2026-11-19; shapes in
 * docs/portal/TEAM.md, "Academy events"). Reads once and re-reads on a tap or
 * when the page comes back into view - no listener, no polling:
 *
 *   mount     one query for events where enabled == true; only if at least one
 *             will show, one query for the caller's own sign-ups (uid ==); then
 *             one getDoc of eventLinks/{id} for each event the caller signed up
 *             for that has not ended (a refusal or a missing document is "no
 *             link", never an error);
 *   visible   the same again when the page becomes visible, at most once every
 *             30 seconds, and a failed re-read keeps what the card showed;
 *   timer     the card moves between its states at the start, the two-hours mark
 *             and the end with a timer and no network call;
 *   sign up   reads users/{uid} for displayName and the ID token's email claim,
 *             writes eventSignups/{eventId}_{uid} with exactly five fields, then
 *             reads the link; take-back deletes it and clears the link. A refused
 *             write is followed by one full re-read: when the account already is
 *             in the state it asked for (signed up or not, from another tab or
 *             device) that state shows and no error; otherwise the error line.
 *
 * The card fails closed: seed mode (isLive() false), the onboarding walkthrough
 * (`practice`), an unreadable event or a failed first read all show nothing and
 * no error. A failed write says so (per event) and leaves the card as it was.
 *
 * Never imports hooks/index.js or hooks/useAuthSession.js (the dashboard tests
 * mock both partially); new code stays out of the grandfathered live.js.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { isLive, requireUser } from './live';
import { WRITE_FAILED, eventView, nextChange, normalizeEvent, visibleEvents } from '../data/events';

/** A re-read on the page coming back into view waits at least this long after the last read. */
export const RECHECK_MIN_MS = 30000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const signupId = (eventId, uid) => `${eventId}_${uid}`;

/** The meetUrl of eventLinks/{id}, or null: no document, no field, or the rules said no. Never rejects. */
async function readLink(eventId) {
  try {
    const snap = await getDoc(doc(db, 'eventLinks', eventId));
    const url = snap.exists() ? snap.data().meetUrl : null;
    return typeof url === 'string' ? url : null;
  } catch (err) {
    return null;
  }
}

/** The whole read: `{ events, signed: {id: true}, links: {id: url|null} }`. Rejects when a query is refused. */
async function readAll(now) {
  const user = requireUser();
  const snap = await getDocs(query(collection(db, 'events'), where('enabled', '==', true)));
  const events = snap.docs.map((d) => normalizeEvent(d.id, d.data())).filter(Boolean);
  if (!visibleEvents(events, now).length) return { events: [], signed: {}, links: {} };
  const mine = await getDocs(query(collection(db, 'eventSignups'), where('uid', '==', user.uid)));
  const signed = {};
  mine.docs.forEach((d) => {
    const eventId = d.data().eventId;
    if (typeof eventId === 'string' && d.id === signupId(eventId, user.uid)) signed[eventId] = true;
  });
  const open = events.filter((e) => signed[e.id] && now < e.endsMs);
  const urls = await Promise.all(open.map((e) => readLink(e.id)));
  const links = {};
  open.forEach((e, i) => { links[e.id] = urls[i]; });
  return { events, signed, links };
}

/**
 * @param {{practice?: boolean}} [opts]
 * @returns {{cards: Array<{id: string, view: object, busy: ?string, error: ?string}>,
 *   signUp: (id: string) => Promise<void>, takeBack: (id: string) => Promise<void>, checkLink: (id: string) => Promise<void>}}
 */
export function useEvents({ practice = false } = {}) {
  // The practice check short-circuits before isLive() (the onboarding invariant, hooks/index.js header).
  const live = !practice && isLive();
  const [data, setData] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const mounted = useRef(true);
  const readSeq = useRef(0);
  const lastRead = useRef(0);
  const inFlight = useRef(new Set());

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const reread = useCallback(async () => {
    readSeq.current += 1;
    const seq = readSeq.current;
    lastRead.current = Date.now();
    try {
      const next = await readAll(Date.now());
      if (mounted.current && seq === readSeq.current) setData(next);
      return next;
    } catch (err) {
      // Fails closed: a first read that failed leaves nothing to show, a later one keeps what was shown.
      return null;
    }
  }, []);

  useEffect(() => {
    if (!live) return undefined;
    reread();
    if (typeof document === 'undefined') return undefined;
    const onShow = () => {
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now());
      if (Date.now() - lastRead.current >= RECHECK_MIN_MS) reread();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [live, reread]);

  // The state moves at the next boundary by timer, never by a network call.
  useEffect(() => {
    if (!data) return undefined;
    const marks = data.events.map((e) => nextChange(e, now, Boolean(data.signed[e.id]))).filter((m) => m !== null);
    if (!marks.length) return undefined;
    const delay = Math.max(0, Math.min(Math.min(...marks) - Date.now(), MAX_TIMEOUT_MS));
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [data, now]);

  // One write or read at a time per event; a second tap while it runs does nothing.
  const run = useCallback(async (id, kind, work) => {
    if (!live || inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setBusy((b) => ({ ...b, [id]: kind }));
    setErrors((e) => ({ ...e, [id]: null }));
    try {
      await work();
    } catch (err) {
      if (mounted.current) setErrors((e) => ({ ...e, [id]: WRITE_FAILED }));
    } finally {
      inFlight.current.delete(id);
      if (mounted.current) setBusy((b) => ({ ...b, [id]: null }));
    }
  }, [live]);

  const setSigned = useCallback((id, signed, url) => {
    // A read that started before this change must not undo it.
    readSeq.current += 1;
    if (!mounted.current) return;
    setData((d) => d && ({ ...d, signed: { ...d.signed, [id]: signed }, links: { ...d.links, [id]: url } }));
  }, []);

  // After a refused write: one full re-read. The account may already be in the state it asked for (the card was
  // behind the server); then that state shows and there is no error. Otherwise the original failure is thrown.
  const confirmState = useCallback(async (id, wantSigned, failure) => {
    const next = await reread();
    if (next && Boolean(next.signed[id]) === wantSigned) return;
    throw failure;
  }, [reread]);

  const signUp = useCallback((id) => run(id, 'signup', async () => {
    const user = requireUser();
    try {
      const [mine, token] = await Promise.all([getDoc(doc(db, 'users', user.uid)), user.getIdTokenResult()]);
      const displayName = mine.exists() ? mine.data().displayName : null;
      await setDoc(doc(db, 'eventSignups', signupId(id, user.uid)), {
        eventId: id,
        uid: user.uid,
        email: (token && token.claims && token.claims.email) || null,
        name: displayName === undefined ? null : displayName,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      await confirmState(id, true, err);
      return;
    }
    setSigned(id, true, await readLink(id));
  }), [run, setSigned, confirmState]);

  const takeBack = useCallback((id) => run(id, 'back', async () => {
    const user = requireUser();
    try {
      await deleteDoc(doc(db, 'eventSignups', signupId(id, user.uid)));
    } catch (err) {
      await confirmState(id, false, err);
      return;
    }
    setSigned(id, false, null);
  }), [run, setSigned, confirmState]);

  const checkLink = useCallback((id) => run(id, 'check', async () => {
    const url = await readLink(id);
    readSeq.current += 1;
    if (mounted.current) setData((d) => d && ({ ...d, links: { ...d.links, [id]: url } }));
  }), [run]);

  const cards = live && data
    ? visibleEvents(data.events, now)
      .map((e) => ({
        id: e.id,
        view: eventView(e, { signedUp: Boolean(data.signed[e.id]), meetUrl: data.links[e.id] ?? null, now }),
        busy: busy[e.id] || null,
        error: errors[e.id] || null,
      }))
      .filter((c) => c.view.show)
    : [];
  return { cards, signUp, takeBack, checkLink };
}
