/**
 * Cancel a series (tester Mike, 2026-09-30): what counts as "this and the
 * later weeks", the one-after-another run, and the one summary the family
 * sees. Pure - the cancel itself is injected, so no Firebase here.
 */
// Plain function, not jest.fn(): CRA's resetMocks would clear it before every test.
const mockBumps = [];
jest.mock('./invalidate', () => ({ bump: (name) => mockBumps.push(name) }));

import { cancelSeries, laterWeeks, seriesOffer, seriesSummary } from './cancelSeries';

// 2026-11-10 is a Tuesday.
const row = (over) => ({
  id: 's1', bookingId: 'b1', date: '2026-11-10', time: '4:00', meridiem: 'PM', type: 'training',
  status: 'confirmed', cancellable: true, athleteId: 'a1', ...over,
});
const target = row();
const ids = (rows) => rows.map((r) => r.bookingId);

describe('laterWeeks - the series is what the family sees', () => {
  test('later bookings on the same weekday, time and type, in date order', () => {
    const rows = [
      row({ bookingId: 'b4', date: '2026-12-01' }),
      target,
      row({ bookingId: 'b2', date: '2026-11-17' }),
      row({ bookingId: 'b3', date: '2026-11-24' }),
    ];
    expect(ids(laterWeeks(target, rows))).toEqual(['b2', 'b3', 'b4']);
  });

  test('a gap week does not end the series', () => {
    expect(ids(laterWeeks(target, [target, row({ bookingId: 'b3', date: '2026-11-24' })]))).toEqual(['b3']);
  });

  test('another weekday is not part of it', () => {
    expect(laterWeeks(target, [target, row({ bookingId: 'b2', date: '2026-11-18' })])).toEqual([]);
  });

  test('another start time is not part of it (4:00 PM is not 5:00 PM, nor 4:00 AM)', () => {
    expect(laterWeeks(target, [target, row({ bookingId: 'b2', date: '2026-11-17', time: '5:00' })])).toEqual([]);
    expect(laterWeeks(target, [target, row({ bookingId: 'b3', date: '2026-11-17', meridiem: 'AM' })])).toEqual([]);
  });

  test('another session type is not part of it', () => {
    expect(laterWeeks(target, [target, row({ bookingId: 'b2', date: '2026-11-17', type: 'tournament' })])).toEqual([]);
  });

  test('another athlete is not part of it', () => {
    expect(laterWeeks(target, [target, row({ bookingId: 'b2', date: '2026-11-17', athleteId: 'a2' })])).toEqual([]);
  });

  test('earlier bookings are never part of it, and neither is the booking itself', () => {
    const rows = [row({ bookingId: 'b0', date: '2026-11-03' }), target, row({ bookingId: 'b2', date: '2026-11-17' })];
    expect(ids(laterWeeks(target, rows))).toEqual(['b2']);
    expect(laterWeeks(row({ bookingId: 'b2', date: '2026-11-17' }), rows)).toEqual([]);
  });

  test('only what the app can still cancel: confirmed, cancellable, with a booking id', () => {
    const rows = [
      target,
      row({ bookingId: 'b2', date: '2026-11-17', status: 'cancelled', cancellable: false }),
      row({ bookingId: 'b3', date: '2026-11-24', status: 'waitlisted', cancellable: false }),
      row({ bookingId: 'b4', date: '2026-12-01', cancellable: false, source: 'calendly' }),
      row({ bookingId: null, date: '2026-12-08' }),
      row({ bookingId: 'b6', date: '2026-12-15' }),
    ];
    expect(ids(laterWeeks(target, rows))).toEqual(['b6']);
  });

  test('rows without an athlete id (My Schedule is one athlete) still match each other', () => {
    const mine = row({ athleteId: undefined });
    expect(ids(laterWeeks(mine, [mine, row({ bookingId: 'b2', date: '2026-11-17', athleteId: undefined })]))).toEqual(['b2']);
  });

  test('no list, no series', () => {
    expect(laterWeeks(target, undefined)).toEqual([]);
    expect(laterWeeks(null, [target])).toEqual([]);
  });
});

describe('seriesOffer - the second button and the line above it', () => {
  test('nothing later means no offer', () => {
    expect(seriesOffer([])).toBeNull();
    expect(seriesOffer(undefined)).toBeNull();
  });

  test('names the count and the last date', () => {
    expect(seriesOffer([row({ date: '2026-11-17' }), row({ date: '2026-11-24' }), row({ date: '2026-12-01' })])).toEqual({
      confirmLabel: 'Cancel this and 3 later weeks',
      note: 'Also booked at the same time on 3 later weeks, through Tue, Dec 1.',
    });
  });

  test('one later week is singular', () => {
    expect(seriesOffer([row({ date: '2026-11-17' })])).toEqual({
      confirmLabel: 'Cancel this and 1 later week',
      note: 'Also booked at the same time on 1 later week, through Tue, Nov 17.',
    });
  });
});

