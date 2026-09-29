import { CALENDLY_MANAGED_COPY, reasonCopy } from './BookingReasons';

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
