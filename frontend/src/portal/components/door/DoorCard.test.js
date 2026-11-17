/**
 * The family door card (spec 7), through the real hooks with only the
 * callables, isLive and the browser's location and network faked: hidden in
 * seed and practice modes and for every reason but four; the location line
 * before the first press (not for staff); a hold sends a fresh press with the
 * location and the card says what happened, word for word; offline and no
 * location never call; a refusal a family can act on switches the card to
 * that state; signing the rules rechecks. Plain functions, not jest.fn().
 */
jest.mock('../../hooks/live', () => ({ ...jest.requireActual('../../hooks/live'), isLive: () => mockLive }));
jest.mock('../../hooks/callables', () => ({
  callUnlockDoor: async (payload) => mockCall('unlockDoor', payload),
  callSignDoorRules: async (payload) => mockCall('signDoorRules', payload),
}));

let mockLive;
let mockCalls;
let mockCheck;
let mockPress;
function mockCall(name, payload) {
  mockCalls.push([name, payload]);
  if (name === 'signDoorRules') return { ok: true, termsVersion: payload.termsVersion };
  const answer = payload.check ? mockCheck : mockPress;
  return typeof answer === 'function' ? answer(payload) : answer;
}

import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import { ERR, LiveDataError } from '../../hooks/live';
import DoorCard from './DoorCard';

const NO_ANSWER = "The door didn't answer. If you heard the lock click, go in. Otherwise try once more, or call or text (612) 234-1644.";
const OPEN = { canUnlock: true, reason: null, staff: false, openSeconds: 3 };
const refusedWith = (reason, message = 'server words') => () => { throw new LiveDataError(ERR.INVALID, message, null, reason); };

let online;
let geo;
beforeAll(() => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  Object.defineProperty(window.navigator, 'geolocation', { configurable: true, get: () => geo });
});
beforeEach(() => {
  mockLive = true;
  mockCalls = [];
  mockCheck = OPEN;
  mockPress = { outcome: 'opened', openSeconds: 3 };
  online = true;
  geo = { getCurrentPosition: (ok) => ok({ coords: { latitude: 44.97, longitude: -93.26, accuracy: 15 } }) };
});
afterEach(() => jest.useRealTimers());

const presses = () => mockCalls.filter(([name, p]) => name === 'unlockDoor' && !p.check);
const checks = () => mockCalls.filter(([name, p]) => name === 'unlockDoor' && p.check);
const holdButton = (r) => r.container.querySelector('[data-door-hold]');

/** A full one-second hold on the button. */
async function hold(r) {
  jest.useFakeTimers();
  const b = holdButton(r);
  await act(async () => { b.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  await act(async () => { b.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })); });
  await act(async () => {});
}

describe('when the card shows', () => {
  test('seed mode and practice: nothing, and no call', async () => {
    mockLive = false;
    const seed = await renderScreen(<DoorCard />);
    expect(seed.container.innerHTML).toBe('');
    await seed.unmount();
    mockLive = true;
    const practice = await renderScreen(<DoorCard practice />);
    expect(practice.container.innerHTML).toBe('');
    await practice.unmount();
    expect(mockCalls).toEqual([]);
  });

  test('Unlock open: the button and, before the first press, the location line', async () => {
    const r = await renderScreen(<DoorCard />);
    expect(checks()).toHaveLength(1);
    expect(r.text()).toContain('Facility door');
    expect(holdButton(r)).not.toBeNull();
    expect(r.text()).toContain("The app checks you're at the academy when you unlock.");
    await r.unmount();
  });

  test('staff see no location line', async () => {
    mockCheck = { ...OPEN, staff: true };
    const r = await renderScreen(<DoorCard />);
    expect(holdButton(r)).not.toBeNull();
    expect(r.text()).not.toContain("The app checks you're at the academy");
    await r.unmount();
  });

  test.each(['off', 'not-set-up', 'no-access', 'not-eligible'])('hidden for %s', async (reason) => {
    mockCheck = { canUnlock: false, reason, staff: false, openSeconds: 5 };
    const r = await renderScreen(<DoorCard />);
    expect(r.container.innerHTML).toBe('');
    await r.unmount();
  });

  test('hidden while checking and on a failed check', async () => {
    mockCheck = () => new Promise(() => {});
    const waiting = await renderScreen(<DoorCard />);
    expect(waiting.container.innerHTML).toBe('');
    await waiting.unmount();
    mockCheck = refusedWith(null, 'internal');
    const failed = await renderScreen(<DoorCard />);
    expect(failed.container.innerHTML).toBe('');
    await failed.unmount();
  });

  test.each([
    ['guardian-rules', 'A parent needs to sign the door rules in their own app first.'],
    ['under-16', 'Athletes under 16 come in with a parent or guardian.'],
    ['paused', 'Door unlocking is paused for your family. Call or text the academy at (612) 234-1644.'],
  ])('%s: the copy, no button', async (reason, copy) => {
    mockCheck = { canUnlock: false, reason, staff: false, openSeconds: 5 };
    const r = await renderScreen(<DoorCard />);
    expect(r.text()).toContain(copy);
    expect(holdButton(r)).toBeNull();
    await r.unmount();
  });
});

