import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import CancelSheet, { SETTLE_MS } from './CancelSheet';

/**
 * The cancel dialog with and without a series (tester Mike, 2026-09-30):
 * no later weeks leaves it exactly as it was; later weeks add the "just this
 * one" / "this and N later weeks" choice and, after a series run, one summary.
 */
async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const calls = { close: 0, cancelled: 0, one: 0, series: 0 };
  await act(async () => {
    root.render(
      <CancelSheet
        summary="Tue, Nov 10 · 4:00 PM · Training block"
        onClose={() => { calls.close += 1; }}
        onCancelled={() => { calls.cancelled += 1; }}
        onConfirm={async () => { calls.one += 1; }}
        {...props}
      />
    );
  });
  const labels = () => [...container.querySelectorAll('button')].map((b) => b.textContent.trim());
  const click = async (label) => {
    const b = [...container.querySelectorAll('button')].find((el) => el.textContent.trim() === label);
    if (!b) throw new Error(`no button "${label}"`);
    await act(async () => { b.click(); });
  };
  const unmount = async () => { await act(async () => { root.unmount(); }); container.remove(); };
  return { container, calls, labels, click, text: () => container.textContent, unmount };
}

const later = [
  { bookingId: 'b2', date: '2026-11-17' },
  { bookingId: 'b3', date: '2026-11-24' },
  { bookingId: 'b4', date: '2026-12-01' },
];
const ok = (dates) => dates.map((date, i) => ({ bookingId: `b${i + 1}`, date }));

describe('without a series the dialog is exactly as before', () => {
  test('two buttons, and the confirm cancels and closes', async () => {
    const r = await mount({});
    expect(r.labels()).toEqual(['Cancel reservation', 'Keep it']);
    expect(r.text()).not.toContain('later week');
    await r.click('Cancel reservation');
    expect(r.calls).toEqual({ close: 0, cancelled: 1, one: 1, series: 0 });
    await r.unmount();
  });

  test('an empty list of later weeks is no series either', async () => {
    const r = await mount({ laterWeeks: [], onConfirmSeries: async () => ({}) });
    expect(r.labels()).toEqual(['Cancel reservation', 'Keep it']);
    await r.unmount();
  });

  test('a failed cancel stays open with its own message', async () => {
    const r = await mount({ onConfirm: async () => { throw new Error('This booking no longer exists.'); } });
    await r.click('Cancel reservation');
    expect(r.text()).toContain('This booking no longer exists.');
    expect(r.calls.cancelled).toBe(0);
    expect(r.labels()).toEqual(['Cancel reservation', 'Keep it']);
    await r.unmount();
  });
});

describe('keepFirst and busyLabel (the scholarship delete, 2026-10-01)', () => {
  const labels = { title: 'Delete this application?', confirmLabel: 'Delete for good', keepLabel: 'Keep application' };
  // The clock is the test's: with keepFirst the sheet takes no confirm in its first half second.
  let now;
  beforeEach(() => { now = Date.parse('2026-10-01T15:00:00Z'); jest.spyOn(Date, 'now').mockImplementation(() => now); });
  afterEach(() => { jest.restoreAllMocks(); });
  const off = (r) => [...r.container.querySelectorAll('button')].map((b) => b.disabled);

  test('left out, the keep button is last and the sheet takes no focus', async () => {
    const r = await mount(labels);
    expect(r.labels()).toEqual(['Delete for good', 'Keep application']);
    expect(r.container.contains(document.activeElement)).toBe(false);
    await r.unmount();
  });

  test('keepFirst: the keep button is first, holds the focus, and still only closes', async () => {
    const r = await mount({ ...labels, keepFirst: true });
    expect(r.labels()).toEqual(['Keep application', 'Delete for good']);
    expect(document.activeElement.textContent.trim()).toBe('Keep application');
    await r.click('Keep application');
    expect(r.calls).toEqual({ close: 1, cancelled: 0, one: 0, series: 0 });
    await r.unmount();
  });

  test('busyLabel names the write while it runs; both buttons are off until it lands, so a second tap confirms nothing', async () => {
    let land;
    let confirms = 0;
    const r = await mount({ ...labels, keepFirst: true, busyLabel: 'Deleting', onConfirm: () => { confirms += 1; return new Promise((resolve) => { land = resolve; }); } });
    now += SETTLE_MS;
    await r.click('Delete for good');
    expect(r.labels()).toEqual(['Keep application', 'Deleting']);
    expect([...r.container.querySelectorAll('button')].map((b) => b.disabled)).toEqual([true, true]);
    await r.click('Deleting');
    await r.click('Keep application');
    expect(confirms).toBe(1);
    expect(r.calls).toEqual({ close: 0, cancelled: 0, one: 0, series: 0 });
    await act(async () => { land(); });
    expect(confirms).toBe(1);
    expect(r.calls).toEqual({ close: 0, cancelled: 1, one: 0, series: 0 });
    await r.unmount();
  });

  test('keepFirst: a confirm in the first half second is the tail of the tap that opened the sheet and does nothing; after it, it confirms', async () => {
    const r = await mount({ ...labels, keepFirst: true });
    // The second tap of a double tap, at once and again just inside the half second.
    await r.click('Delete for good');
    now += SETTLE_MS - 1;
    await r.click('Delete for good');
    // Nothing started: no write, nothing closed, no message, and both buttons as they were.
    expect(r.calls).toEqual({ close: 0, cancelled: 0, one: 0, series: 0 });
    expect(r.labels()).toEqual(['Keep application', 'Delete for good']);
    expect(off(r)).toEqual([false, false]);
    expect(r.text()).not.toMatch(/could not|Try again/);
    now += 1;
    await r.click('Delete for good');
    expect(r.calls).toEqual({ close: 0, cancelled: 1, one: 1, series: 0 });
    await r.unmount();
  });

  test('keepFirst: keeping is taken at once, and a clock set back while the sheet is open does not lock the confirm', async () => {
    const kept = await mount({ ...labels, keepFirst: true });
    await kept.click('Keep application');
    expect(kept.calls).toEqual({ close: 1, cancelled: 0, one: 0, series: 0 });
    await kept.unmount();
    const r = await mount({ ...labels, keepFirst: true });
    now -= 60 * 60 * 1000;
    await r.click('Delete for good');
    expect(r.calls).toEqual({ close: 0, cancelled: 1, one: 1, series: 0 });
    await r.unmount();
  });

  test('without keepFirst a confirm is taken at once, as it always was', async () => {
    const r = await mount(labels);
    await r.click('Delete for good');
    expect(r.calls).toEqual({ close: 0, cancelled: 1, one: 1, series: 0 });
    await r.unmount();
  });

  test('without busyLabel the working label is the one it always was', async () => {
    const r = await mount({ onConfirm: () => new Promise(() => {}) });
    await r.click('Cancel reservation');
    expect(r.labels()).toEqual(['Cancelling', 'Keep it']);
    await r.unmount();
  });
});

