/**
 * The door rules sheet (spec 7): the facility rules (in the second person for
 * an adult athlete's own login), the typed full name, an "I agree to the door
 * rules" tick and Sign. Sign stays off until both are there; a refusal shows
 * the server's own words and keeps the sheet open; success hands back.
 * Plain functions, not jest.fn(): CRA's resetMocks would clear them.
 */
jest.mock('../../hooks/door', () => ({
  signDoorRules: async (name) => {
    mockSigned.push(name);
    if (mockFail) throw mockFail;
    return { ok: true, termsVersion: 'door-2026-11-17' };
  },
}));

let mockSigned;
let mockFail;

import React from 'react';
import { renderScreen } from '../../screens/testRender';
import { LiveDataError, ERR } from '../../hooks/live';
import DoorRulesSheet from './DoorRulesSheet';

// Owner 2026-11-17: the household only, no guest.
const RULE = "Use the app's Unlock button only when you are at the door, and only to let in your own household. Never open the door for anyone else.";

let closed;
let signed;
beforeEach(() => {
  mockSigned = [];
  mockFail = null;
  closed = 0;
  signed = 0;
});

const mount = (props = {}) =>
  renderScreen(<DoorRulesSheet onClose={() => { closed += 1; }} onSigned={() => { signed += 1; }} {...props} />);

test('a dialog named Door rules, the facility rules in full, the new line among them', async () => {
  const r = await mount();
  const dialog = r.container.querySelector('[role="dialog"]');
  expect(dialog.getAttribute('aria-label')).toBe('Door rules');
  expect(r.text()).toContain('Who may enter');
  expect(r.text()).toContain('Access is for the athletes in your household');
  expect(r.text()).toContain(RULE);
  expect(r.text()).toContain('Risk and responsibility');
  await r.unmount();
});

test("an adult athlete's own login reads them in the second person", async () => {
  const r = await mount({ selfWording: true });
  expect(r.text()).toContain('Access is for you and any other athlete in your household');
  expect(r.text()).not.toContain('or for the athlete you are responsible for');
  expect(r.text()).toContain(RULE);
  await r.unmount();
});

test('Sign waits for a name and the tick, then signs with the name typed', async () => {
  const r = await mount();
  expect(r.button('Sign').disabled).toBe(true);
  await r.fill('Your full name', 'Dana Hart');
  expect(r.button('Sign').disabled).toBe(true);
  await r.click('I agree to the door rules');
  expect(r.button('Sign').disabled).toBe(false);
  await r.click('Sign');
  expect(mockSigned).toEqual(['Dana Hart']);
  expect(signed).toBe(1);
  expect(closed).toBe(0);
  await r.unmount();
});

test('one letter is not a name', async () => {
  const r = await mount();
  await r.fill('Your full name', ' D ');
  await r.click('I agree to the door rules');
  expect(r.button('Sign').disabled).toBe(true);
  await r.unmount();
});

test("a refusal shows the server's words and keeps the sheet open", async () => {
  mockFail = new LiveDataError(ERR.INVALID, 'Reload the app to see the latest rules.', null, 'stale-terms');
  const r = await mount();
  await r.fill('Your full name', 'Dana Hart');
  await r.click('I agree to the door rules');
  await r.click('Sign');
  expect(r.text()).toContain('Reload the app to see the latest rules.');
  expect(signed).toBe(0);
  expect(r.button('Sign').disabled).toBe(false);
  await r.unmount();
});

test.each([
  ['internal', new LiveDataError(ERR.UNKNOWN, 'internal', { code: 'functions/internal' }, null)],
  ['deadline-exceeded', new LiveDataError(ERR.UNAVAILABLE, 'deadline-exceeded', { code: 'functions/deadline-exceeded' }, null)],
  ['a plain Error', new Error('Failed to fetch')],
])('no answer from the server (%s): plain words, never the SDK\'s code', async (label, failure) => {
  // Review 2026-11-17 (app-5): weak signal showed the bare word "internal".
  mockFail = failure;
  const r = await mount();
  await r.fill('Your full name', 'Dana Hart');
  await r.click('I agree to the door rules');
  await r.click('Sign');
  expect(r.text()).toContain('The door rules were not signed. Check your connection and try again.');
  expect(r.text()).not.toContain(failure.message);
  expect(signed).toBe(0);
  await r.unmount();
});

test('Cancel closes without signing', async () => {
  const r = await mount();
  await r.click('Cancel');
  expect(closed).toBe(1);
  expect(mockSigned).toEqual([]);
  await r.unmount();
});
