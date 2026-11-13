/**
 * One athlete's bookings, staff view (Task E5, spec 01-spec-admin-booking.md
 * 10.2): the header, the token line, Book a session and Family billing,
 * the rows grouped this period, next period and later, each with its badge
 * and the Move and Cancel it allows, the test athlete card and the missing
 * athlete line. The model is the real staffAthleteModel; the three sheets
 * are stand-ins (Lane C and the staff cancel tests cover what is inside).
 * NOW is noon Chicago, Thu Nov 12. Plain functions, not jest.fn().
 */
jest.mock('../hooks/staffBooking', () => ({
  useStaffAthlete: (id) => {
    mockAsked.push(id);
    return mockAthlete;
  },
}));
jest.mock('../components/staffBooking/StaffAddSheet', () => ({
  __esModule: true,
  default: (p) => (
    <div data-sheet="add" data-athlete={p.athleteId} data-name={p.name} data-session={p.sessionId ?? ''}>
      <button type="button" onClick={() => p.onDone('Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used.')}>done</button>
      <button type="button" onClick={p.onClose}>close</button>
    </div>
  ),
}));
jest.mock('../components/staffBooking/StaffMoveSheet', () => ({
  __esModule: true,
  default: (p) => (
    <div data-sheet="move" data-booking={p.row.id} data-name={p.name}>
      <button type="button" onClick={() => p.onDone('Jordan moved to Thu Nov 19, 4:00 PM.')}>done</button>
      <button type="button" onClick={p.onClose}>close</button>
    </div>
  ),
}));
jest.mock('../components/StaffCancelSheet', () => ({
  __esModule: true,
  default: (p) => (
    <div
      data-sheet="cancel"
      data-booking={p.row.id}
      data-member={`${p.member.athleteId}|${p.member.name}`}
      data-members={JSON.stringify(p.members.map((m) => ({ athleteId: m.athleteId, name: m.name, spent: m.spent.map((r) => r.id), reserved: m.reserved, period: m.period })))}
    >
      <button type="button" onClick={() => p.onCancelled('Cancelled · Sick - token back for Jordan.')}>done</button>
      <button type="button" onClick={p.onClose}>close</button>
    </div>
  ),
}));

import React from 'react';
import { renderScreen } from './testRender';
import StaffAthleteBookings from './StaffAthleteBookings';
import { staffAthleteModel } from '../data/staffAthlete';
import { ELITE, packageById } from '../data/packages';

const NOW = new Date('2026-11-12T18:00:00Z');
let mockAthlete;
let mockAsked;

