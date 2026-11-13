/**
 * Staff booking, the pure pieces (spec 01-spec-admin-booking.md 10.1): who
 * may book, the booking fields a roster row carries, a roster row as a
 * billing hub row, one household's roster members, which rows carry Move
 * (Task C0), the athlete search, and what a move does with the token (C1).
 * The add facts - offer, warnings, charge - are staffBooking.facts.test.js.
 */
import {
  STAFF_BOOK_ROLES,
  STAFF_ROW_FIELDS,
  moveChargeKind,
  rosterMembers,
  rosterRowToStaffRow,
  searchAthletes,
  staffMayBook,
  staffMovable,
  staffRowFields,
} from './staffBooking';
import { staffAthleteModel } from './staffAthlete';
import { ELITE, packageById } from './packages';

const SESSION = { id: 's2', date: '2026-11-17', time: '4:00 PM', type: 'training', label: 'Training block' };

// A liveSessionAttendance row with staffRowFields spread in.
const rosterRow = (over = {}) => ({
  bookingId: 'jordan_s2', athleteId: 'jordan', name: 'Jordan Whitfield', status: 'noshow', householdId: 'hh1',
  type: 'training', date: '2026-11-17', chargedFrom: 'grace', graceTokenId: 'single_cs1', comp: false, ...over,
});

// A billing hub row (data/billingHub.js periodRows).
const hubRow = (over = {}) => ({
  id: 'jordan_s1', kind: 'booking', athleteId: 'jordan', sessionId: 's1', date: '2026-11-10', time: '4:00 PM',
  label: 'Training block', type: 'training', status: 'confirmed', source: null, chargedFrom: 'period', comp: false,
  graceTokenId: null, viaGrace: false, viaSingle: false, viaComp: false, ...over,
});

describe('staffRowFields', () => {
  test('the booking fields the staff sheets read, null when absent, comp a boolean', () => {
    expect(staffRowFields({ comp: undefined, type: 'training' })).toEqual({
      householdId: null, source: null, type: 'training', date: null, periodKey: null, chargedFrom: null, comp: false, graceTokenId: null,
    });
    expect(STAFF_ROW_FIELDS).toEqual(['householdId', 'source', 'type', 'date', 'periodKey', 'chargedFrom', 'comp', 'graceTokenId']);
  });

  test('only those fields, whatever else the booking carries', () => {
    const fields = staffRowFields({
      id: 'jordan_s2', athleteId: 'jordan', status: 'confirmed', householdId: 'hh1', source: 'calendly', type: 'mental',
      date: '2026-11-17', periodKey: '2026-11-01', chargedFrom: 'period', comp: true, graceTokenId: 'grace-1', cancelReason: 'sick',
    });
    expect(Object.keys(fields)).toEqual(STAFF_ROW_FIELDS);
    expect(fields).toEqual({
      householdId: 'hh1', source: 'calendly', type: 'mental', date: '2026-11-17', periodKey: '2026-11-01', chargedFrom: 'period', comp: true, graceTokenId: 'grace-1',
    });
    expect(staffRowFields({ comp: 'yes' }).comp).toBe(false);
  });
});

describe('rosterRowToStaffRow', () => {
  test('a roster row as the billing hub row the sheets take', () => {
    expect(rosterRowToStaffRow(rosterRow(), SESSION)).toEqual({
      id: 'jordan_s2', kind: 'booking', athleteId: 'jordan', householdId: 'hh1', sessionId: 's2', date: '2026-11-17',
      time: '4:00 PM', label: 'Training block', type: 'training', status: 'noshow', source: null, chargedFrom: 'grace',
      comp: false, graceTokenId: 'single_cs1', periodKey: null, viaGrace: true, viaSingle: true, viaComp: false,
    });
  });

  test('the session fills in a date and a type the row lacks; a comp reads as one', () => {
    const r = rosterRowToStaffRow(rosterRow({ date: null, type: null, comp: true, graceTokenId: null, chargedFrom: 'period' }), SESSION);
    expect(r).toMatchObject({ date: '2026-11-17', type: 'training', comp: true, viaComp: true, viaGrace: false, viaSingle: false });
    expect(rosterRowToStaffRow(rosterRow(), { ...SESSION, time: undefined }).time).toBeNull();
  });

  test('a roster row carries Move and Cancel as a billing row would', () => {
    expect(staffMovable(rosterRowToStaffRow(rosterRow(), SESSION))).toBe(true);
    expect(staffMovable(rosterRowToStaffRow(rosterRow({ status: 'attended' }), SESSION))).toBe(false);
  });
});

