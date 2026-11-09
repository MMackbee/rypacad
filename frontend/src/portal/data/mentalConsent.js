/**
 * Mental performance consent (spec 3-7): the version, the status rule, the
 * dates, the family's rows and lines, Yannick's summary and the staff
 * tracker. PURE: no Firestore and no clock of its own; the hooks derive
 * every date from one `now`.
 *
 * CHANGE ONE, CHANGE BOTH with functions/portal/mental-consent-status.js;
 * the shared case table (functions/test/fixtures/consent-status-cases.json)
 * holds them together. 18, 16 and 13 are counted on the UTC date
 * (firestore.rules adultOn); booking dates, "today" and every date shown to
 * a person are America/Chicago dates.
 *
 * No form text here: this module ships in the main bundle. The text lives in
 * ./mentalConsentTerms.js, which only the lazy consent screens import. A
 * record signed under any other version still counts as signed (spec 7).
 */
import { ageOnDate, isAdultOnDate } from './signup';
import { academyClock } from './calendar';

export const CONSENT_VERSION = '2026-10-30';

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
const hasDob = (athlete) => typeof athlete?.dob === 'string' && DOB_RE.test(athlete.dob);
const ageOf = (athlete, utcToday) => (hasDob(athlete) ? ageOnDate(athlete.dob, utcToday) : null);
const text = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);
const firstWord = (s) => (typeof s === 'string' ? s.trim().split(/\s+/)[0] || '' : '');

/* ---------------------------------------------------------------- status -- */

