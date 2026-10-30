import { boardRows, latestCheckin, noteOf, visitText, visitsByAthlete } from './contractBoard';

/** The board's visits, notes and family names (Yannick's staging notes, 2026-10-30). contractBoard.test.js covers the rule and the groups. */
const sessions = [
  { id: 'tue', date: '2026-11-10', time: '4:00 PM', type: 'training' },
  { id: 'tue-early', date: '2026-11-10', time: '7:00 AM', type: 'training' },
  { id: 'thu', date: '2026-11-12', time: '4:30 PM', type: 'mental' },
  { id: 'sat', date: '2026-11-14', time: '9:00 AM', type: 'tournament' },
  { id: 'gone', date: '2026-11-13', time: '4:00 PM', type: 'training', status: 'cancelled' },
  { id: 'next', date: '2026-11-17', time: '4:00 PM', type: 'training' },
];
const bookings = [
  { athleteId: 'j', sessionId: 'tue', date: '2026-11-10', type: 'training', status: 'confirmed' },
  { athleteId: 'j', sessionId: 'tue-early', date: '2026-11-10', type: 'training', status: 'confirmed' },
  { athleteId: 'j', sessionId: 'sat', date: '2026-11-14', type: 'tournament', status: 'confirmed' },
  { athleteId: 'j', sessionId: 'thu', date: '2026-11-12', type: 'mental', status: 'attended' },
  { athleteId: 'j', sessionId: 'gone', date: '2026-11-13', type: 'training', status: 'confirmed' },
  { athleteId: 'j', sessionId: 'next', date: '2026-11-17', type: 'training', status: 'confirmed' },
  { athleteId: 'n', sessionId: 'tue', date: '2026-11-10', type: 'training', status: 'cancelled' },
  { athleteId: 'n', sessionId: 'missing', date: '2026-11-11', type: 'training', status: 'confirmed' },
];

test('visitsByAthlete: that week only; cancelled bookings, cancelled or missing sessions left out; day then time order', () => {
  const v = visitsByAthlete({ bookings, sessions, weekStartISO: '2026-11-09' });
  expect(v.j).toEqual([
    { date: '2026-11-10', dow: 'Tue', time: '7:00 AM', type: 'training' },
    { date: '2026-11-10', dow: 'Tue', time: '4:00 PM', type: 'training' },
    { date: '2026-11-12', dow: 'Thu', time: '4:30 PM', type: 'mental' },
    { date: '2026-11-14', dow: 'Sat', time: '9:00 AM', type: 'tournament' },
  ]);
  expect(v.n).toBeUndefined();
  expect(visitsByAthlete({ bookings: [], sessions, weekStartISO: '2026-11-09' })).toEqual({});
  expect(visitsByAthlete({ bookings: null, sessions: null, weekStartISO: '2026-11-09' })).toEqual({});
  expect(visitsByAthlete({ bookings, sessions, weekStartISO: '2026-11-16' }).j).toEqual([{ date: '2026-11-17', dow: 'Tue', time: '4:00 PM', type: 'training' }]);
});

test('visitText: day, time and the kind for a Tour event or a specialist; empty for none', () => {
  expect(visitText(visitsByAthlete({ bookings, sessions, weekStartISO: '2026-11-09' }).j)).toBe('Tue 7:00 AM · Tue 4:00 PM · Thu 4:30 PM 1:1 · Sat 9:00 AM Tour');
  expect(visitText([{ dow: 'Mon', time: null, type: 'phil' }])).toBe('Mon Phil');
  expect(visitText([])).toBe('');
  expect(visitText(undefined)).toBe('');
});

test('noteOf and latestCheckin: a trimmed non-blank note, else null; the latest check-in carries its own note', () => {
  expect(noteOf({ note: '  Hi  ' })).toBe('Hi');
  expect(noteOf({ note: '   ' })).toBeNull();
  expect(noteOf({ note: 7 })).toBeNull();
  expect(noteOf({})).toBeNull();
  expect(noteOf(null)).toBeNull();
  const checkins = [
    { athleteId: 'j', weekStart: '2026-11-02', checkedIn: true, at: '2026-11-04', note: 'Older.' },
    { athleteId: 'j', weekStart: '2026-11-09', checkedIn: true, at: '2026-11-10' },
    { athleteId: 'j', weekStart: '2026-11-16', checkedIn: false, at: '2026-11-17', note: 'Not a check-in.' },
  ];
  expect(latestCheckin('j', checkins)).toEqual({ date: '2026-11-10', note: null });
  expect(latestCheckin('j', checkins.slice(0, 1))).toEqual({ date: '2026-11-04', note: 'Older.' });
  expect(latestCheckin('x', checkins)).toBeNull();
});

test("boardRows: the displayed week's note, that week's visits and the family name ride on each row", () => {
  const athletes = [{ id: 'j', name: 'Jordan', dob: '2012-06-17', householdId: 'w' }, { id: 'n', name: 'Nico', dob: '2017-09-09', householdId: 'w' }];
  const households = [{ id: 'w', name: 'Whitfield family' }];
  const checkins = [
    { athleteId: 'j', weekStart: '2026-11-09', checkedIn: true, at: '2026-11-10', note: ' First tee. ' },
    { athleteId: 'j', weekStart: '2026-11-02', checkedIn: true, at: '2026-11-04', note: 'Older.' },
  ];
  const visits = visitsByAthlete({ bookings, sessions, weekStartISO: '2026-11-09' });
  const g = boardRows({ athletes, households, logsByAthlete: {}, checkins, visits, today: '2026-11-11', enabledAt: '2026-11-01', weekStartISO: '2026-11-09' });
  expect(g.checkedIn[0]).toMatchObject({ athleteId: 'j', note: 'First tee.', familyName: 'Whitfield family' });
  expect(g.checkedIn[0].visits.map((v) => v.dow)).toEqual(['Tue', 'Tue', 'Thu', 'Sat']);
  expect(g.thisWeek[0]).toMatchObject({ athleteId: 'n', note: null, visits: [], familyName: 'Whitfield family' });
  const past = boardRows({ athletes, households, logsByAthlete: {}, checkins, today: '2026-11-11', enabledAt: '2026-11-01', weekStartISO: '2026-11-02' });
  expect(past.checkedIn[0]).toMatchObject({ athleteId: 'j', note: 'Older.', visits: [] });
  const noHomes = boardRows({ athletes, logsByAthlete: {}, checkins, today: '2026-11-11', enabledAt: '2026-11-01', weekStartISO: '2026-11-09' });
  expect(noHomes.checkedIn[0].familyName).toBeNull();
});
