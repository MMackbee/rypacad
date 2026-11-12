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
const {SEASON_END} = require('./single');
const {EXPIRY_LEAD_DAYS, TOKEN_SESSION_TYPES, addDays, expiryPlan,
  sessionDays, sessionSpan} = require('./expiry-plan');

/**
 * The season's first day (frontend/src/portal/data/season.js
 * SEASON_BOUNDS.start). A token period that ends before it is pre-season:
 * nobody holds tokens yet, so there is nothing to warn about (owner,
 * 2026-10-23 - the Oct 24 run would otherwise have told every token family
 * their tokens expire Oct 31). The last day is single.js's SEASON_END.
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
  const summary = {date, considered: snap.size, sent: 0, duplicate: 0,
    skipped: 0};
  const sessions = cachedReader(store, 'sessions');
  const athletes = cachedReader(store, 'athletes');
  for (const doc of snap.docs) {
    const booking = doc.data() || {};
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
 * Each period's plan (expiryPlan), its sessions read once per run:
 * households share anchor days, so a run reads one period, or a few - a
 * single-field range on `date`, the rest filtered here. A failed read is
 * logged and counted once and leaves that period with no plan, so only its
 * households are skipped.
 * @param {!Object} store An admin `Firestore`.
 * @param {!Object} summary Mutated: `failed`.
 * @return {function(?Object): !Promise<?{sendOn: string, lastDay: string}>}
 *     The reader.
 */
function planReader(store, summary) {
  const cache = new Map();
  return (period) => {
    const span = sessionSpan(period);
    if (!span) return Promise.resolve(null);
    const key = `${span.from}_${span.to}`;
    if (!cache.has(key)) {
      cache.set(key, Promise.resolve()
          .then(() => store.collection('sessions')
              .where('date', '>=', span.from)
              .where('date', '<=', span.to)
              .get())
          .then((snap) => expiryPlan(period,
              sessionDays(snap.docs.map((d) => d.data()))))
          .catch((err) => {
            summary.failed += 1;
            console.error(`runTokenExpiryReminders: sessions ${span.from}` +
                ` to ${span.to} not read; that period's households were ` +
                'skipped:', err);
            return null;
          }));
    }
    return cache.get(key);
  };
}

/**
 * One athlete's line in their household's `tokens-expiring` notice, or null
 * when today is not their period's notice day or there is nothing to warn
 * about.
 * @param {!Object} store An admin `Firestore`.
 * @param {!Object} doc The `athletes/{id}` snapshot.
 * @param {{clock: {today: string}, households: !Function,
 *     packages: !Function, plans: !Function}} run The run's clock and
 *     cached readers.
 * @return {!Promise<?{householdId: string, period: !Object, plan: !Object,
 *     row: {athleteId: string, athlete: !Object, left: number}}>} The line.
 */
async function expiringLine(store, doc, run) {
  const athlete = doc.data() || {};
  // No household, no parent to tell: billing goes to parents only.
  if (!athlete.packageId || !athlete.householdId) return null;
  const household = await run.households(athlete.householdId);
  const anchorDay = household && household.periodAnchorDay;
  const today = run.clock.today;
  const period = lib.periodFor(today, anchorDay);
  // Pre-season periods and unpaid athletes get no notice.
  if (!tokenReminderApplies({household, athlete, period})) return null;
  // One run day per period (expiryPlan) - never a range, so a family is
  // warned once.
  const plan = await run.plans(period);
  if (!plan || plan.sendOn !== today) return null;
  const pkg = await run.packages(athlete.packageId);
  // Elite (`tokens: null`) is unlimited and has nothing to expire; an
  // athlete on no known package has nothing to warn about either.
  if (!pkg || !Number.isFinite(pkg.tokens)) return null;
  const position = await positionFor(store,
      {athleteId: doc.id, pkg, anchorDay, period, today});
  if (!(position.left > 0)) return null;
  return {householdId: athlete.householdId, period, plan,
    row: {athleteId: doc.id, athlete, left: position.left}};
}

/**
 * Sends one household's `tokens-expiring` notice, athletes by first name.
 * @param {string} householdId The household.
 * @param {{period: !Object, plan: !Object, rows: !Array<!Object>}} due Its
 *     period, plan and athlete lines.
 * @param {!Object} summary Mutated with the counts.
 * @return {!Promise<void>} Resolves once sent (or found already sent).
 */
async function sendTokensExpiring(householdId, due, summary) {
  const name = (row) => notices.firstNameOf(row.athlete);
  const rows = due.rows.slice().sort((a, b) =>
    name(a).localeCompare(name(b)) || a.athleteId.localeCompare(b.athleteId));
  const copy = notices.tokensExpiring({athletes: rows,
    periodEnd: due.period.periodEnd, lastDay: due.plan.lastDay});
  const res = await notify.sendNotice({
    kind: 'tokens-expiring',
    category: 'billing',
    householdId,
    athleteId: rows.length === 1 ? rows[0].athleteId : null,
    subjectKey: `${householdId}_${due.period.periodKey}`,
    title: copy.title,
    body: copy.body,
  });
  if (res.duplicate) summary.duplicate += 1;
  else summary.tokens += 1;
}

/**
 * The `tokens-expiring` half of the expiry job: ONE notice per household
 * and period, naming every athlete with tokens left, so siblings are not two
 * emails the same morning (2026-11-04). Billing goes to the household's
 * parents only (notify.resolveRecipients), so every athlete in a household
 * already had the same recipients, and the household's anchor day gives
 * them one period. Ledger key `{householdId}_{periodKey}`; `athleteId` is
 * set only when one athlete is named, so that athlete still sees it.
 *
 * Failures stay small (2026-11-04): an athlete whose documents cannot be
 * read is logged and left out - the household is still told about the
 * others - a period whose sessions cannot be read skips only its
 * households, and a failed send skips only that household. Nobody loses
 * their only reminder to someone else's bad record.
 * @param {!Object} store An admin `Firestore`.
 * @param {{today: string, target: string, now: !Date}} clock The run.
 * @param {!Object} summary Mutated with the counts.
 * @return {!Promise<void>} Resolves when every household has been told.
 */
