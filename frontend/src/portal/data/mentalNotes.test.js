import { NOTE_MAX, athleteNoteSummary, groupEntries, kindOf, mentalAthleteRows, noteEntryId } from './mentalNotes';

const ms = (iso) => Date.UTC(...iso.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))), 15);

describe('note ids (spec 4.1)', () => {
  test('intake, the session id, or free-<random>', () => {
    expect(noteEntryId({ kind: 'intake' })).toBe('intake');
    expect(noteEntryId({ kind: 'session', sessionId: 'cal-9f2a' })).toBe('cal-9f2a');
    expect(noteEntryId({ kind: 'free', random: 'k3x9' })).toBe('free-k3x9');
    expect(kindOf('intake')).toBe('intake');
    expect(kindOf('free-k3x9')).toBe('free');
    expect(kindOf('cal-9f2a')).toBe('session');
    expect(kindOf('2026-11-10-s1')).toBe('session');
    expect(NOTE_MAX).toBe(8000);
  });
});

describe('summary and grouping', () => {
  const entries = [
    { id: 'cal-b', athleteId: 'jordan', kind: 'session', sessionId: 'cal-b', sessionDate: '2026-11-05', body: 'b', updatedAtMs: ms('2026-11-05') },
    { id: 'intake', athleteId: 'jordan', kind: 'intake', sessionId: null, sessionDate: null, body: 'i', updatedAtMs: ms('2026-11-03') },
    { id: 'free-1', athleteId: 'jordan', kind: 'free', sessionId: null, sessionDate: null, body: 'f', updatedAtMs: ms('2026-11-04') },
    { id: 'cal-a', athleteId: 'jordan', kind: 'session', sessionId: 'cal-a', sessionDate: '2026-11-10', body: 'a', updatedAtMs: ms('2026-11-10') },
  ];
  test('athleteNoteSummary: has an intake, latest note date', () => {
    expect(athleteNoteSummary(entries)).toEqual({ hasIntake: true, latestNoteDate: '2026-11-10' });
    expect(athleteNoteSummary([entries[0]])).toEqual({ hasIntake: false, latestNoteDate: '2026-11-05' });
    expect(athleteNoteSummary([])).toEqual({ hasIntake: false, latestNoteDate: null });
  });
  test('groupEntries: intake, sessions newest first, free newest first', () => {
    const g = groupEntries(entries);
    expect(g.intake.id).toBe('intake');
    expect(g.sessions.map((e) => e.id)).toEqual(['cal-a', 'cal-b']);
    expect(g.free.map((e) => e.id)).toEqual(['free-1']);
    expect(groupEntries([]).intake).toBeNull();
  });
});

