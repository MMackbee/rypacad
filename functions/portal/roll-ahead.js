/**
 * rollTokenAhead - a family books a NEXT-month session with this month's
 * leftover token, before the month ends (owner 2026-11-16, the Schmidt case:
 * one November token left, all of December's booked, and the app refused a
 * seventh December session until Dec 1).
 *
 *   in   {athleteId: string, date: 'YYYY-MM-DD'}   the session's date
 *   out  {graceTokenId, expiresAt, sourcePeriodKey}
 *
 * The nightly job (portal/rollover.js) turns a period's unused tokens into
 * rolled-over tokens once the period has ended. This callable does the same
 * for ONE token while the period is still running, and only when the family
 * needs it: the session is in the period that follows, and nothing there can
 * pay for it (no period token left, no bonus or rolled-over token covering
 * the date). The app then books with the token like any other grace token -
 * the rules, the charge order, cancel, move and the reminders need nothing
 * new.
 *
 * The token carries the id the nightly job would give it
 * (`rollover_{athleteId}_{periodKey}_{n}`), so the job finds it on the 1st
 * and mints only what is still missing. Until then `lib.tokensPosition`
 * takes it off the running period's count (`rolledAhead`): the token has
 * left the month, it is not there to spend twice.
 *
 * Same conditions as the job: a monthly token package, a membership that
 * may book, and a period that rolls at all. A running period with no
 * `tokenPeriods` doc is counted at the package's own number, as every
 * screen counts it (owner 2026-11-16: "she clearly has the tokens"), when
 * `rollover.packageCountStands` (third day on, billing active since before
 * the period began). Nothing is written for that: the token is the only
 * document created. Every read comes first, `decideRollAhead` decides, and
 * a refusal is an HttpsError that writes nothing.
 */

'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const lib = require('./lib');
const rollover = require('./rollover');
const {loadTokenInputs, rowOf} = require('./booking-reads');

const {HttpsError} = functions.https;

const PRE = 'failed-precondition';
/** Longest id accepted; real ids are far shorter. */
const MAX_ID_LENGTH = 200;
/** No period grants more (firestore.rules tokenPeriodShapeOk). */
const MAX_PER_PERIOD = 40;
/** `graceTokens.createdBy` of a token rolled by this callable. */
const CREATED_BY = 'roll-ahead';

/** Why a request is refused: the HttpsError code and the family's copy. */
const REFUSALS = {
  'signed-out': {code: 'unauthenticated', message: 'Sign in to continue.'},
  'bad-request': {code: 'invalid-argument',
    message: 'Send an athlete and a session date.'},
  'athlete-missing': {code: 'not-found',
    message: 'This athlete no longer exists.'},
  'not-yours': {code: 'permission-denied',
    message: 'This athlete isn\'t on your account.'},
  'not-monthly': {code: PRE,
    message: 'This package has no monthly tokens to carry over.'},
  'membership-inactive': {code: PRE,
    message: 'This membership isn\'t active right now.'},
  'no-rollover': {code: PRE,
    message: 'This month\'s tokens do not carry over.'},
  'not-next-period': {code: PRE,
    message: 'A leftover token books a session in the month that follows.'},
  'not-issued': {code: PRE, message: 'This month\'s tokens are not on ' +
    'record yet - ask the academy.'},
  'none-left': {code: PRE, message: 'No leftover token this month.'},
  'not-needed': {code: PRE,
    message: 'This session can be booked with the tokens already there.'},
};

/**
 * The typed refusal for one reason.
 * @param {string} reason A key of REFUSALS.
 * @return {!HttpsError} The error to throw.
 */
function refusal(reason) {
  const r = REFUSALS[reason];
  return new HttpsError(r.code, r.message, {reason});
}

/**
 * @param {*} id A request field.
 * @return {boolean} True for a 1..200 character id with no '/' that
 *     Firestore accepts as a document id.
 */
function goodId(id) {
  return typeof id === 'string' && id.length > 0 &&
      id.length <= MAX_ID_LENGTH && !id.includes('/') &&
      !/^\.\.?$|^__.*__$/.test(id);
}

/**
 * @param {*} date A request field.
 * @return {boolean} True for a `'YYYY-MM-DD'` string.
 */
function goodDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Whether the signed-in user books for this athlete: an athlete login its
 * own athlete, a parent its household's (portal/move-decide.js ownsBooking).
 * Staff are not families: they book through staffBookSession.
 * @param {?Object} user The caller's `users/{uid}` body.
 * @param {string} athleteId The athlete.
 * @param {!Object} athlete The athlete's body.
 * @return {boolean} True when the athlete is the caller's.
 */
