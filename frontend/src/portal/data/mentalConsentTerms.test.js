/**
 * The in-app consent text is the owner-approved FINAL copy, word for word
 * (docs/portal/plans/2026-10-30-mental-consent/01-consent-form-FINAL.txt).
 * A drift between the two fails here.
 */
import fs from 'fs';
import path from 'path';
import * as T from './mentalConsentTerms';
import { CONSENT_VERSION } from './mentalConsent';

const LINES = fs.readFileSync(path.resolve(__dirname, '../../../../docs/portal/plans/2026-10-30-mental-consent/01-consent-form-FINAL.txt'), 'utf8')
  .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const at = (prefix) => LINES.findIndex((l) => l.startsWith(prefix));
const between = (a, b) => LINES.slice(at(a) + 1, at(b));
const HEADINGS = ['2. What the Program Includes', '3. Understanding the Service: Mental Performance Coaching', '4. Parent/Guardian and Joint Sessions',
  '5. Session Locations & Privacy', '6. Confidentiality Agreement', '7. Scheduling & Cancellations', '8. Communication, Audio Recording & Client Records'];

test('purpose and sections 2-8 are the FINAL text, word for word, without the two checkbox lines', () => {
  expect(CONSENT_VERSION).toBe('2026-10-30');
  expect(T.CONSENT_VERSION).toBe(CONSENT_VERSION);
  expect(T.TERMS.version).toBe(CONSENT_VERSION);
  expect(`Purpose of this Form: ${T.TERMS.purpose}`).toBe(LINES[at('Purpose of this Form:')]);
  expect(T.TERMS.sections.map((s) => s.heading)).toEqual(HEADINGS);
  const ends = [...HEADINGS.slice(1), '9. Athlete'];
  T.TERMS.sections.forEach((s, i) => {
    const want = between(HEADINGS[i], ends[i]).filter((l) => !l.startsWith('Location preference:') && !l.startsWith('Driving permission'));
    expect(s.paragraphs).toEqual(want);
  });
});
test('section 9, 10 and 11 parts', () => {
  expect(T.ASSENT_POINTS).toEqual(between('I understand that:', 'Audio recording of my sessions:'));
  expect(T.ASSENT_POINTS).toHaveLength(9);
  expect(T.ASSENT_CLOSING).toBe(LINES[at('By signing below, I agree to participate')]);
  expect(T.PARENT_INTRO).toBe(LINES[at('By signing below, I/we')]);
  expect(T.PARENT_ACKNOWLEDGEMENTS).toEqual(between('By signing below, I/we', 'Audio recording of athlete sessions:'));
  expect(T.PARENT_ACKNOWLEDGEMENTS).toHaveLength(10);
  expect(T.PARENT_CLOSING).toBe(LINES[at('I/We have had the opportunity')]);
  expect(T.ADULT_INTRO).toBe(LINES[at('Athletes who are 18 or older complete this section')]);
  // the next four lines; "Emergency Contact (Name & Phone):" first appears in section 1, so it cannot end a range
  expect(T.ADULT_TERMS).toEqual(LINES.slice(at('Athletes who are 18 or older complete this section') + 1).slice(0, 4));
  expect(T.ADULT_CLOSING).toBe(LINES[at('By signing below, I confirm')]);
});
test('email only: no phone number anywhere in the module; section 8 names the address', () => {
  expect(JSON.stringify(T)).not.toMatch(/\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  expect(T.TERMS.sections[6].paragraphs.join(' ')).toContain('yannick@rypgolf.com');
});
