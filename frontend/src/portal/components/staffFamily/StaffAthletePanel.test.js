/**
 * One athlete's Manage section on the staff family page (owner 2026-11-16:
 * one page, every action on it): closed until tapped, open and in view when
 * the page was opened on that athlete, and inside it the actions that used
 * to live on the athlete page - package and facility access, Issue tokens,
 * the handicap, the consent status - plus the read-only links out.
 */
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import StaffAthletePanel from './StaffAthletePanel';
import StaffFamilyAdvanced from './StaffFamilyAdvanced';

let mockDetail;
let mockDetailAsked;
let mockSetHandicap;
let mockAssign;
let mockIssue;
let mockAnchor;
let mockLater;
jest.mock('../../hooks/mentalConsentStaff', () => ({ useStaffConsent: () => ({ data: null, loading: false, error: null }) }));
jest.mock('../../hooks/mentalConsent', () => ({ useFamilyConsents: () => ({ data: null, loading: false, error: null }) }));
jest.mock('../../hooks/billing', () => ({ __esModule: true, useHouseholdFacility: () => ({ data: null, loading: false, error: null }) }));
jest.mock('../../hooks/staffBooking', () => ({ __esModule: true, useStaffAthlete: () => mockLater }));
jest.mock('../../hooks', () => ({
  useAthleteDetail: (args) => {
    mockDetailAsked.push(args.athleteId);
    return mockDetail;
  },
  useAssignPackages: () => ({ assign: (...a) => mockAssign(...a) }),
  useHouseholdSettings: () => ({ saving: false, setPeriodAnchorDay: (...a) => mockAnchor(...a), setStripeIds: async () => {} }),
  useIssueTokens: () => ({ issue: (...a) => mockIssue(...a) }),
  setAthleteHandicap: (...a) => mockSetHandicap(...a),
}));

const athlete = (over = {}) => ({
  name: 'Jordan Whitfield', packageId: 't-6', householdId: 'hh1', periodAnchorDay: 1, facilityAccess: false,
  facilityAccessConsent: null, handicap: 14, loginEmail: 'jordan@email.com', login: { state: 'invited', claimedAt: null }, ...over,
});
const loaded = (a) => ({ data: { athlete: a, history: [], checklist: [], hasEnoughData: false }, loading: false, error: null });
const member = { athleteId: 'jordan', name: 'Jordan Whitfield', package: { id: 't-6', kind: 'tokens' } };
const toggle = (r) => r.container.querySelector('[data-staff-manage="jordan"] > button');

beforeEach(() => {
  mockDetail = loaded(athlete());
  mockDetailAsked = [];
  mockSetHandicap = jest.fn(async (args) => args);
  mockAssign = jest.fn(async () => {});
  mockIssue = jest.fn(async () => {});
  mockAnchor = jest.fn(async () => {});
  mockLater = { data: null, loading: false, error: null };
});

test('closed until tapped: the toggle names the athlete and nothing is read before it opens', async () => {
  const r = await renderScreen(<StaffAthletePanel member={member} role="owner" />, { path: '/portal/admin/households/hh1' });
  expect(toggle(r).textContent).toContain('Manage Jordan');
  expect(toggle(r).getAttribute('aria-expanded')).toBe('false');
  expect(r.text()).not.toContain('Issue tokens');
  expect(mockDetailAsked).toEqual([]);
  await r.act(async () => { toggle(r).click(); });
  expect(toggle(r).getAttribute('aria-expanded')).toBe('true');
  expect(mockDetailAsked).toContain('jordan');
  expect(r.text()).toContain('Issue tokens');
  await r.unmount();
});

test('opened on this athlete: the section starts open with every action in it', async () => {
  const r = await renderScreen(<StaffAthletePanel member={member} role="ops" focus />, { path: '/portal/admin/households/hh1' });
  expect(toggle(r).getAttribute('aria-expanded')).toBe('true');
  const text = r.text();
  for (const part of ['Membership', 'Package', 'Facility access', 'Save membership', 'Issue tokens', 'This period', 'On file14', 'Login: not claimed (jordan@email.com)', 'Assessment results', 'Combine', 'Coaching view']) {
    expect(text).toContain(part);
  }
  // The family's own settings are not repeated under each athlete.
  expect(text).not.toContain('Save Stripe ids');
  await r.unmount();
});

