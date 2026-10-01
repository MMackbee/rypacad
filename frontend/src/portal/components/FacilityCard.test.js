import React from 'react';
import { renderScreen } from '../screens/testRender';
import FacilityCard from './FacilityCard';

jest.mock('./PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
const member = (over) => ({ athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens' }, billing: { status: 'active', facility: null }, facilityAccess: false, ...over });

const OFFER = 'Add family facility access · $300/month';

test('offer, paid-waiver-pending, active, elite - one card for the family (owner ruling 2026-09-30)', async () => {
  const o = await renderScreen(<FacilityCard members={[member()]} />);
  expect(o.text()).toContain('One add-on covers every athlete in your household, and a parent or guardian may come along.');
  expect(o.button(`${OFFER}|a1|facility`)).not.toBeNull();
  await o.unmount();
  const p = await renderScreen(<FacilityCard members={[member({ billing: { status: 'active', facility: 'active' } })]} />);
  expect(p.text()).toContain('Family facility access: paid - waiver pending');
  await p.unmount();
  const e = await renderScreen(<FacilityCard members={[member({ package: { kind: 'elite' } })]} />);
  expect(e.text()).toContain('Included with Elite for your family');
  expect(e.text()).not.toContain('$300');
  await e.unmount();
  const ro = await renderScreen(<FacilityCard members={[member()]} readOnly />);
  expect(ro.button(`${OFFER}|a1|facility`)).toBeNull();
  expect(ro.text()).toContain('No family facility access add-on.');
  await ro.unmount();
});

test('two athletes: offered once, billed on the first paid token athlete; never once a sibling covers the family', async () => {
  const reese = member({ athleteId: 'a2', name: 'Reese' });
  const o = await renderScreen(<FacilityCard members={[member({ billing: { status: 'pending', facility: null } }), reese]} />);
  expect(o.button(`${OFFER}|a2|facility`)).not.toBeNull();
  expect([...o.container.querySelectorAll('button')]).toHaveLength(1);
  await o.unmount();
  const held = await renderScreen(<FacilityCard members={[member(), { ...reese, billing: { status: 'active', facility: 'active' }, facilityAccessConsent: true }]} />);
  expect(held.text()).toContain('Family facility access: active');
  expect([...held.container.querySelectorAll('button')]).toHaveLength(0);
  await held.unmount();
  const elite = await renderScreen(<FacilityCard members={[member(), { ...reese, package: { kind: 'elite' } }]} />);
  expect(elite.text()).toContain('Included with Elite for your family');
  expect([...elite.container.querySelectorAll('button')]).toHaveLength(0);
  await elite.unmount();
  // An add-on that ended: said so, and offered again.
  const lapsed = await renderScreen(<FacilityCard members={[member({ billing: { status: 'active', facility: 'lapsed' } })]} />);
  expect(lapsed.text()).toContain('Family facility access: lapsed');
  expect(lapsed.button(`${OFFER}|a1|facility`)).not.toBeNull();
  await lapsed.unmount();
});

test('Elite and a live add-on together: the card says the add-on is still billed (review 2026-09-30)', async () => {
  const STILL = 'You are still paying for the family add-on. Elite includes it - ask the academy to cancel the add-on.';
  const paying = member({ billing: { status: 'active', facility: 'active' } });
  const elite = member({ athleteId: 'a2', name: 'Reese', package: { kind: 'elite' } });
  const both = await renderScreen(<FacilityCard members={[paying, elite]} />);
  expect(both.text()).toContain('Included with Elite for your family');
  expect(both.text()).toContain(STILL);
  expect([...both.container.querySelectorAll('button')]).toHaveLength(0);
  await both.unmount();
  // Elite alone: nothing else is billed, so nothing else is said.
  const alone = await renderScreen(<FacilityCard members={[member(), elite]} />);
  expect(alone.text()).not.toContain('still paying');
  await alone.unmount();
  const staff = await renderScreen(<FacilityCard members={[paying, elite]} readOnly />);
  expect(staff.text()).toContain('This family is still paying for the family add-on. Elite includes it - cancel the add-on in Stripe.');
  await staff.unmount();
  const adult = await renderScreen(<FacilityCard members={[member({ package: { kind: 'elite' }, billing: { status: 'active', facility: 'active' } })]} self />);
  expect(adult.text()).toContain('You are still paying for the facility add-on. Elite includes it - ask the academy to cancel the add-on.');
  await adult.unmount();
  // A child's own login is not the payer: the Elite line only.
  const child = await renderScreen(<FacilityCard members={[paying, elite]} offer={false} />);
  expect(child.text()).toContain('Included with Elite for your family');
  expect(child.text()).not.toContain('still paying');
  await child.unmount();
});

test('self drops "family"; offer={false} never offers (a login that cannot see the whole household)', async () => {
  const s = await renderScreen(<FacilityCard members={[member()]} self />);
  expect(s.button('Add facility access · $300/month|a1|facility')).not.toBeNull();
  expect(s.text()).not.toMatch(/family|household/i);
  await s.unmount();
  const quiet = await renderScreen(<FacilityCard members={[member()]} offer={false} />);
  expect(quiet.text()).toBe('');
  await quiet.unmount();
  const own = await renderScreen(<FacilityCard members={[member({ billing: { status: 'active', facility: 'active' }, facilityAccessConsent: true })]} offer={false} />);
  expect(own.text()).toContain('Family facility access: active');
  await own.unmount();
});
