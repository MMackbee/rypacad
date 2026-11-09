/**
 * Yannick's private notes (spec 4.1): ids, kinds, per-athlete summary and
 * grouping, and the Athletes list rows. PURE. The documents themselves are
 * readable by role 'mental' only (firestore.rules mentalNotes).
 */
import { ageOn } from './contractRule';
import { dateOf } from './contractBoard';
import { consentStatusFor } from './mentalConsent';

export const NOTE_MAX = 8000;
export const NOTE_KINDS = ['intake', 'session', 'free'];

export function noteEntryId({ kind, sessionId, random }) {
  if (kind === 'intake') return 'intake';
  if (kind === 'free') return `free-${random}`;
  return sessionId;
}

export function kindOf(entryId) {
  if (entryId === 'intake') return 'intake';
  if (typeof entryId === 'string' && entryId.startsWith('free-')) return 'free';
  return 'session';
}

export function athleteNoteSummary(entries) {
  const list = entries || [];
  const latest = list.reduce((m, e) => (e.updatedAtMs > m ? e.updatedAtMs : m), 0);
  return { hasIntake: list.some((e) => e.id === 'intake'), latestNoteDate: latest ? dateOf(new Date(latest)) : null };
}

export function groupEntries(entries) {
  const list = entries || [];
  const newest = (a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
  return {
    intake: list.find((e) => e.id === 'intake') || null,
    sessions: list.filter((e) => kindOf(e.id) === 'session').sort((a, b) => String(b.sessionDate || '').localeCompare(String(a.sessionDate || '')) || newest(a, b)),
    free: list.filter((e) => kindOf(e.id) === 'free').sort(newest),
  };
}

/**
 * The Athletes list rows, A to Z. `households` (an array or an id -> doc
 * map, optional) gives each row its `familyName`, which the screen shows
 * beside a first-name-only athlete (data/athleteLabel.js). `records` (the
 * mentalConsents by athlete id) gives each row its `consentStatus` on the
 * UTC date `utcToday` and `needsConsent` (not signed, with a 1:1 ahead);
 * `records === null` (the read failed) leaves both off. Consent starts from
 * bookings only, so a held Calendly session never asks for it.
 */
export function mentalAthleteRows({ athletes, households, bookings, entries, today, records = {}, utcToday = today }) {
  const live = (bookings || []).filter((b) => b.type === 'mental' && b.status !== 'cancelled');
  const byHousehold = Array.isArray(households) ? Object.fromEntries(households.map((h) => [h.id, h])) : households || {};
  return (athletes || [])
    .map((a) => {
      const mine = live.filter((b) => b.athleteId === a.id).map((b) => b.date).filter(Boolean).sort();
      const summary = athleteNoteSummary((entries || []).filter((e) => e.athleteId === a.id));
      const nextSession = mine.find((d) => d >= today) || null;
      const consentStatus = records === null ? null : consentStatusFor(a, records[a.id] ?? null, utcToday);
      return {
        athleteId: a.id, name: a.name, age: ageOn(a.dob ?? null, today),
        familyName: byHousehold[a.householdId]?.name ?? null,
        nextSession,
        lastSession: mine.filter((d) => d < today).pop() || null,
        ...summary,
        consentStatus,
        needsConsent: consentStatus != null && consentStatus !== 'signed' && nextSession != null,
      };
    })
    .sort((x, y) => String(x.name || '').localeCompare(String(y.name || '')));
}
