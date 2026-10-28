#!/usr/bin/env node
/**
 * The production TEST FAMILY for the staging test (owner, 2026-10-15).
 * Staging is the Railway "Staging" environment: it builds `develop`, serves
 * https://rypacad.ryptest.com and runs on the PRODUCTION Firebase project,
 * beside real families - there is no separate test database. The owner and
 * Phil test the assessments with this one invented household:
 *
 *   households/ryp-test-family   "RYP Test Family", test: true
 *   athletes/ryp-test-ava        Ava Test, under 18, test: true
 *   athletes/ryp-test-max        Max Test, 18+, test: true (not with --no-adult)
 *   users/<uid>                  the parent login (--parent-email), role parent
 *
 *   node scripts/provision-test-family.mjs --prod --parent-email makel+testparent@rypgolf.com --dry-run
 *   node scripts/provision-test-family.mjs --prod --parent-email makel+testparent@rypgolf.com --yes
 *   node scripts/provision-test-family.mjs --prod --reset (--dry-run | --yes)
 *
 * Without --prod it targets the local emulators (FIRESTORE_EMULATOR_HOST and
 * FIREBASE_AUTH_EMULATOR_HOST, local hosts only). Production auth is
 * scripts/lib/prod-auth.mjs, the developer's firebase-tools login; every
 * --prod run is the owner's, the dry run first.
 *
 * The parent login must exist first: the owner signs in once at
 * https://rypacad.ryptest.com/portal/signin with that address (a password
 * login) and stops at the sign-up form - finishing sign-up would make a
 * real household with a payment step.
 *
 * Safety: it only CREATES the docs above, each under an exists:false
 * precondition, so a re-run changes nothing already there (what the parent
 * or Phil changed stays). It refuses, before writing anything, when the
 * household exists without test: true, when an athlete id belongs to
 * anything but the test family, or when the login already has a portal
 * record that is not this family's parent. It never writes a booking, a
 * payment or a Stripe id: the athletes have no package and no billing, so
 * there is nothing to book with and nothing to pay for (createCheckoutSession
 * refuses 'no-package'). Research starts unanswered: the parent answers it
 * once at staging, which is how the one-time confirm gets tested. --reset
 * deletes only the test athletes' assessments and assessmentProfile docs and
 * clears their consents.research - never the protocol settings, which
 * staging shares with production.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ID, commit, docName, fsFields, getDoc, resolveTarget } from './lib/firestore-rest.mjs';
import { authTarget, lookup } from './mark-email-verified.mjs';

export const TEST_HOUSEHOLD_ID = 'ryp-test-family';
/** The invented athletes: Ava stays under 18 all season, Max is 18+. */
export const TEST_ATHLETES = [
  { id: 'ryp-test-ava', name: 'Ava Test', dob: '2012-05-14', handicap: 14, adult: false },
  { id: 'ryp-test-max', name: 'Max Test', dob: '2007-03-02', handicap: 6, adult: true },
];
const PARENT_NAME = 'RYP Test Parent';
const STAGING = 'https://rypacad.ryptest.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USAGE = 'Usage: node scripts/provision-test-family.mjs [--prod] (--parent-email <address> [--no-adult] | --reset) (--dry-run | --yes)';

/** The academy's date (America/Chicago), `YYYY-MM-DD` - the signature date's default; an evening run in UTC is already tomorrow. */
export function chicagoToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now);
}

/** @return {{prod, parentEmail, dryRun, yes, adult, reset} | {error: string}} */
export function parseArgs(argv) {
  const out = { prod: false, parentEmail: null, dryRun: false, yes: false, adult: true, reset: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prod') out.prod = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--yes') out.yes = true;
    else if (a === '--no-adult') out.adult = false;
    else if (a === '--reset') out.reset = true;
    else if (a === '--parent-email') out.parentEmail = argv[++i] ?? null;
    else return { error: `Unknown argument: ${a}` };
  }
  if (out.dryRun === out.yes) return { error: 'Pass exactly one of --dry-run or --yes.' };
  if (out.reset) return { ...out, parentEmail: null };
  const parentEmail = (out.parentEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(parentEmail)) return { error: 'Pass --parent-email with the address of the login the owner made for the test parent.' };
  return { ...out, parentEmail };
}

