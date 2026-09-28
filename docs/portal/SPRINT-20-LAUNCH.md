# Sprint 20 - Launch (contract v3.0)

Owner rulings of 2026-09-28. The sign-up email goes out **2026-10-01**;
booking opens for token members **2026-10-10 07:00 America/Chicago**; the
season starts **2026-11-03**. Everything in this document is the day-1
feature set plus the Blaze-dependent work the owner unblocked today by
upgrading `rypacad` to Blaze. The coach-facing side is tabled.

The scope map behind this (six readers, 2026-09-28) is summarised in
section 15; every "today" claim below cites the file it came from.

## 0. Rulings (verbatim intent, 2026-09-28)

1. Sign-up **creates the account instantly** - no approval queue - and admin
   gets a **sign-ups report** instead.
2. A child's own login is **claimed on first sign-in** with the email the
   parent entered (Google or a new password); the parent never sets a child
   password. "No child account" = the parent's account runs the child.
3. **Student self-sign-up is 18+ only**; minors are enrolled by a guardian.
4. Stripe: **Payment Links per tier**, managed in the Stripe dashboard;
   the webhook links the customer back to the family. No in-app billing.
5. Token window **30 days** (was 32); Elite **45**; booking into the next
   period before renewal ("borrowed" tokens) stays as built.
6. Booking opens **Oct 10** for token members; **Elite books immediately**
   once paid.
7. Yannick: **Calendly stays**, sessions are **30 minutes**, and a Calendly
   booking **spends a portal token** - via Calendly's webhook (Yannick's
   plan is Standard; the owner holds his personal access token).
   Over-cap / over-cadence bookings are **recorded and flagged**, never
   auto-cancelled.
8. Phil operates **off the academy golf schedule**: his blocks live on the
   shared Google Calendar and are booked in-app (the existing `phil` path).
9. Prices become **visible on Oct 1** (`PRICES_RELEASED = true`).

## 1. Non-goals (explicitly out)

Coach-side changes beyond what launch needs; Checkout Sessions / Elements;
facility-access add-on at sign-up (ops-set, unchanged); Phil via Calendly
(the webhook is specialist-agnostic so this is an env var later); student
sign-up under 18; remembering the attendee choice; MFA.

## 2. Sign-up (instant; browser writes under a tightened rules clause)

Today `/portal/register` needs an existing login and writes an
`enrollmentRequests/{uid}` request that ops must approve
(`screens/Registration.js:261-621`, `hooks/live.js:1243-1270,1302-1422`).
Nothing in the repo creates a Firebase Auth user.

### 2.1 Routes and steps

- **`/portal/signup`** (public, like `/portal/signin`). Step 0 *Create your
  login*: email + password (`createUserWithEmailAndPassword`) **or**
  Continue with Google. Password accounts get `sendEmailVerification`
  immediately; verification is NOT required to finish sign-up (it is
  required to claim a child login, 3.2). "Already have a login? Sign in."
- **`/portal/register`** keeps its route and its four steps, now signed-in
  and instant. `SignIn`'s "New family? Start enrollment" points at
  `/portal/signup`.
- Step 1 *Who are you*: **Parent or guardian** | **I'm the athlete (18+)**.
  Athlete mode: DOB must make them 18+ today, else the form says a parent
  or guardian needs to complete it and offers the switch.
- Step 2 *Contact*: name, email (prefilled from auth, editable), phone,
  relationship (parent mode). All three of name/email/phone required.
