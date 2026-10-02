/**
 * Scholarship applications (owner, 2026-10-01) - PURE helpers over the rows
 * useScholarships() returns: filters and counts, the order, the row and
 * detail copy, and the contact links. No Firestore, no clock of its own
 * (the day an age is counted on is passed in).
 *
 * Everything on a row was typed into a public form by someone the academy
 * has not met yet, so it is untrusted. The screens render it as text only;
 * the two places it becomes part of a URL (mailtoHref, telHref below) are
 * built so the scheme is chosen here and the typed value can only ever be
 * the address or the number.
 */
import { differenceInYears, format, isValid, parseISO } from 'date-fns';

/** The three labels an application can carry (firestore.rules admits no other). */
export const SCHOLARSHIP_STATUSES = ['new', 'approved', 'declined'];

export const SCHOLARSHIP_FILTERS = [['new', 'New'], ['approved', 'Approved'], ['declined', 'Declined'], ['all', 'All']];

/** Badge copy and tone. Declined is a settled answer, not an error, so it is not red. */
export const SCHOLARSHIP_STATUS = {
  new: { label: 'New', tone: 'yellow' },
  approved: { label: 'Approved', tone: 'green' },
  declined: { label: 'Declined', tone: 'neutral' },
};

/** A row's status; anything this build does not know still needs a decision, so it reads as new. */
export function statusOf(app) {
  return app && SCHOLARSHIP_STATUSES.includes(app.status) ? app.status : 'new';
}

export function scholarshipCounts(rows) {
  const counts = { new: 0, approved: 0, declined: 0, all: 0 };
  for (const row of rows || []) {
    counts[statusOf(row)] += 1;
    counts.all += 1;
  }
  return counts;
}

export function filterScholarships(rows, filter) {
  if (!SCHOLARSHIP_STATUSES.includes(filter)) return rows || [];
  return (rows || []).filter((r) => statusOf(r) === filter);
}

/** When the family last sent it (a resubmission moves updatedAtMs), else when it first arrived. */
export function sentMs(app) {
  return Number(app?.updatedAtMs) || Number(app?.createdAtMs) || 0;
}

