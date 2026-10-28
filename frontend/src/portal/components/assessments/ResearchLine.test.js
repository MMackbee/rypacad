import React from 'react';
import { renderScreen } from '../../screens/testRender';
import ResearchLine, { researchStatus } from './ResearchLine';

let mockChanges;
let mockFail;
jest.mock('../../hooks/researchConsent', () => ({
  recordResearchChange: async (args) => {
    mockChanges.push(args);
    if (mockFail) throw new Error('offline');
    return { athleteId: args.athleteId };
  },
}));

const yes = { value: true, assent: true, recordedAt: '2026-10-15T15:00:00Z', recordedBy: 'p1' };
beforeEach(() => { mockChanges = []; mockFail = false; });

test('the status reads the answer and its date; the history says what came before', async () => {
  expect(researchStatus(null)).toBe('Research: not answered');
  expect(researchStatus(yes)).toBe('Research: yes since Oct 15');
  expect(researchStatus({ value: false, assent: false, recordedAt: '2026-11-02T15:00:00Z' })).toBe('Research: no (recorded Nov 2)');
  const r = await renderScreen(<ResearchLine athleteId="a1" research={{ value: false, assent: false, recordedAt: '2026-11-02T15:00:00Z', history: [yes] }} minor canChange={false} />);
  expect(r.text()).toContain('Research: no (recorded Nov 2)');
  expect(r.text()).toContain('Earlier: yes from Oct 15.');
  expect(r.button('Record a change')).toBeNull();
  await r.unmount();
});

test("the owner records a family's change; under 18 a yes needs the assent", async () => {
  const r = await renderScreen(<ResearchLine athleteId="a1" research={null} minor canChange />);
  await r.click('Record a change');
  await r.click('Research answer: Yes');
  await r.click('Save change');
  expect(mockChanges).toEqual([{ athleteId: 'a1', answer: { value: false, assent: false }, current: null }]);
  await r.click('Record a change');
  await r.click('Research answer: Yes');
  await r.click('Athlete assent: Given');
  await r.click('Save change');
  expect(mockChanges[1]).toEqual({ athleteId: 'a1', answer: { value: true, assent: true }, current: null });
  await r.unmount();
});

test('a failed change says so and keeps the editor open', async () => {
  mockFail = true;
  const r = await renderScreen(<ResearchLine athleteId="a1" research={yes} minor={false} canChange />);
  await r.click('Record a change');
  await r.click('Research answer: No');
  await r.click('Save change');
  expect(mockChanges[0].answer).toEqual({ value: false, assent: null });
  expect(r.text()).toContain('The change was not saved. Check the connection and try again.');
  expect(r.button('Save change')).not.toBeNull();
  await r.unmount();
});