/** Every doc the test family needs, `{ collection, id, path, data }`: fixed ids plus the parent's uid. Pure. */
export function planTestFamily({ parentUid, parentEmail, todayISO, adult = true }) {
  const docs = [{
    collection: 'households',
    id: TEST_HOUSEHOLD_ID,
    data: {
      name: 'RYP Test Family', test: true,
      guardian: { name: PARENT_NAME, email: parentEmail, phone: null, relationship: 'Parent' },
      stripeCustomerId: null, stripeSubscriptionId: null, stripeCustomerIds: [],
      createdBy: parentUid, emergencyContact: null,
    },
  }];
  for (const a of TEST_ATHLETES.filter((x) => adult || !x.adult)) {
    docs.push({
      collection: 'athletes',
      id: a.id,
      data: {
        name: a.name, dob: a.dob, householdId: TEST_HOUSEHOLD_ID, test: true,
        packageId: null, contractMinutes: null, coachId: null, handicap: a.handicap, loginEmail: null,
        facilityAccess: false, facilityRequested: false,
        consents: { dataCollection: true, videoCapture: true, mediaRelease: false, research: null, signature: { name: PARENT_NAME, date: todayISO } },
      },
    });
  }
  docs.push({
    collection: 'users',
    id: parentUid,
    data: { role: 'parent', householdId: TEST_HOUSEHOLD_ID, athleteId: null, staff: false, specialistId: null, displayName: PARENT_NAME, email: parentEmail, phone: null },
  });
  return docs.map((d) => ({ ...d, path: `${d.collection}/${d.id}` }));
}

/** Why the parent login cannot be used, or null. */
export function loginRefusal(login) {
  if (!login) return `No login has this email. Sign in once at ${STAGING}/portal/signin with it (stop at the sign-up form), then run this again.`;
  if (login.disabled === true) return 'This login is disabled. Nothing written.';
  return null;
}

/** Why nothing may be written, or null. `existing` maps each planned path to its doc as read (null when absent). */
export function refusal(docs, existing) {
  for (const d of docs) {
    const cur = existing[d.path];
    if (!cur) continue;
    if (d.collection === 'households' && cur.test !== true) {
      return `${d.path} exists and is not marked test: true. Nothing written.`;
    }
    if (d.collection === 'athletes' && (cur.test !== true || cur.householdId !== TEST_HOUSEHOLD_ID)) {
      return `${d.path} exists and is not a test-family athlete (household ${cur.householdId ?? 'none'}). Nothing written.`;
    }
    if (d.collection === 'users' && (cur.role !== 'parent' || cur.householdId !== TEST_HOUSEHOLD_ID)) {
      return `That login already has a portal record (${cur.role ?? 'no role'}, household ${cur.householdId ?? 'none'}). Use an address that has never finished sign-up. Nothing written.`;
    }
  }
  return null;
}

/** The commit: every planned doc not there yet, created under exists:false, so a re-run never overwrites. */
export function createWrites(docs, existing) {
  return docs.filter((d) => !existing[d.path]).map((d) => ({
    update: { name: docName(d.collection, d.id), fields: fsFields(d.data) },
    currentDocument: { exists: false },
  }));
}

/** --reset: each test athlete's windows and profiles deleted, its research answer cleared. `found`: [{ athleteId, windows, profiles }]. */
export function resetWrites(found) {
  const writes = [];
  for (const f of found) {
    for (const id of f.windows) writes.push({ delete: docName(`athletes/${f.athleteId}/assessments`, id), currentDocument: { exists: true } });
    for (const id of f.profiles) writes.push({ delete: docName(`athletes/${f.athleteId}/assessmentProfile`, id), currentDocument: { exists: true } });
    writes.push({
      update: { name: docName('athletes', f.athleteId), fields: fsFields({ consents: { research: null } }) },
      updateMask: { fieldPaths: ['consents.research'] },
      currentDocument: { exists: true },
    });
  }
  return writes;
}

function describe(d) {
  if (d.collection === 'households') return `${d.data.name}, test: true`;
  if (d.collection === 'users') return `parent of ${TEST_HOUSEHOLD_ID}`;
  const adult = TEST_ATHLETES.find((a) => a.id === d.id).adult;
  return `${d.data.name}, born ${d.data.dob} (${adult ? '18+' : 'under 18'}), test: true, no package, research not answered`;
}

async function readAll(io, docs) {
  const out = {};
  for (const d of docs) out[d.path] = await io.readDoc(d.collection, d.id);
  return out;
}

