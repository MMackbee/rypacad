import React from 'react';
import { renderScreen } from '../screens/testRender';
import AllowancePools, { GraceLine, NextPeriodLine, SpendNote, nextPeriodLabel, nextPeriodOpen, nextPeriodSuffix, spentTitle } from './AllowancePools';

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

describe('the next period under the meter (incident 2026-11-01: December read as closed)', () => {
  const next = { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 1, reserved: 0, granted: 8, left: 7 };

  test('the label: the month for a 1st-of-month anchor, else the start date; nothing without a count', () => {
    expect(nextPeriodLabel(next)).toBe('December: 7 of 8 left');
    expect(nextPeriodLabel({ ...next, periodKey: '2026-11-10', periodEnd: '2026-12-09' })).toBe('From Nov 10: 7 of 8 left');
    expect(nextPeriodLabel({ periodKey: '2026-12-01', booked: 0 })).toBeNull(); // an older shape without the count
    expect(nextPeriodLabel(null)).toBeNull();
  });

  test('the line shows on the full meter beside a period at zero; never for Elite, the single token, an unpaid grant or the compact line', async () => {
    const full = await text(<AllowancePools tokens={monthly({ left: 0, used: 6, nextPeriod: next })} />);
    expect(full).toContain('None left');
    expect(full).toContain('December: 7 of 8 left');
    expect(await text(<AllowancePools tokens={monthly({ nextPeriod: next })} compact />)).toBe('6 tokens left');
    expect(await text(<NextPeriodLine tokens={{ unlimited: true, grace: [], nextPeriod: next }} />)).toBe('');
    expect(await text(<NextPeriodLine tokens={single({ nextPeriod: next })} />)).toBe('');
    expect(await text(<NextPeriodLine tokens={monthly({ unpaid: true, nextPeriod: next })} />)).toBe('');
    expect(await text(<NextPeriodLine tokens={monthly()} />)).toBe('');
    expect(await text(<NextPeriodLine tokens={monthly({ nextPeriod: { ...next, left: 0, booked: 8 } })} />)).toBe('December: 0 of 8 left');
  });

  test('spent with next month in hand (2026-11-03, the Wolffs): the note and the compact line name next month, never "No tokens left"', async () => {
    const spent = monthly({ left: 0, used: 6, nextPeriod: next });
    expect(nextPeriodOpen(spent)).toBe(next);
    expect(spentTitle(next)).toBe('November tokens used');
    expect(spentTitle({ ...next, periodKey: '2026-12-10', periodEnd: '2027-01-09' })).toBe("This period's tokens used");
    expect(await text(<SpendNote tokens={spent} />)).toBe('November tokens used');
    // Two tokens held on a waitlist: spoken for, not used - the title says so, still neutral.
    const held = monthly({ left: 0, used: 4, reserved: 2, nextPeriod: next });
    expect(nextPeriodOpen(held)).toBe(next);
    expect(spentTitle(next, 2)).toBe('No November tokens left');
    expect(spentTitle({ ...next, periodKey: '2026-12-10' }, 2)).toBe('No tokens left this period');
    expect(await text(<SpendNote tokens={held} />)).toBe('No November tokens left');
    // The full meter's "None left" is amber (the last-token tone), not the red stop, while December is open.
    const countColor = async (tokens) => {
      const r = await renderScreen(<AllowancePools tokens={tokens} />);
      const span = [...r.container.querySelectorAll('span')].find((s) => ['None left', '1 left'].includes(s.textContent));
      const c = span.style.color;
      await r.unmount();
      return c;
    };
    const amber = await countColor(monthly({ left: 1, used: 5 }));
    expect(await countColor(spent)).toBe(amber);
    expect(await countColor(monthly({ left: 0, used: 6 }))).not.toBe(amber);
    expect(await text(<AllowancePools tokens={spent} compact />)).toBe('0 tokens left · December: 7 of 8 left');
    // December spent too, no count at all, or an unpaid grant: the red note as before; a bonus token in hand spends first.
    for (const t of [monthly({ left: 0, used: 6, nextPeriod: { ...next, left: 0, booked: 8 } }), monthly({ left: 0, used: 6 }), monthly({ left: 0, used: 6, unpaid: true, nextPeriod: next })]) {
      expect(nextPeriodOpen(t)).toBeNull();
      expect(await text(<SpendNote tokens={t} />)).toBe('No tokens left');
    }
    expect(nextPeriodOpen(monthly({ left: 0, used: 6, grace: [bonus], nextPeriod: next }))).toBeNull();
    expect(await text(<AllowancePools tokens={monthly({ left: 0, used: 6 })} compact />)).toBe('0 tokens left');
  });
});

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
    // The family card's compact line counts grace tokens beside the period
    // (review 2026-10-10: back from buying an extra session, "0 tokens left"
    // alone read as if it had not arrived).
    expect(await text(<AllowancePools tokens={monthly({ left: 0, used: 6, grace: [bought] })} compact />)).toBe('0 tokens left + 1 session token');
    expect(await text(<AllowancePools tokens={monthly({ grace: [bonus] })} compact />)).toBe('6 tokens left + 1 bonus token');
    expect(await text(<AllowancePools tokens={monthly({ left: 1, grace: [bonus, bought] })} compact />)).toBe('1 token left + 2 bonus tokens');
    expect(await text(<AllowancePools tokens={monthly({ left: 0, grace: [bought, { ...bought, id: 'single_b' }] })} compact />)).toBe('0 tokens left + 2 session tokens');
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

  test('December spent too (owner 2026-11-04): the card keeps the December count, in the red stop - a bare "0 tokens left" read as no December at all', async () => {
    const next = { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 8, reserved: 0, granted: 8, left: 0 };
    expect(await text(<AllowancePools tokens={monthly({ left: 0, used: 6, nextPeriod: next })} compact />)).toBe('0 tokens left · December: 0 of 8 left');
    expect(nextPeriodSuffix(monthly({ left: 0, used: 6, nextPeriod: next }))).toBe(' · December: 0 of 8 left');
    // Only once this period is spent, and only with a counted next period; never on an unpaid grant.
    expect(nextPeriodSuffix(monthly({ left: 2, used: 4, nextPeriod: next }))).toBe('');
    expect(nextPeriodSuffix(monthly({ left: 0, used: 6 }))).toBe('');
    expect(nextPeriodSuffix(monthly({ left: 0, used: 6, unpaid: true, nextPeriod: next }))).toBe('');
    expect(nextPeriodSuffix(null)).toBe('');
  });
});
