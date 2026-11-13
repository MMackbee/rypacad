import React from 'react';
import { renderScreen } from './testRender';
import TourStandings from './TourStandings';
import { TOUR_EVENT_EXPLAINER, TOUR_POINTS_RULE, deriveTourStandings } from '../data/tour';
import { TOUR_SEED } from '../data/tourSeed';

/*
 * Owner naming rule (2026-09-30): the academy's Saturday competition is the
 * RYP Tour and one Saturday of it a Tour event. Owner rulings 2026-11-06:
 * one leaderboard with Age and Gender filters; a family lands on the age
 * that includes them. Invented names throughout.
 */
let mockStandings;
// hooks/elite.js: true when every athlete of the family is Elite, null while that loads.
let mockAllElite;
let mockViewerIds;
jest.mock('../hooks', () => ({ useTourStandings: () => mockStandings }));
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, useSelfManaged: () => false }));
jest.mock('../hooks/elite', () => ({ __esModule: true, default: () => mockAllElite }));
jest.mock('../hooks/tourViewer', () => ({ useTourViewerIds: () => mockViewerIds }));

beforeEach(() => {
  mockStandings = { data: TOUR_SEED, loading: false, error: null };
  mockAllElite = false;
  mockViewerIds = [];
});

// Tester Mike 2026-09-30: no talk of tokens for Elite members.
test.each([['an Elite family', true], ['a family still loading', null]])('%s reads the explainer without its token sentence', async (_who, allElite) => {
  mockAllElite = allElite;
  const r = await renderScreen(<TourStandings bare role="parent" />);
  expect(r.text()).toContain("A Tour event is the academy's Saturday tournament.");
  expect(r.text()).toContain('Points count toward the season standings on the Tour tab.');
  expect(r.text()).not.toContain('One token per event.');
  await r.unmount();
});

test.each(['parent', 'athlete'])('a %s reads the explainer above the standings, and Tour names throughout', async (role) => {
  const r = await renderScreen(<TourStandings bare role={role} />);
  const text = r.text();
  expect(text).toContain('RYP Tour');
  expect(text).toContain(TOUR_EVENT_EXPLAINER);
  expect(text.indexOf(TOUR_EVENT_EXPLAINER)).toBeLessThan(text.indexOf('Overall ·'));
  expect(text).toContain('Recent Tour events');
  expect(text).not.toMatch(/Recent tournaments|Tournament block|tournament standings/i);
  await r.unmount();
});

test('the empty board explains too, and starts with the first Tour event', async () => {
  const r = await renderScreen(<TourStandings bare role="parent" variant="empty" />);
  expect(r.text()).toContain(TOUR_EVENT_EXPLAINER);
  expect(r.text()).toContain('The RYP Tour starts with the first Tour event.');
  await r.unmount();
});

test('staff see the board without the family explainer, and the points rule on it', async () => {
  const r = await renderScreen(<TourStandings bare role="coach" />);
  expect(r.text()).toContain('Recent Tour events');
  expect(r.text()).not.toContain(TOUR_EVENT_EXPLAINER);
  expect(r.text()).toContain(TOUR_POINTS_RULE);
  expect(r.text()).not.toMatch(/drop|lowest week/i);
  await r.unmount();
});

// QA 2026-10-29: the staff bars have a Tour tab, so the Tour keeps that bar (no dead end).
const tabsOf = (r) => [...r.container.querySelectorAll('nav button')].map((b) => b.textContent);
const currentTab = (r) => r.container.querySelector('nav [aria-current="page"]')?.textContent ?? null;

test.each([
  ['mental', undefined, ['Sessions', 'Today', 'Athletes', 'Tour']],
  ['ops', undefined, ['Admin', 'Today', 'Sessions', 'Tour']],
  ['owner', undefined, ['Admin', 'Today', 'Sessions', 'Staff', 'Tour']],
  ['coach', 'phil', ['Sessions', 'Today', 'Assessments', 'Tour']],
])('the %s login keeps its own tab bar on the Tour, with Tour current', async (role, specialistId, tabs) => {
  const r = await renderScreen(<TourStandings bare role={role} specialistId={specialistId} />);
  expect(tabsOf(r)).toEqual(tabs);
  expect(currentTab(r)).toBe('Tour');
  await r.unmount();
});

test('a coach, whose bar has no Tour tab, still gets the bar back to Today', async () => {
  const r = await renderScreen(<TourStandings bare role="coach" />);
  expect(tabsOf(r)).toEqual(['Today', 'Roster']);
  expect(currentTab(r)).toBeNull();
  await r.unmount();
});

