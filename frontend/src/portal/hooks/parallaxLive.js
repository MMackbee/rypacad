/**
 * Firestore reads and writes of athletes/{athleteId}/milestones/parallaxIntake
 * (docs/portal/plans/2026-11-11-parallax-combine/00-spec.md 3): one fixed doc
 * per athlete, so "once" is the rules' create-only. Imports shared primitives
 * FROM ./live, never the other way (the mentalConsentLive.js precedent).
 *
 * The same three calls serve the fitness assessment mark (hq card 14): an
 * optional doc id, default parallaxIntake, so every existing caller is unchanged.
 *
 * A tick is a plain setDoc of the four keys data/combine.js intakeDoc builds,
 * then a server-only read-back of the stored mark (getDocFromServer): the stored
 * mark (shown with the server's time), `milestone: null` when the server says the
 * document is gone (shown as not done), or no `milestone` key when the read-back
 * fails (the device-stamped mark shows, and its undo is verified against the server
 * first). A read-back that fails never turns the saved tick into an error.
 * When another coach ticked first, the rules see the second write as an
 * update and refuse it: the refusal is re-read, and a tick that is there
 * answers `{ status: 'already', milestone }` (Review Focus 4), so the screen
 * shows the earlier tick instead of an error. Every write bumps INTAKE_KEY.
 *
 * An undo or clear deletes only the mark the screen showed (hq card 14, round 6):
 * deleteIntake takes that mark as `expected` and checks it against the stored
 * one inside a transaction, on author and server time, so a tap never erases a
 * replacement it did not see. A mark with only the device's time (just ticked here,
 * no read-back) is never deleted on the author alone: it is read from the server
 * first, and what is stored comes back as a changed mark to be shown.
 */
import { doc, getDoc, getDocFromServer, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, requireUser, wrap } from './live';
import { bump } from './invalidate';
import { INTAKE_DOC_ID, MARK_CHANGED } from '../data/combine';

export const INTAKE_KEY = 'milestones';
/** `reason` of the error deleteIntake throws when the stored mark is not the one shown; `stored` carries it (defined in data/combine.js). */
export { MARK_CHANGED };

/** Marks a screen stamped with its own clock (a tick it just wrote): their `at` is not the server's. */
const deviceMarks = new WeakSet();
export function deviceStamped(milestone) {
  deviceMarks.add(milestone);
  return milestone;
}

/**
 * What an undo or clear expects to find stored, from the mark the screen shows
 * (null: it shows none). A mark that came from a read is matched on author and
 * server time; one this screen just ticked carries the device's time, so only
 * its author is matched.
 */
export function expectedMark(milestone) {
  if (!milestone) return null;
  return deviceMarks.has(milestone)
    ? { by: milestone.by, fromServer: false }
    : { by: milestone.by, at: milestone.at, fromServer: true };
}

const millis = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : t instanceof Date ? t.getTime() : NaN);
function isShownMark(stored, expected) {
  return Boolean(expected && expected.fromServer) && stored.by === expected.by && millis(stored.at) === millis(expected.at);
}

function changedMark(stored) {
  const err = new LiveDataError(ERR.UNKNOWN, 'deleteIntake: the mark has changed since it was shown.', null, MARK_CHANGED);
  err.stored = stored;
  return err;
}

const intakeRef = (athleteId, docId) => doc(db, 'athletes', athleteId, INTAKE_KEY, docId);

function requireAthlete(athleteId, context) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, `${context}: athleteId is required.`);
}

/** The write stamp: the server's time, which the rules pin `at` to. */
export function intakeStamp() {
  return serverTimestamp();
}

/** One athlete's tick as stored ({ athleteId, at, by, byName }), or null. */
export async function fetchIntake(athleteId, docId = INTAKE_DOC_ID) {
  requireAthlete(athleteId, 'fetchIntake');
  try {
    const snap = await getDoc(intakeRef(athleteId, docId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    throw wrap(err, 'fetchIntake');
  }
}

/** Tick: `{ status: 'done', milestone? }` (milestone: the stored mark, null when the server says it is gone, absent when the read-back failed), or `{ status: 'already', milestone }` when someone ticked first. */
export async function createIntake(athleteId, body, docId = INTAKE_DOC_ID) {
  requireAthlete(athleteId, 'createIntake');
  requireUser();
  try {
    await setDoc(intakeRef(athleteId, docId), body);
  } catch (err) {
    const wrapped = wrap(err, 'createIntake');
    if (wrapped.code === ERR.PERMISSION) {
      const milestone = await fetchIntake(athleteId, docId).catch(() => null);
      if (milestone) {
        bump(INTAKE_KEY);
        return { status: 'already', milestone };
      }
    }
    throw wrapped;
  }
  bump(INTAKE_KEY);
  try {
    const snap = await getDocFromServer(intakeRef(athleteId, docId));
    return { status: 'done', milestone: snap.exists() ? snap.data() : null };
  } catch (err) {
    // The tick is saved; without the read-back the screen dates it by the device clock.
  }
  return { status: 'done' };
}

/**
 * Undo (the ticker inside ten minutes) or the owner's clear; the rules decide which may.
 * `expected` is expectedMark(the mark on screen), or null when the screen shows none;
 * leaving it out is refused. The mark is deleted only when the stored one is it. Gone
 * already: nothing to do. A different mark: nothing is deleted, and the error
 * (reason MARK_CHANGED, code not a permission refusal) carries it as `stored`.
 */
export async function deleteIntake(athleteId, docId = INTAKE_DOC_ID, expected) {
  requireAthlete(athleteId, 'deleteIntake');
  requireUser();
  if (expected === undefined) throw new LiveDataError(ERR.INVALID, 'deleteIntake: the mark on screen is required.');
  if (expected && expected.fromServer === false) {
    // The screen holds a mark with the device's time only: never delete on the author alone.
    let snap;
    try {
      snap = await getDocFromServer(intakeRef(athleteId, docId));
    } catch (err) {
      throw wrap(err, 'deleteIntake');
    }
    if (snap.exists()) throw changedMark(snap.data());
    bump(INTAKE_KEY);
    return;
  }
  let stored;
  try {
    const ref = intakeRef(athleteId, docId);
    stored = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const found = snap.exists() ? snap.data() : null;
      if (found && isShownMark(found, expected)) tx.delete(ref);
      return found && !isShownMark(found, expected) ? { changed: found } : {};
    });
  } catch (err) {
    throw wrap(err, 'deleteIntake');
  }
  if (stored.changed) throw changedMark(stored.changed);
  bump(INTAKE_KEY);
}
