/**
 * hooks/assessments.js: the pure view builders, and the hooks in seed and
 * live mode (the Firestore adapter is mocked; its own shapes are pinned in
 * assessmentsLive.test.js).
 */
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAllAthletes: jest.fn(),
  fetchAthlete: jest.fn(),
  fetchAthletesByIds: jest.fn(),
}));
jest.mock('./assessmentsLive', () => ({
  ...jest.requireActual('./assessmentsLive'),
  __esModule: true,
  fetchAllAssessmentWindows: jest.fn(),
  fetchAllAssessmentProfiles: jest.fn(),
  fetchAthleteWindows: jest.fn(),
  fetchAssessmentProfile: jest.fn(),
  fetchAssessmentSettings: jest.fn(),
}));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as live from './live';
import * as adapter from './assessmentsLive';
import {
  openWindowsByAthlete, rosterRows, useAssessmentRoster, useAssessmentSettings, useAthleteAssessments, useOpenAssessmentWindows, useWave, waveView,
} from './assessments';
import { SEED_WAVE_ID } from '../data/assessmentSeed';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mountHook(useHook) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await settle();
  return { result, unmount: () => act(async () => root.unmount()) };
}

const win = (athleteId, kind, circuitDate, over = {}) => ({ id: `2026-27-${kind}`, athleteId, season: '2026-27', kind, circuitDate, status: 'complete', ...over });

describe('pure views', () => {
  test('roster rows: every athlete, by name, with consent, what is due and their windows', () => {
    const rows = rosterRows({
      athletes: [{ id: 'b', name: 'Zed', consents: { research: { value: false } } }, { id: 'a', name: 'Amy' }, { id: 'c' }],
      windows: [win('b', 'baseline', '2026-11-03')],
      today: '2026-11-10',
    });
    expect(rows.map((r) => [r.athleteId, r.name, r.consent, r.due.label])).toEqual([
      ['a', 'Amy', 'unanswered', 'Baseline due'],
      ['c', 'c', 'unanswered', 'Baseline due'],
      ['b', 'Zed', 'no', 'Mid-season from Dec 29'],
    ]);
    expect(rows[2].windows).toHaveLength(1);
  });
  test('a wave: its athletes by position, each with profile and earlier windows; an unknown wave is null', () => {
    const windows = [
      win('a', 'mid', '2026-12-29', { status: 'open', wave: { id: 'w1', position: 2 } }),
      win('b', 'baseline', '2026-12-29', { status: 'open', wave: { id: 'w1', position: 1 } }),
      win('a', 'baseline', '2026-11-03', { wave: { id: 'w0', position: 1 } }),
    ];
    const v = waveView({ waveId: 'w1', windows, athletes: [{ id: 'a', name: 'Amy', dob: '2012-01-01' }, { id: 'b', name: 'Bo' }], profiles: [{ athleteId: 'a', sex: 'female' }] });
    expect(v.athletes.map((x) => [x.athleteId, x.position, x.kind, x.windowId])).toEqual([['b', 1, 'baseline', '2026-27-baseline'], ['a', 2, 'mid', '2026-27-mid']]);
    expect(v.athletes[1].profile).toEqual({ athleteId: 'a', sex: 'female' });
    expect(v.athletes[1].prior.map((p) => p.id)).toEqual(['2026-27-baseline']);
    expect(v.athletes[0].prior).toEqual([]);
    expect(v.circuitDate).toBe('2026-12-29');
    expect(waveView({ waveId: 'nope', windows, athletes: [], profiles: [] })).toBeNull();
  });
  test('open windows by athlete, for the golf coach roster', () => {
    expect(openWindowsByAthlete([win('a', 'baseline', '2026-11-03', { status: 'open' }), win('b', 'baseline', '2026-11-03')])).toEqual({
      a: { windowId: '2026-27-baseline', kind: 'baseline', circuitDate: '2026-11-03', golfDate: null, circuitMode: null },
    });
  });
});

