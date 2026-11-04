#!/usr/bin/env node
/**
 * Calendly bookings with Yannick that the webhook could not match to a family
 * (owner, 2026-11-04: "people are booking sessions that aren't showing up in
 * the app"). The webhook keeps every such booking as a ledger row
 * (calendlyEvents, outcome 'unresolved') and, since 2026-11-04, holds the
 * slot as sessions/cal-<uuid> with `unresolved: true`. This script lists them
 * and links one to an athlete by REPLAYING the booking through the deployed
 * webhook with the family's own login email and the athlete id, so the
 * booking, the token spend and the session are written exactly as a portal
 * booking would have been. The old ledger row is deleted first (it held
 * nothing else), so the replay is not a `duplicate`; it is put back only if
 * nothing replaced it. The login email is the household's parent users doc
 * email exactly as stored (else its guardian email as stored): the webhook
 * looks emails up as typed, then lower-cased. A booking whose held slot was
 * already released is refused.
 *
 *   node scripts/calendly-unmatched.mjs --prod --list
 *   node scripts/calendly-unmatched.mjs --prod --link <inviteeUuid> --athlete <athleteId> \
 *       [--start 2026-11-05T19:00:00-06:00 --minutes 45] [--attendee parent] [--yes]
 *
 * Without --yes nothing is written or sent (a dry run). Rows written before
 * 2026-11-04 carry no slot or invitee: read the time from Yannick's Calendly
 * (the row's received time is when it was booked), pass it as --start, or
 * set CALENDLY_TOKEN (Yannick's personal access token, never printed) and
 * the script reads the event and invitee from Calendly's API. The signing
 * key is read from Secret Manager in memory with the Firebase CLI (or from
 * CALENDLY_WEBHOOK_SIGNING_KEY against the emulator) and never shown.
 * Production auth is scripts/lib/prod-auth.mjs; the emulator without --prod
 * (FIRESTORE_EMULATOR_HOST plus the functions emulator on 5001).
 */

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolveTarget, queryCollection, getDoc, docName, commit, fsFields, eqFilter } from './lib/firestore-rest.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
};
const PROD = flag('--prod');
const YES = flag('--yes');
const HOOK = process.env.CALENDLY_WEBHOOK_URL || (PROD ? 'https://us-central1-rypacad.cloudfunctions.net/calendlyWebhook' :
  'http://127.0.0.1:5001/rypacad/us-central1/calendlyWebhook');
const CAL = 'https://api.calendly.com';
const TOKEN = process.env.CALENDLY_TOKEN || null;

const uuidOf = (uri) => {
  const s = String(uri || '');
  const i = s.lastIndexOf('/');
  return i >= 0 && i < s.length - 1 ? s.slice(i + 1) : null;
};
const iso = (v) => (v instanceof Date ? v.toISOString() : v && v.seconds != null ? new Date(v.seconds * 1000).toISOString() : v ? String(v) : null);
const chicago = (isoInstant) => {
  if (!isoInstant) return null;
  const d = new Date(isoInstant);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
};
const die = (msg) => { console.error(`\nSTOPPED: ${msg}`); process.exit(1); };

async function cal(path) {
  const res = await fetch(`${CAL}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Calendly ${path} -> HTTP ${res.status} ${JSON.stringify(json).slice(0, 160)}`);
  return json;
}

/** The event's times and its invitee as Calendly has them, or null without a token. */
async function fromCalendly(row) {
  if (!TOKEN) return null;
  const eventUuid = uuidOf(row.eventUri);
  const inviteeUuid = uuidOf(row.inviteeUri);
  const ev = (await cal(`/scheduled_events/${eventUuid}`)).resource || {};
  const inv = (await cal(`/scheduled_events/${eventUuid}/invitees/${inviteeUuid}`)).resource || {};
  const answer = (re) => ((inv.questions_and_answers || []).find((q) => re.test(String(q.question || ''))) || {}).answer || null;
  return {
    startTime: ev.start_time || null, endTime: ev.end_time || null, status: ev.status || null,
    inviteeStatus: inv.status || null, name: inv.name || null, email: inv.email ? String(inv.email).toLowerCase() : null,
    athleteName: answer(/athlete.*name|name.*athlete/i), parentEmail: answer(/parent.*e-?mail|e-?mail.*parent/i),
  };
}

