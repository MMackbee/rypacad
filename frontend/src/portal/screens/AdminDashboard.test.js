import React from 'react';
import { renderScreen } from './testRender';
import AdminDashboard, { outstandingSummary } from './AdminDashboard';

let mockOutstanding = [];
// The week's handicap-reserved blocks; undefined is a payload from before the field existed.
let mockReserved;
// Package rows for the tier filter; empty means the filter has only "All tiers".
let mockEnrollment = [];
jest.mock('../hooks', () => ({
  useAdminDashboard: () => ({ data: { outstanding: mockOutstanding, metrics: { enrolled: 3, enrolledLabel: 'enrolled athletes', fill: '50%', fillLabel: 'fill' }, enrollment: mockEnrollment, blockFill: [], reservedBlocks: mockReserved, membership: { active: 2, pastDue: 0, lapsed: 0, pending: 1, lapsedHouseholds: [] } } }),
  useSignups: () => ({ loading: false, error: null, data: { counts: { all: 2, unpaid: 1, flagged: 0, unresolved: 1 }, unresolved: [{ id: 'c9', outcome: 'unresolved', receivedAt: '2026-11-06T09:00' }], rows: [] } }),
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));
jest.mock('../hooks/mentalConsentStaff', () => ({ useConsentTracker: () => ({ data: [], loading: false, error: null }) }));

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
  // The rows sit behind the Outstanding fold (owner 2026-11-13): open it.
  beforeEach(() => { mockOutstanding = rows; window.localStorage.setItem('ryp.admin.outstandingOpen', '1'); });
  afterEach(() => { mockOutstanding = []; delete process.env.REACT_APP_CONTRACT_ENABLED; window.localStorage.clear(); });

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

// Owner 2026-11-13: early in the season nearly every athlete is "Baseline due", so the card folds
// to one line that says what is in it, and the open/closed choice is remembered on the device.
describe('Outstanding folds (owner 2026-11-13)', () => {
  const KEY = 'ryp.admin.outstandingOpen';
  const rows = [
    { id: 'baseline-a2', kind: 'baseline', athleteId: 'a2', who: 'Ava Moreno', why: 'Baseline due', tag: 'Assessment', tone: 'yellow', packageIds: null },
    { id: 'noshow-a1', kind: 'noshow', athleteId: 'a1', who: 'M. Okonkwo', why: '3 no-shows this month', tag: 'Attendance', tone: 'red', packageIds: null },
    { id: 'enrollment-pending', kind: 'enrollment', athleteId: null, who: '2 pending enrollments', why: 'Awaiting review in the enrollment queue', tag: 'Enrollment', tone: 'yellow', packageIds: null },
  ];
  const names = ['Ava Moreno', 'M. Okonkwo', '2 pending enrollments'];
  const fold = (r) => r.container.querySelector('button[aria-controls="outstanding-rows"]');
  const tap = (r) => r.act(() => fold(r).click());

  beforeEach(() => { mockOutstanding = rows; window.localStorage.clear(); });
  afterEach(() => { mockOutstanding = []; mockEnrollment = []; window.localStorage.clear(); jest.restoreAllMocks(); });

  test('first visit: closed - "Outstanding · 3", the summary by tag, no row names', async () => {
    const r = await renderScreen(<AdminDashboard bare role="owner" onOpenAthlete={() => {}} />);
    expect(r.text()).toContain('Outstanding · 3');
    expect(r.text()).toContain('Enrollment 1 · Attendance 1 · Assessment 1');
    for (const name of names) expect(r.text()).not.toContain(name);
    expect(fold(r).getAttribute('aria-expanded')).toBe('false');
    expect(fold(r).textContent).toContain('Outstanding · 3');
    expect(r.container.querySelector('#outstanding-rows')).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
    await r.unmount();
  });

  test('tap the heading: the rows appear and "1" is stored; tap again: "0" and the rows go', async () => {
    const opened = [];
    const r = await renderScreen(<AdminDashboard bare role="owner" onOpenAthlete={(id) => opened.push(id)} />);
    await tap(r);
    expect(fold(r).getAttribute('aria-expanded')).toBe('true');
    expect(r.container.querySelector('#outstanding-rows')).not.toBeNull();
    for (const name of names) expect(r.text()).toContain(name);
    expect(r.text()).toContain('3 no-shows this month');
    expect(window.localStorage.getItem(KEY)).toBe('1');
    // The rows work exactly as before: a name opens the athlete.
    await r.click('M. Okonkwo');
    expect(opened).toEqual(['a1']);
    await tap(r);
    expect(fold(r).getAttribute('aria-expanded')).toBe('false');
    for (const name of names) expect(r.text()).not.toContain(name);
    expect(window.localStorage.getItem(KEY)).toBe('0');
    await r.unmount();
  });

  test('stored "1": opens on mount; stored "0" or a garbage value: closed', async () => {
    window.localStorage.setItem(KEY, '1');
    const open = await renderScreen(<AdminDashboard bare role="owner" />);
    expect(fold(open).getAttribute('aria-expanded')).toBe('true');
    for (const name of names) expect(open.text()).toContain(name);
    await open.unmount();
    for (const stored of ['0', 'true', '']) {
      window.localStorage.setItem(KEY, stored);
      const closed = await renderScreen(<AdminDashboard bare role="owner" />);
      expect(fold(closed).getAttribute('aria-expanded')).toBe('false');
      expect(closed.text()).not.toContain('M. Okonkwo');
      await closed.unmount();
    }
  });

  test('storage that throws: the card renders closed and still opens and closes', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const r = await renderScreen(<AdminDashboard bare role="owner" />);
    expect(fold(r).getAttribute('aria-expanded')).toBe('false');
    expect(r.text()).not.toContain('M. Okonkwo');
    await tap(r);
    expect(r.text()).toContain('M. Okonkwo');
    await tap(r);
    expect(r.text()).not.toContain('M. Okonkwo');
    await r.unmount();
  });

  test('zero rows: "Outstanding · 0" as today, no button, no summary', async () => {
    mockOutstanding = [];
    const r = await renderScreen(<AdminDashboard bare role="owner" />);
    expect(r.text()).toContain('Outstanding · 0');
    expect(fold(r)).toBeNull();
    expect(r.container.querySelector('[aria-expanded]')).toBeNull();
    expect(r.text()).not.toMatch(/Enrollment \d|Attendance \d|Assessment \d/);
    await r.unmount();
  });

  test('ops sees the same fold', async () => {
    const r = await renderScreen(<AdminDashboard bare role="ops" />);
    expect(r.text()).toContain('Outstanding · 3');
    expect(r.text()).toContain('Enrollment 1 · Attendance 1 · Assessment 1');
    expect(r.text()).not.toContain('M. Okonkwo');
    await tap(r);
    expect(r.text()).toContain('M. Okonkwo');
    expect(window.localStorage.getItem(KEY)).toBe('1');
    await r.unmount();
  });

  test('the tier filter and the summary agree: both count only the filtered rows', async () => {
    mockOutstanding = [
      ...rows,
      { id: 'noshow-a5', kind: 'noshow', athleteId: 'a5', who: 'Cal Duarte', why: '2 no-shows this month', tag: 'Attendance', tone: 'red', packageIds: ['t-4'] },
    ];
    mockEnrollment = [{ id: 't-4', name: '4 tokens', athletes: 1 }, { id: 't-8', name: '8 tokens', athletes: 3 }];
    const r = await renderScreen(<AdminDashboard bare role="owner" variant="filtered" />);
    expect(r.text()).toContain('Outstanding · 3');
    expect(r.text()).toContain('Enrollment 1 · Attendance 1 · Assessment 1');
    await r.unmount();
    const all = await renderScreen(<AdminDashboard bare role="owner" />);
    expect(all.text()).toContain('Outstanding · 4');
    expect(all.text()).toContain('Enrollment 1 · Attendance 2 · Assessment 1');
    await all.unmount();
  });
});

