# Functions - Sprint 20 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This plan is split in eight files** (each under 900 lines; the header,
Global Constraints and emulator command below apply to every part; task
numbering is continuous, 1-13):
`40-functions.md` Tasks 1-4 (lib helpers, prepaid month, catalogue,
notices/skips); `40-functions-part2.md` Tasks 5-6 (Stripe resolution and
per-athlete billing writers); `40-functions-part3.md` Task 7 (the webhook
rework + `verify-stripe-launch.js`); `40-functions-part4.md` Task 8
(`secrets.js`, validation, `createFamily`/`addAthletes`/`claimInvite`);
`40-functions-part5.md` Task 9 (`createCheckoutSession`);
`40-functions-part6.md` Task 10 Steps 1-4 (`calendlyWebhook` + fixtures) and
`40-functions-part6b.md` Task 10 Steps 5-7 (`verify-calendly.js`);
`40-functions-part7.md` Tasks 11-13 (`index.js` secret binding + exports,
the owner runbook, the Stripe harness top-up).

## Execution order

- **Tasks 1, 2, 3 first, in that order** - every later task imports
  `lib.js`'s new helpers, `prepaid.js`, `tiny.js` or `catalogue.js`.
- Then 4, 5, 6, 7 (7 needs 3, 5, 6), 8 (creates `secrets.js`, which 9, 10
  and 11 bind), 9, 10.
- **Task 11 lands AFTER db lane Task 7** (the `env.template` rewrite and the
  `.env` / `.env.local` split, decision D15). Task 11 Step 4 creates this
  worktree's gitignored `functions/.env.local` and `functions/.secret.local`
  with the harness values; Task 7 Step 5 and Task 10 Step 6 (the emulator
  harnesses) need those files too - do Task 11 Step 4 as soon as db Task 7
  is merged into the worktree, or run those two harness steps after Task 11.
- Task 12 (runbook) and 13 (harness top-up) last; 13 needs 11 (STEP H's
  precondition is the `STRIPE_SECRET_KEY='sk_test_harness'` line from Step 4).

**Goal:** Ship the five new Cloud Functions (`createFamily`, `addAthletes`,
`claimInvite`, `createCheckoutSession`, `calendlyWebhook`) plus the
per-athlete Stripe webhook rework, with every function declaring its secrets.

**Architecture:** Every callable is `firebase-functions/v1` `https.onCall`
around a plain exported handler `(data, context, deps)` so the isolated
emulator harnesses call handlers in-process (admin SDK on 8082) and the HTTPS
functions over HTTP on 5001. Stripe reads happen OUTSIDE `runTransaction`;
every Firestore effect and its ledger row commit in ONE transaction. New code
goes in new files (`prepaid.js`, `catalogue.js`, `stripe-resolve.js`,
`stripe-billing.js`, `stripe-checkout.js`, `checkout.js`, `family.js`,
`family-validate.js`, `calendly.js`, `calendly-verify.js`) so `lib.js` (350
lines) and `stripe.js` (425) stay under 500.

**Tech Stack:** Node 22 CommonJS, `firebase-functions@^6` (v1 entry point,
`functions/index.js:60`), `firebase-admin@^12`, `stripe@^18` (API
`2025-07-30.basil`, `functions/node_modules/stripe/cjs/apiVersion.js`),
`node:assert/strict` unit files run with plain `node`, emulator harnesses in
`functions/test/` against `firebase.functions-lane.json` (firestore 8082,
functions 5001).

**Spec:** docs/portal/SPRINT-20-LAUNCH.md sections 2.2, 2.3, 3.2, 4.2, 4.3,
4.4 (`membershipAllowsBooking`), 4.5, 6.2, 8, 11 (functions rows), 12.5-12.9.
**Interfaces:** docs/portal/plans/2026-09-28-sprint-20-launch/01-interfaces.md
(sections 1, 2, 6, 7.2, 8).
**GitHub issues:** #16, #17, #18, #28, #29.

Naming note: the lane brief says `functions/portal/provision.js`; the
contract (1.1, authoritative) says `functions/portal/family.js` for the three
provisioning handlers. This plan uses `family.js`.

## Global Constraints

