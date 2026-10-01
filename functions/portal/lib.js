/**
 * Period math, the token derivation and the charge order for the portal's
 * server-side writers (contract v2.0 pin B, v2.1 pins C/E/F/H).
 *
 * CHANGE ONE, CHANGE BOTH. This is a deliberate duplicate of
 * `normalizeAnchorDay`, `periodFor`, `periodFallback` and `tokensFor` from
 * `frontend/src/portal/data/packages.js`, plus `createBooking`'s charge
 * order (hooks/live.js `selectGraceToken`/`assertPeriodTokensLeft`). That
 * file is ESM and CRA-only, so Cloud Functions (CommonJS, outside the CRA
 * build) cannot import it. Any edit to the period math, the token
 * derivation or the charge order must land in ALL of those in the same
 * commit, or the client and the server will disagree about how many tokens
 * a family has.
 *
 * Single token (owner rulings 2026-09-29/30, portal/single.js): one paid
 * $65 checkout is one graceTokens doc `single_{cs}` good to season end. The
 * package grants no period token (`periodFallback` 0), a waitlist entry
 * HOLDS a token (`held`), and a spend in any period counts (`graceSpends`).
 *
 * Design keystone (TEAM.md Sprint 12): ONE POOL, DERIVED. Nothing here is a
 * stored counter; `used`, `reserved` and grace consumption are all counts.
 * Charging never branches on `sessions.type`.
 */

'use strict';

/** Lowest legal `households.periodAnchorDay`. @const {number} */
const ANCHOR_MIN = 1;
/** Highest legal `households.periodAnchorDay` (Feb-safe). @const {number} */
const ANCHOR_MAX = 28;
/** The Academy's wall clock; every date boundary is local. @const {string} */
const TZ = 'America/Chicago';
/** @const {number} */
const DAY_MS = 24 * 60 * 60 * 1000;

const chicagoParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * A `Date` as a `'YYYY-MM-DD'` calendar date in America/Chicago. Built from
 * `formatToParts` rather than a locale string so no ICU build can reorder it.
 * @param {Date} date Any instant.
 * @return {string} `'YYYY-MM-DD'` in the Academy's timezone.
 */
function chicagoDate(date) {
  const parts = {};
  for (const p of chicagoParts.formatToParts(date)) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Booking opens for token members (spec 5). 2026-10-10T12:00:00Z. */
const BOOKING_OPENS_AT = 1791633600000;

const chicagoClock = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true,
});

/**
 * A `Date` as `'4:00 PM'` in America/Chicago, composed from parts with a
 * plain space (Node's `format()` may emit U+202F before AM/PM).
 * @param {Date} date Any instant.
 * @return {string} `'h:mm AM'`.
 */
function chicagoTime(date) {
  const p = {};
  for (const x of chicagoClock.formatToParts(date)) p[x.type] = x.value;
  return `${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}

/**
 * Whether booking is open (spec 5): Elite always, everyone else from
 * BOOKING_OPENS_AT. Mirrors `data/calendar.js#bookingOpen`.
 * @param {number|Date} now Epoch millis or a Date.
 * @param {?Object} pkg A `packages/{id}` body (needs `kind`).
 * @return {boolean} True when a booking may be made now.
 */
function bookingOpen(now, pkg) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return Boolean(pkg && pkg.kind === 'elite') || t >= BOOKING_OPENS_AT;
}

/**
 * Whole years between a DOB and a date (the 18+ check, spec 2.1).
 * @param {?string} dobISO `'YYYY-MM-DD'`.
 * @param {string} todayISO `'YYYY-MM-DD'`.
 * @return {?number} Age in years, or null when the DOB does not parse.
 */
function ageAt(dobISO, todayISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dobISO || ''))) return null;
  const [y, m, d] = String(dobISO).split('-').map(Number);
  const [ty, tm, td] = String(todayISO).split('-').map(Number);
  if (Number.isNaN(toUTC(dobISO).getTime())) return null;
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

