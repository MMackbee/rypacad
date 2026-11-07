import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';
import { bracketFor } from '../data/tour';
import { SEASON_BOUNDS } from '../data/season';

/*
 * Owner ruling 2026-11-06: Tour age groups 11 & under, 12-14 and 15 & up,
 * with boys and girls ranked separately at 15 & up. The portal holds no
 * boy/girl fact, so the score sheet asks for Boys or Girls on every 15 & up
 * row: no pick, no save for that row - and the sheet says so - while the
 * other rows still save. The pick pre-fills from the athlete's most recent
 * saved 15+B / 15+G result. Invented names throughout.
 */
const DOBS = {
  ivy: '2015-11-03', // 11 on the season start -> 11U
  theo: '2012-01-15', // 14 -> 12-14
  maya: '2011-05-01', // 15 -> 15 & up
  owen: '2010-03-10', // 16 -> 15 & up
  nell: null, // no dob -> Open
};
const NAMES = { ivy: 'Ivy Marsh', theo: 'Theo Brandt', maya: 'Maya Quill', owen: 'Owen Pike', nell: 'Nell Hart' };
// The age groups the real hook computes: bracketFor on SEASON_BOUNDS.start.
const groupsFor = (ids) => Object.fromEntries(ids.map((id) => [id, bracketFor(DOBS[id], SEASON_BOUNDS.start)]));

let mockRows;
let mockResults;
let mockGroups;
let mockGroupsLoading;
let mockPrior;
const mockCalls = { prior: [] };
const mockWrites = { results: [] };
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false, error: null, retry: () => {} }),
  useSession: () => ({ data: { type: 'tournament', name: 'RYP Tour', meta: '10:00 AM' } }),
  useSessionAttendance: () => ({
    data: mockRows,
    loading: false,
    error: null,
    mark: () => {},
    setReason: async () => {},
    setSessionNote: async () => {},
    cancelSession: async () => {},
    sessionNote: null,
    sessionStatus: 'scheduled',
    sessionMaxHandicap: null,
    sessionUnresolved: false,
  }),
  useTournamentResults: () => ({ data: mockResults, loading: false, error: null, saveResults: async (entries) => { mockWrites.results.push(entries); } }),
  useAthleteBrackets: () => ({ data: mockGroupsLoading ? null : mockGroups, loading: Boolean(mockGroupsLoading), error: null }),
  usePriorTourDivisions: (ids) => {
    mockCalls.prior.push(ids);
    return { data: mockPrior, loading: false, error: null };
  },
  genericSessionName: () => 'Tour event',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => true }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: null, loading: false, error: null }) }));

const tour = { date: '2026-11-07', time: '10:00 AM', type: 'tournament', name: 'RYP Tour', meta: null };
const rosterOf = (ids) => ids.map((id, i) => ({ bookingId: `b${i}`, athleteId: id, name: NAMES[id], status: 'attended' }));