- Token window is **30** days (Elite 45); `lib.test.js` fixtures move 32 -> 30.
- `BOOKING_OPENS_AT = 1791633600000` (2026-10-10T12:00:00Z = 07:00 America/Chicago); Elite is exempt.
- Charging never branches on session type (`lib.js:14-16`); the ONE named exception is Yannick's monthly cadence, which is a flag here, never a refusal.
- Tokens are derived, never stored: an over-cap Calendly booking floors `left` at 0 (spec 6.2 step 4).
- Rules keep closed `hasAll`/`hasOnly` lists; `billing`, `facilityBilling`, `source`, `calendlyInviteeUri`, `flag` are server-written only (contract 2).
- Every file stays under 500 lines (split before it would cross).
- No secrets in source or in a tracked file; `functions/.env` carries non-secret keys only; secret VALUES are named, never printed.
- The sign-up payment prepays November (before Nov 1), recurring billing anchors on the 1st from Dec 1, `PRORATE_JOINERS = true` (rulings 0.11-0.13).
- Calendly webhook: 400 only for a bad signature, 200 for every verified event, 500 only for a Firestore throw (spec 6.2).
- `functions` lint is `cd functions && npm run lint` (google style, 2-space, single quotes, max-len 80, JSDoc on every function).
- Unit tests: `cd functions && node portal/<file>.test.js`; harnesses: `cd functions && node test/<file>.js` with the isolated emulator running.
- Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Agents never push or deploy.

Emulator start (every harness step below assumes it):

```bash
cd functions && npx firebase-tools emulators:start --only firestore,functions --project rypacad --config ../firebase.functions-lane.json
```

---

### Task 1: lib.js launch helpers (closes part of #17, #18)

**Files:**
- Modify: `functions/portal/lib.js:229-239` (`membershipAllowsBooking`), `:327-350` (exports)
- Modify: `functions/portal/lib.test.js:19-21` (fixtures), `:265-276` (membership cases)
- Modify: `functions/portal/promotion.js:98` (pass the athlete)
- Test: `functions/portal/lib.test.js`

**Interfaces:**
- Consumes: `lib.TZ`, `lib.chicagoDate` (`lib.js:26,43`).
- Produces: `BOOKING_OPENS_AT: number`; `bookingOpen(now: number|Date, pkg: ?{kind}) -> boolean`; `chicagoTime(date: Date) -> '4:00 PM'`; `ageAt(dobISO: string, todayISO: string) -> ?number`; `membershipAllowsBooking(household, athlete) -> boolean`.

- [ ] **Step 1: Write the failing tests** (append before `main()` in `lib.test.js`, and change the three fixture `windowDays: 32` at `:19,21` to `30`)

```js
// --- Sprint 20 launch helpers ----------------------------------------------

test('chicagoTime: h:mm AM/PM with a plain U+0020 (sync parity)', () => {
  assert.equal(lib.chicagoTime(new Date('2026-10-14T21:00:00Z')), '4:00 PM');
  assert.equal(lib.chicagoTime(new Date('2026-12-02T15:30:00Z')), '9:30 AM');
  assert.equal(lib.chicagoTime(new Date('2026-10-14T21:00:00Z')).charCodeAt(4),
      32);
});

test('bookingOpen: gate at BOOKING_OPENS_AT, Elite exempt', () => {
  assert.equal(lib.BOOKING_OPENS_AT, 1791633600000);
  assert.equal(lib.bookingOpen(1791633600000 - 1, T12), false);
  assert.equal(lib.bookingOpen(1791633600000, T12), true);
  assert.equal(lib.bookingOpen(new Date(1791633600000 - 1), ELITE), true);
  assert.equal(lib.bookingOpen(1791633600000 - 1, null), false);
});

test('ageAt: whole years, birthday-aware, null when unparseable', () => {
  assert.equal(lib.ageAt('2008-09-28', '2026-09-28'), 18);
  assert.equal(lib.ageAt('2008-09-29', '2026-09-28'), 17);
  assert.equal(lib.ageAt('2013-02-01', '2026-09-28'), 13);
  assert.equal(lib.ageAt('nope', '2026-09-28'), null);
  assert.equal(lib.ageAt(null, '2026-09-28'), null);
});

test('membershipAllowsBooking: athlete billing gates too (absent == active)',
    () => {
      assert.equal(lib.membershipAllowsBooking({}, {}), true);
      assert.equal(lib.membershipAllowsBooking({}, null), true);
      assert.equal(lib.membershipAllowsBooking({},
          {billing: {status: 'active'}}), true);
      assert.equal(lib.membershipAllowsBooking({},
          {billing: {status: 'pending'}}), false);
      assert.equal(lib.membershipAllowsBooking({membership: {status: 'lapsed'}},
          {billing: {status: 'active'}}), false);
    });
```

