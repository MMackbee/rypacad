/**
 * Staff booking (owner 2026-11-13, spec 01-spec-admin-booking.md 10.1): the
 * owner or ops adds, moves or cancels any non-test athlete's booking from
 * the Admin screen, the session roster or the family's staff Billing view.
 *
 * PURE: who may book, the booking fields a roster row carries for the staff
 * sheets, a roster row as the billing hub row the sheets take, which rows
 * carry Move, the athlete search, one session's add facts (offered or not,
 * the warnings for each limit staff skip, the likely charge) and what a
 * move does with the token. No Firebase import - hooks/staffBooking.js
 * makes the calls, and the server (functions/portal/staff-book.js,
 * moveBooking's staff mode) decides every charge, seat and email.
 * data/staffAthlete.js builds the athlete model these read; it imports from
 * here, never the reverse.
 *
 * CHANGE ONE, CHANGE BOTH: STAFF_BOOK_ROLES and the server's STAFF_ROLES
 * (functions/portal/staff-cancel-decide.js); staffMovable and the server's
 * staff-mode move refusals (functions/portal/move-staff.js).
 */
import { format, parseISO } from 'date-fns';
import { staffCancellable } from './staffCancel';
import { isSingleTokenId } from './singleToken';
import { eliteDailyCapHit, periodFor, windowMonthsFor } from './packages';
import { academyDateISO, openThrough } from './calendar';
import { sessionStarted } from './sessionStart';
import { handicapLimitOf, reservedEligible } from './reserved';
import { isFreeComp } from './bookingChanges';
import { isHiddenSession } from './hiddenSessions';

/** The roles that may add and move bookings (the roles StaffBillingRoute serves). */
export const STAFF_BOOK_ROLES = ['owner', 'ops'];

/** True for the owner and ops; coaches, specialists, parents and athletes never book here. */
export function staffMayBook(role) {
  return STAFF_BOOK_ROLES.includes(role);
}

/**
 * The booking fields liveSessionAttendance spreads into each roster row
 * (hooks/index.js), so the staff sheets can read a roster row as a billing
 * hub row: whose household, Calendly or not, which kind, which day and
 * period, and how it was paid.
 */
export const STAFF_ROW_FIELDS = ['householdId', 'source', 'type', 'date', 'periodKey', 'chargedFrom', 'comp', 'graceTokenId'];

/** Those fields of one booking doc: `comp` a boolean, the others null when absent. */
export function staffRowFields(booking) {
  const b = booking || {};
  const out = {};
  for (const key of STAFF_ROW_FIELDS) out[key] = key === 'comp' ? b.comp === true : b[key] ?? null;
  return out;
}

/**
 * Whether a billing hub row carries Move: the same test as Cancel - Booked
 * or No-show, not Calendly, not a 1:1 (type 'mental'), the period not over.
 * Its own export so the two can diverge.
 */
export function staffMovable(row, { periodStart = null } = {}) {
  return staffCancellable(row, { periodStart });
}

/**
 * One roster row (a liveSessionAttendance row with staffRowFields spread
 * in) as the billing hub row the sheets take. `session` is the roster's
 * `{ id, date, time, type, label }`; it fills a date or type the row lacks.
 */
export function rosterRowToStaffRow(row, session) {
  const graceTokenId = row.graceTokenId ?? null;
  const comp = row.comp === true;
  return {
    id: row.bookingId,
    kind: 'booking',
    athleteId: row.athleteId,
    householdId: row.householdId ?? null,
    sessionId: session.id,
    date: row.date ?? session.date,
    time: session.time ?? null,
    label: session.label,
    type: row.type ?? session.type,
    status: row.status,
    source: row.source ?? null,
    chargedFrom: row.chargedFrom ?? null,
    comp,
    graceTokenId,
    periodKey: row.periodKey ?? null,
    viaGrace: Boolean(graceTokenId),
    viaSingle: isSingleTokenId(graceTokenId),
    viaComp: comp,
  };
}

