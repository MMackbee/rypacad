import { test } from 'node:test';
import assert from 'node:assert/strict';
import { householdsToExport } from '../export-memberships.mjs';

// Assessments plan, Addendum 2 (owner, 2026-10-15): staging shares the
// production database, so the staging test family (test: true) sits beside
// real households; the membership export leaves it out like every report.
test('a test household (test: true) is never exported; the real household beside it is', () => {
  const real = { id: 'kim', name: 'Kim family', membership: { status: 'active' } };
  const testFamily = { id: 'ryp-test-family', name: 'RYP Test Family', test: true };
  assert.deepEqual(householdsToExport([testFamily, real]).map((h) => h.id), ['kim']);
});

test('only test === true marks a test household; order is kept', () => {
  const rows = [{ id: 'lee', test: 'yes' }, { id: 'ng', test: false }, { id: 'ryp-test-family', test: true }, { id: 'ota' }];
  assert.deepEqual(householdsToExport(rows).map((h) => h.id), ['lee', 'ng', 'ota']);
  assert.deepEqual(householdsToExport([]), []);
});
