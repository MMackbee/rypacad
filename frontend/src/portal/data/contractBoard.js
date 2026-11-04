/**
 * Yannick's contract board (spec 4.4, 5.4): who is on the contract, who is
 * overdue for a check-in and the three groups the board shows. PURE. The
 * on-contract gate and the 14-day rule here are the ones
 * functions/portal/contract-checkins.js applies for the Monday email
 * (CHANGE ONE, CHANGE BOTH; that file's test greps this one), so the email
 * and the screen never disagree.
 */
import { addDays, ageOn, contractMinutesFor, daysBetween, weekSummary } from './contractRule';
import { academyDateISO, parseTimeToMinutes } from './calendar';

export const OVERDUE_DAYS = 14;
/** The most a check-in note holds (firestore.rules contractCheckins, CHANGE ONE, CHANGE BOTH). */
export const CHECKIN_NOTE_MAX = 500;
/** How far ahead the board's week switcher goes (Yannick, 2026-10-30: "skip to future weeks" to see who is coming in). */
export const WEEKS_AHEAD = 4;

/**
 * 'YYYY-MM-DD' from an ISO string (as written), or the America/Chicago date
 * of a Date or a Firestore Timestamp (a check-in tapped at 7 PM Chicago is
 * stored past midnight UTC and must stay on its own day); null otherwise.
 */
export function dateOf(v) {
  if (v == null) return null;
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  const ms = v instanceof Date ? v.getTime() : typeof v.toMillis === 'function' ? v.toMillis() : null;
  return ms == null || Number.isNaN(ms) ? null : academyDateISO(new Date(ms));
}

/**
 * Who is on the contract (spec 4.4): not a test household, and a membership
 * that allows booking. Line for line the server's lib.membershipAllowsBooking
 * plus the test skip; a missing household keeps the athlete, as the server's
 * membershipAllowsBooking(null, athlete) does.
 */
export function onContract(household, athlete) {
  if (household && household.test === true) return false;
  const status = household?.membership?.status;
  if (status === 'past_due' || status === 'lapsed') return false;
  const billing = athlete?.billing;
  if (billing && billing.oneTime === true && athlete.packageId !== 'single') return false;
  return !billing || billing.status === 'active';
}

const householdMap = (households) => {
  if (!households) return null;
  if (Array.isArray(households)) return Object.fromEntries(households.map((h) => [h.id, h]));
  return households;
};
const onContractAthletes = (athletes, households) => {
  const byId = householdMap(households);
  return (athletes || []).filter((a) => !byId || onContract(byId[a.householdId], a));
};

/** A check-in's note as shown: a non-blank string, else null (the field is optional and may be absent or empty). */
export const noteOf = (checkin) => (typeof checkin?.note === 'string' && checkin.note.trim() ? checkin.note.trim() : null);

/** The latest check-in for an athlete (checkedIn true only) as `{ date, note }`; `at` wins, `weekStart` is the fallback; null when none. */
export function latestCheckin(athleteId, checkins) {
  let latest = null;
  for (const c of checkins || []) {
    if (c.athleteId !== athleteId || c.checkedIn !== true) continue;
    const d = dateOf(c.at) || dateOf(c.weekStart);
    if (d && (!latest || d > latest.date)) latest = { date: d, note: noteOf(c) };
  }
  return latest;
}

/** The latest check-in date for an athlete (checkedIn true only); `at` wins, `weekStart` is the fallback. */
export function lastCheckinFor(athleteId, checkins) {
  return latestCheckin(athleteId, checkins)?.date ?? null;
}

/* ------------------------------------------------------------ Visits -- */

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VISIT_KIND = { tournament: 'Tour', phil: 'Phil', mental: '1:1' };

/**
 * Who is at the academy when, for the week starting `weekStartISO`
 * (Yannick, 2026-10-30: "athlete x is coming in days z this week"): every
 * booking dated in that week that is not cancelled, joined to its session
 * for the time and kind, per athlete and in day-then-time order. A booking
 * whose session is missing or cancelled is left out; one whose session has
 * no time sorts first in its day. Returns `{ [athleteId]: Visit[] }` with
 * `Visit = { date, dow, time, type }`.
 */
export function visitsByAthlete({ bookings, sessions, weekStartISO }) {
  const weekEnd = addDays(weekStartISO, 6);
  const byId = new Map((sessions || []).map((s) => [s.id, s]));
  const out = {};
  for (const b of bookings || []) {
    if (!b || !b.athleteId || typeof b.date !== 'string' || b.date < weekStartISO || b.date > weekEnd) continue;
    if (b.status === 'cancelled') continue;
    const s = byId.get(b.sessionId);
    if (!s || s.status === 'cancelled') continue;
    const offset = daysBetween(weekStartISO, b.date);
    (out[b.athleteId] = out[b.athleteId] || []).push({ date: b.date, dow: DOW[offset] ?? '', time: s.time ?? null, type: s.type ?? b.type ?? null });
  }
  const minutes = (t) => (t ? parseTimeToMinutes(t) ?? -1 : -1);
  for (const list of Object.values(out)) list.sort((x, y) => x.date.localeCompare(y.date) || minutes(x.time) - minutes(y.time));
  return out;
}

