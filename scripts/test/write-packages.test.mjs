import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs, loadCatalogue, planPackageWrites, CATALOGUE_PATH, CATALOGUE_KEYS, PRICE_ID_RE,
} from '../write-packages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES = [
  { id: 't-6', kind: 'tokens', windowDays: 30 }, { id: 't-12', kind: 'tokens', windowDays: 30 },
  { id: 't-16', kind: 'tokens', windowDays: 30 }, { id: 'elite', kind: 'elite', windowDays: 45 },
  { id: 'single', kind: 'single', windowDays: 30 },
];
const filled = (mode) => ({
  test: {}, live: {},
  [mode]: { 't-6': 'price_1Sample0000t6', 't-12': 'price_1Sample000t12', 't-16': 'price_1Sample000t16',
    elite: 'price_1Sample0elite', single: 'price_1Sample0singl', 'facility-access': 'price_1Sample0facil' },
});

test('parseArgs: mode required, exactly one of --dry-run | --yes', () => {
  assert.ok(parseArgs(['--dry-run']).error);
  assert.ok(parseArgs(['--mode', 'test']).error);
  assert.ok(parseArgs(['--mode', 'test', '--dry-run', '--yes']).error);
  assert.ok(parseArgs(['--mode', 'prod', '--yes']).error);
  assert.deepEqual(parseArgs(['--prod', '--mode', 'live', '--yes']),
    { prod: true, mode: 'live', dryRun: false, yes: true, catalogue: null });
});

test('the committed catalogue has exactly the twelve keys; test ids present, live null or pasted', () => {
  const cat = loadCatalogue(CATALOGUE_PATH);
  for (const mode of ['test', 'live']) {
    assert.deepEqual(Object.keys(cat[mode]).sort(), [...CATALOGUE_KEYS].sort());
  }
  for (const key of CATALOGUE_KEYS) {
    assert.match(cat.test[key], PRICE_ID_RE, `test.${key} was committed in 1b3dc3d - never overwrite it`);
    assert.ok(cat.live[key] === null || PRICE_ID_RE.test(cat.live[key]), `live.${key}`);
  }
  assert.throws(() => loadCatalogue(path.join(here, 'no-such-file.json')));
});

test('planPackageWrites: one row per package, facility-access skipped, window from the seam', () => {
  const { plan, problems } = planPackageWrites(filled('test'), 'test', PACKAGES);
  assert.deepEqual(problems, []);
  assert.deepEqual(plan.map((p) => p.id), ['t-6', 't-12', 't-16', 'elite', 'single']);
  assert.deepEqual(plan.find((p) => p.id === 'elite'), { id: 'elite', stripePriceId: 'price_1Sample0elite', windowDays: 45 });
  assert.equal(plan.find((p) => p.id === 't-6').windowDays, 30);
});

test('planPackageWrites: a null or malformed id is a problem, never a write', () => {
  const cat = filled('live');
  cat.live['t-12'] = null;
  cat.live.single = 'price_REPLACE_ME';
  const { plan, problems } = planPackageWrites(cat, 'live', PACKAGES);
  assert.equal(plan.length, 0, 'any problem empties the plan');
  assert.match(problems.join('\n'), /live\.t-12: price id missing/);
  assert.match(problems.join('\n'), /live\.single: .*not a Stripe price id/);
});

test('planPackageWrites: refuses a seam still on window 32 (routing lane not merged)', () => {
  const stale = PACKAGES.map((p) => (p.id === 't-6' ? { ...p, windowDays: 32 } : p));
  const { plan, problems } = planPackageWrites(filled('test'), 'test', stale);
  assert.equal(plan.length, 0);
  assert.match(problems.join('\n'), /t-6: packages\.js windowDays is 32, expected 30/);
});

test('dry run with no target prints the plan against an unread target and writes nothing', (t) => {
  const env = { ...process.env };
  delete env.FIRESTORE_EMULATOR_HOST;
  const r = spawnSync(process.execPath,
    [path.join(here, '..', 'write-packages.mjs'), '--mode', 'test', '--dry-run',
      '--catalogue', path.join(here, '..', 'fixtures', 'stripe-catalogue-sample.json')],
    { cwd: path.join(here, '..', '..'), encoding: 'utf8', env });
  if (/windowDays is 32/.test(r.stderr)) return t.skip('routing lane packages.js (window 30) not merged yet');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /packages\/t-6: stripePriceId \(unread\) -> price_1Sample0000t6, windowDays \(unread\) -> 30/);
  assert.match(r.stdout, /packages\/elite: .*windowDays \(unread\) -> 45/);
  assert.match(r.stdout, /\[dry-run\] nothing written/);
});

test('a null live block aborts before any target is touched (the sample fixture - the committed file passes this once the owner pastes LIVE ids)', () => {
  const r = spawnSync(process.execPath, [path.join(here, '..', 'write-packages.mjs'), '--mode', 'live', '--dry-run',
    '--catalogue', path.join(here, '..', 'fixtures', 'stripe-catalogue-sample.json')],
    { cwd: path.join(here, '..', '..'), encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /live\.t-6: price id missing/);
});
