import {
  RESEARCH_SELF_LABEL, assentLabel, confirmBody, firstName, researchAnswer, researchLabel, researchLine, researchSheet,
} from './researchConsent';

test('the approved copy (owner, 2026-10-15), with the first name', () => {
  expect(firstName('  Jordan Whitfield ')).toBe('Jordan');
  expect(researchLabel('Jordan')).toBe("Research (optional): Jordan's results may be used in research.");
  expect(researchLine('Jordan')).toBe("Saying no changes nothing about Jordan's coaching or testing.");
  expect(assentLabel('Jordan')).toBe("I've talked about this with Jordan, and they agree too.");
  expect(RESEARCH_SELF_LABEL).toBe('Research (optional): my results may be used in research.');
  // Nothing beyond the approved copy: the second-person drafts wait for the owner (plan Task 27 Step 1).
  const copy = require('./researchConsent');
  expect(copy.RESEARCH_SELF_LINE).toBeUndefined();
  expect(copy.confirmSelfBody).toBeUndefined();
  expect(confirmBody('Jordan')).toBe("This season Phil Herder's assessment program measures each athlete's strength, power and growth. We'd like to include Jordan's results in RYP's research, with names removed. It's optional and changes nothing about their coaching.");
});

test('the Read more sheet: three sections, the athlete named (an 18+ member reads it with their own name)', () => {
  const sheet = researchSheet('Jordan');
  expect(sheet.map((s) => s.heading)).toEqual(['What it covers', 'How it is used', 'Your choice']);
  expect(sheet[0].lines[0]).toContain("With your permission we include Jordan's results in that research");
  expect(sheet[1].lines[0]).toBe('Names, contact details, dates of birth and anything else that identifies a person are removed first. Findings may be published or shared with research partners only in that form. Video and photos are never used under this consent.');
  expect(sheet[2].lines[0]).toContain('If you say no, Jordan is tested and coached exactly the same way, and their results are used only to coach them.');
  expect(sheet[2].lines[0]).toContain('results from before a "yes" are never added later.');
  expect(researchSheet('Sam')[0].lines[0]).toContain("With your permission we include Sam's results in that research");
});

test('yes under 18 needs both boxes; 18+ answer alone and have no assent', () => {
  expect(researchAnswer({ ticked: true, assent: true, minor: true })).toEqual({ value: true, assent: true });
  expect(researchAnswer({ ticked: true, assent: false, minor: true })).toEqual({ value: false, assent: false });
  expect(researchAnswer({ ticked: false, assent: true, minor: true })).toEqual({ value: false, assent: false });
  expect(researchAnswer({ ticked: true, assent: false, minor: false })).toEqual({ value: true, assent: null });
  expect(researchAnswer({ ticked: false, minor: false })).toEqual({ value: false, assent: null });
});
