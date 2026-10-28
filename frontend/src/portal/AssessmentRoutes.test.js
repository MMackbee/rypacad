import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

const mockLive = { value: true };
const mockUser = { value: null };
jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));
jest.mock('./screens/CoachDashboard', () => ({ __esModule: true, default: () => 'COACH HOME' }));
jest.mock('./screens/SpecialistDay', () => ({ __esModule: true, default: () => 'MY SESSIONS' }));
jest.mock('./screens/ParentDashboard', () => ({ __esModule: true, default: () => 'FAMILY HOME' }));
jest.mock('./screens/AthleteDashboard', () => ({ __esModule: true, default: () => 'ATHLETE HOME' }));
jest.mock('./screens/AdminDashboard', () => {
  const { createElement } = require('react');
  return { __esModule: true, default: ({ onOpenAssessments }) => createElement('button', { type: 'button', onClick: onOpenAssessments }, 'ADMIN') };
});
jest.mock('./screens/AssessmentList', () => {
  const { createElement } = require('react');
  return { __esModule: true, default: ({ viewer, onBack }) => createElement('button', { type: 'button', onClick: onBack }, `LIST as ${viewer.role}${onBack ? ' with back' : ''}`) };
});
jest.mock('./screens/AssessmentWave', () => ({ __esModule: true, default: ({ waveId, initialStation }) => `WAVE ${waveId} at ${initialStation ?? 'start'}` }));
jest.mock('./screens/AssessmentGolf', () => ({ __esModule: true, default: ({ athleteId, fallbackName }) => `GOLF ${athleteId} ${fallbackName ?? ''}`.trim() }));
jest.mock('./screens/AssessmentSettings', () => ({ __esModule: true, default: ({ viewer }) => `SETTINGS as ${viewer.role}` }));
jest.mock('./screens/AssessmentResults', () => {
  const { createElement } = require('react');
  return { __esModule: true, default: ({ athleteId, fallbackName, onRunMcgill }) => createElement('button', { type: 'button', onClick: () => onRunMcgill('wave-2026-11-03-abc') }, `RESULTS ${athleteId} ${fallbackName ?? ''}`.trim()) };
});
jest.mock('./screens/AthleteDetail', () => {
  const { createElement } = require('react');
  return { __esModule: true, default: ({ onOpenAssessments }) => createElement('button', { type: 'button', onClick: () => onOpenAssessments('Ava Moreno') }, onOpenAssessments ? 'DETAIL with assessments' : 'DETAIL') };
});
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
jest.mock('./hooks/useAuthSession', () => ({
  ...jest.requireActual('./hooks/useAuthSession'),
  __esModule: true,
  default: () => ({ user: mockUser.value, provisioned: Boolean(mockUser.value), loading: false, signOut: async () => {}, refresh: () => {} }),
}));

function Spy({ onLoc }) { onLoc(useLocation()); return null; }
async function mount(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const loc = { current: null };
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Spy onLoc={(l) => { loc.current = l; }} />
        <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
      </MemoryRouter>
    );
  });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  return {
    text: () => container.textContent,
    pathname: () => loc.current.pathname,
    click: async () => { await act(async () => { container.querySelector('button').click(); }); for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); }); },
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

afterEach(() => { mockUser.value = null; mockLive.value = true; });

test('Phil, an assessor coach, ops and the owner reach the list', async () => {
  for (const user of [{ uid: 'p', role: 'coach', specialistId: 'phil' }, { uid: 'a', role: 'coach', assessor: true }, { uid: 'o', role: 'ops' }, { uid: 'w', role: 'owner' }]) {
    mockUser.value = user;
    const r = await mount('/portal/assessments');
    expect(r.pathname()).toBe('/portal/assessments');
    expect(r.text()).toContain(`LIST as ${user.role}`);
    await r.unmount();
  }
});

test('a coach without the permission, Yannick and families go to their own home', async () => {
  for (const [user, home] of [[{ uid: 'c', role: 'coach' }, '/portal/coach'], [{ uid: 'y', role: 'mental', specialistId: 'mental' }, '/portal/my-sessions'], [{ uid: 'p', role: 'parent', householdId: 'h' }, '/portal/family'], [{ uid: 'k', role: 'athlete', athleteId: 'a' }, '/portal/home']]) {
    mockUser.value = user;
    const r = await mount('/portal/assessments');
    expect(r.pathname()).toBe(home);
    await r.unmount();
  }
});

