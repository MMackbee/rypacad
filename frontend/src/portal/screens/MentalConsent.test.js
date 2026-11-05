import React from 'react';
import { renderScreen } from './testRender';

let mockRows;
const mockWithdraw = jest.fn();
jest.mock('../hooks/mentalConsent', () => ({
  useFamilyConsents: () => ({ data: mockRows ? { viewer: mockRows[0]?.viewer ?? 'parent', rows: mockRows, byId: {} } : null, loading: false, error: null }),
  withdrawRecording: (...a) => mockWithdraw(...a),
}));
import MentalConsent from './MentalConsent';

const SIGNED_AT = new Date('2026-10-30T17:00:00Z');
const minorRecord = {
  adult: false, adultSignature: null, signedAt: SIGNED_AT, signer: { role: 'parent', name: 'Dana Whitfield' },
  assent: { name: 'Jordan', audio: true, at: SIGNED_AT, readAloud: false, withdrawnBy: null }, choices: { audio: true, location: 'B' },
};
/** A FamilyRow (plan Task 8). */
const row = (over = {}) => ({
  athleteId: 'jordan', name: 'Jordan Whitfield', firstName: 'Jordan', viewer: 'parent', status: 'unsigned', record: null, adultToday: false,
  claimedLogin: false, drivingUnanswered: false, nextMental: null, draft: null, ...over,
});

beforeEach(() => {
  mockRows = null;
  mockWithdraw.mockReset();
  mockWithdraw.mockResolvedValue({ athleteId: 'jordan' });
});

test('one row opens its flow on mount, replacing the list', async () => {
  mockRows = [row({ athleteId: 'ava', name: 'Ava Test', firstName: 'Ava' })];
  const onOpen = jest.fn();
  const r = await renderScreen(<MentalConsent bare autoOpen onOpen={onOpen} />);
  expect(onOpen).toHaveBeenCalledWith('ava', { replace: true });
  await r.unmount();
});

test('back from the flow: the one-row list renders and never auto-opens', async () => {
  mockRows = [row({ athleteId: 'ava', name: 'Ava Test', firstName: 'Ava' })];
  const onOpen = jest.fn();
  const r = await renderScreen(<MentalConsent bare autoOpen={false} onOpen={onOpen} />);
  expect(r.text()).toContain('Ava Test');
  expect(r.text()).toContain('Not signed');
  expect(onOpen).not.toHaveBeenCalled();
  await r.unmount();
});

test('two rows: both names with their lines; tapping one opens it; the footer names Yannick by email', async () => {
  mockRows = [
    row({ status: 'signed', record: minorRecord }),
    row({ athleteId: 'reese', name: 'Reese Whitfield', firstName: 'Reese', nextMental: { date: '2026-11-12', attendee: 'athlete' } }),
  ];
  const onOpen = jest.fn();
  const r = await renderScreen(<MentalConsent bare autoOpen onOpen={onOpen} />, { path: '/portal/consent/mental' });
  expect(onOpen).not.toHaveBeenCalled();
  expect(r.text()).toContain('Jordan Whitfield');
  expect(r.text()).toContain('Signed Oct 30 by Dana');
  expect(r.text()).toContain('Reese Whitfield');
  expect(r.text()).toContain('Not signed');
  await r.click('Sign now');
  expect(onOpen).toHaveBeenCalledWith('reese');
  await r.click('Change choices');
  expect(r.location().pathname).toBe('/portal/consent/mental/jordan');
  expect(r.location().search).toBe('?change=1');
  expect(r.text()).toContain('Questions? Contact Yannick at yannick@rypgolf.com.');
  await r.unmount();
});
