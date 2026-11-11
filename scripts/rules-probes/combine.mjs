/**
 * Parallax intake swings and combine scores (docs/portal/plans/2026-11-11-parallax-combine/00-spec.md 3 and 4).
 * athletes/{id}/milestones/parallaxIntake: one fixed id, create-only; a coach
 * (Phil included) or the owner ticks it with `at` the server time and `by`
 * the caller; nobody updates it; the owner deletes it any time, whoever
 * ticked it within ten minutes; staff read it, families do not.
 * athletes/{id}/combineScores/{autoId}: a coach or the owner for any
 * athlete, the athlete's own login, a parent of the household; the seven
 * keys, the four distances, a whole score 0..1000, a real date not ahead of
 * the UTC today and less than 62 days back; nobody updates; the enterer and
 * the owner delete. Run by scripts/verify-rules.mjs in both passes. It seeds
 * and removes everything it touches, and sweeps both subcollections before
 * and after: teardown() deletes only the athlete docs, Firestore never
 * deletes a subcollection with its parent, and both passes use the same ids.
 * Module scope holds constants and arrow helpers only (verify-rules.mjs
 * imports this file before its own body runs).
 */
import { call, commitAs, createAs, del, expect, groupListAs, listUnderAs, patchWrite, seed, t, token, uid } from '../verify-rules.mjs';

const ATHLETES = ['ath-active', 'ath-other', 'ath-absent', 'ath-pending', 'ath-elite', 'ath-elite-pending', 'cb-nohh'];
const CB_USERS = [
  ['cb-owner', { role: 'owner' }],
  ['cb-mental', { role: 'mental', specialistId: 'mental' }],
  ['cb-phil', { role: 'coach', specialistId: 'phil' }],
  ['cb-coach2', { role: 'coach' }],
  ['cb-parent-nohh', { role: 'parent', householdId: null, athleteId: null }],
];
const INTAKE = 'parallaxIntake';
const MS = (a) => `athletes/${a}/milestones`;
const CS = (a = 'ath-active') => `athletes/${a}/combineScores`;
const tok = (u) => token(u, { email: `${u}@example.com`, email_verified: true });
// Document paths with no leading slash; call() builds `${BASE}${path}`, so the slash is added here.
const getAs = (auth, path) => call('GET', '/' + path, null, auth).then((r) => r.status);
const delAs = (auth, path) => call('DELETE', '/' + path, null, auth).then((r) => r.status);
/** The UTC date `n` days back (negative: ahead). */
const utcDay = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const intake = (a, by = uid.coach, byName = 'Luke', extra = {}) => ({ athleteId: a, by, byName, ...extra });
const score = (by, role, extra = {}) => ({ athleteId: 'ath-active', distance: 'u100', score: 742, date: utcDay(0), enteredBy: by, enteredRole: role, ...extra });
// A tick as hooks/parallaxLive.js createIntake sends it: `at` the server's REQUEST_TIME.
const tick = (auth, a, fields, id = INTAKE) => createAs(auth, MS(a), id, fields, ['at']);
// A write over an existing tick: the fields under the mask, `at` the server time beside it (the SDK's shape).
const retick = (auth, a, fields) => commitAs(auth, [patchWrite(MS(a), INTAKE, fields, Object.keys(fields), ['at'])]);

/** Every milestone and combine score under the probe athletes, deleted as the emulator admin. */
async function sweep() {
  for (const a of ATHLETES) {
    for (const sub of ['milestones', 'combineScores']) {
      const { body } = await call('GET', `/athletes/${a}/${sub}?pageSize=300`, null, 'owner');
      for (const d of body?.documents ?? []) await call('DELETE', '/' + d.name.split('/documents/')[1], null, 'owner');
    }
  }
}

