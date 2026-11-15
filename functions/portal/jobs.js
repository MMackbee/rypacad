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
const mentalConsent = require('./mental-consent');
const notices = require('./notices');
const notify = require('./notify');
const rollover = require('./rollover');

/**
 * How many days ahead an expiry is warned about. Owner ruling 2026-09-22:
 * SEVEN, so a family has a weekend in hand to use the sessions they paid for
 * (it was 3). Still exactly one notice, on the day that is this many days out
 * - never a range, so nobody is warned twice for the same expiry.
 */
const EXPIRY_LEAD_DAYS = 7;

/**
 * The season's first day (frontend/src/portal/data/season.js
 * SEASON_BOUNDS.start). A token period that ends before it is pre-season:
 * nobody holds tokens yet, so there is nothing to warn about (owner,
 * 2026-10-23 - the Oct 24 run would otherwise have told every token family
 * their tokens expire Oct 31).
 */
const SEASON_START = '2026-11-03';

/**
 * Whether an athlete gets a "tokens expiring" notice for this period: only
 * a period that reaches into the season, and only an athlete who is paid up
 * (the same gate that lets them book - lib.membershipAllowsBooking), so an
 * unpaid, lapsed or past-due family is never told to spend tokens it cannot
 * use (owner, 2026-10-23).
 * @param {{household: ?Object, athlete: ?Object,
 *     period: ?{periodEnd: string}}} args The athlete's documents and the
 *     period being warned about.
 * @return {boolean} True when the notice applies.
 */
function tokenReminderApplies({household, athlete, period}) {
  if (!period || !period.periodEnd || period.periodEnd < SEASON_START) {
    return false;
  }
  return lib.membershipAllowsBooking(household, athlete);
}

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
 * The switch for the consent branch, read once per run. A failed read
 * counts as off: the family reminders still go.
 * @param {!Object} store An admin `Firestore`.
 * @return {!Promise<{notices: boolean, enabledAt: ?string}>} The switch.
 */
async function consentSwitch(store) {
  try {
    return await mentalConsent.readConsentConfig(store);
  } catch (err) {
    console.error('consent config read failed:', err);
    return {notices: false, enabledAt: null};
  }
}

/**
 * Daily 17:00 America/Chicago: one `reminder-24h` notice per confirmed
 * booking dated tomorrow. Rides the `bookings (status, date)` composite.
 *
 * Mental consent (2026-11-05): a 1:1 with Yannick whose athlete has not
 * signed also gets a `consent-reminder`, decided BEFORE the Calendly skip
 * and contained in its own try/catch, so a consent failure never costs
 * another family its reminder.
 * @param {{now: (?Date|undefined), db: (?Object|undefined)}=} args The fixed
 *     clock and Firestore.
 * @return {!Promise<{date: string, considered: number, sent: number,
 *     duplicate: number, skipped: number, consent: number,
 *     consentDuplicate: number, consentError: number}>} A summary.
 */
