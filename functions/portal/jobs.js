/**
 * The scheduled notification jobs' bodies (contract v2.2, TEAM.md Sprint 14).
 *
 * Both are PLAIN EXPORTED FUNCTIONS taking a fixed clock, `{now, db}` —
 * index.js wraps them in `functions.pubsub.schedule(...)`, and the emulator
 * harness calls them directly, because scheduled functions never fire in the
 * emulator. A second call with the same clock sends nothing: every notice
 * goes through `notify.sendNotice`, whose ledger row is the send lock.
 *
 * DERIVE, DON'T STORE. "Tokens expiring" is `lib.tokensPosition` over the
 * athlete's own documents — the same derivation the client runs — not a
 * counter and not a cached warning flag. Nothing here writes anything except
 * the ledger.
 */

'use strict';

const admin = require('firebase-admin');
const lib = require('./lib');
const notices = require('./notices');
const notify = require('./notify');

/** How many days ahead an expiry is warned about (pin: exactly 3). */
const EXPIRY_LEAD_DAYS = 3;

/**
 * `'YYYY-MM-DD'` plus N days, on the UTC-noon arithmetic `lib` uses so no
 * DST edge can move a calendar date.
 * @param {string} dateISO `'YYYY-MM-DD'`.
 * @param {number} days Days to add.
 * @return {string} `'YYYY-MM-DD'`.
 */
function addDays(dateISO, days) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/**
 * One document body, or null.
 * @param {!Object} store An admin `Firestore`.
 * @param {string} collection The collection.
 * @param {?string} id The document id.
 * @return {!Promise<?Object>} The body or null.
 */
async function getDoc(store, collection, id) {
  if (!id) return null;
  const snap = await store.collection(collection).doc(id).get();
  return snap.exists ? snap.data() : null;
}

/**
 * A memoized document reader — households and packages repeat across an
 * academy's worth of athletes.
 * @param {!Object} store An admin `Firestore`.
 * @param {string} collection The collection.
 * @return {function(?string): !Promise<?Object>} The reader.
 */
function cachedReader(store, collection) {
  const cache = new Map();
  return async (id) => {
    if (!id) return null;
    if (!cache.has(id)) cache.set(id, await getDoc(store, collection, id));
    return cache.get(id);
  };
}

/**
 * Resolve `{now, db}` with sane defaults.
 * @param {{now: (?Date|undefined), db: (?Object|undefined)}=} args The job
 *     arguments.
 * @return {{now: !Date, store: !Object}} The clock and Firestore.
 */
function context(args) {
  const a = args || {};
  return {
    now: a.now instanceof Date ? a.now : new Date(),
    store: a.db || admin.firestore(),
  };
}

/**
 * Daily 17:00 America/Chicago: one `reminder-24h` notice per confirmed
 * booking dated tomorrow. Rides the `bookings (status, date)` composite.
 * @param {{now: (?Date|undefined), db: (?Object|undefined)}=} args The fixed
 *     clock and Firestore.
 * @return {!Promise<{date: string, considered: number, sent: number,
 *     duplicate: number}>} A summary.
 */
async function runSessionReminders(args) {
  const {now, store} = context(args);
  const date = addDays(lib.todayISO(now), 1);
  const snap = await store.collection('bookings')
      .where('status', '==', 'confirmed')
      .where('date', '==', date)
      .get();
  const summary = {date, considered: snap.size, sent: 0, duplicate: 0};
  const sessions = cachedReader(store, 'sessions');
  const athletes = cachedReader(store, 'athletes');
  for (const doc of snap.docs) {
    const booking = doc.data() || {};
    const session = await sessions(booking.sessionId);
    const athlete = await athletes(booking.athleteId);
    const copy = notices.reminder24h({athlete, session});
    const res = await notify.sendNotice({
      kind: 'reminder-24h',
      category: 'schedule',
      householdId: booking.householdId || null,
      athleteId: booking.athleteId || null,
      sessionId: booking.sessionId || null,
      bookingId: doc.id,
      subjectKey: doc.id,
      title: copy.title,
      body: copy.body,
    });
    if (res.duplicate) summary.duplicate += 1;
    else summary.sent += 1;
  }
  console.log(`runSessionReminders ${date}: considered=${summary.considered} ` +
      `sent=${summary.sent} duplicate=${summary.duplicate}`);
  return summary;
}

/**
 * The athlete's token position in the period containing `today`, derived
 * exactly as the client derives it (granted from `tokenPeriods` when the doc
 * exists, grace-charged bookings excluded from `used`, waitlist entries in
 * the period counted as `reserved`).
 * @param {!Object} store An admin `Firestore`.
 * @param {{athleteId: string, pkg: !Object, anchorDay: *, period: !Object,
 *     today: string}} args The inputs.
 * @return {!Promise<!Object>} `lib.tokensPosition`'s result.
 */
