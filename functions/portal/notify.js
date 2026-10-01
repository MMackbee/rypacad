/**
 * The notification pipeline (contract v2.2, TEAM.md Sprint 14 pins; v2.3,
 * Sprint 15: push replaces SMS).
 *
 * ONE ENTRY POINT: `sendNotice`. It resolves recipients, applies each
 * account's `notificationPrefs` per channel, emails through portal/email.js
 * (SMTP or Courier) and pushes through portal/push.js (Firebase Cloud
 * Messaging), writes the `notifications/{kind}_{subjectKey}` ledger row, and
 * returns it. Triggers and scheduled jobs build copy (portal/notices.js) and
 * call this; nothing else sends.
 *
 * LEDGER-IDEMPOTENT. The ledger row IS the send lock: it is created inside a
 * transaction with `tx.create`, so a concurrent trigger, a Firestore retry or
 * a job running twice finds the row already there and sends nothing. The row
 * is written BEFORE the providers are called, with every attempted channel
 * recorded pessimistically as 'failed'; the outcomes are rewritten once the
 * sends return. A crash mid-send therefore leaves an honest 'failed' on the
 * record rather than a silent gap - and never a second push.
 *
 * NEVER THROWS. Every caller is a trigger or job whose write has already
 * committed; a notice failure must not roll one back.
 *
 * PREFERENCES (mirror of `NOTIFICATION_CATEGORIES` in
 * `frontend/src/portal/data/parent.js` - change one, change both): absent
 * map or absent category == the category's default. `billing` email is
 * LOCKED ON - a transactional payment notice always reaches at least email -
 * while billing push follows the saved preference like every other channel.
 */

'use strict';

const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const email = require('./email');
const push = require('./push');

/** The `notificationPrefs` defaults, per category. @const {!Object} */
const CATEGORY_DEFAULTS = {
  billing: {email: true, push: true},
  schedule: {email: true, push: true},
  progress: {email: true, push: false},
};

/** Where a tapped push opens, per kind (a portal path). @const {!Object} */
const LINKS = {
  'booking-confirmed': '/portal/schedule',
  'promoted': '/portal/schedule',
  'waitlist-removed': '/portal/schedule',
  'waitlist-expired': '/portal/schedule',
  'session-cancelled': '/portal/schedule',
  'booking-released': '/portal/schedule',
  'reminder-24h': '/portal/schedule',
  'booking-revoked': '/portal/billing',
  'tokens-expiring': '/portal/billing',
  'grace-expiring': '/portal/billing',
  'membership': '/portal/billing',
};

/**
 * Firestore, resolved lazily so this module can be required before
 * `admin.initializeApp()` runs in index.js.
 * @return {!Object} The admin Firestore.
 */
function db() {
  return admin.firestore();
}

/**
 * One `users/{uid}` document body.
 * @param {?string} userId The uid.
 * @return {!Promise<?Object>} The document body, or null.
 */
async function getUserProfile(userId) {
  if (!userId) return null;
  const snap = await db().collection('users').doc(userId).get();
  return snap.exists ? snap.data() : null;
}

/**
 * A minimal profile from a `users` document: the address email goes to and
 * the phone kept as contact information (no notice is texted since Sprint
 * 15; both spellings are read for older documents).
 * @param {?Object} user A `users` document body.
 * @return {?{email: ?string, phone_number: ?string}} A profile, or null when
 *     the document has neither.
 */
function profileFor(user) {
  if (!user) return null;
  const emailAddress = user.email || null;
  const phone = user.phoneNumber || user.phone || null;
  if (!emailAddress && !phone) return null;
  return {email: emailAddress, phone_number: phone};
}

/**
 * One recipient: what the gates need (the saved preference map, the email
 * address, the registered push devices).
 * @param {!Object} doc A `users` QueryDocumentSnapshot.
 * @return {?{uid: string, prefs: ?Object, email: ?string,
 *     tokens: !Array<string>}} A recipient, or null when nothing can reach
 *     the account (no email and no device).
 */
function recipientFrom(doc) {
  const user = doc.data() || {};
  const emailAddress = user.email || null;
  const tokens = push.cleanTokens(user.pushTokens);
  if (!emailAddress && tokens.length === 0) return null;
  return {
    uid: doc.id,
    prefs: user.notificationPrefs || null,
    email: emailAddress,
    tokens,
  };
}

