/**
 * Billing's staff view IS the family page (owner 2026-11-16: one page, every
 * action on it): for the owner and ops each athlete gets a Manage section
 * under their meter and the family gets Advanced at the foot; `?athlete=`
 * opens the page on one athlete. A parent's Billing has neither. The hub is
 * mocked; the section and the fold are stand-ins (their own tests are in
 * components/staffFamily).
 */
import React from 'react';
import { renderScreen } from './testRender';
import Billing from './Billing';
import { hubMemberFor, statusFor } from '../data/billingHub';
import { TOKEN_PACKAGES } from '../data/packages';

let mockHub;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ label }) => <button type="button">{label}</button> }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => mockHub, useBillingHub: () => mockHub, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: null }));
jest.mock('../components/staffFamily/StaffAthletePanel', () => ({
  __esModule: true,
  default: ({ member, role, focus, onMoveRow, onCancelRow }) => (
    <div data-panel={member.athleteId} data-role={role} data-focus={String(focus)} data-move={String(Boolean(onMoveRow))} data-cancel={String(Boolean(onCancelRow))} />
  ),
}));
jest.mock('../components/staffFamily/StaffFamilyAdvanced', () => ({
  __esModule: true,
  default: ({ householdId, anchorDay }) => <div data-advanced={householdId} data-anchor={anchorDay} />,
}));

const T6 = TOKEN_PACKAGES.find((p) => p.id === 't-6');
const kid = (id, name, over = {}) =>
  hubMemberFor({ athlete: { id, name, packageId: T6.id, billing: { status: 'active' }, ...over }, pkg: T6, anchorDay: 1, today: '2026-11-12', waitlist: [], graceTokens: [], bookings: [] });
const hubOf = (members, householdOver = {}) => ({
  loading: false,
  error: null,
  data: {
    household: { id: 'hh1', name: 'Whitfield family', anchorDay: 15, membership: null, stripeCustomerId: null, test: false, ...householdOver },
    portalUrl: null, members, status: statusFor(null, { anchorDay: 15 }),
  },
});
const panels = (r) => [...r.container.querySelectorAll('[data-panel]')];

beforeEach(() => {
  mockHub = hubOf([kid('jordan', 'Jordan Whitfield'), kid('riley', 'Riley Whitfield')]);
});

test('the owner and ops: the header says Family, each athlete has a Manage section, the family has Advanced', async () => {
  for (const role of ['owner', 'ops']) {
    const r = await renderScreen(<Billing bare staff role={role} householdId="hh1" onBack={() => {}} />, { path: '/portal/admin/households/hh1' });
    expect(r.text()).toContain('Family · staff view');
    expect(r.text()).not.toContain('Billing · staff view');
    expect(panels(r).map((p) => [p.dataset.panel, p.dataset.role, p.dataset.focus, p.dataset.move, p.dataset.cancel])).toEqual([
      ['jordan', role, 'false', 'true', 'true'],
      ['riley', role, 'false', 'true', 'true'],
    ]);
    const advanced = r.container.querySelector('[data-advanced]');
    expect([advanced.dataset.advanced, advanced.dataset.anchor]).toEqual(['hh1', '15']);
    await r.unmount();
  }
});

test('?athlete= opens the page on that athlete alone', async () => {
  const r = await renderScreen(<Billing bare staff role="owner" householdId="hh1" onBack={() => {}} />, { path: '/portal/admin/households/hh1?athlete=riley' });
  expect(panels(r).map((p) => [p.dataset.panel, p.dataset.focus])).toEqual([['jordan', 'false'], ['riley', 'true']]);
  await r.unmount();
});

/*
 * Review 2026-11-17 (F4): an Admin row's householdId comes from cached data.
 * An athlete moved to another family since opens the old family with an
 * ?athlete= that matches nobody - the page hands over to the redirect, which
 * reads where the athlete lives now (or says they are gone).
 */
