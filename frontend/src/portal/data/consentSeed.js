/**
 * Mental consent seed records (seed mode and the review harness, spec 8):
 * Jordan signed by Dana nine days back (assent yes, Eden Prairie, driving
 * no, emergency contact same as parent) and countersigned by Yannick the
 * next day; Quinn's section 11 signed on Quinn's own login; Reese and Nico
 * unsigned. Dates hang off the academy's today at fixed hours, so a seed
 * value is the same on every render of a day. Pure data.
 */
import { CONSENT_VERSION, paperDateToStamp } from './mentalConsent';
import { academyDateISO } from './calendar';
import { addDays } from './contractRule';
import { mentalFixtures } from './seed';

const at = (iso, hourUTC) => new Date(`${iso}T${String(hourUTC).padStart(2, '0')}:00:00Z`);
const SAME_AS_PARENT = { name: null, phone: null, relationship: null };

/** `{ jordan, quinn }`, each `{ id, ...record }` as a live read returns it. */
export function consentSeedRecords() {
  const today = academyDateISO();
  const jordanAt = at(addDays(today, -9), 17);
  const quinnAt = at(addDays(today, -5), 23);
  return {
    jordan: {
      id: 'jordan', athleteId: 'jordan', householdId: 'whitfield', version: CONSENT_VERSION, method: 'portal', signedAt: jordanAt, signedBy: 'u-dana',
      signer: { role: 'parent', name: 'Dana Whitfield' }, adult: false,
      assent: { name: 'Jordan', audio: true, at: jordanAt, readAloud: false, withdrawnBy: null },
      choices: { location: 'B', audio: true, driving: false, emergencyContact: SAME_AS_PARENT, parentSessions: null, parentName: null, updatedAt: jordanAt, updatedBy: 'u-dana' },
      adultConfirm: null, adultSignature: null, countersign: { at: at(addDays(today, -8), 15), by: 'mental' }, history: [],
    },
    quinn: {
      id: 'quinn', athleteId: 'quinn', householdId: 'parker', version: CONSENT_VERSION, method: 'portal', signedAt: quinnAt, signedBy: 'athlete-quinn',
      signer: { role: 'athlete', name: 'Quinn Parker' }, adult: true, assent: null,
      choices: {
        location: 'C', audio: true, driving: null, emergencyContact: { name: 'Sam Parker', phone: 'test-phone', relationship: 'parent' },
        parentSessions: false, parentName: null, updatedAt: quinnAt, updatedBy: 'athlete-quinn',
      },
      adultConfirm: null, adultSignature: null, countersign: null, history: [],
    },
  };
}

/** Harness only: a paper minor record for one fixture athlete, dated 8 days back, typed in 6 days back; location not transcribed, recording no. */
export function consentSeedPaperRecord(athleteId) {
  const today = academyDateISO();
  const athlete = mentalFixtures(today).athletes.find((a) => a.id === athleteId) || { id: athleteId, name: athleteId, householdId: null };
  const signedAt = paperDateToStamp(addDays(today, -8));
  const typedAt = at(addDays(today, -6), 15);
  return {
    id: athleteId, athleteId, householdId: athlete.householdId, version: CONSENT_VERSION, method: 'paper', signedAt, signedBy: 'u-ops',
    signer: { role: 'parent', name: 'Dana Whitfield' }, adult: false,
    assent: { name: String(athlete.name).split(' ')[0], audio: false, at: signedAt, readAloud: false, withdrawnBy: null },
    choices: { location: null, audio: false, driving: null, emergencyContact: SAME_AS_PARENT, parentSessions: null, parentName: null, updatedAt: typedAt, updatedBy: 'u-ops' },
    adultConfirm: null, adultSignature: null, countersign: null, history: [],
  };
}
