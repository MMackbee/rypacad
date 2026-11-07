import React from 'react';
import { renderScreen } from './testRender';
import TourStandings from './TourStandings';
import { TOUR_EVENT_EXPLAINER, TOUR_SEED, deriveTourStandings } from '../data/tour';

/*
 * Owner naming rule (2026-09-30): the academy's Saturday competition is the
 * RYP Tour and one Saturday of it a Tour event. A parent or athlete reads what
 * a Tour event is on the Tour tab; staff get the board without it.
 */
let mockStandings;
// hooks/elite.js: true when every athlete of the family is Elite, null while that loads.
let mockAllElite;
jest.mock('../hooks', () => ({ useTourStandings: () => mockStandings }));
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, useSelfManaged: () => false }));
jest.mock('../hooks/elite', () => ({ __esModule: true, default: () => mockAllElite }));

beforeEach(() => {
  mockStandings = { data: TOUR_SEED, loading: false, error: null };
  mockAllElite = false;
});

// Tester Mike 2026-09-30: no talk of tokens for Elite members.
test.each([['an Elite family', true], ['a family still loading', null]])('%s reads the explainer without its token sentence', async (_who, allElite) => {
  mockAllElite = allElite;
  const r = await renderScreen(<TourStandings bare role="parent" />);
  expect(r.text()).toContain("A Tour event is the academy's Saturday tournament.");
  expect(r.text()).toContain('points count toward the season standings on the Tour tab.');
  expect(r.text()).not.toContain('One token per event.');
  await r.unmount();
});

test('the explainer is the owner\'s wording, one copy', () => {
  expect(TOUR_EVENT_EXPLAINER).toBe(
    "A Tour event is the academy's Saturday tournament. Coaches record every score, you are ranked in your age bracket (11 & under, 12–14 and 15 & up, with boys and girls ranked separately at 15 & up), and points count toward the season standings on the Tour tab. One token per event."
  );
});

test.each(['parent', 'athlete'])('a %s reads the explainer above the standings, and Tour names throughout', async (role) => {
  const r = await renderScreen(<TourStandings bare role={role} />);
  const text = r.text();
  expect(text).toContain('RYP Tour');
  expect(text).toContain(TOUR_EVENT_EXPLAINER);
  expect(text.indexOf(TOUR_EVENT_EXPLAINER)).toBeLessThan(text.indexOf('Standings ·'));
  expect(text).toContain('Recent Tour events');
  expect(text).not.toMatch(/Recent tournaments|Tournament block/);
  await r.unmount();
});

test('the empty board explains too, and starts with the first Tour event', async () => {
  const r = await renderScreen(<TourStandings bare role="parent" variant="empty" />);
  expect(r.text()).toContain(TOUR_EVENT_EXPLAINER);
  expect(r.text()).toContain('The RYP Tour starts with the first Tour event.');
  await r.unmount();
});

test('staff see the board without the family explainer', async () => {
  const r = await renderScreen(<TourStandings bare role="coach" />);
  expect(r.text()).toContain('Recent Tour events');
  expect(r.text()).not.toContain(TOUR_EVENT_EXPLAINER);
  await r.unmount();
});

// QA 2026-10-29: the staff bars have a Tour tab, so the Tour keeps that bar (no dead end).
const tabsOf = (r) => [...r.container.querySelectorAll('nav button')].map((b) => b.textContent);
const currentTab = (r) => r.container.querySelector('nav [aria-current="page"]')?.textContent ?? null;

test.each([
  // 2026-11-03 (owner ruling): Phil's and Yannick's sets gained Today, the golf day view.
  ['mental', undefined, ['Sessions', 'Today', 'Athletes', 'Contract', 'Tour']],
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

test('an unnamed event reads "Tour event"; a label typed in the calendar stays as typed', async () => {
  const row = (sessionId, date, athleteId, score) => ({ sessionId, date, athleteId, score, bracket: '12-14', name: athleteId });
  const derived = deriveTourStandings(
    [row('s1', '2026-11-07', 'Jordan', 39), row('s2', '2026-12-28', 'Jordan', 41)],
    { labelById: { s2: 'Holiday Tournament' } }
  );
  expect(derived.events.map((e) => e.label)).toEqual(['Holiday Tournament', 'Tour event']);
  mockStandings = { data: derived, loading: false, error: null };
  const r = await renderScreen(<TourStandings bare role="coach" />);
  expect(r.text()).toContain('Saturday, Nov 7Tour event');
  expect(r.text()).toContain('Holiday Tournament');
  await r.unmount();
});

// Owner ruling 2026-11-06: the new groups first, a legacy id after them under its old label, Open last.
test('the bracket chips read the 2026-11-06 groups in order, then a legacy bracket, then Open', async () => {
  const row = (athleteId, bracket, score) => ({ sessionId: '2026-11-07-1', date: '2026-11-07', athleteId, score, bracket, name: athleteId });
  mockStandings = {
    data: deriveTourStandings([
      row('Kai', null, 50), row('Lu', '14+', 44), row('Wren Calloway', '15+G', 41), row('Jasper Quint', '15+B', 39), row('Oz', '12-14', 40), row('Pia', '11U', 46),
    ]),
    loading: false,
    error: null,
  };
  const r = await renderScreen(<TourStandings bare role="coach" />);
  const chips = [...r.container.querySelectorAll('button')].map((b) => b.textContent)
    .filter((t) => ['11 & under', '12–14', '15 & up Boys', '15 & up Girls', '14 & up', 'Open'].includes(t));
  expect(chips).toEqual(['11 & under', '12–14', '15 & up Boys', '15 & up Girls', '14 & up', 'Open']);
  // Boys and girls 15 & up each have their own winner.
  await r.click('15 & up Girls');
  expect(r.text()).toContain('Wren Calloway');
  expect(r.text()).not.toContain('Jasper Quint');
  await r.click('15 & up Boys');
  expect(r.text()).toContain('Jasper Quint');
  expect(r.text()).not.toContain('Wren Calloway');
  await r.unmount();
});