async function listRows(target) {
  const rows = await queryCollection(target, { from: [{ collectionId: 'calendlyEvents' }], limit: 3000 });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const created = rows.filter((r) => r.event === 'invitee.created' && r.outcome === 'unresolved');
  created.sort((a, b) => String(iso(a.receivedAt)).localeCompare(String(iso(b.receivedAt))));
  const out = [];
  for (const r of created) {
    const inviteeUuid = r.id.replace(/_invitee\.created$/, '');
    const canceled = byId.get(`${inviteeUuid}_invitee.canceled`) || null;
    const eventUuid = uuidOf(r.eventUri);
    const session = eventUuid ? await getDoc(target, 'sessions', `cal-${eventUuid}`) : null;
    out.push({ row: r, inviteeUuid, eventUuid, canceled, session });
  }
  return out;
}

function describe(e, extra) {
  const r = e.row;
  const inv = r.invitee || extra || {};
  const slot = r.slot || null;
  const when = slot ? `${slot.date} ${slot.time}` : extra && extra.startTime ? `${chicago(extra.startTime)} (Calendly)` : '(time not stored: see Calendly, or pass --start)';
  const who = [inv.athleteName ? `athlete "${inv.athleteName}"` : null, inv.name ? `by ${inv.name}` : null, inv.email || null, inv.parentEmail && inv.parentEmail !== inv.email ? `parent ${inv.parentEmail}` : null].filter(Boolean).join(' ');
  const state = e.canceled ? 'cancelled on Calendly' : !e.session ? 'no session doc (row from before 2026-11-04)' : e.session.status === 'cancelled' ? 'session released' : e.session.unresolved ? 'held, unmatched' : 'session is booked';
  return `  ${String(iso(r.receivedAt) || '(no time)').slice(0, 16)}  invitee ${e.inviteeUuid}\n      ${when}  ${who || '(who booked: not stored)'}  reason=${r.reason || '-'}  [${state}]`;
}