describe('signing the rules', () => {
  test('sign-rules: the copy and the button; signing closes the sheet and rechecks', async () => {
    mockCheck = { canUnlock: false, reason: 'sign-rules', staff: false, openSeconds: 5 };
    const r = await renderScreen(<DoorCard />);
    expect(r.text()).toContain('Read and sign the door rules once to turn on Unlock.');
    expect(holdButton(r)).toBeNull();
    await r.click('Sign the door rules');
    expect(r.container.querySelector('[role="dialog"]')).not.toBeNull();
    await r.fill('Your full name', 'Dana Hart');
    await r.click('I agree to the door rules');
    mockCheck = OPEN;
    await r.click('Sign');
    await r.flush();
    expect(mockCalls).toContainEqual(['signDoorRules', { name: 'Dana Hart', termsVersion: 'door-2026-11-17' }]);
    expect(r.container.querySelector('[role="dialog"]')).toBeNull();
    expect(checks()).toHaveLength(2);
    expect(holdButton(r)).not.toBeNull();
    await r.unmount();
  });

  test("an adult athlete's own login reads the rules in the second person", async () => {
    mockCheck = { canUnlock: false, reason: 'sign-rules', staff: false, openSeconds: 5 };
    const r = await renderScreen(<DoorCard selfWording />);
    await r.click('Sign the door rules');
    expect(r.text()).toContain('Access is for you and any other athlete in your household');
    await r.unmount();
  });
});

