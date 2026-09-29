# DB lane - Sprint 20 Implementation Plan (part 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This is the second half of `30-db.md`** (Tasks 7-11). Goal, Architecture, Tech Stack, Spec, Interfaces, GitHub issues, Global Constraints and Handoffs are stated once, in part 1, and apply here unchanged. Tasks 7-11 depend on nothing in Tasks 1-6 except the committed `functions/config/stripe-catalogue.json` (`1b3dc3d`; Task 1 only confirms it - referenced by the docs) and Task 3's DATA-MODEL sync-table edit (Task 8 edits the same file; do them in order).

---

### Task 7: `functions/` env split - secrets to `.env.local`, `STRIPE_MODE` in `.env` (closes #15)

**Files:**
- Modify: `functions/env.template` (whole file - the full result is in Step 2; the current file is 61 lines, CRLF)
- Modify (local, untracked, never committed): `functions/.env`; Create (gitignored by `functions/.gitignore:2` `*.local`): `functions/.env.local`, `functions/.secret.local`
- Test: shell checks below (no values printed)

**Interfaces:**
- Consumes: interfaces 8 (`functions/.env` non-secret names: `PORTAL_URL`, `STRIPE_MODE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `PUSH_IN_EMULATOR`; `.env.local` secret names: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `CALENDLY_WEBHOOK_SIGNING_KEY`, `SMTP_USER`, `SMTP_PASS`); PM rulings D12 (the restricted key's scopes: Checkout Sessions write, Customers read, Prices read - `createCheckoutSession` reads `unit_amount` from Stripe) and D15 (below).
- Produces: `STRIPE_MODE=test` present in `functions/.env`; no secret key in `functions/.env` (a key declared in `runWith({secrets})` AND present in `.env` fails `firebase deploy` with a conflict); the template documents `.secret.local` and the emulator-only `STRIPE_LINE_ITEMS_STUB` (four session ids, `cs_evt_b`/`cs_evt_c`/`cs_evt_f`/`cs_evt_g`).

**Sequencing (PM ruling D15):** functions Task 11 lands AFTER this task. The functions lane creates its OWN gitignored `functions/.env.local` and `functions/.secret.local` in its worktree (a step in functions Task 11) with `STRIPE_SECRET_KEY=sk_test_harness`, so its harnesses' `checkout.sessions.list` throws deterministically (functions Task 13 STEP H's stated precondition). This task edits the db worktree's untracked `functions/.env` and the tracked template only; functions Task 11 Step 4 then only VERIFIES the template's stub section (the block is already here - at integration, if that step appended a second copy, keep this one).

- [ ] **Step 1: Baseline (names only)**

Run: `cd C:\Users\Mac\Desktop\rypacadapp\rypacad && grep -c "^STRIPE_WEBHOOK_SECRET=" functions/.env; grep -c "^STRIPE_MODE=" functions/.env`
Expected: `1` then `0`.

- [ ] **Step 2: Rewrite the template - the FULL resulting file**

The current `functions/env.template` (61 lines) has one header, a Stripe section carrying `STRIPE_WEBHOOK_SECRET` + `STRIPE_SECRET_KEY` (the latter described as "NOT used by the webhook ... what scripts/export-memberships.mjs reads"), an Email section with `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`, a Push paragraph with `PORTAL_URL`, the Courier section (`COURIER_AUTH_TOKEN` + nine `COURIER_EVENT_*` keys and the retired-keys note), `FIREBASE_PROJECT_ID`, `SENTRY_DSN`, `SLACK_WEBHOOK_URL`. Replace the whole file with exactly this (CRLF, like the original; use the Write tool or a node script, never `sed -i`). Every placeholder value below is the template's own dummy, not a real value:

```
# Cloud Functions environment - TWO files (Sprint 20, SPRINT-20-LAUNCH.md 8):
#
#   functions/.env        NON-SECRET config. Gitignored (repo .gitignore "Env
#                         files") but `firebase deploy` reads it and ships every
#                         key as a plain env var, so NO SECRET may live here.
#   functions/.env.local  SECRETS for the EMULATOR ONLY. Gitignored twice
#                         (functions/.gitignore *.local, repo .env.local) and
#                         excluded from deploy (firebase.json functions.ignore
#                         "*.local"). In production the same names are Secret
#                         Manager secrets: `firebase functions:secrets:set NAME`,
#                         bound per function by `.runWith({secrets: [...]})`
#                         (functions/portal/secrets.js lists them). A name
#                         declared there AND present in .env fails the deploy
#                         with a conflict - keep them apart.
#   functions/.secret.local
#                         The SAME secret names as .env.local, EMULATOR ONLY
#                         (also gitignored by *.local). With runWith({secrets})
#                         declared, the emulator reads a declared secret from
#                         .secret.local first and only then asks Secret Manager
#                         (an "Unable to access secret" line at startup when it
#                         cannot). Copy the three STRIPE_/CALENDLY_ lines there
#                         to keep the emulator quiet; .env.local still feeds
#                         the runtime. Each worktree keeps its own pair.
#
# Copy the two blocks below into the two files and fill them in.

# ---- functions/.env (non-secret) ---------------------------------------------
# STRIPE_MODE: which block of functions/config/stripe-catalogue.json the
# functions read (createCheckoutSession price ids, the webhook's price ->
# package map). `test` until the live endpoint exists (owner checklist
# 12.5 -> 12.9); `live` from then on.
STRIPE_MODE=test

# Email (contract v2.3, Sprint 15): SMTP through a Google Workspace address
# with an app password (Google Account -> Security -> 2-Step Verification ->
# App passwords). All three of SMTP_HOST / SMTP_USER / SMTP_PASS set = SMTP is
# used; otherwise Courier below; with neither, every email records 'skipped'
# on the ledger row and the triggers and jobs still complete. SMTP_FROM is the
# notice sender; the sign-up VERIFICATION email is Firebase's own and comes
# from noreply@<REACT_APP_FIREBASE_AUTH_DOMAIN> (rypacad.firebaseapp.com),
# never from this address.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_FROM=RYP Academy <you@rypgolf.com>

# Push (Sprint 15) needs NO key here: Firebase Cloud Messaging sends with the
# project's own credentials. The CLIENT build needs REACT_APP_FIREBASE_VAPID_KEY
# (Firebase console -> Project settings -> Cloud Messaging -> Web Push
# certificates -> Generate key pair). PORTAL_URL is where a tapped
# notification opens and the base of createCheckoutSession's success_url /
# cancel_url; PUSH_IN_EMULATOR=true opts the emulator into real sends.
PORTAL_URL=https://rypacad.ryptest.com
PUSH_IN_EMULATOR=false

# Courier (optional; used only when no SMTP_* is set) -----------------------
# COURIER_AUTH_TOKEN is a secret and lives in the .env.local block below: if
# the owner creates it, it becomes a Secret Manager secret and is added to
# MAIL_SECRETS (secrets.js) - a declared secret that does not exist fails the
# deploy, so it is NOT declared until it exists.
#
# One OPTIONAL Courier Studio template event id per notice kind (contract
# v2.2): COURIER_EVENT_<KIND>, the kind upper-cased with '-' as '_'. Unset
# (the default) means the notice sends ad-hoc { title, body } content, which
# is what portal/notices.js builds - nothing breaks without a template.
COURIER_EVENT_BOOKING_CONFIRMED=
COURIER_EVENT_PROMOTED=
COURIER_EVENT_SESSION_CANCELLED=
COURIER_EVENT_BOOKING_REVOKED=
COURIER_EVENT_REMINDER_24H=
COURIER_EVENT_TOKENS_EXPIRING=
COURIER_EVENT_GRACE_EXPIRING=
COURIER_EVENT_MEMBERSHIP=
COURIER_EVENT_WAITLIST_EXPIRED=
# Retired with the Sprint 14 pipeline: COURIER_EVENT_WAITLIST_PROMOTED /
# COURIER_EVENT_WAITLIST_OPEN (now COURIER_EVENT_PROMOTED) and
# COURIER_EVENT_CHILD_BOOKED (onBookingCreateNotifyChild is deleted).

# Firebase ------------------------------------------------------------------
# Auto-configured in a deployed function; set only for local scripts.
FIREBASE_PROJECT_ID=rypacad

# Optional: Sentry for error tracking
SENTRY_DSN=your_sentry_dsn_here

# Optional: Slack webhook for notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your/webhook/url

# ---- functions/.env.local (emulator secrets; Secret Manager in prod) ---------
# STRIPE_WEBHOOK_SECRET: the endpoint's signing secret (Developers -> Webhooks
# -> endpoint -> "Signing secret", or `stripe listen`). stripeWebhook refuses
# every request with 500 when unset (contract v2.1, pin H: an unverified
# webhook is an open write endpoint). One per endpoint: TEST and LIVE differ.
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
# STRIPE_SECRET_KEY: a RESTRICTED key per mode with exactly three scopes -
# Checkout Sessions: write, Customers: read, Prices: read (createCheckoutSession
# reads the recurring price's unit_amount to build the prepaid line; the
# webhook's last-resort lookup lists checkout sessions). Bound to
# createCheckoutSession and stripeWebhook. scripts/export-memberships.mjs
# reads the same name from its own shell environment, never from this file.
# The functions harnesses set it to the dummy `sk_test_harness` so
# checkout.sessions.list throws deterministically (verify-stripe-launch STEP H).
STRIPE_SECRET_KEY=rk_test_your_restricted_key_here
# CALENDLY_WEBHOOK_SIGNING_KEY: the signing_key sent in the POST
# /webhook_subscriptions body (spec 6.3); calendlyWebhook verifies with it.
CALENDLY_WEBHOOK_SIGNING_KEY=your_calendly_signing_key_here
# SMTP_USER / SMTP_PASS: the sending Workspace address and its app password
# (MAIL_SECRETS, bound to every function that calls sendNotice).
SMTP_USER=you@rypgolf.com
SMTP_PASS=your_app_password_here
# COURIER_AUTH_TOKEN (optional, see the Courier section): uncomment only when
# the owner has created the Secret Manager secret of the same name.
# COURIER_AUTH_TOKEN=your_courier_auth_token_here

# ---- emulator-only stubs (never set in production; guarded by ---------------
# ---- FUNCTIONS_EMULATOR === 'true' in the code that reads them) -------------
# STRIPE_LINE_ITEMS_STUB: JSON map Checkout session id -> line items that
# stripe-checkout.readLineItems returns instead of calling Stripe. The four
# ids are the ones functions/test/verify-stripe-launch.js replays: cs_evt_b
# (tier + one-time prepaid line), cs_evt_c (Elite, recurring only), cs_evt_f
# (quantity 2 -> unexpected-quantity), cs_evt_g (facility add-on + one-time
# line). One line, no spaces inside the JSON.
# STRIPE_LINE_ITEMS_STUB={"cs_evt_b":[{"quantity":1,"price":{"id":"price_t6","recurring":{"interval":"month"}}},{"quantity":1,"price":{"id":"price_1x"}}],"cs_evt_c":[{"quantity":1,"price":{"id":"price_elite","recurring":{"interval":"month"}}}],"cs_evt_f":[{"quantity":2,"price":{"id":"price_t6","recurring":{"interval":"month"}}}],"cs_evt_g":[{"quantity":1,"price":{"id":"price_fac","recurring":{"interval":"month"}}},{"quantity":1,"price":{"id":"price_1y"}}]}
```

What changed against the original, for the reviewer: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `SMTP_USER`, `SMTP_PASS` moved out of the `.env` block into the `.env.local` block (the old Stripe and Email sections are gone; nothing is stated twice); `STRIPE_MODE` and `PUSH_IN_EMULATOR` are new keys; `CALENDLY_WEBHOOK_SIGNING_KEY` is new; `COURIER_AUTH_TOKEN=...` moved into the `.env.local` block as a commented line (it is a secret and is not declared until it exists); the `.secret.local` paragraph (D15) and the stub section with `cs_evt_g` (functions Task 13) are new; every `COURIER_EVENT_*`, `FIREBASE_PROJECT_ID`, `SENTRY_DSN`, `SLACK_WEBHOOK_URL` line is verbatim from the original.

- [ ] **Step 3: Move the local secret without printing it**

Run (values never echoed):

```powershell
node -e "const fs=require('fs');const p='functions/.env',q='functions/.env.local';const secret=/^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|CALENDLY_WEBHOOK_SIGNING_KEY|SMTP_USER|SMTP_PASS)=/;const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);const keep=lines.filter(l=>!secret.test(l));const move=lines.filter(l=>secret.test(l));if(!keep.some(l=>l.startsWith('STRIPE_MODE=')))keep.push('STRIPE_MODE=test');fs.writeFileSync(p,keep.join('\r\n'));const prev=fs.existsSync(q)?fs.readFileSync(q,'utf8').split(/\r?\n/).filter(Boolean):[];fs.writeFileSync(q,[...prev,...move].join('\r\n')+'\r\n');console.log('moved',move.length,'secret line(s); .env now has STRIPE_MODE');"
```

- [ ] **Step 3b: Mirror the three declared secrets into `.secret.local` (D15; names only)**

The emulator resolves a `runWith({secrets})` name from `functions/.secret.local` before Secret Manager; without the file it logs `Unable to access secret` per declared name at startup (functions Task 11 Step 5 expects a quiet start). Copy exactly the three Stripe/Calendly lines, never printing them:

```powershell
node -e "const fs=require('fs');const q='functions/.env.local',s='functions/.secret.local';const want=/^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|CALENDLY_WEBHOOK_SIGNING_KEY)=/;const lines=fs.readFileSync(q,'utf8').split(/\r?\n/).filter(l=>want.test(l));fs.writeFileSync(s,lines.join('\r\n')+'\r\n');console.log('.secret.local:',lines.length,'line(s) (expect 3)');"
```

Expected: `.secret.local: 3 line(s) (expect 3)`. If `.env.local` lacks `STRIPE_SECRET_KEY` or `CALENDLY_WEBHOOK_SIGNING_KEY` (the pre-Sprint-20 `.env` only carried the webhook secret), first add the missing names to `.env.local` by hand with the template's dummy values (`rk_test_your_restricted_key_here`, `your_calendly_signing_key_here`) - the emulator only needs the names to exist; the functions lane's own worktree copies use `sk_test_harness` (functions Task 11).

- [ ] **Step 4: Verify (names and counts only)**

Run: `grep -c "^STRIPE_WEBHOOK_SECRET=" functions/.env; grep -c "^STRIPE_WEBHOOK_SECRET=" functions/.env.local; grep -c "^STRIPE_MODE=test" functions/.env; grep -cE "^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|CALENDLY_WEBHOOK_SIGNING_KEY)=" functions/.secret.local; git check-ignore -q functions/.env.local && echo ignored; git check-ignore -q functions/.secret.local && echo ignored; git check-ignore -q functions/.env && echo ignored`
Expected: `0`, `1`, `1`, `3`, `ignored`, `ignored`, `ignored`.
Run: `grep -c "cs_evt_g" functions/env.template; grep -c "^# STRIPE_LINE_ITEMS_STUB=" functions/env.template; grep -cE "^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|SMTP_USER|SMTP_PASS|CALENDLY_WEBHOOK_SIGNING_KEY)=" functions/env.template`
Expected: `1`, `1`, `5` (the five secret placeholders appear once each, all below the `.env.local` banner - `grep -n` to confirm they sit after the line containing `functions/.env.local (emulator secrets`).
Run: `git status --porcelain functions/`
Expected: only `functions/env.template` and (from Task 1) `functions/config/` listed - never `.env`, `.env.local` or `.secret.local`.

- [ ] **Step 5: Commit the template only**

```bash
git add functions/env.template
git commit -m "functions: env.template splits secrets into .env.local, adds STRIPE_MODE (Sprint 20, #15)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: DATA-MODEL.md - new fields, two new collections, the `cal-` id form (closes #15)

**Files:**
- Modify: `docs/portal/DATA-MODEL.md:17-34 (id table),41 (users),59-66 (households),74-84 (athletes),124-126 (packages),138,142,150 (sessions),325-360 (bookings),760 (after staffInvites),1421-1445 (stripeEvents)`

**Interfaces:**
- Consumes: interfaces 2 (every shape and its "absent ==") plus the PM rulings that extend it: D8 (`athletes.billing.lastEventId`; `athletes.facilityBilling.customerId` / `checkoutSessionId` / `lastEventId`; `calendlyEvents` outcome `malformed` and field `flag`; `stripeEvents.athleteId` / `via` and outcomes `facility-active` / `no-period` / `athlete-lapsed`), D10 (no facility event touches household membership or bookings), D17 (a tier `customer.subscription.deleted` is per athlete), and the contract's `loginInvites.status: 'orphaned'` (1.4).
- Produces: anchors `#logininvitesemaillower-contract-v301-sprint-20` and `#calendlyeventsid-contract-v301-sprint-20` that Task 9 links.

- [ ] **Step 1: Id conventions - three rows**

After the `stripeEvents` row (`:34`) add:

```
| `loginInvites` | the child's login email, lower-cased | **Contract v3.0.1 (Sprint 20).** One open invite per address by construction; `claimInvite` looks the caller's `token.email.lower()` up by id, no query. `status` is `open` / `claimed` / `orphaned` (the athlete doc is gone). Contrast `staffInvites` (auto id, script-consumed). Seed: `reese.whitfield@example.com`. |
| `calendlyEvents` | `{inviteeUuid}_{event}` | **Contract v3.0.1 (Sprint 20).** `calendlyWebhook`'s idempotency ledger, the `stripeEvents` pattern with a composed id (Calendly has no event id; the invitee uri's uuid + `invitee.created \| invitee.canceled` is unique per delivery). Seed: `seedinv0001_invitee.created`. |
| `sessions` (Calendly) | `cal-<eventUuid>` | **Contract v3.0.1 (Sprint 20).** Written only by `calendlyWebhook`; never date-prefixed (the id is Calendly's event uuid, so a reschedule that moves the date keeps the doc), never carries tournament results, and invisible to the sync's reap (`gcalEventId: null`, so `planSync` files it under `seededUntouched`). |
```

- [ ] **Step 2: `users`** - after the field table intro (`:41`) add a line: `**Contract v3.0.1 (Sprint 20):** `role: 'athlete'` docs are also created by `claimInvite` (`{ role: 'athlete', athleteId, householdId, staff: false, specialistId: null, displayName: athleteName, email }`) and `role: 'parent'` docs by `createFamily`; the client create clause stays denied.`

- [ ] **Step 3: `households`** - append rows after `membership` (`:66`):

```
| `signup` | map \| absent | **Contract v3.0.1 (Sprint 20).** `{ at: Timestamp, by: uid, source: 'self', mode: 'parent' \| 'athlete' }`, written by `createFamily`. **Absent == legacy** (provisioned/approved household); `useSignups` orders by `signup.at` and excludes legacy households. Seed: on `whitfield`, absent on `parker`. |
| `createdBy` | uid \| absent | Sprint 20, `createFamily`. Absent == legacy. |
| `stripeCustomerIds` | string[] | Sprint 20. `createFamily` writes `[]`; the webhook `arrayUnion`s every customer it sees (a second child's checkout may land on a new customer). **Absent == `[]`.** `stripeCustomerId` keeps its meaning (first/primary). |
| `emergencyContact` | string \| null | Sprint 20, from the sign-up form (was `enrollmentRequests.guardianNotes.emergencyContact`). Absent == null. |
| `guardian.relationship` | string \| null | Sprint 20, parent mode only. Absent == null. |
```

- [ ] **Step 4: `athletes`** - append rows after `coachId` (`:84`):

```
| `handicap` | int 0..54 \| null | **Contract v3.0.1 (Sprint 20).** Current handicap from sign-up ("none yet" == null). Rules admit it on create only in range; ops edits later. Absent == null. Seed: jordan 14, reese 27, nico null. |
| `loginEmail` | string \| null | Sprint 20. The child's own login address, lower-cased by client AND function; null == the parent's account runs the child. Pairs with `loginInvites/{loginEmail}`. Absent == null. |
| `billing` | map \| absent | **Sprint 20 - server-written only (`createFamily`, `stripeWebhook`), never in a client `hasOnly`.** `{ status: 'pending' \| 'active' \| 'past_due' \| 'lapsed', customerId, subscriptionId, priceId, checkoutSessionId, lastEventId, updatedAt }` (ids null until `checkout.session.completed`; `lastEventId` is the Stripe `event.id` of the last webhook write, the same cross-reference `households.membership.lastEventId` keeps - PM ruling D8; `createFamily`'s `pending` map does not carry it, the webhook adds it on the first write, so absent == no webhook write yet). **ABSENT == `active`** - every athlete provisioned before Sprint 20 books unchanged. `pending` is the booking gate (rules `athleteBillingOk`, client `billing-pending`). Seed: `pending` on nico only, exactly as `createFamily` writes it (no `lastEventId`). |
| `facilityBilling` | map \| absent | Sprint 20, webhook only. `{ status: 'active' \| 'past_due' \| 'lapsed', customerId, subscriptionId, priceId, checkoutSessionId, lastEventId, updatedAt }` - the same shape as `billing` minus `pending` (PM ruling D8; the webhook's `billingPatch` writes both maps through one helper) - the $300 add-on subscription; absent == no add-on. Paid -> `facilityAccess: true`; lapse/delete -> `facilityAccess: false`. **Scope of a facility lapse (PM ruling D10):** `customer.subscription.deleted` / `invoice.payment_failed` resolved to `product: 'facility'` write `facilityBilling.status` and `facilityAccess: false` ONLY - never `households.membership`, never `billing`, never a booking revocation. The household-freeze in spec 4.3 ("AND to household membership exactly as today") applies to the TIER subscription only. `facilityAccessConsent` stays ops-verified. |
```

- [ ] **Step 5: `packages`** - at `:124` change ``32` for every token package and `single`` to ``30` for every token package and `single` (**Sprint 20 ruling 0.5; was 32**)``; at `:126` replace the `stripePriceId` note's text after the first sentence with: `**Sprint 20: populated.** Written ONLY by `scripts/write-packages.mjs --prod --mode test|live` from `functions/config/stripe-catalogue.json` (the one source, both modes; `facility-access` has no packages doc). `data/packages.js` never carries it and the seed writes `null` explicitly. Absent == null.` Append to the `windowDays` row: `**Sprint 20:** also written by `write-packages.mjs` (30 / 45) so production docs match the seam without a full `provision-family.mjs` catalogue run.`

- [ ] **Step 6: `sessions`** - append rows after `coachNote` (`:150`):

```
| `source` | string \| absent | **Sprint 20.** `'calendly'` on `cal-` docs written by `calendlyWebhook`; absent == `'portal'`/sync. |
| `calendlyEventUri` | string \| absent | Sprint 20, `cal-` docs only. |
| `bookable` (Calendly) | boolean | `false` on every `cal-` doc so `liveSpecialistDays` never offers a freed Calendly slot in-app; absent == true (`hooks/index.js:260`). |
```

and in the `durationMinutes` row (`:138`) append: `**Sprint 20:** the sync's end-time regex is fixed, so synced docs now carry the real value (Phil 45); `cal-` docs carry `round((end - start) / 60000)` (30).`

- [ ] **Step 7: `bookings`** - append rows after `chargedFrom` (`:360`):

```
| `source` | string \| absent | **Sprint 20, server-written.** `'calendly'` when `calendlyWebhook` wrote it; absent == `'portal'`. A calendly row is NOT cancellable in-app (rules `memberBookingUpdateOk` `resource.data.get('source', null) != 'calendly'`; copy "Cancel or reschedule from Calendly's email"). |
| `calendlyInviteeUri` | string \| absent | Sprint 20. The lookup key for `invitee.canceled` and for the `old_invitee` reschedule step (single-field index). |
| `flag` | string \| null | Sprint 20, webhook only. `'over-cap' \| 'over-cadence' \| 'membership-inactive' \| 'before-open' \| null` - a Calendly booking is recorded and flagged, never refused (ruling 0.7); tokens are derived so an over-cap booking floors `left` at 0. Absent == null (clean). `useSignups` reads `bookings where flag != null`. |
```

and in `cancelledBy` (`:330`) change `` `uid \| 'system'` `` to `` `uid \| 'system' \| 'calendly'` `` with the note `**Sprint 20:** `'calendly'` from `invitee.canceled` (`cancelReason: 'member'`); `onBookingCancelled` skips it.`

- [ ] **Step 8: Two new collection sections** after `staffInvites` (`:760`, before `### Billing rows`):

```
### `loginInvites/{emailLower}` (contract v3.0.1, Sprint 20)

Backs "own login?" at sign-up and the claim on first sign-in (SPRINT-20-LAUNCH.md 2.2, 3.2). Writers: `createFamily` / `addAthletes` (open), `claimInvite` (claimed, or `orphaned` when the athlete no longer exists). **No client create or update**; read by the email owner only when `request.auth.token.email_verified == true`, by the household's parent, or ops/owner. `claimInvite` returns `householdId` / `athleteId` only on `state: 'claimed'` (null for `needs-verification`, `already-claimed`, `none`); `createFamily` / `addAthletes` refuse `child-email-duplicate` against an existing `open` OR `claimed` invite for the same address (a claimed invite is a login; only `orphaned` is reusable) as well as against a sibling in the same call.

| Field | Type | Notes |
|---|---|---|
| `email` | string | Lower-cased; equals the doc id and `athletes.loginEmail`. |
| `householdId`, `athleteId`, `athleteName` | string | Denormalized so the claim writes the `users` doc without a second read. |
| `requestedBy` | `'guardian'` | |
| `createdBy` | uid | The parent. |
| `createdAt` | timestamp | An open invite older than 7 days shows as `invited-stale` in the sign-ups report. |
| `status` | `'open' \| 'claimed' \| 'orphaned'` | `orphaned` (contract 1.4): `claimInvite` found the invite but `athletes/{athleteId}` no longer exists (ops deleted the athlete after the parent requested the login); the call returns `state: 'none'` and the doc is flipped so the report can show it. Never reopened; ops fixes it by deleting the doc or re-adding the athlete. |
| `claimedBy`, `claimedAt` | uid \| null, timestamp \| null | Set together on claim; stay null on `orphaned`. |

### `calendlyEvents/{inviteeUuid}_{event}` (contract v3.0.1, Sprint 20)

`calendlyWebhook`'s idempotency ledger (6.2), written in the same transaction as its effect; a repeat is `duplicate`. Admin-only (`ops`/`owner` read); the report lists `outcome == 'unresolved'` rows as "Unmatched Calendly bookings".

| Field | Type | Notes |
|---|---|---|
| `event` | `'invitee.created' \| 'invitee.canceled'` | |
| `inviteeUri`, `eventUri` | string | Calendly resource uris. |
| `athleteId`, `householdId` | string \| null | Null when `unresolved` or `malformed`. |
| `receivedAt` | timestamp | |
| `outcome` | string | `applied \| duplicate \| unresolved \| already-cancelled \| rescheduled \| not-found \| malformed`. **`malformed` (PM ruling D8):** a verified body with no invitee uri or unparseable start/end times - nothing else can be keyed, so the row is written under the best id available and no session/booking is touched; HTTP 200. `ignored` (an event type the subscription never sends) is RETURNED to the caller only, never written. `duplicate` is likewise never written (the existing row is the guard). |
| `flag` | string \| null | **PM ruling D8.** The booking's flag as written on `applied`: `'over-cap' \| 'over-cadence' \| 'membership-inactive' \| 'before-open' \| null` (clean); null on every non-`applied` outcome. Denormalized so the report reads flags from one collection scan. Precedence when several apply: `membership-inactive` > `before-open` > `over-cadence` > `over-cap`. |
```

- [ ] **Step 9: `stripeEvents`** - in the section (`:1421-1445`), after the "Shape (as built, pin H)" sentence, append:

```
**Sprint 20 (contract v3.0.1, PM ruling D8):** the shape gains two fields — `{ type, customer, householdId: string | null, athleteId: string | null, via: string | null, receivedAt, outcome }`. `athleteId` is the athlete the event resolved to (null on the legacy household-wide path and on every unresolved row); `via` names WHICH step of the resolution order (interfaces 6.2) matched: `'metadata'` (subscription metadata), `'billing'` (`athletes.billing.subscriptionId`), `'facility'` (`athletes.facilityBilling.subscriptionId`), `'customer'` (`households.stripeCustomerId`), `'customer-ids'` (`stripeCustomerIds array-contains`), `'checkout-session'` (`checkout.sessions.list`), `'client-reference'` (`checkout.session.completed`'s own `client_reference_id`), or null. Both are audit fields: `export-memberships.mjs` and the sign-ups report never branch on them.

Outcomes gain: `applied-checkout` (`checkout.session.completed` applied to the athlete's `billing` or `facilityBilling`); `issued-prepaid` (the `subscription_create` invoice's tokens landed in the prepaid period from `subscription_data.metadata`); `facility-active` (an `invoice.paid` for the facility add-on: `facilityBilling.status: 'active'`, no tokens issued, no payment-received notice); `no-period` (an `invoice.paid` for a token package whose invoice line carries no period and whose metadata names no prepaid period: billing flipped to active, NO `tokenPeriods` doc written — the daily export surfaces it); `unexpected-quantity` (the checkout's line items are not exactly one recurring line plus at most one one-time line, every quantity 1 — PM ruling D13: recorded, nothing written); `stripe-lookup-failed` (the last-resort `checkout.sessions.list` threw: recorded with `householdId: null`, HTTP 200, surfaced by `export-memberships.mjs`; a redelivery is then `duplicate`); `athlete-lapsed` (a TIER `customer.subscription.deleted` - or a final `invoice.payment_failed` - for one athlete while a sibling still holds an active/past_due tier, PM ruling D17: that athlete's `billing.status` -> `lapsed`, only their future bookings and waitlist entries are revoked via `revoke.revokeAthlete`, household `membership` untouched). `HANDLED` gains `checkout.session.completed`; `client_reference_id` is `${householdId}__${athleteId}__${product}` (double underscore; athlete ids never contain `_`).

**Facility add-on events (PM ruling D10):** every event that resolves to `product: 'facility'` (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`) records its usual outcome but its ONLY writes are `athletes.facilityBilling` (+ `facilityAccess`) — household `membership` is untouched and no booking is revoked. The household freeze (`applyPastDue`) belongs to the tier subscription; the household lapse and `revokeHousehold` apply only when a tier subscription ends and no sibling still holds an active/past_due tier (D17) — otherwise only that athlete lapses (`athlete-lapsed`).
```

- [ ] **Step 10: Verify and commit**

Run: `grep -c "Sprint 20" docs/portal/DATA-MODEL.md`
Expected: >= 20. Run: `grep -c "lastEventId" docs/portal/DATA-MODEL.md` - Expected: >= 5 (the two `membership` mentions plus `billing`, `facilityBilling`, and the seed line). Run: `grep -cE "facility-active|no-period|athlete-lapsed|malformed|'via'|\bvia\b" docs/portal/DATA-MODEL.md` - Expected: >= 5. Run: `grep -n "windowDays.*32" docs/portal/DATA-MODEL.md` - Expected: only line 1267 remains (Task 9 fixes it).

```bash
git add docs/portal/DATA-MODEL.md
git commit -m "docs: DATA-MODEL Sprint 20 fields, loginInvites, calendlyEvents, cal- ids (#15)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: DATA-MODEL.md - window 30, v3.0 query reasoning (indexes unchanged), seeding workflow (closes #15)

**Files:**
- Modify: `docs/portal/DATA-MODEL.md:1267,1497 (insert before "### v2.2 index reasoning"),1620 (seeding bullets)`

**Interfaces:**
- Consumes: interfaces 4.2 queries, 6.2 resolution order; `firestore.indexes.json` (10 composites, none on the new fields).
- Produces: the written reason `firestore.indexes.json` is unchanged this sprint.

- [ ] **Step 1: Window 30** - at `:1267` change `` `windowDaysFor(pkg)` → `32` `` to `` `windowDaysFor(pkg)` → `30` (**Sprint 20 ruling 0.5, was 32**) ``.

- [ ] **Step 2: Insert before `### v2.2 index reasoning`**:

```
### v3.0 query additions (Sprint 20 — sign-up, Calendly, per-athlete billing) — no `firestore.indexes.json` changes

Every new read is a single-field filter or a single-field sort, which rides Firestore's automatic single-field index; none combines an equality with a range/sort on a different field, so none needs a composite:

- `households orderBy signup.at desc` (`useSignups`) — one sort field (a map sub-field is still one field).
- `loginInvites where householdId == :id`; `loginInvites/{emailLower}` by id (`claimInvite`).
- `bookings where flag != null` — a single-field `!=` is served by the automatic index (docs without the field are excluded, which is the intent: absent == clean).
- `bookings where calendlyInviteeUri == :uri` (`invitee.canceled`, reschedule); `calendlyEvents where outcome == 'unresolved'`.
- The webhook's resolution order (interfaces 6.2): `athletes where billing.subscriptionId == :id`, `athletes where facilityBilling.subscriptionId == :id`, `households where stripeCustomerId == :c` (existing), `households where stripeCustomerIds array-contains :c` — each one equality/array-contains on one field.
- `write-packages.mjs` reads `packages/{id}` by id; `useSignups`'s athletes read is `athletes where householdId == :id` (existing single-field pattern).

The `bookings (status, date)` composite (index 7) still serves reminders; nothing here filters `source`/`flag` together with a date.
```

- [ ] **Step 3: Seeding workflow** - append to the seed bullet list (`:1620` region, after the `periodAnchorDay` bullet):

```
- **contract v3.0.1 (Sprint 20):** `whitfield` carries `signup`/`createdBy`/`stripeCustomerIds: []`/`emergencyContact: null`/`guardian.relationship` (the self-signed-up family; `parker` stays legacy); athletes carry `handicap` and `loginEmail`; `athletes/nico.billing.status: 'pending'` (jordan/reese absent == active); one open `loginInvites/reese.whitfield@example.com`; packages write `stripePriceId: null` explicitly (never an id - `write-packages.mjs` is the only writer); specialist slots carry `durationMinutes` (phil 45, mental 30) with Yannick at 4:00 / 4:30 / 5:00 PM; and one Calendly trio - `sessions/cal-seedevt0001` (`bookable: false`, `source: 'calendly'`), `bookings/reese_cal-seedevt0001` (`source: 'calendly'`, `flag: null`, `createdBy: 'system'`) and `calendlyEvents/seedinv0001_invitee.created` (`applied`). `npm run packages:emulator -- --mode test --yes` then stamps the committed TEST ids (`functions/config/stripe-catalogue.json`, `1b3dc3d`) onto the emulator's packages docs; `--mode live` refuses until the owner pastes the LIVE ids.
```

- [ ] **Step 4: Verify and commit**

Run: `grep -n "32" docs/portal/DATA-MODEL.md | grep -i "window"` - Expected: no output. Run: `grep -c "v3.0 query additions" docs/portal/DATA-MODEL.md` - Expected: `1`.

```bash
git add docs/portal/DATA-MODEL.md
git commit -m "docs: DATA-MODEL window 30, v3.0 query reasoning, seed workflow (Sprint 20, #15)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Window 30 in every other doc (closes #15)

**Files:**
- Modify: `docs/portal/tokens-and-billing-contract.md:91,103,191`; `docs/portal/SPRINT-12-PINS.md:85,154,319`; `docs/portal/ui-redesign-brief.md:67,501,542`; `docs/portal/TEAM.md:1366,1435,1590`

**Interfaces:**
- Consumes: spec 5 ("docs restating 32 ... updated"). Owner quotes at `SPRINT-12-PINS.md:22` and `TEAM.md:1303` are verbatim history and stay.
- Produces: none (handoff 3 covers `lib.test.js`).

- [ ] **Step 1: Baseline**

Run: `grep -n "32" docs/portal/tokens-and-billing-contract.md docs/portal/SPRINT-12-PINS.md docs/portal/ui-redesign-brief.md docs/portal/TEAM.md | grep -iv "phone\|≤ 32\|1303:\|:22:"`
Expected: the 12 lines listed above.

- [ ] **Step 2: Edit each line** (exact replacements):

- `tokens-and-billing-contract.md:91` `| Token packages | 32 days |` -> `| Token packages | 30 days (**Sprint 20 ruling 0.5; was 32**) |`
- `:103` `sees through Feb 11; Elite sees through Feb 24` -> `sees through Feb 9; Elite sees through Feb 24`
- `:191` `windowDays: 32 | 45` -> `windowDays: 30 | 45`
- `SPRINT-12-PINS.md:85` `windowDays: 32 | 45 }` -> `windowDays: 30 | 45 }` and append to that paragraph: `(*Sprint 20, 2026-09-28: 32 -> 30 for every token package and single; Elite 45 unchanged.*)`
- `:154` `` `windowDaysFor(pkg)` → 32, `` -> `` `windowDaysFor(pkg)` → 30 (Sprint 20; was 32), ``
- `:319` `kind: 'single', windowDays: 32` -> `kind: 'single', windowDays: 30`
- `ui-redesign-brief.md:67` `32 days for token` -> `30 days for token`
- `:501` `Rolling window: 32 days, Elite 45` -> `Rolling window: 30 days, Elite 45`
- `:542` `**32 days** (Elite 45)` -> `**30 days** (Elite 45)`
- `TEAM.md:1366` `windowDays: 32 | 45 }` -> `windowDays: 30 | 45 }` (+ the same italic Sprint 20 note as the pins line)
- `:1435` `` → 32, `` -> `` → 30 (Sprint 20; was 32), ``
- `:1590` `windowDays: 32` -> `windowDays: 30`

- [ ] **Step 3: Verify**

Run the Step 1 command again. Expected: no output (only the two owner quotes and the phone-length row remain when the filter is removed).

- [ ] **Step 4: Commit**

```bash
git add docs/portal/tokens-and-billing-contract.md docs/portal/SPRINT-12-PINS.md docs/portal/ui-redesign-brief.md docs/portal/TEAM.md
git commit -m "docs: token window 30 everywhere it was restated as 32 (Sprint 20, #15)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: DECISION-GAPS.md accepted gaps + rulings, TEAM.md Sprint 20 stub (closes #15)