describe('mentalAthleteRows (Athletes list, spec 5.1)', () => {
  const athletes = [{ id: 'reese', name: 'Reese Whitfield', dob: '2014-03-02' }, { id: 'jordan', name: 'Jordan Whitfield', dob: '2012-06-17' }];
  const bookings = [
    { id: 'jordan_cal-a', athleteId: 'jordan', sessionId: 'cal-a', date: '2026-11-10', type: 'mental', status: 'confirmed' },
    { id: 'jordan_cal-b', athleteId: 'jordan', sessionId: 'cal-b', date: '2026-11-05', type: 'mental', status: 'attended' },
    { id: 'jordan_cal-c', athleteId: 'jordan', sessionId: 'cal-c', date: '2026-11-17', type: 'mental', status: 'confirmed' },
    { id: 'jordan_cal-x', athleteId: 'jordan', sessionId: 'cal-x', date: '2026-11-12', type: 'mental', status: 'cancelled' },
    { id: 'reese_s1', athleteId: 'reese', sessionId: 's1', date: '2026-11-11', type: 'training', status: 'confirmed' },
  ];
  const entries = [{ id: 'intake', athleteId: 'jordan', kind: 'intake', updatedAtMs: ms('2026-11-03') }];
  test('rows by name with next and last 1:1 and the note facts', () => {
    expect(mentalAthleteRows({ athletes, bookings, entries, today: '2026-11-11' })).toEqual([
      { athleteId: 'jordan', name: 'Jordan Whitfield', age: 14, familyName: null, nextSession: '2026-11-17', lastSession: '2026-11-10', hasIntake: true, latestNoteDate: '2026-11-03',
        consentStatus: 'unsigned', needsConsent: true },
      { athleteId: 'reese', name: 'Reese Whitfield', age: 12, familyName: null, nextSession: null, lastSession: null, hasIntake: false, latestNoteDate: null,
        consentStatus: 'unsigned', needsConsent: false },
    ]);
  });
  test('households give each row its family name, as an array or an id map; an unknown household is null', () => {
    const withHomes = athletes.map((a) => ({ ...a, householdId: a.id === 'jordan' ? 'w' : 'gone' }));
    const asArray = mentalAthleteRows({ athletes: withHomes, households: [{ id: 'w', name: 'Whitfield family' }], bookings, entries, today: '2026-11-11' });
    expect(asArray.map((r) => [r.athleteId, r.familyName])).toEqual([['jordan', 'Whitfield family'], ['reese', null]]);
    const asMap = mentalAthleteRows({ athletes: withHomes, households: { w: { id: 'w', name: 'Whitfield family' } }, bookings, entries, today: '2026-11-11' });
    expect(asMap.map((r) => r.familyName)).toEqual(['Whitfield family', null]);
  });
});

describe('mentalAthleteRows: consent (plan Task 14)', () => {
  const ava = { id: 'ava', name: 'Ava Test', dob: '2012-05-14' };
  const jo = { id: 'jo', name: 'Jo Test', dob: '2012-05-14' };
  test("consent on Yannick's rows: from bookings only, never a held session", () => {
    const rows = mentalAthleteRows({ athletes: [ava, jo], households: {}, entries: [], today: '2026-11-05', utcToday: '2026-11-05',
      bookings: [{ athleteId: 'ava', type: 'mental', status: 'confirmed', date: '2026-11-12' }],
      records: { jo: { adult: false, adultSignature: null } } });
    expect(rows.map((r) => [r.athleteId, r.consentStatus, r.needsConsent])).toEqual([['ava', 'unsigned', true], ['jo', 'signed', false]]);
    // a held session (sessions/cal-x, unresolved) is not an input at all: the function takes bookings, and a booking with no athleteId matches nobody
    expect(mentalAthleteRows({ athletes: [ava], households: {}, entries: [], today: '2026-11-05', utcToday: '2026-11-05',
      bookings: [{ athleteId: null, type: 'mental', status: 'confirmed', date: '2026-11-12' }] })[0].needsConsent).toBe(false);
    expect(mentalAthleteRows({ athletes: [ava], households: {}, entries: [], today: '2026-11-05', utcToday: '2026-11-05', records: null,
      bookings: [{ athleteId: 'ava', type: 'mental', status: 'confirmed', date: '2026-11-12' }] })[0]).toMatchObject({ consentStatus: null, needsConsent: false });
  });
  test('no dob and needs 18+ both need consent before a 1:1; ages count on the UTC date', () => {
    const rows = mentalAthleteRows({ athletes: [{ id: 'n', name: 'N Test', dob: null }, { id: 'm', name: 'M Test', dob: '2008-11-06' }],
      households: {}, entries: [], today: '2026-11-05', utcToday: '2026-11-06',
      bookings: [{ athleteId: 'n', type: 'mental', status: 'confirmed', date: '2026-11-12' }, { athleteId: 'm', type: 'mental', status: 'confirmed', date: '2026-11-12' }],
      records: { m: { adult: false, adultSignature: null } } });
    expect(rows.map((r) => [r.athleteId, r.consentStatus, r.needsConsent])).toEqual([['m', 'needs-adult', true], ['n', 'no-dob', true]]);
  });
});