function ownsAthlete(user, athleteId, athlete) {
  if (!user) return false;
  if (user.role === 'athlete') {
    return Boolean(user.athleteId) && user.athleteId === athleteId;
  }
  return user.role === 'parent' && Boolean(user.householdId) &&
      user.householdId === athlete.householdId;
}

/**
 * Waitlist entries as `lib.tokensPosition` wants them: each holds a token of
 * the period its session falls in.
 * @param {?Array<!Object>} entries The athlete's waitlist rows.
 * @param {string} fallbackDate The date of an entry that carries none.
 * @param {*} anchorDay The household anchor.
 * @return {!Array<{id: string, periodKey: string}>} The rows.
 */
function holds(entries, fallbackDate, anchorDay) {
  return (entries || []).filter(Boolean).map((w) => ({id: w.id,
    periodKey: lib.periodFor(w.date || fallbackDate, anchorDay).periodKey}));
}

/**
 * Decide one request. Pure.
 * @param {{user: ?Object, athleteId: string, athlete: ?Object,
 *     household: ?Object, pkg: ?Object, date: string, now: !Date,
 *     current: {tokenPeriod: ?Object, periodBookings: !Array<!Object>},
 *     next: {tokenPeriod: ?Object, periodBookings: !Array<!Object>},
 *     waitlist: !Array<!Object>, graceTokens: !Array<!Object>,
 *     graceSpends: !Array<!Object>}} ctx The caller, the athlete's
 *     documents, the running period's inputs (`current`) and those of the
 *     session's period (`next`).
 * @return {{ok: boolean, reason: (string|undefined),
 *     tokenId: (string|undefined), expiresAt: (string|undefined),
 *     periodKey: (string|undefined)}} The token to create, or why not.
 */
function decideRollAhead(ctx) {
  const no = (reason) => ({ok: false, reason});
  const {athlete, household, pkg, date} = ctx;
  if (!athlete) return no('athlete-missing');
  if (!ownsAthlete(ctx.user, ctx.athleteId, athlete)) return no('not-yours');
  if (!rollover.isMonthlyTokens(pkg)) return no('not-monthly');
  if (!lib.membershipAllowsBooking(household, athlete)) {
    return no('membership-inactive');
  }
  const anchorDay = household && household.periodAnchorDay;
  const today = lib.chicagoDate(ctx.now);
  const period = lib.periodFor(today, anchorDay);
  const until = rollover.rollsUntil(period, anchorDay);
  if (!until) return no('no-rollover');
  if (!(date > period.periodEnd && date <= until)) {
    return no('not-next-period');
  }
  const current = ctx.current || {};
  const issued = current.tokenPeriod && current.tokenPeriod.granted;
  let tokenPeriod = current.tokenPeriod;
  if (!Number.isInteger(issued)) {
    // No record: the package's own count, as the meter shows it. Read
    // here, written nowhere.
    if (!rollover.packageCountStands({athlete, household, period, today})) {
      return no('not-issued');
    }
    tokenPeriod = {granted: lib.periodFallback(pkg)};
  }
  const graceTokens = ctx.graceTokens || [];

  // What is left of the running period, counted as the nightly job will
  // count it (bookings by date), less waitlist holds and less the tokens
  // already rolled out of it.
  const left = lib.tokensPosition({
    pkg,
    tokenPeriod,
    bookings: rollover.bookingsOfPeriod(current.periodBookings, period),
    waitlist: holds(ctx.waitlist, today, anchorDay),
    graceTokens,
    periodKey: period.periodKey,
    today,
  }).left;
  if (!(left > 0)) return no('none-left');

  // Only when nothing else pays: the session's own period has no token
  // left and no bonus or rolled-over token covers the date.
  const next = ctx.next || {};
  const target = lib.periodFor(date, anchorDay);
  const rows = (next.periodBookings || []).filter(Boolean);
  const seen = new Set(rows.map((b) => b.id));
  const spends = (ctx.graceSpends || []).filter((b) => b && !seen.has(b.id));
  const position = lib.tokensPosition({
    pkg,
    tokenPeriod: next.tokenPeriod || null,
    bookings: rows.concat(spends),
    waitlist: holds(ctx.waitlist, date, anchorDay),
    graceTokens,
    periodKey: target.periodKey,
    today,
  });
  if (lib.chargeFor({position, sessionDate: date}).chargedFrom) {
    return no('not-needed');
  }

  const taken = new Set(graceTokens.map((g) => g && g.id));
  for (let n = 1; n <= MAX_PER_PERIOD; n += 1) {
    const tokenId = rollover.tokenIdFor(ctx.athleteId, period.periodKey, n);
    if (!taken.has(tokenId)) {
      return {ok: true, tokenId, expiresAt: until,
        periodKey: period.periodKey};
    }
  }
  return no('none-left');
}