const JORDAN = { id: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6', handicap: 4 };
const HH1 = { id: 'hh1', name: 'Whitfield family', periodAnchorDay: 1 };
const TOKENS = { granted: 6, used: 3, reserved: 0, grace: [], left: 3, unlimited: false, perPurchase: false, held: 0, nextPeriod: null };
const SESSIONS = {
  s1: { id: 's1', date: '2026-11-10', time: '4:00 PM', type: 'training' },
  s2: { id: 's2', date: '2026-11-17', time: '4:00 PM', type: 'training' },
  s3: { id: 's3', date: '2026-11-18', time: '3:00 PM', type: 'mental' },
  s4: { id: 's4', date: '2026-11-19', time: '5:00 PM', type: 'mental' },
  s5: { id: 's5', date: '2026-11-21', time: '10:30 AM', type: 'training' },
  s9: { id: 's9', date: '2026-12-03', time: '4:00 PM', type: 'training' },
  s20: { id: 's20', date: '2027-01-07', time: '4:00 PM', type: 'training' },
};
const bk = (sid, over = {}) => ({
  id: `jordan_${sid}`, athleteId: 'jordan', householdId: 'hh1', sessionId: sid, status: 'confirmed', chargedFrom: 'period',
  date: SESSIONS[sid].date, type: SESSIONS[sid].type, periodKey: `${SESSIONS[sid].date.slice(0, 7)}-01`, ...over,
});
const WAIT = { id: 's5_jordan', sessionId: 's5', athleteId: 'jordan', date: '2026-11-21', type: 'training' };
const BOOKINGS = [
  bk('s1', { status: 'attended' }),
  bk('s2'),
  bk('s3', { source: 'calendly' }),
  bk('s4'),
];
const model = (over = {}) => staffAthleteModel({
  athlete: JORDAN, household: HH1, pkg: packageById('t-6'), bookings: BOOKINGS, waitlist: [WAIT], graceTokens: [],
  sessionsById: SESSIONS, tokens: TOKENS, today: '2026-11-12', ...over,
});
const loaded = (data) => ({ data, loading: false, error: null });

beforeEach(() => {
  mockAthlete = loaded(model());
  mockAsked = [];
});

async function mount(props = {}) {
  const calls = { back: 0, household: [] };
  const r = await renderScreen(
    <StaffAthleteBookings
      bare
      athleteId="jordan"
      role="owner"
      onBack={() => { calls.back += 1; }}
      onOpenHousehold={(id) => calls.household.push(id)}
      now={NOW}
      {...props}
    />
  );
  const rowEl = (id) => r.container.querySelector(`[data-staff-row="${id}"]`);
  const rowButtons = (id) => [...rowEl(id).querySelectorAll('button')].map((b) => b.textContent.trim());
  const sheet = () => r.container.querySelector('[data-sheet]');
  const status = () => r.container.querySelector('[role="status"]');
  return { ...r, calls, rowEl, rowButtons, sheet, status };
}

test('the header: back to Admin, the staff label, the name and the family line', async () => {
  const r = await mount();
  for (const t of ['‹ Admin', 'Bookings · staff view', 'Jordan Whitfield', 'Whitfield family · 6 tokens']) expect(r.text()).toContain(t);
  expect(mockAsked[0]).toBe('jordan');
  await r.click('‹ Admin');
  expect(r.calls.back).toBe(1);
  await r.unmount();
});

test('the token line', async () => {
  const r = await mount();
  expect(r.text()).toContain('3 of 6 tokens left this period');
  await r.unmount();
});

test('the groups', async () => {
  const r = await mount();
  expect(r.text()).toContain('This period · Nov 1 - Nov 30');
  expect(r.text()).toContain('Next period · Dec 1 - Dec 31');
  expect(r.text()).not.toContain('Later');
  // Nothing in December: the next group says so.
  const next = r.container.querySelector('[data-staff-group="next"]');
  expect(next.textContent).toContain('Nothing booked.');
  expect(r.container.querySelector('[data-staff-group="this"]').textContent).not.toContain('Nothing booked.');
  await r.unmount();

  mockAthlete = loaded(model({
    athlete: { ...JORDAN, packageId: ELITE.id }, pkg: ELITE, tokens: { ...TOKENS, unlimited: true },
    bookings: [...BOOKINGS, bk('s9', { chargedFrom: 'elite' }), bk('s20', { chargedFrom: 'elite' })],
  }));
  const elite = await mount();
  expect(elite.text()).toContain('Elite');
  const later = elite.container.querySelector('[data-staff-group="later"]');
  expect(later.textContent).toContain('Later');
  expect(later.querySelector('[data-staff-row="jordan_s20"]')).not.toBeNull();
  expect(elite.container.querySelector('[data-staff-group="next"] [data-staff-row="jordan_s9"]')).not.toBeNull();
  expect(elite.container.querySelector('[data-staff-group="next"]').textContent).not.toContain('Nothing booked.');
  await elite.unmount();
});

test('a row: when, the session, the badge', async () => {
  const r = await mount();
  const row = r.rowEl('jordan_s2');
  expect(row.textContent).toContain('Tue Nov 17 · 4:00 PM');
  expect(row.textContent).toContain('Training block');
  expect(row.textContent).toContain('Booked');
  expect(r.rowEl('jordan_s1').textContent).toContain('Attended');
  expect(r.rowEl('s5_jordan').textContent).toContain('Waitlist');
  // Oldest first, waitlist places among the bookings.
  const order = [...r.container.querySelectorAll('[data-staff-group="this"] [data-staff-row]')].map((e) => e.getAttribute('data-staff-row'));
  expect(order).toEqual(['jordan_s1', 'jordan_s2', 'jordan_s3', 'jordan_s4', 's5_jordan']);
  await r.unmount();
});

/** A row's buttons by their accessible names. */
const ariaOf = (r, id) => [...r.rowEl(id).querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));

test('actions per row', async () => {
  const r = await mount();
  expect(r.rowButtons('jordan_s2')).toEqual(['Move', 'Cancel']);
  expect(ariaOf(r, 'jordan_s2')).toEqual(["Move Jordan's Tue, Nov 17 4:00 PM Training block", "Cancel Jordan's Tue, Nov 17 4:00 PM Training block"]);
  // Attended, a 1:1 booked in the portal, and a waitlist place: no actions.
  expect(r.rowButtons('jordan_s1')).toEqual([]);
  expect(r.rowButtons('jordan_s4')).toEqual([]);
  expect(r.rowButtons('s5_jordan')).toEqual([]);
  // A Calendly 1:1 points to Calendly.
  expect(r.rowButtons('jordan_s3')).toEqual([]);
  expect(r.rowEl('jordan_s3').textContent).toContain('Cancel in Calendly');
  expect(r.rowEl('jordan_s4').textContent).not.toContain('Cancel in Calendly');
  await r.unmount();
});

test("each row's buttons are named for the row, so two rows never share a name", async () => {
  // Walkthrough 2026-11-13: every row read "Move Reese" / "Cancel Reese's booking".
  mockAthlete = loaded(model({ bookings: [...BOOKINGS, bk('s9')] }));
  const r = await mount();
  expect(ariaOf(r, 'jordan_s9')).toEqual(["Move Jordan's Thu, Dec 3 4:00 PM Training block", "Cancel Jordan's Thu, Dec 3 4:00 PM Training block"]);
  const names = [...r.container.querySelectorAll('[data-staff-row] button')].map((b) => b.getAttribute('aria-label'));
  expect(names.length).toBe(4);
  expect(new Set(names).size).toBe(names.length);
  await r.unmount();
});

