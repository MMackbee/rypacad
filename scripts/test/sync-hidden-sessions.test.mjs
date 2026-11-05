import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYNCED_FIELDS, planReport, planSync, planWrites } from '../sync-calendar-sessions.mjs';

// Hidden sessions (owner 2026-11-05): scripts/hide-sessions.mjs sets
// sessions.hidden / hiddenAt / hiddenBy, and the calendar sync never writes
// them. Its updates are masked patches (SYNCED_FIELDS, plus maxHandicap when
// that changes), so a field outside the mask is kept by Firestore - these
// tests pin that the mask never names the three, and that a hidden session
// is never deleted and re-created (a full write would drop the flag).
const HIDDEN_KEYS = ['hidden', 'hiddenAt', 'hiddenBy'];
const FLAG = { hidden: true, hiddenAt: '2026-11-05T18:00:00.000Z', hiddenBy: 'hide-sessions' };

/** A desired session as mapEvents builds it. */
const desiredDoc = (date, time, gcalEventId, over = {}) => ({
  date, time, durationMinutes: 60, type: 'training', capacity: 12, booked: 0, coachId: null, label: null,
  special: false, overflow: false, status: 'scheduled', gcalEventId, ...over,
});

test('a synced update of a hidden session keeps it hidden: the mask never names hidden, hiddenAt or hiddenBy', () => {
  // The calendar moved Wed Nov 11's 6 PM block to 6:30 PM; the session is hidden and empty.
  const desired = new Map([['2026-11-11-7', desiredDoc('2026-11-11', '6:30 PM', 'ev-1111-1800')]]);
  const existing = new Map([['2026-11-11-7', { ...desiredDoc('2026-11-11', '6:00 PM', 'ev-1111-1800'), ...FLAG }]]);
  const plan = planSync(desired, existing);
  assert.deepEqual(plan.updates.map((u) => u.id), ['2026-11-11-7']);
  for (const key of ['creates', 'deletes', 'cancels']) assert.deepEqual(plan[key], [], key);

  const [write] = planWrites(plan);
  assert.deepEqual(write.updateMask.fieldPaths, SYNCED_FIELDS);
  for (const key of HIDDEN_KEYS) {
    assert.ok(!write.updateMask.fieldPaths.includes(key), `mask names ${key}`);
    assert.ok(!(key in write.update.fields), `patch carries ${key}`);
  }
  assert.equal(write.update.fields.time.stringValue, '6:30 PM');
});

test('a hidden session the calendar did not change is unchanged: the flag is not a difference', () => {
  const desired = new Map([['2026-11-11-7', desiredDoc('2026-11-11', '6:00 PM', 'ev-1111-1800')]]);
  const existing = new Map([['2026-11-11-7', { ...desiredDoc('2026-11-11', '6:00 PM', 'ev-1111-1800'), ...FLAG }]]);
  const plan = planSync(desired, existing);
  assert.deepEqual(plan.unchanged, ['2026-11-11-7']);
  assert.deepEqual(planWrites(plan), []);
});

test('a hidden, empty session whose event moves to a new day-order id is patched in place, never deleted and re-created', () => {
  // A 3 PM event was added to Wed Nov 11, so the 6 PM block's day-order id would move from -7 to -8.
  const desired = new Map([
    ['2026-11-11-0', desiredDoc('2026-11-11', '3:00 PM', 'ev-new-1500')],
    ['2026-11-11-8', desiredDoc('2026-11-11', '6:00 PM', 'ev-1111-1800')],
  ]);
  const existing = new Map([['2026-11-11-7', { ...desiredDoc('2026-11-11', '6:00 PM', 'ev-1111-1800'), ...FLAG }]]);
  const plan = planSync(desired, existing);
  // Kept under its old id, as a booked session is: the move would be a delete plus a full-doc create without the flag.
  assert.deepEqual(plan.deletes, []);
  assert.deepEqual(plan.creates.map((c) => c.id), ['2026-11-11-0']);
  assert.deepEqual(plan.updates.map((u) => [u.id, u.keptId]), [['2026-11-11-7', true]]);
  assert.deepEqual(plan.conflicts, ['sessions/2026-11-11-7 is hidden but its event now maps to 2026-11-11-8; patched in place so it stays hidden — id no longer encodes day-order.']);
  assert.ok(planReport(plan, desired, existing).includes(`  CONFLICT: ${plan.conflicts[0]}`));
  // The new 3 PM event is a create carrying no flag; the hidden doc gets the masked patch, the flag outside its mask.
  const writes = planWrites(plan);
  assert.deepEqual(writes.map((w) => w.update.name.split('/').pop()), ['2026-11-11-0', '2026-11-11-7']);
  for (const key of HIDDEN_KEYS) {
    assert.ok(!(key in writes[0].update.fields), key);
    assert.ok(!writes[1].updateMask.fieldPaths.includes(key), key);
    assert.ok(!(key in writes[1].update.fields), key);
  }
});

test('an empty session that is NOT hidden still moves to its new id, as it always did', () => {
  const desired = new Map([
    ['2026-11-11-0', desiredDoc('2026-11-11', '3:00 PM', 'ev-new-1500')],
    ['2026-11-11-8', desiredDoc('2026-11-11', '6:00 PM', 'ev-1111-1800')],
  ]);
  const existing = new Map([['2026-11-11-7', desiredDoc('2026-11-11', '6:00 PM', 'ev-1111-1800')]]);
  const plan = planSync(desired, existing);
  assert.deepEqual(plan.deletes.map((d) => [d.id, d.reason]), [['2026-11-11-7', 'moved to 2026-11-11-8']]);
  assert.deepEqual(plan.creates.map((c) => c.id).sort(), ['2026-11-11-0', '2026-11-11-8']);
  assert.deepEqual(plan.conflicts, []);
});

test("a hidden session whose calendar event is gone is reaped like any other: deleted when empty", () => {
  const existing = new Map([['2026-11-11-7', { ...desiredDoc('2026-11-11', '6:00 PM', 'ev-1111-1800'), ...FLAG }]]);
  const plan = planSync(new Map(), existing);
  assert.deepEqual(plan.deletes.map((d) => d.id), ['2026-11-11-7']);
});