test('the handicap is changed here: the write names this athlete', async () => {
  const r = await renderScreen(<StaffAthletePanel member={member} role="owner" focus />, { path: '/portal/admin/households/hh1' });
  await r.fill('Set handicap', '5');
  await r.click('Save handicap');
  expect(mockSetHandicap).toHaveBeenCalledTimes(1);
  expect(mockSetHandicap).toHaveBeenCalledWith({ athleteId: 'jordan', handicap: 5 });
  expect(r.text()).toContain('Handicap saved');
  await r.unmount();
});

test('tokens are issued here: this period, the package count by default', async () => {
  const r = await renderScreen(<StaffAthletePanel member={member} role="owner" focus />, { path: '/portal/admin/households/hh1' });
  await r.click('Issue');
  expect(mockIssue).toHaveBeenCalledTimes(1);
  const [athleteId, periodKey, granted] = mockIssue.mock.calls[0];
  expect([athleteId, granted]).toEqual(['jordan', 6]);
  expect(periodKey).toMatch(/^\d{4}-\d{2}-01$/);
  expect(r.text()).toContain('Tokens issued');
  await r.unmount();
});

test('the links leave for the read-only views of this athlete', async () => {
  for (const [label, path] of [['Assessment results', '/portal/assessments/athlete/jordan'], ['Combine', '/portal/combine/jordan'], ['Coaching view: attendance and sessions', '/portal/athlete/jordan']]) {
    const r = await renderScreen(<StaffAthletePanel member={member} role="owner" focus />, { path: '/portal/admin/households/hh1' });
    await r.click(label);
    expect(r.location().pathname).toBe(path);
    await r.unmount();
  }
});

test('bookings further out than next period are listed with Move and Cancel; a Calendly 1:1 says where it changes', async () => {
  const row = (id, over = {}) => ({ id, kind: 'booking', athleteId: 'jordan', date: '2027-01-12', time: '4:00 PM', label: 'Training block', badge: 'Booked', status: 'confirmed', type: 'training', ...over });
  mockLater = {
    data: { athleteId: 'jordan', first: 'Jordan', test: false, period: { start: '2026-11-01' }, groups: { thisPeriod: [], nextPeriod: [], later: [row('jordan_a'), row('jordan_b', { source: 'calendly', type: 'mental', label: '1:1 with Yannick' })] } },
    loading: false, error: null,
  };
  const moved = [];
  const cancelled = [];
  const r = await renderScreen(<StaffAthletePanel member={member} role="owner" focus onMoveRow={(x) => moved.push(x.id)} onCancelRow={(x) => cancelled.push(x.id)} />, { path: '/portal/admin/households/hh1' });
  const later = r.container.querySelector('[data-staff-later="jordan"]');
  expect(later.textContent).toContain('Booked further out');
  const buttons = (id) => [...later.querySelectorAll(`[data-staff-row="${id}"] button`)];
  expect(buttons('jordan_a').map((b) => b.textContent.trim())).toEqual(['Move', 'Cancel']);
  expect(buttons('jordan_b')).toEqual([]);
  expect(later.querySelector('[data-staff-row="jordan_b"]').textContent).toContain('Cancel in Calendly');
  await r.act(async () => { buttons('jordan_a')[0].click(); });
  await r.act(async () => { buttons('jordan_a')[1].click(); });
  expect([moved, cancelled]).toEqual([['jordan_a'], ['jordan_a']]);
  await r.unmount();
});

test('a test athlete\'s rows further out offer Cancel only', async () => {
  const row = { id: 'jordan_a', kind: 'booking', athleteId: 'jordan', date: '2027-01-12', time: '4:00 PM', label: 'Training block', badge: 'Booked', status: 'confirmed', type: 'training' };
  mockLater = { data: { athleteId: 'jordan', first: 'Jordan', test: true, period: { start: '2026-11-01' }, groups: { thisPeriod: [], nextPeriod: [], later: [row] } }, loading: false, error: null };
  const r = await renderScreen(<StaffAthletePanel member={member} role="owner" focus onMoveRow={() => {}} onCancelRow={() => {}} />, { path: '/portal/admin/households/hh1' });
  const buttons = [...r.container.querySelectorAll('[data-staff-row="jordan_a"] button')].map((b) => b.textContent.trim());
  expect(buttons).toEqual(['Cancel']);
  await r.unmount();
});

