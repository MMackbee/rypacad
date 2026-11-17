/**
 * Manage billing in Stripe: which buttons the payer gets (review 2026-11-17
 * F2/F3). The count mirrors functions/portal/billing-portal-customer.js: the
 * household's stripeCustomerId and stripeCustomerIds plus each athlete's own
 * customers. One customer is one button for the family; several are one
 * button per customer an athlete holds, naming its athletes.
 */
import { customerIdsOf, portalTargets, targetLabel } from './billingPortal';
import { hubMemberFor } from './billingHub';

const FAMILY = [{ athleteId: null, names: [] }];
const member = (athleteId, name, customerIds = []) => ({ athleteId, name, customerIds });

test('no Stripe customer anywhere: no button', () => {
  expect(portalTargets({ stripeCustomerId: null }, [member('a', 'Jordan Whitfield')])).toEqual([]);
  expect(portalTargets(null, [])).toEqual([]);
  expect(portalTargets(undefined, undefined)).toEqual([]);
  expect(portalTargets({ stripeCustomerId: '  ', stripeCustomerIds: ['', null, 7] }, [member('a', 'Jordan Whitfield', [''])])).toEqual([]);
});

test('one customer - on the household, or only on an athlete (a subscription linked by script, F3) - is one button for the family', () => {
  expect(portalTargets({ stripeCustomerId: 'cus_1', stripeCustomerIds: ['cus_1'] }, [member('a', 'Jordan Whitfield', ['cus_1']), member('b', 'Reese Whitfield')])).toEqual(FAMILY);
  expect(portalTargets({ stripeCustomerId: null }, [member('a', 'Jordan Whitfield', ['cus_linked'])])).toEqual(FAMILY);
  expect(portalTargets({ stripeCustomerId: null, stripeCustomerIds: ['cus_2'] }, [])).toEqual(FAMILY);
});

test("several customers (F2): one button per customer an athlete holds, naming its athletes and carrying the first one's id", () => {
  const household = { stripeCustomerId: 'cus_1', stripeCustomerIds: ['cus_1', 'cus_2'] };
  const members = [
    member('a', 'Jordan Whitfield', ['cus_1']),
    member('b', 'Reese Whitfield', ['cus_2']),
    member('c', 'Casey Whitfield', ['cus_1']),
    member('d', 'Drew Whitfield'),
  ];
  expect(portalTargets(household, members)).toEqual([
    { athleteId: 'a', names: ['Jordan Whitfield', 'Casey Whitfield'] },
    { athleteId: 'b', names: ['Reese Whitfield'] },
  ]);
});

test('several customers, none on an athlete: one family button (the server answers it in contact-the-academy words)', () => {
  expect(portalTargets({ stripeCustomerId: 'cus_1', stripeCustomerIds: ['cus_1', 'cus_2'] }, [member('a', 'Jordan Whitfield')])).toEqual(FAMILY);
});

test("an athlete's facility add-on customer counts; its button opens the membership's customer first, as the server does", () => {
  expect(portalTargets({ stripeCustomerId: 'cus_1' }, [member('a', 'Jordan Whitfield', ['cus_1', 'cus_f'])])).toEqual([
    { athleteId: 'a', names: ['Jordan Whitfield'] },
  ]);
});

test("labels: the family button keeps its words; a per-customer button names its athletes' first names", () => {
  expect(targetLabel('Manage billing in Stripe', FAMILY[0])).toBe('Manage billing in Stripe');
  expect(targetLabel('Manage billing in Stripe', { athleteId: 'a', names: ['Jordan Whitfield'] })).toBe('Manage billing in Stripe for Jordan');
  expect(targetLabel('Update payment method', { athleteId: 'a', names: ['Jordan Whitfield', 'Casey Whitfield', 'Drew Whitfield'] })).toBe(
    'Update payment method for Jordan, Casey and Drew'
  );
});

test('customerIdsOf: the membership first, then the add-on, trimmed, no repeats - and every hub member carries them', () => {
  expect(customerIdsOf({ billing: { customerId: 'cus_1' }, facilityBilling: { customerId: 'cus_f' } })).toEqual(['cus_1', 'cus_f']);
  expect(customerIdsOf({ billing: { customerId: ' cus_1 ' }, facilityBilling: { customerId: 'cus_1' } })).toEqual(['cus_1']);
  expect(customerIdsOf({ billing: null, facilityBilling: { customerId: 'cus_f' } })).toEqual(['cus_f']);
  expect(customerIdsOf(null)).toEqual([]);
  const pkg = { id: 't-6', name: '6 tokens', kind: 'tokens', tokens: 6, windowDays: 30 };
  const hub = hubMemberFor({
    athlete: { id: 'a', name: 'Jordan Whitfield', packageId: 't-6', billing: { status: 'active', customerId: 'cus_linked', subscriptionId: 'sub_1' } },
    pkg, bookings: [], waitlist: [], graceTokens: [], anchorDay: 1, today: '2026-11-17',
  });
  expect(hub.customerIds).toEqual(['cus_linked']);
});