test('a test athlete', async () => {
  mockAthlete = loaded(model({ household: { ...HH1, test: true } }));
  const r = await mount();
  expect(r.text()).toContain("Jordan is a test athlete. Test athletes can't be booked onto real sessions.");
  expect(r.button('Book a session')).toBeNull();
  expect(r.button('Family billing')).not.toBeNull();
  expect(r.rowButtons('jordan_s2')).toEqual(['Cancel']);
  await r.unmount();
});

test('a missing athlete', async () => {
  mockAthlete = { data: null, loading: false, error: Object.assign(new Error('gone'), { code: 'not-found' }) };
  const r = await mount();
  expect(r.text()).toContain("That athlete isn't on file.");
  expect(r.button('Book a session')).toBeNull();
  expect(r.button('Family billing')).toBeNull();
  await r.unmount();
});

test('Book a session opens the add sheet; its line shows', async () => {
  const r = await mount();
  const book = r.button('Book a session');
  expect(book.style.height).toBe('50px');
  expect(r.button('Family billing').style.height).toBe('44px');
  expect(r.sheet()).toBeNull();
  await r.click('Book a session');
  expect(r.sheet().getAttribute('data-sheet')).toBe('add');
  expect(r.sheet().getAttribute('data-athlete')).toBe('jordan');
  expect(r.sheet().getAttribute('data-name')).toBe('Jordan Whitfield');
  // No session: the sheet opens on its picker.
  expect(r.sheet().getAttribute('data-session')).toBe('');
  await r.click('done');
  expect(r.sheet()).toBeNull();
  expect(r.status().textContent).toBe('Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used.');
  // The line sits above the groups.
  const group = r.container.querySelector('[data-staff-group="this"]');
  expect(r.status().compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await r.unmount();
});

test('Move opens the move sheet with the row; its line shows', async () => {
  const r = await mount();
  const move = r.rowEl('jordan_s2').querySelector(`button[aria-label="Move Jordan's Tue, Nov 17 4:00 PM Training block"]`);
  await r.act(async () => { move.click(); });
  expect(r.sheet().getAttribute('data-sheet')).toBe('move');
  expect(r.sheet().getAttribute('data-booking')).toBe('jordan_s2');
  expect(r.sheet().getAttribute('data-name')).toBe('Jordan Whitfield');
  await r.click('done');
  expect(r.sheet()).toBeNull();
  expect(r.status().textContent).toBe('Jordan moved to Thu Nov 19, 4:00 PM.');
  // Opening any sheet clears the line; closing it leaves the page quiet.
  await r.click('Book a session');
  expect(r.status()).toBeNull();
  await r.click('close');
  expect(r.sheet()).toBeNull();
  expect(r.status()).toBeNull();
  await r.unmount();
});

test('Cancel opens the cancel sheet with the athlete alone; its line shows', async () => {
  mockAthlete = loaded(model({ bookings: [...BOOKINGS, bk('s9')] }));
  const r = await mount();
  const cancel = r.rowEl('jordan_s2').querySelector(`button[aria-label="Cancel Jordan's Tue, Nov 17 4:00 PM Training block"]`);
  await r.act(async () => { cancel.click(); });
  expect(r.sheet().getAttribute('data-sheet')).toBe('cancel');
  expect(r.sheet().getAttribute('data-booking')).toBe('jordan_s2');
  expect(r.sheet().getAttribute('data-member')).toBe('jordan|Jordan Whitfield');
  expect(JSON.parse(r.sheet().getAttribute('data-members'))).toEqual([
    {
      athleteId: 'jordan',
      name: 'Jordan Whitfield',
      // The bookings of this period and the next; never a waitlist place.
      spent: ['jordan_s1', 'jordan_s2', 'jordan_s3', 'jordan_s4', 'jordan_s9'],
      reserved: [],
      period: { start: '2026-11-01' },
    },
  ]);
  await r.click('done');
  expect(r.sheet()).toBeNull();
  expect(r.status().textContent).toBe('Cancelled · Sick - token back for Jordan.');
  await r.unmount();
});

test('Family billing opens the household', async () => {
  const r = await mount();
  await r.click('Family billing');
  expect(r.calls.household).toEqual(['hh1']);
  await r.unmount();
});

test('loading shows no rows and no buttons yet', async () => {
  mockAthlete = { data: null, loading: true, error: null };
  const r = await mount();
  expect(r.text()).toContain('‹ Admin');
  expect(r.button('Book a session')).toBeNull();
  expect(r.container.querySelector('[data-staff-row]')).toBeNull();
  await r.unmount();
});
