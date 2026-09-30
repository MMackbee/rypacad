/**
 * The onboarding walkthrough (tester report 2026-09-30, Teddy):
 * - "Notice Reese", but no Reese: the family step read the signed-in family's
 *   own household on live data. It is pinned to the Whitfield seed now, and
 *   the copy names only what that step renders.
 */
import React from 'react';
import { renderScreen } from './testRender';
import OnboardingFlow from './OnboardingFlow';
import { PARENT_STEPS } from './OnboardingSteps';
import * as live from '../hooks/live';

jest.mock('../hooks/live', () => ({
  ...jest.requireActual('../hooks/live'),
  __esModule: true,
  fetchCurrentUser: jest.fn(),
}));

/** A leaf element whose whole text is `name` - a rendered athlete card's name line. */
const cardNamed = (r, name) =>
  [...r.container.querySelectorAll('div')].find((el) => el.children.length === 0 && el.textContent === name) || null;

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  live.fetchCurrentUser.mockImplementation(async () => { throw new Error('live read inside practice'); });
});
afterEach(() => {
  process.env.REACT_APP_PORTAL_LIVE_DATA = 'false';
});

describe('the family step shows the sample family its copy names', () => {
  test('Reese is on screen, Behind, with her tokens - on live data too, with no live read and no real Pay', async () => {
    process.env.REACT_APP_PORTAL_LIVE_DATA = 'true';
    const r = await renderScreen(<OnboardingFlow track="parent" initialStep={1} />, { path: '/portal/welcome' });
    expect(r.text()).toContain('Look at the balances');
    expect(r.text()).toContain('Notice Reese');
    for (const name of ['Jordan', 'Reese', 'Nico']) expect(cardNamed(r, name)).not.toBeNull();
    expect(r.text()).toContain('Behind');
    expect(r.text()).toContain('more than 5 weekdays of her Commitment Contract');
    expect(r.text()).toContain('2 tokens left');
    expect(r.text()).not.toContain("Family overview didn't load");
    expect(r.text()).not.toContain('Pay now');
    expect(live.fetchCurrentUser).not.toHaveBeenCalled();
    await r.unmount();
  });

  test('every athlete the family instruction names has a card on that step', async () => {
    const step = PARENT_STEPS.find((s) => s.id === 'family');
    const named = [...step.instruction.body.matchAll(/Notice (\w+)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    const r = await renderScreen(<OnboardingFlow track="parent" initialStep={1} />);
    for (const name of named) expect(cardNamed(r, name)).not.toBeNull();
    await r.unmount();
  });
});