const row = (athleteId, bracket, gender, score, date = '2026-11-07') => ({ sessionId: `${date}-1`, date, athleteId, bracket, gender, score, name: athleteId });
const season = (rows, extra) => {
  mockStandings = { data: deriveTourStandings(rows, extra), loading: false, error: null };
};
const FIELD = [
  row('Ava Green', '11-14', 'girls', 84),
  row('Ben Brook', '11-14', 'boys', 88),
  row('Cleo Stone', '15-18', 'girls', 78),
  row('Dex Hale', '15-18', 'boys', 74),
  row('Eli Fox', '10U', 'boys', 41),
  row('coach_fay', 'coaches', 'girls', 80),
  row('coach_gus', 'coaches', 'boys', 76),
];
const group = (r, label) => r.container.querySelector(`[role="group"][aria-label="${label}"]`);
const chipLabels = (r, label) => [...(group(r, label)?.querySelectorAll('button') ?? [])].map((b) => b.textContent);
const on = (r, label) => [...(group(r, label)?.querySelectorAll('button') ?? [])].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const tap = async (r, groupLabel, chip) => {
  const b = [...group(r, groupLabel).querySelectorAll('button')].find((x) => x.textContent === chip);
  await r.act(() => { b.click(); });
};
const standingNames = (r) => {
  const card = [...r.container.querySelectorAll('div')].find((d) => d.textContent.startsWith(TOUR_POINTS_RULE));
  return card ? [...card.nextSibling.children].map((c) => c.textContent.match(/^\d+(\D*?)\d+ events?/)?.[1]) : [];
};

test('one leaderboard, Overall by default; every Age x Gender pick shows its board', async () => {
  season(FIELD);
  const r = await renderScreen(<TourStandings bare role="coach" />);
  expect(chipLabels(r, 'Age')).toEqual(['11–18 overall', '10 & under', '11–14', '15–18', 'Coaches']);
  expect(chipLabels(r, 'Gender')).toEqual(['All', 'Boys', 'Girls']);
  expect(on(r, 'Age')).toEqual(['11–18 overall']);
  expect(on(r, 'Gender')).toEqual(['All']);
  expect(r.text()).toContain('Overall · 4');
  expect(standingNames(r)).toEqual(['Dex Hale', 'Cleo Stone', 'Ava Green', 'Ben Brook']);
  await tap(r, 'Gender', 'Girls');
  expect(r.text()).toContain('Girls · 2');
  expect(standingNames(r)).toEqual(['Cleo Stone', 'Ava Green']);
  await tap(r, 'Age', '11–14');
  expect(r.text()).toContain('11–14 Girls · 1');
  expect(standingNames(r)).toEqual(['Ava Green']);
  await tap(r, 'Age', '10 & under');
  expect(group(r, 'Gender')).toBeNull();
  expect(standingNames(r)).toEqual(['Eli Fox']);
  await tap(r, 'Age', 'Coaches');
  expect(chipLabels(r, 'Gender')).toEqual(['All', 'Men', 'Women']);
  // Crossing into Coaches resets Gender to All: Girls never becomes an empty Women board.
  expect(on(r, 'Gender')).toEqual(['All']);
  expect(r.text()).toContain('Coaches · 2');
  await tap(r, 'Gender', 'Women');
  expect(r.text()).toContain('Coaches · Women · 1');
  await tap(r, 'Gender', 'Men');
  expect(standingNames(r)).toEqual(['coach_gus']);
  // ...and crossing back out resets it again.
  await tap(r, 'Age', '15–18');
  expect(on(r, 'Gender')).toEqual(['All']);
  // Between the kids' groups the choice carries.
  await tap(r, 'Gender', 'Girls');
  await tap(r, 'Age', '11–14');
  expect(on(r, 'Gender')).toEqual(['Girls']);
  await r.unmount();
});

test('Open appears only when someone has no dob; an empty combination says so', async () => {
  season(FIELD);
  let r = await renderScreen(<TourStandings bare role="coach" />);
  expect(chipLabels(r, 'Age')).not.toContain('Open');
  await r.unmount();
  season([...FIELD, row('Nod Nodob', null, null, 90)]);
  r = await renderScreen(<TourStandings bare role="coach" />);
  expect(chipLabels(r, 'Age')).toContain('Open');
  await tap(r, 'Age', 'Open');
  expect(group(r, 'Gender')).toBeNull();
  expect(standingNames(r)).toEqual(['Nod Nodob']);
  await r.unmount();
  season([row('Ava Green', '11-14', 'girls', 84)]);
  r = await renderScreen(<TourStandings bare role="coach" />);
  await tap(r, 'Age', '15–18');
  expect(r.text()).toContain('No scores on the 15–18 leaderboard yet.');
  await r.unmount();
});

