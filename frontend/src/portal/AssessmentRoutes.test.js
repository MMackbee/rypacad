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
