/**
 * Mental consent fixtures (docs/portal/plans/2026-10-30-mental-consent,
 * plan Task 18): what the emulator seed (scripts/seed-firestore.mjs) writes
 * for mentalConsents/{athleteId}, the 18+ fixture athlete and the switch.
 * Pure and dependency-free: timestamps are Dates relative to `now` (the
 * seed's fsValue encodes them), shapes are the plan's Global Constraints
 * (the 14 record fields), so every record is one the rules would have
 * accepted from the portal. Invented demo families only; the one phone is
 * the literal 'test-phone'.
 *
 *   jordan       - a minor portal record signed by parent-dana 9 days back,
 *                  assent typed by Jordan (recording yes), location B, no
 *                  driving, emergency contact "same as parent"; Yannick
 *                  countersigned the next day.
 *   quinn-parker - a new 18+ Parker sibling (sage-parker's bracket and
 *                  assessment fixtures do not move): section 11 signed by
 *                  hand-the-phone on parent-sam 3 days back, recording yes,
 *                  location C, parent sessions yes; not countersigned yet.
 *   reese, nico  - no record (reese has the Calendly 1:1 already seeded).
 *   config/mentalConsent - notices off.
 */
export const CONSENT_VERSION = '2026-10-30';

const DAY_MS = 86400000;
const SAME_AS_PARENT = { name: null, phone: null, relationship: null };

export function consentFixtures({ now = new Date() } = {}) {
  const daysBack = (n) => new Date(now.getTime() - n * DAY_MS);
  const jordanSignedAt = daysBack(9);
  const quinnSignedAt = daysBack(3);

  const athletes = new Map([
    ['quinn-parker', {
      name: 'Quinn Parker',
      dob: '2006-08-20',
      householdId: 'parker',
      packageId: 'elite',
      contractMinutes: null,
      coachId: null,
    }],
  ]);

  const jordan = {
    athleteId: 'jordan',
    householdId: 'whitfield',
    version: CONSENT_VERSION,
    method: 'portal',
    signedAt: jordanSignedAt,
    signedBy: 'parent-dana',
    signer: { role: 'parent', name: 'Dana Whitfield' },
    adult: false,
    assent: { name: 'Jordan', audio: true, at: jordanSignedAt, readAloud: false, withdrawnBy: null },
    choices: {
      location: 'B',
      audio: true,
      driving: false,
      emergencyContact: { ...SAME_AS_PARENT },
      parentSessions: null,
      parentName: null,
      updatedAt: jordanSignedAt,
      updatedBy: 'parent-dana',
    },
    adultConfirm: null,
    adultSignature: null,
    countersign: { at: new Date(jordanSignedAt.getTime() + DAY_MS), by: 'mental' },
    history: [],
  };

  const quinn = {
    athleteId: 'quinn-parker',
    householdId: 'parker',
    version: CONSENT_VERSION,
    method: 'portal',
    signedAt: quinnSignedAt,
    signedBy: 'parent-sam',
    signer: { role: 'athlete', name: 'Quinn Parker' },
    adult: true,
    assent: null,
    choices: {
      location: 'C',
      audio: true,
      driving: null,
      emergencyContact: { name: 'Sam Parker', phone: 'test-phone', relationship: 'parent' },
      parentSessions: true,
      parentName: 'Sam Parker',
      updatedAt: quinnSignedAt,
      updatedBy: 'parent-sam',
    },
    adultConfirm: null,
    adultSignature: null,
    countersign: null,
    history: [],
  };

  return {
    athletes,
    mentalConsents: new Map([['jordan', jordan], ['quinn-parker', quinn]]),
    config: ['mentalConsent', { notices: false, enabledAt: null }],
  };
}
