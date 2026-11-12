/**
 * The staff view's Cancel on the "This period" rows (owner approved
 * 2026-11-12): only when the page passes onCancelRow, and only on a Booked
 * or No-show booking that is not a Calendly 1:1 and whose billing period is
 * not over. Every meter shape lists rows, so every one carries it. Real hub
 * members (data/billingHub.js hubMemberFor), as TokenMeter.test.js does.
 */
import React from 'react';
import { renderScreen } from '../screens/testRender';
import TokenMeter from './TokenMeter';
import { ELITE, SINGLE_TOKEN, TOKEN_PACKAGES } from '../data/packages';
import { hubMemberFor } from '../data/billingHub';

jest.mock('./PayButton', () => ({ __esModule: true, default: ({ label }) => <button type="button">{label}</button> }));

const T6 = TOKEN_PACKAGES.find((p) => p.id === 't-6');
const today = '2026-11-12';
const b = (id, over = {}) => ({ id, athleteId: 'jordan', sessionId: `s-${id}`, status: 'confirmed', periodKey: '2026-11-01', date: '2026-11-10', type: 'training', ...over });
const member = (bookings, pkg = T6, waitlist = []) =>
  hubMemberFor({ athlete: { id: 'jordan', name: 'Jordan Whitfield', packageId: pkg.id }, pkg, bookings, waitlist, graceTokens: [], anchorDay: 1, today });
const cancels = (r) => [...r.container.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'Cancel');

const ROWS = [
  b('booked', { date: '2026-11-03' }),
  b('noshow', { date: '2026-11-04', status: 'noshow' }),
  b('attended', { date: '2026-11-05', status: 'attended' }),
  b('calendly', { date: '2026-11-06', type: 'mental', source: 'calendly' }),
  b('gone', { date: '2026-11-07', status: 'cancelled' }),
  // Booked in October, read under November by the hub: its period is over.
  b('october', { date: '2026-10-24', periodKey: '2026-10-01' }),
];
const WAIT = [{ id: 'w1', sessionId: 's-w', athleteId: 'jordan', periodKey: '2026-11-01', date: '2026-11-20' }];

test('no Cancel anywhere without onCancelRow - the parents\' meter is unchanged', async () => {
  const r = await renderScreen(<TokenMeter member={member(ROWS, T6, WAIT)} defaultOpen />);
  expect(r.text()).toContain('This period');
  expect(cancels(r)).toEqual([]);
  await r.unmount();
});

test('with onCancelRow: only the Booked and No-show rows of this period carry it, and a tap hands over the row', async () => {
  const tapped = [];
  const r = await renderScreen(<TokenMeter member={member(ROWS, T6, WAIT)} defaultOpen onCancelRow={(row) => tapped.push(row)} />);
  const buttons = cancels(r);
  expect(buttons).toHaveLength(2);
  await r.act(async () => { buttons[1].click(); });
  await r.act(async () => { buttons[0].click(); });
  expect(tapped.map((row) => [row.id, row.status, row.sessionId])).toEqual([['noshow', 'noshow', 's-noshow'], ['booked', 'confirmed', 's-booked']]);
  await r.unmount();
});

test('the Cancel is a 44px tap target named for its athlete and its row', async () => {
  const r = await renderScreen(<TokenMeter member={member([b('noshow', { status: 'noshow' })])} defaultOpen onCancelRow={() => {}} />);
  const [button] = cancels(r);
  expect(button.style.height).toBe('44px');
  expect(button.getAttribute('aria-label')).toBe("Cancel Jordan's Tue, Nov 10 Training block");
  await r.unmount();
});

test('a bonus-token row still offers it (the badge reads Bonus token)', async () => {
  const r = await renderScreen(<TokenMeter member={member([b('g', { status: 'noshow', graceTokenId: 'grace-1', chargedFrom: 'grace' })])} defaultOpen onCancelRow={() => {}} />);
  expect(r.text()).toContain('Bonus token');
  expect(cancels(r)).toHaveLength(1);
  await r.unmount();
});

test('Elite and the single token list rows too, and carry it', async () => {
  const elite = await renderScreen(<TokenMeter member={member([b('e', { chargedFrom: 'elite' })], ELITE)} defaultOpen onCancelRow={() => {}} />);
  expect(cancels(elite)).toHaveLength(1);
  await elite.unmount();
  const single = await renderScreen(<TokenMeter member={member([b('s', { graceTokenId: 'single_cs_1', chargedFrom: 'grace' })], SINGLE_TOKEN)} defaultOpen onCancelRow={() => {}} />);
  expect(cancels(single)).toHaveLength(1);
  await single.unmount();
});

test('closed evidence shows no Cancel until opened', async () => {
  const r = await renderScreen(<TokenMeter member={member([b('noshow', { status: 'noshow' })])} onCancelRow={() => {}} />);
  expect(cancels(r)).toEqual([]);
  await r.click('This period · 1 session▾');
  expect(cancels(r)).toHaveLength(1);
  await r.unmount();
});