async function runSessionReminders(args) {
  const {now, store} = context(args);
  const date = addDays(lib.todayISO(now), 1);
  const snap = await store.collection('bookings')
      .where('status', '==', 'confirmed')
      .where('date', '==', date)
      .get();
  const summary = {date, considered: snap.size, sent: 0, duplicate: 0,
    skipped: 0, consent: 0, consentDuplicate: 0, consentError: 0};
  const sessions = cachedReader(store, 'sessions');
  const athletes = cachedReader(store, 'athletes');
  const households = cachedReader(store, 'households');
  const records = cachedReader(store, 'mentalConsents');
  const consentConfig = await consentSwitch(store);
  for (const doc of snap.docs) {
    const booking = doc.data() || {};
    if (booking.type === 'mental' && consentConfig.notices === true) {
      try {
        const res = await mentalConsent.remindConsentFor({booking,
          bookingId: doc.id, store, config: consentConfig, now,
          readers: {athletes, households, records}});
        if (res === 'sent') summary.consent += 1;
        else if (res === 'duplicate') summary.consentDuplicate += 1;
      } catch (err) {
        summary.consentError += 1;
        console.error('consent reminder error:', doc.id, err);
      }
    }
    // Calendly sends its own reminders for Yannick (spec 6.2 step 5).
    if (booking.source === 'calendly') {
      summary.skipped += 1;
      continue;
    }
    const session = await sessions(booking.sessionId);
    const athlete = await athletes(booking.athleteId);
    const copy = notices.reminder24h({athlete, session, booking});
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
      `sent=${summary.sent} duplicate=${summary.duplicate} ` +
      `consent=${summary.consent} ` +
      `consentDuplicate=${summary.consentDuplicate} ` +
      `consentError=${summary.consentError}`);
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
 * The `tokens-expiring` half of the expiry job. One-month rollover (owner
 * ruling 2026-11-15): when the period's unused tokens roll over
 * (rollover.rollsUntil) the notice says so and gives the use-by date; only
 * a period that does not roll (the season's last) still says "expire". An
 * athlete told in this same run to use rolled-over tokens (`toldToUse`)
 * gets that notice instead of this one - one email, about the tokens that
 * are actually about to go.
 * @param {!Object} store An admin `Firestore`.
 * @param {{today: string, target: string, now: !Date}} clock The run.
 * @param {!Object} summary Mutated with the counts.
 * @param {!Set<string>=} toldToUse Athlete ids remindGraceExpiry warned
 *     about rolled-over tokens.
 * @return {!Promise<void>} Resolves when every athlete has been considered.
 */
async function remindTokenExpiry(store, clock, summary, toldToUse) {
  const households = cachedReader(store, 'households');
  const packages = cachedReader(store, 'packages');
  const snap = await store.collection('athletes').get();
  for (const doc of snap.docs) {
    const athlete = doc.data() || {};
    if (!athlete.packageId) continue;
    const household = await households(athlete.householdId);
    const anchorDay = household && household.periodAnchorDay;
    const period = lib.periodFor(clock.today, anchorDay);
    // Exactly EXPIRY_LEAD_DAYS days out - never a range, so a family is
    // warned once.
    if (period.periodEnd !== clock.target) continue;
    // Pre-season periods and unpaid athletes get no notice.
    if (!tokenReminderApplies({household, athlete, period})) continue;
    const pkg = await packages(athlete.packageId);
    // Only a monthly token package rolls (the rollover job's own test): a
    // single-token athlete's comp still expires with its period.
    const rollsUntil = rollover.isMonthlyTokens(pkg) ?
        rollover.rollsUntil(period, anchorDay) : null;
    if (rollsUntil && toldToUse && toldToUse.has(doc.id)) continue;
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
      rollsUntil,
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
 * The `grace-expiring` notice's subject. A bonus token is warned about on
 * its own (the doc id). Purchased single tokens (reason 'single-purchase',
 * rulings 2026-09-29/30) all expire on the season's last day, so an athlete
 * holding several gets ONE notice: the key is the athlete and that day.
 * Rolled-over tokens (reason 'rollover', owner ruling 2026-11-15) out of one
 * period share a use-by day the same way, and get one notice too.
 * @param {string} docId The graceTokens doc id.
 * @param {?Object} grace The graceTokens doc body.
 * @return {string} The `sendNotice` subjectKey.
 */
function graceNoticeKey(docId, grace) {
  const g = grace || {};
  if (g.reason === 'single-purchase') {
    return `${g.athleteId}_single_${g.expiresAt}`;
  }
  if (g.reason === rollover.REASON) {
    return `${g.athleteId}_rollover_${g.expiresAt}`;
  }
  return docId;
}

/**
 * The `grace-expiring` half of the expiry job. Consumption is derived, never
 * stored: a grace token is spent when some non-cancelled booking carries
 * `graceTokenId == id`. Rolled-over tokens (reason 'rollover') are counted
 * per athlete and told once, "N rolled-over tokens to use by <day>", and
 * only to a family that can book (lib.membershipAllowsBooking).
 * @param {!Object} store An admin `Firestore`.
 * @param {{today: string, target: string, now: !Date}} clock The run.
 * @param {!Object} summary Mutated with the counts.
 * @return {!Promise<!Set<string>>} The athletes told to use rolled-over
 *     tokens (a duplicate counts: they were told on an earlier run).
 */
async function remindGraceExpiry(store, clock, summary) {
  const athletes = cachedReader(store, 'athletes');
  const households = cachedReader(store, 'households');
  const rolled = new Map();
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
    if (grace.reason === rollover.REASON) {
      const row = rolled.get(grace.athleteId) || {count: 0, docId: doc.id,
        grace};
      row.count += 1;
      rolled.set(grace.athleteId, row);
      continue;
    }
    const athlete = await athletes(grace.athleteId);
    const copy = notices.graceExpiring({athlete, expiresAt: grace.expiresAt,
      reason: grace.reason});
    const res = await notify.sendNotice({
      kind: 'grace-expiring',
      category: 'billing',
      householdId: grace.householdId ||
          (athlete && athlete.householdId) || null,
      athleteId: grace.athleteId || null,
      sessionId: grace.sourceSessionId || null,
      subjectKey: graceNoticeKey(doc.id, grace),
      title: copy.title,
      body: copy.body,
    });
    if (res.duplicate) summary.duplicate += 1;
    else summary.grace += 1;
  }
  const toldToUse = new Set();
  for (const [athleteId, row] of rolled) {
    const athlete = await athletes(athleteId);
    const household = await households(
        row.grace.householdId || (athlete && athlete.householdId));
    if (!lib.membershipAllowsBooking(household, athlete)) continue;
    const copy = notices.rolloverExpiring({athlete, count: row.count,
      expiresAt: row.grace.expiresAt});
    const res = await notify.sendNotice({
      kind: 'grace-expiring',
      category: 'billing',
      householdId: row.grace.householdId ||
          (athlete && athlete.householdId) || null,
      athleteId,
      sessionId: null,
      subjectKey: graceNoticeKey(row.docId, row.grace),
      title: copy.title,
      body: copy.body,
    });
    toldToUse.add(athleteId);
    if (res.duplicate) summary.duplicate += 1;
    else summary.grace += 1;
  }
  return toldToUse;
}

/**
 * Daily 09:00 America/Chicago: a week (EXPIRY_LEAD_DAYS) before they go,
 * warn about bonus and rolled-over tokens, then about the period's own
 * tokens - which now roll over once (owner ruling 2026-11-15), except in
 * the season's last period.
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
  const toldToUse = await remindGraceExpiry(store, clock, summary);
  await remindTokenExpiry(store, clock, summary, toldToUse);
  console.log(`runTokenExpiryReminders ${today} (expiring ${clock.target}): ` +
      `tokens=${summary.tokens} grace=${summary.grace} ` +
      `duplicate=${summary.duplicate}`);
  return summary;
}

module.exports = {
  EXPIRY_LEAD_DAYS,
  SEASON_START,
  addDays,
  graceNoticeKey,
  runSessionReminders,
  runTokenExpiryReminders,
  tokenReminderApplies,
};