/**
 * De-duplicate recipients by uid, in the order the queries returned them.
 * @param {!Array<!Object>} snaps `QuerySnapshot`s over `users`.
 * @return {!Array<!Object>} Recipients.
 */
function mergeRecipients(snaps) {
  const seen = new Map();
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      const recipient = recipientFrom(doc);
      if (recipient) seen.set(doc.id, recipient);
    }
  }
  return Array.from(seen.values());
}

/**
 * The accounts told about an athlete's booking: the athlete's own `users`
 * doc (`users.athleteId == athleteId`) and the household's parent accounts
 * (`users.householdId == householdId and role == 'parent'`). Two equality
 * filters need no composite index — Firestore merges the single-field ones.
 * @param {string} athleteId The athlete.
 * @param {?string} householdId The household.
 * @return {!Promise<!Array<!Object>>} Recipients, de-duplicated by uid.
 */
async function recipientsForAthlete(athleteId, householdId) {
  const queries = [
    db().collection('users').where('athleteId', '==', athleteId).get(),
  ];
  if (householdId) {
    queries.push(db().collection('users')
        .where('householdId', '==', householdId)
        .where('role', '==', 'parent')
        .get());
  }
  return mergeRecipients(await Promise.all(queries));
}

/**
 * The household's parent accounts only — the audience for every billing
 * kind (a child is not told the card failed).
 * @param {?string} householdId The household.
 * @return {!Promise<!Array<!Object>>} Recipients.
 */
async function parentsForHousehold(householdId) {
  if (!householdId) return [];
  return mergeRecipients([await db().collection('users')
      .where('householdId', '==', householdId)
      .where('role', '==', 'parent')
      .get()]);
}

/**
 * Who hears about one notice: parents alone for billing (and whenever there
 * is no athlete to tell), athlete + parents otherwise.
 * @param {{category: string, athleteId: ?string, householdId: ?string}} args
 *     The notice.
 * @return {!Promise<!Array<!Object>>} Recipients.
 */
async function resolveRecipients(args) {
  if (args.category === 'billing' || !args.athleteId) {
    return parentsForHousehold(args.householdId);
  }
  return recipientsForAthlete(args.athleteId, args.householdId);
}

/**
 * Whether one channel may carry one category for one account.
 * @param {?Object} prefs `users.notificationPrefs`, possibly null.
 * @param {string} category The notice's category.
 * @param {string} channel 'email' or 'push'.
 * @return {boolean} True when the channel may send.
 */
function channelAllowed(prefs, category, channel) {
  // Transactional and locked in the UI: a billing email always sends.
  if (category === 'billing' && channel === 'email') return true;
  const defaults = CATEGORY_DEFAULTS[category] || {email: true, push: false};
  const saved = prefs && typeof prefs === 'object' ? prefs[category] : null;
  const value = saved && typeof saved === 'object' ? saved[channel] : undefined;
  return typeof value === 'boolean' ? value : Boolean(defaults[channel]);
}

/**
 * What each channel will do for one recipient, decided before anything is
 * sent so the ledger row can be claimed first. `'attempt'` is the only
 * value that still needs a provider call.
 * @param {!Object} recipient A resolved recipient.
 * @param {string} category The notice's category.
 * @return {{uid: string, recipient: !Object, email: string, push: string}}
 *     The plan.
 */
function planFor(recipient, category) {
  let mail = 'skipped';
  if (!channelAllowed(recipient.prefs, category, 'email')) {
    mail = 'off';
  } else if (recipient.email) {
    mail = 'attempt';
  }
  let device = 'off';
  if (channelAllowed(recipient.prefs, category, 'push')) {
    device = recipient.tokens.length > 0 ? 'attempt' : 'no-device';
  }
  return {uid: recipient.uid, recipient, email: mail, push: device};
}

/**
 * The ledger's per-recipient row before any provider was called: an
 * attempted channel is pessimistically 'failed' until it reports otherwise.
 * @param {!Object} plan One `planFor` result.
 * @return {{uid: string, email: string, push: string}} A ledger row.
 */
function pessimistic(plan) {
  return {
    uid: plan.uid,
    email: plan.email === 'attempt' ? 'failed' : plan.email,
    push: plan.push === 'attempt' ? 'failed' : plan.push,
  };
}

