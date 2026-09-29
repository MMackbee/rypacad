# Functions - Sprint 20 Implementation Plan (part 6: Task 10, Steps 1-4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read `40-functions.md` first (Goal, Architecture, Global Constraints, Execution order, emulator command). Task 10 depends on Task 1 (`lib.chicagoTime`, `lib.bookingOpen`, `lib.membershipAllowsBooking(household, athlete)`), Task 4 (the reminder / cancel skips) and Task 8 (`secrets.js`). **This part holds Task 10 Steps 1-4** (verifier, `calendly.js`, the four fixtures in full); **Steps 5-7** (`verify-calendly.js`, the harness run, the commit) continue in `40-functions-part6b.md` - the split keeps each file under 900 lines.

---

### Task 10: calendly.js - verifyCalendlySignature and calendlyWebhook (closes #18) (MAY SLIP - Oct 10)

**Files:**
- Create: `functions/portal/calendly-verify.js`, `functions/portal/calendly-verify.test.js`, `functions/portal/calendly.js`, `functions/test/fixtures/calendly-invitee-created.json`, `functions/test/fixtures/calendly-invitee-canceled.json`, `functions/test/fixtures/calendly-reschedule-created.json`, `functions/test/fixtures/calendly-reschedule-canceled.json`, `functions/test/verify-calendly.js`
- Test: `functions/portal/calendly-verify.test.js` (unit), `functions/test/verify-calendly.js` (isolated emulator; in-process handler calls with a fixed clock + HTTP for the signature contract)

**Interfaces:**
- Consumes: `lib.chicagoDate`, `lib.chicagoTime`, `lib.todayISO`, `lib.periodFor`, `lib.tokensPosition`, `lib.chargeFor`, `lib.bookingOpen`, `lib.membershipAllowsBooking`, `lib.periodBookingsQuery`, `lib.rows`, `lib.bookingId` (`lib.js`); `secrets.CALENDLY_SECRETS`; `req.rawBody` (a Buffer on 1st-gen `onRequest`, as `stripe.js:404` uses it).
- Produces: `verifyCalendlySignature(rawBody, header, signingKey, nowMs?) -> {ok, reason}` (contract 6.3); `handleCalendlyEvent(body, deps) -> Promise<{outcome, flag?}>` with `deps = {db, now}`; `calendlyWebhook` = `functions.runWith({secrets: CALENDLY_SECRETS}).https.onRequest`; pure helpers `uuidOf(uri)`, `attendeeOf(qa)`, `slotOf(payload)`, `mentalCapFor(pkg)` (new, test seams).
- Ledger names, in the contract (decision D8): `calendlyEvents.outcome` gains `malformed` (no invitee uri / unparseable times - a body that cannot be keyed) and the row carries `flag` (the booking's flag, null when clean - report-visible). `ignored` (an event type the subscription should never send) is RETURNED only, never written. `MENTAL_MONTHLY_CAP = {elite: 2, default: 1}` is duplicated from `data/specialists.js:112` (CHANGE ONE, CHANGE BOTH, like `lib.js`'s period math). Flag precedence when several apply: `membership-inactive` > `before-open` > `over-cadence` > `over-cap`.

- [ ] **Step 1: Write the failing verifier test** `functions/portal/calendly-verify.test.js`

```js
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
```

Run: `cd functions && node portal/calendly-verify.test.js`
Expected: `Cannot find module './calendly-verify'`.

- [ ] **Step 2: Implement `functions/portal/calendly-verify.js`**

```js
/**
 * Calendly webhook signatures (spec 6.2, contract 6.3): header
 * `Calendly-Webhook-Signature: t=<unix>,v1=<hex>`, HMAC-SHA256 over
 * `t + '.' + rawBody` with the subscription's signing key. Pure; the clock
 * is injectable. Constant-time compare.
 */
'use strict';

const crypto = require('node:crypto');

/** Reject a `t` this far from now, in seconds. @const {number} */
const TOLERANCE_S = 300;
const HEX64 = /^[0-9a-f]{64}$/;

/**
 * @param {Buffer|string} rawBody The request body exactly as received.
 * @param {?string} header The `Calendly-Webhook-Signature` value.
 * @param {string} signingKey The subscription's signing key.
 * @param {number=} nowMs The clock; default `Date.now()`.
 * @return {{ok: boolean, reason: ?string}} `reason` is null when ok, else
 *     `'missing' | 'malformed' | 'stale' | 'mismatch'`.
 */
function verifyCalendlySignature(rawBody, header, signingKey, nowMs) {
  if (!header) return {ok: false, reason: 'missing'};
  const parts = {};
  for (const kv of String(header).split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const t = Number(parts.t);
  const v1 = String(parts.v1 || '').toLowerCase();
  if (!Number.isInteger(t) || !HEX64.test(v1)) {
    return {ok: false, reason: 'malformed'};
  }
  const now = nowMs === undefined ? Date.now() : nowMs;
  if (Math.abs(now / 1000 - t) > TOLERANCE_S) {
    return {ok: false, reason: 'stale'};
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody :
      Buffer.from(String(rawBody), 'utf8');
  const expected = crypto.createHmac('sha256', String(signingKey))
      .update(`${t}.`).update(body).digest();
  const given = Buffer.from(v1, 'hex');
  if (expected.length !== given.length ||
      !crypto.timingSafeEqual(expected, given)) {
    return {ok: false, reason: 'mismatch'};
  }
  return {ok: true, reason: null};
}

module.exports = {TOLERANCE_S, verifyCalendlySignature};
```