/**
 * The roster rows of one household as StaffCancelSheet members, in roster
 * order: `[{ athleteId, name, spent, reserved: [], period: { start: null } }]`.
 * The roster knows no period start; the row's own period decides (staffMovable).
 */
export function rosterMembers(rows, householdId, session) {
  return (rows || [])
    .filter((r) => r && r.householdId === householdId)
    .map((r) => ({ athleteId: r.athleteId, name: r.name, spent: [rosterRowToStaffRow(r, session)], reserved: [], period: { start: null } }));
}

/** Lower-case words of a name or a query. */
function wordsOf(text) {
  return String(text ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** At most this many athletes in a search result. */
const SEARCH_MAX = 8;

/**
 * The directory's athletes (useHouseholdsDirectory: households, each with
 * its athletes) whose name matches every word typed: each word, in any
 * case, must start some word of the name ("jor whit" finds Jordan
 * Whitfield; "ord" finds nobody). Sorted by name, at most eight, each
 * `{ athleteId, name, householdId, householdName, packageName, test }`;
 * `test` when the athlete or the household is a test one. A blank query
 * finds nothing.
 */
export function searchAthletes(directory, query) {
  const words = wordsOf(query);
  if (!words.length) return [];
  const found = [];
  for (const h of directory || []) {
    for (const a of (h && h.athletes) || []) {
      if (!a) continue;
      const name = wordsOf(a.name);
      if (!words.every((w) => name.some((n) => n.startsWith(w)))) continue;
      found.push({
        athleteId: a.id,
        name: a.name ?? a.id,
        householdId: h.id,
        householdName: h.name ?? null,
        packageName: a.packageName ?? null,
        test: a.test === true || h.test === true,
      });
    }
  }
  return found.sort((x, y) => String(x.name).localeCompare(String(y.name))).slice(0, SEARCH_MAX);
}

/**
 * A session staff may never add to (the server refuses each): cancelled,
 * hidden, display-only, one of Yannick's 1:1s or a held Calendly slot, or
 * dated before the athlete's current period.
 */
function addBlocked(session, model) {
  return (
    session.status === 'cancelled' ||
    isHiddenSession(session) ||
    session.bookable === false ||
    session.type === 'mental' ||
    session.source === 'calendly' ||
    session.unresolved === true ||
    !session.date ||
    session.date < model.period.start
  );
}

/**
 * The limits a family meets that staff skip, each as a warning the add
 * sheet words, in one order: past the family's booking window, a
 * handicap-reserved block the athlete is not eligible for, Elite's one a
 * day, a session that has started, and the athlete's own waitlist place
 * (the add takes them off it).
 */
function addWarnings(session, model, { started, waiting }, now) {
  const out = [];
  const through = openThrough(now, windowMonthsFor(model.pkg));
  if (session.date > through) out.push({ kind: 'outside-window', through });
  if (!reservedEligible(session, { handicap: model.handicap })) {
    out.push({ kind: 'handicap-reserved', limit: handicapLimitOf(session), handicap: model.handicap ?? null });
  }
  if (eliteDailyCapHit(model.pkg, session.type, session.date, model.bookings)) {
    out.push({ kind: 'one-per-day', type: session.type, date: session.date });
  }
  if (started) out.push({ kind: 'started', today: session.date === academyDateISO(now), date: session.date });
  if (waiting) out.push({ kind: 'waiting' });
  return out;
}

/**
 * What the add will most likely use, in the server's order
 * (functions/portal/staff-book-decide.js and lib.chargeFor): Free only when
 * the athlete is not paid up; Elite; the soonest-expiring bonus or session
 * token still good on the session's day (`tokens.grace` already leaves out
 * spent and held ones); for a single athlete waiting on this session, the
 * token the place holds; then the period of the session's own date - this
 * one or the next, counting back the place the add gives up - or none. A
 * date past the next period reads `unknown`. A prediction for the copy:
 * the server decides.
 */
function addCharge(session, model, waiting) {
  if (model.payState !== 'paid') return { kind: 'free-only', payState: model.payState };
  const tokens = model.tokens || {};
  if (tokens.unlimited) return { kind: 'elite' };
  const usable = (tokens.grace || []).find((g) => g && (!g.expiresAt || g.expiresAt >= session.date));
  if (usable) return { kind: isSingleTokenId(usable.id) ? 'single' : 'grace', expiresAt: usable.expiresAt ?? null };
  if (waiting && tokens.perPurchase && tokens.held > 0) return { kind: 'single' };
  const from = periodFor(session.date, model.anchorDay).periodKey;
  const next = from === model.nextPeriod.start;
  if ((from !== model.period.start && !next) || (next && !tokens.nextPeriod)) return { kind: 'unknown' };
  const pos = next ? tokens.nextPeriod : tokens;
  const left = (pos.left || 0) + (waiting ? 1 : 0);
  if (left > 0) return { kind: 'period', left: left - 1, next, from };
  return { kind: 'none', next };
}

/**
 * One session as the add sheet and the day list read it for one athlete
 * (data/staffAthlete.js staffAthleteModel): `{ offer, held, waiting, full,
 * taken, capacity, started, warnings, charge }`. `offer` is false for a
 * session the athlete holds and for one staff may never add to; a full or
 * started one is still offered, with its question or warning.
 */
export function staffAddFacts(session, model, now) {
  const held = (model.heldSessionIds || []).includes(session.id);
  const waiting = (model.waitingSessionIds || []).includes(session.id);
  const taken = Number(session.booked) || 0;
  const capacity = Number(session.capacity) || 0;
  const started = sessionStarted(session, now);
  return {
    offer: !held && !addBlocked(session, model),
    held,
    waiting,
    full: taken >= capacity,
    taken,
    capacity,
    started,
    warnings: addWarnings(session, model, { started, waiting }, now),
    charge: addCharge(session, model, waiting),
  };
}

/** 'November' for '2026-11-01'. */
function monthOf(periodKey) {
  return format(parseISO(periodKey), 'MMMM');
}

/**
 * What a staff move does with the token (moveBooking's charges, spec
 * 2026-11-11 §5 and 01-spec-admin-booking.md 10.5): `elite` (nothing to
 * move), `free` (a comp stays free), `carry` (a bonus or session token
 * still good on the new day, or a period token inside its own period - by
 * the household's anchor) or `swap` with the two months, `{ kind: 'swap',
 * fromMonth: 'November', toMonth: 'December' }`. The row's period is its
 * own `periodKey`, else its booking's, else its date's. Only a row paid from
 * the period carries by period (the server's `spentPeriod`,
 * functions/portal/move-decide.js): a bonus or session token that runs out
 * before the new day never carries, so that move spends a new token.
 */
export function moveChargeKind(row, target, model) {
  if (row.chargedFrom === 'elite' || model.tokens?.unlimited) return { kind: 'elite' };
  if (isFreeComp(row)) return { kind: 'free' };
  if (row.graceTokenId) {
    const token = (model.graceTokens || []).find((g) => g && g.id === row.graceTokenId);
    if (token && (!token.expiresAt || token.expiresAt >= target.date)) return { kind: 'carry' };
  }
  const booking = (model.bookings || []).find((b) => b && b.id === row.id);
  const fromKey = row.periodKey ?? booking?.periodKey ?? periodFor(row.date, model.anchorDay).periodKey;
  const toKey = periodFor(target.date, model.anchorDay).periodKey;
  const spentPeriod = !row.graceTokenId && (row.chargedFrom ?? 'period') === 'period';
  if (spentPeriod && fromKey === toKey) return { kind: 'carry' };
  return { kind: 'swap', fromMonth: monthOf(fromKey), toMonth: monthOf(toKey) };
}
