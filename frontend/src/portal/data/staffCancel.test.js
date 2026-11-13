/**
 * Staff cancel on the Billing staff view (owner approved 2026-11-12): which
 * "This period" rows carry Cancel, the brothers and sisters on the same
 * session, and the sheet's and the page's words. Mirrors the server's
 * eligibility and tokenBack (functions/portal/staff-cancel.js).
 */
import {
  STAFF_CANCEL_MAX,
  STAFF_CANCEL_UNCONFIRMED,
  siblingsFor,
  staffCancelLine,
  staffCancelOutcome,
  staffCancelQuestion,
  staffCancelRefusal,
  staffCancelSummary,
  staffCancellable,
  staffConfirmLabel,
  staffMayCancel,
  staffStatusLabel,
  tokenBackOf,
} from './staffCancel';
import { ALREADY_CHANGED_COPY } from './bookingChanges';
import { periodRows } from './billingHub';

// A billing hub row (data/billingHub.js periodRows).
const row = (over = {}) => ({
  id: 'jordan_s1', kind: 'booking', athleteId: 'jordan', sessionId: 's1', date: '2026-11-10', time: '4:00 PM',
  label: 'Training block', status: 'noshow', source: null, chargedFrom: 'period', comp: false, graceTokenId: null,
  viaGrace: false, viaSingle: false, viaComp: false, ...over,
});
const member = (athleteId, name, spent, start = '2026-11-01') => ({ athleteId, name, spent, reserved: [], period: { start } });

test('the billing rows carry what Cancel and its sheet read', () => {
  const { spent, reserved } = periodRows({
    bookings: [
      { id: 'jordan_s1', athleteId: 'jordan', sessionId: 's1', status: 'noshow', periodKey: '2026-11-01', date: '2026-11-10', type: 'training', chargedFrom: 'grace', graceTokenId: 'grace-1' },
      { id: 'jordan_s2', athleteId: 'jordan', sessionId: 's2', status: 'confirmed', periodKey: '2026-11-01', date: '2026-11-12', type: 'mental', source: 'calendly', chargedFrom: 'period', comp: true },
      { id: 'jordan_s3', athleteId: 'jordan', sessionId: 's3', status: 'confirmed', periodKey: '2026-11-01', date: '2026-11-13', type: 'training' },
    ],
    waitlist: [{ id: 'w1', sessionId: 's4', athleteId: 'jordan', periodKey: '2026-11-01', date: '2026-11-14' }],
    periodKey: '2026-11-01',
    sessionsById: { s1: { id: 's1', date: '2026-11-10', time: '4:00 PM', type: 'training' } },
  });
  expect(spent[0]).toMatchObject({
    id: 'jordan_s1', kind: 'booking', athleteId: 'jordan', sessionId: 's1', status: 'noshow', date: '2026-11-10', time: '4:00 PM',
    label: 'Training block', source: null, chargedFrom: 'grace', comp: false, graceTokenId: 'grace-1',
  });
  expect(spent[1]).toMatchObject({ source: 'calendly', chargedFrom: 'period', comp: true, graceTokenId: null });
  expect(spent[2]).toMatchObject({ source: null, chargedFrom: null, comp: false, graceTokenId: null });
  expect(spent.map((r) => staffCancellable(r))).toEqual([true, false, true]);
  expect(reserved.map((r) => staffCancellable(r))).toEqual([false]);
});

