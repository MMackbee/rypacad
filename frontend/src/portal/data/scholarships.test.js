import {
  SCHOLARSHIP_FILTERS, ageOn, athleteLine, decisionActions, deleteWarnings, emailStatusLabel, emptyCopy, filterScholarships, guardianLine, mailtoHref, requestLine,
  scholarshipCounts, sentLine, sortScholarships, statusOf, submissionsLabel, submittedLabel, telHref, updatedSinceDecision,
} from './scholarships';

// Spelled in two halves so the lint rule against script URLs does not read these test strings as one.
const JS = ['java', 'script:'].join('');

const app = (id, status, updatedAtMs, extra = {}) => ({ id, status, createdAtMs: updatedAtMs, updatedAtMs, ...extra });
const rows = [app('a', 'new', 100), app('b', 'approved', 300), app('c', 'declined', 200), app('d', 'new', 400), app('e', 'nonsense', 50), app('f', undefined, 10)];

test('status, counts and filters: New, Approved, Declined, All', () => {
  expect(SCHOLARSHIP_FILTERS.map(([k, l]) => `${k}:${l}`)).toEqual(['new:New', 'approved:Approved', 'declined:Declined', 'all:All']);
  // A status this build does not know still needs a decision, so it reads as new.
  expect(rows.map(statusOf)).toEqual(['new', 'approved', 'declined', 'new', 'new', 'new']);
  expect(statusOf(null)).toBe('new');
  expect(scholarshipCounts(rows)).toEqual({ new: 4, approved: 1, declined: 1, all: 6 });
  expect(scholarshipCounts(null)).toEqual({ new: 0, approved: 0, declined: 0, all: 0 });
  expect(filterScholarships(rows, 'new').map((r) => r.id)).toEqual(['a', 'd', 'e', 'f']);
  expect(filterScholarships(rows, 'approved').map((r) => r.id)).toEqual(['b']);
  expect(filterScholarships(rows, 'declined').map((r) => r.id)).toEqual(['c']);
  expect(filterScholarships(rows, 'all')).toHaveLength(6);
  expect(filterScholarships(undefined, 'new')).toEqual([]);
});

test('newest first, by the latest time the family sent it; the input is not reordered', () => {
  const before = rows.map((r) => r.id);
  expect(sortScholarships(rows).map((r) => r.id)).toEqual(['d', 'b', 'c', 'a', 'e', 'f']);
  expect(rows.map((r) => r.id)).toEqual(before);
  // A row with no updatedAtMs falls back to when it was first sent; a tie keeps a stable order by id.
  expect(sortScholarships([{ id: 'x', createdAtMs: 500 }, app('z', 'new', 500), app('y', 'new', 500), { id: 'w' }]).map((r) => r.id)).toEqual(['x', 'y', 'z', 'w']);
  expect(sortScholarships(null)).toEqual([]);
});

test('age from the date of birth, on a given day', () => {
  expect(ageOn('2012-05-01', '2026-10-01')).toBe(14);
  expect(ageOn('2012-10-01', '2026-10-01')).toBe(14); // the birthday itself
  expect(ageOn('2012-10-02', '2026-10-01')).toBe(13); // the day before it
  expect(ageOn('2012-02-29', '2027-02-28')).toBe(14); // leap-day birthday, a common year: not 15 until Mar 1
  expect(ageOn('2012-05-01', new Date(2026, 9, 1))).toBe(14);
  for (const bad of ['', null, undefined, 'May 1', '2012-13-40', '2012-5-1', 20120501, '2030-01-01']) {
    expect(ageOn(bad, '2026-10-01')).toBeNull();
  }
  expect(ageOn('2012-05-01', 'not a day')).toBeNull();
});

