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
 *   athletes     — three MackBee siblings (Sprint 5 pin, TEAM.md), coached by
 *                  the test coach account: the original makel-test account
 *                  athlete plus two siblings so the parent's multi-child
 *                  surfaces (children list, per-child billing) have more
 *                  than one row to render. Only makel-test is linked to a
 *                  login (FAMILY below) — the siblings are athletes/ docs
 *                  with no auth account and no users/ doc, same as any real
 *                  athlete who isn't also a portal login. Each athlete entry
 *                  accepts an optional `dob` (YYYY-MM-DD), written straight
 *                  to the athlete doc (contract v1.6, Sprint 8: age
 *                  brackets read it). The FAMILIES below stay `dob: null` —
 *                  these are REAL kids, and this script never invents a
 *                  real birthday; the owner supplies real dobs later and
 *                  they get filled in here at that point.
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
// The test families. "Admin" in conversation is the `owner` role in the
// contract — owner reaches /portal/admin and is the only role that reaches
// /portal/staff. Provisioning overwrites each account's existing users doc.
// Athletes exist independently of logins: an athlete entry with no matching
// account (the MackBee siblings) is an athletes/ doc only.
// ---------------------------------------------------------------------------

const FAMILIES = [
  {
    householdId: 'mackbee',
    household: { name: 'MackBee', guardian: { name: 'Makel', email: 'makelmackbee@live.com', phone: null } },
    // dob: null — REAL kids. Never invent a real birthday; the owner
    // supplies real dobs later and they land here as a `dob` value per
    // member (see userDoc()/the athletes doc-build loop below).
    athletes: [
      { id: 'makel-test', name: 'Makel MackBee', packageId: 'g-8-3', contractMinutes: 45, dob: null },
      { id: 'makel-test-2', name: 'Avery MackBee', packageId: 'g-4-2', contractMinutes: 20, dob: null },
      { id: 'makel-test-3', name: 'Quinn MackBee', packageId: 'elite', contractMinutes: 95, dob: null },
    ],
    accounts: [
      { email: 'makel@rypgolf.com', role: 'owner', displayName: 'Makel' },
      { email: 'makelmackbee@gmail.com', role: 'athlete', displayName: 'Makel MackBee', athleteId: 'makel-test' },
      { email: 'makelmackbee@live.com', role: 'parent', displayName: 'Makel' },
      { email: 'makel@pixelcaddie.com', role: 'coach', displayName: 'Coach Makel' },
    ],
  },
  // Mike's family (2026-09-01) — a second full tester set.
  {
    householdId: 'eisele',
    household: { name: 'Eisele', guardian: { name: 'Mike', email: 'eisele.mike@gmail.com', phone: null } },
    // dob: null — same rule as MackBee above: real kid, never invented.
    athletes: [
      { id: 'mike-test', name: 'Mike Eisele Jr.', packageId: 'g-8-3', contractMinutes: 45, dob: null },
    ],
    accounts: [
      { email: 'mike@rypgolf.com', role: 'owner', displayName: 'Mike' },
      { email: 'eisele.mike@gmail.com', role: 'parent', displayName: 'Mike' },
      { email: 'eisemi01@yahoo.com', role: 'athlete', displayName: 'Mike Eisele Jr.', athleteId: 'mike-test' },
    ],
  },
];

// Real academy specialists, provisioned OUTSIDE any family (owner's
// direction, 2026-09-11: Yannick and Phil get their own accounts with
// access to the booked-session side). `specialistId` links a staff user to
// the specialist whose sessions they run (== sessions.type, == SPECIALISTS
// ids in frontend/src/portal/data/specialists.js) — the specialist day
// view and the specialist-attendance rule key off it. EMAILS ARE THE
// OWNER'S TO SUPPLY (Yannick books through Calendly today, Phil through
// SignUp Genius — their real addresses are not this script's to invent):
// a null email is skipped with a loud note and the entry provisions
// cleanly on re-run once filled in.
const STAFF = [
  // Real addresses supplied by the owner, 2026-09-11.
  { email: 'yannick@rypgolf.com', role: 'mental', displayName: 'Yannick', specialistId: 'mental' },
  // Phil's sessions run like academy training at a smaller cap (owner,
  // 2026-09-11), so he provisions as a coach with a specialist link — not
  // a second owner. He is never the athletes' assigned golf coach; the
  // coach-selection below excludes specialist coaches on purpose.
  { email: 'phil@rypgolf.com', role: 'coach', displayName: 'Phil', specialistId: 'phil' },
];

