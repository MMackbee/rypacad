#!/usr/bin/env node
/**
 * Book a complimentary session for an athlete who has not paid yet (owner,
 * 2026-10-20: Madison's family starts paying Dec 1 and the academy gives her
 * two sessions in late November). The portal refuses a booking from an unpaid
 * athlete (firestore.rules athleteBillingOk), and staff have no booking
 * screen, so the owner holds the seat with this, the way the waitlist
 * promotion books one: the booking and the session's seat count in one commit.
 *
 *   node scripts/comp-booking.mjs --prod --email parent@example.com \
 *     --date 2026-11-25 --time "4:00 PM" [--type training] [--athlete Madison] --dry-run
 *   (the same with --yes writes it; the owner runs that one)
 *
 * The family sees it under Reservations and gets the usual booking-confirmed
 * notice, the coach sees the athlete on the roster, and the family can cancel
 * it in the app, which frees the seat. It spends no token: the athlete has no
 * paid period, and paying later starts the next period clean.
 *
 * Refuses unless the athlete is unpaid (billing 'pending'): a paid member
 * books with their own tokens, and an extra one is a re-issued tokenPeriod.
 * Also refuses a cancelled, hidden (scripts/hide-sessions.mjs), full or past
 * session, a handicap-reserved one the athlete does not qualify for, and a
 * seat the athlete already holds.
 * Production auth is scripts/lib/prod-auth.mjs; the emulator without --prod.
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveTarget, queryCollection, eqFilter, getDoc, docName, fsFields, fsDecode, commit, PROJECT_ID } from './lib/firestore-rest.mjs';

const { periodFor } = createRequire(import.meta.url)('../functions/portal/lib.js');
const TYPES = ['training', 'tournament', 'phil', 'mental'];

/** @return {{prod, email, athlete, date, time, type, dryRun, yes} | {error}} */
export function parseArgs(argv) {
  const out = { prod: false, email: null, athlete: null, date: null, time: null, type: 'training', dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prod') out.prod = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (['--email', '--athlete', '--date', '--time', '--type'].includes(a)) out[a.slice(2)] = argv[++i] ?? null;
    else return { error: `Unknown argument: ${a}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  out.email = (out.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return { error: 'Pass --email with the parent\'s portal login.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.date || '')) return { error: 'Pass --date as YYYY-MM-DD.' };
  out.time = normalTime(out.time);
  if (!out.time) return { error: 'Pass --time like "4:00 PM".' };
  if (!TYPES.includes(out.type)) return { error: `--type is one of ${TYPES.join(', ')}.` };
  return out;
}

/** '4:00 pm' / '4:00PM' -> '4:00 PM'; null when it is not a clock time. */
export function normalTime(t) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*$/i.exec(t || '');
  return m ? `${Number(m[1])}:${m[2]} ${m[3].toUpperCase()}M` : null;
}

/** The athlete to book: the one named, else the household's only athlete. */
export function pickAthlete(athletes, name) {
  const pool = name ? athletes.filter((a) => (a.name || '').toLowerCase().startsWith(name.toLowerCase())) : athletes;
  if (pool.length === 1) return { athlete: pool[0] };
  const list = athletes.map((a) => `${a.name} (${a.billing?.status ?? 'no billing'})`).join(', ') || 'none';
  return { error: pool.length ? `More than one athlete; pass --athlete with a first name. Athletes: ${list}` : `No athlete matches. Athletes: ${list}` };
}

/** The session at that date, time and type; an error when not exactly one. */
export function pickSession(sessions, { date, time, type }) {
  const hits = sessions.filter((s) => s.type === type && normalTime(s.time) === time);
  if (hits.length === 1) return { session: hits[0] };
  const list = sessions.map((s) => `${s.time} ${s.type} (${s.booked ?? 0}/${s.capacity ?? '?'})`).join(', ') || 'none';
  return { error: `${hits.length ? 'More than one' : 'No'} ${type} session at ${time} on ${date}. That day: ${list}` };
}

/** @return {?string} Why the comp is refused, or null. */
export function refusal({ athlete, session, existing, today }) {
  if (athlete.billing?.status !== 'pending') return `${athlete.name} is not unpaid (billing ${athlete.billing?.status ?? 'missing'}); a paid member books with their own tokens.`;
  if (session.status === 'cancelled') return 'That session is cancelled.';
  // 2026-11-05: a hidden session is off the schedule for now - no family is
  // offered it and the staff month lists leave it out (frontend
  // data/hiddenSessions.js) - so a comp is not held on one.
  if (session.hidden === true) return 'That session is hidden from families (scripts/hide-sessions.mjs); run hide-sessions --show for it first.';
  if (session.date < today) return 'That session\'s day is over.';
  if (Number(session.booked || 0) >= Number(session.capacity || 0)) return `That session is full (${session.booked ?? 0}/${session.capacity ?? 0}).`;
  if (Number.isInteger(session.maxHandicap) && !(Number.isInteger(athlete.handicap) && athlete.handicap <= session.maxHandicap)) {
    return `That session is reserved for handicaps of ${session.maxHandicap} or better; ${athlete.name} has ${athlete.handicap ?? 'none on file'}.`;
  }
  if (existing && existing.status !== 'cancelled') return `${athlete.name} already holds that seat (booking ${existing.status}).`;
  return null;
}

/**
 * Pure: the commit writes. A new booking is a create (exists:false, so it
 * fires the booking-confirmed notice); a cancelled one on the same seat is
 * re-confirmed in place. The seat count moves under the session's updateTime,
 * so a family booking the last seat meanwhile fails this commit instead.
 */
export function buildWrites({ athlete, household, session, existing, bookingUpdateTime, sessionUpdateTime }) {
  const id = `${athlete.id}_${session.id}`;
  const { periodKey } = periodFor(session.date, household.periodAnchorDay);
  const booking = existing
    ? {
      update: { name: docName('bookings', id), fields: fsFields({ status: 'confirmed', chargedFrom: 'period', comp: true }) },
      updateMask: { fieldPaths: ['status', 'chargedFrom', 'comp'] },
      updateTransforms: [{ fieldPath: 'rebookedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { updateTime: bookingUpdateTime },
    }
    : {
      update: {
        name: docName('bookings', id),
        fields: fsFields({ athleteId: athlete.id, sessionId: session.id, householdId: household.id, date: session.date, type: session.type, status: 'confirmed', periodKey, chargedFrom: 'period', createdBy: 'staff', comp: true }),
      },
      updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false },
    };
  return [booking, {
    update: { name: docName('sessions', session.id), fields: fsFields({ booked: Number(session.booked || 0) + 1 }) },
    updateMask: { fieldPaths: ['booked'] },
    currentDocument: { updateTime: sessionUpdateTime },
  }];
}

/** One read of a doc and its updateTime together, so the precondition guards the values written. */
async function readWithTime(target, collection, id) {
  const res = await fetch(`${target.base}/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${id}`, { headers: { Authorization: target.auth } });
  if (res.status === 404) return { data: null, updateTime: null };
  if (!res.ok) throw new Error(`Read ${collection}/${id} failed (${res.status})`);
  const body = await res.json();
  return { data: { id, ...fsDecode(body.fields || {}) }, updateTime: body.updateTime };
}

const chicagoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());

export async function main(argv = process.argv.slice(2), { today = chicagoToday() } = {}) {
  const args = parseArgs(argv);
  if (args.error) { console.error(args.error); return 1; }
  const target = await resolveTarget({ prod: args.prod });
  console.log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);

  const users = await queryCollection(target, { from: [{ collectionId: 'users' }], where: eqFilter('email', args.email) });
  const householdId = users.find((u) => u.householdId)?.householdId;
  if (!householdId) { console.error(`No portal login with a family for ${args.email}. They sign up at portal.rypacademy.com first (without paying).`); return 1; }
  const household = { id: householdId, ...(await getDoc(target, 'households', householdId)) };
  const athletes = await queryCollection(target, { from: [{ collectionId: 'athletes' }], where: eqFilter('householdId', householdId) });
  const picked = pickAthlete(athletes, args.athlete);
  if (picked.error) { console.error(picked.error); return 1; }
  const { athlete } = picked;
  const sessions = await queryCollection(target, { from: [{ collectionId: 'sessions' }], where: eqFilter('date', args.date) });
  const found = pickSession(sessions, args);
  if (found.error) { console.error(found.error); return 1; }
  const [{ data: session, updateTime: sessionUpdateTime }, { data: existing, updateTime: bookingUpdateTime }] = await Promise.all([
    readWithTime(target, 'sessions', found.session.id),
    readWithTime(target, 'bookings', `${athlete.id}_${found.session.id}`),
  ]);
  console.log(`  family    ${household.name} (${householdId})\n  athlete   ${athlete.name} (${athlete.id}), ${athlete.packageId}, billing ${athlete.billing?.status}\n  session   ${session.date} ${session.time} ${session.type} (${session.id}), ${session.booked ?? 0}/${session.capacity} booked`);
  const why = refusal({ athlete, session, existing, today });
  if (why) { console.error(why); return 1; }
  console.log(`  book      comp seat for ${athlete.name}${existing ? ' (re-confirms the cancelled booking)' : ''}; seats ${session.booked ?? 0} -> ${Number(session.booked || 0) + 1}`);
  if (args.dryRun) { console.log('Would book it. Run again with --yes instead of --dry-run.'); return 0; }

  await commit(target, buildWrites({ athlete, household, session, existing, bookingUpdateTime, sessionUpdateTime }));
  const after = await getDoc(target, 'bookings', `${athlete.id}_${session.id}`);
  if (after?.status !== 'confirmed') { console.error('Written, but the booking does not read back as confirmed. Check it.'); return 1; }
  console.log(`Booked. ${athlete.name} holds a seat at ${session.time} on ${session.date}; the family can see it under Reservations.`);
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
