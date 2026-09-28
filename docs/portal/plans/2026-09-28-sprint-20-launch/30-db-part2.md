# DB lane - Sprint 20 Implementation Plan (part 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This is the second half of `30-db.md`** (Tasks 7-11). Goal, Architecture, Tech Stack, Spec, Interfaces, GitHub issues, Global Constraints and Handoffs are stated once, in part 1, and apply here unchanged. Tasks 7-11 depend on nothing in Tasks 1-6 except Task 1's `functions/config/stripe-catalogue.json` (referenced by the docs) and Task 3's DATA-MODEL sync-table edit (Task 8 edits the same file; do them in order).

---

### Task 7: `functions/` env split - secrets to `.env.local`, `STRIPE_MODE` in `.env` (closes #15)

**Files:**
- Modify: `functions/env.template:1-28,44-58`
- Modify (local, untracked, never committed): `functions/.env`; Create (gitignored): `functions/.env.local`
- Test: shell checks below (no values printed)

**Interfaces:**
- Consumes: interfaces 8 (`functions/.env` non-secret names: `PORTAL_URL`, `STRIPE_MODE`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `PUSH_IN_EMULATOR`; `.env.local` secret names: `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `CALENDLY_WEBHOOK_SIGNING_KEY`, `SMTP_USER`, `SMTP_PASS`).
- Produces: `STRIPE_MODE=test` present in `functions/.env`; no secret key in `functions/.env` (a key declared in `runWith({secrets})` AND present in `.env` fails `firebase deploy` with a conflict).

- [ ] **Step 1: Baseline (names only)**

Run: `cd C:\Users\Mac\Desktop\rypacadapp\rypacad && grep -c "^STRIPE_WEBHOOK_SECRET=" functions/.env; grep -c "^STRIPE_MODE=" functions/.env`
Expected: `1` then `0`.

- [ ] **Step 2: Rewrite the template's top section**

Replace `functions/env.template:1-28` with:

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
#                         bound per function by `.runWith({secrets: [...]})`.
#                         A name declared there AND present in .env fails the
#                         deploy with a conflict - keep them apart.
#
# ---- functions/.env (non-secret) ---------------------------------------------
# Which block of functions/config/stripe-catalogue.json the functions read
# (createCheckoutSession price ids, the webhook's price -> package map).
# `test` until the live endpoint exists (owner checklist 12.5 -> 12.9).
STRIPE_MODE=test
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_FROM=RYP Academy <you@rypgolf.com>
PORTAL_URL=https://rypacad.ryptest.com
# PUSH_IN_EMULATOR=true opts the emulator into real FCM sends.
PUSH_IN_EMULATOR=false
FIREBASE_PROJECT_ID=rypacad

# ---- functions/.env.local (emulator secrets; Secret Manager in prod) ---------
# STRIPE_WEBHOOK_SECRET: the endpoint's signing secret (Developers -> Webhooks
# -> endpoint -> "Signing secret", or `stripe listen`). The handler refuses
# every request with 500 when unset. One per endpoint: TEST and LIVE differ.
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
# STRIPE_SECRET_KEY: a RESTRICTED key per mode (Checkout Sessions write,
# Customers read) - createCheckoutSession and the webhook's lookups.
STRIPE_SECRET_KEY=rk_test_your_restricted_key_here
# CALENDLY_WEBHOOK_SIGNING_KEY: the signing_key sent in the POST
# /webhook_subscriptions body (spec 6.3); calendlyWebhook verifies with it.
CALENDLY_WEBHOOK_SIGNING_KEY=your_calendly_signing_key_here
SMTP_USER=you@rypgolf.com
SMTP_PASS=your_app_password_here
```

Then delete the now-duplicated `SMTP_HOST`..`SMTP_FROM` lines and `PORTAL_URL` from the old Email/Push sections (`:29-48` in the original numbering), keeping the Courier and Sentry/Slack sections as they are, and delete the old `FIREBASE_PROJECT_ID` line so it appears once.

- [ ] **Step 3: Move the local secret without printing it**

Run (values never echoed):

```powershell
node -e "const fs=require('fs');const p='functions/.env',q='functions/.env.local';const secret=/^(STRIPE_WEBHOOK_SECRET|STRIPE_SECRET_KEY|CALENDLY_WEBHOOK_SIGNING_KEY|SMTP_USER|SMTP_PASS)=/;const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);const keep=lines.filter(l=>!secret.test(l));const move=lines.filter(l=>secret.test(l));if(!keep.some(l=>l.startsWith('STRIPE_MODE=')))keep.push('STRIPE_MODE=test');fs.writeFileSync(p,keep.join('\r\n'));const prev=fs.existsSync(q)?fs.readFileSync(q,'utf8').split(/\r?\n/).filter(Boolean):[];fs.writeFileSync(q,[...prev,...move].join('\r\n')+'\r\n');console.log('moved',move.length,'secret line(s); .env now has STRIPE_MODE');"
```

- [ ] **Step 4: Verify (names and counts only)**

Run: `grep -c "^STRIPE_WEBHOOK_SECRET=" functions/.env; grep -c "^STRIPE_WEBHOOK_SECRET=" functions/.env.local; grep -c "^STRIPE_MODE=test" functions/.env; git check-ignore -q functions/.env.local && echo ignored; git check-ignore -q functions/.env && echo ignored`
Expected: `0`, `1`, `1`, `ignored`, `ignored`.
Run: `git status --porcelain functions/`
Expected: only `functions/env.template` and (from Task 1) `functions/config/` listed - never `.env` or `.env.local`.

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
- Consumes: interfaces 2 (every shape and its "absent ==").
- Produces: anchors `#logininvitesemaillower-contract-v301-sprint-20` and `#calendlyeventsid-contract-v301-sprint-20` that Task 9 links.

- [ ] **Step 1: Id conventions - three rows**

After the `stripeEvents` row (`:34`) add:

```
| `loginInvites` | the child's login email, lower-cased | **Contract v3.0.1 (Sprint 20).** One open invite per address by construction; `claimInvite` looks the caller's `token.email.lower()` up by id, no query. Contrast `staffInvites` (auto id, script-consumed). Seed: `reese.whitfield@example.com`. |
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
| `billing` | map \| absent | **Sprint 20 - server-written only (`createFamily`, `stripeWebhook`), never in a client `hasOnly`.** `{ status: 'pending' \| 'active' \| 'past_due' \| 'lapsed', customerId, subscriptionId, priceId, checkoutSessionId, updatedAt }` (ids null until `checkout.session.completed`). **ABSENT == `active`** - every athlete provisioned before Sprint 20 books unchanged. `pending` is the booking gate (rules `athleteBillingOk`, client `billing-pending`). Seed: `pending` on nico only. |
| `facilityBilling` | map \| absent | Sprint 20, webhook only. `{ status: 'active' \| 'past_due' \| 'lapsed', subscriptionId, priceId, updatedAt }` - the $300 add-on subscription; absent == no add-on. Paid -> `facilityAccess: true`; lapse/delete -> false. `facilityAccessConsent` stays ops-verified. |
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

Backs "own login?" at sign-up and the claim on first sign-in (SPRINT-20-LAUNCH.md 2.2, 3.2). Writers: `createFamily` / `addAthletes` (open), `claimInvite` (claimed, or `orphaned` when the athlete no longer exists). **No client create or update**; read by the email owner only when `request.auth.token.email_verified == true`, by the household's parent, or ops/owner.

| Field | Type | Notes |
|---|---|---|
| `email` | string | Lower-cased; equals the doc id and `athletes.loginEmail`. |
| `householdId`, `athleteId`, `athleteName` | string | Denormalized so the claim writes the `users` doc without a second read. |
| `requestedBy` | `'guardian'` | |
| `createdBy` | uid | The parent. |
| `createdAt` | timestamp | An open invite older than 7 days shows as `invited-stale` in the sign-ups report. |
| `status` | `'open' \| 'claimed' \| 'orphaned'` | |
| `claimedBy`, `claimedAt` | uid \| null, timestamp \| null | Set together on claim. |

### `calendlyEvents/{inviteeUuid}_{event}` (contract v3.0.1, Sprint 20)

`calendlyWebhook`'s idempotency ledger (6.2), written in the same transaction as its effect; a repeat is `duplicate`. Admin-only (`ops`/`owner` read); the report lists `outcome == 'unresolved'` rows.

| Field | Type | Notes |
|---|---|---|
| `event` | `'invitee.created' \| 'invitee.canceled'` | |
| `inviteeUri`, `eventUri` | string | Calendly resource uris. |
| `athleteId`, `householdId` | string \| null | Null when `unresolved`. |
| `receivedAt` | timestamp | |
| `outcome` | string | `applied \| duplicate \| unresolved \| already-cancelled \| rescheduled \| not-found`. |
```

- [ ] **Step 9: `stripeEvents`** - in the section (`:1421-1445`) append a paragraph: `**Sprint 20:** outcomes gain `unexpected-quantity` (a checkout session with more than one recurring line or quantity != 1: recorded, nothing written), `stripe-lookup-failed` (the resolution fallback's Stripe read threw: recorded, HTTP 200, surfaced by `export-memberships.mjs`), `applied-checkout`, `issued-prepaid`. `HANDLED` gains `checkout.session.completed`; `client_reference_id` is `${householdId}__${athleteId}__${product}` (double underscore; athlete ids never contain `_`).`

- [ ] **Step 10: Verify and commit**

Run: `grep -c "Sprint 20" docs/portal/DATA-MODEL.md`
Expected: >= 18. Run: `grep -n "windowDays.*32" docs/portal/DATA-MODEL.md` - Expected: only line 1267 remains (Task 9 fixes it).

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
- **contract v3.0.1 (Sprint 20):** `whitfield` carries `signup`/`createdBy`/`stripeCustomerIds: []`/`emergencyContact: null`/`guardian.relationship` (the self-signed-up family; `parker` stays legacy); athletes carry `handicap` and `loginEmail`; `athletes/nico.billing.status: 'pending'` (jordan/reese absent == active); one open `loginInvites/reese.whitfield@example.com`; packages write `stripePriceId: null` explicitly (never an id - `write-packages.mjs` is the only writer); specialist slots carry `durationMinutes` (phil 45, mental 30) with Yannick at 4:00 / 4:30 / 5:00 PM; and one Calendly trio - `sessions/cal-seedevt0001` (`bookable: false`, `source: 'calendly'`), `bookings/reese_cal-seedevt0001` (`source: 'calendly'`, `flag: null`, `createdBy: 'system'`) and `calendlyEvents/seedinv0001_invitee.created` (`applied`). `npm run packages:emulator -- --mode test --yes` then stamps the sample ids from the catalogue once the owner pastes them (the committed catalogue is all null and the script refuses to write until it is not).
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
- Consumes: spec 0.11-0.13, 14; interfaces preamble.
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

Accepted gaps (spec 14 - say so if any is wrong):

- A stranger with an unverified password account can create a household;
  they cannot pay, claim or read invites unverified; ops deletes them from
  the report's *unpaid* view.
- One failing card freezes the whole household (`membership` stays
  household-level); per-athlete `billing` only gates who may book.
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
- DB lane: the committed `functions/config/stripe-catalogue.json` is all
  null until the owner pastes price ids; `write-packages.mjs` refuses to
  write (and `createCheckoutSession` answers `price-missing`) until then.
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

Run: `grep -c "Sprint 20" docs/portal/DECISION-GAPS.md docs/portal/TEAM.md`
Expected: `DECISION-GAPS.md:1` or more, `TEAM.md:1` or more. Run `node --test scripts/test/` once more - Expected: 9 pass.

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
