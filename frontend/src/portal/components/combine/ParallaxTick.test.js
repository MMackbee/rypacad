/**
 * components/combine/ParallaxTick.js: the "Parallax intake swings" tick on a
 * training session's attendance row (spec 3). Who may tick, undo or clear is
 * data/combine.js; this pins what the coach sees and taps.
 */
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import ParallaxTick from './ParallaxTick';
import { ERR } from '../../hooks/live';

const T = Date.parse('2026-11-12T22:00:00Z');
const M = { athleteId: 'a1', at: new Date(T), by: 'u-luke', byName: 'Luke' };
const LUKE = { uid: 'u-luke', role: 'coach' };
const OWNER = { uid: 'owner', role: 'owner' };
const LABEL = 'Parallax intake swings: Jordan Whitfield';
const checkbox = (r) => r.container.querySelector('[role="checkbox"]');

const tick = (props) => renderScreen(
  <ParallaxTick name="Jordan Whitfield" milestone={null} viewer={LUKE} canTick now={() => T + 3 * 60000} onTick={() => {}} onUndo={() => {}} {...props} />
);

test('not done: the label, and a tap ticks', async () => {
  let finish;
  const onTick = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const r = await tick({ onTick });
  expect(checkbox(r).getAttribute('aria-checked')).toBe('false');
  expect(r.text()).toContain('Parallax intake swings');
  expect(r.text()).not.toContain('done');
  expect(checkbox(r).disabled).toBe(false);
  await r.click(LABEL);
  expect(onTick).toHaveBeenCalledTimes(1);
  expect(checkbox(r).disabled).toBe(true);
  await r.act(async () => { finish(); });
  expect(checkbox(r).disabled).toBe(false);
  await r.unmount();
});

test('a tap stays on the tick (the row behind it is not tapped)', async () => {
  const row = jest.fn();
  const onTick = jest.fn(async () => {});
  const r = await renderScreen(
    <div onClick={row}>
      <ParallaxTick name="Jordan Whitfield" milestone={null} viewer={LUKE} canTick now={() => T} onTick={onTick} onUndo={() => {}} />
    </div>
  );
  await r.click(LABEL);
  expect(onTick).toHaveBeenCalledTimes(1);
  expect(row).not.toHaveBeenCalled();
  await r.unmount();
});

test('done: the Chicago date and the first name', async () => {
  const r = await tick({ milestone: M });
  expect(checkbox(r).getAttribute('aria-checked')).toBe('true');
  expect(r.text()).toContain('done Nov 12 · Luke');
  await r.unmount();
});

test('the one who ticked undoes it inside ten minutes', async () => {
  const onUndo = jest.fn(async () => {});
  const r = await tick({ milestone: M, onUndo });
  expect(checkbox(r).disabled).toBe(false);
  await r.click(LABEL);
  expect(onUndo).toHaveBeenCalledTimes(1);
  await r.unmount();
});

test('after ten minutes the coach cannot', async () => {
  const r = await tick({ milestone: M, now: () => T + 11 * 60000 });
  expect(checkbox(r).disabled).toBe(true);
  await r.unmount();
});

test('another coach cannot', async () => {
  const r = await tick({ milestone: M, viewer: { uid: 'u-sam', role: 'coach' } });
  expect(checkbox(r).disabled).toBe(true);
  await r.unmount();
});

test('a screen opened at minute 9 and tapped at minute 11 says why (Review Focus 5)', async () => {
  let clock = T + 9 * 60000;
  const onUndo = jest.fn(async () => {});
  const r = await tick({ milestone: M, onUndo, now: () => clock });
  expect(checkbox(r).disabled).toBe(false);
  clock = T + 11 * 60000;
  await r.click(LABEL);
  expect(onUndo).not.toHaveBeenCalled();
  expect(r.text()).toContain('Ten minutes have passed. Ask the owner to clear it.');
  await r.unmount();
});

test('the owner clears with a confirm (Review Focus 5)', async () => {
  const onUndo = jest.fn(async () => {});
  const r = await tick({ milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo });
  expect(checkbox(r).disabled).toBe(false);
  await r.click(LABEL);
  expect(r.text()).toContain('Clear Parallax intake swings for Jordan Whitfield?');
  await r.click('Keep');
  expect(onUndo).not.toHaveBeenCalled();
  expect(checkbox(r).getAttribute('aria-checked')).toBe('true');
  expect(r.text()).not.toContain('Clear Parallax intake swings for Jordan Whitfield?');
  await r.click(LABEL);
  await r.click('Clear Parallax intake swings: Jordan Whitfield');
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(r.text()).not.toContain('Clear Parallax intake swings for Jordan Whitfield?');
  await r.unmount();
});

test("the owner's Clear and Keep are 44 px tall (TOUCH_MIN), like the tick", async () => {
  const r = await tick({ milestone: M, viewer: OWNER, now: () => T + 86400000 });
  await r.click(LABEL);
  expect(r.button('Clear Parallax intake swings: Jordan Whitfield').style.minHeight).toBe('44px');
  expect(r.button('Keep').style.minHeight).toBe('44px');
  await r.unmount();
});

test('a late undo says why (Review Focus 5)', async () => {
  const onUndo = jest.fn(async () => { throw Object.assign(new Error('no'), { code: ERR.PERMISSION }); });
  const r = await tick({ milestone: M, onUndo });
  await r.click(LABEL);
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(r.text()).toContain('Ten minutes have passed. Ask the owner to clear it.');
  await r.unmount();
});

test('an undo that failed for another reason says not saved', async () => {
  const onUndo = jest.fn(async () => { throw new Error('offline'); });
  const r = await tick({ milestone: M, onUndo });
  await r.click(LABEL);
  expect(r.text()).toContain('Not saved. Tap to try again.');
  expect(r.text()).not.toContain('Ten minutes have passed.');
  await r.unmount();
});

test('a failed tick says so', async () => {
  const onTick = jest.fn(async () => { throw new Error('offline'); });
  const r = await tick({ onTick });
  await r.click(LABEL);
  expect(r.text()).toContain('Not saved. Tap to try again.');
  expect(checkbox(r).disabled).toBe(false);
  await r.unmount();
});

test('a failed tick is announced to screen readers (role="alert")', async () => {
  const onTick = jest.fn(async () => { throw new Error('offline'); });
  const r = await tick({ onTick });
  expect(r.container.querySelector('[role="alert"]')).toBeNull();
  await r.click(LABEL);
  expect(r.container.querySelector('[role="alert"]').textContent).toBe('Not saved. Tap to try again.');
  await r.unmount();
});

test('read-only shows the state, disabled', async () => {
  const open = await tick({ canTick: false });
  expect(checkbox(open).disabled).toBe(true);
  expect(checkbox(open).getAttribute('aria-checked')).toBe('false');
  await open.unmount();
  const done = await tick({ canTick: false, milestone: M });
  expect(checkbox(done).disabled).toBe(true);
  expect(checkbox(done).getAttribute('aria-checked')).toBe('true');
  expect(done.text()).toContain('done Nov 12 · Luke');
  await done.unmount();
});

test('nothing before the read lands', async () => {
  const waiting = await tick({ milestone: undefined });
  expect(checkbox(waiting)).toBeNull();
  expect(waiting.text()).toBe('');
  await waiting.unmount();
  const failed = await tick({ milestone: undefined, loadError: true });
  expect(checkbox(failed)).toBeNull();
  expect(failed.text()).toBe("Parallax intake swings didn't load.");
  await failed.unmount();
});
