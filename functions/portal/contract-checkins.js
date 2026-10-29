/**
 * Yannick's Monday check-in reminder (spec 4.4, 2026-10-28).
 *
 * CHANGE ONE, CHANGE BOTH: the 14-day rule below is the client's
 * frontend/src/portal/data/contractBoard.js (overdueCheckins), duplicated
 * because Cloud Functions are CommonJS. contract-checkins.test.js reads that
 * file to keep the two in step. Who is on the contract: every athlete of a
 * household that is not test: true and whose membership allows booking, the
 * tokenExpiryReminders gate. The email goes straight to the users doc with
 * role 'mental' (email.sendEmail, the scholarship.js pattern); no ledger,
 * so a retried run on the same Monday sends again - accepted for one
 * weekly mail.
 */
'use strict';

const lib = require('./lib');
const email = require('./email');

const OVERDUE_DAYS = 14;
const BOARD_URL = 'https://portal.rypacademy.com/portal/mental/contract';
const DAY_MS = 86400000;

/**
 * @param {*} v An ISO string, a Date or a Timestamp.
 * @return {?string} 'YYYY-MM-DD' or null. A string is taken as written; a
 *     Date or Timestamp becomes its America/Chicago date (lib.chicagoDate,
 *     the client's academyDateISO), so a check-in tapped at 7 PM Chicago
 *     and stored past midnight UTC stays on its own day.
 */
function dateOf(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  }
  const ms = v instanceof Date ? v.getTime() :
      typeof v.toMillis === 'function' ? v.toMillis() : null;
  return ms == null || Number.isNaN(ms) ? null : lib.chicagoDate(new Date(ms));
}

/**
 * @param {string} fromISO
 * @param {string} toISO
 * @return {number} Whole days from `fromISO` to `toISO`.
 */
function daysBetween(fromISO, toISO) {
  const ms = (iso) => Date.UTC(...iso.split('-').map((n, i) =>
    (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((ms(toISO) - ms(fromISO)) / DAY_MS);
}

/**
 * @param {string} athleteId
 * @param {!Array<!Object>} checkins contractCheckins rows.
 * @return {?string} The latest checked-in date (`at`, else `weekStart`).
 */
function lastCheckinFor(athleteId, checkins) {
  let latest = null;
  for (const c of checkins || []) {
    if (c.athleteId !== athleteId || c.checkedIn !== true) continue;
    const d = dateOf(c.at) || dateOf(c.weekStart);
    if (d && (!latest || d > latest)) latest = d;
  }
  return latest;
}

/**
 * @param {{athletes: !Array<!Object>, households: !Object,
 *     checkins: !Array<!Object>, today: string, enabledAt: ?string}} args
 * @return {!Array<{athleteId: string, name: string, age: ?number,
 *     lastCheckin: ?string, daysSince: number}>} Oldest first.
 */
function overdueAthletes(args) {
  const {athletes, households, checkins, today, enabledAt} = args;
  const since0 = dateOf(enabledAt);
  const out = [];
  for (const a of athletes || []) {
    const household = (households || {})[a.householdId] || null;
    // Who is on the contract: the client's onContract (contractBoard.js).
    if (household && household.test === true) continue;
    if (!lib.membershipAllowsBooking(household, a)) continue;
    const lastCheckin = lastCheckinFor(a.id, checkins);
    const created = dateOf(a.createdAt);
    const since = lastCheckin ||
        (since0 && created ? (since0 > created ? since0 : created) :
          since0 || created);
    if (!since) continue;
    const daysSince = daysBetween(since, today);
    if (daysSince <= OVERDUE_DAYS) continue;
    out.push({athleteId: a.id, name: a.name || a.id,
      age: lib.ageAt(a.dob, today), lastCheckin, daysSince});
  }
  return out.sort((x, y) => y.daysSince - x.daysSince ||
      String(x.name).localeCompare(String(y.name)));
}

/**
 * @param {!Array<!Object>} overdue overdueAthletes rows.
 * @param {string} today
 * @return {{subject: string, text: string}}
 */
function reminderEmail(overdue, today) {
  const n = overdue.length;
  const lines = [`Due for a check-in as of ${today}:`, ''];
  for (const r of overdue) {
    const last = r.lastCheckin ? `last check-in ${r.lastCheckin}` :
        'never checked in';
    lines.push(`- ${r.name} (age ${r.age == null ? '?' : r.age}): ${last}, ` +
        `${r.daysSince} days`);
  }
  lines.push('', `Open the board: ${BOARD_URL}`);
  const subject = `Contract check-ins due · ${n} athlete${n === 1 ? '' : 's'}`;
  return {subject, text: lines.join('\n')};
}

/**
 * @param {{db: !Object, sendEmail: (Function|undefined), today: string}} args
 * @return {!Promise<{status: string, overdue: number, to: ?string}>}
 */
async function remindMentalCheckins(args) {
  const {db, today} = args;
  const send = args.sendEmail || email.sendEmail;
  const cfg = await db.collection('config').doc('contract').get();
  const config = cfg.exists ? cfg.data() : null;
  if (!config || config.enabled !== true) {
    return {status: 'off', overdue: 0, to: null};
  }
  const [aSnap, hSnap, cSnap, uSnap] = await Promise.all([
    db.collection('athletes').get(),
    db.collection('households').get(),
    db.collection('contractCheckins').get(),
    db.collection('users').where('role', '==', 'mental').get(),
  ]);
  const households = {};
  for (const h of lib.rows(hSnap)) households[h.id] = h;
  const overdue = overdueAthletes({athletes: lib.rows(aSnap), households,
    checkins: lib.rows(cSnap), today, enabledAt: config.enabledAt || null});
  const user = lib.rows(uSnap).find((u) => typeof u.email === 'string' &&
      u.email.length > 0) || null;
  const to = user ? user.email : null;
  if (overdue.length === 0) return {status: 'none', overdue: 0, to};
  if (!to) return {status: 'skipped', overdue: overdue.length, to: null};
  const mail = reminderEmail(overdue, today);
  const sent = await send({to, subject: mail.subject, text: mail.text,
    kind: 'mental-checkins'});
  return {status: (sent && sent.status) || 'failed', overdue: overdue.length,
    to};
}

module.exports = {OVERDUE_DAYS, dateOf, lastCheckinFor, overdueAthletes,
  reminderEmail, remindMentalCheckins};
