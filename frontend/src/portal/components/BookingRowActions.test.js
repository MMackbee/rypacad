/**
 * What a booked row offers (spec 2026-11-11 §4-§5): Cancel, and Move, right
 * up to the start; after it "This session has already started."; a portal
 * 1:1 on its own day keeps the day-before rule; Calendly rows cancel from the
 * email; an account on hold gets no Move on an ordinary booking.
 */
import React from 'react';
import BookingRowActions, { rowActionsFor } from './BookingRowActions';
import { renderScreen } from '../screens/testRender';

// 2 PM Thu Nov 12 in Chicago.
const NOW = new Date('2026-11-12T20:00:00Z');
const base = { bookingId: 'b1', status: 'confirmed', cancellable: true, source: 'portal', type: 'training', date: '2026-11-12', time: '4:00', meridiem: 'PM' };

describe('rowActionsFor', () => {
  const k = (over, opts = {}) => rowActionsFor({ ...base, ...over }, { now: NOW, ...opts });

  test('first match wins', () => {
    expect(k({})).toEqual({ kind: 'change', move: true });
    expect(k({ time: '1:00' })).toEqual({ kind: 'started' });
    expect(k({ time: 'TBA', meridiem: undefined })).toEqual({ kind: 'change', move: true }); // Review Focus 1
    expect(k({ type: 'mental', date: '2026-11-13' })).toEqual({ kind: 'change', move: false });
    expect(k({ type: 'mental' })).toEqual({ kind: 'mental-day-of' });
    expect(k({ source: 'calendly', cancellable: false })).toEqual({ kind: 'calendly' });
    expect(k({}, { onHold: true })).toEqual({ kind: 'change', move: false });
    expect(k({ comp: true }, { onHold: true })).toEqual({ kind: 'change', move: true });
    expect(k({ status: 'cancelled' })).toEqual({ kind: 'none' });
    expect(k({ bookingId: null })).toEqual({ kind: 'none' });
    expect(k({ date: '2026-11-20', cancellable: false })).toEqual({ kind: 'none' });
  });

  test('a session with a blank time is open all its day (Review Focus 1)', () => {
    expect(k({ time: '', meridiem: undefined })).toEqual({ kind: 'change', move: true });
  });
});

describe('BookingRowActions', () => {
  beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const mount = (row, props = {}) => {
    const calls = { cancel: 0, move: 0 };
    return renderScreen(
      <BookingRowActions row={{ ...base, ...row }} onCancel={() => { calls.cancel += 1; }} {...props} />
    ).then((r) => ({ ...r, calls }));
  };

  test('before the start: Cancel, and Move when the screen offers it', async () => {
    const calls = { cancel: 0, move: 0 };
    const r = await renderScreen(
      <BookingRowActions row={base} onCancel={() => { calls.cancel += 1; }} onMove={() => { calls.move += 1; }} />
    );
    expect(r.button('Cancel reservation')).not.toBeNull();
    expect(r.button('Move')).not.toBeNull();
    await r.click('Cancel reservation');
    await r.click('Move');
    expect(calls).toEqual({ cancel: 1, move: 1 });
    await r.unmount();
  });

  test('without onMove there is no Move', async () => {
    const r = await mount({});
    expect(r.button('Cancel reservation')).not.toBeNull();
    expect(r.button('Move')).toBeNull();
    await r.unmount();
  });

  test('on hold: Cancel only', async () => {
    const r = await mount({}, { onHold: true, onMove: () => {} });
    expect(r.button('Cancel reservation')).not.toBeNull();
    expect(r.button('Move')).toBeNull();
    await r.unmount();
  });

  test('after the start: the line, no buttons', async () => {
    const r = await mount({ time: '1:00' });
    expect(r.text()).toBe('This session has already started.');
    expect(r.container.querySelector('button')).toBeNull();
    await r.unmount();
  });

  test('a 1:1 on its own day: the day-before line, no buttons', async () => {
    const r = await mount({ type: 'mental' });
    expect(r.text()).toBe('A 1:1 can be cancelled in the app up to the day before.');
    expect(r.container.querySelector('button')).toBeNull();
    await r.unmount();
  });

  test("Calendly: cancel from the email", async () => {
    const r = await mount({ source: 'calendly', cancellable: false });
    expect(r.text()).toBe("Cancel or reschedule from Calendly's email");
    await r.unmount();
  });

  test('nothing to offer: nothing rendered', async () => {
    const r = await mount({ status: 'cancelled' });
    expect(r.container.textContent).toBe('');
    await r.unmount();
  });
});