/**
 * A Stripe unix timestamp (seconds) as an America/Chicago calendar date.
 * This is how a Stripe period start becomes a `periodKey` (pin H).
 * @param {number} seconds Unix seconds, as every Stripe date field is.
 * @return {string|null} `'YYYY-MM-DD'`, or null when the input is not a
 *     finite number.
 */
function chicagoDateFromUnix(seconds) {
  if (!Number.isFinite(seconds)) return null;
  return chicagoDate(new Date(seconds * 1000));
}

/**
 * Today in America/Chicago. The one "now" every gate compares against.
 * @param {Date=} now Injectable for tests.
 * @return {string} `'YYYY-MM-DD'`.
 */
function todayISO(now) {
  return chicagoDate(now instanceof Date ? now : new Date());
}

/**
 * A household's `periodAnchorDay` clamped to the 1..28 range the pin fixes;
 * absent (or anything non-integer) == 1.
 * @param {*} day The stored value.
 * @return {number} An int in 1..28.
 */
function normalizeAnchorDay(day) {
  const n = Number.isInteger(day) ? day : ANCHOR_MIN;
  return Math.min(ANCHOR_MAX, Math.max(ANCHOR_MIN, n));
}

/**
 * The day-of-month of a `'YYYY-MM-DD'` string, clamped to a legal anchor.
 * Pin H: `households.periodAnchorDay` is set from the Stripe period start.
 * @param {string} dateISO `'YYYY-MM-DD'`.
 * @return {number} An int in 1..28.
 */
function anchorDayFromISO(dateISO) {
  const d = Number(String(dateISO || '').slice(8, 10));
  return normalizeAnchorDay(Number.isInteger(d) ? d : ANCHOR_MIN);
}

// UTC-noon arithmetic on 'YYYY-MM-DD' strings, so no DST edge can move a
// date. Mirrors packages.js exactly.
/**
 * @param {string} iso `'YYYY-MM-DD'`.
 * @return {Date} That date at 12:00 UTC.
 */
function toUTC(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/**
 * @param {Date} date A UTC-noon date.
 * @return {string} `'YYYY-MM-DD'`.
 */
function fromUTC(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * The billing period a date falls in (pin B). A period starts on the
 * household's anchor day each month and ends the day before the next one:
 * anchor 15 puts 2026-09-10 in the period 2026-08-15 .. 2026-09-14.
 * @param {string} dateISO `'YYYY-MM-DD'` — a SESSION date when charging.
 * @param {number=} anchorDay `households.periodAnchorDay`; absent == 1.
 * @return {{periodKey: string, periodEnd: string}} Period start and end.
 */
function periodFor(dateISO, anchorDay) {
  const anchor = normalizeAnchorDay(anchorDay);
  const d = toUTC(dateISO);
  let start = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), anchor, 12));
  if (start > d) {
    start = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, anchor, 12));
  }
  const next = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, anchor, 12));
  const end = new Date(next.getTime() - DAY_MS);
  return {periodKey: fromUTC(start), periodEnd: fromUTC(end)};
}

/**
 * The period that follows `periodKey` for the same anchor.
 * @param {string} periodKey A period start.
 * @param {number=} anchorDay The household anchor.
 * @return {{periodKey: string, periodEnd: string}} The next period.
 */
function nextPeriod(periodKey, anchorDay) {
  const end = periodFor(periodKey, anchorDay).periodEnd;
  return periodFor(fromUTC(new Date(toUTC(end).getTime() + DAY_MS)),
      anchorDay);
}

/**
 * Elite is the only package that grants unlimited tokens (`tokens: null`).
 * No package AT ALL means zero tokens, never unlimited — `tokensFor`'s own
 * explicit rule.
 * @param {?Object} pkg A `packages/{id}` document body.
 * @return {boolean} True only for an unlimited package.
 */
function isUnlimited(pkg) {
  return Boolean(pkg) && pkg.tokens === null;
}