test('rosterMembers: the roster rows of one household, in roster order', () => {
  const rows = [
    rosterRow(),
    rosterRow({ bookingId: 'casey_s2', athleteId: 'casey', name: 'Casey Whitfield', householdId: 'hh2' }),
    rosterRow({ bookingId: 'riley_s2', athleteId: 'riley', name: 'Riley Whitfield', status: 'confirmed', graceTokenId: null, chargedFrom: 'period' }),
  ];
  const members = rosterMembers(rows, 'hh1', SESSION);
  expect(members.map((m) => [m.athleteId, m.name])).toEqual([['jordan', 'Jordan Whitfield'], ['riley', 'Riley Whitfield']]);
  expect(members[1]).toEqual({
    athleteId: 'riley', name: 'Riley Whitfield', spent: [rosterRowToStaffRow(rows[2], SESSION)], reserved: [], period: { start: null },
  });
  expect(rosterMembers(rows, 'hh9', SESSION)).toEqual([]);
  expect(rosterMembers(undefined, 'hh1', SESSION)).toEqual([]);
});

describe('staffMovable', () => {
  test('a Booked or No-show booking', () => {
    expect(staffMovable(hubRow({ status: 'confirmed' }))).toBe(true);
    expect(staffMovable(hubRow({ status: 'noshow' }))).toBe(true);
  });

  test('never attended, cancelled, Calendly, a 1:1, or a waitlist entry', () => {
    expect(staffMovable(hubRow({ status: 'attended' }))).toBe(false);
    expect(staffMovable(hubRow({ status: 'cancelled' }))).toBe(false);
    expect(staffMovable(hubRow({ source: 'calendly' }))).toBe(false);
    expect(staffMovable(hubRow({ type: 'mental' }))).toBe(false);
    expect(staffMovable(hubRow({ kind: 'waitlist', status: 'waitlisted' }))).toBe(false);
    expect(staffMovable(null)).toBe(false);
  });

  test('never a row from a period that is over', () => {
    expect(staffMovable(hubRow({ date: '2026-10-27' }), { periodStart: '2026-11-01' })).toBe(false);
    expect(staffMovable(hubRow({ date: '2026-11-10' }), { periodStart: '2026-11-01' })).toBe(true);
  });
});

test('the owner and ops book; nobody else does', () => {
  expect(STAFF_BOOK_ROLES).toEqual(['owner', 'ops']);
  expect(staffMayBook('owner') && staffMayBook('ops') && !staffMayBook('coach')).toBe(true);
  for (const role of ['coach', 'mental', 'phil', 'parent', 'athlete', undefined, null]) expect(staffMayBook(role)).toBe(false);
});

// ---- C1: the athlete search -------------------------------------------------

// useHouseholdsDirectory's shape (hooks/billing.js).
const DIRECTORY = [
  {
    id: 'hh1', name: 'Whitfield family', status: 'active', test: false,
    athletes: [
      { id: 'jordan', name: 'Jordan Whitfield', packageName: '6 tokens', test: false },
      { id: 'riley', name: 'Riley Whitfield', packageName: 'Elite', test: false },
    ],
  },
  { id: 'hh2', name: 'Test family', status: 'active', test: true, athletes: [{ id: 'casey', name: 'Casey Whitfield', packageName: '4 tokens', test: false }] },
  { id: 'hh3', name: 'Second family', status: 'active', test: false, athletes: [{ id: 'jordan2', name: 'Jordana Casey', packageName: null, test: true }] },
];

describe('searchAthletes', () => {
  test("a prefix of a name word finds the athlete, with the household and the package", () => {
    expect(searchAthletes(DIRECTORY, 'jor')[0]).toEqual({
      athleteId: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', householdName: 'Whitfield family', packageName: '6 tokens', test: false,
    });
  });

  test('every word typed must start some word of the name, in any case; the middle of a word never matches', () => {
    expect(searchAthletes(DIRECTORY, 'JOR whit').map((a) => a.athleteId)).toEqual(['jordan']);
    expect(searchAthletes(DIRECTORY, 'whit jor').map((a) => a.athleteId)).toEqual(['jordan']);
    expect(searchAthletes(DIRECTORY, 'ord')).toEqual([]);
    expect(searchAthletes(DIRECTORY, 'jor casey').map((a) => a.athleteId)).toEqual(['jordan2']);
  });

  test('sorted by name, at most eight', () => {
    const nine = [{ id: 'hh9', name: 'Many family', athletes: Array.from({ length: 9 }, (_, i) => ({ id: `r${i}`, name: `Riley ${9 - i}`, packageName: '6 tokens' })) }];
    const found = searchAthletes(nine, 'riley');
    expect(found).toHaveLength(8);
    expect(found.map((a) => a.name)).toEqual(['Riley 1', 'Riley 2', 'Riley 3', 'Riley 4', 'Riley 5', 'Riley 6', 'Riley 7', 'Riley 8']);
    expect(searchAthletes(DIRECTORY, 'whitfield').map((a) => a.name)).toEqual(['Casey Whitfield', 'Jordan Whitfield', 'Riley Whitfield']);
  });

  test("a test household's athlete, and an athlete marked test, read as test", () => {
    expect(searchAthletes(DIRECTORY, 'casey')[0].test).toBe(true);
    expect(searchAthletes(DIRECTORY, 'jordana')[0].test).toBe(true);
    expect(searchAthletes(DIRECTORY, 'riley')[0].test).toBe(false);
  });

  test('a blank query, or no directory, finds nothing', () => {
    expect(searchAthletes(DIRECTORY, '  ')).toEqual([]);
    expect(searchAthletes(DIRECTORY, '')).toEqual([]);
    expect(searchAthletes(DIRECTORY, null)).toEqual([]);
    expect(searchAthletes(null, 'jor')).toEqual([]);
  });
});

