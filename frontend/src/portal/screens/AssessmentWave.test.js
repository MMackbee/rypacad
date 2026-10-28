import React, { act } from 'react';
import { renderScreen } from './testRender';
import AssessmentWave from './AssessmentWave';
import { DEFAULT_SETTINGS, circuitModeOf } from '../data/assessmentSettings';

let mockWave;
let mockSaves;
let mockHang;
jest.mock('../hooks/assessments', () => ({ useWave: () => ({ data: mockWave, loading: false, error: null }) }));
jest.mock('../hooks/assessmentsLive', () => {
  const record = (kind) => async (args) => {
    mockSaves.push([kind, args]);
    if (mockHang) await new Promise(() => {});
    return args;
  };
  return { saveSection: record('section'), saveAssessmentProfile: record('profile'), saveWindowFields: record('fields') };
});

const MODE = circuitModeOf(DEFAULT_SETTINGS);
const athlete = (athleteId, name, position, over = {}) => ({
  athleteId, name, dob: '2012-04-10', position, windowId: '2026-27-baseline', kind: 'baseline',
  window: { id: '2026-27-baseline', athleteId, season: '2026-27', kind: 'baseline', status: 'open', circuitDate: '2026-11-03', circuitMode: MODE, enteredBy: {} },
  profile: { athleteId, sex: null, season: '2026-27' }, prior: [], ...over,
});
const sections = (kind) => mockSaves.filter(([k, a]) => k === 'section' && a.section === kind).map(([, a]) => a);
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const wave = (props = {}) => renderScreen(<AssessmentWave bare waveId="w1" onBack={() => {}} {...props} />);

beforeEach(() => {
  mockSaves = [];
  mockHang = false;
  window.innerWidth = 1024;
  try { window.localStorage.clear(); } catch (err) { /* jsdom always has it */ }
  mockWave = { waveId: 'w1', circuitDate: '2026-11-03', circuitMode: MODE, protocolVersion: 'v1.2', athletes: [athlete('a', 'Ava Moreno', 1), athlete('b', 'Ben Ortiz', 2)] };
});
afterEach(() => { window.innerWidth = 1024; });

test('the wave header, the fixed station order and the standard cue', async () => {
  const r = await wave();
  expect(r.text()).toContain('Wave · Nov 3');
  expect(r.text()).toContain('Protocol v1.2');
  expect(r.button('1 Readiness & intake').getAttribute('aria-pressed')).toBe('true');
  expect(r.text()).toContain('Pain check first.');
  expect(r.text()).toContain('A · Ava Moreno');
  expect(r.text()).toContain('B · Ben Ortiz');
  await r.unmount();
});

test('intake saves each answer as given: readiness, hours, golf today, sex at the first test, the training log', async () => {
  const r = await wave();
  await r.click('Ava Moreno readiness: Pass');
  await type(r, 'Ava Moreno hours since a hard session', '20');
  await r.click('Ava Moreno golf today: No');
  await r.click('Ava Moreno sex: Female');
  await r.click('Ava Moreno training location: External');
  await r.click('Ava Moreno external training: Machines / barbells');
  await type(r, 'Ava Moreno weekly training hours', '6,5');
  expect(sections('readiness').pop()).toEqual({ athleteId: 'a', windowId: '2026-27-baseline', section: 'readiness',
    value: { status: 'pass', reason: null, hoursSinceHardSession: 20, golfToday: false, notes: null } });
  expect(mockSaves.find(([k]) => k === 'profile')[1]).toEqual({ athleteId: 'a', patch: { sex: 'female' } });
  expect(sections('log').pop().value).toEqual({ location: 'external', externalContent: 'machines', weeklyHours: 6.5, rypSessionsSincePrior: null,
    golfVolume: null, competitiveLevel: null, otherSport: null, otherSportHours: null });
  expect(r.text()).toContain('Saved');
  await r.unmount();
});

test('not tested with a reason code, and undo; a pain stop says to retest and refer', async () => {
  const r = await wave();
  await r.click('Ava Moreno: not tested');
  await r.click('Ill');
  expect(sections('notTested').pop()).toMatchObject({ athleteId: 'a', value: { readiness: 'ill' } });
  expect(r.text()).toContain('Not tested: Ill');
  await r.click('Undo not tested');
  expect(sections('notTested').pop().value).toEqual({});
  await r.click('Ben Ortiz: pain, stop');
  expect(sections('notTested').pop()).toMatchObject({ athleteId: 'b', value: { readiness: 'pain' } });
  expect(r.text()).toContain('Stopped for pain. Retest within 7 days; refer per RYP policy.');
  await r.unmount();
});

