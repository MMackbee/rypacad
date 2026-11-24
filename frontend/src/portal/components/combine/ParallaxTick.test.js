/**
 * components/combine/ParallaxTick.js: the "Parallax intake swings" tick on a
 * training session's attendance row (spec 3). Who may tick, undo or clear is
 * data/combine.js; this pins what the coach sees and taps.
 */
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import ParallaxTick from './ParallaxTick';
import { ERR } from '../../hooks/live';
import { MARK_CHANGED } from '../../data/combine';

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

test('the fitness assessment: its own label, words and load error (hq card 14)', async () => {
  const onUndo = jest.fn(async () => {});
  const r = await tick({ label: 'Fitness assessment', loadErrorText: "Fitness assessment didn't load.", milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo });
  expect(r.text()).toContain('Fitness assessment');
  expect(r.text()).not.toContain('Parallax');
  expect(checkbox(r).getAttribute('aria-label')).toBe('Fitness assessment: Jordan Whitfield');
  expect(r.text()).toContain('done Nov 12 · Luke');
  await r.click('Fitness assessment: Jordan Whitfield');
  expect(r.text()).toContain('Clear Fitness assessment for Jordan Whitfield?');
  await r.click('Clear Fitness assessment: Jordan Whitfield');
  expect(onUndo).toHaveBeenCalledTimes(1);
  await r.unmount();
  const failed = await tick({ label: 'Fitness assessment', loadErrorText: "Fitness assessment didn't load.", milestone: undefined, loadError: true });
  expect(failed.text()).toBe("Fitness assessment didn't load.");
  await failed.unmount();
});

// ---- hq card 14, fix round 3 ------------------------------------------------

test('readOnly: a mark is status text, not a control (no button, no checkbox, nothing to Tab to)', async () => {
  const open = await tick({ canTick: false, readOnly: true });
  expect(open.container.querySelector('[role="checkbox"]')).toBeNull();
  expect(open.container.querySelector('button, input, [tabindex], [role]')).toBeNull();
  expect(open.text()).toContain('Parallax intake swings');
  expect(open.text()).toContain('not done');
  await open.unmount();
  const done = await tick({ canTick: false, readOnly: true, milestone: M });
  expect(done.container.querySelector('button, input, [tabindex], [role]')).toBeNull();
  expect(done.text()).toContain('Parallax intake swings');
  expect(done.text()).toContain('done Nov 12 · Luke');
  expect(done.text()).not.toContain('not done');
  await done.unmount();
});

test('readOnly: the fitness words, and a read that did not land still says so (or nothing before it lands)', async () => {
  const r = await tick({ readOnly: true, label: 'Fitness assessment', loadErrorText: "Fitness assessment didn't load.", milestone: null });
  expect(r.text()).toContain('Fitness assessment');
  expect(r.text()).toContain('not done');
  await r.unmount();
  const failed = await tick({ readOnly: true, milestone: undefined, loadError: true });
  expect(failed.text()).toBe("Parallax intake swings didn't load.");
  await failed.unmount();
  const waiting = await tick({ readOnly: true, milestone: undefined });
  expect(waiting.text()).toBe('');
  await waiting.unmount();
});

test('readOnly: the state is in the text, the tick glyph and the dash are hidden from a screen reader', async () => {
  const open = await tick({ readOnly: true });
  const done = await tick({ readOnly: true, milestone: M });
  for (const r of [open, done]) {
    const glyphs = [...r.container.querySelectorAll('[aria-hidden="true"]')];
    expect(glyphs.length).toBeGreaterThan(0);
    expect(r.container.querySelector('[aria-label]')).toBeNull();
  }
  await open.unmount();
  await done.unmount();
});

test('not readOnly (the attendance screen): the control is unchanged', async () => {
  const r = await tick({ milestone: null });
  expect(checkbox(r)).not.toBeNull();
  expect(r.text()).not.toContain('not done');
  await r.unmount();
});

test('while a tick is saving the control is dimmed and aria-busy; neither once it is saved', async () => {
  let finish;
  const onTick = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const r = await tick({ onTick });
  expect(checkbox(r).getAttribute('aria-busy')).not.toBe('true');
  expect(checkbox(r).style.opacity).not.toBe('0.55');
  await r.click(LABEL);
  expect(checkbox(r).getAttribute('aria-busy')).toBe('true');
  expect(checkbox(r).style.opacity).toBe('0.55');
  await r.act(async () => { finish(); });
  expect(checkbox(r).getAttribute('aria-busy')).not.toBe('true');
  expect(checkbox(r).style.opacity).not.toBe('0.55');
  await r.unmount();
});