describe('a press', () => {
  test('a hold sends a fresh press with the location; opened counts down, then offers another go', async () => {
    const r = await renderScreen(<DoorCard />);
    await hold(r);
    expect(presses()).toHaveLength(1);
    const [, payload] = presses()[0];
    expect(payload.pressId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(payload.location).toEqual({ lat: 44.97, lng: -93.26, accuracy: 15 });
    expect(r.text()).toContain('Unlocked - pull the door now.');
    expect(r.text()).not.toContain("The app checks you're at the academy");
    expect(r.text()).toContain('Open for 3 s');
    expect(r.text()).not.toContain("Didn't open?");
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(r.text()).toContain('Open for 2 s');
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(r.text()).not.toContain('Open for');
    expect(r.text()).toContain("Didn't open? Hold again.");
    // The door has locked again: the unlocked line goes.
    expect(r.text()).not.toContain('Unlocked - pull the door now.');
    await hold(r);
    expect(presses()).toHaveLength(2);
    expect(presses()[1][1].pressId).not.toBe(payload.pressId);
    await r.unmount();
  });

  test('the button is off from press to answer', async () => {
    let release;
    mockPress = () => new Promise((resolve) => { release = resolve; });
    const r = await renderScreen(<DoorCard />);
    await hold(r);
    // aria-disabled, not disabled: the button keeps keyboard focus (review 2026-11-17 app-7).
    expect(holdButton(r).getAttribute('aria-disabled')).toBe('true');
    expect(holdButton(r).textContent).toContain('Unlocking');
    await hold(r);
    expect(presses()).toHaveLength(1);
    await act(async () => { release({ outcome: 'coalesced', openSeconds: 3 }); });
    expect(holdButton(r).getAttribute('aria-disabled')).toBeNull();
    expect(r.text()).toContain('Already unlocked - pull the door.');
    await r.unmount();
  });

  test('a test household', async () => {
    mockPress = { outcome: 'test', openSeconds: 3 };
    const r = await renderScreen(<DoorCard />);
    await hold(r);
    expect(r.text()).toContain('Test household - the door was not opened.');
    await r.unmount();
  });

  test('offline: the offline copy and no call', async () => {
    online = false;
    const r = await renderScreen(<DoorCard />);
    await hold(r);
    expect(presses()).toEqual([]);
    expect(r.text()).toContain("You're offline - the button needs a data connection.");
    await r.unmount();
  });

  test('no location (denied or timed out): the location copy and no call', async () => {
    geo = { getCurrentPosition: (ok, fail) => fail({ code: 1, message: 'denied' }) };
    const r = await renderScreen(<DoorCard />);
    await hold(r);
    expect(presses()).toEqual([]);
    expect(r.text()).toContain("Turn on Location for this site so the app can check you're at the academy.");
    await r.unmount();
  });

  test.each([
    ['too-far', 'You need to be at the academy to unlock the door.'],
    ['rate-limited', 'Too many unlocks for now. Call or text the academy at (612) 234-1644.'],
    ['alta-error', NO_ANSWER],
    ['alta-timeout', NO_ANSWER],
    ['in-progress', NO_ANSWER],
    ['misconfigured', NO_ANSWER],
    ['off', 'Door unlocking is switched off right now.'],
  ])('refused %s: the copy, and the button stays', async (reason, copy) => {
    mockPress = refusedWith(reason);
    const r = await renderScreen(<DoorCard />);
    await hold(r);
    expect(r.text()).toContain(copy);
    expect(holdButton(r)).not.toBeNull();
    await r.unmount();
  });

  test('no reason at all (a crash, a timeout): the no-answer line, never the SDK words', async () => {
    mockPress = () => { throw new LiveDataError(ERR.UNKNOWN, 'internal', { code: 'functions/internal' }, null); };
    const r = await renderScreen(<DoorCard />);
    await hold(r);
    expect(r.text()).toContain(NO_ANSWER);
    expect(r.text()).not.toContain('internal');
    await r.unmount();
  });

  test('a refusal a family can act on switches the card: sign-rules brings the sign button', async () => {
    mockPress = refusedWith('sign-rules');
    const r = await renderScreen(<DoorCard />);
    await hold(r);
    expect(holdButton(r)).toBeNull();
    expect(r.text()).toContain('Read and sign the door rules once to turn on Unlock.');
    expect(r.button('Sign the door rules')).not.toBeNull();
    await r.unmount();
  });

  test('the keyboard path: Enter asks first, Unlock presses', async () => {
    const r = await renderScreen(<DoorCard />);
    await act(async () => { holdButton(r).click(); });
    expect(r.text()).toContain('Unlock the door now?');
    expect(presses()).toEqual([]);
    await r.click('Unlock');
    await r.flush();
    expect(presses()).toHaveLength(1);
    expect(r.text()).toContain('Unlocked - pull the door now.');
    await r.unmount();
  });
});

describe('keyboard and screen reader keep their place (review 2026-11-17 app-7)', () => {
  test('choosing Unlock in the question leaves focus on the button, through the wait and after the answer', async () => {
    let release;
    mockPress = () => new Promise((resolve) => { release = resolve; });
    const r = await renderScreen(<DoorCard />);
    await act(async () => { holdButton(r).focus(); holdButton(r).click(); });
    expect(r.text()).toContain('Unlock the door now?');
    await r.click('Unlock');
    await r.flush();
    expect(document.activeElement).toBe(holdButton(r));
    expect(holdButton(r).getAttribute('aria-disabled')).toBe('true');
    await act(async () => { release({ outcome: 'opened', openSeconds: 3 }); });
    expect(document.activeElement).toBe(holdButton(r));
    expect(r.text()).toContain('Unlocked - pull the door now.');
    await r.unmount();
  });

  test.each([
    ['paused', 'Door unlocking is paused for your family.'],
    ['sign-rules', 'Read and sign the door rules once to turn on Unlock.'],
    ['guardian-rules', 'A parent needs to sign the door rules in their own app first.'],
  ])('a refusal that switches the card (%s) moves focus to what it now says', async (reason, copy) => {
    mockPress = refusedWith(reason);
    const r = await renderScreen(<DoorCard />);
    await act(async () => { holdButton(r).focus(); holdButton(r).click(); });
    await r.click('Unlock');
    await r.flush();
    expect(holdButton(r)).toBeNull();
    expect(document.activeElement.textContent).toContain(copy);
    expect(document.activeElement.getAttribute('role')).toBe('status');
    await r.unmount();
  });
});

describe('on the staff screen', () => {
  test('switched off: the card still shows, says so, no button', async () => {
    mockCheck = { canUnlock: false, reason: 'off', staff: true, openSeconds: 5 };
    const r = await renderScreen(<DoorCard staffScreen />);
    expect(r.text()).toContain('Door unlocking is switched off right now.');
    expect(holdButton(r)).toBeNull();
    await r.unmount();
  });

  test('a failed check says so; while checking, nothing', async () => {
    mockCheck = () => new Promise(() => {});
    const waiting = await renderScreen(<DoorCard staffScreen />);
    expect(waiting.container.innerHTML).toBe('');
    await waiting.unmount();
    mockCheck = refusedWith(null, 'internal');
    const r = await renderScreen(<DoorCard staffScreen />);
    expect(r.text()).toContain("The door check didn't load. Reload the page to try again.");
    await r.unmount();
  });

  test('a staff press sends no location; a new recheckKey checks again', async () => {
    mockCheck = { canUnlock: true, reason: null, staff: true, openSeconds: 5 };
    geo = { getCurrentPosition: () => { throw new Error('staff are never asked'); } };
    const r = await renderScreen(<DoorCard staffScreen recheckKey="staff" />);
    expect(checks()).toHaveLength(1);
    await hold(r);
    expect(Object.keys(presses()[0][1])).toEqual(['pressId']);
    jest.useRealTimers();
    await r.rerender(<DoorCard staffScreen recheckKey="all" />);
    expect(checks()).toHaveLength(2);
    await r.unmount();
  });

  test('an unchanged recheckKey never rechecks, even when StrictMode runs the effects twice', async () => {
    // Found in the emulator pass: the dev build (index.js wraps the app in
    // StrictMode) sent three checks per home load, the third a recheck for a
    // key that never changed. StrictMode's own second run of the check is
    // React's; the extra recheck was the card's.
    const r = await renderScreen(
      <React.StrictMode>
        <DoorCard recheckKey="same" />
      </React.StrictMode>
    );
    expect(checks().length).toBeLessThanOrEqual(2);
    await r.unmount();
  });
});
