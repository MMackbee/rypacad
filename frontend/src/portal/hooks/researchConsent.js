/**
 * Research consent (assessments spec 4.3, 7): the one-time confirm for
 * families whose athletes have no research answer recorded, and the
 * owner's recorded change. New module, the scholarships.js precedent:
 * primitives come from ./live, never the other way. The writes are the
 * contract with firestore.rules' research branch on athletes/{id}
 * (scripts/rules-probes/research.mjs): consents.research only.
 */
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, fetchAthlete, fetchHousehold, fetchHouseholdAthletes, isLive, requireUser, wrap } from './live';
import { bump, useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { ASSESSMENTS_KEY } from './assessmentsLive';
import { isAdultOnDate } from '../data/signup';

export const RESEARCH_KEY = 'research';

const unanswered = (a) => Boolean(a) && (a.consents?.research ?? null) == null;
const invalid = (message) => new LiveDataError(ERR.INVALID, message);
const okAnswer = (answer) => Boolean(answer) && typeof answer.value === 'boolean' && (answer.assent == null || typeof answer.assent === 'boolean');

/**
 * Whose answer the signed-in user owes: a parent, every household athlete
 * with none recorded; an athlete login, their own record - only the 18+
 * member who created their own household (a child's login never answers).
 */
export function pendingResearch({ user, athletes, household, todayISO }) {
  if (!user) return [];
  const list = (athletes || []).filter(unanswered);
  if (user.role === 'parent') return list.map((a) => ({ id: a.id, name: a.name ?? '', self: false, minor: !isAdultOnDate(a.dob, todayISO) }));
  if (user.role === 'athlete' && household?.createdBy === user.uid) {
    return list.filter((a) => a.id === user.athleteId).map((a) => ({ id: a.id, name: a.name ?? '', self: true, minor: false }));
  }
  return [];
}

/** The family's answer: consents.research, dated by the server, signed by the caller. */
export async function saveResearchConsent({ athleteId, answer }) {
  if (!athleteId || !okAnswer(answer)) throw invalid('saveResearchConsent: an athlete and a yes or no.');
  if (!isLive()) return { athleteId, simulated: true };
  const user = requireUser();
  try {
    await updateDoc(doc(db, 'athletes', athleteId), {
      'consents.research': { value: answer.value, assent: answer.assent ?? null, recordedAt: serverTimestamp(), recordedBy: user.uid },
    });
  } catch (err) {
    throw wrap(err, 'saveResearchConsent');
  }
  bump(RESEARCH_KEY);
  return { athleteId };
}

/** The owner records a change the family asked for; the answer it replaces moves onto the history. */
export async function recordResearchChange({ athleteId, answer, current }) {
  if (!athleteId || !okAnswer(answer)) throw invalid('recordResearchChange: an athlete and a yes or no.');
  if (!isLive()) return { athleteId, simulated: true };
  const user = requireUser();
  const history = current
    ? [...(Array.isArray(current.history) ? current.history : []),
      { value: current.value ?? null, assent: current.assent ?? null, recordedAt: current.recordedAt ?? null, recordedBy: current.recordedBy ?? null }]
    : [];
  try {
    await updateDoc(doc(db, 'athletes', athleteId), {
      'consents.research': { value: answer.value, assent: answer.assent ?? null, recordedAt: serverTimestamp(), recordedBy: user.uid, history },
    });
  } catch (err) {
    throw wrap(err, 'recordResearchChange');
  }
  bump(RESEARCH_KEY);
  bump(ASSESSMENTS_KEY);
  return { athleteId };
}

/** The one-time confirm's list for the signed-in family; seed mode and staff owe nothing. */
export function useResearchConfirm(user) {
  const live = isLive() && Boolean(user) && (user.role === 'parent' || user.role === 'athlete');
  const gen = useInvalidation(RESEARCH_KEY);
  return useSeedResource(
    live ? null : { pending: [] },
    live
      ? {
          source: async () => {
            // firestore.rules adultRecord() counts 18 on the UTC date (timestamp.date): who is a minor here must use the same date.
            const todayISO = new Date().toISOString().slice(0, 10);
            if (user.role === 'parent') return { pending: pendingResearch({ user, athletes: await fetchHouseholdAthletes(user.householdId), household: null, todayISO }) };
            const [athlete, household] = await Promise.all([fetchAthlete(user.athleteId), fetchHousehold(user.householdId)]);
            return { pending: pendingResearch({ user, athletes: [athlete], household, todayISO }) };
          },
          deps: ['research-confirm', user?.uid, gen],
        }
      : undefined
  );
}