- [ ] **Step 2: Run it**

Run: `cd functions && node portal/lib.test.js`
Expected: `FAIL  chicagoTime: ...` with `TypeError: lib.chicagoTime is not a function`.

- [ ] **Step 3: Implement** (in `lib.js`: add after `chicagoDate` at `:47`; replace `membershipAllowsBooking` at `:235-239`; add the new names to `module.exports`)

```js
/** Booking opens for token members (spec 5). 2026-10-10T12:00:00Z. */
const BOOKING_OPENS_AT = 1791633600000;

const chicagoClock = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true,
});

/**
 * A `Date` as `'4:00 PM'` in America/Chicago, composed from parts with a
 * plain space (Node's `format()` may emit U+202F before AM/PM).
 * @param {Date} date Any instant.
 * @return {string} `'h:mm AM'`.
 */
function chicagoTime(date) {
  const p = {};
  for (const x of chicagoClock.formatToParts(date)) p[x.type] = x.value;
  return `${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}

/**
 * Whether booking is open (spec 5): Elite always, everyone else from
 * BOOKING_OPENS_AT. Mirrors `data/calendar.js#bookingOpen`.
 * @param {number|Date} now Epoch millis or a Date.
 * @param {?Object} pkg A `packages/{id}` body (needs `kind`).
 * @return {boolean} True when a booking may be made now.
 */
function bookingOpen(now, pkg) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  return Boolean(pkg && pkg.kind === 'elite') || t >= BOOKING_OPENS_AT;
}

/**
 * Whole years between a DOB and a date (the 18+ check, spec 2.1).
 * @param {?string} dobISO `'YYYY-MM-DD'`.
 * @param {string} todayISO `'YYYY-MM-DD'`.
 * @return {?number} Age in years, or null when the DOB does not parse.
 */
function ageAt(dobISO, todayISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dobISO || ''))) return null;
  const [y, m, d] = String(dobISO).split('-').map(Number);
  const [ty, tm, td] = String(todayISO).split('-').map(Number);
  if (Number.isNaN(toUTC(dobISO).getTime())) return null;
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

/**
 * Membership freeze (pin H) plus the per-athlete paid gate (spec 4.4).
 * `households.membership` and `athletes.billing` are both absent == active.
 * @param {?Object} household A `households/{id}` body.
 * @param {?Object=} athlete An `athletes/{id}` body.
 * @return {boolean} False when the household is past_due/lapsed or the
 *     athlete's `billing.status` is present and not 'active'.
 */
function membershipAllowsBooking(household, athlete) {
  const status = household && household.membership &&
      household.membership.status;
  if (status === 'past_due' || status === 'lapsed') return false;
  const billing = athlete && athlete.billing;
  return !billing || billing.status === 'active';
}
```

Then in `promotion.js:98` change `lib.membershipAllowsBooking(household)` to
`lib.membershipAllowsBooking(household, athlete)` (`athlete` is in scope at
`:89`).

- [ ] **Step 4: Run again**

Run: `cd functions && node portal/lib.test.js && npm run lint`
Expected: `31 passing`, lint clean.

- [ ] **Step 5: Commit**

```bash
git add functions/portal/lib.js functions/portal/lib.test.js functions/portal/promotion.js
git commit -m "feat(functions): chicagoTime, bookingOpen, ageAt, athlete billing gate" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: prepaid.js - the prepaid month (closes part of #17)

**Files:**
- Create: `functions/portal/prepaid.js`, `functions/portal/tiny.js` (the shared test runner), `functions/portal/prepaid.test.js`
- Modify: `functions/portal/lib.js:327-350` (re-export `PRORATE_JOINERS`, `prepaidPeriodFor`)

**Interfaces:**
- Consumes: `lib.chicagoDate`, `lib.periodFor`, `lib.nextPeriod`, `lib.TZ`.
- Produces: `PRORATE_JOINERS = true`; `prepaidPeriodFor(now: Date|number, {priceCents: number, tokens: ?number, prorate?: boolean}) -> {periodKey, periodEnd, trialEnd (unix s), amountCents, tokens, prorated, label}`; `chicagoMidnightUnix(iso) -> number` (new, not in contract); `tiny.test(name, fn)` / `tiny.run()` (new, not in contract).

- [ ] **Step 1: Write `tiny.js`** (the runner `lib.test.js:23-31,313-327` inlines, shared by every new unit file)

```js
/**
 * The three-line test runner every `*.test.js` in this folder shares:
 * `node portal/x.test.js`, first failure exits 1. No framework.
 */
'use strict';

const cases = [];
/** @param {string} name The case. @param {function()} fn The body. */
function test(name, fn) {
  cases.push({name, fn});
}
/** @return {!Promise<void>} Runs every case in order. */
async function run() {
  for (const c of cases) {
    try {
      await c.fn();
    } catch (err) {
      console.error(`  FAIL  ${c.name}\n${err && err.stack}`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ok  ${c.name}`);
  }
  console.log(`\n${cases.length} passing`);
}
module.exports = {test, run};
```

- [ ] **Step 2: Write the failing test** `prepaid.test.js`

```js
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const prepaid = require('./prepaid');

