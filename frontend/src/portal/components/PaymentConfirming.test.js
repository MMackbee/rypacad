import React from 'react';
import { renderScreen } from '../screens/testRender';
import PaymentConfirming from './PaymentConfirming';
import { BOOKING_OPENS_AT } from '../data/calendar';

/**
 * The Stripe return for a one-time token (`?paid=...&cs=...&single=1`): the
 * hook confirms on graceTokens/single_{cs} and reports the paid package as
 * 'single'. A monthly member's extra session (owner, 2026-10-10) adds
 * `extra=1`: its line, and never the new member's "What's next" card.
 */

let mockConfirmation;
jest.mock('../hooks/billing', () => ({ __esModule: true, usePaymentConfirmation: () => mockConfirmation }));

const member = { name: 'Ava Kim', packageId: 't-8', loginEmail: null };
const whatsNext = { athlete: member, product: null, onBook: () => {} };

beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(BOOKING_OPENS_AT + 60 * 60 * 1000); });
afterEach(() => { jest.restoreAllMocks(); });

test('an extra session: its own line, and no "What\'s next" for a member', async () => {
  mockConfirmation = { state: 'confirmed', packageId: 'single' };
  const r = await renderScreen(<PaymentConfirming athleteId="ava" cs="cs_1" single extra whatsNext={whatsNext} />);
  expect(r.text()).toContain('Payment received - your extra session token is ready to book, good through Sat, Feb 27.');
  expect(r.text()).not.toContain("What's next");
  expect(r.text()).not.toContain('your session token is ready');
  await r.unmount();
});

test('a single token keeps its own line; extra alone (no single) changes nothing', async () => {
  mockConfirmation = { state: 'confirmed', packageId: 'single' };
  const r = await renderScreen(<PaymentConfirming athleteId="ava" cs="cs_1" single whatsNext={whatsNext} />);
  expect(r.text()).toContain('Payment received - your session token is ready to book.');
  expect(r.text()).not.toContain("What's next");
  await r.unmount();
  // A monthly checkout return is untouched: its line and its card.
  mockConfirmation = { state: 'confirmed', packageId: 't-8' };
  const monthly = await renderScreen(<PaymentConfirming athleteId="ava" extra whatsNext={whatsNext} />);
  expect(monthly.text()).toContain("Payment received - you're all set to book.");
  expect(monthly.text()).toContain("What's next");
  await monthly.unmount();
});

test('while confirming, and on a timeout, the extra return reads like any other', async () => {
  mockConfirmation = { state: 'confirming', packageId: null };
  const r = await renderScreen(<PaymentConfirming athleteId="ava" cs="cs_1" single extra whatsNext={whatsNext} />);
  expect(r.text()).toContain('Confirming your payment...');
  await r.unmount();
  mockConfirmation = { state: 'timeout', packageId: null };
  const late = await renderScreen(<PaymentConfirming athleteId="ava" cs="cs_1" single extra />);
  expect(late.text()).toContain('Still confirming');
  await late.unmount();
});
