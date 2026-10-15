/**
 * submitFeedback - the portal's Feedback button (owner-approved design,
 * 2026-10-15; docs/portal/plans/2026-10-15-feedback/00-spec.md).
 *
 * A signed-in callable. Any provisioned account (parent, athlete, coach,
 * specialist, ops, owner) sends a note and, optionally, a screenshot of the
 * page it was on; the function posts them to a PRIVATE Slack channel.
 *
 *   in   {note, page, viewport, userAgent, appVersion,
 *         image?: {dataUrl, width, height}}
 *   out  {ok: true}
 *
 * Who sent it comes from `users/{uid}` (displayName, role, email), never
 * from the payload. `page` keeps the path and query only: anything after
 * '#' and any query value named token / code / oobCode / apiKey / session
 * is dropped before it is posted anywhere.
 *
 * Rate limit: 10 per account per rolling hour, kept in
 * `feedbackLimits/{uid}` ({sentAtMs: number[], updatedAtMs}) inside a
 * transaction. Admin SDK only; firestore.rules closes the collection to
 * every client. A send Slack refuses gives its slot back.
 *
 * Slack: the bot token is the Secret Manager secret SLACK_FEEDBACK_TOKEN
 * (chat:write, files:write), the channel id the plain setting
 * SLACK_FEEDBACK_CHANNEL (functions/.env). With a screenshot the file goes
 * up in Slack's three steps - files.getUploadURLExternal, the bytes to the
 * upload_url, files.completeUploadExternal with the message as its
 * initial_comment; without one it is a chat.postMessage. Slack's `ok:
 * false` is a failure: the error code is logged, the client is told
 * 'unavailable'. Neither the token nor the image is ever logged. The Slack
 * calls and the message text live in feedback-slack.js.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const {FEEDBACK_SECRETS} = require('./secrets');
const {SlackError, messageText, postText, postWithImage, shortAgent,
  slackEscape} = require('./feedback-slack');

const {HttpsError} = functions.https;

const MAX_NOTE = 2000;
const MAX_PAGE = 300;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 10000;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
/** Query parameters whose values never leave the browser's address bar. */
const SECRET_PARAMS = ['token', 'code', 'oobcode', 'apikey', 'session'];
const DATA_URL_RE = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/;
const SIGNATURES = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};
const UNAVAILABLE = 'Feedback could not be sent right now. Try again in a ' +
    'minute.';

/** @return {!Object} The admin Firestore. */
function db() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

/**
 * A refusal the panel shows as it is.
 * @param {string} reason The stable `details.reason`.
 * @param {string} message The plain-language copy.
 * @return {!HttpsError} An invalid-argument error.
 */
function refusal(reason, message) {
  return new HttpsError('invalid-argument', message, {reason});
}

/**
 * A short optional text field, cut to length rather than refused.
 * @param {*} v The raw value.
 * @param {number} max The cap.
 * @return {string} The trimmed text, '' when absent or not a string.
 */
function clip(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

/**
 * The page as it may be posted: path and query only, no fragment, and no
 * value of a SECRET_PARAMS parameter. A full URL keeps its path and query.
 * @param {string} raw The client's page.
 * @return {string} The clean page, '' when there is nothing usable.
 */
function cleanPage(raw) {
  const noHash = String(raw || '').split('#')[0].trim();
  if (!noHash) return '';
  let url;
  try {
    url = new URL(noHash, 'https://portal.invalid');
  } catch (err) {
    return '';
  }
  for (const key of Array.from(url.searchParams.keys())) {
    if (SECRET_PARAMS.includes(key.toLowerCase())) url.searchParams.delete(key);
  }
  const query = url.searchParams.toString();
  return url.pathname + (query ? `?${query}` : '');
}

/**
 * @param {*} v A claimed pixel size.
 * @return {?number} The size, or null when it is not a sane integer.
 */
function dimension(v) {
  return Number.isInteger(v) && v >= 1 && v <= MAX_DIMENSION ? v : null;
}

/**
 * @param {!Buffer} bytes The decoded image.
 * @param {string} type 'jpeg' | 'png'.
 * @return {boolean} Whether the bytes start with that format's signature.
 */
function hasSignature(bytes, type) {
  const sig = SIGNATURES[type];
  return bytes.length > sig.length && sig.every((b, i) => bytes[i] === b);
}

/**
 * The screenshot, decoded and checked. Throws a refusal when it is not a
 * real JPEG or PNG of at most MAX_IMAGE_BYTES.
 * @param {*} img The payload's `image`.
 * @return {{bytes: !Buffer, type: string, ext: string, width: ?number,
 *     height: ?number}} The image.
 */
function imageOf(img) {
  const unreadable = 'The screenshot could not be read. Send it without ' +
      'the screenshot, or try again.';
  if (!img || typeof img !== 'object' || typeof img.dataUrl !== 'string') {
    throw refusal('bad-image', unreadable);
  }
  // Before any regex or decode: base64 carries 3 bytes in 4 characters.
  if (img.dataUrl.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32) {
    throw refusal('image-too-large', 'The screenshot is too large to send.');
  }
  const m = DATA_URL_RE.exec(img.dataUrl);
  if (!m) throw refusal('bad-image', unreadable);
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw refusal('image-too-large', 'The screenshot is too large to send.');
  }
  const type = m[1];
  if (!hasSignature(bytes, type)) throw refusal('bad-image', unreadable);
  return {
    bytes, type, ext: type === 'png' ? 'png' : 'jpg',
    width: dimension(img.width), height: dimension(img.height),
  };
}