Run: `cd functions && node portal/calendly-verify.test.js && npm run lint`
Expected: `4 passing`, lint clean.

- [ ] **Step 3: Implement `functions/portal/calendly.js`**

```js
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
 * Resolve the athlete (spec 6.2 step 1): `utm_content` -> athletes/{id};
 * else the invitee email through `users` (an athlete account directly, a
 * parent account -> the household's only athlete). Anything else -> null.
 * @param {!Object} tx The transaction.
 * @param {!Object} store Firestore.
 * @param {!Object} p `body.payload`.
 * @return {!Promise<?{id: string, data: !Object, ref: !Object}>} Athlete.
 */
async function resolveAthlete(tx, store, p) {
  const utm = p.tracking && p.tracking.utm_content;
  if (utm) {
    const a = docOf(await tx.get(
        store.collection('athletes').doc(String(utm))));
    if (a) return a;
  }
  const email = String(p.email || '').trim();
  if (!email) return null;
  const users = store.collection('users');
  let snap = await tx.get(users.where('email', '==', email).limit(2));
  if (snap.empty && email !== email.toLowerCase()) {
    snap = await tx.get(
        users.where('email', '==', email.toLowerCase()).limit(2));
  }
  if (snap.size !== 1) return null;
  const u = snap.docs[0].data() || {};
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
```

Run: `cd functions && npm run lint`
Expected: clean (`calendly.js` is ~300 lines).

- [ ] **Step 4: Write the fixtures** (Calendly API v2 webhook shapes; uuids are the ones the harness asserts on)

`functions/test/fixtures/calendly-invitee-created.json`:

```json
{
  "created_at": "2026-10-12T15:04:05.000000Z",
  "created_by": "https://api.calendly.com/users/9c5f2b1e-3d4a-4f6b-8e7c-1a2b3c4d5e6f",
  "event": "invitee.created",
  "payload": {
    "cancel_url": "https://calendly.com/cancellations/1a2b3c4d-5e6f-4a7b-8c9d-000000000001",
    "created_at": "2026-10-12T15:04:05.000000Z",
    "email": "nina@example.test",
    "event": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000001",
    "first_name": "Lena",
    "last_name": "Novak",
    "name": "Lena Novak",
    "new_invitee": null,
    "old_invitee": null,
    "questions_and_answers": [
      {"answer": "Lena Novak", "position": 0, "question": "Athlete name"},
      {"answer": "Athlete", "position": 1, "question": "Who is attending?"},
      {"answer": "nina@example.test", "position": 2, "question": "Parent email"}
    ],
    "reschedule_url": "https://calendly.com/reschedulings/1a2b3c4d-5e6f-4a7b-8c9d-000000000001",
    "rescheduled": false,
    "routing_form_submission": null,
    "scheduled_event": {
      "created_at": "2026-10-12T15:04:05.000000Z",
      "end_time": "2026-10-14T21:30:00.000000Z",
      "event_guests": [],
      "event_memberships": [{"user": "https://api.calendly.com/users/9c5f2b1e-3d4a-4f6b-8e7c-1a2b3c4d5e6f", "user_email": "yannick@example.test", "user_name": "Yannick"}],
      "event_type": "https://api.calendly.com/event_types/7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a",
      "invitees_counter": {"active": 1, "limit": 1, "total": 1},
      "location": {"type": "physical", "location": "RYP Academy"},
      "name": "RYP Academy - Mental Game 1:1",
      "start_time": "2026-10-14T21:00:00.000000Z",
      "status": "active",
      "updated_at": "2026-10-12T15:04:05.000000Z",
      "uri": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000001"
    },
    "scheduling_method": null,
    "status": "active",
    "text_reminder_number": null,
    "timezone": "America/Chicago",
    "tracking": {"utm_campaign": "novak", "utm_source": "ryp-portal", "utm_medium": "portal", "utm_content": "lena", "utm_term": null, "salesforce_uuid": null},
    "updated_at": "2026-10-12T15:04:05.000000Z",
    "uri": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000001/invitees/1a2b3c4d-5e6f-4a7b-8c9d-000000000001"
  }
}
```

