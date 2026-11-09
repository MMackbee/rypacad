/**
 * Mental consent hooks for ops and the owner (spec 5): one athlete's status
 * line with the paper signature actions, and the Admin tracker. The rules
 * let only ops and the owner create a paper record and only the owner
 * correct one; the screens hide what a role cannot do. Seed mode shares
 * hooks/mentalConsent.js's store, so a harness write shows everywhere.
 */
import { useCallback } from 'react';
import { ERR, fetchAllAthletes, fetchAllHouseholds, fetchAthlete, isLive, requireUser } from './live';
import { useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { fetchAllMentalBookings } from './mentalLive';
import { MENTAL_CONSENT_KEY, consentStamp, createConsent, fetchAllConsents, fetchConsent, updateConsent } from './mentalConsentLive';
import { seedConsentCreate, seedConsentRecordMap, seedConsentUpdate } from './mentalConsent';
import { mentalFixtures } from '../data/seed';
import { academyDateISO } from '../data/calendar';
import { isAdultRecord, staffConsentSummary, trackerRows, utcTodayISO } from '../data/mentalConsent';
import { adultResign, paperCorrection, paperRecord } from '../data/mentalConsentWrites';

/* ---------------------------------------------------- one athlete -- */

function seedStaffConsent(athleteId, utcToday) {
  const athlete = mentalFixtures(academyDateISO()).athletes.find((a) => a.id === athleteId);
  if (!athlete) return null;
  const record = seedConsentRecordMap()[athleteId] ?? null;
  return { athlete, record, summary: staffConsentSummary({ athlete, record, utcToday }) };
}

async function liveStaffConsent(athleteId, utcToday) {
  const [athlete, record] = await Promise.all([
    fetchAthlete(athleteId).catch((err) => {
      if (err && err.code === ERR.NOT_FOUND) return null;
      throw err;
    }),
    fetchConsent(athleteId),
  ]);
  if (!athlete) return null;
  return { athlete, record, summary: staffConsentSummary({ athlete, record, utcToday }) };
}

/**
 * `{ data: { athlete, record, summary } | null, loading, error,
 * recordPaper(input), correctPaper(input) }` for ops and the owner.
 * `input = { signedAt: Date (paperDateToStamp of the form's date), section:
 * '10' | '11', version, signerName, assentName, assentAudio, choices }`.
 * recordPaper creates the paper record, or - a minor-era record of an
 * athlete now 18 and section '11' - records the paper re-sign;
 * correctPaper is the owner's correction of a paper record.
 */
export function useStaffConsent(athleteId) {
  const live = isLive();
  const utcToday = utcTodayISO(new Date());
  const consentsGen = useInvalidation(MENTAL_CONSENT_KEY);
  const state = useSeedResource(
    live ? null : seedStaffConsent(athleteId, utcToday),
    live ? { source: () => liveStaffConsent(athleteId, utcToday), deps: ['staff-consent', athleteId, consentsGen] } : undefined
  );
  const data = state.data;

  const recordPaper = useCallback(async (input) => {
    if (!data) throw new Error('useStaffConsent: nothing is loaded yet.');
    const uid = live ? requireUser().uid : 'u-ops';
    const stamp = live ? consentStamp() : new Date();
    const adult = input.section === '11';
    if (data.record && !isAdultRecord(data.record) && adult) {
      const build = (current) => adultResign({ current, uid, name: input.signerName, choices: input.choices, stamp, paperSignedAt: input.signedAt, version: input.version });
      if (live) await updateConsent({ athleteId, build });
      else seedConsentUpdate(athleteId, build);
      return { status: 'signed' };
    }
    const doc = paperRecord({
      athleteId, householdId: data.athlete.householdId ?? null, uid, signedAt: input.signedAt, adult, signerName: input.signerName, version: input.version,
      choices: input.choices, assent: adult ? null : { name: input.assentName, audio: input.assentAudio === true }, stamp,
    });
    return live ? createConsent({ athleteId, doc, reread: () => fetchConsent(athleteId) }) : seedConsentCreate(athleteId, doc);
  }, [data, live, athleteId]);

  const correctPaper = useCallback(async (input) => {
    if (!data) throw new Error('useStaffConsent: nothing is loaded yet.');
    const uid = live ? requireUser().uid : 'u-owner';
    const stamp = live ? consentStamp() : new Date();
    const build = (current) => paperCorrection({
      current, uid, signedAt: input.signedAt, version: input.version, adult: input.section ? input.section === '11' : undefined,
      signerName: input.signerName, choices: input.choices, assent: { name: input.assentName, audio: input.assentAudio }, stamp,
    });
    if (live) await updateConsent({ athleteId, build });
    else seedConsentUpdate(athleteId, build);
  }, [data, live, athleteId]);

  return { ...state, recordPaper, correctPaper };
}

/* ----------------------------------------------------- the tracker -- */

async function liveTracker(today, utcToday) {
  const [athletes, households, records, bookings] = await Promise.all([fetchAllAthletes(), fetchAllHouseholds(), fetchAllConsents(), fetchAllMentalBookings()]);
  return trackerRows({ athletes, households, records, bookings, today, utcToday });
}

/** `{ data: TrackerRow[] | null, loading, error }`: every athlete with a mental booking (data/mentalConsent.js trackerRows). */
export function useConsentTracker() {
  const live = isLive();
  const now = new Date();
  const today = academyDateISO(now);
  const utcToday = utcTodayISO(now);
  const consentsGen = useInvalidation(MENTAL_CONSENT_KEY);
  const bookingsGen = useInvalidation('bookings');
  let seed = null;
  if (!live) {
    const f = mentalFixtures(today);
    seed = trackerRows({ athletes: f.athletes, households: f.households, records: seedConsentRecordMap(), bookings: f.bookings, today, utcToday });
  }
  return useSeedResource(
    seed,
    live ? { source: () => liveTracker(today, utcToday), deps: ['consent-tracker', today, consentsGen, bookingsGen] } : undefined
  );
}