test('row and detail lines', () => {
  const a = { athlete: 'Sam Hart', dob: '2012-05-01', package: '12 tokens', level: 'Partial', parent: 'Dana Hart', relationship: 'Parent', submissions: 1, email_status: 'sent' };
  expect(athleteLine(a, '2026-10-01')).toBe('Sam Hart · 14');
  expect(athleteLine({ ...a, dob: 'nope' }, '2026-10-01')).toBe('Sam Hart');
  expect(athleteLine({}, '2026-10-01')).toBe('No name given');
  expect(requestLine(a)).toBe('12 tokens · Partial assistance');
  expect(requestLine({ package: 'Not sure yet', level: 'Full' })).toBe('Package not chosen · Full assistance');
  expect(requestLine({})).toBe('Package not chosen · assistance not stated');
  expect(guardianLine(a)).toBe('Dana Hart · Parent');
  expect(guardianLine({ parent: 'Lee Park', relationship: 'Guardian' })).toBe('Lee Park · Guardian');
  expect(guardianLine({ parent: 'Lee Park' })).toBe('Lee Park');
  expect(submissionsLabel(a)).toBe('Sent once');
  expect(submissionsLabel({ submissions: 3 })).toBe('Sent 3 times');
  expect(submissionsLabel({})).toBe('Sent once');
  expect(emailStatusLabel(a)).toBe('Sent');
  expect(emailStatusLabel({ email_status: 'failed' })).toBe('Not sent');
  expect(emailStatusLabel({ email_status: 'skipped' })).toBe('Not sent');
  expect(emailStatusLabel({})).toBe('Not sent');
  // The device's own clock, like every other time in the portal.
  expect(submittedLabel(new Date(2026, 9, 1, 14, 5).getTime())).toBe('Thu, Oct 1, 2026 · 2:05 PM');
  for (const bad of [null, undefined, 0, 'soon', NaN]) expect(submittedLabel(bad)).toBe('—');
  const first = new Date(2026, 9, 1, 14, 5).getTime();
  const again = new Date(2026, 9, 3, 9, 0).getTime();
  expect(sentLine({ submissions: 1, createdAtMs: first, updatedAtMs: first })).toBe('Sent Thu, Oct 1, 2026 · 2:05 PM');
  expect(sentLine({ submissions: 2, createdAtMs: first, updatedAtMs: again })).toBe('Sent again Sat, Oct 3, 2026 · 9:00 AM');
  expect(sentLine({})).toBe('Sent —');
});

test('"Updated since your decision": the family sent it again after the owner decided', () => {
  expect(updatedSinceDecision({ status: 'approved', decidedAtMs: 1000, updatedAtMs: 2000 })).toBe(true);
  expect(updatedSinceDecision({ status: 'declined', decidedAtMs: 1000, updatedAtMs: 2000 })).toBe(true);
  expect(updatedSinceDecision({ status: 'approved', decidedAtMs: 2000, updatedAtMs: 1000 })).toBe(false);
  expect(updatedSinceDecision({ status: 'approved', decidedAtMs: 2000, updatedAtMs: 2000 })).toBe(false);
  // Not decided, or no decision time to compare with: never claimed.
  expect(updatedSinceDecision({ status: 'new', decidedAtMs: 1000, updatedAtMs: 2000 })).toBe(false);
  expect(updatedSinceDecision({ status: 'approved', decidedAtMs: null, updatedAtMs: 2000 })).toBe(false);
  expect(updatedSinceDecision({ status: 'approved', updatedAtMs: 2000 })).toBe(false);
  expect(updatedSinceDecision(null)).toBe(false);
});

test('the three decisions keep their order whatever the status; the one the application already is comes back flagged, never dropped', () => {
  expect(decisionActions({ status: 'new' })).toEqual([['approved', 'Approve', false], ['declined', 'Decline', false], ['new', 'Reopen', true]]);
  expect(decisionActions({ status: 'approved' })).toEqual([['approved', 'Approve', true], ['declined', 'Decline', false], ['new', 'Reopen', false]]);
  expect(decisionActions({ status: 'declined' })).toEqual([['approved', 'Approve', false], ['declined', 'Decline', true], ['new', 'Reopen', false]]);
  // A status this build does not know reads as new, so it can be approved or declined and has nothing to reopen.
  expect(decisionActions({ status: 'paid' }).map(([, , current]) => current)).toEqual([false, false, true]);
  // No button ever moves: the same status sits in the same place for every application.
  for (const status of ['new', 'approved', 'declined']) expect(decisionActions({ status }).map(([s]) => s)).toEqual(['approved', 'declined', 'new']);
});