**Files:**
- Modify: `docs/portal/DECISION-GAPS.md` (append after line 240)
- Modify: `docs/portal/TEAM.md` (append after line 3174)

**Interfaces:**
- Consumes: spec 0.11-0.13, 14; interfaces preamble; PM rulings D10 (a facility lapse never freezes the family) and D11 (the 48-hour Checkout `trial_end` rule) recorded as rulings 4 and 5; the functions lane's `MENTAL_MONTHLY_CAP` duplication (functions Handoff 8) recorded as a TEAM.md pin.
- Produces: the TEAM.md section heading `## Sprint 20 pins - launch (contract v3.0.1, 2026-09-28)` the PM's integration notes extend.

- [ ] **Step 1: Append to DECISION-GAPS.md**

```
## Sprint 20 - launch (contract v3.0.1, 2026-09-28)

Owner rulings, on the record (SPRINT-20-LAUNCH.md 0.11-0.13):

1. **The checkout payment prepays November.** Before Nov 1 every tier pays
   November at full price at checkout; recurring billing starts Dec 1 and
   every subscription anchors on the 1st (`subscription_data.trial_end`,
   one-time prepaid line). Nobody pays twice before the first session.
2. **Season starts Nov 3** (Nov 2 is set-up day): `SEASON_BOUNDS.start`
   2026-11-02 -> 2026-11-03. Oct 10 + 30 = Nov 9, so the first week is
   bookable from Oct 10 either way.
3. **Mid-month joiners prorate both** price (days remaining / days in
   month) and tokens (same fraction, rounded up, never 0), then bill in full
   on the next 1st. `PRORATE_JOINERS = true` is the ruling, not a default.
4. **The 48-hour rule (PM ruling D11, 2026-09-28).** Stripe refuses a
   Checkout Session whose `subscription_data.trial_end` is under 48 hours
   away. So a checkout started when the next 1st is under 48 h off (the
   29th-31st, or the 30th/31st of a 31-day month - possible only from Nov 1,
   when the prepaid month is the current one) prepays the NEXT month in full
   and `trial_end` is the 1st after that; the remaining day or two of the
   current month are free, not prorated and not blocked.
   `createCheckoutSession`'s `prepaidFor` rolls the period forward with a
   49-hour lead (`MIN_TRIAL_LEAD_MS`); unit-tested in
   `functions/portal/checkout.test.js` ("under 48 h to the 1st: prepay next
   month in full"). Ruled, not a default: the alternative (refusing checkout
   on those days with a new reason) was rejected.
5. **A facility add-on lapse never freezes the family (PM ruling D10,
   2026-09-28).** Every event for `product: 'facility'` (`invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated`,
   `customer.subscription.deleted`) writes `athletes.facilityBilling` (+
   `facilityAccess`) and nothing else - `households.membership` is
   untouched, no booking is revoked, the tier `billing` keeps gating. Spec
   4.3's "AND to household membership exactly as today" is the TIER
   subscription's rule only (and, since D17, a tier
   `customer.subscription.deleted` is per athlete - the household lapses only
   when no sibling is live). The webhook's facility branches skip
   `householdActive` / `membershipPatch` / `applyLapsed` / `applyPastDue`
   when the resolved product is `facility`; `verify-stripe-launch.js` STEP G
   (functions Task 13, rewritten under D10) asserts `membership` unchanged
   after the add-on's `subscription.deleted`.

Accepted gaps (spec 14 - say so if any is wrong):

- A stranger with an unverified password account can create a household;
  they cannot pay, claim or read invites unverified; ops deletes them from
  the report's *unpaid* view.
- One failing card on the TIER subscription freezes the whole household
  (`membership` stays household-level); per-athlete `billing` only gates
  who may book. A failing card on the facility add-on freezes nothing
  (ruling 5 above).
- Multi-child families share one Stripe customer when the second checkout
  reuses `stripeCustomerId`; otherwise `stripeCustomerIds` holds both.
- Before Nov 1 every tier prepays November at full price whatever the
  sign-up date; Elite's October access is included, not charged. The
  `pkg.tokens` fallback for a period with no `tokenPeriods` doc never
  short-grants a joiner's first partial month, and never over-grants it
  because the prepaid doc is written before booking opens for them.
- The Calendly link leaks via Calendly's own emails; early/over-cap
  bookings are flagged (`bookings.flag`), not refused.
- The Oct 10 gate is a constant (`BOOKING_OPENS_AT = 1791633600000`);
  changing the date is a rules + client deploy (retire after launch, #26).
- Elite's Calendly range is 30 days unless Yannick makes the second type.
- An invite for an email that already holds a login cannot be claimed; the
  report shows it after 7 days (`invited-stale`).
- No welcome email; the Success screen is the receipt.
- The calendar sync is manual; Phil's edits reach the portal when the owner
  re-runs it. The first run after Sprint 20 deletes/cancels every synced
  `mental` session (Yannick moved to Calendly) - run it before any smoke
  booking (spec 12.7).
- DB lane: the committed `functions/config/stripe-catalogue.json` carries
  the TEST price ids (`1b3dc3d`); its `live` block is null until the owner
  pastes the LIVE ids, and until then `write-packages.mjs --mode live`
  refuses to write (and `createCheckoutSession` under `STRIPE_MODE=live`
  answers `price-missing`).
```

