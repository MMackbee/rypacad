import React from 'react';
import { renderScreen } from '../screens/testRender';
import { CALENDLY_MANAGED_COPY, LockedDayNotice, canRetry, cancelReasonCopy, reasonCopy } from './BookingReasons';

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
      "Elite includes one training block, one Tour event and one Performance with Phil session a day - there's already one of those booked that day."
    );
  });
  test('unknown reasons stay null', () => {
    expect(reasonCopy('nope')).toBeNull();
  });
});

describe('the single token (owner ruling 2026-09-29/30)', () => {
  test('no session token left: buy one; the monthly copy is unchanged', () => {
    expect(reasonCopy('no-session-token')).toBe('No session token left - buy one to book.');
    expect(reasonCopy('no-tokens-left')).toBe('No tokens left this period.');
  });
  test('cancel copy: a single token comes back; a double spend is released', () => {
    expect(cancelReasonCopy('session-cancelled', { singleToken: true })).toBe('Cancelled by the academy - your session token was returned.');
    expect(cancelReasonCopy('session-cancelled', { singleToken: false })).toBe('Cancelled by the academy - a bonus token was added.');
    expect(cancelReasonCopy('session-cancelled')).toBe('Cancelled by the academy - a bonus token was added.');
    expect(cancelReasonCopy('double-spend', { singleToken: true })).toBe('Released - this session token was already used for another booking.');
    expect(cancelReasonCopy('member', { singleToken: true })).toBeNull();
    expect(cancelReasonCopy('lapsed')).toBe('Cancelled — membership lapsed.');
  });
  test('Elite reads no token wording, whatever the row was paid with', () => {
    expect(cancelReasonCopy('session-cancelled', { unlimited: true, singleToken: true })).toBe('Cancelled by the academy.');
    expect(cancelReasonCopy('double-spend', { unlimited: true, singleToken: true })).toBe('Cancelled by the academy.');
  });
});

describe('waitlist hardening (audit 2026-09-30)', () => {
  test('a session that filled or started, and a closed waitlist, each say so plainly', () => {
    expect(reasonCopy('full')).toBe('This session just filled.');
    expect(reasonCopy('session-past')).toBe('This session has already started.');
    expect(reasonCopy('waitlist-closed')).toBe('The waitlist for this session has closed.');
  });
  test('"tap to try again" is offered only where a second tap can work', () => {
    expect(canRetry('no-tokens-left')).toBe(true);
    expect(canRetry(null)).toBe(true);
    for (const reason of ['full', 'session-past', 'waitlist-closed', 'no-waitlist']) expect(canRetry(reason)).toBe(false);
  });
  test('an academy cancellation mentions the bonus token to a token athlete only', () => {
    expect(cancelReasonCopy('session-cancelled')).toBe('Cancelled by the academy - a bonus token was added.');
    expect(cancelReasonCopy('session-cancelled', { unlimited: true })).toBe('Cancelled by the academy.');
    expect(cancelReasonCopy('lapsed', { unlimited: true })).toBe('Cancelled — membership lapsed.');
  });
});

describe('a handicap-reserved block (owner ruling 2026-10-02)', () => {
  test('the refusal reads plainly, and a second tap cannot change it', () => {
    expect(reasonCopy('handicap-reserved')).toBe('This session is reserved for lower handicaps.');
    expect(canRetry('handicap-reserved')).toBe(false);
  });
});

describe('LockedDayNotice and the Oct 10 gate (UX review #8; whole-month window, owner ruling 2026-11-02)', () => {
  const notice = async (props) => {
    const r = await renderScreen(<LockedDayNotice {...props} />);
    const text = r.text();
    await r.unmount();
    return text;
  };
  test('a token package before the gate: Nov 3 says Oct 10, not Oct 1', async () => {
    const text = await notice({ date: '2026-11-03', windowMonths: 1, gateOpen: false });
    expect(text).toContain('Not open for this day yet');
    expect(text).toContain('Booking for Tuesday, Nov 3 opens Sat, Oct 10 at 7 AM.');
    expect(text).not.toContain('Thursday, Oct 1');
  });
  test('a month that opens after the gate keeps its own 1st', async () => {
    expect(await notice({ date: '2026-12-02', windowMonths: 1, gateOpen: false })).toContain('Booking for Wednesday, Dec 2 opens 7 AM on Sunday, Nov 1.');
    // The month boundary: November's last day still opens Oct 1 (so the gate's copy); December's first day opens Nov 1.
    expect(await notice({ date: '2026-11-30', windowMonths: 1, gateOpen: false })).toContain('Booking for Monday, Nov 30 opens Sat, Oct 10 at 7 AM.');
    expect(await notice({ date: '2026-12-01', windowMonths: 1, gateOpen: false })).toContain('Booking for Tuesday, Dec 1 opens 7 AM on Sunday, Nov 1.');
  });
  test('Elite (gate open) and every package after the gate name the 1st their window reaches back to', async () => {
    expect(await notice({ date: '2026-11-20', windowMonths: 2, gateOpen: true })).toContain('Booking for Friday, Nov 20 opens 7 AM on Tuesday, Sep 1.');
    // Two months back for Elite, one for a token package: the same February day opens Dec 1 or Jan 1.
    expect(await notice({ date: '2027-02-10', windowMonths: 2, gateOpen: true })).toContain('Booking for Wednesday, Feb 10 opens 7 AM on Tuesday, Dec 1.');
    expect(await notice({ date: '2027-02-10', windowMonths: 1, gateOpen: true })).toContain('Booking for Wednesday, Feb 10 opens 7 AM on Friday, Jan 1.');
    expect(await notice({ date: '2026-11-03', windowMonths: 1, gateOpen: true })).toContain('Booking for Tuesday, Nov 3 opens 7 AM on Thursday, Oct 1.');
    // No gateOpen passed reads as open (the pre-existing behaviour); no windowMonths passed reads as one month.
    expect(await notice({ date: '2026-11-03', windowMonths: 1 })).toContain('opens 7 AM on Thursday, Oct 1.');
    expect(await notice({ date: '2027-01-07' })).toContain('Booking for Thursday, Jan 7 opens 7 AM on Tuesday, Dec 1.');
  });
});

describe('a session the athlete already holds (owner 2026-11-04)', () => {
  test('plain words, and no "try again" - a second tap cannot change it', () => {
    expect(reasonCopy('already-booked')).toBe('This athlete already has this session booked.');
    expect(canRetry('already-booked')).toBe(false);
  });
});
