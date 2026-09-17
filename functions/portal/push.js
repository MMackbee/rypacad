/**
 * Web push through Firebase Cloud Messaging (contract v2.3, TEAM.md Sprint
 * 15 pins) - the phone channel, replacing SMS.
 *
 * No vendor and no key: the admin SDK sends with the project's own
 * credentials. A device registers by putting its FCM token on the member's
 * `users.pushTokens` list (the client's hooks/push.js, after the browser's
 * permission prompt); this module sends to every token a recipient has and
 * PRUNES the ones FCM reports dead, so a reinstalled browser does not leave
 * a ghost device behind.
 *
 * Unavailable in the Functions emulator (there is no FCM emulator and no
 * credential to call the real one), so there a send records 'skipped' -
 * the same "provider not configured" outcome email uses - unless
 * PUSH_IN_EMULATOR=true opts in with real application-default credentials.
 */

'use strict';

const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');

/** FCM error codes that mean "this token will never work again". */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Where a tapped notification opens when no per-kind link is given. */
const PORTAL_URL = process.env.PORTAL_URL || 'https://rypacad.ryptest.com';

/**
 * Whether this process can reach FCM at all.
 * @return {boolean} True outside the emulator (or opted in inside it).
 */
function pushConfigured() {
  if (process.env.PUSH_DISABLED === 'true') return false;
  if (process.env.FUNCTIONS_EMULATOR === 'true' &&
      process.env.PUSH_IN_EMULATOR !== 'true') {
    return false;
  }
  return true;
}

/**
 * Only string tokens, de-duplicated, order kept.
 * @param {*} tokens Whatever `users.pushTokens` holds.
 * @return {!Array<string>} Usable tokens.
 */
function cleanTokens(tokens) {
  if (!Array.isArray(tokens)) return [];
  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    if (typeof t === 'string' && t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * FCM `data` values must be strings.
 * @param {?Object} data Free-form values.
 * @return {!Object<string, string>} The same keys, stringified, nulls
 *     dropped.
 */
function stringData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

/**
 * Drop dead tokens from a member's list. Best effort; never throws.
 * @param {?string} uid The `users` doc.
 * @param {!Array<string>} tokens The tokens FCM rejected for good.
 * @return {!Promise<void>} Resolves when done.
 */
async function pruneTokens(uid, tokens) {
  if (!uid || tokens.length === 0) return;
  try {
    await admin.firestore().collection('users').doc(uid)
        .update({pushTokens: FieldValue.arrayRemove(...tokens)});
    console.log(`pruned ${tokens.length} dead push token(s) from ${uid}`);
  } catch (err) {
    console.warn(`could not prune push tokens for ${uid}:`, err.message);
  }
}

/**
 * Send one notice to every device a member registered. Never throws.
 * @param {{uid: ?string, tokens: *, title: string, body: string,
 *     data: (?Object|undefined)}} args The notice. `data.link` is the
 *     portal path a tap opens (default Settings).
 * @return {!Promise<{status: string, sent: (number|undefined),
 *     pruned: (number|undefined), error: (string|undefined)}>}
 *     'sent' (at least one device took it) | 'no-device' | 'skipped' |
 *     'failed'.
 */
async function sendPush(args) {
  const {uid, title, body} = args || {};
  const tokens = cleanTokens(args && args.tokens);
  if (tokens.length === 0) return {status: 'no-device'};
  if (!pushConfigured()) {
    console.warn('Push not available here (emulator). Skipping push.');
    return {status: 'skipped', reason: 'unconfigured'};
  }
  const data = stringData(args.data);
  const link = data.link && data.link.startsWith('/') ?
      `${PORTAL_URL}${data.link}` : (data.link || `${PORTAL_URL}/portal`);
  try {
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {title, body},
      data,
      webpush: {
        fcmOptions: {link},
        notification: {title, body, tag: data.kind || undefined},
      },
    });
    const dead = [];
    let firstError = null;
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error && r.error.code;
      if (code && DEAD_TOKEN_CODES.has(code)) dead.push(tokens[i]);
      if (!firstError) firstError = (r.error && r.error.message) || code;
    });
    if (dead.length > 0) await pruneTokens(uid, dead);
    if (res.successCount > 0) {
      return {status: 'sent', sent: res.successCount, pruned: dead.length};
    }
    return {status: 'failed', pruned: dead.length, error: firstError};
  } catch (err) {
    console.error('FCM send error:', err);
    return {status: 'failed', error: err.message};
  }
}

module.exports = {
  DEAD_TOKEN_CODES,
  cleanTokens,
  pruneTokens,
  pushConfigured,
  sendPush,
  stringData,
};
