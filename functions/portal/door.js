/**
 * unlockDoor - the portal's facility door button (owner "Lets build it",
 * 2026-11-17; docs/portal/plans/2026-11-17-door-button/00-spec.md 5.2).
 *
 *   in   {check: true}
 *   out  {canUnlock, reason, staff, openSeconds}   reads only, never throws
 *                                                   a refusal
 *   in   {pressId, location: {lat, lng, accuracy}}
 *   out  {outcome: 'opened'|'coalesced'|'test', openSeconds}, or an
 *        HttpsError whose details.reason the app shows (door-decide's
 *        REFUSALS holds every code and its copy)
 *
 * A press: the caller's users doc, doorConfig/main and, for a family
 * login, the household, its athletes, its doorPauses doc, the caller's
 * doorRules and (a 16-17 athlete) the household's doorRules. A press id
 * already logged answers from its event (a client retry never opens the
 * door twice). door-decide.js decides. Then ONE transaction on
 * doorLimits/{uid} that also creates doorEvents/{uid}_{pressId}:
 *   - more than 40 calls in the last hour: rate-limited, nothing written;
 *   - refused: event 'denied' with the reason, then the refusal;
 *   - an open in the last 10 s: event 'coalesced', no Alta request;
 *   - 12 opens in the last hour: event 'denied' 'rate-limited';
 *   - else the open is recorded, event 'pending' ('test' for a test
 *     household, which never reaches Alta).
 * Then Alta (door-alta.js): 2xx is 'opened'; anything else is 'error' with
 * the reason, and the open is given back so "Hold again" opens rather
 * than coalescing onto a door that never moved.
 *
 * Every press logs one line (`unlockDoor: <outcome> ...`) so a press can
 * be found in the function's logs. The API link and its token are never
 * logged, returned or stored.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
// See portal/staff-cancel.js: the modular export survives the emulator.
const {Timestamp} = require('firebase-admin/firestore');
const {DOOR_SECRETS} = require('./secrets');
const {todayISO} = require('./lib');
const {FAMILY_ROLES, REFUSALS, decide, needsGuardian, openSecondsOf} =
    require('./door-decide');
const {openDoor} = require('./door-alta');

const {HttpsError} = functions.https;

const PRESS_ID = /^[A-Za-z0-9-]{8,64}$/;
const CALL_LIMIT = 40;
const OPEN_LIMIT = 12;
const WINDOW_MS = 60 * 60 * 1000;
const COALESCE_MS = 10 * 1000;
const DONE = ['opened', 'coalesced', 'test'];

/**
 * @param {string} reason A key of REFUSALS.
 * @return {!HttpsError} The typed refusal, with its plain copy.
 */
function refusal(reason) {
  const r = REFUSALS[reason] || REFUSALS['alta-error'];
  return new HttpsError(r.code, r.message, {reason});
}

/** @return {!Object} The admin Firestore. */
function defaultDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

/**
 * @param {!Object} snap A document snapshot.
 * @return {?Object} Its data, or null.
 */
const dataOf = (snap) => (snap.exists ? snap.data() || {} : null);

/**
 * Every read a door decision needs. Missing documents are nulls.
 * @param {!Object} store An admin Firestore.
 * @param {string} uid The caller.
 * @param {string} today Chicago 'YYYY-MM-DD'.
 * @return {!Promise<!Object>} `{user, config, household, athletes, paused,
 *     myRules, householdRules}`.
 */
async function loadDoor(store, uid, today) {
  const [userSnap, configSnap] = await Promise.all([
    store.collection('users').doc(uid).get(),
    store.collection('doorConfig').doc('main').get(),
  ]);
  const ctx = {user: dataOf(userSnap), config: dataOf(configSnap),
    household: null, athletes: [], paused: false, myRules: null,
    householdRules: []};
  const u = ctx.user;
  if (!u || !FAMILY_ROLES.includes(u.role) || !u.householdId) return ctx;
  const hid = u.householdId;
  const [household, athletes, pause, mine] = await Promise.all([
    store.collection('households').doc(hid).get(),
    store.collection('athletes').where('householdId', '==', hid).get(),
    store.collection('doorPauses').doc(hid).get(),
    store.collection('doorRules').doc(uid).get(),
  ]);
  ctx.household = dataOf(household);
  ctx.athletes = athletes.docs.map((d) =>
    Object.assign({id: d.id}, d.data()));
  ctx.paused = pause.exists;
  ctx.myRules = dataOf(mine);
  if (needsGuardian(u, ctx.athletes, today)) {
    const rules = await store.collection('doorRules')
        .where('householdId', '==', hid).get();
    ctx.householdRules = rules.docs.map((d) => d.data());
  }
  return ctx;
}

