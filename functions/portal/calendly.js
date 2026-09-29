/**
 * calendlyWebhook (spec 6.2, contract 6.3). A Yannick booking made on
 * Calendly becomes `sessions/cal-<eventUuid>` (display-only, capacity 1)
 * plus a token-charged booking; his cancellation releases both. The ledger
 * `calendlyEvents/{inviteeUuid}_{event}` is written in the SAME transaction
 * as the effect, so a redelivery is `duplicate`. Over-cap / over-cadence /
 * inactive / early bookings are WRITTEN AND FLAGGED, never refused (ruling
 * 0.7). Response contract: 400 only for a bad signature, 200 for every
 * verified event whatever the outcome, 500 only for a Firestore throw. No
 * network call in the handler.
 */
'use strict';

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const {FieldValue} = require('firebase-admin/firestore');
const lib = require('./lib');
const {verifyCalendlySignature} = require('./calendly-verify');
const {CALENDLY_SECRETS} = require('./secrets');

/**
 * Yannick's per-athlete monthly cadence. CHANGE ONE, CHANGE BOTH with
 * `frontend/src/portal/data/specialists.js:112`.
 * @const {{elite: number, default: number}}
 */
const MENTAL_MONTHLY_CAP = {elite: 2, default: 1};
const EVENTS = ['invitee.created', 'invitee.canceled'];
const TYPE = 'mental';
const LABEL = 'Mental game session';

/** @return {!Object} The admin Firestore, resolved lazily. */
function db() {
  return admin.firestore();
}

/** @return {!Object} A server timestamp sentinel. */
function now() {
  return FieldValue.serverTimestamp();
}

/**
 * @param {?string} uri A Calendly resource uri.
 * @return {?string} Its last path segment (the uuid), or null.
 */
function uuidOf(uri) {
  const s = String(uri || '');
  const i = s.lastIndexOf('/');
  return i >= 0 && i < s.length - 1 ? s.slice(i + 1) : null;
}

/**
 * @param {?Object} pkg A `packages/{id}` body.
 * @return {number} Mental sessions allowed per calendar month.
 */
function mentalCapFor(pkg) {
  return pkg && pkg.kind === 'elite' ? MENTAL_MONTHLY_CAP.elite :
      MENTAL_MONTHLY_CAP.default;
}

/**
 * 'parent' when the "Who is attending?" answer contains "parent".
 * @param {?Array<!Object>} qa `payload.questions_and_answers`.
 * @return {string} `'parent' | 'athlete'`.
 */
function attendeeOf(qa) {
  const row = (qa || []).find(
      (q) => /who is attending/i.test(String(q && q.question || '')));
  return row && /parent/i.test(String(row.answer || '')) ? 'parent' :
      'athlete';
}

/**
 * The session slot a created invitee describes.
 * @param {!Object} p `body.payload`.
 * @return {?{id: string, eventUri: string, date: string, time: string,
 *     durationMinutes: number}} Null when the times do not parse.
 */