async function openSheet(ids, { results = null, prior = {} } = {}) {
  mockRows = rosterOf(ids);
  mockGroups = groupsFor(ids);
  mockResults = results;
  mockPrior = prior;
  const r = await renderScreen(<SessionAttendance bare sessionId="2026-11-07-1" block={tour} onBack={() => {}} />);
  await r.click(results?.results?.length ? 'Edit Tour results' : 'Enter Tour results');
  return r;
}
// The nth strokes field, in roster order.
const typeScore = async (r, index, value) => {
  const field = r.container.querySelectorAll('input[inputmode="numeric"]')[index];
  await r.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const pickerOf = (r, name) => r.container.querySelector(`[role="group"][aria-label="Boys or Girls for ${name}"]`);
const pick = async (r, name, label) => {
  const b = [...pickerOf(r, name).querySelectorAll('button')].find((x) => x.textContent === label);
  await r.act(() => { b.click(); });
};
const pressed = (r, name) => [...pickerOf(r, name).querySelectorAll('button')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const saved = (n = 0) => mockWrites.results[n].map((e) => [e.athleteId, e.bracket, e.score]);

beforeEach(() => {
  mockGroupsLoading = false;
  mockCalls.prior.length = 0;
  mockWrites.results.length = 0;
});

test('each chip reads its age group, and only the 15 & up rows get Boys / Girls', async () => {
  const r = await openSheet(['ivy', 'theo', 'maya', 'owen', 'nell']);
  const chips = [...r.container.querySelectorAll('span')].filter((s) => s.style.textTransform === 'uppercase').map((s) => s.textContent);
  expect(chips).toEqual(['11 & under', '12–14', '15 & up', '15 & up', 'Open']);
  expect(r.container.querySelectorAll('[role="group"][aria-label^="Boys or Girls for"]')).toHaveLength(2);
  expect(pickerOf(r, 'Maya Quill')).not.toBeNull();
  expect(pickerOf(r, 'Owen Pike')).not.toBeNull();
  expect(pickerOf(r, 'Theo Brandt')).toBeNull();
  expect(r.text()).toContain('Boys and girls are ranked separately at 15 & up');
  // The pre-fill is asked for this roster's athletes.
  expect(mockCalls.prior.at(-1)).toEqual(['ivy', 'theo', 'maya', 'owen', 'nell']);
  await r.unmount();
});

test('a 14-year-old saves 12-14 and an 11-year-old 11U with no Boys/Girls asked; no dob saves null (Open)', async () => {
  const r = await openSheet(['ivy', 'theo', 'nell']);
  expect(r.container.querySelector('[role="group"]')).toBeNull();
  expect(r.text()).not.toContain('Boys and girls are ranked separately');
  await typeScore(r, 0, '47');
  await typeScore(r, 1, '41');
  await typeScore(r, 2, '52');
  await r.click('Save scores');
  expect(saved()).toEqual([['ivy', '11U', 47], ['theo', '12-14', 41], ['nell', null, 52]]);
  expect(r.text()).toContain('Scores saved');
  await r.unmount();
});

test('a scored 15 & up row without Boys or Girls is not saved: the sheet names it, the other rows save, and a pick then saves it', async () => {
  const r = await openSheet(['ivy', 'maya', 'owen']);
  expect(pressed(r, 'Maya Quill')).toEqual([]);
  await typeScore(r, 0, '45');
  await typeScore(r, 1, '40');
  await typeScore(r, 2, '38');
  expect(r.text()).toContain('Choose Boys or Girls for Maya Quill and Owen Pike. Those scores are not saved until you do.');
  await r.click('Save scores');
  // Only Ivy landed; no bare '15+' was ever sent.
  expect(saved()).toEqual([['ivy', '11U', 45]]);
  expect(r.text()).toContain('1 score saved. Not saved: Maya Quill and Owen Pike. Choose Boys or Girls, then tap Save scores again.');
  expect(r.text()).not.toContain('Scores saved');
  await pick(r, 'Maya Quill', 'Girls');
  await pick(r, 'Owen Pike', 'Boys');
  expect(pressed(r, 'Maya Quill')).toEqual(['Girls']);
  expect(r.text()).not.toContain('Choose Boys or Girls for');
  await r.click('Save scores');
  expect(saved(1)).toEqual([['ivy', '11U', 45], ['maya', '15+G', 40], ['owen', '15+B', 38]]);
  expect(r.text()).toContain('Scores saved');
  expect(mockWrites.results.flat().some((e) => e.bracket === '15+')).toBe(false);
  await r.unmount();
});

test('only unpicked 15 & up rows scored: Save scores stays off and the footer names the athlete', async () => {
  const r = await openSheet(['ivy', 'maya']);
  await typeScore(r, 1, '40');
  expect(r.button('Save scores').disabled).toBe(true);
  expect(r.text()).toContain('Choose Boys or Girls for Maya Quill. That score is not saved until you do.');
  await pick(r, 'Maya Quill', 'Boys');
  expect(r.button('Save scores').disabled).toBe(false);
  await r.unmount();
});

test("the pick pre-fills from the athlete's most recent saved 15 & up result, so no tap is needed", async () => {
  const r = await openSheet(['maya', 'owen'], { prior: { maya: 'G', owen: 'B' } });
  expect(pressed(r, 'Maya Quill')).toEqual(['Girls']);
  expect(pressed(r, 'Owen Pike')).toEqual(['Boys']);
  await typeScore(r, 0, '42');
  await typeScore(r, 1, '39');
  await r.click('Save scores');
  expect(saved()).toEqual([['maya', '15+G', 42], ['owen', '15+B', 39]]);
  await r.unmount();
});

test("this event's own saved result beats the earlier pre-fill, and a tap on the sheet beats both", async () => {
  const results = { results: [{ athleteId: 'maya', name: 'Maya Quill', bracket: '15+B', score: 40, position: 1 }] };
  const r = await openSheet(['maya'], { results, prior: { maya: 'G' } });
  expect(pressed(r, 'Maya Quill')).toEqual(['Boys']);
  await pick(r, 'Maya Quill', 'Girls');
  await r.click('Save scores');
  expect(saved()).toEqual([['maya', '15+G', 40]]);
  await r.unmount();
});

test('Save scores waits while the age groups load', async () => {
  mockGroupsLoading = true;
  const r = await openSheet(['ivy']);
  await typeScore(r, 0, '45');
  expect(r.text()).toContain('Loading age groups…');
  expect(r.button('Save scores').disabled).toBe(true);
  await r.unmount();
});
