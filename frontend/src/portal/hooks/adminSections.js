/**
 * The Admin dashboard's card groups (speed review F6, 2026-11-17), for
 * useAdminDashboard (hooks/index.js). Its eight reads ran in one Promise.all,
 * so no card painted until the slowest landed; they now run as three groups,
 * each its own resource:
 *   roster - athletes + households: enrollment, membership, enrolled count
 *   week   - this week's sessions: block fill and the reserved blocks
 *   calls  - pending enrollments, no-shows, contract logs, assessment
 *            windows, the four-week sessions: with the roster, Outstanding
 * The two pure builders here are the parts of the old one-shot derivation
 * that read only the roster or only the week, moved verbatim; Outstanding
 * stays beside deriveWhoNeedsCall in index.js. PURE: no reads, no hooks.
 */
import { addDaysISO, parseTimeToMinutes } from '../data/calendar';
import { billingStatusOf } from '../data/billingCopy';
import { handicapLimitOf } from '../data/reserved';
import { FITNESS_WINDOW_DAYS } from '../data/orphanFitness';
import { packageById } from '../data/packages';
import { withoutTestFamilies } from '../data/testFamily';
import { isGroupBookable } from './repeat';

function mondayOfWeek(todayIso) {
  const dow = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysISO(todayIso, diff);
}

/** '2026-11-02' -> 'Mon' (the same helper index.js keeps for the household card). */
function shortWeekday(iso) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}

/** The date bounds every group reads with. */
export function adminWindow(today) {
  const weekStart = mondayOfWeek(today);
  return {
    monthStart: `${today.slice(0, 7)}-01`,
    weekStart,
    weekEnd: addDaysISO(weekStart, 6),
    // Owner 2026-11-13: fitness with no golf, read over the next four weeks
    // (data/orphanFitness.js), hidden and cancelled sessions included.
    fitnessTo: addDaysISO(today, FITNESS_WINDOW_DAYS - 1),
  };
}

/** roster -> the athletes every count reads, enrollment by package, membership. */
export function adminRoster([allAthletes, allHouseholds]) {
  // Owner 2026-10-15: staging shares this database, so the test family
  // (test: true, data/testFamily.js) is left out of every count and list
  // below. It never books, so no booking or contract log names it.
  const { households, athletes } = withoutTestFamilies({ households: allHouseholds, athletes: allAthletes });

  // Contract v2.1, pin H: membership status counts + who's lapsed - absent
  // == active, the same default every other membership read in this app
  // uses. `lapsedHouseholds` links straight to nothing invented — just the
  // household's own id/name, matching what the admin screen already knows
  // how to show elsewhere.
  const membership = { active: 0, pastDue: 0, lapsed: 0, pending: 0, lapsedHouseholds: [] };
  for (const h of households) {
    const status = h.membership?.status ?? 'active';
    if (status === 'past_due') membership.pastDue += 1;
    else if (status === 'lapsed') {
      membership.lapsed += 1;
      membership.lapsedHouseholds.push({ id: h.id, name: h.name ?? null });
    } else membership.active += 1;
  }
  // Sprint 20 (spec 4.4/7): athletes still on checkout - an ATHLETE count beside the household counts, so the dashboard agrees with the sign-ups report.
  membership.pending = athletes.filter((a) => billingStatusOf(a) === 'pending').length;

  const byPackage = new Map();
  for (const a of athletes) {
    if (!a.packageId) continue;
    byPackage.set(a.packageId, (byPackage.get(a.packageId) || 0) + 1);
  }
  const enrollment = [...byPackage.entries()].map(([id, count]) => ({
    id,
    name: packageById(id)?.name ?? id,
    athletes: count,
  }));

  return { athletes, membership, enrollment };
}

/** week -> block fill by day, the week's reserved blocks, and the fill totals. */
export function adminWeek(sessionsThisWeek) {
  // Block fill is PER DAY (Mon..Sat, the seed BLOCK_FILL shape the admin
  // bars render) over GROUP sessions only — the pin's "group type only"
  // meant "exclude specialist slots", not "group by type" (PM integration
  // reconciliation of the routing lane's flagged reading).
  const fillByDay = new Map(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => [d, { booked: 0, capacity: 0 }]));
  let totalBooked = 0;
  let totalCapacity = 0;
  // 2026-10-02: the week's handicap-reserved blocks, named beside the bars
  // (a bar is a whole day, so the tag cannot ride on it) - same read.
  const reservedBlocks = [];
  for (const s of sessionsThisWeek) {
    if (s.status === 'cancelled' || !isGroupBookable(s)) continue;
    const day = fillByDay.get(shortWeekday(s.date));
    if (!day) continue; // Sunday: no group blocks by design
    day.booked += s.booked ?? 0;
    day.capacity += s.capacity ?? 0;
    totalBooked += s.booked ?? 0;
    totalCapacity += s.capacity ?? 0;
    if (handicapLimitOf(s) != null) {
      reservedBlocks.push({
        sessionId: s.id,
        date: s.date,
        day: shortWeekday(s.date),
        time: s.time ?? null,
        maxHandicap: handicapLimitOf(s),
        booked: s.booked ?? 0,
        capacity: s.capacity ?? 0,
      });
    }
  }
  reservedBlocks.sort((a, b) => a.date.localeCompare(b.date) || (parseTimeToMinutes(a.time) ?? 0) - (parseTimeToMinutes(b.time) ?? 0));
  const blockFill = [...fillByDay.entries()].map(([day, v]) => ({
    day,
    pct: v.capacity ? Math.round((v.booked / v.capacity) * 100) : 0,
  }));
  return { blockFill, reservedBlocks, totalBooked, totalCapacity };
}

/** The enrolled and fill stats: both groups, as the one-shot payload built them. */
export function adminMetrics(roster, week) {
  return {
    enrolled: roster.athletes.length,
    fill: week.totalCapacity ? `${Math.round((week.totalBooked / week.totalCapacity) * 100)}%` : '—',
    fillLabel: 'average block fill this week',
    enrolledLabel: 'enrolled athletes',
  };
}

/** A group with nothing in flight: the seed path's status. */
export const SETTLED = Object.freeze({ loading: false, error: null });

/** One card's state from the groups it reads: loading while any is, the first error. */
export const groupStatus = (...groups) => ({
  loading: groups.some((g) => g.loading),
  error: groups.find((g) => g.error)?.error ?? null,
});
