/**
 * Scholarship applications (owner, 2026-10-01: "build that into the admin
 * screen of the portal"). The public website's form posts to the
 * submitScholarship function, which stores one doc per family + athlete +
 * season at scholarshipApplications/{id}; this file is the portal's side:
 * the owner's read of them and the one client write, the decision.
 *
 * OWNER ONLY. firestore.rules grants the read and the decision to
 * users/{uid}.role == 'owner' and to nobody else - the docs hold a child's
 * name and date of birth and a family's finances - so only an owner's screen
 * may mount useScholarships(): mounting it IS the read. AdminDashboard shows
 * its card to an owner only, and the route is owner-only.
 *
 * New surface, kept out of live.js/index.js (the waitlist.js/signups.js
 * precedent); imports shared primitives FROM ./live, never the other way.
 */
import { collection, deleteField, doc, getDocs, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, isLive, requireUser, wrap } from './live';
import { bump, useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { SCHOLARSHIP_STATUSES, scholarshipCounts, sortScholarships } from '../data/scholarships';

/** The invalidation key: a decision bumps it, and every mounted useScholarships() reads again. */
export const SCHOLARSHIPS_KEY = 'scholarshipApplications';

/**
 * Every application, as plain rows. The whole collection in one read: the
 * rule's condition never reads the document, so an owner's unfiltered list
 * is provable, and an orderBy would silently drop a doc missing the field.
 * `decidedAt` (a server Timestamp, absent until decided) becomes
 * `decidedAtMs` so a row is plain data next to createdAtMs / updatedAtMs.
 */
export async function fetchScholarshipApplications() {
  try {
    const snap = await getDocs(collection(db, 'scholarshipApplications'));
    return snap.docs.map((d) => {
      const { decidedAt, ...fields } = d.data();
      return { id: d.id, ...fields, decidedAtMs: decidedAt && typeof decidedAt.toMillis === 'function' ? decidedAt.toMillis() : null };
    });
  } catch (err) {
    throw wrap(err, 'fetchScholarshipApplications');
  }
}

/**
 * The owner's decision on one application - a label, nothing more: no
 * billing, package or Stripe object moves and no email is sent. Writes
 * exactly what firestore.rules' scholarshipDecisionOk() admits:
 *   approve / decline -> status, decidedBy (this owner's uid), decidedAt
 *                        (server time);
 *   reopen ('new')    -> status 'new', decidedBy and decidedAt removed.
 * Then bumps the key so the list and the dashboard count read again. A
 * refused or failed write rejects and bumps nothing: the row on screen is
 * still true.
 *
 * `updatedAtMs` is the version the owner was shown (the row's own value).
 * The list is a one-shot read, so the family may have sent the form again
 * since; the write runs in a transaction that reads the doc first and, when
 * its updatedAtMs has moved, writes NOTHING and rejects with reason
 * 'resubmitted' - a decision is never laid over answers the owner has not
 * read. That one refusal does bump the key: the row on screen is out of date.
 * (Omitted, the check is skipped.) The transaction's write is the same three
 * fields, so the rule is unchanged.
 *
 * Demo (seed) mode writes nothing and resolves, like every other write off
 * the live flag.
 */
export async function decideScholarship({ id, status, updatedAtMs } = {}) {
  if (!id || typeof id !== 'string') {
    throw new LiveDataError(ERR.INVALID, 'decideScholarship: id is required.');
  }
  if (!SCHOLARSHIP_STATUSES.includes(status)) {
    throw new LiveDataError(ERR.INVALID, `decideScholarship: ${status} is not a status.`);
  }
  if (!isLive()) return { id, status, simulated: true };
  const user = requireUser();
  const decision =
    status === 'new'
      ? { status, decidedBy: deleteField(), decidedAt: deleteField() }
      : { status, decidedBy: user.uid, decidedAt: serverTimestamp() };
  const ref = doc(db, 'scholarshipApplications', id);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) {
        throw new LiveDataError(ERR.NOT_FOUND, 'decideScholarship: no such application.');
      }
      if (updatedAtMs !== undefined && snap.data().updatedAtMs !== updatedAtMs) {
        throw new LiveDataError(ERR.INVALID, 'decideScholarship: the application was sent again after it was read.', null, 'resubmitted');
      }
      tx.update(ref, decision);
    });
  } catch (err) {
    if (err instanceof LiveDataError && err.reason === 'resubmitted') bump(SCHOLARSHIPS_KEY);
    throw wrap(err, 'decideScholarship');
  }
  bump(SCHOLARSHIPS_KEY);
  return { id, status };
}

async function liveScholarships() {
  const rows = sortScholarships(await fetchScholarshipApplications());
  return { rows, counts: scholarshipCounts(rows) };
}

const EMPTY = { rows: [], counts: { new: 0, approved: 0, declined: 0, all: 0 } };

/**
 * `{ data: { rows, counts: { new, approved, declined, all } } | null,
 * loading, error }` - rows newest first (data/scholarships.js has the
 * order and the row copy). Seed mode is an honest empty list: there is no
 * demo applicant. Invalidation key: scholarshipApplications.
 */
export default function useScholarships() {
  const live = isLive();
  const gen = useInvalidation(SCHOLARSHIPS_KEY);
  return useSeedResource(live ? null : EMPTY, live ? { source: liveScholarships, deps: ['scholarships', gen] } : undefined);
}
