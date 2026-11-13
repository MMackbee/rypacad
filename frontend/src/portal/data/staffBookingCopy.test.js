/**
 * Staff booking copy. Task C0 makes the row-action and entry-point words
 * real (Lane E's markup reads them before the rest of the copy lands); C2
 * pins every other string in spec 10.2-10.5 here.
 */
import { ADD_ATHLETE, BOOK_A_SESSION, CANCEL_LABEL, MOVE_LABEL, cancelAria, moveAria, testAthleteLine } from './staffBookingCopy';

describe('the C0 words', () => {
  test('the row buttons and the entry-point buttons', () => {
    expect([MOVE_LABEL, CANCEL_LABEL, BOOK_A_SESSION, ADD_ATHLETE]).toEqual(['Move', 'Cancel', 'Book a session', 'Add athlete']);
  });

  test('moveAria: the athlete, the row, or both', () => {
    expect(moveAria('Jordan')).toBe('Move Jordan');
    expect(moveAria('Jordan', 'Tue, Nov 10 Training block')).toBe("Move Jordan's Tue, Nov 10 Training block");
    expect(moveAria(null, 'Tue, Nov 10 Training block')).toBe('Move Tue, Nov 10 Training block');
  });

  test("cancelAria: the Billing Cancel's label with a row; the athlete's booking without one", () => {
    expect(cancelAria('Jordan', 'Tue, Nov 10 Training block')).toBe("Cancel Jordan's Tue, Nov 10 Training block");
    expect(cancelAria('Jordan')).toBe("Cancel Jordan's booking");
    expect(cancelAria(null, 'Tue, Nov 10 Training block')).toBe('Cancel Tue, Nov 10 Training block');
  });

  test('the test athlete line', () => {
    expect(testAthleteLine('Jordan')).toBe("Jordan is a test athlete. Test athletes can't be booked onto real sessions.");
  });
});