describe('staffCancellable', () => {
  test('a Booked or No-show booking', () => {
    expect(staffCancellable(row({ status: 'confirmed' }))).toBe(true);
    expect(staffCancellable(row({ status: 'noshow' }))).toBe(true);
  });

  test('never attended, waitlist, cancelled or Calendly rows', () => {
    expect(staffCancellable(row({ status: 'attended' }))).toBe(false);
    expect(staffCancellable(row({ status: 'cancelled' }))).toBe(false);
    expect(staffCancellable(row({ kind: 'waitlist', status: 'waitlisted' }))).toBe(false);
    expect(staffCancellable(row({ source: 'calendly', status: 'confirmed' }))).toBe(false);
    expect(staffCancellable(null)).toBe(false);
    expect(staffCancellable(row({ id: null }))).toBe(false);
  });

  test('a row from a period that is over (dated before this period starts) has none; a past session in this period has one', () => {
    expect(staffCancellable(row({ date: '2026-10-24' }), { periodStart: '2026-11-01' })).toBe(false);
    expect(staffCancellable(row({ date: '2026-11-01' }), { periodStart: '2026-11-01' })).toBe(true);
    expect(staffCancellable(row({ date: '2026-11-03' }), { periodStart: '2026-11-01' })).toBe(true);
  });

  test("never a 1:1 (type mental), even one booked in the portal rather than Calendly", () => {
    expect(staffCancellable(row({ type: 'mental' }))).toBe(false);
    expect(staffCancellable(row({ type: 'mental', status: 'confirmed', source: null }))).toBe(false);
    expect(staffCancellable(row({ type: 'training' }))).toBe(true);
  });
});

test('owner and ops only', () => {
  expect(staffMayCancel('owner')).toBe(true);
  expect(staffMayCancel('ops')).toBe(true);
  for (const role of ['coach', 'mental', 'phil', 'parent', 'athlete', undefined, null]) expect(staffMayCancel(role)).toBe(false);
});

test('tokenBack: false for a free comp and for Elite, true otherwise', () => {
  expect(tokenBackOf(row())).toBe(true);
  expect(tokenBackOf(row({ chargedFrom: 'grace', graceTokenId: 'grace-1', viaGrace: true }))).toBe(true);
  expect(tokenBackOf(row({ chargedFrom: 'grace', graceTokenId: 'single_cs_1', viaGrace: true, viaSingle: true }))).toBe(true);
  expect(tokenBackOf(row({ comp: true }))).toBe(false);
  // A comp re-booked with a bonus token is an ordinary booking (isFreeComp).
  expect(tokenBackOf(row({ comp: true, chargedFrom: 'grace', graceTokenId: 'grace-1' }))).toBe(true);
  expect(tokenBackOf(row({ chargedFrom: 'elite' }))).toBe(false);
  // An older row with no chargedFrom was charged to the period.
  expect(tokenBackOf(row({ chargedFrom: null }))).toBe(true);
});