const OCT = new Date('2026-10-05T18:00:00Z');
const NOV12 = new Date('2026-11-12T18:00:00Z'); // 19 of 30 days remain

test('chicagoMidnightUnix: Dec 1 00:00 CST', () => {
  assert.equal(prepaid.chicagoMidnightUnix('2026-12-01'), 1796104800);
  assert.equal(prepaid.chicagoMidnightUnix('2026-11-01'), 1793509200);
});

test('before Nov 1: November at full price, trial ends Dec 1', () => {
  const p = prepaid.prepaidPeriodFor(OCT, {priceCents: 29900, tokens: 6});
  assert.deepEqual(p, {periodKey: '2026-11-01', periodEnd: '2026-11-30',
    trialEnd: 1796104800, amountCents: 29900, tokens: 6, prorated: false,
    label: 'November 2026'});
});

test('after Nov 1: prorate price and tokens by days remaining', () => {
  const p = prepaid.prepaidPeriodFor(NOV12, {priceCents: 29900, tokens: 6});
  assert.equal(p.periodKey, '2026-11-01');
  assert.equal(p.trialEnd, 1796104800);
  assert.equal(p.amountCents, Math.round(29900 * 19 / 30));
  assert.equal(p.tokens, 4); // ceil(6 * 19/30) = 4
  assert.equal(p.prorated, true);
});

test('prorated tokens never 0; Elite null stays null; prorate off', () => {
  const late = new Date('2026-11-30T18:00:00Z');
  assert.equal(prepaid.prepaidPeriodFor(late,
      {priceCents: 6500, tokens: 1}).tokens, 1);
  assert.equal(prepaid.prepaidPeriodFor(late,
      {priceCents: 99900, tokens: null}).tokens, null);
  const full = prepaid.prepaidPeriodFor(NOV12,
      {priceCents: 29900, tokens: 6, prorate: false});
  assert.deepEqual([full.amountCents, full.tokens, full.prorated],
      [29900, 6, false]);
});

test('PRORATE_JOINERS is the ruling', () => {
  assert.equal(prepaid.PRORATE_JOINERS, true);
});

run();
```

Run: `cd functions && node portal/prepaid.test.js`
Expected: `Cannot find module './prepaid'`.

- [ ] **Step 3: Implement `prepaid.js`**

```js
/**
 * The prepaid month (spec 4.2, rulings 0.11 and 0.13): before Nov 1 every
 * checkout prepays November 2026 in full; from Nov 1 it prepays the rest of
 * the current Chicago month, prorated by days remaining (tokens rounded up,
 * never 0), and the subscription first bills at 00:00 Chicago on the next
 * 1st. Pure; `now` is injectable.
 */
'use strict';

const lib = require('./lib');

/** Ruling 0.13, not a default. @const {boolean} */
const PRORATE_JOINERS = true;
/** The season's first billable period. @const {string} */
const SEASON_FIRST_PERIOD = '2026-11-01';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const clock = new Intl.DateTimeFormat('en-US', {
  timeZone: lib.TZ, hour: '2-digit', hour12: false,
});