/**
 * A period's grant when no `tokenPeriods` doc has been issued (pin C). The
 * single token grants NO period token (rulings 2026-09-29/30): its tokens
 * are bought one at a time as graceTokens `single_{cs}`, and a period token
 * for a single athlete is only ever an ops comp (an issued doc).
 * @param {?Object} pkg A `packages/{id}` document body.
 * @return {number} 0 for kind 'single', else the package's tokens (0 when
 *     absent; Elite's null is handled by the caller as unlimited).
 */
function periodFallback(pkg) {
  if (pkg && pkg.kind === 'single') return 0;
  return (pkg && pkg.tokens) || 0;
}

/**
 * One athlete's token position in one period — derived, never a stored
 * counter. Mirrors `tokensFor` in packages.js including the Sprint 13 seam
 * amendment: a grace-charged booking is NOT a period spend.
 *
 * Single token (rulings 2026-09-29/30): `graceSpends` (graceSpendQueries)
 * are bookings of ANY period that spent a grace id. For a per-purchase
 * athlete each waitlist entry not in `ignoreWaitlistIds` HOLDS one token:
 * the `held` latest-expiring ones are not offered.
 *
 * @param {{pkg: ?Object, tokenPeriod: ?Object, bookings: !Array<!Object>,
 *     waitlist: !Array<!Object>, graceTokens: !Array<!Object>,
 *     graceSpends: (!Array<!Object>|undefined),
 *     periodKey: string, today: string,
 *     ignoreWaitlistIds: (!Array<string>|undefined)}} args Inputs. All
 *     arrays are the athlete's own documents; filtering by period happens
 *     here so callers can hand over one date-range read.
 * @return {{granted: ?number, used: number, reserved: number,
 *     grace: !Array<{id: string, expiresAt: ?string}>, left: ?number,
 *     unlimited: boolean, perPurchase: boolean, held: number}} The
 *     position. `held` is the number of waitlist entries holding a token.
 */
function tokensPosition(args) {
  const pkg = args.pkg || null;
  const periodKey = args.periodKey;
  const today = args.today || todayISO();
  const skip = new Set(args.ignoreWaitlistIds || []);
  const notCancelled = (b) => b && b.status !== 'cancelled';
  const live = (args.bookings || []).filter(notCancelled);
  // A grace-charged booking (graceTokenId set) is a second life for a token
  // the Academy could not honor — it never counts as a period spend.
  const used = live.filter(
      (b) => b.periodKey === periodKey && !b.graceTokenId).length;
  const reserved = (args.waitlist || []).filter(
      (w) => w && w.periodKey === periodKey && !skip.has(w.id)).length;
  const spends = live.concat((args.graceSpends || []).filter(notCancelled));
  const consumed = new Set(spends.map((b) => b.graceTokenId).filter(Boolean));
  const unlimited = isUnlimited(pkg);
  const perPurchase = Boolean(pkg) && !unlimited && pkg.kind === 'single';
  const held = perPurchase ? (args.waitlist || []).filter(
      (w) => w && !skip.has(w.id)).length : 0;
  const sorted = (args.graceTokens || [])
      .filter((g) => g && !consumed.has(g.id) &&
          (!g.expiresAt || g.expiresAt >= today))
      .map((g) => ({id: g.id, expiresAt: g.expiresAt || null}))
      .sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
  const grace = sorted.slice(0, Math.max(0, sorted.length - held));
  let granted = 0;
  if (unlimited) {
    granted = null;
  } else if (pkg) {
    const issued = args.tokenPeriod && args.tokenPeriod.granted;
    granted = Number.isInteger(issued) ? issued : periodFallback(pkg);
  }
  const left = unlimited ? null : Math.max(0, granted - used - reserved);
  return {granted, used, reserved, grace, left, unlimited, perPurchase, held};
}

/**
 * The charge order (pin E), identical to `createBooking`'s: Elite charges
 * nothing; otherwise the soonest-expiring unconsumed grace token still valid
 * on the session date; otherwise the period; otherwise nothing is bookable.
 * @param {{position: !Object, sessionDate: string}} args The derived
 *     position and the SESSION's date (not today).
 * @return {{chargedFrom: ?string, graceTokenId: ?string, reason: ?string}}
 *     `chargedFrom` is `'elite' | 'grace' | 'period'`, or null with a typed
 *     reason when nothing can pay.
 */