test('while an undo is saving the control is busy too', async () => {
  let finish;
  const onUndo = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const r = await tick({ milestone: M, onUndo });
  await r.click(LABEL);
  expect(checkbox(r).getAttribute('aria-busy')).toBe('true');
  await r.act(async () => { finish(); });
  expect(checkbox(r).getAttribute('aria-busy')).not.toBe('true');
  await r.unmount();
});

test('while the owner is clearing a mark the control is busy', async () => {
  let finish;
  const onUndo = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const r = await tick({ milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo });
  await r.click(LABEL);
  await r.click('Clear Parallax intake swings: Jordan Whitfield');
  expect(checkbox(r).getAttribute('aria-busy')).toBe('true');
  expect(checkbox(r).style.opacity).toBe('0.55');
  await r.act(async () => { finish(); });
  expect(checkbox(r).getAttribute('aria-busy')).not.toBe('true');
  await r.unmount();
});

test("Keep says which mark and whose, like Clear", async () => {
  const r = await tick({ milestone: M, viewer: OWNER, now: () => T + 86400000 });
  await r.click(LABEL);
  expect(r.container.querySelector('button[aria-label="Keep Parallax intake swings: Jordan Whitfield"]')).not.toBeNull();
  await r.unmount();
  const fit = await tick({ label: 'Fitness assessment', milestone: M, viewer: OWNER, now: () => T + 86400000 });
  await fit.click('Fitness assessment: Jordan Whitfield');
  expect(fit.container.querySelector('button[aria-label="Keep Fitness assessment: Jordan Whitfield"]')).not.toBeNull();
  await fit.unmount();
});

test('after Keep, focus returns to the mark\'s tick', async () => {
  const r = await tick({ milestone: M, viewer: OWNER, now: () => T + 86400000 });
  await r.click(LABEL);
  await r.click('Keep Parallax intake swings: Jordan Whitfield');
  expect(document.activeElement).toBe(checkbox(r));
  await r.unmount();
});

test('after Clear, focus returns to the mark\'s tick', async () => {
  const onUndo = jest.fn(async () => {});
  const r = await tick({ milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo });
  await r.click(LABEL);
  await r.click('Clear Parallax intake swings: Jordan Whitfield');
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(checkbox(r));
  await r.unmount();
});

// ---- hq card 14, fix round 4: focus is never pulled -------------------------

const withInput = (props) => renderScreen(
  <div>
    <input aria-label="Search athletes" />
    <ParallaxTick name="Jordan Whitfield" milestone={null} viewer={LUKE} canTick now={() => T + 3 * 60000} onTick={() => {}} onUndo={() => {}} {...props} />
  </div>
);
const search = (r) => r.container.querySelector('input');
const focusSearch = (r) => r.act(async () => { search(r).focus(); });

test('a plain tick never moves focus: an input focused while the save is in flight keeps it', async () => {
  let finish;
  const onTick = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const r = await withInput({ onTick });
  await r.click(LABEL);
  await focusSearch(r);
  await r.act(async () => { finish(); });
  expect(document.activeElement).toBe(search(r));
  await r.unmount();
});

test('a plain undo inside the ten minutes never moves focus either', async () => {
  let finish;
  const onUndo = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const r = await withInput({ milestone: M, onUndo });
  await r.click(LABEL);
  await focusSearch(r);
  await r.act(async () => { finish(); });
  expect(document.activeElement).toBe(search(r));
  await r.unmount();
});

test("a tick that lands as another person's mark leaves no focus owed: a later re-render does not pull focus", async () => {
  let finish;
  const onTick = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const el = (milestone) => (
    <div>
      <input aria-label="Search athletes" />
      <ParallaxTick name="Jordan Whitfield" milestone={milestone} viewer={LUKE} canTick now={() => T + 3 * 60000} onTick={onTick} onUndo={() => {}} />
    </div>
  );
  const r = await renderScreen(el(null));
  await r.click(LABEL);
  await r.rerender(el({ athleteId: 'a1', at: new Date(T), by: 'u-sam', byName: 'Sam' }));
  expect(checkbox(r).disabled).toBe(true);
  await r.act(async () => { finish(); });
  await focusSearch(r);
  await r.rerender(el(null));
  expect(checkbox(r).disabled).toBe(false);
  expect(document.activeElement).toBe(search(r));
  await r.unmount();
});

