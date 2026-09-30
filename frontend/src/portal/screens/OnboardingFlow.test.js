/**
 * The onboarding walkthrough (tester report 2026-09-30, Teddy):
 * - "Notice Reese", but no Reese: the family step read the signed-in family's
 *   own household on live data. It is pinned to the Whitfield seed now, and
 *   the copy names only what that step renders.
 * - "I didn't get a walkthrough when I first started": the homes offer it to
 *   a new family, below Pay, until it is taken, declined or completed - never
 *   inside the walkthrough itself; Settings' Replay still opens it.
 */
import React, { act } from 'react';
import { renderScreen } from './testRender';
import OnboardingFlow, { OnboardingWelcomeRoute } from './OnboardingFlow';
import ParentDashboard from './ParentDashboard';
import AthleteDashboard from './AthleteDashboard';
import { PARENT_STEPS } from './OnboardingSteps';
import * as live from '../hooks/live';

jest.mock('../hooks/live', () => ({
  ...jest.requireActual('../hooks/live'),
  __esModule: true,
  fetchCurrentUser: jest.fn(),
}));

const OFFER = 'Take the walkthrough';
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
    // The walkthrough never offers itself.
    expect(r.button(OFFER)).toBeNull();
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

  test('the athlete track dashboard step does not offer the walkthrough either', async () => {
    const r = await renderScreen(<OnboardingFlow track="athlete" initialStep={1} />);
    expect(r.text()).toContain('Your dashboard');
    expect(r.button(OFFER)).toBeNull();
    await r.unmount();
  });
});

describe('the first-visit offer on the homes', () => {
  test('parent: shown below the cards; Take opens the parent track and is remembered', async () => {
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    expect(r.text()).toContain('New here?');
    await r.click(OFFER);
    expect(r.location().pathname).toBe('/portal/welcome');
    expect(r.location().search).toBe('?track=parent');
    expect(window.localStorage.getItem('ryp.onboarding.offered.parent')).toBe('true');
    await r.unmount();

    const again = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    expect(again.button(OFFER)).toBeNull();
    await again.unmount();
  });

  test('parent: Not now hides it for good on this device', async () => {
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    await r.click('Not now');
    expect(r.button(OFFER)).toBeNull();
    expect(r.location().pathname).toBe('/portal/family');
    await r.unmount();
    const again = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    expect(again.button(OFFER)).toBeNull();
    await again.unmount();
  });

  test('a completed track is never offered', async () => {
    window.localStorage.setItem('ryp.onboarding.parent', 'true');
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    expect(r.button(OFFER)).toBeNull();
    await r.unmount();
  });

  test('athlete: offered on the athlete home, opening the athlete track', async () => {
    const r = await renderScreen(<AthleteDashboard bare />, { path: '/portal/home' });
    await r.click(OFFER);
    expect(r.location().pathname).toBe('/portal/welcome');
    expect(r.location().search).toBe('?track=athlete');
    await r.unmount();
  });

  test('Replay still opens the walkthrough after it was taken and completed', async () => {
    window.localStorage.setItem('ryp.onboarding.parent', 'true');
    window.localStorage.setItem('ryp.onboarding.offered.parent', 'true');
    const r = await renderScreen(<OnboardingWelcomeRoute />, { path: '/portal/welcome' });
    expect(r.text()).toContain('Welcome to the portal');
    const parentTrack = [...r.container.querySelectorAll('[role="button"]')].find((el) => el.textContent.startsWith('I’m a parent'));
    await act(async () => { parentTrack.click(); });
    expect(r.text()).toContain(`Step 1 of ${PARENT_STEPS.length}`);
    await r.click('Continue');
    expect(r.text()).toContain('Notice Reese');
    expect(cardNamed(r, 'Reese')).not.toBeNull();
    await r.unmount();
  });
});
