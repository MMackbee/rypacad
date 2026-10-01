import React from 'react';
import { renderScreen } from '../screens/testRender';
import PendingBanner from './PendingBanner';

jest.mock('./PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{product}|{athleteId}</button> }));

// Owner request (Mike, 2026-09-30): the facility add-on ticked at sign-up
// is paid from the pending card once the membership is.
const TITLE = 'Payment pending - finish checkout to start booking';
const BODY = 'Reese can book once checkout is complete. Billed monthly on the 1st once you\'ve paid.';

test('no tier rows and no add-on to pay: nothing, even with a waiting add-on', async () => {
  const r = await renderScreen(<PendingBanner pendingAthletes={[]} facilityRows={[{ athleteId: 'a2', name: 'Reese', state: 'waiting' }]} body={BODY} title={TITLE} />);
  expect(r.text()).toBe('');
  await r.unmount();
  const none = await renderScreen(<PendingBanner pendingAthletes={null} />);
  expect(none.text()).toBe('');
  await none.unmount();
});

test('a paid membership with the add-on to pay: its own row and button, the card\'s own title, no membership body', async () => {
  const r = await renderScreen(<PendingBanner pendingAthletes={[]} facilityRows={[{ athleteId: 'a1', name: 'Jordan Whitfield', state: 'pay' }]}
    body="Billed monthly on the 1st. Nothing needs attention." title="Tokens start Sun, Nov 1" siblingDiscount />);
  expect(r.text()).toContain("Family facility access - pay when you're ready");
  // One family row (owner ruling 2026-09-30): it names no athlete, and the card's title is its only heading.
  expect(r.text()).not.toContain('Jordan');
  expect(r.text().split('Family facility access')).toHaveLength(2); // the title only - no row heading repeating it
  expect(r.button('Pay $300 for family facility access|facility|a1')).not.toBeNull();
  expect(r.text()).not.toContain('Tokens start');
  expect(r.text()).not.toContain('Nothing needs attention');
  expect(r.text()).not.toContain('sibling'); // the add-on never gets the discount
  expect(r.text()).not.toContain('Pay now');
  await r.unmount();
});

test('a pending membership: its Pay now row carries the waiting add-on line, no add-on button', async () => {
  const r = await renderScreen(<PendingBanner title={TITLE} body={BODY}
    pendingAthletes={[{ athleteId: 'a2', name: 'Reese' }, { athleteId: 'a3', name: 'Sam' }]}
    facilityRows={[{ athleteId: 'a2', name: 'Reese', state: 'waiting' }]} />);
  expect(r.text()).toContain(TITLE);
  expect(r.text()).toContain(BODY);
  expect(r.button('Pay now|tier|a2')).not.toBeNull();
  expect(r.button('Pay now|tier|a3')).not.toBeNull();
  // Under Reese's name (the membership the add-on waits for), not Sam's.
  const reeseRow = r.button('Pay now|tier|a2').parentElement;
  expect(reeseRow.textContent).toContain('Family facility access · after the membership is paid');
  expect(r.button('Pay now|tier|a3').parentElement.textContent).not.toContain('acility access');
  expect(r.text().split('Family facility access · after the membership is paid')).toHaveLength(2);
  expect(r.button('Pay $300 for family facility access|facility|a2')).toBeNull();
  await r.unmount();
});

test('the add-on payable while another membership is still unpaid: one family row under the membership rows, with its own heading', async () => {
  const r = await renderScreen(<PendingBanner title={TITLE} body={BODY}
    pendingAthletes={[{ athleteId: 'a3', name: 'Sam' }]} facilityRows={[{ athleteId: 'a1', name: 'Jordan', state: 'pay' }]} />);
  expect(r.text()).toContain(TITLE);
  expect(r.button('Pay $300 for family facility access|facility|a1')).not.toBeNull();
  expect(r.text().indexOf('Family facility access')).toBeGreaterThan(r.text().indexOf('Pay now|tier|a3'));
  expect(r.text().split('Family facility access')).toHaveLength(2); // the row's own heading, once
  expect(r.text()).not.toContain('Jordan');
  await r.unmount();
});

test('the adult who is their own household reads it without "family"', async () => {
  const pay = await renderScreen(<PendingBanner self pendingAthletes={[]} facilityRows={[{ athleteId: 'a1', name: 'Sam', state: 'pay' }]} />);
  expect(pay.text()).toContain("Facility access - pay when you're ready");
  expect(pay.button('Pay $300 for facility access|facility|a1')).not.toBeNull();
  expect(pay.text()).not.toMatch(/family/i);
  await pay.unmount();
  const waiting = await renderScreen(<PendingBanner self title={TITLE} pendingAthletes={[{ athleteId: 'a1', name: 'Sam' }]} facilityRows={[{ athleteId: 'a1', name: 'Sam', state: 'waiting' }]} />);
  expect(waiting.text()).toContain('Facility access · after the membership is paid');
  expect(waiting.text()).not.toMatch(/family/i);
  await waiting.unmount();
});

// Owner 2026-10-01 ("lesser value"): the family saves 20% of the lower membership in either payment order.
test('plan: one line when nobody is paid yet; then 20% off the lower row, or the dollar figure off a dearer row', async () => {
  const rows = [{ athleteId: 'a1', name: 'Casey', packageId: 'elite' }, { athleteId: 'a2', name: 'Blake', packageId: 't-6' }];
  const ORDER = 'Sibling discount: 20% of the lower membership comes off the second one you pay.';
  const r = await renderScreen(<PendingBanner pendingAthletes={rows} title={TITLE} siblingDiscount
    plan={{ a1: { state: 'full', amount: null }, a2: { state: 'full', amount: null } }} />);
  expect(r.text().split(ORDER)).toHaveLength(2);
  expect(r.button('Pay now|tier|a1')).not.toBeNull();
  expect(r.button('Pay now|tier|a2')).not.toBeNull(); // nobody is made to wait
  await r.unmount();
  const lower = await renderScreen(<PendingBanner pendingAthletes={[rows[1]]} title={TITLE} plan={{ a2: { state: 'discount', amount: null } }} />);
  expect(lower.text()).toContain('20% sibling discount comes off at checkout.');
  expect(lower.text()).not.toContain(ORDER);
  await lower.unmount();
  const dearer = await renderScreen(<PendingBanner pendingAthletes={[rows[0]]} title={TITLE} plan={{ a1: { state: 'partial', amount: 59.8 } }} />);
  expect(dearer.text()).toContain('Sibling discount: about $59.80 a month (20% of the lower membership) comes off at checkout.');
  expect(dearer.button('Pay now|tier|a1')).not.toBeNull();
  await dearer.unmount();
});

// Owner ruling 2026-10-01: single tokens go on sale when booking opens (Sat,
// Oct 10 at 7 AM Chicago) - no Pay button for one before then.
describe('a single-token row and the booking-open gate', () => {
  const GATE = Date.parse('2026-10-10T12:00:00Z'); // BOOKING_OPENS_AT
  const WHEN = 'Single tokens are available from Sat, Oct 10 at 7 AM.';
  const rows = [{ athleteId: 'a1', name: 'Jordan', perPurchase: true }, { athleteId: 'a2', name: 'Reese', perPurchase: false }];
  afterEach(() => { jest.restoreAllMocks(); });

  test('before the gate: the line saying when, no Pay button; a monthly row beside it still pays', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(GATE - 1);
    const r = await renderScreen(<PendingBanner pendingAthletes={rows} title={TITLE} />);
    expect(r.button('Pay now|tier|a1')).toBeNull();
    expect(r.text().split(WHEN)).toHaveLength(2); // under Jordan's name only
    expect(r.button('Pay now|tier|a2')).not.toBeNull();
    await r.unmount();
  });

  test('before the gate, an all-single list whose body already says when: said once, still no button', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(GATE - 1);
    const body = `Jordan can book once their session token is paid for. ${WHEN} A session token is a one-time $65 payment.`;
    const r = await renderScreen(<PendingBanner pendingAthletes={[rows[0]]} title={TITLE} body={body} />);
    expect(r.text()).toContain('Jordan');
    expect(r.text().split(WHEN)).toHaveLength(2);
    expect(r.text()).not.toContain('Pay now');
    await r.unmount();
  });

  test('from the gate on: Pay now, and no line', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(GATE);
    const r = await renderScreen(<PendingBanner pendingAthletes={rows} title={TITLE} />);
    expect(r.button('Pay now|tier|a1')).not.toBeNull();
    expect(r.button('Pay now|tier|a2')).not.toBeNull();
    expect(r.text()).not.toContain(WHEN);
    await r.unmount();
  });
});