/**
 * The event as it is first written; the Alta fields are filled later.
 * @param {string} uid The caller.
 * @param {!Object} ctx From loadDoor.
 * @param {!Object} decision decide()'s answer.
 * @param {number} nowMs The clock.
 * @return {!Object} The doorEvents body, without outcome and reason.
 */
function eventBase(uid, ctx, decision, nowMs) {
  const u = ctx.user;
  const family = FAMILY_ROLES.includes(u.role) && Boolean(u.householdId);
  const own = ctx.athletes.find((a) => a.id === u.athleteId);
  const text = (v) => (typeof v === 'string' && v.trim() ?
      v.trim().slice(0, 120) : null);
  return {
    uid, role: text(u.role), name: text(u.displayName) ||
        text(own && own.name) || 'Unknown',
    householdId: family ? u.householdId : null,
    householdName: family ? text(ctx.household && ctx.household.name) : null,
    athleteId: u.role === 'athlete' ? text(u.athleteId) : null,
    atMs: nowMs, at: Timestamp.fromMillis(nowMs),
    altaStatus: null, latencyMs: null,
    distanceM: decision.distanceM, accuracyM: decision.accuracyM,
    test: decision.test,
  };
}

/**
 * @param {*} list A stored array of millis.
 * @param {number} nowMs The clock.
 * @return {!Array<number>} The entries inside the last hour, or later
 *     (a press that read an earlier clock may commit after this one).
 */
function recent(list, nowMs) {
  return (Array.isArray(list) ? list : []).filter((t) =>
    typeof t === 'number' && t > nowMs - WINDOW_MS);
}

/**
 * The transaction's body: the limits, the coalesce and the event.
 * @param {!Object} tx The transaction.
 * @param {!Object} refs `{limits, event}` document references.
 * @param {!Object} decision decide()'s answer.
 * @param {!Object} base eventBase()'s body.
 * @param {number} nowMs The clock.
 * @return {!Promise<{outcome: ?string, reason: ?string, replay: ?Object}>}
 *     The step taken. `outcome` null with reason 'rate-limited' wrote
 *     nothing.
 */
async function reserve(tx, refs, decision, base, nowMs) {
  const limSnap = await tx.get(refs.limits);
  const evSnap = await tx.get(refs.event);
  if (evSnap.exists) {
    return {outcome: null, reason: null, replay: evSnap.data() || {}};
  }
  const lim = dataOf(limSnap) || {};
  const calls = recent(lim.callsAtMs, nowMs);
  if (calls.length >= CALL_LIMIT) {
    return {outcome: null, reason: 'rate-limited', replay: null};
  }
  const opens = recent(lim.opensAtMs, nowMs);
  const last = typeof lim.lastOpenedAtMs === 'number' ?
      lim.lastOpenedAtMs : null;
  const next = {callsAtMs: calls.concat([nowMs]), opensAtMs: opens,
    lastOpenedAtMs: last, updatedAtMs: nowMs};
  let outcome = 'pending';
  let reason = null;
  if (!decision.ok) {
    outcome = 'denied';
    reason = decision.reason;
  } else if (last !== null && nowMs - last < COALESCE_MS) {
    outcome = 'coalesced';
  } else if (opens.length >= OPEN_LIMIT) {
    outcome = 'denied';
    reason = 'rate-limited';
  } else {
    next.opensAtMs = opens.concat([nowMs]);
    next.lastOpenedAtMs = nowMs;
    if (decision.test) outcome = 'test';
  }
  tx.set(refs.limits, next);
  tx.create(refs.event, Object.assign({}, base, {outcome, reason}));
  return {outcome, reason, replay: null};
}

/**
 * Gives back an open the door never made, so the next press is a real
 * open and the hour's count is right. Best effort: logged when it fails.
 * @param {!Object} store An admin Firestore.
 * @param {!Object} ref doorLimits/{uid}.
 * @param {number} nowMs The open's time.
 * @return {!Promise<void>} Resolves either way.
 */
async function giveBack(store, ref, nowMs) {
  try {
    await store.runTransaction(async (tx) => {
      const lim = dataOf(await tx.get(ref));
      if (!lim || !Array.isArray(lim.opensAtMs)) return;
      const opens = lim.opensAtMs.filter((t) => typeof t === 'number');
      const i = opens.lastIndexOf(nowMs);
      if (i < 0) return;
      opens.splice(i, 1);
      const patch = {opensAtMs: opens, updatedAtMs: nowMs};
      if (lim.lastOpenedAtMs === nowMs) {
        patch.lastOpenedAtMs = opens.length ? Math.max(...opens) : null;
      }
      tx.update(ref, patch);
    });
  } catch (err) {
    console.error('unlockDoor: the open slot was not given back:',
        err && err.name);
  }
}

/**
 * Fills in the event after Alta answered. Best effort: logged on failure.
 * @param {!Object} ref doorEvents/{id}.
 * @param {!Object} patch The fields.
 * @return {!Promise<void>} Resolves either way.
 */
