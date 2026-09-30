/**
 * 2026-27 package catalogue — CONFIRMED. Supersedes the placeholder TIERS in seed.js.
 *
 * The scaffold was built against revision 2 of the design handoff, which said
 * tier names, count and prices were undecided. They are decided. Registration's
 * "TIERS NOT DECIDED" caution banner and the dashed `$ ——` price slots should be
 * removed, and the tier cards should render from this file.
 *
 * Contract v2.0 (Sprint 12): one fungible token pool. The seam below is the
 * whole catalogue; the two-pool exports it replaced are gone.
 */

// Sprint 11 (contract v1.9, pin C): entitlementsFor's mental (Yannick) cap
// is the same flat, owner-tunable knob the specialist booking gate already
// uses - one import, no re-declared constant to drift out of sync.

// `kind` (contract v1.1's own discriminator: 'golf' | 'drop-in' | 'fitness' |
// 'elite') is added to every entry below as of Sprint 11 (contract v1.9,
// pin C) - a pre-existing gap this lane found and fixed rather than carried
// forward: the FIELD has been in DATA-MODEL.md since v1.1 and every Firestore
// package doc has always carried it (db lane's provisioning bundles this
// catalogue "price stripped", per DATA-MODEL - kind was never stripped), but
// this STATIC catalogue itself never restated it, because nothing read it
// client-side before entitlementsFor's Elite branch needed `golf.kind ===
// 'elite'` to work in SEED mode too (live mode was always fine - it reads
// the real Firestore field). Values match the Firestore docs exactly.
/* ========================================================================== *
 * CONTRACT v2.0 (Sprint 12, TEAM.md "Sprint 12 pins - the token model").
 * ONE catalogue, ONE fungible token pool. Everything from here down to the
 * DEPRECATED banner is the live seam both lanes build against (pin A, B, D,
 * L, M). Prices are the owner's own figures as of 2026-09-17 (v2.0.1) but
 * are withheld from parents until released (PRICES_RELEASED). Seeds never
 * carry prices.
 * ========================================================================== */

/** Token packages (contract section 1): tokens per billing period. */
// v2.0.1 (Sprint 18, the owner's pricing sheet of 2026-09-17): three token
// packages - t-20 is RETIRED - at the owner's own figures (pending: false).
// The prices are NOT released to parents: see PRICES_RELEASED below.
export const TOKEN_PACKAGES = [
  { id: 't-6',  name: '6 tokens',  kind: 'tokens', tokens: 6,  price: 299, pending: false, windowDays: 30 },
  { id: 't-12', name: '12 tokens', kind: 'tokens', tokens: 12, price: 569, pending: false, windowDays: 30 },
  { id: 't-16', name: '16 tokens', kind: 'tokens', tokens: 16, price: 719, pending: false, windowDays: 30 },
];

/**
 * Elite (pin L): unlimited (tokens: null), 24/7 access as an attribute of
 * the one Elite package (no 24/7 tier), a 45-day window, no countdown
 * anywhere. The $1,000 is the owner's stated figure, not pending.
 */
export const ELITE = {
  id: 'elite', name: 'Elite', kind: 'elite', tokens: null, price: 999, pending: false, windowDays: 45, access247: true,
};

/**
 * Single token: one-time $65; each paid checkout = one token, valid to season
 * end (owner ruling 2026-09-29/30). The token is a graceTokens doc
 * `single_{checkoutSessionId}`, not a period grant - periodFallback() below
 * gives this package 0 period tokens whatever `tokens` says. `tokens: 1`
 * stays because the Firestore packages/single doc carries it.
 */
export const SINGLE_TOKEN = { id: 'single', name: 'Single token', kind: 'single', tokens: 1, price: 65, pending: false, windowDays: 30 };

export const ALL_PACKAGES = [...TOKEN_PACKAGES, ELITE, SINGLE_TOKEN];

/**
 * v2.0.1 (Sprint 18): the owner's prices are in the catalogue but NOT
 * released to parents. Every parent/athlete-facing price render checks this;
 * staff surfaces (the membership editor, the staff billing view) always show
 * them. Flip to true when the owner releases pricing.
 */
export const PRICES_RELEASED = true;

/**
 * v2.0.1 (Sprint 18): 24/7 facility access is a $300/month ADD-ON on any
 * package - a line item, never a session entitlement. Lives on the athlete
 * as `facilityAccess` (ops/owner-set, needs the signed waiver in
 * `facilityAccessConsent`). Elite includes it (`access247`).
 */
export const FACILITY_ACCESS = { id: 'facility-access', name: 'Facility access', price: 300, pending: false };

/**
 * Elite's frequency caps (v2.0.1, Sprint 18): at most ONE training-or-
 * tournament booking per date and ONE Phil booking per date. Not a pool,
 * never a charge - the same class of rule as Yannick's monthly cadence, and
 * the other named exception to "charging never branches on type".
 * @return {boolean} true when the athlete already holds a non-cancelled
 *   booking of the same class on that date and the package is Elite.
 */
