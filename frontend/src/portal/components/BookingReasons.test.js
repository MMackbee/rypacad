import React from 'react';
import { renderScreen } from '../screens/testRender';
import { CALENDLY_MANAGED_COPY, LockedDayNotice, reasonCopy } from './BookingReasons';

describe('Sprint 20 booking reasons (contract 3.6)', () => {
  test('billing pending', () => {
    expect(reasonCopy('billing-pending')).toBe('Payment pending - finish checkout to start booking');
  });
  test('booking not open names the gate', () => {
    expect(reasonCopy('booking-not-open')).toBe('Booking opens Sat, Oct 10 at 7 AM');
  });
  test('calendly rows are managed by Calendly', () => {
    expect(reasonCopy('calendly-managed')).toBe("Cancel or reschedule from Calendly's email");
    expect(CALENDLY_MANAGED_COPY).toBe(reasonCopy('calendly-managed'));
  });
  test("Elite's one-per-day cap names the Tour event (owner naming rule 2026-09-30)", () => {
    expect(reasonCopy('one-per-day')).toBe(
      "Elite includes one training block, one Tour event and one Phil session a day - there's already one of those booked that day."
    );
  });
  test('unknown reasons stay null', () => {
    expect(reasonCopy('nope')).toBeNull();
  });
});

describe('LockedDayNotice and the Oct 10 gate (UX review #8)', () => {
  const notice = async (props) => {
    const r = await renderScreen(<LockedDayNotice {...props} />);
    const text = r.text();
    await r.unmount();
    return text;
  };
  test('a token package before the gate: Nov 3 says Oct 10, not Oct 4', async () => {
    const text = await notice({ date: '2026-11-03', windowDays: 30, gateOpen: false });
    expect(text).toContain('Not open for this day yet');
    expect(text).toContain('Booking for Tuesday, Nov 3 opens Sat, Oct 10 at 7 AM.');
    expect(text).not.toContain('Oct 4');
  });
  test('a window that opens after the gate keeps its own date', async () => {
    expect(await notice({ date: '2026-11-20', windowDays: 30, gateOpen: false })).toContain('Booking for Friday, Nov 20 opens 7 AM on Wednesday, Oct 21.');
    // Opening on the gate day itself reads the same date either way.
    expect(await notice({ date: '2026-11-09', windowDays: 30, gateOpen: false })).toContain('Booking for Monday, Nov 9 opens 7 AM on Saturday, Oct 10.');
  });
  test('Elite (gate open) and every package after the gate are unchanged', async () => {
    expect(await notice({ date: '2026-11-20', windowDays: 45, gateOpen: true })).toContain('Booking for Friday, Nov 20 opens 7 AM on Tuesday, Oct 6.');
    expect(await notice({ date: '2026-11-03', windowDays: 30, gateOpen: true })).toContain('Booking for Tuesday, Nov 3 opens 7 AM on Sunday, Oct 4.');
    // No gateOpen passed reads as open (the pre-existing behaviour).
    expect(await notice({ date: '2026-11-03', windowDays: 30 })).toContain('opens 7 AM on Sunday, Oct 4.');
  });
});
