/**
 * The family's cancel sheet (spec 2026-11-11 §4): CancelSheet with the
 * reason picker in it. Nothing is cancelled until a usable reason is picked
 * (Other needs a note), and a series is asked once for every week.
 */
import React from 'react';
import MemberCancelSheet from './MemberCancelSheet';
import { renderScreen } from '../screens/testRender';

async function mount(props = {}) {
  const calls = { one: [], series: [], cancelled: 0, close: 0 };
  const r = await renderScreen(
    <MemberCancelSheet
      summary="Tue, Nov 10 · 4:00 PM · Training block"
      name="Jordan Whitfield"
      onClose={() => { calls.close += 1; }}
      onCancelled={() => { calls.cancelled += 1; }}
      onConfirm={async (reason) => { calls.one.push(reason); }}
      {...props}
    />
  );
  return { ...r, calls };
}

test('asks why, and the confirm is inert until a reason is picked', async () => {
  const r = await mount();
  expect(r.text()).toContain("Why can't Jordan make it?");
  await r.click('Cancel reservation');
  expect(r.calls.one).toEqual([]);
  expect(r.calls.cancelled).toBe(0);
  await r.unmount();
});

test('Sick, then cancel: the reason goes with it, once', async () => {
  const r = await mount();
  await r.click('Sick');
  expect(r.button('Sick').getAttribute('aria-pressed')).toBe('true');
  await r.click('Cancel reservation');
  expect(r.calls.one).toEqual([{ category: 'sick', note: null }]);
  expect(r.calls.cancelled).toBe(1);
  await r.unmount();
});

test('Other needs a note: inert without one, then the note goes with it', async () => {
  const r = await mount();
  await r.click('Other');
  await r.click('Cancel reservation');
  expect(r.calls.one).toEqual([]);
  await r.fill('A few words', '   ');
  await r.click('Cancel reservation');
  expect(r.calls.one).toEqual([]);
  await r.fill('A few words', 'dentist');
  await r.click('Cancel reservation');
  expect(r.calls.one).toEqual([{ category: 'other', note: 'dentist' }]);
  await r.unmount();
});

test('a series is asked once and the same reason goes on every week', async () => {
  const series = [];
  const r = await mount({
    laterWeeks: [{ bookingId: 'b2', date: '2026-11-17' }, { bookingId: 'b3', date: '2026-11-24' }],
    onConfirmSeries: async (reason) => {
      series.push(reason);
      return { total: 3, cancelled: [{ bookingId: 'b1', date: '2026-11-10' }, { bookingId: 'b2', date: '2026-11-17' }, { bookingId: 'b3', date: '2026-11-24' }], failed: [], stopped: null };
    },
  });
  await r.click('Cancel this and 2 later weeks');
  expect(series).toEqual([]);
  await r.click('School');
  await r.click('Cancel this and 2 later weeks');
  expect(series).toEqual([{ category: 'school', note: null }]);
  expect(r.text()).toContain('3 reservations cancelled');
  await r.unmount();
});

test("an athlete's own login is asked about themselves", async () => {
  const r = await mount({ name: undefined });
  expect(r.text()).toContain("Why can't you make it?");
  await r.unmount();
});

test('while the cancel runs the reason cannot change; after a failure it can again', async () => {
  let fail;
  const r = await mount({ onConfirm: () => new Promise((resolve, reject) => { fail = reject; }) });
  await r.click('Other');
  await r.fill('A few words', 'dentist');
  await r.click('Cancel reservation');
  expect(r.button('Sick').disabled).toBe(true);
  expect(r.container.querySelector('textarea').disabled).toBe(true);
  await r.act(async () => { fail(new Error('No connection.')); });
  expect(r.text()).toContain('No connection.');
  expect(r.button('Sick').disabled).toBe(false);
  expect(r.container.querySelector('textarea').disabled).toBe(false);
  await r.unmount();
});

test('Keep it closes and cancels nothing', async () => {
  const r = await mount();
  await r.click('Sick');
  await r.click('Keep it');
  expect(r.calls).toEqual({ one: [], series: [], cancelled: 0, close: 1 });
  await r.unmount();
});
