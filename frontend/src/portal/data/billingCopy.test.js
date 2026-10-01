import {
  billingBadge,
  confirmedLine,
  FACILITY_COVERS,
  facilityLine,
  facilityName,
  facilityOfferLabel,
  facilityPayLabel,
  facilityPendingTitle,
  facilityRequestState,
  facilityStillBilledLine,
  facilityWaitingLine,
  familyFacilityCard,
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

describe('the ONE family facility card (owner ruling 2026-09-30)', () => {
  const m = (id, over) => ({ athleteId: id, name: id, package: { kind: 'tokens' }, billing: { status: 'active', facility: null }, facilityAccess: false, ...over });
  const state = (...members) => familyFacilityCard(members)?.state ?? null;

  test('one athlete: the states the per-athlete card had (spec 4.5)', () => {
    expect(familyFacilityCard([m('a', { billing: { status: 'pending', facility: null } })])).toBeNull();
    expect(state(m('a', { billing: undefined }))).toBe('offer'); // absent billing == active
    expect(state(m('a'))).toBe('offer');
    expect(state(m('a', { billing: { status: 'active', facility: 'active' } }))).toBe('paid-waiver-pending');
    expect(state(m('a', { billing: { status: 'active', facility: 'active' }, facilityAccessConsent: true }))).toBe('active');
    expect(state(m('a', { facilityAccess: true }))).toBe('active'); // ops-granted, no add-on subscription
    expect(state(m('a', { billing: { status: 'active', facility: 'past_due' } }))).toBe('past_due');
    // An add-on that ended can be bought again; the card says it lapsed.
    expect(familyFacilityCard([m('a', { billing: { status: 'active', facility: 'lapsed' } })])).toMatchObject({ state: 'offer', lapsed: true });
    expect(familyFacilityCard([m('a')]).lapsed).toBe(false);
    for (const none of [[], null, undefined, [m('s', { package: { kind: 'single' } })], [m('n', { package: null })]]) expect(familyFacilityCard(none)).toBeNull();
  });

  test('Elite covers the family: no offer, whoever else is in it', () => {
    const elite = m('e', { package: { kind: 'elite' } });
    expect(familyFacilityCard([m('a'), elite])).toEqual({ state: 'elite', holder: null, lapsed: false });
    expect(state(elite)).toBe('elite');
    expect(state(m('e', { package: { kind: 'elite' }, billing: { status: 'past_due', facility: null } }), m('a'))).toBe('elite');
    // Elite still to pay (review 2026-09-30): no offer - the family would end up paying for both once Elite is paid.
    const due = m('e', { package: { kind: 'elite' }, billing: { status: 'pending', facility: null } });
    expect(familyFacilityCard([due, m('a')])).toBeNull();
    expect(familyFacilityCard([due])).toBeNull();
    // An add-on the family already pays for still shows its state.
    expect(state(due, m('a', { billing: { status: 'active', facility: 'past_due' } }))).toBe('past_due');
    // Elite that ended covers nobody and blocks nothing: the paid token athlete is offered the add-on.
    expect(state(m('e', { package: { kind: 'elite' }, billing: { status: 'lapsed', facility: null } }), m('a'))).toBe('offer');
  });

  test('Elite and a live add-on together: the card names the add-on the family is still billed for (review 2026-09-30)', () => {
    const elite = m('e', { package: { kind: 'elite' } });
    const paying = m('a', { billing: { status: 'active', facility: 'active' } });
    expect(familyFacilityCard([paying, elite])).toEqual({ state: 'elite', holder: paying, lapsed: false });
    expect(familyFacilityCard([elite, m('a', { billing: { status: 'active', facility: 'past_due' } })]).holder.athleteId).toBe('a');
    // The add-on's own athlete moved to Elite: still billed, on that athlete.
    expect(familyFacilityCard([m('e', { package: { kind: 'elite' }, billing: { status: 'active', facility: 'active' } })]).holder.athleteId).toBe('e');
    // Access the academy switched on by hand has no subscription behind it, and an add-on that ended bills nothing.
    expect(familyFacilityCard([m('a', { facilityAccess: true }), elite]).holder).toBeNull();
    expect(familyFacilityCard([m('a', { billing: { status: 'active', facility: 'lapsed' } }), elite]).holder).toBeNull();
    expect(facilityStillBilledLine()).toBe('You are still paying for the family add-on. Elite includes it - ask the academy to cancel the add-on.');
    expect(facilityStillBilledLine(true)).toBe('You are still paying for the facility add-on. Elite includes it - ask the academy to cancel the add-on.');
    expect(facilityStillBilledLine(false, true)).toBe('This family is still paying for the family add-on. Elite includes it - cancel the add-on in Stripe.');
  });

  test('one add-on covers the family: its state is read off the athlete it bills on', () => {
    const holder = m('b', { billing: { status: 'active', facility: 'active' }, facilityAccessConsent: true });
    expect(familyFacilityCard([m('a'), holder, m('c')])).toEqual({ state: 'active', holder, lapsed: false });
    expect(state(m('a', { facilityAccessConsent: true }), m('b', { billing: { status: 'active', facility: 'active' } }))).toBe('paid-waiver-pending');
    expect(state(m('a'), m('b', { billing: { status: 'past_due', facility: 'past_due' } }))).toBe('past_due');
  });

  test('the offer is made once, for the first paid 6, 12 or 16 token athlete', () => {
    const unpaid = m('a', { billing: { status: 'pending', facility: null } });
    expect(familyFacilityCard([unpaid, m('b'), m('c')])).toMatchObject({ state: 'offer', holder: { athleteId: 'b' } });
    expect(familyFacilityCard([m('s', { package: { kind: 'single' } }), m('b')]).holder.athleteId).toBe('b');
    // The athlete who asked at sign-up holds it once paid, so the home pending card and Billing open one checkout.
    expect(familyFacilityCard([m('a'), m('b', { facilityRequested: true })]).holder.athleteId).toBe('b');
    // The one who asked is still unpaid (review 2026-09-30): the home pending card names that athlete, so no second
    // offer on a sibling - the add-on is bought from one place. An older sign-up with a paid asker too keeps the offer.
    const waiting = m('b', { facilityRequested: true, billing: { status: 'pending', facility: null } });
    expect(familyFacilityCard([m('a'), waiting])).toBeNull();
    expect(familyFacilityCard([m('a'), waiting, m('c', { facilityRequested: true })]).holder.athleteId).toBe('c');
    // A request that no longer counts (the single token, a lapsed membership) holds nothing back.
    expect(familyFacilityCard([m('a'), m('s', { facilityRequested: true, package: { kind: 'single' }, billing: { status: 'pending', facility: null } })]).holder.athleteId).toBe('a');
    expect(familyFacilityCard([m('a'), m('b', { facilityRequested: true, billing: { status: 'lapsed', facility: null } })]).holder.athleteId).toBe('a');
    // Nobody paid yet, or the only paid membership is past due: no card.
    expect(familyFacilityCard([unpaid])).toBeNull();
    expect(familyFacilityCard([m('a', { billing: { status: 'past_due', facility: null } })])).toBeNull();
  });

  test('the lines: family wording, and without "family" for the adult who is their own household', () => {
    expect(facilityName()).toBe('Family facility access');
    expect(facilityName(true)).toBe('Facility access');
    expect(facilityLine('elite')).toBe('Included with Elite for your family');
    expect(facilityLine('elite', true)).toBe('Included with Elite');
    expect(facilityLine('paid-waiver-pending')).toBe('Family facility access: paid - waiver pending');
    expect(facilityLine('active')).toBe('Family facility access: active');
    expect(facilityLine('past_due')).toBe('Family facility access: payment past due');
    expect(facilityLine('lapsed')).toBe('Family facility access: lapsed');
    expect(facilityLine('active', true)).toBe('Facility access: active');
    expect(facilityLine('offer')).toBeNull();
    expect(facilityOfferLabel()).toBe('Add family facility access · $300/month');
    expect(facilityOfferLabel(true)).toBe('Add facility access · $300/month');
    expect(FACILITY_COVERS).toBe('One add-on covers every athlete in your household, and a parent or guardian may come along.');
  });
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
  // One family row, never one per child: nothing names an athlete.
  expect(facilityPendingTitle()).toBe("Family facility access - pay when you're ready");
  expect(facilityWaitingLine()).toBe('Family facility access · after the membership is paid');
  expect(facilityPayLabel()).toBe('Pay $300 for family facility access');
  expect(facilityPendingTitle(true)).toBe("Facility access - pay when you're ready");
  expect(facilityWaitingLine(true)).toBe('Facility access · after the membership is paid');
  expect(facilityPayLabel(true)).toBe('Pay $300 for facility access');
});

test('login status line (spec 3.2)', () => {
  expect(loginStatusLine({ loginEmail: null })).toBe('Login: none');
  expect(loginStatusLine({ loginEmail: 'kid@email.com', login: { state: 'invited' } })).toBe('Login: not claimed (kid@email.com)');
  expect(loginStatusLine({ loginEmail: 'kid@email.com', login: { state: 'claimed', claimedAt: '2026-10-02T14:00' } })).toMatch(/^Login: claimed .*Oct/);
});
