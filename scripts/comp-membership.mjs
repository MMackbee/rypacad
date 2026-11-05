#!/usr/bin/env node
/**
 * Comp an unpaid athlete onto Elite (Unlimited): marked paid, with nothing
 * billed and nothing changed in Stripe (owners, 2026-11-04: a family's
 * Unlimited is free for the 2026-27 season). The family signs up in the
 * portal, picks Elite for each child and does not pay; this marks those
 * children paid.
 *
 *   node scripts/comp-membership.mjs --prod --email parent@example.com \
 *     --athlete Abigail --athlete Grant [--until 2027-02-27] [--note "..."] --dry-run
 *   (the same with --yes writes it; the owner runs that one)
 *
 * What it writes, in ONE commit: athletes/{id}.billing on each named child ->
 * status 'active', oneTime false, every Stripe id null, comp true, compUntil,
 * compNote, linkedBy 'comp-membership' and a server-time updatedAt. Masked to
 * those billing fields, each under the updateTime of the read it was checked
 * against. Nothing else: no household field (absent membership reads as
 * active, absent periodAnchorDay as 1), no lastEventId (that means "the
 * webhook wrote this"), no tokenPeriods (Elite has none), nothing in Stripe.
 *
 * Why it holds afterwards: active billing with no subscription passes every
 * booking gate (firestore.rules athleteBillingOk, lib.membershipAllowsBooking),
 * a checkout is refused as already paid, and no webhook can find the athlete
 * (no subscription id, no Stripe customer). Nothing ends a comp: compUntil is
 * a record only, so the season-end billing work has to end it.
 *
 * Refuses, and writes nothing for anyone, unless every named child is unpaid
 * (billing 'pending', no Stripe ids), on Elite, with no Stripe checkout opened
 * in the last 25 hours, in a family that is not a test family, not past_due
 * or lapsed, and has no Stripe customer.
 * Production auth is scripts/lib/prod-auth.mjs; the emulator without --prod.
 */

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolveTarget, queryCollection, eqFilter, getDoc, docName, fsFields, fsDecode, commit, PROJECT_ID } from './lib/firestore-rest.mjs';

const lib = createRequire(import.meta.url)('../functions/portal/lib.js');

const USAGE = 'Usage: node scripts/comp-membership.mjs [--prod] --email <parent login> --athlete <first name> [--athlete <first name> ...] [--until YYYY-MM-DD] [--note "<text>"] (--dry-run | --yes)';
const DEFAULT_UNTIL = '2027-02-27';
const DEFAULT_NOTE = 'Owner comp (Makel, Mike, Luke): Unlimited free, 2026-27 season';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BILLING_FIELDS = ['status', 'oneTime', 'customerId', 'subscriptionId', 'priceId', 'checkoutSessionId', 'comp', 'compUntil', 'compNote', 'linkedBy'];
const HOUR_MS = 60 * 60 * 1000;
/** Tier checkouts set no expires_at, so Stripe's default 24 hours applies; one more hour of margin. */
const STRIPE_EXPIRY_MS = 24 * HOUR_MS;
const OPEN_MS = 25 * HOUR_MS;
const PRODUCT_LABEL = { tier: 'membership', facility: 'facility add-on', extra: 'extra session' };
const SEASON_END = 'Nothing ends this comp automatically: add it to the season-end list.';

/** True for a real calendar date written YYYY-MM-DD. */
function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** '2026-11-04 3:12 PM', Chicago time. */
function when(ms) {
  const d = new Date(ms);
  return `${lib.chicagoDate(d)} ${lib.chicagoTime(d)}`;
}

/**
 * Pure (pass `today`, Chicago 'YYYY-MM-DD').
 * @return {{prod, email, athletes: string[], until, note, dryRun, yes} | {error}}
 */
