import { billingBadge, billingStatusOf, confirmedLine, facilityCardState, facilityLine, loginStatusLine, PENDING_PLAN_LINE, PENDING_TITLE, SINGLE_PLAN_LINE } from './billingCopy';

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

test('facility add-on: never on the single token or a one-time buyer (owner ruling 2026-09-29/30)', () => {
  const m = (over) => ({ package: { kind: 'tokens' }, billing: { status: 'active', facility: null }, facilityAccess: false, ...over });
  expect(facilityCardState(m({ package: { kind: 'single' } }))).toBeNull();
  expect(facilityCardState(m({ billing: { status: 'active', oneTime: true, facility: null } }))).toBeNull();
  expect(facilityCardState(m({ billing: { status: 'active', oneTime: false, facility: null } }))).toBe('offer');
});

test('billingStatusOf: a one-time buyer moved off Single is pending (owner ruling 2026-09-29/30)', () => {
  expect(billingStatusOf({ packageId: 't-6', billing: { status: 'active', oneTime: true } })).toBe('pending');
  expect(billingStatusOf({ packageId: 'elite', billing: { status: 'active', oneTime: true } })).toBe('pending');
  expect(billingStatusOf({ packageId: 'single', billing: { status: 'active', oneTime: true } })).toBe('active');
  expect(billingStatusOf({ packageId: 't-6', billing: { status: 'active', oneTime: false } })).toBe('active');
  expect(billingStatusOf({ packageId: 't-6', billing: { status: 'active' } })).toBe('active');
  expect(billingStatusOf({ packageId: 't-6', billing: { status: 'lapsed', oneTime: true } })).toBe('lapsed');
  expect(billingStatusOf({ packageId: 't-6' })).toBe('active'); // no billing block == active
  expect(billingStatusOf({ packageId: 'single' })).toBe('active');
  expect(billingStatusOf(null)).toBe('active');
  expect(billingStatusOf(undefined)).toBe('active');
});

test('login status line (spec 3.2)', () => {
  expect(loginStatusLine({ loginEmail: null })).toBe('Login: none');
  expect(loginStatusLine({ loginEmail: 'kid@email.com', login: { state: 'invited' } })).toBe('Login: not claimed (kid@email.com)');
  expect(loginStatusLine({ loginEmail: 'kid@email.com', login: { state: 'claimed', claimedAt: '2026-10-02T14:00' } })).toMatch(/^Login: claimed .*Oct/);
});
