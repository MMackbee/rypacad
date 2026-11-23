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

test('ops sees the same rows, and a mark is status text: no checkbox, no mark button, "not done" and the done line', async () => {
  mockRoster.data = baseData({ uid: 'u-ops', role: 'ops', byName: 'Sam' });
  const r = await screen({ role: 'ops' });
  expect(r.container.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
  expect(r.button('Fitness assessment: Dana Kim')).toBeNull();
  // Bo's marks did not load: no mark text for him, only the "didn't load" lines.
  const marks = [...r.container.querySelectorAll('[data-roster-marks]')];
  expect(marks).toHaveLength(3);
  for (const m of marks) expect(m.querySelector('button, input, [tabindex], [role]')).toBeNull();
  expect(r.text()).toContain('done Nov 12 · Luke');
  expect(r.text()).toContain('done Nov 12 · Pat');
  // The filter chip "Parallax not done" says "not done" too: look inside the marks only.
  expect(marks.map((m) => m.textContent).join('|')).toContain('not done');
  expect(marks[0].textContent).toContain('Parallax intake swings');
  expect(marks[0].textContent).toContain('Fitness assessment');
  await r.click('Fitness assessment: Dana Kim').catch(() => {});
  expect(mockCalls).toEqual([]);
  await r.unmount();
});

test('as the owner the marks are checkboxes, as before', async () => {
  const r = await screen();
  expect(r.container.querySelectorAll('[role="checkbox"]')).toHaveLength(4);
  for (const m of r.container.querySelectorAll('[data-roster-marks]')) expect(m.textContent).not.toContain('not done');
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
  await r.unmount();
});

test('no match says so, when every read landed', async () => {
  mockRoster.data.marks['a-bo'] = { parallaxIntake: null, fitnessAssessment: null };
  const r = await screen();
  await r.fill('Search', 'zzz');
  expect(r.text()).toContain('No athletes match.');
  expect(r.container.querySelectorAll('[data-roster-name]')).toHaveLength(0);
  expect(r.text()).not.toContain("didn't load");
  await r.unmount();
});

test('every tap target is 44 px tall: the filters by min-height, the family link by padding that its negative margin takes back', async () => {
  const r = await screen();
  for (const label of ['Everyone', 'Parallax not done', 'Fitness not done']) {
    expect(r.button(label).style.minHeight).toBe('44px');
  }
  const link = r.button('Kim family');
  // 14 px of text line + 15 above + 15 below = 44 px to the finger; the margins give the line back its own 14 px.
  expect(link.style.lineHeight).toBe('14px');
  expect(link.style.padding).toBe('15px 0px');
  expect(link.style.margin).toBe('-15px 0px');
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

// A roster whose tick and undo change the marks the way the hook's do (a new mark, or none).
function ticking() {
  mockRoster.tick = async (id, doc) => {
    mockCalls.push(['tick', id, doc]);
    mockRoster.data.marks[id][doc] = { athleteId: id, at: new Date(), by: 'u-owner', byName: 'Pat' };
    return 'done';
  };
  mockRoster.undo = async (id, doc) => {
    mockCalls.push(['undo', id, doc]);
    mockRoster.data.marks[id][doc] = null;
  };
}
const names = (r) => [...r.container.querySelectorAll('[data-roster-name]')].map((n) => n.textContent);

test('under "Fitness not done" a row ticked in this visit stays, now done, and says so in the count', async () => {
  ticking();
  const r = await screen();
  await r.click('Fitness not done');
  expect(names(r)).toEqual(['Dana Kim']);
  await r.click('Fitness assessment: Dana Kim');
  expect(names(r)).toEqual(['Dana Kim']);
  expect(r.text()).toContain('Fitness 2 done');
  expect(r.text()).toContain('done ');
  await r.unmount();
});

test('the ticked row goes when the filter is changed and changed back; the filter is then applied afresh', async () => {
  ticking();
  const r = await screen();
  await r.click('Fitness not done');
  await r.click('Fitness assessment: Dana Kim');
  await r.click('Everyone');
  expect(names(r)).toEqual(['Dana Kim', 'Ada Moss', 'Bo Moss']);
  await r.click('Fitness not done');
  expect(names(r)).toEqual([]);
  // Bo's marks did not load, so the screen does not say "No athletes match." (round 3): the count line stands alone.
  expect(r.text()).not.toContain('No athletes match.');
  expect(r.container.querySelector('[role="status"]').textContent).toContain("Showing 0 of 3");
  await r.unmount();
});

test('changing the search also lets the ticked row go', async () => {
  ticking();
  const r = await screen();
  await r.click('Fitness not done');
  await r.click('Fitness assessment: Dana Kim');
  expect(names(r)).toEqual(['Dana Kim']);
  await r.fill('Search', 'kim');
  expect(names(r)).toEqual([]);
  await r.unmount();
});

test('undo on a row that stayed leaves it in place, not done again', async () => {
  ticking();
  const r = await screen();
  await r.click('Fitness not done');
  await r.click('Fitness assessment: Dana Kim');
  await r.click('Fitness assessment: Dana Kim');
  // The real hook re-renders the screen with the cleared mark; this mock does it by hand.
  await r.rerender(<AdminAthletes bare role="owner" onBack={() => {}} onOpenHousehold={() => {}} />);
  expect(mockCalls).toEqual([['tick', 'a-kim', 'fitnessAssessment'], ['undo', 'a-kim', 'fitnessAssessment']]);
  expect(names(r)).toEqual(['Dana Kim']);
  expect(r.text()).toContain('Fitness 1 done');
  await r.unmount();
});

test('a row ticked under one filter does not appear under another it never matched', async () => {
  ticking();
  const r = await screen();
  await r.click('Parallax not done');
  await r.click('Parallax intake swings: Ada Moss');
  expect(names(r)).toEqual(['Ada Moss']);
  await r.click('Fitness not done');
  expect(names(r)).toEqual(['Dana Kim']);
  await r.unmount();
});

// ---- hq card 14, fix round 3 ------------------------------------------------

// The frame's scrolling area is the div with overflow-y; its header is the div before it.
const scroller = (r) => r.container.querySelector('[role="status"]').closest('div[style*="overflow-y"]');
const header = (r) => scroller(r).previousElementSibling;

test('the search and the three filters are in the frame header, not in the scrolling list', async () => {
  const r = await screen();
  const input = r.container.querySelector('input');
  const group = r.container.querySelector('[role="group"][aria-label="Filter"]');
  expect(header(r).contains(input)).toBe(true);
  expect(header(r).contains(group)).toBe(true);
  expect(header(r).textContent).toContain('Athletes');
  expect(scroller(r).contains(input)).toBe(false);
  expect(scroller(r).contains(group)).toBe(false);
  expect(group.querySelectorAll('button')).toHaveLength(3);
  await r.unmount();
});

test('the count line is the first thing in the scrolling list and is a status', async () => {
  const r = await screen();
  const status = r.container.querySelector('[role="status"]');
  expect(status.parentElement.firstElementChild).toBe(status);
  expect(scroller(r).contains(status)).toBe(true);
  await r.unmount();
});

test('while loading, and after a failed first load, the header has the title only', async () => {
  mockRoster = { ...mockRoster, data: null, loading: true };
  const loading = await screen();
  expect(loading.container.querySelector('input')).toBeNull();
  expect(loading.container.querySelector('[role="group"]')).toBeNull();
  expect(loading.text()).toContain('Athletes');
  await loading.unmount();
  mockRoster = { ...mockRoster, data: null, loading: false, error: new Error('offline') };
  const failed = await screen();
  expect(failed.container.querySelector('input')).toBeNull();
  expect(failed.container.querySelector('[role="group"]')).toBeNull();
  await failed.unmount();
});

test('the three filters sit on one line that scrolls sideways, with no visible scrollbar and chips that do not shrink', async () => {
  const r = await screen();
  const group = r.container.querySelector('[role="group"][aria-label="Filter"]');
  expect(group.style.flexWrap).toBe('nowrap');
  expect(group.style.overflowX).toBe('auto');
  expect(group.style.scrollbarWidth).toBe('none');
  for (const b of group.querySelectorAll('button')) {
    expect(b.style.flexShrink).toBe('0');
    expect(b.style.whiteSpace).toBe('nowrap');
  }
  await r.unmount();
});

test("the family's name is on the small line, after the age, package and membership, and still opens the family page", async () => {
  const opened = [];
  const r = await screen({ onOpenHousehold: (id) => opened.push(id) });
  const line = r.button('Kim family').closest('[data-roster-line]');
  expect(line.textContent).toBe('Age 14 · 12 tokens · Paid · Kim family');
  expect(line.querySelectorAll('button')).toHaveLength(1);
  // No separate line for the family: the row is the name, the small line and the marks.
  const kinds = [...line.parentElement.children].map((c) => (c.hasAttribute('data-roster-name') ? 'name' : c.hasAttribute('data-roster-line') ? 'line' : c.hasAttribute('data-roster-marks') ? 'marks' : 'other'));
  expect(kinds).toEqual(['name', 'line', 'marks']);
  await r.click('Kim family');
  expect(opened).toEqual(['h-kim']);
  await r.unmount();
});

test('with no family page to open the family name is plain text on the same small line', async () => {
  const r = await screen({ onOpenHousehold: undefined });
  expect(r.container.querySelectorAll('button[data-roster-family]')).toHaveLength(0);
  const lines = [...r.container.querySelectorAll('[data-roster-line]')].map((l) => l.textContent);
  expect(lines[0]).toBe('Age 14 · 12 tokens · Paid · Kim family');
  await r.unmount();
});

test('an athlete with a family but no small-line facts still shows the family on the small line', async () => {
  mockRoster.data = { ...baseData(), athletes: [{ id: 'a-x', name: 'Cy Lu', householdId: 'h-kim' }], marks: { 'a-x': { parallaxIntake: null, fitnessAssessment: null } } };
  const r = await screen();
  expect(r.button('Kim family').closest('[data-roster-line]').textContent).toBe('Kim family');
  await r.unmount();
});

test('the two marks are two equal columns that can shrink, at every width', async () => {
  const r = await screen();
  const marks = r.container.querySelector('[data-roster-marks]');
  expect(marks.style.display).toBe('grid');
  expect(marks.style.gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 1fr)');
  expect(marks.children).toHaveLength(2);
  await r.unmount();
});

test('tapping the filter that is already on does nothing: a just-ticked row and its undo stay', async () => {
  ticking();
  const r = await screen();
  await r.click('Fitness not done');
  await r.click('Fitness assessment: Dana Kim');
  expect(names(r)).toEqual(['Dana Kim']);
  await r.click('Fitness not done');
  expect(names(r)).toEqual(['Dana Kim']);
  expect(r.container.querySelector('[role="checkbox"][aria-label="Fitness assessment: Dana Kim"]')).not.toBeNull();
  await r.click('Everyone');
  expect(names(r)).toEqual(['Dana Kim', 'Ada Moss', 'Bo Moss']);
  await r.unmount();
});

describe("marks that did not load (adversarial finding 1)", () => {
  const status = (r) => r.container.querySelector('[role="status"]').textContent;

  test("the count line ends with how many didn't load", async () => {
    const r = await screen();
    expect(status(r)).toBe("3 athletes · Parallax 1 done · Fitness 1 done · 1 didn't load");
    await r.unmount();
  });

  test("all reads failed: every athlete didn't load, nothing is counted done", async () => {
    mockRoster.data.marks = {};
    const r = await screen();
    expect(status(r)).toBe("3 athletes · Parallax 0 done · Fitness 0 done · 3 didn't load");
    await r.unmount();
  });

  test('none failed: the line is as before', async () => {
    mockRoster.data.marks['a-bo'] = { parallaxIntake: null, fitnessAssessment: null };
    const r = await screen();
    expect(status(r)).toBe('3 athletes · Parallax 1 done · Fitness 1 done');
    await r.unmount();
  });

  test('an empty filtered list does not say "No athletes match." while marks are missing; the count line stands', async () => {
    const r = await screen();
    await r.fill('Search', 'zzz');
    expect(r.text()).not.toContain('No athletes match.');
    expect(status(r)).toBe("Showing 0 of 3 · Parallax 1 done · Fitness 1 done · 1 didn't load");
    await r.unmount();
  });

  test("a failed row stays out of the 'not done' filters", async () => {
    const r = await screen();
    await r.click('Parallax not done');
    expect(names(r)).toEqual(['Ada Moss']);
    await r.unmount();
  });
});
