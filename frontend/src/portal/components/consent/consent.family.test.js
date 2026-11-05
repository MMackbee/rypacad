import React from 'react';
import { renderScreen } from '../../screens/testRender';

let mockConsents;
const mockFamilyCalls = [];
jest.mock('../../hooks/mentalConsent', () => ({
  useFamilyConsents: (opts) => { mockFamilyCalls.push(opts ?? {}); return mockConsents; },
}));
// Task 15's staff branch: never called for a family role.
const mockStaff = jest.fn(() => ({ data: null, loading: false, error: null }));
jest.mock('../../hooks/mentalConsentStaff', () => ({ useStaffConsent: (...a) => mockStaff(...a) }));
import ConsentLine from './ConsentLine';
import ConsentHomeCard from './ConsentHomeCard';
import ConsentAthleteHomeLine from './ConsentAthleteHomeLine';
import ConsentDetailCard from './ConsentDetailCard';
import { consentBookingFootnote } from './ConsentBookingLine';

const SIGNED_AT = new Date('2026-10-30T17:00:00Z');
const minorRecord = {
  adult: false, adultSignature: null, signedAt: SIGNED_AT, signer: { role: 'parent', name: 'Dana Whitfield' },
  assent: { name: 'Jordan', audio: true, at: SIGNED_AT, readAloud: false, withdrawnBy: null }, choices: { audio: true, location: 'B', driving: null },
};
const adultRecord = { adult: true, adultSignature: null, signedAt: SIGNED_AT, signer: { role: 'athlete', name: 'Max Test' }, assent: null, choices: { audio: true, location: 'C' } };
/** A FamilyRow (plan Task 8). */
const row = (over = {}) => ({
  athleteId: 'reese', name: 'Reese Whitfield', firstName: 'Reese', viewer: 'parent', status: 'unsigned', record: null, adultToday: false,
  claimedLogin: false, drivingUnanswered: false, nextMental: null, draft: null, ...over,
});
const unsignedReese = row({ nextMental: { date: '2026-11-12', attendee: 'athlete' } });
const signedJordan = row({ athleteId: 'jordan', name: 'Jordan Whitfield', firstName: 'Jordan', status: 'signed', record: minorRecord });
const claimedAdult = row({ athleteId: 'max', name: 'Max Test', firstName: 'Max', status: 'signed', record: adultRecord, adultToday: true, claimedLogin: true });

beforeEach(() => {
  mockConsents = { data: null, loading: false, error: null };
  mockFamilyCalls.length = 0;
  mockStaff.mockClear();
});

test('ConsentLine: the line and the button that opens the flow', async () => {
  const r = await renderScreen(<ConsentLine row={unsignedReese} />, { path: '/portal/family' });
  expect(r.text()).toContain('Mental performance consent · Not signed');
  await r.click('Sign now');
  expect(r.location().pathname).toBe('/portal/consent/mental/reese');
  await r.unmount();
});

test('ConsentLine: Change choices opens ?change=1; no button for a claimed adult', async () => {
  const r = await renderScreen(<ConsentLine row={signedJordan} />, { path: '/portal/family' });
  expect(r.text()).toContain('Mental performance consent · Signed Oct 30 by Dana');
  await r.click('Change choices');
  expect(r.location().pathname).toBe('/portal/consent/mental/jordan');
  expect(r.location().search).toBe('?change=1');
  await r.unmount();
  const adult = await renderScreen(<ConsentLine row={claimedAdult} />, { path: '/portal/family' });
  expect(adult.text()).toContain('Mental performance consent · Signed Oct 30 · Max manages this');
  expect(adult.container.querySelector('button')).toBeNull();
  await adult.unmount();
});

test('ConsentLine: its button does not open the card it sits on', async () => {
  const onCard = jest.fn();
  const r = await renderScreen(<div onClick={onCard}><ConsentLine row={unsignedReese} /></div>, { path: '/portal/family' });
  await r.click('Sign now');
  expect(onCard).not.toHaveBeenCalled();
  await r.unmount();
});

