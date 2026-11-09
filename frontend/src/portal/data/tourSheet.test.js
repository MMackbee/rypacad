/*
 * The Tour score sheet's pure half (owner rulings 2026-11-06): which rows
 * save, which wait and why, the Boys/Girls pre-fill, and coach entries.
 * Invented names throughout.
 */
import { isSavableTourEntry, needsGender } from './tourBrackets';
import {
  buildScoreEntries,
  cleanCoachName,
  coachIdFor,
  coachQuickPicks,
  genderChoices,
  nameList,
  parseStrokes,
  pendingLines,
  priorGenders,
  unreadIds,
} from './tourSheet';

test('who is asked for a gender: everyone 11 and up and coaches, never 10 & under or Open', () => {
  expect(['11-14', '15-18', 'coaches'].map(needsGender)).toEqual([true, true, true]);
  expect(['10U', null, '14+'].map(needsGender)).toEqual([false, false, false]);
  expect(genderChoices(false).map((c) => [c.id, c.label])).toEqual([['boys', 'Boys'], ['girls', 'Girls']]);
  expect(genderChoices(true).map((c) => [c.id, c.label])).toEqual([['boys', 'Men'], ['girls', 'Women']]);
});

test.each([
  ['Pat Lee', 'coach_pat-lee'],
  ['  pat   LEE ', 'coach_pat-lee'],
  ['Ana-María O’Neil', 'coach_ana-maria-o-neil'],
  ['Coach Sam 2', 'coach_coach-sam-2'],
  // Latin letters NFD does not split (review 2026-11-06): one person, one id.
  ['Søren Berg', 'coach_soren-berg'],
  ['Sören Berg', 'coach_soren-berg'],
  ['Straße', 'coach_strasse'],
  ['ŁUKASZ ØBY', 'coach_lukasz-oby'],
  ['Æsa Đorđe', 'coach_aesa-dorde'],
  ['!!!', null],
  ['', null],
])('coach %p -> id %p', (name, id) => {
  expect(coachIdFor(name)).toBe(id);
});

test('a name in another script still gets an id the rules accept: a short hash, stable, never shared', () => {
  const coach = (athleteId) => ({ athleteId, name: 'x', bracket: 'coaches', gender: 'boys', score: 76 });
  const han = coachIdFor('李雷');
  expect(han).toMatch(/^coach_[a-z0-9]+$/);
  expect(coachIdFor('  李雷 ')).toBe(han);
  expect(coachIdFor('王芳')).not.toBe(han);
  const mixed = coachIdFor('李雷 Li');
  expect(mixed).toMatch(/^coach_li-[a-z0-9]+$/);
  expect(coachIdFor('王芳 Li')).not.toBe(mixed);
  for (const id of [han, mixed, coachIdFor('Straße'), coachIdFor('Søren Berg')]) expect(isSavableTourEntry(coach(id))).toBe(true);
});

test('a typed coach name is tidied before it is stored', () => {
  expect(cleanCoachName('  Pat    Lee ')).toBe('Pat Lee');
  expect(cleanCoachName('x'.repeat(80))).toHaveLength(60);
});

test('strokes: a whole number 18..200, else empty or bad', () => {
  expect(parseStrokes('72')).toEqual({ score: 72 });
  expect(parseStrokes('18')).toEqual({ score: 18 });
  expect(parseStrokes('200')).toEqual({ score: 200 });
  expect(parseStrokes('')).toEqual({ empty: true });
  expect(parseStrokes(undefined)).toEqual({ empty: true });
  expect(parseStrokes('7')).toEqual({ bad: true });
  expect(parseStrokes('201')).toEqual({ bad: true });
});

const at = (ms) => ({ toMillis: () => ms });

test("the pre-fill: each player's latest saved gender, any date; a later row with none does not erase it", () => {
  const out = priorGenders([
    { athleteId: 'ana', date: '2026-11-07', gender: 'girls' },
    { athleteId: 'ana', date: '2026-11-14', gender: null },
    { athleteId: 'bo', date: '2026-11-07', gender: 'girls', createdAt: at(1) },
    { athleteId: 'bo', date: '2026-11-07', gender: 'boys', createdAt: at(2) },
    { athleteId: 'cy', date: '2026-11-21', gender: 'boys' },
    { athleteId: 'cy', date: '2026-11-14', gender: 'girls' },
    { athleteId: 'di', date: '2026-11-07' },
    { athleteId: 'coach_pat', date: '2026-11-07', gender: 'boys' },
  ]);
  expect(out).toEqual({ ana: 'girls', bo: 'boys', cy: 'boys', coach_pat: 'boys' });
});

test('quick picks: each earlier coach once, with the latest spelling and gender, by name', () => {
  const picks = coachQuickPicks([
    { athleteId: 'coach_pat-lee', bracket: 'coaches', name: 'pat lee', date: '2026-11-07', gender: 'boys' },
    { athleteId: 'coach_pat-lee', bracket: 'coaches', name: 'Pat Lee', date: '2026-11-14' },
    { athleteId: 'coach_ana', bracket: 'coaches', name: 'Ana', date: '2026-11-07' },
    { athleteId: 'kid', bracket: '11-14', name: 'Kid', date: '2026-11-07', gender: 'girls' },
  ]);
  expect(picks).toEqual([
    { athleteId: 'coach_ana', name: 'Ana', gender: null },
    { athleteId: 'coach_pat-lee', name: 'Pat Lee', gender: 'boys' },
  ]);
});