/**
 * The payload, checked. Throws an invalid-argument refusal on the first
 * problem.
 * @param {*} data The callable payload.
 * @return {{note: string, page: string, viewport: string,
 *     userAgent: string, appVersion: string, image: ?Object}} The feedback.
 */
function validate(data) {
  const d = data && typeof data === 'object' ? data : {};
  if (d.note != null && typeof d.note !== 'string') {
    throw refusal('bad-note', 'The note could not be read.');
  }
  const note = typeof d.note === 'string' ? d.note.trim() : '';
  if (note.length > MAX_NOTE) {
    throw refusal('note-too-long',
        `Keep the note under ${MAX_NOTE} characters.`);
  }
  if (d.page != null && typeof d.page !== 'string') {
    throw refusal('bad-page', 'The page address could not be read.');
  }
  if (typeof d.page === 'string' && d.page.length > MAX_PAGE) {
    throw refusal('bad-page', 'The page address is too long.');
  }
  const image = d.image == null ? null : imageOf(d.image);
  if (!note && !image) {
    throw refusal('empty', 'Add a note, or include the screenshot.');
  }
  return {
    note, image, page: cleanPage(d.page),
    viewport: clip(d.viewport, 40),
    userAgent: clip(d.userAgent, 400),
    appVersion: clip(d.appVersion, 60),
  };
}

/**
 * The Slack settings, or null when either is missing.
 * @param {!Object} env The environment (process.env in production).
 * @return {?{token: string, channel: string}} The settings.
 */
function slackConfig(env) {
  const token = clip(env.SLACK_FEEDBACK_TOKEN, 500);
  const channel = clip(env.SLACK_FEEDBACK_CHANNEL, 100);
  return token && channel ? {token, channel} : null;
}

/**
 * Who is sending, from the server's own records: the users doc, then the
 * verified ID token's claims. Never the payload.
 * @param {!Object} store An admin Firestore.
 * @param {!Object} auth The callable's `context.auth`.
 * @return {!Promise<{name: string, role: string, email: string}>} The
 *     sender.
 */
async function senderOf(store, auth) {
  const snap = await store.collection('users').doc(auth.uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied',
        'Finish setting up your account, then send feedback.',
        {reason: 'not-provisioned'});
  }
  const u = snap.data() || {};
  const claims = auth.token || {};
  return {
    name: clip(u.displayName, 120) || clip(claims.name, 120) || 'Unknown',
    role: clip(u.role, 40) || 'no role',
    email: clip(u.email, 200) || clip(claims.email, 200) || 'no email',
  };
}

/**
 * @param {?Object} data A feedbackLimits doc's data.
 * @param {number} nowMs The clock.
 * @return {!Array<number>} Its sends inside the last hour.
 */
function recentSends(data, nowMs) {
  const sent = data && Array.isArray(data.sentAtMs) ? data.sentAtMs : [];
  return sent.filter((t) => typeof t === 'number' &&
      t > nowMs - RATE_WINDOW_MS && t <= nowMs);
}

