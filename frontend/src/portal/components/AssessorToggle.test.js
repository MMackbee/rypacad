import React from 'react';
import { renderScreen } from '../screens/testRender';
import AssessorToggle from './AssessorToggle';

let mockCalls;
let mockFail;
jest.mock('../hooks/assessmentsLive', () => ({
  __esModule: true,
  setStaffAssessor: async (args) => {
    mockCalls.push(args);
    if (mockFail) throw new Error('Missing or insufficient permissions.');
    return args;
  },
}));

beforeEach(() => {
  mockCalls = [];
  mockFail = false;
});

test("the owner switches a coach's Assessments permission on and off; each write names that account", async () => {
  const r = await renderScreen(<AssessorToggle member={{ id: 'u-data', name: 'Data Coach', role: 'coach', assessor: false }} />);
  const toggle = () => r.button('Assessments for Data Coach');
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  await r.click('Assessments for Data Coach');
  expect(mockCalls).toEqual([{ uid: 'u-data', assessor: true }]);
  expect(toggle().getAttribute('aria-checked')).toBe('true');
  await r.click('Assessments for Data Coach');
  expect(mockCalls).toEqual([{ uid: 'u-data', assessor: true }, { uid: 'u-data', assessor: false }]);
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  await r.unmount();
});

test('a refused write leaves the switch where it was and says so', async () => {
  mockFail = true;
  const r = await renderScreen(<AssessorToggle member={{ id: 'u-data', name: 'Data Coach', role: 'coach', assessor: true }} />);
  await r.click('Assessments for Data Coach');
  expect(r.button('Assessments for Data Coach').getAttribute('aria-checked')).toBe('true');
  expect(r.text()).toContain('The Assessments permission did not save. Try again.');
  await r.unmount();
});
