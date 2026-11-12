import React from 'react';
import { renderScreen } from '../screens/testRender';
import { CALENDLY_MANAGED_COPY, LockedDayNotice, canRetry, cancelReasonCopy, capMonthCopy, capOpensCopy, capPickCopy, capReachedCopy, reasonCopy } from './BookingReasons';

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

describe("Yannick's cap copy names the session's month (K04, checklist 2026-11-04)", () => {
  // Wed Nov 4 2026, 10 AM Chicago.
  beforeEach(() => {
    jest.useFakeTimers('modern');
    jest.setSystemTime(new Date('2026-11-04T16:00:00Z'));
  });
  afterEach(() => { jest.useRealTimers(); });

  test('a December session opens Jan 1, by day or by month; no date reads today', () => {
    expect(capReachedCopy('2026-12-15')).toBe('Next mental game session opens Jan 1.');
    expect(capReachedCopy('2026-12')).toBe('Next mental game session opens Jan 1.');
    expect(capReachedCopy()).toBe('Next mental game session opens Dec 1.');
    expect(capReachedCopy(null)).toBe('Next mental game session opens Dec 1.');
    // The refusal of a December booking on Nov 4: Dec 1 is the wrong day.
    expect(reasonCopy('cap-reached', { date: '2026-12-01' })).toBe('Next mental game session opens Jan 1.');
    expect(reasonCopy('cap-reached')).toBe('Next mental game session opens Dec 1.');
  });

  test('a later booked month by name, and the month Calendly should be picked in', () => {
    expect(capMonthCopy('2026-12-01')).toBe("December's mental game cap is booked. Next mental game session opens Jan 1.");
    // Review 2026-11-04 (round 2): the pick says what a time before then would do.
    expect(capPickCopy(['2026-11'], '2026-12-01')).toBe("November's mental game cap is booked. Pick a time in December - another November time would go over the monthly limit.");
  });
});

// Review 2026-11-04 (round 2): with November AND December booked the copy said
// "opens Dec 1"; and in February it named March, after the season's last day.
describe("the cap's next month: past a run of booked months, and never past the season", () => {
  test('the 1st after the last booked month in a row', () => {
    expect(capOpensCopy('2026-11', ['2026-11'])).toBe('Next mental game session opens Dec 1.');
    expect(capOpensCopy('2026-11-04', ['2026-11', '2026-12'])).toBe('Next mental game session opens Jan 1.');
    // A gap ends the run: a booked January leaves a free December first.
    expect(capOpensCopy('2026-11', ['2026-11', '2027-01'])).toBe('Next mental game session opens Dec 1.');
    // Nothing else known: the month after the given one, as capReachedCopy says.
    expect(capOpensCopy('2026-12-01')).toBe('Next mental game session opens Jan 1.');
  });

  test('February is the last month: the season end, never "Mar 1"', () => {
    const END = 'The season ends Saturday, Feb 27, so there is no later month to book.';
    expect(capOpensCopy('2027-02', ['2027-02'])).toBe(END);
    expect(capOpensCopy('2027-01', ['2027-01', '2027-02'])).toBe(END);
    expect(capMonthCopy('2027-02-10', ['2027-02'])).toBe(`February's mental game cap is booked. ${END}`);
  });

  test('a later booked month by name, past any run after it', () => {
    expect(capMonthCopy('2026-12-01', ['2026-12'])).toBe("December's mental game cap is booked. Next mental game session opens Jan 1.");
    expect(capMonthCopy('2026-12-01', ['2026-12', '2027-01'])).toBe("December's mental game cap is booked. Next mental game session opens Feb 1.");
  });

  test('Calendly: the month to pick, and why not before it', () => {
    expect(capPickCopy(['2026-11'], '2026-12-15')).toBe("November's mental game cap is booked. Pick a time in December - another November time would go over the monthly limit.");
    expect(capPickCopy(['2026-11', '2026-12'], '2027-01-04')).toBe("November's and December's mental game caps are booked. Pick a time in January - an earlier time would go over the monthly limit.");
  });
});

describe('a session the athlete already holds (owner 2026-11-04)', () => {
  test('plain words, and no "try again" - a second tap cannot change it', () => {
    expect(reasonCopy('already-booked')).toBe('This athlete already has this session booked.');
    expect(canRetry('already-booked')).toBe(false);
  });
});