test('phone: one athlete at a time with a switcher; tablet: both side by side', async () => {
  window.innerWidth = 390;
  const phone = await wave();
  expect(phone.text()).toContain('A · Ava Moreno');
  expect(phone.text()).not.toContain('B · Ben Ortiz');
  await phone.click('Show B · Ben Ortiz');
  expect(phone.text()).toContain('B · Ben Ortiz');
  expect(phone.text()).not.toContain('A · Ava Moreno');
  await phone.unmount();
  window.innerWidth = 1024;
  const tablet = await wave();
  expect(tablet.text()).toContain('A · Ava Moreno');
  expect(tablet.text()).toContain('B · Ben Ortiz');
  await tablet.unmount();
});

test('leaving with an entry not on the server asks first (Review Focus 2); with everything saved it does not', async () => {
  mockHang = true;
  const left = [];
  const r = await wave({ onBack: () => left.push(1) });
  await r.click('Ava Moreno readiness: Pass');
  await r.click('‹ Assessments');
  expect(r.text()).toContain('Leave this wave?');
  expect(r.text()).toContain('1 entry has not reached the server yet.');
  await r.click('Stay on the wave');
  expect(left).toEqual([]);
  await r.click('‹ Assessments');
  await r.click('Leave anyway');
  expect(left).toEqual([1]);
  await r.unmount();
  mockHang = false;
  const saved = [];
  const r2 = await wave({ onBack: () => saved.push(1) });
  await r2.click('Ben Ortiz readiness: Pass');
  await r2.click('‹ Assessments');
  expect(saved).toEqual([1]);
  await r2.unmount();
});

test('an entry not on the server is kept on this tablet: reopening the wave shows it and sends it again (Review Focus 2)', async () => {
  mockHang = true;
  const first = await wave();
  await type(first, 'Ava Moreno hours since a hard session', '20');
  await first.unmount();
  mockHang = false;
  mockSaves = [];
  const again = await wave();
  await again.flush();
  expect(field(again, 'Ava Moreno hours since a hard session').value).toBe('20');
  expect(sections('readiness')).toEqual([{ athleteId: 'a', windowId: '2026-27-baseline', section: 'readiness',
    value: { status: null, reason: null, hoursSinceHardSession: 20, golfToday: null, notes: null } }]);
  expect(again.text()).toContain('All saved');
  expect(window.localStorage.getItem('ryp.assessments.pending')).toBeNull();
  await again.unmount();
});

test('equipment is entered once and remembered on this device', async () => {
  window.localStorage.setItem('ryp.assessments.equipment', JSON.stringify({ dynamometer1: 'D-07', dynamometer2: 'D-09', handlePosition: '3' }));
  const r = await wave();
  expect(r.text()).toContain('D-07');
  await r.click('Edit equipment');
  await r.fill('Plate software', 'Smart2Move 4.2');
  await act(async () => { field(r, 'Plate software').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(JSON.parse(window.localStorage.getItem('ryp.assessments.equipment'))).toMatchObject({ dynamometer1: 'D-07', plateSoftware: 'Smart2Move 4.2' });
  await r.unmount();
});

test('an unknown wave says so', async () => {
  mockWave = null;
  const r = await wave();
  expect(r.text()).toContain('This wave was not found.');
  await r.unmount();
});

test('the wave offers anthropometrics and grip after intake, with the grip rotation', async () => {
  const r = await wave();
  expect(r.button('2 Anthropometrics')).not.toBeNull();
  await r.click('3 Grip');
  expect(r.text()).toContain('Squeeze as hard as you can. Go, go, go, relax.');
  expect(r.text()).toContain('Dynamometer 1: A right, A left, B right, B left');
  await r.unmount();
});

test('a pain stop at intake: the athlete is offered no anthropometrics or grip (safety)', async () => {
  const r = await wave();
  await r.click('Ava Moreno: pain, stop');
  expect(r.text()).toContain('Stopped for pain.');
  await r.click('2 Anthropometrics');
  expect(field(r, 'Ava Moreno standing height 1')).toBeNull();
  expect(field(r, 'Ben Ortiz standing height 1')).not.toBeNull();
  expect(r.text()).toContain('Not tested at readiness (Pain). Retest within 7 days.');
  await r.click('3 Grip');
  expect(field(r, 'Ava Moreno grip right 1')).toBeNull();
  await r.unmount();
});
