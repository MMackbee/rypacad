import React from 'react';
import { renderScreen } from '../screens/testRender';
import BottomTabBar, { TABS } from './BottomTabBar';

/*
 * Owner report (Mike S6 2026-09-30): the 18+ athlete who signed up for
 * themselves gets the parent's Billing and Settings tabs; a child's login
 * keeps the plain athlete bar. The signed-in session's flag is the default.
 */
let mockSessionSelfManaged = false;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, useSelfManaged: () => mockSessionSelfManaged }));
import { publishAssessorTab } from '../hooks/assessorTab';

const labels = (r) => [...r.container.querySelectorAll('nav button')].map((b) => b.textContent);

afterEach(() => {
  mockSessionSelfManaged = false;
  delete process.env.REACT_APP_CONTRACT_ENABLED;
});

test('owners and ops get a Today tab for the golf day, beside the specialists\' Sessions (owner ruling 2026-11-02)', async () => {
  const owner = await renderScreen(<BottomTabBar role="owner" active="today" />);
  expect(labels(owner)).toEqual(['Admin', 'Today', 'Sessions', 'Staff', 'Tour']);
  expect(owner.button('Today').getAttribute('aria-current')).toBe('page');
  await owner.unmount();
  const ops = await renderScreen(<BottomTabBar role="ops" active="admin" />);
  expect(labels(ops)).toEqual(['Admin', 'Today', 'Sessions', 'Tour']);
  await ops.unmount();
  const coach = await renderScreen(<BottomTabBar role="coach" active="today" />);
  expect(labels(coach)).toEqual(['Today', 'Roster']);
  await coach.unmount();
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
  expect(labels(coach)).toEqual(['Today', 'Roster']);
  await coach.unmount();
});

test('mental: Sessions, Today, Athletes, Contract (key mental-contract) and Tour, with the contract switch off', async () => {
  delete process.env.REACT_APP_CONTRACT_ENABLED;
  const r = await renderScreen(<BottomTabBar role="mental" active="athletes" />, { path: '/portal/mental' });
  expect(['Sessions', 'Athletes', 'Contract', 'Tour'].every((l) => r.text().includes(l))).toBe(true);
  expect(TABS.mental.map((t) => t.key)).toEqual(['sessions', 'today', 'athletes', 'mental-contract', 'assessments', 'tour']);
  expect(labels(r)).toEqual(['Sessions', 'Today', 'Athletes', 'Contract', 'Tour']);
  expect(TABS.mental.find((t) => t.key === 'mental-contract').route).toBe('/portal/mental/contract');
  r.unmount();
});

test('Phil and Yannick get a Today tab for the golf day, beside the Sessions they land on (owner ruling 2026-11-03)', async () => {
  const phil = await renderScreen(<BottomTabBar role="coach" specialistId="phil" active="today" />, { path: '/portal/coach' });
  expect(labels(phil)).toEqual(['Sessions', 'Today', 'Assessments', 'Tour']);
  expect(phil.button('Today').getAttribute('aria-current')).toBe('page');
  await phil.click('Sessions');
  expect(phil.location().pathname).toBe('/portal/my-sessions');
  await phil.unmount();
  const yannick = await renderScreen(<BottomTabBar role="mental" active="sessions" />, { path: '/portal/my-sessions' });
  expect(labels(yannick)).toEqual(['Sessions', 'Today', 'Athletes', 'Contract', 'Tour']);
  expect(yannick.button('Sessions').getAttribute('aria-current')).toBe('page');
  await yannick.click('Today');
  expect(yannick.location().pathname).toBe('/portal/coach');
  await yannick.unmount();
  // Each set still leads with its landing screen (landingFor); Today is the same tab in both.
  expect(TABS.coachSpecialist[0].key).toBe('sessions');
  expect(TABS.mental[0].key).toBe('sessions');
  expect(TABS.coachSpecialist[1]).toEqual(TABS.mental[1]);
  expect(TABS.mental[1]).toEqual({ key: 'today', label: 'Today', icon: 'calendar', route: '/portal/coach' });
});

test('Diagnostic Capture is gone: no Capture tab for a coach or for Phil (assessments spec 8)', async () => {
  const coach = await renderScreen(<BottomTabBar role="coach" />);
  expect(labels(coach)).toEqual(['Today', 'Roster']);
  await coach.unmount();
  const phil = await renderScreen(<BottomTabBar role="coach" specialistId="phil" />);
  expect(labels(phil)).not.toContain('Capture');
  await phil.unmount();
});

test('Assessments: for Phil and for staff the owner gave the permission; never a plain coach (assessments spec 5)', async () => {
  const phil = await renderScreen(<BottomTabBar role="coach" specialistId="phil" active="assessments" />);
  expect(labels(phil)).toEqual(['Sessions', 'Today', 'Assessments', 'Tour']);
  expect(phil.button('Assessments').getAttribute('aria-current')).toBe('page');
  await phil.click('Assessments');
  expect(phil.location().pathname).toBe('/portal/assessments');
  await phil.unmount();
  const assessor = await renderScreen(<BottomTabBar role="coach" assessments />);
  expect(labels(assessor)).toEqual(['Today', 'Roster', 'Assessments']);
  await assessor.unmount();
  publishAssessorTab(true);
  try {
    const fromSession = await renderScreen(<BottomTabBar role="coach" />);
    expect(labels(fromSession)).toEqual(['Today', 'Roster', 'Assessments']);
    await fromSession.unmount();
  } finally {
    publishAssessorTab(false);
  }
  const plain = await renderScreen(<BottomTabBar role="coach" />);
  expect(labels(plain)).toEqual(['Today', 'Roster']);
  await plain.unmount();
  const mental = await renderScreen(<BottomTabBar role="mental" />);
  expect(labels(mental)).toEqual(['Sessions', 'Today', 'Athletes', 'Contract', 'Tour']);
  await mental.unmount();
  const mentalAssessor = await renderScreen(<BottomTabBar role="mental" assessments />);
  expect(labels(mentalAssessor)).toEqual(['Sessions', 'Today', 'Athletes', 'Contract', 'Assessments', 'Tour']);
  await mentalAssessor.unmount();
  const owner = await renderScreen(<BottomTabBar role="owner" assessments />);
  expect(labels(owner)).not.toContain('Assessments');
  await owner.unmount();
});
