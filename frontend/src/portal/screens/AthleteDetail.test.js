import React from 'react';
import { renderScreen } from './testRender';
import AthleteDetail from './AthleteDetail';

let mockDetail;
// The staff handicap edit's write (hooks/handicap.js), as the screen reaches it.
let mockSetHandicap;
// The real useAthleteDetail composes the subline without the contract part while the contract is hidden; the mock does the same.
jest.mock('../hooks', () => ({
  useAthleteDetail: () => (mockDetail?.data?.athlete
    ? { ...mockDetail, data: { ...mockDetail.data, athlete: { ...mockDetail.data.athlete, subline: jest.requireActual('../data/contractFlag').hideContractParts(mockDetail.data.athlete.subline) } } }
    : mockDetail),
  // No useHousehold mock on purpose (perf wave B): the back label comes off
  // useAthleteDetail's householdName, and a stray second load would crash here.
  useDiagnostic: () => ({ data: null, loading: false, error: null }),
  useAthleteTier: () => ({ setTier: async () => {} }),
  useAssignPackages: () => ({ assign: async () => {} }),
  useHouseholdSettings: () => ({ saving: false }),
  useIssueTokens: () => ({ issue: async () => {} }),
  setAthleteHandicap: (...args) => mockSetHandicap(...args),
}));

test('the login line reads the invite state', async () => {
  const athlete = { name: 'Jordan', subline: 'Age 14', contractMinutes: 45, packageId: 't-12', loginEmail: 'jordan@email.com', login: { state: 'invited', claimedAt: null } };
  mockDetail = { data: { athlete, history: [], checklist: [], hasEnoughData: false }, loading: false, error: null };
  const r = await renderScreen(<AthleteDetail bare athleteId="a1" role="parent" />);
  expect(r.text()).toContain('Login: not claimed (jordan@email.com)');
  await r.unmount();
});

test("a parent's back link names the athlete's household; staff keep their own label", async () => {
  const athlete = { name: 'Jordan', subline: 'Age 14', contractMinutes: 45, packageId: 't-12', householdName: 'Whitfield family', loginEmail: null, login: { state: 'none', claimedAt: null } };
  mockDetail = { data: { athlete, history: [], checklist: [], hasEnoughData: false }, loading: false, error: null };
  const parent = await renderScreen(<AthleteDetail bare athleteId="a1" role="parent" backLabel={null} onBack={() => {}} />);
  expect(parent.button('‹ Whitfield family')).not.toBeNull();
  await parent.unmount();
  const staff = await renderScreen(<AthleteDetail bare athleteId="a1" role="ops" backLabel="Admin" onBack={() => {}} />);
  expect(staff.button('‹ Admin')).not.toBeNull();
  await staff.unmount();
  mockDetail = { data: { athlete: { ...athlete, householdName: null }, history: [], checklist: [], hasEnoughData: false }, loading: false, error: null };
  const unnamed = await renderScreen(<AthleteDetail bare athleteId="a1" role="parent" onBack={() => {}} />);
  expect(unnamed.button('‹ Family')).not.toBeNull();
  await unnamed.unmount();
});

describe('Commitment Contract hidden (owner ruling 2026-09-30)', () => {
  const athlete = {
    name: 'Jordan', subline: 'Enrolled Nov 3 · 45 min tier · 12 tokens package', contractMinutes: null, packageId: 't-12',
    householdName: 'Whitfield family', attendance: '94%', attendanceLabel: 'attendance since Nov', board: '3 of 4', boardLabel: 'months on the Board',
  };
  const full = { data: { athlete, history: [{ month: 'Nov', pct: 96 }], checklist: [], hasEnoughData: true }, loading: false, error: null };
  const limited = {
    data: {
      athlete, history: [], hasEnoughData: false,
      checklist: [{ id: 'sessions', label: '2 sessions attended', state: 'done' }, { id: 'contract', label: 'Contract starts Mar 1', state: 'todo' }],
    },
    loading: false,
    error: null,
  };
  afterEach(() => { delete process.env.REACT_APP_CONTRACT_ENABLED; });

  test('off, parent and staff: no Start card, no tier, no Board stat, no contract history or checklist row', async () => {
    for (const role of ['parent', 'ops']) {
      mockDetail = full;
      const r = await renderScreen(<AthleteDetail bare athleteId="a1" role={role} onBack={() => {}} />);
      expect(r.text()).not.toContain('Start a contract');
      expect(r.text()).not.toContain('Commitment Contract');
      expect(r.text()).toContain('Enrolled Nov 3 · 12 tokens package');
      expect(r.text()).not.toContain('min tier');
      expect(r.text()).toContain('attendance since Nov');
      expect(r.text()).not.toContain('months on the Board');
      expect(r.text()).not.toContain('Contract history');
      await r.unmount();
      mockDetail = limited;
      const l = await renderScreen(<AthleteDetail bare athleteId="a1" role={role} onBack={() => {}} />);
      expect(l.text()).toContain('2 sessions attended');
      expect(l.text()).not.toContain('Contract starts Mar 1');
      expect(l.text()).toContain('Attendance and progress summaries need about a');
      expect(l.text()).not.toMatch(/contract/i);
      await l.unmount();
    }
  });

  test("off: the harness's noTier still forces the Start card", async () => {
    mockDetail = full;
    const r = await renderScreen(<AthleteDetail bare athleteId="a1" role="parent" noTier />);
    expect(r.text()).toContain('Start a contract');
    await r.unmount();
  });

  test('on: everything is back, unchanged', async () => {
    process.env.REACT_APP_CONTRACT_ENABLED = 'true';
    mockDetail = full;
    const r = await renderScreen(<AthleteDetail bare athleteId="a1" role="parent" onBack={() => {}} />);
    expect(r.text()).toContain('Start a contract');
    expect(r.text()).toContain('Enrolled Nov 3 · 45 min tier · 12 tokens package');
    expect(r.text()).toContain('months on the Board');
    expect(r.text()).toContain('Contract history');
    await r.unmount();
    mockDetail = limited;
    const l = await renderScreen(<AthleteDetail bare athleteId="a1" role="parent" onBack={() => {}} />);
    expect(l.text()).toContain('Contract starts Mar 1');
    expect(l.text()).toContain('Attendance, contract history, and progress summaries');
    await l.unmount();
  });
});

