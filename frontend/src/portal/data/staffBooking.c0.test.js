/**
 * Staff booking seams (Task C0): the booking fields the roster rows carry
 * for the staff sheets, a roster row as a billing hub row, one household's
 * roster members, which rows carry Move, and who may book. Lane E builds on
 * these before the rest of the lane lands. Merged into staffBooking.test.js
 * in C1.
 */
import {
  STAFF_BOOK_ROLES,
  STAFF_ROW_FIELDS,
  rosterMembers,
  rosterRowToStaffRow,
  staffMayBook,
  staffMovable,
  staffRowFields,
} from './staffBooking';

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