/** One line for a row's visits: `Tue 4:00 PM · Thu 4:30 PM 1:1 · Sat 9:00 AM Tour`; '' when there are none. */
export function visitText(visits) {
  return (visits || [])
    .map((v) => [v.dow, v.time, VISIT_KIND[v.type] || null].filter(Boolean).join(' '))
    .join(' · ');
}

/* ------------------------------------------------------------ Search -- */

/** What a search compares: lower-cased, accents stripped, whitespace collapsed. */
const searchKey = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

/**
 * True when every word typed starts some word of the athlete's name or
 * family name (Yannick, 2026-11-04: "search kids" on the board). Case and
 * accents never matter; a blank query matches everyone.
 */
export function matchesRow(row, query) {
  const words = searchKey(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const haystack = searchKey(`${row?.name ?? ''} ${row?.familyName ?? ''}`).split(' ').filter(Boolean);
  return words.every((w) => haystack.some((h) => h.startsWith(w)));
}

/** The board's three groups with only the rows matching `query`; a blank query returns `rows` itself. */
export function searchRows(rows, query) {
  if (!rows || !searchKey(query)) return rows;
  return {
    due: rows.due.filter((r) => matchesRow(r, query)),
    thisWeek: rows.thisWeek.filter((r) => matchesRow(r, query)),
    checkedIn: rows.checkedIn.filter((r) => matchesRow(r, query)),
  };
}

const later = (a, b) => (a && b ? (a > b ? a : b) : a || b || null);
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));

function checkinFacts(athlete, checkins, today, enabledAt) {
  const lastCheckin = lastCheckinFor(athlete.id, checkins);
  const since = lastCheckin || later(dateOf(enabledAt), dateOf(athlete.createdAt));
  const daysSince = since ? daysBetween(since, today) : null;
  return { lastCheckin, daysSince, overdue: daysSince != null && daysSince > OVERDUE_DAYS };
}

export function overdueCheckins({ athletes, households, checkins, today, enabledAt }) {
  return onContractAthletes(athletes, households)
    .map((a) => ({ athlete: a, ...checkinFacts(a, checkins, today, enabledAt) }))
    .filter((r) => r.overdue)
    .sort((x, y) => y.daysSince - x.daysSince || byName(x.athlete, y.athlete))
    .map((r) => ({ athleteId: r.athlete.id, lastCheckin: r.lastCheckin, daysSince: r.daysSince }));
}

/**
 * The board's rows in three groups. Beside the contract facts each row
 * carries `note` (the displayed week's check-in note, or null), `visits`
 * (visitsByAthlete's list for that week, or []) and `familyName` (the
 * household's name, or null), which the row shows beside a first-name-only
 * athlete (data/athleteLabel.js).
 */
export function boardRows({ athletes, households, logsByAthlete, checkins, visits, today, enabledAt, weekStartISO }) {
  const lastWeekStart = addDays(weekStartISO, -7);
  const byHousehold = householdMap(households) || {};
  const rows = onContractAthletes(athletes, households).map((a) => {
    const required = (d) => contractMinutesFor(a, d);
    const logs = (logsByAthlete || {})[a.id] || {};
    const facts = checkinFacts(a, checkins, today, enabledAt);
    const weekCheckin = (checkins || []).find((c) => c.athleteId === a.id && c.weekStart === weekStartISO && c.checkedIn === true) || null;
    return {
      athleteId: a.id, name: a.name, age: ageOn(a.dob ?? null, today), required: contractMinutesFor(a, today),
      familyName: byHousehold[a.householdId]?.name ?? null,
      thisWeek: weekSummary({ logsByDate: logs, weekStartISO, required }),
      lastWeek: weekSummary({ logsByDate: logs, weekStartISO: lastWeekStart, required }),
      lastCheckin: facts.lastCheckin, checkedInThisWeek: weekCheckin != null, note: noteOf(weekCheckin),
      visits: (visits || {})[a.id] || [],
      daysSince: facts.daysSince, overdue: facts.overdue,
    };
  });
  const strip = ({ overdue, ...row }) => row;
  return {
    due: rows.filter((r) => r.overdue && !r.checkedInThisWeek).sort((x, y) => y.daysSince - x.daysSince || byName(x, y)).map(strip),
    thisWeek: rows.filter((r) => !r.overdue && !r.checkedInThisWeek).sort((x, y) => x.thisWeek.metDays - y.thisWeek.metDays || byName(x, y)).map(strip),
    checkedIn: rows.filter((r) => r.checkedInThisWeek).sort(byName).map(strip),
  };
}
