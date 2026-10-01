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
    "A Tour event is the academy's Saturday tournament. Coaches record every score, you are ranked in your age bracket (10 & under, 11-13, 14 & up), and points count toward the season standings on the Tour tab. One token per event."
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

test('an unnamed event reads "Tour event"; a label typed in the calendar stays as typed', async () => {
  const row = (sessionId, date, athleteId, score) => ({ sessionId, date, athleteId, score, bracket: '14+', name: athleteId });
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
