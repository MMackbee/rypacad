/**
 * The notification pipeline (contract v2.2, TEAM.md Sprint 14 pins).
 *
 * ONE ENTRY POINT: `sendNotice`. It resolves recipients, applies each
 * account's `notificationPrefs` per channel, sends email through Courier and
 * SMS through portal/sms.js, writes the `notifications/{kind}_{subjectKey}`
 * ledger row, and returns it. Triggers and scheduled jobs build copy
 * (portal/notices.js) and call this; nothing else sends.
 *
 * LEDGER-IDEMPOTENT. The ledger row IS the send lock: it is created inside a
 * transaction with `tx.create`, so a concurrent trigger, a Firestore retry or
 * a job running twice finds the row already there and sends nothing. The row
 * is written BEFORE the providers are called, with every attempted channel
 * recorded pessimistically as 'failed'; the outcomes are rewritten once the
 * sends return. A crash mid-send therefore leaves an honest 'failed' on the
 * record rather than a silent gap - and never a second text.
 *
 * NEVER THROWS. Every caller is a trigger or job whose write has already
 * committed; a notice failure must not roll one back.
 *
 * PREFERENCES (mirror of `NOTIFICATION_CATEGORIES` in
 * `frontend/src/portal/data/parent.js` - change one, change both): absent
 * map or absent category == the category's default. `billing` email is
 * LOCKED ON - a transactional payment notice always reaches at least email -
 * while billing SMS follows the saved preference like every other channel.
 */

'use strict';

const admin = require('firebase-admin');
const {CourierClient} = require('@trycourier/courier');
const {FieldValue} = require('firebase-admin/firestore');
const notices = require('./notices');
const sms = require('./sms');

/** The `notificationPrefs` defaults, per category. @const {!Object} */
const CATEGORY_DEFAULTS = {
  billing: {email: true, sms: true},
  schedule: {email: true, sms: true},
  newsletter: {email: true, sms: false},
  progress: {email: true, sms: false},
};

let courierClient;
let courierResolved = false;

/**
 * The Courier client, or null when the token is not configured. Resolved
 * lazily so requiring this module never depends on load order.
 * @return {?Object} A Courier client or null.
 */
function courier() {
  if (!courierResolved) {
    const token = process.env.COURIER_AUTH_TOKEN;
    // @trycourier/courier v5 exports CourierClient as a FACTORY, not a
    // constructor - `new` would change what comes back. The capitalized name
    // is the SDK's, so the lint rule is wrong about this one call site.
    // eslint-disable-next-line new-cap
    courierClient = token ? CourierClient({authorizationToken: token}) : null;
    courierResolved = true;
  }
  return courierClient;
}

/**
 * Firestore, resolved lazily so this module can be required before
 * `admin.initializeApp()` runs in index.js.
 * @return {!Object} The admin Firestore.
 */
function db() {
  return admin.firestore();
}

/**
 * Send one Courier message. Never throws: a notification failure must not
 * roll back a booking that already committed.
 * @param {{toProfile: (!Object|undefined), toUserId: (?string|undefined),
 *     eventId: (?string|undefined), content: (!Object|undefined),
 *     channels: (!Object|undefined)}} args The message.
 * @return {!Promise<!Object>} Courier's response, or `{skipped}`/`{error}`.
 */
