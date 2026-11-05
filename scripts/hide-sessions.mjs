#!/usr/bin/env node
/**
 * Hide empty sessions from families for now, or bring them back (owner
 * 2026-11-05: the empty Monday and Wednesday 6 PM training blocks should be
 * "sort of hidden for now; once enrollment and token usage % goes up we
 * will need those sessions back" - deleting the calendar events was
 * rejected). A hidden session stays in Firestore and on the calendar; the
 * app leaves it out of every list a family books from, and firestore.rules
 * refuses a booking, a re-book and a waitlist join on it (a cancel still
 * lands). --show brings it back exactly as it was. The athlete Season
 * calendar (frontend screens/SeasonSchedule.js) renders the Google Calendar
 * itself and still shows the event; only the Firestore-driven booking lists
 * hide it. scripts/comp-booking.mjs refuses a hidden session.
 *
 *   node scripts/hide-sessions.mjs --prod --hide --days Mon,Wed --time "6:00 PM" --dry-run
 *   node scripts/hide-sessions.mjs --prod --hide --days Mon,Wed --time "6:00 PM" \
 *     --to 2026-12-31 --ids 2026-11-11-7,2026-11-25-7 --dry-run
 *   node scripts/hide-sessions.mjs --prod --show --days Mon,Wed --time "6:00 PM" --dry-run
 *   (the same with --yes writes it; the owner runs that one)
 *
 * Options: --type training (default) | tournament | phil; --from (default
 * today in Chicago) and --to (default 2027-02-27, the season's last day)
 * bound the dates; --ids narrows the match to those sessions, and refuses
 * the whole run if any of them is not one the slot matches.
 *
 * What it writes: sessions/{id}.hidden (true), hiddenBy ('hide-sessions')
 * and hiddenAt (server time) for --hide; --show deletes all three (absent ==
 * not hidden). One masked write per session, each under the updateTime of
 * the read it was checked against, so a family booking that session in the
 * meantime makes that one write fail instead. Nothing else on the session
 * changes. --hide refuses, and writes nothing for, any session with a seat
 * counted (booked > 0), any live booking doc or any waitlist entry; it says
 * which. Each written session is read back.
 *
 * The calendar sync (scripts/sync-calendar-sessions.mjs) never writes these
 * fields and its masked updates keep them. Rules first: firestore.rules
 * must carry the hidden clauses before a hidden session can be trusted to
 * take no booking.
 * Production auth is scripts/lib/prod-auth.mjs; the emulator without --prod.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTarget, queryCollection, eqFilter, cmpFilter, andFilter, getDoc, docName, fsFields, fsDecode, commit, PROJECT_ID } from './lib/firestore-rest.mjs';

const USAGE = 'Usage: node scripts/hide-sessions.mjs [--prod] (--hide | --show) --days Mon,Wed --time "6:00 PM" [--type training] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--ids id1,id2] (--dry-run | --yes)';
const SEASON_END = '2027-02-27';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Yannick's sessions come from Calendly, one family each; nothing to hide there.
const TYPES = ['training', 'tournament', 'phil'];
const HIDDEN_BY = 'hide-sessions';
const ID_RE = /^[A-Za-z0-9_-]+$/;

/** True for a real calendar date written YYYY-MM-DD. */
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** '6:00 pm' / '06:00PM' / '6:00 p.m.' -> '6:00 PM' (the session docs' own shape); null when it is not a clock time. */
export function normalTime(t) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*$/i.exec(t || '');
  return m ? `${Number(m[1])}:${m[2]} ${m[3].toUpperCase()}M` : null;
}

/** 0 (Sunday) .. 6, from the date itself, so the machine's time zone cannot move it. */
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

/**
 * Pure (pass `today`, Chicago 'YYYY-MM-DD').
 * @return {{prod, mode, days, dayNames, time, type, from, to, ids, dryRun, yes} | {error}}
 */
