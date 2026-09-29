#!/usr/bin/env node
/**
 * Write Stripe price ids (and the 30-day window) onto packages/{id}.
 *
 *   node scripts/write-packages.mjs --mode test --dry-run            # plan (emulator, or no target)
 *   npm run packages:emulator -- --mode test --yes                   # write the emulator
 *   node scripts/write-packages.mjs --prod --mode test --dry-run     # production plan (owner)
 *   node scripts/write-packages.mjs --prod --mode live --yes         # production write (owner)
 *
 * Contract v3.0.1 (docs/portal/SPRINT-20-LAUNCH.md 4.1; plans/.../01-interfaces.md
 * 6.5, 7.1-7.2): the ONLY writer of packages.stripePriceId. The single source is
 * functions/config/stripe-catalogue.json ({ test: {...}, live: {...} }, price ids
 * are public) - it lives under functions/ because `firebase deploy` packages
 * only that folder and functions/portal/catalogue.js reads the same file.
 * Each write is packages/{id} with updateMask ['stripePriceId', 'windowDays']
 * and nothing else: never households (provision-family.mjs full-replaces
 * those), never a create (a missing packages doc is a refusal, so a partial
 * doc can never appear). windowDays comes from the seam (ALL_PACKAGES) and is
 * asserted against the ruling (token 30 / elite 45) so the script cannot run
 * before the routing lane's packages.js change is merged.
 *
 * Production auth is scripts/lib/prod-auth.mjs (the CLI login), the same
 * mechanism every sanctioned writer uses; a prod write needs --yes.
 * Dependency-free (Node >= 20 global fetch), Firestore REST via lib/.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleFrontend, fwdPath } from './lib/bundle-frontend.mjs';
import { resolveTarget, getDoc, commit, docName, fsFields } from './lib/firestore-rest.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(repoRoot, 'frontend', 'src', 'portal', 'data');

export const CATALOGUE_PATH = path.join(repoRoot, 'functions', 'config', 'stripe-catalogue.json');
export const FACILITY_KEY = 'facility-access';
export const CATALOGUE_KEYS = ['t-6', 't-12', 't-16', 'elite', 'single', FACILITY_KEY];
export const PRICE_ID_RE = /^price_[A-Za-z0-9]{8,}$/;
// Spec 5 / interfaces 3.2: the ruling the seam must already state.
export const EXPECTED_WINDOW = { tokens: 30, single: 30, elite: 45 };
const MASK = ['stripePriceId', 'windowDays'];

export function parseArgs(argv) {
  const has = (f) => argv.includes(f);
  const after = (f) => { const i = argv.indexOf(f); return i > -1 ? argv[i + 1] ?? null : null; };
  const mode = after('--mode');
  if (mode !== 'test' && mode !== 'live') return { error: 'Usage: --mode test|live is required.' };
  const dryRun = has('--dry-run');
  const yes = has('--yes');
  if (dryRun === yes) return { error: 'Pass exactly one of --dry-run (plan only) or --yes (write).' };
  return { prod: has('--prod'), mode, dryRun, yes, catalogue: after('--catalogue') };
}

export function loadCatalogue(file) {
  const cat = JSON.parse(readFileSync(file, 'utf8'));
  for (const mode of ['test', 'live']) {
    if (!cat[mode] || typeof cat[mode] !== 'object') throw new Error(`${file}: missing "${mode}" block`);
  }
  return cat;
}

/** Pure: catalogue + seam packages -> { plan, problems }. Any problem empties the plan. */
export function planPackageWrites(catalogue, mode, packages) {
  const map = catalogue[mode] || {};
  const byId = new Map(packages.map((p) => [p.id, p]));
  const plan = [];
  const problems = [];
  for (const [key, priceId] of Object.entries(map)) {
    if (key === FACILITY_KEY) continue; // no packages doc; the functions read it straight from the JSON
    const pkg = byId.get(key);
    if (!pkg) { problems.push(`${mode}.${key}: not an ALL_PACKAGES id`); continue; }
    if (priceId === null || priceId === undefined) { problems.push(`${mode}.${key}: price id missing (null) - paste it into the catalogue first`); continue; }
    if (typeof priceId !== 'string' || !PRICE_ID_RE.test(priceId)) { problems.push(`${mode}.${key}: ${JSON.stringify(priceId)} is not a Stripe price id`); continue; }
    const expected = EXPECTED_WINDOW[pkg.kind];
    if (pkg.windowDays !== expected) { problems.push(`${key}: packages.js windowDays is ${pkg.windowDays}, expected ${expected} (merge the routing lane's packages.js first)`); continue; }
    plan.push({ id: key, stripePriceId: priceId, windowDays: pkg.windowDays });
  }
  for (const p of packages) if (!(p.id in map)) problems.push(`${mode} catalogue has no entry for package "${p.id}"`);
  return { plan: problems.length ? [] : plan, problems };
}
