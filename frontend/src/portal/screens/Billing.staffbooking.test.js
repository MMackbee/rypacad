/**
 * Staff booking on the family's Billing staff view (spec
 * 01-spec-admin-booking.md 10.4, plan 04-plan-admin-booking.md Task E2):
 * the owner or ops gets Book a session under each meter (whatever the
 * package state), Move beside Cancel on each Booked or No-show row, the next
 * period's rows, and one line above the page for all three sheets. A test
 * household or athlete reads the test line instead of Book, and its rows
 * offer Cancel only. Real TokenMeter over real hub members; the hub is
 * mocked and the add and move sheets are stand-ins (Lane C tests them).
 */
import React from 'react';
import { renderScreen } from './testRender';
import Billing from './Billing';
import { hubMemberFor, statusFor } from '../data/billingHub';
import { TOKEN_PACKAGES } from '../data/packages';

let mockHub;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ label }) => <button type="button">{label}</button> }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => mockHub, useBillingHub: () => mockHub, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: null }));
jest.mock('../components/staffBooking/StaffAddSheet', () => ({
  __esModule: true,
  default: (p) => (
    <div data-sheet="add" data-athlete={p.athleteId} data-name={p.name}>
      <button type="button" onClick={() => p.onDone(`${p.name.split(' ')[0]} is booked for Tue Nov 17, 4:00 PM - 1 token used.`)}>done</button>
      <button type="button" onClick={p.onClose}>close</button>
    </div>
  ),
}));
jest.mock('../components/staffBooking/StaffMoveSheet', () => ({
  __esModule: true,
  default: (p) => (
    <div data-sheet="move" data-booking={p.row.id} data-athlete={p.row.athleteId} data-name={p.name}>
      <button type="button" onClick={() => p.onDone(`${p.name.split(' ')[0]} moved to Thu Nov 19, 4:00 PM.`)}>done</button>
      <button type="button" onClick={p.onClose}>close</button>
    </div>
  ),
}));

const T6 = TOKEN_PACKAGES.find((p) => p.id === 't-6');
const today = '2026-11-12';
const booking = (id, status, over = {}) => ({
  id: `${id}_s1`, athleteId: id, sessionId: 's1', status, periodKey: '2026-11-01', date: '2026-11-10', type: 'training', chargedFrom: 'period', ...over,
});
const kid = (id, name, bookings, athleteOver = {}) =>
  hubMemberFor({
    athlete: { id, name, packageId: T6.id, billing: { status: 'active' }, ...athleteOver },
    pkg: T6, anchorDay: 1, today, waitlist: [], graceTokens: [], bookings,
  });
const DEC = booking('jordan', 'confirmed', { id: 'jordan_s9', sessionId: 's9', date: '2026-12-03', periodKey: '2026-12-01' });
const hubOf = (members, householdOver = {}) => ({
  loading: false,
  error: null,
  data: {
    household: { id: 'hh1', name: 'Whitfield family', anchorDay: 1, membership: null, stripeCustomerId: null, test: false, ...householdOver },
    portalUrl: null, members, status: statusFor(null, { anchorDay: 1 }),
  },
});
const family = (over = {}) => [
  kid('jordan', 'Jordan Whitfield', [booking('jordan', 'noshow'), DEC], over.jordan),
  kid('riley', 'Riley Whitfield', [booking('riley', 'noshow')], over.riley),
  kid('casey', 'Casey Whitfield', [booking('casey', 'confirmed')], { billing: { status: 'pending' }, ...over.casey }),
];
const named = (r, text) => [...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === text);
const rowButtons = (button) => [...button.parentElement.querySelectorAll('button')].map((x) => x.textContent.trim());
const sheet = (r) => r.container.querySelector('[data-sheet]');
const status = (r) => r.container.querySelector('[role="status"]');
/** Every meter's "This period" list, opened. */
async function openLists(r) {
  for (const t of [...r.container.querySelectorAll('button[aria-expanded="false"]')]) await r.act(async () => { t.click(); });
}
const TEST_LINE = "Jordan is a test athlete. Test athletes can't be booked onto real sessions.";

beforeEach(() => {
  mockHub = hubOf(family());
});