export function parseArgs(argv, { today = chicagoToday() } = {}) {
  const out = { prod: false, mode: null, days: null, time: null, type: null, from: null, to: null, ids: null, dryRun: false, yes: false };
  const raw = {};
  let hide = false;
  let show = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prod') out.prod = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (a === '--hide') hide = true;
    else if (a === '--show') show = true;
    else if (['--days', '--time', '--type', '--from', '--to', '--ids'].includes(a)) {
      if (a in raw) return { error: `${a} may be given only once.` };
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) return { error: `${a} needs a value.` };
      raw[a] = v;
    } else return { error: `Unknown argument: ${a}` };
  }
  if (hide === show) return { error: 'Pass exactly one of --hide or --show.' };
  out.mode = hide ? 'hide' : 'show';
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };

  const names = (raw['--days'] ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  const days = names.map((d) => DAY_NAMES.findIndex((n) => n.toLowerCase() === d.toLowerCase()));
  if (!names.length || days.includes(-1)) return { error: `Pass --days as weekdays like Mon,Wed (${DAY_NAMES.join(', ')}).` };
  out.days = [...new Set(days)].sort();
  out.dayNames = out.days.map((d) => DAY_NAMES[d]);
  out.time = normalTime(raw['--time']);
  if (!out.time) return { error: 'Pass --time like "6:00 PM".' };
  out.type = raw['--type'] ?? 'training';
  if (!TYPES.includes(out.type)) return { error: `--type is one of ${TYPES.join(', ')}.` };
  out.from = raw['--from'] ?? today;
  out.to = raw['--to'] ?? SEASON_END;
  if (!validDate(out.from) || !validDate(out.to)) return { error: 'Pass --from and --to as real dates written YYYY-MM-DD.' };
  if (out.from > out.to) return { error: `--from (${out.from}) is after --to (${out.to}).` };
  if (raw['--ids'] !== undefined) {
    const ids = raw['--ids'].split(',').map((id) => id.trim()).filter(Boolean);
    if (!ids.length || !ids.every((id) => ID_RE.test(id))) return { error: 'Pass --ids as session ids separated by commas, like 2026-11-11-7,2026-11-25-7.' };
    out.ids = [...new Set(ids)];
  }
  return out;
}

const minutesOf = (time) => {
  const m = /^(\d{1,2}):(\d{2}) ([AP])M$/.exec(normalTime(time) || '');
  return m ? ((Number(m[1]) % 12) + (m[3] === 'P' ? 12 : 0)) * 60 + Number(m[2]) : 0;
};

/** Pure: the sessions the slot names (weekday, time, type, the window, and --ids when given), by date then time. */
export function matchSessions(sessions, args) {
  return sessions
    .filter((s) => s.date >= args.from && s.date <= args.to && args.days.includes(weekdayOf(s.date))
      && normalTime(s.time) === args.time && s.type === args.type && (!args.ids || args.ids.includes(s.id)))
    .sort((a, b) => a.date.localeCompare(b.date) || minutesOf(a.time) - minutesOf(b.time) || a.id.localeCompare(b.id));
}

/** Pure: the --ids the slot did not match ([] without --ids). */
export function missingIds(matched, ids) {
  const found = new Set(matched.map((s) => s.id));
  return (ids || []).filter((id) => !found.has(id));
}

/**
 * Pure: what happens to one session. `liveBookings` are its booking docs not
 * cancelled; `waitlist` its waitlist entries (both read for --hide only).
 * @return {{action: 'hide'|'show'|'skip'|'refuse', note: string}}
 */
export function decide({ mode, session, liveBookings, waitlist }) {
  const hidden = session.hidden === true;
  if (mode === 'show') return hidden ? { action: 'show', note: 'show' } : { action: 'skip', note: 'not hidden' };
  if (hidden) return { action: 'skip', note: 'already hidden' };
  const booked = Number(session.booked ?? 0);
  if (booked > 0) return { action: 'refuse', note: `NOT hidden: ${booked} booked` };
  if (liveBookings.length) {
    return { action: 'refuse', note: `NOT hidden: ${liveBookings.length} live booking(s) (${liveBookings.map((b) => b.id).join(', ')}) although booked reads 0` };
  }
  if (waitlist.length) return { action: 'refuse', note: `NOT hidden: ${waitlist.length} on the waitlist` };
  return { action: 'hide', note: 'hide' };
}

