import { CALENDLY_MANAGED_COPY, cancelReasonCopy, reasonCopy } from './BookingReasons';

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
    expect(cancelReasonCopy('session-cancelled', { singleToken: false })).toBe('Cancelled by the academy — a bonus token was added.');
    expect(cancelReasonCopy('session-cancelled')).toBe('Cancelled by the academy — a bonus token was added.');
    expect(cancelReasonCopy('double-spend', { singleToken: true })).toBe('Released - this session token was already used for another booking.');
    expect(cancelReasonCopy('member', { singleToken: true })).toBeNull();
    expect(cancelReasonCopy('lapsed')).toBe('Cancelled — membership lapsed.');
  });
});
