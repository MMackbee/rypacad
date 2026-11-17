/**
 * The Admin screen's Find a family card (2026-11-16, the single family page;
 * it was Manage bookings, Task E6): the label and body, the search whose
 * directory loads on the field's first focus, and a tap on a result opening
 * the FAMILY PAGE on that athlete - a test athlete too (the page carries the
 * test line). Plain functions, not jest.fn(): CRA's resetMocks would clear
 * them.
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
    id: 'hh1', name: 'Whitfield family', guardianName: 'Dana Whitfield', status: 'active', test: false,
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
  const input = r.container.querySelector('input[aria-label="Find a family or athlete"]');
  const focus = () => act(async () => { input.focus(); });
  const result = (name) => [...r.container.querySelectorAll('button')].find((b) => b.textContent.includes(name)) || null;
  const tap = (name) => act(async () => { result(name).click(); });
  return { ...r, input, focus, result, tap };
}

test('the label, the body and the field', async () => {
  const r = await mount();
  expect(r.text()).toContain('Find a family');
  expect(r.text()).toContain("Search by an athlete's or the family's name. Everything for the family is on one page.");
  expect(r.text()).toContain('Find a family or athlete');
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

test('tapping Jordan opens the family page on Jordan', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find a family or athlete', 'jor');
  expect(r.text()).toContain('Whitfield family · 6 tokens');
  await r.tap('Jordan Whitfield');
  expect([r.location().pathname, r.location().search]).toEqual(['/portal/admin/households/hh1', '?athlete=jordan']);
  await r.unmount();
});

test('the parent\'s name finds the family: every athlete in it', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find a family or athlete', 'dana');
  expect(r.result('Jordan Whitfield')).not.toBeNull();
  expect(r.result('Riley Whitfield')).not.toBeNull();
  await r.unmount();
});

test('the Test badge: a test athlete shows it and still opens its screen', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find a family or athlete', 'riley');
  const riley = r.result('Riley Whitfield');
  expect(riley.textContent).toContain('Test');
  expect(riley.disabled).toBe(false);
  await r.tap('Riley Whitfield');
  expect([r.location().pathname, r.location().search]).toEqual(['/portal/admin/households/hh1', '?athlete=riley']);
  await r.unmount();
});

test('"fam" does not match every Whitfield family athlete', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find a family or athlete', 'fam');
  expect(r.result('Jordan Whitfield')).toBeNull();
  expect(r.text()).toContain('No athlete matches "fam".');
  await r.unmount();
});

test('no match', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find a family or athlete', 'zz');
  expect(r.text()).toContain('No athlete matches "zz".');
  expect(r.location().pathname).toBe('/portal/admin');
  await r.unmount();
});