/** Pure: the one masked write for a session, under the updateTime of its read. */
export function buildWrite({ id, mode, updateTime }) {
  if (!updateTime) throw new Error(`No updateTime for sessions/${id}; nothing written.`);
  const name = docName('sessions', id);
  if (mode === 'show') {
    // In the mask with no value: Firestore deletes the field (absent == not hidden).
    return { update: { name, fields: {} }, updateMask: { fieldPaths: ['hidden', 'hiddenAt', 'hiddenBy'] }, currentDocument: { updateTime } };
  }
  return {
    update: { name, fields: fsFields({ hidden: true, hiddenBy: HIDDEN_BY }) },
    updateMask: { fieldPaths: ['hidden', 'hiddenBy'] },
    updateTransforms: [{ fieldPath: 'hiddenAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { updateTime },
  };
}

/**
 * Pure: the line for a write that did not land. Only Firestore's own
 * FAILED_PRECONDITION (the updateTime guard) means the session changed since
 * it was read; anything else - an expired login, a network error - is shown
 * as itself, on one line.
 */
export function failureNote(id, message) {
  const text = String(message ?? '').replace(/\s+/g, ' ').trim();
  if (/FAILED_PRECONDITION/.test(text)) return `${id}: not written; it changed since it was read - run again, dry run first`;
  return `${id}: not written (${text.slice(0, 200) || 'no error text'}) - run again, dry run first`;
}

/** One read of a doc and its updateTime together, so the precondition guards the values checked. */
async function readWithTime(target, collection, id) {
  const res = await fetch(`${target.base}/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`, { headers: { Authorization: target.auth } });
  if (res.status === 404) return { data: null, updateTime: null };
  if (!res.ok) throw new Error(`Read ${collection}/${id} failed (${res.status})`);
  const body = await res.json();
  return { data: { id, ...fsDecode(body.fields || {}) }, updateTime: body.updateTime };
}

const line = (s, note) => `  ${s.id.padEnd(14)} ${DAY_NAMES[weekdayOf(s.date)]} ${s.date}  ${s.time}  ${s.type}  booked ${s.booked ?? 0}/${s.capacity ?? '?'}${s.status === 'cancelled' ? '  (cancelled)' : ''}  -> ${note}`;

export async function main(argv = process.argv.slice(2), { today = chicagoToday() } = {}) {
  const args = parseArgs(argv, { today });
  if (args.error) { console.error(`${args.error}\n${USAGE}`); return 1; }
  const target = await resolveTarget({ prod: args.prod });
  const slot = `${args.dayNames.join('/')} ${args.time} ${args.type}, ${args.from} to ${args.to}`;
  console.log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);
  console.log(`${args.mode === 'hide' ? 'Hide' : 'Show'}: ${slot}${args.ids ? `, only ${args.ids.join(', ')}` : ''}`);

  const inWindow = await queryCollection(target, { from: [{ collectionId: 'sessions' }],
    where: andFilter(cmpFilter('date', 'GREATER_THAN_OR_EQUAL', args.from), cmpFilter('date', 'LESS_THAN_OR_EQUAL', args.to)) });
  const matched = matchSessions(inWindow, args);
  const missing = missingIds(matched, args.ids);
  if (missing.length) { console.error(`Not a ${slot} session: ${missing.join(', ')}. Nothing written; check the ids.`); return 1; }
  if (!matched.length) { console.error(`No session matches ${slot}. Nothing written; check --days, --time and --type.`); return 1; }

  const rows = [];
  for (const m of matched) {
    const { data, updateTime } = await readWithTime(target, 'sessions', m.id);
    if (!data) { rows.push({ session: m, updateTime: null, action: 'skip', note: 'gone since the list was read' }); continue; }
    let liveBookings = [];
    let waitlist = [];
    if (args.mode === 'hide') {
      liveBookings = (await queryCollection(target, { from: [{ collectionId: 'bookings' }], where: eqFilter('sessionId', m.id) })).filter((b) => b.status !== 'cancelled');
      waitlist = await queryCollection(target, { from: [{ collectionId: 'waitlist' }], where: eqFilter('sessionId', m.id) });
    }
    rows.push({ session: data, updateTime, ...decide({ mode: args.mode, session: data, liveBookings, waitlist }) });
  }
  for (const r of rows) console.log(line(r.session, r.note));
  const todo = rows.filter((r) => r.action === args.mode);
  const left = rows.filter((r) => r.action === 'refuse');
  const verb = args.mode === 'hide' ? 'hide' : 'show';
  console.log(`${rows.length} session(s) match: ${todo.length} to ${verb}, ${left.length} refused, ${rows.length - todo.length - left.length} already as asked.`);
  if (args.dryRun) { console.log(todo.length ? `Run again with --yes instead of --dry-run to ${verb} them.` : 'Nothing to write.'); return 0; }
  if (!todo.length) { console.log('Nothing to write.'); return 0; }

  const failed = [];
  const written = [];
  for (const r of todo) {
    try {
      await commit(target, [buildWrite({ id: r.session.id, mode: args.mode, updateTime: r.updateTime })]);
      written.push(r.session.id);
    } catch (e) {
      failed.push(failureNote(r.session.id, e.message));
    }
  }
  for (const id of written) {
    const after = await getDoc(target, 'sessions', id);
    const ok = args.mode === 'hide'
      ? after?.hidden === true && after.hiddenBy === HIDDEN_BY && Boolean(after.hiddenAt)
      : Boolean(after) && !['hidden', 'hiddenAt', 'hiddenBy'].some((k) => k in after);
    if (!ok) failed.push(`${id}: written, but it does not read back as ${args.mode === 'hide' ? 'hidden' : 'shown'} - check it`);
  }
  const done = written.length - failed.filter((f) => f.includes('read back')).length;
  console.log(`${args.mode === 'hide' ? 'Hidden' : 'Shown again'}: ${done} of ${todo.length}.${left.length ? ` Refused (left bookable): ${left.map((r) => r.session.id).join(', ')}.` : ''}`);
  if (failed.length) { console.error(failed.map((f) => `  ${f}`).join('\n')); return 1; }
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
