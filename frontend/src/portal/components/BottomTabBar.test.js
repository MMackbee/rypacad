import React from 'react';
import { renderScreen } from '../screens/testRender';
import BottomTabBar from './BottomTabBar';

/*
 * Owner report (Mike S6 2026-09-30): the 18+ athlete who signed up for
 * themselves gets the parent's Billing and Settings tabs; a child's login
 * keeps the plain athlete bar. The signed-in session's flag is the default.
 */
let mockSessionSelfManaged = false;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, useSelfManaged: () => mockSessionSelfManaged }));

const labels = (r) => [...r.container.querySelectorAll('nav button')].map((b) => b.textContent);

afterEach(() => {
  mockSessionSelfManaged = false;
  delete process.env.REACT_APP_CONTRACT_ENABLED;
});

test("a child's athlete bar has no Billing or Settings", async () => {
  const r = await renderScreen(<BottomTabBar role="athlete" active="home" />);
  expect(labels(r)).toEqual(['Home', 'Schedule', 'Tour']);
  await r.unmount();
});

test('the self-managed athlete bar adds Billing and Settings, in the parent order', async () => {
  const r = await renderScreen(<BottomTabBar role="athlete" active="billing" selfManaged />);
  expect(labels(r)).toEqual(['Home', 'Schedule', 'Billing', 'Tour', 'Settings']);
  expect(r.button('Billing').getAttribute('aria-current')).toBe('page');
  await r.click('Billing');
  expect(r.location().pathname).toBe('/portal/billing');
  await r.click('Settings');
  expect(r.location().pathname).toBe('/portal/settings');
  await r.unmount();
});

test("the signed-in session's selfManaged is the default; an explicit prop wins", async () => {
  mockSessionSelfManaged = true;
  const fromSession = await renderScreen(<BottomTabBar role="athlete" active="home" />);
  expect(labels(fromSession)).toEqual(['Home', 'Schedule', 'Billing', 'Tour', 'Settings']);
  await fromSession.unmount();
  const overridden = await renderScreen(<BottomTabBar role="athlete" active="home" selfManaged={false} />);
  expect(labels(overridden)).toEqual(['Home', 'Schedule', 'Tour']);
  await overridden.unmount();
});

test('the Contract tab keeps its slot when the contract is on', async () => {
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  const r = await renderScreen(<BottomTabBar role="athlete" selfManaged />);
  expect(labels(r)).toEqual(['Home', 'Schedule', 'Contract', 'Billing', 'Tour', 'Settings']);
  await r.unmount();
});

test('selfManaged never changes a parent or staff bar', async () => {
  mockSessionSelfManaged = true;
  const parent = await renderScreen(<BottomTabBar role="parent" selfManaged />);
  expect(labels(parent)).toEqual(['Home', 'Reservations', 'Billing', 'Tour', 'Settings']);
  await parent.unmount();
  const coach = await renderScreen(<BottomTabBar role="coach" selfManaged />);
  expect(labels(coach)).toEqual(['Today', 'Roster', 'Capture']);
  await coach.unmount();
});