function chargeFor(args) {
  const pos = args.position;
  if (pos.unlimited) {
    return {chargedFrom: 'elite', graceTokenId: null, reason: null};
  }
  const usable = (pos.grace || []).filter(
      (g) => !g.expiresAt || g.expiresAt >= args.sessionDate);
  if (usable.length > 0) {
    return {chargedFrom: 'grace', graceTokenId: usable[0].id, reason: null};
  }
  if ((pos.left || 0) > 0) {
    return {chargedFrom: 'period', graceTokenId: null, reason: null};
  }
  return {chargedFrom: null, graceTokenId: null, reason: 'no-tokens-left'};
}

/**
 * Membership freeze (pin H) plus the per-athlete paid gate (spec 4.4).
 * `households.membership` and `athletes.billing` are both absent == active.
 * @param {?Object} household A `households/{id}` body.
 * @param {?Object=} athlete An `athletes/{id}` body.
 * @return {boolean} False when the household is past_due/lapsed, the
 *     athlete's `billing.status` is present and not 'active', or the
 *     billing is one-time (single token, rulings 2026-09-29/30) while the
 *     package has moved off 'single' — payment-pending until the new
 *     package is paid (firestore.rules athleteBillingOk is the rules half).
 */
function membershipAllowsBooking(household, athlete) {
  const status = household && household.membership &&
      household.membership.status;
  if (status === 'past_due' || status === 'lapsed') return false;
  const billing = athlete && athlete.billing;
  if (billing && billing.oneTime === true &&
      athlete.packageId !== 'single') {
    return false;
  }
  return !billing || billing.status === 'active';
}

/**
 * The household-by-Stripe-customer query (pin H). Exposed separately so the
 * webhook can run it inside a transaction (`tx.get(query)`) and the
 * follow-up phases can run it directly.
 * @param {!Object} db An admin `Firestore`.
 * @param {string} customerId `event.data.object.customer`.
 * @return {!Object} A Firestore `Query` returning at most one household.
 */
function householdByCustomerQuery(db, customerId) {
  return db.collection('households')
      .where('stripeCustomerId', '==', customerId)
      .limit(1);
}

/**
 * The one household a Stripe customer maps to, or null. An unmatched event
 * is recorded and skipped, never thrown — hence null rather than an error.
 * @param {!Object} db An admin `Firestore`.
 * @param {?string} customerId `event.data.object.customer`.
 * @return {!Promise<?{id: string, data: !Object}>} The household or null.
 */
async function householdByCustomer(db, customerId) {
  if (!customerId) return null;
  return householdFromSnap(
      await householdByCustomerQuery(db, customerId).get());
}

/**
 * Unwrap a household lookup snapshot.
 * @param {!Object} snap A `QuerySnapshot` from `householdByCustomerQuery`.
 * @return {?{id: string, data: !Object, ref: !Object}} The household or null.
 */
function householdFromSnap(snap) {
  if (!snap || snap.empty) return null;
  const doc = snap.docs[0];
  return {id: doc.id, data: doc.data() || {}, ref: doc.ref};
}

/** @param {string} a Athlete id.
 *  @param {string} k Period key.
 *  @return {string} `tokenPeriods` doc id. */
function tokenPeriodId(a, k) {
  return `${a}_${k}`;
}

/** @param {string} a Athlete id.
 *  @param {string} s Session id.
 *  @return {string} `bookings` doc id. */
function bookingId(a, s) {
  return `${a}_${s}`;
}

/** @param {string} s Session id.
 *  @param {string} a Athlete id.
 *  @return {string} `waitlist` doc id. */
function waitlistId(s, a) {
  return `${s}_${a}`;
}

