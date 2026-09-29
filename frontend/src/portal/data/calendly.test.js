/**
 * The Calendly hand-off (Sprint 20, spec 6.1): the link the Yannick card
 * opens, built with URLSearchParams so names with apostrophes, plus-addresses
 * and ampersands survive the trip.
 */
import { CALENDLY_NOTE, calendlyLinkFor, calendlyUrlFor } from './calendly';
import { SPECIALISTS } from './specialists';

const args = {
  url: 'https://calendly.com/ryp/mental-30',
  athleteId: 'ath1',
  athleteName: "Ava O'Neil",
  householdId: 'hh1',
  name: 'Dana & Sam',
  email: 'dana+ryp@example.com',
};

describe('calendlyLinkFor', () => {
  test('encodes every parameter and the utm fields', () => {
    const link = calendlyLinkFor(args);
    const u = new URL(link);
    expect(u.origin + u.pathname).toBe('https://calendly.com/ryp/mental-30');
    expect(u.searchParams.get('name')).toBe('Dana & Sam');
    expect(u.searchParams.get('email')).toBe('dana+ryp@example.com');
    expect(u.searchParams.get('a1')).toBe("Ava O'Neil");
    expect(u.searchParams.get('utm_source')).toBe('ryp-portal');
    expect(u.searchParams.get('utm_medium')).toBe('portal');
    expect(u.searchParams.get('utm_content')).toBe('ath1');
    expect(u.searchParams.get('utm_campaign')).toBe('hh1');
    expect(link).toContain('email=dana%2Bryp%40example.com');
  });
  test('appends with & when the URL already has a query', () => {
    const link = calendlyLinkFor({ ...args, url: 'https://calendly.com/ryp/x?month=2026-10' });
    expect(link.startsWith('https://calendly.com/ryp/x?month=2026-10&name=')).toBe(true);
  });
  test('no URL means no link', () => {
    expect(calendlyLinkFor({ ...args, url: null })).toBeNull();
  });
});

describe('calendlyUrlFor / registry', () => {
  test('without env both URLs are null, so the in-app slot list stays', () => {
    expect(calendlyUrlFor({ kind: 'elite' })).toBeNull();
    expect(calendlyUrlFor({ kind: 'tokens' })).toBeNull();
  });
  test('the note names Calendly and the token', () => {
    expect(CALENDLY_NOTE).toBe("Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute and spends one token.");
  });
  test('mental is Calendly-booked at 30 minutes; Phil in-app at 45', () => {
    const mental = SPECIALISTS.find((s) => s.id === 'mental');
    const phil = SPECIALISTS.find((s) => s.id === 'phil');
    expect(mental).toMatchObject({ bookingMode: 'calendly', durationMinutes: 30 });
    expect(phil.durationMinutes).toBe(45);
    expect(phil.bookingMode).toBeUndefined();
  });
});
