/**
 * The athlete search (Task C4, spec 01-spec-admin-booking.md 10.2, 10.5):
 * the households directory loads on the field's first focus, not on every
 * Admin open; each result is a 44px button with the name and "{household}
 * · {package}"; test athletes carry a Test badge and are tappable unless
 * the caller says otherwise; athletes already on the session cannot be
 * tapped. Plain functions, not jest.fn(): CRA's resetMocks would clear them.
 */
jest.mock('../../hooks/billing', () => ({
  useHouseholdsDirectory: () => {
    mockDirectoryCalls += 1;
    return mockDirectory;
  },
}));

import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import AthleteSearch from './AthleteSearch';

let mockDirectoryCalls;
let mockDirectory;

const DIRECTORY = [
  {
    id: 'hh1', name: 'Whitfield family', status: 'active', test: false,
    athletes: [
      { id: 'jordan', name: 'Jordan Whitfield', packageName: '6 tokens', test: false },
      { id: 'riley', name: 'Riley Whitfield', packageName: 'Elite', test: false },
    ],
  },
  { id: 'hh2', name: 'Test family', status: 'active', test: true, athletes: [{ id: 'casey', name: 'Casey Whitfield', packageName: '4 tokens', test: false }] },
];

beforeEach(() => {
  mockDirectoryCalls = 0;
  mockDirectory = { data: DIRECTORY, loading: false, error: null };
});

const rows = (r) => [...r.container.querySelectorAll('button')];
const rowFor = (r, name) => rows(r).find((b) => b.textContent.includes(name)) || null;

async function mount(props = {}) {
  const picked = [];
  const r = await renderScreen(<AthleteSearch onPick={(a) => picked.push(a)} {...props} />);
  const input = r.container.querySelector('input[aria-label="Find an athlete"]');
  const focus = () => act(async () => { input.focus(); });
  return { ...r, picked, input, focus };
}

test('the field: its label and placeholder', async () => {
  const r = await mount();
  expect(r.text()).toContain('Find an athlete');
  expect(r.input.getAttribute('placeholder')).toBe('Start typing a name');
  await r.unmount();
});

test('the directory loads on first focus', async () => {
  const r = await mount();
  expect(mockDirectoryCalls).toBe(0);
  await r.fill('Find an athlete', 'jor');
  expect(mockDirectoryCalls).toBe(0);
  await r.focus();
  expect(mockDirectoryCalls).toBeGreaterThanOrEqual(1);
  await r.unmount();
});

test('armed loads it without a focus', async () => {
  const r = await mount({ armed: true });
  expect(mockDirectoryCalls).toBeGreaterThanOrEqual(1);
  await r.unmount();
});

test('a match shows the name and the household and package under it, as a 44px button', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find an athlete', 'jor');
  expect(r.text()).toContain('Jordan Whitfield');
  expect(r.text()).toContain('Whitfield family · 6 tokens');
  expect(r.text()).not.toContain('Riley Whitfield');
  await r.fill('Find an athlete', 'whit');
  expect(rows(r)).toHaveLength(3);
  for (const b of rows(r)) {
    expect(b.getAttribute('type')).toBe('button');
    expect(parseFloat(b.style.minHeight)).toBeGreaterThanOrEqual(44);
  }
  await act(async () => { rowFor(r, 'Jordan Whitfield').click(); });
  expect(r.picked).toEqual([{ athleteId: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', householdName: 'Whitfield family', packageName: '6 tokens', test: false }]);
  await r.unmount();
});

test('nothing shows before anything is typed', async () => {
  const r = await mount();
  await r.focus();
  expect(rows(r)).toHaveLength(0);
  expect(r.text()).not.toContain('No athlete matches');
  await r.unmount();
});

test('a test athlete shows Test and can be picked', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find an athlete', 'casey');
  const row = rowFor(r, 'Casey Whitfield');
  expect(row.textContent).toContain('Test');
  expect(row.disabled).toBe(false);
  await act(async () => { row.click(); });
  expect(r.picked).toHaveLength(1);
  expect(r.picked[0]).toMatchObject({ athleteId: 'casey', test: true });
  await r.unmount();
});

test('disableTest: the same row is disabled and a tap does nothing', async () => {
  const r = await mount({ disableTest: true });
  await r.focus();
  await r.fill('Find an athlete', 'casey');
  const row = rowFor(r, 'Casey Whitfield');
  expect(row.textContent).toContain('Test');
  expect(row.disabled).toBe(true);
  await act(async () => { row.click(); });
  expect(r.picked).toEqual([]);
  await r.unmount();
});

test('athletes already on the session read the disabled label and cannot be picked', async () => {
  const r = await mount({ disabledIds: ['jordan'] });
  await r.focus();
  await r.fill('Find an athlete', 'whit');
  const row = rowFor(r, 'Jordan Whitfield');
  expect(row.textContent).toContain('On this session');
  expect(row.disabled).toBe(true);
  await act(async () => { row.click(); });
  expect(r.picked).toEqual([]);
  expect(rowFor(r, 'Riley Whitfield').disabled).toBe(false);
  await r.unmount();
});

test('no match, and a directory that did not load', async () => {
  const r = await mount();
  await r.focus();
  await r.fill('Find an athlete', 'zz');
  expect(r.text()).toContain('No athlete matches "zz".');
  await r.unmount();
  mockDirectory = { data: null, loading: false, error: new Error('offline') };
  const failed = await mount();
  await failed.focus();
  expect(failed.text()).toContain("Athletes didn't load. Check your connection and try again.");
  await failed.unmount();
});
