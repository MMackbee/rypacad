/**
 * Sign-up era view-model helpers (Sprint 20): the child-login line (spec
 * 3.2) here, the admin sign-ups report's row builder appended by Task 13
 * (spec 7). PURE - no React, no Firebase; hooks/signups.js fetches, this
 * file derives. Routing-owned (D1): the frontend lane's report helpers
 * live in data/signupsReport.js, never here.
 */
import { format } from 'date-fns';

/** An open invite older than this is 'invited-stale' - ops fixes the email (spec 3.2, 7). */
export const STALE_INVITE_DAYS = 7;

/** A Date from a Date, a Firestore Timestamp (toDate) or an ISO string; null otherwise. */
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 'YYYY-MM-DDTHH:mm' in the browser's zone, or null. */
export function stamp(v) {
  const d = toDate(v);
  return d ? format(d, "yyyy-MM-dd'T'HH:mm") : null;
}

/**
 * The child-login state the parent's family page, the athlete card and the
 * report all show (spec 3.2 "Login: none / not claimed / claimed <date>"):
 *   none          - no loginEmail (the parent's account runs the child), or
 *                   the invite was orphaned by claimInvite (athlete gone)
 *   invited       - an open invite; ALSO a loginEmail whose invite doc is
 *                   missing or unreadable by this viewer (a coach - rules
 *                   grant the read to the household parent and ops/owner)
 *   invited-stale - open for more than STALE_INVITE_DAYS
 *   claimed       - claimInvite flipped it; claimedAt stamped
 * `now` is injectable for tests.
 */
export function loginStateFor(loginEmail, invite, now = new Date()) {
  if (!loginEmail) return { state: 'none', claimedAt: null };
  if (!invite) return { state: 'invited', claimedAt: null };
  if (invite.status === 'orphaned') return { state: 'none', claimedAt: null };
  if (invite.status === 'claimed') return { state: 'claimed', claimedAt: stamp(invite.claimedAt) };
  const created = toDate(invite.createdAt);
  const stale = created ? now.getTime() - created.getTime() > STALE_INVITE_DAYS * 86400000 : false;
  return { state: stale ? 'invited-stale' : 'invited', claimedAt: null };
}
