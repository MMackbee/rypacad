#!/usr/bin/env node
/**
 * Provision the test family in PRODUCTION Firestore — every doc the four
 * role surfaces need to actually function, not just route:
 *
 *   node scripts/provision-family.mjs --dry-run   # look up accounts, print the plan
 *   node scripts/provision-family.mjs             # write it
 *
 * CONTRACT v2.0 (Sprint 12 pin, "the token model", Part 1 only): ONE token
 * catalogue (t-6/t-12/t-16/elite/single; t-20 retired v2.0.1) replaces the two-pool
 * golf/fitness/elite-247/drop-in catalogue. Production is the ONE place
 * prices reach Firestore (v1.1 rule — seed-firestore.mjs strips price, this
 * script doesn't), so this bundle keeps `price` and the new `pending` flag
 * on every package doc. The ten retired ids (see RETIRED_PACKAGE_IDS below)
 * are explicit **deletes** in the plan, since pin A retires them outright.
 *
 * What it writes (data contract, docs/portal/DATA-MODEL.md):
 *   packages     — the full token catalogue (six docs, prices included),
 *                  bundled from frontend/src/portal/data/packages.js exactly
 *                  as seed-firestore.mjs bundles it (never retyped) — PLUS
 *                  deletes of the ten retired ids above.
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
 *                  brackets read it). The FAMILIES below are the owner's
 *                  fictional tester kids (confirmed 2026-09-14), so their
 *                  dobs are assigned here to spread them across all three
 *                  brackets as of the season start. Contract v1.9 (Sprint
 *                  11 pin A): this script NEVER writes `fitnessPackageId` —
 *                  only the ops/owner Membership editor does. The athlete
 *                  write is `updateMask`-scoped to exactly the fields above
 *                  (ATHLETE_UPDATE_MASK, near where the write is built) so a
 *                  re-run can never silently erase a live assignment; see
 *                  that constant's comment for why leaving the key out of
 *                  the object literal alone would not have been enough.
 *   users        — one doc per FAMILY/STAFF account below, keyed by auth uid.
 *                  Contract v1.8 (Sprint 10 pin G) made `notificationPrefs`
 *                  the ONE field a signed-in user self-writes on their own
 *                  users doc. This script never sets it, and — the same
 *                  mechanism as the athletes write — the users write is
 *                  `updateMask`-scoped to exactly the fields userDoc() sets
 *                  (USER_UPDATE_MASK, right after userDoc), so a re-run can
 *                  never erase saved preferences. Every already-resolved
 *                  account is re-written on EVERY run, not just newly
 *                  resolved ones, so this protects each re-run, not only
 *                  the first.
 *   staffInvites — (contract v1.8, Sprint 10 pin E) CONSUMED, not written by
 *                  the script's own data: reads the pending docs the live
 *                  Staff & Roles screen created, resolves each `email` to an
 *                  auth uid the same way FAMILY/STAFF accounts are resolved
 *                  below, writes the resulting `users/{uid}` doc
 *                  ({ role, athleteId: null, householdId: null, staff: true,
 *                  specialistId, displayName, email }), and marks the invite
 *                  `status: 'provisioned'` + `provisionedUid`. The STAFF
 *                  array below stays the seed of record for Yannick/Phil —
 *                  this is a separate, parallel path for invites created
 *                  through the app, not a replacement for it. An invite
 *                  whose email has no auth record yet prints the identical
 *                  "NO AUTH RECORD" line the FAMILY/STAFF accounts do, and is
 *                  left `pending` for the next run.
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
 * in the plan it prints (masked writes touch only their listed fields); it
 * deletes nothing.
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
// /portal/staff. Provisioning re-writes the provisioning-owned fields of each
// account's existing users doc (USER_UPDATE_MASK below); notificationPrefs
// is left exactly as the user saved it.
// Athletes exist independently of logins: an athlete entry with no matching
// account (the MackBee siblings) is an athletes/ doc only.
// ---------------------------------------------------------------------------

// Contract v2.0 (pin A) package mapping below — closest token equivalent,
// not invented: g-8-3 (mid golf tier) -> t-12; g-4-2 (smallest) -> t-6;
// elite -> elite unchanged.
const FAMILIES = [
  {
    householdId: 'mackbee',
    household: { name: 'MackBee', guardian: { name: 'Makel', email: 'makelmackbee@live.com', phone: null } },
    // Fictional tester kids: dobs chosen so the household spans every
    // bracket as of the 2026-11-02 season start (15 / 12 / 9).
    athletes: [
      { id: 'makel-test', name: 'Makel MackBee', packageId: 't-12', contractMinutes: 45, dob: '2011-08-14' }, // was g-8-3
      { id: 'makel-test-2', name: 'Avery MackBee', packageId: 't-6', contractMinutes: 20, dob: '2014-05-22' }, // was g-4-2
      { id: 'makel-test-3', name: 'Quinn MackBee', packageId: 'elite', contractMinutes: 95, dob: '2017-01-18' },
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
    // Fictional tester kid: 12 at season start, turns 13 on 11-27 — exercises
    // the "bracket is fixed as of season start" rule.
    athletes: [
      { id: 'mike-test', name: 'Mike Eisele Jr.', packageId: 't-12', contractMinutes: 45, dob: '2013-11-27' }, // was g-8-3
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

// The fields THIS script is authoritative for on a users doc — exactly the
// keys userDoc() returns, nothing else. Same enforcement as
// ATHLETE_UPDATE_MASK in main(): an `update` Write with no `updateMask` is a
// FULL DOCUMENT REPLACE in the Firestore REST API, so before this mask every
// run replaced each already-resolved account's users doc with these seven
// fields and silently erased `notificationPrefs` — the one field a signed-in
// user self-writes through NotificationPreferences (contract v1.8, Sprint 10
// pin G; rules' diff.hasOnly(['notificationPrefs'])). Verified against the
// emulator the same way the athletes fix was: an unmasked re-run drops the
// field, a masked re-run keeps it, and a masked write still CREATES a
// not-yet-existing doc, so a newly-signed-in account provisions exactly as
// before. Keep this list and userDoc()'s keys in lockstep — a key in the
// mask but absent from the payload is a DELETE of that field, not a no-op.
const USER_UPDATE_MASK = ['role', 'athleteId', 'householdId', 'staff', 'specialistId', 'displayName', 'email'];

// ---------------------------------------------------------------------------
// Packages — bundled from frontend source with esbuild, the seed's pattern.
// Contract v2.0 (pin A): ONE catalogue now (ALL_PACKAGES, above the seam's
// DEPRECATED banner). Unlike seed-firestore.mjs, `price`/`pending` are KEPT
// — production is the one place a real price reaches Firestore (v1.1 rule).
// ---------------------------------------------------------------------------

// The ten retired ids (pin A) may already exist in production from every
// provisioning run before this sprint — listed as explicit DELETES below.
const RETIRED_PACKAGE_IDS = [
  't-20', // v2.0.1 (Sprint 18, 2026-09-17): the 20-token package is retired
  'g-4-2', 'g-8-3', 'g-12-4', 'g-16-4', // golf
  'f-4', 'f-8', 'f-12', 'f-16', // fitness
  'drop-in', 'elite-247',
];

function loadPackages() {
  const dataDir = path.join(repoRoot, 'frontend', 'src', 'portal', 'data');
  const tmp = mkdtempSync(path.join(tmpdir(), 'ryp-provision-'));
  const entry = path.join(tmp, 'entry.js');
  const outfile = path.join(tmp, 'packages.cjs');
  const fwd = (p) => p.split(path.sep).join('/');

  writeFileSync(
    entry,
    `export { ALL_PACKAGES } from '${fwd(path.join(dataDir, 'packages.js'))}';`
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
  const { ALL_PACKAGES } = createRequire(import.meta.url)(outfile);
  rmSync(tmp, { recursive: true, force: true });

  const packages = new Map();
  const fields = ({ id, ...rest }) => rest; // id -> doc id; price/pending KEPT (see header)
  for (const p of ALL_PACKAGES) packages.set(p.id, fields(p));
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

// Decode — the reverse of fsValue/fsFields, needed only for staffInvites
// consumption (contract v1.8, Sprint 10 pin E): this script now READS a
// production collection, not just writes to one.
function parseFsValue(v) {
  if (!v || v.nullValue !== undefined) return null;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(parseFsValue);
  if (v.mapValue !== undefined) return parseFsFields(v.mapValue.fields || {});
  return null;
}
const parseFsFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, parseFsValue(v)]));

/**
 * Lists every document in a top-level production Firestore collection,
 * decoded to plain JS objects keyed by doc id. A read, same IAM principal as
 * every write in this script — safe under --dry-run (read-only by design).
 * Paginates via pageToken; staffInvites will never realistically need a
 * second page, but the loop costs nothing and is correct if it ever does.
 */
