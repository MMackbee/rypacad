import React, { act } from 'react';
import { renderScreen } from './testRender';
import AssessmentGolf from './AssessmentGolf';
import { DEFAULT_SETTINGS, circuitModeOf, withDefaults } from '../data/assessmentSettings';

let mockData;
let mockSaves;
jest.mock('../hooks/assessments', () => ({ useAthleteAssessments: () => ({ data: mockData, loading: false, error: null }) }));
jest.mock('../hooks/assessmentsLive', () => ({
  saveSection: async (args) => { mockSaves.push(['section', args]); return args; },
  saveWindowFields: async (args) => { mockSaves.push(['fields', args]); return args; },
}));

const MODE = circuitModeOf(DEFAULT_SETTINGS);
const open = (over = {}) => ({ id: '2026-27-baseline', athleteId: 'seed-dev', kind: 'baseline', season: '2026-27', status: 'open', circuitDate: '2026-11-03', golfDate: null, circuitMode: MODE, enteredBy: {}, ...over });
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const screen = (props = {}) => renderScreen(<AssessmentGolf bare athleteId="seed-dev" onBack={() => {}} {...props} />);

beforeEach(() => {
  mockSaves = [];
  mockData = { athlete: { id: 'seed-dev', name: 'Dev Patel', dob: '2011-11-05', consents: {} }, profile: { athleteId: 'seed-dev', driver: 'TSR3 10.5' }, windows: [open()], settings: withDefaults(null) };
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-05T22:00:00Z')); // Nov 5, 4 PM in Chicago
});
afterEach(() => { jest.useRealTimers(); });

test('the cue, the swing counts and the open window', async () => {
  const r = await screen();
  expect(r.text()).toContain('Dev Patel');
  expect(r.text()).toContain('Baseline · circuit Nov 3');
  expect(r.text()).toContain("Fastest swing you've got. Don't worry about where it goes.");
  expect(r.text()).toContain('3 warm-up swings, then 5 maximal.');
  await r.unmount();
});

test('each swing saves the golf section; the first save dates the golf today', async () => {
  const r = await screen();
  await type(r, 'Swing 1 (mph)', '88.2');
  expect(mockSaves).toEqual([
    ['section', { athleteId: 'seed-dev', windowId: '2026-27-baseline', section: 'golf', value: { speeds: [88.2, null, null, null, null], driver: 'TSR3 10.5', parallaxComposite: null, fps: null } }],
    ['fields', { athleteId: 'seed-dev', windowId: '2026-27-baseline', fields: { golfDate: '2026-11-05' } }],
  ]);
  for (const [i, v] of [[2, '90.1'], [3, '89.5'], [4, '91'], [5, '87.9']]) await type(r, `Swing ${i} (mph)`, v);
  expect(r.text()).toContain('Best 91 mph · top 3 90.2 mph');
  expect(mockSaves.filter(([k]) => k === 'fields')).toHaveLength(1);
  await type(r, 'Parallax composite', '72');
  await type(r, 'Frame rate (fps)', '60');
  expect(r.text()).toContain('Under 120 fps: timing gaps are directional only.');
  expect(mockSaves.pop()[1].value).toEqual({ speeds: [88.2, 90.1, 89.5, 91, 87.9], driver: 'TSR3 10.5', parallaxComposite: 72, fps: 60 });
  await r.unmount();
});

test('a speed out of range is refused inline and never sent', async () => {
  const r = await screen();
  await type(r, 'Swing 1 (mph)', '150');
  expect(r.text()).toContain('Clubhead speed is 30-140 mph');
  expect(mockSaves).toEqual([]);
  await r.unmount();
});

test('the swing date: any day in the last 14, never the future; late golf is warned', async () => {
  jest.setSystemTime(new Date('2026-11-12T18:00:00Z'));
  const r = await screen();
  expect(r.text()).toContain('Nov 12 is 9 days after the circuit (Nov 3); golf is due within 7 days. It will be flagged.');
  await r.fill('Swing date', '2026-11-13');
  expect(r.text()).toContain("The swing date can't be in the future.");
  expect(mockSaves).toEqual([]);
  await r.fill('Swing date', '2026-11-09');
  expect(mockSaves).toEqual([['fields', { athleteId: 'seed-dev', windowId: '2026-27-baseline', fields: { golfDate: '2026-11-09' } }]]);
  expect(r.text()).not.toContain('It will be flagged.');
  await r.unmount();
});

test('a circuit that runs golf the same day says so on any other day', async () => {
  mockData = { ...mockData, windows: [open({ circuitMode: { ...MODE, golfTiming: 'same-day' } })] };
  const r = await screen();
  expect(r.text()).toContain('This circuit runs golf the same day (Nov 3); Nov 5 will be flagged.');
  await r.unmount();
});

test('no open window says so, under the name the roster passed', async () => {
  mockData = { ...mockData, athlete: null, windows: [open({ status: 'complete' })] };
  const r = await screen({ fallbackName: 'Dev Patel' });
  expect(r.text()).toContain('Dev Patel has no open assessment window. Phil opens one when he starts a wave.');
  expect(field(r, 'Swing 1 (mph)')).toBeNull();
  await r.unmount();
});
