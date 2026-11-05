/**
 * The consent status mirror runs the shared case table the client runs too
 * (functions/test/fixtures/consent-status-cases.json).
 *   node portal/mental-consent-status.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {test, run} = require('./tiny');
const S = require('./mental-consent-status');

const CASES = require('../test/fixtures/consent-status-cases.json');

test('consentStatusFor: the shared table', () => {
  assert.equal(CASES.length, 13);
  for (const c of CASES) {
    assert.equal(S.consentStatusFor(c.athlete, c.record, c.utcToday), c.want,
        c.label);
  }
});

test('utcToday: the UTC date; 6 PM in Chicago is already tomorrow', () => {
  assert.equal(S.utcToday(new Date('2026-11-05T23:59:59Z')), '2026-11-05');
  assert.equal(S.utcToday(new Date('2026-11-06T00:00:00Z')), '2026-11-06');
});

test('ageOn and isAdultOn: string arithmetic, Feb 29 turns 18 on Mar 1',
    () => {
      assert.equal(S.ageOn('2008-02-29', '2026-02-28'), 17);
      assert.equal(S.ageOn('2008-02-29', '2026-03-01'), 18);
      assert.equal(S.ageOn('June 2010', '2026-11-05'), null);
      assert.equal(S.ageOn(null, '2026-11-05'), null);
      assert.equal(S.isAdultOn('2008-11-05', '2026-11-05'), true);
      assert.equal(S.isAdultOn('2008-11-06', '2026-11-05'), false);
      assert.equal(S.isAdultOn(null, '2026-11-05'), false);
    });

test('isAdultRecord: adult true or an adultSignature', () => {
  assert.equal(S.isAdultRecord({adult: true, adultSignature: null}), true);
  assert.equal(S.isAdultRecord({adult: false, adultSignature: {name: 'M'}}),
      true);
  assert.equal(S.isAdultRecord({adult: false, adultSignature: null}), false);
  assert.equal(S.isAdultRecord(null), false);
});

test('the client copy carries the same function and runs the same table',
    () => {
      // The functions lane; Task 19 runs it live.
      if (process.env.SKIP_CLIENT_MIRROR) return;
      const dir = path.join(__dirname, '../../frontend/src/portal/data');
      assert.match(fs.readFileSync(path.join(dir, 'mentalConsent.js'), 'utf8'),
          /export function consentStatusFor\(athlete, record, utcTodayISO\)/);
      assert.match(
          fs.readFileSync(path.join(dir, 'mentalConsent.test.js'), 'utf8'),
          /consent-status-cases\.json/);
    });

run();
