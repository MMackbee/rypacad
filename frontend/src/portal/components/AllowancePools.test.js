import React from 'react';
import { renderScreen } from '../screens/testRender';
import AllowancePools, { GraceLine, SpendNote } from './AllowancePools';

const bought = { id: 'single_a', expiresAt: '2027-02-27', reason: 'single-purchase', sourceSessionId: null };
const bonus = { id: 'g1', expiresAt: '2026-11-20', reason: 'session-cancelled', sourceSessionId: '2026-11-11-0' };
const single = (over = {}) => ({ granted: 0, used: 0, reserved: 0, left: 0, unlimited: false, perPurchase: true, held: 0, grace: [bought], ...over });
const monthly = (over = {}) => ({ granted: 6, used: 0, reserved: 0, left: 6, unlimited: false, perPurchase: false, held: 0, grace: [], ...over });

const text = async (el) => {
  const r = await renderScreen(el);
  const t = r.text();
  await r.unmount();
  return t;
};

describe('the single token (owner ruling 2026-09-29/30)', () => {
  test('the meter delegates to the session-token count - never "0 left" for a paid family', async () => {
    expect(await text(<AllowancePools tokens={single()} compact />)).toBe('1 session token');
    const full = await text(<AllowancePools tokens={single()} />);
    expect(full).toContain('1 session token - good through Sat, Feb 27');
    expect(full).not.toContain('0 of 0');
    expect(full).not.toContain('None left');
  });

  test('the grace line: a bought token on a monthly athlete is named; a single athlete gets no duplicate', async () => {
    expect(await text(<GraceLine tokens={monthly({ grace: [bought] })} />)).toBe('Session token - good through Sat, Feb 27');
    expect(await text(<GraceLine tokens={single()} />)).toBe('');
    expect(await text(<GraceLine tokens={single({ grace: [bonus, bought] })} />)).toContain('Bonus token');
  });

  test('the spend note names what is spent', async () => {
    expect(await text(<SpendNote tokens={single()} />)).toBe('Uses a session token');
    expect(await text(<SpendNote tokens={single({ grace: [] })} />)).toBe('No session token');
    expect(await text(<SpendNote tokens={single({ grace: [bonus, bought] })} />)).toBe('Uses a bonus token');
    expect(await text(<SpendNote tokens={single({ grace: [], granted: 1, left: 1 })} />)).toBe('Spends 1 token · 1 left'); // an ops comp
  });
});

describe('monthly and Elite rendering is unchanged', () => {
  test('the meter', async () => {
    expect(await text(<AllowancePools tokens={monthly()} compact />)).toBe('6 tokens left');
    const full = await text(<AllowancePools tokens={monthly({ used: 2, left: 4 })} />);
    expect(full).toContain('4 left');
    expect(full).toContain('2 of 6 used');
    expect(await text(<AllowancePools tokens={monthly({ left: 0, used: 6 })} />)).toContain('None left');
    expect(await text(<AllowancePools tokens={{ unlimited: true, grace: [] }} />)).toBe('Elite · unlimited');
  });

  test('the grace line and spend note', async () => {
    expect(await text(<GraceLine tokens={monthly({ grace: [bonus] })} />)).toBe('Bonus token — the Wednesday, Nov 11 block was cancelled — expires Friday, Nov 20');
    expect(await text(<SpendNote tokens={monthly({ grace: [bonus] })} />)).toBe('Uses a bonus token');
    expect(await text(<SpendNote tokens={monthly({ left: 0 })} />)).toBe('No tokens left');
    expect(await text(<SpendNote tokens={monthly()} />)).toBe('Spends 1 token · 6 left');
  });
});