/**
 * Deliver one notice to one recipient and report the two outcomes.
 * @param {!Object} plan One `planFor` result.
 * @param {{kind: string, title: string, body: string}} notice The copy.
 * @return {!Promise<{uid: string, email: string, push: string}>} The row.
 */
async function deliver(plan, notice) {
  const row = {uid: plan.uid, email: plan.email, push: plan.push};
  if (plan.email === 'attempt') {
    const resp = await email.sendEmail({
      to: plan.recipient.email,
      subject: notice.title,
      text: notice.body,
      kind: notice.kind,
    });
    row.email = resp.status;
  }
  if (plan.push === 'attempt') {
    const resp = await push.sendPush({
      uid: plan.uid,
      tokens: plan.recipient.tokens,
      title: notice.title,
      body: notice.body,
      data: {kind: notice.kind, link: LINKS[notice.kind] || '/portal'},
    });
    row.push = resp.status;
  }
  return row;
}

/**
 * The ledger document body (contract v2.2 `notifications/{id}`).
 * @param {!Object} args The `sendNotice` arguments.
 * @param {!Array<!Object>} recipients Per-recipient outcome rows.
 * @return {!Object} The document body.
 */
function ledgerDoc(args, recipients) {
  return {
    kind: args.kind,
    category: args.category,
    householdId: args.householdId || null,
    athleteId: args.athleteId || null,
    sessionId: args.sessionId || null,
    bookingId: args.bookingId || null,
    subjectKey: args.subjectKey,
    title: args.title,
    body: args.body,
    recipients,
    sentAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Send one notice, once. The ledger id is `{kind}_{subjectKey}`; a second
 * call with the same key is a no-op.
 * @param {{kind: string, category: string, householdId: ?string,
 *     athleteId: (?string|undefined), sessionId: (?string|undefined),
 *     bookingId: (?string|undefined), subjectKey: string, title: string,
 *     body: string}} args The notice.
 * @return {!Promise<{id: string, duplicate: boolean, sent: boolean,
 *     recipients: !Array<!Object>, error: ?string}>} The ledger row as
 *     written, or `duplicate: true` when it already existed.
 */
async function sendNotice(args) {
  const id = `${args.kind}_${args.subjectKey}`;
  const ref = db().collection('notifications').doc(id);
  const result = {id, duplicate: false, sent: false, recipients: [],
    error: null};
  let plans = [];
  try {
    const recipients = await resolveRecipients(args);
    plans = recipients.map((r) => planFor(r, args.category));
    const claimed = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return false;
      tx.create(ref, ledgerDoc(args, plans.map(pessimistic)));
      return true;
    });
    if (!claimed) {
      console.log(`notice ${id} already sent - no second send`);
      result.duplicate = true;
      return result;
    }
  } catch (err) {
    console.error(`notice ${id} could not be recorded:`, err);
    result.error = err.message;
    return result;
  }

  const rows = plans.map(pessimistic);
  try {
    for (let i = 0; i < plans.length; i += 1) {
      rows[i] = await deliver(plans[i], args);
    }
  } catch (err) {
    // Unreachable in principle - both senders swallow their own failures -
    // so if it happens, the pessimistic 'failed' rows are the honest record.
    console.error(`notice ${id} send failed:`, err);
    result.error = err.message;
  }
  try {
    await ref.update({recipients: rows, sentAt: FieldValue.serverTimestamp()});
  } catch (err) {
    console.error(`notice ${id} outcome update failed:`, err);
    result.error = result.error || err.message;
  }
  result.sent = true;
  result.recipients = rows;
  console.log(`notice ${id} -> ` +
      rows.map((r) => `${r.uid}:${r.email}/${r.push}`).join(' '));
  return result;
}

// The waitlist's notices (promoted, removed, closed) are built and keyed in
// portal/waitlist-notices.js and sent through `sendNotice` above.

module.exports = {
  CATEGORY_DEFAULTS,
  LINKS,
  channelAllowed,
  courierEventId: email.courierEventId,
  getUserProfile,
  parentsForHousehold,
  profileFor,
  recipientsForAthlete,
  sendCourierNotification: email.sendCourierNotification,
  sendNotice,
};
