'use strict';
// unlockDoor's Alta call (spec 5.2 step 7 and 8): the API link's shape,
// the 6 s abort, non-2xx, the emulator-only fake, and that the link and
// its token never appear in a log line, an error, a result or a stored
// document. Alta is door-test-kit's stand-in; no test reaches the network.
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {ALTA_TIMEOUT_MS, unlockUrl} = require('./door-alta');
const {ENV, TOKEN, URL_OK, fakeAlta, familyDocs, press, unlock} =
    require('./door-test-kit');

const EVENT = 'doorEvents/u-dana_press-0001';
const LIMITS = 'doorLimits/u-dana';
const path = `/tokens/cloudKeyUnlockTokens/${TOKEN}/use`;

/**
 * Runs `fn` with setTimeout firing at once, recording each delay asked for.
 * @param {function(): !Promise} fn The body.
 * @return {!Promise<{out: *, delays: !Array<number>}>} Its answer and the
 *     delays.
 */
async function withInstantTimers(fn) {
  const keep = global.setTimeout;
  const delays = [];
  global.setTimeout = (cb, ms) => {
    delays.push(ms);
    return keep(cb, 0);
  };
  try {
    return {out: await fn(), delays};
  } finally {
    global.setTimeout = keep;
  }
}

// ---- the API link's shape ---------------------------------------------------

test('the API link: https, an Alta API host, the unlock-token path', () => {
  assert.equal(unlockUrl(URL_OK), URL_OK);
  assert.equal(unlockUrl(`https://api.eu.openpath.com${path}`),
      `https://api.eu.openpath.com${path}`);
  // Pasted at a prompt: surrounding whitespace and a newline go.
  assert.equal(unlockUrl(`  ${URL_OK}\n`), URL_OK);
});

test('anything else is not an API link', () => {
  for (const raw of [undefined, null, '', 42, 'not a url',
    `http://api.openpath.com${path}`,
    `https://evil.example.com${path}`,
    `https://api.openpath.com.evil.example${path}`,
    `https://openpath.com${path}`,
    `https://user:pw@api.openpath.com${path}`,
    `https://api.openpath.com:8443${path}`,
    `https://api.openpath.com${path}?x=1`,
    `https://api.openpath.com${path}#frag`,
    `https://api.openpath.com/tokens/cloudKeyUnlockTokens/${TOKEN}/unlock`,
    `https://api.openpath.com/tokens/cloudKeyUnlockTokens/${TOKEN}`,
    `https://api.openpath.com/tokens/cloudKeyUnlockTokens//use`,
    `https://api.openpath.com/tokens/cloudKeyUnlockTokens/a/b/use`,
    `https://api.openpath.com/orgs/1/users/2/cloudKeyUnlockTokens/x/use`,
  ]) {
    assert.equal(unlockUrl(raw), null, String(raw));
  }
});

test('a wrong link is misconfigured: no POST, event error, slot back',
    async () => {
      for (const bad of [undefined, `http://api.openpath.com${path}`,
        `https://evil.example.com${path}`,
        `https://api.openpath.com/tokens/cloudKeyUnlockTokens/${TOKEN}/x`]) {
        const docs = familyDocs();
        const r = await press(unlock(), {docs,
          env: {ALTA_UNLOCK_URL: bad}});
        assert.equal(r.error.code, 'failed-precondition', String(bad));
        assert.equal(r.error.details.reason, 'misconfigured');
        assert.equal(r.calls.length, 0);
        assert.equal(docs[EVENT].outcome, 'error');
        assert.equal(docs[EVENT].reason, 'misconfigured');
        assert.deepEqual(docs[LIMITS].opensAtMs, []);
        assert.equal(docs[LIMITS].lastOpenedAtMs, null);
        assert.ok(r.logs.some((l) => /misconfigured/.test(l)));
      }
    });

test('the EU host opens too', async () => {
  const eu = `https://api.eu.openpath.com${path}`;
  const r = await press(unlock(), {env: {ALTA_UNLOCK_URL: eu}});
  assert.equal(r.result.outcome, 'opened');
  assert.equal(r.calls[0].url, eu);
});

// ---- Alta's answer ----------------------------------------------------------

test('any 2xx opens', async () => {
  for (const status of [200, 201, 204]) {
    const r = await press(unlock(), {alta: fakeAlta({status})});
    assert.equal(r.result.outcome, 'opened', String(status));
    assert.equal(r.docs[EVENT].altaStatus, status);
  }
});

test('a non-2xx is alta-error (unavailable) with the status kept', async () => {
  for (const status of [301, 400, 401, 404, 429, 500, 503]) {
    const r = await press(unlock(), {alta: fakeAlta({status})});
    assert.equal(r.error.code, 'unavailable', String(status));
    assert.equal(r.error.details.reason, 'alta-error');
    assert.equal(r.docs[EVENT].outcome, 'error');
    assert.equal(r.docs[EVENT].altaStatus, status);
    assert.deepEqual(r.docs[LIMITS].opensAtMs, []);
    assert.equal(r.calls.length, 1, 'no retry');
  }
});