/**
 * Takes one of the caller's ten slots this hour, or refuses.
 * @param {!Object} store An admin Firestore.
 * @param {string} uid The caller.
 * @param {number} nowMs The clock.
 * @return {!Promise<void>} Resolves once the slot is recorded.
 */
async function takeSlot(store, uid, nowMs) {
  const ref = store.collection('feedbackLimits').doc(uid);
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const sent = recentSends(snap.exists ? snap.data() : null, nowMs);
    if (sent.length >= RATE_LIMIT) {
      throw new HttpsError('resource-exhausted',
          'That is a lot of feedback in one hour - thank you. Try again ' +
          'a little later.', {reason: 'rate-limited'});
    }
    tx.set(ref, {sentAtMs: sent.concat([nowMs]), updatedAtMs: nowMs});
  });
}

/**
 * Gives back the slot a send Slack refused. Best effort: a failure here is
 * logged and the caller still hears the Slack failure.
 * @param {!Object} store An admin Firestore.
 * @param {string} uid The caller.
 * @param {number} nowMs The slot's time.
 * @return {!Promise<void>} Resolves either way.
 */
async function returnSlot(store, uid, nowMs) {
  const ref = store.collection('feedbackLimits').doc(uid);
  try {
    await store.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const sent = recentSends(snap.exists ? snap.data() : null, nowMs);
      const i = sent.lastIndexOf(nowMs);
      if (i < 0) return;
      sent.splice(i, 1);
      tx.set(ref, {sentAtMs: sent, updatedAtMs: nowMs});
    });
  } catch (err) {
    console.error('submitFeedback: the rate-limit slot was not returned:',
        err && err.message);
  }
}

/**
 * The callable's body, exported so the unit tests can call it in-process.
 * @param {*} data The payload.
 * @param {!Object} context The callable context.
 * @param {{db: (!Object|undefined), fetch: (!Function|undefined),
 *     env: (!Object|undefined), now: (!Date|undefined)}=} deps Test seams.
 * @return {!Promise<{ok: boolean}>} `{ok: true}` once Slack has the post.
 */
async function submitFeedbackHandler(data, context, deps) {
  const auth = context && context.auth;
  if (!auth || !auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to send feedback.',
        {reason: 'signed-out'});
  }
  const fb = validate(data);
  const d = deps || {};
  const cfg = slackConfig(d.env || process.env);
  if (!cfg) {
    console.error('submitFeedback: SLACK_FEEDBACK_TOKEN or ' +
        'SLACK_FEEDBACK_CHANNEL is not set');
    throw new HttpsError('failed-precondition', 'Feedback is not set up yet.',
        {reason: 'not-configured'});
  }
  const store = d.db || db();
  const now = d.now instanceof Date ? d.now : new Date();
  const fetchFn = d.fetch || fetch;
  const sender = await senderOf(store, auth);
  await takeSlot(store, auth.uid, now.getTime());
  const text = messageText(sender, fb, now);
  try {
    if (fb.image) await postWithImage(fetchFn, cfg, fb.image, text, now);
    else await postText(fetchFn, cfg, text);
  } catch (err) {
    await returnSlot(store, auth.uid, now.getTime());
    if (err instanceof SlackError) {
      console.error(`submitFeedback: Slack ${err.method} failed: ${err.code}`);
    } else {
      console.error('submitFeedback: the Slack request failed:',
          err && err.name, err && err.message);
    }
    throw new HttpsError('unavailable', UNAVAILABLE, {reason: 'slack-error'});
  }
  console.log(`submitFeedback: posted for ${auth.uid} (${sender.role}), ` +
      `page ${fb.page || 'unknown'}, ` +
      `${fb.image ? 'with' : 'without'} a screenshot`);
  return {ok: true};
}

/** The callable. Binds the Slack token; the channel is plain config. */
const submitFeedback = functions.runWith({secrets: FEEDBACK_SECRETS})
    .https.onCall((data, context) => submitFeedbackHandler(data, context));

module.exports = {
  MAX_IMAGE_BYTES, MAX_NOTE, MAX_PAGE, RATE_LIMIT, RATE_WINDOW_MS,
  cleanPage, messageText, shortAgent, slackEscape, submitFeedback,
  submitFeedbackHandler, validate,
};
