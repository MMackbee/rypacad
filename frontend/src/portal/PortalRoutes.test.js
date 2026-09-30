import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

const mockLive = { value: false };
const mockUser = { value: null };
jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));
jest.mock('./screens/CommitmentContract', () => ({ __esModule: true, default: () => 'CONTRACT' }));
jest.mock('./screens/AthleteDashboard', () => ({ __esModule: true, default: () => 'ATHLETE HOME' }));
jest.mock('./screens/ParentDashboard', () => ({ __esModule: true, default: () => 'FAMILY HOME' }));
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
  // lazy() resolves its chunk on a microtask.
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  return {
    container,
    pathname: () => loc.current.pathname,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

afterEach(() => {
  mockLive.value = false;
  mockUser.value = null;
  delete process.env.REACT_APP_CONTRACT_ENABLED;
});

test('an unknown portal path lands on the index (K18)', async () => {
  const r = await mount('/portal/does-not-exist');
  expect(r.pathname()).toBe('/portal');
  expect(r.container.textContent).toContain('HARNESS');
  await r.unmount();
});

describe('/portal/contract (Commitment Contract hidden, owner ruling 2026-09-30)', () => {
  test("off: an athlete's stale link lands on their own home", async () => {
    mockLive.value = true;
    mockUser.value = { uid: 'u1', role: 'athlete' };
    const r = await mount('/portal/contract');
    expect(r.pathname()).toBe('/portal/home');
    expect(r.container.textContent).toBe('ATHLETE HOME');
    await r.unmount();
  });

  test("off: a parent's lands on the family page", async () => {
    mockLive.value = true;
    mockUser.value = { uid: 'u2', role: 'parent' };
    const r = await mount('/portal/contract');
    expect(r.pathname()).toBe('/portal/family');
    expect(r.container.textContent).toBe('FAMILY HOME');
    await r.unmount();
  });

  test('off, seed mode: the index (the review harness), never the Contract screen', async () => {
    const r = await mount('/portal/contract');
    expect(r.pathname()).toBe('/portal');
    expect(r.container.textContent).not.toContain('CONTRACT');
    await r.unmount();
  });

  test('on: the Contract screen, as before', async () => {
    process.env.REACT_APP_CONTRACT_ENABLED = 'true';
    mockLive.value = true;
    mockUser.value = { uid: 'u1', role: 'athlete' };
    const r = await mount('/portal/contract');
    expect(r.pathname()).toBe('/portal/contract');
    expect(r.container.textContent).toBe('CONTRACT');
    await r.unmount();
  });
});