async function main() {
  const target = await resolveTarget({ prod: PROD });
  console.log(`Target: ${target.label}; webhook: ${HOOK}; Calendly API: ${TOKEN ? 'token set' : 'no token'}\n`);

  if (flag('--list')) {
    const all = await listRows(target);
    const open = all.filter((e) => !e.canceled && !(e.session && e.session.status === 'cancelled'));
    const done = all.filter((e) => !open.includes(e));
    console.log(`Unmatched Calendly bookings still open: ${open.length}`);
    for (const e of open) {
      let extra = null;
      if (!e.row.slot || !e.row.invitee) {
        try { extra = await fromCalendly(e.row); } catch (err) { console.log(`  (Calendly lookup failed: ${err.message})`); }
      }
      console.log(describe(e, extra));
    }
    if (done.length) {
      console.log(`\nAlready cancelled or released (nothing to do): ${done.length}`);
      for (const e of done) console.log(describe(e, null));
    }
    console.log('\nTo link one: node scripts/calendly-unmatched.mjs' + (PROD ? ' --prod' : '') + ' --link <inviteeUuid> --athlete <athleteId> [--start <ISO with offset> --minutes <n>] [--attendee parent] (then --yes)');
    return;
  }

  const inviteeUuid = opt('--link');
  const athleteId = opt('--athlete');
  if (!inviteeUuid || !athleteId) die('pass --list, or --link <inviteeUuid> --athlete <athleteId>.');
  const ledgerId = `${inviteeUuid}_invitee.created`;
  const row = await getDoc(target, 'calendlyEvents', ledgerId);
  if (!row) die(`no ledger row calendlyEvents/${ledgerId}.`);
  if (row.outcome !== 'unresolved') die(`that booking is '${row.outcome}', not unresolved; nothing to link.`);
  if (await getDoc(target, 'calendlyEvents', `${inviteeUuid}_invitee.canceled`)) die('that booking was cancelled on Calendly; nothing to link.');
  // Review 2026-11-04: a released hold (cancelled or rescheduled on Calendly, or cancelled in the app) is not linked.
  const heldId = uuidOf(row.eventUri) ? `cal-${uuidOf(row.eventUri)}` : null;
  const held = heldId ? await getDoc(target, 'sessions', heldId) : null;
  if (held && held.status === 'cancelled') die(`sessions/${heldId} was already released (cancelled or rescheduled on Calendly, or cancelled in the app); nothing to link. If the family still has this booking on Calendly, paste this output to Claude.`);
  const athlete = await getDoc(target, 'athletes', athleteId);
  if (!athlete) die(`no athletes/${athleteId}.`);
  const household = athlete.householdId ? await getDoc(target, 'households', athlete.householdId) : null;
  // The family's login exactly as stored (review 2026-11-04): users.email and guardian.email keep the case the
  // family typed, and the webhook tries the email as sent before lower case. The parent users doc first (the one
  // matching the guardian email when there are two), else the guardian email.
  const guardianEmail = household && household.guardian && household.guardian.email ? String(household.guardian.email).trim() : null;
  const parents = athlete.householdId
    ? (await queryCollection(target, { from: [{ collectionId: 'users' }], where: eqFilter('householdId', athlete.householdId), limit: 20 })).filter((u) => u.role === 'parent' && u.email)
    : [];
  const parent = parents.find((u) => guardianEmail && String(u.email).trim().toLowerCase() === guardianEmail.toLowerCase()) || parents[0] || null;
  const email = parent ? String(parent.email).trim() : guardianEmail;
  if (!email) die(`athlete ${athleteId} has no parent login or household guardian email; the webhook could not own the booking.`);

  let start = row.slot && row.slot.startTime ? row.slot.startTime : null;
  let end = row.slot && row.slot.endTime ? row.slot.endTime : null;
  let extra = null;
  if (!start) {
    try { extra = await fromCalendly(row); } catch (err) { console.log(`(Calendly lookup failed: ${err.message})`); }
    if (extra && extra.startTime) { start = extra.startTime; end = extra.endTime; }
  }
  if (opt('--start')) {
    const s = new Date(opt('--start'));
    if (Number.isNaN(s.getTime())) die('--start must be an ISO instant with its offset, e.g. 2026-11-05T19:00:00-06:00.');
    const minutes = Number(opt('--minutes') || 0);
    if (!minutes) die('--start needs --minutes <n>.');
    start = s.toISOString();
    end = new Date(s.getTime() + minutes * 60000).toISOString();
  }
  if (!start || !end) die('no slot time: pass --start <ISO with offset> --minutes <n>, or set CALENDLY_TOKEN.');
  if (extra && extra.status && extra.status !== 'active') die(`Calendly says the event is '${extra.status}'; nothing to link.`);
  const inv = row.invitee || extra || {};
  const attendee = opt('--attendee') === 'parent' ? 'A parent' : 'The athlete';
  const payload = {
    event: 'invitee.created',
    payload: {
      uri: row.inviteeUri, event: row.eventUri, email, name: inv.name || (household.guardian && household.guardian.name) || athlete.name,
      status: 'active', rescheduled: false, old_invitee: null, new_invitee: null, timezone: 'America/Chicago',
      scheduled_event: { uri: row.eventUri, start_time: start, end_time: end, status: 'active', name: 'RYP Academy - Mental Game 1:1' },
      questions_and_answers: [
        { question: 'Athlete name', answer: athlete.name, position: 0 },
        { question: 'Who is attending?', answer: attendee, position: 1 },
        { question: 'Parent email', answer: email, position: 2 },
      ],
      tracking: { utm_source: 'ryp-link-script', utm_medium: 'script', utm_content: athleteId, utm_campaign: athlete.householdId || null },
    },
  };

  console.log(`Link invitee ${inviteeUuid} (booked ${iso(row.receivedAt)}) to ${athlete.name} (${athleteId}, ${household.name || athlete.householdId})`);
  console.log(`  slot: ${chicago(start)} to ${chicago(end)} (${Math.round((Date.parse(end) - Date.parse(start)) / 60000)} min), attendee: ${attendee}`);
  console.log(`  booked on Calendly as: ${[inv.athleteName ? `athlete "${inv.athleteName}"` : null, inv.name || null, inv.email || null].filter(Boolean).join(', ') || '(not stored)'}`);
  console.log(`  will: delete calendlyEvents/${ledgerId}, then POST the booking, signed, to ${HOOK} as the family's login ${email.replace(/^(..).*@/, '$1…@')}`);
  if (!YES) { console.log('\nDry run: nothing written or sent. Add --yes to link it.'); return; }

  let key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY || null;
  if (PROD) {
    const r = spawnSync('npx', ['firebase-tools', 'functions:secrets:access', 'CALENDLY_WEBHOOK_SIGNING_KEY', '--project', 'rypacad'], { encoding: 'utf8', shell: true });
    key = String(r.stdout || '').trim().split(/\r?\n/).pop();
    if (r.status !== 0 || !key) die('could not read the signing key with the Firebase CLI (are you logged in? npx firebase-tools login).');
  }
  if (!key) die('no signing key: set CALENDLY_WEBHOOK_SIGNING_KEY (node --env-file=functions/.env.local ...) for the emulator.');
  // The webhook treats an existing ledger row as a duplicate, so the old row
  // goes first; it is put back, as it was, if the replay does not land.
  const ledgerName = docName('calendlyEvents', ledgerId);
  const restoreRow = { update: { name: ledgerName, fields: fsFields({ ...row, receivedAt: row.receivedAt ? new Date(row.receivedAt) : null }) } };
  await commit(target, [{ delete: ledgerName }]);
  console.log(`  deleted calendlyEvents/${ledgerId}`);
  const body = JSON.stringify(payload);
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', key).update(`${t}.`).update(body).digest('hex');
  let res = null;
  let out = { outcome: null };
  try {
    res = await fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Calendly-Webhook-Signature': `t=${t},v1=${v1}` }, body });
    const text = await res.text();
    try { out = JSON.parse(text); } catch { out = { raw: text.slice(0, 200) }; }
    console.log(`  webhook: HTTP ${res.status} ${JSON.stringify(out)}`);
  } catch (err) {
    console.log(`  webhook: not reached (${err.message})`);
  }
  const ok = Boolean(res) && res.status === 200;
  if (ok && (out.outcome === 'applied' || out.outcome === 'rescheduled')) {
    console.log(`\nLINKED: ${athlete.name} is booked on sessions/cal-${uuidOf(row.eventUri)}${out.flag ? ` (flag ${out.flag})` : ''}; the family sees it under My Schedule and Yannick's list names them.`);
  } else if (ok && out.outcome === 'unresolved') {
    console.log(`\nNOT LINKED: the webhook still could not place it (reason on the new ledger row: run --list). Paste this output to Claude.`);
  } else {
    // Review 2026-11-04: the webhook commits before it answers, so a lost answer (or a 'duplicate') can hide a
    // booking that landed. Put the old row back only if no new row is there, with a precondition so a row
    // written meanwhile is never overwritten.
    let current = null;
    try { current = await getDoc(target, 'calendlyEvents', ledgerId); } catch (err) { console.log(`  (could not re-read calendlyEvents/${ledgerId}: ${String(err.message).slice(0, 160)})`); }
    let restored = false;
    if (!current) {
      try {
        await commit(target, [{ ...restoreRow, currentDocument: { exists: false } }]);
        restored = true;
      } catch (err) { console.log(`  (old row not put back: ${String(err.message).slice(0, 160)})`); }
    }
    const answered = out.outcome || (res ? res.status : 'nothing');
    if (restored) {
      console.log(`\nNOT LINKED: the webhook answered '${answered}'. The ledger row was put back unchanged; nothing else changed. Paste this output to Claude.`);
    } else if (current) {
      console.log(`\nCHECK: the webhook answered '${answered}', but the booking reached it: calendlyEvents/${ledgerId} now says '${current.outcome}'. The old row was left alone. Do not run --link again; run --list and paste this output to Claude.`);
    } else {
      console.log(`\nCHECK: the webhook answered '${answered}' and the old ledger row could not be put back (see above). Do not run --link again; run --list and paste this output to Claude.`);
    }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