async function intakeCases(k) {
  const active = `${MS('ath-active')}/${INTAKE}`;
  const other = `${MS('ath-other')}/${INTAKE}`;
  expect('intake: the coach ticks ath-active', await tick(t.coach, 'ath-active', intake('ath-active')), 200);
  expect('intake: a second coach writing over the tick refused', await retick(k.coach2, 'ath-active', intake('ath-active', 'cb-coach2', 'Sam')), 403);
  expect('intake: the coach who ticked it re-ticking refused (it would reset at)', await retick(t.coach, 'ath-active', intake('ath-active')), 403);
  expect('intake: the owner writing over the tick refused', await retick(k.owner, 'ath-active', intake('ath-active', 'cb-owner', 'Owner')), 403);
  expect('intake: a second coach deletes the fresh tick refused', await delAs(k.coach2, active), 403);
  expect('intake: mental deletes the fresh tick refused', await delAs(k.mental, active), 403);
  expect('intake: ops deletes the fresh tick refused', await delAs(t.ops, active), 403);
  expect('intake: the coach who ticked it deletes it inside ten minutes', await delAs(t.coach, active), 200);
  expect('intake: the owner ticks ath-other', await tick(k.owner, 'ath-other', intake('ath-other', 'cb-owner', 'Owner')), 200);
  expect('intake: Phil (role coach) ticks ath-elite', await tick(k.phil, 'ath-elite', intake('ath-elite', 'cb-phil', 'Phil')), 200);

  for (const [who, auth, by] of [['mental', k.mental, 'cb-mental'], ['ops', t.ops, uid.ops], ['the parent', t.parent, uid.parent], ['the athlete login', t.athlete, uid.athlete]]) {
    expect(`intake: ${who} ticks refused`, await tick(auth, 'ath-absent', intake('ath-absent', by, 'Dana')), 403);
  }
  const clientAt = intake('ath-absent', uid.coach, 'Luke', { at: new Date(Date.now() - 60000) });
  expect('intake: at a client time a minute ago, no server time, refused', await createAs(t.coach, MS('ath-absent'), INTAKE, clientAt, []), 403);
  expect('intake: by another uid refused', await tick(t.coach, 'ath-absent', intake('ath-absent', 'cb-coach2')), 403);
  expect("intake: byName '' refused", await tick(t.coach, 'ath-absent', intake('ath-absent', uid.coach, '')), 403);
  expect('intake: byName 41 characters refused', await tick(t.coach, 'ath-absent', intake('ath-absent', uid.coach, 'L'.repeat(41))), 403);
  expect('intake: an extra key note refused', await tick(t.coach, 'ath-absent', intake('ath-absent', uid.coach, 'Luke', { note: 'x' })), 403);
  const noName = intake('ath-absent');
  delete noName.byName;
  expect('intake: no byName key refused', await tick(t.coach, 'ath-absent', noName), 403);
  expect("intake: athleteId another athlete's refused", await tick(t.coach, 'ath-absent', intake('ath-other')), 403);
  expect('intake: doc id parallaxSwings refused', await tick(t.coach, 'ath-absent', intake('ath-absent'), 'parallaxSwings'), 403);
  expect('intake: byName exactly 40 characters', await tick(t.coach, 'ath-pending', intake('ath-pending', uid.coach, 'L'.repeat(40))), 200);

  for (const [who, auth] of [['the coach', t.coach], ['mental', k.mental], ['ops', t.ops], ['the owner', k.owner], ['Phil', k.phil]]) {
    expect(`intake: ${who} reads a tick`, await getAs(auth, other), 200);
  }
  expect("intake: the athlete's own household parent reads it refused", await getAs(t.other, other), 403);
  // A tick that exists (Phil's on ath-elite): a read of a missing doc is refused by any rule that reads resource.
  const elite = `${MS('ath-elite')}/${INTAKE}`;
  expect("intake: an athlete login reads its own athlete's tick refused", await getAs(t.eliteLogin, elite), 403);
  expect("intake: a parent of the athlete's household reads the tick refused", await getAs(t.parent, elite), 403);
  expect('intake: a stranger reads it refused', await getAs(t.stranger, other), 403);
  expect('intake: the coach gets a tick that does not exist: not found', await getAs(t.coach, `${MS('ath-absent')}/${INTAKE}`), 404);
  // No {path=**}/milestones match: a collection-group query lists nobody's ticks.
  expect('intake: the coach queries the milestones collection group refused', await groupListAs(t.coach, 'milestones'), 403);

  // The ten-minute window, both sides (a 10 s or 1 m typo in the rule fails the first case).
  const aged = (min) => seed(MS('ath-elite-pending'), INTAKE, { athleteId: 'ath-elite-pending', at: new Date(Date.now() - min * 60000), by: uid.coach, byName: 'Luke' });
  const agedPath = `${MS('ath-elite-pending')}/${INTAKE}`;
  await aged(9);
  expect('intake: the coach deletes their own nine-minute-old tick', await delAs(t.coach, agedPath), 200);
  await aged(11);
  expect('intake: the coach deletes their own eleven-minute-old tick refused', await delAs(t.coach, agedPath), 403);
  expect('intake: the owner deletes the eleven-minute-old tick', await delAs(k.owner, agedPath), 200);
}