describe('seed mode (the review scaffold)', () => {
  test('the roster, a wave, an athlete and the settings come from the fixture', async () => {
    const roster = await mountHook(() => useAssessmentRoster({ today: '2026-11-05' }));
    expect(roster.result.current.data.rows.map((r) => r.name)).toEqual(['Ava Moreno', 'Ben Ortiz', 'Cal Duarte', 'Dev Patel', 'Eli Brooks']);
    await roster.unmount();
    const wave = await mountHook(() => useWave(SEED_WAVE_ID));
    expect(wave.result.current.data.athletes.map((a) => a.name)).toEqual(['Dev Patel', 'Eli Brooks']);
    await wave.unmount();
    const ava = await mountHook(() => useAthleteAssessments('seed-ava'));
    expect(ava.result.current.data.windows.map((w) => w.id)).toEqual(['2026-27-baseline']);
    expect(ava.result.current.data.profile.sex).toBe('female');
    await ava.unmount();
    const settings = await mountHook(() => useAssessmentSettings());
    expect(settings.result.current.data).toMatchObject({ stored: false, settings: { protocolVersion: 'v1.2' } });
    await settings.unmount();
    expect(adapter.fetchAllAssessmentWindows).not.toHaveBeenCalled();
  });
});

describe('live mode', () => {
  beforeEach(() => { live.isLive.mockReturnValue(true); });

  test('a wave reads every window and profile once, then only its own athletes', async () => {
    adapter.fetchAllAssessmentWindows.mockResolvedValue([win('a', 'baseline', '2026-11-03', { status: 'open', wave: { id: 'w1', position: 1 } }), win('z', 'baseline', '2026-11-03')]);
    adapter.fetchAllAssessmentProfiles.mockResolvedValue([]);
    live.fetchAthletesByIds.mockResolvedValue([{ id: 'a', name: 'Amy' }]);
    const h = await mountHook(() => useWave('w1'));
    expect(h.result.current.data.athletes.map((x) => x.name)).toEqual(['Amy']);
    expect(live.fetchAthletesByIds).toHaveBeenCalledWith(['a']);
    await h.unmount();
  });

  test("a coach who may not read the athlete record still gets the athlete's windows", async () => {
    live.fetchAthlete.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    adapter.fetchAssessmentProfile.mockResolvedValue(null);
    adapter.fetchAthleteWindows.mockResolvedValue([win('a', 'mid', '2026-12-29'), win('a', 'baseline', '2026-11-03')]);
    adapter.fetchAssessmentSettings.mockResolvedValue({ thresholds: { cmj: 6 } });
    const h = await mountHook(() => useAthleteAssessments('a'));
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.athlete).toBeNull();
    expect(h.result.current.data.windows.map((w) => w.kind)).toEqual(['baseline', 'mid']);
    expect(h.result.current.data.settings.thresholds).toMatchObject({ cmj: 6, clubhead: 2 });
    await h.unmount();
  });

  test('the roster joins every athlete to their windows; open windows for the golf roster', async () => {
    live.fetchAllAthletes.mockResolvedValue([{ id: 'a', name: 'Amy', consents: { research: { value: true } } }]);
    adapter.fetchAllAssessmentWindows.mockResolvedValue([win('a', 'baseline', '2026-11-03', { status: 'open' })]);
    const roster = await mountHook(() => useAssessmentRoster({ today: '2026-11-04' }));
    expect(roster.result.current.data.rows[0]).toMatchObject({ athleteId: 'a', consent: 'yes', due: { label: 'Baseline in progress' } });
    await roster.unmount();
    const open = await mountHook(() => useOpenAssessmentWindows());
    expect(Object.keys(open.result.current.data.byAthlete)).toEqual(['a']);
    await open.unmount();
  });

  test('a viewer who may not read windows (mental without the permission) sends no read at all', async () => {
    const off = await mountHook(() => useOpenAssessmentWindows({ enabled: false }));
    expect(off.result.current.data).toEqual({ byAthlete: {} });
    expect(adapter.fetchAllAssessmentWindows).not.toHaveBeenCalled();
    await off.unmount();
  });
});
