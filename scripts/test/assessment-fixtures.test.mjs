import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORIES, addDaysISO, assessmentFixtures } from '../lib/assessment-fixtures.mjs';

// The frontend's season rule (August-July), restated for the test only.
const seasonOf = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
const MODE = { waveSize: 4, trialCounts: { cmjScored: 2 } };
const fx = (athletes, over = {}) => assessmentFixtures({ todayISO: '2026-10-15', mode: MODE, seasonOf, athletes, ...over });

test('tested: a complete baseline nine weeks back with every section, and its profile', () => {
  const { collections } = fx([{ id: 'kid1', story: 'tested', sex: 'female' }]);
  const windows = collections['athletes/kid1/assessments'];
  assert.deepEqual([...windows.keys()], ['2026-27-baseline']);
  const w = windows.get('2026-27-baseline');
  assert.equal(w.circuitDate, addDaysISO('2026-10-15', -63));
  assert.equal(w.circuitDate, '2026-08-13');
  assert.equal(w.status, 'complete');
  assert.equal(w.protocolVersion, 'v1.2');
  assert.deepEqual(w.circuitMode, MODE);
  for (const s of ['readiness', 'log', 'anthro', 'grip', 'cmj', 'hop', 'medball', 'mcgill', 'golf']) {
    assert.ok(w[s], s);
    assert.equal(w.enteredBy[s], 'phil', s);
  }
  const profile = collections['athletes/kid1/assessmentProfile'].get('current');
  assert.deepEqual([profile.sex, profile.firstTestDate, profile.medballMassKg, profile.medballMethod, profile.season], ['female', '2026-08-13', 2, 'speed', '2026-27']);
});

test('research per story: yes, no, or not answered; an 18+ athlete has no assent', () => {
  const { consents } = fx([{ id: 'a', story: 'tested' }, { id: 'b', story: 'due', adult: true }, { id: 'c', story: 'declined' }, { id: 'd', story: 'unanswered' }]);
  assert.deepEqual([consents.a.research.value, consents.a.research.assent], [true, true]);
  assert.equal(consents.a.research.recordedAt.toISOString().slice(0, 10), '2026-08-06');
  assert.deepEqual([consents.b.research.value, consents.b.research.assent], [true, null]);
  assert.deepEqual([consents.c.research.value, consents.c.research.assent], [false, false]);
  assert.equal(consents.d.research, null);
  assert.deepEqual(consents.d.signature, { name: 'Fixture Guardian', date: '2026-08-06' });
  assert.equal(consents.d.dataCollection, true);
});

test('only tested athletes have windows', () => {
  const { collections } = fx([{ id: 'b', story: 'due' }, { id: 'c', story: 'declined' }, { id: 'd', story: 'unanswered' }]);
  assert.deepEqual(Object.keys(collections), []);
});

test('every typed value sits inside the ranges firestore.rules holds', () => {
  const w = fx([{ id: 'k', story: 'tested' }]).collections['athletes/k/assessments'].get('2026-27-baseline');
  const inRange = (list, lo, hi) => list.every((v) => v == null || (v >= lo && v <= hi));
  assert.ok(inRange(w.grip.right.concat(w.grip.left), 0, 100));
  assert.ok(inRange(w.anthro.standing, 90, 215) && inRange(w.anthro.mass, 15, 160) && inRange(w.anthro.sittingRaw, 40, 140));
  assert.ok(w.anthro.boxHeight >= 20 && w.anthro.boxHeight <= 80);
  assert.ok(w.cmj.trials.length <= 3 && w.cmj.trials.every((t) => inRange([t.heightCm], 0, 90) && inRange([t.rsiMod], 0, 2) && inRange([t.asymmetryPct], 0, 60)));
  assert.ok(w.hop.sets.every((s) => inRange([s.rsiBest5], 0, 5) && inRange([s.gctMs], 80, 600)));
  assert.ok(inRange(w.medball.throws, 0, 60) && [2, 3, 4].includes(w.medball.massKg));
  assert.ok(inRange([w.mcgill.flexorSec, w.mcgill.extensorSec, w.mcgill.sideRightSec, w.mcgill.sideLeftSec], 0, 300));
  assert.ok(inRange(w.golf.speeds, 30, 140) && inRange([w.golf.parallaxComposite], 0, 100) && inRange([w.golf.fps], 30, 1000));
});

test('an unknown story is refused, and the stories are the four documented', () => {
  assert.deepEqual(STORIES, ['tested', 'due', 'declined', 'unanswered']);
  assert.throws(() => fx([{ id: 'x', story: 'mystery' }]), /unknown story "mystery"/);
});
