import { facilitySourceLabel, householdFacility } from './facility';

// Owner ruling 2026-09-30: the facility add-on is one per family, and a live
// Elite membership covers the family. functions/portal/facility.test.js pins
// the same rule on the server.
const NONE = { access: false, source: null, holderId: null, eliteId: null, eliteDueId: null };
const doc = (id, over) => ({ id, householdId: 'h1', packageId: 't-6', billing: { status: 'active' }, ...over });
const member = (id, over) => ({ athleteId: id, name: id, package: { id: 't-6', kind: 'tokens' }, billing: { status: 'active', facility: null }, facilityAccess: false, ...over });

describe('householdFacility over athlete docs', () => {
  test('a live add-on on any athlete covers the family', () => {
    for (const status of ['active', 'past_due']) {
      expect(householdFacility([doc('a'), doc('b', { facilityBilling: { status } })])).toEqual({ ...NONE, access: true, source: 'add-on', holderId: 'b' });
    }
    for (const status of ['pending', 'lapsed', undefined]) {
      expect(householdFacility([doc('a'), doc('b', { facilityBilling: { status } })])).toEqual(NONE);
    }
    // A request or the waiver alone is never access.
    expect(householdFacility([doc('a', { facilityRequested: true, facilityAccessConsent: { byUid: 'u' } })])).toEqual(NONE);
  });

  test('a live Elite membership covers the family; absent billing is a legacy active member', () => {
    const yes = { ...NONE, access: true, source: 'elite', eliteId: 'e' };
    expect(householdFacility([doc('a'), doc('e', { packageId: 'elite' })])).toEqual(yes);
    expect(householdFacility([doc('e', { packageId: 'elite', billing: { status: 'past_due' } })])).toEqual(yes);
    expect(householdFacility([doc('e', { packageId: 'elite', billing: undefined })])).toEqual(yes);
    // Elite still to pay covers nobody yet, but is named (eliteDueId): the add-on is not sold to a family about to have it.
    expect(householdFacility([doc('a'), doc('e', { packageId: 'elite', billing: { status: 'pending' } })])).toEqual({ ...NONE, eliteDueId: 'e' });
    expect(householdFacility([doc('e', { packageId: 'elite', billing: { status: 'lapsed' } })])).toEqual(NONE);
    // Both at once: Elite is the source, the add-on's holder is still named.
    expect(householdFacility([doc('b', { facilityBilling: { status: 'active' } }), doc('e', { packageId: 'elite' })]))
      .toEqual({ ...NONE, access: true, source: 'elite', holderId: 'b', eliteId: 'e' });
  });

  test('a single-token buyer moved to Elite is still to pay: no Elite access until the Elite checkout lands', () => {
    // The stored one-time block stays { active, oneTime } until then (billingCopy.js billingStatusOf reads it as pending).
    const moved = doc('e', { packageId: 'elite', billing: { status: 'active', oneTime: true, subscriptionId: null } });
    expect(householdFacility([doc('a'), moved])).toEqual({ ...NONE, eliteDueId: 'e' });
    // Paid: the checkout clears oneTime, and Elite covers the family.
    expect(householdFacility([doc('a'), doc('e', { packageId: 'elite', billing: { status: 'active', oneTime: false, subscriptionId: 'sub_e' } })]))
      .toEqual({ ...NONE, access: true, source: 'elite', eliteId: 'e' });
    // The family's own add-on is what covers it meanwhile.
    expect(householdFacility([doc('b', { facilityBilling: { status: 'active' } }), moved]))
      .toEqual({ ...NONE, access: true, source: 'add-on', holderId: 'b', eliteDueId: 'e' });
    // On the single package the one-time block is a paid session token, nothing to do with Elite.
    expect(householdFacility([doc('s', { packageId: 'single', billing: { status: 'active', oneTime: true } })])).toEqual(NONE);
    // The hub member for the same athlete (status already 'pending', oneTime riding along) reads the same.
    expect(householdFacility([member('e', { package: { id: 'elite', kind: 'elite' }, billing: { status: 'pending', facility: null, oneTime: true } })])).toEqual({ ...NONE, eliteDueId: 'e' });
  });

  test('nothing to read is no access', () => {
    for (const empty of [[], null, undefined, [null, undefined]]) expect(householdFacility(empty)).toEqual(NONE);
  });
});

describe('householdFacility over billing-hub members', () => {
  test('reads package.kind, billing.status and billing.facility', () => {
    expect(householdFacility([member('a'), member('b')])).toEqual(NONE);
    expect(householdFacility([member('a'), member('b', { billing: { status: 'active', facility: 'active' } })]))
      .toEqual({ ...NONE, access: true, source: 'add-on', holderId: 'b' });
    expect(householdFacility([member('a', { billing: { status: 'active', facility: 'past_due' } })]).source).toBe('add-on');
    expect(householdFacility([member('a', { billing: { status: 'active', facility: 'lapsed' } })])).toEqual(NONE);
    expect(householdFacility([member('a'), member('e', { package: { id: 'elite', kind: 'elite' } })]))
      .toEqual({ ...NONE, access: true, source: 'elite', eliteId: 'e' });
    expect(householdFacility([member('e', { package: { id: 'elite', kind: 'elite' }, billing: { status: 'pending', facility: null } })])).toEqual({ ...NONE, eliteDueId: 'e' });
    expect(householdFacility([member('e', { package: { id: 'elite', kind: 'elite' }, billing: { status: 'lapsed', facility: null } })])).toEqual(NONE);
    expect(householdFacility([member('n', { package: null })])).toEqual(NONE);
  });

  test("the academy's own grant (facilityAccess on, no subscription) reads as the add-on", () => {
    expect(householdFacility([member('a'), member('b', { facilityAccess: true })])).toEqual({ ...NONE, access: true, source: 'add-on', holderId: 'b' });
    // A paying holder is named ahead of a granted one.
    expect(householdFacility([member('g', { facilityAccess: true }), member('p', { billing: { status: 'active', facility: 'active' } })]).holderId).toBe('p');
  });
});

test('facilitySourceLabel: how a per-athlete line names the family access', () => {
  expect(facilitySourceLabel(householdFacility([member('e', { package: { kind: 'elite' } })]))).toBe('Elite');
  expect(facilitySourceLabel(householdFacility([member('a', { billing: { status: 'active', facility: 'active' } })]))).toBe('family add-on');
  expect(facilitySourceLabel(householdFacility([member('a', { billing: { status: 'active', facility: 'active' } })]), true)).toBe('add-on');
  expect(facilitySourceLabel(householdFacility([member('a')]))).toBeNull();
  expect(facilitySourceLabel(null)).toBeNull();
});
