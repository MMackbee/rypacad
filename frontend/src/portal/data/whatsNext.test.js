import { firstName, hasUnclaimedLogin, SEASON_START_LABEL, whatsNextFor } from './whatsNext';

const BEFORE_OPEN = Date.parse('2026-10-05T18:00:00Z');
const AFTER_OPEN = Date.parse('2026-10-12T18:00:00Z');
const IN_SEASON = Date.parse('2026-11-10T18:00:00Z');
const HOST = 'rypacad.ryptest.com';
const JORDAN = { name: 'Jordan Whitfield', loginEmail: 'jordan@email.com', login: { state: 'invited', claimedAt: null } };
const REESE = { name: 'Reese' };

test('token package before Oct 10: opens, season start, unclaimed login - three lines, no button', () => {
  expect(whatsNextFor({ packageId: 't-12', athlete: JORDAN, host: HOST, now: BEFORE_OPEN })).toEqual({
    title: "What's next",
    lines: [
      'Booking opens Sat, Oct 10 at 7 AM - book any training block, Tour event or Phil session then.',
      'Sessions start Tue, Nov 3.',
      'Jordan can sign in at rypacad.ryptest.com/portal/signin with jordan@email.com.',
    ],
    book: null,
    season: true,
  });
  for (const id of ['t-6', 't-16']) {
    expect(whatsNextFor({ packageId: id, athlete: REESE, host: HOST, now: BEFORE_OPEN }).lines).toEqual([
      'Booking opens Sat, Oct 10 at 7 AM - book any training block, Tour event or Phil session then.',
      'Sessions start Tue, Nov 3.',
    ]);
  }
});

test('elite: book now through Dec 16 (Nov 1 + 45), a primary book button - before Oct 10 too', () => {
  expect(whatsNextFor({ packageId: 'elite', athlete: REESE, host: HOST, now: BEFORE_OPEN })).toEqual({
    title: "What's next",
    lines: ['Reese can book now - training, Tour events and Phil, through Wed, Dec 16.'],
    book: "Book Reese's first session",
    season: false,
  });
  expect(whatsNextFor({ packageId: 'elite', athlete: JORDAN, host: HOST, now: BEFORE_OPEN }).lines).toEqual([
    'Jordan can book now - training, Tour events and Phil, through Wed, Dec 16.',
    'Jordan can sign in at rypacad.ryptest.com/portal/signin with jordan@email.com.',
  ]);
});

test('elite in season: the window rolls, so the copy goes back to 45 days ahead', () => {
  expect(whatsNextFor({ packageId: 'elite', athlete: REESE, now: IN_SEASON }).lines).toEqual([
    'Reese can book now - training, Tour events and Phil, up to 45 days ahead.',
  ]);
});

test('facility add-on payments show no card, whatever the package', () => {
  for (const packageId of ['t-6', 't-12', 't-16', 'elite']) {
    expect(whatsNextFor({ packageId, product: 'facility', athlete: JORDAN, host: HOST, now: BEFORE_OPEN })).toBeNull();
  }
  expect(whatsNextFor({ packageId: 't-12', product: 'tier', athlete: REESE, now: BEFORE_OPEN })).not.toBeNull();
});

test('no card without a token or Elite package', () => {
  expect(whatsNextFor({ packageId: 'single', athlete: REESE, now: BEFORE_OPEN })).toBeNull();
  expect(whatsNextFor({ packageId: null, athlete: REESE, now: BEFORE_OPEN })).toBeNull();
  expect(whatsNextFor({ packageId: 't-20', athlete: REESE, now: BEFORE_OPEN })).toBeNull();
});

test('the sign-in line only for an own login that is sent and unclaimed', () => {
  const line = (login, loginEmail = 'jordan@email.com') =>
    whatsNextFor({ packageId: 't-6', athlete: { name: 'Jordan', loginEmail, login }, host: HOST, now: BEFORE_OPEN }).lines.length;
  expect(line({ state: 'invited' })).toBe(3);
  expect(line({ state: 'invited-stale' })).toBe(3);
  expect(line({ state: 'claimed', claimedAt: '2026-09-20' })).toBe(2);
  expect(line({ state: 'none' })).toBe(2); // orphaned invite
  expect(line(undefined)).toBe(2); // legacy payload, no login key
  expect(line({ state: 'invited' }, null)).toBe(2); // the parent's account runs the child
  expect(hasUnclaimedLogin(null)).toBe(false);
});

