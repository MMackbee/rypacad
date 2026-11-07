import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';
import { bracketFor } from '../data/tour';
import { SEASON_BOUNDS } from '../data/season';

/*
 * Owner rulings 2026-11-06: 10 & under (9 holes), 11-14 and 15-18 (18
 * holes); everyone 11 and up picks Boys or Girls on the score sheet, picked
 * once per kid per season thanks to the pre-fill; coaches are added per
 * event with Men or Women. A row that cannot save is named, never dropped
 * silently. Invented names throughout.
 */
const DOBS = {
  ivy: '2016-11-03', // 10 on the season start -> 10U
  theo: '2015-11-03', // 11 -> 11-14
  maya: '2011-11-04', // 14 -> 11-14
  owen: '2011-11-03', // 15 -> 15-18
  nell: null, // no dob -> Open
};
const NAMES = { ivy: 'Ivy Marsh', theo: 'Theo Brandt', maya: 'Maya Quill', owen: 'Owen Pike', nell: 'Nell Hart' };
// The age groups the real hook computes: bracketFor on SEASON_BOUNDS.start.
const groupsFor = (ids) => Object.fromEntries(ids.map((id) => [id, bracketFor(DOBS[id], SEASON_BOUNDS.start)]));

let mockRows;
let mockResults;
let mockGroups;
let mockGroupsLoading;
let mockHistory;
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
  useTourSheetHistory: () => ({ data: mockHistory, loading: false, error: null }),
  genericSessionName: () => 'Tour event',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => true }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: null, loading: false, error: null }) }));

const tour = { date: '2026-11-07', time: '10:00 AM', type: 'tournament', name: 'RYP Tour', meta: null };
const rosterOf = (ids) => ids.map((id, i) => ({ bookingId: `b${i}`, athleteId: id, name: NAMES[id], status: 'attended' }));

