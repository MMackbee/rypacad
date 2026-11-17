/**
 * Admin's athlete rows open the family page directly (speed review,
 * 2026-11-17). An Outstanding or consent-tracker row that knows its family
 * hands the route { athleteId, householdId }, so it lands on
 * /portal/admin/households/:id?athlete= without StaffAthleteRedirect
 * building the athlete's whole staff model just to find the household. A row
 * with no family on it still hands over the id, for the redirect.
 */
import React from 'react';
import { renderScreen } from './testRender';
import AdminDashboard from './AdminDashboard';

const ROWS = [
  { id: 'noshow-a1', kind: 'noshow', athleteId: 'a1', householdId: 'whitfield', who: 'Jordan Whitfield', why: '2 no-shows this month', tag: 'Attendance', tone: 'red', packageIds: null },
  { id: 'noshow-gone', kind: 'noshow', athleteId: 'gone', householdId: null, who: 'gone', why: '1 no-show this month', tag: 'Attendance', tone: 'red', packageIds: null },
];
const TRACKER = [
  { athleteId: 'reese', householdId: 'whitfield', name: 'Reese Whitfield', familyName: 'Whitfield family', nextMental: '2026-11-12', lastMental: null, status: 'unsigned', label: 'Not signed' },
  { athleteId: 'nico', name: 'Nico Whitfield', familyName: null, nextMental: null, lastMental: '2026-10-29', status: 'unsigned', label: 'Not signed' },
];
jest.mock('../hooks', () => ({
  useAdminDashboard: () => ({
    data: { outstanding: ROWS, metrics: null, enrollment: [], blockFill: [], reservedBlocks: [], membership: null },
    loading: false,
    error: null,
    status: { outstanding: { loading: false, error: null } },
  }),
  useSignups: () => ({ loading: false, error: null, data: { counts: { all: 0, unpaid: 0, flagged: 0, unresolved: 0 }, unresolved: [], rows: [] } }),
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));
jest.mock('../hooks/mentalConsentStaff', () => ({ useConsentTracker: () => ({ data: TRACKER, loading: false, error: null }) }));

beforeEach(() => { window.localStorage.setItem('ryp.admin.outstandingOpen', '1'); });
afterEach(() => { window.localStorage.clear(); });

test('an Outstanding row with its family opens the family page; one without hands over the id', async () => {
  const opened = [];
  const r = await renderScreen(<AdminDashboard bare role="owner" onOpenAthlete={(target) => opened.push(target)} />);
  await r.click('Jordan Whitfield');
  await r.click('gone');
  expect(opened).toEqual([{ athleteId: 'a1', householdId: 'whitfield' }, 'gone']);
  await r.unmount();
});

test('a consent-tracker row with its family opens the family page; one without hands over the id', async () => {
  const opened = [];
  const r = await renderScreen(<AdminDashboard bare role="ops" onOpenAthlete={(target) => opened.push(target)} />);
  await r.click('Reese Whitfield · Thu, Nov 12 · Not signed');
  await r.click('Nico Whitfield · last Oct 29 · Not signed');
  expect(opened).toEqual([{ athleteId: 'reese', householdId: 'whitfield' }, 'nico']);
  await r.unmount();
});
