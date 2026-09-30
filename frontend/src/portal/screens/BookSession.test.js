import React, { act } from 'react';
import { renderScreen } from './testRender';
import BookSession from './BookSession';

const BEFORE = new Date('2026-10-09T12:00:00Z'); // Fri Oct 9, 07:00 Chicago - the day before
const AT_OPEN = new Date('2026-10-10T12:00:00Z'); // BOOKING_OPENS_AT exactly
const session = { id: 's1', date: '2026-10-12', time: '4:00 PM', type: 'training', label: 'Training block', capacity: 6, booked: 2 };
let mockPackage;
let mockBooked;
let mockTokens;
let mockBillingStatus;
jest.mock('../hooks', () => ({
  useBooking: () => ({
    data: { slots: [{ date: '2026-10-12' }], tokens: mockTokens, confirmation: { email: null, note: 'See you there.' }, seasonNote: null },
    loading: false, error: null,
    book: async (s) => { mockBooked.push(s.id); return {}; },
    bookRecurring: async () => ({}),
    // Truthy so the confirmation offers Repeat weekly whenever it may.
    bookingFor: 'a1',
  }),
  useHouseholdAthletes: () => ({ data: [], loading: false }),
  useMembership: () => ({ data: { members: [{ athleteId: 'a1', package: mockPackage, billingStatus: mockBillingStatus }] } }),
  useMonthSessions: () => ({ data: { days: [{ date: '2026-10-12', sessions: [session] }] }, loading: false, error: null }),
}));
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label, variant }) => <button type="button">{label}|{athleteId}|{product}|{variant}</button> }));

/** The tapped day's session card: tappable cards carry cursor: pointer (SessionCard sets it from onClick). */
const sessionCard = (r) =>
  [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith('4:00') && el.textContent.includes('Training block')) || null;

beforeEach(() => {
  mockBooked = [];
  mockPackage = { id: 't-12', kind: 'tokens', windowDays: 30 };
  mockTokens = { left: 6, unlimited: false, grace: [] };
  mockBillingStatus = 'active';
  jest.useFakeTimers('modern');
});
afterEach(() => { jest.useRealTimers(); });

test('before Oct 10 a token athlete sees the banner and cannot reserve', async () => {
  jest.setSystemTime(BEFORE);
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
  expect(r.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
  const card = sessionCard(r);
  expect(card).not.toBeNull();
  expect(card.style.cursor).toBe('default');
  await act(async () => { card.click(); });
  expect(mockBooked).toEqual([]);
  expect(r.text()).not.toContain('Slot reserved');
  await r.unmount();
});

test('at 07:00 Chicago on Oct 10 the banner is gone and a tap reserves', async () => {
  jest.setSystemTime(AT_OPEN);
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
  expect(r.text()).not.toContain('Booking opens Sat, Oct 10 at 7 AM');
  const card = sessionCard(r);
  expect(card.style.cursor).toBe('pointer');
  await act(async () => { card.click(); });
  expect(mockBooked).toEqual(['s1']);
  expect(r.text()).toContain('Slot reserved');
  await r.unmount();
});

test('Elite books before the gate (the paid package, spec 4.3)', async () => {
  jest.setSystemTime(BEFORE);
  mockPackage = { id: 'elite', kind: 'elite', windowDays: 45 };
  const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
  expect(r.text()).not.toContain('Booking opens Sat, Oct 10 at 7 AM');
  expect(sessionCard(r).style.cursor).toBe('pointer');
  await r.unmount();
});

describe('the single token (owner rulings 2026-09-29/30)', () => {
  const SINGLE = { id: 'single', kind: 'single', windowDays: 30 };
  const bought = { id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase', sourceSessionId: null };
  const singleTokens = (grace) => ({ granted: 0, used: 0, reserved: 0, left: 0, unlimited: false, perPurchase: true, held: 0, grace });

  test('one token: a tappable card, a session-token spend, and no Repeat weekly', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    mockTokens = singleTokens([bought]);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(r.text()).toContain('Your session tokens');
    expect(r.text()).toContain('1 session token - good through Sat, Feb 27');
    expect(r.button('Buy a session token - $65|a1|tier|outline')).not.toBeNull();
    const card = sessionCard(r);
    expect(card.style.cursor).toBe('pointer');
    expect(card.textContent).toContain('Uses a session token');
    await act(async () => { card.click(); });
    expect(mockBooked).toEqual(['s1']);
    expect(r.text()).toContain('Slot reserved');
    expect(r.text()).toContain('a session token');
    expect(r.text()).not.toContain('Repeat weekly');
    await r.unmount();
  });

  test('none left: a red No session token and the primary Buy button', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    mockTokens = singleTokens([]);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(r.text()).toContain('No session token');
    expect(r.button('Buy a session token - $65|a1|tier|primary')).not.toBeNull();
    expect(sessionCard(r).style.cursor).toBe('default');
    await r.unmount();
  });

  test('no Buy button while the athlete is not paid up', async () => {
    jest.setSystemTime(AT_OPEN);
    mockPackage = SINGLE;
    mockTokens = singleTokens([]);
    mockBillingStatus = 'pending';
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(r.text()).not.toContain('Buy a session token');
    await r.unmount();
  });

  test('a monthly athlete still gets Repeat weekly and the monthly banner', async () => {
    jest.setSystemTime(AT_OPEN);
    const r = await renderScreen(<BookSession bare demoSelectedDate="2026-10-12" />);
    expect(r.text()).toContain('Your tokens this period');
    expect(r.text()).not.toContain('Buy a session token');
    await act(async () => { sessionCard(r).click(); });
    expect(r.text()).toContain('Repeat weekly');
    await r.unmount();
  });
});
