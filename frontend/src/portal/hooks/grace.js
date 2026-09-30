/**
 * Token issuance, grace tokens and the staff "cancel session" action
 * (Sprint 13, contract v2.1, pins C/E). Split out of hooks/live.js per the
 * sprint brief's own instruction ("split new code into hooks/waitlist.js /
 * hooks/grace.js") so the already-grandfathered live.js/index.js do not grow
 * further than they have to — everything here is genuinely NEW surface, not
 * a change to an existing function.
 *
 * Same one-directional dependency shape useAuthSession.js/useRoster.js
 * already establish: this file imports shared primitives (wrap, requireUser,
 * fetchAthlete, fetchHousehold, fetchBookingsBySession) FROM ./live, never
 * the other way — live.js's own createBooking needs graceTokens/waitlist
 * reads too, so those two fetch/write functions live in live.js itself
 * (fetchGraceTokensByAthlete, joinWaitlist) to avoid a circular import; this
 * file re-uses them rather than duplicating.
 *
 * Single token (owner ruling 2026-09-29/30): staff 'Cancel session' gives a
 * booking paid with a purchased `single_` token its token back (the cancel
 * frees it) and mints NO bonus for it, and it can finish a session the
 * calendar sync already cancelled without rewriting the session doc - the
 * pure planCancelSession() decides every write.
 */

import { useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { bump } from './invalidate';
import {
  ERR,
  LiveDataError,
  fetchAthlete,
  fetchBookingsBySession,
  fetchHousehold,
  isLive,
  requireUser,
  wrap,
} from './live';
import { normalizeAnchorDay, periodFor } from '../data/packages';
import { addDaysISO, todayISO } from '../data/calendar';
import { isSingleTokenId } from '../data/singleToken';

/**
 * One tokenPeriods/{athleteId}_{periodKey} doc, or null when none has been
 * issued yet (contract v2.1, pin C: "absent == the package's grant" — not an
 * error state). Read BY ID, never a query — the hook seam's own words
 * ("Hooks read the doc by id for the current period and the next, no
 * query"). Callers pass it to data/packages.js#tokensFor's `opts.tokenPeriod`.
 */
export async function fetchTokenPeriod(athleteId, periodKey) {
  if (!athleteId || !periodKey) return null;
  try {
    const snap = await getDoc(doc(db, 'tokenPeriods', `${athleteId}_${periodKey}`));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    throw wrap(err, 'fetchTokenPeriod');
  }
}

/**
 * Every graceTokens doc minted for one CANCELLED SESSION (sourceSessionId ==
 * sessionId) — cancelSession() below uses this to stay idempotent (contract
 * v2.1, pin E: "an athlete who already holds a grace token with this
 * sourceSessionId is not minted twice"). Single equality filter, provable
 * for the ops/owner caller who alone may run cancelSession (the graceTokens
 * read rule's unconditional staff branch).
 */
async function fetchGraceTokensBySourceSession(sessionId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'graceTokens'), where('sourceSessionId', '==', sessionId))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchGraceTokensBySourceSession');
  }
}

/**
 * Issue tokens for one athlete/period by hand (contract v2.1, pin C — the
 * membership editor's "cash and comp cases"). `periodKey` is a period START
 * the caller already derived (useMembership's own `periodEnd`/
 * `tokens.nextPeriod.periodKey` — "this period" or "next period" in the
 * pin's words); `periodEnd` is recomputed here from the household's REAL
 * anchor day via the same periodFor() the whole app uses, rather than
 * trusted from the caller, so a stale anchor can never produce a wrong
 * periodEnd on the stored doc. `source`/`eventId` are always 'ops'/null —
 * firestore.rules' tokenPeriodShapeOk() would reject anything else from a
 * client write; the Stripe handler (Admin SDK) is the only writer of
 * `source: 'stripe'` with a real `eventId`.
 */