test("the owner's Admin card opens the list, and its back link returns to Admin", async () => {
  mockUser.value = { uid: 'w', role: 'owner' };
  const r = await mount('/portal/admin');
  await r.click();
  expect(r.pathname()).toBe('/portal/assessments');
  expect(r.text()).toBe('LIST as owner with back');
  await r.click();
  expect(r.pathname()).toBe('/portal/admin');
  await r.unmount();
});

test('a wave opens for staff; a coach without the permission goes home', async () => {
  mockUser.value = { uid: 'p', role: 'coach', specialistId: 'phil' };
  const r = await mount('/portal/assessments/wave/wave-2026-11-03-abc');
  expect(r.text()).toBe('WAVE wave-2026-11-03-abc at start');
  await r.unmount();
  mockUser.value = { uid: 'c', role: 'coach' };
  const c = await mount('/portal/assessments/wave/wave-2026-11-03-abc');
  expect(c.pathname()).toBe('/portal/coach');
  await c.unmount();
});

test("every coach, ops and the owner read an athlete's results; families go home", async () => {
  for (const user of [{ uid: 'c', role: 'coach' }, { uid: 'p', role: 'coach', specialistId: 'phil' }, { uid: 'o', role: 'ops' }, { uid: 'w', role: 'owner' }]) {
    mockUser.value = user;
    const r = await mount('/portal/assessments/athlete/seed-ava');
    expect(r.text()).toBe('RESULTS seed-ava');
    await r.unmount();
  }
  mockUser.value = { uid: 'p', role: 'parent', householdId: 'h' };
  const f = await mount('/portal/assessments/athlete/seed-ava');
  expect(f.pathname()).toBe('/portal/family');
  await f.unmount();
});

test('"Run McGill block" reopens the wave on the McGill station', async () => {
  mockUser.value = { uid: 'p', role: 'coach', specialistId: 'phil' };
  const r = await mount('/portal/assessments/athlete/seed-ava');
  await r.click();
  expect(r.pathname()).toBe('/portal/assessments/wave/wave-2026-11-03-abc');
  expect(r.text()).toBe('WAVE wave-2026-11-03-abc at mcgill');
  await r.unmount();
});

test('athlete detail links coaches and staff to the results, with the name; parents and Yannick get no link', async () => {
  mockUser.value = { uid: 'c', role: 'coach' };
  const r = await mount('/portal/athlete/seed-ava');
  expect(r.text()).toBe('DETAIL with assessments');
  await r.click();
  expect(r.pathname()).toBe('/portal/assessments/athlete/seed-ava');
  expect(r.text()).toBe('RESULTS seed-ava Ava Moreno');
  await r.unmount();
  for (const user of [{ uid: 'p', role: 'parent', householdId: 'h' }, { uid: 'y', role: 'mental', specialistId: 'mental' }]) {
    mockUser.value = user;
    const p = await mount('/portal/athlete/seed-ava');
    expect(p.text()).toBe('DETAIL');
    await p.unmount();
  }
});

test('every coach reaches clubhead entry; families go home', async () => {
  for (const user of [{ uid: 'c', role: 'coach' }, { uid: 'p', role: 'coach', specialistId: 'phil' }]) {
    mockUser.value = user;
    const r = await mount('/portal/assessments/golf/seed-dev');
    expect(r.text()).toBe('GOLF seed-dev');
    await r.unmount();
  }
  mockUser.value = { uid: 'k', role: 'athlete', athleteId: 'seed-dev' };
  const a = await mount('/portal/assessments/golf/seed-dev');
  expect(a.pathname()).toBe('/portal/home');
  await a.unmount();
});

test('settings open for staff; a coach without the permission goes home', async () => {
  mockUser.value = { uid: 'a', role: 'coach', assessor: true };
  const r = await mount('/portal/assessments/settings');
  expect(r.text()).toBe('SETTINGS as coach');
  await r.unmount();
  mockUser.value = { uid: 'c', role: 'coach' };
  const c = await mount('/portal/assessments/settings');
  expect(c.pathname()).toBe('/portal/coach');
  await c.unmount();
});