/** 'yyyy-MM-dd' of `now` in UTC - the date ages are counted on, as the rules count them. */
export function utcTodayISO(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Signed under section 11: at 18+, or re-signed at 18 over a minor-era record. */
export function isAdultRecord(record) {
  return Boolean(record) && (record.adult === true || record.adultSignature != null);
}

/** 'no-dob' | 'unsigned' | 'signed' | 'needs-adult'. A paper record counts. */
export function consentStatusFor(athlete, record, utcTodayISO) {
  if (!hasDob(athlete)) return 'no-dob';
  if (!record) return 'unsigned';
  if (isAdultRecord(record)) return 'signed';
  if (isAdultOnDate(athlete.dob, utcTodayISO)) return 'needs-adult';
  return 'signed';
}

/** Yannick may record: signed, and the athlete's own answer at 18+, else the parent's and the athlete's both yes. */
export function recordingAllowed(athlete, record, utcToday) {
  if (consentStatusFor(athlete, record, utcToday) !== 'signed') return false;
  const parent = record.choices?.audio === true;
  return isAdultRecord(record) ? parent : parent && record.assent?.audio === true;
}

/** The driving question is asked of a minor's parent once the athlete is 16. */
export function drivingAsked(athlete, utcToday) {
  const age = ageOf(athlete, utcToday);
  return age != null && age >= 16 && age < 18;
}

/* ----------------------------------------------------------------- dates -- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A Firestore Timestamp, a Date, an ISO string or ms -> ms; anything else null. */
export function msOf(stamp) {
  if (stamp == null) return null;
  if (typeof stamp.toMillis === 'function') return stamp.toMillis();
  const ms = stamp instanceof Date ? stamp.getTime()
    : typeof stamp === 'number' ? stamp
      : typeof stamp === 'string' ? Date.parse(stamp)
        : typeof stamp.seconds === 'number' ? stamp.seconds * 1000 + Math.floor((stamp.nanoseconds || 0) / 1e6) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** 'yyyy-MM-dd' -> 'Oct 29' (a calendar date: no time zone involved). */
export function monthDayLabel(iso) {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

/** A 1:1's date as the family reads it: 'yyyy-MM-dd' -> 'Thu, Nov 12'. */
export function sessionDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${monthDayLabel(iso)}`;
}

/** 'Oct 30': the America/Chicago date of a stamp (a 'yyyy-MM-dd' string is already a date). */
export function shortDate(stamp) {
  if (typeof stamp === 'string' && DOB_RE.test(stamp)) return monthDayLabel(stamp);
  const ms = msOf(stamp);
  return ms == null ? null : monthDayLabel(academyClock(new Date(ms)).date);
}

/** The date on a paper form as a stamp: midnight of that date in America/Chicago. */
export function paperDateToStamp(iso) {
  if (!DOB_RE.test(iso || '')) return null;
  const [y, m, d] = iso.split('-').map(Number);
  // Chicago is UTC-5 (CDT) or UTC-6 (CST); midnight sits before any 2 AM switch.
  for (const offset of [5, 6]) {
    const at = new Date(Date.UTC(y, m - 1, d, offset));
    const clock = academyClock(at);
    if (clock.date === iso && clock.minutes === 0) return at;
  }
  return null;
}

/* -------------------------------------------------------------- the flow -- */

/** Who signs (plan Global Constraints): 'no-dob'|'minor'|'minor-login'|'adult'|'adult-handover'|'adult-elsewhere'. */
export function branchFor({ viewer, athlete, claimedLogin, utcTodayISO: day }) {
  if (!hasDob(athlete)) return 'no-dob';
  const adult = isAdultOnDate(athlete.dob, day);
  if (viewer === 'athlete') return adult ? 'adult' : 'minor-login';
  if (!adult) return 'minor';
  return claimedLogin ? 'adult-elsewhere' : 'adult-handover';
}

/** Every fact the flow opens with, from the one UTC date of `now` (Review Focus 5). */
export function flowFacts({ viewer, athlete, record, claimedLogin, now = new Date() }) {
  const utcToday = utcTodayISO(now);
  const age = ageOf(athlete, utcToday);
  return {
    utcToday,
    status: consentStatusFor(athlete, record, utcToday),
    branch: branchFor({ viewer, athlete, claimedLogin, utcTodayISO: utcToday }),
    drivingAsked: drivingAsked(athlete, utcToday),
    under13: age != null && age < 13,
  };
}

/** The signing account's name and email for step 1: the users doc, else the auth user, else the household guardian. */
export function signerFor({ userDoc, authUser, household }) {
  return {
    name: text(userDoc?.displayName) ?? text(authUser?.displayName) ?? text(household?.guardian?.name),
    email: text(userDoc?.email) ?? text(authUser?.email) ?? text(household?.guardian?.email),
  };
}

/* ----------------------------------------------------- the family's rows -- */

const keyed = (list) => (Array.isArray(list) ? Object.fromEntries(list.filter(Boolean).map((r) => [r.athleteId ?? r.id, r])) : list || {});
const DRAFT_ROW = { fresh: 'fresh', 'version-changed': 'fresh', expired: 'expired' };

/**
 * One row per athlete the viewer sees, sorted by name. `records` is a list
 * (id or athleteId) or an id map; `claimed` and `draftStates` are id maps
 * (draftState values from data/consentFlow.js). A record beats a draft.
 */
export function familyRows({ viewer, athletes, records, bookings, claimed, draftStates, utcToday, today }) {
  const recs = keyed(records);
  return (athletes || []).map((a) => {
    const record = recs[a.id] || null;
    const status = consentStatusFor(a, record, utcToday);
    const next = (bookings || [])
      .filter((b) => b.athleteId === a.id && b.type === 'mental' && b.status === 'confirmed' && typeof b.date === 'string' && b.date >= today)
      .sort((x, y) => x.date.localeCompare(y.date))[0];
    return {
      athleteId: a.id, name: a.name ?? '', firstName: firstWord(a.name), viewer, status, record,
      adultToday: hasDob(a) && isAdultOnDate(a.dob, utcToday),
      claimedLogin: Boolean(claimed?.[a.id]),
      drivingUnanswered: status === 'signed' && !isAdultRecord(record) && record.choices?.driving == null && drivingAsked(a, utcToday),
      nextMental: next ? { date: next.date, attendee: next.attendee ?? 'athlete' } : null,
      draft: record ? null : DRAFT_ROW[draftStates?.[a.id]] ?? null,
    };
  }).sort((x, y) => x.name.localeCompare(y.name));
}

const FLOW = '/portal/consent/mental';
const LABEL = { sign: 'Sign now', continue: 'Continue', restart: 'Start again', change: 'Change choices', withdraw: 'Stop recording' };
const SIGNABLE = new Set(['sign', 'continue', 'restart']);
function hrefFor(action, athleteId) {
  if (action === 'change') return `${FLOW}/${athleteId}?change=1`;
  if (action === 'withdraw') return `${FLOW}?withdraw=1`;
  return action ? `${FLOW}/${athleteId}` : null;
}

/** When, by whom and whether on paper, as the lines show it: the 18+ re-sign when there is one. */
function signedParts(record) {
  const s = record?.adultSignature;
  const { date, by, paper } = s
    ? { date: shortDate(s.signedAt), by: firstWord(s.name), paper: s.method === 'paper' }
    : { date: shortDate(record?.signedAt), by: firstWord(record?.signer?.name), paper: record?.method === 'paper' };
  return { by, signed: `Signed ${paper ? 'on paper ' : ''}${date}` };
}

/** The line's text and action; `reason` is what a booking row says instead of "Sign". */
function lineFor(row) {
  const first = row.firstName;
  const own = `${first} signs this on their own login`;
  const { signed, by } = signedParts(row.record);
  if (row.viewer === 'athlete') {
    if (row.status === 'no-dob') return { text: 'Add your date of birth first', action: null };
    if (row.adultToday) {
      if (row.status === 'signed') return { text: signed, action: 'change' };
      return { text: row.status === 'needs-adult' ? 'Needs your 18+ signature' : 'Not signed', action: 'sign' };
    }
    if (row.status !== 'signed') return { text: 'Your parent signs this', action: null };
    const rec = row.record;
    const ownYes = rec.assent?.audio === true;
    const withdraw = !isAdultRecord(rec) && ownYes;
    // The athlete's own yes still stands (and can be withdrawn) when the parent said no; say whose no it is.
    const recording = rec.choices?.audio === true && ownYes ? 'yes' : withdraw ? 'no (your parent said no)' : 'no';
    return { text: `${signed} · Your parent manages this · Recording: ${recording}`, action: withdraw ? 'withdraw' : null };
  }
  if (row.status === 'no-dob') return { text: `Add ${first}'s date of birth first`, action: null };
  if (row.status === 'signed') {
    if (isAdultRecord(row.record) && row.claimedLogin) return { text: `${signed} · ${first} manages this`, action: null };
    return { text: `${signed} by ${by}${row.drivingUnanswered ? ' · Driving permission not answered' : ''}`, action: 'change' };
  }
  if (row.status === 'needs-adult') {
    const needs = `Needs ${first}'s 18+ signature`;
    return row.claimedLogin ? { text: `${needs} · ${own}`, action: null, reason: own } : { text: needs, action: 'sign' };
  }
  if (row.adultToday && row.claimedLogin) return { text: `Not signed · ${own}`, action: null, reason: own };
  if (row.draft === 'fresh') return { text: `Waiting for ${first}'s agreement`, action: 'continue' };
  if (row.draft === 'expired') return { text: 'Draft expired', action: 'restart' };
  return { text: 'Not signed', action: 'sign' };
}

/** "Mental performance consent · {text}" and its button (spec 4.1). */
export function familyLine(row) {
  const { text: line, action } = lineFor(row);
  return { text: line, action, label: LABEL[action] ?? null, href: hrefFor(action, row.athleteId) };
}

/** The family home's card: the athlete the viewer can sign for whose confirmed 1:1 comes soonest (ties by name); else null. */
export function homeCardFor(rows) {
  const last = '9999-12-31';
  const soonest = [...(rows || [])].sort((a, b) => (a?.nextMental?.date ?? last).localeCompare(b?.nextMental?.date ?? last));
  for (const row of soonest) {
    if (!row?.nextMental?.date || row.status === 'signed') continue;
    const { action } = lineFor(row);
    if (SIGNABLE.has(action)) {
      return { athleteId: row.athleteId, text: `Sign Yannick's consent for ${row.firstName} before the session on ${sessionDateLabel(row.nextMental.date)}`, href: hrefFor(action, row.athleteId) };
    }
  }
  return null;
}

/** The line under a mental booking whose athlete is not signed; null once signed. */
export function bookingLineFor(row) {
  if (!row || row.status === 'signed') return null;
  const line = lineFor(row);
  if (SIGNABLE.has(line.action)) return { text: 'Consent needed · Sign', href: hrefFor(line.action, row.athleteId) };
  return { text: `Consent needed · ${line.reason ?? line.text}`, href: null };
}

/** Not signed (any reason) with a 1:1 ahead: Yannick's "Needs consent before a session". */
export function needsConsentBeforeSession(row) {
  return Boolean(row) && row.status !== 'signed' && Boolean(row.nextMental);
}

/* -------------------------------------------------- Yannick, ops, owner -- */

export const STAFF_STATUS_LABEL = { signed: 'Signed', unsigned: 'Not signed', 'needs-adult': 'Needs 18+', 'no-dob': 'No date of birth' };
export const LOCATION_SHORT = { A: 'Academy quiet area', B: 'Eden Prairie', C: 'Online', any: 'Session by session' };

function recordingLine(status, record, first) {
  if (status === 'needs-adult') return 'Recording: needs 18+ signature';
  if (status !== 'signed') return 'Recording: no';
  const parent = record.choices?.audio === true;
  if (isAdultRecord(record)) return `Recording: ${parent ? 'yes' : 'no'}`;
  const a = record.assent;
  if (a?.withdrawnBy && a.audio !== true) return `Recording: no (${first} withdrew ${shortDate(a.at)})`;
  const kid = a?.audio === true;
  if (parent && kid) return 'Recording: yes (both)';
  if (!parent && !kid) return `Recording: no (parent and ${first})`;
  return `Recording: no (${parent ? first : 'parent'})`;
}

/** A paper record was typed in when its choices were first stamped (the older of the first history entry's and the current). */
function recordedAt(record) {
  const times = [record.history?.[0]?.choices?.updatedAt, record.choices?.updatedAt].map(msOf).filter((t) => t != null);
  return times.length ? Math.min(...times) : null;
}

/**
 * A blank contact: "same as parent" is a minor's portal answer. The paper form has no such box, so a blank
 * typed in from paper (the choices still the recorder's own) is "not transcribed", as is an adult's.
 */
function contactPart(c, adultRec, fromPaper) {
  const ec = c.emergencyContact;
  if (!ec?.name) return `Emergency contact: ${adultRec || fromPaper ? 'not transcribed' : 'same as parent'}`;
  return `Emergency contact: ${ec.name}${ec.phone ? `, ${ec.phone}` : ''}${ec.relationship ? ` (${ec.relationship})` : ''}`;
}

function summaryOf({ athlete, record, utcToday, first, recording }) {
  const adultRec = isAdultRecord(record);
  const c = record.choices || {};
  const s = record.adultSignature;
  const parts = [];
  if (s) {
    parts.push(s.method === 'paper'
      ? `Re-signed 18+ on paper ${shortDate(s.signedAt)} by ${s.name} · recorded by the academy`
      : `Re-signed 18+ ${shortDate(s.signedAt)} by ${s.name}`);
  } else {
    const who = `by ${record.signer?.name} (${record.signer?.role === 'athlete' ? 'athlete, 18+' : 'parent'})`;
    parts.push(record.method === 'paper'
      ? `Signed on paper ${shortDate(record.signedAt)} ${who} · recorded ${shortDate(recordedAt(record))}`
      : `Signed ${shortDate(record.signedAt)} ${who}`);
  }
  if (!adultRec && record.assent) parts.push(`${first} agreed`);
  parts.push(recording);
  parts.push(`Location: ${c.location ? LOCATION_SHORT[c.location] ?? c.location : 'not transcribed'}`);
  if (typeof c.driving === 'boolean') parts.push(`Driving: ${c.driving ? 'yes' : 'no'}`);
  else if (!adultRec && drivingAsked(athlete, utcToday)) parts.push('Driving: not answered');
  if (adultRec) parts.push(`Parent sessions: ${c.parentSessions ? `yes${c.parentName ? ` (${c.parentName})` : ''}` : 'no'}`);
  parts.push(contactPart(c, adultRec, record.method === 'paper' && (c.updatedBy == null || c.updatedBy === record.signedBy)));
  parts.push(`Version ${s?.version ?? record.version}`);
  if (record.countersign) parts.push(`Countersigned ${shortDate(record.countersign.at)}`);
  return parts.join(' · ');
}

/**
 * Yannick's Consent card (spec 5). `audience` is who a reminder reaches as
 * far as Yannick's role can tell: the athlete when 18+ with a login email,
 * else the household (the server's claimed-login test is the authority).
 */
export function staffConsentSummary({ athlete, record, utcToday }) {
  const status = consentStatusFor(athlete, record, utcToday);
  const first = firstWord(athlete?.name);
  const signed = status === 'signed';
  const recording = recordingLine(status, record, first);
  return {
    status,
    label: signed && record.countersign ? 'Complete' : STAFF_STATUS_LABEL[status],
    summary: record ? summaryOf({ athlete, record, utcToday, first, recording }) : null,
    recording,
    canCountersign: signed && !record.countersign,
    canRemind: status === 'unsigned' || status === 'needs-adult',
    canWithdraw: signed && !isAdultRecord(record) && record.assent?.audio === true,
    audience: hasDob(athlete) && isAdultOnDate(athlete.dob, utcToday) && text(athlete.loginEmail) ? 'athlete' : 'household',
  };
}

/**
 * The ops/owner tracker: every athlete with a non-cancelled mental booking,
 * past or future. Not signed with a 1:1 ahead first (by date), then the
 * other not signed, then signed (each by name).
 */
export function trackerRows({ athletes, households, records, bookings, today, utcToday }) {
  const recs = keyed(records);
  const homes = Array.isArray(households) ? Object.fromEntries(households.map((h) => [h.id, h])) : households || {};
  const dates = {};
  for (const b of bookings || []) {
    if (b?.type !== 'mental' || b.status === 'cancelled' || !b.athleteId || typeof b.date !== 'string') continue;
    (dates[b.athleteId] = dates[b.athleteId] || []).push(b.date);
  }
  const rank = (r) => (r.status === 'signed' ? 2 : r.nextMental ? 0 : 1);
  return (athletes || []).filter((a) => dates[a.id]).map((a) => {
    const ds = dates[a.id].sort();
    const status = consentStatusFor(a, recs[a.id] || null, utcToday);
    return {
      athleteId: a.id, name: a.name ?? '', familyName: homes[a.householdId]?.name ?? null,
      nextMental: ds.find((d) => d >= today) ?? null, lastMental: ds.filter((d) => d < today).pop() ?? null, status, label: STAFF_STATUS_LABEL[status],
    };
  }).sort((x, y) => rank(x) - rank(y) || (rank(x) === 0 ? x.nextMental.localeCompare(y.nextMental) : 0) || x.name.localeCompare(y.name));
}
