import React, { act } from 'react';
import { renderScreen } from './testRender';
import ParentDashboard from './ParentDashboard';

let mockHub; let mockConfirm;
const mockChange = jest.fn(async (athleteId, packageId) => ({ athleteId, packageId }));
jest.mock('../hooks/packageChange', () => ({ useChangePackage: () => ({ change: mockChange }) }));
let mockTokens = {};
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, label }) => <button type="button">{label}|{athleteId}</button> }));
jest.mock('../hooks/billing', () => ({
  __esModule: true,
  default: () => mockHub,
  useBillingHub: () => mockHub,
  usePaymentConfirmation: (id) => (id ? mockConfirm : { state: 'idle', billingStatus: null }),
  STRIPE_PORTAL_URL: null,
}));
// The real useHousehold composes ageLine without the contract part while the contract is hidden; the mock does the same.
jest.mock('../hooks', () => ({
  useHousehold: () => ({ loading: false, error: null, data: { name: 'Whitfield family', date: 'Thu, Oct 1', children: [
    { id: 'a1', name: 'Jordan', ageLine: jest.requireActual('../data/contractFlag').hideContractParts('Age 14 · 45 min tier'), standing: { tone: 'green', label: 'On track' }, next: null, contract: 92, packageId: 't-12', tokens: mockTokens.a1 ?? null, loginEmail: 'jordan@email.com', login: { state: 'invited', claimedAt: null } },
    { id: 'a2', name: 'Reese', ageLine: 'Age 12', standing: { tone: 'neutral', label: 'New', dashed: true }, next: null, contract: null, packageId: 't-6', tokens: mockTokens.a2 ?? null },
  ], billing: { status: 'ok' } } }),
  // No useMembership mock on purpose (perf wave B): the household's Stripe
  // standing now comes off the hub, and a stray second fetch would crash here.
}));

