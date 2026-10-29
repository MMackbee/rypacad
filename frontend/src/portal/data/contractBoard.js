/**
 * Yannick's contract board (spec 4.4, 5.4): who is on the contract, who is
 * overdue for a check-in and the three groups the board shows. PURE. The
 * on-contract gate and the 14-day rule here are the ones
 * functions/portal/contract-checkins.js applies for the Monday email
 * (CHANGE ONE, CHANGE BOTH; that file's test greps this one), so the email
 * and the screen never disagree.
 */
import { addDays, ageOn, contractMinutesFor, daysBetween, weekSummary } from './contractRule';
import { academyDateISO } from './calendar';

export const OVERDUE_DAYS = 14;

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

/** The latest check-in date for an athlete (checkedIn true only); `at` wins, `weekStart` is the fallback. */
export function lastCheckinFor(athleteId, checkins) {
  let latest = null;
  for (const c of checkins || []) {
    if (c.athleteId !== athleteId || c.checkedIn !== true) continue;
    const d = dateOf(c.at) || dateOf(c.weekStart);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
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

export function boardRows({ athletes, households, logsByAthlete, checkins, today, enabledAt, weekStartISO }) {
  const lastWeekStart = addDays(weekStartISO, -7);
  const rows = onContractAthletes(athletes, households).map((a) => {
    const required = (d) => contractMinutesFor(a, d);
    const logs = (logsByAthlete || {})[a.id] || {};
    const facts = checkinFacts(a, checkins, today, enabledAt);
    const checkedInThisWeek = (checkins || []).some((c) => c.athleteId === a.id && c.weekStart === weekStartISO && c.checkedIn === true);
    return {
      athleteId: a.id, name: a.name, age: ageOn(a.dob ?? null, today), required: contractMinutesFor(a, today),
      thisWeek: weekSummary({ logsByDate: logs, weekStartISO, required }),
      lastWeek: weekSummary({ logsByDate: logs, weekStartISO: lastWeekStart, required }),
      lastCheckin: facts.lastCheckin, checkedInThisWeek, daysSince: facts.daysSince, overdue: facts.overdue,
    };
  });
  const strip = ({ overdue, ...row }) => row;
  return {
    due: rows.filter((r) => r.overdue && !r.checkedInThisWeek).sort((x, y) => y.daysSince - x.daysSince || byName(x, y)).map(strip),
    thisWeek: rows.filter((r) => !r.overdue && !r.checkedInThisWeek).sort((x, y) => x.thisWeek.metDays - y.thisWeek.metDays || byName(x, y)).map(strip),
    checkedIn: rows.filter((r) => r.checkedInThisWeek).sort(byName).map(strip),
  };
}