describe('outstandingSummary', () => {
  test('each tag with rows, in the order Enrollment, Attendance, Fitness, Contract, Assessment', () => {
    const row = (tag) => ({ tag });
    expect(outstandingSummary([])).toBe('');
    expect(outstandingSummary(undefined)).toBe('');
    expect(outstandingSummary([row('Assessment'), row('Attendance'), row('Assessment'), row('Enrollment')]))
      .toBe('Enrollment 1 · Attendance 1 · Assessment 2');
    expect(outstandingSummary([row('Assessment'), row('Contract'), row('Attendance')]))
      .toBe('Attendance 1 · Contract 1 · Assessment 1');
    expect(outstandingSummary([...Array(28)].map(() => row('Assessment')))).toBe('Assessment 28');
    // Owner 2026-11-13: the "Fitness with no golf" rows read right after Attendance.
    expect(outstandingSummary([row('Assessment'), row('Fitness'), row('Contract'), row('Fitness'), row('Attendance'), row('Enrollment')]))
      .toBe('Enrollment 1 · Attendance 1 · Fitness 2 · Contract 1 · Assessment 1');
    expect(outstandingSummary([row('Assessment'), row('Fitness')])).toBe('Fitness 1 · Assessment 1');
  });

  test('a tag outside the five (the seed\'s Billing) follows them, so the counts still add up', () => {
    expect(outstandingSummary([{ tag: 'Billing' }, { tag: 'Assessment' }, { tag: 'Attendance' }]))
      .toBe('Attendance 1 · Assessment 1 · Billing 1');
    expect(outstandingSummary([{ tag: 'Billing' }, { tag: 'Fitness' }, { tag: 'Assessment' }]))
      .toBe('Fitness 1 · Assessment 1 · Billing 1');
  });
});

