import React from 'react';
import { renderScreen } from './testRender';
import AssessmentList from './AssessmentList';

let mockRows;
let mockStarts;
let mockStartFails;
let mockSkipped;
jest.mock('../hooks/assessments', () => ({
  useAssessmentRoster: () => ({ data: { rows: mockRows }, loading: false, error: null }),
  useAssessmentSettings: () => ({ data: { settings: jest.requireActual('../data/assessmentSettings').withDefaults(null), stored: false }, loading: false, error: null }),
}));
jest.mock('../hooks/assessmentsLive', () => ({
  startWave: async (args) => {
    mockStarts.push(args);
    if (mockStartFails) throw new Error('unavailable');
    const skipped = mockSkipped.filter((s) => args.entries.some((e) => e.athleteId === s.athleteId));
    return { waveId: args.waveId, started: args.entries.map((e) => e.athleteId).filter((id) => !skipped.some((s) => s.athleteId === id)), skipped };
  },
}));

const due = (label, kind, extra = {}) => ({ label, kind, kinds: kind ? [kind] : [], inProgress: false, eligibleOn: null, lastTestDate: null, windowId: null, ...extra });
const PHIL = { uid: 'phil', role: 'coach', specialistId: 'phil' };

beforeEach(() => {
  mockStarts = [];
  mockStartFails = false;
  mockSkipped = [];
  mockRows = [
    { athleteId: 'a', name: 'Ava Moreno', consent: 'yes', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'b', name: 'Ben Ortiz', consent: 'no', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'c', name: 'Cal Duarte', consent: 'unanswered', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'd', name: 'Dev Patel', consent: 'yes', due: due('Mid-season eligible', 'mid', { kinds: ['mid', 'end'], lastTestDate: '2026-11-03' }), windows: [] },
    { athleteId: 'e', name: 'Eli Brooks', consent: 'yes', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'f', name: 'Fay Kim', consent: 'yes', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'g', name: 'Gus Lee', consent: 'yes', due: due('Mid-season from Dec 29', null, { lastTestDate: '2026-11-03' }), windows: [] },
  ];
});
afterEach(() => {
  jest.useRealTimers();
  window.innerWidth = 1024;
});

const list = (props = {}) => renderScreen(<AssessmentList bare viewer={PHIL} onOpenWave={() => {}} onOpenAthlete={() => {}} onOpenSettings={() => {}} {...props} />);
const checked = (r, name) => r.button(`Select ${name}`).getAttribute('aria-checked');

test('every athlete with research consent, what is due and the last test (spec 5)', async () => {
  const r = await list();
  for (const text of ['Ava Moreno', 'Research: yes', 'Research: no', 'Research: not answered', 'Baseline due', 'Mid-season eligible', 'Last test Nov 3', 'Never tested', 'Mid-season from Dec 29']) {
    expect(r.text()).toContain(text);
  }
  expect(r.text()).toContain('Protocol v1.2');
  await r.unmount();
});

test('not answered can be added, with the out-of-research line; a "no" can; up to four; not due cannot', async () => {
  const r = await list();
  expect(r.button('Select Cal Duarte').disabled).toBe(false);
  expect(r.text()).toContain('No research answer yet: results from a test before a yes stay out of research');
  expect(r.text()).not.toContain("Waiting on the family's research answer");
  await r.click('Select Cal Duarte');
  expect(checked(r, 'Cal Duarte')).toBe('true');
  await r.click('Select Cal Duarte');
  expect(checked(r, 'Cal Duarte')).toBe('false');
  expect(r.button('Select Gus Lee').disabled).toBe(true);
  for (const name of ['Ben Ortiz', 'Ava Moreno', 'Dev Patel', 'Eli Brooks']) await r.click(`Select ${name}`);
  expect(checked(r, 'Ben Ortiz')).toBe('true');
  expect(r.button('Select Fay Kim').disabled).toBe(true);
  expect(r.text()).toContain('Start wave · 4 of 4');
  await r.click('Select Ben Ortiz');
  expect(r.button('Select Fay Kim').disabled).toBe(false);
  await r.unmount();
});

