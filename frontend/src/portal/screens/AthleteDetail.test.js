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
