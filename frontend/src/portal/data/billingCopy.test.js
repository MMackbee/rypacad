import {
  billingBadge,
  confirmedLine,
  FACILITY_PENDING_TITLE,
  FACILITY_WAITING_LINE,
  facilityCardState,
  facilityLine,
  facilityPayLabel,
  facilityRequestState,
  facilityRowTitle,
  firstPeriodLine,
  loginStatusLine,
  PAY_TO_START,
  PENDING_PLAN_LINE,
  PENDING_TITLE,
  SINGLE_PLAN_LINE,
  tokenStartLabel,
} from './billingCopy';

test('a balance that cannot be spent yet (tester report 2026-09-30)', () => {
  expect(PAY_TO_START).toBe('Pay to start');
  expect(tokenStartLabel({ left: 16, startsOn: '2026-11-01', unpaid: false })).toBe('Tokens start Nov 1');
  // Unpaid outranks the season start.
  expect(tokenStartLabel({ left: 16, startsOn: '2026-11-01', unpaid: true })).toBe('Pay to start');
  expect(tokenStartLabel({ left: 3, startsOn: null, unpaid: true })).toBe('Pay to start');
  // In season and paid, or no marks at all (seed payloads): the number stands.
  expect(tokenStartLabel({ left: 3, startsOn: null, unpaid: false })).toBeNull();
  expect(tokenStartLabel({ left: 3 })).toBeNull();
  expect(tokenStartLabel({ unlimited: true, startsOn: '2026-11-01', unpaid: true })).toBeNull();
  expect(tokenStartLabel(null)).toBeNull();
  expect(firstPeriodLine({ start: '2026-11-01', end: '2026-11-30' }, 16)).toBe('First period: November (Nov 1 - Nov 30) - 16 tokens');
  expect(firstPeriodLine({ start: '2026-11-01', end: '2026-11-30' }, 1)).toBe('First period: November (Nov 1 - Nov 30) - 1 token');
  expect(firstPeriodLine({ start: '2026-11-01', end: '2026-11-30' }, null)).toBe('First period: November (Nov 1 - Nov 30) - unlimited');
});

test('section 9 strings', () => {
  expect(PENDING_TITLE).toBe('Payment pending - finish checkout to start booking');
  expect(PENDING_PLAN_LINE).toBe("Billed monthly from the 1st once you've paid");
  expect(SINGLE_PLAN_LINE).toBe('One-time $65 per session token');
  expect(confirmedLine(false)).toBe('Payment received - booking opens Sat, Oct 10 at 7 AM.');
  expect(confirmedLine(true)).toBe("Payment received - you're all set to book.");
});

test('badges: pending is yellow, absent is none', () => {
  expect(billingBadge('pending')).toEqual({ tone: 'yellow', label: 'Payment pending' });
  expect(billingBadge('lapsed')).toEqual({ tone: 'red', label: 'Lapsed' });
  expect(billingBadge(undefined)).toBeNull();
  expect(billingBadge('active')).toBeNull();
});

test('facility add-on card state (spec 4.5)', () => {
  const m = (over) => ({ package: { kind: 'tokens' }, billing: { status: 'active', facility: null }, facilityAccess: false, ...over });
  expect(facilityCardState(m({ package: { kind: 'elite' } }))).toBeNull();
  expect(facilityCardState(m({ billing: { status: 'pending', facility: null } }))).toBeNull();
  expect(facilityCardState(m({ billing: undefined }))).toBe('offer'); // absent billing == active
  expect(facilityCardState(m())).toBe('offer');
  expect(facilityCardState(m({ billing: { status: 'active', facility: 'active' } }))).toBe('paid-waiver-pending');
  expect(facilityCardState(m({ billing: { status: 'active', facility: 'active' }, facilityAccessConsent: true }))).toBe('active');
  expect(facilityCardState(m({ facilityAccess: true }))).toBe('active'); // ops-granted, no add-on subscription
  expect(facilityCardState(m({ billing: { status: 'active', facility: 'lapsed' } }))).toBe('lapsed');
  expect(facilityLine('paid-waiver-pending')).toBe('Facility access: paid - waiver pending');
  expect(facilityLine('active')).toBe('Facility access: active');
  expect(facilityLine('offer')).toBeNull();
});

test('the facility add-on asked for at sign-up, on the home pending card (owner 2026-09-30)', () => {
  const m = (over) => ({ facilityRequested: true, package: { kind: 'tokens' }, billing: { status: 'active', facility: null }, facilityAccess: false, ...over });
  expect(facilityRequestState(m())).toBe('pay');
  expect(facilityRequestState(m({ billing: undefined }))).toBe('pay'); // absent billing == active
  expect(facilityRequestState(m({ billing: { status: 'pending', facility: null } }))).toBe('waiting');
  // A checkout started but not completed, or a lapsed add-on, can pay again (checkout.js refuses only active/past_due).
  expect(facilityRequestState(m({ billing: { status: 'active', facility: 'pending' } }))).toBe('pay');
  expect(facilityRequestState(m({ billing: { status: 'active', facility: 'lapsed' } }))).toBe('pay');
  for (const gone of [
    m({ facilityRequested: false }),
    m({ facilityRequested: undefined }),
    m({ billing: { status: 'active', facility: 'active' } }),
    m({ billing: { status: 'active', facility: 'past_due' } }),
    m({ facilityAccess: true }), // ops switched it on
    m({ package: { kind: 'elite' } }), // switched to Elite after sign-up: included
    m({ package: { kind: 'single' } }),
    m({ package: null }),
    m({ billing: { status: 'past_due', facility: null } }),
    m({ billing: { status: 'lapsed', facility: null } }),
    null,
  ]) {
    expect(facilityRequestState(gone)).toBeNull();
  }
  expect(FACILITY_PENDING_TITLE).toBe("Facility access - pay when you're ready");
  expect(FACILITY_WAITING_LINE).toBe('Facility access · after the membership is paid');
  expect(facilityRowTitle('Jordan Whitfield')).toBe('Facility access for Jordan Whitfield');
  expect(facilityPayLabel('Jordan Whitfield')).toBe("Pay $300 for Jordan's facility access");
  expect(facilityPayLabel('')).toBe("Pay $300 for your athlete's facility access");
});

test('login status line (spec 3.2)', () => {
  expect(loginStatusLine({ loginEmail: null })).toBe('Login: none');
  expect(loginStatusLine({ loginEmail: 'kid@email.com', login: { state: 'invited' } })).toBe('Login: not claimed (kid@email.com)');
  expect(loginStatusLine({ loginEmail: 'kid@email.com', login: { state: 'claimed', claimedAt: '2026-10-02T14:00' } })).toMatch(/^Login: claimed .*Oct/);
});