async function openSheet(ids, { results = null, history = { genderById: {}, coaches: [] } } = {}) {
  mockRows = rosterOf(ids);
  mockGroups = groupsFor(ids);
  mockResults = results;
  mockHistory = history;
  const r = await renderScreen(<SessionAttendance bare sessionId="2026-11-07-1" block={tour} onBack={() => {}} />);
  await r.click(results?.results?.length ? 'Edit Tour results' : 'Enter Tour results');
  return r;
}
const typeScore = (r, name, value) => r.fill(`Strokes for ${name}`, value);
const pickerOf = (r, name, coach = false) => r.container.querySelector(`[role="group"][aria-label="${coach ? 'Men or Women' : 'Boys or Girls'} for ${name}"]`);
const pick = async (r, name, label, coach = false) => {
  const b = [...pickerOf(r, name, coach).querySelectorAll('button')].find((x) => x.textContent === label);
  await r.act(() => { b.click(); });
};
const pressed = (r, name, coach = false) => [...pickerOf(r, name, coach).querySelectorAll('button')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const saved = (n = 0) => mockWrites.results[n].map((e) => [e.athleteId, e.bracket, e.gender, e.score]);
const chips = (r) => [...r.container.querySelectorAll('span')].filter((s) => s.style.textTransform === 'uppercase').map((s) => s.textContent);

beforeEach(() => {
  mockGroupsLoading = false;
  mockWrites.results.length = 0;
});

test('each chip reads its age group; only the 11-and-up rows get Boys / Girls', async () => {
  const r = await openSheet(['ivy', 'theo', 'maya', 'owen', 'nell']);
  expect(chips(r).slice(0, 5)).toEqual(['10 & under', '11–14', '11–14', '15–18', 'Open']);
  expect(r.container.querySelectorAll('[role="group"][aria-label^="Boys or Girls for"]')).toHaveLength(3);
  expect(pickerOf(r, 'Ivy Marsh')).toBeNull();
  expect(pickerOf(r, 'Nell Hart')).toBeNull();
  expect(pickerOf(r, 'Theo Brandt')).not.toBeNull();
  expect(r.text()).toContain('10 & under play 9 holes, everyone 11 and up plays 18');
  expect(r.text()).toContain('Choose Boys or Girls for every player 11 and up');
  await r.unmount();
});

test('10 & under and Open save with no gender asked; null goes out', async () => {
  const r = await openSheet(['ivy', 'nell']);
  expect(r.container.querySelector('[role="group"][aria-label^="Boys or Girls"]')).toBeNull();
  expect(r.text()).not.toContain('Choose Boys or Girls for every player');
  await typeScore(r, 'Ivy Marsh', '41');
  await typeScore(r, 'Nell Hart', '88');
  await r.click('Save scores');
  expect(saved()).toEqual([['ivy', '10U', null, 41], ['nell', null, null, 88]]);
  expect(r.text()).toContain('Scores saved');
  await r.unmount();
});

test('an 11-and-up row without Boys or Girls is not saved: named before, the rest save, the notice says who waits', async () => {
  const r = await openSheet(['ivy', 'theo', 'owen']);
  expect(pressed(r, 'Theo Brandt')).toEqual([]);
  await typeScore(r, 'Ivy Marsh', '45');
  await typeScore(r, 'Theo Brandt', '84');
  await typeScore(r, 'Owen Pike', '76');
  expect(r.text()).toContain('Choose Boys or Girls for Theo Brandt and Owen Pike. Those scores are not saved until you do.');
  await r.click('Save scores');
  expect(saved()).toEqual([['ivy', '10U', null, 45]]);
  expect(r.text()).toContain('1 score saved. Not saved yet: Choose Boys or Girls for Theo Brandt and Owen Pike. Then tap Save scores again.');
  expect(r.text()).not.toContain('Scores saved');
  await pick(r, 'Theo Brandt', 'Boys');
  await pick(r, 'Owen Pike', 'Boys');
  expect(pressed(r, 'Theo Brandt')).toEqual(['Boys']);
  expect(r.text()).not.toContain('Choose Boys or Girls for Theo');
  await r.click('Save scores');
  expect(saved(1)).toEqual([['ivy', '10U', null, 45], ['theo', '11-14', 'boys', 84], ['owen', '15-18', 'boys', 76]]);
  expect(r.text()).toContain('Scores saved');
  await r.unmount();
});

test('a score outside 18..200 is named and not saved; with only blocked rows Save stays off', async () => {
  const r = await openSheet(['ivy', 'maya']);
  await typeScore(r, 'Ivy Marsh', '7');
  await typeScore(r, 'Maya Quill', '90');
  expect(r.text()).toContain('Choose Boys or Girls for Maya Quill. Check the score for Ivy Marsh: strokes are 18 to 200. Those scores are not saved until you do.');
  expect(r.button('Save scores').disabled).toBe(true);
  await pick(r, 'Maya Quill', 'Girls');
  expect(r.text()).toContain('Check the score for Ivy Marsh: strokes are 18 to 200. That score is not saved until you do.');
  expect(r.button('Save scores').disabled).toBe(false);
  await r.unmount();
});

test("the pick pre-fills from the player's most recent saved gender, so no tap is needed", async () => {
  const r = await openSheet(['maya', 'owen'], { history: { genderById: { maya: 'girls', owen: 'boys' }, coaches: [] } });
  expect(pressed(r, 'Maya Quill')).toEqual(['Girls']);
  expect(pressed(r, 'Owen Pike')).toEqual(['Boys']);
  await typeScore(r, 'Maya Quill', '84');
  await typeScore(r, 'Owen Pike', '78');
  await r.click('Save scores');
  expect(saved()).toEqual([['maya', '11-14', 'girls', 84], ['owen', '15-18', 'boys', 78]]);
  await r.unmount();
});

test("this event's own saved gender beats the earlier pre-fill, and a tap beats both", async () => {
  const results = { results: [{ athleteId: 'maya', name: 'Maya Quill', bracket: '11-14', gender: 'boys', score: 80, position: 1 }] };
  const r = await openSheet(['maya'], { results, history: { genderById: { maya: 'girls' }, coaches: [] } });
  expect(pressed(r, 'Maya Quill')).toEqual(['Boys']);
  await pick(r, 'Maya Quill', 'Girls');
  await r.click('Save scores');
  expect(saved()).toEqual([['maya', '11-14', 'girls', 80]]);
  await r.unmount();
});

test('a typed coach needs Men or Women, then saves as coach_<slug> in coaches with the typed name', async () => {
  const r = await openSheet(['ivy']);
  await r.fill('Coach name', '  Pat   Lee ');
  await r.click('Add a coach');
  expect(r.text()).toContain('Coach · not saved yet');
  await typeScore(r, 'Pat Lee', '77');
  expect(r.text()).toContain('Choose Men or Women for Pat Lee.');
  await pick(r, 'Pat Lee', 'Men', true);
  await r.click('Save scores');
  expect(mockWrites.results[0]).toEqual([{ athleteId: 'coach_pat-lee', name: 'Pat Lee', bracket: 'coaches', gender: 'boys', score: 77 }]);
  expect(r.text()).not.toContain('not saved yet');
  expect(r.button('Remove Pat Lee')).toBeNull();
  await r.unmount();
});

test('quick picks add an earlier coach with their spelling and gender; a typed name that matches keeps it too', async () => {
  const history = { genderById: { 'coach_sky-ono': 'girls' }, coaches: [{ athleteId: 'coach_sky-ono', name: 'Sky Ono', gender: 'girls' }, { athleteId: 'coach_pat-lee', name: 'Pat Lee', gender: null }] };
  const r = await openSheet(['ivy'], { history });
  expect(r.text()).toContain('Coaches from earlier Tour events:');
  await r.click('Add coach Sky Ono');
  expect(pressed(r, 'Sky Ono', true)).toEqual(['Women']);
  expect(r.button('Add coach Sky Ono')).toBeNull();
  await r.fill('Coach name', 'pat LEE');
  await r.click('Add a coach');
  expect(pickerOf(r, 'Pat Lee', true)).not.toBeNull();
  await r.fill('Coach name', 'Sky Ono');
  await r.click('Add a coach');
  expect(r.text()).toContain('Sky Ono is already on this sheet.');
  await typeScore(r, 'Sky Ono', '79');
  await r.click('Save scores');
  expect(saved()).toEqual([['coach_sky-ono', 'coaches', 'girls', 79]]);
  await r.unmount();
});

test("an unsaved coach can be removed; this event's saved coaches load back in and stay", async () => {
  const results = { results: [{ athleteId: 'coach_sky-ono', name: 'Sky Ono', bracket: 'coaches', gender: 'girls', score: 79, position: 1 }] };
  const r = await openSheet(['ivy'], { results });
  expect(r.container.querySelector('[aria-label="Strokes for Sky Ono"]').value).toBe('79');
  expect(pressed(r, 'Sky Ono', true)).toEqual(['Women']);
  expect(r.button('Remove Sky Ono')).toBeNull();
  await r.fill('Coach name', 'Pat Lee');
  await r.click('Add a coach');
  await typeScore(r, 'Pat Lee', '81');
  await r.click('Remove Pat Lee');
  expect(r.container.querySelector('[aria-label="Strokes for Pat Lee"]')).toBeNull();
  await r.click('Save scores');
  expect(saved()).toEqual([['coach_sky-ono', 'coaches', 'girls', 79]]);
  await r.unmount();
});

test('a name with nothing to slug is not added', async () => {
  const r = await openSheet(['ivy']);
  await r.fill('Coach name', '!!!');
  await r.click('Add a coach');
  expect(r.text()).toContain('Type the coach’s name first.');
  expect(r.text()).not.toContain('not saved yet');
  await r.unmount();
});

test('Save scores waits while the age groups load', async () => {
  mockGroupsLoading = true;
  const r = await openSheet(['ivy']);
  await typeScore(r, 'Ivy Marsh', '45');
  expect(r.text()).toContain('Loading age groups…');
  expect(r.button('Save scores').disabled).toBe(true);
  await r.unmount();
});
