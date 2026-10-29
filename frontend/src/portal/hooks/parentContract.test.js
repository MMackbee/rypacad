import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockEnsure = jest.fn(async () => ({ athleteId: 'nico', minutes: 10 }));
const mockLog = jest.fn(async () => ({}));
const mockRemove = jest.fn(async () => ({}));
let mockContract;
jest.mock('./index', () => ({
  useContract: jest.fn(() => ({ data: mockContract, loading: false, error: null, ensureContractStart: mockEnsure })),
  usePracticeLog: jest.fn(() => ({ data: { loggedToday: true, todayMinutes: 12, contractMinutes: 10 }, totalMinutes: 12, logPractice: mockLog, removeLog: mockRemove })),
}));
import { useContract, usePracticeLog } from './index';
import { useParentContract } from './parentContract';

function mountHook(useHook) {
  const out = { current: null };
  function Probe() { out.current = useHook(); return null; }
  const root = createRoot(document.createElement('div'));
  return { out, render: async () => { await act(async () => { root.render(<Probe />); }); }, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
  jest.clearAllMocks();
  // CRA's resetMocks strips every jest.fn implementation before each test,
  // the factory's included (see mentalLive.test.js): put them back.
  mockEnsure.mockImplementation(async () => ({ athleteId: 'nico', minutes: 10 }));
  mockLog.mockImplementation(async () => ({}));
  mockRemove.mockImplementation(async () => ({}));
  useContract.mockImplementation(() => ({ data: mockContract, loading: false, error: null, ensureContractStart: mockEnsure }));
  usePracticeLog.mockImplementation(() => ({ data: { loggedToday: true, todayMinutes: 12, contractMinutes: 10 }, totalMinutes: 12, logPractice: mockLog, removeLog: mockRemove }));
  mockContract = { month: { start: '2026-11-01' }, tierMinutes: 10, required: 10, needsStart: true, state: { line: 'x' } };
});

test('threads the athleteId into both hooks, stamps once on needsStart, and forwards the writes', async () => {
  const h = mountHook(() => useParentContract('nico'));
  await h.render();
  await h.render();
  expect(useContract).toHaveBeenCalledWith({ athleteId: 'nico' });
  expect(usePracticeLog).toHaveBeenCalledWith({ athleteId: 'nico' });
  expect(mockEnsure).toHaveBeenCalledTimes(1);
  expect(h.out.current).toMatchObject({ required: 10, loggedToday: true, todayMinutes: 12 });
  await act(async () => { await h.out.current.logPractice({ minutes: 10, date: '2026-11-10' }); });
  expect(mockLog).toHaveBeenCalledWith({ minutes: 10, date: '2026-11-10' });
  await act(async () => { await h.out.current.removeLog({ date: '2026-11-10' }); });
  expect(mockRemove).toHaveBeenCalledWith({ date: '2026-11-10' });
  h.unmount();
});

test('no stamp when the kid is already stamped', async () => {
  mockContract = { ...mockContract, needsStart: false };
  const h = mountHook(() => useParentContract('nico'));
  await h.render();
  expect(mockEnsure).not.toHaveBeenCalled();
  h.unmount();
});