`functions/test/fixtures/calendly-reschedule-created.json` - the NEW half of a reschedule (event `...002`, invitee `...002`, Oct 16 at 4:30 PM Chicago, `old_invitee` = the first invitee):

```json
{
  "created_at": "2026-10-13T09:00:00.000000Z",
  "created_by": "https://api.calendly.com/users/9c5f2b1e-3d4a-4f6b-8e7c-1a2b3c4d5e6f",
  "event": "invitee.created",
  "payload": {
    "cancel_url": "https://calendly.com/cancellations/1a2b3c4d-5e6f-4a7b-8c9d-000000000002",
    "created_at": "2026-10-13T09:00:00.000000Z",
    "email": "nina@example.test",
    "event": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000002",
    "first_name": "Lena",
    "last_name": "Novak",
    "name": "Lena Novak",
    "new_invitee": null,
    "old_invitee": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000001/invitees/1a2b3c4d-5e6f-4a7b-8c9d-000000000001",
    "questions_and_answers": [
      {"answer": "Lena Novak", "position": 0, "question": "Athlete name"},
      {"answer": "Athlete", "position": 1, "question": "Who is attending?"},
      {"answer": "nina@example.test", "position": 2, "question": "Parent email"}
    ],
    "reschedule_url": "https://calendly.com/reschedulings/1a2b3c4d-5e6f-4a7b-8c9d-000000000002",
    "rescheduled": false,
    "routing_form_submission": null,
    "scheduled_event": {
      "created_at": "2026-10-13T09:00:00.000000Z",
      "end_time": "2026-10-16T22:00:00.000000Z",
      "event_guests": [],
      "event_memberships": [{"user": "https://api.calendly.com/users/9c5f2b1e-3d4a-4f6b-8e7c-1a2b3c4d5e6f", "user_email": "yannick@example.test", "user_name": "Yannick"}],
      "event_type": "https://api.calendly.com/event_types/7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a",
      "invitees_counter": {"active": 1, "limit": 1, "total": 1},
      "location": {"type": "physical", "location": "RYP Academy"},
      "name": "RYP Academy - Mental Game 1:1",
      "start_time": "2026-10-16T21:30:00.000000Z",
      "status": "active",
      "updated_at": "2026-10-13T09:00:00.000000Z",
      "uri": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000002"
    },
    "scheduling_method": null,
    "status": "active",
    "text_reminder_number": null,
    "timezone": "America/Chicago",
    "tracking": {"utm_campaign": "novak", "utm_source": "ryp-portal", "utm_medium": "portal", "utm_content": "lena", "utm_term": null, "salesforce_uuid": null},
    "updated_at": "2026-10-13T09:00:00.000000Z",
    "uri": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000002/invitees/1a2b3c4d-5e6f-4a7b-8c9d-000000000002"
  }
}
```

`functions/test/fixtures/calendly-reschedule-canceled.json` - the OLD half (Calendly may deliver it AFTER the created above):

```json
{
  "created_at": "2026-10-13T09:00:00.000000Z",
  "created_by": "https://api.calendly.com/users/9c5f2b1e-3d4a-4f6b-8e7c-1a2b3c4d5e6f",
  "event": "invitee.canceled",
  "payload": {
    "cancel_url": "https://calendly.com/cancellations/1a2b3c4d-5e6f-4a7b-8c9d-000000000001",
    "cancellation": {"canceled_by": "Lena Novak", "canceler_type": "invitee", "reason": null, "created_at": "2026-10-13T09:00:00.000000Z"},
    "created_at": "2026-10-12T15:04:05.000000Z",
    "email": "nina@example.test",
    "event": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000001",
    "first_name": "Lena",
    "last_name": "Novak",
    "name": "Lena Novak",
    "new_invitee": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000002/invitees/1a2b3c4d-5e6f-4a7b-8c9d-000000000002",
    "old_invitee": null,
    "questions_and_answers": [
      {"answer": "Lena Novak", "position": 0, "question": "Athlete name"},
      {"answer": "Athlete", "position": 1, "question": "Who is attending?"},
      {"answer": "nina@example.test", "position": 2, "question": "Parent email"}
    ],
    "reschedule_url": "https://calendly.com/reschedulings/1a2b3c4d-5e6f-4a7b-8c9d-000000000001",
    "rescheduled": true,
    "routing_form_submission": null,
    "scheduled_event": {
      "created_at": "2026-10-12T15:04:05.000000Z",
      "end_time": "2026-10-14T21:30:00.000000Z",
      "event_guests": [],
      "event_memberships": [{"user": "https://api.calendly.com/users/9c5f2b1e-3d4a-4f6b-8e7c-1a2b3c4d5e6f", "user_email": "yannick@example.test", "user_name": "Yannick"}],
      "event_type": "https://api.calendly.com/event_types/7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a",
      "invitees_counter": {"active": 0, "limit": 1, "total": 1},
      "location": {"type": "physical", "location": "RYP Academy"},
      "name": "RYP Academy - Mental Game 1:1",
      "start_time": "2026-10-14T21:00:00.000000Z",
      "status": "canceled",
      "updated_at": "2026-10-13T09:00:00.000000Z",
      "uri": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000001"
    },
    "scheduling_method": null,
    "status": "canceled",
    "text_reminder_number": null,
    "timezone": "America/Chicago",
    "tracking": {"utm_campaign": "novak", "utm_source": "ryp-portal", "utm_medium": "portal", "utm_content": "lena", "utm_term": null, "salesforce_uuid": null},
    "updated_at": "2026-10-13T09:00:00.000000Z",
    "uri": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000001/invitees/1a2b3c4d-5e6f-4a7b-8c9d-000000000001"
  }
}
```