const r = (athleteId, bracket, gender, raw, extra = {}) => ({ athleteId, name: athleteId, label: athleteId, bracket, gender, raw, ...extra });

test('the save: 11 and up need a gender, 10 & under and Open never send one, a bad score waits, nothing typed is no result', () => {
  const out = buildScoreEntries([
    r('teen', '11-14', 'girls', '82'),
    r('older', '15-18', null, '78'),
    r('little', '10U', 'boys', '41'),
    r('nodob', null, 'girls', '90'),
    r('typo', '11-14', 'boys', '7'),
    r('blank', '15-18', null, ''),
    r('both', '15-18', null, '250'),
    r('coach_pat', 'coaches', 'boys', '76', { label: 'Pat', coach: true }),
    r('coach_sky', 'coaches', null, '80', { label: 'Sky', coach: true }),
  ]);
  expect(out.entries).toEqual([
    { athleteId: 'teen', name: 'teen', bracket: '11-14', gender: 'girls', score: 82 },
    { athleteId: 'little', name: 'little', bracket: '10U', gender: null, score: 41 },
    { athleteId: 'nodob', name: 'nodob', bracket: null, gender: null, score: 90 },
    { athleteId: 'coach_pat', name: 'coach_pat', bracket: 'coaches', gender: 'boys', score: 76 },
  ]);
  expect(out.missingGender).toEqual([
    { athleteId: 'older', label: 'older', coach: false },
    { athleteId: 'both', label: 'both', coach: false },
    { athleteId: 'coach_sky', label: 'Sky', coach: true },
  ]);
  expect(out.badScore).toEqual([{ athleteId: 'typo', label: 'typo' }, { athleteId: 'both', label: 'both' }]);
  expect(pendingLines(out)).toEqual([
    'Choose Boys or Girls for older and both.',
    'Choose Men or Women for Sky.',
    'Check the score for typo and both: strokes are 18 to 200.',
  ]);
  expect(out.entries.every(isSavableTourEntry)).toBe(true);
});

test('unread: the ids asked for that the age-group read did not return - no dob (null) is not one', () => {
  expect(unreadIds(['a', 'b', 'c', 'b', ''], { a: '11-14', b: null })).toEqual(['c']);
  expect(unreadIds(['a'], { a: '10U' })).toEqual([]);
  expect(unreadIds(['a'], null)).toEqual([]);
});

test('a scored row whose age group is unknown waits, named; it is never saved as Open', () => {
  const out = buildScoreEntries([
    r('known', '10U', null, '44'),
    r('lost', null, null, '81', { groupUnknown: true }),
    r('lostTypo', null, null, '9', { groupUnknown: true }),
    r('lostBlank', null, null, '', { groupUnknown: true }),
  ]);
  expect(out.entries).toEqual([{ athleteId: 'known', name: 'known', bracket: '10U', gender: null, score: 44 }]);
  expect(out.noGroup).toEqual([{ athleteId: 'lost', label: 'lost' }, { athleteId: 'lostTypo', label: 'lostTypo' }]);
  expect(pendingLines(out)).toEqual([
    'Reopen the score sheet so the age group loads for lost and lostTypo.',
    'Check the score for lostTypo: strokes are 18 to 200.',
  ]);
});

test('nothing pending reads no lines; names list like a sentence', () => {
  expect(pendingLines({ missingGender: [], badScore: [] })).toEqual([]);
  expect(nameList(['A'])).toBe('A');
  expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
});

test('isSavableTourEntry mirrors the rules', () => {
  const e = (extra) => ({ athleteId: 'kid', name: 'Kid', bracket: '11-14', gender: 'boys', score: 80, ...extra });
  expect(isSavableTourEntry(e({}))).toBe(true);
  expect(isSavableTourEntry(e({ bracket: null, gender: null }))).toBe(true);
  expect(isSavableTourEntry(e({ gender: undefined }))).toBe(true);
  expect(isSavableTourEntry({ athleteId: 'coach_pat', name: 'Pat', bracket: 'coaches', gender: 'girls', score: 75 })).toBe(true);
  for (const bad of [
    e({ bracket: '14+' }), e({ bracket: '11-13' }), e({ bracket: '9U' }), e({ bracket: '18U' }), e({ bracket: 'open' }),
    e({ gender: 'Boys' }), e({ gender: 'men' }), e({ score: 17 }), e({ score: 201 }), e({ score: 80.5 }), e({ name: 5 }), e({ athleteId: '' }),
    e({ bracket: 'coaches' }), e({ athleteId: 'coach_pat' }), e({ athleteId: 'coach_Pat', bracket: 'coaches' }), e({ athleteId: 'coach_', bracket: 'coaches' }),
    null,
  ]) {
    expect(isSavableTourEntry(bad)).toBe(false);
  }
});