async function remindTokenExpiry(store, clock, summary) {
  const run = {
    clock,
    households: cachedReader(store, 'households'),
    packages: cachedReader(store, 'packages'),
    plans: planReader(store, summary),
  };
  const due = new Map();
  const snap = await store.collection('athletes').get();
  for (const doc of snap.docs) {
    let line = null;
    try {
      line = await expiringLine(store, doc, run);
    } catch (err) {
      summary.failed += 1;
      console.error(`runTokenExpiryReminders: athlete ${doc.id} skipped:`,
          err);
    }
    if (!line) continue;
    if (!due.has(line.householdId)) {
      due.set(line.householdId,
          {period: line.period, plan: line.plan, rows: []});
    }
    due.get(line.householdId).rows.push(line.row);
  }
  for (const [householdId, entry] of due) {
    try {
      await sendTokensExpiring(householdId, entry, summary);
    } catch (err) {
      summary.failed += 1;
      console.error('runTokenExpiryReminders: household ' +
          `${householdId} not told:`, err);
    }
  }
}

/**
 * The `grace-expiring` notice's subject. A bonus token is warned about on
 * its own (the doc id). Purchased single tokens (reason 'single-purchase',
 * rulings 2026-09-29/30) all expire on the season's last day, so an athlete
 * holding several gets ONE notice: the key is the athlete and that day.
 * @param {string} docId The graceTokens doc id.
 * @param {?Object} grace The graceTokens doc body.
 * @return {string} The `sendNotice` subjectKey.
 */
function graceNoticeKey(docId, grace) {
  const g = grace || {};
  if (g.reason === 'single-purchase') {
    return `${g.athleteId}_single_${g.expiresAt}`;
  }
  return docId;
}

/**
 * One bonus token's `grace-expiring` notice, or null when it is already
 * spent. Consumption is derived, never stored: a grace token is spent when
 * some non-cancelled booking carries `graceTokenId == id`.
 * @param {!Object} store An admin `Firestore`.
 * @param {!Object} doc The `graceTokens/{id}` snapshot.
 * @param {function(?string): !Promise<?Object>} athletes A cached reader.
 * @return {!Promise<?{duplicate: boolean}>} `sendNotice`'s result, or null.
 */
async function graceNotice(store, doc, athletes) {
  const grace = doc.data() || {};
  const spentSnap = await store.collection('bookings')
      .where('graceTokenId', '==', doc.id)
      .get();
  const consumed = spentSnap.docs.some(
      (d) => (d.data() || {}).status !== 'cancelled');
  if (consumed) return null;
  const athlete = await athletes(grace.athleteId);
  const copy = notices.graceExpiring({athlete, expiresAt: grace.expiresAt,
    reason: grace.reason});
  return notify.sendNotice({
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
}

/**
 * The `grace-expiring` half of the expiry job: bonus tokens expiring on
 * `clock.target`. A token that cannot be read or sent is logged and
 * skipped; the others still go.
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
    try {
      const res = await graceNotice(store, doc, athletes);
      if (!res) continue;
      if (res.duplicate) summary.duplicate += 1;
      else summary.grace += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(`runTokenExpiryReminders: bonus token ${doc.id} ` +
          'skipped:', err);
    }
  }
}

/**
 * Daily 09:00 America/Chicago: warn about period tokens - one notice per
 * household, on its period's notice day (expiryPlan, from the real session
 * calendar) - and about bonus tokens that expire in exactly
 * EXPIRY_LEAD_DAYS (7) days (`target`). The two halves fail apart: a read
 * that fails in one never stops the other.
 * @param {{now: (?Date|undefined), db: (?Object|undefined)}=} args The fixed
 *     clock and Firestore.
 * @return {!Promise<{today: string, target: string, tokens: number,
 *     grace: number, duplicate: number, failed: number}>} A summary;
 *     `tokens` counts household notices, `failed` the records, periods or
 *     halves skipped on an error (each one logged).
 */
async function runTokenExpiryReminders(args) {
  const {now, store} = context(args);
  const today = lib.todayISO(now);
  const clock = {today, target: addDays(today, EXPIRY_LEAD_DAYS), now};
  const summary = {today, target: clock.target, tokens: 0, grace: 0,
    duplicate: 0, failed: 0};
  const halves = [['tokens', remindTokenExpiry], ['grace', remindGraceExpiry]];
  for (const [half, remind] of halves) {
    try {
      await remind(store, clock, summary);
    } catch (err) {
      summary.failed += 1;
      console.error(`runTokenExpiryReminders ${today}: the ${half} half ` +
          'stopped:', err);
    }
  }
  console.log(`runTokenExpiryReminders ${today}: tokens=${summary.tokens} ` +
      `grace=${summary.grace} (bonus tokens expiring ${clock.target}) ` +
      `duplicate=${summary.duplicate} failed=${summary.failed}`);
  return summary;
}

module.exports = {
  EXPIRY_LEAD_DAYS,
  SEASON_END,
  SEASON_START,
  TOKEN_SESSION_TYPES,
  addDays,
  expiryPlan,
  graceNoticeKey,
  runSessionReminders,
  runTokenExpiryReminders,
  sessionDays,
  tokenReminderApplies,
};