test('an athlete with no package: the meter lists nothing, so every booking is listed here', async () => {
  const row = (id, date) => ({ id, kind: 'booking', athleteId: 'jordan', date, time: '4:00 PM', label: 'Training block', badge: 'Free', status: 'confirmed', type: 'training', comp: true });
  mockLater = {
    data: { athleteId: 'jordan', first: 'Jordan', test: false, period: { start: '2026-11-01' }, groups: { thisPeriod: [row('jordan_a', '2026-11-20')], nextPeriod: [row('jordan_b', '2026-12-03')], later: [] } },
    loading: false, error: null,
  };
  const none = await renderScreen(<StaffAthletePanel member={{ ...member, package: { id: 't-6' } }} role="owner" focus onMoveRow={() => {}} onCancelRow={() => {}} />, { path: '/portal/admin/households/hh1' });
  expect(none.container.querySelector('[data-staff-later]')).toBeNull();
  await none.unmount();
  const r = await renderScreen(<StaffAthletePanel member={{ ...member, package: null }} role="owner" focus onMoveRow={() => {}} onCancelRow={() => {}} />, { path: '/portal/admin/households/hh1' });
  const list = r.container.querySelector('[data-staff-later="jordan"]');
  expect(list.textContent).toContain('Bookings');
  expect([...list.querySelectorAll('[data-staff-row]')].map((x) => x.getAttribute('data-staff-row'))).toEqual(['jordan_a', 'jordan_b']);
  await r.unmount();
});

test('a save reloads the record: the editors stay up on what they had, with their note', async () => {
  const r = await renderScreen(<StaffAthletePanel member={member} role="owner" focus />, { path: '/portal/admin/households/hh1' });
  await r.click('Issue');
  expect(r.text()).toContain('Tokens issued');
  // The detail clears its data while it reloads (useSeedResource).
  mockDetail = { data: null, loading: true, error: null };
  await r.rerender(<StaffAthletePanel member={member} role="owner" focus />);
  expect(r.text()).toContain('Tokens issued');
  expect(r.button('Save membership')).not.toBeNull();
  expect(r.text()).not.toContain('Loading…');
  await r.unmount();
});

test('nothing further out: no empty card', async () => {
  const r = await renderScreen(<StaffAthletePanel member={member} role="owner" focus />, { path: '/portal/admin/households/hh1' });
  expect(r.container.querySelector('[data-staff-later]')).toBeNull();
  await r.unmount();
});

test('the record did not load: the section says so and offers no editor', async () => {
  mockDetail = { data: null, loading: false, error: new Error('offline') };
  const r = await renderScreen(<StaffAthletePanel member={member} role="owner" focus />, { path: '/portal/admin/households/hh1' });
  expect(r.text()).toContain("This athlete's details didn't load.");
  expect(r.button('Save membership')).toBeNull();
  await r.unmount();
});

describe('Advanced: the family\'s own settings, once, folded away', () => {
  test('closed by default; open shows the billing day and the Stripe ids', async () => {
    const r = await renderScreen(<StaffFamilyAdvanced householdId="hh1" anchorDay={1} />);
    expect(r.text()).toContain('Advanced');
    expect(r.text()).not.toContain('Save Stripe ids');
    await r.act(async () => { r.container.querySelector('button[aria-expanded="false"]').click(); });
    expect(r.text()).toContain('Save Stripe ids');
    expect(r.text()).toContain('These apply to every athlete in the family.');
    await r.unmount();
  });

  test('nothing without a household', async () => {
    const r = await renderScreen(<StaffFamilyAdvanced householdId={null} />);
    expect(r.text()).toBe('');
    await r.unmount();
  });
});
