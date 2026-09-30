import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

const mockLive = { value: false };
const mockUser = { value: null };
// mockDeferred: every hook instance starts {user: null, loading: true} and
// resolves after its first commit, like a freshly mounted live session.
const mockDeferred = { value: false };
const mockSettingsRoles = [];
jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));
jest.mock('./screens/CommitmentContract', () => ({ __esModule: true, default: () => 'CONTRACT' }));
jest.mock('./screens/AthleteDashboard', () => ({ __esModule: true, default: () => 'ATHLETE HOME' }));
jest.mock('./screens/ParentDashboard', () => ({ __esModule: true, default: () => 'FAMILY HOME' }));
jest.mock('./screens/Billing', () => ({ __esModule: true, default: ({ role }) => `BILLING as ${role}` }));
jest.mock('./screens/Membership', () => ({ __esModule: true, default: ({ selfManaged }) => `MEMBERSHIP selfManaged=${selfManaged}` }));
jest.mock('./screens/NotificationPreferences', () => ({
  __esModule: true,
  default: ({ role }) => { mockSettingsRoles.push(role); return `SETTINGS as ${role}`; },
}));
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
jest.mock('./hooks/useAuthSession', () => {
  const { useEffect, useState } = require('react');
  return {
    ...jest.requireActual('./hooks/useAuthSession'),
    __esModule: true,
    default: function useMockSession() {
      const [loading, setLoading] = useState(mockDeferred.value);
      useEffect(() => { if (loading) setLoading(false); }, [loading]);
      const user = loading ? null : mockUser.value;
      return { user, provisioned: Boolean(user), loading, signOut: async () => {}, refresh: () => {} };
    },
  };
});

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
  mockDeferred.value = false;
  mockSettingsRoles.length = 0;
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

describe('/portal/billing for the self-managed 18+ athlete (Mike S6 2026-09-30)', () => {
  test('a self-managed athlete reaches Billing, as an athlete', async () => {
    mockLive.value = true;
    mockUser.value = { uid: 'u-self', role: 'athlete', athleteId: 'a-self', householdId: 'hh-self', selfManaged: true };
    const r = await mount('/portal/billing');
    expect(r.pathname()).toBe('/portal/billing');
    expect(r.container.textContent).toBe('BILLING as athlete');
    await r.unmount();
  });

  test("a child's athlete login is still sent to its own home", async () => {
    mockLive.value = true;
    mockUser.value = { uid: 'u-kid', role: 'athlete', athleteId: 'a-kid', householdId: 'hh', selfManaged: false };
    const r = await mount('/portal/billing');
    expect(r.pathname()).toBe('/portal/home');
    expect(r.container.textContent).toBe('ATHLETE HOME');
    await r.unmount();
  });

  test('a parent keeps Billing as a parent', async () => {
    mockLive.value = true;
    mockUser.value = { uid: 'u-p', role: 'parent', householdId: 'hh', selfManaged: false };
    const p = await mount('/portal/billing');
    expect(p.pathname()).toBe('/portal/billing');
    expect(p.container.textContent).toBe('BILLING as parent');
    await p.unmount();
  });

  test("Membership gets the session's selfManaged (its Billing link)", async () => {
    mockLive.value = true;
    mockUser.value = { uid: 'u-self', role: 'athlete', athleteId: 'a-self', householdId: 'hh-self', selfManaged: true };
    const self = await mount('/portal/membership');
    expect(self.container.textContent).toBe('MEMBERSHIP selfManaged=true');
    await self.unmount();
    mockUser.value = { uid: 'u-kid', role: 'athlete', athleteId: 'a-kid', householdId: 'hh', selfManaged: false };
    const kid = await mount('/portal/membership');
    expect(kid.container.textContent).toBe('MEMBERSHIP selfManaged=false');
    await kid.unmount();
  });
});

describe('/portal/settings waits for its own session (no parent first paint)', () => {
  test('a self-managed athlete tapping Settings only ever sees the athlete version', async () => {
    mockLive.value = true;
    mockDeferred.value = true;
    mockUser.value = { uid: 'u-self', role: 'athlete', athleteId: 'a-self', householdId: 'hh-self', selfManaged: true };
    const r = await mount('/portal/settings');
    expect(r.pathname()).toBe('/portal/settings');
    expect(r.container.textContent).toBe('SETTINGS as athlete');
    expect(mockSettingsRoles).not.toContain('parent');
    await r.unmount();
  });

  test("a child's athlete login deep-linking Settings never sees the parent version", async () => {
    mockLive.value = true;
    mockDeferred.value = true;
    mockUser.value = { uid: 'u-kid', role: 'athlete', athleteId: 'a-kid', householdId: 'hh', selfManaged: false };
    const r = await mount('/portal/settings');
    expect(r.container.textContent).toBe('SETTINGS as athlete');
    expect(mockSettingsRoles).not.toContain('parent');
    await r.unmount();
  });

  test('a parent still gets the parent Settings', async () => {
    mockLive.value = true;
    mockDeferred.value = true;
    mockUser.value = { uid: 'u-p', role: 'parent', householdId: 'hh', selfManaged: false };
    const r = await mount('/portal/settings');
    expect(r.pathname()).toBe('/portal/settings');
    expect(r.container.textContent).toBe('SETTINGS as parent');
    await r.unmount();
  });
});
