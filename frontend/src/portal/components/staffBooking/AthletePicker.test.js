/**
 * The roster's "Add an athlete to ..." sheet (Task C4, spec
 * 01-spec-admin-booking.md 10.3, 10.5): a bottom sheet named by its title,
 * the athlete search loaded at once, the athletes already on the session
 * and test athletes shown but not tappable, and Close. Plain functions,
 * not jest.fn(): CRA's resetMocks would clear them.
 */
jest.mock('../../hooks/billing', () => ({
  useHouseholdsDirectory: () => {
    mockDirectoryCalls += 1;
    return { data: mockDirectory, loading: false, error: null };
  },
}));

import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import AthletePicker from './AthletePicker';

let mockDirectoryCalls;
let mockDirectory;

const SESSION = { id: 's2', date: '2026-11-17', time: '4:00 PM', label: 'Training block' };

beforeEach(() => {
  mockDirectoryCalls = 0;
  mockDirectory = [
    {
      id: 'hh1', name: 'Whitfield family', status: 'active', test: false,
      athletes: [
        { id: 'jordan', name: 'Jordan Whitfield', packageName: '6 tokens', test: false },
        { id: 'riley', name: 'Riley Whitfield', packageName: 'Elite', test: false },
        { id: 'casey', name: 'Casey Whitfield', packageName: '4 tokens', test: true },
      ],
    },
  ];
});

const rowFor = (r, name) => [...r.container.querySelectorAll('button')].find((b) => b.textContent.includes(name)) || null;

async function mount() {
  const calls = { picked: [], closed: 0 };
  const r = await renderScreen(
    <AthletePicker
      session={SESSION}
      onSessionIds={['jordan']}
      onPick={(a) => calls.picked.push(a)}
      onClose={() => { calls.closed += 1; }}
    />
  );
  await r.fill('Find an athlete', 'whit');
  return { ...r, calls };
}

test('a dialog titled for the session, its directory loaded at once', async () => {
  const r = await mount();
  const dialog = r.container.querySelector('[role="dialog"]');
  expect(dialog.getAttribute('aria-label')).toBe('Add an athlete to Training block, Tue Nov 17, 4:00 PM');
  expect(r.text()).toContain('Add an athlete to Training block, Tue Nov 17, 4:00 PM');
  expect(dialog.style.maxHeight).toBe('85%');
  expect(dialog.style.overflowY).toBe('auto');
  expect(mockDirectoryCalls).toBeGreaterThanOrEqual(1);
  await r.unmount();
});

test('an athlete already on the session reads On this session and cannot be tapped', async () => {
  const r = await mount();
  const row = rowFor(r, 'Jordan Whitfield');
  expect(row.textContent).toContain('On this session');
  expect(row.disabled).toBe(true);
  await act(async () => { row.click(); });
  expect(r.calls.picked).toEqual([]);
  await r.unmount();
});

test('another athlete is picked', async () => {
  const r = await mount();
  await act(async () => { rowFor(r, 'Riley Whitfield').click(); });
  expect(r.calls.picked).toEqual([
    { athleteId: 'riley', name: 'Riley Whitfield', householdId: 'hh1', householdName: 'Whitfield family', packageName: 'Elite', test: false },
  ]);
  await r.unmount();
});

test('a test athlete reads Test and cannot be tapped', async () => {
  const r = await mount();
  const row = rowFor(r, 'Casey Whitfield');
  expect(row.textContent).toContain('Test');
  expect(row.disabled).toBe(true);
  await act(async () => { row.click(); });
  expect(r.calls.picked).toEqual([]);
  await r.unmount();
});

test('Close, and a tap on the overlay, close it; a tap inside does not', async () => {
  const r = await mount();
  const close = r.button('Close');
  expect(parseFloat(close.style.height)).toBeGreaterThanOrEqual(44);
  await r.click('Close');
  expect(r.calls.closed).toBe(1);
  await act(async () => { r.container.querySelector('[role="dialog"]').click(); });
  expect(r.calls.closed).toBe(1);
  await act(async () => { r.container.querySelector('[data-portal-overlay]').click(); });
  expect(r.calls.closed).toBe(2);
  await r.unmount();
});
