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
  const ASK = 'Ask a parent or guardian to buy a session token.';
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

  // Owner ruling 2026-10-01 ("drop one"): the hero's or the banner's Pay now is
  // that athlete's one checkout button - the meter adds no second one, and
  // never repeats the Oct 10 sentence those cards already say.
  test('a payment-pending or ended single athlete gets nothing on the meter, before the gate or after', async () => {
    for (const status of ['pending', 'lapsed']) {
      const unpaid = single({ athlete: { ...athlete, packageId: 'single', billing: { status } } });
      expect(unpaid.billing.status).toBe(status);
      for (const now of [BOOKING_OPENS_AT, BOOKING_OPENS_AT - 1]) {
        Date.now.mockReturnValue(now);
        const r = await renderScreen(<TokenMeter member={unpaid} buy />);
        expect(r.container.querySelectorAll('button')).toHaveLength(1); // the evidence toggle alone
        expect(r.text()).not.toContain(BUY);
        expect(r.text()).not.toContain(WHEN);
        expect(r.text()).not.toContain(ASK);
        await r.unmount();
      }
    }
  });

  test('before the gate a paid-up athlete has no button, only the line saying when', async () => {
    Date.now.mockReturnValue(BOOKING_OPENS_AT - 1);
    const r = await renderScreen(<TokenMeter member={spentOne()} buy />);
    expect(r.text()).not.toContain(BUY);
    expect(r.text().split(WHEN)).toHaveLength(2);
    await r.unmount();
  });

  // Owner ruling 2026-10-01 ("not unless the child is 18+"): `askGuardian` is
  // the under-18 athlete's own login.
  test('an under-18 athlete on their own login reads who buys it, never the button', async () => {
    const r = await renderScreen(<TokenMeter member={spentOne()} buy askGuardian />);
    expect(r.text().split(ASK)).toHaveLength(2);
    expect(r.text()).not.toContain(BUY);
    expect(r.container.querySelectorAll('button')).toHaveLength(1); // the evidence toggle alone
    await r.unmount();
    // Until the sale opens they read when, as everyone does.
    Date.now.mockReturnValue(BOOKING_OPENS_AT - 1);
    const early = await renderScreen(<TokenMeter member={spentOne()} buy askGuardian />);
    expect(early.text()).toContain(WHEN);
    expect(early.text()).not.toContain(ASK);
    expect(early.text()).not.toContain(BUY);
    await early.unmount();
    // The staff view (no `buy`) reads neither.
    Date.now.mockReturnValue(BOOKING_OPENS_AT);
    const staff = await renderScreen(<TokenMeter member={spentOne()} showPrices askGuardian />);
    expect(staff.text()).not.toContain(ASK);
    await staff.unmount();
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
    // Nor the under-18 line: a monthly or Elite meter is the same on a child's login.
    for (const pkg of [T12, ELITE]) {
      const child = await renderScreen(<TokenMeter member={hubMemberFor({ athlete, pkg, anchorDay: 1, today, bookings: [], graceTokens: [] })} buy askGuardian />);
      expect(child.text()).not.toContain(ASK);
      expect(child.text()).not.toContain(BUY);
      await child.unmount();
    }
  });
});