test('the owner and ops see Book a session under each meter', async () => {
  for (const role of ['owner', 'ops']) {
    const r = await renderScreen(<Billing bare staff role={role} householdId="hh1" />);
    const books = named(r, 'Book a session');
    // Casey's billing is pending: still one.
    expect(books).toHaveLength(3);
    expect(books.map((b) => b.getAttribute('aria-label'))).toEqual(['Book a session for Jordan', 'Book a session for Riley', 'Book a session for Casey']);
    expect(books.every((b) => b.style.height === '44px')).toBe(true);
    await r.unmount();
  }
  for (const role of ['coach', 'mental', 'phil']) {
    const r = await renderScreen(<Billing bare staff role={role} householdId="hh1" />);
    expect(named(r, 'Book a session')).toEqual([]);
    await r.unmount();
  }
  for (const role of ['parent', 'athlete', 'owner']) {
    // Not the staff view: a parent's (or an athlete's own) Billing.
    const r = await renderScreen(<Billing bare role={role} />);
    expect(named(r, 'Book a session')).toEqual([]);
    await r.unmount();
  }
});

test('a test household shows the test line instead', async () => {
  mockHub = hubOf(family(), { test: true });
  const r = await renderScreen(<Billing bare staff role="owner" householdId="hh1" />);
  expect(r.text()).toContain(TEST_LINE);
  expect(r.text()).toContain("Riley is a test athlete. Test athletes can't be booked onto real sessions.");
  expect(named(r, 'Book a session')).toEqual([]);
  // Its rows offer Cancel only (plan decision 6).
  await openLists(r);
  expect(named(r, 'Move')).toEqual([]);
  expect(named(r, 'Cancel').length).toBeGreaterThan(0);
  await r.unmount();
});

test('a test athlete in a real household: that athlete alone reads the line', async () => {
  mockHub = hubOf(family({ jordan: { test: true } }));
  const r = await renderScreen(<Billing bare staff role="ops" householdId="hh1" />);
  expect(r.text()).toContain(TEST_LINE);
  expect(named(r, 'Book a session').map((b) => b.getAttribute('aria-label'))).toEqual(['Book a session for Riley', 'Book a session for Casey']);
  await openLists(r);
  expect(r.button("Move Jordan's Tue, Nov 10 Training block")).toBeNull();
  expect(r.button("Cancel Jordan's Tue, Nov 10 Training block")).not.toBeNull();
  expect(r.button("Move Riley's Tue, Nov 10 Training block")).not.toBeNull();
  await r.unmount();
});

test('Move beside Cancel, next-period rows on the staff view only', async () => {
  const r = await renderScreen(<Billing bare staff role="owner" householdId="hh1" />);
  await openLists(r);
  const moves = named(r, 'Move');
  // Jordan's No-show and December rows, Riley's No-show, Casey's Booked.
  expect(moves).toHaveLength(4);
  for (const m of moves) expect(rowButtons(m)).toEqual(['Move', 'Cancel']);
  const dec = r.button("Move Jordan's Thu, Dec 3 Training block");
  expect(dec).not.toBeNull();
  expect(rowButtons(dec)).toEqual(['Move', 'Cancel']);
  await r.unmount();

  const parent = await renderScreen(<Billing bare role="parent" />);
  await openLists(parent);
  expect(parent.text()).not.toContain('Thu, Dec 3');
  expect(named(parent, 'Move')).toEqual([]);
  await parent.unmount();
});

test('Book opens the add sheet for that athlete; its line shows above the page', async () => {
  const r = await renderScreen(<Billing bare staff role="owner" householdId="hh1" />);
  expect(sheet(r)).toBeNull();
  await r.click('Book a session for Riley');
  expect(sheet(r).getAttribute('data-sheet')).toBe('add');
  expect(sheet(r).getAttribute('data-athlete')).toBe('riley');
  expect(sheet(r).getAttribute('data-name')).toBe('Riley Whitfield');
  await r.click('done');
  expect(sheet(r)).toBeNull();
  expect(status(r).textContent).toBe('Riley is booked for Tue Nov 17, 4:00 PM - 1 token used.');
  await r.unmount();
});

test('Move opens the move sheet with the row; its line shows', async () => {
  const r = await renderScreen(<Billing bare staff role="ops" householdId="hh1" />);
  await openLists(r);
  await r.click("Move Jordan's Tue, Nov 10 Training block");
  expect(sheet(r).getAttribute('data-sheet')).toBe('move');
  expect(sheet(r).getAttribute('data-booking')).toBe('jordan_s1');
  expect(sheet(r).getAttribute('data-name')).toBe('Jordan Whitfield');
  await r.click('done');
  expect(sheet(r)).toBeNull();
  expect(status(r).textContent).toBe('Jordan moved to Thu Nov 19, 4:00 PM.');
  // Opening any sheet clears the line; closing it leaves the page quiet.
  await r.click('Book a session for Casey');
  expect(status(r)).toBeNull();
  await r.click('close');
  expect(sheet(r)).toBeNull();
  expect(status(r)).toBeNull();
  await r.unmount();
});
