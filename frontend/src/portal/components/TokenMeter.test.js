import React from 'react';
import { renderScreen } from '../screens/testRender';
import TokenMeter from './TokenMeter';
import { hubMemberFor } from '../data/billingHub';
import { SINGLE_TOKEN, TOKEN_PACKAGES } from '../data/packages';

// Rendered directly: Billing.test.js and Membership.test.js mock TokenMeter.
const today = '2026-11-16';
const athlete = { id: 'ava', name: 'Ava' };
const booking = (id, over) => ({ id, athleteId: 'ava', status: 'confirmed', periodKey: '2026-11-01', date: '2026-11-20', sessionId: `s-${id}`, type: 'training', ...over });

test('a single athlete gets the session-token hero: no reset line, no bonus chip, no "of N"', async () => {
  const member = hubMemberFor({
    athlete,
    pkg: SINGLE_TOKEN,
    anchorDay: 1,
    today,
    bookings: [booking('b1', { chargedFrom: 'grace', graceTokenId: 'single_cs_1' })],
    graceTokens: [
      { id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase' },
      { id: 'single_cs_2', expiresAt: '2027-02-27', reason: 'single-purchase' },
    ],
  });
  const r = await renderScreen(<TokenMeter member={member} defaultOpen />);
  expect(r.text()).toContain('Session tokens');
  expect(r.text()).toContain('1session token left');
  expect(r.text()).toContain('good through Sat, Feb 27');
  expect(r.text()).not.toContain('Resets');
  expect(r.text()).not.toContain('Bonus');
  expect(r.text()).not.toContain('of 0 left');
  // The evidence: the booking paid with a bought token, and no period grant lines.
  expect(r.text()).toContain('Session token');
  expect(r.text()).not.toContain('Next period from');
  expect(r.text()).not.toContain('Last period');
  await r.unmount();
});

test('the staff view shows the one-time price on the hero', async () => {
  const member = hubMemberFor({ athlete, pkg: SINGLE_TOKEN, anchorDay: 1, today, graceTokens: [] });
  const r = await renderScreen(<TokenMeter member={member} showPrices />);
  expect(r.text()).toContain('Single token · $65 per session token');
  expect(r.text()).toContain('0session tokens left');
  await r.unmount();
});

test('monthly rendering is unchanged', async () => {
  const T12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');
  const member = hubMemberFor({
    athlete,
    pkg: T12,
    anchorDay: 1,
    today,
    bookings: [booking('b1'), booking('b2', { graceTokenId: 'grace-spent' })],
    graceTokens: [
      { id: 'grace-open', expiresAt: '2026-11-30', reason: 'session-cancelled', sourceSessionId: '2026-11-11-0' },
      { id: 'grace-spent', expiresAt: '2026-11-30', reason: 'session-cancelled', sourceSessionId: '2026-11-10-0' },
    ],
  });
  const r = await renderScreen(<TokenMeter member={member} defaultOpen />);
  expect(r.text()).toContain('11of 12 left');
  expect(r.text()).toContain('Bonus 1');
  expect(r.text()).toContain('Resets');
  expect(r.text()).toContain('Next period from');
  expect(r.text()).toContain('Bonus token'); // the grace-charged row's badge
  expect(r.text()).not.toContain('Session token');
  await r.unmount();
});
