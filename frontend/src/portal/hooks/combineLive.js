/**
 * Firestore reads and writes of athletes/{athleteId}/combineScores/{autoId}
 * (docs/portal/plans/2026-11-11-parallax-combine spec 4). Imports shared
 * primitives FROM ./live, never the other way (the mentalConsentLive.js
 * precedent).
 *
 * Reads are one unfiltered getDocs per athlete: no query, no index; the
 * hooks sort on the client (data/combine.js sortScores). Writes are a create
 * (auto id, the seven keys data/combine.js combineScoreDoc builds) and a
 * delete; nobody updates a score. Every write bumps COMBINE_KEY.
 */
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, requireUser, wrap } from './live';
import { bump } from './invalidate';

export const COMBINE_KEY = 'combineScores';
const SUB = 'combineScores';

const scoresOf = (athleteId) => collection(db, 'athletes', athleteId, SUB);
const need = (value, what, context) => {
  if (!value) throw new LiveDataError(ERR.INVALID, `${context}: ${what} is required.`);
};

/** The write stamp: the server's time, which the rules pin createdAt to. */
export function combineStamp() {
  return serverTimestamp();
}

/** Every score of one athlete, as stored (`{ id, ...data }`), in no particular order. */
export async function fetchCombineScores(athleteId) {
  need(athleteId, 'athleteId', 'fetchCombineScores');
  try {
    const snap = await getDocs(scoresOf(athleteId));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchCombineScores');
  }
}

/** One new score (an auto id, so two entries the same day are both kept). Resolves the new id. */
export async function createCombineScore(athleteId, body) {
  need(athleteId, 'athleteId', 'createCombineScore');
  requireUser();
  let ref;
  try {
    ref = await addDoc(scoresOf(athleteId), body);
  } catch (err) {
    throw wrap(err, 'createCombineScore');
  }
  bump(COMBINE_KEY);
  return ref.id;
}

/** Deletes one score: whoever entered it, or the owner (the rules decide). */
export async function deleteCombineScore(athleteId, scoreId) {
  need(athleteId, 'athleteId', 'deleteCombineScore');
  need(scoreId, 'scoreId', 'deleteCombineScore');
  requireUser();
  try {
    await deleteDoc(doc(db, 'athletes', athleteId, SUB, scoreId));
  } catch (err) {
    throw wrap(err, 'deleteCombineScore');
  }
  bump(COMBINE_KEY);
}
