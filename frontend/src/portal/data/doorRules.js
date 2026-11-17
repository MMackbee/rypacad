/**
 * The facility door button (docs/portal/plans/2026-11-17-door-button/00-spec.md
 * 7): the door rules' terms version, the academy's number, the plain copy a
 * family reads for every outcome and refusal of an unlock, and which check
 * answers show the card at all. The server (functions/portal/door-decide.js)
 * owns the decision; this file only says it in words.
 */
import { CONSENT_TERMS, consentWording } from './consentTerms';

/** Equal to the server's DOOR_TERMS_VERSION (doorRules.test.js reads door-decide.js and compares). */
export const DOOR_TERMS_VERSION = 'door-2026-11-17';

/** The website's number; every failure that needs a person gives it. */
export const ACADEMY_PHONE = '(612) 234-1644';

/** The line the door rules add to the facility rules (data/consentTerms.js, the end of "Who may enter"). */
export const DOOR_RULE_LINE =
  "Use the app's Unlock button only when you are at the door, and only to let in your own household. Never open the door for anyone else.";

/** Under the button before the first press, for a family login (staff unlock from anywhere). */
export const LOCATION_NOTE = "The app checks you're at the academy when you unlock.";

/**
 * Quiet, under an open door's countdown, once a hold would open the door
 * again (the server's 10 s, or the open time if shorter); never read out.
 */
export const DIDNT_OPEN = "Didn't open? Hold again.";

/** When an open door's time runs out (review 2026-11-17 app-1: no longer "Didn't open?" minutes later). */
export const LOCKED_AGAIN = 'The door has locked again.';

/** Under an opened door while it counts down: 'Open for 42 s', then 'Open for 2:05' from a minute up. */
export function openForText(left) {
  if (left < 60) return `Open for ${left} s`;
  return `Open for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

/** An open time as a screen reader says it: '45 seconds', '1 minute', '1 minute 30 seconds', '10 minutes'. */
export function openTimeWords(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const unit = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const m = Math.floor(s / 60);
  if (!m) return unit(s, 'second');
  return s % 60 ? `${unit(m, 'minute')} ${unit(s % 60, 'second')}` : unit(m, 'minute');
}

const NO_ANSWER = `The door didn't answer. If you heard the lock click, go in. Otherwise try once more, or call or text ${ACADEMY_PHONE}.`;

const COPY = {
  opened: 'Unlocked - pull the door now.',
  coalesced: 'Already unlocked - pull the door.',
  test: 'Test household - the door was not opened.',
  'sign-rules': 'Read and sign the door rules once to turn on Unlock.',
  'guardian-rules': 'A parent needs to sign the door rules in their own app first.',
  'under-16': 'Athletes under 16 come in with a parent or guardian.',
  paused: `Door unlocking is paused for your family. Call or text the academy at ${ACADEMY_PHONE}.`,
  'location-needed': "Turn on Location for this site so the app can check you're at the academy.",
  'too-far': 'You need to be at the academy to unlock the door.',
  'rate-limited': `Too many unlocks for now. Call or text the academy at ${ACADEMY_PHONE}.`,
  'alta-error': NO_ANSWER,
  'alta-timeout': NO_ANSWER,
  'in-progress': NO_ANSWER,
  misconfigured: NO_ANSWER,
  off: 'Door unlocking is switched off right now.',
  offline: "You're offline - the button needs a data connection.",
};

/** The no-answer line, for a failed press that carries no reason the copy knows. */
export const DOOR_NO_ANSWER = NO_ANSWER;

/**
 * The copy for an outcome ('opened', 'coalesced', 'test') or a refusal reason
 * (the server's details.reason, or the app's own 'offline' and
 * 'location-needed'); null for any other, where the server's own message
 * stands in.
 */
export function doorCopy(reason) {
  return typeof reason === 'string' && Object.prototype.hasOwnProperty.call(COPY, reason) ? COPY[reason] : null;
}

/**
 * What a refused or failed press says: its own copy, else the server's plain
 * message for a reason this file does not word, else (no reason at all: the
 * network, a crash, the SDK's own message such as 'internal') the no-answer line.
 */
export function refusalCopy(reason, serverMessage) {
  const own = doorCopy(reason);
  if (own) return own;
  if (reason && typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage;
  return NO_ANSWER;
}

/** The refusals a family can act on, or should know about: the card shows for these even though Unlock is off. */
export const CARD_REASONS = ['sign-rules', 'guardian-rules', 'under-16', 'paused'];

/** Whether the family card shows for a check answer: Unlock is open, or one of CARD_REASONS. Hidden for every other reason. */
export function cardShows(reason, canUnlock) {
  return canUnlock === true || CARD_REASONS.includes(reason);
}

/**
 * The door rules the sheet shows: the facility rules (CONSENT_TERMS.facilityAccess,
 * which ends "Who may enter" with DOOR_RULE_LINE), in the second person for an
 * adult athlete's own login (`selfWording`), as written for everyone else.
 */
export function doorRulesSections(selfWording) {
  const mode = selfWording ? 'athlete' : 'parent';
  return CONSENT_TERMS.facilityAccess.map((s) => ({ heading: s.heading, lines: s.lines.map((line) => consentWording(line, mode)) }));
}