test('the weekly events follow the filters too, with scores and points', async () => {
  season([...FIELD, row('Ava Green', '11-14', 'girls', 80, '2026-11-14'), row('Dex Hale', '15-18', 'boys', 72, '2026-11-14')]);
  const r = await renderScreen(<TourStandings bare role="coach" />);
  const eventsText = () => r.text().slice(r.text().indexOf('Recent Tour events'));
  expect(eventsText()).toContain('Saturday, Nov 14');
  expect(eventsText()).toContain('Dex Hale72 · 10 pts');
  await tap(r, 'Age', '10 & under');
  // 10 & under played only on Nov 7: Nov 14 has no card on this board.
  expect(eventsText()).not.toContain('Nov 14');
  expect(eventsText()).toContain('Eli Fox41 · 10 pts');
  await r.unmount();
});

test('an athlete or parent lands on the age that includes them; a tap then sticks', async () => {
  season(FIELD);
  mockViewerIds = ['Eli Fox'];
  let r = await renderScreen(<TourStandings bare role="parent" />);
  expect(on(r, 'Age')).toEqual(['10 & under']);
  await tap(r, 'Age', '11–14');
  expect(on(r, 'Age')).toEqual(['11–14']);
  await r.unmount();
  mockViewerIds = ['Ava Green'];
  r = await renderScreen(<TourStandings bare role="athlete" athleteId="Ava Green" />);
  expect(on(r, 'Age')).toEqual(['11–18 overall']);
  expect(on(r, 'Gender')).toEqual(['All']);
  await r.unmount();
});

// Review 2026-11-06: the landing follows the data only until the viewer taps a filter - either one.
test('a landing that arrives late moves an untouched board, but not one the viewer picked a gender on', async () => {
  season(FIELD);
  mockViewerIds = [];
  let r = await renderScreen(<TourStandings bare role="parent" />);
  expect(on(r, 'Age')).toEqual(['11–18 overall']);
  mockViewerIds = ['Eli Fox'];
  await r.rerender(<TourStandings bare role="parent" />);
  expect(on(r, 'Age')).toEqual(['10 & under']);
  await r.unmount();
  mockViewerIds = [];
  r = await renderScreen(<TourStandings bare role="parent" />);
  await tap(r, 'Gender', 'Girls');
  mockViewerIds = ['Eli Fox'];
  await r.rerender(<TourStandings bare role="parent" />);
  expect(on(r, 'Age')).toEqual(['11–18 overall']);
  expect(on(r, 'Gender')).toEqual(['Girls']);
  expect(r.text()).toContain('Girls · 2');
  await r.unmount();
});

test('"Your results" reads the selected board, else their own age board', async () => {
  season(FIELD);
  mockViewerIds = ['Ava Green'];
  const r = await renderScreen(<TourStandings bare role="athlete" athleteId="Ava Green" />);
  const yours = () => r.text().slice(r.text().indexOf('Your results'));
  expect(yours()).toContain('84 strokes · 3rd · Overall8');
  await tap(r, 'Gender', 'Girls');
  expect(yours()).toContain('84 strokes · 2nd · Girls9');
  await tap(r, 'Age', 'Coaches');
  expect(yours()).toContain('84 strokes · 1st · 11–1410');
  await r.unmount();
});

test('an unnamed event reads "Tour event"; a label typed in the calendar stays as typed', async () => {
  season([row('Jordan', '11-14', 'boys', 79), row('Jordan', '11-14', 'boys', 81, '2026-12-26')], { labelById: { '2026-12-26-1': 'Holiday Tournament' } });
  const r = await renderScreen(<TourStandings bare role="coach" />);
  expect(r.text()).toContain('Saturday, Nov 7Tour event');
  expect(r.text()).toContain('Holiday Tournament');
  await r.unmount();
});

test('a legacy-id result shows on its own board under the old label, after the others, not on Overall', async () => {
  season([row('Lu Legacy', '14+', null, 81), row('Ava Green', '11-14', 'girls', 84)]);
  const r = await renderScreen(<TourStandings bare role="coach" />);
  expect(chipLabels(r, 'Age')).toEqual(['11–18 overall', '10 & under', '11–14', '15–18', 'Coaches', '14 & up']);
  expect(standingNames(r)).toEqual(['Ava Green']);
  await tap(r, 'Age', '14 & up');
  expect(standingNames(r)).toEqual(['Lu Legacy']);
  await r.unmount();
});