describe('siblingsFor', () => {
  const jordan = row();
  const members = [
    member('jordan', 'Jordan Whitfield', [jordan]),
    member('riley', 'Riley Whitfield', [row({ id: 'riley_s1', athleteId: 'riley', status: 'confirmed' }), row({ id: 'riley_s2', athleteId: 'riley', sessionId: 's2' })]),
    member('casey', 'Casey Whitfield', [row({ id: 'casey_s1', athleteId: 'casey' })]),
    member('drew', 'Drew Whitfield', [row({ id: 'drew_s1', athleteId: 'drew', status: 'attended' })]),
    member('sam', 'Sam Whitfield', [row({ id: 'sam_s2', athleteId: 'sam', sessionId: 's2' })]),
  ];

  test('the other members with a cancellable booking on the same session, in household order', () => {
    expect(siblingsFor(jordan, 'jordan', members).map((s) => [s.athleteId, s.name, s.row.id])).toEqual([
      ['riley', 'Riley Whitfield', 'riley_s1'],
      ['casey', 'Casey Whitfield', 'casey_s1'],
    ]);
  });

  test('none for a Calendly booking, a different session or an attended one', () => {
    const list = [member('jordan', 'Jordan', [jordan]), member('riley', 'Riley', [row({ id: 'riley_s1', athleteId: 'riley', source: 'calendly' })])];
    expect(siblingsFor(jordan, 'jordan', list)).toEqual([]);
    expect(siblingsFor(jordan, 'jordan', [members[0], members[3], members[4]])).toEqual([]);
  });

  test('none without a session id (the practice rows), nor without members', () => {
    expect(siblingsFor(row({ sessionId: null }), 'jordan', members.map((m) => ({ ...m, spent: m.spent.map((r) => ({ ...r, sessionId: null })) })))).toEqual([]);
    expect(siblingsFor(jordan, 'jordan', undefined)).toEqual([]);
  });

  test("a next-period booking on the same session is found through nextSpent (the staff view lists the next period's rows)", () => {
    const jordanDec = row({ id: 'jordan_s9', sessionId: 's9', date: '2026-12-03', status: 'confirmed' });
    const rileyDec = row({ id: 'riley_s9', athleteId: 'riley', sessionId: 's9', date: '2026-12-03', status: 'confirmed' });
    const list = [
      { ...member('jordan', 'Jordan Whitfield', [jordan]), nextSpent: [jordanDec] },
      { ...member('riley', 'Riley Whitfield', [row({ id: 'riley_s1', athleteId: 'riley' })]), nextSpent: [rileyDec] },
      member('casey', 'Casey Whitfield', [row({ id: 'casey_s1', athleteId: 'casey' })]),
    ];
    expect(siblingsFor(jordanDec, 'jordan', list)).toEqual([{ athleteId: 'riley', name: 'Riley Whitfield', row: rileyDec }]);
  });

  test('at most six bookings in one cancel: the tapped one and five more', () => {
    const many = Array.from({ length: 8 }, (_, i) => member(`k${i}`, `Kid${i}`, [row({ id: `k${i}_s1`, athleteId: `k${i}` })]));
    expect(siblingsFor(jordan, 'jordan', [members[0], ...many])).toHaveLength(STAFF_CANCEL_MAX - 1);
  });
});

test('the question: can for an upcoming session, could for one that started or passed', () => {
  expect(staffCancelQuestion('Jordan Whitfield', false)).toBe("Why can't Jordan make it?");
  expect(staffCancelQuestion('Jordan Whitfield', true)).toBe("Why couldn't Jordan make it?");
});

test('the status words and the summary', () => {
  expect(staffStatusLabel('confirmed')).toBe('Booked');
  expect(staffStatusLabel('noshow')).toBe('No-show');
  expect(staffCancelSummary(row(), 'Jordan Whitfield')).toBe('Jordan Whitfield · Tue Nov 10, 4:00 PM · Training block · No-show');
  expect(staffCancelSummary(row({ time: null, status: 'confirmed' }), 'Jordan Whitfield')).toBe('Jordan Whitfield · Tue Nov 10 · Training block · Booked');
});

test('the confirm label counts the bookings that spend a token', () => {
  expect(staffConfirmLabel([row()])).toBe('Cancel and give the token back');
  expect(staffConfirmLabel([row(), row({ chargedFrom: 'grace', graceTokenId: 'grace-1' })])).toBe('Cancel and give the tokens back');
  expect(staffConfirmLabel([row({ comp: true })])).toBe('Cancel session');
  expect(staffConfirmLabel([row({ chargedFrom: 'elite' }), row({ chargedFrom: 'elite' })])).toBe('Cancel session');
  expect(staffConfirmLabel([row({ comp: true }), row()])).toBe('Cancel and give the token back');
});

