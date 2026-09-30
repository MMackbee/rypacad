import React from 'react';
import { renderScreen } from '../screens/testRender';
import TokenMeter from './TokenMeter';
import { ELITE } from '../data/packages';

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