// Owner 2026-11-13: "yes add a warning row for fitness no golf". The row names a session, not an
// athlete, so it is plain text, and its packageIds are null, so every tier filter keeps it.
describe('the "Fitness with no golf" row (owner 2026-11-13)', () => {
  const FITNESS_WHO = 'Fitness with no golf · Wed Nov 25, 6:00 PM';
  const rows = [
    { id: 'noshow-a1', kind: 'noshow', athleteId: 'a1', who: 'M. Okonkwo', why: '3 no-shows this month', tag: 'Attendance', tone: 'red', packageIds: null },
    { id: 'fitness-p1', kind: 'fitness', athleteId: null, who: FITNESS_WHO, why: '2 booked · the golf block at this time is hidden', tag: 'Fitness', tone: 'red', packageIds: null },
    { id: 'baseline-a2', kind: 'baseline', athleteId: 'a2', who: 'Ava Moreno', why: 'Baseline due', tag: 'Assessment', tone: 'yellow', packageIds: ['t-4'] },
  ];
  beforeEach(() => { mockOutstanding = rows; window.localStorage.setItem('ryp.admin.outstandingOpen', '1'); });
  afterEach(() => { mockOutstanding = []; mockEnrollment = []; window.localStorage.clear(); });

  test('owner and ops: counted after Attendance, shown as plain text with its reason', async () => {
    for (const role of ['owner', 'ops']) {
      const r = await renderScreen(<AdminDashboard bare role={role} onOpenAthlete={() => {}} />);
      expect(r.text()).toContain('Outstanding · 3');
      expect(r.text()).toContain('Attendance 1 · Fitness 1 · Assessment 1');
      expect(r.text()).toContain(FITNESS_WHO);
      expect(r.text()).toContain('2 booked · the golf block at this time is hidden');
      expect(r.text()).toContain('Fitness');
      expect(r.button(FITNESS_WHO)).toBeNull();
      expect(r.button('M. Okonkwo')).not.toBeNull();
      await r.unmount();
    }
  });

  test('a tier filter keeps it', async () => {
    mockEnrollment = [{ id: 't-4', name: '4 tokens', athletes: 1 }, { id: 't-8', name: '8 tokens', athletes: 3 }];
    const r = await renderScreen(<AdminDashboard bare role="owner" variant="filtered" />);
    expect(r.text()).toContain('Outstanding · 2');
    expect(r.text()).toContain('Attendance 1 · Fitness 1');
    expect(r.text()).toContain(FITNESS_WHO);
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

test('the Assessments card opens the assessments screen; it is hidden without a destination', async () => {
  const opened = [];
  const r = await renderScreen(<AdminDashboard bare role="owner" onOpenAssessments={() => opened.push(1)} />);
  await r.click('Open assessments');
  expect(opened).toEqual([1]);
  await r.unmount();
  const none = await renderScreen(<AdminDashboard bare role="owner" />);
  expect(none.button('Open assessments')).toBeNull();
  await none.unmount();
});
