#!/usr/bin/env node
/**
 * Provision the test family in PRODUCTION Firestore — every doc the four
 * role surfaces need to actually function, not just route:
 *
 *   node scripts/provision-family.mjs --dry-run   # look up accounts, print the plan
 *   node scripts/provision-family.mjs             # write it
 *
 * What it writes (data contract, docs/portal/DATA-MODEL.md):
 *   packages     — the full 2026-27 catalogue, bundled from
 *                  frontend/src/portal/data/packages.js exactly as
 *                  seed-firestore.mjs does (never retyped; price stripped —
 *                  no dollar amounts in Firestore, only Stripe holds money).
 *   households   — the MackBee test household.
 *   athletes     — one test athlete on the g-8-3 package, coached by the
 *                  test coach account.
 *   users        — one doc per FAMILY account below, keyed by auth uid.
 *
 * Auth uids are resolved from emails via the Identity Toolkit admin API, so
 * each account must have signed in at /portal/signin at least once (that
 * first sign-in creates the auth record and lands on Not Provisioned — which
 * is this script's cue). Accounts not found are skipped with instructions;
 * the run is idempotent, so re-run after the missing account signs in.
 *
 * Safety posture: same as provision-owner.mjs — authenticates as the
 * developer's own firebase-tools CLI login, writes are IAM-admin traffic that
 * rules do not gate, and running it is a PM/user-gated action per
 * docs/portal/TEAM.md. It creates/overwrites only the specific doc ids named
 * in the plan it prints; it deletes nothing.
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prodAccessToken } from './lib/prod-auth.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const PROJECT_ID = 'rypacad';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// The family. "Admin" in conversation is the `owner` role in the contract —
// owner reaches /portal/admin and is the only role that reaches /portal/staff.
// NOTE: provisioning overwrites each account's existing users doc, so the
// gmail account's previous owner role becomes athlete by design.
// ---------------------------------------------------------------------------

const HOUSEHOLD_ID = 'mackbee';
const ATHLETE_ID = 'makel-test';
const PACKAGE_ID = 'g-8-3'; // 8 training + 3 tournaments / month

const FAMILY = [
  { email: 'makel@rypgolf.com',      role: 'owner',   displayName: 'Makel' },
  { email: 'makelmackbee@gmail.com', role: 'athlete', displayName: 'Makel MackBee' },
  { email: 'makelmackbee@live.com',  role: 'parent',  displayName: 'Makel' },
  { email: 'makel@pixelcaddie.com',  role: 'coach',   displayName: 'Coach Makel' },
];

function userDoc({ role, displayName, email }) {
  const staff = role === 'coach' || role === 'owner';
  return {
    role,
    athleteId: role === 'athlete' ? ATHLETE_ID : null,
    householdId: role === 'athlete' || role === 'parent' ? HOUSEHOLD_ID : null,
    staff,
    displayName,
    email,
  };
}

// ---------------------------------------------------------------------------
// Packages — bundled from frontend source with esbuild, the seed's pattern.
// ---------------------------------------------------------------------------

function loadPackages() {
  const dataDir = path.join(repoRoot, 'frontend', 'src', 'portal', 'data');
  const tmp = mkdtempSync(path.join(tmpdir(), 'ryp-provision-'));
  const entry = path.join(tmp, 'entry.js');
  const outfile = path.join(tmp, 'packages.cjs');
  const fwd = (p) => p.split(path.sep).join('/');

  writeFileSync(
    entry,
    `export { GOLF_PACKAGES, DROP_IN, FITNESS_PACKAGES, ELITE_TIERS } from '${fwd(path.join(dataDir, 'packages.js'))}';`
  );
  try {
    execSync(
      `npx esbuild "${entry}" --bundle --format=cjs --platform=node --outfile="${outfile}" --log-level=warning`,
      { stdio: ['ignore', 'inherit', 'inherit'], cwd: repoRoot }
    );
  } catch {
    console.error('\nesbuild bundling failed — install frontend deps first (cd frontend && npm install).');
    process.exit(1);
  }
  const { GOLF_PACKAGES, DROP_IN, FITNESS_PACKAGES, ELITE_TIERS } = createRequire(import.meta.url)(outfile);
  rmSync(tmp, { recursive: true, force: true });

  const packages = new Map();
  const fields = ({ id, price, ...rest }) => rest; // price stripped, id -> doc id
  for (const p of GOLF_PACKAGES) packages.set(p.id, { ...fields(p), kind: 'golf' });
  packages.set(DROP_IN.id, { ...fields(DROP_IN), kind: 'drop-in' });
  for (const p of FITNESS_PACKAGES) packages.set(p.id, { ...fields(p), kind: 'fitness' });
  for (const p of ELITE_TIERS) packages.set(p.id, { ...fields(p), kind: 'elite' });
  return packages;
}

// ---------------------------------------------------------------------------
// Auth-uid lookup — Identity Toolkit admin API, same IAM principal.
// ---------------------------------------------------------------------------

async function lookupUids(token, emails) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ email: emails }),
    }
  );
  if (!res.ok) {
    console.error(`Account lookup failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  const body = await res.json();
  const byEmail = new Map();
  for (const u of body.users || []) {
    if (u.email) byEmail.set(u.email.toLowerCase(), u.localId);
  }
  return byEmail;
}

// ---------------------------------------------------------------------------
// Firestore REST encoding + commit (production).
// ---------------------------------------------------------------------------

function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === 'object') return { mapValue: { fields: fsFields(v) } };
  throw new Error(`Unsupported value type: ${typeof v}`);
}
const fsFields = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fsValue(v)]));

async function commit(token, writes) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ writes }),
    }
  );
  if (!res.ok) {
    console.error(`Commit failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`TARGET: PRODUCTION Firestore (project ${PROJECT_ID})${DRY_RUN ? ' — dry run, read-only' : ''}\n`);
  const token = await prodAccessToken();

  const uidByEmail = await lookupUids(token, FAMILY.map((f) => f.email));
  const found = [];
  const missing = [];
  for (const member of FAMILY) {
    const uid = uidByEmail.get(member.email.toLowerCase()) ?? null;
    (uid ? found : missing).push({ ...member, uid });
  }
  for (const m of found) console.log(`  ${m.email} -> uid ${m.uid} (${m.role})`);
  for (const m of missing)
    console.log(`  ${m.email} -> NO AUTH RECORD (${m.role}) — sign in once at /portal/signin, then re-run.`);

  const coach = found.find((m) => m.role === 'coach') ?? null;
  const packages = loadPackages();

  const docs = []; // [collection, id, doc]
  for (const [id, doc] of packages) docs.push(['packages', id, doc]);
  docs.push([
    'households',
    HOUSEHOLD_ID,
    {
      name: 'MackBee',
      guardian: { name: 'Makel', email: 'makelmackbee@live.com', phone: null },
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    },
  ]);
  docs.push([
    'athletes',
    ATHLETE_ID,
    {
      name: 'Makel MackBee',
      dob: null,
      householdId: HOUSEHOLD_ID,
      packageId: PACKAGE_ID,
      contractMinutes: 45,
      coachId: coach ? coach.uid : null, // filled on re-run once the coach signs in
    },
  ]);
  for (const m of found) docs.push(['users', m.uid, userDoc(m)]);

  console.log(`\nPlan: ${docs.length} doc(s) — ${packages.size} packages, 1 household, 1 athlete, ${found.length} users`);
  for (const [col, id, doc] of docs) {
    if (col !== 'packages') console.log(`  ${col}/${id}: ${JSON.stringify(doc)}`);
  }
  if (!coach) console.log('  note: athletes/' + ATHLETE_ID + '.coachId is null until the coach account exists.');

  if (DRY_RUN) {
    console.log('\n[dry-run] nothing written.');
    return;
  }

  const writes = docs.map(([col, id, doc]) => ({
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${col}/${id}`,
      fields: fsFields(doc),
    },
  }));
  const BATCH = 400;
  for (let i = 0; i < writes.length; i += BATCH) {
    await commit(token, writes.slice(i, i + BATCH));
    console.log(`committed ${Math.min(i + BATCH, writes.length)}/${writes.length}`);
  }
  console.log(`Done. ${missing.length ? `Re-run after the ${missing.length} missing account(s) sign in.` : 'All four accounts provisioned.'}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