/**
 * The athlete's bookings for one period. `periodKey` is equivalent to a date
 * range (`periodFor` returns both ends), so this rides the existing
 * `bookings (athleteId, date)` composite — DATA-MODEL v2.0 index reasoning —
 * instead of needing a new `(athleteId, periodKey)` index.
 * @param {!Object} db An admin `Firestore`.
 * @param {string} athleteId The athlete.
 * @param {{periodKey: string, periodEnd: string}} period The period.
 * @return {!Object} A Firestore `Query`.
 */
function periodBookingsQuery(db, athleteId, period) {
  return db.collection('bookings')
      .where('athleteId', '==', athleteId)
      .where('date', '>=', period.periodKey)
      .where('date', '<=', period.periodEnd);
}

/** Firestore's cap on the values of one `in` filter. @const {number} */
const IN_LIMIT = 30;

/**
 * The bookings of ANY period that spent one of an athlete's unexpired grace
 * tokens (single token, rulings 2026-09-29/30): a season token can be spent
 * outside the period `periodBookingsQuery` reads. The rows go to
 * `tokensPosition` as `graceSpends`. Expired and voided tokens (a refund
 * sets expiresAt '2000-01-01') are skipped: they are never offered anyway.
 * @param {!Object} db An admin `Firestore`.
 * @param {!Array<!Object>} graceRows The athlete's graceTokens rows
 *     (`rows(snap)`, so each carries its `id`).
 * @param {string} today `'YYYY-MM-DD'` in Chicago.
 * @return {!Array<!Object>} Firestore `Query`s, one per 30 ids; [] when
 *     there is no unexpired token.
 */
function graceSpendQueries(db, graceRows, today) {
  const ids = (graceRows || [])
      .filter((g) => g && g.id && (!g.expiresAt || g.expiresAt >= today))
      .map((g) => g.id);
  const queries = [];
  for (let i = 0; i < ids.length; i += IN_LIMIT) {
    queries.push(db.collection('bookings')
        .where('graceTokenId', 'in', ids.slice(i, i + IN_LIMIT)));
  }
  return queries;
}

/**
 * Run `graceSpendQueries` through a reader and flatten the result.
 * @param {function(!Object): !Promise<!Object>} get Resolves a `Query` to a
 *     `QuerySnapshot`: `(q) => tx.get(q)` inside a transaction, or
 *     `(q) => q.get()` outside one.
 * @param {!Array<!Object>} queries From `graceSpendQueries`.
 * @return {!Promise<!Array<!Object>>} The bookings as `[{id, ...data}]`.
 */
async function readGraceSpends(get, queries) {
  const out = [];
  for (const q of queries || []) {
    out.push(...rows(await get(q)));
  }
  return out;
}

/**
 * Turn a query snapshot into `[{id, ...data}]`, the shape every derivation
 * above expects (grace consumption is matched on the document id).
 * @param {!Object} snap A `QuerySnapshot`.
 * @return {!Array<!Object>} The documents.
 */
function rows(snap) {
  return snap.docs.map((d) => Object.assign({id: d.id}, d.data()));
}

module.exports = {
  ANCHOR_MIN,
  ANCHOR_MAX,
  BOOKING_OPENS_AT,
  TZ,
  ageAt,
  anchorDayFromISO,
  bookingId,
  bookingOpen,
  chargeFor,
  chicagoDate,
  chicagoDateFromUnix,
  chicagoTime,
  graceSpendQueries,
  householdByCustomer,
  householdByCustomerQuery,
  householdFromSnap,
  isUnlimited,
  membershipAllowsBooking,
  nextPeriod,
  normalizeAnchorDay,
  periodBookingsQuery,
  periodFallback,
  periodFor,
  // Lazy: prepaid.js requires lib.js, so these resolve on first use.
  get PRORATE_JOINERS() {
    return require('./prepaid').PRORATE_JOINERS;
  },
  prepaidPeriodFor: (...a) => require('./prepaid').prepaidPeriodFor(...a),
  readGraceSpends,
  rows,
  todayISO,
  tokenPeriodId,
  tokensPosition,
  waitlistId,
};