export async function issueTokens(athleteId, periodKey, granted) {
  if (!athleteId || !periodKey) {
    throw new LiveDataError(ERR.INVALID, 'issueTokens: athleteId and periodKey are both required.');
  }
  if (!Number.isInteger(granted) || granted < 0 || granted > 40) {
    throw new LiveDataError(ERR.INVALID, 'issueTokens: granted must be an integer between 0 and 40.');
  }
  requireUser();
  try {
    const athlete = await fetchAthlete(athleteId);
    if (!athlete.householdId) {
      throw new LiveDataError(ERR.INVALID, 'issueTokens: this athlete has no household on file.');
    }
    const household = await fetchHousehold(athlete.householdId);
    const anchorDay = normalizeAnchorDay(household.periodAnchorDay);
    const { periodEnd } = periodFor(periodKey, anchorDay);
    const id = `${athleteId}_${periodKey}`;
    await setDoc(doc(db, 'tokenPeriods', id), {
      athleteId,
      householdId: athlete.householdId,
      periodKey,
      periodEnd,
      granted,
      source: 'ops',
      eventId: null,
      createdAt: serverTimestamp(),
    });
    bump('tokenPeriods');
    return { id, athleteId, householdId: athlete.householdId, periodKey, periodEnd, granted, source: 'ops' };
  } catch (err) {
    throw wrap(err, 'issueTokens');
  }
}

/**
 * Link a household to its Stripe customer/subscription (contract v2.1, pin
 * H) — ops/owner only, enforced by firestore.rules' householdSettingsUpdateOk(),
 * not here. Either id may be null (unlinking, or a family paying by another
 * means). Mirrors setHouseholdPeriodAnchorDay's (hooks/live.js) one-shot
 * updateDoc + single bump discipline exactly.
 */
export async function setHouseholdStripeIds(householdId, { stripeCustomerId = null, stripeSubscriptionId = null } = {}) {
  if (!householdId) {
    throw new LiveDataError(ERR.INVALID, 'setHouseholdStripeIds: householdId is required.');
  }
  requireUser();
  try {
    await updateDoc(doc(db, 'households', householdId), {
      stripeCustomerId: stripeCustomerId || null,
      stripeSubscriptionId: stripeSubscriptionId || null,
      updatedAt: serverTimestamp(),
    });
    bump('households');
    return { householdId, stripeCustomerId: stripeCustomerId || null, stripeSubscriptionId: stripeSubscriptionId || null };
  } catch (err) {
    throw wrap(err, 'setHouseholdStripeIds');
  }
}

/**
 * The write plan for cancelSession below - PURE, so the token rules are
 * unit-tested. One 'booking' op per confirmed booking; one 'grace' op (a
 * bonus token) per athlete not already graced for this session; one
 * 'session' op unless the session is already cancelled (a calendar sync
 * cancels the session doc but not its bookings - Roster's 'Cancel remaining
 * bookings' finishes the job without rewriting the session). A booking paid
 * with a purchased single token (`single_{cs}`) mints NO bonus: cancelling
 * it frees that token again, so a bonus would pay twice (ruling
 * 2026-09-29/30).
 */
export function planCancelSession(confirmed, existingGrace, { sessionAlreadyCancelled = false } = {}) {
  const alreadyGraced = new Set((existingGrace || []).map((g) => g.athleteId));
  const ops = sessionAlreadyCancelled ? [] : [{ kind: 'session' }];
  for (const b of confirmed || []) {
    ops.push({ kind: 'booking', booking: b });
    if (isSingleTokenId(b.graceTokenId)) continue;
    if (!alreadyGraced.has(b.athleteId)) {
      ops.push({ kind: 'grace', booking: b });
      alreadyGraced.add(b.athleteId);
    }
  }
  return ops;
}

