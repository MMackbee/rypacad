import React, { act } from 'react';
import { renderScreen } from './testRender';
import { CaptureFlow } from './DiagnosticCapture';

// The coach roster the Capture picker reads: the live shape carries the
// contract tier as its meta, the seed shape "Age 14 · contract behind".
const mockRoster = [
  { id: 'j', name: 'J. Whitfield', meta: '45 min tier' },
  { id: 'r', name: 'R. Sandoval', meta: 'Age 14 · contract behind' },
  { id: 'a', name: 'A. Nguyen', meta: 'Age 12 · 4th month' },
];
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: mockRoster, loading: false }),
  useDiagnostic: () => ({ data: { sections: [] }, loading: false, error: null }),
}));

/** The picker row for a name (AthleteRow is a clickable div, not a button). */
const row = (r, name) =>
  [...r.container.querySelectorAll('div')].find(
    (el) => el.style.cursor === 'pointer' && el.textContent.includes(name)
  ) || null;
const pick = async (r, name) => { await act(async () => { row(r, name).click(); }); };

afterEach(() => {
  delete process.env.REACT_APP_CONTRACT_ENABLED;
});

test('Capture picker and header drop the contract parts of the roster meta while the contract is hidden', async () => {
  const r = await renderScreen(<CaptureFlow bare />);
  expect(r.text()).toContain('J. Whitfield');
  expect(r.text()).toContain('Age 14');
  expect(r.text()).toContain('Age 12 · 4th month');
  expect(r.text()).not.toMatch(/min tier|contract/i);
  await pick(r, 'J. Whitfield');
  expect(r.text()).toContain('J. Whitfield');
  expect(r.text()).not.toMatch(/min tier|contract/i);
  await r.unmount();
});

test('with the contract on, the picker and header show the roster meta unchanged', async () => {
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  const r = await renderScreen(<CaptureFlow bare />);
  expect(r.text()).toContain('45 min tier');
  expect(r.text()).toContain('Age 14 · contract behind');
  await pick(r, 'J. Whitfield');
  expect(r.text()).toContain('45 min tier');
  await r.unmount();
});
