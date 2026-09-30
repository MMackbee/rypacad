import React from 'react';
import { renderScreen } from './testRender';
import AthleteDetail from './AthleteDetail';

let mockDetail;
jest.mock('../hooks', () => ({
  useAthleteDetail: () => mockDetail,
  // No useHousehold mock on purpose (perf wave B): the back label comes off
  // useAthleteDetail's householdName, and a stray second load would crash here.
  useDiagnostic: () => ({ data: null, loading: false, error: null }),
  useAthleteTier: () => ({ setTier: async () => {} }),
  useAssignPackages: () => ({ assign: async () => {} }),
  useHouseholdSettings: () => ({ saving: false }),
  useIssueTokens: () => ({ issue: async () => {} }),
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
