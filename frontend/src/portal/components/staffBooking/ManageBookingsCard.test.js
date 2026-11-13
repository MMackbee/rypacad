/**
 * The Admin screen's Manage bookings card (Task E6, spec
 * 01-spec-admin-booking.md 10.2): the label and body, the athlete search
 * whose directory loads on the field's first focus, and a tap on a result
 * opening that athlete's bookings - a test athlete too (its screen carries
 * the test card). Plain functions, not jest.fn(): CRA's resetMocks would
 * clear them.
 */
jest.mock('../../hooks/billing', () => ({
  useHouseholdsDirectory: () => {
    mockDirectoryCalls += 1;
    return mockDirectory;
  },
}));

import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import ManageBookingsCard from './ManageBookingsCard';

let mockDirectoryCalls;
let mockDirectory;

const DIRECTORY = [
  {
    id: 'hh1', name: 'Whitfield family', status: 'active', test: false,
    athletes: [
      { id: 'jordan', name: 'Jordan Whitfield', packageName: '6 tokens', test: false },
      { id: 'riley', name: 'Riley Whitfield', packageName: '4 tokens', test: true },
    ],
  },
];

beforeEach(() => {
  mockDirectoryCalls = 0;
  mockDirectory = { data: DIRECTORY, loading: false, error: null };
});

async function mount() {
  const r = await renderScreen(<ManageBookingsCard />, { path: '/portal/admin' });
  const input = r.container.querySelector('input[aria-label="Find an athlete"]');
  const focus = () => act(async () => { input.focus(); });
  const result = (name) => [...r.container.querySelectorAll('button')].find((b) => b.textContent.includes(name)) || null;
  const tap = (name) => act(async () => { result(name).click(); });
  return { ...r, input, focus, result, tap };
}

test('the label, the body and the field', async () => {
  const r = await mount();
  expect(r.text()).toContain('Manage bookings');
  expect(r.text()).toContain('Add, move or cancel a session for any athlete.');
  expect(r.text()).toContain('Find an athlete');
  expect(r.input.getAttribute('placeholder')).toBe('Start typing a name');
  await r.unmount();
});

test('lazy load: the directory waits for the first focus', async () => {
  const r = await mount();
  expect(mockDirectoryCalls).toBe(0);
  await r.focus();
  expect(mockDirectoryCalls).toBeGreaterThanOrEqual(1);
  await r.unmount();
});

test("tapping Jordan opens Jordan's bookings", async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find an athlete', 'jor');
  expect(r.text()).toContain('Whitfield family · 6 tokens');
  await r.tap('Jordan Whitfield');
  expect(r.location().pathname).toBe('/portal/admin/athletes/jordan/bookings');
  await r.unmount();
});

test('the Test badge: a test athlete shows it and still opens its screen', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find an athlete', 'riley');
  const riley = r.result('Riley Whitfield');
  expect(riley.textContent).toContain('Test');
  expect(riley.disabled).toBe(false);
  await r.tap('Riley Whitfield');
  expect(r.location().pathname).toBe('/portal/admin/athletes/riley/bookings');
  await r.unmount();
});

test('no match', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find an athlete', 'zz');
  expect(r.text()).toContain('No athlete matches "zz".');
  expect(r.location().pathname).toBe('/portal/admin');
  await r.unmount();
});