export function eliteDailyCapHit(pkg, type, date, bookings) {
  if (!pkg || pkg.kind !== 'elite' || !date) return false;
  const cls = type === 'training' || type === 'tournament' ? 'golf' : type === 'phil' ? 'phil' : null;
  if (!cls) return false;
  return (bookings || []).some(
    (b) =>
      b &&
      b.status !== 'cancelled' &&
      b.date === date &&
      (cls === 'golf' ? b.type === 'training' || b.type === 'tournament' : b.type === 'phil')
  );
}

export function packageById(id) {
  return ALL_PACKAGES.find((p) => p.id === id) ?? null;
}

/** Booking window in days (pin D): the package's own, 30 when there is no package. */
export function windowDaysFor(pkg) {
  return pkg && Number.isInteger(pkg.windowDays) ? pkg.windowDays : 30;
}

const ANCHOR_MIN = 1;
const ANCHOR_MAX = 28;

/** A household's periodAnchorDay clamped to the 1-28 range the pin fixes; absent == 1. */
export function normalizeAnchorDay(day) {
  const n = Number.isInteger(day) ? day : ANCHOR_MIN;
  return Math.min(ANCHOR_MAX, Math.max(ANCHOR_MIN, n));
}

// UTC-noon arithmetic on 'yyyy-MM-dd' strings, so no DST edge can move a date.
function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function fromUTC(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * The billing period a date falls in (pin B). A period starts on the
 * household's anchor day each month and ends the day before the next one:
 * anchor 15 puts 2026-09-10 in the period 2026-08-15 .. 2026-09-14. Pure;
 * both data modes call it; the same rule the seed script mirrors.
 */
export function periodFor(dateISO, anchorDay = 1) {
  const anchor = normalizeAnchorDay(anchorDay);
  const d = toUTC(dateISO);
  let start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), anchor, 12));
  if (start > d) start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, anchor, 12));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, anchor, 12));
  const end = new Date(next.getTime() - 24 * 60 * 60 * 1000);
  return { periodKey: fromUTC(start), periodEnd: fromUTC(end) };
}

/**
 * A period's grant when no tokenPeriods doc has been issued (pin C). The
 * single token grants NO period token (owner ruling 2026-09-29/30): its
 * tokens are bought one at a time, and a period token for a single athlete is
 * only ever an ops comp (an issued doc). CHANGE ONE, CHANGE BOTH with
 * functions/portal/lib.js#periodFallback.
 */
export function periodFallback(pkg) {
  if (pkg && pkg.kind === 'single') return 0;
  return (pkg && pkg.tokens) || 0;
}

/**
 * One athlete's token position in one period (pin B) - derived, never a
 * stored counter:
 *   granted    periodFallback(pkg); Part 2 passes the period's tokenPeriods
 *              doc as opts.tokenPeriod and its granted wins (absent == grant)
 *   used       non-cancelled bookings carrying this periodKey and no graceTokenId
 *   reserved   waitlist entries carrying this periodKey
 *   grace      unconsumed, unexpired grace tokens, soonest expiry first
 *              (consumed == some non-cancelled booking, or opts.graceSpends
 *              row, references the id), less the `held` latest-expiring ones
 *   left       granted - used - reserved, floored at 0; null when unlimited
 *   unlimited  the package has tokens: null (Elite)
 *   perPurchase  the single token (ruling 2026-09-29/30): tokens are bought
 *              one at a time as grace tokens, not granted per period
 *   held       perPurchase only: every waitlist entry holds one purchased
 *              token (the client has no ignore list; the promotion writer's
 *              ignoreWaitlistIds is server-side only)
 * No package at all means zero tokens, not unlimited. Mirrors
 * functions/portal/lib.js#tokensPosition - CHANGE ONE, CHANGE BOTH.
 */
export function tokensFor(athlete, pkg, bookings, waitlist, graceTokens, periodKey, opts = {}) {
  const today = opts.today ?? fromUTC(new Date());
  const notCancelled = (b) => b && b.status !== 'cancelled';
  const live = (bookings || []).filter(notCancelled);
  // A grace-charged booking (graceTokenId set) is a second life for a token
  // the Academy could not honor - it never counts as a period spend.
  const used = live.filter((b) => b.periodKey === periodKey && !b.graceTokenId).length;
  const reserved = (waitlist || []).filter((w) => w && w.periodKey === periodKey).length;
  const spends = live.concat((opts.graceSpends || []).filter(notCancelled));
  const consumed = new Set(spends.map((b) => b.graceTokenId).filter(Boolean));
  const unlimited = Boolean(pkg) && pkg.tokens === null;
  const perPurchase = Boolean(pkg) && !unlimited && pkg.kind === 'single';
  const held = perPurchase ? (waitlist || []).filter(Boolean).length : 0;
  const sorted = (graceTokens || [])
    .filter((g) => g && !consumed.has(g.id) && (!g.expiresAt || g.expiresAt >= today))
    .map((g) => ({ id: g.id, expiresAt: g.expiresAt ?? null }))
    .sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
  const grace = sorted.slice(0, Math.max(0, sorted.length - held));
  const granted = unlimited ? null : pkg ? (opts.tokenPeriod?.granted ?? periodFallback(pkg)) : 0;
  const left = unlimited ? null : Math.max(0, granted - used - reserved);
  return { granted, used, reserved, grace, left, unlimited, perPurchase, held };
}

