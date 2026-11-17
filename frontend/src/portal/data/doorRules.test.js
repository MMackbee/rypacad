/**
 * The facility door button's copy and card rules (docs/portal/plans/
 * 2026-11-17-door-button/00-spec.md 7): the terms version the app signs
 * against equals the server's, the academy number, the plain copy for every
 * outcome and refusal, and which check answers show the card at all.
 */
import fs from 'fs';
import path from 'path';
import {
  ACADEMY_PHONE,
  DIDNT_OPEN,
  DOOR_RULE_LINE,
  DOOR_TERMS_VERSION,
  LOCATION_NOTE,
  cardShows,
  doorCopy,
  doorRulesSections,
} from './doorRules';
import { CONSENT_TERMS } from './consentTerms';

const SERVER = path.resolve(__dirname, '../../../../functions/portal/door-decide.js');
const serverFile = fs.existsSync(SERVER);

// The server lane builds door-decide.js in parallel: until it is in this tree the
// comparison cannot run, and integration runs it for real.
(serverFile ? test : test.skip)(
  serverFile
    ? 'DOOR_TERMS_VERSION equals the server door-decide.js DOOR_TERMS_VERSION'
    : 'DOOR_TERMS_VERSION equals the server (SKIPPED: functions/portal/door-decide.js is not in this worktree yet; the integration step runs it)',
  () => {
    const text = fs.readFileSync(SERVER, 'utf8');
    const m = text.match(/DOOR_TERMS_VERSION\s*=\s*['"]([^'"]+)['"]/);
    expect(m).not.toBeNull();
    expect(DOOR_TERMS_VERSION).toBe(m[1]);
  }
);

test('the version and number the spec names', () => {
  expect(DOOR_TERMS_VERSION).toBe('door-2026-11-17');
  expect(ACADEMY_PHONE).toBe('(612) 234-1644');
});

test('copy by outcome, word for word', () => {
  expect(doorCopy('opened')).toBe('Unlocked - pull the door now.');
  expect(DIDNT_OPEN).toBe("Didn't open? Hold again.");
  expect(doorCopy('coalesced')).toBe('Already unlocked - pull the door.');
  expect(doorCopy('test')).toBe('Test household - the door was not opened.');
  expect(LOCATION_NOTE).toBe("The app checks you're at the academy when you unlock.");
});

test('copy by reason, word for word', () => {
  expect(doorCopy('sign-rules')).toBe('Read and sign the door rules once to turn on Unlock.');
  expect(doorCopy('guardian-rules')).toBe('A parent needs to sign the door rules in their own app first.');
  expect(doorCopy('under-16')).toBe('Athletes under 16 come in with a parent or guardian.');
  expect(doorCopy('paused')).toBe('Door unlocking is paused for your family. Call or text the academy at (612) 234-1644.');
  expect(doorCopy('location-needed')).toBe("Turn on Location for this site so the app can check you're at the academy.");
  expect(doorCopy('too-far')).toBe('You need to be at the academy to unlock the door.');
  expect(doorCopy('rate-limited')).toBe('Too many unlocks for now. Call or text the academy at (612) 234-1644.');
  expect(doorCopy('off')).toBe('Door unlocking is switched off right now.');
  expect(doorCopy('offline')).toBe("You're offline - the button needs a data connection.");
});

test('every way the door may not have answered reads the same', () => {
  const noAnswer = "The door didn't answer. If you heard the lock click, go in. Otherwise try once more, or call or text (612) 234-1644.";
  for (const reason of ['alta-error', 'alta-timeout', 'in-progress', 'misconfigured']) expect(doorCopy(reason)).toBe(noAnswer);
});

test('a reason with no copy of its own has none here (the server message or the no-answer line stands in)', () => {
  for (const reason of ['not-set-up', 'no-access', 'not-eligible', 'bad-request', 'whatever', null, undefined]) expect(doorCopy(reason)).toBeNull();
  // Not inherited from Object.prototype either.
  expect(doorCopy('constructor')).toBeNull();
});

test('the card shows when the press is open, or for the four reasons a family can act on or should know', () => {
  expect(cardShows(null, true)).toBe(true);
  for (const reason of ['sign-rules', 'guardian-rules', 'under-16', 'paused']) expect(cardShows(reason, false)).toBe(true);
  for (const reason of ['off', 'not-set-up', 'no-access', 'not-eligible', 'signed-out', null, undefined]) expect(cardShows(reason, false)).toBe(false);
});

test('the new rule ends "Who may enter" in the facility rules, and the sheet shows them all', () => {
  expect(DOOR_RULE_LINE).toBe(
    "Use the app's Unlock button only when you are at the door, and only to let in your own household. Never open the door for anyone else."
  );
  const who = CONSENT_TERMS.facilityAccess.find((s) => s.heading === 'Who may enter');
  expect(who.lines[who.lines.length - 1]).toBe(DOOR_RULE_LINE);
  const guardian = doorRulesSections(false);
  expect(guardian.map((s) => s.heading)).toEqual(CONSENT_TERMS.facilityAccess.map((s) => s.heading));
  expect(guardian[0].lines[0]).toContain('Access is for the athletes in your household');
  expect(guardian[0].lines).toContain(DOOR_RULE_LINE);
});

test('an adult athlete reads the rules in the second person', () => {
  const self = doorRulesSections(true);
  expect(self[0].lines[0]).toContain('Access is for you and any other athlete in your household');
  expect(self.flatMap((s) => s.lines).join(' ')).not.toContain('or for the athlete you are responsible for');
  expect(self[0].lines).toContain(DOOR_RULE_LINE);
});
