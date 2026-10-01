import React from 'react';
import { renderScreen } from '../screens/testRender';
import TokenMeter from './TokenMeter';
import { ELITE, SINGLE_TOKEN, TOKEN_PACKAGES } from '../data/packages';
import { hubMemberFor } from '../data/billingHub';
import { BOOKING_OPENS_AT, longDayLabel } from '../data/calendar';

jest.mock('./PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label, variant }) => <button type="button">{label}|{athleteId}|{product}|{variant}</button> }));

const elite ={ package: ELITE, tokens: { unlimited: true }, period: null, expiryNudge: null, spent: [], reserved: [] };

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

// The single token (ruling 2026-09-29/30). Rendered directly: Billing.test.js
// and Membership.test.js mock TokenMeter.
const today = '2026-11-16';
const athlete = { id: 'ava', name: 'Ava' };
const booking = (id, over) => ({ id, athleteId: 'ava', status: 'confirmed', periodKey: '2026-11-01', date: '2026-11-20', sessionId: `s-${id}`, type: 'training', ...over });

test('a single athlete gets the session-token hero: no reset line, no bonus chip, no "of N"', async () => {
  const hub = hubMemberFor({
    athlete,
    pkg: SINGLE_TOKEN,
    anchorDay: 1,
    today,
    bookings: [booking('b1', { chargedFrom: 'grace', graceTokenId: 'single_cs_1' })],
    graceTokens: [
      { id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase' },
      { id: 'single_cs_2', expiresAt: '2027-02-27', reason: 'single-purchase' },
    ],
  });
  const r = await renderScreen(<TokenMeter member={hub} defaultOpen />);
  expect(r.text()).toContain('Session tokens');
  expect(r.text()).toContain('1session token left');
  expect(r.text()).toContain('good through Sat, Feb 27');
  expect(r.text()).not.toContain('Resets');
  expect(r.text()).not.toContain('Bonus');
  expect(r.text()).not.toContain('of 0 left');
  // The evidence: the booking paid with a bought token, and no period grant lines.
  expect(r.text()).toContain('Session token');
  expect(r.text()).not.toContain('Next period from');
  expect(r.text()).not.toContain('Last period');
  await r.unmount();
});

test('the staff view shows the one-time price on the hero', async () => {
  const hub = hubMemberFor({ athlete, pkg: SINGLE_TOKEN, anchorDay: 1, today, graceTokens: [] });
  const r = await renderScreen(<TokenMeter member={hub} showPrices />);
  expect(r.text()).toContain('Single token · $65 per session token');
  expect(r.text()).toContain('0session tokens left');
  await r.unmount();
});

test('monthly rendering is unchanged', async () => {
  const T12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');
  const hub = hubMemberFor({
    athlete,
    pkg: T12,
    anchorDay: 1,
    today,
    bookings: [booking('b1'), booking('b2', { graceTokenId: 'grace-spent' })],
    graceTokens: [
      { id: 'grace-open', expiresAt: '2026-11-30', reason: 'session-cancelled', sourceSessionId: '2026-11-11-0' },
      { id: 'grace-spent', expiresAt: '2026-11-30', reason: 'session-cancelled', sourceSessionId: '2026-11-10-0' },
    ],
  });
  const r = await renderScreen(<TokenMeter member={hub} defaultOpen />);
  expect(r.text()).toContain('11of 12 left');
  expect(r.text()).toContain('Bonus 1');
  expect(r.text()).toContain('Resets');
  expect(r.text()).toContain('Next period from');
  expect(r.text()).toContain('Bonus token'); // the grace-charged row's badge
  expect(r.text()).not.toContain('Session token');
  await r.unmount();
});

// Review 2026-09-30 (the single branch's one major finding): the meter fell to
// 0 and never said where the token went, nor offered a way to buy another.
describe('a single athlete: where the token went, and the way to another', () => {
  const BUY = 'Buy a session token - $65';
  const WHEN = 'Single tokens are available from Sat, Oct 10 at 7 AM.';
  const token = (id) => ({ id, expiresAt: '2027-02-27', reason: 'single-purchase' });
  const sessionsById = { 's-b1': { id: 's-b1', date: '2026-11-20', time: '4:00 PM', type: 'training', label: 'Training block' } };
  const single = (over = {}) => hubMemberFor({ athlete, pkg: SINGLE_TOKEN, anchorDay: 1, today, bookings: [], graceTokens: [], sessionsById, ...over });
  const spentOne = () => single({ bookings: [booking('b1', { chargedFrom: 'grace', graceTokenId: 'single_cs_1' })], graceTokens: [token('single_cs_1')] });

  // On sale: the booking-open gate has passed (owner ruling 2026-10-01).
  beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(BOOKING_OPENS_AT); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('after a booking the hero says which session the token was used on', async () => {
    const r = await renderScreen(<TokenMeter member={spentOne()} buy />);
    expect(r.text()).toContain('0session tokens left');
    expect(r.text()).toContain('Used on Fri, Nov 20 · 4:00 PM - Training block');
    await r.unmount();
  });

  test('with no token left it offers the way to buy another, not a dead end', async () => {
    const r = await renderScreen(<TokenMeter member={spentOne()} buy />);
    expect(r.button(`${BUY}|ava|tier|primary`)).not.toBeNull();
    await r.unmount();
    // A token in hand: the same button, quieter.
    const one = await renderScreen(<TokenMeter member={single({ graceTokens: [token('single_cs_2')] })} buy />);
    expect(one.text()).toContain('1session token left');
    expect(one.text()).not.toContain('Used on');
    expect(one.button(`${BUY}|ava|tier|outline`)).not.toBeNull();
    await one.unmount();
  });

  test('a payment-pending single athlete gets the Pay button once single tokens are on sale', async () => {
    const pending = single({ athlete: { ...athlete, packageId: 'single', billing: { status: 'pending' } } });
    expect(pending.billing.status).toBe('pending');
    const r = await renderScreen(<TokenMeter member={pending} buy />);
    expect(r.button(`${BUY}|ava|tier|primary`)).not.toBeNull();
    expect(r.text()).not.toContain(WHEN);
    await r.unmount();
  });

  test('before the gate there is no button, only the line saying when', async () => {
    Date.now.mockReturnValue(BOOKING_OPENS_AT - 1);
    const pending = single({ athlete: { ...athlete, packageId: 'single', billing: { status: 'pending' } } });
    for (const member of [pending, spentOne()]) {
      const r = await renderScreen(<TokenMeter member={member} buy />);
      expect(r.text()).not.toContain(BUY);
      expect(r.text()).toContain(WHEN);
      await r.unmount();
    }
  });

  test('the staff view (no `buy`) never gets a button or the line; a failing card is fixed in Stripe', async () => {
    const staff = await renderScreen(<TokenMeter member={spentOne()} showPrices />);
    expect(staff.text()).toContain('Used on Fri, Nov 20 · 4:00 PM - Training block');
    expect(staff.text()).not.toContain(BUY);
    expect(staff.text()).not.toContain(WHEN);
    await staff.unmount();
    const pastDue = single({ athlete: { ...athlete, packageId: 'single', billing: { status: 'past_due' } } });
    const r = await renderScreen(<TokenMeter member={pastDue} buy />);
    expect(r.text()).not.toContain(BUY);
    await r.unmount();
  });

  test('an attended session is history: listed in the evidence, not in the hero', async () => {
    const member = single({ bookings: [booking('b1', { status: 'attended', chargedFrom: 'grace', graceTokenId: 'single_cs_1' })], graceTokens: [token('single_cs_1')] });
    const r = await renderScreen(<TokenMeter member={member} defaultOpen />);
    expect(r.text()).not.toContain('Used on');
    expect(r.text()).toContain('Fri, Nov 20 · 4:00 PM');
    expect(r.text()).toContain('Session token'); // the row's badge
    await r.unmount();
  });

  test('uses from every period, when the hub supplies them, and what is booked past this period', async () => {
    const dec = booking('b2', { periodKey: '2026-12-01', date: '2026-12-04', chargedFrom: 'grace', graceTokenId: 'single_cs_2' });
    const member = single({ bookings: [dec], graceTokens: [token('single_cs_2')] });
    // The hub lists the bought-token rows of this period and the next (hubMemberFor
    // singleUses), so a December booking is named in November; the evidence counts it too.
    const r = await renderScreen(<TokenMeter member={member} defaultOpen />);
    expect(r.text()).toContain('Used on Fri, Dec 4 - Training block');
    expect(r.text()).toContain(`From ${longDayLabel('2026-12-01')}: 1 booked`);
    expect(r.text()).not.toContain('Next period from');
    await r.unmount();
    // Without that list, this period's rows alone cannot name a December booking.
    const { singleUses, ...thisPeriodOnly } = member;
    expect(singleUses.map((u) => u.id)).toEqual(['b2']);
    const bare = await renderScreen(<TokenMeter member={thisPeriodOnly} />);
    expect(bare.text()).not.toContain('Used on');
    await bare.unmount();
    const withUses = { ...member, singleUses: [{ id: 'b2', date: '2026-12-04', time: '10:30 AM', label: 'Tour event', status: 'confirmed' }] };
    const all = await renderScreen(<TokenMeter member={withUses} />);
    expect(all.text()).toContain('Used on Fri, Dec 4 · 10:30 AM - Tour event');
    await all.unmount();
  });

  test('a monthly athlete never gets the single Buy button', async () => {
    const T12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');
    const r = await renderScreen(<TokenMeter member={hubMemberFor({ athlete, pkg: T12, anchorDay: 1, today, bookings: [], graceTokens: [] })} buy />);
    expect(r.text()).not.toContain(BUY);
    expect(r.text()).not.toContain(WHEN);
    await r.unmount();
  });
});
