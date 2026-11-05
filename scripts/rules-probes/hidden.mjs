/**
 * Hidden sessions (owner 2026-11-05: the empty Monday and Wednesday 6 PM
 * blocks "sort of hidden for now; once enrollment and token usage % goes up
 * we will need those sessions back"). A session carrying hidden == true
 * takes no seat from a family: a booking create and a re-book both move
 * sessions.booked by + 1 in their own commit (seatTakenInCommit), and that
 * + 1 is refused on a hidden session (bookedDiffOk), so neither lands; a
 * waitlist join is refused too (waitlistSessionOk). A cancel (- 1) is always
 * allowed, so a family holding a seat on a hidden block can still give it
 * back. Every write on a twin session without the flag (or with hidden
 * false) answers as it always did. No client writes hidden, hiddenAt or
 * hiddenBy, staff included: only scripts/hide-sessions.mjs (Admin REST).
 * Paid Elite rows throughout, so no answer depends on the Oct 10 gate. Run by
 * scripts/verify-rules.mjs in both passes; it seeds and removes everything
 * it touches.
 */
import { bookAs, call, commitAs, createAs, del, expect, patchWrite, seatWrite, seed, t, token, uid, updateAs } from '../verify-rules.mjs';

const dayOut = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const DAY = dayOut(10);
const PERIOD = `${DAY.slice(0, 7)}-01`;
const ownerUid = 'owner-hidden-probe';
const HIDDEN = { hidden: true, hiddenAt: new Date('2026-11-05T18:00:00Z'), hiddenBy: 'hide-sessions' };
const block = (extra) => ({ date: DAY, time: '6:00 PM', type: 'training', capacity: 12, booked: 0, status: 'scheduled', ...extra });
// The twins: each case runs on a hidden session and on an identical one that is not.
const SESSIONS = {
  'hid-book': block(HIDDEN), 'open-book': block({}), 'false-book': block({ hidden: false }),
  'hid-own': block(HIDDEN), 'open-own': block({}),
  'hid-rebook': block(HIDDEN), 'open-rebook': block({}),
  'hid-full': block({ ...HIDDEN, capacity: 1, booked: 1 }), 'open-full': block({ capacity: 1, booked: 1 }),
  'hid-held': block({ ...HIDDEN, booked: 1 }), 'open-held': block({ booked: 1 }),
  'hid-staff': block(HIDDEN), 'open-staff': block({}),
};
const row = (sessionId, createdBy = uid.parent) => ({ athleteId: 'ath-elite', sessionId, date: DAY, type: 'training', periodKey: PERIOD,
  status: 'confirmed', householdId: 'hh', createdBy, chargedFrom: 'elite' });
const bookingId = (sessionId) => `ath-elite_${sessionId}`;
// A family's booking: the booking and the session's count + 1 in ONE commit, as live.js createBooking writes it.
const book = (auth, sessionId, createdBy) => bookAs(auth, bookingId(sessionId), row(sessionId, createdBy));
// A function, not a constant: `uid` is verify-rules.mjs's, which is still loading when this module's top level runs.
const cancelled = () => ({ status: 'cancelled', cancelledBy: uid.parent, cancelReason: 'member' });
const flip = async (sessionId, fields, seat) => commitAs(t.parent, [patchWrite('bookings', bookingId(sessionId), fields), await seatWrite(sessionId, seat)]);
const join = (sessionId) => createAs(t.parent, 'waitlist', `${sessionId}_ath-elite`,
  { sessionId, athleteId: 'ath-elite', householdId: 'hh', date: DAY, periodKey: PERIOD, createdBy: uid.parent }, ['joinedAt']);
const bookedOf = async (sessionId) => Number((await call('GET', `/sessions/${sessionId}`, null, 'owner')).body?.fields?.booked?.integerValue ?? -1);
const hiddenOf = async (sessionId) => (await call('GET', `/sessions/${sessionId}`, null, 'owner')).body?.fields?.hidden?.booleanValue ?? null;