test('before a delete: it cannot be undone, and the emailed copies are not deleted - whoever the application is for', () => {
  const email = "Copies emailed to the director are not deleted. Delete them from the academy's email by hand.";
  expect(deleteWarnings({ athlete: ' Sam Hart ' })).toEqual(["Sam Hart's application will be deleted from the portal. This cannot be undone.", email]);
  // No name to restate: both warnings are still said.
  for (const app of [{ athlete: '   ' }, { athlete: 7 }, {}, null, undefined]) {
    expect(deleteWarnings(app)).toEqual(['This application will be deleted from the portal. This cannot be undone.', email]);
  }
  // The same two warnings whatever the status, and whether or not the last email went out: earlier ones may have.
  for (const extra of [{ status: 'approved' }, { status: 'declined' }, { email_status: 'failed' }, { submissions: 3 }]) {
    expect(deleteWarnings({ athlete: 'Sam Hart', ...extra })).toEqual(deleteWarnings({ athlete: 'Sam Hart' }));
  }
});

test('empty copy: nothing at all, or nothing under this filter', () => {
  expect(emptyCopy('new', 0)).toBe('No applications yet.');
  expect(emptyCopy('all', 0)).toBe('No applications yet.');
  expect(emptyCopy('new', 4)).toBe('No new applications.');
  expect(emptyCopy('approved', 4)).toBe('No approved applications.');
  expect(emptyCopy('declined', 4)).toBe('No declined applications.');
});