async function fetchCollection(token, collectionPath) {
  const docs = new Map();
  let pageToken;
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}`
    );
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error(`Reading ${collectionPath} failed (${res.status}): ${await res.text()}`);
      process.exit(1);
    }
    const body = await res.json();
    for (const doc of body.documents || []) {
      docs.set(doc.name.split('/').pop(), parseFsFields(doc.fields || {}));
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return docs;
}

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

  // ---------------------------------------------------------------------
  // staffInvites consumption (contract v1.8, Sprint 10 pin E). Reads the
  // pending docs the live Staff & Roles screen created, resolves each
  // `email` to an auth uid the same way the FAMILY/STAFF accounts above
  // are resolved, and queues a `users/{uid}` write + an invite update
  // (status -> 'provisioned', provisionedUid set). The STAFF array above
  // stays the seed of record for Yannick/Phil — this is a separate,
  // parallel path, not a replacement for it. A read, same as the uid
  // lookups above: safe under --dry-run.
  // ---------------------------------------------------------------------
  console.log('\nStaff invites (contract v1.8):');
  const staffInvites = await fetchCollection(token, 'staffInvites');
  const pendingInvites = [...staffInvites].filter(([, doc]) => doc.status === 'pending');
  const inviteUidByEmail = pendingInvites.length
    ? await lookupUids(token, pendingInvites.map(([, doc]) => doc.email))
    : new Map();
  const inviteDocs = []; // [collection, id, doc] — same shape as `docs` below
  for (const [inviteId, invite] of pendingInvites) {
    const uid = inviteUidByEmail.get(invite.email.toLowerCase()) ?? null;
    if (!uid) {
      console.log(
        `  ${invite.email} -> NO AUTH RECORD (${invite.role}) — create it in Firebase console (Authentication > Add user) or sign in once, then re-run.`
      );
      continue;
    }
    console.log(`  ${invite.email} -> uid ${uid} (${invite.role}, specialist '${invite.specialistId}') — provisioning`);
    inviteDocs.push([
      'users',
      uid,
      {
        role: invite.role,
        athleteId: null,
        householdId: null,
        staff: true,
        specialistId: invite.specialistId ?? null,
        displayName: invite.displayName,
        email: invite.email,
      },
      USER_UPDATE_MASK, // same users write, same protection — see the constant
    ]);
    inviteDocs.push(['staffInvites', inviteId, { ...invite, status: 'provisioned', provisionedUid: uid }]);
  }
  if (pendingInvites.length === 0) console.log('  none pending.');

  // One academy GOLF coach for now: every test athlete rides the same coach
  // uid so rosters and attendance have someone to answer to. Specialist
  // coaches (Phil) are excluded — a specialist link never makes someone an
  // athlete's assigned golf coach.
  const coach = found.find((m) => m.role === 'coach' && !m.specialistId) ?? null;
  const packages = loadPackages();

  // The fields THIS script is authoritative for on an athlete doc. An
  // `update` Write with no `updateMask` is a FULL DOCUMENT REPLACE in the
  // Firestore REST API (verified against the emulator: an omitted field
  // wipes that field if the doc already had it), so this mask is what
  // actually protects anything outside it — e.g. the assignment branch's
  // `updatedAt` (pin B) — from being erased on re-run; leaving a field out
  // of the object literal below is necessary but not sufficient on its own.
  // Contract v2.0 (pin A): `fitnessPackageId` was never in this mask (v1.9)
  // and is now a deleted field schema-wide, so there is nothing to add here.
  const ATHLETE_UPDATE_MASK = ['name', 'dob', 'householdId', 'packageId', 'contractMinutes', 'coachId'];

  const docs = []; // [collection, id, doc, updateMask?]
  for (const [id, doc] of packages) docs.push(['packages', id, doc]);
  // Contract v2.0 (pin A) — the ten retired package ids are explicit
  // DELETES, listed separately from `docs` (a delete write has no `doc` body
  // to encode) but folded into the same plan print and commit batch below.
  const packageDeletes = RETIRED_PACKAGE_IDS;
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
        ATHLETE_UPDATE_MASK,
      ]);
    }
  }
  for (const m of found) docs.push(['users', m.uid, userDoc(m.family, m), USER_UPDATE_MASK]);

  const provisionedInviteCount = inviteDocs.filter(([col]) => col === 'staffInvites').length;
  for (const entry of inviteDocs) docs.push(entry);

  console.log(
    `\nPlan: ${docs.length} doc(s) — ${packages.size} packages (+ ${packageDeletes.length} retired ` +
      `package ids DELETED), ${FAMILIES.length} households, ${athleteCount} athletes, ${found.length} users, ` +
      `${provisionedInviteCount} staffInvites provisioned`
  );
  for (const [col, id, doc, mask] of docs) {
    if (col === 'packages') continue;
    const maskNote = mask ? ` [masked write: ${mask.join(', ')} only — other fields on the live doc are left alone]` : '';
    console.log(`  ${col}/${id}: ${JSON.stringify(doc)}${maskNote}`);
  }
  console.log('  DELETE (contract v2.0, pin A — retired two-pool package ids):');
  for (const id of packageDeletes) console.log(`    packages/${id}`);
  if (!coach) console.log('  note: athlete coachId is null until the coach account exists.');

  if (DRY_RUN) {
    console.log('\n[dry-run] nothing written.');
    return;
  }

  // A doc entry carrying a `mask` (athletes — contract v1.9; users —
  // USER_UPDATE_MASK) commits as a Firestore `updateMask`-scoped write —
  // Firestore leaves every field NOT in the mask untouched on the server,
  // rather than replacing the whole document with exactly what this script
  // sends (the REST API's default `update` behavior when no mask is given,
  // confirmed against the emulator: an unmasked `update` silently drops any
  // field the caller omits). packages/households/staffInvites keep that
  // full-replace default — this script IS the sole owner of those shapes,
  // so a full replace is exactly right for them. users is deliberately NOT
  // in that list: notificationPrefs on a users doc is user-owned.
  const writes = docs.map(([col, id, doc, mask]) => ({
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${col}/${id}`,
      fields: fsFields(doc),
    },
    ...(mask ? { updateMask: { fieldPaths: mask } } : {}),
  }));
  // Contract v2.0 (pin A) — the retired package ids are hard deletes, not
  // writes; a `delete` entry in the same commit batch as every `update` above
  // (the Firestore REST commit endpoint accepts both write kinds together).
  for (const id of packageDeletes) {
    writes.push({ delete: `projects/${PROJECT_ID}/databases/(default)/documents/packages/${id}` });
  }
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
