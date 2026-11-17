/**
 * The one request that opens the facility door (spec 1 and 5.2 step 7):
 * a POST with no body to the Avigilon Alta API link the owner generated
 * for the "Portal door - DO NOT DELETE" user's Cloud Key, kept in the
 * Secret Manager secret ALTA_UNLOCK_URL. No Alta login or JWT is needed:
 * whoever holds the link can open the door until its end date, so the
 * link, and the token inside it, never leave this module - not in a log
 * line, an error, its cause, a result or a stored document. Callers get a
 * reason code, a status number and, for a refused request, what Alta said
 * with the link and anything token-like cut out (saidBy), nothing else.
 *
 * The emulator NEVER makes the request (review 2026-11-17, server-1 and
 * spec-1): an emulator whose functions/.secret.local lacks ALTA_UNLOCK_URL
 * reads the real link from Secret Manager, so under FUNCTIONS_EMULATOR the
 * answer is a fake 204 when DOOR_FAKE_ALTA is '1' and 'misconfigured'
 * otherwise - fail closed, with no opt-in to the real door. Production
 * sets neither variable; there DOOR_FAKE_ALTA means nothing.
 */
'use strict';

/** No answer by then is `alta-timeout`. @const {number} */
const ALTA_TIMEOUT_MS = 6000;
const ALTA_HOSTS = ['api.openpath.com', 'api.eu.openpath.com'];
const UNLOCK_PATH = /^\/tokens\/cloudKeyUnlockTokens\/[^/]+\/use$/;
const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,40}$/;

/**
 * The API link, checked: https, port 443, no user info, query or
 * fragment, on an Alta API host, with the unlock-token path.
 * @param {*} raw The secret's value.
 * @return {?string} The link to POST to, or null when it is not one.
 */
function unlockUrl(raw) {
  if (typeof raw !== 'string') return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch (err) {
    return null;
  }
  const ok = url.protocol === 'https:' && ALTA_HOSTS.includes(url.hostname) &&
      url.port === '' && url.username === '' && url.password === '' &&
      url.search === '' && url.hash === '' && UNLOCK_PATH.test(url.pathname);
  return ok ? url.href : null;
}

/**
 * @param {!Object} env The environment.
 * @return {boolean} Whether this runs in the functions emulator: any
 *     FUNCTIONS_EMULATOR value but empty, 'false' or '0' (fail closed).
 */
function inEmulator(env) {
  const v = env.FUNCTIONS_EMULATOR;
  return typeof v === 'string' && v.trim() !== '' &&
      !['false', '0'].includes(v.trim().toLowerCase());
}

/**
 * Something about a failed request that is safe to log: the error's name
 * and, when it is a plain system code such as ECONNRESET, its cause's
 * code. Never a message: a message can carry the link.
 * @param {*} err What fetch threw.
 * @return {string} e.g. 'TypeError ECONNREFUSED'.
 */
function failureLabel(err) {
  const name = err && typeof err.name === 'string' &&
      /^[A-Za-z]{1,40}$/.test(err.name) ? err.name : 'Error';
  const code = err && err.cause && err.cause.code;
  return typeof code === 'string' && SAFE_CODE.test(code) ?
      `${name} ${code}` : name;
}

/**
 * Lets go of a response body nobody reads.
 * @param {*} res The response.
 */
function discard(res) {
  const body = res && res.body;
  if (body && typeof body.cancel === 'function') {
    body.cancel().catch(() => {});
  }
}

/**
 * What Alta said about a refused request, safe to log (2026-11-17: the
 * first live presses got a bare 400; Alta words a bad link as "Token error
 * (...)"). The link, its token and any run of 20 or more link-like
 * characters are cut out, then only plain characters stay, at most 120.
 * Reading the body is under the same 6 s abort as the request.
 * @param {*} res The response.
 * @param {string} href The link that was POSTed to.
 * @return {!Promise<?string>} The words, or null when there are none.
 */
async function saidBy(res, href) {
  let text;
  try {
    if (!res || typeof res.text !== 'function') return null;
    text = String(await res.text()).slice(0, 4000);
  } catch (err) {
    return null;
  }
  let words = text;
  try {
    const body = JSON.parse(text);
    if (body && typeof body.message === 'string') words = body.message;
    else if (body && typeof body.error === 'string') words = body.error;
  } catch (err) {
    // Not JSON: the text itself.
  }
  const token = href.split('/').slice(-2)[0];
  const clean = words.split(href).join(' ').split(token).join(' ')
      .replace(/[A-Za-z0-9_\-.%+/=~]{20,}/g, '[cut]')
      .replace(/[^A-Za-z0-9 ().,:;'_\-[\]]/g, ' ')
      .replace(/\s+/g, ' ').trim().slice(0, 120);
  return clean || null;
}

/**
 * Opens the door: one POST, no body, no retry, aborted at 6 s.
 * @param {{fetch: !Function, env: !Object}} deps The fetch and the
 *     environment holding ALTA_UNLOCK_URL.
 * @return {!Promise<{ok: boolean, reason: ?string, status: ?number,
 *     latencyMs: ?number, fake: boolean, failure: ?string}>} `reason` is
 *     null when the door opened, else 'misconfigured' | 'alta-error' |
 *     'alta-timeout'; `failure` is a log-safe label for a thrown request.
 *     A refused request also has `said`, what Alta said (saidBy) or null.
 */
async function openDoor(deps) {
  const none = {status: null, latencyMs: null, fake: false, failure: null,
    said: null};
  if (inEmulator(deps.env)) {
    if (deps.env.DOOR_FAKE_ALTA === '1') {
      return Object.assign({}, none, {ok: true, reason: null, status: 204,
        latencyMs: 0, fake: true});
    }
    return Object.assign({}, none, {ok: false, reason: 'misconfigured',
      failure: 'emulator'});
  }
  const href = unlockUrl(deps.env.ALTA_UNLOCK_URL);
  if (!href) {
    return Object.assign({}, none, {ok: false, reason: 'misconfigured'});
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ALTA_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await deps.fetch(href, {method: 'POST',
      signal: controller.signal});
    const latencyMs = Date.now() - started;
    const status = res && Number.isInteger(res.status) ? res.status : null;
    const ok = status !== null && status >= 200 && status < 300;
    if (ok) {
      discard(res);
      return Object.assign({}, none, {ok, reason: null, status, latencyMs});
    }
    const said = await saidBy(res, href);
    return Object.assign({}, none, {ok, reason: 'alta-error', status,
      latencyMs, said});
  } catch (err) {
    return Object.assign({}, none, {ok: false,
      reason: controller.signal.aborted ? 'alta-timeout' : 'alta-error',
      latencyMs: Date.now() - started, failure: failureLabel(err)});
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {ALTA_TIMEOUT_MS, openDoor, unlockUrl};
