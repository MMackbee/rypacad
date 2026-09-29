'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {test, run} = require('./tiny');
const {verifyCalendlySignature} = require('./calendly-verify');

const KEY = 'unit-test-signing-key';
const BODY = Buffer.from('{"event":"invitee.created","payload":{"a":1}}');
const T = 1791000000; // unix seconds
const NOW = T * 1000 + 5000;
const sign = (t, body) => crypto.createHmac('sha256', KEY)
    .update(`${t}.`).update(body).digest('hex');
const header = (t, v1) => `t=${t},v1=${v1}`;

test('a fresh, correctly signed body verifies', () => {
  assert.deepEqual(verifyCalendlySignature(BODY, header(T, sign(T, BODY)),
      KEY, NOW), {ok: true, reason: null});
  assert.equal(verifyCalendlySignature(BODY.toString('utf8'),
      header(T, sign(T, BODY)), KEY, NOW).ok, true);
});

test('missing and malformed headers', () => {
  assert.equal(verifyCalendlySignature(BODY, '', KEY, NOW).reason, 'missing');
  assert.equal(verifyCalendlySignature(BODY, null, KEY, NOW).reason,
      'missing');
  assert.equal(verifyCalendlySignature(BODY, 'nonsense', KEY, NOW).reason,
      'malformed');
  assert.equal(verifyCalendlySignature(BODY, 't=abc,v1=zz', KEY, NOW).reason,
      'malformed');
});

test('stale: t more than 300 s from now, either direction', () => {
  const old = T - 301;
  assert.equal(verifyCalendlySignature(BODY, header(old, sign(old, BODY)),
      KEY, NOW).reason, 'stale');
  const future = T + 306;
  assert.equal(verifyCalendlySignature(BODY, header(future,
      sign(future, BODY)), KEY, NOW).reason, 'stale');
  const edge = T - 295;
  assert.equal(verifyCalendlySignature(BODY, header(edge, sign(edge, BODY)),
      KEY, NOW).ok, true);
});

test('mismatch: wrong key, altered body, altered digest', () => {
  assert.equal(verifyCalendlySignature(BODY, header(T, sign(T, BODY)),
      'other-key', NOW).reason, 'mismatch');
  assert.equal(verifyCalendlySignature(Buffer.from('{"x":2}'),
      header(T, sign(T, BODY)), KEY, NOW).reason, 'mismatch');
  const flipped = sign(T, BODY).replace(/^./, (c) => c === 'a' ? 'b' : 'a');
  assert.equal(verifyCalendlySignature(BODY, header(T, flipped), KEY, NOW)
      .reason, 'mismatch');
});

run();
