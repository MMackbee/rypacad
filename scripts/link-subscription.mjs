#!/usr/bin/env node
/**
 * Link a family's EXISTING Stripe subscription to their athlete, for a price
 * the owner honors from before the portal (owner, 2026-10-10: Ben Schmidt
 * signed up in August at $200 a month for 4 sessions, and keeps that price
 * for the season). The family signs up in the portal and does not pay there;
 * this marks the athlete paid against the subscription Stripe already bills.
 *
 *   node scripts/link-subscription.mjs --prod --email parent@example.com \
 *     --subscription sub_... --customer cus_... --price price_... --dry-run
 *   (the same with --yes writes it; the owner runs that one)
 *
 * What it writes: athletes/{id}.billing -> status 'active' plus the three
 * Stripe ids (masked to those fields, under an updateTime precondition), and
 * on households/{id}, under its own updateTime precondition, what the
 * webhook sets on a first payment: periodAnchorDay = 1 when it is missing,
 * and the customer, always added to stripeCustomerIds and made
 * stripeCustomerId when that is empty (stripe-checkout.js linkCustomer).
 * Manage billing in Stripe opens that customer (review 2026-11-17 F3).
 * Nothing in Stripe changes.
 *
 * Why it works afterwards: the webhook finds the athlete by
 * billing.subscriptionId (functions/portal/stripe-resolve.js), so the
 * subscription's own renewals grant each month's tokens, a failed card
 * freezes it and a cancellation lapses it, like any portal membership. The
 * old price maps to no package, so the athlete keeps the package they picked.
 *
 * Refuses unless the athlete is unpaid (billing 'pending', no subscription),
 * on a token package, and no other athlete already holds the subscription.
 * Production auth is scripts/lib/prod-auth.mjs; the emulator without --prod.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTarget, queryCollection, eqFilter, getDoc, docName, fsFields, commit, PROJECT_ID } from './lib/firestore-rest.mjs';

const ID_RE = { subscription: /^sub_[A-Za-z0-9]{8,}$/, customer: /^cus_[A-Za-z0-9]{8,}$/, price: /^price_[A-Za-z0-9]{8,}$/ };
const BILLING_FIELDS = ['status', 'customerId', 'subscriptionId', 'priceId', 'oneTime', 'checkoutSessionId', 'linkedBy'];

/** @return {{prod, email, subscription, customer, price, athlete, dryRun, yes} | {error}} */
export function parseArgs(argv) {
  const out = { prod: false, email: null, subscription: null, customer: null, price: null, athlete: null, dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prod') out.prod = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (['--email', '--subscription', '--customer', '--price', '--athlete'].includes(a)) out[a.slice(2)] = argv[++i] ?? null;
    else return { error: `Unknown argument: ${a}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  out.email = (out.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return { error: 'Pass --email with the parent\'s portal login.' };
  for (const k of Object.keys(ID_RE)) if (!ID_RE[k].test(out[k] || '')) return { error: `Pass --${k} with a Stripe ${k} id.` };
  return out;
}

/** The athlete to link: the one named, else the household's only unpaid one. */
export function pickAthlete(athletes, name) {
  const pool = name ? athletes.filter((a) => (a.name || '').toLowerCase().startsWith(name.toLowerCase())) : athletes.filter((a) => a.billing?.status === 'pending');
  if (pool.length === 1) return { athlete: pool[0] };
  const list = athletes.map((a) => `${a.name} (${a.billing?.status ?? 'no billing'})`).join(', ') || 'none';
  return { error: pool.length ? `More than one match; pass --athlete with a first name. Athletes: ${list}` : `No unpaid athlete to link. Athletes: ${list}` };
}

/** @return {?string} Why the link is refused, or null. */
export function refusal({ athlete, pkg, holders }) {
  if (athlete.billing?.status !== 'pending' || athlete.billing?.subscriptionId) return `${athlete.name} is not unpaid (billing ${athlete.billing?.status ?? 'missing'}); nothing to link.`;
  if (!pkg || pkg.kind !== 'tokens') return `${athlete.name} is on ${athlete.packageId ?? 'no package'}, not a token package.`;
  if (holders.length) return `That subscription is already on athlete ${holders.map((h) => h.id).join(', ')}.`;
  return null;
}

/** True when the household has no primary Stripe customer yet. */
function noPrimary(household) {
  return !(typeof household.stripeCustomerId === 'string' && household.stripeCustomerId.trim());
}

/**
 * Pure: the commit writes. `updateTime` is the athlete doc's and
 * `householdUpdateTime` the household's, each read before the doc itself.
 */
export function buildWrites({ athlete, household, args, updateTime, householdUpdateTime }) {
  const billing = { status: 'active', customerId: args.customer, subscriptionId: args.subscription, priceId: args.price, oneTime: false, checkoutSessionId: null, linkedBy: 'link-subscription' };
  const writes = [{
    update: { name: docName('athletes', athlete.id), fields: fsFields({ billing }) },
    updateMask: { fieldPaths: BILLING_FIELDS.map((f) => `billing.${f}`) },
    updateTransforms: [{ fieldPath: 'billing.updatedAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { updateTime },
  }];
  const patch = {};
  if (household.periodAnchorDay == null) patch.periodAnchorDay = 1;
  if (noPrimary(household)) patch.stripeCustomerId = args.customer;
  writes.push({
    update: { name: docName('households', household.id), fields: fsFields(patch) },
    updateMask: { fieldPaths: Object.keys(patch) },
    updateTransforms: [{ fieldPath: 'stripeCustomerIds', appendMissingElements: { values: [{ stringValue: args.customer }] } }],
    currentDocument: householdUpdateTime ? { updateTime: householdUpdateTime } : { exists: true },
  });
  return writes;
}

async function updateTimeOf(target, collection, id) {
  const res = await fetch(`${target.base}/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${id}?mask.fieldPaths=__name__`, { headers: { Authorization: target.auth } });
  if (!res.ok) throw new Error(`Read ${collection}/${id} failed (${res.status})`);
  return (await res.json()).updateTime;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) { console.error(args.error); return 1; }
  const target = await resolveTarget({ prod: args.prod });
  console.log(`Target: ${target.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);

  const users = await queryCollection(target, { from: [{ collectionId: 'users' }], where: eqFilter('email', args.email) });
  const householdId = users.find((u) => u.householdId)?.householdId;
  if (!householdId) { console.error(`No portal login with a family for ${args.email}. They sign up at portal.rypacademy.com first (without paying).`); return 1; }
  // The updateTime first: a write between the two reads fails the commit rather than going unseen.
  const householdUpdateTime = await updateTimeOf(target, 'households', householdId);
  const household = { id: householdId, ...(await getDoc(target, 'households', householdId)) };
  const athletes = await queryCollection(target, { from: [{ collectionId: 'athletes' }], where: eqFilter('householdId', householdId) });
  const picked = pickAthlete(athletes, args.athlete);
  if (picked.error) { console.error(picked.error); return 1; }
  const { athlete } = picked;
  const pkg = athlete.packageId ? await getDoc(target, 'packages', athlete.packageId) : null;
  const holders = await queryCollection(target, { from: [{ collectionId: 'athletes' }], where: eqFilter('billing.subscriptionId', args.subscription) });
  console.log(`  family    ${household.name} (${householdId})\n  athlete   ${athlete.name} (${athlete.id}), ${pkg?.name ?? athlete.packageId}, billing ${athlete.billing?.status}`);
  const why = refusal({ athlete, pkg, holders });
  if (why) { console.error(why); return 1; }
  console.log(`  link      ${args.subscription} (customer ${args.customer}, price ${args.price}) -> billing active${household.periodAnchorDay == null ? '; household periodAnchorDay 1' : ''}`);
  console.log(`  household customer ${args.customer} listed${noPrimary(household) ? ' and made the primary' : `; primary stays ${household.stripeCustomerId}`}`);
  if (args.dryRun) { console.log('Would link it. Run again with --yes instead of --dry-run.'); return 0; }

  await commit(target, buildWrites({ athlete, household, args, updateTime: await updateTimeOf(target, 'athletes', athlete.id), householdUpdateTime }));
  const after = await getDoc(target, 'athletes', athlete.id);
  if (after.billing?.status !== 'active' || after.billing?.subscriptionId !== args.subscription) { console.error('Written, but the athlete does not read back as linked. Check it.'); return 1; }
  console.log(`Linked. ${athlete.name} is paid and can book ${pkg.tokens} sessions a month; Stripe keeps billing the existing subscription.`);
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