async function positionFor(store, args) {
  const {athleteId, period, anchorDay, today} = args;
  const [tpSnap, bookingSnap, waitSnap, graceSnap] = await Promise.all([
    store.collection('tokenPeriods')
        .doc(lib.tokenPeriodId(athleteId, period.periodKey)).get(),
    lib.periodBookingsQuery(store, athleteId, period).get(),
    store.collection('waitlist').where('athleteId', '==', athleteId).get(),
    store.collection('graceTokens').where('athleteId', '==', athleteId).get(),
  ]);
  return lib.tokensPosition({
    pkg: args.pkg,
    tokenPeriod: tpSnap.exists ? tpSnap.data() : null,
    bookings: lib.rows(bookingSnap),
    waitlist: lib.rows(waitSnap).map((w) => ({
      id: w.id,
      periodKey: w.date ?
          lib.periodFor(w.date, anchorDay).periodKey : w.periodKey,
    })),
    graceTokens: lib.rows(graceSnap),
    periodKey: period.periodKey,
    today,
  });
}

/**
 * The `tokens-expiring` half of the expiry job.
 * @param {!Object} store An admin `Firestore`.
 * @param {{today: string, target: string, now: !Date}} clock The run.
 * @param {!Object} summary Mutated with the counts.
 * @return {!Promise<void>} Resolves when every athlete has been considered.
 */
async function remindTokenExpiry(store, clock, summary) {
  const households = cachedReader(store, 'households');
  const packages = cachedReader(store, 'packages');
  const snap = await store.collection('athletes').get();
  for (const doc of snap.docs) {
    const athlete = doc.data() || {};
    if (!athlete.packageId) continue;
    const household = await households(athlete.householdId);
    const anchorDay = household && household.periodAnchorDay;
    const period = lib.periodFor(clock.today, anchorDay);
    // Exactly three days out — never a range, so a family is warned once.
    if (period.periodEnd !== clock.target) continue;
    const pkg = await packages(athlete.packageId);
    // Elite (`tokens: null`) is unlimited and has nothing to expire; an
    // athlete on no known package has nothing to warn about either.
    if (!pkg || !Number.isFinite(pkg.tokens)) continue;
    const position = await positionFor(store, {
      athleteId: doc.id,
      pkg,
      anchorDay,
      period,
      today: clock.today,
    });
    if (!(position.left > 0)) continue;
    const copy = notices.tokensExpiring({
      athlete,
      left: position.left,
      periodEnd: period.periodEnd,
    });
    const res = await notify.sendNotice({
      kind: 'tokens-expiring',
      category: 'billing',
      householdId: athlete.householdId || null,
      athleteId: doc.id,
      subjectKey: `${doc.id}_${period.periodKey}`,
      title: copy.title,
      body: copy.body,
    });
    if (res.duplicate) summary.duplicate += 1;
    else summary.tokens += 1;
  }
}

/**
 * The `grace-expiring` half of the expiry job. Consumption is derived, never
 * stored: a grace token is spent when some non-cancelled booking carries
 * `graceTokenId == id`.
 * @param {!Object} store An admin `Firestore`.
 * @param {{today: string, target: string, now: !Date}} clock The run.
 * @param {!Object} summary Mutated with the counts.
 * @return {!Promise<void>} Resolves when every token has been considered.
 */
async function remindGraceExpiry(store, clock, summary) {
  const athletes = cachedReader(store, 'athletes');
  const snap = await store.collection('graceTokens')
      .where('expiresAt', '==', clock.target)
      .get();
  for (const doc of snap.docs) {
    const grace = doc.data() || {};
    const spentSnap = await store.collection('bookings')
        .where('graceTokenId', '==', doc.id)
        .get();
    const consumed = spentSnap.docs.some(
        (d) => (d.data() || {}).status !== 'cancelled');
    if (consumed) continue;
    const athlete = await athletes(grace.athleteId);
    const copy = notices.graceExpiring({athlete, expiresAt: grace.expiresAt});
    const res = await notify.sendNotice({
      kind: 'grace-expiring',
      category: 'billing',
      householdId: grace.householdId ||
          (athlete && athlete.householdId) || null,
      athleteId: grace.athleteId || null,
      sessionId: grace.sourceSessionId || null,
      subjectKey: doc.id,
      title: copy.title,
      body: copy.body,
    });
    if (res.duplicate) summary.duplicate += 1;
    else summary.grace += 1;
  }
}

/**
 * Daily 09:00 America/Chicago: warn about period tokens and bonus tokens
 * that expire in exactly three days.
 * @param {{now: (?Date|undefined), db: (?Object|undefined)}=} args The fixed
 *     clock and Firestore.
 * @return {!Promise<{today: string, target: string, tokens: number,
 *     grace: number, duplicate: number}>} A summary.
 */
async function runTokenExpiryReminders(args) {
  const {now, store} = context(args);
  const today = lib.todayISO(now);
  const clock = {today, target: addDays(today, EXPIRY_LEAD_DAYS), now};
  const summary = {today, target: clock.target, tokens: 0, grace: 0,
    duplicate: 0};
  await remindTokenExpiry(store, clock, summary);
  await remindGraceExpiry(store, clock, summary);
  console.log(`runTokenExpiryReminders ${today} (expiring ${clock.target}): ` +
      `tokens=${summary.tokens} grace=${summary.grace} ` +
      `duplicate=${summary.duplicate}`);
  return summary;
}

module.exports = {
  EXPIRY_LEAD_DAYS,
  addDays,
  runSessionReminders,
  runTokenExpiryReminders,
};