export function parseArgs(argv, { today = lib.todayISO() } = {}) {
  const out = { prod: false, email: null, athletes: [], until: DEFAULT_UNTIL, note: DEFAULT_NOTE, dryRun: false, yes: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prod') out.prod = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (['--email', '--athlete', '--until', '--note'].includes(a)) {
      const v = argv[++i];
      if (v == null || v.startsWith('--')) return { error: `${a} needs a value.` };
      if (a === '--athlete') { out.athletes.push(v.trim()); continue; }
      if (seen.has(a)) return { error: `Pass ${a} only once.` };
      seen.add(a);
      out[a.slice(2)] = v;
    } else return { error: `Unknown argument: ${a}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  out.email = (out.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(out.email)) return { error: 'Pass --email with the parent\'s portal login.' };
  if (!out.athletes.length || out.athletes.some((n) => !n)) return { error: 'Pass --athlete with a first name, once for each child.' };
  if (!validDate(out.until)) return { error: 'Pass --until as a real date, YYYY-MM-DD.' };
  if (out.until <= today) return { error: `--until has to be after today (${today}).` };
  out.note = out.note.trim();
  if (out.note.length < 1 || out.note.length > 200) return { error: 'Pass --note with 1 to 200 characters.' };
  return out;
}

/** Pure: each name matches exactly one athlete (first name is enough), and no two names the same one. */
export function pickAthletes(athletes, names) {
  const list = athletes.map((a) => `${a.name} (${a.billing?.status ?? 'no billing'})`).join(', ') || 'none';
  const picked = [];
  for (const n of names) {
    const hits = athletes.filter((a) => (a.name || '').toLowerCase().startsWith(n.toLowerCase()));
    if (!hits.length) return { error: `No athlete in this family matches "${n}". Athletes: ${list}` };
    if (hits.length > 1) return { error: `More than one athlete matches "${n}"; pass more of the name. Athletes: ${list}` };
    if (picked.some((p) => p.id === hits[0].id)) return { error: `Two of the names both match ${hits[0].name}; name each child once. Athletes: ${list}` };
    picked.push(hits[0]);
  }
  return { athletes: picked };
}

/** Pure: the athlete's pendingCheckout entries; open unless opened 25 hours or more before nowMs. */
export function checkoutsOf(athlete, nowMs) {
  return Object.entries(athlete.pendingCheckout || {})
    .filter(([, v]) => v && typeof v === 'object')
    .map(([product, v]) => {
      const at = Date.parse(v.createdAt);
      const known = Number.isFinite(at);
      return { product, label: PRODUCT_LABEL[product] ?? product, at: known ? at : null, open: !known || nowMs - at < OPEN_MS };
    });
}

/** Pure: what the output line says about checkouts: 'none', or each one. */
export function checkoutNote(athlete, nowMs) {
  const list = checkoutsOf(athlete, nowMs);
  if (!list.length) return 'none';
  return list.map((c) => {
    if (c.at == null) return `${c.label} checkout with no time on record`;
    return c.open ? `${c.label} checkout opened ${when(c.at)}` : `old ${c.label} checkout from ${when(c.at)} (expired)`;
  }).join('; ');
}

/** @return {?string} Pure: why this athlete is not comped, or null. */
export function refusal({ athlete, pkg, household, nowMs }) {
  const name = athlete.name || athlete.id;
  if (household.test === true || athlete.test === true) return `This is a test family (${household.test === true ? 'the family' : name} is marked test); nothing to comp.`;
  const status = household.membership?.status;
  if (status === 'past_due' || status === 'lapsed') return `The family's membership is ${status}, so something was billed. Check Stripe first.`;
  if (household.stripeCustomerId || (household.stripeCustomerIds || []).length) return 'This family has a Stripe customer, so something was paid or checked out. Check Stripe first.';
  if (athlete.packageId !== 'elite') return `${name} is on ${pkg?.name ?? athlete.packageId ?? 'no package'}, not Elite. Change it to Elite first (the parent can while it is pending).`;
  if (!pkg || pkg.kind !== 'elite' || pkg.tokens != null) return `packages/elite is ${pkg ? `kind ${pkg.kind}, tokens ${pkg.tokens}` : 'missing'}, not unlimited Elite. Check it first.`;
  const b = athlete.billing;
  if (b?.status === 'active' && b.comp === true) return `${name} is already comped (until ${b.compUntil ?? 'no date'}); nothing to do.`;
  if (b?.status !== 'pending') return `${name} is not unpaid (billing ${b?.status ?? 'missing'}); nothing to comp.`;
  const ids = ['customerId', 'subscriptionId', 'checkoutSessionId'].filter((f) => b[f] != null);
  if (b.oneTime === true) ids.push('oneTime');
  if (ids.length) return `${name}'s billing already has Stripe details (${ids.join(', ')}), so something was paid or checked out. Check Stripe first.`;
  const open = checkoutsOf(athlete, nowMs).find((c) => c.open);
  if (open && open.at == null) return `${name} has a Stripe ${open.label} checkout with no time on record. Check Stripe first.`;
  if (open) return `${name} has a Stripe ${open.label} checkout opened ${when(open.at)} that can still be paid until ${when(open.at + STRIPE_EXPIRY_MS)}. Run this again after ${when(open.at + OPEN_MS)}; to stop it being paid before then, expire it in Stripe.`;
  return null;
}

/** Pure: one masked billing write per athlete, each under its own updateTime. No household write. */
export function buildWrites({ athletes, args }) {
  const billing = {
    status: 'active', oneTime: false, customerId: null, subscriptionId: null, priceId: null, checkoutSessionId: null,
    comp: true, compUntil: args.until, compNote: args.note, linkedBy: 'comp-membership',
  };
  return athletes.map(({ athlete, updateTime }) => {
    if (!updateTime) throw new Error(`No updateTime for athlete ${athlete.id}; nothing written.`);
    return {
      update: { name: docName('athletes', athlete.id), fields: fsFields({ billing }) },
      updateMask: { fieldPaths: BILLING_FIELDS.map((f) => `billing.${f}`) },
      updateTransforms: [{ fieldPath: 'billing.updatedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { updateTime },
    };
  });
}

/** Pure: the athlete reads back as comped and can book. */
export function compedOk(athlete, household) {
  const b = athlete?.billing;
  return Boolean(b && b.status === 'active' && b.comp === true && b.subscriptionId === null && b.linkedBy === 'comp-membership'
    && athlete.packageId === 'elite' && lib.membershipAllowsBooking(household, athlete) === true);
}

/** One read of a doc and its updateTime together, so the precondition guards the values checked. */
async function readWithTime(target, collection, id) {
  const res = await fetch(`${target.base}/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${id}`, { headers: { Authorization: target.auth } });
  if (res.status === 404) return { data: null, updateTime: null };
  if (!res.ok) throw new Error(`Read ${collection}/${id} failed (${res.status})`);
  const body = await res.json();
  return { data: { id, ...fsDecode(body.fields || {}) }, updateTime: body.updateTime };
}

const namesOf = (list) => (list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);

export async function main(argv = process.argv.slice(2), { nowMs = Date.now() } = {}) {
  const args = parseArgs(argv, { today: lib.todayISO(new Date(nowMs)) });
  if (args.error) { console.error(`${args.error}\n${USAGE}`); return 1; }
  const target = await resolveTarget({ prod: args.prod });
  console.log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);

  const users = await queryCollection(target, { from: [{ collectionId: 'users' }], where: eqFilter('email', args.email) });
  const householdIds = [...new Set(users.map((u) => u.householdId).filter(Boolean))];
  if (!householdIds.length) { console.error(`No portal family for ${args.email}. They finish sign-up at portal.rypacademy.com first (without paying).`); return 1; }
  if (householdIds.length > 1) { console.error(`${args.email} belongs to more than one family (${householdIds.join(', ')}). Check the users docs first.`); return 1; }
  const [householdId] = householdIds;
  const householdDoc = await getDoc(target, 'households', householdId);
  if (!householdDoc) { console.error(`The login points at family ${householdId}, which does not exist. Check it.`); return 1; }
  const household = { id: householdId, ...householdDoc };
  const athletes = await queryCollection(target, { from: [{ collectionId: 'athletes' }], where: eqFilter('householdId', householdId) });
  const picked = pickAthletes(athletes, args.athletes);
  if (picked.error) { console.error(picked.error); return 1; }
  console.log(`  family    ${household.name ?? '(no name)'} (${householdId})`);

  const rows = [];
  for (const a of picked.athletes) {
    const { data, updateTime } = await readWithTime(target, 'athletes', a.id);
    if (!data) { console.error(`${a.name} (${a.id}) is gone. Check it.`); return 1; }
    const pkg = data.packageId ? await getDoc(target, 'packages', data.packageId) : null;
    rows.push({ athlete: data, updateTime, pkg, why: refusal({ athlete: data, pkg, household, nowMs }) });
  }
  for (const r of rows) {
    console.log(`  athlete   ${r.athlete.name} (${r.athlete.id}), ${r.pkg?.name ?? r.athlete.packageId ?? 'no package'}, billing ${r.athlete.billing?.status ?? 'missing'}, checkout: ${checkoutNote(r.athlete, nowMs)}`);
    if (!r.why) console.log(`            comp -> billing active, nothing billed, until ${args.until}`);
  }
  const reasons = [...new Set(rows.map((r) => r.why).filter(Boolean))];
  if (reasons.length) { console.error(`Not comped, nothing was written:\n${reasons.map((w) => `  ${w}`).join('\n')}`); return 1; }
  console.log(`  note      ${args.note}`);
  if (args.dryRun) { console.log(`Would comp them. Run again with --yes instead of --dry-run.\n${SEASON_END}`); return 0; }

  try {
    await commit(target, buildWrites({ athletes: rows, args }));
  } catch (e) {
    console.error(`Not written: ${e.message}\nIf a child's doc changed since it was read, run it again (dry run first).`);
    return 1;
  }
  const after = { id: householdId, ...(await getDoc(target, 'households', householdId)) };
  const bad = [];
  for (const r of rows) if (!compedOk(await getDoc(target, 'athletes', r.athlete.id), after)) bad.push(r.athlete.name);
  if (bad.length) { console.error(`Written, but ${namesOf(bad)} ${bad.length > 1 ? 'do' : 'does'} not read back as comped. Check it.\n${SEASON_END}`); return 1; }
  const names = rows.map((r) => r.athlete.name);
  console.log(`Comped. ${namesOf(names)} ${names.length > 1 ? 'are' : 'is'} on Elite with nothing billed and can book now. Nothing changed in Stripe.\n${SEASON_END}`);
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