- Step 3 *Athletes* (parent mode, 1..N; athlete mode = exactly self):
  name, DOB (age derived by `ageFromDob`, U13 / 13+ shown), **current
  handicap** (integer 0-54, or "none yet"), tier (`ALL_PACKAGES`),
  contract tier (20 / 45 / 90, optional, unchanged), **own login?** toggle
  (off by default; on -> child email, required, must differ from the
  guardian's). Household emergency contact + medical note as today.
- Step 4 *Consents + signature* as today; adult copy variant in athlete mode.
- Success: "You're in" + one **Pay for <athlete>'s <tier>** button per
  athlete (section 4), "what happens next" (Oct 10 / Elite immediate,
  child-login instructions when a login was requested), then *Go to your
  family*. The same pay buttons sit on the family home until paid.

### 2.2 The write

One `writeBatch`, all-or-nothing, from the signed-in browser:

| Doc | Body (new fields **bold**) |
|---|---|
| `households/{auto}` | `name`, `guardian {name, email, phone, **relationship**}`, `stripeCustomerId: null`, `stripeSubscriptionId: null`, **`stripeCustomerIds: []`**, **`membership: {status: 'pending', updatedAt}`**, **`signup: {at, by: uid, source: 'self', mode: 'parent' or 'athlete'}`**, **`createdBy: uid`**, **`emergencyContact`** (string or null) |
| `athletes/{auto}` x N | `name`, `dob`, `householdId`, `packageId`, `contractMinutes`, `coachId: null`, `facilityAccess: false`, `facilityAccessConsent`, **`handicap`** (int or null), **`loginEmail`** (lower-cased string or null), `updatedAt` |
| `athletes/{id}/private/medical` | as the approval batch wrote it, when a note exists |
| `users/{uid}` | `{role: 'parent', householdId, athleteId: null, staff: false, specialistId: null, displayName, email}` - athlete mode: `{role: 'athlete', athleteId, householdId, ...}` |
| `invites/{loginEmailLower}` x N | **`{email, householdId, athleteId, athleteName, createdBy: uid, createdAt, status: 'open', claimedBy: null, claimedAt: null}`** |

`enrollmentRequests` is no longer written; the collection and its rules stay
for the historical docs. The admin *Enrollment queue* card is replaced by
the sign-ups report (section 7).

### 2.3 Rules (routing lane)

New helper `selfProvisioning()` = `signedIn() && !exists(users/{uid})`.
Using `getAfter()` so a batch is checked as a whole:

- `households` **create**: ops/owner as today, OR `selfProvisioning()` with
  `createdBy == uid`, `signup.by == uid`, `membership.status == 'pending'`,
  both stripe ids null, `stripeCustomerIds == []`, closed field list.
- `athletes` **create**: ops/owner as today, OR
  `getAfter(households/$(householdId)).data.createdBy == uid` AND
  (`selfProvisioning()` OR `me().role == 'parent' && me().householdId ==
  householdId`) - the second half is Settings' "Link another athlete",
  which becomes real. Shape gains `handicap` (int 0..54 or null) and
  `loginEmail` (string or null).
- `athletes/{id}/private/medical` **create**: also by the same
  household-creator clause.
- `users/{uid}` **create**: ops/owner as today, OR `selfProvisioning()`
  with `uid == request.auth.uid`, `role in ['parent','athlete']`,
  `staff == false`, `specialistId == null`,
  `getAfter(households/$(householdId)).data.createdBy == uid`, and for
  `'athlete'` `getAfter(athletes/$(athleteId)).data.householdId ==
  householdId`. (The claim path in 3.2 is a separate clause.)
- `invites/{id}` **create**: `id == lower(email)`, `status == 'open'`,
  `createdBy == uid`, `createdAt == request.time`, household clause as for
  athletes. **read**: the invite's email owner
  (`request.auth.token.email.lower() == id`), the household's parent, or
  ops/owner.
- **K10 fix**: the parent household-update branch (`firestore.rules:862-870`)
  also excludes `membership`, `signup`, `createdBy`, `stripeCustomerIds` -
  without it a parent could write `membership.status: 'active'` and skip
  paying.

## 3. Child login - claim on first sign-in

### 3.1 Sign-in page

`/portal/signin` gains **Create a login** (email + password) beside the
existing sign-in and Google. New password accounts get the verification
email. Copy: "Use the email your parent entered."

### 3.2 The claim

On every auth emission where `fetchCurrentUser()` is NOT_FOUND
(`useAuthSession.js:104-149`), the app reads
`invites/{auth.email.lower()}`:

- open + `emailVerified` -> one batch: `users/{uid}` `{role: 'athlete',
  athleteId, householdId, staff: false, specialistId: null, displayName:
  athleteName, email}` and the invite `{status: 'claimed', claimedBy: uid,
  claimedAt}` -> `provisioned: true` -> `/portal/home`.
- open + not verified -> NotProvisioned state **"Verify your email to
  finish"** with *Resend* and *I've verified* (reloads the user).
- no invite -> today's stranger state, whose CTA now says *Start sign-up*
  -> `/portal/register`.

Rules: `users/{uid}` **create** by the claimant when
`request.auth.token.email_verified == true`,
`get(invites/$(lower(email))).data.status == 'open'`, and the doc's
`athleteId`/`householdId` equal the invite's, `role == 'athlete'`.
`invites` **update** by the claimant only: diff hasOnly `status, claimedBy,
claimedAt`, `status == 'claimed'`, `claimedBy == uid`, `claimedAt ==
request.time`, and the token email matches the id.

Parent's family page and the athlete card show **Login: not claimed /
claimed <date>** from the invite. Nothing emails the child (no such notice
exists); the Success screen tells the parent what to tell them.

## 4. Stripe - Payment Links + the webhook

### 4.1 Catalogue

`data/packages.js` entries gain `stripePriceId` and `stripePaymentLink`
(live values; both are public identifiers, not secrets). The Firestore
`packages/{id}` docs are the ones the live gate reads (`live.js:648`), and
they are written by a **new packages-only script**
`scripts/write-packages.mjs --prod --dry-run|--yes` - NOT
`provision-family.mjs`, which full-replaces `households/mackbee` and
`/eisele` (`provision-family.mjs:441-446`). It also carries `windowDays: 30`.
A `--mode test` flag writes the Stripe **test-mode** link/price pair from
`scripts/config/stripe-catalogue.json` (`{test: {...}, live: {...}}`,
committed) for the smoke test; `--mode live` before the email.

### 4.2 The link the family opens

`${pkg.stripePaymentLink}?client_reference_id=${householdId}__${athleteId}&prefilled_email=${guardian.email}`
- one subscription per athlete, one Stripe customer per checkout (Payment
Links cannot reuse a customer). Rendered on Success and on the family
home for every athlete whose membership is not yet paid. Elite's link is
the Elite price. `client_reference_id` is `[A-Za-z0-9_-]{1,200}`; both ids
are Firestore auto-ids, so it fits.

### 4.3 Webhook changes (`functions/portal/stripe.js`)

- New event **`checkout.session.completed`** (`mode == 'subscription'`):
  parse `client_reference_id` -> `householdId`, `athleteId`; require
  `athletes/{athleteId}.householdId == householdId`; write
  `athletes/{id}.stripe = {customerId, subscriptionId, priceId,
  checkoutSessionId}` (priceId via `checkout.sessions.listLineItems`),
  `households.stripeCustomerId` if null, `arrayUnion` into
  `stripeCustomerIds`, and - if the paid price maps to a different package
  than the family chose - set `athletes.packageId` to the paid one and log
  it. Membership is NOT flipped here.
- **Household resolution** (`lib.js:249-253` today: customer id only) becomes,
  in order: `athletes where stripe.subscriptionId == invoice.subscription`
  -> its household; `households.stripeCustomerId == customer`;
  `households.stripeCustomerIds array-contains customer`; and finally, when
  still unmatched, `checkout.sessions.list({subscription})` ->
  `client_reference_id` (this is what makes event ORDER irrelevant -
  `invoice.paid` can arrive before `checkout.session.completed`).
- **`invoice.paid`** issues `tokenPeriods` only for the athlete(s) whose
  subscription the invoice belongs to (today: every athlete in the
  household, `stripe.js:141-179`), flips `membership.status` to `'active'`
  (from `pending` too), and sets `periodAnchorDay` only when the household
  has none yet (the FIRST subscription anchors the household; later
  children ride the household period - a multi-child family paying on
  different days drifts a few days, accepted).
- `customer.subscription.updated/deleted` and `invoice.payment_failed`
  resolve through the same order; the package remap on `updated` applies to
  the athlete owning the subscription, not every athlete.
- Requires the **`STRIPE_SECRET_KEY`** secret (a restricted key: read
  Checkout Sessions + read Subscriptions) in addition to
  `STRIPE_WEBHOOK_SECRET`. Dashboard endpoint events: the four today +
  `checkout.session.completed`.

### 4.4 `pending` is a freeze

`membership.status == 'pending'` joins `past_due`/`lapsed` in
`bookingHouseholdOk` and `waitlistHouseholdOk` (rules), the client
transaction (`live.js:736-745`), `lib.membershipAllowsBooking`, and
promotion. Client copy for pending: **"Payment pending - finish checkout to
start booking"** with the pay button (billing hub hero, parent home banner,
BookSession reason). `onHouseholdMembership` sends the existing `active`
notice on `pending -> active` with first-time copy: "Payment received -
you're all set to book."