async function sendCourierNotification(args) {
  const {
    toProfile = {},
    toUserId = null,
    eventId = null,
    content = {},
    channels = {},
  } = args || {};
  const client = courier();
  if (!client) {
    console.warn('Courier client not configured. Skipping notification.');
    return {skipped: true};
  }
  try {
    const message = {};
    if (eventId) {
      message.eventId = eventId; // Courier Studio template event id
    } else {
      message.content = content; // Ad-hoc content if no template
    }
    if (toUserId) {
      message.recipient = toUserId;
    } else {
      message.profile = toProfile; // { email, phone_number, ... }
    }
    if (channels && Object.keys(channels).length > 0) {
      message.channels = channels; // e.g., { sms: {}, email: {} }
    }
    return await client.send({message});
  } catch (err) {
    console.error('Courier send error:', err);
    return {error: err.message};
  }
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
 * A Courier profile from a `users` document. Both phone spellings are read:
 * `phone` is the 2026 member-settable field (DATA-MODEL users), `phoneNumber`
 * the 2025 one some older documents still carry.
 * @param {?Object} user A `users` document body.
 * @return {?{email: ?string, phone_number: ?string}} A Courier profile.
 */
function profileFor(user) {
  if (!user) return null;
  const email = user.email || null;
  const phone = user.phoneNumber || user.phone || null;
  if (!email && !phone) return null;
  return {email, phone_number: phone};
}

/**
 * One recipient: the Courier profile plus what the gates need (the saved
 * preference map and the resolved address per channel).
 * @param {!Object} doc A `users` QueryDocumentSnapshot.
 * @return {?{uid: string, profile: !Object, prefs: ?Object, email: ?string,
 *     phone: ?string}} A recipient, or null when the account has no address
 *     at all (nothing can reach it).
 */
function recipientFrom(doc) {
  const user = doc.data() || {};
  const profile = profileFor(user);
  if (!profile) return null;
  return {
    uid: doc.id,
    profile,
    prefs: user.notificationPrefs || null,
    email: profile.email,
    phone: profile.phone_number,
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
 * @param {string} channel 'email' or 'sms'.
 * @return {boolean} True when the channel may send.
 */
function channelAllowed(prefs, category, channel) {
  // Transactional and locked in the UI: a billing email always sends.
  if (category === 'billing' && channel === 'email') return true;
  const defaults = CATEGORY_DEFAULTS[category] || {email: true, sms: false};
  const saved = prefs && typeof prefs === 'object' ? prefs[category] : null;
  const value = saved && typeof saved === 'object' ? saved[channel] : undefined;
  return typeof value === 'boolean' ? value : Boolean(defaults[channel]);
}

/**
 * The Courier Studio template for a kind, when one is configured.
 * `booking-confirmed` -> `COURIER_EVENT_BOOKING_CONFIRMED`; unset means
 * ad-hoc `{title, body}` content, the same fallback the helper always had.
 * @param {string} kind The notice kind.
 * @return {?string} An event id or null.
 */
function courierEventId(kind) {
  const key = 'COURIER_EVENT_' +
      String(kind || '').toUpperCase().replace(/-/g, '_');
  return process.env[key] || null;
}

/**
 * What each channel will do for one recipient, decided before anything is
 * sent so the ledger row can be claimed first. `'attempt'` is the only
 * value that still needs a provider call.
 * @param {!Object} recipient A resolved recipient.
 * @param {string} category The notice's category.
 * @param {?Date} now The clock the SMS window is judged against.
 * @return {{uid: string, recipient: !Object, email: string, sms: string}} The
 *     plan.
 */
function planFor(recipient, category, now) {
  let email = 'skipped';
  if (!channelAllowed(recipient.prefs, category, 'email')) {
    email = 'off';
  } else if (recipient.email) {
    email = 'attempt';
  }
  let text = 'off';
  if (channelAllowed(recipient.prefs, category, 'sms')) {
    if (!recipient.phone) {
      text = 'no-phone';
    } else if (!sms.withinSmsWindow(now)) {
      // Quiet hours. The ledger still records the notice: it is never
      // re-sent later (pin), because a stale reminder is worse than none.
      text = 'skipped';
    } else {
      text = 'attempt';
    }
  }
  return {uid: recipient.uid, recipient, email, sms: text};
}

/**
 * The ledger's per-recipient row before any provider was called: an
 * attempted channel is pessimistically 'failed' until it reports otherwise.
 * @param {!Object} plan One `planFor` result.
 * @return {{uid: string, email: string, sms: string}} A ledger row.
 */
function pessimistic(plan) {
  return {
    uid: plan.uid,
    email: plan.email === 'attempt' ? 'failed' : plan.email,
    sms: plan.sms === 'attempt' ? 'failed' : plan.sms,
  };
}

/**
 * Deliver one notice to one recipient and report the two outcomes.
 * @param {!Object} plan One `planFor` result.
 * @param {{kind: string, title: string, body: string}} notice The copy.
 * @return {!Promise<{uid: string, email: string, sms: string}>} The row.
 */
async function deliver(plan, notice) {
  const row = {uid: plan.uid, email: plan.email, sms: plan.sms};
  if (plan.email === 'attempt') {
    const resp = await sendCourierNotification({
      eventId: courierEventId(notice.kind),
      toProfile: {email: plan.recipient.email},
      content: {title: notice.title, body: notice.body},
      channels: {email: {}},
    });
    if (!resp || resp.error) row.email = 'failed';
    else if (resp.skipped) row.email = 'skipped';
    else row.email = 'sent';
  }
  if (plan.sms === 'attempt') {
    const resp = await sms.sendSms({
      to: plan.recipient.phone,
      message: notice.body,
      type: notice.kind,
    });
    row.sms = resp.status;
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
 *     body: string, now: (?Date|undefined)}} args The notice. `now` is
 *     injectable so a scheduled job's fixed clock judges the SMS window.
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
    plans = recipients.map((r) => planFor(r, args.category, args.now || null));
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
      rows.map((r) => `${r.uid}:${r.email}/${r.sms}`).join(' '));
  return result;
}

/**
 * Tell an athlete and their household that a waitlist entry was promoted
 * into a confirmed booking (pin F: auto-confirm, no acceptance window, so
 * this is an FYI and not a call to action). Kept as its own export so
 * portal/promotion.js changes minimally.
 * @param {{athleteId: string, householdId: ?string, athlete: (?Object|
 *     undefined), athleteName: (?string|undefined), session: !Object,
 *     sessionId: string, bookingId: (?string|undefined)}} args The promotion.
 * @return {!Promise<!Object>} The `sendNotice` result.
 */
async function notifyWaitlistPromotion(args) {
  const athlete = args.athlete ||
      (args.athleteName ? {name: args.athleteName} : null);
  const copy = notices.promoted({athlete, session: args.session});
  const bookingId = args.bookingId || `${args.athleteId}_${args.sessionId}`;
  return sendNotice({
    kind: 'promoted',
    category: 'schedule',
    householdId: args.householdId || null,
    athleteId: args.athleteId,
    sessionId: args.sessionId,
    bookingId,
    subjectKey: bookingId,
    title: copy.title,
    body: copy.body,
  });
}

module.exports = {
  CATEGORY_DEFAULTS,
  channelAllowed,
  courierEventId,
  getUserProfile,
  notifyWaitlistPromotion,
  parentsForHousehold,
  profileFor,
  recipientsForAthlete,
  sendCourierNotification,
  sendNotice,
};