- [ ] **Step 2: Append to TEAM.md**

```
## Sprint 20 pins - launch (contract v3.0.1, 2026-09-28)

Origin: `docs/portal/SPRINT-20-LAUNCH.md` (the owner's rulings of
2026-09-28, four-lens review folded in as v3.0.1) and the cross-lane
contract `docs/portal/plans/2026-09-28-sprint-20-launch/01-interfaces.md`.
Lanes and plans: routing (`20-routing.md`), frontend (`40-frontend.md`),
db (`30-db.md`), functions (`10-functions.md`); GitHub #1-#27.

Keystones (build facts):
- Sign-up is instant via `createFamily` (Admin-SDK transaction; the
  browser cannot pass the rules' read cap); Stripe via Checkout Sessions;
  per-athlete `athletes.billing` (absent == active) is the booking gate.
- Window 30 (Elite 45); `BOOKING_OPENS_AT = 1791633600000` (Oct 10 07:00
  Chicago); season starts Nov 3; the checkout payment prepays November,
  recurring from Dec 1 anchored on the 1st; mid-month joiners prorate both.
- Yannick books via Calendly (`calendlyWebhook` writes `sessions/cal-<uuid>`,
  `bookings.source: 'calendly'`, flagged never refused); Phil stays on the
  calendar with real `durationMinutes` (sync regex fix).
- Stripe's 48-hour Checkout `trial_end` minimum rolls a checkout on the
  29th-31st forward to prepay the NEXT month (DECISION-GAPS Sprint 20
  ruling 4); a facility add-on lapse writes `facilityBilling` +
  `facilityAccess: false` only, never the household freeze (ruling 5).

Pins (change one, change both):
- **`MENTAL_MONTHLY_CAP = { elite: 2, default: 1 }`** is duplicated in
  `functions/portal/calendly.js` from
  `frontend/src/portal/data/specialists.js:112` (the webhook judges
  over-cadence server-side; the functions bundle cannot import the seam,
  the same reason `lib.js` duplicates the period math). A change to
  Yannick's monthly cadence edits BOTH and both tests
  (`data/amendments.test.js`, `functions/test/verify-calendly.js` STEP G over-cadence).
- `SPECIALIST_DURATION_MINUTES = { phil: 45, mental: 30 }` in
  `scripts/seed-firestore.mjs` mirrors `data/specialists.js`
  `durationMinutes` (routing lane) - the seed names the number rather than
  importing it (BRACKETS precedent).

DB lane (this sprint): `functions/config/stripe-catalogue.json` (one
source, both modes) + `scripts/write-packages.mjs` (the only writer of
`packages.stripePriceId`, `windowDays` 30/45, masked update, refuses
households and nulls); sync drops `mental|yannick` and measures end times
(`scripts/test/`); seeds gain `signup`, `billing: pending` (nico),
`handicap`, `loginEmail`, `loginInvites`, the Calendly trio, specialist
durations; `functions/env.template` splits secrets into `.env.local`;
DATA-MODEL / DECISION-GAPS / contract docs restate the model. Handoffs:
`packages.js` + `hooks/index.js` seed tables (routing), `lib.test.js`
fixtures (functions). `firestore.indexes.json` unchanged (DATA-MODEL
"v3.0 query additions").

Integration notes: (PM appends at merge.)
```