function userDoc(family, { role, displayName, email, athleteId, specialistId }) {
  const staff = role === 'coach' || role === 'owner' || role === 'mental' || role === 'ops';
  return {
    role,
    athleteId: role === 'athlete' ? athleteId ?? null : null,
    householdId: role === 'athlete' || role === 'parent' ? family?.householdId ?? null : null,
    staff,
    // Contract v1.7: null for everyone except the two specialists above.
    specialistId: specialistId ?? null,
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

  const staffWithEmail = STAFF.filter((s) => s.email).map((s) => ({ ...s, family: null }));
  for (const s of STAFF.filter((x) => !x.email)) {
    console.log(
      `  ${s.displayName} (${s.role}, specialist '${s.specialistId}') — NO EMAIL YET; skipped. ` +
        `Add the real address to STAFF in this script and re-run.`
    );
  }
  const allAccounts = [
    ...FAMILIES.flatMap((f) => f.accounts.map((a) => ({ ...a, family: f }))),
    ...staffWithEmail,
  ];
  const uidByEmail = await lookupUids(token, allAccounts.map((a) => a.email));
  const found = [];
  const missing = [];
  for (const member of allAccounts) {
    const uid = uidByEmail.get(member.email.toLowerCase()) ?? null;
    (uid ? found : missing).push({ ...member, uid });
  }
  for (const m of found) console.log(`  ${m.email} -> uid ${m.uid} (${m.role})`);
  for (const m of missing)
    console.log(
      `  ${m.email} -> NO AUTH RECORD (${m.role}) — create it in Firebase console (Authentication > Add user) or sign in once, then re-run.`
    );

  // One academy GOLF coach for now: every test athlete rides the same coach
  // uid so rosters and attendance have someone to answer to. Specialist
  // coaches (Phil) are excluded — a specialist link never makes someone an
  // athlete's assigned golf coach.
  const coach = found.find((m) => m.role === 'coach' && !m.specialistId) ?? null;
  const packages = loadPackages();

  const docs = []; // [collection, id, doc]
  for (const [id, doc] of packages) docs.push(['packages', id, doc]);
  let athleteCount = 0;
  for (const f of FAMILIES) {
    docs.push([
      'households',
      f.householdId,
      { ...f.household, stripeCustomerId: null, stripeSubscriptionId: null },
    ]);
    for (const a of f.athletes) {
      athleteCount++;
      docs.push([
        'athletes',
        a.id,
        {
          name: a.name,
          // Contract v1.6: optional per-member dob, written through as-is.
          // Every FAMILIES entry above sets this to null explicitly — this
          // script never invents one; a non-null value only ever gets here
          // because someone edited the athlete entry with a real birthday.
          dob: a.dob ?? null,
          householdId: f.householdId,
          packageId: a.packageId,
          contractMinutes: a.contractMinutes,
          coachId: coach ? coach.uid : null, // filled on re-run once the coach account exists
        },
      ]);
    }
  }
  for (const m of found) docs.push(['users', m.uid, userDoc(m.family, m)]);

  console.log(
    `\nPlan: ${docs.length} doc(s) — ${packages.size} packages, ${FAMILIES.length} households, ${athleteCount} athletes, ${found.length} users`
  );
  for (const [col, id, doc] of docs) {
    if (col !== 'packages') console.log(`  ${col}/${id}: ${JSON.stringify(doc)}`);
  }
  if (!coach) console.log('  note: athlete coachId is null until the coach account exists.');

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
  console.log(
    `Done. ${missing.length ? `Re-run after the ${missing.length} missing account(s) exist.` : 'Every account provisioned.'}`
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
