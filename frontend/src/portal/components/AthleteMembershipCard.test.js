import React from 'react';
import { renderScreen } from '../screens/testRender';
import AthleteMembershipCard from './AthleteMembershipCard';

// Owner ruling 2026-09-30: facility access is the FAMILY's - one add-on or a
// live Elite membership covers every athlete in the household - so the staff
// card reads the household, not one athlete's flag, and names the source.
let mockFamily;
const mockAsked = [];
jest.mock('../hooks', () => ({
  useAssignPackages: () => ({ assign: async () => {} }),
  useHouseholdSettings: () => ({ saving: false }),
  useIssueTokens: () => ({ issue: async () => {} }),
}));
jest.mock('../hooks/billing', () => ({ __esModule: true, useHouseholdFacility: (id) => { mockAsked.push(id); return mockFamily; } }));

const athlete = (over) => ({ packageId: 't-6', householdId: 'h1', facilityAccess: false, facilityAccessConsent: null, periodAnchorDay: 1, ...over });
const loaded = (data) => ({ data, loading: false, error: null });
beforeEach(() => { mockAsked.length = 0; });

test('read-only (coach, mental): every athlete of a covered household reads Yes, with the source', async () => {
  mockFamily = loaded({ access: true, source: 'add-on', holderId: 'sibling', eliteId: null });
  const addOn = await renderScreen(<AthleteMembershipCard athleteId="a1" athlete={athlete()} role="mental" />);
  expect(addOn.text()).toContain('Facility accessYes - family add-on');
  await addOn.unmount();
  mockFamily = loaded({ access: true, source: 'elite', holderId: null, eliteId: 'sibling' });
  const elite = await renderScreen(<AthleteMembershipCard athleteId="a1" athlete={athlete()} role="coach" />);
  expect(elite.text()).toContain('Facility accessYes - Elite');
  await elite.unmount();
  mockFamily = loaded({ access: false, source: null, holderId: null, eliteId: null });
  const none = await renderScreen(<AthleteMembershipCard athleteId="a1" athlete={athlete()} role="mental" />);
  expect(none.text()).toContain('Facility accessNo');
  expect(mockAsked).toContain('h1');
  await none.unmount();
});

test('the household did not load (a coach cannot list it): the athlete\'s own flag still answers', async () => {
  mockFamily = { data: null, loading: false, error: new Error('permission-denied') };
  const on = await renderScreen(<AthleteMembershipCard athleteId="a1" athlete={athlete({ facilityAccess: true })} role="coach" />);
  expect(on.text()).toContain('Facility accessYes - family add-on');
  await on.unmount();
  const off = await renderScreen(<AthleteMembershipCard athleteId="a1" athlete={athlete()} role="coach" />);
  expect(off.text()).toContain('Facility accessNo');
  await off.unmount();
  // So does the athlete's own Elite membership, once it is paid (review 2026-09-30). A sibling's cover still cannot be seen here.
  const elite = await renderScreen(<AthleteMembershipCard athleteId="a1" athlete={athlete({ packageId: 'elite', billingStatus: 'past_due' })} role="coach" />);
  expect(elite.text()).toContain('Facility accessYes - Elite');
  await elite.unmount();
  const due = await renderScreen(<AthleteMembershipCard athleteId="a1" athlete={athlete({ packageId: 'elite', billingStatus: 'pending' })} role="coach" />);
  expect(due.text()).toContain('Facility accessNo');
  await due.unmount();
});

test('the editor (ops, owner) shows the family\'s access beside its own switch; a parent sees no card and asks for nothing', async () => {
  mockFamily = loaded({ access: true, source: 'elite', holderId: null, eliteId: 'sibling' });
  const ops = await renderScreen(<AthleteMembershipCard athleteId="a1" athlete={athlete()} role="ops" />);
  expect(ops.text()).toContain('Family facility accessYes - Elite');
  await ops.unmount();
  mockAsked.length = 0;
  const parent = await renderScreen(<AthleteMembershipCard athleteId="a1" athlete={athlete()} role="parent" />);
  expect(parent.text()).toBe('');
  expect(mockAsked).toEqual([null]);
  await parent.unmount();
});
