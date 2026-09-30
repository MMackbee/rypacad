import React from 'react';
import { renderScreen } from '../screens/testRender';
import TokenMeter from './TokenMeter';
import { ELITE, TOKEN_PACKAGES } from '../data/packages';
import { hubMemberFor } from '../data/billingHub';

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

test('in season nothing changes: the reset line, the expiry nudge, the last period', async () => {
  const r = await renderScreen(<TokenMeter member={member({ today: '2026-12-26' })} defaultOpen />);
  const text = r.text();
  expect(text).toMatch(/Resets .*Jan 1 · 5 days left in this period/);
  expect(text).toMatch(/16 tokens expire .*Dec 31/);
  expect(text).toContain('Last period (');
  expect(text).not.toContain('First period');
  await r.unmount();
});