async function settle(ref, patch) {
  try {
    await ref.update(patch);
  } catch (err) {
    console.error('unlockDoor: the event was not updated:', err && err.name);
  }
}

/**
 * One log line per press. Values are ids, codes and numbers only.
 * @param {string} outcome The outcome.
 * @param {!Object} base eventBase()'s body.
 * @param {!Object=} extra More `key=value` pairs.
 */
function logPress(outcome, base, extra) {
  const parts = Object.entries(Object.assign({uid: base.uid,
    role: base.role, household: base.householdId}, extra || {}))
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}=${v}`);
  const line = `unlockDoor: ${outcome} ${parts.join(' ')}`;
  if (outcome === 'error') console.error(line);
  else console.log(line);
}

/**
 * @param {!Object} ev A stored doorEvents body.
 * @param {number} openSeconds The open time.
 * @return {{outcome: string, openSeconds: number}} The first answer again.
 */
function replayOf(ev, openSeconds) {
  if (DONE.includes(ev.outcome)) return {outcome: ev.outcome, openSeconds};
  if (ev.outcome === 'pending') throw refusal('in-progress');
  throw refusal(ev.reason);
}

/**
 * The callable's body, exported so the unit tests can call it in-process.
 * @param {*} data `{check: true}` or `{pressId, location}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), fetch: (!Function|undefined),
 *     env: (!Object|undefined), now: (!Date|undefined)}=} deps Test seams.
 * @return {!Promise<!Object>} The check's or the press's answer.
 */
async function unlockDoorHandler(data, context, deps) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) throw refusal('signed-out');
  const d = deps || {};
  const req = data && typeof data === 'object' ? data : {};
  const now = d.now instanceof Date ? d.now : new Date();
  const nowMs = now.getTime();
  const today = todayISO(now);
  const uid = auth.uid;
  if (req.check !== true &&
      (typeof req.pressId !== 'string' || !PRESS_ID.test(req.pressId))) {
    throw refusal('bad-request');
  }
  const store = d.db || defaultDb();
  const ctx = await loadDoor(store, uid, today);
  const openSeconds = openSecondsOf(ctx.config);
  if (req.check === true) {
    if (!ctx.user) {
      return {canUnlock: false, reason: 'not-provisioned', staff: false,
        openSeconds};
    }
    const c = decide(Object.assign({}, ctx, {today, location: null,
      mode: 'check'}));
    return {canUnlock: c.ok, reason: c.reason, staff: c.staff, openSeconds};
  }
  if (!ctx.user) throw refusal('not-provisioned');

  const refs = {
    limits: store.collection('doorLimits').doc(uid),
    event: store.collection('doorEvents').doc(`${uid}_${req.pressId}`),
  };
  const prior = await refs.event.get();
  if (prior.exists) return replayOf(prior.data() || {}, openSeconds);

  const decision = decide(Object.assign({}, ctx, {today,
    location: req.location, mode: 'unlock'}));
  const base = eventBase(uid, ctx, decision, nowMs);
  const step = await store.runTransaction((tx) =>
    reserve(tx, refs, decision, base, nowMs));
  if (step.replay) return replayOf(step.replay, openSeconds);
  const where = {distanceM: decision.distanceM, accuracyM: decision.accuracyM};
  if (step.outcome === null || step.outcome === 'denied') {
    logPress('denied', base, Object.assign({reason: step.reason}, where,
        step.outcome === null ? {logged: 'no'} : {}));
    throw refusal(step.reason);
  }
  if (step.outcome === 'coalesced' || step.outcome === 'test') {
    logPress(step.outcome, base, where);
    return {outcome: step.outcome, openSeconds};
  }

  const alta = await openDoor({fetch: d.fetch || fetch,
    env: d.env || process.env});
  const answer = {altaStatus: alta.status, latencyMs: alta.latencyMs};
  if (alta.ok) {
    await settle(refs.event, Object.assign({outcome: 'opened'}, answer));
    logPress('opened', base, Object.assign({}, answer, where,
        alta.fake ? {alta: 'emulator fake'} : {}));
    return {outcome: 'opened', openSeconds};
  }
  await settle(refs.event, Object.assign({outcome: 'error',
    reason: alta.reason}, answer));
  await giveBack(store, refs.limits, nowMs);
  logPress('error', base, Object.assign({reason: alta.reason}, answer,
      alta.failure ? {failure: alta.failure} : {}));
  throw refusal(alta.reason);
}

/** The callable. Binds the Alta API link on this function only. */
const unlockDoor = functions
    .runWith({secrets: DOOR_SECRETS, timeoutSeconds: 20, memory: '256MB'})
    .https.onCall((data, context) => unlockDoorHandler(data, context));

module.exports = {CALL_LIMIT, COALESCE_MS, OPEN_LIMIT, WINDOW_MS, unlockDoor,
  unlockDoorHandler};
