/**
 * Firestore reads and writes of athletes/{athleteId}/milestones/parallaxIntake
 * (docs/portal/plans/2026-11-11-parallax-combine/00-spec.md 3): one fixed doc
 * per athlete, so "once" is the rules' create-only. Imports shared primitives
 * FROM ./live, never the other way (the mentalConsentLive.js precedent).
 *
 * A tick is a plain setDoc of the four keys data/combine.js intakeDoc builds.
 * When another coach ticked first, the rules see the second write as an
 * update and refuse it: the refusal is re-read, and a tick that is there
 * answers `{ status: 'already', milestone }` (Review Focus 4), so the screen
 * shows the earlier tick instead of an error. Every write bumps INTAKE_KEY.
 */
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, requireUser, wrap } from './live';
import { bump } from './invalidate';
import { INTAKE_DOC_ID } from '../data/combine';

export const INTAKE_KEY = 'milestones';

const intakeRef = (athleteId) => doc(db, 'athletes', athleteId, INTAKE_KEY, INTAKE_DOC_ID);

function requireAthlete(athleteId, context) {
  if (!athleteId) throw new LiveDataError(ERR.INVALID, `${context}: athleteId is required.`);
}

/** The write stamp: the server's time, which the rules pin `at` to. */
export function intakeStamp() {
  return serverTimestamp();
}

/** One athlete's tick as stored ({ athleteId, at, by, byName }), or null. */
export async function fetchIntake(athleteId) {
  requireAthlete(athleteId, 'fetchIntake');
  try {
    const snap = await getDoc(intakeRef(athleteId));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    throw wrap(err, 'fetchIntake');
  }
}

/** Tick: `{ status: 'done' }`, or `{ status: 'already', milestone }` when someone ticked first. */
export async function createIntake(athleteId, body) {
  requireAthlete(athleteId, 'createIntake');
  requireUser();
  try {
    await setDoc(intakeRef(athleteId), body);
  } catch (err) {
    const wrapped = wrap(err, 'createIntake');
    if (wrapped.code === ERR.PERMISSION) {
      const milestone = await fetchIntake(athleteId).catch(() => null);
      if (milestone) {
        bump(INTAKE_KEY);
        return { status: 'already', milestone };
      }
    }
    throw wrapped;
  }
  bump(INTAKE_KEY);
  return { status: 'done' };
}

/** Undo (the ticker inside ten minutes) or the owner's clear; the rules decide which may. */
export async function deleteIntake(athleteId) {
  requireAthlete(athleteId, 'deleteIntake');
  requireUser();
  try {
    await deleteDoc(intakeRef(athleteId));
  } catch (err) {
    throw wrap(err, 'deleteIntake');
  }
  bump(INTAKE_KEY);
}
