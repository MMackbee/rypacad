import React, { act } from 'react';
import { renderScreen } from './testRender';
import AssessmentSettings from './AssessmentSettings';
import { DEFAULT_SETTINGS, withDefaults } from '../data/assessmentSettings';

let mockSettings;
let mockSaves;
let mockSaveFails;
jest.mock('../hooks/assessments', () => ({ useAssessmentSettings: () => ({ data: mockSettings, loading: false, error: null }) }));
jest.mock('../hooks/assessmentsLive', () => ({
  saveAssessmentSettings: async (s) => {
    mockSaves.push(s);
    if (mockSaveFails) throw new Error('offline');
    return { protocolVersion: s.protocolVersion };
  },
}));

const PHIL = { uid: 'phil', role: 'coach', specialistId: 'phil' };
const ASSESSOR = { uid: 'a', role: 'coach', assessor: true };
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const screen = (viewer = PHIL) => renderScreen(<AssessmentSettings bare viewer={viewer} onBack={() => {}} />);

beforeEach(() => {
  mockSettings = { settings: withDefaults(null), stored: false };
  mockSaves = [];
  mockSaveFails = false;
});

test('Phil sees every setting at the v1.2 defaults', async () => {
  const r = await screen();
  expect(r.text()).toContain('Protocol v1.2');
  expect(r.text()).toContain('These are the protocol v1.2 defaults; nothing has been saved yet.');
  expect(field(r, 'CMJ scored jumps').value).toBe('2');
  expect(field(r, 'Grip trials per hand').value).toBe('3');
  expect(r.button('McGill: Inside the wave').getAttribute('aria-pressed')).toBe('true');
  expect(r.text()).toContain('Readiness & intake is always on: the pain check comes first.');
  expect(r.button('Save settings').disabled).toBe(true);
  await r.unmount();
});

test('a procedure change asks for the next version label and saves under it', async () => {
  const r = await screen();
  await r.fill('CMJ scored jumps', '3');
  await r.click('Save settings');
  expect(r.text()).toContain('This changes the procedure.');
  expect(field(r, 'New protocol version').value).toBe('v1.2.1');
  await r.click('Save as v1.2.1');
  expect(mockSaves).toHaveLength(1);
  expect(mockSaves[0]).toEqual({ ...withDefaults(null), protocolVersion: 'v1.2.1', trialCounts: { ...DEFAULT_SETTINGS.trialCounts, cmjScored: 3 } });
  expect(r.text()).toContain('Saved. Protocol v1.2.1.');
  expect(r.button('Save settings').disabled).toBe(true);
  await r.unmount();
});

test('the version sheet refuses an unchanged or malformed label', async () => {
  const r = await screen();
  await r.click('McGill: Its own block within 14 days');
  await r.click('Save settings');
  await r.fill('New protocol version', 'v1.2');
  expect(r.text()).toContain('Use a new label, like v1.2.1.');
  expect(r.button('Save as v1.2').disabled).toBe(true);
  await r.fill('New protocol version', 'version 2');
  expect(r.text()).toContain('A version label looks like v1.2.1.');
  await r.fill('New protocol version', 'v1.3');
  await r.click('Save as v1.3');
  expect(mockSaves[0]).toMatchObject({ protocolVersion: 'v1.3', mcgillMode: 'separate' });
  await r.unmount();
});

test('entry modes, thresholds and the coefficient check are not procedure: they save under the same version', async () => {
  const r = await screen();
  await r.click('10/5 entry: Every hop');
  await r.click('Maturity coefficients: Checked against the paper');
  await type(r, 'Threshold clubhead (%)', '3');
  await type(r, 'Threshold Parallax (%)', '');
  await r.click('Save settings');
  expect(r.text()).not.toContain('This changes the procedure.');
  expect(mockSaves).toHaveLength(1);
  expect(mockSaves[0]).toMatchObject({ protocolVersion: 'v1.2', hopEntry: 'per-hop', thresholds: { ...DEFAULT_SETTINGS.thresholds, clubhead: 3, parallax: null } });
  expect(mockSaves[0].coefficients.verified).toBe(true);
  await r.unmount();
});

test('the Moore coefficients are editable (Phil checks them against the paper) and save under the same version', async () => {
  const r = await screen();
  expect(field(r, 'Boys coefficient a').value).toBe('-8.128741');
  await type(r, 'Boys coefficient a', '-8.1287');
  await type(r, 'Girls coefficient b', '0.0042');
  await r.click('Save settings');
  expect(r.text()).not.toContain('This changes the procedure.');
  expect(mockSaves[0].protocolVersion).toBe('v1.2');
  expect(mockSaves[0].coefficients).toEqual({ ...DEFAULT_SETTINGS.coefficients, boys: { a: -8.1287, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042 } });
  await r.unmount();
});

test('a blank or out-of-range coefficient keeps Save off', async () => {
  const r = await screen();
  await type(r, 'Girls coefficient a', '-25');
  expect(r.text()).toContain('Coefficient a is -20 to 0');
  await type(r, 'Girls coefficient a', '');
  expect(r.button('Save settings').disabled).toBe(true);
  await r.unmount();
});

test('the shortest grip rest may not be longer than the longest', async () => {
  const r = await screen();
  await type(r, 'Grip rest shortest (s)', '25');
  expect(r.text()).toContain("The shortest rest can't be longer than the longest.");
  expect(r.button('Save settings').disabled).toBe(true);
  await type(r, 'Grip rest longest (s)', '30');
  expect(r.button('Save settings').disabled).toBe(false);
  await r.unmount();
});

test('a failed save says so and keeps the change', async () => {
  mockSaveFails = true;
  const r = await screen();
  await r.click('10/5 entry: Every hop');
  await r.click('Save settings');
  expect(r.text()).toContain('The settings were not saved. Check the connection and try again.');
  expect(r.button('10/5 entry: Every hop').getAttribute('aria-pressed')).toBe('true');
  expect(r.button('Save settings').disabled).toBe(false);
  await r.unmount();
});

test('assessor staff read the settings and cannot change them', async () => {
  mockSettings = { settings: { ...withDefaults(null), protocolVersion: 'v1.2.1' }, stored: true };
  const r = await screen(ASSESSOR);
  expect(r.text()).toContain('Protocol v1.2.1');
  expect(r.text()).toContain('Only Phil and the owner change these settings.');
  expect(r.button('Save settings')).toBeNull();
  expect(field(r, 'CMJ scored jumps').disabled).toBe(true);
  expect(r.button('McGill: Inside the wave').disabled).toBe(true);
  await r.unmount();
});
