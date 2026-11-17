/**
 * Test support for door.test.js and door-alta.test.js: a household that
 * may open the door, a stand-in Alta that records every request, and one
 * press through unlockDoorHandler with every console call captured. No
 * test reaches Alta. Nothing in index.js requires this file.
 */
'use strict';

const {fakeDb} = require('./fake-firestore');
const {DOOR_TERMS_VERSION} = require('./door-decide');

/** 4 PM on Nov 17 in Chicago. */
const NOW = new Date('2026-11-17T22:00:00Z');
const TOKEN = 'tok-9f8e7d6c5b4a3921-never-logged';
const URL_OK = `https://api.openpath.com/tokens/cloudKeyUnlockTokens/${TOKEN}/use`;
const ENV = {ALTA_UNLOCK_URL: URL_OK};
const AUTH = {uid: 'u-dana', token: {email: 'dana@example.com'}};
/** At the academy's door, a 15 m fix. */
const HERE = {lat: 44.9, lng: -93.4, accuracy: 15};
const CONFIG = {mode: 'all', lat: 44.9, lng: -93.4, radiusM: 200,
  openSeconds: 5, updatedAt: null, updatedByUid: 'u-owner'};
const CONSOLE = ['log', 'info', 'warn', 'error', 'debug'];

/**
 * A parent of a paid Elite athlete who signed the door rules, plus the
 * academy's door settings. `over` replaces or (with null) removes docs.
 * @param {!Object=} over `{'collection/id': body | null}`.
 * @return {!Object} The fake-firestore map.
 */
function familyDocs(over) {
  const docs = {
    'users/u-dana': {role: 'parent', householdId: 'hh', athleteId: null,
      displayName: 'Dana Hart', email: 'dana@example.com'},
    'households/hh': {name: 'Hart family'},
    'athletes/ath-remy': {householdId: 'hh', name: 'Remy Hart',
      packageId: 'elite', dob: '2012-03-04', billing: {status: 'active'}},
    'doorConfig/main': Object.assign({}, CONFIG),
    'doorRules/u-dana': {uid: 'u-dana', householdId: 'hh', athleteId: null,
      role: 'parent', adult: true, name: 'Dana Hart',
      termsVersion: DOOR_TERMS_VERSION, signedAt: null, signedAtMs: 1},
  };
  for (const [path, body] of Object.entries(over || {})) {
    if (body === null) delete docs[path];
    else docs[path] = body;
  }
  return docs;
}

/**
 * A stand-in Alta. `status` answers every POST; `throws` rejects the way a
 * network failure does, with the full URL in the message and the cause;
 * `hang` answers only when the request is aborted.
 * @param {{status: (number|undefined), throws: (boolean|undefined),
 *     hang: (boolean|undefined)}=} opts The behaviour.
 * @return {{fetch: !Function, calls: !Array<!Object>}} The fake.
 */
function fakeAlta(opts) {
  const o = opts || {};
  const calls = [];
  const fetch = (url, init) => {
    calls.push({url, init});
    if (o.throws) {
      const cause = new Error(`connect ECONNREFUSED ${url}`);
      cause.code = 'ECONNREFUSED';
      return Promise.reject(new TypeError(`fetch failed: ${url}`, {cause}));
    }
    if (o.hang) {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error(`The operation was aborted: ${url}`);
          err.name = 'AbortError';
          reject(err);
        });
      });
    }
    const status = o.status || 204;
    return Promise.resolve({ok: status >= 200 && status < 300, status,
      statusText: `answer for ${url}`, body: null});
  };
  return {fetch, calls};
}

/**
 * One call through the handler, console captured.
 * @param {*} data The payload.
 * @param {!Object=} opts `{docs, alta, env, auth, now}`; pass the same
 *     `docs` map to chain presses.
 * @return {!Promise<!Object>} `{result, error, docs, calls, logs}`.
 */
async function press(data, opts) {
  const {unlockDoorHandler} = require('./door');
  const o = opts || {};
  const docs = o.docs || familyDocs();
  const alta = o.alta || fakeAlta();
  const logs = [];
  const keep = {};
  for (const k of CONSOLE) {
    keep[k] = console[k];
    console[k] = (...a) => logs.push(a.map(String).join(' '));
  }
  let result = null;
  let error = null;
  try {
    result = await unlockDoorHandler(data,
        {auth: 'auth' in o ? o.auth : AUTH},
        {db: fakeDb(docs), fetch: alta.fetch, env: o.env || ENV,
          now: o.now || NOW});
  } catch (err) {
    error = err;
  } finally {
    for (const k of CONSOLE) console[k] = keep[k];
  }
  return {result, error, docs, calls: alta.calls, logs};
}

/**
 * @param {number} ms Milliseconds after NOW.
 * @return {!Date} That instant.
 */
const later = (ms) => new Date(NOW.getTime() + ms);

/**
 * A fresh, valid press.
 * @param {string=} pressId The id (default 'press-0001').
 * @param {*=} location The location (default HERE).
 * @return {!Object} The payload.
 */
const unlock = (pressId, location) =>
  ({pressId: pressId || 'press-0001',
    location: location === undefined ? HERE : location});

module.exports = {AUTH, CONFIG, ENV, HERE, NOW, TOKEN, URL_OK, fakeAlta,
  familyDocs, later, press, unlock};