/**
 * Unix seconds of 00:00 America/Chicago on a calendar date. Tries each UTC
 * offset the zone can have (CDT -5, CST -6) and keeps the one that formats
 * back to hour 0 on that date, so no DST edge can be off by an hour.
 * @param {string} iso `'YYYY-MM-DD'`.
 * @return {number} Unix seconds.
 */
function chicagoMidnightUnix(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  for (const h of [5, 6]) {
    const t = new Date(Date.UTC(y, m - 1, d, h));
    const hour = Number(clock.formatToParts(t)
        .find((p) => p.type === 'hour').value) % 24;
    if (lib.chicagoDate(t) === iso && hour === 0) return t.getTime() / 1000;
  }
  throw new Error(`no Chicago midnight for ${iso}`);
}

/**
 * @param {string} periodKey `'YYYY-MM-01'`.
 * @return {string} `'November 2026'`.
 */
function labelFor(periodKey) {
  const [y, m] = periodKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/**
 * Which month a checkout prepays, and for how much.
 * @param {Date|number} now The instant of checkout.
 * @param {{priceCents: number, tokens: ?number, prorate: (boolean|undefined)}}
 *     args The package's monthly price and token count (null == Elite).
 * @return {{periodKey: string, periodEnd: string, trialEnd: number,
 *     amountCents: number, tokens: ?number, prorated: boolean,
 *     label: string}} The prepaid period.
 */
function prepaidPeriodFor(now, args) {
  const prorate = args.prorate === undefined ? PRORATE_JOINERS : args.prorate;
  const today = lib.chicagoDate(now instanceof Date ? now : new Date(now));
  const base = today < SEASON_FIRST_PERIOD ?
      lib.periodFor(SEASON_FIRST_PERIOD, 1) : lib.periodFor(today, 1);
  const next = lib.nextPeriod(base.periodKey, 1).periodKey;
  const out = {
    periodKey: base.periodKey,
    periodEnd: base.periodEnd,
    trialEnd: chicagoMidnightUnix(next),
    amountCents: args.priceCents,
    tokens: args.tokens === undefined ? null : args.tokens,
    prorated: false,
    label: labelFor(base.periodKey),
  };
  if (today < SEASON_FIRST_PERIOD || !prorate) return out;
  const daysInMonth = Number(base.periodEnd.slice(8, 10));
  const daysRemaining = daysInMonth - Number(today.slice(8, 10)) + 1;
  if (daysRemaining >= daysInMonth) return out;
  out.amountCents = Math.round(args.priceCents * daysRemaining / daysInMonth);
  out.tokens = out.tokens === null ? null :
      Math.max(1, Math.ceil(out.tokens * daysRemaining / daysInMonth));
  out.prorated = true;
  return out;
}

module.exports = {
  PRORATE_JOINERS, SEASON_FIRST_PERIOD, chicagoMidnightUnix, prepaidPeriodFor,
};
```

Then in `lib.js`, `module.exports` gains
`get PRORATE_JOINERS() { return require('./prepaid').PRORATE_JOINERS; }` and
`prepaidPeriodFor: (...a) => require('./prepaid').prepaidPeriodFor(...a)`
(lazy, because `prepaid.js` requires `lib.js`).

- [ ] **Step 4: Run**

Run: `cd functions && node portal/prepaid.test.js && node portal/lib.test.js && npm run lint`
Expected: `5 passing`, `31 passing`, lint clean.

- [ ] **Step 5: Commit**

```bash
git add functions/portal/prepaid.js functions/portal/prepaid.test.js functions/portal/tiny.js functions/portal/lib.js
git commit -m "feat(functions): prepaidPeriodFor - November prepaid, prorated joiners" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: catalogue.js and the price-id JSON (closes part of #17)

**Files:**
- Read (exists, committed `1b3dc3d` - never rewrite): `functions/config/stripe-catalogue.json`
- Create: `functions/portal/catalogue.js`, `functions/portal/catalogue.test.js`

**Interfaces:**
- Produces: `stripeMode() -> 'test'|'live'`; `priceIdFor(key, cat?) -> ?string`; `packageIdForPrice(priceId, cat?) -> ?string`; `FACILITY_KEY = 'facility-access'`; `loadCatalogue() -> object` (new, not in contract).

- [ ] **Step 1: Confirm the JSON - do NOT write it.** `functions/config/stripe-catalogue.json` (decision D3: this path, not `scripts/config/`; spec 4.1 / 12.2 match) is already committed on the base branch (`1b3dc3d`, 2026-09-28): the `test` block holds the owner's six `price_...` ids, `live` is all `null`. Neither this lane nor db Task 1 creates or rewrites it - there is no add/add to resolve (review finding 11). Check: `git log --oneline -1 -- functions/config/stripe-catalogue.json` prints `1b3dc3d` (or a later OWNER commit pasting the LIVE ids - never a lane commit). Shape:

```json
{
  "test": { "t-6": "price_...", "t-12": "price_...", "t-16": "price_...", "elite": "price_...", "single": "price_...", "facility-access": "price_..." },
  "live": { "t-6": null, "t-12": null, "t-16": null, "elite": null, "single": null, "facility-access": null }
}
```

- [ ] **Step 2: Write the failing test** `catalogue.test.js`

```js
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const cat = require('./catalogue');

const FIX = {
  test: {'t-6': 'price_t6_test', 'elite': 'price_elite_test',
    'facility-access': 'price_fac_test', 'single': null},
  live: {'t-6': 'price_t6_live'},
};

test('stripeMode: live only when STRIPE_MODE=live', () => {
  delete process.env.STRIPE_MODE;
  assert.equal(cat.stripeMode(), 'test');
  process.env.STRIPE_MODE = 'live';
  assert.equal(cat.stripeMode(), 'live');
  process.env.STRIPE_MODE = 'test';
});

test('priceIdFor / packageIdForPrice over the current mode', () => {
  assert.equal(cat.priceIdFor('t-6', FIX), 'price_t6_test');
  assert.equal(cat.priceIdFor('single', FIX), null);
  assert.equal(cat.priceIdFor(cat.FACILITY_KEY, FIX), 'price_fac_test');
  assert.equal(cat.packageIdForPrice('price_elite_test', FIX), 'elite');
  assert.equal(cat.packageIdForPrice('price_fac_test', FIX), null);
  assert.equal(cat.packageIdForPrice('price_t6_live', FIX), null);
  process.env.STRIPE_MODE = 'live';
  assert.equal(cat.priceIdFor('t-6', FIX), 'price_t6_live');
  process.env.STRIPE_MODE = 'test';
});

test('the committed JSON has exactly the twelve keys; test ids present', () => {
  const json = cat.loadCatalogue();
  const keys = ['t-6', 't-12', 't-16', 'elite', 'single', 'facility-access'];
  assert.deepEqual(Object.keys(json).sort(), ['live', 'test']);
  assert.deepEqual(Object.keys(json.test).sort(), keys.slice().sort());
  assert.deepEqual(Object.keys(json.live).sort(), keys.slice().sort());
  for (const k of keys) {
    // Committed in 1b3dc3d - a null here means someone overwrote the file.
    assert.match(json.test[k], /^price_[A-Za-z0-9]{8,}$/, `test.${k}`);
  }
});

run();
```

Run: `cd functions && node portal/catalogue.test.js`
Expected: `Cannot find module './catalogue'`.

- [ ] **Step 3: Implement `catalogue.js`**

```js
/**
 * The ONE source of Stripe price ids (spec 4.1), keyed by STRIPE_MODE. The
 * JSON lives at functions/config/stripe-catalogue.json because
 * `firebase deploy` packages only this folder (contract 6.5, decision D3);
 * scripts/write-packages.mjs reads the same file.
 */
'use strict';

/** The add-on's key in the JSON (no `packages` doc). @const {string} */
const FACILITY_KEY = 'facility-access';

/** @return {!Object} `{test: {...}, live: {...}}`. */
function loadCatalogue() {
  return require('../config/stripe-catalogue.json');
}

/** @return {string} `'live'` only when STRIPE_MODE is exactly 'live'. */
function stripeMode() {
  return process.env.STRIPE_MODE === 'live' ? 'live' : 'test';
}

/**
 * @param {string} key A package id or FACILITY_KEY.
 * @param {!Object=} cat The catalogue (injectable for tests).
 * @return {?string} The Stripe price id for the current mode, or null.
 */
function priceIdFor(key, cat) {
  const map = (cat || loadCatalogue())[stripeMode()] || {};
  return map[key] || null;
}

/**
 * @param {?string} priceId A Stripe price id.
 * @param {!Object=} cat The catalogue (injectable for tests).
 * @return {?string} The package id it maps to in the current mode; the
 *     facility price maps to null (it is not a package).
 */
function packageIdForPrice(priceId, cat) {
  if (!priceId) return null;
  const map = (cat || loadCatalogue())[stripeMode()] || {};
  for (const [k, v] of Object.entries(map)) {
    if (v && v === priceId && k !== FACILITY_KEY) return k;
  }
  return null;
}

module.exports = {
  FACILITY_KEY, loadCatalogue, packageIdForPrice, priceIdFor, stripeMode,
};
```

- [ ] **Step 4: Run**

Run: `cd functions && node portal/catalogue.test.js && npm run lint`
Expected: `3 passing`, lint clean.

- [ ] **Step 5: Commit**

```bash
git add functions/portal/catalogue.js functions/portal/catalogue.test.js
git commit -m "feat(functions): stripe catalogue reader keyed by STRIPE_MODE" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: payment-received copy and the two Calendly skips (closes part of #18, #29)

**Files:**
- Modify: `functions/portal/notices.js:291-309` (export), add `paymentReceived` before `module.exports`
- Modify: `functions/portal/jobs.js:104-105` (skip Calendly rows)
- Modify: `functions/index.js:184-186` (skip `cancelledBy: 'calendly'`)
- Create: `functions/portal/notices.test.js`

**Interfaces:**
- Produces: `notices.paymentReceived({bookingOpen: boolean}) -> {title, body}`.

- [ ] **Step 1: Write the failing test** `notices.test.js`

```js
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const notices = require('./notices');

test('paymentReceived: branched on bookingOpen (em dash, notices.js:268)',
    () => {
      assert.deepEqual(notices.paymentReceived({bookingOpen: false}), {
        title: 'Payment received',
        body: 'Payment received — booking opens Fri, Oct 10 at 7 AM.',
      });
      assert.deepEqual(notices.paymentReceived({bookingOpen: true}), {
        title: 'Payment received',
        body: 'Payment received — you\'re all set to book.',
      });
    });

run();
```

Run: `cd functions && node portal/notices.test.js`
Expected: `TypeError: notices.paymentReceived is not a function`.

- [ ] **Step 2: Implement** (in `notices.js` before `module.exports`; add `paymentReceived,` to the export list in alphabetical position)

```js
/**
 * kind `membership`, subject `${athleteId}_paid` - an athlete's first
 * `billing.status: 'active'` (spec 4.3). Copy 9.5.
 * @param {{bookingOpen: boolean}} args Whether `lib.bookingOpen` is true
 *     for this athlete's package right now.
 * @return {{title: string, body: string}} The notice.
 */
function paymentReceived(args) {
  const open = Boolean(args && args.bookingOpen);
  return {
    title: 'Payment received',
    body: open ?
      'Payment received — you\'re all set to book.' :
      'Payment received — booking opens Fri, Oct 10 at 7 AM.',
  };
}
```

In `jobs.js` `runSessionReminders`, right after `const booking = doc.data() || {};` (`:105`) add:

```js
    // Calendly sends its own reminders for Yannick (spec 6.2 step 5).
    if (booking.source === 'calendly') continue;
```

and make `summary` record it: add `skipped: 0` to the summary literal at
`:101` and `summary.skipped += 1;` before the `continue`.

In `index.js` `onBookingCancelled`, after the status check at `:184-186` add:

```js
      // A Calendly cancellation is Calendly's own email (spec 6.2).
      if (after.cancelledBy === 'calendly') return null;
```

- [ ] **Step 3: Run**

Run: `cd functions && node portal/notices.test.js && npm run lint`
Expected: `1 passing`, lint clean. Harness regression: with the emulator up,
`node test/verify-notifications.js` still ends `ALL CHECKS PASSED` (no
seeded booking carries `source`, so `skipped` is 0 there).

- [ ] **Step 4: Commit**

```bash
git add functions/portal/notices.js functions/portal/notices.test.js functions/portal/jobs.js functions/index.js
git commit -m "feat(functions): payment-received notice, Calendly reminder/cancel skips" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
Continue with `40-functions-part2.md` (Tasks 5-6).