// The contract standing ("On track") shows with the contract ON; the last describe covers it hidden.
afterEach(() => { delete process.env.REACT_APP_CONTRACT_ENABLED; });
beforeEach(() => {
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  mockTokens = {};
  mockConfirm = { state: 'confirming', billingStatus: 'pending' };
  mockHub = { loading: false, error: null, data: {
    household: { id: 'h1' }, portalUrl: null,
    members: [
      { athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens' }, billing: { status: 'active', facility: null } },
      { athleteId: 'a2', name: 'Reese', package: { kind: 'tokens' }, billing: { status: 'pending', facility: null } },
    ],
    status: { status: 'pending', tone: 'yellow', badge: { tone: 'yellow', label: 'Payment pending' }, title: 'Payment pending - finish checkout to start booking',
      body: "Reese can book once checkout is complete (token packages from Sat, Oct 10 at 7 AM). Billed monthly on the 1st once you've paid.", cta: 'Pay now', paused: false, pendingAthletes: [{ athleteId: 'a2', name: 'Reese' }] },
  } };
});

test('pending banner with one Pay now per unpaid athlete; the unpaid card is badged', async () => {
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain('Payment pending - finish checkout to start booking');
  expect(r.button('Pay now|a2')).not.toBeNull();
  expect(r.button('Pay now|a1')).toBeNull();
  expect(r.text()).toContain('Payment pending');
  expect(r.text()).toContain('On track');
  // D9: liveChildCard's login field -> the card's login line; Reese has no
  // loginEmail key (legacy shape), so no line at all - not even "Login: none".
  expect(r.text()).toContain('Login: not claimed (jordan@email.com)');
  expect(r.text()).not.toContain('Login: none');
  await r.unmount();
});

test('sibling discount: one line on the pending card when two members are monthly, Pay now unchanged (owner 2026-09-30)', async () => {
  const NOTE = '20% sibling discount comes off at checkout.';
  const withPackages = (ids, pending = mockHub.data.status.pendingAthletes) => ({ ...mockHub, data: { ...mockHub.data,
    members: mockHub.data.members.map((m, i) => ({ ...m, package: ids[i] ? { id: ids[i], kind: ids[i] === 'single' ? 'single' : 'tokens' } : null })),
    status: { ...mockHub.data.status, pendingAthletes: pending } } });
  mockHub = withPackages(['t-12', 't-6']);
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain(NOTE);
  expect(r.button('Pay now|a2')).not.toBeNull();
  await r.unmount();
  // Jordan (paid) on the single token: only one membership in the family.
  mockHub = withPackages(['single', 't-6']);
  const one = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(one.text()).not.toContain('sibling');
  await one.unmount();
  // Two paid memberships, and the only checkout left is Reese's one-time
  // single token: not a membership, so no discount on it.
  mockHub = withPackages(['t-12', 'single'], [{ athleteId: 'a2', name: 'Reese', perPurchase: true }]);
  mockHub.data.members.push({ athleteId: 'a3', name: 'Sam', package: { id: 't-6', kind: 'tokens' }, billing: { status: 'active', facility: null } });
  const single = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(single.button('Pay now|a2')).not.toBeNull();
  expect(single.text()).not.toContain('sibling');
  await single.unmount();
});

test('card tokens: "Tokens start Nov 1" before the season, "Pay to start" unpaid - never a balance (tester report 2026-09-30)', async () => {
  const t = (over) => ({ granted: 16, used: 0, reserved: 0, left: 16, unlimited: false, grace: [], startsOn: '2026-11-01', unpaid: false, ...over });
  mockTokens = { a1: t(), a2: t({ unpaid: true }) };
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain('Tokens start Nov 1');
  expect(r.text()).toContain('Pay to start');
  expect(r.text()).not.toMatch(/\d+ tokens? left/);
  await r.unmount();
  // From Nov 1, paid: the balance is back; Elite is unaffected.
  mockTokens = { a1: t({ startsOn: null, left: 13 }), a2: { unlimited: true, granted: null, left: null, grace: [] } };
  const n = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(n.text()).toContain('13 tokens left');
  expect(n.text()).toContain('Elite · unlimited');
  expect(n.text()).not.toContain('Tokens start');
  await n.unmount();
});

// Tester Mike 2026-09-30: no talk of tokens for Elite members.
test("an Elite child's card says Package, and booking for them shows no token line; a token child keeps both", async () => {
  mockHub.data.members[1] = { ...mockHub.data.members[1], billing: { status: 'active', facility: null } };
  mockHub.data.status = { status: 'active', tone: 'default', badge: { tone: 'green', label: 'Active' }, title: 'Membership active', body: '', cta: null, paused: false, pendingAthletes: [] };
  mockTokens = {
    a1: { granted: 12, used: 2, reserved: 0, left: 10, unlimited: false, grace: [], startsOn: null, unpaid: false },
    a2: { unlimited: true, granted: null, left: null, grace: [] },
  };
  const TOKEN_LINE = "Every session spends one token from this athlete's period.";
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain('Tokens');
  expect(r.text()).toContain('Package');
  expect(r.text()).toContain('Elite · unlimited');
  // Each card's own "Book a session", in household order: Jordan, then Reese.
  const bookButtons = () => [...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Book a session');
  await act(async () => { bookButtons()[0].click(); });
  expect(r.text()).toContain('Book for Jordan');
  expect(r.text()).toContain(TOKEN_LINE);
  await act(async () => { r.container.querySelector('div[style*="position: absolute"]').click(); });
  expect(r.text()).not.toContain('Book for Jordan');
  await act(async () => { bookButtons()[1].click(); });
  expect(r.text()).toContain('Book for Reese');
  expect(r.text()).not.toContain(TOKEN_LINE);
  await r.unmount();
});

test('a past_due household membership on the hub shows the payment banner and ON HOLD cards', async () => {
  mockHub = { loading: false, error: null, data: {
    household: { id: 'h1', membership: { status: 'past_due' } }, portalUrl: null,
    members: [
      { athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens' }, billing: { status: 'active', facility: null } },
      { athleteId: 'a2', name: 'Reese', package: { kind: 'tokens' }, billing: { status: 'active', facility: null } },
    ],
    status: null,
  } };
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain("Payment didn't go through");
  expect(r.text()).toContain('On hold');
  expect(r.text()).not.toContain('On track');
  await r.unmount();
});

test('?paid= shows the confirming state, then payment received', async () => {
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a2&cs=cs_1' });
  expect(r.text()).toContain('Confirming your payment...');
  await r.unmount();
  mockConfirm = { state: 'confirmed', billingStatus: 'active' };
  const c = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a2' });
  expect(c.text()).toMatch(/Payment received - /);
  await c.unmount();
});

describe("What's next under Payment received (owner decision 2026-09-30)", () => {
  let clock;
  beforeEach(() => { clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T18:00:00Z')); });
  afterEach(() => clock.mockRestore());

  test('token package: opens Oct 10, sessions Nov 3, the unclaimed login - no season link for a parent', async () => {
    mockConfirm = { state: 'confirmed', billingStatus: 'active', packageId: 't-12' };
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1&cs=cs_1' });
    const text = r.text();
    expect(text).toContain("What's next");
    expect(text.indexOf('Payment received')).toBeLessThan(text.indexOf("What's next"));
    expect(text).toContain('Booking opens Sat, Oct 10 at 7 AM - book any training block, Tour event or Phil session then.');
    expect(text).toContain('Sessions start Tue, Nov 3.');
    expect(text).toContain(`Jordan can sign in at ${window.location.host}/portal/signin with jordan@email.com.`);
    expect(text).not.toContain('See the season calendar');
    expect(text).not.toMatch(/we emailed|we'll email|check your email/i);
    await r.unmount();
  });

  test('Elite: book now, and the button opens the book-for-kid chooser for that athlete', async () => {
    mockConfirm = { state: 'confirmed', billingStatus: 'active', packageId: 'elite' };
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a2' });
    // Date.now() is pinned to Oct 5 above: the window counts from Nov 1.
    expect(r.text()).toContain('Reese can book now - training, Tour events and Phil, through Wed, Dec 16.');
    expect(r.text()).not.toContain('sign in at');
    expect(r.text()).not.toContain('Book for Reese');
    await r.click("Book Reese's first session");
    expect(r.text()).toContain('Book for Reese');
    await r.unmount();
  });

  test('no card while confirming, and none for a facility add-on payment', async () => {
    mockConfirm = { state: 'confirming', billingStatus: 'pending', packageId: null };
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1' });
    expect(r.text()).not.toContain("What's next");
    await r.unmount();
    mockConfirm = { state: 'confirmed', billingStatus: 'active', packageId: 't-12' };
    const f = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1&product=facility&cs=cs_2' });
    expect(f.text()).toMatch(/Payment received - /);
    expect(f.text()).not.toContain("What's next");
    await f.unmount();
  });
});

test('a never-paid athlete can change package from the pending card before Pay now (tester S4); a lapsed one cannot', async () => {
  mockHub.data.status.pendingAthletes = [
    { athleteId: 'a2', name: 'Reese', status: 'pending', packageId: 'elite', perPurchase: false },
    { athleteId: 'a3', name: 'Nico', status: 'pending', packageId: 't-6', perPurchase: false },
    { athleteId: 'a1', name: 'Jordan', status: 'lapsed', packageId: 't-12', perPurchase: false },
  ];
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain('ReeseElite · Change package');
  expect(r.text()).toContain('Nico6 tokens · Change package');
  expect(r.text()).not.toContain('12 tokens · Change package');
  expect(r.text()).not.toContain("Change Reese's package");
  // Two unpaid children: two links a screen reader tells apart by name.
  expect(r.button('Change package for Reese')).not.toBeNull();
  expect(r.button('Change package for Jordan')).toBeNull();
  await r.click('Change package for Nico');
  expect(r.text()).toContain("Change Nico's package");
  expect(r.text()).not.toContain("Change Reese's package");
  await r.click('16 tokens');
  await r.click('Save package');
  expect(mockChange).toHaveBeenCalledWith('a3', 't-16');
  expect(r.text()).not.toContain("Change Nico's package");
  await r.unmount();
});

describe('Commitment Contract hidden (owner ruling 2026-09-30)', () => {
  const contractRow = (r) => [...r.container.querySelectorAll('div')].find((d) => d.textContent === 'Contract');

  test('on: the Contract row, its percentage, the standing and the tier', async () => {
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    expect(contractRow(r)).toBeTruthy();
    expect(r.text()).toContain('92%');
    expect(r.text()).toContain('On track');
    expect(r.text()).toContain('Age 14 · 45 min tier');
    await r.unmount();
  });

  test('off: no Contract row, no percentage, no contract standing, no tier; billing badges stay', async () => {
    delete process.env.REACT_APP_CONTRACT_ENABLED;
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    expect(contractRow(r)).toBeUndefined();
    expect(r.text()).not.toContain('92%');
    expect(r.text()).not.toContain('On track');
    expect(r.text()).not.toContain('min tier');
    expect(r.text()).toContain('Age 14');
    expect(r.text()).toContain('Payment pending');
    await r.unmount();
  });
});

describe('the family facility add-on ticked at sign-up (owner request, Mike 2026-09-30; one per family, owner ruling 2026-09-30)', () => {
  const WAITING = 'Family facility access · after the membership is paid';
  const JORDAN_PAY = 'Pay $300 for family facility access|a1';
  beforeEach(() => {
    mockHub.data.facilityPending = [{ athleteId: 'a1', name: 'Jordan', state: 'pay' }];
  });

  test('billed on a paid membership: ONE family row and button, under the other athlete\'s Pay now', async () => {
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    expect(r.button(JORDAN_PAY)).not.toBeNull();
    expect(r.button('Pay now|a2')).not.toBeNull();
    expect(r.text()).not.toContain(WAITING);
    expect([...r.container.querySelectorAll('button')].filter((b) => /facility/i.test(b.textContent))).toHaveLength(1);
    await r.unmount();
  });

  test('billed on a membership still to pay: a line under that Pay now, no add-on button', async () => {
    mockHub.data.facilityPending = [{ athleteId: 'a2', name: 'Reese', state: 'waiting' }];
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    expect(r.button('Pay now|a2').parentElement.textContent).toContain(WAITING);
    expect([...r.container.querySelectorAll('button')].filter((b) => /facility/i.test(b.textContent))).toHaveLength(0);
    await r.unmount();
  });

  test('with every membership paid, the card stays for the add-on alone, under its own title', async () => {
    mockHub.data.status = { status: 'active', title: 'Tokens start Sun, Nov 1', body: 'Billed monthly on the 1st. Nothing needs attention.' };
    mockHub.data.facilityPending = [{ athleteId: 'a1', name: 'Jordan', state: 'pay' }];
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
    expect(r.text()).toContain("Family facility access - pay when you're ready");
    expect(r.button(JORDAN_PAY)).not.toBeNull();
    expect(r.text()).not.toContain('Payment pending - finish checkout');
    expect(r.button('Pay now|a2')).toBeNull();
    await r.unmount();
  });

  test('back from the add-on checkout: no second add-on button while it confirms; the membership row stays', async () => {
    mockConfirm = { state: 'confirming', billingStatus: 'active', packageId: null };
    const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1&product=facility&cs=cs_3' });
    expect(r.button(JORDAN_PAY)).toBeNull();
    expect(r.button('Pay now|a2')).not.toBeNull();
    await r.unmount();
    // Paid from Billing on another athlete while the request waits on Reese: the family's one add-on is confirming all the same.
    mockHub.data.facilityPending = [{ athleteId: 'a2', name: 'Reese', state: 'waiting' }];
    const other = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1&product=facility&cs=cs_3' });
    expect(other.text()).not.toContain(WAITING);
    await other.unmount();
  });

  test("back from a membership checkout: What's next points at the add-on, and its row is right there", async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T18:00:00Z'));
    try {
      mockConfirm = { state: 'confirmed', billingStatus: 'active', packageId: 't-12' };
      const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1&cs=cs_4' });
      expect(r.text()).toContain("What's next");
      expect(r.text()).toContain("Family facility access: pay from your family page whenever you're ready.");
      expect(r.button(JORDAN_PAY)).not.toBeNull();
      await r.unmount();
      // Another athlete's membership just paid while the add-on is payable: the same one line.
      const sibling = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a2&cs=cs_4' });
      expect(sibling.text().split("Family facility access: pay from your family page whenever you're ready.")).toHaveLength(2);
      await sibling.unmount();
      // The add-on waits on a membership that is not the one just paid: not payable yet, so no line.
      mockHub.data.facilityPending = [{ athleteId: 'a2', name: 'Reese', state: 'waiting' }];
      const waiting = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1&cs=cs_4' });
      expect(waiting.text()).not.toContain('pay from your family page');
      await waiting.unmount();
      mockHub.data.facilityPending = [];
      const none = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a1&cs=cs_4' });
      expect(none.text()).toContain("What's next");
      expect(none.text()).not.toMatch(/facility access/i);
      await none.unmount();
    } finally {
      clock.mockRestore();
    }
  });
});
