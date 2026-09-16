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
 * L, M). Prices carry pending: true until the owner's OK (contract section
 * 1); the UI may render "pending" beside them. Seeds never carry prices.
 * ========================================================================== */

/** Token packages (contract section 1): tokens per billing period. */
export const TOKEN_PACKAGES = [
  { id: 't-6',  name: '6 tokens',  kind: 'tokens', tokens: 6,  price: 300, pending: true, windowDays: 32 },
  { id: 't-12', name: '12 tokens', kind: 'tokens', tokens: 12, price: 570, pending: true, windowDays: 32 },
  { id: 't-16', name: '16 tokens', kind: 'tokens', tokens: 16, price: 720, pending: true, windowDays: 32 },
  { id: 't-20', name: '20 tokens', kind: 'tokens', tokens: 20, price: 850, pending: true, windowDays: 32 },
];

/**
 * Elite (pin L): unlimited (tokens: null), 24/7 access as an attribute of
 * the one Elite package (no 24/7 tier), a 45-day window, no countdown
 * anywhere. The $1,000 is the owner's stated figure, not pending.
 */
export const ELITE = {
  id: 'elite', name: 'Elite', kind: 'elite', tokens: null, price: 1000, pending: false, windowDays: 45, access247: true,
};

/** Single token (pin M): one token per period. Per-visit sale is a Stripe-sprint question. */
export const SINGLE_TOKEN = { id: 'single', name: 'Single token', kind: 'single', tokens: 1, price: 65, pending: true, windowDays: 32 };

export const ALL_PACKAGES = [...TOKEN_PACKAGES, ELITE, SINGLE_TOKEN];

export function packageById(id) {
  return ALL_PACKAGES.find((p) => p.id === id) ?? null;
}

/** Booking window in days (pin D): the package's own, 32 when there is no package. */
export function windowDaysFor(pkg) {
  return pkg && Number.isInteger(pkg.windowDays) ? pkg.windowDays : 32;
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
 * One athlete's token position in one period (pin B) - derived, never a
 * stored counter:
 *   granted    the package's tokens; Part 2 passes the period's tokenPeriods
 *              doc as opts.tokenPeriod and its granted wins (absent == grant)
 *   used       non-cancelled bookings carrying this periodKey and no graceTokenId
 *   reserved   waitlist entries carrying this periodKey
 *   grace      unconsumed, unexpired grace tokens, soonest expiry first
 *              (consumed == some non-cancelled booking references the id)
 *   left       granted - used - reserved, floored at 0; null when unlimited
 *   unlimited  the package has tokens: null (Elite)
 * No package at all means zero tokens, not unlimited.
 */
export function tokensFor(athlete, pkg, bookings, waitlist, graceTokens, periodKey, opts = {}) {
  const today = opts.today ?? fromUTC(new Date());
  const live = (bookings || []).filter((b) => b && b.status !== 'cancelled');
  // A grace-charged booking (graceTokenId set) is a second life for a token
  // the Academy could not honor - it never counts as a period spend.
  const used = live.filter((b) => b.periodKey === periodKey && !b.graceTokenId).length;
  const reserved = (waitlist || []).filter((w) => w && w.periodKey === periodKey).length;
  const consumed = new Set(live.map((b) => b.graceTokenId).filter(Boolean));
  const grace = (graceTokens || [])
    .filter((g) => g && !consumed.has(g.id) && (!g.expiresAt || g.expiresAt >= today))
    .map((g) => ({ id: g.id, expiresAt: g.expiresAt ?? null }))
    .sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));
  const unlimited = Boolean(pkg) && pkg.tokens === null;
  const granted = unlimited ? null : pkg ? (opts.tokenPeriod?.granted ?? pkg.tokens ?? 0) : 0;
  const left = unlimited ? null : Math.max(0, granted - used - reserved);
  return { granted, used, reserved, grace, left, unlimited };
}

