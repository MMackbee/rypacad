/**
 * The meter and a leftover token used early (owner 2026-11-16, the Schmidt
 * case): next month at zero is not a dead end while this month has a token
 * left over, and a token that was carried over is said to be.
 */
import React from 'react';
import { renderScreen } from '../screens/testRender';
import AllowancePools, { NextPeriodLine, SpendNote } from './AllowancePools';

const next = { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 6, used: 6, reserved: 0, granted: 6, left: 0 };
const offer = { count: 1, until: '2026-12-31', fromPeriodKey: '2026-11-01' };
const monthly = (over = {}) => ({ granted: 6, used: 5, reserved: 0, left: 1, unlimited: false, perPurchase: false, held: 0, grace: [], rolledAhead: 0, nextPeriod: next, ...over });

const text = async (el) => {
  const r = await renderScreen(el);
  const t = r.text();
  await r.unmount();
  return t;
};

describe('the meter with a leftover token that can book next month', () => {
  test('under "December: 0 of 6 left" it says the leftover token can book December now', async () => {
    const t = await text(<AllowancePools tokens={monthly({ rollAhead: offer })} />);
    expect(t).toContain('1 left');
    expect(t).toContain('December: 0 of 6 left');
    expect(t).toContain('Your leftover November token can book a December session now.');
  });

  test('nothing more is said without the offer, or while December has tokens of its own', async () => {
    expect(await text(<NextPeriodLine tokens={monthly()} />)).toBe('December: 0 of 6 left');
    expect(await text(<NextPeriodLine tokens={monthly({ rollAhead: offer, nextPeriod: { ...next, used: 4, booked: 4, left: 2 } })} />)).toBe('December: 2 of 6 left');
  });

  test('a token carried over early is named beside the count', async () => {
    const t = await text(<AllowancePools tokens={monthly({ left: 0, rolledAhead: 1 })} />);
    expect(t).toContain('None left');
    expect(t).toContain('5 of 6 used, 1 carried over');
    expect(await text(<AllowancePools tokens={monthly()} />)).toContain('5 of 6 used');
    expect(await text(<AllowancePools tokens={monthly()} />)).not.toContain('carried over');
  });
});

describe('the session card note', () => {
  test('a next-month session paid by the leftover token says so', async () => {
    const december = monthly({ granted: 6, used: 6, left: 0 });
    expect(await text(<SpendNote tokens={december} rollAhead={offer} />)).toBe('Uses your leftover November token');
    expect(await text(<SpendNote tokens={{ unlimited: true, grace: [] }} rollAhead={offer} />)).toBe('Included with Elite');
  });
});
