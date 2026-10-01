import React from 'react';
import { renderScreen } from '../screens/testRender';
import TokenMeter from './TokenMeter';
import { ELITE, TOKEN_PACKAGES } from '../data/packages';
import { hubMemberFor } from '../data/billingHub';
import { longDayLabel } from '../data/calendar';

const elite = { package: ELITE, tokens: { unlimited: true }, period: null, expiryNudge: null, spent: [], reserved: [] };

test('the staff price line bills per month, never per period', async () => {
  const r = await renderScreen(<TokenMeter member={elite} showPrices />);
  expect(r.text()).toContain('$999 / month');
  expect(r.text()).not.toContain('/ period');
  await r.unmount();
});

test('parents still see no price', async () => {
  const r = await renderScreen(<TokenMeter member={elite} />);
  expect(r.text()).not.toContain('$999');
  await r.unmount();
});

// Tester Mike 2026-09-30: no talk of tokens for Elite.
test('an Elite card reads Sessions / Unlimited, with no token wording', async () => {
  const r = await renderScreen(<TokenMeter member={elite} />);
  expect(r.text()).toContain('Sessions');
  expect(r.text()).toContain('Unlimited');
  expect(r.text()).not.toMatch(/token/i);
  await r.unmount();
});

// Tester report 2026-09-30 (Yannick 5, 6): real hub rows, from hubMemberFor.
const T16 = TOKEN_PACKAGES.find((p) => p.id === 't-16');
const member = (over = {}) =>
  hubMemberFor({ athlete: { id: 'a1', name: 'Jordan' }, pkg: T16, bookings: [], waitlist: [], graceTokens: [], anchorDay: 1, today: '2026-09-30', ...over });

test('before the season: the first period row, no expiry nudge, no Last period', async () => {
  const r = await renderScreen(<TokenMeter member={member()} defaultOpen />);
  const text = r.text();
  expect(text).toContain('of 16 left');
  expect(text).toContain('First period: November (Nov 1 - Nov 30) - 16 tokens');
  expect(text).not.toMatch(/expire/);
  expect(text).not.toContain('Sep 30');
  expect(text).not.toContain('Last period');
  expect(text).not.toContain('Resets');
  await r.unmount();
});

test('the issued November grant labels the first period row', async () => {
  const r = await renderScreen(<TokenMeter member={member({ tokenPeriod: { granted: 12 } })} />);
  expect(r.text()).toContain('First period: November (Nov 1 - Nov 30) - 12 tokens');
  expect(r.text()).toContain('of 12 left');
  await r.unmount();
});

test('unpaid: "Pay to start" instead of a balance', async () => {
  const r = await renderScreen(<TokenMeter member={member({ athlete: { id: 'a1', name: 'Jordan', billing: { status: 'pending' } } })} />);
  expect(r.text()).toContain('Pay to start');
  expect(r.text()).not.toContain('left');
  expect(r.text()).toContain('First period: November (Nov 1 - Nov 30) - 16 tokens');
  await r.unmount();
});

// Owner report 2026-09-30 (Mike): "Nothing booked in this period yet. Next
// period from Thursday, Oct 1: unlimited" over two November bookings.
test('Elite before the season: November, its bookings listed, December next', async () => {
  const nov = (id, date) => ({ id, athleteId: 'a1', sessionId: `s-${id}`, status: 'confirmed', periodKey: '2026-11-01', date, type: 'training' });
  const r = await renderScreen(<TokenMeter member={member({ pkg: ELITE, bookings: [nov('n1', '2026-11-03'), nov('n2', '2026-11-10')] })} defaultOpen />);
  const text = r.text();
  expect(text).toContain('Unlimited');
  expect(text).toContain('First period: November (Nov 1 - Nov 30) - unlimited');
  expect(text).toContain('This period · 2 sessions');
  expect(text).toContain('Tue, Nov 3');
  expect(text).toContain('Tue, Nov 10');
  expect(text).toContain(`Next period from ${longDayLabel('2026-12-01')}: unlimited`);
  expect(text).not.toContain('Nothing booked in this period yet');
  expect(text).not.toContain(longDayLabel('2026-10-01'));
  await r.unmount();
});

test('Elite in season: no first period line', async () => {
  const r = await renderScreen(<TokenMeter member={member({ pkg: ELITE, today: '2026-11-10' })} defaultOpen />);
  expect(r.text()).toContain('Unlimited');
  expect(r.text()).not.toContain('First period');
  expect(r.text()).toContain(`Next period from ${longDayLabel('2026-12-01')}: unlimited`);
  await r.unmount();
});

test('in season nothing changes: the reset line, the expiry nudge, the last period', async () => {
  const r = await renderScreen(<TokenMeter member={member({ today: '2026-12-26' })} defaultOpen />);
  const text = r.text();
  expect(text).toMatch(/Resets .*Jan 1 · 5 days left in this period/);
  expect(text).toMatch(/16 tokens expire .*Dec 31/);
  expect(text).toContain('Last period (');
  expect(text).not.toContain('First period');
  await r.unmount();
});
