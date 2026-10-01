import React from 'react';
import { renderScreen } from '../screens/testRender';
import { SessionTokenHero, SessionTokenPools } from './SessionTokens';

// Owner rulings 2026-09-29/30: a single athlete's tokens are bought one at a
// time (graceTokens single_{cs}) and good through Sat, Feb 27.
const bought = (id) => ({ id, expiresAt: '2027-02-27', reason: 'single-purchase', sourceSessionId: null });
const single = (over = {}) => ({ granted: 0, used: 0, reserved: 0, left: 0, unlimited: false, perPurchase: true, held: 0, grace: [bought('single_a')], ...over });

test('compact shows the count', async () => {
  const r = await renderScreen(<SessionTokenPools tokens={single()} compact />);
  expect(r.text()).toBe('1 session token');
  await r.unmount();
  const two = await renderScreen(<SessionTokenPools tokens={single({ grace: [bought('single_a'), bought('single_b')] })} compact />);
  expect(two.text()).toBe('2 session tokens');
  await two.unmount();
  const none = await renderScreen(<SessionTokenPools tokens={single({ grace: [] })} compact />);
  expect(none.text()).toBe('No session token');
  await none.unmount();
});

test('full shows the expiry and never "0 of 0"', async () => {
  const r = await renderScreen(<SessionTokenPools tokens={single()} />);
  expect(r.text()).toContain('1 left');
  expect(r.text()).toContain('1 session token - good through Sat, Feb 27');
  expect(r.text()).not.toContain('0 of 0');
  await r.unmount();
  const held = await renderScreen(<SessionTokenPools tokens={single({ grace: [], held: 1 })} />);
  expect(held.text()).toContain('None left');
  expect(held.text()).toContain('No session token · 1 held by a waitlist spot');
  await held.unmount();
  // An ops comp counts too.
  const comp = await renderScreen(<SessionTokenPools tokens={single({ grace: [], granted: 1, left: 1 })} />);
  expect(comp.text()).toContain('1 session token - good through Sat, Feb 27');
  await comp.unmount();
});

test('the hero has no reset line and no bonus chip; the buy slot renders', async () => {
  const member = { package: { id: 'single', name: 'Single token', kind: 'single' }, tokens: single({ held: 1 }) };
  const r = await renderScreen(<SessionTokenHero member={member} buySlot={<button type="button">Buy</button>} />);
  expect(r.text()).toContain('Session tokens');
  expect(r.text()).toContain('Single token');
  expect(r.text()).toContain('1session token left');
  expect(r.text()).toContain('good through Sat, Feb 27');
  expect(r.text()).toContain('1 held by a waitlist spot');
  expect(r.text()).not.toContain('Resets');
  expect(r.text()).not.toContain('Bonus');
  expect(r.text()).not.toContain(' of ');
  expect(r.button('Buy')).not.toBeNull();
  await r.unmount();
});
