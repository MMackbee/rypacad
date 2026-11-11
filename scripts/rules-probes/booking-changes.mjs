/**
 * Booking changes (owner 2026-11-11, plans/2026-11-11-booking-changes, spec
 * sections 4, 5 and 8). A family cancels up to the session's START, not its
 * day, and says why: the member cancel arm admits three optional fields -
 * cancelCategory (one of five), cancelNote (a string of 1..140, only with
 * 'other') and cancelledAt (the server's time) - and refuses a cancel once
 * the session's 'h:mm AM|PM' start has passed (Chicago standard time). A time
 * the rules cannot parse ('TBA', '', lower case) falls back to the day floor.
 * The re-book arm may remove those three and comp, never set or change them.
 * No client writes a move marker (cancelReason 'moved', movedTo, movedFrom,
 * cancelledVia or createdVia 'move'): moveBooking writes those with the Admin
 * SDK. Paid Elite rows (ath-elite, household hh), so both passes answer
 * alike. The before-start cases sit 90 minutes either side of now on today's
 * Chicago date, so between 22:30 and 01:30 Chicago the task records a FAIL
 * and runs nothing. Every 403 has a 200 twin that differs only in the field
 * or time under test (most often the next write on the same row). Run by
 * scripts/verify-rules.mjs in both passes; it seeds and removes everything it
 * touches.
 */
import { bookAs, call, commitAs, del, expect, listAs, patchWrite, seatWrite, seed, t, uid, updateAs } from '../verify-rules.mjs';