// The extra session at the member rate (owner, 2026-10-10): a paid monthly
// token member's meter carries one more session at their package's rate,
// once nothing is left to book with (a bought extra is spent before the
// month's own tokens - review 2026-10-10).
describe('a paid monthly member: an extra session at their rate', () => {
  const EXTRA = 'Buy an extra session';
  const ASK = 'Ask a parent or guardian to buy an extra session.';
  const T8 = TOKEN_PACKAGES.find((p) => p.id === 't-8');
  const LINE = '$48.63 - your 8-token rate. Good through Sat, Feb 27, 2027.';
  const PAID = { status: 'active', subscriptionId: 'sub_ava' };
  // Every token of the period booked: the meter reads 0 left.
  const spentAll = (pkg) => Array.from({ length: pkg.tokens ?? 0 }, (_, i) => booking(`b${i}`));
  const monthly = ({ pkg = T8, billing = PAID, bookings = spentAll(pkg), graceTokens = [] } = {}) =>
    hubMemberFor({ athlete: { ...athlete, packageId: pkg.id, billing }, pkg, anchorDay: 1, today, bookings, waitlist: [], graceTokens });
  const extraButtons = (r) => [...r.container.querySelectorAll('button')].map((b) => b.textContent).filter((t) => t.startsWith(EXTRA));

  beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(BOOKING_OPENS_AT); });
  afterEach(() => { jest.restoreAllMocks(); });

  test('out of tokens: the line and the primary button, starting the extra checkout', async () => {
    const hub = monthly();
    expect(hub.billing).toEqual({ status: 'active', facility: null, subscribed: true });
    const r = await renderScreen(<TokenMeter member={hub} buy />);
    expect(r.text()).toContain('0of 8 left');
    expect(r.text().split(LINE)).toHaveLength(2);
    expect(extraButtons(r)).toEqual([`${EXTRA}|ava|extra|primary`]);
    expect(r.text()).not.toContain('Buy a session token');
    await r.unmount();
  });

  test('every package names its own rate', async () => {
    const rates = { 't-4': '$54.75', 't-6': '$49.83', 't-12': '$47.42', 't-16': '$44.94' };
    for (const [id, rate] of Object.entries(rates)) {
      const pkg = TOKEN_PACKAGES.find((p) => p.id === id);
      const r = await renderScreen(<TokenMeter member={monthly({ pkg })} buy />);
      expect(r.text()).toContain(`${rate} - your ${pkg.tokens}-token rate. Good through Sat, Feb 27, 2027.`);
      expect(extraButtons(r)).toHaveLength(1);
      await r.unmount();
    }
  });

  test('nothing while a token is left to book with - a period token, a bonus, or an extra already bought', async () => {
    for (const bookings of [[], spentAll(T8).slice(1)]) {
      const r = await renderScreen(<TokenMeter member={monthly({ bookings })} buy />);
      expect(extraButtons(r)).toEqual([]);
      expect(r.text()).not.toContain(LINE);
      await r.unmount();
    }
    const bought = { id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase' };
    const bonus = await renderScreen(<TokenMeter member={monthly({ graceTokens: [bought] })} buy />);
    expect(bonus.text()).toContain('0of 8 left');
    expect(bonus.text()).toContain('Bonus 1');
    expect(bonus.text()).toContain('Session token - good through Sat, Feb 27');
    expect(extraButtons(bonus)).toEqual([]);
    await bonus.unmount();
    // ...and the under-18 line follows the button.
    const child = await renderScreen(<TokenMeter member={monthly({ bookings: [] })} buy askGuardian />);
    expect(child.text()).not.toContain(ASK);
    await child.unmount();
  });

  test('nothing while unpaid, past due, one-time, without a subscription, or before the sale', async () => {
    const blocked = [
      { status: 'pending' },
      { status: 'lapsed', subscriptionId: 'sub_ava' },
      { status: 'past_due', subscriptionId: 'sub_ava' },
      { status: 'active' },
      { status: 'active', oneTime: true, subscriptionId: 'sub_ava' },
    ];
    for (const billing of blocked) {
      const r = await renderScreen(<TokenMeter member={monthly({ billing })} buy />);
      expect(extraButtons(r)).toEqual([]);
      expect(r.text()).not.toContain(LINE);
      await r.unmount();
    }
    Date.now.mockReturnValue(BOOKING_OPENS_AT - 1);
    const early = await renderScreen(<TokenMeter member={monthly()} buy />);
    expect(extraButtons(early)).toEqual([]);
    expect(early.text()).not.toContain(LINE);
    await early.unmount();
  });

  test('nothing while the family is on hold, nor on the staff view', async () => {
    const held = await renderScreen(<TokenMeter member={monthly()} buy onHold />);
    expect(extraButtons(held)).toEqual([]);
    await held.unmount();
    const staff = await renderScreen(<TokenMeter member={monthly()} showPrices />);
    expect(extraButtons(staff)).toEqual([]);
    expect(staff.text()).not.toContain(LINE);
    await staff.unmount();
  });

  test('an under-18 athlete on their own login reads who buys it', async () => {
    const r = await renderScreen(<TokenMeter member={monthly()} buy askGuardian />);
    expect(r.text().split(ASK)).toHaveLength(2);
    expect(extraButtons(r)).toEqual([]);
    expect(r.text()).not.toContain(LINE);
    await r.unmount();
  });

  test("never on Elite or the single token's meter", async () => {
    const elite = await renderScreen(<TokenMeter member={monthly({ pkg: ELITE, bookings: [] })} buy />);
    expect(extraButtons(elite)).toEqual([]);
    expect(elite.text()).not.toMatch(/token/i);
    await elite.unmount();
    const one = await renderScreen(<TokenMeter member={monthly({ pkg: SINGLE_TOKEN, billing: { status: 'active', oneTime: true }, bookings: [] })} buy />);
    expect(extraButtons(one)).toEqual([]);
    expect(one.text()).toContain('Buy a session token - $65');
    await one.unmount();
  });
});
