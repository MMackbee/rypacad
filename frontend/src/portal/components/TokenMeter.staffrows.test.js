/**
 * The staff view's row actions (spec 01-spec-admin-booking.md 10.4, plan
 * 04-plan-admin-booking.md Task E1): Move sits before Cancel on each Booked
 * or No-show row, and the staff view lists the next period's rows under the
 * "Next period from ..." line with the same actions. The parents' meter is
 * unchanged. Real hub members (data/billingHub.js hubMemberFor), as
 * TokenMeter.cancel.test.js builds them.
 */
import React from 'react';
import { renderScreen } from '../screens/testRender';
import TokenMeter from './TokenMeter';
import { TOKEN_PACKAGES } from '../data/packages';
import { hubMemberFor } from '../data/billingHub';

jest.mock('./PayButton', () => ({ __esModule: true, default: ({ label }) => <button type="button">{label}</button> }));

const T6 = TOKEN_PACKAGES.find((p) => p.id === 't-6');
const today = '2026-11-12';
const b = (id, over = {}) => ({
  id, athleteId: 'jordan', sessionId: `s-${id}`, status: 'confirmed', periodKey: '2026-11-01',
  date: '2026-11-10', type: 'training', chargedFrom: 'period', ...over,
});
const member = (bookings) =>
  hubMemberFor({ athlete: { id: 'jordan', name: 'Jordan Whitfield', packageId: T6.id }, pkg: T6, bookings, waitlist: [], graceTokens: [], anchorDay: 1, today });
const named = (r, text) => [...r.container.querySelectorAll('button')].filter((x) => x.textContent.trim() === text);
/** The buttons of the row that holds `button`, in order. */
const rowButtons = (button) => [...button.parentElement.querySelectorAll('button')].map((x) => x.textContent.trim());
const labels = (r) => [...r.container.querySelectorAll('button[aria-label]')].map((x) => x.getAttribute('aria-label'));
const toggleText = (r) => r.container.querySelector('button[aria-expanded]').textContent;
const noop = () => {};

const DEC = b('jordan_s9', { sessionId: 's9', date: '2026-12-03', periodKey: '2026-12-01' });

test('Move sits before Cancel on each Booked or No-show row', async () => {
  const rows = [
    b('jordan_s1'),
    b('jordan_s0', { date: '2026-11-04', status: 'noshow' }),
    b('jordan_s3', { date: '2026-11-05', status: 'attended' }),
  ];
  const r = await renderScreen(<TokenMeter member={member(rows)} defaultOpen onCancelRow={noop} onMoveRow={noop} />);
  const moves = named(r, 'Move');
  expect(moves).toHaveLength(2);
  for (const m of moves) expect(rowButtons(m)).toEqual(['Move', 'Cancel']);
  expect(named(r, 'Cancel')).toHaveLength(2);
  expect(r.button("Move Jordan's Tue, Nov 10 Training block")).not.toBeNull();
  expect(r.button("Cancel Jordan's Tue, Nov 10 Training block")).not.toBeNull();
  // The attended row has neither.
  expect(labels(r).filter((l) => l.includes('Nov 5'))).toEqual([]);
  await r.unmount();
});

test('next-period rows on the staff view, with the same actions', async () => {
  const m = member([b('jordan_s1'), DEC]);
  const staff = await renderScreen(<TokenMeter member={m} defaultOpen onCancelRow={noop} onMoveRow={noop} />);
  const text = staff.text();
  expect(text).toContain('Next period from');
  expect(text).toContain('Thu, Dec 3');
  expect(text.indexOf('Thu, Dec 3')).toBeGreaterThan(text.indexOf('Next period from'));
  const decMove = staff.button("Move Jordan's Thu, Dec 3 Training block");
  expect(decMove).not.toBeNull();
  expect(rowButtons(decMove)).toEqual(['Move', 'Cancel']);
  const staffToggle = toggleText(staff);
  await staff.unmount();

  // Cancel alone (no onMoveRow) still lists the December row, with Cancel only.
  const cancelOnly = await renderScreen(<TokenMeter member={m} defaultOpen onCancelRow={noop} />);
  const decCancel = cancelOnly.button("Cancel Jordan's Thu, Dec 3 Training block");
  expect(decCancel).not.toBeNull();
  expect(rowButtons(decCancel)).toEqual(['Cancel']);
  await cancelOnly.unmount();

  // The parents' meter: no December row, and the count line is unchanged.
  const parent = await renderScreen(<TokenMeter member={m} defaultOpen />);
  expect(parent.text()).toContain('Next period from');
  expect(parent.text()).not.toContain('Thu, Dec 3');
  expect(named(parent, 'Move')).toEqual([]);
  expect(named(parent, 'Cancel')).toEqual([]);
  expect(toggleText(parent)).toBe(staffToggle);
  expect(staffToggle).toContain('This period · 1 session');
  await parent.unmount();
});

test('onMoveRow hands over the row', async () => {
  const tapped = [];
  const r = await renderScreen(<TokenMeter member={member([DEC])} defaultOpen onCancelRow={noop} onMoveRow={(row) => tapped.push(row)} />);
  await r.click("Move Jordan's Thu, Dec 3 Training block");
  expect(tapped.map((row) => [row.id, row.sessionId, row.date])).toEqual([['jordan_s9', 's9', '2026-12-03']]);
  await r.unmount();
});
