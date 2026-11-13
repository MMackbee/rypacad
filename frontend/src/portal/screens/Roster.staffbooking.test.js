import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';

// Staff booking on the session roster (spec 01-spec-admin-booking.md 10.3,
// plan 04-plan-admin-booking.md Task E3): the owner or ops gets Add athlete
// beside Cancel session, and Move and Cancel under each Booked or No-show
// row; the sticky status line carries the success line. The mock block is
// Roster.bookchange.test.js's; the four sheets are stand-ins (Lane C and the
// staff cancel tests cover what is inside them).
let mockLive;
let mockStatus;
let mockUnresolved;
let mockRows;
let mockCount;
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false, error: null, retry: () => {} }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: mockRows,
    loading: false,
    error: null,
    mark: async () => {},
    setReason: async () => {},
    setSessionNote: async () => {},
    cancelSession: async () => {},
    sessionNote: null,
    sessionStatus: mockStatus,
    sessionMaxHandicap: null,
    sessionUnresolved: mockUnresolved,
    sessionBooked: mockCount ? mockCount.booked : null,
    sessionCapacity: mockCount ? mockCount.capacity : null,
  }),
  useTournamentResults: () => ({ data: null, loading: false, error: null, saveResults: async () => {} }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => mockLive }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: null, loading: false, error: null }) }));
jest.mock('../hooks/cancelledBookings', () => ({
  __esModule: true,
  useCancelledBookings: () => ({ data: [], loading: false, error: null }),
  markOrRecheck: async () => false,
}));
jest.mock('../components/staffBooking/AthletePicker', () => ({
  __esModule: true,
  default: (p) => (
    <div data-sheet="athlete" data-on-session={p.onSessionIds.join(',')} data-session={p.session.id} data-label={p.session.label}>
      <button type="button" onClick={() => p.onPick({ athleteId: 'a4', name: 'Casey Whitfield', test: false })}>pick</button>
      <button type="button" onClick={p.onClose}>close</button>
    </div>
  ),
}));
jest.mock('../components/staffBooking/StaffAddSheet', () => ({
  __esModule: true,
  default: (p) => (
    <div data-sheet="add" data-athlete={p.athleteId} data-name={p.name} data-session={p.sessionId}>
      <button type="button" onClick={() => p.onDone('Casey is booked for Tue Nov 17, 4:00 PM - 1 token used.')}>done</button>
    </div>
  ),
}));
jest.mock('../components/staffBooking/StaffMoveSheet', () => ({
  __esModule: true,
  default: (p) => (
    <div data-sheet="move" data-booking={p.row.id} data-session={p.row.sessionId} data-name={p.name}>
      <button type="button" onClick={() => p.onDone('Jordan moved to Thu Nov 19, 4:00 PM.')}>done</button>
    </div>
  ),
}));
jest.mock('../components/StaffCancelSheet', () => ({
  __esModule: true,
  default: (p) => (
    <div data-sheet="cancel" data-booking={p.row.id} data-member={p.member.athleteId} data-members={p.members.map((m) => m.athleteId).join(',')}>
      <button type="button" onClick={() => p.onCancelled('Cancelled · Sick - token back for Jordan.')}>done</button>
    </div>
  ),
}));

const row = (bookingId, athleteId, name, status, over = {}) => ({
  bookingId, athleteId, name, status, attendee: 'athlete', noshowReason: null,
  householdId: 'hh1', source: null, type: 'training', date: '2026-11-17', periodKey: null, chargedFrom: 'period', comp: false, graceTokenId: null, ...over,
});
const ROWS = [
  row('b1', 'a1', 'Jordan Whitfield', 'confirmed'),
  row('b2', 'a2', 'Riley Whitfield', 'noshow'),
  row('b3', 'a3', 'Casey Whitfield', 'attended', { householdId: 'hh2' }),
];
const BLOCK = { date: '2026-11-17', time: '4:00 PM', type: 'training', name: 'Training block', meta: '3 of 14 booked' };
const roster = (props = {}, block = BLOCK) =>
  renderScreen(<SessionAttendance bare sessionId="s2" block={block} role="owner" onBack={() => {}} {...props} />);
