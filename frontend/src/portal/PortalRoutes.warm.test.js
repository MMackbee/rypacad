import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

/*
 * Chunk warm-up in PortalRoutes. Each lazy screen is mocked with a factory
 * that records its name, so a factory run means "this chunk was fetched".
 * Modules stay cached for the whole file, so the tests run in order and each
 * asserts only on screens no earlier test has loaded.
 */
const mockLoaded = new Set();
const mockLive = { value: false };

jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
// Live session still resolving: RequireRole renders nothing, so no screen mounts.
jest.mock('./hooks/useAuthSession', () => ({
  ...jest.requireActual('./hooks/useAuthSession'),
  __esModule: true,
  default: () => ({ user: null, provisioned: false, loading: true, signOut: async () => {}, refresh: () => {} }),
}));
const mockScreen = (name) => {
  mockLoaded.add(name);
  const Screen = () => null;
  return { __esModule: true, default: Screen, [name]: Screen };
};
jest.mock('./StatesHarness', () => mockScreen('StatesHarness'));
jest.mock('./screens/OnboardingFlow', () => ({ ...mockScreen('OnboardingFlow'), OnboardingWelcomeRoute: () => null }));
jest.mock('./screens/MySchedule', () => mockScreen('MySchedule'));
jest.mock('./screens/BookSession', () => mockScreen('BookSession'));
jest.mock('./screens/SpecialistBooking', () => mockScreen('SpecialistBooking'));
jest.mock('./screens/CoachDashboard', () => mockScreen('CoachDashboard'));
jest.mock('./screens/Roster', () => ({ ...mockScreen('Roster'), SessionAttendance: () => null }));
jest.mock('./screens/DiagnosticCapture', () => ({ ...mockScreen('DiagnosticCapture'), CaptureFlow: () => null }));
jest.mock('./screens/SeasonSchedule', () => mockScreen('SeasonSchedule'));
jest.mock('./screens/CommitmentContract', () => mockScreen('CommitmentContract'));
jest.mock('./screens/AthleteDetail', () => mockScreen('AthleteDetail'));
jest.mock('./screens/Membership', () => mockScreen('Membership'));
jest.mock('./screens/Billing', () => mockScreen('Billing'));
jest.mock('./screens/NotificationPreferences', () => mockScreen('NotificationPreferences'));
jest.mock('./screens/Reservations', () => mockScreen('Reservations'));
jest.mock('./screens/AdminDashboard', () => mockScreen('AdminDashboard'));
jest.mock('./screens/AdminSignups', () => mockScreen('AdminSignups'));
jest.mock('./screens/AdminScholarships', () => mockScreen('AdminScholarships'));
jest.mock('./screens/StaffRoles', () => mockScreen('StaffRoles'));
jest.mock('./screens/TourStandings', () => mockScreen('TourStandings'));
jest.mock('./screens/SpecialistDay', () => mockScreen('SpecialistDay'));

let root;
let container;

async function mount(path) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
      </MemoryRouter>
    );
  });
}

async function advance(ms) {
  await act(async () => { jest.advanceTimersByTime(ms); });
  // import() resolves its require on a microtask.
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
}

async function unmount() {
  if (root) await act(async () => { root.unmount(); });
  if (container) container.remove();
  root = null;
  container = null;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockLive.value = true;
});

afterEach(async () => {
  await unmount();
  delete navigator.connection;
  jest.useRealTimers();
});

test('seed mode (jest, the review scaffold) warms nothing', async () => {
  mockLive.value = false;
  await mount('/portal/family');
  await advance(5000);
  expect([...mockLoaded].filter((n) => n !== 'StatesHarness')).toEqual([]);
});

test('Save-Data skips the idle warm-up', async () => {
  Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
  await mount('/portal/home');
  await advance(5000);
  expect(mockLoaded.has('SeasonSchedule')).toBe(false);
  expect(mockLoaded.has('CommitmentContract')).toBe(false);
});

test('leaving a screen before 2.5 s cancels its warm-up', async () => {
  await mount('/portal/home');
  await advance(1000);
  await unmount();
  await advance(5000);
  expect(mockLoaded.has('SeasonSchedule')).toBe(false);
});

test('a junk path that names an Object.prototype key does not throw', async () => {
  await mount('/portal/constructor');
  await advance(5000);
  expect(mockLoaded.has('SeasonSchedule')).toBe(false);
});

test('a deep link warms its own screen at mount, before auth resolves', async () => {
  await mount('/portal/schedule');
  await advance(0);
  expect(mockLoaded.has('MySchedule')).toBe(true);
  expect(mockLoaded.has('CommitmentContract')).toBe(false);
});

test('a parent landing on family warms the likely next screens after 2.5 s', async () => {
  await mount('/portal/family');
  await advance(2499);
  expect(mockLoaded.has('BookSession')).toBe(false);
  await advance(1);
  for (const name of ['BookSession', 'SpecialistBooking', 'Billing', 'AthleteDetail', 'Reservations', 'NotificationPreferences', 'TourStandings']) {
    expect(mockLoaded.has(name)).toBe(true);
  }
  // Athlete-only screens stay cold for a parent.
  expect(mockLoaded.has('CommitmentContract')).toBe(false);
  expect(mockLoaded.has('SeasonSchedule')).toBe(false);
  expect(mockLoaded.has('OnboardingFlow')).toBe(false);
});

// Scholarships is the owner's alone (2026-10-01). The warm-up runs before the
// role is known, so the Admin landing never fetches that chunk for ops.
test('the admin landing warms its next screens, never the owner-only Scholarships chunk', async () => {
  await mount('/portal/admin');
  await advance(2500);
  expect(mockLoaded.has('AdminSignups')).toBe(true);
  expect(mockLoaded.has('StaffRoles')).toBe(true);
  expect(mockLoaded.has('AdminScholarships')).toBe(false);
});

// Commitment Contract hidden (owner ruling 2026-09-30): its chunk is never
// fetched - not as a deep link, not as home's likely next screen. These two
// run last and in this order: the ON test is the first to load the chunk.
test('contract hidden: neither its deep link nor the athlete home warms the Contract chunk', async () => {
  await mount('/portal/contract');
  await advance(5000);
  await unmount();
  await mount('/portal/home');
  await advance(2500);
  expect(mockLoaded.has('SeasonSchedule')).toBe(true);
  expect(mockLoaded.has('CommitmentContract')).toBe(false);
});

test('contract on: the athlete home warms it again', async () => {
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  try {
    await mount('/portal/home');
    await advance(2500);
    expect(mockLoaded.has('CommitmentContract')).toBe(true);
  } finally {
    delete process.env.REACT_APP_CONTRACT_ENABLED;
  }
});
