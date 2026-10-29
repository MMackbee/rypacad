/**
 * The Commitment Contract rule (owner, 2026-10-28; spec 4.3): 20 minutes a
 * day, Monday to Friday; 10 minutes a day while the athlete is under 12. No
 * tier picker. PURE: strings in, strings out; every date is 'YYYY-MM-DD'
 * and the arithmetic runs on Date.UTC so no device timezone can move a day.
 *
 * CHANGE ONE, CHANGE BOTH: the age rule and the 14-day overdue rule are
 * duplicated in functions/portal/contract-checkins.js (CommonJS cannot
 * import this file). contract-checkins.test.js reads this file to check.
 */
export const REQUIRED_MINUTES = 20;
export const UNDER_12_MINUTES = 10;
export const UNDER_AGE = 12;
export const WEEKDAY_COUNT = 5;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validISO = (s) => typeof s === 'string' && ISO.test(s);
const parts = (iso) => iso.split('-').map(Number);
const toUTC = (iso) => { const [y, m, d] = parts(iso); return Date.UTC(y, m - 1, d); };
const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
const DAY_MS = 86400000;

/** Whole years from `dobISO` to `onDateISO`; null without a valid dob. */
export function ageOn(dobISO, onDateISO) {
  if (!validISO(dobISO) || !validISO(onDateISO)) return null;
  const [by, bm, bd] = parts(dobISO);
  const [y, m, d] = parts(onDateISO);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age;
}

/** True while the athlete is under 12 on that date; the 12th birthday itself is not under 12. */
export function isUnder12(dobISO, onDateISO) {
  const age = ageOn(dobISO, onDateISO);
  return age != null && age < UNDER_AGE;
}

/** 10 under 12 (dob present), else 20. The owner's rule; no dob defaults to 20. */
export function contractMinutesFor(athlete, onDateISO) {
  return isUnder12(athlete?.dob ?? null, onDateISO) ? UNDER_12_MINUTES : REQUIRED_MINUTES;
}

export function addDays(dateISO, n) {
  return fromUTC(toUTC(dateISO) + n * DAY_MS);
}

/** Whole days from `fromISO` to `toISO` (negative when `toISO` is earlier). */
export function daysBetween(fromISO, toISO) {
  return Math.round((toUTC(toISO) - toUTC(fromISO)) / DAY_MS);
}

/** The Monday on or before `dateISO`. */
export function weekStartFor(dateISO) {
  const dow = new Date(toUTC(dateISO)).getUTCDay(); // 0 Sun .. 6 Sat
  return addDays(dateISO, dow === 0 ? -6 : 1 - dow);
}

/** Mon..Fri of the week starting `weekStartISO`. */
export function weekdaysOf(weekStartISO) {
  return Array.from({ length: WEEKDAY_COUNT }, (_, i) => addDays(weekStartISO, i));
}

/** Mon..Sun of the week starting `weekStartISO` (the seven dots). */
export function weekDaysOf(weekStartISO) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStartISO, i));
}

/**
 * One week's contract days. `required` is a number or a function of the
 * date (so a birthday mid-week judges each day by its own requirement).
 * Weekend logs are not contract days and are ignored here, exactly as
 * buildContractMonthFromLogs treats Saturday and Sunday.
 */
export function weekSummary({ logsByDate, weekStartISO, required }) {
  const logs = logsByDate || {};
  const need = typeof required === 'function' ? required : () => required;
  const days = weekdaysOf(weekStartISO).map((date) => {
    const minutes = Number(logs[date]) || 0;
    const state = minutes <= 0 ? 'none' : minutes >= need(date) ? 'met' : 'short';
    return { date, state, minutes };
  });
  return { metDays: days.filter((d) => d.state === 'met').length, days };
}