test("the athlete's own home says you, and never shows the login line", () => {
  expect(whatsNextFor({ packageId: 'elite', athlete: JORDAN, self: true, host: HOST, now: BEFORE_OPEN })).toEqual({
    title: "What's next",
    lines: ['You can book now - training, Tour events and Phil, through Wed, Dec 16.'],
    book: 'Book your first session',
    season: false,
  });
  expect(whatsNextFor({ packageId: 't-12', athlete: JORDAN, self: true, host: HOST, now: BEFORE_OPEN }).lines).toHaveLength(2);
});

test('the clock: tokens can book once Oct 10 passes (through Dec 1 until Nov 1); the season line goes once sessions start', () => {
  expect(whatsNextFor({ packageId: 't-12', athlete: REESE, now: AFTER_OPEN })).toEqual({
    title: "What's next",
    lines: ['Reese can book now - training, Tour events and Phil, through Tue, Dec 1.', 'Sessions start Tue, Nov 3.'],
    book: "Book Reese's first session",
    season: true,
  });
  expect(whatsNextFor({ packageId: 't-12', athlete: REESE, now: IN_SEASON }).lines).toEqual([
    'Reese can book now - training, Tour events and Phil, up to 30 days ahead.',
  ]);
});

test('the family facility add-on ticked at sign-up and not yet paid adds one line, last (owner 2026-09-30)', () => {
  const FAMILY = "Family facility access: pay from your family page whenever you're ready.";
  expect(whatsNextFor({ packageId: 't-12', athlete: JORDAN, host: HOST, facilityDue: true, now: BEFORE_OPEN }).lines).toEqual([
    'Booking opens Sat, Oct 10 at 7 AM - book any training block, Tour event or Phil session then.',
    'Sessions start Tue, Nov 3.',
    'Jordan can sign in at rypacad.ryptest.com/portal/signin with jordan@email.com.',
    FAMILY,
  ]);
  expect(whatsNextFor({ packageId: 't-6', athlete: REESE, facilityDue: true, now: IN_SEASON }).lines).toEqual([
    'Reese can book now - training, Tour events and Phil, up to 30 days ahead.',
    FAMILY,
  ]);
  // The athlete's own home is their home page. It is still the family's add-on on a child's login, as the pending
  // card below it says; only the adult who is their own household (`selfManaged`) reads it without "family".
  expect(whatsNextFor({ packageId: 't-12', athlete: JORDAN, self: true, facilityDue: true, now: BEFORE_OPEN }).lines)
    .toContain("Family facility access: pay from your home page whenever you're ready.");
  expect(whatsNextFor({ packageId: 't-12', athlete: JORDAN, self: true, selfManaged: true, facilityDue: true, now: BEFORE_OPEN }).lines)
    .toContain("Facility access: pay from your home page whenever you're ready.");
  // Not asked, or already paid (facilityDue false): no line. Elite includes it.
  expect(whatsNextFor({ packageId: 't-12', athlete: REESE, now: BEFORE_OPEN }).lines.join(' ')).not.toMatch(/Facility/);
  expect(whatsNextFor({ packageId: 'elite', athlete: REESE, facilityDue: true, now: BEFORE_OPEN }).lines.join(' ')).not.toMatch(/Facility/);
  // The add-on's own payment return still shows no card.
  expect(whatsNextFor({ packageId: 't-12', product: 'facility', athlete: REESE, facilityDue: true, now: BEFORE_OPEN })).toBeNull();
});

test('first names and the fallback', () => {
  expect(firstName('  Jordan  Whitfield ')).toBe('Jordan');
  expect(firstName('')).toBeNull();
  expect(firstName(null)).toBeNull();
  expect(SEASON_START_LABEL).toBe('Tue, Nov 3');
  expect(whatsNextFor({ packageId: 'elite', athlete: null, now: BEFORE_OPEN }).book).toBe("Book your athlete's first session");
});