### 4.5 Prices

`PRICES_RELEASED = true`. The 29th-31st caveat stands: Payment Links cannot
refuse those days; the portal clamps the anchor to 28, so those families'
portal periods sit up to 3 days off the invoice. Documented, accepted.

## 5. Windows and the Oct 10 gate

- `windowDays` **30** on t-6 / t-12 / t-16 / single (`packages.js:41-43,60`),
  the `windowDaysFor` fallback (`:107`), `calendar.js:333,340` defaults,
  `hooks/index.js:1219`; docs restating 32 (DATA-MODEL 124/1267,
  tokens-and-billing-contract 91/103, SPRINT-12-PINS 85/154/319,
  ui-redesign-brief 501) updated. Firestore docs via 4.1. Rules' 46-day
  outer bound unchanged. Elite 45 unchanged.
- Borrowed tokens already work (`live.js:640-645`); the one change is copy:
  `no-tokens-left` names the period it means ("next period's tokens are
  already fully booked" when `periodKey > current`).
- **Gate** `BOOKING_OPENS_AT = 1791633600000` (2026-10-10T12:00:00Z =
  07:00 America/Chicago) in `data/calendar.js` with
  `bookingOpen(now, pkg)` = `pkg?.kind === 'elite' || now >= BOOKING_OPENS_AT`.
  Client: `createBooking`, `joinWaitlist`, and `bookRecurring` (which also
  gains the window check it skips today - K03, `hooks/index.js:1046-1055`).
  Rules: `bookingOpenOk(athleteId)` = `request.time >=
  timestamp.value(1791633600000) || athleteData(athleteId).packageId ==
  'elite'` on `bookings` and `waitlist` create. UI: schedule visible,
  Reserve disabled, banner **"Booking opens Fri, Oct 10 at 7 AM"** for
  non-Elite; the specialist screen and the Calendly button obey it too.
  Remove the clause after launch at leisure - it is true forever after.

## 6. Yannick via Calendly; Phil on the calendar

### 6.1 Portal side

- `SPECIALISTS.mental.bookingMode = 'calendly'`; URL from
  `REACT_APP_CALENDLY_MENTAL_URL` (optional
  `REACT_APP_CALENDLY_MENTAL_ELITE_URL` for a 45-day event type; Elite falls
  back to the standard link). No URL -> the in-app slot list as today, so
  seed/emulator keep working.
- The Yannick card becomes **Book with Yannick** opening (new tab)
  `${url}?name=${attendeeName}&email=${email}&a1=${athleteName}&utm_source=ryp-portal&utm_medium=portal&utm_content=${athleteId}&utm_campaign=${householdId}`
  where `attendeeName`/`email` are the athlete's or, when the family picked
  *A parent* on the existing control, the guardian's. Shown only when:
  membership active, booking open (5), a token left or Elite, and the
  monthly cadence not yet hit for the current month. Otherwise the existing
  reason copy. Below the button: "Yannick's confirmation and reminders come
  from Calendly. The session appears on My Schedule within a minute and
  spends one token."
- `scripts/sync-calendar-sessions.mjs` `classifyTitle` drops
  `yannick|mental` (those calendar events become display-only) so his slots
  never appear twice. `phil` stays.
- The end-time regex bug (`sync:317`, `d{4}` without backslashes) is fixed
  so **every synced session carries its real `durationMinutes`** - this is
  what makes Phil's blocks (8) the right length. `SYNCED_FIELDS` unchanged.
- The three hard-coded 45s (`hooks/index.js:466,2130,2218`), the two literal
  "45 min" strings (`SpecialistBooking.js:536,607`) and the slot payloads
  (`hooks/index.js:1288-1292,1464-1479`) read `durationMinutes`; the
  attendance `block` state (`PortalRoutes.js:336-348,386-404`) passes it.
  Seed mental slots become 30 minutes at 4:00 / 4:30 / 5:00 PM with
  `durationMinutes: 30`.
- K04: `coachingFor` evaluates the cap for the slot's month, not today's.

### 6.2 `calendlyWebhook` (functions lane)

`onRequest`, us-central1, raw body. Verify `Calendly-Webhook-Signature`
(`t=<unix>,v1=<hex>`; HMAC-SHA256 over `t + '.' + body` with
`CALENDLY_WEBHOOK_SIGNING_KEY`; reject > 5 min skew). Ledger
`calendlyEvents/{inviteeUuid}_{event}` `{event, inviteeUri, eventUri,
athleteId|null, householdId|null, receivedAt, outcome}` written in the same
transaction; a repeat is `duplicate` and changes nothing.

`invitee.created`:
1. Resolve the athlete: `payload.tracking.utm_content` -> `athletes/{id}`;
   else invitee email -> `users where email ==` -> `householdId` -> the
   household's only athlete; ambiguous or none -> outcome `unresolved`,
   flag row in the report, stop.
2. Session `sessions/cal-{eventUuid}` `{date, time ('4:00 PM'), type:
   'mental', label: 'Mental game session', capacity: 1, booked: 1, status:
   'scheduled', durationMinutes: end-start, coachId: null, special: false,
   source: 'calendly', calendlyEventUri, gcalEventId: null}` - date/time in
   America/Chicago from `scheduled_event.start_time`.
3. Booking `bookings/{athleteId}_{sessionId}` through the same charge path
   promotion uses (`lib.periodFor` on the session date, `lib.chargeFor`):
   `{athleteId, sessionId, householdId, date, type: 'mental', status:
   'confirmed', periodKey, chargedFrom, graceTokenId, attendee ('parent'
   when the "Who is attending?" answer contains "parent"), createdBy:
   'system', source: 'calendly', calendlyInviteeUri, createdAt}`.
   `chargeFor` returning no source, cadence exceeded, or membership not
   active -> the booking is still written with `chargedFrom: 'period'` and
   **`flag: 'over-cap' | 'over-cadence' | 'membership-inactive'`**. Tokens
   are derived, so an over-cap booking simply floors `left` at 0 for the
   period; the report shows the flag and ops sorts it out.
4. No portal notice: Calendly sends its own confirmation, reminder and
   cancellation emails. `runSessionReminders` skips `source == 'calendly'`;
   `onBookingCreated` already skips `createdBy == 'system'`.

`invitee.canceled`: booking -> `{status: 'cancelled', cancelledBy:
'calendly', cancelReason: 'member', cancelledAt}`, session -> `{booked: 0,
status: 'cancelled'}`; the token comes back by derivation. A reschedule is
`canceled` + `created` and nets out. `onBookingCancelled` skips
`cancelledBy == 'calendly'` (Calendly emailed already).

### 6.3 Calendly account (owner + Yannick, no code)

Event type *RYP Academy - Mental Game 1:1*: one-on-one, **30 min**,
secret, RYP availability, 30-day range (a second, Elite-only type at 45
days is optional), buffers, minimum notice 24 h, cancel/reschedule until the
day before, invitee questions **1. Athlete name** (required), **2. Who is
attending? Athlete / Parent** (required), **3. Parent email**. After the
functions deploy, the owner registers the subscription once (the `curl` in
the runbook: `POST https://api.calendly.com/webhook_subscriptions` with
`events: ["invitee.created","invitee.canceled"]`, `scope: "user"`, the user
URI from `GET /users/me`, and a `signing_key` the owner generates and also
sets as the function secret). The token is never pasted anywhere but that
terminal.

## 7. Admin sign-ups report

`/portal/admin/signups` (ops/owner). `useSignups()` reads `households
orderBy signup.at desc` (single-field index, automatic), each household's
athletes, its invites, and `bookings where flag != null`. Row: sign-up time,
parent name/email/phone, athletes (name, age, tier, handicap), **payment**
per athlete (pending / active / past due / lapsed from the household
membership + `athletes.stripe`), **child login** (none / invited / claimed),
**flags** (Calendly over-cap etc.). Filters: all / unpaid / flagged. Row
tap -> the existing `/portal/admin/households/:householdId`. The admin
dashboard's Enrollment queue card becomes a *Sign-ups* card with the unpaid
count. Rules: ops/owner read on `invites` (2.3) and `calendlyEvents`.

## 8. The Blaze bundle (one functions deploy, owner-run)

`firebase deploy --only functions` ships the 8 built functions +
`calendlyWebhook` + the 4.3 changes. Secrets (`firebase functions:secrets:set`,
names only): `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`,
`CALENDLY_WEBHOOK_SIGNING_KEY`, plus the sender config the notice path
already expects (`SMTP_HOST/PORT/USER/PASS/FROM` or `COURIER_AUTH_TOKEN`,
`PORTAL_URL`). After deploy: the Stripe endpoint
`https://us-central1-rypacad.cloudfunctions.net/stripeWebhook` with the five
events, the Calendly subscription to
`.../calendlyWebhook`. From that moment every notice in the app is real -
which is why the "you'll get an email" copy is made TRUE rather than
removed (9).

## 9. Launch fixes riding along (frontend lane unless noted)

`path="*"` catch-all (K18); copy that promised emails now describes what
actually sends (Registration success, NotProvisioned, BookSession
confirmation - K30); the 95-minute tier offered by Registration vs the 90
the client/rules accept (`Registration.js:504`); the admin route hidden
from role `mental` (PortalRoutes 743 / AdminDashboard 154); the Success ->
walkthrough -> NotProvisioned loop; `Link another athlete` made real (2.3);
K04 (6.1); `no-tokens-left` period copy (5).

## 10. Data-model deltas (db lane writes DATA-MODEL.md)

| Collection | Field | Notes |
|---|---|---|
| households | `membership.status` | gains `'pending'` (absent still == active for pre-launch docs) |
| households | `signup {at, by, source, mode}`, `createdBy`, `stripeCustomerIds[]`, `emergencyContact`, `guardian.relationship` | new |
| athletes | `handicap` int 0..54 or null, `loginEmail` string or null, `stripe {customerId, subscriptionId, priceId, checkoutSessionId}` | new; `stripe` is server-written only |
| users | - | `role: 'athlete'` docs now created by the claim path |
| invites/{emailLower} | whole collection | new (2.2, 3.2) |
| packages | `stripePriceId`, `stripePaymentLink`, `windowDays: 30` | 4.1 |
| sessions | `source: 'calendly'`, `calendlyEventUri`, `durationMinutes` now real on synced docs | 6 |
| bookings | `source`, `calendlyInviteeUri`, `flag`, `cancelledBy: 'calendly'` | server-written only |
| calendlyEvents/{id} | whole collection | idempotency ledger, admin read |
| stripeEvents | - | unchanged |

Indexes: none new (all new queries are single-field or existing composites).

## 11. Verification

- Unit (frontend jest): `bookingOpen` (before/after, Elite, no package),
  window 30, `client_reference_id` build/parse, Calendly link builder,
  claim resolution (open/claimed/unverified/no invite), sign-up batch shape
  builder, `attendeeFromAnswers`, K04 month logic.
- Functions: `functions/portal/lib.test.js` gains resolution-order tests;
  `functions/test/verify-calendly.js` replays a recorded `invitee.created` /
  `invitee.canceled` pair against the isolated emulator (8082) and asserts
  the session, booking, ledger and token position; `verify-lane.js` gains
  a `checkout.session.completed` -> `invoice.paid` (both orders) case.
- Rules: emulator checks for self-provision (allowed once, refused with a
  users doc, refused with `membership.status: 'active'`), claim (refused
  unverified, refused wrong athleteId), parent cannot write `membership`,
  gate (refused before Oct 10 for t-6, allowed for Elite, allowed after).
- QA: the `qa-tester` agent drives every role on :3001 through sign-up ->
  pay (test link) -> claim -> book / blocked-before-Oct-10 / Elite books ->
  Calendly replay -> report. Production smoke with **test-mode** links
  before `--mode live`.
- `/code-review` on the plan, then on the integrated diff; PM gate on every
  lane before merge.

## 12. Owner checklist (ordered; each blocks what follows it)

1. **Firebase console**: Authentication -> Sign-in method -> Email/Password
   ON; Templates -> verification email reads right.
2. **Stripe dashboard**: one Product + monthly Price per tier (t-6, t-12,
   t-16, Elite, single), one Payment Link per Price, in BOTH test and live
   mode; copy the price ids and link URLs into
   `scripts/config/stripe-catalogue.json` (a PR from you or paste them in
   chat - they are public ids).
3. `firebase deploy --only firestore:rules,firestore:indexes` (the rules
   diff lands in one deploy: self-provision, invites, pending freeze, K10,
   Oct 10 gate, attendee field, 90-min tier).
4. `firebase functions:secrets:set` for the names in 8; then
   `firebase deploy --only functions`.
5. Stripe endpoint (five events) -> `STRIPE_WEBHOOK_SECRET` -> redeploy
   functions if the secret was set after.
6. **Calendly**: Yannick confirms Standard, builds the event type (6.3);
   you run the registration `curl` with his token and the signing key.
7. `node scripts/write-packages.mjs --prod --mode test --dry-run` then
   `--yes`; smoke-test a sign-up + test-card payment on production;
   then `--mode live --yes`.
8. Google Calendar: Phil's blocks entered with real end times; Yannick's
   RYP events retitled or left (they become display-only);
   `node scripts/sync-calendar-sessions.mjs --prod --dry-run` then `--yes`.
9. Railway: `REACT_APP_CALENDLY_MENTAL_URL` (+ `_ELITE_URL`),
   `REACT_APP_PORTAL_LIVE_DATA=true` confirmed, optional
   `REACT_APP_STRIPE_PORTAL_URL`, `REACT_APP_FIREBASE_VAPID_KEY`; push main.
10. Provision one **ops** account (an approver besides you) with
    `provision-owner.mjs`; confirm Yannick's and Phil's staff docs exist.
11. Send the Oct 1 email.

## 13. Lanes and sequence

| Lane | Owns |
|---|---|
| routing (`data-routing`) | rules (2.3, 3.2, 4.4, 5, K10), `useAuthSession` create/claim, `live.js` gates (opens-at, pending, recurring window), `packages.js`/`calendar.js` constants, `useSignups`, Calendly link builder + gate in hooks, duration plumbing in hooks |
| frontend (`frontend-dev`) | `SignUp` screen, `Registration` changes, Success/pay buttons, family-home pending banner, `SignIn` create-login, NotProvisioned states, `SpecialistBooking` Calendly branch + durations, `AdminSignups` screen, section 9 fixes |
| db (`db-engineer`) | DATA-MODEL, `write-packages.mjs`, `stripe-catalogue.json`, sync classifier + regex fix, seed (invites, pending, handicap, 30-min mental), docs (DECISION-GAPS, TEAM, contract) |
| functions (new lane, `backend-dev`) | `calendlyWebhook`, `stripe.js` 4.3, `lib.membershipAllowsBooking`, reminder/cancel skips, notice copy, `verify-calendly.js`, deploy runbook |
| PM (`pm-senior`) | worktrees, this contract, integration, `/code-review`, qa-tester pass, GitHub issues, the owner runbook |

Day 1 (Sep 28): this spec, the plan, `/code-review` on it, lanes spawned.
Day 2 (Sep 29): build + unit tests; owner does checklist 1-2. Day 3 (Sep
30): integration, rules + functions deploys, Stripe/Calendly wiring, QA on
:3001, production smoke with test links. Oct 1: live links, email.

## 14. Accepted gaps (say so if any is wrong)

- Multi-child families: one Stripe customer per checkout; the household
  anchors on the first paid subscription.
- Sign-ups on the 29th-31st clamp to anchor 28.
- A stranger can create a household (nothing books until Stripe pays).
- The Calendly link leaks via Calendly's own emails; over-cap bookings are
  flagged, not refused.
- The Oct 10 gate is a constant; changing the date is a rules + client
  deploy.
- Elite's Calendly range is 30 days unless Yannick makes the second event
  type.
- No welcome email; the Success screen is the receipt.

## 15. What the scope map found (for the record)

Registration is a request form, not account creation; no auth-user creation
anywhere; the Stripe webhook exists but nothing creates links or customers;
window is 32 in code, docs and production package docs; borrowed-token
booking already works; Elite 45 already rolling; no Oct 10 switch exists;
the sync's end-time regex can never match, so every synced session is 60
minutes; three surfaces hard-code 45 for specialists; eight functions are
built and none deployed; the rules deploy is pending and blocking.
