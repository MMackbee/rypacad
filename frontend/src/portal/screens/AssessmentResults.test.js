import React from 'react';
import { renderScreen } from './testRender';
import AssessmentResults from './AssessmentResults';
import { DEFAULT_SETTINGS, circuitModeOf, withDefaults } from '../data/assessmentSettings';

let mockData;
let mockError;
let mockSaves;
let mockSaveFails;
let mockChanges;
jest.mock('../hooks/assessments', () => ({ useAthleteAssessments: () => ({ data: mockData, loading: false, error: mockError }) }));
jest.mock('../hooks/researchConsent', () => ({
  recordResearchChange: async (args) => {
    mockChanges.push(args);
    return { athleteId: args.athleteId };
  },
}));
jest.mock('../hooks/assessmentsLive', () => ({
  saveWindowFields: async (args) => {
    mockSaves.push(args);
    if (mockSaveFails) throw new Error('offline');
    return args.fields;
  },
}));

const MODE = circuitModeOf(DEFAULT_SETTINGS);
const PHIL = { uid: 'phil', role: 'coach', specialistId: 'phil' };
const COACH = { uid: 'c', role: 'coach' };
const win = (over) => ({ athleteId: 'seed-ava', season: '2026-27', protocolVersion: 'v1.2', circuitMode: MODE, golfDate: null, mcgillDate: null, enteredBy: {}, ...over });
const baseline = win({
  id: '2026-27-baseline', kind: 'baseline', status: 'complete', circuitDate: '2026-11-03', weeksOfExposure: 0, wave: { id: 'wave-2026-11-03-seed', position: 1 },
  anthro: { standing: [152.1, 152.3], mass: [41.0, 41.2], boxHeight: 40, sittingRaw: [118.0, 118.2], arm: [], hand: [] },
  grip: { right: [24.5, 25.1, 24.8], left: [23.0, 22.4, 23.8], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' },
  cmj: { trials: [{ heightCm: 31.2, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2100, peakPowerWkg: null, asymmetryPct: 6.5 }], software: 'Smart2Move', samplingHz: 1000 },
  hop: { sets: [{ rsiBest5: 2.31, gctMs: 198 }] },
  medball: { massKg: 3, side: 'trail', method: 'speed', throws: [28.4, 29.1] },
  mcgill: { flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 300, skippedBackPain: false },
  golf: { speeds: [88.2, 90.1, 89.5], driver: 'TSR3', parallaxComposite: 72, fps: 240 },
});
const end = win({
  id: '2026-27-end', kind: 'end', status: 'open', circuitDate: '2027-02-16', weeksOfExposure: 15, wave: { id: 'wave-2027-02-16-x', position: 1 },
  anthro: { standing: [153.0], mass: [42.0], boxHeight: 40, sittingRaw: [118.5, 118.5], arm: [], hand: [] },
  grip: { right: [27.0], left: [24.0] },
});

const screen = (props = {}) => renderScreen(<AssessmentResults bare athleteId="seed-ava" viewer={PHIL} today="2027-02-20" onBack={() => {}} onRunMcgill={() => {}} {...props} />);

beforeEach(() => {
  mockData = {
    athlete: { id: 'seed-ava', name: 'Ava Moreno', dob: '2012-04-10', consents: { research: { value: true, assent: true, recordedAt: '2026-10-15T15:00:00Z', recordedBy: 'p' } } },
    profile: { athleteId: 'seed-ava', sex: 'female', firstTestDate: '2026-11-03' },
    windows: [baseline, end],
    settings: withDefaults(null),
  };
  mockError = null;
  mockSaves = [];
  mockSaveFails = false;
  mockChanges = [];
  window.innerWidth = 1024;
});
afterEach(() => { window.innerWidth = 1024; });

test('every window newest first, with maturity, scores, markers and flags', async () => {
  const r = await screen();
  const text = r.text();
  expect(text).toContain('Ava Moreno');
  expect(text).toContain('First test Nov 3 · Female');
  expect(text).toContain('Research: yes since Oct 15');
  expect(text.indexOf('End of season · Feb 16')).toBeLessThan(text.indexOf('Baseline · Nov 3'));
  expect(text).toContain('Protocol v1.2 · 15 weeks of exposure · in research');
  expect(text).toContain('Maturity offset');
  expect(text).toContain('estimate, coefficients unverified');
  expect(text).toContain('Grip best (kg)27Up');
  expect(text).toContain('First retest: part of any gain may be a learning effect.');
  await r.unmount();
});

test('every trial, with the coach-only values, on request', async () => {
  const r = await screen();
  expect(r.text()).not.toContain('asymmetry 6.5 %');
  await r.click('Show every trial: Baseline, Nov 3');
  expect(r.text()).toContain('Jump 1: 31.2 cm · RSImod 0.41 · 2100 W · asymmetry 6.5 %');
  expect(r.text()).toContain('Set 1: RSI 2.31 · contact 198 ms');
  expect(r.text()).toContain('Flexor 60 s · extensor 90 s · right side 50 s · left side 300+ (capped)');
  expect(r.text()).toContain('Right 24.5, 25.1, 24.8 · Left 23, 22.4, 23.8 · device D1 · handle 3 · circuit rest interval');
  await r.unmount();
});

test('an open window says how long it has been open and what is still missing', async () => {
  const r = await screen();
  expect(r.text()).toContain('Open since Feb 16 (4 days)');
  expect(r.text()).toContain('Clubhead speed not entered (due by Feb 23)');
  expect(r.text()).toContain('McGill not entered (due by Mar 2)');
  await r.unmount();
});

test('staff mark a window complete, after a warning for what is still missing, and run the McGill block it lacks', async () => {
  const runs = [];
  const r = await screen({ onRunMcgill: (waveId) => runs.push(waveId) });
  await r.click('Run McGill block');
  expect(runs).toEqual(['wave-2027-02-16-x']);
  await r.click('Mark window complete');
  expect(mockSaves).toEqual([]);
  expect(r.text()).toContain('Golf coaches can only enter clubhead speed and Parallax on an open window.');
  await r.click('Keep open');
  expect(mockSaves).toEqual([]);
  await r.click('Mark window complete');
  await r.click('Complete anyway');
  expect(mockSaves).toEqual([{ athleteId: 'seed-ava', windowId: '2026-27-end', fields: { status: 'complete' } }]);
  expect(r.button('Mark window complete')).toBeNull();
  await r.unmount();
});

test('a status save that fails says so and leaves the window open', async () => {
  mockSaveFails = true;
  const r = await screen();
  await r.click('Mark window complete');
  await r.click('Complete anyway');
  expect(r.text()).toContain('The window was not marked complete. Check the connection and try again.');
  expect(r.button('Mark window complete')).not.toBeNull();
  await r.unmount();
});

test('coaches without the permission read everything and change nothing', async () => {
  const r = await screen({ viewer: COACH });
  expect(r.button('Mark window complete')).toBeNull();
  expect(r.button('Run McGill block')).toBeNull();
  expect(r.button('Show every trial: Baseline, Nov 3')).not.toBeNull();
  await r.unmount();
});

test('desktop adds the table of every window', async () => {
  window.innerWidth = 1280;
  const r = await screen();
  const heads = [...r.container.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent);
  expect(heads).toEqual(['Measure', 'End of season · Feb 16', 'Baseline · Nov 3']);
  const rows = [...r.container.querySelectorAll('[role="rowheader"]')].map((h) => h.textContent);
  expect(rows).toContain('CMJ height (cm)');
  await r.unmount();
});

test('an athlete record the coach cannot read still shows the results, under the name passed in', async () => {
  mockData = { ...mockData, athlete: null };
  const r = await screen({ fallbackName: 'Ava Moreno' });
  expect(r.text()).toContain('Ava Moreno');
  expect(r.text()).toContain('Maturity offset not computed: the athlete record could not be read.');
  await r.unmount();
});

test('a failed load and an athlete never tested both say so', async () => {
  mockData = null;
  mockError = new Error('offline');
  const r = await screen();
  expect(r.text()).toContain("The results didn't load. Check your connection and try again.");
  await r.unmount();
  mockError = null;
  mockData = { athlete: { id: 'seed-cal', name: 'Cal Duarte', dob: null, consents: {} }, profile: null, windows: [], settings: withDefaults(null) };
  const e = await screen();
  expect(e.text()).toContain('No assessments yet.');
  await e.unmount();
});

test("the owner's change on the 18th birthday by the UTC date, still the day before in Chicago, goes in the 18+ shape the rules expect", async () => {
  // 01:00 UTC on Oct 29 is 8 PM Oct 28 in Chicago; firestore.rules adultRecord() counts 18 from midnight UTC.
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-29T01:00:00Z'));
  try {
    mockData = { ...mockData, athlete: { id: 'seed-ava', name: 'Ava Moreno', dob: '2008-10-29', consents: { research: null } }, windows: [] };
    const r = await screen({ viewer: { uid: 'owner1', role: 'owner' }, today: undefined });
    await r.click('Record a change');
    await r.click('Research answer: Yes');
    expect(r.button('Athlete assent: Given')).toBeNull();
    await r.click('Save change');
    expect(mockChanges).toEqual([{ athleteId: 'seed-ava', answer: { value: true, assent: null }, current: null }]);
    await r.unmount();
  } finally {
    jest.useRealTimers();
  }
});
