import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function dryRun() {
  const env = { ...process.env };
  delete env.FIRESTORE_EMULATOR_HOST; // no target: the script diffs against an empty map
  return spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts', 'sync-calendar-sessions.mjs'),
    '--from', '2026-01-05', '--to', '2026-01-10', '--dry-run',
    '--fixture', 'scripts/fixtures/gcal-sample-events.json',
  ], { cwd: repoRoot, encoding: 'utf8', env });
}

test('durationMinutes comes from the event end time (regex fix at sync:317)', () => {
  const r = dryRun();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /session 2026-01-10-0: \{[^\n]*"durationMinutes":120[^\n]*"type":"tournament"/);
  assert.match(r.stdout, /session 2026-01-08-0: \{[^\n]*"durationMinutes":45[^\n]*"type":"phil"[^\n]*"label":"Phil - performance block"/);
  assert.match(r.stdout, /session 2026-01-05-0: \{[^\n]*"time":"3:00 PM"[^\n]*"durationMinutes":60/);
});

test('Yannick / mental titles are display-only: never a session, counted as skipped', () => {
  const r = dryRun();
  assert.doesNotMatch(r.stdout, /"type":"mental"/);
  assert.match(r.stdout, /Window 2026-01-05\.\.2026-01-10: 4 bookable, 1 all-day skipped, 3 display-only skipped/);
});