test('an evening wave is dated by the academy (Chicago), not UTC (Review Focus 1)', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-04T00:30:00Z')); // Nov 3, 6:30 PM in Chicago
  const opened = [];
  const r = await list({ onOpenWave: (id) => opened.push(id) });
  await r.click('Select Ava Moreno');
  await r.click('Select Dev Patel');
  await r.click('Start wave · 2 of 4');
  expect(r.container.querySelector('[aria-label="Circuit date"]').value).toBe('2026-11-03');
  await r.click('Dev Patel window: End of season');
  await r.click('Start wave');
  expect(mockStarts).toHaveLength(1);
  expect(mockStarts[0]).toMatchObject({
    circuitDate: '2026-11-03',
    entries: [{ athleteId: 'a', kind: 'baseline', position: 1 }, { athleteId: 'd', kind: 'end', position: 2 }],
  });
  expect(mockStarts[0].waveId).toMatch(/^wave-2026-11-03-/);
  expect(opened).toEqual([mockStarts[0].waveId]);
  await r.unmount();
});

test('a circuit date outside the last 14 days, or a failed start, keeps the sheet open and says why', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-10T18:00:00Z'));
  const r = await list();
  await r.click('Select Ava Moreno');
  await r.click('Start wave · 1 of 4');
  await r.fill('Circuit date', '2026-10-20');
  expect(r.text()).toContain('Pick a date in the last 14 days.');
  expect(r.button('Start wave').disabled).toBe(true);
  await r.fill('Circuit date', '2026-11-09');
  mockStartFails = true;
  await r.click('Start wave');
  expect(r.text()).toContain('The wave did not start. Check the connection and try again.');
  expect(r.button('Start wave')).not.toBeNull();
  await r.unmount();
});

test('athletes the wave could not take are named before it opens; a wave of nobody opens nothing', async () => {
  mockSkipped = [{ athleteId: 'd', reason: 'complete' }, { athleteId: 'e', reason: 'stale' }];
  const opened = [];
  const r = await list({ onOpenWave: (id) => opened.push(id) });
  for (const name of ['Ava Moreno', 'Dev Patel', 'Eli Brooks']) await r.click(`Select ${name}`);
  await r.click('Start wave · 3 of 4');
  await r.click('Start wave');
  expect(r.text()).toContain('Not in this wave: Dev Patel (that window is already complete), Eli Brooks (that window has been open more than 14 days: mark it complete first).');
  expect(opened).toEqual([]);
  await r.click('Open the wave');
  expect(opened).toEqual([mockStarts[0].waveId]);
  await r.unmount();

  mockSkipped = [{ athleteId: 'a', reason: 'complete' }];
  const none = await list({ onOpenWave: (id) => opened.push(id) });
  await none.click('Select Ava Moreno');
  await none.click('Start wave · 1 of 4');
  await none.click('Start wave');
  expect(none.text()).toContain('No wave started');
  expect(none.button('Open the wave')).toBeNull();
  await none.click('Close');
  expect(opened).toHaveLength(1);
  expect(none.text()).not.toContain('No wave started');
  await none.unmount();
});

test('a window in progress says since when; one open past 14 days says to complete it and cannot join a wave', async () => {
  const open = [{ id: '2026-27-baseline', circuitDate: '2026-11-03', status: 'open' }];
  mockRows = [
    { athleteId: 'a', name: 'Ava Moreno', consent: 'yes', due: due('Baseline in progress', 'baseline', { inProgress: true, windowId: '2026-27-baseline' }), windows: open },
    { athleteId: 'b', name: 'Ben Ortiz', consent: 'yes', due: due('Open since Nov 3: mark it complete', null, { inProgress: true, stale: true, windowId: '2026-27-baseline' }), windows: open },
  ];
  const r = await list();
  expect(r.text()).toContain('Baseline in progress · since Nov 3');
  expect(r.text()).toContain('Open since Nov 3: mark it complete');
  expect(r.button('Select Ava Moreno').disabled).toBe(false);
  expect(r.button('Select Ben Ortiz').disabled).toBe(true);
  await r.unmount();
});

test('tablet and desktop get a table; a phone a single column', async () => {
  window.innerWidth = 1280;
  const wide = await list();
  expect(wide.text()).toContain('Research');
  expect(wide.text()).toContain('Last test');
  expect(wide.container.querySelector('[role="columnheader"]')).not.toBeNull();
  await wide.unmount();
  window.innerWidth = 390;
  const phone = await list();
  expect(phone.container.querySelector('[role="columnheader"]')).toBeNull();
  await phone.unmount();
});

test('owners come from Admin and go back there; Phil gets the Assessments tab', async () => {
  const back = [];
  const owner = await list({ viewer: { uid: 'o1', role: 'owner' }, onBack: () => back.push(1) });
  await owner.click('‹ Admin');
  expect(back).toEqual([1]);
  expect(owner.button('Assessments')).toBeNull();
  await owner.unmount();
  const phil = await list();
  expect(phil.button('Assessments').getAttribute('aria-current')).toBe('page');
  await phil.unmount();
});