test('Clear: focus the person moved to another input while the write was in flight stays there', async () => {
  let finish;
  const onUndo = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const r = await withInput({ milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo });
  await r.click(LABEL);
  await r.click('Clear Parallax intake swings: Jordan Whitfield');
  await focusSearch(r);
  await r.act(async () => { finish(); });
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(document.activeElement).toBe(search(r));
  await r.unmount();
});

test('a Clear that fails moves focus nowhere and says not saved', async () => {
  const onUndo = jest.fn(async () => { throw new Error('offline'); });
  const r = await withInput({ milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo });
  await r.click(LABEL);
  await r.click('Clear Parallax intake swings: Jordan Whitfield');
  expect(r.text()).toContain('Not saved. Tap to try again.');
  expect(document.activeElement).not.toBe(checkbox(r));
  await r.unmount();
});

test('a plain tick with nothing focused (a phone) does not take focus when the save lands', async () => {
  let finish;
  const onTick = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const r = await tick({ onTick });
  await r.click(LABEL);
  await r.act(async () => { if (document.activeElement) document.activeElement.blur(); });
  expect(document.activeElement).toBe(document.body);
  await r.act(async () => { finish(); });
  expect(checkbox(r).disabled).toBe(false);
  expect(document.activeElement).not.toBe(checkbox(r));
  await r.unmount();
});

test('a plain undo with nothing focused does not take focus when the save lands', async () => {
  let finish;
  const onUndo = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
  const r = await tick({ milestone: M, onUndo });
  await r.click(LABEL);
  await r.act(async () => { if (document.activeElement) document.activeElement.blur(); });
  expect(document.activeElement).toBe(document.body);
  await r.act(async () => { finish(); });
  expect(checkbox(r).disabled).toBe(false);
  expect(document.activeElement).not.toBe(checkbox(r));
  await r.unmount();
});

// ---- hq card 14, fix round 7: a changed mark closes the Clear confirm --------

const changedErr = () => Object.assign(new Error('changed'), { code: ERR.UNKNOWN, reason: MARK_CHANGED });
const OWNER_CLEAR = 'Clear Parallax intake swings: Jordan Whitfield';

test("the owner's Clear that meets a changed mark closes the confirm, says not saved, and the next tap asks again", async () => {
  const onUndo = jest.fn(async () => { throw changedErr(); });
  const r = await withInput({ milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo });
  await r.act(async () => { checkbox(r).focus(); });
  await r.click(LABEL);
  await r.click(OWNER_CLEAR);
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(r.text()).toContain('Not saved. Tap to try again.');
  expect(r.text()).not.toContain('Clear Parallax intake swings for Jordan Whitfield?');
  expect(r.container.querySelector(`[aria-label="${OWNER_CLEAR}"]`)).toBeNull();
  // The next tap opens a new confirm; it deletes nothing by itself.
  await r.click(LABEL);
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(r.text()).toContain('Clear Parallax intake swings for Jordan Whitfield?');
  await r.unmount();
});

test('a changed mark puts focus back on the tick when nothing else held it, and never takes it from another field', async () => {
  const onUndo = jest.fn(async () => { throw changedErr(); });
  let r = await tick({ milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo });
  await r.click(LABEL);
  await r.click(OWNER_CLEAR);
  expect(document.activeElement).toBe(checkbox(r));
  await r.unmount();
  let finish;
  const slow = jest.fn(() => new Promise((_, reject) => { finish = () => reject(changedErr()); }));
  r = await withInput({ milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo: slow });
  await r.click(LABEL);
  await r.click(OWNER_CLEAR);
  const input = r.container.querySelector('input');
  await r.act(async () => { input.focus(); });
  await r.act(async () => { finish(); });
  expect(document.activeElement).toBe(input);
  await r.unmount();
});

test("any other failure of the owner's Clear leaves the confirm open", async () => {
  const onUndo = jest.fn(async () => { throw new Error('offline'); });
  const r = await tick({ milestone: M, viewer: OWNER, now: () => T + 86400000, onUndo });
  await r.click(LABEL);
  await r.click(OWNER_CLEAR);
  expect(r.text()).toContain('Not saved. Tap to try again.');
  expect(r.text()).toContain('Clear Parallax intake swings for Jordan Whitfield?');
  expect(r.container.querySelector(`[aria-label="${OWNER_CLEAR}"]`)).not.toBeNull();
  await r.unmount();
});