// Owner ruling 2026-10-02: ops and owner set or correct the handicap a
// reserved block is booked on; a coach, a parent and an athlete never do.
describe('the staff handicap edit', () => {
  const athlete = { name: 'Jordan', subline: 'Age 14', contractMinutes: 45, packageId: 't-12', householdId: 'h1', handicap: 14 };
  const detail = (over = {}) => ({ data: { athlete: { ...athlete, ...over }, history: [], checklist: [], hasEnoughData: false }, loading: false, error: null });
  beforeEach(() => { mockSetHandicap = jest.fn(async (args) => args); });

  test('ops and owner see the value on file and can change it; the write names this athlete', async () => {
    for (const role of ['ops', 'owner']) {
      mockDetail = detail();
      mockSetHandicap.mockClear();
      const r = await renderScreen(<AthleteDetail bare athleteId="a1" role={role} backLabel="Admin" onBack={() => {}} />);
      expect(r.text()).toContain('On file14');
      await r.fill('Set handicap', '5');
      await r.click('Save handicap');
      expect(mockSetHandicap).toHaveBeenCalledTimes(1);
      expect(mockSetHandicap).toHaveBeenCalledWith({ athleteId: 'a1', handicap: 5 });
      expect(r.text()).toContain('Handicap saved');
      expect(r.text()).toContain('On file5');
      await r.unmount();
    }
  });

  test('none on file reads None', async () => {
    mockDetail = detail({ handicap: null });
    const r = await renderScreen(<AthleteDetail bare athleteId="a1" role="ops" backLabel="Admin" onBack={() => {}} />);
    expect(r.text()).toContain('On fileNone');
    await r.unmount();
  });

  test('a coach, a mental coach, a parent and an athlete see no handicap edit', async () => {
    mockDetail = detail();
    for (const role of ['coach', 'mental', 'parent', 'athlete']) {
      const r = await renderScreen(<AthleteDetail bare athleteId="a1" role={role} onBack={() => {}} />);
      expect(r.container.querySelector('[aria-label="Set handicap"]')).toBeNull();
      expect(r.button('Save handicap')).toBeNull();
      expect(r.text()).not.toContain('On file');
      await r.unmount();
    }
    expect(mockSetHandicap).not.toHaveBeenCalled();
  });
});

// Owner ruling 2026-10-02: every list of sessions staff read shows the reserved tag - here it sits under the handicap
// edit, so a booking kept on a block the athlete no longer qualifies for is not missed.
test('Scheduled sessions: a handicap-reserved block carries the tag, an open one does not', async () => {
  const athlete = { name: 'Jordan', subline: 'Age 14', contractMinutes: null, packageId: 't-12', householdId: 'h1', handicap: 9, attendance: '94%', attendanceLabel: 'attendance since Nov' };
  const upcoming = [
    { id: 'b1', dayLabel: 'Tuesday, Nov 17', time: '3:00 PM', name: 'Training block', status: 'confirmed', maxHandicap: 5 },
    { id: 'b2', dayLabel: 'Tuesday, Nov 17', time: '4:00 PM', name: 'Training block', status: 'confirmed', maxHandicap: null },
    { id: 'b3', dayLabel: 'Wednesday, Nov 18', time: '4:00 PM', name: 'Training block', status: 'confirmed' },
  ];
  mockDetail = { data: { athlete, upcoming, history: [], checklist: [], hasEnoughData: true }, loading: false, error: null };
  mockSetHandicap = jest.fn();
  for (const role of ['ops', 'owner', 'coach', 'parent']) {
    const r = await renderScreen(<AthleteDetail bare athleteId="a1" role={role} backLabel="Admin" onBack={() => {}} />);
    expect(r.text()).toContain('Scheduled sessions · 3');
    expect(r.text()).toContain('Training blockHandicap 5 or betterTuesday, Nov 17 · 3:00 PMConfirmed');
    expect(r.text().match(/Handicap 5 or better/g)).toHaveLength(1);
    expect(r.text()).toContain('Training blockTuesday, Nov 17 · 4:00 PMConfirmed');
    expect(r.text()).toContain('Training blockWednesday, Nov 18 · 4:00 PMConfirmed');
    await r.unmount();
  }
});