describe('the line on the page after a cancel', () => {
  const sick = { category: 'sick', note: null };
  test('one token back, then three', () => {
    expect(staffCancelLine(sick, [{ name: 'Jordan Whitfield', tokenBack: true }])).toBe('Cancelled · Sick - token back for Jordan.');
    expect(staffCancelLine(sick, [
      { name: 'Jordan Whitfield', tokenBack: true },
      { name: 'Riley Whitfield', tokenBack: true },
      { name: 'Casey Whitfield', tokenBack: true },
    ])).toBe('Cancelled · Sick - tokens back for Jordan, Riley and Casey.');
  });

  test('only the ones that got a token are named; none at all reads just the reason', () => {
    expect(staffCancelLine(sick, [{ name: 'Jordan', tokenBack: false }, { name: 'Riley', tokenBack: true }])).toBe('Cancelled · Sick - token back for Riley.');
    expect(staffCancelLine(sick, [{ name: 'Jordan', tokenBack: false }])).toBe('Cancelled · Sick.');
    expect(staffCancelLine({ category: 'family', note: null }, [{ name: 'Jordan', tokenBack: true }, { name: 'Riley', tokenBack: true }]))
      .toBe('Cancelled · Family conflict - tokens back for Jordan and Riley.');
  });

  test('Other uses its note', () => {
    expect(staffCancelLine({ category: 'other', note: 'dentist' }, [{ name: 'Jordan', tokenBack: true }])).toBe('Cancelled · Other: dentist - token back for Jordan.');
    expect(staffCancelLine({ category: 'other', note: 'dentist' }, [{ name: 'Jordan', tokenBack: false }])).toBe('Cancelled · Other: dentist.');
    expect(staffCancelLine({ category: 'other', note: 'Out of town.' }, [{ name: 'Jordan', tokenBack: false }])).toBe('Cancelled · Other: Out of town.');
  });
});

describe('staffCancelOutcome', () => {
  const chosen = [
    { athleteId: 'jordan', name: 'Jordan', row: row() },
    { athleteId: 'riley', name: 'Riley', row: row({ id: 'riley_s1', athleteId: 'riley', comp: true }) },
  ];
  test("the server's tokenBack wins, in the order the sheet chose", () => {
    const result = { sessionId: 's1', cancelled: [
      { bookingId: 'riley_s1', athleteId: 'riley', cancelledFrom: 'noshow', tokenBack: false },
      { bookingId: 'jordan_s1', athleteId: 'jordan', cancelledFrom: 'noshow', tokenBack: true },
    ] };
    expect(staffCancelOutcome(result, chosen)).toEqual([{ name: 'Jordan', tokenBack: true }, { name: 'Riley', tokenBack: false }]);
  });
  test('without a tokenBack (practice mode) the row decides', () => {
    expect(staffCancelOutcome({ simulated: true, cancelled: [{ bookingId: 'jordan_s1' }, { bookingId: 'riley_s1' }] }, chosen))
      .toEqual([{ name: 'Jordan', tokenBack: true }, { name: 'Riley', tokenBack: false }]);
  });
  test('a booking the server did not list is left out', () => {
    expect(staffCancelOutcome({ cancelled: [{ bookingId: 'jordan_s1', tokenBack: true }] }, chosen)).toEqual([{ name: 'Jordan', tokenBack: true }]);
  });
});

describe('refusals in plain words', () => {
  test('already cancelled reads as another change', () => {
    expect(staffCancelRefusal('already-cancelled')).toBe(ALREADY_CHANGED_COPY);
  });
  test("a 1:1 is Yannick's, changed in Calendly (the server's mental refusal, spec 10.5)", () => {
    expect(staffCancelRefusal('mental', { message: 'raw' })).toBe("Yannick's 1:1s are booked and changed in Calendly.");
  });
  test("every server reason has its own short line, none of them the server's raw message", () => {
    const reasons = ['signed-out', 'not-staff', 'bad-request', 'not-found', 'attended', 'calendly', 'period-over', 'mixed', 'mental'];
    const lines = reasons.map((r) => staffCancelRefusal(r, { message: 'raw' }));
    for (const line of lines) {
      expect(typeof line).toBe('string');
      expect(line).not.toBe('raw');
      expect(line.length).toBeLessThan(80);
    }
    expect(new Set(lines).size).toBe(reasons.length);
  });
  test("an unknown reason uses the server's own message; no reason at all cannot say what happened", () => {
    expect(staffCancelRefusal('something-new', { message: 'The server said no.' })).toBe('The server said no.');
    expect(staffCancelRefusal(null, { message: 'internal' })).toBe(STAFF_CANCEL_UNCONFIRMED);
    expect(staffCancelRefusal(undefined)).toBe(STAFF_CANCEL_UNCONFIRMED);
  });
});
