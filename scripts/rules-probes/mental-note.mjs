/**
 * No session note on Yannick's 1:1s (owner 2026-11-13). A session doc is
 * readable by every signed-in user (families book from it), so a coachNote on
 * a 'mental' session would not stay private; Yannick's notes live in
 * mentalNotes, which only he reads. coachNoteUpdateOk now refuses a note
 * string on a session whose type is 'mental', for every role. Clearing a note
 * to null still works, so one written before the rule can be removed. Every
 * other session takes a note exactly as before (the twin below). Run by
 * scripts/verify-rules.mjs in both passes; it seeds and removes everything it
 * touches.
 */
import { call, del, expect, seed, t, token, updateAs } from '../verify-rules.mjs';

const dayOut = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const DAY = dayOut(5);
const ownerUid = 'owner-mnote-probe';
const yannickUid = 'mental-mnote-probe';
const philUid = 'phil-mnote-probe';
const SESSIONS = {
  'cal-mnote': { date: DAY, time: '4:30 PM', type: 'mental', label: 'Mental game session', capacity: 1, booked: 1,
    status: 'scheduled', bookable: false, source: 'calendly', coachNote: null },
  'cal-mnote-old': { date: DAY, time: '5:30 PM', type: 'mental', label: 'Mental game session', capacity: 1, booked: 1,
    status: 'scheduled', bookable: false, source: 'calendly', coachNote: 'written before the rule' },
  'trn-mnote': { date: DAY, time: '4:00 PM', type: 'training', capacity: 12, booked: 0, status: 'scheduled', coachNote: null },
  'phil-mnote': { date: DAY, time: '4:00 PM', type: 'phil', capacity: 6, booked: 0, status: 'scheduled', coachNote: null },
};
const noteOf = async (id) => {
  const res = await call('GET', `/sessions/${id}`, null, t.ops);
  return res.body?.fields?.coachNote?.stringValue ?? null;
};

export async function taskMentalNote() {
  const owner = token(ownerUid, { email: 'owner-mnote@example.com', email_verified: true });
  const yannick = token(yannickUid, { email: 'yannick-mnote@example.com', email_verified: true });
  const phil = token(philUid, { email: 'phil-mnote@example.com', email_verified: true });
  try {
    await seed('users', ownerUid, { role: 'owner' });
    await seed('users', yannickUid, { role: 'mental', specialistId: 'mental' });
    await seed('users', philUid, { role: 'coach', specialistId: 'phil' });
    for (const [id, body] of Object.entries(SESSIONS)) await seed('sessions', id, body);

    // A note on a 1:1 is refused for every role that can write one elsewhere.
    expect('Yannick cannot write a session note on his 1:1', await updateAs(yannick, 'sessions', 'cal-mnote', { coachNote: 'private' }), 403);
    expect('the owner cannot write a session note on a 1:1', await updateAs(owner, 'sessions', 'cal-mnote', { coachNote: 'private' }), 403);
    expect('ops cannot write a session note on a 1:1', await updateAs(t.ops, 'sessions', 'cal-mnote', { coachNote: 'private' }), 403);
    expect('a coach cannot write a session note on a 1:1', await updateAs(t.coach, 'sessions', 'cal-mnote', { coachNote: 'private' }), 403);
    expect('nor can Phil', await updateAs(phil, 'sessions', 'cal-mnote', { coachNote: 'private' }), 403);
    expect('an empty-string note is refused too', await updateAs(yannick, 'sessions', 'cal-mnote', { coachNote: '' }), 403);
    expect('the 1:1 still has no note', await noteOf('cal-mnote'), null);
    expect('a family still cannot write one', await updateAs(t.parent, 'sessions', 'cal-mnote', { coachNote: 'x' }), 403);

    // A note written before the rule can be cleared, never changed.
    expect('the owner cannot change an old 1:1 note', await updateAs(owner, 'sessions', 'cal-mnote-old', { coachNote: 'changed' }), 403);
    expect('the owner clears an old 1:1 note', await updateAs(owner, 'sessions', 'cal-mnote-old', { coachNote: null }), 200);
    expect('the old note is gone', await noteOf('cal-mnote-old'), null);

    // Every other session takes a note as before.
    expect('Yannick still writes a note on a golf block', await updateAs(yannick, 'sessions', 'trn-mnote', { coachNote: 'Cones out' }), 200);
    expect('ops still writes a note on a golf block', await updateAs(t.ops, 'sessions', 'trn-mnote', { coachNote: 'Short game focus' }), 200);
    expect('Phil still writes a note on his session', await updateAs(phil, 'sessions', 'phil-mnote', { coachNote: 'Bands set up' }), 200);
    expect('the 500-character limit still holds', await updateAs(t.ops, 'sessions', 'trn-mnote', { coachNote: 'x'.repeat(501) }), 403);
  } finally {
    for (const id of Object.keys(SESSIONS)) await del('sessions', id);
    for (const u of [ownerUid, yannickUid, philUid]) await del('users', u);
  }
}