// ---- C1: what a move does with the token -------------------------------------

const T6 = packageById('t-6');
const JORDAN = { id: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6', handicap: 4 };
const tokens = (over = {}) => ({
  granted: 6, used: 3, reserved: 0, grace: [], left: 3, unlimited: false, perPurchase: false, held: 0,
  nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 0, used: 0, reserved: 0, granted: 6, left: 6 },
  ...over,
});
const model = (over = {}) => staffAthleteModel({
  athlete: JORDAN, household: { id: 'hh1', name: 'Whitfield family', periodAnchorDay: 1 }, pkg: T6, bookings: [], waitlist: [],
  graceTokens: [], sessionsById: {}, tokens: tokens(), today: '2026-11-12', ...over,
});
const target = (date) => ({ id: 's9', date, time: '4:00 PM', type: 'training' });

describe('moveChargeKind', () => {
  test('Elite has nothing to move; a free comp stays free', () => {
    expect(moveChargeKind(hubRow({ chargedFrom: 'elite' }), target('2026-12-03'), model())).toEqual({ kind: 'elite' });
    const elite = model({ pkg: ELITE, tokens: tokens({ unlimited: true, granted: null, left: null }) });
    expect(moveChargeKind(hubRow(), target('2026-12-03'), elite)).toEqual({ kind: 'elite' });
    expect(moveChargeKind(hubRow({ comp: true, viaComp: true }), target('2026-12-03'), model())).toEqual({ kind: 'free' });
  });

  test('a bonus or session token still good on the new day moves with it', () => {
    const row = hubRow({ chargedFrom: 'grace', graceTokenId: 'g-1', viaGrace: true });
    const m = model({ graceTokens: [{ id: 'g-1', athleteId: 'jordan', expiresAt: '2026-12-20' }] });
    expect(moveChargeKind(row, target('2026-12-03'), m)).toEqual({ kind: 'carry' });
    const open = model({ graceTokens: [{ id: 'g-1', athleteId: 'jordan', expiresAt: null }] });
    expect(moveChargeKind(row, target('2027-01-14'), open)).toEqual({ kind: 'carry' });
  });

  test('a period token moves with it inside its period, and swaps across one', () => {
    expect(moveChargeKind(hubRow(), target('2026-11-19'), model())).toEqual({ kind: 'carry' });
    expect(moveChargeKind(hubRow(), target('2026-12-03'), model())).toEqual({ kind: 'swap', fromMonth: 'November', toMonth: 'December' });
  });

  test("the household's anchor decides the period: anchor 15 puts Nov 14 and Nov 16 in two", () => {
    const m = model({ household: { id: 'hh1', name: 'Whitfield family', periodAnchorDay: 15 } });
    const row = hubRow({ date: '2026-11-14' });
    expect(moveChargeKind(row, target('2026-11-16'), m)).toEqual({ kind: 'swap', fromMonth: 'October', toMonth: 'November' });
    expect(moveChargeKind(row, target('2026-11-13'), m)).toEqual({ kind: 'carry' });
  });

  test("the booking's own period key wins over its date", () => {
    // An October-dated row charged to November (an early booking folded in).
    const row = hubRow({ id: 'jordan_s0', date: '2026-10-27' });
    const m = model({ bookings: [{ id: 'jordan_s0', athleteId: 'jordan', sessionId: 's0', status: 'confirmed', date: '2026-10-27', periodKey: '2026-11-01', type: 'training' }] });
    expect(moveChargeKind(row, target('2026-11-19'), m)).toEqual({ kind: 'carry' });
    expect(moveChargeKind({ ...row, periodKey: '2026-10-01' }, target('2026-11-19'), m)).toEqual({ kind: 'swap', fromMonth: 'October', toMonth: 'November' });
  });
});
