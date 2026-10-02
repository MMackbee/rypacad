import React from 'react';
import { renderScreen } from './testRender';
import AdminDashboard from './AdminDashboard';

let mockOutstanding = [];
// The week's handicap-reserved blocks; undefined is a payload from before the field existed.
let mockReserved;
jest.mock('../hooks', () => ({
  useAdminDashboard: () => ({ data: { outstanding: mockOutstanding, metrics: { enrolled: 3, enrolledLabel: 'enrolled athletes', fill: '50%', fillLabel: 'fill' }, enrollment: [], blockFill: [], reservedBlocks: mockReserved, membership: { active: 2, pastDue: 0, lapsed: 0, pending: 1, lapsedHouseholds: [] } } }),
  useSignups: () => ({ loading: false, error: null, data: { counts: { all: 2, unpaid: 1, flagged: 0, unresolved: 1 }, unresolved: [{ id: 'c9', outcome: 'unresolved', receivedAt: '2026-11-06T09:00' }], rows: [] } }),
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));

test('the Sign-ups card replaces the enrollment queue; Pending is a stat; unmatched bookings count as flagged', async () => {
  const opened = [];
  const r = await renderScreen(<AdminDashboard bare role="owner" onOpenSignups={() => opened.push(1)} />);
  expect(r.text()).toContain('Sign-ups · 1 unpaid');
  expect(r.text()).toContain('2 self-signed households · 1 flagged');
  expect(r.text()).not.toContain('Enrollment queue');
  expect(r.text()).toContain('Pending');
  expect(r.text()).not.toContain('Approve');
  await r.click('Open sign-ups');
  expect(opened).toEqual([1]);
  await r.unmount();
});

describe('Commitment Contract hidden (owner ruling 2026-09-30)', () => {
  const rows = [
    { id: 'noshow-a1', kind: 'noshow', athleteId: 'a1', who: 'M. Okonkwo', why: '3 no-shows this month', tag: 'Attendance', tone: 'red', packageIds: null },
    { id: 'contract-a2', kind: 'contract', athleteId: 'a2', who: 'R. Sandoval', why: 'Contract behind — 6 days missed, 4 left', tag: 'Contract', tone: 'yellow', packageIds: null },
  ];
  beforeEach(() => { mockOutstanding = rows; });
  afterEach(() => { mockOutstanding = []; delete process.env.REACT_APP_CONTRACT_ENABLED; });

  test('off: "Who needs a call" drops the contract rows and the CONTRACT chip', async () => {
    const r = await renderScreen(<AdminDashboard bare role="owner" />);
    expect(r.text()).toContain('Outstanding · 1');
    expect(r.text()).toContain('M. Okonkwo');
    expect(r.text()).not.toContain('R. Sandoval');
    expect(r.text()).not.toContain('Contract');
    await r.unmount();
  });

  test('on: the contract row and chip are back', async () => {
    process.env.REACT_APP_CONTRACT_ENABLED = 'true';
    const r = await renderScreen(<AdminDashboard bare role="owner" />);
    expect(r.text()).toContain('Outstanding · 2');
    expect(r.text()).toContain('Contract behind — 6 days missed, 4 left');
    expect(r.text()).toContain('Contract');
    await r.unmount();
  });
});

// Owner ruling 2026-10-02: the week's handicap-reserved blocks sit under the block-fill bars with the tag families see.
describe('handicap-reserved blocks on Block fill', () => {
  afterEach(() => { mockReserved = undefined; });

  test('each reserved block is a row: day, time, the tag and its bookings', async () => {
    mockReserved = [{ sessionId: '2026-11-03-0', date: '2026-11-03', day: 'Tue', time: '3:00 PM', maxHandicap: 5, booked: 2, capacity: 6 }];
    const r = await renderScreen(<AdminDashboard bare role="ops" />);
    expect(r.text()).toContain('Block fill this weekTue 3:00 PMHandicap 5 or better2 of 6 booked');
    await r.unmount();
  });

  test('no reserved block this week, or a payload without the field: the card is as it was', async () => {
    const drawn = [];
    for (const blocks of [[], undefined]) {
      mockReserved = blocks;
      const r = await renderScreen(<AdminDashboard bare role="ops" />);
      expect(r.text()).not.toContain('Handicap');
      drawn.push(r.container.innerHTML);
      await r.unmount();
    }
    expect(drawn[0]).toBe(drawn[1]);
  });
});
