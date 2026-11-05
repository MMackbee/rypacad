import React from 'react';
import { renderScreen } from './testRender';
import AdminSignups from './AdminSignups';

let mockSignups;
jest.mock('../hooks', () => ({ useSignups: () => mockSignups }));
beforeEach(() => {
  mockSignups = { loading: false, error: null, data: {
    counts: { all: 2, unpaid: 1, flagged: 1, unresolved: 1 },
    unresolved: [{ id: 'c9', outcome: 'unresolved', receivedAt: '2026-11-06T09:00', reason: 'ambiguous-household',
      invitee: { name: 'Dana Whitfield', email: 'dana@email.com', athleteName: null, parentEmail: null },
      slot: { date: '2026-11-10', time: '4:00 PM', durationMinutes: 30 }, eventName: 'RYP Academy - Mental Game 1:1' }],
    rows: [
      { householdId: 'h1', name: 'Whitfield family', signedUpAt: '2026-10-01T14:05', mode: 'parent', parent: { name: 'Dana', email: 'dana@email.com', phone: '612' },
        athletes: [{ athleteId: 'a1', name: 'Jordan', age: 14, packageId: 't-12', packageName: '12 tokens', handicap: 12, billing: 'pending', facility: null, login: 'none', loginEmail: null, loginClaimedAt: null }], flags: [], unpaid: true, flagged: false },
      { householdId: 'h2', name: 'Eisele family', signedUpAt: '2026-10-01T15:00', mode: 'athlete', parent: { name: 'Sam', email: 's@email.com', phone: '1' },
        athletes: [{ athleteId: 'a2', name: 'Sam', age: 19, packageId: 'elite', packageName: 'Elite', handicap: null, billing: 'active', facility: null, login: 'none', loginEmail: null, loginClaimedAt: null }],
        flags: [{ kind: 'calendly', id: 'c1', outcome: 'unresolved', receivedAt: '2026-11-05T10:00' }], unpaid: false, flagged: true },
    ],
  } };
});

test('rows, filters, the unmatched Calendly card and the household tap', async () => {
  const opened = [];
  const r = await renderScreen(<AdminSignups bare role="owner" onOpenHousehold={(id) => opened.push(id)} />);
  expect(r.text()).toContain('Jordan · 14 · 12 tokens · hcp 12');
  expect(r.text()).toContain('Payment pending');
  // Facility access is the family's (owner ruling 2026-09-30): named under each athlete of a covered household only.
  expect(r.text()).toContain('Login: none · Facility access: Elite');
  expect(r.text().match(/Facility access/g)).toHaveLength(1);
  expect(r.text()).toContain('Calendly unresolved · 2026-11-05');
  // D16: one flagged household + one unmatched booking = Flagged · 2.
  expect(r.button('Flagged · 2')).not.toBeNull();
  expect(r.text()).toContain('Unmatched Calendly bookings · 1');
  // Review 2026-11-04: the held-slot flow, both dates labelled, the reason in plain words.
  expect(r.text()).toContain("Since Nov 4 each one holds its time on Yannick's list until the owner links it to its family with the link script (scripts/calendly-unmatched.mjs)");
  // Review 2026-11-04 (follow-up): a booking cancelled or moved on Calendly is no longer listed (data/signups.js), and the
  // copy no longer says every listed booking still holds its time and needs linking.
  expect(r.text()).toContain('A booking the family cancels or moves on Calendly frees its time and leaves this list.');
  expect(r.text()).not.toContain('so no one else can take it');
  // Owner ruling 2026-11-04: only the RYP 1:1 is listed; an old line may be another of Yannick's meetings.
  expect(r.text()).toContain("Mental Game 1:1 bookings on Yannick's Calendly that the app could not match to a family");
  expect(r.text()).toContain("Since Nov 4 Yannick's other Calendly meetings, such as the website's free info call, are left off.");
  expect(r.text()).toContain('A line from before Nov 4 kept no details and may be one of them: check it in Calendly before linking it.');
  expect(r.text()).not.toContain('book it for them');
  // The line names the Calendly event and its length.
  expect(r.text()).toContain('session Tuesday, Nov 10 4:00 PM, 30 min (RYP Academy - Mental Game 1:1) · booked Friday, Nov 6 by Dana Whitfield, dana@email.com · family found, but not which athlete');
  await r.click('Unpaid · 1');
  expect(r.text()).toContain('Whitfield family');
  expect(r.text()).not.toContain('Eisele family');
  expect(r.text()).not.toContain('Unmatched Calendly bookings');
  await r.click('Flagged · 2');
  expect(r.text()).toContain('Eisele family');
  expect(r.text()).not.toContain('Whitfield family');
  expect(r.text()).toContain('Unmatched Calendly bookings · 1');
  await r.click('Eisele family');
  expect(opened).toEqual(['h2']);
  await r.unmount();
});

test('nothing unmatched: no card, Flagged counts households only', async () => {
  mockSignups.data = { ...mockSignups.data, counts: { all: 2, unpaid: 1, flagged: 1, unresolved: 0 }, unresolved: [] };
  const r = await renderScreen(<AdminSignups bare role="owner" />);
  expect(r.button('Flagged · 1')).not.toBeNull();
  expect(r.text()).not.toContain('Unmatched Calendly bookings');
  await r.unmount();
});
