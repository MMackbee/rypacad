/**
 * The staff Move and Cancel on one booking row (Task C0): Move before
 * Cancel, each a 44px button in the Billing Cancel's style, named for the
 * athlete and, when given, the row - brothers and sisters on one session
 * would otherwise share a name. Shown only where the row allows it.
 */
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import StaffRowActions from './StaffRowActions';
import { color } from '../../tokens';

// A billing hub row (data/billingHub.js periodRows).
const row = (over = {}) => ({
  id: 'jordan_s1', kind: 'booking', athleteId: 'jordan', sessionId: 's1', date: '2026-11-10', time: '4:00 PM',
  label: 'Training block', type: 'training', status: 'confirmed', source: null, chargedFrom: 'period', comp: false,
  graceTokenId: null, viaGrace: false, viaSingle: false, viaComp: false, ...over,
});
const buttons = (r) => [...r.container.querySelectorAll('button')];
const cssColor = (value) => {
  const probe = document.createElement('i');
  probe.style.color = value;
  return probe.style.color;
};

test('Move then Cancel, named for the athlete', async () => {
  const r = await renderScreen(<StaffRowActions row={row()} first="Jordan" onMove={() => {}} onCancel={() => {}} />);
  expect(buttons(r).map((b) => b.textContent)).toEqual(['Move', 'Cancel']);
  expect(buttons(r).map((b) => b.getAttribute('aria-label'))).toEqual(['Move Jordan', "Cancel Jordan's booking"]);
  await r.unmount();
});

test('with a row label, the labels name the row too (the Billing Cancel, byte for byte)', async () => {
  const label = 'Tue, Nov 10 Training block';
  const r = await renderScreen(<StaffRowActions row={row({ status: 'noshow' })} first="Jordan" rowLabel={label} onMove={() => {}} onCancel={() => {}} />);
  expect(buttons(r).map((b) => b.getAttribute('aria-label'))).toEqual([
    "Move Jordan's Tue, Nov 10 Training block",
    "Cancel Jordan's Tue, Nov 10 Training block",
  ]);
  await r.unmount();
});

test('without a first name, the row label alone', async () => {
  const r = await renderScreen(<StaffRowActions row={row()} rowLabel="Tue, Nov 10 Training block" onMove={() => {}} onCancel={() => {}} />);
  expect(buttons(r).map((b) => b.getAttribute('aria-label'))).toEqual(['Move Tue, Nov 10 Training block', 'Cancel Tue, Nov 10 Training block']);
  await r.unmount();
});

test('each is a 44px button in the Billing Cancel style; Move green, Cancel red', async () => {
  const r = await renderScreen(<StaffRowActions row={row()} first="Jordan" onMove={() => {}} onCancel={() => {}} />);
  const [move, cancel] = buttons(r);
  for (const b of [move, cancel]) {
    expect(b.getAttribute('type')).toBe('button');
    expect(b.style.height).toBe('44px');
    expect(b.style.minWidth).toBe('44px');
    expect(b.style.padding).toBe('0px 2px 0px 6px');
    expect(b.style.flex).toBe('0 0 auto');
  }
  expect(move.style.color).toBe(cssColor(color.primary));
  expect(cancel.style.color).toBe(cssColor(color.error));
  await r.unmount();
});

test('a tap hands over the row', async () => {
  const moved = [];
  const cancelled = [];
  const r = await renderScreen(
    <StaffRowActions row={row()} first="Jordan" onMove={(x) => moved.push(x.id)} onCancel={(x) => cancelled.push(x.id)} />
  );
  await r.click('Move');
  await r.click('Cancel');
  expect(moved).toEqual(['jordan_s1']);
  expect(cancelled).toEqual(['jordan_s1']);
  await r.unmount();
});

test('an attended row, a 1:1 and a row from a period that is over render nothing', async () => {
  for (const [over, opts] of [[{ status: 'attended' }, {}], [{ type: 'mental' }, {}], [{ date: '2026-10-27' }, { periodStart: '2026-11-01' }]]) {
    const r = await renderScreen(<StaffRowActions row={row(over)} first="Jordan" {...opts} onMove={() => {}} onCancel={() => {}} />);
    expect(r.container.innerHTML).toBe('');
    await r.unmount();
  }
});

test('no onMove gives Cancel only; no onCancel gives Move only; neither gives nothing', async () => {
  const cancelOnly = await renderScreen(<StaffRowActions row={row()} first="Jordan" onCancel={() => {}} />);
  expect(buttons(cancelOnly).map((b) => b.textContent)).toEqual(['Cancel']);
  await cancelOnly.unmount();
  const moveOnly = await renderScreen(<StaffRowActions row={row()} first="Jordan" onMove={() => {}} />);
  expect(buttons(moveOnly).map((b) => b.textContent)).toEqual(['Move']);
  await moveOnly.unmount();
  const none = await renderScreen(<StaffRowActions row={row()} first="Jordan" />);
  expect(none.container.innerHTML).toBe('');
  await none.unmount();
});
