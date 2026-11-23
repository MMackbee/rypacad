/**
 * screens/AdminAthletes.js (hq card 14): the athlete roster with the Parallax
 * intake swings and fitness assessment marks. The hook is mocked with a state
 * the test drives; hooks/athleteRoster.test.js covers its reads and writes,
 * data/athleteRoster.test.js the rows.
 */
import React from 'react';
import { renderScreen } from './testRender';
import AdminAthletes from './AdminAthletes';

let mockRoster;
let mockCalls;
jest.mock('../hooks/athleteRoster', () => ({ useAthleteRoster: () => mockRoster }));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-23' }));

const AT = new Date('2026-11-12T22:00:00Z');
const mark = (byName, by = 'u-luke') => ({ athleteId: 'x', at: AT, by, byName });
const OWNER = { uid: 'u-owner', role: 'owner', byName: 'Pat' };

const baseData = (viewer = OWNER) => ({
  athletes: [
    { id: 'a-kim', name: 'Dana Kim', householdId: 'h-kim', dob: '2012-06-17', packageId: 't-12', billing: { status: 'active' } },
    { id: 'a-ada', name: 'Ada Moss', householdId: 'h-moss', dob: '2014-03-02', packageId: 'elite', billing: { status: 'pending' } },
    { id: 'a-bo', name: 'Bo Moss', householdId: 'h-moss', dob: '2017-09-09' },
  ],
  households: [{ id: 'h-kim', name: 'Kim family' }, { id: 'h-moss', name: 'Moss family' }],
  marks: {
    'a-kim': { parallaxIntake: mark('Luke'), fitnessAssessment: null },
    'a-ada': { parallaxIntake: null, fitnessAssessment: mark('Pat', 'u-owner') },
    // a-bo: its marks did not load
  },
  viewer,
});

beforeEach(() => {
  mockCalls = [];
  mockRoster = {
    data: baseData(), loading: false, error: null,
    retry: () => mockCalls.push(['retry']),
    tick: async (id, doc) => { mockCalls.push(['tick', id, doc]); return 'done'; },
    undo: async (id, doc) => { mockCalls.push(['undo', id, doc]); },
  };
});

const screen = (props) => renderScreen(<AdminAthletes bare role="owner" onBack={() => {}} onOpenHousehold={() => {}} {...props} />);
const checkbox = (r, label) => r.container.querySelector(`[role="checkbox"][aria-label="${label}"]`);

test('the title, the search, the three filters and the count line', async () => {
  const r = await screen();
  expect(r.text()).toContain('Athletes');
  expect(r.container.querySelector('input').getAttribute('placeholder')).toBe('Search athletes or families');
  expect(r.container.querySelector('input').getAttribute('aria-label')).toBeTruthy();
  for (const label of ['Everyone', 'Parallax not done', 'Fitness not done']) expect(r.button(label)).not.toBeNull();
  expect(r.text()).toContain('3 athletes · Parallax 1 done · Fitness 1 done');
  await r.unmount();
});

test('one row per athlete, by last name: name, the small line, the family', async () => {
  const r = await screen();
  const names = [...r.container.querySelectorAll('[data-roster-name]')].map((n) => n.textContent);
  expect(names).toEqual(['Dana Kim', 'Ada Moss', 'Bo Moss']);
  expect(r.text()).toContain('Age 14 · 12 tokens · Paid');
  expect(r.text()).toContain('Age 12 · Elite · Not paid yet');
  expect(r.text()).toContain('Age 9');
  expect(r.button('Kim family')).not.toBeNull();
  await r.unmount();
});

test("the family's name opens the family page", async () => {
  const opened = [];
  const r = await screen({ onOpenHousehold: (id) => opened.push(id) });
  await r.click('Kim family');
  expect(opened).toEqual(['h-kim']);
  await r.unmount();
});

test('both marks on every row: done with the Chicago date and name, not done, and the read that did not land', async () => {
  const r = await screen();
  expect(checkbox(r, 'Parallax intake swings: Dana Kim').getAttribute('aria-checked')).toBe('true');
  expect(checkbox(r, 'Fitness assessment: Dana Kim').getAttribute('aria-checked')).toBe('false');
  expect(checkbox(r, 'Fitness assessment: Ada Moss').getAttribute('aria-checked')).toBe('true');
  expect(r.text()).toContain('done Nov 12 · Luke');
  expect(r.text()).toContain('done Nov 12 · Pat');
  // Bo's marks did not load: no tick at all (never "not done"), the existing "didn't load" lines.
  expect(checkbox(r, 'Parallax intake swings: Bo Moss')).toBeNull();
  expect(checkbox(r, 'Fitness assessment: Bo Moss')).toBeNull();
  expect(r.text()).toContain("Parallax intake swings didn't load.");
  expect(r.text()).toContain("Fitness assessment didn't load.");
  // The rest of the list stays up.
  expect(r.text()).toContain('Dana Kim');
  await r.unmount();
});

test('the owner ticks the fitness assessment: the hook gets the athlete and the fitness doc id', async () => {
  const r = await screen();
  await r.click('Fitness assessment: Dana Kim');
  expect(mockCalls).toEqual([['tick', 'a-kim', 'fitnessAssessment']]);
  await r.unmount();
});

test('the owner ticks Parallax from the roster too', async () => {
  const r = await screen();
  await r.click('Parallax intake swings: Ada Moss');
  expect(mockCalls).toEqual([['tick', 'a-ada', 'parallaxIntake']]);
  await r.unmount();
});

test('undo: the owner who ticked it just now undoes it', async () => {
  const fresh = { athleteId: 'a-ada', at: new Date(), by: 'u-owner', byName: 'Pat' };
  mockRoster.data.marks['a-ada'].fitnessAssessment = fresh;
  const r = await screen();
  await r.click('Fitness assessment: Ada Moss');
  expect(mockCalls).toEqual([['undo', 'a-ada', 'fitnessAssessment']]);
  await r.unmount();
});

