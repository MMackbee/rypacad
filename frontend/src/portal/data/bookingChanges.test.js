import { ALREADY_CHANGED_COPY, CANCEL_CATEGORIES, CANCEL_NOTE_MAX, CANCEL_NOTE_PLACEHOLDER, MENTAL_DAY_OF_COPY, cancelFields,
  cancelQuestion, cancelReasonOf, categoryLabel, coachLine, dayTimeLabel, isFreeComp, movedToSessionId, rebookClears,
  staleMarkLine } from './bookingChanges';

test('the five reasons in order, with their words', () => {
  expect(CANCEL_CATEGORIES.map((c) => [c.id, c.label])).toEqual([['sick', 'Sick'], ['injured', 'Injured'], ['school', 'School'], ['family', 'Family conflict'], ['other', 'Other']]);
  expect([CANCEL_NOTE_MAX, CANCEL_NOTE_PLACEHOLDER]).toEqual([140, 'A few words']);
  expect([categoryLabel('family'), categoryLabel('bored')]).toEqual(['Family conflict', null]);
});
test('the fixed lines', () => {
  expect(MENTAL_DAY_OF_COPY).toBe('A 1:1 can be cancelled in the app up to the day before.');
  expect(ALREADY_CHANGED_COPY).toBe('This booking was already changed.');
});
test('the question names the first name, or asks you', () => {
  expect(cancelQuestion('Jordan Whitfield')).toBe("Why can't Jordan make it?");
  expect(cancelQuestion(null)).toBe("Why can't you make it?");
});
test('cancelReasonOf: a known category; a trimmed 1..140 note only with Other', () => {
  expect(cancelReasonOf({ category: 'sick' })).toEqual({ category: 'sick', note: null });
  expect(cancelReasonOf({ category: 'sick', note: 'fever' })).toEqual({ category: 'sick', note: null });
  expect(cancelReasonOf({ category: 'other', note: '  dentist ' })).toEqual({ category: 'other', note: 'dentist' });
  expect(cancelReasonOf({ category: 'other', note: 'x'.repeat(140) })).toEqual({ category: 'other', note: 'x'.repeat(140) });
  for (const bad of [{ category: 'other', note: '   ' }, { category: 'other' }, { category: 'other', note: 'x'.repeat(141) }, { category: 'bored' }, {}, null]) {
    expect(cancelReasonOf(bad)).toBeNull();
  }
});
test('cancelFields: the three fields for a reason, nothing without one', () => {
  const fx = { del: () => 'DEL', stamp: () => 'NOW' };
  const never = { del: () => { throw new Error('called'); }, stamp: () => { throw new Error('called'); } };
  expect(cancelFields({ category: 'sick', note: null }, fx)).toEqual({ cancelCategory: 'sick', cancelNote: 'DEL', cancelledAt: 'NOW' });
  expect(cancelFields({ category: 'other', note: 'dentist' }, fx)).toEqual({ cancelCategory: 'other', cancelNote: 'dentist', cancelledAt: 'NOW' });
  expect(cancelFields(null, never)).toEqual({});
});
test('rebookClears: only the keys the cancelled row carries', () => {
  expect(rebookClears({ status: 'cancelled', cancelCategory: 'sick', cancelledAt: 1, comp: true }, () => 'DEL'))
    .toEqual({ cancelCategory: 'DEL', cancelledAt: 'DEL', comp: 'DEL' });
  expect(rebookClears({ status: 'cancelled', cancelReason: 'member', cancelledBy: 'p1' }, () => { throw new Error('called'); })).toEqual({});
});
test('isFreeComp: a comp charged to the period with no token id', () => {
  expect([{ comp: true, chargedFrom: 'period' }, { comp: true }].map(isFreeComp)).toEqual([true, true]);
  expect([{ comp: true, chargedFrom: 'grace', graceTokenId: 'single_cs_1' }, { comp: true, chargedFrom: 'elite' }, { chargedFrom: 'period' }, null]
    .map(isFreeComp)).toEqual([false, false, false, false]);
});
test('dayTimeLabel', () => {
  expect(dayTimeLabel('2026-11-12', '4:00 PM')).toBe('Thu Nov 12, 4:00 PM');
  expect(dayTimeLabel('2026-11-12', '')).toBe('Thu Nov 12');
});
test('coachLine: a family cancel with its reason, a move with where to, nothing else', () => {
  const c = (over) => ({ status: 'cancelled', cancelReason: 'member', ...over });
  expect(coachLine(c({ cancelCategory: 'sick' }))).toBe('Cancelled · Sick');
  expect(coachLine(c({ cancelCategory: 'family' }))).toBe('Cancelled · Family conflict');
  expect(coachLine(c({ cancelCategory: 'other', cancelNote: 'dentist' }))).toBe('Cancelled · Other: dentist');
  expect(coachLine(c({ cancelCategory: 'other' }))).toBe('Cancelled · Other');
  expect(coachLine(c({}))).toBeNull();
  expect(coachLine(c({ cancelCategory: 'bored' }))).toBeNull();
  expect(coachLine(c({ cancelReason: 'session-cancelled', cancelCategory: 'sick' }))).toBeNull();
  expect(coachLine(c({ cancelReason: 'moved' }), { date: '2026-11-12', time: '4:00 PM' })).toBe('Moved to Thu Nov 12, 4:00 PM');
  expect(coachLine(c({ cancelReason: 'moved' }), null)).toBe('Moved');
  expect(coachLine({ status: 'confirmed', cancelReason: 'member', cancelCategory: 'sick' })).toBeNull();
});
test("coachLine: the academy's cancel of one booking (staff, owner 2026-11-12) reads like the family's", () => {
  const c = (over) => ({ status: 'cancelled', cancelReason: 'staff', ...over });
  expect(coachLine(c({ cancelCategory: 'sick' }))).toBe('Cancelled · Sick');
  expect(coachLine(c({ cancelCategory: 'other', cancelNote: ' dentist ' }))).toBe('Cancelled · Other: dentist');
  expect(coachLine(c({}))).toBeNull();
});
test('movedToSessionId and the stale-tap line', () => {
  expect(movedToSessionId({ athleteId: 'jordan', movedTo: 'jordan_2026-11-12-0' })).toBe('2026-11-12-0');
  expect(movedToSessionId({ athleteId: 'jordan', movedTo: 'nico_2026-11-12-0' })).toBeNull();
  expect(movedToSessionId({ athleteId: 'jordan' })).toBeNull();
  expect(staleMarkLine('Jordan Whitfield')).toBe('Jordan Whitfield cancelled - list updated.');
  expect(staleMarkLine(null)).toBe('This athlete cancelled - list updated.');
});