export async function taskHidden() {
  console.log('Hidden sessions: no booking, re-book or waitlist join on a hidden session; a cancel still lands; no client writes the flag');
  const owner = token(ownerUid, { email: 'owner-hidden@example.com', email_verified: true });
  try {
    await seed('users', ownerUid, { role: 'owner' });
    for (const [id, fields] of Object.entries(SESSIONS)) await seed('sessions', id, fields);
    for (const id of ['hid-rebook', 'open-rebook']) await seed('bookings', bookingId(id), { ...row(id), status: 'cancelled', createdAt: new Date(), ...cancelled() });
    for (const id of ['hid-held', 'open-held']) await seed('bookings', bookingId(id), { ...row(id), createdAt: new Date() });

    // A booking create: the + 1 on a hidden session is refused, so the whole commit is - no seat, no booking.
    expect('hidden: parent books a hidden session refused', await book(t.parent, 'hid-book'), 403);
    expect('hidden: the refused booking took no seat', await bookedOf('hid-book'), 0);
    expect('hidden: and wrote no booking', (await call('GET', `/bookings/${bookingId('hid-book')}`, null, 'owner')).status, 404);
    expect('hidden: the athlete login books a hidden session refused', await book(t.eliteLogin, 'hid-own', uid.eliteLogin), 403);
    expect('open twin: parent books the same block without the flag', await book(t.parent, 'open-book'), 200);
    expect('open twin: hidden false books like no flag at all', await book(t.parent, 'false-book'), 200);
    expect('open twin: the athlete login books itself', await book(t.eliteLogin, 'open-own', uid.eliteLogin), 200);

    // A re-book is booking: the same + 1.
    expect('hidden: re-book of a cancelled row on a hidden session refused', await flip('hid-rebook', { status: 'confirmed' }, 1), 403);
    expect('open twin: the same re-book accepted', await flip('open-rebook', { status: 'confirmed' }, 1), 200);

    // A waitlist join on a full hidden session (a hidden block can only be full if it was full before the flag).
    expect('hidden: waitlist join on a full hidden session refused', await join('hid-full'), 403);
    expect('open twin: waitlist join on the same full block accepted', await join('open-full'), 200);

    // A cancel (- 1) always lands: a family holding a seat on a hidden block can give it back.
    expect('hidden: parent cancels a booking a hidden session somehow holds (count - 1)', await flip('hid-held', cancelled(), -1), 200);
    expect('hidden: the seat came back', await bookedOf('hid-held'), 0);
    expect('open twin: the same cancel', await flip('open-held', cancelled(), -1), 200);
    expect('hidden: re-booking that seat afterwards refused', await flip('hid-held', { status: 'confirmed' }, 1), 403);

    // The flag is the hide script's alone: no client sets, clears or removes it, staff included.
    expect('parent cannot hide a session', await updateAs(t.parent, 'sessions', 'open-staff', { hidden: true }), 403);
    expect('parent cannot unhide a session', await updateAs(t.parent, 'sessions', 'hid-staff', { hidden: false }), 403);
    expect('parent cannot remove the flag', await updateAs(t.parent, 'sessions', 'hid-staff', {}, ['hidden']), 403);
    expect('parent cannot clear the flag beside a seat count + 1', await updateAs(t.parent, 'sessions', 'hid-staff', { booked: 1, hidden: false }), 403);
    expect('parent cannot write hiddenAt or hiddenBy', await updateAs(t.parent, 'sessions', 'hid-staff', { hiddenBy: 'parent' }), 403);
    expect('an athlete login cannot unhide a session', await updateAs(t.eliteLogin, 'sessions', 'hid-staff', { hidden: false }), 403);
    expect('a coach cannot hide a session', await updateAs(t.coach, 'sessions', 'open-staff', { hidden: true }), 403);
    expect('ops cannot unhide a session', await updateAs(t.ops, 'sessions', 'hid-staff', { hidden: false }), 403);
    expect('nor can the owner (scripts/hide-sessions.mjs writes it)', await updateAs(owner, 'sessions', 'hid-staff', {}, ['hidden', 'hiddenAt', 'hiddenBy']), 403);
    expect('the hidden session is still hidden', await hiddenOf('hid-staff'), true);
    expect('and the open one still has no flag', await hiddenOf('open-staff'), null);

    // The staff writes that work on any session work on a hidden one.
    expect('ops writes a coach note on a hidden session', await updateAs(t.ops, 'sessions', 'hid-staff', { coachNote: 'Hidden for now' }), 200);
    expect('the owner cancels a hidden session', await updateAs(owner, 'sessions', 'hid-staff', { status: 'cancelled' }), 200);
    expect('a hidden session reads like any other', (await call('GET', '/sessions/hid-staff', null, t.parent)).status, 200);
  } finally {
    for (const id of Object.keys(SESSIONS)) {
      await del('bookings', bookingId(id));
      await del('waitlist', `${id}_ath-elite`);
      await del('sessions', id);
    }
    await del('users', ownerUid);
  }
}