`functions/test/fixtures/calendly-invitee-canceled.json` - a plain cancellation of the rescheduled (second) booking on Oct 15: every uuid is `...000000000002` (event, cancel_url, reschedule_url, scheduled_event.uri, uri), `new_invitee` and `old_invitee` both null, `rescheduled: false`, the Oct 16 4:30 PM slot:

```json
{
  "created_at": "2026-10-15T12:00:00.000000Z",
  "created_by": "https://api.calendly.com/users/9c5f2b1e-3d4a-4f6b-8e7c-1a2b3c4d5e6f",
  "event": "invitee.canceled",
  "payload": {
    "cancel_url": "https://calendly.com/cancellations/1a2b3c4d-5e6f-4a7b-8c9d-000000000002",
    "cancellation": {"canceled_by": "Lena Novak", "canceler_type": "invitee", "reason": null, "created_at": "2026-10-15T12:00:00.000000Z"},
    "created_at": "2026-10-13T09:00:00.000000Z",
    "email": "nina@example.test",
    "event": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000002",
    "first_name": "Lena",
    "last_name": "Novak",
    "name": "Lena Novak",
    "new_invitee": null,
    "old_invitee": null,
    "questions_and_answers": [
      {"answer": "Lena Novak", "position": 0, "question": "Athlete name"},
      {"answer": "Athlete", "position": 1, "question": "Who is attending?"},
      {"answer": "nina@example.test", "position": 2, "question": "Parent email"}
    ],
    "reschedule_url": "https://calendly.com/reschedulings/1a2b3c4d-5e6f-4a7b-8c9d-000000000002",
    "rescheduled": false,
    "routing_form_submission": null,
    "scheduled_event": {
      "created_at": "2026-10-13T09:00:00.000000Z",
      "end_time": "2026-10-16T22:00:00.000000Z",
      "event_guests": [],
      "event_memberships": [{"user": "https://api.calendly.com/users/9c5f2b1e-3d4a-4f6b-8e7c-1a2b3c4d5e6f", "user_email": "yannick@example.test", "user_name": "Yannick"}],
      "event_type": "https://api.calendly.com/event_types/7d8e9f0a-1b2c-4d3e-9f4a-5b6c7d8e9f0a",
      "invitees_counter": {"active": 0, "limit": 1, "total": 1},
      "location": {"type": "physical", "location": "RYP Academy"},
      "name": "RYP Academy - Mental Game 1:1",
      "start_time": "2026-10-16T21:30:00.000000Z",
      "status": "canceled",
      "updated_at": "2026-10-15T12:00:00.000000Z",
      "uri": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000002"
    },
    "scheduling_method": null,
    "status": "canceled",
    "text_reminder_number": null,
    "timezone": "America/Chicago",
    "tracking": {"utm_campaign": "novak", "utm_source": "ryp-portal", "utm_medium": "portal", "utm_content": "lena", "utm_term": null, "salesforce_uuid": null},
    "updated_at": "2026-10-15T12:00:00.000000Z",
    "uri": "https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000002/invitees/1a2b3c4d-5e6f-4a7b-8c9d-000000000002"
  }
}
```

Check the four files parse: `cd functions && node -e "for (const f of ['invitee-created','invitee-canceled','reschedule-created','reschedule-canceled']) JSON.parse(require('fs').readFileSync('test/fixtures/calendly-'+f+'.json','utf8')); console.log('4 fixtures ok')"` -> `4 fixtures ok`.

---
Continue with `40-functions-part6b.md` (Task 10 Steps 5-7: `verify-calendly.js`, the harness run, the commit).