test('ConsentHomeCard: the card for Reese, nothing when no 1:1 is booked', async () => {
  const r = await renderScreen(<ConsentHomeCard rows={[signedJordan, unsignedReese]} />, { path: '/portal/family' });
  expect(r.text()).toContain("Sign Yannick's consent for Reese before the session on Thu, Nov 12");
  await r.click('Sign now');
  expect(r.location().pathname).toBe('/portal/consent/mental/reese');
  await r.unmount();
  const none = await renderScreen(<ConsentHomeCard rows={[signedJordan, row()]} />);
  expect(none.container.textContent).toBe('');
  await none.unmount();
  const loading = await renderScreen(<ConsentHomeCard rows={undefined} />);
  expect(loading.container.textContent).toBe('');
  await loading.unmount();
});

test('ConsentAthleteHomeLine: a minor login sees Stop recording; an unsigned minor login sees nothing', async () => {
  mockConsents = { data: { viewer: 'athlete', rows: [{ ...signedJordan, viewer: 'athlete' }], byId: {} }, loading: false, error: null };
  const r = await renderScreen(<ConsentAthleteHomeLine />, { path: '/portal/home' });
  expect(mockFamilyCalls[0]).toEqual({ as: 'athlete', practice: false });
  expect(r.text()).toContain('Signed Oct 30 · Your parent manages this · Recording: yes');
  await r.click('Stop recording');
  expect(r.location().pathname).toBe('/portal/consent/mental');
  expect(r.location().search).toBe('?withdraw=1');
  await r.unmount();

  mockConsents = { data: { viewer: 'athlete', rows: [row({ athleteId: 'jordan', viewer: 'athlete' })], byId: {} }, loading: false, error: null };
  const unsigned = await renderScreen(<ConsentAthleteHomeLine />);
  expect(unsigned.container.textContent).toBe('');
  await unsigned.unmount();

  // 18+: the line always shows, with its own action.
  mockConsents = { data: { viewer: 'athlete', rows: [row({ athleteId: 'max', firstName: 'Max', viewer: 'athlete', adultToday: true })], byId: {} }, loading: false, error: null };
  const adult = await renderScreen(<ConsentAthleteHomeLine />);
  expect(adult.text()).toContain('Mental performance consent · Not signed');
  expect(adult.button('Sign now')).not.toBeNull();
  await adult.unmount();
});

test('consentBookingFootnote: mental and confirmed and upcoming only', async () => {
  const item = { type: 'mental', status: 'confirmed' };
  const note = consentBookingFootnote({ item, row: unsignedReese, past: false });
  expect(note).not.toBeNull();
  const r = await renderScreen(note, { path: '/portal/reservations' });
  expect(r.text()).toBe('Consent needed · Sign');
  await r.click('Sign');
  expect(r.location().pathname).toBe('/portal/consent/mental/reese');
  await r.unmount();
  expect(consentBookingFootnote({ item: { ...item, type: 'training' }, row: unsignedReese, past: false })).toBeNull();
  expect(consentBookingFootnote({ item: { ...item, status: 'cancelled' }, row: unsignedReese, past: false })).toBeNull();
  expect(consentBookingFootnote({ item, row: unsignedReese, past: true })).toBeNull();
  expect(consentBookingFootnote({ item, row: signedJordan, past: false })).toBeNull();
  expect(consentBookingFootnote({ item, row: undefined, past: false })).toBeNull();
  const own = await renderScreen(consentBookingFootnote({ item, row: row({ athleteId: 'jordan', viewer: 'athlete' }), past: false }));
  expect(own.text()).toBe('Consent needed · Your parent signs this');
  expect(own.container.querySelector('button')).toBeNull();
  await own.unmount();
});

test("ConsentDetailCard: a parent sees the athlete's line; a coach and Yannick see nothing", async () => {
  mockConsents = { data: { viewer: 'parent', rows: [unsignedReese], byId: { reese: unsignedReese } }, loading: false, error: null };
  const r = await renderScreen(<ConsentDetailCard athleteId="reese" role="parent" />);
  expect(r.text()).toContain('Mental performance consent · Not signed');
  await r.unmount();
  for (const role of ['coach', 'mental']) {
    mockFamilyCalls.length = 0;
    const other = await renderScreen(<ConsentDetailCard athleteId="reese" role={role} />);
    expect(other.container.textContent).toBe('');
    expect(mockFamilyCalls).toHaveLength(0);
    expect(mockStaff).not.toHaveBeenCalled();
    await other.unmount();
  }
});