async function provision(args, io, { log, error, todayISO }) {
  const login = await io.lookupLogin(args.parentEmail);
  const noLogin = loginRefusal(login);
  if (noLogin) {
    error(noLogin);
    return 1;
  }
  const docs = planTestFamily({ parentUid: login.localId, parentEmail: args.parentEmail, todayISO, adult: args.adult });
  const existing = await readAll(io, docs);
  const why = refusal(docs, existing);
  if (why) {
    error(`Refusing: ${why}`);
    return 1;
  }
  log(`  parent login   ${args.parentEmail} (uid ${login.localId})`);
  for (const d of docs) log(`  ${existing[d.path] ? 'already there' : 'create'}  ${d.path}  ${describe(d)}`);
  const writes = createWrites(docs, existing);
  if (!writes.length) {
    log('Nothing to do: RYP Test Family is already there.');
    return 0;
  }
  if (args.dryRun) {
    log(`Would create ${writes.length} docs. Run again with --yes instead of --dry-run.`);
    return 0;
  }
  await io.commitWrites(writes);
  const after = await readAll(io, docs);
  if (docs.some((d) => !after[d.path]) || refusal(docs, after)) {
    error('Written, but the test family does not read back whole. Check it in the Firebase console.');
    return 1;
  }
  log(`Created ${writes.length} docs. RYP Test Family is ready: sign in at ${STAGING}/portal/signin as ${args.parentEmail}.`);
  return 0;
}

async function reset(args, io, { log, error }) {
  const household = await io.readDoc('households', TEST_HOUSEHOLD_ID);
  if (!household || household.test !== true) {
    error(`Refusing: households/${TEST_HOUSEHOLD_ID} is ${household ? 'not marked test: true' : 'not there'}. Nothing written.`);
    return 1;
  }
  const found = [];
  for (const a of TEST_ATHLETES) {
    const doc = await io.readDoc('athletes', a.id);
    if (!doc) continue;
    if (doc.test !== true || doc.householdId !== TEST_HOUSEHOLD_ID) {
      error(`Refusing: athletes/${a.id} is not a test-family athlete. Nothing written.`);
      return 1;
    }
    const windows = await io.listIds(`athletes/${a.id}`, 'assessments');
    const profiles = await io.listIds(`athletes/${a.id}`, 'assessmentProfile');
    const r = doc.consents?.research ?? null;
    log(`  reset  athletes/${a.id}: ${windows.length} window(s) and ${profiles.length} profile(s) go; research ${r ? (r.value ? 'yes' : 'no') : 'not answered'} -> not answered`);
    found.push({ athleteId: a.id, windows, profiles });
  }
  if (!found.length) {
    log('Nothing to reset: the test family has no athletes.');
    return 0;
  }
  const writes = resetWrites(found);
  if (args.dryRun) {
    log(`Would apply ${writes.length} writes. Run again with --yes instead of --dry-run.`);
    return 0;
  }
  await io.commitWrites(writes);
  log('Reset: Phil can start a new baseline wave with the test athletes, and the parent is asked about research again.');
  return 0;
}

async function listIds(store, parent, collectionId) {
  const url = `${store.base}/projects/${PROJECT_ID}/databases/(default)/documents/${parent}/${collectionId}?pageSize=300`;
  const res = await fetch(url, { headers: { Authorization: store.auth } });
  if (!res.ok) throw new Error(`List ${parent}/${collectionId} against ${store.label} failed (${res.status}): ${await res.text()}`);
  return ((await res.json()).documents || []).map((d) => d.name.split('/').pop());
}

/** Production with --prod (the developer's firebase-tools login), else the local emulators only. */
async function liveIo(prod) {
  const store = await resolveTarget({ prod });
  return {
    label: store.label,
    lookupLogin: async (email) => {
      const auth = await authTarget({ prod });
      if (auth.error) throw new Error(auth.error);
      return lookup(auth, email);
    },
    readDoc: (collection, id) => getDoc(store, collection, id),
    listIds: (parent, collectionId) => listIds(store, parent, collectionId),
    commitWrites: (writes) => commit(store, writes),
  };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;
  const args = parseArgs(argv);
  if (args.error) {
    error(args.error);
    error(USAGE);
    return 1;
  }
  const io = deps.io ?? (await liveIo(args.prod));
  log(`Target: ${io.label}${args.dryRun ? ' (dry run, nothing is written)' : ''}`);
  const ctx = { log, error, todayISO: deps.todayISO ?? chicagoToday() };
  return args.reset ? reset(args, io, ctx) : provision(args, io, ctx);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 1; });