describe('cancelSeries - one after another through the single cancel', () => {
  const series = [target, row({ bookingId: 'b2', date: '2026-11-17' }), row({ bookingId: 'b3', date: '2026-11-24' })];
  const failWith = (code, message) => Object.assign(new Error(message), { code });
  beforeEach(() => {
    mockBumps.length = 0;
  });

  test("every booking goes through cancel, in order, marked 'series' and silent; one refresh at the end", async () => {
    const calls = [];
    const out = await cancelSeries(series, async (bookingId, opts) => {
      calls.push([bookingId, opts]);
    });
    expect(calls).toEqual([
      ['b1', { cancelledVia: 'series', silent: true }],
      ['b2', { cancelledVia: 'series', silent: true }],
      ['b3', { cancelledVia: 'series', silent: true }],
    ]);
    expect(out).toEqual({
      total: 3,
      cancelled: [
        { bookingId: 'b1', date: '2026-11-10' },
        { bookingId: 'b2', date: '2026-11-17' },
        { bookingId: 'b3', date: '2026-11-24' },
      ],
      failed: [],
      stopped: null,
    });
    expect(mockBumps).toEqual(['bookings', 'sessions']);
  });

  test('a failure of one booking is collected and the run continues', async () => {
    const out = await cancelSeries(series, async (bookingId) => {
      if (bookingId === 'b2') throw failWith('not-found', 'This booking no longer exists.');
    });
    expect(ids(out.cancelled)).toEqual(['b1', 'b3']);
    expect(out.failed).toEqual([{ bookingId: 'b2', date: '2026-11-17', message: 'This booking no longer exists.' }]);
    expect(out.stopped).toBeNull();
    expect(mockBumps).toEqual(['bookings', 'sessions']);
  });

  test('an untyped failure is one booking\'s failure too, with a plain fallback', async () => {
    const out = await cancelSeries(series, async (bookingId) => {
      if (bookingId === 'b3') throw new Error('');
    });
    expect(out.failed).toEqual([{ bookingId: 'b3', date: '2026-11-24', message: 'It could not be cancelled.' }]);
    expect(out.stopped).toBeNull();
  });

  test('the rules refusing the series (frontend ahead of the rules deploy) stops at once: nothing cancelled, nothing refreshed', async () => {
    const calls = [];
    const out = await cancelSeries(series, async (bookingId) => {
      calls.push(bookingId);
      throw failWith('permission-denied', 'cancelBooking: Missing or insufficient permissions.');
    });
    expect(calls).toEqual(['b1']);
    expect(out.cancelled).toEqual([]);
    expect(out.failed).toEqual([]);
    expect(out.stopped.message).toBe(
      'The whole series could not be cancelled right now. You can still cancel each week on its own.'
    );
    expect(ids(out.stopped.remaining)).toEqual(['b1', 'b2', 'b3']);
    expect(mockBumps).toEqual([]);
  });

  test('a dropped connection or a signed-out family stops the run and keeps what was cancelled', async () => {
    const offline = await cancelSeries(series, async (bookingId) => {
      if (bookingId !== 'b1') throw failWith('unavailable', 'cancelBooking: offline');
    });
    expect(ids(offline.cancelled)).toEqual(['b1']);
    expect(offline.stopped.message).toBe('The connection dropped. Check your connection and try again.');
    expect(ids(offline.stopped.remaining)).toEqual(['b2', 'b3']);
    expect(mockBumps).toEqual(['bookings', 'sessions']);

    const signedOut = await cancelSeries(series, async () => {
      throw failWith('unauthenticated', 'No signed-in user');
    });
    expect(signedOut.stopped.message).toBe('You are signed out. Sign in again to cancel.');
  });
});

describe('seriesSummary - one summary, not one notice per week', () => {
  const done = (dates) => dates.map((date, i) => ({ bookingId: `b${i}`, date }));

  test('everything cancelled', () => {
    expect(
      seriesSummary({ total: 3, cancelled: done(['2026-11-10', '2026-11-17', '2026-11-24']), failed: [], stopped: null })
    ).toEqual({ title: '3 reservations cancelled', lines: ['Cancelled: Nov 10, Nov 17 and Nov 24.'] });
  });

  test('a partial failure says how many, which were not, and why', () => {
    expect(
      seriesSummary({
        total: 4,
        cancelled: done(['2026-11-10', '2026-12-01']),
        failed: [
          { bookingId: 'x', date: '2026-11-17', message: 'This booking no longer exists.' },
          { bookingId: 'y', date: '2026-11-24', message: 'This booking no longer exists.' },
        ],
        stopped: null,
      })
    ).toEqual({
      title: '2 of 4 reservations cancelled',
      lines: ['Cancelled: Nov 10 and Dec 1.', 'Nov 17 and Nov 24 were not cancelled. This booking no longer exists.'],
    });
  });

  test('different reasons get their own lines, and a reason without a full stop gets one', () => {
    expect(
      seriesSummary({
        total: 3,
        cancelled: done(['2026-11-10']),
        failed: [
          { bookingId: 'x', date: '2026-11-17', message: "Cancel or reschedule from Calendly's email" },
          { bookingId: 'y', date: '2026-11-24', message: 'That session no longer exists.' },
        ],
        stopped: null,
      }).lines
    ).toEqual([
      'Cancelled: Nov 10.',
      "Nov 17 was not cancelled. Cancel or reschedule from Calendly's email.",
      'Nov 24 was not cancelled. That session no longer exists.',
    ]);
  });

  test('a run that stopped names the weeks it never reached', () => {
    expect(
      seriesSummary({
        total: 3,
        cancelled: done(['2026-11-10']),
        failed: [],
        stopped: { message: 'The connection dropped. Check your connection and try again.', remaining: done(['2026-11-17', '2026-11-24']) },
      })
    ).toEqual({
      title: '1 of 3 reservations cancelled',
      lines: ['Cancelled: Nov 10.', 'Nov 17 and Nov 24 were not cancelled. The connection dropped. Check your connection and try again.'],
    });
  });

  test('nothing cancelled', () => {
    expect(
      seriesSummary({
        total: 2,
        cancelled: [],
        failed: [
          { bookingId: 'x', date: '2026-11-10', message: 'This booking no longer exists.' },
          { bookingId: 'y', date: '2026-11-17', message: 'This booking no longer exists.' },
        ],
        stopped: null,
      })
    ).toEqual({
      title: 'No reservations were cancelled',
      lines: ['Nov 10 and Nov 17 were not cancelled. This booking no longer exists.'],
    });
  });
});