- [ ] **Step 3: Verify and commit**

Run: `grep -c "Sprint 20" docs/portal/DECISION-GAPS.md docs/portal/TEAM.md; grep -c "48-hour rule" docs/portal/DECISION-GAPS.md; grep -c "MENTAL_MONTHLY_CAP" docs/portal/TEAM.md`
Expected: `DECISION-GAPS.md:1` or more, `TEAM.md:1` or more, then `1`, then `1` or more. Run `node --test scripts/test/` once more - Expected: 9 pass.

```bash
git add docs/portal/DECISION-GAPS.md docs/portal/TEAM.md
git commit -m "docs: Sprint 20 rulings, accepted gaps, TEAM pins stub (#15)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review

- Spec coverage (db row of 13): DATA-MODEL (Tasks 3, 8, 9); `write-packages.mjs` (1, 2); catalogue (1); sync classifier + regex (3); seeds - invites, billing pending, handicap, durations (4, 5, 6); DECISION-GAPS / TEAM / contract (10, 11); `.env.local` split (7). Spec 10's every row: households/athletes/users/loginInvites/packages/sessions/bookings/calendlyEvents/stripeEvents (Task 8), indexes (Task 9).
- Placeholder scan: none; every code step shows the code, every doc step the text, every verify step the command and expected output.
- Names: `parseArgs` / `loadCatalogue` / `planPackageWrites` / `diffLine` / `CATALOGUE_PATH` / `CATALOGUE_KEYS` / `PRICE_ID_RE` / `EXPECTED_WINDOW` / `--catalogue` / `SPECIALIST_DURATION_MINUTES` / `test:scripts` / `packages:emulator` are new (script-internal, not in the contract); `FACILITY_KEY`, the JSON path, the twelve keys, every Firestore field name and the seed ids follow the contract.
- Nothing here may slip: every task is on the cut line's MUST side or is docs/seed; Task 6's Calendly seed and Task 3's classifier change are harmless if 6.2 slips (the in-app slot list still works in the emulator - the `cal-` doc is `bookable: false` and Yannick's `-s<n>` slots remain).