describe('?athlete= the fresh hub does not list', () => {
  const page = { pathname: '/portal/admin/households/hh1', search: '?athlete=casey' };
  const at = (r) => `${r.location().pathname}${r.location().search}`;

  test('takes the redirect that finds the family', async () => {
    const r = await renderScreen(<Billing bare staff role="owner" householdId="hh1" onBack={() => {}} />, { path: page });
    expect(at(r)).toBe('/portal/admin/athletes/casey');
    await r.unmount();
  });

  test('waits while the hub re-reads, then goes', async () => {
    mockHub = { ...mockHub, isRefreshing: true };
    const r = await renderScreen(<Billing bare staff role="owner" householdId="hh1" onBack={() => {}} />, { path: page });
    expect(at(r)).toBe('/portal/admin/households/hh1?athlete=casey');
    mockHub = { ...mockHub, isRefreshing: false };
    await r.rerender(<Billing bare staff role="owner" householdId="hh1" onBack={() => {}} />);
    expect(at(r)).toBe('/portal/admin/athletes/casey');
    await r.unmount();
  });

  test('stays when the redirect itself sent it here: no loop', async () => {
    const r = await renderScreen(<Billing bare staff role="owner" householdId="hh1" onBack={() => {}} />, { path: { ...page, state: { athleteResolved: true } } });
    expect(at(r)).toBe('/portal/admin/households/hh1?athlete=casey');
    expect(panels(r)).toHaveLength(2);
    await r.unmount();
  });

  test("an athlete the hub lists stays put, and a parent's Billing never redirects", async () => {
    const r = await renderScreen(<Billing bare staff role="owner" householdId="hh1" onBack={() => {}} />, { path: '/portal/admin/households/hh1?athlete=riley' });
    expect(at(r)).toBe('/portal/admin/households/hh1?athlete=riley');
    await r.unmount();
    const parent = await renderScreen(<Billing bare role="parent" />, { path: '/portal/billing?athlete=casey' });
    expect(at(parent)).toBe('/portal/billing?athlete=casey');
    await parent.unmount();
  });
});

test('a test athlete keeps Cancel and loses Move, as on the meter', async () => {
  mockHub = hubOf([kid('jordan', 'Jordan Whitfield', { test: true }), kid('riley', 'Riley Whitfield')]);
  const r = await renderScreen(<Billing bare staff role="ops" householdId="hh1" onBack={() => {}} />, { path: '/portal/admin/households/hh1' });
  expect(panels(r).map((p) => [p.dataset.panel, p.dataset.move, p.dataset.cancel])).toEqual([['jordan', 'false', 'true'], ['riley', 'true', 'true']]);
  await r.unmount();
});

test('a save reloads the hub: the page keeps what it showed, so an open Manage section and its note stay', async () => {
  const r = await renderScreen(<Billing bare staff role="owner" householdId="hh1" onBack={() => {}} />, { path: '/portal/admin/households/hh1' });
  const before = panels(r)[0];
  // The hub clears its data while it reloads (useSeedResource).
  mockHub = { loading: true, error: null, data: null };
  await r.rerender(<Billing bare staff role="owner" householdId="hh1" onBack={() => {}} />);
  expect(r.container.querySelector('[aria-label="Loading billing"]')).toBeNull();
  expect(panels(r)[0]).toBe(before);
  // Another family, or a parent's own Billing, never shows the kept one.
  await r.rerender(<Billing bare staff role="owner" householdId="hh2" onBack={() => {}} />);
  expect(panels(r)).toEqual([]);
  expect(r.container.querySelector('[aria-label="Loading billing"]')).not.toBeNull();
  await r.unmount();
});

test("a parent's Billing shows the skeleton while it reloads, as before", async () => {
  const r = await renderScreen(<Billing bare role="parent" />, { path: '/portal/billing' });
  mockHub = { loading: true, error: null, data: null };
  await r.rerender(<Billing bare role="parent" />);
  expect(r.container.querySelector('[aria-label="Loading billing"]')).not.toBeNull();
  await r.unmount();
});

test("a parent's Billing, and a self-managed athlete's, have neither", async () => {
  for (const props of [{ role: 'parent' }, { role: 'athlete' }]) {
    const r = await renderScreen(<Billing bare {...props} />, { path: '/portal/billing?athlete=riley' });
    expect(panels(r)).toEqual([]);
    expect(r.container.querySelector('[data-advanced]')).toBeNull();
    expect(r.text()).not.toContain('Family · staff view');
    await r.unmount();
  }
});
