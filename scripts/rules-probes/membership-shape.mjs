/**
 * The household freeze read on a membership map WITHOUT a status key
 * (2026-11-03: the legacy subscription webhook wrote one for a linked
 * household, and firestore.rules' `h.membership.status` errored on the
 * missing key - every booking by that family was refused as "insufficient
 * permissions"). Such a household books, waitlists and re-books exactly as
 * one with no membership map at all; a map with status past_due stays
 * refused. Run by scripts/verify-rules.mjs in both passes; it seeds and
 * removes everything it touches.
 */
import { beforeGate, bookAs, commitAs, createAs, del, expect, patchWrite, seatWrite, seed, token } from '../verify-rules.mjs';

const dayOut = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const [D1, D2] = [dayOut(8), dayOut(9)];
const periodKeyOf = (d) => `${d.slice(0, 7)}-01`;
const users = { legacy: 'p-legacy-probe', frozen: 'p-legacy-frozen-probe' };
const tok = (u) => token(u, { email: `${u}@example.com`, email_verified: true });
const session = (date, extra = {}) => ({ date, time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled', ...extra });
const athlete = (id, householdId) => ({ name: id, householdId, contractMinutes: null, coachId: null, packageId: 't-6', billing: { status: 'active' } });
const booking = (athleteId, householdId, sessionId, date, createdBy) =>
  ({ athleteId, sessionId, date, type: 'training', periodKey: periodKeyOf(date), status: 'confirmed', householdId, createdBy, chargedFrom: 'period' });

export async function taskMembershipShape() {
  console.log('Membership shape: a membership map without status books like no map at all; a frozen map stays refused');
  const legacy = tok(users.legacy);
  const frozen = tok(users.frozen);
  const open = beforeGate ? 403 : 200;
  try {
    await seed('users', users.legacy, { role: 'parent', householdId: 'hh-legacy', athleteId: null });
    await seed('users', users.frozen, { role: 'parent', householdId: 'hh-legacy-frozen', athleteId: null });
    // The shape the legacy webhook left on 2026-10-21: period, Stripe status, event - no `status`.
    await seed('households', 'hh-legacy', { name: 'Legacy family', periodAnchorDay: 1,
      membership: { stripeSubscriptionStatus: 'active', currentPeriodStart: '2026-10-21', currentPeriodEnd: '2026-11-21', lastEventId: 'evt_probe' } });
    await seed('households', 'hh-legacy-frozen', { name: 'Frozen legacy family', periodAnchorDay: 1,
      membership: { status: 'past_due', stripeSubscriptionStatus: 'past_due' } });
    await seed('athletes', 'ath-legacy', athlete('ath-legacy', 'hh-legacy'));
    await seed('athletes', 'ath-legacy-frozen', athlete('ath-legacy-frozen', 'hh-legacy-frozen'));
    await seed('sessions', 'leg-s1', session(D1));
    await seed('sessions', 'leg-s2', session(D2));
    await seed('sessions', 'leg-full', session(D1, { time: '5:00 PM', capacity: 1, booked: 1 }));
    // A cancelled row of the legacy athlete's own, for the re-book arm (rebookHouseholdOk).
    await seed('bookings', 'ath-legacy_leg-s2', { ...booking('ath-legacy', 'hh-legacy', 'leg-s2', D2, users.legacy),
      status: 'cancelled', createdAt: new Date(), cancelledBy: users.legacy, cancelReason: 'member' });

    expect('booking: a membership map without status books', await bookAs(legacy, 'ath-legacy_leg-s1', booking('ath-legacy', 'hh-legacy', 'leg-s1', D1, users.legacy)), open);
    expect('waitlist: the same household joins', await createAs(legacy, 'waitlist', 'leg-full_ath-legacy',
      { sessionId: 'leg-full', athleteId: 'ath-legacy', householdId: 'hh-legacy', date: D1, periodKey: periodKeyOf(D1), createdBy: users.legacy }, ['joinedAt']), open);
    expect('re-book: the same household re-confirms its cancelled row',
      await commitAs(legacy, [patchWrite('bookings', 'ath-legacy_leg-s2', { status: 'confirmed' }), await seatWrite('leg-s2', 1)]), open);
    expect('booking: a membership map with status past_due is still refused',
      await bookAs(frozen, 'ath-legacy-frozen_leg-s1', booking('ath-legacy-frozen', 'hh-legacy-frozen', 'leg-s1', D1, users.frozen)), 403);
  } finally {
    for (const [c, ids] of Object.entries({ users: Object.values(users), households: ['hh-legacy', 'hh-legacy-frozen'], athletes: ['ath-legacy', 'ath-legacy-frozen'],
      sessions: ['leg-s1', 'leg-s2', 'leg-full'], bookings: ['ath-legacy_leg-s1', 'ath-legacy_leg-s2', 'ath-legacy-frozen_leg-s1'], waitlist: ['leg-full_ath-legacy'] })) {
      for (const id of ids) await del(c, id);
    }
  }
}