describe('contact links never carry what an applicant typed as anything but an address or a number', () => {
  const hostileEmails = [
    `${JS}alert(1)`,
    `${JS}alert(1)//@example.com`,
    `${JS.toUpperCase()}alert(1)@example.com`,
    'data:text/html,<script>alert(1)</script>@example.com',
    'dana@example.com?subject=Hi',
    'dana@example.com?bcc=evil@example.net',
    'dana@example.com&cc=evil@example.net',
    'dana@example.com&body=hello',
    'dana?subject=x&body=y@example.com',
    'dana@example.com\nBcc: evil@example.net',
    'dana@example.com\r\nBcc: evil@example.net',
    'dana@example.com%0ABcc:evil@example.net',
    'dana smith@example.com',
    'dana@exa mple.com',
    'dana@example.com,evil@example.net',
    'dana,evil@example.com',
    'dana@example.com#frag',
    '"><img src=x onerror=alert(1)>@example.com',
    'mailto:dana@example.com',
    'tel:+16125550100@example.com',
    'dana@@example.com',
    '@example.com',
    'dana@',
    '',
    null,
    undefined,
    42,
    { toString: () => 'dana@example.com' },
    `${'a'.repeat(250)}@example.com`,
  ];

  test('mailto: a plain address links; anything else is no link at all, or one inert recipient', () => {
    expect(mailtoHref('dana@example.com')).toBe('mailto:dana@example.com');
    expect(mailtoHref('  dana.hart+golf@mail.example.co.uk ')).toBe('mailto:dana.hart%2Bgolf@mail.example.co.uk');
    for (const value of hostileEmails) {
      const href = mailtoHref(value);
      if (href === null) continue;
      // One scheme, chosen here; no query, no fragment, no second recipient, no raw whitespace or colon after it.
      expect(href.startsWith('mailto:')).toBe(true);
      const rest = href.slice('mailto:'.length);
      expect(rest).toMatch(/^[A-Za-z0-9._~!'()*%-]+@[A-Za-z0-9._~!'()*%-]+$/);
      const url = new URL(href);
      expect(url.protocol).toBe('mailto:');
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
    }
    // Whitespace, a second @ or no @ at all: not an address, so no link.
    for (const value of [`${JS}alert(1)`, 'dana@example.com\nBcc: evil@example.net', 'dana smith@example.com', 'dana@example.com?bcc=evil@example.net',
      'dana@example.com,evil@example.net', '', null, 42]) {
      expect(mailtoHref(value)).toBeNull();
    }
    // What can still link is spelled as data: the scheme and the separators are percent-encoded into the one recipient.
    expect(mailtoHref(`${JS}alert(1)//@example.com`)).toBe('mailto:javascript%3Aalert(1)%2F%2F@example.com');
    expect(mailtoHref('dana@example.com?subject=Hi')).toBe('mailto:dana@example.com%3Fsubject%3DHi');
    expect(mailtoHref('dana@example.com&cc=x')).toBe('mailto:dana@example.com%26cc%3Dx');
    expect(mailtoHref('dana@example.com%0ABcc:x')).toBe('mailto:dana@example.com%250ABcc%3Ax');
    // Half of a surrogate pair cannot be percent-encoded: no link, and no throw while the application renders.
    for (const value of ['a\uD800@example.com', 'dana@example.c\uDC00', '\uDC00\uD800@example.com']) {
      expect(() => mailtoHref(value)).not.toThrow();
      expect(mailtoHref(value)).toBeNull();
    }
    // A whole pair is an ordinary character and still links as one recipient.
    expect(mailtoHref('dana𝄞@example.com')).toBe('mailto:dana%F0%9D%84%9E@example.com');
  });

  const hostilePhones = [
    `${JS}alert(1)`,
    `${JS}6125550100`,
    '612-555-0100?x=1&y=2',
    '612-555-0100&body=hi',
    '612-555-0100\n+19005550199',
    '612 555 0100',
    '(612) 555-0100;ext=9',
    '612-555-0100,,,900',
    '612-555-0100 x12',
    '+1 612 555 0100',
    '++1 612 555 0100',
    'tel:6125550100',
    'sms:6125550100',
    '//6125550100',
    '6125550100#1234',
    '6125550100*67',
    '<script>6125550100</script>',
    '555',
    '1'.repeat(40),
    '',
    null,
    undefined,
    6125550100,
  ];

  test('tel: digits only, with an optional leading +; anything else is no link', () => {
    expect(telHref('612-555-0100')).toBe('tel:6125550100');
    expect(telHref('(612) 555-0100')).toBe('tel:6125550100');
    expect(telHref('612.555.0100')).toBe('tel:6125550100');
    expect(telHref(' +1 612 555 0100 ')).toBe('tel:+16125550100');
    for (const value of hostilePhones) {
      const href = telHref(value);
      expect(href === null || /^tel:\+?\d{10,15}$/.test(href)).toBe(true);
    }
    // An extension, a pause or a second number is never dialled: the link stops at the first number.
    expect(telHref('612-555-0100 x12')).toBe('tel:6125550100');
    expect(telHref('(612) 555-0100;ext=9')).toBe('tel:6125550100');
    expect(telHref('612-555-0100,,,900')).toBe('tel:6125550100');
    expect(telHref('612-555-0100\n+19005550199')).toBe('tel:6125550100');
    expect(telHref('612-555-0100?x=1&y=2')).toBe('tel:6125550100');
    expect(telHref('6125550100#1234')).toBe('tel:6125550100');
    expect(telHref('6125550100*67')).toBe('tel:6125550100');
    // Text before the number, too few or too many digits, or not a string: no link.
    for (const value of [`${JS}alert(1)`, `${JS}6125550100`, 'tel:6125550100', 'sms:6125550100', '<script>6125550100</script>', '555', '1'.repeat(40), '', null, undefined, 6125550100]) {
      expect(telHref(value)).toBeNull();
    }
  });
});