test("the owner clears an old mark behind the control's own confirm", async () => {
  const r = await screen();
  await r.click('Parallax intake swings: Dana Kim');
  expect(mockCalls).toEqual([]);
  expect(r.text()).toContain('Clear Parallax intake swings for Dana Kim?');
  await r.click('Clear Parallax intake swings: Dana Kim');
  expect(mockCalls).toEqual([['undo', 'a-kim', 'parallaxIntake']]);
  await r.unmount();
});

test('ops sees the same rows with no enabled control', async () => {
  mockRoster.data = baseData({ uid: 'u-ops', role: 'ops', byName: 'Sam' });
  const r = await screen({ role: 'ops' });
  const boxes = [...r.container.querySelectorAll('[role="checkbox"]')];
  expect(boxes).toHaveLength(4);
  expect(boxes.every((b) => b.disabled)).toBe(true);
  expect(r.text()).toContain('done Nov 12 · Luke');
  await r.click('Fitness assessment: Dana Kim').catch(() => {});
  expect(mockCalls).toEqual([]);
  await r.unmount();
});

test('search: athlete name, family name, trimmed; the count says Showing', async () => {
  const r = await screen();
  await r.fill('Search', '  moss ');
  const names = [...r.container.querySelectorAll('[data-roster-name]')].map((n) => n.textContent);
  expect(names).toEqual(['Ada Moss', 'Bo Moss']);
  expect(r.text()).toContain('Showing 2 of 3 · Parallax 1 done · Fitness 1 done');
  await r.fill('Search', 'kim family');
  expect([...r.container.querySelectorAll('[data-roster-name]')].map((n) => n.textContent)).toEqual(['Dana Kim']);
  await r.unmount();
});

test('the filters keep only athletes known not to have the mark; no match says so', async () => {
  const r = await screen();
  await r.click('Parallax not done');
  expect([...r.container.querySelectorAll('[data-roster-name]')].map((n) => n.textContent)).toEqual(['Ada Moss']);
  await r.click('Fitness not done');
  expect([...r.container.querySelectorAll('[data-roster-name]')].map((n) => n.textContent)).toEqual(['Dana Kim']);
  expect(r.button('Fitness not done').getAttribute('aria-pressed')).toBe('true');
  await r.click('Everyone');
  expect(r.text()).toContain('3 athletes');
  await r.fill('Search', 'zzz');
  expect(r.text()).toContain('No athletes match.');
  expect(r.container.querySelectorAll('[data-roster-name]')).toHaveLength(0);
  await r.unmount();
});

test('every tap target is 44 px tall (the filters and the family link)', async () => {
  const r = await screen();
  for (const label of ['Everyone', 'Parallax not done', 'Fitness not done', 'Kim family']) {
    expect(r.button(label).style.minHeight).toBe('44px');
  }
  await r.unmount();
});

test('loading shows its line; a failed first load shows the notice and Try again reads again', async () => {
  mockRoster = { ...mockRoster, data: null, loading: true };
  const loading = await screen();
  expect(loading.text()).toContain('Loading athletes…');
  await loading.unmount();
  mockRoster = { ...mockRoster, data: null, loading: false, error: new Error('offline') };
  const failed = await screen();
  expect(failed.text()).toContain("Athletes didn't load");
  await failed.click('Try again');
  expect(mockCalls).toEqual([['retry']]);
  await failed.unmount();
});

test('worst case: a long name and family name wrap; nothing is cut and the row still has both marks', async () => {
  const long = 'Aleksandra Wiśniewska-Kowalczyk';
  const family = 'Wiśniewska-Kowalczyk-Montgomery-Oberhauser-Wettstein family';
  mockRoster.data = {
    ...baseData(),
    athletes: [{ id: 'a-long', name: long, householdId: 'h-long', dob: '2012-06-17' }],
    households: [{ id: 'h-long', name: family }],
    marks: { 'a-long': { parallaxIntake: null, fitnessAssessment: null } },
  };
  const r = await screen();
  expect(r.text()).toContain(long);
  expect(r.button(family)).not.toBeNull();
  const nameEl = r.container.querySelector('[data-roster-name]');
  expect(nameEl.style.overflowWrap).toBe('anywhere');
  expect(r.button(family).style.overflowWrap).toBe('anywhere');
  expect(r.container.querySelectorAll('[role="checkbox"]')).toHaveLength(2);
  expect(r.text()).toContain('1 athlete · Parallax 0 done · Fitness 0 done');
  await r.unmount();
});

test('an athlete with no family name shows no family link', async () => {
  mockRoster.data = {
    ...baseData(),
    athletes: [{ id: 'a-x', name: 'Cy Lu' }],
    households: [],
    marks: { 'a-x': { parallaxIntake: null, fitnessAssessment: null } },
  };
  const r = await screen();
  expect(r.container.querySelectorAll('button[data-roster-family]')).toHaveLength(0);
  expect(r.text()).toContain('Cy Lu');
  await r.unmount();
});

test('1,000 athletes render as plain rows', async () => {
  const athletes = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}`, name: `Pat Row${String(i).padStart(4, '0')}`, householdId: 'h-kim' }));
  mockRoster.data = {
    ...baseData(),
    athletes,
    marks: Object.fromEntries(athletes.map((a) => [a.id, { parallaxIntake: null, fitnessAssessment: null }])),
  };
  const r = await screen();
  expect(r.container.querySelectorAll('[data-roster-name]')).toHaveLength(1000);
  expect(r.text()).toContain('1000 athletes · Parallax 0 done · Fitness 0 done');
  await r.unmount();
});
