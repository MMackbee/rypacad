# Functions - Sprint 20 Implementation Plan (part 7: Tasks 11-13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read `40-functions.md` first (Goal, Architecture, Global Constraints, Execution order, emulator command). Task 11 wires everything from Tasks 7-10 into `index.js` and lands AFTER db lane Task 7 (decision D15); Task 12 is the owner runbook; Task 13 is the Stripe harness top-up.

---

### Task 11: index.js - exports, runWith secrets on every function, env check, emulator smoke (closes #28)

**Files:**
- Modify: `functions/index.js:60-80` (requires + exports), `:139-141` (`onBookingCreated`), `:179-181` (`onBookingCancelled`), `:251-253` (`onHouseholdMembership`), `:289-291` (`sessionReminders`), `:305-307` (`tokenExpiryReminders`), `:323-325` (`sweepWaitlist`)
- Modify: `functions/portal/promotion.js:23-29` (require), `:364-366` (`onSessionBookedDecrease`)
- Modify: `functions/portal/stripe.js` at the `runWith` line Task 7 wrote (`:395` in the pre-Task-7 numbering)
- Modify: `functions/env.template` (after db lane Task 7's rewrite: one added block, see Step 5)
- Create (local, gitignored by `functions/.gitignore:2` `*.local`, never committed): `functions/.env.local`, `functions/.secret.local` in this worktree (Step 4, decision D15)
- Create: `functions/test/check-exports.js`
- Test: `functions/test/check-exports.js` (no emulator), the emulator smoke in Step 6

**Interfaces:**
- Consumes: `secrets.MAIL_SECRETS`, `secrets.STRIPE_WEBHOOK_SECRETS` (Task 8, decision D4); `family.createFamily/addAthletes/claimInvite` (Task 8); `checkout.createCheckoutSession` (Task 9); `calendly.calendlyWebhook` (Task 10); `fn.__endpoint.secretEnvironmentVariables` (`node_modules/firebase-functions/lib/v1/cloud-functions.js:107-115,232` - every v1 function exposes its declared secrets as `[{key}]`).
- Produces: exactly 13 exports from `functions/index.js`: the 8 existing + `createFamily`, `addAthletes`, `claimInvite`, `createCheckoutSession`, `calendlyWebhook`. `index.js` requires `MAIL_SECRETS` from `functions/portal/secrets.js` (D4: the four secret-list constants live there) and exports nothing but the 13 functions - `check-exports.js` fails on any extra key.

- [ ] **Step 1: Write the failing check** `functions/test/check-exports.js`

```js
/* Static check: functions/index.js exports exactly the 13 launch functions
 * and each declares the secrets contract 6.4 binds (spec 8). No emulator:
 * it requires index.js in-process and reads each function's __endpoint.
 *   cd functions && node test/check-exports.js */
'use strict';

process.env.GCLOUD_PROJECT = 'rypacad';
const assert = require('node:assert/strict');
const index = require('../index');

const MAIL = ['SMTP_USER', 'SMTP_PASS'];
const EXPECTED = {
  stripeWebhook: ['STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', ...MAIL],
  createCheckoutSession: ['STRIPE_SECRET_KEY'],
  calendlyWebhook: ['CALENDLY_WEBHOOK_SIGNING_KEY'],
  createFamily: [],
  addAthletes: [],
  claimInvite: [],
  onBookingCreated: MAIL,
  onBookingCancelled: MAIL,
  onHouseholdMembership: MAIL,
  sessionReminders: MAIL,
  tokenExpiryReminders: MAIL,
  sweepWaitlist: MAIL,
  onSessionBookedDecrease: MAIL,
};

assert.deepEqual(Object.keys(index).sort(), Object.keys(EXPECTED).sort(),
    'the 13 launch functions, nothing else');
for (const [name, secrets] of Object.entries(EXPECTED)) {
  const ep = index[name].__endpoint || {};
  const got = (ep.secretEnvironmentVariables || []).map((s) => s.key);
  assert.deepEqual(got, secrets, `${name} secrets`);
}
console.log(`ok  ${Object.keys(EXPECTED).length} functions exported, ` +
    'secrets bound per contract 6.4');
```

Run: `cd functions && node test/check-exports.js`
Expected: `AssertionError ... the 13 launch functions, nothing else` (only 8 exported).

- [ ] **Step 2: Edit `functions/index.js`**

After `const {onSessionBookedDecrease} = require('./portal/promotion');` (`:73`) add:

```js
const {MAIL_SECRETS} = require('./portal/secrets');
const family = require('./portal/family');
const {createCheckoutSession} = require('./portal/checkout');
const {calendlyWebhook} = require('./portal/calendly');
```

After `exports.onSessionBookedDecrease = onSessionBookedDecrease;` (`:80`) add:

```js
// ==========================================================================
// SPRINT 20 LAUNCH (contract v3.0.1): instant sign-up, child-login claim,
// Checkout Sessions, Calendly. Handlers live in ./portal; this file exports
// the 13 functions and nothing else (the secret lists stay in
// ./portal/secrets). Secret binding (spec 8): every function declares its
// secrets with runWith - a 1st-gen function sees only what it declares.
// ==========================================================================

exports.createFamily = family.createFamily;
exports.addAthletes = family.addAthletes;
exports.claimInvite = family.claimInvite;
exports.createCheckoutSession = createCheckoutSession;
exports.calendlyWebhook = calendlyWebhook;
```

Then bind the mail secret on the six notice senders - each `functions.firestore` / `functions.pubsub` becomes `functions.runWith({secrets: MAIL_SECRETS}).firestore` / `.pubsub`:

- `:139` `exports.onBookingCreated = functions.runWith({secrets: MAIL_SECRETS}).firestore`
- `:179` `exports.onBookingCancelled = functions.runWith({secrets: MAIL_SECRETS}).firestore`
- `:251` `exports.onHouseholdMembership = functions.runWith({secrets: MAIL_SECRETS}).firestore`
- `:289` `exports.sessionReminders = functions.runWith({secrets: MAIL_SECRETS}).pubsub`
- `:305` `exports.tokenExpiryReminders = functions.runWith({secrets: MAIL_SECRETS}).pubsub`
- `:323` `exports.sweepWaitlist = functions.runWith({secrets: MAIL_SECRETS}).pubsub`

Each of those lines is now over 80 columns; break after `functions` like this (the chain continues on the next line at 4 spaces, as `:140` already does):

```js
exports.onBookingCreated = functions
    .runWith({secrets: MAIL_SECRETS})
    .firestore
    .document('bookings/{bookingId}')
```

In `functions/portal/promotion.js` add `const {MAIL_SECRETS} = require('./secrets');` after `const notify = require('./notify');` (`:29`) and change `:364` to

```js
const onSessionBookedDecrease = functions
    .runWith({secrets: MAIL_SECRETS})
    .firestore
    .document('sessions/{sessionId}')
```

In `functions/portal/stripe.js` add `const {STRIPE_WEBHOOK_SECRETS} = require('./secrets');` beside the other requires and replace Task 7's literal list with `functions.runWith({secrets: STRIPE_WEBHOOK_SECRETS}).https.onRequest(...)` (the list is identical; one source).

- [ ] **Step 3: Run**

Run: `cd functions && node test/check-exports.js && npm run lint && node portal/lib.test.js`
Expected: `ok  13 functions exported, secrets bound per contract 6.4`, lint clean, lib tests still passing.

- [ ] **Step 4: Create this worktree's local env files** (decision D15; both gitignored by `functions/.gitignore:2` `*.local` and excluded from deploy by `firebase.json` functions.ignore `*.local`; the values below are emulator-only harness values, NOT secrets - a real key never goes in either file)

Precondition: db lane Task 7 has merged (`functions/env.template` documents the two-file split; `functions/.env` carries `STRIPE_MODE=test` and `PORTAL_URL` and no secret name). If `functions/.env.local` already exists from that merge, keep its lines and add the missing ones.

Write `functions/.env.local` (six lines, names below; `<...>` is the value to type):

```
STRIPE_WEBHOOK_SECRET=<the SECRET constant at functions/test/verify-lane.js:16, unchanged - both Stripe harnesses sign with it>
STRIPE_SECRET_KEY=sk_test_harness
CALENDLY_WEBHOOK_SIGNING_KEY=<a fresh 64-hex string: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
STRIPE_LINE_ITEMS_STUB=<the one-line JSON from Task 7 Step 4, plus Task 13 Step 1's cs_evt_g entry>
SMTP_USER=
SMTP_PASS=
```

`STRIPE_SECRET_KEY=sk_test_harness` is deliberate: it is not a key, so `checkout.sessions.list` throws (401 online, ECONNREFUSED offline) and Task 13 STEP H's `stripe-lookup-failed` outcome is deterministic. Empty `SMTP_USER` / `SMTP_PASS` keep `email.smtp()` (`email.js:51-53`, all three keys required) returning null, so no harness ever sends mail.

Write `functions/.secret.local` with the SAME five secret NAMES and values (`STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `CALENDLY_WEBHOOK_SIGNING_KEY`, `SMTP_USER`, `SMTP_PASS` - not the stub): with `runWith({secrets})` declared, the emulator resolves a declared secret from `.secret.local` before asking Secret Manager, so the startup log has no `Unable to access secret` line. Restart the emulator after writing either file.

Check (prints counts only, never values): `cd functions && grep -cE "^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|CALENDLY_WEBHOOK_SIGNING_KEY|SMTP_USER|SMTP_PASS)=" .secret.local; grep -c "^STRIPE_SECRET_KEY=sk_test_harness$" .env.local; grep -c "^STRIPE_LINE_ITEMS_STUB=" .env.local; git check-ignore -q .env.local .secret.local && echo ignored`
Expected: `5`, `1`, `1`, `ignored`.

- [ ] **Step 5: env - names only** (db lane Task 7 owns the split; this step verifies it and adds the two emulator-only keys Tasks 7 and 10 introduced to the template)

Run (no values printed): `cd functions && grep -c "^STRIPE_MODE=" .env; grep -c "^PORTAL_URL=" .env; grep -cE "^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|CALENDLY_WEBHOOK_SIGNING_KEY|SMTP_USER|SMTP_PASS)=" .env; grep -cE "^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|CALENDLY_WEBHOOK_SIGNING_KEY)=" .env.local`
Expected: `1`, `1`, `0`, `3`. If the third number is not `0`, STOP: a secret name in `.env` fails `firebase deploy` with a conflict against the declared secret - move it per db Task 7 Step 3 first.

Append to `functions/env.template`, at the end of db Task 7's `.env.local` section (after the `SMTP_PASS=` line):

```
# ---- emulator-only stubs (never set in production; guarded by ---------------
# ---- FUNCTIONS_EMULATOR === 'true' in the code that reads them) -------------
# STRIPE_LINE_ITEMS_STUB: JSON map sessionId -> Checkout line items that
# stripe-checkout.readLineItems returns instead of calling Stripe
# (the plan's Task 7 Step 4 documents the exact value).
# STRIPE_LINE_ITEMS_STUB={"cs_evt_b":[...]}
#
# functions/.secret.local (also gitignored by *.local): the SAME secret names
# as .env.local. With runWith({secrets}) declared, the emulator reads a
# declared secret from .secret.local first and only then asks Secret Manager
# (an error line at startup when it cannot). Copy the five secret lines
# there to keep the emulator quiet; .env.local still feeds the runtime.
# For the harnesses, STRIPE_SECRET_KEY=sk_test_harness (not a key) makes
# every Stripe API call fail deterministically.
```

- [ ] **Step 6: Emulator smoke - all 13 load, callables refuse the anonymous, both webhooks answer 400 without a signature**

Start the isolated emulator (command in `40-functions.md`) and read its startup log:

Expected log line (order may differ): `functions: Loaded functions definitions from source: stripeWebhook, onSessionBookedDecrease, createFamily, addAthletes, claimInvite, createCheckoutSession, calendlyWebhook, onBookingCreated, onBookingCancelled, onHouseholdMembership, sessionReminders, tokenExpiryReminders, sweepWaitlist.` followed by `http function initialized (http://127.0.0.1:5001/rypacad/us-central1/<name>)` for the six HTTP functions. No `Unable to access secret` line when `.secret.local` carries the five names (Step 4).

Then, in a second terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:5001/rypacad/us-central1/createFamily -H "content-type: application/json" -d "{\"data\":{}}"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:5001/rypacad/us-central1/claimInvite -H "content-type: application/json" -d "{\"data\":{}}"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:5001/rypacad/us-central1/stripeWebhook -H "content-type: application/json" -d "{}"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:5001/rypacad/us-central1/calendlyWebhook -H "content-type: application/json" -d "{}"
```

Expected: `401`, `401`, `400`, `400` (the two 400s are the spec 8 deploy check, rehearsed locally: a missing signature is refused, never 500). Then every harness once more, in this order (each reseeds the same instance): `node test/verify-lane.js`, `node test/verify-notifications.js`, `node test/verify-sweep.js`, `node test/verify-stripe-launch.js`, `node test/verify-family.js`, `node --env-file=.env.local test/verify-calendly.js` - all `ALL CHECKS PASSED`.

- [ ] **Step 7: Commit** (`.env.local` and `.secret.local` are gitignored - `git status` must not list them)

```bash
git add functions/index.js functions/portal/promotion.js functions/portal/stripe.js functions/env.template functions/test/check-exports.js
git commit -m "feat(functions): export the five launch callables, bind secrets on all 13 functions" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: docs/portal/RUNBOOK-SPRINT-20.md - the owner deploy runbook (closes #29)

**Files:**
- Create: `docs/portal/RUNBOOK-SPRINT-20.md` (under 300 lines)
- Test: `wc -l docs/portal/RUNBOOK-SPRINT-20.md` < 300; every command below copy-pastes; no secret VALUE anywhere in it.

**Interfaces:**
- Consumes: spec 4.3 (endpoint + API version), 6.3 (Calendly registration), 8 (secret names), 12.3-12.11 (order); contract 8 (names by host); decisions D12 (the restricted key's three scopes: Checkout Sessions write, Customers read, Prices read) and D11 (the 48-hour rule, ruled); D3 (the catalogue path `functions/config/stripe-catalogue.json`); Task 11's `.secret.local` note.
- Produces: the document below, verbatim.

- [ ] **Step 1: Write the runbook**

````markdown
# Sprint 20 launch runbook (owner)

Spec: `docs/portal/SPRINT-20-LAUNCH.md` sections 8 and 12. Every step here is
owner-run; agents never deploy, never hold a secret value, never push. Secrets
are named, never written down. Order matters: each step blocks the next.

## 0. Before anything (12.1-12.2)

- Firebase console -> Authentication: Email/Password ON; Authorized domains
  include `rypacad.ryptest.com`; email templates DEFAULT (12.1).
- Stripe dashboard, in BOTH test and live mode: one Product + monthly Price
  per tier (t-6, t-12, t-16, Elite, single) and one for facility access
  ($300/month); the no-code customer portal activated (its link is
  `REACT_APP_STRIPE_PORTAL_URL`); a **restricted key** per mode with exactly
  three scopes - Checkout Sessions **write**, Customers **read**, Prices
  **read** (`createCheckoutSession` reads the price's `unit_amount` to build
  the prepaid line; ruled, D12). Paste the LIVE price ids into the `live`
  block of `functions/config/stripe-catalogue.json` (public ids; the `test`
  block is committed, `1b3dc3d`; the file ships inside `functions/`, D3/D19).

## 1. Rules + indexes (12.3)

```bash
firebase deploy --only firestore:rules,firestore:indexes --project rypacad
```

## 2. Railway (12.4)

Set `REACT_APP_CALENDLY_MENTAL_URL` (+ optional `_ELITE_URL`),
`REACT_APP_STRIPE_PORTAL_URL`, `REACT_APP_PORTAL_LIVE_DATA=true`,
`REACT_APP_FIREBASE_VAPID_KEY`; push `main`. The build with `/portal/signup`
and released prices must be live before any production smoke.

## 3. Functions, TEST mode (12.5)

### 3.1 Non-secret config - `functions/.env` (gitignored, deploy reads it)

Keys, values yours: `STRIPE_MODE=test`, `PORTAL_URL=https://rypacad.ryptest.com`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `PUSH_IN_EMULATOR=false`.
**No secret name may appear in `.env`** - a name that is also declared with
`runWith({secrets})` fails the deploy with a conflict. Check (prints counts
only):

```bash
grep -cE "^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|CALENDLY_WEBHOOK_SIGNING_KEY|SMTP_USER|SMTP_PASS)=" functions/.env   # must print 0
```

### 3.2 Secrets - Secret Manager, by NAME

Each command prompts for the value (hidden; nothing lands in shell history).
Generate the Calendly key first and keep it in the prompt's clipboard only:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
firebase functions:secrets:set STRIPE_SECRET_KEY --project rypacad            # the TEST restricted key (rk_test_...)
firebase functions:secrets:set CALENDLY_WEBHOOK_SIGNING_KEY --project rypacad # the hex string generated above
firebase functions:secrets:set SMTP_USER --project rypacad
firebase functions:secrets:set SMTP_PASS --project rypacad
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project rypacad        # a placeholder for now: any non-empty string; replaced in 3.4
```

`STRIPE_WEBHOOK_SECRET` must EXIST before the first deploy (a declared secret
that does not exist fails the deploy); its real value comes from the endpoint
you create in 3.4. Do NOT create `COURIER_AUTH_TOKEN` unless you use Courier -
it is not declared.

### 3.3 Deploy

```bash
cd functions && npm run lint && cd ..
firebase deploy --only functions --project rypacad
```

Expected: 13 functions listed as created/updated: `stripeWebhook`,
`onSessionBookedDecrease`, `onBookingCreated`, `onBookingCancelled`,
`onHouseholdMembership`, `sessionReminders`, `tokenExpiryReminders`,
`sweepWaitlist`, `createFamily`, `addAthletes`, `claimInvite`,
`createCheckoutSession`, `calendlyWebhook`.

### 3.4 The TEST Stripe endpoint (spec 4.3)

Stripe dashboard (test mode) -> Developers -> Webhooks -> Add endpoint:

- URL `https://us-central1-rypacad.cloudfunctions.net/stripeWebhook`
- **API version: `2025-07-30.basil`** (the SDK's pinned version,
  `functions/node_modules/stripe/cjs/apiVersion.js`; the handler reads both
  the Basil and the older shapes, but the endpoint must be pinned so the
  shapes never drift under it)
- Events (five): `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.updated`,
  `customer.subscription.deleted`

Copy its **Signing secret** (`whsec_...`), then:

```bash
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project rypacad
firebase deploy --only functions:stripeWebhook --project rypacad   # a function binds a secret's version at deploy time
```

### 3.5 Deploy check - 400, never 500 (spec 8)

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://us-central1-rypacad.cloudfunctions.net/stripeWebhook -H "content-type: application/json" -d "{}"
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://us-central1-rypacad.cloudfunctions.net/calendlyWebhook -H "content-type: application/json" -d "{}"
```

Expected: `400` and `400`. A `500` means the secret is not bound - check
`firebase functions:secrets:access STRIPE_WEBHOOK_SECRET --project rypacad`
exists (the command prints the value: run it alone, clear the terminal) and
that the deploy log listed the function.

## 4. Calendly (12.6, spec 6.3) - after 3.3

Yannick: Standard plan confirmed; event type *RYP Academy - Mental Game 1:1*
(30 min, secret, 24 h notice, the three invitee questions in order: Athlete
name / Who is attending? Athlete-Parent / Parent email). You, once, with his
personal token in `CALENDLY_TOKEN` for this shell only (`unset` it after):

```bash
curl -s https://api.calendly.com/users/me -H "Authorization: Bearer $CALENDLY_TOKEN"
```

Note `resource.uri` and `resource.current_organization`, then register the
subscription - `organization` is required even for user scope; `signing_key`
is the SAME hex string you set as `CALENDLY_WEBHOOK_SIGNING_KEY`:

```bash
curl -s -X POST https://api.calendly.com/webhook_subscriptions \
  -H "Authorization: Bearer $CALENDLY_TOKEN" -H "Content-Type: application/json" \
  -d '{"url":"https://us-central1-rypacad.cloudfunctions.net/calendlyWebhook","events":["invitee.created","invitee.canceled"],"organization":"<resource.current_organization>","user":"<resource.uri>","scope":"user","signing_key":"<the hex string>"}'
```

Verify (now, and again after the first real booking):

```bash
curl -s "https://api.calendly.com/webhook_subscriptions?organization=<resource.current_organization>&scope=user&user=<resource.uri>" -H "Authorization: Bearer $CALENDLY_TOKEN"
unset CALENDLY_TOKEN
```

Expected: one subscription with `"state": "active"`. Calendly disables a
subscription after repeated non-2xx - the function answers 200 for every
verified event, so `disabled` means the signing key does not match: re-set the
secret (3.2), redeploy `calendlyWebhook`, delete and re-create the
subscription.

## 5. Calendar sync (12.7)

Phil's blocks titled `Phil ...` with real end times. Then:

```bash
node scripts/sync-calendar-sessions.mjs --prod --dry-run   # review: every mental session is deleted or cancelled
node scripts/sync-calendar-sessions.mjs --prod --yes
```

Re-run after every calendar edit. This runs BEFORE any smoke booking.

## 6. Packages + production smoke, TEST Stripe (12.8)

```bash
node scripts/write-packages.mjs --prod --mode test --dry-run
node scripts/write-packages.mjs --prod --mode test --yes
```

Smoke on rypacad.ryptest.com, in this order, all with test-mode Stripe:

1. Password sign-up -> the verification mail lands in a Gmail inbox -> the
   link returns to `/portal/signin` -> the family is created instantly.
2. **Pay** for a t-6 athlete: the Checkout page shows TWO lines (`6 tokens`
   monthly, trial to Dec 1; `6 tokens - November 2026, prepaid` one-time);
   pay with `4242 4242 4242 4242`.
3. Land on `/portal/family?paid=...` -> "Confirming your payment..." ->
   *active* within a minute. Stripe: the subscription is **Trialing**, trial
   ends **Dec 1, 2026**; the endpoint shows `checkout.session.completed` and
   `invoice.paid` at 200. Firestore: `athletes/{id}.billing.status: 'active'`,
   `tokenPeriods/{id}_2026-11-01` with `prepaid: true`,
   `notifications/membership_{id}_paid`.
4. Claim a child login (password + verification, then Google).
5. An Elite athlete books at once; a t-6 athlete sees "Booking opens Fri,
   Oct 10 at 7 AM".
6. Book Yannick through the Calendly link: the session appears on My
   Schedule within a minute at the right Chicago time; cancel from Calendly's
   email: it disappears and the token returns.
7. Delete the smoke household, its athletes, its invites, and the Stripe test
   customer.

If step 2 shows one line, or the subscription is not Trialing, STOP before
step 7 of section 7 - the prepaid mechanics (spec 4.2) are not right.

Ruled (D11): when the next 1st is under 48 hours away at checkout (the
29th-31st), the session prepays NEXT month in full, the subscription's
trial ends on the 1st after that, and the remaining day or two are free -
Stripe refuses a Checkout trial end under 48 hours out. Before Nov 1 this
never applies.

## 7. Functions, LIVE mode (12.9)

1. `functions/.env`: `STRIPE_MODE=live`.
2. `firebase functions:secrets:set STRIPE_SECRET_KEY --project rypacad` - the
   LIVE restricted key (the same three scopes as section 0, D12).
3. `firebase deploy --only functions --project rypacad`.
4. Stripe dashboard, LIVE mode: create the endpoint exactly as 3.4 (same URL,
   same API version, same five events) - it has its OWN signing secret.
5. `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project rypacad`
   with the LIVE `whsec_...`, then
   `firebase deploy --only functions:stripeWebhook --project rypacad`.
6. Repeat 3.5 (both curls -> 400).
7. `node scripts/write-packages.mjs --prod --mode live --dry-run` then
   `--yes`.
8. Disable (do not delete) the TEST endpoint in Stripe so test events never
   hit the live-secret function.

## 8. Accounts + the email (12.10-12.11)

- `node scripts/provision-owner.mjs` for one **ops** account; confirm
  Yannick's and Phil's staff docs exist.
- Send the Oct 1 email.
- Day-2 routine: `/portal/admin/signups` *unpaid* and *flagged* views;
  `node scripts/export-memberships.mjs --prod` for Stripe drift
  (`stripe-lookup-failed` and `unexpected-quantity` rows surface there).

## 9. If something is wrong

| Symptom | Cause | Fix |
|---|---|---|
| webhook curl -> 500 "Webhook secret not configured" | secret not bound | 3.2 + redeploy that function |
| deploy fails "secret ... does not exist" | a declared name has no Secret Manager entry | create it (3.2) |
| deploy fails with an env/secret conflict | a secret NAME is in `functions/.env` | remove the line, keep it only in Secret Manager (and `.env.local` locally) |
| Pay button -> "Pricing is not set up yet" | `price-missing`: catalogue null for `STRIPE_MODE` | paste the ids, redeploy (the JSON ships inside `functions/`) |
| Pay button -> "Checkout is unavailable" | `stripe-error`: key scope or mode mismatch | the restricted key needs Checkout Sessions write, Customers read, Prices read, in the SAME mode as `STRIPE_MODE` |
| `?paid=` never confirms | endpoint not receiving / wrong secret | Stripe -> Webhooks -> endpoint -> recent deliveries; 3.4-3.5 |
| Calendly booking never appears | subscription `disabled` or key mismatch | 4 |
| `stripeEvents` outcome `unmatched` | legacy household without customer link | the daily export; link `stripeCustomerId` in the console |
````

- [ ] **Step 2: Verify**

Run: `wc -l docs/portal/RUNBOOK-SPRINT-20.md; grep -nE "whsec_[A-Za-z0-9]{8,}|rk_(test|live)_[A-Za-z0-9]{8,}|sk_(test|live)_[A-Za-z0-9]{8,}" docs/portal/RUNBOOK-SPRINT-20.md; grep -c "functions:secrets:set" docs/portal/RUNBOOK-SPRINT-20.md`
Expected: a line count under 300; the secret-pattern grep prints NOTHING (no values, only placeholders); `8` lines containing `functions:secrets:set` (five in 3.2, one in 3.4, two in section 7).

- [ ] **Step 3: Commit**

```bash
git add docs/portal/RUNBOOK-SPRINT-20.md
git commit -m "docs(portal): Sprint 20 owner runbook - secrets by name, test-then-live deploy order, Calendly registration" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: verify-stripe-launch.js top-up - Basil subscription.updated, facility lapse, stripe-lookup-failed (closes rest of #17) (MAY SLIP - Oct 10)

Task 7's harness already covers both event orders (STEP A: Basil `invoice.paid` before `checkout.session.completed`; STEP C: checkout before the invoice) and a Basil-shaped invoice (`parent.subscription_details`). What it does NOT cover: a Basil-shaped `customer.subscription.updated` (`items.data[0].current_period_*`), the facility add-on's paid -> deleted cycle (`facilityAccess` true then false, household untouched - decision D10), and the `stripe-lookup-failed` ledger outcome with HTTP 200. Add exactly those.

**Files:**
- Modify: `functions/test/verify-stripe-launch.js` (append STEP F-H before the final summary lines)
- Modify (local, gitignored): `functions/.env.local` `STRIPE_LINE_ITEMS_STUB` gains `cs_evt_g`

**Interfaces:**
- Consumes: Task 7's `completed()`, `secs`, `post`, `get`, `exists`, `check`; `stripe-billing.applyAthleteStatus`, `stripe-resolve.periodOf` (Tasks 5-6); Task 7's D10 branches in `handleEvent` (every facility event - `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted` - writes `facilityBilling` / `facilityAccess` ONLY - no `householdActive`, no `membershipPatch`, no `applyLapsed`, no revoke).
- Precondition for STEP H (decision D15): Task 11 Step 4 has written `STRIPE_SECRET_KEY=sk_test_harness` into `functions/.env.local` and `functions/.secret.local`, and the emulator was restarted after that. `sk_test_harness` is not a key, so `checkout.sessions.list` throws every time - online Stripe answers 401, offline the socket fails - and `resolveSubject` turns either into `StripeLookupError` -> outcome `stripe-lookup-failed`, HTTP 200. With a real test key in that file STEP H would instead reach Stripe and return `unmatched` (no session for `sub_unknown`), so the check is only deterministic under D15.
- Produces: nothing new; three more replay steps.

- [ ] **Step 1: Extend the stub and confirm the precondition** - in `functions/.env.local`, the `STRIPE_LINE_ITEMS_STUB` JSON gains one entry (one line, keep the existing three): `"cs_evt_g":[{"quantity":1,"price":{"id":"price_fac","recurring":{"interval":"month"}}},{"quantity":1,"price":{"id":"price_1y"}}]`. Confirm (counts only): `cd functions && grep -c "^STRIPE_SECRET_KEY=sk_test_harness$" .env.local .secret.local` -> `1` for each file (Task 11 Step 4). Restart the emulator.

- [ ] **Step 2: Append the steps** (before the `log(\`\n=== ${failures === 0 ...` line in `main()`)

```js
  log('\nSTEP F  customer.subscription.updated, Basil shape (period on items.data[0]) -> lena only');
  r = await post({id: 'evt_f2', object: 'event', type: 'customer.subscription.updated',
    data: {object: {id: 'sub_lena', object: 'subscription', customer: 'cus_novak', status: 'past_due',
      metadata: META('lena', 't-6'),
      items: {object: 'list', data: [{id: 'si_lena', price: {id: 'price_t6', recurring: {interval: 'month'}},
        current_period_start: secs(2026, 12, 1), current_period_end: secs(2026, 12, 31)}]}}}});
  check('HTTP', [r.status, r.body.outcome], [200, 'no-change']);
  const hhF = await get('households', 'novak');
  check('period read from items.data[0] (Basil)', [hhF.membership.currentPeriodStart, hhF.membership.currentPeriodEnd, hhF.membership.stripeSubscriptionStatus],
      ['2026-12-01', '2026-12-31', 'past_due']);
  check('lena past_due via metadata, max untouched', [(await get('athletes', 'lena')).billing.status, (await get('athletes', 'max')).billing.status], ['past_due', 'active']);
  r = await post({id: 'evt_f3', object: 'event', type: 'customer.subscription.updated',
    data: {object: {id: 'sub_lena', object: 'subscription', customer: 'cus_novak', status: 'active', metadata: META('lena', 't-6'),
      items: {object: 'list', data: [{id: 'si_lena', price: {id: 'price_t6', recurring: {interval: 'month'}},
        current_period_start: secs(2026, 12, 1), current_period_end: secs(2026, 12, 31)}]}}}});
  check('back to active', [r.body.outcome, (await get('athletes', 'lena')).billing.status], ['no-change', 'active']);

  log('\nSTEP G  facility add-on: checkout completed -> facilityAccess true; subscription.deleted -> false ONLY (D10)');
  r = await post({id: 'evt_g', object: 'event', type: 'checkout.session.completed', data: {object: {id: 'cs_evt_g',
    object: 'checkout.session', mode: 'subscription', payment_status: 'paid', customer: 'cus_novak',
    subscription: 'sub_lena_fac', client_reference_id: 'novak__lena__facility'}}});
  check('HTTP', [r.status, r.body.outcome], [200, 'applied-checkout']);
  let lenaG = await get('athletes', 'lena');
  check('facilityBilling + facilityAccess', [lenaG.facilityBilling.status, lenaG.facilityBilling.subscriptionId, lenaG.facilityBilling.priceId, lenaG.facilityBilling.customerId, lenaG.facilityBilling.checkoutSessionId, lenaG.facilityAccess, lenaG.billing.status],
      ['active', 'sub_lena_fac', 'price_fac', 'cus_novak', 'cs_evt_g', true, 'active']);
  check('tier packageId untouched by a facility checkout', lenaG.packageId, 't-6');
  check('no second payment-received notice for the add-on', (await db.collection('notifications').where('athleteId', '==', 'lena').get()).size, 1);
  const hhBefore = await get('households', 'novak');
  r = await post({id: 'evt_g2', object: 'event', type: 'customer.subscription.deleted', data: {object: {id: 'sub_lena_fac',
    object: 'subscription', customer: 'cus_novak', status: 'canceled',
    items: {object: 'list', data: [{id: 'si_fac', price: {id: 'price_fac', recurring: {interval: 'month'}}}]}}}});
  check('HTTP (D10: the add-on lapses alone)', [r.status, r.body.outcome], [200, 'lapsed']);
  lenaG = await get('athletes', 'lena');
  check('facility lapsed, access cleared, tier billing untouched', [lenaG.facilityBilling.status, lenaG.facilityAccess, lenaG.billing.status, lenaG.facilityBilling.priceId], ['lapsed', false, 'active', 'price_fac']);
  // STEP D's applyPastDue left membership.status 'past_due' and STEP F only
  // wrote stripeSubscriptionStatus, so compare before/after, not literals.
  const hhAfter = await get('households', 'novak');
  check('household membership unchanged (no lapse, no lastEventId, no revoke)', [hhAfter.membership.status === hhBefore.membership.status, hhAfter.membership.stripeSubscriptionStatus === hhBefore.membership.stripeSubscriptionStatus, hhAfter.membership.lastEventId === hhBefore.membership.lastEventId, hhAfter.membership.lastEventId !== 'evt_g2', hhAfter.membership.status !== 'lapsed', r.body.summary],
      [true, true, true, true, true, null]);
  check('ledger via facilityBilling.subscriptionId, athleteId lena', [(await get('stripeEvents', 'evt_g2')).via, (await get('stripeEvents', 'evt_g2')).athleteId], ['facility', 'lena']);

  log('\nSTEP H  stripe-lookup-failed: nothing resolves, checkout.sessions.list throws (STRIPE_SECRET_KEY=sk_test_harness, D15) -> 200, ledger row');
  r = await post({id: 'evt_h', object: 'event', type: 'invoice.paid', data: {object: {id: 'in_h', object: 'invoice',
    customer: 'cus_unknown', status: 'paid', billing_reason: 'subscription_cycle',
    parent: {subscription_details: {subscription: 'sub_unknown'}},
    lines: {data: [{period: {start: secs(2026, 12, 1), end: secs(2026, 12, 31)}, price: {id: 'price_t6'}}]}}}});
  check('HTTP 200, not 500', [r.status, r.body.outcome], [200, 'stripe-lookup-failed']);
  check('ledger row', [(await get('stripeEvents', 'evt_h')).outcome, (await get('stripeEvents', 'evt_h')).householdId], ['stripe-lookup-failed', null]);
  check('no tokenPeriods from it', (await db.collection('tokenPeriods').where('eventId', '==', 'evt_h').get()).size, 0);
  r = await post({id: 'evt_h', object: 'event', type: 'invoice.paid', data: {object: {id: 'in_h', object: 'invoice', customer: 'cus_unknown'}}});
  check('a redelivery after stripe-lookup-failed is a duplicate (the row is the guard)', r.body.outcome, 'duplicate');
```

- [ ] **Step 3: Run**

Run: `cd functions && node test/verify-stripe-launch.js`
Expected: `ALL CHECKS PASSED`. STEP H takes a few seconds: `checkout.sessions.list` with `STRIPE_SECRET_KEY=sk_test_harness` (the D15 precondition above) reaches Stripe and is refused (401) or fails offline - either way `StripeLookupError` -> `stripe-lookup-failed`. STEP G's `lapsed` outcome is `applyAthleteStatus`'s return for the add-on alone (D10): `households.novak.membership` is exactly what STEP F left (`status` still `past_due` from STEP D, `stripeSubscriptionStatus` `active` from evt_f3, `lastEventId` evt_f3), `summary` is null (no `revoke.revokeHousehold` ran), and the tier `billing.status` stays `active`.

- [ ] **Step 4: Commit**

```bash
git add functions/test/verify-stripe-launch.js
git commit -m "test(functions): Basil subscription.updated, facility lapse, stripe-lookup-failed replay" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Handoffs (functions lane -> PM / other lanes / owner)

1. **Owner, before `--mode live` (ruled, D12):** the restricted Stripe key has exactly three scopes - Checkout Sessions write, Customers read, Prices read (`createCheckoutSession` reads `unit_amount` to build the prepaid line - no other source carries a price). Runbook section 0.
2. **Ruled (D11), no action:** a checkout when the next 1st is under 48 hours away (the 29th-31st, only possible from Nov 1) prepays NEXT month in full, `trial_end` is the 1st after that, and the remaining day or two are free, because Stripe refuses a Checkout `trial_end` under 48 hours out. Documented in the runbook (section 6) and tested (Task 9).
3. **PM (ruled, D4 / D7 / D8 - in the contract, listed here for the DATA-MODEL sweep):** `functions/portal/secrets.js` holds the four secret lists; `index.js` requires `MAIL_SECRETS` and exports only the 13 functions. Reason strings `athlete-name-required` (createFamily / addAthletes), `invalid-product` (createCheckoutSession, right after `signed-out`), `already-active` also for `product: 'facility'`, `child-email-duplicate` also against an existing open OR claimed invite in both createFamily and addAthletes (a claimed invite is a login; only `orphaned` is reusable); `claimInvite` returns ids only on `claimed`. Ledger: `calendlyEvents.outcome` `malformed` and field `flag` (`ignored` is returned, never written); `stripeEvents.athleteId` / `via` and outcomes `facility-active`, `no-period`, `athlete-lapsed`; `athletes.billing.lastEventId`; `athletes.facilityBilling.customerId` / `checkoutSessionId` / `lastEventId`.
4. **Ruled (D10), applied in Task 7 and asserted in Task 13 STEP G:** every FACILITY event (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`) writes `facilityBilling` / `facilityAccess` ONLY - household membership and bookings are never touched. The tier product keeps the household-wide path of spec 4.3 for invoices; `customer.subscription.deleted` for a TIER is per athlete (D17, Task 7 Steps 2 + 2b, harness STEP D2): the household lapses only when no sibling keeps an active/past_due tier.
5. **db lane (D15):** the functions lane creates its own gitignored `functions/.env.local` and `functions/.secret.local` in its worktree (Task 11 Step 4) after db Task 7 merges; `env.template` documents `.secret.local` and `STRIPE_LINE_ITEMS_STUB` (Task 11 Step 5). `functions/config/stripe-catalogue.json` is committed on the base branch (`1b3dc3d`, TEST ids filled, LIVE null); neither db Task 1 nor functions Task 3 creates or rewrites it (review finding 11).
6. **routing lane:** `claimInvite` returns ids only on `claimed` (nulls for `needs-verification` / `already-claimed`), and `createCheckoutSession` refuses `{product}` outside `tier|facility` with `invalid-product` - `wrapCallable` maps `invalid-argument` already.
7. **frontend lane:** the Calendly attendee is read from the "Who is attending?" answer containing "parent" (case-insensitive) - the invitee question text must stay exactly that (spec 6.3).
8. **MENTAL_MONTHLY_CAP** is duplicated in `functions/portal/calendly.js` from `data/specialists.js:112` - change one, change both.