async function scoreCases(k) {
  let n = 0;
  const enter = (auth, fields, col = CS(), id = `cb-case-${(n += 1)}`) => createAs(auth, col, id, fields);
  expect('score: the coach enters', await enter(t.coach, score(uid.coach, 'coach'), CS(), 'cb-coach'), 200);
  expect('score: the owner enters', await enter(k.owner, score('cb-owner', 'owner'), CS(), 'cb-owner'), 200);
  expect('score: Phil enters as coach', await enter(k.phil, score('cb-phil', 'coach'), CS(), 'cb-phil'), 200);
  expect("score: the athlete's own login enters", await enter(t.athlete, score(uid.athlete, 'athlete'), CS(), 'cb-athlete'), 200);
  expect('score: a parent of the household enters', await enter(t.parent, score(uid.parent, 'parent'), CS(), 'cb-parent'), 200);
  expect('score: the parent enters for ath-absent (no login of its own)',
    await enter(t.parent, score(uid.parent, 'parent', { athleteId: 'ath-absent' }), CS('ath-absent'), 'cb-absent'), 200);
  expect("score: an athlete login enters for another athlete of its household refused",
    await enter(t.athlete, score(uid.athlete, 'athlete', { athleteId: 'ath-absent' }), CS('ath-absent')), 403);

  expect('score: a parent of another household refused', await enter(t.other, score(uid.other, 'parent')), 403);
  expect("score: an athlete login on another household's athlete refused",
    await enter(t.athlete, score(uid.athlete, 'athlete', { athleteId: 'ath-other' }), CS('ath-other')), 403);
  expect('score: ops refused', await enter(t.ops, score(uid.ops, 'ops')), 403);
  expect('score: mental refused', await enter(k.mental, score('cb-mental', 'mental')), 403);
  expect('score: a stranger refused', await enter(t.stranger, score(uid.stranger, 'parent')), 403);
  expect('score: a parent with no household on an athlete with none refused',
    await enter(k.nohh, score('cb-parent-nohh', 'parent', { athleteId: 'cb-nohh' }), CS('cb-nohh')), 403);

  expect("score: the coach claiming enteredRole 'owner' refused", await enter(t.coach, score(uid.coach, 'owner')), 403);
  expect("score: the parent claiming enteredRole 'coach' refused", await enter(t.parent, score(uid.parent, 'coach')), 403);
  expect('score: enteredBy another uid refused', await enter(t.coach, score(uid.parent, 'coach')), 403);
  // A minute back, so the client time can never land on request.time's own millisecond (it did on loopback).
  expect('score: createdAt a client time, no server time, refused',
    await createAs(t.coach, CS(), `cb-case-${(n += 1)}`, score(uid.coach, 'coach', { createdAt: new Date(Date.now() - 60000) }), []), 403);

  for (const d of ['u125', 'u150', 'u180']) expect(`score: distance ${d}`, await enter(t.coach, score(uid.coach, 'coach', { distance: d })), 200);
  for (const d of ['u200', 'U100', '']) expect(`score: distance '${d}' refused`, await enter(t.coach, score(uid.coach, 'coach', { distance: d })), 403);
  for (const s of [0, 1000]) expect(`score: ${s}`, await enter(t.coach, score(uid.coach, 'coach', { score: s })), 200);
  for (const s of [1001, -1, 742.5, '742']) expect(`score: ${JSON.stringify(s)} refused`, await enter(t.coach, score(uid.coach, 'coach', { score: s })), 403);

  // In the Chicago evening the client's oldest date is the UTC date 61 days back; tomorrow and 62 back are refused at any hour.
  for (const [label, n0] of [['today (UTC)', 0], ['59 days back', 59], ['61 days back', 61]]) {
    expect(`score: date ${label}`, await enter(t.coach, score(uid.coach, 'coach', { date: utcDay(n0) })), 200);
  }
  expect('score: date tomorrow (UTC) refused', await enter(t.coach, score(uid.coach, 'coach', { date: utcDay(-1) })), 403);
  expect('score: date 62 days back refused', await enter(t.coach, score(uid.coach, 'coach', { date: utcDay(62) })), 403);
  expect('score: date with day 00 refused', await enter(t.coach, score(uid.coach, 'coach', { date: `${utcDay(20).slice(0, 8)}00` })), 403);
  expect("score: date '2026-11-5' refused", await enter(t.coach, score(uid.coach, 'coach', { date: '2026-11-5' })), 403);

  expect('score: an extra key note refused', await enter(t.coach, score(uid.coach, 'coach', { note: 'x' })), 403);
  const noDate = score(uid.coach, 'coach');
  delete noDate.date;
  expect('score: no date key refused', await enter(t.coach, noDate), 403);
  expect("score: athleteId another athlete's refused", await enter(t.coach, score(uid.coach, 'coach', { athleteId: 'ath-other' })), 403);

  for (const [who, auth] of [['the coach', t.coach], ['the owner', k.owner], ['Phil, who entered it', k.phil]]) {
    expect(`score: ${who} updates a score refused`, await commitAs(auth, [patchWrite(CS(), 'cb-phil', { score: 800 })]), 403);
  }

  const doc = (id) => `${CS()}/${id}`;
  expect('score: the parent deletes their own', await delAs(t.parent, doc('cb-parent')), 200);
  expect("score: the parent deletes the coach's refused", await delAs(t.parent, doc('cb-coach')), 403);
  expect("score: the parent deletes the athlete's refused", await delAs(t.parent, doc('cb-athlete')), 403);
  expect('score: the athlete login deletes its own', await delAs(t.athlete, doc('cb-athlete')), 200);
  for (const [who, auth] of [['a second coach', k.coach2], ['mental', k.mental], ['ops', t.ops]]) {
    expect(`score: ${who} deletes the coach's refused`, await delAs(auth, doc('cb-coach')), 403);
  }
  expect('score: the coach deletes their own', await delAs(t.coach, doc('cb-coach')), 200);
  expect("score: the owner deletes Phil's", await delAs(k.owner, doc('cb-phil')), 200);

  const list = (auth, a = 'ath-active') => listUnderAs(auth, `athletes/${a}`, 'combineScores');
  for (const [who, auth] of [['the athlete login', t.athlete], ['the parent', t.parent], ['the coach', t.coach], ['mental', k.mental], ['ops', t.ops],
    ['the owner', k.owner], ['Phil', k.phil]]) {
    expect(`score: ${who} lists an athlete's scores`, await list(auth), 200);
  }
  expect('score: a parent of another household lists refused', await list(t.other), 403);
  expect('score: a stranger lists refused', await list(t.stranger), 403);
  expect("score: an athlete login lists another household's athlete refused", await list(t.athlete, 'ath-other'), 403);
  // A sibling in the same household (ath-absent holds cb-absent): only a parent reads by household.
  expect("score: an athlete login lists a sibling's scores refused", await list(t.athlete, 'ath-absent'), 403);
  expect("score: an athlete login reads a sibling's score refused", await getAs(t.athlete, `${CS('ath-absent')}/cb-absent`), 403);
  // No {path=**}/combineScores match: a collection-group query lists nobody's scores.
  expect('score: a parent queries the combineScores collection group refused', await groupListAs(t.parent, 'combineScores'), 403);
  expect('score: the coach queries the combineScores collection group refused', await groupListAs(t.coach, 'combineScores'), 403);
  expect('score: a parent with no household lists an athlete with none refused', await list(k.nohh, 'cb-nohh'), 403);
}

export async function taskCombine() {
  console.log('Parallax intake swings (create-only, staff read, ten-minute undo, owner clears) and combine scores (coach, owner, athlete, household parent; no update)');
  const k = { owner: tok('cb-owner'), mental: tok('cb-mental'), phil: tok('cb-phil'), coach2: tok('cb-coach2'), nohh: tok('cb-parent-nohh') };
  try {
    await sweep();
    for (const [id, fields] of CB_USERS) await seed('users', id, fields);
    await seed('athletes', 'cb-nohh', { name: 'cb-nohh', householdId: null });
    await intakeCases(k);
    await scoreCases(k);
  } finally {
    await sweep();
    for (const [id] of CB_USERS) await del('users', id);
    await del('athletes', 'cb-nohh');
  }
}