function slotOf(p) {
  const ev = p.scheduled_event || {};
  const eventUri = ev.uri || p.event || null;
  const start = new Date(ev.start_time);
  const end = new Date(ev.end_time);
  const uuid = uuidOf(eventUri);
  if (!uuid || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return {
    id: `cal-${uuid}`, eventUri,
    date: lib.chicagoDate(start), time: lib.chicagoTime(start),
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
  };
}

/**
 * One document from a snapshot.
 * @param {!Object} snap A DocumentSnapshot.
 * @return {?{id: string, data: !Object, ref: !Object}} Or null.
 */
function docOf(snap) {
  return snap.exists ? {id: snap.id, data: snap.data() || {}, ref: snap.ref} :
      null;
}

/**
 * The one `users` doc carrying this email (exact, then lower-cased), or
 * null when none or more than one.
 * @param {!Object} tx The transaction.
 * @param {!Object} store Firestore.
 * @param {string} email The invitee email.
 * @return {!Promise<?Object>} The users doc body.
 */
async function userByEmail(tx, store, email) {
  const users = store.collection('users');
  let snap = await tx.get(users.where('email', '==', email).limit(2));
  if (snap.empty && email !== email.toLowerCase()) {
    snap = await tx.get(
        users.where('email', '==', email.toLowerCase()).limit(2));
  }
  return snap.size === 1 ? snap.docs[0].data() || {} : null;
}

/**
 * Resolve the athlete (spec 6.2 step 1): `utm_content` -> athletes/{id},
 * accepted only when the invitee email OWNS that athlete (it is the
 * athlete's login, or an account in the same household); else the invitee
 * email through `users` (an athlete account directly, a parent account ->
 * the household's only athlete). Anything else -> null. An edited or
 * forwarded link therefore never spends another family's token.
 * @param {!Object} tx The transaction.
 * @param {!Object} store Firestore.
 * @param {!Object} p `body.payload`.
 * @return {!Promise<?{id: string, data: !Object, ref: !Object}>} Athlete.
 */
async function resolveAthlete(tx, store, p) {
  const email = String(p.email || '').trim();
  const lower = email.toLowerCase();
  const u = email ? await userByEmail(tx, store, email) : null;
  const utm = p.tracking && p.tracking.utm_content;
  if (utm) {
    const a = docOf(await tx.get(
        store.collection('athletes').doc(String(utm))));
    const owns = a && lower && (
      String(a.data.loginEmail || '').toLowerCase() === lower ||
        (u && u.householdId && u.householdId === a.data.householdId));
    if (owns) return a;
  }
  if (!u) return null;
  if (u.athleteId) {
    return docOf(await tx.get(store.collection('athletes').doc(u.athleteId)));
  }
  if (!u.householdId) return null;
  const kids = await tx.get(store.collection('athletes')
      .where('householdId', '==', u.householdId).limit(2));
  return kids.size === 1 ? docOf(kids.docs[0]) : null;
}

/**
 * Cancel a Calendly booking and release its session (the same two writes
 * for a reschedule's old half and for invitee.canceled).
 * @param {!Object} tx The transaction.
 * @param {!Object} store Firestore.
 * @param {!Object} booking `{id, data}`.
 */
function cancelBooking(tx, store, booking) {
  tx.update(store.collection('bookings').doc(booking.id), {
    status: 'cancelled', cancelledBy: 'calendly', cancelReason: 'member',
    cancelledAt: now(),
  });
  if (booking.data.sessionId) {
    tx.update(store.collection('sessions').doc(booking.data.sessionId),
        {booked: 0, status: 'cancelled'});
  }
}

/**
 * `invitee.created` (spec 6.2 steps 1-4) inside the transaction. Every read
 * happens before the first write.
 * @param {!Object} tx The transaction.
 * @param {{store: !Object, nowDate: !Date, p: !Object, ledger: !Object}} c
 *     The call: Firestore, the clock, the payload, the ledger base row.
 * @return {!Promise<{outcome: string, flag: ?string}>} What was written.
 */
async function applyCreated(tx, c) {
  const {store, nowDate, p} = c;
  const slot = slotOf(p);
  const athlete = slot ? await resolveAthlete(tx, store, p) : null;
  if (!slot) {
    tx.set(c.ledger.ref, Object.assign(c.ledger.row, {outcome: 'malformed'}));
    return {outcome: 'malformed', flag: null};
  }
  if (!athlete) {
    tx.set(c.ledger.ref, Object.assign(c.ledger.row,
        {outcome: 'unresolved'}));
    return {outcome: 'unresolved', flag: null};
  }
  const householdId = athlete.data.householdId || null;
  const hhSnap = householdId ? await tx.get(
      store.collection('households').doc(householdId)) : null;
  const hh = hhSnap && hhSnap.exists ? hhSnap.data() || {} : {};
  const pkgSnap = athlete.data.packageId ? await tx.get(
      store.collection('packages').doc(athlete.data.packageId)) : null;
  const pkg = pkgSnap && pkgSnap.exists ? pkgSnap.data() : null;
  let old = [];
  if (p.old_invitee) {
    old = lib.rows(await tx.get(store.collection('bookings')
        .where('calendlyInviteeUri', '==', String(p.old_invitee))))
        .filter((b) => b.status !== 'cancelled');
  }
  const cancelled = new Set(old.map((b) => b.id));
  const anchor = hh.periodAnchorDay;
  const period = lib.periodFor(slot.date, anchor);
  const month = lib.periodFor(slot.date, 1);
  const tpSnap = await tx.get(store.collection('tokenPeriods')
      .doc(lib.tokenPeriodId(athlete.id, period.periodKey)));
  const periodRows = lib.rows(await tx.get(
      lib.periodBookingsQuery(store, athlete.id, period)));
  const monthRows = month.periodKey === period.periodKey ? periodRows :
      lib.rows(await tx.get(
          lib.periodBookingsQuery(store, athlete.id, month)));
  const waitSnap = await tx.get(store.collection('waitlist')
      .where('athleteId', '==', athlete.id));
  const graceSnap = await tx.get(store.collection('graceTokens')
      .where('athleteId', '==', athlete.id));
  // ---- reads done ----
  const live = (rows) => rows.filter(
      (b) => !cancelled.has(b.id) && b.status !== 'cancelled');
  const position = lib.tokensPosition({
    pkg, tokenPeriod: tpSnap.exists ? tpSnap.data() : null,
    bookings: live(periodRows),
    waitlist: lib.rows(waitSnap).map((w) => ({id: w.id,
      periodKey: lib.periodFor(w.date || slot.date, anchor).periodKey})),
    graceTokens: lib.rows(graceSnap),
    periodKey: period.periodKey, today: lib.todayISO(nowDate),
  });
  const charge = lib.chargeFor({position, sessionDate: slot.date});
  const mentalThisMonth = live(monthRows)
      .filter((b) => b.type === TYPE).length;
  let flag = null;
  if (!lib.membershipAllowsBooking(hh, athlete.data)) {
    flag = 'membership-inactive';
  } else if (!lib.bookingOpen(nowDate, pkg)) {
    flag = 'before-open';
  } else if (mentalThisMonth >= mentalCapFor(pkg)) {
    flag = 'over-cadence';
  } else if (!charge.chargedFrom) {
    flag = 'over-cap';
  }
  for (const b of old) cancelBooking(tx, store, {id: b.id, data: b});
  tx.set(store.collection('sessions').doc(slot.id), {
    date: slot.date, time: slot.time, type: TYPE, label: LABEL,
    capacity: 1, booked: 1, status: 'scheduled',
    durationMinutes: slot.durationMinutes, bookable: false, coachId: null,
    special: false, source: 'calendly', calendlyEventUri: slot.eventUri,
    gcalEventId: null, coachNote: null,
  });
  tx.set(store.collection('bookings').doc(lib.bookingId(athlete.id, slot.id)),
      {
        athleteId: athlete.id, sessionId: slot.id, householdId,
        date: slot.date, type: TYPE, status: 'confirmed',
        periodKey: period.periodKey,
        chargedFrom: flag ? 'period' : charge.chargedFrom,
        graceTokenId: flag ? null : charge.graceTokenId,
        attendee: attendeeOf(p.questions_and_answers),
        createdBy: 'system', source: 'calendly',
        calendlyInviteeUri: p.uri || null, flag, createdAt: now(),
      });
  const outcome = old.length > 0 ? 'rescheduled' : 'applied';
  tx.set(c.ledger.ref, Object.assign(c.ledger.row,
      {athleteId: athlete.id, householdId, outcome, flag}));
  return {outcome, flag};
}

/**
 * `invitee.canceled` (spec 6.2, last paragraph) inside the transaction.
 * @param {!Object} tx The transaction.
 * @param {{store: !Object, p: !Object, ledger: !Object}} c The call.
 * @return {!Promise<{outcome: string, flag: ?string}>} What was written.
 */
async function applyCanceled(tx, c) {
  const {store, p} = c;
  const snap = await tx.get(store.collection('bookings')
      .where('calendlyInviteeUri', '==', String(p.uri || '')).limit(1));
  const booking = snap.empty ? null : docOf(snap.docs[0]);
  let outcome = 'not-found';
  if (booking && booking.data.status === 'cancelled') {
    outcome = 'already-cancelled';
  } else if (booking) {
    cancelBooking(tx, store, booking);
    outcome = 'applied';
  }
  tx.set(c.ledger.ref, Object.assign(c.ledger.row, {
    athleteId: booking ? booking.data.athleteId || null : null,
    householdId: booking ? booking.data.householdId || null : null,
    outcome,
  }));
  return {outcome, flag: null};
}

/**
 * One verified Calendly event: dedupe on the ledger id, apply, record.
 * @param {!Object} body The parsed webhook body `{event, payload}`.
 * @param {{db: !Object, now: (Date|undefined)}} deps Firestore + clock.
 * @return {!Promise<{outcome: string, flag: ?string}>} Always resolves for
 *     a well-formed event; rejects only when Firestore throws.
 */
async function handleCalendlyEvent(body, deps) {
  const store = deps.db;
  const nowDate = deps.now instanceof Date ? deps.now : new Date();
  const b = body || {};
  const p = b.payload || {};
  if (!EVENTS.includes(b.event)) return {outcome: 'ignored', flag: null};
  const inviteeUuid = uuidOf(p.uri);
  if (!inviteeUuid) return {outcome: 'malformed', flag: null};
  const ledger = {
    ref: store.collection('calendlyEvents').doc(`${inviteeUuid}_${b.event}`),
    row: {event: b.event, inviteeUri: p.uri, eventUri: p.event || null,
      athleteId: null, householdId: null, receivedAt: now(), outcome: null,
      flag: null},
  };
  const result = await store.runTransaction(async (tx) => {
    if ((await tx.get(ledger.ref)).exists) {
      return {outcome: 'duplicate', flag: null};
    }
    const c = {store, nowDate, p, ledger};
    return b.event === 'invitee.created' ? applyCreated(tx, c) :
        applyCanceled(tx, c);
  });
  console.log(`calendly ${b.event} ${inviteeUuid} -> ${result.outcome}` +
      `${result.flag ? ' flag=' + result.flag : ''}`);
  return result;
}

/**
 * The HTTPS endpoint (us-central1, raw body). Calendly posts server to
 * server; 400 for a bad signature, 200 otherwise, 500 on a Firestore throw.
 */
const calendlyWebhook = functions.runWith({secrets: CALENDLY_SECRETS})
    .https.onRequest(async (req, res) => {
      const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
      if (!key) {
        console.error('CALENDLY_WEBHOOK_SIGNING_KEY is not configured');
        res.status(500).send('Signing key not configured');
        return;
      }
      const v = verifyCalendlySignature(req.rawBody || '',
          req.header('calendly-webhook-signature') || '', key);
      if (!v.ok) {
        console.error(`calendly signature ${v.reason}`);
        res.status(400).send(`Signature ${v.reason}`);
        return;
      }
      let body;
      try {
        body = JSON.parse(Buffer.from(req.rawBody || '').toString('utf8'));
      } catch (err) {
        res.status(200).json({received: true, outcome: 'malformed'});
        return;
      }
      try {
        const result = await handleCalendlyEvent(body, {db: db(),
          now: new Date()});
        res.status(200).json(Object.assign({received: true}, result));
      } catch (err) {
        // 500 asks Calendly to retry; the ledger row is the dedupe guard.
        console.error('calendly event failed:', err);
        res.status(500).json({error: err.message});
      }
    });

module.exports = {
  MENTAL_MONTHLY_CAP, attendeeOf, calendlyWebhook, handleCalendlyEvent,
  mentalCapFor, slotOf, uuidOf,
};