/**
 * Every read the decision needs, in one transaction, before the write.
 * @param {!Object} tx The transaction.
 * @param {!Object} store An admin Firestore.
 * @param {{uid: string, athleteId: string, date: string, now: !Date}} args
 *     The caller, the request and the clock.
 * @return {!Promise<!Object>} The ctx `decideRollAhead` takes.
 */
async function loadRollAhead(tx, store, args) {
  const {uid, athleteId, date, now} = args;
  const doc = (name, id) => rowOf(tx, store.collection(name).doc(id));
  const ctx = {athleteId, date, now, user: await doc('users', uid),
    athlete: await doc('athletes', athleteId), household: null, pkg: null,
    current: {tokenPeriod: null, periodBookings: []},
    next: {tokenPeriod: null, periodBookings: []},
    waitlist: [], graceTokens: [], graceSpends: []};
  const athlete = ctx.athlete;
  if (!athlete) return ctx;
  if (athlete.householdId) {
    ctx.household = await doc('households', athlete.householdId);
  }
  if (athlete.packageId) ctx.pkg = await doc('packages', athlete.packageId);
  const anchorDay = ctx.household && ctx.household.periodAnchorDay;
  const period = lib.periodFor(lib.chicagoDate(now), anchorDay);
  ctx.current.tokenPeriod = await doc('tokenPeriods',
      lib.tokenPeriodId(athleteId, period.periodKey));
  ctx.current.periodBookings = lib.rows(await tx.get(
      lib.periodBookingsQuery(store, athleteId, period)));
  const inputs = await loadTokenInputs(tx, store,
      {athleteId, date, anchorDay, now});
  ctx.next = {tokenPeriod: inputs.tokenPeriod,
    periodBookings: inputs.periodBookings};
  return Object.assign(ctx, {waitlist: inputs.waitlist,
    graceTokens: inputs.graceTokens, graceSpends: inputs.graceSpends});
}

/**
 * The callable's body, exported so the unit tests can call it in-process.
 * @param {*} data `{athleteId, date}`.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), now: (!Date|undefined)}=} deps The
 *     Firestore and the clock, injectable for tests.
 * @return {!Promise<{graceTokenId: string, expiresAt: string,
 *     sourcePeriodKey: string}>} The token the booking can now spend.
 */
async function rollTokenAheadHandler(data, context, deps) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) throw refusal('signed-out');
  const athleteId = data && data.athleteId;
  const date = data && data.date;
  if (!goodId(athleteId) || !goodDate(date)) throw refusal('bad-request');
  const store = (deps && deps.db) || admin.firestore();
  const now = deps && deps.now instanceof Date ? deps.now : new Date();
  const uid = auth.uid;
  const out = await store.runTransaction(async (tx) => {
    const ctx = await loadRollAhead(tx, store, {uid, athleteId, date, now});
    // ---- every read happens above this line ----
    const decision = decideRollAhead(ctx);
    if (!decision.ok) throw refusal(decision.reason);
    tx.create(store.collection('graceTokens').doc(decision.tokenId),
        Object.assign(rollover.rolloverTokenDoc({
          athleteId,
          householdId: ctx.athlete.householdId || null,
          expiresAt: decision.expiresAt,
          periodKey: decision.periodKey,
        }), {createdBy: CREATED_BY, requestedBy: uid}));
    return {graceTokenId: decision.tokenId, expiresAt: decision.expiresAt,
      sourcePeriodKey: decision.periodKey};
  });
  // After the commit, never inside it, where a retry would log twice.
  console.log(`rollTokenAhead: athlete=${athleteId} token=` +
      `${out.graceTokenId} for=${date} by=${uid}`);
  return out;
}

// Binds no secret and sends no notice (the booking that follows does).
const rollTokenAhead = functions.runWith({secrets: []}).https.onCall(
    (data, context) => rollTokenAheadHandler(data, context));

module.exports = {REFUSALS, decideRollAhead, rollTokenAhead,
  rollTokenAheadHandler};
