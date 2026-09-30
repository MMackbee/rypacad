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
  expect(r.text()).toContain("Facility access - pay when you're ready");
  expect(r.text()).toContain('Facility access for Jordan Whitfield');
  expect(r.button("Pay $300 for Jordan's facility access|facility|a1")).not.toBeNull();
  expect(r.text()).not.toContain('Tokens start');
  expect(r.text()).not.toContain('Nothing needs attention');
  expect(r.text()).not.toContain('sibling'); // the add-on never gets the discount
  expect(r.text()).not.toContain('Pay now');
  await r.unmount();
});

test('a pending membership: its Pay now row carries the waiting add-on line, no add-on button', async () => {
  const r = await renderScreen(<PendingBanner title={TITLE} body={BODY}
    pendingAthletes={[{ athleteId: 'a2', name: 'Reese' }, { athleteId: 'a3', name: 'Sam' }]}
    facilityRows={[{ athleteId: 'a2', name: 'Reese', state: 'waiting' }, { athleteId: 'a1', name: 'Jordan', state: 'pay' }]} />);
  expect(r.text()).toContain(TITLE);
  expect(r.text()).toContain(BODY);
  expect(r.button('Pay now|tier|a2')).not.toBeNull();
  expect(r.button('Pay now|tier|a3')).not.toBeNull();
  // Under Reese's name, not Sam's.
  const reeseRow = r.button('Pay now|tier|a2').parentElement;
  expect(reeseRow.textContent).toContain('Facility access · after the membership is paid');
  expect(r.button('Pay now|tier|a3').parentElement.textContent).not.toContain('Facility access');
  expect(r.text().split('Facility access · after the membership is paid')).toHaveLength(2);
  expect(r.button("Pay $300 for Reese's facility access|facility|a2")).toBeNull();
  // Jordan's membership is paid: the add-on row after the membership rows.
  expect(r.button("Pay $300 for Jordan's facility access|facility|a1")).not.toBeNull();
  expect(r.text().indexOf('Facility access for Jordan')).toBeGreaterThan(r.text().indexOf('Pay now|tier|a3'));
  await r.unmount();
});