/**
 * Staff "Cancel session" (contract v2.1, pin E) — every CONFIRMED booking on
 * a session flips to cancelled (cancelledBy the caller, cancelReason
 * 'session-cancelled') and mints one grace token per cancelled booking's
 * athlete, then the session itself flips to cancelled. Single token
 * (ruling 2026-09-29/30): a booking paid with a purchased `single_` token
 * gets that token back (the cancel frees it) and no bonus; a session the
 * calendar sync already cancelled is read first and not written again, so
 * the same action cancels its remaining bookings (planCancelSession above).
 * Idempotent: bookings
 * already cancelled are excluded by the query itself (fetchBookingsBySession
 * only ever returns confirmed/attended/noshow — filtered here to confirmed),
 * and an athlete who already holds a grace token for THIS session
 * (fetchGraceTokensBySourceSession) is not minted a second one, so re-running
 * this action (a retry after a partial failure, or a double-tap) never
 * double-cancels or double-mints.
 *
 * Chunked into batches of at most 8 individual writes (contract v2.1, pin
 * E — "the rules' ~20-document-access cap per batch, Sprint 10"): each
 * cancelled booking is one write, each minted grace token a second, so a
 * chunk holds at most 4 athletes' worth. The session's own status write
 * (when there is one) rides the FIRST chunk. A mid-run failure leaves some athletes cancelled/
 * graced and others not — safe to re-run (idempotent) rather than needing a
 * rollback.
 */
export async function cancelSession(sessionId) {
  if (!sessionId) {
    throw new LiveDataError(ERR.INVALID, 'cancelSession: sessionId is required.');
  }
  const user = requireUser();
  try {
    const [sessionSnap, bookings, existingGrace] = await Promise.all([
      getDoc(doc(db, 'sessions', sessionId)),
      fetchBookingsBySession(sessionId),
      fetchGraceTokensBySourceSession(sessionId),
    ]);
    const sessionAlreadyCancelled = sessionSnap.exists() && sessionSnap.data().status === 'cancelled';
    const confirmed = bookings.filter((b) => b.status === 'confirmed');
    const expiresAt = addDaysISO(todayISO(), 30);
    const ops = planCancelSession(confirmed, existingGrace, { sessionAlreadyCancelled });

    const CHUNK_SIZE = 8;
    let cancelledCount = 0;
    let grantedCount = 0;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + CHUNK_SIZE)) {
        if (op.kind === 'session') {
          batch.update(doc(db, 'sessions', sessionId), { status: 'cancelled' });
        } else if (op.kind === 'booking') {
          batch.update(doc(db, 'bookings', op.booking.id), {
            status: 'cancelled',
            cancelledBy: user.uid,
            cancelReason: 'session-cancelled',
          });
          cancelledCount += 1;
        } else {
          batch.set(doc(collection(db, 'graceTokens')), {
            athleteId: op.booking.athleteId,
            householdId: op.booking.householdId ?? null,
            expiresAt,
            reason: 'session-cancelled',
            sourceSessionId: sessionId,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
          });
          grantedCount += 1;
        }
      }
      await batch.commit();
    }
    bump('sessions');
    bump('bookings');
    bump('graceTokens');
    return { sessionId, cancelled: cancelledCount, graceTokensMinted: grantedCount };
  } catch (err) {
    throw wrap(err, 'cancelSession');
  }
}

/**
 * `{ issue(athleteId, periodKey, granted), saving, error }` (contract v2.1,
 * hook seam) — ops/owner only, enforced by rules, not here. Seed mode is a
 * local echo, the same discipline useAssignPackages/useHouseholdSettings
 * already use for every other ops write action in this app.
 */
export default function useIssueTokens() {
  const live = isLive();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const issue = async (athleteId, periodKey, granted) => {
    setSaving(true);
    setError(null);
    try {
      if (!live) {
        return { athleteId, periodKey, granted, source: 'ops', simulated: true };
      }
      return await issueTokens(athleteId, periodKey, granted);
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return { issue, saving, error };
}
