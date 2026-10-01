import React from 'react';
import { renderScreen } from './testRender';
import RegistrationSuccess from './RegistrationSuccess';
import { newAthleteEntry } from '../data/signup';
import { VERIFY_EMAIL_SENDER } from '../data/authCopy';

jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, label }) => <button type="button">{label}|{athleteId}</button>, startCheckout: async () => {} }));
// Link mode reads the family for the sibling rule; seed mode (no read) unless a test turns it on.
let mockLive = false; let mockFamily = null; let mockReads = [];
jest.mock('../hooks/live', () => ({
  isLive: () => mockLive,
  fetchHouseholdAthletes: async (id) => { mockReads.push(id); if (mockFamily instanceof Error) throw mockFamily; return mockFamily; },
}));

const form = (over) => ({
  mode: 'parent', contact: { name: 'Dana', email: 'dana@email.com', phone: '1', relationship: 'Mother' },
  athletes: [{ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 't-12' }, { ...newAthleteEntry(), name: 'Reese', dob: '2014-03-02', packageId: 'elite', ownLogin: true, loginEmail: 'reese@email.com' }],
  emergencyContact: '', medical: '', consents: {}, signatureName: 'Dana', ...over,
});

// The clock is pinned: the receipt's gate and pay-terms lines depend on it.
const EMAIL_DAY = Date.parse('2026-10-01T17:00:00Z');
const NOV_1_CHICAGO = Date.parse('2026-11-01T05:00:00Z');
const GATE = Date.parse('2026-10-10T12:00:00Z'); // BOOKING_OPENS_AT: Sat, Oct 10 at 7 AM Chicago
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(EMAIL_DAY); mockLive = false; mockFamily = null; mockReads = []; });
afterEach(() => { jest.restoreAllMocks(); });

test('one pay button per athlete, the next steps, child-login instructions, no walkthrough', async () => {
  const finished = [];
  const r = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={(p) => finished.push(p)} />
  );
  expect(r.text()).toContain("You're in");
  expect(r.button("Pay $569 for Jordan's 12 tokens|a1")).not.toBeNull();
  expect(r.button("Pay $999 for Reese's Elite|a2")).not.toBeNull();
  expect(r.text()).toContain('Today you pay the amount on each button for November, then monthly from Dec 1.');
  expect(r.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
  expect(r.text()).toContain('Elite books right away once paid');
  // UX review P-09 / CHILD-3: where Stripe really returns, the child's real buttons, the full address.
  expect(r.text()).toContain('After you pay, Stripe sends you to your family page. It shows "Confirming your payment..." for up to two minutes. Paying for more than one athlete? The others wait there, each with its own Pay now button.');
  expect(r.text()).toContain(`Reese signs in at ${window.location.host}/portal/signin with reese@email.com. If that email is a Google account, Continue with Google is quickest. Otherwise: tap Create a student login, open the email from ${VERIFY_EMAIL_SENDER}, then tap I've verified.`);
  expect(r.text()).toContain(", then tap I've verified.");
  expect(r.text()).toContain("There's no welcome email. Your family page always shows what's paid and what's left to do.");
  expect(r.text()).not.toMatch(/brought back here|Check again|this screen is your receipt/);
  expect(r.button('Start the walkthrough')).toBeNull();
  await r.click('Go to your family');
  expect(finished).toEqual(['/portal/family']);
  await r.unmount();
});