describe('with later weeks the dialog offers the series', () => {
  const series = (run) => {
    const seen = { runs: 0 };
    return { seen, props: { laterWeeks: later, onConfirmSeries: async () => { seen.runs += 1; return run(); } } };
  };

  test('three choices, with the count and the last date', async () => {
    const r = await mount(series(() => ({})).props);
    expect(r.labels()).toEqual(['Cancel just this one', 'Cancel this and 3 later weeks', 'Keep it']);
    expect(r.text()).toContain('Also booked at the same time on 3 later weeks, through Tue, Dec 1.');
    await r.unmount();
  });

  test('"Cancel just this one" is the single cancel: no series run, closes', async () => {
    const s = series(() => ({}));
    const r = await mount(s.props);
    await r.click('Cancel just this one');
    expect(s.seen.runs).toBe(0);
    expect(r.calls).toEqual({ close: 0, cancelled: 1, one: 1, series: 0 });
    await r.unmount();
  });

  test('"Keep it" closes and cancels nothing', async () => {
    const s = series(() => ({}));
    const r = await mount(s.props);
    await r.click('Keep it');
    expect(s.seen.runs).toBe(0);
    expect(r.calls).toEqual({ close: 1, cancelled: 0, one: 0, series: 0 });
    await r.unmount();
  });

  test('the series run ends in one summary, and Done closes', async () => {
    const s = series(() => ({
      total: 4,
      cancelled: ok(['2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01']),
      failed: [],
      stopped: null,
    }));
    const r = await mount(s.props);
    await r.click('Cancel this and 3 later weeks');
    expect(s.seen.runs).toBe(1);
    expect(r.calls.one).toBe(0);
    expect(r.text()).toContain('4 reservations cancelled');
    expect(r.text()).toContain('Cancelled: Nov 10, Nov 17, Nov 24 and Dec 1.');
    expect(r.labels()).toEqual(['Done']);
    expect(r.calls.cancelled).toBe(0);
    await r.click('Done');
    expect(r.calls.cancelled).toBe(1);
    await r.unmount();
  });

  test('a partial failure is in the same summary, with the reason', async () => {
    const s = series(() => ({
      total: 4,
      cancelled: ok(['2026-11-10', '2026-11-17', '2026-12-01']),
      failed: [{ bookingId: 'b3', date: '2026-11-24', message: 'This booking no longer exists.' }],
      stopped: null,
    }));
    const r = await mount(s.props);
    await r.click('Cancel this and 3 later weeks');
    expect(r.text()).toContain('3 of 4 reservations cancelled');
    expect(r.text()).toContain('Nov 24 was not cancelled. This booking no longer exists.');
    expect(r.labels()).toEqual(['Done']);
    await r.unmount();
  });

  test('refused before anything was cancelled: the choice stays, with a plain message, and the single cancel still works', async () => {
    const message = 'The whole series could not be cancelled right now. You can still cancel each week on its own.';
    const s = series(() => ({ total: 4, cancelled: [], failed: [], stopped: { message, remaining: ok(['2026-11-10']) } }));
    const r = await mount(s.props);
    await r.click('Cancel this and 3 later weeks');
    expect(r.text()).toContain(message);
    expect(r.labels()).toEqual(['Cancel just this one', 'Cancel this and 3 later weeks', 'Keep it']);
    expect(r.calls.cancelled).toBe(0);
    await r.click('Cancel just this one');
    expect(r.calls).toEqual({ close: 0, cancelled: 1, one: 1, series: 0 });
    await r.unmount();
  });

  test('a run that throws outright also stays open with a message', async () => {
    const r = await mount({ laterWeeks: later, onConfirmSeries: async () => { throw new Error(''); } });
    await r.click('Cancel this and 3 later weeks');
    expect(r.text()).toContain('The reservations could not be cancelled. Try again.');
    expect(r.labels()).toEqual(['Cancel just this one', 'Cancel this and 3 later weeks', 'Keep it']);
    await r.unmount();
  });
});
