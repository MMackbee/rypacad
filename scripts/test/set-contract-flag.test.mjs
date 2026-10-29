import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWrite, enabledAtFor, main, parseArgs } from '../set-contract-flag.mjs';
import { commit, docName, fsFields, getDoc, resolveTarget } from '../lib/firestore-rest.mjs';

test('parseArgs: exactly one of --on | --off and one of --dry-run | --yes', () => {
  assert.ok(parseArgs(['--on']).error);
  assert.ok(parseArgs(['--dry-run']).error);
  assert.ok(parseArgs(['--on', '--off', '--yes']).error);
  assert.ok(parseArgs(['--on', '--dry-run', '--yes']).error);
  assert.ok(parseArgs(['--on', '--dry-run', '--force']).error);
  assert.deepEqual(parseArgs(['--prod', '--on', '--dry-run']), { prod: true, on: true, dryRun: true, yes: false });
  assert.deepEqual(parseArgs(['--off', '--yes']), { prod: false, on: false, dryRun: false, yes: true });
});

test('buildWrite: enabled with the date on, enabled false with null off; a re-run keeps the date', () => {
  const on = buildWrite({ on: true, today: '2026-11-10' });
  assert.equal(on.update.name, docName('config', 'contract'));
  assert.deepEqual(on.update.fields, fsFields({ enabled: true, enabledAt: '2026-11-10' }));
  assert.equal(on.updateMask, undefined);
  assert.deepEqual(buildWrite({ on: false, today: '2026-11-10' }).update.fields, fsFields({ enabled: false, enabledAt: null }));
  // Already on: a second --on keeps enabledAt (the overdue clock), whatever today is.
  const again = buildWrite({ on: true, today: '2026-11-17', current: { enabled: true, enabledAt: '2026-11-10' } });
  assert.deepEqual(again.update.fields, fsFields({ enabled: true, enabledAt: '2026-11-10' }));
  assert.equal(enabledAtFor({ on: true, today: '2026-11-17', current: { enabled: true, enabledAt: '2026-11-10' } }), '2026-11-10');
  // Off, or on without a usable date: today.
  assert.equal(enabledAtFor({ on: true, today: '2026-11-17', current: { enabled: false, enabledAt: null } }), '2026-11-17');
  assert.equal(enabledAtFor({ on: true, today: '2026-11-17', current: { enabled: true, enabledAt: null } }), '2026-11-17');
  assert.equal(enabledAtFor({ on: true, today: '2026-11-17', current: null }), '2026-11-17');
  assert.equal(enabledAtFor({ on: false, today: '2026-11-17', current: { enabled: true, enabledAt: '2026-11-10' } }), null);
});

test('against the emulator: dry-run writes nothing, --yes writes and reads back, a second --on keeps enabledAt', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const t = await resolveTarget({ prod: false });
  await commit(t, [{ delete: docName('config', 'contract') }]).catch(() => {});
  assert.equal(await main(['--on', '--dry-run'], { today: '2026-11-10' }), 0);
  assert.equal(await getDoc(t, 'config', 'contract'), null);
  assert.equal(await main(['--on', '--yes'], { today: '2026-11-10' }), 0);
  assert.deepEqual(await getDoc(t, 'config', 'contract'), { enabled: true, enabledAt: '2026-11-10' });
  assert.equal(await main(['--on', '--yes'], { today: '2026-11-17' }), 0);
  assert.deepEqual(await getDoc(t, 'config', 'contract'), { enabled: true, enabledAt: '2026-11-10' });
  assert.equal(await main(['--off', '--yes'], { today: '2026-11-18' }), 0);
  assert.deepEqual(await getDoc(t, 'config', 'contract'), { enabled: false, enabledAt: null });
  assert.equal(await main(['--on', '--yes'], { today: '2026-11-19' }), 0);
  assert.deepEqual(await getDoc(t, 'config', 'contract'), { enabled: true, enabledAt: '2026-11-19' });
});