/** Newest first by the latest submission, so an application sent again comes back to the top. A new array. */
export function sortScholarships(rows) {
  return [...(rows || [])].sort(
    (a, b) => sentMs(b) - sentMs(a) || (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0) || String(a.id).localeCompare(String(b.id))
  );
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whole years from a 'YYYY-MM-DD' date of birth to `on` (a 'YYYY-MM-DD' day
 * or a Date). Null when either is not a real date or the birth is after it.
 */
export function ageOn(dob, on) {
  if (typeof dob !== 'string' || !DAY_RE.test(dob)) return null;
  const born = parseISO(dob);
  const day = on instanceof Date ? on : typeof on === 'string' && DAY_RE.test(on) ? parseISO(on) : null;
  if (!day || !isValid(born) || !isValid(day) || born > day) return null;
  return Math.max(0, differenceInYears(day, born));
}

const typed = (v) => (typeof v === 'string' ? v.trim() : '');

/** "Sam Hart · 14" - the age is today's, from the date of birth, and is left off when that is not a date. */
export function athleteLine(app, on) {
  const age = ageOn(app?.dob, on);
  return `${typed(app?.athlete) || 'No name given'}${age != null ? ` · ${age}` : ''}`;
}

/** "12 tokens · Partial assistance" - what the family asked for. */
export function requestLine(app) {
  const pkg = typed(app?.package);
  const level = typed(app?.level);
  return `${pkg && pkg !== 'Not sure yet' ? pkg : 'Package not chosen'} · ${level ? `${level} assistance` : 'assistance not stated'}`;
}

/** "Dana Hart · Parent". */
export function guardianLine(app) {
  const relationship = typed(app?.relationship);
  return `${typed(app?.parent) || 'No name given'}${relationship ? ` · ${relationship}` : ''}`;
}

/** Epoch ms -> 'Thu, Oct 1, 2026 · 2:05 PM' on this device's clock. */
export function submittedLabel(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—';
  return format(new Date(ms), "EEE, MMM d, yyyy '·' h:mm a");
}

export function submissionsLabel(app) {
  const n = Number(app?.submissions) || 1;
  return n > 1 ? `Sent ${n} times` : 'Sent once';
}

/** The row's "when": "Sent Thu, Oct 1, 2026 · 2:05 PM", or "Sent again ..." once the family has resubmitted. */
export function sentLine(app) {
  return `${Number(app?.submissions) > 1 ? 'Sent again' : 'Sent'} ${submittedLabel(sentMs(app))}`;
}

/** Whether submitScholarship's email to the director went out ('sent'); 'failed' and 'skipped' both mean it did not. */
export function emailStatusLabel(app) {
  return app?.email_status === 'sent' ? 'Sent' : 'Not sent';
}

/**
 * True when the family sent the application again AFTER the owner decided
 * it: the decision is kept (functions/portal/scholarship.js), so the row says
 * the answers under it have changed. `decidedAtMs` is the hook's millisecond
 * copy of the server's decidedAt; without one there is nothing to compare.
 */
export function updatedSinceDecision(app) {
  if (!app || statusOf(app) === 'new') return false;
  const decided = app.decidedAtMs;
  return typeof decided === 'number' && Number.isFinite(decided) && Number(app.updatedAtMs) > decided;
}

const ACTION = { approved: 'Approve', declined: 'Decline', new: 'Reopen' };

/**
 * `[status, button label, current]` for the three moves - ALWAYS all three,
 * always in this order. The one the application already is comes back
 * flagged `current` (the screen disables it) instead of being dropped, so no
 * button changes meaning in place: a second tap that arrives just after a
 * decision saves lands on the same, now inert, button and not on a different
 * decision.
 */
export function decisionActions(app) {
  const current = statusOf(app);
  return ['approved', 'declined', 'new'].map((s) => [s, ACTION[s], s === current]);
}

/** The list's empty line: nothing has arrived at all, or nothing sits under this filter. */
export function emptyCopy(filter, total) {
  if (!total || !SCHOLARSHIP_STATUSES.includes(filter)) return 'No applications yet.';
  return `No ${filter} applications.`;
}

/** submitScholarship's own EMAIL_RE: one @, a dot after it, no whitespace anywhere. */
const ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * `mailto:` for an address an applicant typed, or null (render the text, no
 * link). The scheme is the literal written here. A value with whitespace, a
 * line break, a second @ or none is not an address and gets no link; both
 * sides of the one @ are percent-encoded, so `:`, `?`, `&`, `#`, `,` and `%`
 * in what was typed stay part of a single recipient and can never start
 * another scheme, add a header (?subject=, &bcc=) or name a second address.
 * A value that cannot be encoded at all (half of a surrogate pair) is no
 * link either: this runs while the application renders, so it never throws.
 */
export function mailtoHref(email) {
  if (typeof email !== 'string') return null;
  const address = email.trim();
  if (address.length > 200 || !ADDRESS_RE.test(address)) return null;
  const at = address.indexOf('@');
  try {
    return `mailto:${encodeURIComponent(address.slice(0, at))}@${encodeURIComponent(address.slice(at + 1))}`;
  } catch (err) {
    return null;
  }
}

/**
 * `tel:` for a number an applicant typed, or null. Only the digits of the
 * FIRST number are used, with a leading + kept: the read stops at the first
 * character that is not part of a written number (a letter, `:`, `?`, `&`,
 * `;`, `,`, `#`, `*`, a line break), so an extension, a pause, a second
 * number or a parameter is never dialled, and text before the number means
 * no link. 10 to 15 digits (the form asks for an area code; E.164 tops out
 * at 15).
 */
export function telHref(phone) {
  if (typeof phone !== 'string') return null;
  const match = /^[ \t]*(\+?)([\d ().\-\t]*)/.exec(phone);
  const digits = match[2].replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return `tel:${match[1]}${digits}`;
}