test('a network failure is alta-error with no status, no retry', async () => {
  const r = await press(unlock(), {alta: fakeAlta({throws: true})});
  assert.equal(r.error.details.reason, 'alta-error');
  assert.equal(r.docs[EVENT].altaStatus, null);
  assert.equal(r.calls.length, 1);
  assert.ok(r.logs.some((l) => /ECONNREFUSED/.test(l)), r.logs.join('\n'));
});

test('no answer: aborted at 6 s, alta-timeout, the slot comes back',
    async () => {
      assert.equal(ALTA_TIMEOUT_MS, 6000);
      const docs = familyDocs();
      const {out: r, delays} = await withInstantTimers(() =>
        press(unlock(), {docs, alta: fakeAlta({hang: true})}));
      assert.deepEqual(delays, [6000]);
      assert.equal(r.calls[0].init.signal.aborted, true);
      assert.equal(r.error.code, 'unavailable');
      assert.equal(r.error.details.reason, 'alta-timeout');
      assert.equal(docs[EVENT].outcome, 'error');
      assert.equal(docs[EVENT].reason, 'alta-timeout');
      assert.deepEqual(docs[LIMITS].opensAtMs, []);
      assert.equal(r.calls.length, 1);
    });

// ---- the emulator fake ------------------------------------------------------

test('emulator fake: FUNCTIONS_EMULATOR true and DOOR_FAKE_ALTA 1 answer 204 ' +
    'with no network and no link', async () => {
  const r = await press(unlock(), {env: {FUNCTIONS_EMULATOR: 'true',
    DOOR_FAKE_ALTA: '1'}});
  assert.equal(r.result.outcome, 'opened');
  assert.equal(r.calls.length, 0);
  assert.equal(r.docs[EVENT].altaStatus, 204);
  assert.ok(r.logs.some((l) => /emulator fake/.test(l)));
});

test('either setting alone, or any other value, still calls Alta', async () => {
  for (const extra of [{FUNCTIONS_EMULATOR: 'true'}, {DOOR_FAKE_ALTA: '1'},
    {FUNCTIONS_EMULATOR: 'true', DOOR_FAKE_ALTA: 'true'},
    {FUNCTIONS_EMULATOR: '1', DOOR_FAKE_ALTA: '1'}]) {
    const r = await press(unlock(), {env: Object.assign({}, ENV, extra)});
    assert.equal(r.result.outcome, 'opened', JSON.stringify(extra));
    assert.equal(r.calls.length, 1, JSON.stringify(extra));
  }
});

test('the fake reads the env the handler was given, never process.env',
    async () => {
      const keep = [process.env.FUNCTIONS_EMULATOR,
        process.env.DOOR_FAKE_ALTA];
      process.env.FUNCTIONS_EMULATOR = 'true';
      process.env.DOOR_FAKE_ALTA = '1';
      try {
        const r = await press(unlock(), {env: ENV});
        assert.equal(r.calls.length, 1);
      } finally {
        for (const [i, k] of ['FUNCTIONS_EMULATOR', 'DOOR_FAKE_ALTA']
            .entries()) {
          if (keep[i] === undefined) delete process.env[k];
          else process.env[k] = keep[i];
        }
      }
    });

// ---- the link and its token never leave the server --------------------------

test('the token and the link appear in no log, error, result or document',
    async () => {
      const scenarios = [
        {},
        {alta: fakeAlta({status: 500})},
        {alta: fakeAlta({status: 404})},
        {alta: fakeAlta({throws: true})},
        {env: {ALTA_UNLOCK_URL: `https://evil.example.com${path}`}},
        {env: {ALTA_UNLOCK_URL: `http://api.openpath.com${path}`}},
        {env: {ALTA_UNLOCK_URL: `${URL_OK}?leak=${TOKEN}`}},
        {env: {ALTA_UNLOCK_URL: `https://api.openpath.com/${TOKEN}`}},
      ];
      const seen = [];
      for (const s of scenarios) {
        const r = await press(unlock(), s);
        seen.push(...r.logs, JSON.stringify(r.result), JSON.stringify(r.docs));
        if (r.error) {
          seen.push(r.error.message, String(r.error.stack),
              JSON.stringify(r.error.details), String(r.error.cause),
              JSON.stringify(r.error.toJSON ? r.error.toJSON() : null));
        }
      }
      const timed = await withInstantTimers(() =>
        press(unlock(), {alta: fakeAlta({hang: true})}));
      const t = timed.out;
      seen.push(...t.logs, t.error.message, String(t.error.stack),
          JSON.stringify(t.error.details), String(t.error.cause));
      assert.ok(seen.length > 20);
      for (const line of seen) {
        assert.equal(line.includes(TOKEN), false, line);
        assert.equal(line.includes('cloudKeyUnlockTokens'), false, line);
      }
    });

run();
