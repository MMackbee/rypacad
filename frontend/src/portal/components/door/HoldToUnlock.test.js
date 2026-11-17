/**
 * Hold to unlock (spec 7): a one-second hold with a progress ring fires the
 * unlock; letting go early cancels; no long-press menu; the keyboard and
 * screen-reader path is a click with no finger on the button, which asks
 * "Unlock the door now?" with Unlock and Cancel; the button is off from press
 * to answer.
 */
import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import HoldToUnlock, { HOLD_MS } from './HoldToUnlock';

let unlocks;
beforeEach(() => {
  unlocks = 0;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

const mount = (props = {}) => renderScreen(<HoldToUnlock onUnlock={() => { unlocks += 1; }} {...props} />);
const holdButton = (r) => r.container.querySelector('[data-door-hold]');
const fire = async (el, type, init = {}) => {
  let event;
  await act(async () => {
    event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
    el.dispatchEvent(event);
  });
  return event;
};
const advance = (ms) => act(async () => { jest.advanceTimersByTime(ms); });

test('a one-second hold unlocks, once', async () => {
  const r = await mount();
  expect(HOLD_MS).toBe(1000);
  const b = holdButton(r);
  expect(b.textContent).toContain('Hold to unlock');
  await fire(b, 'pointerdown');
  expect(b.textContent).toContain('Keep holding');
  await advance(999);
  expect(unlocks).toBe(0);
  await advance(1);
  expect(unlocks).toBe(1);
  await fire(b, 'pointerup');
  await fire(b, 'click');
  await advance(2000);
  expect(unlocks).toBe(1);
  // The click that ends a hold is not the keyboard path: no question.
  expect(r.text()).not.toContain('Unlock the door now?');
  await r.unmount();
});

test('letting go early cancels, and so does the browser taking the touch', async () => {
  const r = await mount();
  const b = holdButton(r);
  await fire(b, 'pointerdown');
  await advance(600);
  await fire(b, 'pointerup');
  await advance(2000);
  expect(unlocks).toBe(0);
  expect(b.textContent).toContain('Hold to unlock');
  await fire(b, 'pointerdown');
  await advance(500);
  await fire(b, 'pointercancel');
  await advance(2000);
  await fire(b, 'pointerdown');
  await advance(500);
  // React builds onPointerLeave from pointerout to an element outside.
  await fire(b, 'pointerout', { relatedTarget: document.body });
  await advance(2000);
  expect(unlocks).toBe(0);
  await r.unmount();
});

test('no long-press menu on the button', async () => {
  const r = await mount();
  const event = await fire(holdButton(r), 'contextmenu');
  expect(event.defaultPrevented).toBe(true);
  await r.unmount();
});

test('the ring fills over the hold and empties on release', async () => {
  const r = await mount();
  const ring = r.container.querySelector('[data-door-ring]');
  const full = ring.getAttribute('stroke-dasharray');
  expect(ring.getAttribute('stroke-dashoffset')).toBe(full);
  await fire(holdButton(r), 'pointerdown');
  expect(ring.getAttribute('stroke-dashoffset')).toBe('0');
  expect(ring.style.transition).toContain('1000ms');
  await fire(holdButton(r), 'pointerup');
  expect(ring.getAttribute('stroke-dashoffset')).toBe(full);
  await r.unmount();
});

test('keyboard or screen reader: a click with no finger asks first; Cancel unlocks nothing, Unlock does', async () => {
  const r = await mount();
  const b = holdButton(r);
  await act(async () => { b.click(); });
  expect(r.text()).toContain('Unlock the door now?');
  expect(r.container.querySelector('[role="alertdialog"]')).not.toBeNull();
  await r.click('Cancel');
  expect(r.text()).not.toContain('Unlock the door now?');
  expect(unlocks).toBe(0);
  await act(async () => { b.click(); });
  await r.click('Unlock');
  expect(unlocks).toBe(1);
  expect(r.text()).not.toContain('Unlock the door now?');
  await r.unmount();
});

test('Escape closes the question', async () => {
  const r = await mount();
  await act(async () => { holdButton(r).click(); });
  const dialog = r.container.querySelector('[role="alertdialog"]');
  expect(document.activeElement).toBe(dialog);
  await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(r.text()).not.toContain('Unlock the door now?');
  await r.unmount();
});

test('busy: off, says so, and neither a hold nor a click does anything', async () => {
  const r = await mount({ busy: true });
  const b = holdButton(r);
  expect(b.disabled).toBe(true);
  expect(b.textContent).toContain('Unlocking');
  await fire(b, 'pointerdown');
  await advance(1500);
  await act(async () => { b.click(); });
  expect(unlocks).toBe(0);
  expect(r.text()).not.toContain('Unlock the door now?');
  await r.unmount();
});

test('going busy closes an open question', async () => {
  const r = await mount();
  await act(async () => { holdButton(r).click(); });
  expect(r.text()).toContain('Unlock the door now?');
  await r.rerender(<HoldToUnlock onUnlock={() => {}} busy />);
  expect(r.text()).not.toContain('Unlock the door now?');
  await r.unmount();
});