const CHICAGO = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: 'numeric', minute: '2-digit', hour12: true });
/** The America/Chicago date and 'h:mm AM' clock `offsetMin` minutes from now. */
function chicagoSlot(offsetMin) {
  const p = Object.fromEntries(CHICAGO.formatToParts(new Date(Date.now() + offsetMin * 60000)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()}` };
}

const sessionIds = new Set();
const bookingId = (sessionId) => `ath-elite_${sessionId}`;
const row = (sessionId, date, over = {}) => ({ athleteId: 'ath-elite', sessionId, date, type: 'training', periodKey: `${date.slice(0, 7)}-01`,
  status: 'confirmed', householdId: 'hh', createdBy: uid.parent, chargedFrom: 'elite', createdAt: new Date(), ...over });
/** A training session `bc-<name>` and, unless `over` is null, ath-elite's booking on it, its seat counted when live. */
async function slot(name, { date, time }, over = {}) {
  const sessionId = `bc-${name}`;
  sessionIds.add(sessionId);
  const live = over !== null && (over.status ?? 'confirmed') !== 'cancelled';
  await seed('sessions', sessionId, { date, time, type: 'training', capacity: 12, booked: live ? 1 : 0, status: 'scheduled' });
  if (over !== null) await seed('bookings', bookingId(sessionId), row(sessionId, date, over));
  return sessionId;
}
// A family's cancel is the booking update plus the session's count - 1 in ONE commit, as live.js cancelBooking writes it;
// a re-book is the update plus + 1. `serverTime` names the fields set to REQUEST_TIME beside the mask.
const cancel = async (auth, sessionId, fields, mask = Object.keys(fields), serverTime = ['cancelledAt']) =>
  commitAs(auth, [patchWrite('bookings', bookingId(sessionId), fields, mask, serverTime), await seatWrite(sessionId, -1)]);
const rebook = async (auth, sessionId, fields, mask = Object.keys(fields), serverTime = ['rebookedAt']) =>
  commitAs(auth, [patchWrite('bookings', bookingId(sessionId), fields, mask, serverTime), await seatWrite(sessionId, 1)]);
const member = (by, over = {}) => ({ status: 'cancelled', cancelledBy: by, cancelReason: 'member', ...over });
// The new app's single cancel (live.js cancelBooking + bookingChanges.cancelFields): cancelledVia masked with no value,
// cancelNote masked with no value unless the reason carries one, cancelledAt the server's time (cancel's default).
function withReason(by, category, note) {
  const fields = member(by, { cancelCategory: category, ...(note === undefined ? {} : { cancelNote: note }) });
  return [fields, [...Object.keys(fields), 'cancelledVia', ...(note === undefined ? ['cancelNote'] : [])]];
}
// A row the family cancelled with a reason (no note), as the re-book cases find it.
const sickCancelled = () => member(uid.parent, { cancelCategory: 'sick', cancelledAt: new Date() });
const CONFIRM = { status: 'confirmed', chargedFrom: 'elite', graceTokenId: null };
const CLEARS = ['cancelCategory', 'cancelNote', 'cancelledAt'];
// The new app's re-book (live.js rebookPatch + bookingChanges.rebookClears): the charge, rebookedAt, and the cancel
// fields masked with no value.
const newRebook = (sessionId, clears = CLEARS) => rebook(t.parent, sessionId, CONFIRM, [...Object.keys(CONFIRM), ...clears]);
const fieldsOf = async (sessionId) => (await call('GET', `/bookings/${bookingId(sessionId)}`, null, 'owner')).body?.fields ?? {};
const carried = (fields, keys) => keys.filter((k) => k in fields).join(',') || undefined;

export async function taskBookingChanges() {
  console.log('Booking changes: a family cancel with a reason up to the start; a re-book clears the reason and comp; only the server moves');
  const today = chicagoSlot(0).date;
  const [past, soon] = [chicagoSlot(-90), chicagoSlot(90)];
  if (past.date !== today || soon.date !== today) {
    expect('booking-changes: run outside 22:30-01:30 Chicago (a 90-minute slot crosses midnight)', 'skipped', 'ran');
    return;
  }
  const yesterday = { date: chicagoSlot(-24 * 60).date, time: 'TBA' };
  const ahead = { date: chicagoSlot(3 * 24 * 60).date, time: '4:00 PM' };
  try {
    // ---- before the start (the rules read the session's own date and time; CST, +360 min)
    let s = await slot('started-p', past);
    expect(`booking-changes: parent cancels a session that started 90 min ago (${past.time}) refused`, await cancel(t.parent, s, member(uid.parent)), 403);
    s = await slot('started-l', past);
    expect('booking-changes: the athlete login cancels one that started 90 min ago refused', await cancel(t.eliteLogin, s, member(uid.eliteLogin)), 403);
    s = await slot('started-old', past);
    expect("booking-changes: the old app's cancel (no new field) of one that started 90 min ago refused",
      await cancel(t.parent, s, member(uid.parent), ['status', 'cancelledBy', 'cancelReason', 'cancelledVia'], []), 403);
    s = await slot('soon-p', soon);
    expect(`booking-changes: parent cancels one that starts in 90 min (${soon.time})`, await cancel(t.parent, s, member(uid.parent)), 200);
    s = await slot('soon-l', soon);
    expect('booking-changes: the athlete login cancels one that starts in 90 min', await cancel(t.eliteLogin, s, member(uid.eliteLogin)), 200);
    s = await slot('tba', { date: today, time: 'TBA' });
    expect("booking-changes: a session today at 'TBA' (the day floor decides)", await cancel(t.parent, s, member(uid.parent)), 200);
    s = await slot('blank', { date: today, time: '' });
    expect("booking-changes: a session today with time '' (the day floor decides)", await cancel(t.parent, s, member(uid.parent)), 200);
    s = await slot('lower', { date: today, time: past.time.toLowerCase() });
    expect(`booking-changes: a lower-case '${past.time.toLowerCase()}' today, 90 min gone (upper-case pattern only: lenient)`,
      await cancel(t.parent, s, member(uid.parent)), 200);
    s = await slot('tba-y', yesterday);
    expect("booking-changes: a session yesterday at 'TBA' refused (the day floor)", await cancel(t.parent, s, member(uid.parent)), 403);
    s = await slot('old-app', ahead);
    expect("booking-changes: the old app's cancel of a future booking (cancelledVia masked with no value)",
      await cancel(t.parent, s, member(uid.parent), ['status', 'cancelledBy', 'cancelReason', 'cancelledVia'], []), 200);

    // ---- reasons (future sessions); the 403s first, then the 200 twin on the same row
    s = await slot('r-sick', ahead);
    expect("booking-changes: cancelCategory 'bored' refused", await cancel(t.parent, s, ...withReason(uid.parent, 'bored')), 403);
    expect("booking-changes: a cancelNote with 'sick' refused", await cancel(t.parent, s, ...withReason(uid.parent, 'sick', 'fever')), 403);
    expect("booking-changes: 'sick'", await cancel(t.parent, s, ...withReason(uid.parent, 'sick')), 200);
    s = await slot('r-injured', ahead);
    expect("booking-changes: cancelNote 'x' with no cancelCategory refused", await cancel(t.parent, s, member(uid.parent, { cancelNote: 'x' })), 403);
    expect("booking-changes: 'injured'", await cancel(t.parent, s, ...withReason(uid.parent, 'injured')), 200);
    s = await slot('r-school', ahead);
    expect('booking-changes: cancelledAt sent by the client (no transform) refused',
      await cancel(t.parent, s, member(uid.parent, { cancelCategory: 'school', cancelledAt: new Date('2026-11-01T00:00:00Z') }), undefined, []), 403);
    expect("booking-changes: 'school' with the server's cancelledAt", await cancel(t.parent, s, ...withReason(uid.parent, 'school')), 200);
    s = await slot('r-family', ahead);
    expect("booking-changes: a family cancel with cancelReason 'moved' refused",
      await cancel(t.parent, s, member(uid.parent, { cancelReason: 'moved', cancelCategory: 'family' })), 403);
    expect("booking-changes: a family cancel carrying movedTo refused",
      await cancel(t.parent, s, member(uid.parent, { cancelCategory: 'family', movedTo: 'ath-elite_x' })), 403);
    expect("booking-changes: cancelledVia 'move' refused",
      await cancel(t.parent, s, member(uid.parent, { cancelCategory: 'family', cancelledVia: 'move' })), 403);
    expect("booking-changes: 'family'", await cancel(t.parent, s, ...withReason(uid.parent, 'family')), 200);
    s = await slot('r-series', ahead);
    expect("booking-changes: cancelledVia 'series' with 'school'",
      await cancel(t.parent, s, member(uid.parent, { cancelCategory: 'school', cancelledVia: 'series' })), 200);
    s = await slot('r-other', ahead);
    expect("booking-changes: 'other' with cancelNote 'dentist'", await cancel(t.parent, s, ...withReason(uid.parent, 'other', 'dentist')), 200);
    s = await slot('r-other140', ahead);
    expect("booking-changes: 'other' with a 141-character note refused", await cancel(t.parent, s, ...withReason(uid.parent, 'other', 'x'.repeat(141))), 403);
    expect("booking-changes: 'other' with note '' refused", await cancel(t.parent, s, ...withReason(uid.parent, 'other', '')), 403);
    expect("booking-changes: 'other' with note 123 refused", await cancel(t.parent, s, ...withReason(uid.parent, 'other', 123)), 403);
    expect("booking-changes: 'other' with a 140-character note", await cancel(t.parent, s, ...withReason(uid.parent, 'other', 'x'.repeat(140))), 200);
    s = await slot('r-alone', ahead);
    expect('booking-changes: cancelCategory alone on a confirmed booking (no status change, no seat) refused',
      await updateAs(t.parent, 'bookings', bookingId(s), { cancelCategory: 'sick' }), 403);
    expect("booking-changes: the same row cancelled with 'sick'", await cancel(t.parent, s, ...withReason(uid.parent, 'sick')), 200);
    expect('booking-changes: cancelCategory alone on a cancelled booking refused',
      await updateAs(t.parent, 'bookings', bookingId(s), { cancelCategory: 'school' }), 403);

    // ---- only the server moves: a family create carrying a move marker
    s = await slot('create', ahead, null);
    const fresh = row(s, ahead.date);
    delete fresh.createdAt;
    expect("booking-changes: a family create with createdVia 'move' refused", await bookAs(t.parent, bookingId(s), { ...fresh, createdVia: 'move' }), 403);
    expect('booking-changes: a family create with movedFrom refused', await bookAs(t.parent, bookingId(s), { ...fresh, movedFrom: 'ath-elite_x' }), 403);
    expect('booking-changes: the same create without a marker', await bookAs(t.parent, bookingId(s), fresh), 200);

    // ---- re-book: may remove the three fields and comp, never set or change them
    s = await slot('rb-new', ahead, sickCancelled());
    expect('booking-changes: the new re-book removes cancelCategory, cancelNote, cancelledAt', await newRebook(s), 200);
    expect('booking-changes: and the row carries none of the three', carried(await fieldsOf(s), CLEARS), undefined);
    s = await slot('rb-old', ahead, sickCancelled());
    expect('booking-changes: an old re-book (status alone) on a row still carrying cancelCategory',
      await rebook(t.parent, s, { status: 'confirmed' }, undefined, []), 200);
    s = await slot('rb-set', ahead, member(uid.parent));
    expect("booking-changes: a re-book that sets cancelCategory 'sick' refused", await rebook(t.parent, s, { ...CONFIRM, cancelCategory: 'sick' }), 403);
    expect('booking-changes: the same re-book without it', await rebook(t.parent, s, CONFIRM), 200);
    s = await slot('rb-note', ahead, sickCancelled());
    expect("booking-changes: a re-book that changes cancelNote to 'x' refused",
      await rebook(t.parent, s, { ...CONFIRM, cancelNote: 'x' }, [...Object.keys(CONFIRM), 'cancelNote', 'cancelCategory', 'cancelledAt']), 403);
    expect('booking-changes: the same re-book removing it', await newRebook(s), 200);
    s = await slot('rb-at', ahead, sickCancelled());
    expect('booking-changes: a re-book that sets cancelledAt by a REQUEST_TIME transform refused',
      await rebook(t.parent, s, CONFIRM, [...Object.keys(CONFIRM), 'cancelCategory', 'cancelNote'], ['rebookedAt', 'cancelledAt']), 403);
    expect('booking-changes: the same re-book removing it', await newRebook(s), 200);
    s = await slot('rb-comp', ahead, { ...sickCancelled(), comp: true });
    expect('booking-changes: a re-book of a comp row removes comp', await newRebook(s, [...CLEARS, 'comp']), 200);
    expect('booking-changes: and the row carries no comp', carried(await fieldsOf(s), ['comp']), undefined);
    s = await slot('rb-comp-set', ahead, sickCancelled());
    expect('booking-changes: a re-book that sets comp: true refused',
      await rebook(t.parent, s, { ...CONFIRM, comp: true }, [...Object.keys(CONFIRM), 'comp', ...CLEARS]), 403);
    expect('booking-changes: the same re-book without comp', await newRebook(s), 200);

    // ---- staff and reads
    s = await slot('st-ops', ahead);
    const sessionCancel = { status: 'cancelled', cancelledBy: uid.ops, cancelReason: 'session-cancelled' };
    expect('booking-changes: an ops session cancel with a cancelCategory refused',
      await updateAs(t.ops, 'bookings', bookingId(s), { ...sessionCancel, cancelCategory: 'sick' }), 403);
    expect('booking-changes: the same session cancel without it', await updateAs(t.ops, 'bookings', bookingId(s), sessionCancel), 200);
    s = await slot('st-coach', ahead);
    expect("booking-changes: a coach marks attended with cancelCategory 'sick' refused",
      await updateAs(t.coach, 'bookings', bookingId(s), { status: 'attended', cancelCategory: 'sick' }), 403);
    expect('booking-changes: the coach marks it attended', await updateAs(t.coach, 'bookings', bookingId(s), { status: 'attended' }), 200);
    expect('booking-changes: and noshow', await updateAs(t.coach, 'bookings', bookingId(s), { status: 'noshow' }), 200);
    s = await slot('st-cxl', ahead, sickCancelled());
    expect('booking-changes: a coach marks a cancelled row noshow refused', await updateAs(t.coach, 'bookings', bookingId(s), { status: 'noshow' }), 403);
    expect("booking-changes: a coach lists a session's cancelled rows", await listAs(t.coach, 'bookings', { sessionId: 'bc-r-sick', status: 'cancelled' }), 200);
    expect('booking-changes: a parent of another household reads no reason',
      (await call('GET', `/bookings/${bookingId('bc-r-sick')}`, null, t.other)).status, 403);
    expect("booking-changes: the household's own parent reads it", (await call('GET', `/bookings/${bookingId('bc-r-sick')}`, null, t.parent)).status, 200);
  } finally {
    for (const id of sessionIds) {
      await del('bookings', bookingId(id));
      await del('sessions', id);
    }
    sessionIds.clear();
  }
}