test('before Nov 1 the receipt names the amount due today and says monthly from Dec 1, never when billing ends (UX P-07)', async () => {
  const one = form({ athletes: [{ ...newAthleteEntry(), name: 'Jordan Whitfield', dob: '2012-06-17', packageId: 't-6' }] });
  const r = await renderScreen(<RegistrationSuccess bare mode="signup" form={one} result={{ householdId: 'h1', athleteIds: ['a1'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
  expect(r.button("Pay $299 for Jordan's 6 tokens|a1")).not.toBeNull();
  expect(r.text()).toContain("Today you pay $299 for November, then monthly from Dec 1. Stripe's page calls the plan a free trial until Dec 1 because November is paid today as a separate line.");
  expect(r.text()).not.toMatch(/until you cancel|through February/);
  await r.unmount();
});

test('from Nov 1 (checkout prorates) and for the one-time single token the receipt names no amount', async () => {
  Date.now.mockReturnValue(NOV_1_CHICAGO);
  const r = await renderScreen(<RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
  expect(r.button("Pay for Jordan's 12 tokens|a1")).not.toBeNull();
  expect(r.button("Pay for Reese's Elite|a2")).not.toBeNull();
  expect(r.text()).not.toContain('Today you pay');
  await r.unmount();
  // On sale from the booking-open gate (owner ruling 2026-10-01), still before Nov 1.
  Date.now.mockReturnValue(GATE);
  const single = form({ athletes: [{ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 'single' }] });
  const s = await renderScreen(<RegistrationSuccess bare mode="signup" form={single} result={{ householdId: 'h1', athleteIds: ['a1'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
  expect(s.button("Pay for Jordan's Single token|a1")).not.toBeNull();
  expect(s.text()).not.toContain('Today you pay');
  expect(s.text()).not.toContain('monthly from Dec 1');
  await s.unmount();
});

test('before single tokens go on sale the receipt offers no Pay button for one (owner ruling 2026-10-01)', async () => {
  Date.now.mockReturnValue(GATE - 1);
  const mixed = form({ athletes: [{ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 'single' }, { ...newAthleteEntry(), name: 'Reese', dob: '2014-03-02', packageId: 't-6' }] });
  const r = await renderScreen(<RegistrationSuccess bare mode="signup" form={mixed} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
  expect(r.button("Pay for Jordan's Single token|a1")).toBeNull();
  expect(r.text()).toContain('Jordan: Single tokens are available from Sat, Oct 10 at 7 AM.');
  expect(r.button("Pay $299 for Reese's 6 tokens|a2")).not.toBeNull();
  await r.unmount();
});

test('an unverified password account is told to open the verification link before Pay (UX P-04)', async () => {
  const unverified = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com', emailVerified: false }} onFinish={() => {}} />
  );
  expect(unverified.text()).toContain(`First open the link we emailed to dana@email.com (from ${VERIFY_EMAIL_SENDER}`);
  expect(unverified.text()).toContain(' - check spam), then tap Pay.');
  await unverified.unmount();
  const verified = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com', emailVerified: true }} onFinish={() => {}} />
  );
  expect(verified.text()).not.toContain('First open the link');
  await verified.unmount();
});

test('a kept family facility add-on gets ONE line under the Pay buttons, and no button of its own (owner 2026-09-30)', async () => {
  const jordan = { ...newAthleteEntry(), name: 'Jordan Whitfield', dob: '2012-06-17', packageId: 't-12' };
  const reese = { ...newAthleteEntry(), name: 'Reese', dob: '2014-03-02', packageId: 't-6' };
  const sam = { ...newAthleteEntry(), name: 'Sam', dob: '2013-01-01', packageId: 'elite' };
  const receipt = (over, ids, mode = 'signup') => renderScreen(<RegistrationSuccess bare mode={mode} form={form(over)} result={{ householdId: 'h1', athleteIds: ids }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
  // Two athletes: the line names whose membership the add-on waits for (the first on a token package).
  const LINE = "Family facility access · $300/month - pay after Jordan's membership";
  const r = await receipt({ facilityRequested: true, athletes: [jordan, reese] }, ['a1', 'a2']);
  expect(r.text().split('Family facility access')).toHaveLength(2);
  expect(r.button("Pay $299 for Reese's 6 tokens|a2").nextSibling.textContent).toBe(LINE);
  expect([...r.container.querySelectorAll('button')].map((b) => b.textContent).filter((t) => /facility/i.test(t))).toEqual([]);
  await r.unmount();
  const one = await receipt({ facilityRequested: true, athletes: [jordan] }, ['a1']);
  expect(one.text()).toContain('Family facility access · $300/month - pay after the membership');
  await one.unmount();
  // The adult signing up for themselves: no "family".
  const self = await receipt({ mode: 'athlete', facilityRequested: true, athletes: [jordan] }, ['a1']);
  expect(self.text()).toContain('Facility access · $300/month - pay after the membership');
  expect(self.text()).not.toMatch(/family facility/i);
  await self.unmount();
  // Not ticked, or a tick left behind once anyone is on Elite (Elite covers the family): no line.
  const none = await receipt({ athletes: [jordan, reese] }, ['a1', 'a2']);
  expect(none.text()).not.toMatch(/facility access/i);
  await none.unmount();
  const elite = await receipt({ facilityRequested: true, athletes: [jordan, sam] }, ['a1', 'a3']);
  expect(elite.text()).not.toMatch(/facility access/i);
  await elite.unmount();
});

test('link mode: the facility line follows what addAthletes stored, read with the family', async () => {
  const nico = { ...newAthleteEntry(), name: 'Nico', dob: '2015-05-05', packageId: 't-6' };
  const link = () => renderScreen(<RegistrationSuccess bare mode="link" form={form({ facilityRequested: true, athletes: [nico] })} result={{ householdId: 'h1', athleteIds: ['a9'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
  const LINE = 'Family facility access · $300/month - pay after the membership';
  mockLive = true;
  mockFamily = [{ id: 'a1', packageId: 't-12', billing: { status: 'active' } }, { id: 'a9', packageId: 't-6', billing: { status: 'pending' }, facilityRequested: true }];
  const kept = await link();
  await kept.flush();
  expect(kept.text()).toContain(LINE);
  await kept.unmount();
  // The family already had Elite, a request or the add-on: addAthletes stored false, so no line.
  mockFamily = [{ id: 'a1', packageId: 'elite', billing: { status: 'active' } }, { id: 'a9', packageId: 't-6', billing: { status: 'pending' }, facilityRequested: false }];
  const dropped = await link();
  await dropped.flush();
  expect(dropped.text()).not.toMatch(/facility access/i);
  await dropped.unmount();
  // The read failed: missing, never wrong.
  mockFamily = new Error('offline');
  const failed = await link();
  await failed.flush();
  expect(failed.text()).not.toMatch(/facility access/i);
  await failed.unmount();
});

test('athlete mode goes home', async () => {
  const finished = [];
  const r = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form({ mode: 'athlete', athletes: [form().athletes[0]] })} result={{ householdId: 'h1', athleteIds: ['a1'] }} account={{ email: 'j@email.com' }} onFinish={(p) => finished.push(p)} />
  );
  expect(r.text()).toContain('After you pay, Stripe sends you to your home page.');
  expect(r.text()).toContain('Your home page always shows');
  expect(r.text()).not.toContain('more than one athlete');
  await r.click('Go to your home');
  expect(finished).toEqual(['/portal/home']);
  await r.unmount();
});

describe('sibling discount (checkout.js siblingEligible, owner 2026-09-30)', () => {
  const NOTE = '20% sibling discount comes off at checkout.';
  // Owner 2026-10-01 ("lesser value"): 20% of the lower membership, in either payment order.
  const FIRST = 'Sibling discount: 20% of the lower membership comes off the second one you pay.';
  const avery = { ...newAthleteEntry(), name: 'Avery', dob: '2013-05-01', packageId: 't-16' };

  test('two monthly athletes at sign-up: one line says how the discount works, and the buttons keep the catalogue price', async () => {
    const r = await renderScreen(<RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
    expect(r.text()).toContain(FIRST);
    expect(r.text()).not.toContain(NOTE);
    expect(r.text().indexOf("Reese's Elite")).toBeLessThan(r.text().indexOf("Jordan's 12 tokens"));
    expect(r.button("Pay $569 for Jordan's 12 tokens|a1")).not.toBeNull();
    expect(r.button("Pay $999 for Reese's Elite|a2")).not.toBeNull();
    expect(r.text()).not.toMatch(/\$512|\$899|\$647/);
    expect(mockReads).toEqual([]);
    await r.unmount();
  });

  test('one athlete, or a second one on the one-time single token, gets no line', async () => {
    const one = await renderScreen(<RegistrationSuccess bare mode="signup" form={form({ athletes: [avery] })} result={{ householdId: 'h1', athleteIds: ['a1'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
    expect(one.button("Pay $719 for Avery's 16 tokens|a1")).not.toBeNull();
    expect(one.text()).not.toContain('sibling');
    await one.unmount();
    const single = form({ athletes: [avery, { ...newAthleteEntry(), name: 'Sam', dob: '2014-01-01', packageId: 'single' }] });
    const s = await renderScreen(<RegistrationSuccess bare mode="signup" form={single} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
    expect(s.text()).not.toContain('sibling');
    await s.unmount();
  });

  test('link mode counts the family already there: a paid sibling qualifies, a lapsed one does not', async () => {
    mockLive = true;
    mockFamily = [{ id: 'old', householdId: 'h1', packageId: 'elite', billing: { status: 'active' } }, { id: 'a9', householdId: 'h1', packageId: 't-16', billing: { status: 'pending' } }];
    const r = await renderScreen(<RegistrationSuccess bare mode="link" form={form({ athletes: [avery] })} result={{ householdId: 'h1', athleteIds: ['a9'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
    await r.flush();
    expect(mockReads).toEqual(['h1']);
    expect(r.text()).toContain(NOTE);
    expect(r.button("Pay $719 for Avery's 16 tokens|a9")).not.toBeNull();
    expect(r.text()).toContain('Today you pay $719 for November');
    await r.unmount();
    // A paid sibling on a CHEAPER package: 20% of that cheaper one comes off the dearer new one.
    mockFamily = [{ ...mockFamily[0], packageId: 't-6' }, mockFamily[1]];
    const cheaper = await renderScreen(<RegistrationSuccess bare mode="link" form={form({ athletes: [avery] })} result={{ householdId: 'h1', athleteIds: ['a9'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
    await cheaper.flush();
    expect(cheaper.text()).toContain('Sibling discount: about $59.80 a month (20% of the lower membership) comes off at checkout.');
    expect(cheaper.text()).not.toContain(NOTE);
    await cheaper.unmount();
    mockFamily = [{ ...mockFamily[0], packageId: 'elite', billing: { status: 'lapsed' } }, mockFamily[1]];
    const lapsed = await renderScreen(<RegistrationSuccess bare mode="link" form={form({ athletes: [avery] })} result={{ householdId: 'h1', athleteIds: ['a9'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
    await lapsed.flush();
    expect(lapsed.text()).not.toContain('sibling');
    await lapsed.unmount();
  });

  test('link mode with a failed family read falls back to the athletes on the receipt', async () => {
    mockLive = true;
    mockFamily = new Error('offline');
    const r = await renderScreen(<RegistrationSuccess bare mode="link" form={form({ athletes: [avery] })} result={{ householdId: 'h1', athleteIds: ['a9'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
    await r.flush();
    expect(mockReads).toEqual(['h1']);
    expect(r.text()).not.toContain('sibling');
    await r.unmount();
    // Two new athletes with no readable family: neither is paid, so no
    // discount line, only how it will work.
    const two = await renderScreen(<RegistrationSuccess bare mode="link" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
    await two.flush();
    expect(two.text()).not.toContain(NOTE);
    expect(two.text()).toContain(FIRST);
    await two.unmount();
  });
});