const sheet = (r) => r.container.querySelector('[data-sheet]');
const status = (r) => r.container.querySelector('[role="status"]');
/** The row buttons' accessible names: "Move Jordan", "Cancel Jordan's booking". */
const rowActions = (r) =>
  [...r.container.querySelectorAll('button[aria-label]')]
    .map((b) => b.getAttribute('aria-label'))
    .filter((l) => /^Move /.test(l) || /^Cancel .*'s booking$/.test(l));

beforeEach(() => {
  mockLive = true;
  mockStatus = 'scheduled';
  mockUnresolved = false;
  mockRows = ROWS;
  mockCount = null;
});

test('Add athlete beside Cancel session for the owner and ops', async () => {
  for (const props of [{ role: 'owner' }, { role: 'ops', readOnly: true }]) {
    const r = await roster(props);
    const add = r.button('Add athlete');
    const cancel = r.button('Cancel session');
    expect(add).not.toBeNull();
    expect(cancel).not.toBeNull();
    expect(add.parentElement).toBe(cancel.parentElement);
    expect(add.style.flex).toBe('1 1 0%');
    expect(cancel.style.flex).toBe('1 1 0%');
    expect(add.style.height).toBe('44px');
    await r.unmount();
  }
});

test('never for a coach or a mental account', async () => {
  for (const role of ['coach', 'mental']) {
    const r = await roster({ role });
    expect(r.button('Add athlete')).toBeNull();
    expect(rowActions(r)).toEqual([]);
    await r.unmount();
  }
});

test('none on a mental session, a cancelled one, a held Calendly slot or a typed URL with no session', async () => {
  const mental = await roster({}, { ...BLOCK, type: 'mental', name: 'Mental game' });
  expect(mental.button('Add athlete')).toBeNull();
  await mental.unmount();

  mockStatus = 'cancelled';
  const cancelled = await roster();
  expect(cancelled.button('Add athlete')).toBeNull();
  await cancelled.unmount();
  mockStatus = 'scheduled';

  mockUnresolved = true;
  const held = await roster();
  expect(held.button('Add athlete')).toBeNull();
  await held.unmount();
  mockUnresolved = false;

  // Live, but a typed /portal/attendance URL: no session id reaches the screen.
  const typed = await renderScreen(<SessionAttendance bare block={BLOCK} role="owner" onBack={() => {}} />);
  expect(typed.button('Add athlete')).toBeNull();
  await typed.unmount();
});

test('a past session still offers Add athlete', async () => {
  const r = await roster({}, { ...BLOCK, date: '2026-11-10' });
  expect(r.button('Add athlete')).not.toBeNull();
  await r.unmount();
});

test('no row actions in seed mode or on a typed URL', async () => {
  mockLive = false;
  const seed = await renderScreen(<SessionAttendance bare role="owner" onBack={() => {}} />);
  // The seed roster renders, with no staff actions on it.
  expect(seed.container.querySelectorAll('button[aria-pressed]').length).toBeGreaterThan(0);
  expect(rowActions(seed)).toEqual([]);
  expect(seed.button('Add athlete')).toBeNull();
  await seed.unmount();

  mockLive = true;
  const typed = await renderScreen(<SessionAttendance bare block={BLOCK} role="ops" onBack={() => {}} />);
  expect(rowActions(typed)).toEqual([]);
  await typed.unmount();
});

test('Move and Cancel under each confirmed or no-show row', async () => {
  const r = await roster({ role: 'ops', readOnly: true });
  expect(rowActions(r)).toEqual(['Move Jordan', "Cancel Jordan's booking", 'Move Riley', "Cancel Riley's booking"]);
  const move = r.button('Move Jordan');
  expect(move.style.height).toBe('44px');
  // None on the attended row.
  expect(r.button('Move Casey')).toBeNull();
  expect(r.button("Cancel Casey's booking")).toBeNull();
  await r.unmount();

  mockStatus = 'cancelled';
  const cancelled = await roster();
  expect(rowActions(cancelled)).toEqual([]);
  await cancelled.unmount();
  mockStatus = 'scheduled';

  const coach = await roster({ role: 'coach' });
  expect(rowActions(coach)).toEqual([]);
  await coach.unmount();
});

test('a period that is over', async () => {
  // October's period is over on any later date: no Move or Cancel, while
  // Add athlete still shows (the server judges the add).
  mockRows = ROWS.map((r) => ({ ...r, date: '2026-10-27', periodKey: '2026-10-01' }));
  const r = await roster({}, { ...BLOCK, date: '2026-10-27' });
  expect(rowActions(r)).toEqual([]);
  expect(r.button('Add athlete')).not.toBeNull();
  await r.unmount();
});

test('Add athlete: pick, then confirm', async () => {
  const r = await roster();
  expect(sheet(r)).toBeNull();
  await r.click('Add athlete');
  expect(sheet(r).getAttribute('data-sheet')).toBe('athlete');
  expect(sheet(r).getAttribute('data-on-session')).toBe('a1,a2,a3');
  expect(sheet(r).getAttribute('data-session')).toBe('s2');
  expect(sheet(r).getAttribute('data-label')).toBe('Training block');
  await r.click('pick');
  expect(sheet(r).getAttribute('data-sheet')).toBe('add');
  expect(sheet(r).getAttribute('data-athlete')).toBe('a4');
  expect(sheet(r).getAttribute('data-name')).toBe('Casey Whitfield');
  expect(sheet(r).getAttribute('data-session')).toBe('s2');
  await r.click('done');
  expect(sheet(r)).toBeNull();
  expect(status(r).textContent).toBe('Casey is booked for Tue Nov 17, 4:00 PM - 1 token used.');
  await r.unmount();
});

test('the status line carries the success line', async () => {
  const r = await roster();
  await r.click('Move Jordan');
  expect(sheet(r).getAttribute('data-sheet')).toBe('move');
  expect(sheet(r).getAttribute('data-booking')).toBe('b1');
  expect(sheet(r).getAttribute('data-session')).toBe('s2');
  expect(sheet(r).getAttribute('data-name')).toBe('Jordan Whitfield');
  await r.click('done');
  expect(sheet(r)).toBeNull();
  expect(status(r).textContent).toBe('Jordan moved to Thu Nov 19, 4:00 PM.');

  // Cancel: the household's own roster rows are the sheet's members.
  await r.click("Cancel Jordan's booking");
  expect(sheet(r).getAttribute('data-sheet')).toBe('cancel');
  expect(sheet(r).getAttribute('data-booking')).toBe('b1');
  expect(sheet(r).getAttribute('data-member')).toBe('a1');
  expect(sheet(r).getAttribute('data-members')).toBe('a1,a2');
  await r.click('done');
  expect(sheet(r)).toBeNull();
  expect(status(r).textContent).toBe('Cancelled · Sick - token back for Jordan.');
  await r.unmount();
});

test('the header count is the session as it is now, not the count the tap carried', async () => {
  // Walkthrough 2026-11-13: after a staff add the header still read the
  // Today tab's count ("1 of 12 booked" with two rows showing). Every staff
  // change bumps 'sessions', and the hook re-reads the session doc.
  // A new element each time: React skips a re-render of the same one.
  const el = () => <SessionAttendance bare sessionId="s2" block={BLOCK} role="owner" onBack={() => {}} />;
  const r = await roster();
  // Before the doc is read: the count the tap carried.
  expect(r.text()).toContain('4:00 PM · 3 of 14 booked');
  mockCount = { booked: 4, capacity: 14 };
  await r.rerender(el());
  expect(r.text()).toContain('4:00 PM · 4 of 14 booked');
  expect(r.text()).not.toContain('3 of 14 booked');
  // While the next read is in flight the last count stays.
  mockCount = null;
  await r.rerender(el());
  expect(r.text()).toContain('4:00 PM · 4 of 14 booked');
  mockCount = { booked: 3, capacity: 14 };
  await r.rerender(el());
  expect(r.text()).toContain('4:00 PM · 3 of 14 booked');
  await r.unmount();

  // A header the tap gave no count (Yannick's and Phil's sessions) gets none.
  mockCount = { booked: 1, capacity: 1 };
  const plain = await roster({}, { ...BLOCK, meta: null });
  expect(plain.text()).not.toContain('booked');
  await plain.unmount();
});

test('opening any staff sheet clears the status line', async () => {
  // The line is sticky with z-index 1: left up, it would paint over the next
  // sheet and take its taps (review 2026-11-13). Billing clears its line the
  // same way.
  const r = await roster();
  await r.click('Move Jordan');
  await r.click('done');
  expect(status(r).textContent).toBe('Jordan moved to Thu Nov 19, 4:00 PM.');

  await r.click('Add athlete');
  expect(sheet(r).getAttribute('data-sheet')).toBe('athlete');
  expect(status(r)).toBeNull();
  await r.click('pick');
  await r.click('done');
  expect(status(r).textContent).toBe('Casey is booked for Tue Nov 17, 4:00 PM - 1 token used.');

  await r.click('Move Riley');
  expect(sheet(r).getAttribute('data-sheet')).toBe('move');
  expect(status(r)).toBeNull();
  await r.click('done');
  expect(status(r).textContent).toBe('Jordan moved to Thu Nov 19, 4:00 PM.');

  await r.click("Cancel Riley's booking");
  expect(sheet(r).getAttribute('data-sheet')).toBe('cancel');
  expect(status(r)).toBeNull();
  await r.unmount();
});
