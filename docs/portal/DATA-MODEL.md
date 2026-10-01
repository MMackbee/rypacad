# Portal data model — Firestore

Concrete field-level spec for data contract v1 (pinned in `docs/portal/TEAM.md`
— this document extends it and must never contradict it). Firebase project is
`rypacad` (work account); agents only ever run against the **emulator**
(`npm run emulator`), never production. Access policy lives in
`firestore.rules` (data-routing lane); this document defines the shapes those
policies protect.

Seeding: `scripts/seed-firestore.mjs` (see [Seeding & emulator workflow](#seeding--emulator-workflow)).
Composite indexes: `firestore.indexes.json` at the repo root, referenced from
`firebase.json` — each index is documented [below](#indexes) with the query it
serves.

## Id conventions

| Collection | Doc id | Why |
|---|---|---|
| `users` | Firebase Auth uid | Rules resolve the caller via `users/{request.auth.uid}`. Seed uses readable slugs (`parent-dana`) since the emulator mints no uids. |
| `households` | slug / auto-id | Referenced by `users.householdId`, `athletes.householdId`, `bookings.householdId`. |
| `athletes` | slug / auto-id | Referenced by `users.athleteId`, `bookings.athleteId`, `contractLogs.athleteId`. |
| `packages` | catalogue id (`t-6`, `t-12`, `t-16`, `elite`, `single`; `t-20` retired v2.0.1) | **Contract v2.0 (Sprint 12 pin A), supersedes the v1 catalogue ids (`g-8-3`, `f-4`, `drop-in`, `elite-247`, now retired).** Matches `frontend/src/portal/data/packages.js`'s `ALL_PACKAGES` exactly, so the client and the database name the same package the same way. |
| `sessions` | the generator's `YYYY-MM-DD-<block>` (`2026-11-02-0`; extras `2026-11-27-x0`); specialist 1-on-1s `YYYY-MM-DD-s<n>` (`2026-09-15-s0` — **contract v1.7, Sprint 9**) | Regular/extras ids come from `generateSeason()`. The `-s<n>` slots are the one exception: `scripts/seed-firestore.mjs` hand-adds them for the emulator (the generator never invents Phil/Yannick slots — see [below](#specialist-1-on-1-sessions-phil-and-mental-contract-v17-sprint-9)); production sources them from the calendar sync exactly like training/tournament. Date-prefixed ids make `orderBy(date, __name__)` a stable chronological cursor for every session type alike. |
| `bookings` | `{athleteId}_{sessionId}` | Deterministic id = one booking per athlete per session, enforced by the keyspace itself. Re-booking after a cancellation updates the same doc's `status` instead of creating a duplicate. |
| `contractLogs` | `{athleteId}_{date}` | Pinned by contract v1: one log per athlete per day, duplicate-proof by construction. |
| `tournamentResults` | `{sessionId}_{athleteId}` | **Contract v1.5, id scheme unchanged by v1.6.** One result per athlete per tournament, enforced by the keyspace itself — the same pattern as `bookings` and `contractLogs`. Corrections overwrite via update; there is no delete in v1. |
| `enrollmentRequests` | the guardian's Firebase Auth uid | **Contract v1.8, Sprint 10.** Same rationale as `users`: the caller-identity check in rules (`request.auth.uid == uid`) is a plain equality against the doc id, no `get()` needed. Seed uses a readable slug (`parent-new`) like every other uid-keyed doc in the emulator. |
| `athletes/{athleteId}/diagnostics` | auto id | **Contract v1.8, Sprint 10.** A capture history, not a keyspace-enforced singleton — an athlete gets many captures over time, so there is no natural deterministic key the way `bookings`/`contractLogs`/`tournamentResults` have one. Seed uses readable slugs (`published-1`, `draft-1`) in the same "readable over random, the emulator mints no real auto-ids anyway" spirit as the `users` row above. |
| `staffInvites` | auto id | **Contract v1.8, Sprint 10.** Not a keyspace-enforced collection either — many invites can exist over time, including two for the same email (a re-invite after one lapses). Seed uses a readable slug (`invite-1`). |
| `tokenPeriods` | `{athleteId}_{periodKey}` | **Contract v2.1, Part 2 (Sprint 13) — BUILT.** One issuance doc per athlete per period, keyspace-enforced like `bookings`/`contractLogs`. Seed uses one real doc (`tokenPeriods/jordan_<currentPeriodKey>`); see [below](#tokenperiods-contract-v21-part-2). |
| `graceTokens` | auto id | **Contract v2.1, Part 2 — BUILT.** Many grace tokens can exist over an athlete's history (one per minting event), no natural deterministic key. Seed uses a readable slug (`grace-1`), the same "emulator mints no real auto-ids" convention as `staffInvites`/diagnostics ids above; the sweep script (`scripts/sweep-waitlist.mjs`) mints its own with a `sweep-<sessionId>-<athleteId>-<n>` slug for the same reason. See [below](#gracetokens-contract-v21-part-2). |
| `waitlist` | `{sessionId}_{athleteId}` | **Contract v2.1, Part 2 — BUILT.** One waitlist entry per athlete per session, the same keyspace shape as `bookings`. Seed uses one real doc, on the ONE seed-only capacity-2 session (see [below](#waitlist-contract-v21-part-2)). |
| `stripeEvents` | the Stripe `event.id` | **Contract v2.1, Part 2 — BUILT.** Idempotency ledger for the webhook handler — the id IS the dedupe key, the same rationale as every other keyspace-enforced collection in this table. Seed uses one fake event id (`evt_seed_2`) matching the format a real Stripe event id would take, never a real one. See [below](#stripeevents-contract-v21-part-2). |
| `loginInvites` | the child's login email, lower-cased | **Contract v3.0.1 (Sprint 20).** One open invite per address by construction; `claimInvite` looks the caller's `token.email.lower()` up by id, no query. `status` is `open` / `claimed` / `orphaned` (the athlete doc is gone). Contrast `staffInvites` (auto id, script-consumed). Seed: `reese.whitfield@example.com`. |
| `calendlyEvents` | `{inviteeUuid}_{event}` | **Contract v3.0.1 (Sprint 20).** `calendlyWebhook`'s idempotency ledger, the `stripeEvents` pattern with a composed id (Calendly has no event id; the invitee uri's uuid + `invitee.created \| invitee.canceled` is unique per delivery). Seed: `seedinv0001_invitee.created`. |
| `sessions` (Calendly) | `cal-<eventUuid>` | **Contract v3.0.1 (Sprint 20).** Written only by `calendlyWebhook`; never date-prefixed (the id is Calendly's event uuid, so a reschedule that moves the date keeps the doc), never carries tournament results, and invisible to the sync's reap (`gcalEventId: null`, so `planSync` files it under `seededUntouched`). |

## Collections

### `users/{uid}`

The role document rules key off. One per authenticated account.

**Contract v3.0.1 (Sprint 20):** `role: 'athlete'` docs are also created by `claimInvite` (`{ role: 'athlete', athleteId, householdId, staff: false, specialistId: null, displayName: athleteName, email }`) and `role: 'parent'` docs by `createFamily`; the client create clause stays denied.

| Field | Type | Notes |
|---|---|---|
| `role` | string | `athlete \| parent \| coach \| mental \| ops \| owner` |
| `athleteId` | string \| null | Set when `role == 'athlete'` — the athlete doc this account is. |
| `householdId` | string \| null | Set when `role == 'parent'` — the household this guardian belongs to. |
| `staff` | boolean | True for `coach`, `mental`, `ops`, `owner`. MFA is required for staff at setup (enforced at the auth layer, not stored here). |
| `specialistId` | string \| null | `'phil' \| 'mental' \| null`. **Contract v1.7.1 (Sprint 9 integration)** — links a staff account to the specialist whose sessions it runs (`== sessions.type`); written by provisioning. Rules key `/portal/my-sessions` access and specialist-own-session attendance updates off it (`me().get('specialistId', null)`, null-safe). Documented here now as a pre-existing gap in this table (implemented and seeded since Sprint 9, never added to this row until this v1.8 pass — flagged in the Sprint 10 report, not a new field). |
| `displayName` | string \| null | |
| `email` | string \| null | |
| `notificationPrefs` | map \| null | **Contract v1.8 (Sprint 10 pin G).** `{ <categoryId>: { email: boolean, sms: boolean } }`, one entry per category the NotificationPreferences screen renders (`NOTIFICATION_CATEGORIES` in `frontend/src/portal/data/parent.js` — `billing`, `schedule`, `progress` — the `newsletter` category was scrapped with the composer, Sprint 16; `billing` is UI-locked always-on but still gets a stored entry, since the map records a preference per category the screen renders, not per toggle a parent can actually flip). `null` until a user has saved once. **The one self-write the `users` collection allows:** rules permit a user to update ONLY this field on their own doc (`diff.hasOnly(['notificationPrefs'])`) — it cannot touch `role`/`householdId`/`athleteId`/`specialistId`, so a self-write can never be a privilege escalation. **Provisioning never touches it (fix applied 2026-09-15):** `provision-family.mjs` never sets this key, and its `users` write is `updateMask`-scoped to exactly the seven provisioning-owned fields above (`USER_UPDATE_MASK`, defined right after `userDoc()` — the same enforcement as the athletes write's `ATHLETE_UPDATE_MASK`, contract v1.9), so a re-run — which re-writes EVERY already-resolved FAMILIES/STAFF account's `users` doc, not only newly resolved ones — leaves a saved map exactly as the user left it. Before that mask, the write was an unmasked REST `update`, i.e. a full-document replace (verified against the emulator: an unmasked re-run drops the field, a masked re-run keeps it, and a masked write still creates a not-yet-existing doc), so every production re-run between v1.8 going live and the fix silently reset any saved map to **absent** — the same stored state as never having saved. A user who saved before then and finds the screen back at its defaults hit exactly this; saving once more restores it, and no other field on the doc was affected. **Contract v2.2 (Sprint 14):** the sending functions read this map to decide each channel per notice (`functions/portal/notify.js` mirrors the same defaults — change one, change both); `billing` email always sends. |
| `phone` | string \| null | **2026-09-16 (owner feedback).** The member's own mobile number for text notices, set from Settings → Profile; trimmed, ≤ 32 characters, empty clears to null. The second and last member self-write on `users` (rules: `diff.hasOnly(['notificationPrefs', 'phone'])`). Never written by provisioning (`USER_UPDATE_MASK` excludes it). Contact information only since Sprint 15 (SMS retired): no notice is texted. |
| `pushTokens` | array<string> \| null | **Contract v2.3 (Sprint 15).** This member's registered devices for web push: Firebase Cloud Messaging registration tokens, one per browser that granted notification permission on Settings → Push notifications (`hooks/push.js`, `arrayUnion` / `arrayRemove`). The third and last member self-write on `users` (rules: `diff.hasOnly(['notificationPrefs', 'phone', 'pushTokens'])`, a list of at most 10). The sending functions (`functions/portal/push.js`) send to every token and prune the ones FCM reports dead. Never written by provisioning. |

### `households/{householdId}`

Guardian + billing linkage. **Never card data** — Stripe ids only.

| Field | Type | Notes |
|---|---|---|
| `name` | string | e.g. "Whitfield family" |
| `guardian` | map | `{ name, email, phone }` — guardian contact. |
| `stripeCustomerId` | string \| null | Id only. Card data never touches Firestore. **Contract v2.1 (Sprint 13 pin H):** ops/owner-settable through the household settings branch (routing lane's rules, `hasOnly` grows by this and `stripeSubscriptionId`) — the Stripe handler resolves an event to a household with `where stripeCustomerId == event.data.object.customer`, so this id has to reach Firestore from somewhere other than the webhook itself. Seed writes a fake `'cus_seed_parker'` on `parker`, null on `whitfield` (the other demo household has no fabricated Stripe story). |
| `stripeSubscriptionId` | string \| null | Id only. **Contract v2.1:** ops/owner-settable alongside `stripeCustomerId` above. Not seeded on either demo household (the export script's `export-memberships.mjs` treats an absent value as `'not-linked'`, distinct from a live Stripe lookup that fails). |
| `periodAnchorDay` | number \| absent | **Contract v2.0 (Sprint 12 pin B).** Int `1..28`, ops/owner-settable (Membership editor, routing lane). **Absent == 1** — every household provisioned before this sprint is validly anchored on the 1st without a migration. `periodFor(dateISO, anchorDay)` (`frontend/src/portal/data/packages.js`) turns this into the `{ periodKey, periodEnd }` pair every booking's `periodKey` and every token derivation reads against — see [bookings](#bookingsbookingid) below. The provisioner (`provision-family.mjs`) deliberately never writes this field (ops sets it in the app, per the pin); the seed writes it explicitly (1 for Whitfield, 15 for the second demo household) rather than leaving it absent, so a raw Firestore/REST read of the emulator shows the fact instead of relying on the absent-means-1 rule being invisible. **Contract v2.1:** the Stripe handler's `invoice.paid` action also SETS this, to the invoice period start's day-of-month (clamped `1..28`) — so the app's derived periods stay aligned to Stripe once a real subscription exists, not just to whatever ops typed into the editor. |
| `membership` | map \| absent | **Contract v2.1, Part 2 (Sprint 13) — BUILT.** `{ status: 'active' \| 'past_due' \| 'lapsed', stripeSubscriptionStatus, currentPeriodStart, currentPeriodEnd, lastEventId, updatedAt, attemptCount: int \| null, nextPaymentAttempt: 'YYYY-MM-DD' \| null, lastFailedAt: 'YYYY-MM-DD' \| null }` — the last three are **contract v2.4 (Sprint 16)**: the retry position the Billing hub draws, written on `invoice.payment_failed` from Stripe's own `attempt_count` / `next_payment_attempt` and the event's `created`, cleared to null on `invoice.paid`. **Absent == `'active'`** (the same absent-as-default pattern `periodAnchorDay` and the pre-v2.0 `fitnessPackageId` both used) — every household stays bookable until the Stripe webhook handler (functions lane, admin SDK only; no member or staff client write clause) writes otherwise. Rules gate on it too: booking create AND waitlist create each do one `get()` of the caller's household and deny when `status` is `'past_due'`/`'lapsed'` (null-safe) — the freeze, enforced server-side, not a client courtesy. Seed: **absent on `whitfield`** (stays active, zero migration) and `{ status: 'past_due', stripeSubscriptionStatus: 'past_due', currentPeriodStart, currentPeriodEnd, lastEventId: 'evt_seed_2', updatedAt }` on `parker` — `currentPeriodStart`/`currentPeriodEnd` are `periodFor(today, 15)`'s own output at seed-run time (never hand-typed; e.g. `2026-09-15`..`2026-10-14` when seeded on 2026-09-16, the anchor-15 period containing that run's "today"), so a re-run on a different day writes a different, still-correct pair. `lastEventId` points at the seeded `stripeEvents/evt_seed_2` doc below, so the two facts cross-reference exactly as a real webhook write would leave them. |
| `signup` | map \| absent | **Contract v3.0.1 (Sprint 20).** `{ at: Timestamp, by: uid, source: 'self', mode: 'parent' \| 'athlete' }`, written by `createFamily`. **Absent == legacy** (provisioned/approved household); `useSignups` orders by `signup.at` and excludes legacy households. Seed: on `whitfield`, absent on `parker`. |
| `createdBy` | uid \| absent | Sprint 20, `createFamily`. Absent == legacy. |
| `stripeCustomerIds` | string[] | Sprint 20. `createFamily` writes `[]`; the webhook `arrayUnion`s every customer it sees (a second child's checkout may land on a new customer). **Absent == `[]`.** `stripeCustomerId` keeps its meaning (first/primary). |
| `emergencyContact` | string \| null | Sprint 20, from the sign-up form (was `enrollmentRequests.guardianNotes.emergencyContact`). Absent == null. |
| `guardian.relationship` | string \| null | Sprint 20, parent mode only. Absent == null. |

### `athletes/{athleteId}`

The athlete's profile. Everything a coach's roster or a parent's home card
needs — and nothing medical (see the subcollection below).

| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `dob` | string \| null | `YYYY-MM-DD`, or null when unknown. **Contract v1.6 (Sprint 8):** `tournamentResults.bracket` snapshots this field at write time (see [below](#tournamentresultssessionid_athleteid-contract-v16-sprint-8)) — no dob means every result for that athlete lands in the display-only 'Open' bracket until one is set. `seed-firestore.mjs` sets the Whitfield demo athletes' dobs to the OWNER-SUPPLIED values (TEAM.md Sprint 8 amendment v1.6.1, 2026-09-10), landing the three kids across three different brackets; `seed.js`'s ageLine copy was trued up to match. `provision-family.mjs`'s real test families (MackBee, Eisele) stay null — a real kid's birthday is never invented; the owner supplies it later and provisioning writes it through unchanged via an optional `dob` per athlete entry. |
| `householdId` | string | Parent link; rules grant guardians access through it. |
| `packageId` | string | Into `packages/` — one pointer into the ONE token catalogue (`kind == 'tokens' \| 'elite' \| 'single'`). **Contract v2.0 (Sprint 12 pin A) supersedes v1.9 here: `fitnessPackageId` is REMOVED (see below) — this is the athlete's ONLY package pointer now**, deciding the one fungible token pool (`tokensFor()` in `frontend/src/portal/data/packages.js`) instead of two separate golf/fitness entitlements. |
| `facilityAccess` | boolean \| absent | **Contract v2.0.1 (Sprint 18).** The $300/month 24/7 facility-access ADD-ON (absent == false) — a line item, never a session entitlement; Elite includes it (`packages/elite.access247`). ops/owner set it in the Membership editor through the package-assignment rules branch (`hasOnly(['packageId', 'facilityAccess', 'updatedAt'])`), and the rules refuse `true` unless `facilityAccessConsent` is already on the doc. Seed: `true` on jordan only. |
| `facilityAccessConsent` | map \| null | **Contract v2.0.1 (Sprint 18).** `{ signedAt, byUid }` — the signed facility-access waiver (and, for an athlete under 18, guardian permission), copied from the enrollment request's `consents.facilityAccess` at approval (`approveEnrollmentRequest`), null otherwise. Never member-writable. |
| ~~`fitnessPackageId`~~ | — | **REMOVED, contract v2.0 (Sprint 12 pin A).** There is one package pointer now (`packageId` above) — the two-stored-facts design (v1.9 pin A) is gone along with the two-pool model it served. `provision-family.mjs` never wrote this field even under v1.9 (see that script's own header), so removing it is a rules/schema change only, not a prod backfill: no live document needs migrating, and any pre-v2.0 doc that does still carry the key is simply ignored (nothing reads it anymore). |
| `updatedAt` | timestamp \| absent | **Contract v1.9 (Sprint 11 pin B), narrowed by v2.0 (Sprint 12 pin A).** Written ONLY by the ops/owner package-assignment branch: `after.diff(resource.data).affectedKeys().hasOnly(['packageId', 'updatedAt'])` — the mask narrows from `['packageId', 'fitnessPackageId', 'updatedAt']` now that there is one field to assign, not two. Caller `ops \| owner`, a field-limited update alongside `contractMinutes`' own single-field branch in this table. Backs `setAthletePackages(athleteId, { packageId })` → `useAssignPackages()` (routing lane); one `bump('athletes')` per write. Assignment is IMMEDIATE and un-prorated — token position is derived, so headroom changes for the *next* booking only; nothing already booked is touched. Absent on every seeded/provisioned athlete until the first reassignment through this branch. |
| `contractMinutes` | number \| null | `20 \| 45 \| 90 \| null` — Commitment Contract tier (**90 since the owner's ruling of 2026-09-22**; 95 was the original handoff's value and the rules still ACCEPT it, so an athlete who already holds it is not broken — nothing offers it any more). **Contract v1.8 (Sprint 10 pin B): client-settable.** Rules allow an update of ONLY this field (`diff.hasOnly(['contractMinutes'])`) by two callers: the athlete's own `users` account, or the household's parent — the same three-way linkage reasoning as a booking create (own athlete, or own household's athlete via `get()`), not open to any signed-in user. This is what lets `useContract().setTier(minutes)` back the NoContract tier picker's CTA (athlete) and AthleteDetail's "Start a contract" card (parent) instead of both being dead ends. `nico` stays seeded `null` on purpose (below) so this intake path always has a real no-tier athlete to exercise. |
| `coachId` | string \| null | uid of a `users` doc with `role == 'coach'`. Coach access filters on this assignment, never on role alone. |
| `handicap` | int 0..54 \| null | **Contract v3.0.1 (Sprint 20).** Current handicap from sign-up ("none yet" == null). Rules admit it on create only in range; ops edits later. Absent == null. Seed: jordan 14, reese 27, nico null. |
| `loginEmail` | string \| null | Sprint 20. The child's own login address, lower-cased by client AND function; null == the parent's account runs the child. Pairs with `loginInvites/{loginEmail}`. Absent == null. |
| `billing` | map \| absent | **Sprint 20 - server-written only (`createFamily`, `stripeWebhook`), never in a client `hasOnly`.** `{ status: 'pending' \| 'active' \| 'past_due' \| 'lapsed', customerId, subscriptionId, priceId, checkoutSessionId, lastEventId, updatedAt }` (ids null until `checkout.session.completed`; `lastEventId` is the Stripe `event.id` of the last webhook write, the same cross-reference `households.membership.lastEventId` keeps - PM ruling D8; `createFamily`'s `pending` map does not carry it, the webhook adds it on the first write, so absent == no webhook write yet). **ABSENT == `active`** - every athlete provisioned before Sprint 20 books unchanged. `pending` is the booking gate (rules `athleteBillingOk`, client `billing-pending`). Seed: `pending` on nico only, exactly as `createFamily` writes it (no `lastEventId`). |
| `facilityBilling` | map \| absent | Sprint 20, webhook only. `{ status: 'active' \| 'past_due' \| 'lapsed', customerId, subscriptionId, priceId, checkoutSessionId, lastEventId, updatedAt }` - the same shape as `billing` minus `pending` (PM ruling D8; the webhook's `billingPatch` writes both maps through one helper) - the $300 add-on subscription; absent == no add-on. Paid -> `facilityAccess: true`; lapse/delete -> `facilityAccess: false`. **Scope of a facility lapse (PM ruling D10):** `customer.subscription.deleted` / `invoice.payment_failed` resolved to `product: 'facility'` write `facilityBilling.status` and `facilityAccess: false` ONLY - never `households.membership`, never `billing`, never a booking revocation. The household-freeze in spec 4.3 ("AND to household membership exactly as today") applies to the TIER subscription only. `facilityAccessConsent` stays ops-verified. |

### `athletes/{athleteId}/private/medical`

Medical and emergency info lives in its **own subcollection document, apart
from the profile, precisely so `firestore.rules` can scope it to live-session
staff only** — a coach pulling a roster or a parent reading a dashboard never
transports medical fields, and the minors' data-minimization rule in the
Blueprint holds structurally instead of by field-filtering discipline.

| Field | Type | Notes |
|---|---|---|
| `emergencyContact` | map | `{ name, phone, relationship }` |
| `medicalNotes` | string \| null | Allergies, conditions, instructions. |
| `updatedAt` | timestamp | |

The seed script never writes this document: inventing medical data for minors
would defeat the point of minimizing it.

### `packages/{packageId}` (contract v2.0, Sprint 12 pin A/L/M)

**Supersedes the v1 table below in full** — the two-pool catalogue
(`golf | drop-in | fitness | elite` kinds, separate `training`/`tournaments`/
`sessions` counters, `philSessions`/`yannickSessions`/`facility247` on Elite)
is retired, not merely amended: `g-4-2`, `g-8-3`, `g-12-4`, `g-16-4`, `f-4`,
`f-8`, `f-12`, `f-16`, `drop-in`, `elite-247` are all gone from the live
catalogue (`provision-family.mjs` **deletes** these ten ids from production
on its next user-approved run). ONE catalogue now, mirrored from
`frontend/src/portal/data/packages.js`'s `ALL_PACKAGES` (the seam both other
lanes build against). A package grants **one fungible token pool** — a token
is spent by any non-cancelled booking of any session type; `sessions.type`
is display/roster/Tour only and never decides charging (design keystone,
TEAM.md Sprint 12 pin).

| Field | Type | Notes |
|---|---|---|
| `name` | string | "6 tokens", "Elite", "Single token"… |
| `kind` | string | `tokens \| elite \| single` — catalogue grouping. `tokens` covers the four `t-6`/`t-12`/`t-16`/`t-20` packages; `elite` and `single` are each their own one-package kind. |
| `tokens` | number \| null | Tokens granted per billing period. **`null` means unlimited — Elite only** (`packages/elite`). No package at all (an athlete with no `packageId`) means zero tokens, never unlimited — `tokensFor()`'s own explicit rule. |
| `price` | number | Per-period price. **In the schema per contract v1 but never written by the seed script** (no dollar amounts in seed data, policy — unchanged). `provision-family.mjs` DOES write it (production is the one place a real price reaches Firestore, the v1.1 rule). |
| `pending` | boolean | **New, contract v2.0.** `true` on every package whose price the owner hasn't confirmed yet (all four token packages, plus `single`; `elite`'s `$1,000` is the owner's own stated figure, not pending). The UI may render "pending" beside a pending price. **Stripped from every seeded doc** (seed-firestore.mjs) alongside `price` — a seed with no real prices has no business asserting they're settled either — but kept on the production write (provisioner), same reasoning as `price` itself. |
| `windowDays` | number | Rolling booking-window length (contract v2.0 pin D): `30` for every token package and `single` (**Sprint 20 ruling 0.5; was 32**), `45` for `elite`. Replaces the old flat `SPECIALIST_BOOKING_WINDOW_DAYS` — every session type now uses the athlete's OWN package window, not a specialist-specific one. See [Periods, tokens and booking windows](#periods-tokens-and-booking-windows-contract-v20-sprint-12-part-1) below. **Sprint 20:** also written by `write-packages.mjs` (30 / 45) so production docs match the seam without a full `provision-family.mjs` catalogue run. |
| `access247` | boolean | **Elite only** (absent on every other package — Elite is the only package with this key at all, not merely the only one where it is `true`). The 24/7 facility-access differentiator (pin L). 24/7 paperwork (waiver, age rule, door credentials, insurance) is outside the app. |
| `stripePriceId` | string \| null | **New, contract v2.1 (Sprint 13 pin H).** Maps a Stripe Price to this package, so `customer.subscription.updated` (a package change) can resolve the new price to a `packageId`. **Sprint 20: populated.** Written ONLY by `scripts/write-packages.mjs --prod --mode test|live` from `functions/config/stripe-catalogue.json` (the one source, both modes; `facility-access` has no packages doc). `data/packages.js` never carries it and the seed writes `null` explicitly. Absent == null. |

### `sessions/{sessionId}`

One doc per schedulable block. Two sanctioned writers, never a hand: seeded
from `buildSeason()` in `frontend/src/portal/data/season.js`, and synced from
the Google Calendar by `scripts/sync-calendar-sessions.mjs`
([below](#calendar--sessions-sync)) — the calendar is the session source of
truth per the Sprint 4 pins in TEAM.md. Doc id is `YYYY-MM-DD-<n>` in both
cases.

| Field | Type | Notes |
|---|---|---|
| `date` | string | `YYYY-MM-DD` (matches the id prefix). |
| `time` | string | Block start, e.g. "3:00 PM". |
| `durationMinutes` | number | How long the session runs. **Absent means 60** (`DEFAULT_DURATION_MINUTES`, `data/schedule.js`), so every session doc written before this field is still measured correctly. Added for the owner's 2026-09-22 ruling that Saturday's 10–12 tournament and 12–2 training are single two-hour events; weekday blocks stay 60. The calendar sync derives it from the event's own end time (`SYNCED_FIELDS`), falling back to 60 when the end is missing, backwards or longer than 12 hours. **Never a charge:** length has no bearing on what a session costs — one token, whatever the clock says. Read wherever the app needs to know when a session *ends*: the "Add to calendar" invite, the coach's now/closed state, the attendance header's "Now"/"Ended", and the duration a family sees on Reservations. **Sprint 20:** the sync's end-time regex is fixed, so synced docs now carry the real value (Phil 45); `cal-` docs carry `round((end - start) / 60000)` (30). |
| `type` | string | `training \| tournament \| phil \| mental` (plus seed-only `adult`, below) — display, roster and Tour standings only as of **contract v2.0 (Sprint 12 pin K)**: charging never branches on it (one fungible token pool — see [Periods, tokens and booking windows](#periods-tokens-and-booking-windows-contract-v20-sprint-12-part-1)). `phil`/`mental` are contract v1.7 (Sprint 9) — see [Specialist 1-on-1 sessions](#specialist-1-on-1-sessions-phil-and-mental-contract-v17-sprint-9) below. `adult` is **contract v2.0 (Sprint 12 pin J)**: the Saturday 2-4 PM college / Elite Am / Mid Am block, `bookable: false`, **seed-only** — the generator's Saturday output includes one so the emulator shows the real Saturday, but `sync-calendar-sessions.mjs` never produces this type at all (that block is titled on the real calendar so `classifyTitle` skips it as display-only, collected in person via Stripe, out of the app entirely). |
| `capacity` | number | **Owner ruling 2026-09-18 (amendment v2.0.2, revised): PER TYPE — training 14, tournament (RYP Tour) 25, `phil` 6, `mental` 1.** Set where sessions are made (`schedule.js` `CAPACITY_BY_TYPE` / `capacityForType`, the calendar sync's `CAPACITY` map) and read as a plain number everywhere else; a room fact, never a charge. Pre-launch, so it applies immediately. Superseded wording follows. Contract v2.0.2 (Sprint 18, owner 2026-09-17): 14 for training and tournament sessions (was 15); a session already above 14 keeps its bookings — `capacity` is a SYNCED field, so prod sessions take 14 on the next user-gated sync run.** Earlier: contract v2.0 (Sprint 12 pin J): flat 15, every generated session, every type — the earlier per-type `{ training, tournament }` capacity map in `schedule.js` is gone (both values were already 15, so this is a shape simplification, not a numeric change). `phil`/`mental` hand-seeded slots keep their own v1.7.1 values (6 for `phil` group sessions, 1 for `mental` 1-on-1s), unchanged by v2.0 — pin K only changes what a booking spends, not the room's shape. |
| `bookable` | boolean | **New, contract v2.0 (Sprint 12 pin J).** `true` on every regular generated session; `false` only on the seed-only Saturday `adult` display entry above. Not written by `sync-calendar-sessions.mjs` at all (production sessions have no opinion on this field in Part 1 — see the [sync note](#calendar--sessions-sync) below) and not written on the hand-seeded `phil`/`mental` specialist slots either (nothing currently reads this field outside the seed-only adult block, so there is no cross-lane inconsistency to reconcile yet — flagged for whoever wires the adult block's display treatment). |
| `booked` | number | Denormalized confirmed-booking count for capacity display. Must be updated in the same transaction as a booking create/cancel (data-routing lane). The roster truth is always the bookings query — this is a display counter, and a reconcile can rebuild it from bookings at any time. **Contract v1.4** (Sprint 6): the exact transaction that maintains this field is pinned in [Booking transaction, attendance, and parent linkage](#booking-transaction-attendance-and-parent-linkage-contract-v14-sprint-6) below. |
| `coachId` | string \| null | Assigned coach uid. |
| `label` | string \| null | Real event names only ("Holiday Tournament"); null for regular blocks. **Contract v2.0:** the seed-only Saturday `adult` entry carries `"College / Elite Am / Mid Am"`, the same wording pin J uses for the block. |
| `special` | boolean | True for explicitly-dated extras (holiday tournaments on closed days). |
| ~~`overflow`~~ | — | **DELETED, contract v2.0 (Sprint 12 pin J).** Friday overflow (the toggle and the field) is gone along with the two-pool "Friday is capacity surplus" framing — the locked weekly schedule (Mon/Wed 3-5, Tue/Thu 3-6, Fri 3-4, all 60-min blocks) has no overflow concept anymore. `hooks/index.js`'s `s.overflow` read and AdminDashboard's `showFridayNote` (both routing/frontend lane files, out of DB-lane scope) still reference this field as of this sprint's DB-lane pass — flagged for those lanes, not fixed here. |
| `status` | string | **Contract v1.2.** `scheduled \| cancelled`, default `scheduled`. The calendar sync sets `cancelled` — never deletes — when a synced session's calendar instance disappears but the session has bookings, so families are told rather than ghosted. |
| `gcalEventId` | string \| null | **Contract v1.2.** The calendar instance id a synced session came from; null for generator-seeded sessions. The sync matches sessions by this id, so a retitled or retimed event updates its session instead of duplicating it. |
| `coachNote` | string \| null | `<= 500` chars. **Contract v1.8 (Sprint 10 pin H).** Rules allow an update of ONLY this field (a second field-limited branch beside the `booked`-diff clause) by the assigned coach, any specialist, or mental/ops/owner. Backs `useSessionAttendance().setSessionNote(sessionId, note)` and the roster's "Add a session note" editor — the same inline-editor idiom the no-show reason already uses. Null on every seeded session except one past attended training block (see the [seeding workflow](#seeding--emulator-workflow) below). |
| `source` | string \| absent | **Sprint 20.** `'calendly'` on `cal-` docs written by `calendlyWebhook`; absent == `'portal'`/sync. |
| `calendlyEventUri` | string \| absent | Sprint 20, `cal-` docs only. |
| `bookable` (Calendly) | boolean | `false` on every `cal-` doc so `liveSpecialistDays` never offers a freed Calendly slot in-app; absent == true (`hooks/index.js:260`). |

### Specialist 1-on-1 sessions: phil and mental (contract v1.7, Sprint 9)

Owner's direction (TEAM.md "Sprint 9 pins"): sessions with Yannick (mental
game) and Phil (performance) become handleable through the app, in the
Life Time class-scheduling idiom. **Design keystone (as of Sprint 9):** a
specialist 1-on-1 IS a session with capacity 1 and its own pool. Nothing
else about the schema was new then — the existing booking transaction,
parent book-for-kid, My Schedule derivation, and attendance all apply to
`type: 'phil'`/`'mental'` sessions completely unchanged; only `capacity`
(always 1 for `mental`, 6 for `phil` per the v1.7.1 amendment below) and
`bookings.pool` (always `'specialist'`) differed from a training/tournament
block.

**Superseded by contract v2.0 (Sprint 12 pin K): the "own pool" half of that
keystone is gone.** A `phil` or `mental` booking spends an ordinary token
now, same as any other type — `pool` is retired everywhere, not just here
(see [`bookings`](#bookingsbookingid) below). What survives unchanged: the
capacity-1/capacity-6 session shape itself, the booking transaction, parent
book-for-kid, and `SPECIALIST_MONTHLY_CAP` as a **frequency** knob
independent of tokens (`{ phil: null, mental: 1 }` — pin K). The rest of
this section (production source, id convention, seed hand-add) is unchanged
by v2.0 and stays accurate below.

- **Production source stays the Google Calendar sync** (Sprint 4 pin,
  unchanged): `scripts/sync-calendar-sessions.mjs`'s `classifyTitle()` gains
  two branches, same case-insensitive-first-word convention as
  training/tournament — summary starts with `Phil` → `type: 'phil'`; summary
  starts with `Mental` or `Yannick` → `type: 'mental'`. Capacity is looked up
  per type (`CAPACITY = { training: 15, tournament: 15, phil: 1, mental: 1 }`
  in the script) and, because `capacity` is one of `SYNCED_FIELDS`, a re-sync
  corrects it on an *existing* session too, not only on create — see
  [Calendar → sessions sync](#calendar--sessions-sync) below for the updated
  title-convention table.
- **The emulator seed hand-adds slots** — `scripts/seed-firestore.mjs`'s
  `addSpecialistSessions()` — because there is no calendar to sync against in
  the emulator. Ids are `YYYY-MM-DD-s<n>` ([id-conventions table](#id-conventions)
  above): the same `-x<n>` "extras, not from `generateSeason()`'s weekly
  pattern" convention the holiday tournaments use, on a new letter (`s`, for
  "specialist") so the two extras families can never collide. Covers the
  `SPECIALIST_BOOKING_WINDOW_DAYS` days starting the day the script *runs*,
  computed off the runtime clock (never hardcoded, so a re-run always covers
  "the next two weeks" relative to whenever it actually runs) — Yannick works
  Tue/Thu, late afternoon; Phil works Mon/Wed/Fri; both run three 45-minute
  slots per working day. Every field this document defines for `sessions` is
  written: `status: 'scheduled'`, `booked: 0`, `gcalEventId: null`
  (hand-seeded, never a synced-from-calendar doc), `label: null`, `coachId:
  null`, `special: false`, `overflow: false` — only `capacity: 1` and `type`
  differ session-to-session. **Pre-existing gap, noted here rather than
  silently carried forward:** the *generator-derived* sessions this same
  script builds from `buildSeason()` do not currently write `status` or
  `gcalEventId` at all (checked against the running code, not assumed) —
  those two contract-v1.2 fields land only on hand-seeded sessions
  (specialist slots here, and the holiday-tournament extras already inside
  `buildSeason()`'s own output). Out of Sprint 9's scope to fix (it predates
  this pin and touches the shared generator-sessions loop, not the
  specialist addition) — flagged for the PM in the Sprint 9 report instead.
  See the [seeding workflow](#seeding--emulator-workflow) below for the
  sanity-output lines this produces.
- **`data/specialists.js`** (new file, **routing lane owns it**, like
  `tour.js`) is the single source for the specialist catalogue and its two
  tunable knobs — this document names them rather than restating their
  values, so a retune can't leave the docs stale:
  - `SPECIALISTS` — the `{ id, name, discipline, sessionNoun }` catalogue;
    `id` doubles as the session `type` and the catalogue's
    `philSessions`/`yannickSessions` stems.
  - `SPECIALIST_MONTHLY_CAP` — the monthly cap `createBooking`'s pool check
    enforces per specialist **type**, per athlete, per calendar month (phil
    and mental capped independently) — see the bookings cap note
    [below](#bookingsbookingid).
  - `SPECIALIST_BOOKING_WINDOW_DAYS` — the rolling booking-window length
    `useSpecialistSlots()` shows and the seed's `addSpecialistSessions()`
    mirrors (as a locally-named constant, not an import — this script does
    not bundle `data/specialists.js`, the same "don't assume a sibling lane's
    in-flight work has landed" call `seed-firestore.mjs` already makes for
    `tour.js`'s `BRACKETS`).

### Calendar → sessions sync

`scripts/sync-calendar-sessions.mjs` turns Google Calendar events into
bookable session docs — the calendar is the session source of truth
(Sprint 4 pin, TEAM.md), and this script is the **third sanctioned production
writer** (with `provision-owner.mjs` and the future billing integration).
Emulator always; production runs are user-gated commands.

```
npm run sync:emulator -- --from 2026-11-02 --to 2027-02-27   # sync a running emulator
node scripts/sync-calendar-sessions.mjs --from ... --to ... --dry-run     # plan only, no writes
node scripts/sync-calendar-sessions.mjs --from ... --to ... --dry-run \
  --fixture scripts/fixtures/gcal-sample-events.json                      # deterministic, no network
```

**Title convention** (pinned in TEAM.md — the mapper implements exactly this):

| Calendar event | Becomes |
|---|---|
| summary starts with `Training block`, timed (`start.dateTime`) | bookable session, `type: 'training'` |
| summary starts with `Tournament`, timed | bookable session, `type: 'tournament'` |
| summary starts with `Phil` or `Fitness`, or contains the word `Phil`, timed | bookable session, `type: 'phil'` — **contract v1.7 (Sprint 9)**; the `Fitness…` / `… w/ Phil` spellings are Phil's too (owner, 2026-09-29: the fitness sessions are Phil's) |
| summary starts with `Mental` or `Yannick`, timed | skipped — display-only since **contract v3.0.1 (Sprint 20)**: Yannick books through Calendly; `calendlyWebhook` writes `sessions/cal-<uuid>` (see [sessions](#sessionssessionid)). The first sync after the change deletes (booked 0) or cancels every previously synced `mental` session. |
| any other timed title | skipped — display-only; the dry run lists each such title with its dates (`display-only "<title>" xN (dates)`) so a missing session is traceable to its spelling |
| all-day event (`start.date` only) | skipped — display-only, whatever the title |
| any other summary | skipped — display-only (counted, e.g. legacy `Academy Training`) |

**`durationMinutes` (Sprint 20):** the end-time regex (`sync:317`) was `d{4}` without backslashes and never matched, so every synced session read 60 minutes; fixed - Phil's blocks now carry their real length (`scripts/test/sync-calendar-sessions.test.mjs`).

Mapped fields: id `YYYY-MM-DD-<n>` where n is the 0-based start-time order of
that day's **bookable** events; `time` formatted like the generator
(`'3:00 PM'`); `capacity` **per type** — its own local `CAPACITY = {
training: 15, tournament: 15, phil: 6, mental: 1 }` map, **unchanged by
contract v2.0** (TEAM.md's DB-lane bullet: "no capacity change... the sync's
map stays"), even though `frontend/src/portal/data/schedule.js`'s own
`CAPACITY` flattened from that same `{ training: 15, tournament: 15 }` shape
to a plain `15` this sprint (pin J) — this script's `CAPACITY` was already a
hand-replicated local copy with its own source-note comment, never an
import, so the two constants simply drifted apart in *shape* while staying
numerically identical; since `capacity` is one of the script's
`SYNCED_FIELDS` (see the masked-patch note just below) this corrects an
existing session's capacity on re-sync too, not just a new one's. `label`
null for the generic titles (`Training block`, `Tournament block`) and the
event summary verbatim otherwise — this applies unchanged to `phil`/`mental`
titles (a bare `"Phil"` or `"Yannick"` is not one of the generic phrases, so
it becomes the label verbatim; nothing in v1.7 special-cases specialist
titles here). `booked` 0, `coachId` null, `special` false, `overflow` false,
`status` `'scheduled'`, `gcalEventId` the instance id. **Contract v2.0:**
this script never emitted `pool` (verified against the running code — `pool`
never appears anywhere in its field-mapping) and needed no change for that
reason; it does not write `bookable` (Part 1 leaves that field seed-only —
see the `sessions` table's `bookable` row above). It **does still write
`overflow: false`** on every new session it creates (checked against the
running code, unchanged by this DB-lane pass per the explicit instruction to
leave this script's capacity/classification logic alone) — the same
**accepted-gap, harmless-legacy-field class as `pool`** on old `bookings`
docs: `overflow` is deleted from the *generator's* output and from the
`sessions` table's current-truth row above, but this production writer
keeps setting it to `false` on create. Nothing reads it, so it is inert, not
wrong — flagged here for the PM/routing lane as a follow-up cleanup, not
fixed in this pass (out of this DB-lane task's explicit scope for this
particular script). Times are read in `America/Chicago`, the calendar's
timezone.

**Upsert / cancel / delete semantics** (per run, over the `--from..--to` window):

- **New** event → session created.
- **Existing** session, matched by `gcalEventId` — falling back to doc id, but
  only onto docs with *no* `gcalEventId`, which is how the sync adopts
  generator-seeded sessions (and their bookings) without stealing a doc that
  belongs to a different instance → masked patch of
  `date/time/type/label/status/gcalEventId` only. **`booked`, coach
  assignments and all bookings are preserved.**
- Synced session whose calendar instance no longer exists → **deleted** if
  `booked === 0`, else `status: 'cancelled'`. A session with bookings is never
  deleted.
- Generator-seeded sessions (`gcalEventId` null) not adopted by id are left
  untouched — reaping those is not this script's call.
- An instance whose date/day-order changed maps to a new id: the old doc is
  deleted-and-recreated when empty, but patched in place (id kept, flagged as
  a CONFLICT in the run report) when it has bookings — preserving bookings
  outranks the id convention.

Same production guard as the seed script: writes require
`FIRESTORE_EMULATOR_HOST` pointing at a local host or the script exits;
`--dry-run` may read the real calendar but writes nothing. Calendar
credentials (`REACT_APP_GCAL_CALENDAR_ID` / `REACT_APP_GCAL_API_KEY`) are read
from `frontend/.env` at runtime, never hardcoded; the key is
referer-restricted, so the script sends `Referer: http://localhost:3000/`.

### `bookings/{bookingId}`

One doc per athlete-session reservation. Doc id `{athleteId}_{sessionId}`.

| Field | Type | Notes |
|---|---|---|
| `athleteId` | string | |
| `sessionId` | string | Into `sessions/` — the session carries time/type/label; the booking does not duplicate them beyond the query fields below. |
| `date` | string | `YYYY-MM-DD`, copied from the session so date-range queries need no join. |
| `type` | string | `training \| tournament \| phil \| mental` — the session's type at booking time. `phil`/`mental` are **contract v1.7 (Sprint 9)**. **Contract v2.0 (Sprint 12 pin K):** display/roster/Tour only — a `phil` or `mental` booking spends an ordinary token like any other type now. |
| ~~`pool`~~ | — | **RETIRED, contract v2.0 (Sprint 12 pin A).** Writers stop setting it; readers stop filtering on it. **Existing docs keep the field harmlessly** — this is a retirement, not a migration; nothing deletes it off old documents, and the rules' create-shape check drops `pool` from the required keys rather than forbidding it. `poolFor()` in `packages.js` (the function this field used to come from) is deleted below the seam's DEPRECATED banner. |
| `periodKey` | string | **New, contract v2.0 (Sprint 12 pin B).** `'YYYY-MM-DD'`, write-once at create — the period **start** the booking's **session date** falls in, per `periodFor(sessions.date, household.periodAnchorDay)`. **Charging rule: a booking is charged against the period its session date falls in, never the period it is made in** — a January-anchored family booking a February session in January still gets `periodKey` = February's start; there is no "provisional" status in Part 1 (Part 2's `tokenPeriods` doc is what would make that distinction real). Rules shape-check it is a `YYYY-MM-DD` string; correctness (that it actually matches `periodFor()`'s output) is client-derived, the same accepted-gap class the cap check itself already is. |
| `status` | string | `confirmed \| cancelled \| attended \| noshow`. **Contract v1.4** (Sprint 6): the `confirmed -> attended \| noshow` transitions are attendance, pinned below. **Contract v1.7** (Sprint 9) adds a **member-initiated** transition, `confirmed <-> cancelled` — see [Cancellation and re-booking](#cancellation-and-re-booking-contract-v17-sprint-9) below. **Contract v2.0:** cancellation is unchanged (pin G — the Aug 27 12-hour rule was never built and is formally withdrawn; "until the day before" stands). |
| `cancelledBy` | string \| null | **New, contract v2.1 (Sprint 13 pin G).** `uid \| 'system' \| 'calendly'`. **Sprint 20:** `'calendly'` from `invitee.canceled` (`cancelReason: 'member'`); `onBookingCancelled` skips it. A member's own cancel (the existing `confirmed -> cancelled` rules branch) writes the caller's own uid; the two admin-SDK-only system paths — staff "Cancel session" (pin E) and the Stripe handler's lapse/downgrade revoke (pin H) — write `'system'`. Absent on every pre-v2.1 cancelled booking (nothing backfills history). |
| `cancelReason` | string \| null | **New, contract v2.1 (Sprint 13 pin G).** `'member' \| 'session-cancelled' \| 'lapsed' \| 'downgrade'`. A member's own cancel writes `'member'` — the existing member-booking update branch's `hasOnly(['status'])` grows to `hasOnly(['status', 'cancelledBy', 'cancelReason'])` exactly for this pair, still no other field movable. `'session-cancelled'` (staff cancels the whole session, pin E), `'lapsed'`/`'downgrade'` (the Stripe handler, pin H) are values only an admin-SDK writer ever produces — reaching them requires the staff "Cancel session" action or the Stripe handler, neither of which is the member-booking update branch. **Not specified by the pin:** whether the member branch's rules additionally pin `cancelReason == 'member'` as a value constraint (vs. merely widening the field mask) is routing's implementation call, not asserted here. Cancelled rows with a system reason render a reason line (frontend lane); "until the day before" governs only the *member* cancel path, unchanged. |
| `cancelledVia` | string \| absent | **New (tester report 2026-09-30, cancel a series).** `'series'` on each week a series cancel writes (`hooks/cancelSeries.js` -> `cancel(bookingId, { cancelledVia: 'series' })`); absent == a single cancel. Member cancel arm only: the rules admit the field on `confirmed -> cancelled` and nowhere else, and only the value `'series'` (`memberBookingUpdateOk`); a single cancel of a re-booked row removes it. Decides the receipt only: `onBookingCancelled` sends no `booking-cancelled` notice for it (`functions/portal/notify-gates.js` `shouldNoticeMemberCancel`) - the family saw one on-screen summary instead. |
| `householdId` | string | Denormalized from the athlete for the parent's cross-children view and household-scoped rules. |
| `createdBy` | string | uid of the account that made the booking (parent or athlete). **Contract v1.4:** for a parent-created booking this is the *parent's* uid, not the athlete's — see the linkage note below. |
| `createdAt` | timestamp | |
| `graceTokenId` | string \| null | **New, contract v2.1 (Sprint 13 pin E).** Set when this booking was charged from a grace token instead of the period (`createBooking`'s charge order: Elite -> nothing; else the soonest-expiring unconsumed grace token with `expiresAt >= session.date` -> this field + `chargedFrom: 'grace'`; else the period). A grace-charged booking is EXCLUDED from `tokensFor()`'s `used` count (the Sprint 13 seam amendment landed in `packages.js` — a grace token is a second life for a token the Academy could not honor, never a period spend). Consumption is derived, never stored elsewhere: "is grace token X consumed" == "does some non-cancelled booking carry `graceTokenId == X`". Not yet exercised by any seeded booking (no seeded booking references `graceTokens/grace-1` — the seed demonstrates the grace token existing and unconsumed, not the charge-order client code that would set this field, which lands with the routing lane's Part 2 work). |
| `attendee` | string \| null | **New (owner ruling 2026-09-22, contract v2.1).** `'athlete' \| 'parent'` — who actually walks into a **Yannick 1:1**. The mental-performance work is often the parent's, so the family chooses at booking. Absent on every other booking and on every booking written before the ruling, and **absent always reads as `'athlete'`**, so nothing needs backfilling. The rules admit the field only when `type == 'mental'` (`bookingShapeOk`), so it can never appear on a training, tournament or Phil booking. **Display only**: charging never branches on it, exactly as charging never branches on `type`. Written by `createBooking`, carried through promotion (`functions/portal/promotion.js`), and read by the family's own schedule rows, the coach roster, Yannick's day view and the booked/reminder/promoted notices. |
| `chargedFrom` | string \| null | **New, contract v2.1 (Sprint 13 pin C/E).** `'elite' \| 'grace' \| 'period' \| null` — which source paid for this booking, per the charge order above. Not yet written by this seed for the same reason as `graceTokenId` (the client charge-order code is routing's Part 2 work); documented here so the field name is agreed before that code lands. |
| `source` | string \| absent | **Sprint 20, server-written.** `'calendly'` when `calendlyWebhook` wrote it; absent == `'portal'`. A calendly row is NOT cancellable in-app (rules `memberBookingUpdateOk` `resource.data.get('source', null) != 'calendly'`; copy "Cancel or reschedule from Calendly's email"). |
| `createdVia` | string \| absent | **New (owner report 2026-09-30).** `'repeat'` on each weekly copy Repeat weekly writes (`bookRecurring` -> `createBooking(..., { createdVia: 'repeat' })`); absent == a single booking, including every booking written before. `onBookingCreated` sends no `booking-confirmed` notice for it (`functions/portal/notify-gates.js`): the family just saw the on-screen summary; the auto-booking feature will send a weekly digest instead. The rules admit only `'repeat'` (`bookingShapeOk`). Write-once. |
| `calendlyInviteeUri` | string \| absent | Sprint 20. The lookup key for `invitee.canceled` and for the `old_invitee` reschedule step (single-field index). |
| `flag` | string \| null | Sprint 20, webhook only. `'over-cap' \| 'over-cadence' \| 'membership-inactive' \| 'before-open' \| null` - a Calendly booking is recorded and flagged, never refused (ruling 0.7); tokens are derived so an over-cap booking floors `left` at 0. Absent == null (clean). `useSignups` reads `bookings where flag != null`. |

**Token usage is derived, never stored (contract v2.0, supersedes the v1
"allowance usage" paragraph below in full).** "N left this period" comes from
`tokensFor(athlete, pkg, bookings, waitlist, graceTokens, periodKey)`
(`frontend/src/portal/data/packages.js`) counting **non-cancelled bookings
carrying this `periodKey`** — a plain equality/range read over the athlete's
bookings, not a `pool` filter. There is no `used` counter on the athlete,
package, or period anywhere in Part 1 (Part 2's `tokenPeriods.granted` is a
stored **fact about an issuance event**, not a `used` tally — see
[below](#tokenperiods-contract-v20-part-2)). `sessions.booked` remains the
one per-session capacity display counter, unrelated to token accounting.

**The specialist monthly cap is now a frequency knob, not a pool (contract
v2.0, Sprint 12 pin K) — supersedes the v1.7 "specialist monthly cap"
paragraph in full.** Phil and Yannick sessions spend an ordinary token; what
`SPECIALIST_MONTHLY_CAP` still gates is **frequency**, independent of
tokens: `SPECIALIST_MONTHLY_CAP = { phil: null, mental: 1 }` — `phil: null`
means tokens are the only limit (the old fitness-package Phil cap is
deleted); `mental: 1` per calendar month is the owner's stated 3-4 week
cadence, still counted the same **non-cancelled bookings of that type, exact
calendar month** way the v1.7 cap always counted, just no longer creating an
allowance of its own. `isSpecialistType` stays for display only.

### Booking transaction, attendance, and parent linkage (contract v1.4, Sprint 6)

Pinned by the Sprint 6 QA burn-down rulings (TEAM.md "Sprint 6 pins") to close
the gap between what the screens showed and what Firestore actually enforced
— QA found booking capacity, attendance, and parent booking all client-side
only, with nothing in `firestore.rules` backing them up.

**Booking is one client transaction, and the only writer of `booked`.**
Creating a booking is never two writes — it is a single Firestore transaction
that:

1. reads `sessions/{sessionId}`;
2. requires `booked < capacity`, aborting the transaction otherwise (the
   plain-language "this session is full" rejection the screen shows);
3. creates `bookings/{athleteId}_{sessionId}` — the deterministic id from
   contract v1.1, so a duplicate booking attempt lands on the same doc and is
   rejected by the rules instead of creating a second record (surfaced in
   plain language as "the athlete already has this session booked", QA #8);
4. updates `sessions/{sessionId}.booked` to `booked + 1`.

Rules addition (data-routing lane): a `sessions` update is allowed only when
the caller is a signed-in portal user **and** the diff is exactly
`booked + 1` while staying within `capacity` (or, for the future cancellation
path below, exactly `booked - 1` and never below `0`) — no other field of
`sessions` may change in the same write as a `booked` delta, and no other
delta on `booked` is legal at all. This is the only writer of `booked`
anywhere in the app; the seed script (below) sets `booked` directly because it
is standing up state that *represents* the outcome of transactions that never
literally ran, not because `booked` has a second real writer.

`booked` remains authoritative for **capacity display only** — the
roster/attendance truth is always the `bookings` query
([index 5](#5-bookings-sessionid-asc-status-asc--session-roster), reasoning
updated below for v1.4). A future **cancellation** path is this transaction's
mirror image: read the booking, flip `status` to `cancelled`, decrement
`sessions.booked` by `booked - 1` (never below 0) in the same transaction —
not built this sprint, but the field, the rules shape, and the "one writer"
invariant are already correct for it, so cancellation lands without a schema
change.

**Attendance is derived state on the booking — there is no `attendance`
collection.** A coach marks a booked athlete IN or OUT during a live session;
that write is a `status` transition on the existing `bookings` doc, nothing
else:

- `confirmed -> attended` (coach marks IN)
- `confirmed -> noshow` (coach marks OUT)

Only the **assigned coach** may make this transition — `athletes/{athleteId}.coachId
== request.auth.uid`, resolved through the booking's `athleteId` (routing
lane implements the `get()` in `firestore.rules`) — and the write may change
**only** the `status` field; `athleteId`, `sessionId`, `date`, `type`, `pool`,
`householdId`, `createdBy`, and `createdAt` are immutable after create.
Marking attendance never touches `sessions.booked`: the athlete already held
the seat from the moment of booking, so `attended`/`noshow` records what
happened in an already-counted seat, not a new capacity event.

**Parent-created bookings.** A parent books for a child in their household —
`createdBy` is the **parent's uid**, so `createdBy != athleteId`'s owning
account is the expected shape for these, not an anomaly. The linkage the
rules must prove on create is a three-way match: the caller's own
`users/{request.auth.uid}.householdId` equals both the write's own
`householdId` field and the target athlete's `athletes/{athleteId}.householdId`
(a `get()`). A parent can book only into their own household's athletes —
never a neighbor's — and the booking's `householdId` can't be forged to a
household different from the one the athlete actually belongs to.

**Post-write refresh (routing lane; documented here for the data-contract
record).** Sprint 6 also fixes the "confirm a booking, the dashboard still
shows the old count" friction (QA #3/#5/#7) with a **read-refresh seam**, not
a new stored counter: after `createBooking` / `createContractLog` / an
attendance update, the routing lane's dependent hooks re-run and re-derive
their view from Firestore (generalizing `usePracticeLog`'s existing
`refreshKey` pattern — no global state library, no cache to invalidate wrong).
Contract v1.4 adds **zero** new denormalized fields for this: `sessions.booked`
remains the only stored counter anywhere in the schema; allowance usage,
attendance history, and the roster are all live queries, so there is nothing
else that can drift.

### Cancellation and re-booking (contract v1.7, Sprint 9)

New in Sprint 9 (TEAM.md "Sprint 9 pins"), and **applies to every booking
pool** — training, tournaments, and specialist alike, not just the new
specialist types. A capacity-1 specialist slot is what made this urgent (an
unused 1-on-1 is a dead hour for the specialist), but the schema and
transaction are pool-agnostic.

**Who:** the athlete's own `users` account, or the household's parent, may
cancel a `confirmed` booking of their own athlete's.

**Cancel is one transaction — the exact mirror of create.** Reads the
booking, then writes both of:

1. `bookings/{athleteId}_{sessionId}.status` `confirmed -> cancelled`;
2. `sessions/{sessionId}.booked` `- 1` (never below `0`) — the same
   [single-writer `booked` rule](#booking-transaction-attendance-and-parent-linkage-contract-v14-sprint-6)
   from contract v1.4, whose rules clause already reserved the `booked - 1`
   shape for "the future cancellation path below." Sprint 9 is that path
   landing: no rules shape change, only the routing lane's rules
   verifying/extending the existing diff check for `-1` the same way it
   already does for `+1`.

**Client gate, not a stored field:** cancellable through the day *before* the
session; day-of shows a "contact the academy" message instead of the button.
This is a UI-layer check against `sessions.date` — nothing new is stored for
it. **Accepted v1 gap:** `firestore.rules` allows the `confirmed -> cancelled`
transition without re-checking the date server-side (flagged in TEAM.md as a
deliberate v1 gap, not an oversight).

**Re-booking a cancelled doc is an UPDATE, not a new doc.** Because the
booking id is deterministic (`{athleteId}_{sessionId}`, contract v1.1), a
member booking the *same* athlete back into the *same* session after
cancelling hits the existing doc. `createBooking`'s transaction treats an
existing doc whose `status` is already `'cancelled'` as its update path
instead of its create path: `status -> 'confirmed'`, `sessions.booked + 1`,
same doc id, same keyspace guarantee (one booking per athlete per session)
that has held since v1.1 — a cancel-then-rebook never produces two docs for
one athlete/session pair.

**Rules shape (routing lane implements; documented here as the schema
record):** a new *member-booking update* branch, distinct from the existing
*coach-attendance* update branch — own athlete or own household's parent
(the same three-way linkage check as create, [above](#booking-transaction-attendance-and-parent-linkage-contract-v14-sprint-6)),
diff `hasOnly(['status'])`, and the transition must be **exactly**
`confirmed -> cancelled` or `cancelled -> confirmed` — no other `status`
value pair is a legal member-initiated write (a member can't self-mark
`attended`/`noshow`, and can't cancel an already-`attended`/`noshow`
booking). Per the Sprint 7 hotfix precedent elsewhere in this schema, the
rule needs no `substring()` — a `status`-pair equality check, not a
string-matching one.

### `contractLogs/{athleteId}_{date}`

Commitment Contract practice log — one per athlete per day, id-enforced. Field
set is **contract v1.3** (Sprint 5 pin, TEAM.md): `contractMinutes`,
`createdBy` and `createdAt` are additions over v1's `athleteId, date, minutes`.

| Field | Type | Notes |
|---|---|---|
| `athleteId` | string | Matches the id prefix. |
| `date` | string | `YYYY-MM-DD` (ISO), matches the id suffix. |
| `minutes` | number | Integer > 0. The real practiced amount that day — variable, not a fixed block length. |
| `contractMinutes` | number | **Snapshot** of the athlete's `contractMinutes` tier at the moment this log was created — copied from `athletes/{athleteId}.contractMinutes`, not read live. This is what lets history survive a later tier change: a log written against the 45-min tier still reads as fulfilled/not against 45 forever, even if the athlete moves to the 90-min tier next month. |
| `createdBy` | string | uid of the account that wrote the log (athlete or parent). |
| `createdAt` | timestamp | Server write time. |

**One log per athlete per day** via the doc-id keyspace — same pattern as
`bookings`' `{athleteId}_{sessionId}`. A second log for the same
athlete/date overwrites the first rather than creating a duplicate.

**Fulfilled = `minutes >= contractMinutes`.** Surplus minutes never bank an
extra fulfilled day — 90 minutes logged against a 45-minute contract is
**one** fulfilled day that happens to record 90, not two days' worth of
credit. There is no rollover or banking concept anywhere in this collection.

**Any date is loggable.** Closures are a *scheduling* fact (they constrain
which `sessions` are bookable) — they are not a *practice* fact, because kids
practice outside the academy. The contract calendar has no `closed` state;
every calendar date accepts a log.

### `tournamentResults/{sessionId}_{athleteId}` (contract v1.6, Sprint 8)

One doc per athlete's **score** in one Saturday tournament block — the fact
record behind the "RYP Tour" season leaderboard, now split into age
brackets (TEAM.md "Sprint 8 pins"). Doc id `{sessionId}_{athleteId}`,
unchanged since v1.5 and shared with `bookings`' `{athleteId}_{sessionId}`
and `contractLogs`' `{athleteId}_{date}` as the same
enforced-by-construction pattern: the keyspace itself guarantees one result
per athlete per tournament, and a correction is a same-id update — **there
is no delete in v1**, so a bad entry is fixed by overwriting `score`, not by
removing the doc.

**Supersedes v1.5.1 for this collection's field shape.** Coaches now enter
the actual strokes from the round instead of tapping athletes into finishing
order; `position` is **no longer a field on the document at all** — it
derives at read time, per age bracket (below). Production carries no
`tournamentResults` docs yet and the emulator reseeds from scratch, so this
is a field-shape change, not a migration.

| Field | Type | Notes |
|---|---|---|
| `sessionId` | string | Into `sessions/` — must be a `type: 'tournament'` session. Matches the id prefix. |
| `athleteId` | string | Into `athletes/`. Matches the id suffix. |
| `name` | string \| null | **Contract v1.5.1, unchanged by v1.6.** The athlete's display name, snapshotted at write time from the roster the staff member entering results is already reading. Pure display denormalization — the academy-public standings show every name to every role *without* widening the `athletes` read matrix. Read paths prefer this and fall back to a per-id athlete join only for pre-amendment docs. |
| `bracket` | string \| null | **Contract v1.6 (Sprint 8).** One of `'10U' \| '11-13' \| '14+'`, or `null`. A **write-time snapshot** — computed from `athletes/{athleteId}.dob` **as of `SEASON_BOUNDS.start`** (never the write date, and never read live at standings time) at the moment the result is entered, exactly the same rationale and mechanics as the `name` snapshot above: bracketing a result never needs a cross-family `athletes` read, so the "cross-family reads impossible" invariant from the v1.5.1 amendment holds for age too. The three buckets (`data/tour.js`'s `BRACKETS`, routing lane): `10U` = age 0-10, `11-13` = age 11-13, `14+` = age 14-999, age computed on the day the season opens so nobody changes brackets mid-season. An athlete with **no `dob` at write time** gets `bracket: null`, grouped under the display-only **'Open'** bucket at read time — nothing breaks, nothing is guessed. Like `name`, a bracket already written to a doc is never rewritten retroactively; once provisioning sets a real `dob`, only *results entered after that* pick up the real bracket. |
| `date` | string | `YYYY-MM-DD`. **Must equal the referenced session's own `date`** — read off `sessions/{sessionId}.date` at write time (never typed independently), so the two can never disagree. |
| `score` | number | **Contract v1.6 (Sprint 8).** Integer, strokes, `18..200`. Replaces `position` — see below for how a finishing place is recovered from this without ever storing one. |
| `createdBy` | string | uid of the staff account (coach or ops/owner) that entered the result. |
| `createdAt` | timestamp | Server write time. |

That is the complete shape — **exactly these eight keys**, nothing else
(the rules' `tourShapeOk()` checks `hasOnly` as well as `hasAll`, per the
Sprint 7 pin this inherits).

**Position derives at read time, per (date, bracket) group — an event is a
DATE** (contract v1.6.1, TEAM.md Sprint 8 amendment, owner's ruling: "the
scores from the 2 blocks would be combined a 1 weekly tournament"). Every
tournament block on one Saturday pools into a single weekly field: group
that date's results — across all of its blocks — by `bracket` (docs with
`bracket: null` group under `'open'`), sort each group **ascending by
`score`** (fewest strokes wins), and assign **competition ranking** exactly
as before: equal scores share a place, and the next distinct score resumes
at its 1-based index rather than the next integer (two 41s tie for 1st, the
next score is 3rd, not 2nd). Docs stay per-session and the entry UX stays
per-block — the merge is pure derivation. If an athlete somehow holds
results in two blocks of the same date, their **lowest round counts** for
that week (never summed — everyone else played one round) and the week
counts once. The drop-week rule's `eventsHeld` counts distinct **dates**.
Points then come from that per-bracket position via `TOUR_POINTS` exactly
as they came from the old stored `position` — the table and
`pointsForPosition()` in `frontend/src/portal/data/tour.js` did not change,
only what feeds them did. A week with only one entrant in a bracket derives
that entrant as 1st in it, same as any group of one always would; the seed
data below is exactly this case for two events, by construction (three
seeded results, three different brackets).

**Points are still never stored — score is the only numeric fact in
Firestore.** Everything downstream of it (position, points, standings) is
computed at **read** time, in the hook that derives standings, and never
written back to a document — the same derive-don't-store discipline that
already covered `position` in v1.5 now covers `score`, one layer further
back. If the owner retunes `TOUR_POINTS`, the bracket boundaries, or the
drop-week rate, that change **retroactively rescores the entire season** the
next time standings are read, instead of requiring a migration over every
past result. Storing a `position` or `points` field on this document would
freeze every past tournament's scoring to whatever the rules said on the day
it was entered — exactly the drift this schema avoids everywhere else
(`sessions.booked` aside, a display counter with its own single-writer
transaction, not a derived value with a policy knob behind it).

**Standings derivation** (read-time, no stored aggregate) is now computed
**per bracket**: within one bracket's set of athletes, sum each athlete's
points (from their per-tournament bracket-scoped position, above) across the
season window, rank descending by that sum, and **let ties share a rank**
(two athletes tied for a bracket's lead are both "1st", the next distinct
total is "3rd", not "2nd" — competition ranking, not dense ranking, same
rule as before, just scoped narrower). "Events played" alongside each row is
still simply the count of that athlete's `tournamentResults` docs in the
window — no separate counter. An athlete never appears in two brackets: a
`bracket` value is fixed per document at write time, and one athlete's dob
does not change between one tournament and the next within a season, so
every doc for a given athlete carries the same bracket all season (barring a
coach correcting a bad entry). Only non-empty brackets are shown, in
`BRACKETS` order, with `'open'` last.

**Rules** (data-routing lane implements; noted here so the shape they
enforce is on the record): create/update restricted to `coach` and staff
roles (`ops`, `owner`, `mental` per the existing staff set, unchanged);
shape-checked — id must equal `{sessionId}_{athleteId}`, `score` an integer
in `18..200`, `bracket` one of `'10U' \| '11-13' \| '14+'` or `null`, `date`
must match the referenced session's `date` (the Sprint 7 hotfix's `matches()`
pair, not `substring()` — rules strings still have no `substring()`);
readable by any signed-in portal user (standings are public inside the
academy, not scoped per household, per coach, or per bracket); **no delete**
in v1.

**Read paths skip any doc with no valid integer `score`** (defensive —
nothing in the write path should ever produce one, but a hand-edited or
pre-v1.6 doc reaching a v1.6 read path fails closed rather than crashing the
standings screen).

### `enrollmentRequests/{uid}` (contract v1.8, Sprint 10)

Self-serve intake with owner approval — the data-loss path the Sprint 10 scan
flagged first (TEAM.md pin A): a new family signing in and landing at a dead
end instead of a real registration flow. Doc id is the signed-in guardian's
own Firebase Auth uid — one open request per account, the same
one-per-caller enforcement the `users` id gives, and the natural key since
the whole point is "does *this* signed-in account have a request on file."

| Field | Type | Notes |
|---|---|---|
| `guardian` | map | `{ name, email, phone }` — same shape as `households.guardian`. |
| `athletes` | array of map | `{ name, dob (string YYYY-MM-DD \| null), packageId, contractMinutes (20\|45\|90\|null) }` per child. `dob`/`contractMinutes` are nullable — a family may not have decided a tier, or (rare) not know a birthdate at submission — but `packageId` is always set: a package choice is part of registration regardless of whether the tier is. |
| `consents` | map | `{ dataCollection, videoCapture, mediaRelease }`, all booleans — the same three ids as `CONSENTS` in `frontend/src/portal/data/seed.js`. |
| `status` | string | `pending \| approved \| declined`. |
| `declineReason` | string \| null | Set by ops/owner on decline; null otherwise. |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | Bumped on every edit, including a submitter's own edit to a still-pending request and a resubmit after decline. |
| `reviewedBy` | string \| null | uid of the ops/owner account that last changed `status`; null while `pending`. |
| `reviewedAt` | timestamp \| null | |

**Rules** (routing lane implements; shape noted here as the schema record):
create/update by `request.auth.uid == uid` **only while `status` is
`'pending'`** — a submitter can edit their own pending request (fix a typo,
add a consent) but can never flip `status` themselves, including back to
`'pending'` after a decline (that resubmit path is an ops/owner-mediated
`status` change in the UI's model, not a self-write — see NotProvisioned's
decline-state copy in TEAM.md pin A). Read: own uid, plus ops/owner (the
admin enrollment queue). ops/owner may update `status` / `declineReason` /
`reviewedBy` / `reviewedAt` only — never the guardian/athletes/consents
content a family submitted.

**Approval is one batched write** (owner/ops client, TEAM.md pin A) — not a
Cloud Function, not multiple independent writes a partial failure could
split:

1. `households/{autoId}` from `guardian`;
2. `athletes/{autoId}` per athlete entry — `name`, `dob`, `packageId`,
   `contractMinutes`, `householdId` (the new household's id), `coachId: null`
   (assignment is a separate staff action, unchanged from every other
   athlete-creation path in this schema);
3. `users/{uid}` for the guardian — `{ role: 'parent', householdId,
   athleteId: null, staff: false, specialistId: null, displayName, email }`,
   `uid` being the enrollment request's own doc id (the guardian's already-
   signed-in account, resolved to a real portal account for the first time);
4. the request doc's own `status -> 'approved'` (`reviewedBy`, `reviewedAt`
   set).

Kids getting their own logins is a **later**, separate provisioning step
(parent-managed is the Sprint 7 default) — approval never creates a
`users` doc for an athlete, only for the guardian.

**Rules gain** (routing lane): `athletes` create by ops/owner (new —
previously nothing created an `athletes` doc from the client at all, only
seed/provision scripts); `users` create/update by ops/owner **for any uid**
(new — previously the only `users` writes were the notificationPrefs
self-write above and the scripts' admin-authenticated writes, which rules
don't gate at all). Both are staff-only capability grants, not a widening of
what a non-staff caller can do — **self-role-change by a non-owner stays
denied**, exactly as before; an owner/ops account approving a request is
setting up *someone else's* account, never elevating its own.

### `athletes/{athleteId}/diagnostics/{captureId}` (contract v1.8, Sprint 10)

Diagnostic capture persistence — the second silent data-loss path the scan
flagged (TEAM.md pin C): a coach filling out the Diagnostic Capture screen
had nothing backing it, so every capture vanished on refresh. Doc id is an
auto id (no natural key — an athlete accumulates a capture history over
time, the same shape as a photo or note log, not a one-per-day or
one-per-session record like `contractLogs`/`bookings`).

| Field | Type | Notes |
|---|---|---|
| `athleteId` | string | Matches the parent path segment — carried on the doc too so a collection-group read (below) doesn't need to parse the path to know whose capture it is. |
| `capturedBy` | string | uid of the staff account that took the capture. |
| `capturedAt` | timestamp | |
| `updatedAt` | timestamp | |
| `status` | string | `draft \| published`. A capture starts as a draft and is explicitly published — see the save/publish split below. |
| `values` | map | `{ <fieldId>: number \| string \| null }`, keyed by the **existing `DIAGNOSTIC_SECTIONS` field ids** in `frontend/src/portal/data/seed.js` (the same catalogue the Diagnostic Capture screen renders its input rows from — never a second, independently-typed field list; the full enumerated key list is just below). A draft's `values` map holds only the fields entered so far; a published capture is expected to hold all of them, though the schema does not itself enforce completeness (a coach can publish a partial capture — the UI, not the rules, is where "are you sure" lives). |
| `notes` | string \| null | Free-text, coach-entered. |

That is the complete shape — six keys, `values` doing the heavy lifting.

**The `values` key list**, enumerated by reading `DIAGNOSTIC_SECTIONS` in
`seed.js` directly rather than retyped independently — thirteen field ids
across four sections:

| Section | Field ids |
|---|---|
| `launch` (Launch monitor) | `clubhead`, `ball`, `smash`, `carry7i` |
| `mobility` (Mobility & stability) | `hip`, `shoulder`, `balance` |
| `shortgame` (Short game) | `d30`, `d50`, `d70` |
| `putting` (Putting) | `p3`, `p6`, `p10` |

If a future sprint adds or renames a `DIAGNOSTIC_SECTIONS` field, this table
goes stale until updated — it is a documentation mirror of `seed.js`, not a
second source of truth the rules or the hook read from.

**Rules** (routing lane implements): create/update by the assigned coach
(`athleteData(athleteId).coachId == uid`), any specialist
(`me().get('specialistId', null) != null`), or mental/ops/owner. Read: the
athlete's own user and the household parent see **published only**
(`resource.data.status == 'published'`) — a draft is a coach's working copy,
never a family-facing document; staff see all (draft and published), the
same "coach/specialist/mental/ops/owner" set as write.

**Collection-group read** (routing lane implements; named here since it is
the reason this document defines an `athleteId` field at all): a `match
/{path=**}/diagnostics/{id}` rule allowing read for coach/mental/ops/owner/
specialists turns "which athletes have no diagnostic yet" from an
N-athletes-worth-of-reads admin problem into **one query** —
`collectionGroup('diagnostics')` with no filter, read once, then diffed
client-side against the full `athletes` list. See
[Indexes](#indexes) below for why this specific read needs no index.

**Hooks** (routing lane owns): `useDiagnostic(athleteId)` live ->
`{ data: { latest (published capture \| null), draft (open draft \| null),
sections }, saveDraft(values, notes), publish(values, notes) }`.
`saveDraft` **upserts the athlete's single open draft** — a coach saving
twice before publishing updates the same doc, not a second one; `publish`
flips the open draft's `status` to `'published'`. A **second** publish (a
follow-up capture weeks later) creates a **new** doc rather than overwriting
the published one — history is the collection, exactly like
`tournamentResults`' "no delete, corrections are same-id updates" precedent
does NOT apply here: a diagnostic capture is a point-in-time record, and a
newer capture is a new fact, not a correction of the old one.

### `staffInvites/{id}` (contract v1.8, Sprint 10)

Backs "Add staff" on Staff & Roles (TEAM.md pin E) — the third scan-flagged
inert surface. Doc id is an auto id (many invites can exist over the life of
the academy, including a re-invite after one lapses unresolved — no natural
one-per-anything key).

| Field | Type | Notes |
|---|---|---|
| `email` | string | Lowercased at write time — the field provisioning matches an auth account against. |
| `role` | string | `coach \| mental \| ops \| owner`. |
| `displayName` | string | |
| `specialistId` | string \| null | `'phil' \| 'mental' \| null` — same meaning as `users.specialistId` above; carried on the invite so provisioning can write it straight through without a second staff decision at consumption time. |
| `status` | string | `pending \| provisioned`. |
| `createdBy` | string | uid of the owner account that created the invite. |
| `createdAt` | timestamp | |
| `provisionedUid` | string \| null | **Set by `provision-family.mjs`**, not by the client — the resolved auth uid once the invited person has signed in at least once and provisioning has run. Null while `pending`. |

**Rules** (routing lane implements): create by owner only; read by owner/ops
(the Staff & Roles pending-invites list, with its honest "provisions when
they first sign in" line — TEAM.md pin E). No update/delete path from the
client at all in v1 — the only writer of `status`/`provisionedUid` is the
provisioning script below, which authenticates as IAM admin traffic rules
don't gate (the same posture as every other `provision-*.mjs` write).

**Consumption (`scripts/provision-family.mjs`, contract v1.8 pin E):** reads
the `staffInvites` collection from production (same `prodAccessToken()`
principal as every other write in the script), filters to `status ==
'pending'`, and resolves each invite's `email` to an auth uid via the
existing `lookupUids()` Identity Toolkit call — the identical resolution
path the FAMILIES/STAFF accounts already go through, not a second mechanism.
Found: writes `users/{uid}` — `{ role, athleteId: null, householdId: null,
staff: true, specialistId, displayName, email }` — and updates the invite
doc to `status: 'provisioned'`, `provisionedUid: uid` (a same-id, full-document
write — the script owns the whole `staffInvites` shape). The `users/{uid}`
write here is the same `updateMask`-scoped write the FAMILIES/STAFF path
uses (`USER_UPDATE_MASK`, the seven provisioning-owned fields — see the
[`notificationPrefs` row](#usersuid)), so consuming an invite for a uid that
already has a `users` doc cannot erase that user's saved `notificationPrefs`
either. Those two masked writes — `users` (2026-09-15 fix) and `athletes`
(`ATHLETE_UPDATE_MASK`, contract v1.9) — are the ONLY partial-field writes
in these REST-API scripts; `packages`/`households`/`staffInvites` stay
full-document replaces on purpose, because the script is the sole owner of
those shapes.
Not found: prints the identical "NO AUTH RECORD — create it in Firebase
console" line the FAMILIES/STAFF accounts print when their auth record
doesn't exist yet, and leaves the invite `pending` for the next run — the
script is idempotent the same way it already was for families. **The
`STAFF` array in the script is unchanged and stays the seed of record for
Yannick and Phil** — `staffInvites` consumption is a second, parallel
provisioning path for invites created through the live app, not a
replacement for the hand-maintained real-specialist entries.

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

### Billing rows (derived, no new collection)

Sprint 5 adds a per-child billing list to the parent surface. It is **not** a
stored collection — each row is derived at read time by joining one
`athletes` doc to its `packages` doc:

- one row per athlete: `{ athleteId, name, packageName: packages[packageId].name, price, status }`
- `price` comes **only** from the frontend's `packages.js` source (the same
  module `seed-firestore.mjs` and `provision-family.mjs` bundle from) —
  Firestore's `packages/{id}.price` field is never populated (policy: no
  dollar amounts in Firestore; see the `packages` collection notes above), so
  the derivation reads the number out of the bundled catalogue, not out of a
  document.
- `status` is a hardcoded `'active'` placeholder until Stripe wiring lands;
  it is not read from `households.stripeSubscriptionId` this sprint.

### Query semantics (v1.3 access patterns)

Three read patterns the Sprint 5 hook seam relies on, pinned here so the
index reasoning below has a fixed target:

- **Coach roster** — "every athlete assigned to a coach" is not attendance
  for one session; it is `athletes where coachId == :coachUid`, full stop.
  This is a real roster query against the athlete's standing assignment
  (`athletes.coachId`), not a derivation from `sessions`/`bookings`.
- **Parent household list** — a parent's children list (and the billing
  rows above) come from `athletes where householdId == :parentHouseholdId`.
  This is the query the rules must be able to prove is scoped to the
  caller's own household (`request.auth`-derived equality filter), per the
  Sprint 5 access-matrix ruling in TEAM.md.
- **Month session grid** — `useMonthSessions(monthISO)` reads
  `sessions where date >= :monthStart and date <= :monthEnd orderBy date`,
  the same range-on-the-ordered-field shape as the existing Book-a-Session
  query ([index 1](#1-season-browsing--no-composite-needed-deploy-verified)),
  just bounded to one calendar month instead of the whole season.

### RYP Tour query patterns (v1.5, Sprint 7; unchanged by v1.6)

Three read patterns the Sprint 7 hook seam (`useTourStandings`,
`useTournamentResults`) relies on against `tournamentResults`. Age brackets
(contract v1.6, Sprint 8) add a stored `bracket` field to what these reads
return, but not a new filter or sort dimension — the per-bracket grouping
`deriveTourStandings()` now does happens client-side, over docs these same
three shapes already fetch, the same way position/points already derived
client-side over `score`/the old `position`. None of the three patterns
below changed:

- **Season standings** — every result in the season window, summed and
  ranked per athlete. Two equivalent shapes answer it: an **unfiltered
  collection read** (`tournamentResults` with no filter at all — the whole
  collection is the season, since v1 has no result outside the current
  season and no archival concept yet), or a **date-range read**
  (`tournamentResults where date >= :seasonStart and date <= :seasonEnd
  orderBy date`, the identical range-plus-orderBy-on-the-same-field shape as
  [index 1](#1-season-browsing--no-composite-needed-deploy-verified)/the
  month-session-grid pattern above). Either way the aggregation (sum points
  per athlete, rank, tie-handling) happens client-side after the read, the
  same as every other derived value in this schema — there is nothing to
  aggregate at the database layer for a collection this size (at most ~3-4
  dozen tournament blocks in a season x up to 15 athletes each).
- **Per-session results** (`useTournamentResults(sessionId)`, and the
  results-entry screen's pre-fill) — `tournamentResults where sessionId ==
  :id`. A single equality filter on one field.
- **Per-athlete history** — an athlete's own tournament record —
  `tournamentResults where athleteId == :id`. Also a single equality filter
  on one field; the result set is small enough (a season's worth of
  tournaments for one kid) to sort client-side rather than needing an
  `orderBy` in the query.

## Contract v2.6 — the owner's amendments of 2026-09-17 (Sprint 18)

Source: `SPRINT-12-PINS.md` amendments v2.0.1 (pricing sheet) and v2.0.2
(capacity 14), `tokens-and-billing-contract.md` §1. Built as: the
catalogue is `t-6` $299 · `t-12` $569 · `t-16` $719 · `elite` $999 ·
`single` $65 (pending) — `t-20` retired (the provisioner's catalogue run
deletes it from prod); prices are in `data/packages.js` but withheld from
parents and athletes (`PRICES_RELEASED = false`); facility access is the
athlete fields above; Elite's frequency caps are `eliteDailyCapHit()`
(one training-or-tournament and one Phil booking per date) and
`MENTAL_MONTHLY_CAP = { elite: 2, default: 1 }` (`mentalCapFor(pkg)`),
enforced client-side in the booking gate like the v2.0 mental cadence —
frequency rules, never charges; the schedule generator drops Tue/Thu 3 PM
(reserved, invite-only, not on the shared calendar; a title that is not
"Training…"/"Tournament…" stays display-only in the sync) and caps at 14.

## Indexes

All composite indexes live in `firestore.indexes.json`. Single-field lookups
(booking by `sessionId` alone, sessions by `date` alone) ride Firestore's
automatic single-field indexes and are not listed.

### 1. Season browsing — no composite needed (deploy-verified)

The Book-a-Session query — `sessions where date >= :today orderBy date,
__name__` — rides Firestore's automatic single-field index on `date`:
`__name__` is the implicit tiebreaker on every single-field index, so the
composite `(date ASC, __name__ ASC)` is redundant, and the deploy API rejects
it outright ("this index is not necessary, configure using single field index
controls"). The chronological-cursor property still holds, because session ids
are date-prefixed and blocks sort within a day (`-0`, `-1`, `-2`).

### 2. `bookings (athleteId ASC, date ASC)` — My Schedule

Serves: `bookings where athleteId == :id and date >= :today orderBy date`
(upcoming) and the `date < :today` variant (past tab). The athlete's schedule
across both pools, in date order.

### 3. `bookings (householdId ASC, date ASC)` — parent household view

Serves: `bookings where householdId == :id and date >= :today orderBy date` —
the parent home screen's "next session" per child and the household's combined
calendar, one query for all children instead of one per athlete.

### 4. `bookings (athleteId ASC, pool ASC, date ASC)` — cycle usage

Serves: `bookings where athleteId == :id and pool == :pool and
date >= :cycleStart and date <= :cycleEnd` — **the derived-allowance query.**
Counting the results (excluding `status == 'cancelled'` in memory) yields
"used N of M" for that pool this billing cycle. Status is filtered client-side
rather than indexed because a cycle holds at most a couple dozen docs per
athlete; a fourth index field would buy nothing measurable.

### 5. `bookings (sessionId ASC, status ASC)` — session roster

Serves: `bookings where sessionId == :id and status == 'confirmed'` — the
capacity reconcile that can rebuild `sessions.booked` from truth (count
non-cancelled bookings for a session and compare against the stored
counter).

**v1.4 note (Sprint 6):** this is **not** the query behind the coach's
attendance roster — the list a coach sees to mark a block IN/OUT. That list
must keep showing a booking after it flips to `attended` or `noshow` (a
booking that vanished from the roster the moment it was marked would be
useless for a coach reviewing who's already been checked), so it reads
*every* booking for the session regardless of status:
`bookings where sessionId == :id` alone. That is a single equality filter on
one field, which rides Firestore's automatic single-field index on
`sessionId` — no composite involved, and this one specifically. This
composite index stays in the file for the narrower reconcile query above,
which genuinely does filter on two distinct fields (`sessionId` and
`status`) — unlike [index 1](#1-season-browsing--no-composite-needed-deploy-verified)'s
redundant `(date, __name__)` case, a two-distinct-field composite is never
"not necessary" from Firestore's perspective, so it isn't at risk of the
deploy-time rejection; it's simply the index for a different, narrower query
than the roster now uses.

### 6. `contractLogs (athleteId ASC, date ASC)` — contract history

Serves: `contractLogs where athleteId == :id and date >= :monthStart and
date <= :monthEnd orderBy date` — the contract month grid, streaks, and
attendance percentage on the parent's child-detail screen.

### 7. `bookings (status ASC, date ASC)` — admin no-show query (contract v1.8, Sprint 10)

Serves: `bookings where status == 'noshow' and date >= :monthStart` — the
live admin "Who needs a call" card's no-shows-this-month list (TEAM.md pin
D), grouped by `athleteId` client-side afterward with names via the per-id
join. **Genuinely needs a composite**, unlike every other admin-derivation
read this sprint adds ([confirmed index-free below](#v18-query-additions-sprint-10--live-admin-enrollment-diagnostics)):
this is an equality filter on one field (`status`) **and** a range filter on
a *different* field (`date`) in the same query — the two-distinct-field
shape that has triggered every other real composite in this file (the same
reasoning [index 4](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage)
and [index 5](#5-bookings-sessionid-asc-status-asc--session-roster) already
established for `bookings`), not the range-plus-orderBy-on-the-same-field
shape that rides an automatic single-field index for free
([index 1](#1-season-browsing--no-composite-needed-deploy-verified) and
everywhere that cites it).

### v1.3 query additions (Sprint 5) — no `firestore.indexes.json` changes

Every new/changed query the Sprint 5 hook seam needs was checked against the
existing composites and Firestore's automatic single-field indexes.
**Nothing was added** — each one either rides an index that already exists or
rides the automatic single-field index that a composite would duplicate:

- **`contractLogs` variable-minutes practice log** (`usePracticeLog`) — the
  read is `contractLogs where athleteId == :id and date >= :cycleStart and
  date <= :cycleEnd orderBy date`, the exact shape [index 6](#6-contractlogs-athleteid-asc-date-asc--contract-history)
  already serves. Contract v1.3 added fields (`contractMinutes`, `createdBy`,
  `createdAt`) to the document, not to the query's filter/sort clauses, so
  the existing 2-field composite is untouched and already sufficient.
- **`athletes where householdId == :id`** (`useHouseholdAthletes`, and the
  billing derivation) — a single equality filter with no `orderBy` on a
  different field. Firestore's automatic single-field index answers this
  directly. Adding a `(householdId ASC)` "composite" here is exactly the
  redundant-index shape production rejects at deploy time with "this index
  is not necessary, configure using single field index controls" — which
  aborts the whole `firestore deploy --only firestore:indexes` run, not just
  that one index. Left off the file entirely, on purpose.
- **`athletes where coachId == :uid`** (`useCoachRoster`) — same reasoning
  as `householdId` above: single equality filter, automatic single-field
  index, no composite.
- **`sessions` month range** (`useMonthSessions`) — `date >= :monthStart and
  date <= :monthEnd orderBy date` is a range filter and `orderBy` on the
  *same* field, the identical shape already established as composite-free in
  [index 1](#1-season-browsing--no-composite-needed-deploy-verified) (and
  deploy-verified there). Narrowing the range to one month instead of the
  whole season doesn't change which index type answers it.

If a future sprint adds a *second* sort/filter field to any of these four
queries (e.g. ordering the roster by name, or paginating billing rows), that
is the point a real composite becomes necessary — not before.

### v1.4 query additions (Sprint 6) — no `firestore.indexes.json` changes

Every Sprint 6 read/write pattern (booking transaction, attendance, parent
linkage — [pinned above](#booking-transaction-attendance-and-parent-linkage-contract-v14-sprint-6))
was checked against the existing composites and against what actually needs
an index at all. **Nothing was added:**

- **Attendance roster** (`bookings where sessionId == :id`) — a single
  equality filter on one field, so it rides Firestore's automatic
  single-field index on `sessionId`. See the v1.4 note on
  [index 5](#5-bookings-sessionid-asc-status-asc--session-roster) above for
  why this is a *different* (narrower, unindexed-by-composite) query than
  the one that index actually serves.
- **Booking-capacity transaction** — reads `sessions/{sessionId}` and writes
  `bookings/{athleteId}_{sessionId}` plus `sessions/{sessionId}.booked` by
  **document id**, never by query. Document gets/sets have no index
  implication at all.
- **Attendance status transition** — same reasoning: a
  `bookings/{athleteId}_{sessionId}` update by id, not a query.
- **Parent-created booking linkage check** — a rules-time comparison of
  already-resolved values (the caller's own `users` doc via
  `request.auth.uid`, the write's own `householdId` field, and one `get()`
  on the target `athletes` doc) evaluated at write time in
  `firestore.rules`. It is not a query the client SDK runs, so it has no
  index implication either.

If a future sprint adds a genuine second *query* dimension to the attendance
roster (e.g., a coach paging results, or ordering by athlete name), that is
the point a `(sessionId ASC, <field> ASC)` composite becomes real — not
before, and not the existing `(sessionId ASC, status ASC)` one, which already
exists to serve a different query.

### v1.5 query additions (Sprint 7 — RYP Tour) — no `firestore.indexes.json` changes

All three [Tour query patterns](#ryp-tour-query-patterns-v15-sprint-7-unchanged-by-v16) were
checked against the existing composites and against what actually needs an
index at all. **Nothing was added — expected, and worth spelling out why,
since a wrong guess here doesn't fail loudly in dev, it fails at `firebase
deploy --only firestore:indexes` in front of the whole team:**

- **Season standings** — either candidate shape is composite-free. The
  unfiltered collection read has no filter or sort at all, so there is
  nothing for a composite to serve. The date-range alternative
  (`date >= :start and date <= :end orderBy date`) is a range filter and
  `orderBy` on the *same* field — the exact shape already established as
  riding Firestore's automatic single-field index in
  [index 1](#1-season-browsing--no-composite-needed-deploy-verified) and in
  the v1.3 month-session-grid note above. Adding a `(date ASC)` "composite"
  for either shape is precisely the redundant-index case production's deploy
  API rejects outright ("this index is not necessary, configure using single
  field index controls") — and that rejection **aborts the entire indexes
  deploy**, not just this one entry, which is why this collection stays out
  of `firestore.indexes.json` on purpose rather than "to be safe."
- **Per-session results** (`tournamentResults where sessionId == :id`) — a
  single equality filter on one field, riding the automatic single-field
  index on `sessionId`. Same shape as the bookings-by-session case
  ([index 5](#5-bookings-sessionid-asc-status-asc--session-roster)'s v1.4
  note), just on a different collection.
- **Per-athlete history** (`tournamentResults where athleteId == :id`) — same
  reasoning again: single equality filter, automatic single-field index, no
  `orderBy` clause to force a composite.

If a future sprint adds a genuine second filter/sort dimension to any of
these three — e.g. standings scoped to a date range *and* a specific coach's
roster in one query, or paginating per-athlete history with a secondary
sort — that is the point a real `tournamentResults` composite becomes
necessary. Not before, and note the shape that would trigger it: two
*distinct* fields in the filter/sort clause, not a range-plus-orderBy on the
same field, which is what every query above already is.

### v1.6 query additions (Sprint 8 — age brackets) — no `firestore.indexes.json` changes

Age brackets add a stored `bracket` field to `tournamentResults` and a
per-bracket grouping step to `deriveTourStandings()`, but **no new filter or
sort dimension on the collection** — none of the three v1.5 query patterns
above changed, and `bracket` rides along as an ordinary field on every doc
those reads already fetch. Grouping by bracket, like grouping by session for
the per-event podiums, happens **client-side in the hook**, over a result
set Firestore already returned unfiltered-by-bracket — the same reasoning
that kept v1.5 composite-free applies again: a `where bracket == :id` filter
is never issued against Firestore at all, so there is nothing for an index
(single-field or composite) to serve. If a future sprint adds a genuine
server-side filter on `bracket` (e.g. a coach's results-entry screen paging
one bracket's roster via a query instead of an in-memory filter), that is the
point a `(bracket ASC, <field> ASC)` composite might become real — not
before, and note it would need a second *distinct* field to be a composite
at all, same caveat as every entry above.

### v1.7 query additions (Sprint 9 — specialist sessions, cancellation) — no `firestore.indexes.json` changes

Two new read patterns, both already served:

- **Specialist monthly cap check** — `bookings where athleteId == :id and
  pool == 'specialist' and date >= :monthStart and date <= :monthEnd`, then
  filtered to one `type` (`phil` or `mental`) and non-`cancelled` `status` in
  memory. This is the **identical shape** to the existing
  [cycle-usage index](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage)
  (`athleteId ASC, pool ASC, date ASC`) that already serves the
  training/tournaments allowance check — `pool == 'specialist'` rides that
  same composite, and `type`/`status` are filtered client-side exactly the
  way `status` already is for the other two pools (the same "a cycle holds at
  most a couple dozen docs" reasoning that index's own note gives). Nothing
  added.
- **Cancel and re-book** — both are a `bookings/{athleteId}_{sessionId}`
  read-then-write **by document id**, the identical shape the
  [booking-capacity transaction](#v14-query-additions-sprint-6--no-firestoreindexesjson-changes)
  already established has no index implication at all. Document gets/sets
  never touch a query index.

If a future sprint needs a query that filters specialist bookings by `type`
at the database layer instead of in memory (e.g. a specialist's own roster of
their upcoming 1-on-1s, deferred per TEAM.md's Sprint 9 "Deferred, on the
record" note), that is the point a `(type ASC, date ASC)` or similar
composite becomes real — not before.

### v1.8 query additions (Sprint 10 — live admin, enrollment, diagnostics)

`useAdminDashboard`'s live rebuild (TEAM.md pin D) is four read patterns
over existing collections, no new store. Checked individually against the
existing composites and against what genuinely needs an index at all — only
**one** of the four does, and it is [index 7](#7-bookings-status-asc-date-asc--admin-no-show-query-contract-v18-sprint-10)
above:

- **Enrolled athletes / enrollment by package** — a full, unfiltered
  `athletes` collection read (count the docs; group by `packageId`
  client-side). No filter, no sort — nothing for an index to serve, the
  same reasoning as the unfiltered `tournamentResults` season-standings read
  in the [v1.5 notes](#ryp-tour-query-patterns-v15-sprint-7-unchanged-by-v16)
  above.
- **Block fill this week** — `sessions where date >= :weekStart and date <=
  :weekEnd`, summed `booked`/`capacity` grouped by `type` client-side. A
  range filter (and, if the client orders it, `orderBy`) on `date` alone —
  the identical shape [index 1](#1-season-browsing--no-composite-needed-deploy-verified)
  and the v1.3 month-session-grid note already established rides Firestore's
  automatic single-field index. Nothing added.
- **No-shows this month** — `bookings where status == 'noshow' and date >=
  :monthStart`, grouped by `athleteId` client-side. Two *distinct* fields in
  the filter clause (equality on `status`, range on `date`) — this is the
  one pattern here that is NOT composite-free, and [index 7](#7-bookings-status-asc-date-asc--admin-no-show-query-contract-v18-sprint-10)
  is exactly it.
- **Contract behind** — `contractLogs where date >= :monthStart` (no
  `athleteId` equality filter — this is the admin-wide scan across every
  athlete's logs for the month, unlike [index 6](#6-contractlogs-athleteid-asc-date-asc--contract-history)'s
  per-athlete version), grouped by `athleteId` client-side and compared
  against each athlete's tier over the month's contract days. A single
  range filter on one field, with or without an `orderBy` on that same
  field — composite-free for the same reason the month-session-grid and
  season-standings range reads are, above.
- **Athletes with no published diagnostic** — the `diagnostics`
  [collection-group read](#athletesathleteiddiagnosticscaptureid-contract-v18-sprint-10)
  minus the full `athletes` list, both already covered: the collection-group
  read carries **no filter at all** (`collectionGroup('diagnostics').get()`,
  filtered to `status == 'published'` client-side, same "filter in memory
  because the collection is small" call this schema already makes for
  `bookings`' cycle-usage `status` and `tournamentResults`' read-time
  position), so there is nothing for an index to serve — a genuinely
  unfiltered collection-group read needs no more of an index than a plain
  collection `.get()` does. The `athletes` half rides the same unfiltered
  read as the first bullet above.

Two more v1.8 reads, both single equality filters on one field — automatic
single-field index, no composite, same reasoning as every other
single-equality-filter case in this file:

- **Enrollment queue** (admin section, TEAM.md pin D/A) —
  `enrollmentRequests where status == 'pending'`.
- **Pending staff invites** (Staff & Roles list, pin E, and
  `provision-family.mjs`'s consumption) — in practice an unfiltered read of
  the whole `staffInvites` collection (it is small; both the screen and the
  script filter to `status == 'pending'` client-side rather than issuing a
  second query shape), which is even more trivially index-free than the
  equality-filter version would have been.

### v1.9 query additions (Sprint 11 — membership & entitlements, family Reservations) — no `firestore.indexes.json` changes

Every new read this sprint adds was checked against the existing composites.
**Nothing was added** — all three ride a shape this file already established:

- **Package assignment** (pin B) — `setAthletePackages()` reads and writes
  `athletes/{athleteId}` **by document id**, inside the field-limited update
  described [above](#athletesathleteid). Document gets/sets have no index
  implication at all, the same reasoning as every other by-id write in this
  file (e.g. the [booking-capacity transaction](#v14-query-additions-sprint-6--no-firestoreindexesjson-changes)).
- **Entitlement derivation** (pin C) — Phil's `used` this month is
  `bookings where athleteId == :id and pool == 'specialist' and
  date >= :monthStart and date <= :monthEnd`, filtered to `type == 'phil'`
  and non-`cancelled` `status` client-side — the **identical shape**
  [index 4](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage)
  already serves (the same composite the v1.7 specialist monthly-cap check
  rides — [see that note](#v17-query-additions-sprint-9--specialist-sessions-cancellation--no-firestoreindexesjson-changes)).
  A fitness package only changes the *limit* Phil's derivation compares
  `used` against (`fitness.sessions` instead of the flat
  `SPECIALIST_MONTHLY_CAP`); it never changes the query shape. Mental's
  derivation is unchanged since v1.7.
- **Family Reservations** (pin F) — `useHouseholdReservations()` is **one**
  query: `bookings where householdId == :id and date >= :today orderBy
  date` (upcoming) and the `date < :today` variant (past) — the exact shape
  [index 3](#3-bookings-householdid-asc-date-asc--parent-household-view)
  already serves, unchanged since Sprint 6 (the parent home screen's
  "next session per child" query is the same household-wide read). Grouping
  the results into one section per household member, splitting Upcoming/
  Past, and joining each booking's `sessionId` to its session doc for
  `instructor`/`durationMinutes` all happen **client-side in the hook** over
  a result set Firestore already returned — no new filter or sort dimension
  on `bookings`, so no new composite. **Verify, don't widen**, per TEAM.md
  pin F: parents already read every booking for their household through
  this same index for the existing household view; Reservations is a new
  screen over an old read, not a new read.

Nothing in this sprint's read set adds a genuine second *distinct* filter/
sort field to any collection — the trigger every real composite in this file
has needed so far ([index 4](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage),
[index 5](#5-bookings-sessionid-asc-status-asc--session-roster),
[index 7](#7-bookings-status-asc-date-asc--admin-no-show-query-contract-v18-sprint-10)) —
so `firestore.indexes.json` is unchanged this sprint.

## Periods, tokens and booking windows (contract v2.0, Sprint 12, Part 1)

The token model (TEAM.md "Sprint 12 pins — the token model"). **Design
keystone: ONE fungible token pool, derived, never stored.** A token is spent
by any non-cancelled booking of any session type; `used` in a period is a
count over `bookings`; `reserved` (Part 2) is a count over `waitlist`
entries; a grace token (Part 2) is consumed when a booking references it.
Charging never branches on `sessions.type` — see the amended invariant in
TEAM.md's pin. Delivered in two parts (TEAM.md): **Part 1** (this document,
current) covers A, B, D, K, L, M, J-code, I; **Part 2** (Sprint 13) covers C,
E, F, H — interfaces pinned now, documented below, seeded empty, so Part 1
data is valid Part 2 data the moment those land.

**Periods.** A period is the household's billing cycle, anchored on a
day-of-month via `households.periodAnchorDay` (int `1..28`, absent == 1) —
**not** the calendar month. `periodFor(dateISO, anchorDay)`
(`frontend/src/portal/data/packages.js`, pure, both data modes) returns
`{ periodKey, periodEnd }`: `periodKey` is the period **start** as
`'YYYY-MM-DD'`, the same string `bookings.periodKey` stores. Anchor 15 puts
`2026-09-10` in the period `2026-08-15..2026-09-14`.

**Charging rule.** A booking is charged against the period its
**`sessions.date`** falls in — never the period it is made in. That is the
whole of "hard expiry" in this design: a family can book into a future
period today, and that booking's `periodKey` is simply that future period's
start; there is no "provisional" status in Part 1 (Part 2's `tokenPeriods`
is what would formalize the distinction between an issued and an
as-yet-unissued period — see below). The **advance-booking cap falls out for
free**: the client cap for any period is `pkg.tokens` (Part 1) or the
period's `tokenPeriods` grant (Part 2), so a family can hold at most one
package's worth of bookings in any single period, present or future.

**`tokensFor(athlete, pkg, bookings, waitlist, graceTokens, periodKey)`** →
`{ granted, used, reserved, grace, left, unlimited }` — every "N left this
period" surface computes from this one function, so none can disagree:
`granted` = `pkg.tokens` in Part 1 (Part 2 reads the period's `tokenPeriods`
doc when one exists, falling back to `pkg.tokens` when absent); `used` =
non-cancelled bookings carrying this `periodKey`; `reserved` = waitlist
entries carrying this `periodKey` (Part 2; always 0 in Part 1, no
`waitlist` collection is populated yet); `left` = `granted - used -
reserved`, floored at 0; `unlimited` when `pkg.tokens === null` (Elite).
**No package at all means zero tokens, not unlimited.**

**Booking windows (pin D).** `SPECIALIST_BOOKING_WINDOW_DAYS` (the old flat
specialist-only window) is gone from the booking-gate path — every session
type now uses the athlete's own package window: `windowDaysFor(pkg)` → `30` (**Sprint 20 ruling 0.5, was 32**)
for every token package and `single`, `45` for `elite`. The window **rolls
at 07:00 America/Chicago**, not midnight: `anchor = localNow.hour >= 7 ?
localToday : localToday - 1; openThrough = anchor + windowDays; bookable iff
session.date <= openThrough`. Pure `openThrough(now, windowDays)` /
`windowOpensOn(sessionDateISO, windowDays)` in
`frontend/src/portal/data/calendar.js` (both already on the PM seam this
sprint's worktrees share). `assertWithinMonthlyCap` in `live.js` (routing
lane) becomes `assertWithinPeriodCap`: reads the athlete, its package, the
period's bookings (+ waitlist/grace/`tokenPeriods` in Part 2) inside the
transaction; skips when `pkg.tokens === null`; typed reasons
`'no-tokens-left'`, `'outside-window'`, `'membership-inactive'` (Part 2).

### `tokenPeriods` (contract v2.1, Part 2)

**BUILT, Sprint 13.** `tokenPeriods/{athleteId}_{periodKey}`: `{ athleteId,
householdId, periodKey, periodEnd, granted (int), source: 'stripe' \|
'ops', eventId (Stripe event id \| null), createdAt }`. `granted` is
**stored**, not derived — it is a fact about a payment/issuance event (the
same class as `tournamentResults.score`), not a tally. Written by the
Stripe handler (functions lane, admin SDK, `source: 'stripe'`, `eventId`
set) on `invoice.paid`, or by ops/owner from the membership editor's "Issue
tokens" action (`source: 'ops'`, `eventId: null` — the cash/comp case;
rules: create-only, shape-checked, doc id must equal
`{athleteId}_{periodKey}`, `granted` an int `0..40`, `source == 'ops'` on a
client write so a member can never forge a `'stripe'`-sourced doc). Read:
member reads own (own athlete, or the parent's own household via one
`get()` on the athlete) — **no member write**, no update or delete from any
client. `tokensFor()`'s `opts.tokenPeriod` reads this doc **by id**, for the
current period and (separately) the next — no query, no index, a plain
document get exactly like the booking-transaction reads elsewhere in this
schema. **Absent == `pkg.tokens`** — nothing provisioned in Part 1 breaks.

Seed: **one real doc**, `tokenPeriods/jordan_<currentPeriodKey>` —
`granted: 12` (read off jordan's live `t-12` package at seed-run time, not
hand-typed), `source: 'stripe'`, `eventId: 'evt_seed_1'` (fake — no real
Stripe event backs it). `<currentPeriodKey>` is `periodFor(today,
whitfield.periodAnchorDay)`'s own output at seed-run time, so the doc id
itself moves with whenever the seed actually runs (e.g.
`tokenPeriods/jordan_2026-09-01` when seeded on 2026-09-16) — never a frozen
date. This is the CURRENT period (September, as of this document's own
verification run), distinct from the November period her regular
training/tournament bookings fall in — **but not empty of spend**: the
three pre-existing Sprint 9/11 specialist bookings (`jordan_2026-09-17-s0`
mental, `jordan_2026-09-14-s0` and `jordan_2026-09-11-s0` phil, all dated
inside this same run's "next two weeks"/"past two Phil days" windows) carry
this exact `periodKey` too, so `tokensFor()` reads `used: 3` against this
doc's `granted: 12` the moment the seed loads (verified: `export-
memberships.mjs`'s emulator run below prints `jordan:12/3/0/0`) — matching
the "3 of 12 used" the Sprint 12 integration notes already recorded live.
This is a property of WHEN the seed happens to run relative to those
specialist windows, not something this pass engineered; a seed run far
enough from any specialist slot could see `used: 0` against this same doc
instead, and that would be equally correct.

### `graceTokens` (contract v2.1, Part 2)

**BUILT, Sprint 13.** `graceTokens/{auto}`: `{ athleteId, householdId,
expiresAt ('YYYY-MM-DD', minted + 30 days), reason: 'session-cancelled' \|
'waitlist-expired', sourceSessionId, createdBy (uid \| 'sweep'), createdAt
}`. Created by ops/owner (rules: create, shape-checked, `reason ==
'session-cancelled'` only from a client — `'waitlist-expired'` is
admin-only, the sweep script's own value) or the `sweepWaitlist` Cloud Function — daily 06:00 America/Chicago,
`functions/portal/sweep.js`, contract v2.5 (Sprint 17) — or its manual twin
`scripts/sweep-waitlist.mjs` (admin SDK); both mint the id
`{sessionId}_{athleteId}_waitlist` with `createdBy: 'sweep'`, skip an
athlete who already holds a waitlist-expired token for that session (any
id), delete the entry, and the function sends one `waitlist-expired`
notice. Members read own (query `athleteId ==`, index
[below](#v21-index-reasoning-sprint-13--token-model-part-2)).
**Consumed is derived, never stored:** a non-cancelled booking with
`graceTokenId == id` (see the `bookings.graceTokenId` row above). Exactly
two minting triggers (TEAM.md pin E): (1) staff "Cancel session" — every
confirmed booking on the session gets cancelled with `cancelledBy`/
`cancelReason` (pin G) and one grace token each, idempotent (an athlete
already holding a grace token for that `sourceSessionId` is not minted
twice — the client action's own idempotency, chunked in batches of <= 8
writes per the Sprint 10 ~20-doc rules cap); (2) `scripts/sweep-waitlist.mjs`
— a waitlist entry whose session date has passed unpromoted. An athlete's
own cancellation, leaving a waitlist voluntarily, or revocation (lapse)
mints nothing.

Seed: **one real doc**, `graceTokens/grace-1` — `athleteId: 'reese'`,
`reason: 'session-cancelled'`, `sourceSessionId: '2026-11-11-0'` (a real
generated Wednesday training block, not otherwise referenced by any other
booking in this seed), `expiresAt` = seed-run "today" + 20 days,
`createdBy: 'ops'`. **Deliberately paired with the pin's separate
cancelled-booking fact (pin G)** rather than left as two unrelated facts:
`sessions/2026-11-11-0.status` is `'cancelled'` and
`bookings/reese_2026-11-11-0` carries `status: 'cancelled'`,
`cancelledBy: 'system'`, `cancelReason: 'session-cancelled'` — the exact
shape a real staff "Cancel session" action would leave, with the grace
token minted for precisely that event. `sessions/2026-11-11-0.booked` is
written as `0` (no confirmed booking survives the cancel), matching the
"keep `sessions.booked` consistent with `bookings`" instruction.
**Reconciliation note for the PM:** `status` is set on this ONE session
doc only — the *generic* generated-session build loop in
`seed-firestore.mjs` still does not write `status` at all (the pre-existing
gap this document has flagged since Sprint 9: "generator-seeded sessions
never write status/gcalEventId"). That gap is unchanged by this pass on
purpose (out of this task's scope to fix broadly), but it now has a
concrete consequence worth the PM's attention: routing's pin-F waitlist-create
rule requires `status == 'scheduled'`, which is **false, not true**, for
every ordinary generated session that has no `status` field at all (`null
== 'scheduled'` is false) — only the two hand-seeded exceptions in this
seed (the specialist slots, which always set `status: 'scheduled'`
explicitly, and the new FULL session below, same reason) can accept a
waitlist join as currently seeded. See the FULL-session note just below,
and the [Seeding & emulator workflow](#seeding--emulator-workflow) section
for where this is set.

### `waitlist` (contract v2.1, Part 2)

**BUILT, Sprint 13** (its index landed a sprint early — [v2.0 index
reasoning](#v20-index-reasoning-sprint-12--the-token-model) above).
`waitlist/{sessionId}_{athleteId}`: `{ sessionId, athleteId, householdId,
date, periodKey, joinedAt, createdBy, attendee? }` — the same
one-entry-per-athlete-
per-session keyspace shape `bookings` uses. Member create (own athlete /
household parent; rules `get()` the session and require `booked >=
capacity` and `status == 'scheduled'`, **plus** (pin H) one `get()` of the
household denying `past_due`/`lapsed` membership — the same freeze booking
create enforces); member delete (leave); admin delete (promote / expire).
`tokensFor()`'s `reserved` counts entries carrying the current `periodKey`.
Elite entries count `0` reserved. **Promotion is server-side** (functions
lane: a Firestore trigger on `sessions/{id}` where `booked` decreased,
picking the head of the waitlist — grace-token holders first, soonest
expiry, then `joinedAt` ascending — auto-confirm, no acceptance window) —
not built by this DB-lane pass; `scripts/sweep-waitlist.mjs` (below) is
this collection's *other* writer, for the expiry side.

**`attendee` rides the entry too** (owner ruling 2026-09-22): Yannick's 1:1
has capacity 1, so "full" is the ordinary path for it, and a family that
chose the parent must not silently lose that choice when a seat opens.
`promoteOneSeat` copies the field onto the booking it writes. Same rule as
the booking field: `'athlete' | 'parent'`, admitted by the rules only on a
`mental` entry, absent reads as the athlete.

Seed: **ONE seed-only FULL session**, capacity **2** — **the single
deliberate exception to the flat capacity-15 rule (contract v2.0 pin J)
anywhere in this seed**, called out here in bold rather than left for a
reader to stumble on. `sessions/2026-11-16-w0` (a new hand-added letter,
`-w`, "waitlist", on the existing `-s`/`-x` extras convention; a real
non-closure Monday inside `SEASON_BOUNDS`), `capacity: 2`, `booked: 2`,
`status: 'scheduled'` (set explicitly, the same hand-seeded-session
exception to the generic-loop gap noted above — this session NEEDS
`status == 'scheduled'` to be a legal waitlist-join target under routing's
pin-F rule). Booked by `jordan` and `reese` (both `confirmed`,
`periodKey` set via `periodFor()`), with `waitlist/2026-11-16-w0_nico`
(`joinedAt`, `periodKey`, `householdId: 'whitfield'`) completing the
scenario — kept purely so the waitlisted state (a row, a position, a "Join
waitlist" affordance) is exercisable in the emulator without inventing 15
fabricated bookings on a real session.

### `stripeEvents` (contract v2.1, Part 2)

**BUILT, Sprint 13.** `stripeEvents/{eventId}` — the Stripe webhook
handler's idempotency ledger, keyed by the Stripe `event.id` itself so a
redelivered event is a no-op by construction (the same "id is the dedupe
key" pattern this schema already uses for
`bookings`/`contractLogs`/`tournamentResults`, just with an
externally-assigned id instead of a composed one). Shape (as built, pin H):
`{ type, customer, householdId: string \| null, receivedAt, outcome }`,
written by the handler in the same transaction as its effect.
**Admin-only collection** — no member or staff client read or write from
`firestore.rules`; the webhook handler (admin SDK) is the sole writer. An
event that cannot be resolved to a household (`customer` matches no
`households.stripeCustomerId`) is still recorded, with `householdId: null`
— never thrown away, per pin H ("an unmatched event is recorded and
skipped, never thrown").

**Sprint 20 (contract v3.0.1, PM ruling D8):** the shape gains two fields — `{ type, customer, householdId: string | null, athleteId: string | null, via: string | null, receivedAt, outcome }`. `athleteId` is the athlete the event resolved to (null on the legacy household-wide path and on every unresolved row); `via` names WHICH step of the resolution order (interfaces 6.2) matched: `'metadata'` (subscription metadata), `'billing'` (`athletes.billing.subscriptionId`), `'facility'` (`athletes.facilityBilling.subscriptionId`), `'customer'` (`households.stripeCustomerId`), `'customer-ids'` (`stripeCustomerIds array-contains`), `'checkout-session'` (`checkout.sessions.list`), `'client-reference'` (`checkout.session.completed`'s own `client_reference_id`), or null. Both are audit fields: `export-memberships.mjs` and the sign-ups report never branch on them.

Outcomes gain: `applied-checkout` (`checkout.session.completed` applied to the athlete's `billing` or `facilityBilling`); `issued-prepaid` (the `subscription_create` invoice's tokens landed in the prepaid period from `subscription_data.metadata`); `facility-active` (an `invoice.paid` for the facility add-on: `facilityBilling.status: 'active'`, no tokens issued, no payment-received notice); `no-period` (an `invoice.paid` for a token package whose invoice line carries no period and whose metadata names no prepaid period: billing flipped to active, NO `tokenPeriods` doc written — the daily export surfaces it); `unexpected-quantity` (the checkout's line items are not exactly one recurring line plus at most one one-time line, every quantity 1 — PM ruling D13: recorded, nothing written); `stripe-lookup-failed` (the last-resort `checkout.sessions.list` threw: recorded with `householdId: null`, HTTP 200, surfaced by `export-memberships.mjs`; a redelivery is then `duplicate`); `athlete-lapsed` (a TIER `customer.subscription.deleted` - or a final `invoice.payment_failed` - for one athlete while a sibling still holds an active/past_due tier, PM ruling D17: that athlete's `billing.status` -> `lapsed`, only their future bookings and waitlist entries are revoked via `revoke.revokeAthlete`, household `membership` untouched). `HANDLED` gains `checkout.session.completed`; `client_reference_id` is `${householdId}__${athleteId}__${product}` (double underscore; athlete ids never contain `_`).

**Facility add-on events (PM ruling D10):** every event that resolves to `product: 'facility'` (`invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`) records its usual outcome but its ONLY writes are `athletes.facilityBilling` (+ `facilityAccess`) — household `membership` is untouched and no booking is revoked. The household freeze (`applyPastDue`) belongs to the tier subscription; the household lapse and `revokeHousehold` apply only when a tier subscription ends and no sibling still holds an active/past_due tier (D17) — otherwise only that athlete lapses (`athlete-lapsed`).

Seed: **one fake doc**, `stripeEvents/evt_seed_2` — `{ type:
'invoice.payment_failed', customer: 'cus_seed_parker', householdId:
'parker', receivedAt, outcome: 'past_due' }`, paired with
`households/parker.stripeCustomerId: 'cus_seed_parker'` and
`households/parker.membership.lastEventId: 'evt_seed_2'` above — the three
facts cross-reference exactly as a real webhook write would leave them,
never independent fixtures that happen to share a prefix.

### `notifications` (contract v2.2, Sprint 14)

**BUILT, Sprint 14 (the writers are Cloud Functions, live once the project
is on Blaze and the functions deploy; the read side ships with the app).**
`notifications/{kind}_{subjectKey}` — the notification LEDGER: one document
per notice attempted, written by the sending function under the admin SDK
in the same step as the send, and keyed so a retried trigger or a re-run
scheduled job finds its own row and sends nothing twice (the `stripeEvents`
"id is the dedupe key" idea, applied to outbound messages). **Ids as
built:** `{kind}_{bookingId}` for the per-booking kinds (`booking-confirmed`,
`promoted`, `session-cancelled`, `reminder-24h`);
`tokens-expiring_{athleteId}_{periodKey}`; `grace-expiring_{graceTokenId}`;
`booking-revoked_{householdId}_{stripeEventId}` — ONE notice per household
per Stripe event, sent by `functions/portal/revoke.js` after its batch (the
pin's draft list said per booking; the count is only known there);
`membership_{householdId}_{triggerEventId}` (the Firestore trigger's own
retry-stable event id, so a redelivery sends nothing and a genuine second
status flip is its own notice). Shape: `{ kind,
category, householdId, athleteId: string \| null, sessionId: string \|
null, bookingId: string \| null, subjectKey, title, body, recipients:
[{ uid, email, push }], sentAt, createdAt }` (v2.3: `push` replaced `sms`).
Each channel outcome is one of `'sent' \| 'skipped' \| 'failed' \| 'off'`
(`push` also `'no-device'`): `off` = the recipient's
`users.notificationPrefs[category]` has that channel switched off (absent
map or category == the defaults in `data/parent.js`; `billing` email is
always on), `skipped` = no email transport configured (SMTP or Courier)
or, for push, the Functions emulator, `no-device` = no `users.pushTokens`.
Kinds by category — schedule:
`booking-confirmed`, `promoted`, `session-cancelled`, `reminder-24h`;
billing: `booking-revoked`, `tokens-expiring`, `grace-expiring`,
`membership` (TEAM.md "Sprint 14 pins" has the trigger and copy per kind).
Titles and bodies are stored as sent, so the in-app list re-renders nothing
from the underlying booking or session. Copy (`functions/portal/notices.js`)
names the athlete by the first word of `athletes.name` — there is no
`firstName` field anywhere in the schema — and the session by its `label`
or, when null (every generated block), a label for its `type` (`training` →
"Training", `tournament` → "Tournament", `phil` → "Phil 1-on-1", `mental` →
"Mental session", `adult` → "Adult block"); dates read "Wed, Nov 11" and the
time is the stored string. **Clients never write** (no allow
clause in `firestore.rules`); members read own — parent by `householdId
==`, athlete by `athleteId ==` — and ops/owner read all. Settings shows
the newest ten as "Recent notices" (`hooks/notices.js`).

Seed: **three docs for the Whitfields** — a `booking-confirmed` for
jordan's booking on the full `-w0` session, the `session-cancelled` for
reese's cancelled `2026-11-11-0` booking (the grace-token scenario above),
and a `tokens-expiring` for jordan's current period — each with the
recipients' outcomes exactly as the emulator functions leave them with no
provider configured (`email: 'skipped'`, `push: 'no-device'`), timestamps
relative to the seed run.

### v3.0 query additions (Sprint 20 — sign-up, Calendly, per-athlete billing) — no `firestore.indexes.json` changes

Every new read is a single-field filter or a single-field sort, which rides Firestore's automatic single-field index; none combines an equality with a range/sort on a different field, so none needs a composite:

- `households orderBy signup.at desc` (`useSignups`) — one sort field (a map sub-field is still one field).
- `loginInvites where householdId == :id`; `loginInvites/{emailLower}` by id (`claimInvite`).
- `bookings where flag != null` — a single-field `!=` is served by the automatic index (docs without the field are excluded, which is the intent: absent == clean).
- `bookings where calendlyInviteeUri == :uri` (`invitee.canceled`, reschedule); `calendlyEvents where outcome == 'unresolved'`.
- The webhook's resolution order (interfaces 6.2): `athletes where billing.subscriptionId == :id`, `athletes where facilityBilling.subscriptionId == :id`, `households where stripeCustomerId == :c` (existing), `households where stripeCustomerIds array-contains :c` — each one equality/array-contains on one field.
- `write-packages.mjs` reads `packages/{id}` by id; `useSignups`'s athletes read is `athletes where householdId == :id` (existing single-field pattern).

The `bookings (status, date)` composite (index 7) still serves reminders; nothing here filters `source`/`flag` together with a date.

### v2.2 index reasoning (Sprint 14 — notifications)

- **`notifications (householdId ASC, createdAt DESC)` and `notifications
  (athleteId ASC, createdAt DESC)` — new, added this sprint.** The Recent
  notices read is an equality filter plus an `orderBy` on a different field
  with a `limit` — the same two-distinct-field shape as `graceTokens
  (athleteId, expiresAt)` above. One composite per member role because the
  parent's query filters the household and the athlete's the athlete — the
  fields the rule proves the read against. The functions' own reads
  (`notifications` by document id for the idempotency check; `bookings
  where status == 'confirmed' and date == :tomorrow` for reminders, riding
  [index 7](#7-bookings-status-asc-date-asc--admin-no-show-query-contract-v18-sprint-10);
  `graceTokens where expiresAt == :date`, a single equality filter) add
  nothing.

### v2.1 index reasoning (Sprint 13 — token model Part 2)

- **`graceTokens (athleteId ASC, expiresAt ASC)` — new, added this sprint.**
  Serves the member-read pattern (`graceTokens where athleteId == :id`,
  soonest-expiry sort for the "spent first, soonest-expiry first" charge
  order in `tokensFor()`) — an equality filter and an `orderBy` on a
  **different** field, the same two-distinct-field shape that already
  forced every other real composite in this file
  ([index 4](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage)/[index 5](#5-bookings-sessionid-asc-status-asc--session-roster)/[index 7](#7-bookings-status-asc-date-asc--admin-no-show-query-contract-v18-sprint-10)/`waitlist (sessionId, joinedAt)`
  above). `scripts/sweep-waitlist.mjs`'s idempotency check and
  `scripts/export-memberships.mjs`'s per-athlete grace count both read
  `graceTokens where athleteId == :id` too (no `orderBy` needed for either,
  but the composite's leading field still serves a bare equality filter,
  same as any composite does for its own prefix).
- **The revoke query (pin H: "every household booking with `date > today`
  and `status 'confirmed'`") — rides the EXISTING
  [index 3](#3-bookings-householdid-asc-date-asc--parent-household-view)
  (`bookings (householdId ASC, date ASC)`), unchanged since Sprint 6.** The
  Stripe handler's lapse/downgrade path (and `export-memberships.mjs`'s
  "open confirmed bookings" column) both read
  `bookings where householdId == :id and date >= :today`, filtering
  `status == 'confirmed'` client/handler-side — the same "filter the extra
  dimension in memory" discipline every other `bookings` composite read in
  this file already uses for `status` ([index 4](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage)'s
  own note, restated for [index 7](#7-bookings-status-asc-date-asc--admin-no-show-query-contract-v18-sprint-10)).
  **No new composite needed or added.**
- **The daily export's other reads are all either a document get, a single
  equality filter, or a range read already established as composite-free:**
  per-athlete token position rides
  [index 2](#2-bookings-athleteid-asc-date-asc--my-schedule) (bookings) and
  the new `graceTokens` composite above (grace); `tokenPeriods` reads are
  by document id (no index at all, same reasoning as every by-id read in
  this file); `waitlist where householdId == :id` and
  `bookings where householdId == :id and date >= :today` (for the "open"
  counts) are, respectively, a single equality filter (automatic
  single-field index, same reasoning as `athletes where householdId ==
  :id`) and the exact index-3 shape the revoke bullet above already covers.
  **`firestore.indexes.json` gains exactly one entry this sprint** —
  `graceTokens (athleteId, expiresAt)` — everything else in Part 2 rides an
  index that already existed.

### v2.0 index reasoning (Sprint 12 — the token model)

- **`bookings` period-usage query — no new composite needed.** `tokensFor()`
  filters an already-fetched bookings array by `periodKey` equality in
  memory (the same "filter the extra dimension client-side" discipline
  [index 4](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage)'s own
  note already established for `status`) — the Firestore-side read is
  `bookings where athleteId == :id and date >= :periodStart and date <=
  :periodEnd`, because **`periodKey` is equivalent to a date range**
  (`periodFor()` returns both the start, which IS `periodKey`, and the end).
  That is exactly the shape [index 2](#2-bookings-athleteid-asc-date-asc--my-schedule)
  (`athleteId ASC, date ASC`) already serves — a range filter on `date` plus
  an equality on `athleteId`, unchanged from the query My Schedule has always
  run. **`bookings (athleteId, periodKey)` is therefore not added** — it
  would duplicate an index the athlete-scoped period read never actually
  needs, since the date-range formulation already rides index 2.
- **`waitlist (sessionId ASC, joinedAt ASC)` — added now, ahead of the
  collection existing (Part 2).** The eventual promotion-trigger read is
  `waitlist where sessionId == :id orderBy joinedAt asc` — an equality
  filter and an `orderBy` on a **different** field, the same two-distinct-
  field shape that already forced [index 4](#4-bookings-athleteid-asc-pool-asc-date-asc--cycle-usage)/[index 5](#5-bookings-sessionid-asc-status-asc--session-roster)/[index 7](#7-bookings-status-asc-date-asc--admin-no-show-query-contract-v18-sprint-10)
  into real composites elsewhere in this file (unlike [index 1](#1-season-browsing--no-composite-needed-deploy-verified)'s
  range-plus-orderBy-on-the-*same*-field case, which rides the automatic
  single-field index for free). **Deploying a composite index for a
  collection with zero documents is harmless** — Firestore does not require
  the collection or its fields to already have data, so pinning this now
  means Part 2's trigger never waits on an index build after the fact.
- **`bookings (athleteId, pool, date)` (index 4) is now vestigial** — `pool`
  is retired (pin A) and nothing in Part 1 queries `athleteId` + `pool` +
  `date` together anymore (the period-usage read above rides index 2
  instead, which does not include `pool`). **Left in
  `firestore.indexes.json` rather than removed**: existing prod `bookings`
  docs still carry `pool` harmlessly, and removing a deployed index is a
  separate, deliberate deploy step this DB-lane pass does not take
  unilaterally. Flagged here for the PM to decide whether to prune it in a
  later sprint — not acted on in this pass.

## Seeding & emulator workflow

Both npm scripts live in the **root `package.json`** (created for this — the
repo root had none, and this is where `firebase.json` lives, so emulator
commands resolve their config; neither the CRA app in `frontend/` nor the
`functions/` package is the right owner for repo-level data tooling).

```
npm run emulator         # firestore :8080, auth :9099, emulator UI (firebase.json)
npm run seed:emulator    # seed the running emulator (env via scripts/emulator.env)
npm run sync:emulator -- --from ... --to ...   # calendar -> sessions sync (see above)
node scripts/seed-firestore.mjs --dry-run   # print counts + samples, write nothing
```

The seed script:

- bundles `season.js` / `packages.js` / `seed.js` from frontend source with
  esbuild (`--bundle --format=cjs --platform=node`) and executes them — the
  season and catalogue are **never retyped**; requires `frontend/` deps
  installed (date-fns) for the bundle step. **Contract v2.0 (Sprint 12):**
  the packages bundle moves onto the seam's `ALL_PACKAGES`/`periodFor`
  (above the DEPRECATED banner in `packages.js`) — `GOLF_PACKAGES`,
  `DROP_IN`, `FITNESS_PACKAGES`, `ELITE_TIERS`, `poolFor` are no longer
  imported by this script at all;
- refuses to run without `FIRESTORE_EMULATOR_HOST` (unless `--dry-run`), and
  refuses any non-local host, so it structurally cannot write to production;
- writes via the Firestore REST API, so the repo root needs no dependencies;
- seeds no dollar amounts, no Stripe ids (null), no `pending` markers
  (contract v2.0 — stripped alongside `price`, both by the same `fields()`
  helper), and no medical documents;
- **contract v2.0 (Sprint 12 pin B) — `households.periodAnchorDay`:**
  written explicitly (not left absent) on every seeded household so a raw
  emulator read shows the fact directly. Whitfield: `1`. A second, small,
  fully-invented demo household, **`parker`** (never a real family, same
  class as Whitfield), is anchored on `15` — TEAM.md's DB-lane bullet asks
  for the mid-month cycle to be exercised, and the Contreras family in
  `enrollmentRequests` is only a pending *request*, not a provisioned
  household, so it cannot carry an anchor. `parker`'s one athlete,
  `sage-parker`, is also this seed's **one Elite athlete** — the pin asks
  for one in the emulator (a gap this document flagged as unresolved back
  in the Sprint 11 seeding notes below, "No emulator athlete is seeded on
  an Elite package" — now closed); the two facts are combined onto one
  household/athlete deliberately, since
  nothing requires them to be different households. No `users` doc backs
  `parker` (no QA sign-in story is pinned for it) — it is an
  athletes/households pair only, the same shape the MackBee siblings have in
  `provision-family.mjs`;
- **contract v3.0.1 (Sprint 20):** `whitfield` carries `signup`/`createdBy`/`stripeCustomerIds: []`/`emergencyContact: null`/`guardian.relationship` (the self-signed-up family; `parker` stays legacy); athletes carry `handicap` and `loginEmail`; `athletes/nico.billing.status: 'pending'` (jordan/reese absent == active); one open `loginInvites/reese.whitfield@example.com`; packages write `stripePriceId: null` explicitly (never an id - `write-packages.mjs` is the only writer); specialist slots carry `durationMinutes` (phil 45, mental 30) with Yannick at 4:00 / 4:30 / 5:00 PM; and one Calendly trio - `sessions/cal-seedevt0001` (`bookable: false`, `source: 'calendly'`), `bookings/reese_cal-seedevt0001` (`source: 'calendly'`, `flag: null`, `createdBy: 'system'`) and `calendlyEvents/seedinv0001_invitee.created` (`applied`). `npm run packages:emulator -- --mode test --yes` then stamps the committed TEST ids (`functions/config/stripe-catalogue.json`, `995e677`) onto the emulator's packages docs; `--mode live` refuses until the owner pastes the LIVE ids.
- **contract v2.0 (Sprint 12 pin A) — `athletes.packageId` moves onto the
  token catalogue and `fitnessPackageId` is deleted entirely** (not merely
  left unset): jordan (was `g-8-3`) → `t-12`; reese and nico (both were
  `g-4-2`) → `t-6` each — "sensible t-* for reese/nico" per TEAM.md, not an
  invented upgrade. `seed.js`'s `HOUSEHOLD.children[].packageId` (still the
  old two-pool ids — `seed.js` is the data-routing/frontend lanes' file, not
  this script's to edit) is overridden locally via `WHITFIELD_PACKAGE_IDS`
  rather than read through, the same "override the scaffold's stale ids
  locally" move `WHITFIELD_DOBS` already makes for `dob`;
- **contract v2.0 (Sprint 12 pin B) — every seeded `bookings` doc carries
  `periodKey`**, computed with the seam's `periodFor(session.date,
  household.periodAnchorDay)` — the Whitfield athletes' regular and
  specialist bookings alike (jordan's past Phil bookings included), all
  against `WHITFIELD_ANCHOR_DAY` (`1`). **`pool` is no longer written at
  all** — the three literal `pool: 'specialist'` bookings from Sprint 9/11
  now carry `periodKey` in its place, no `pool` key at all;
- **contract v2.0 (Sprint 12 pin J) — the generated season's shape changes**
  with `schedule.js`: per-day weekday blocks (Mon/Wed 3-5 PM, Tue/Thu 3-6 PM,
  Fri 3-4 PM, 60 min each), Saturday 9 AM training + four 60-min blocks
  (10/11 tournament, 12/1 training) plus ONE seed-only `type: 'adult',
  bookable: false` display entry for the real Saturday 2-4 PM college /
  Elite Am / Mid Am block. `overflow` and the `friday` generator option are
  both deleted; every regular session gets `bookable: true`; `capacity` is a
  flat `15` (was already `15` for both `training`/`tournament`, so no
  numeric change, only a shape one). See
  [Periods, tokens and booking windows](#periods-tokens-and-booking-windows-contract-v20-sprint-12-part-1)
  above for the schema-level detail and
  [Calendar → sessions sync](#calendar--sessions-sync) below for why
  `sync-calendar-sessions.mjs` needed no equivalent change;
- seeds real `bookings` for all three Whitfield athletes against real
  generated session ids (contract v1.4) and increments each referenced
  session's `booked` to match — the same invariant the booking transaction
  maintains live, so `booked` and the `bookings` collection agree from the
  first seed rather than only after a QA pass exercises real bookings;
- seeds `athletes` with the OWNER-SUPPLIED dobs for the three Whitfield
  kids (contract v1.6 + the v1.6.1 amendment, 2026-09-10 — not invented),
  landing them in three different age brackets as of `SEASON_BOUNDS.start`
  — see `WHITFIELD_DOBS` in the script for the exact values.
- seeds `tournamentResults` (contract v1.6) for two real generated Saturday
  tournament sessions, referenced by id and validated against `buildSeason()`
  the same way the bookings above are — a stale session id throws instead of
  silently writing an orphaned result. `score` (strokes, validated integer
  `18..200`) and a write-time `bracket` snapshot (computed from each
  Whitfield athlete's seeded dob, evaluated as of `SEASON_BOUNDS.start`) are
  written; `position` is never written anywhere — see the collection's notes
  above for the derive-at-read math, and the script's own sanity output
  (printed, never stored) for the derived per-bracket positions the seeded
  scores produce. The referenced sessions' attendance (`bookings.status`) is
  kept coherent with the results — every athlete who has a result there is
  `attended`, not merely `confirmed`.
- seeds specialist 1-on-1 `sessions` (contract v1.7, Sprint 9) —
  `addSpecialistSessions()` hand-adds `YYYY-MM-DD-s<n>` slots (Yannick
  Tue/Thu late afternoon, Phil Mon/Wed/Fri, three 45-minute slots per working
  day) for the `SPECIALIST_BOOKING_WINDOW_DAYS` days starting the day the
  script *runs* — computed off `new Date()` at run time, never a hardcoded
  date, so the window always tracks "the next two weeks" relative to whenever
  the seed actually runs — plus ONE pre-booked `mental` booking for jordan
  (`pool: 'specialist'`, `status: 'confirmed'`, `createdBy: 'parent-dana'`)
  against the first Yannick slot the window generates, with that session's
  `booked` incremented to match (the same invariant as the Whitfield bookings
  above). See [Specialist 1-on-1 sessions](#specialist-1-on-1-sessions-phil-and-mental-contract-v17-sprint-9)
  above for the full field shape and the id convention. The script's sanity
  output lists every hand-seeded specialist session and the pre-booked
  booking by id.
- bundles `data/parent.js` too (contract v1.8, Sprint 10), so
  `NOTIFICATION_CATEGORIES` is read off the same module the screen renders
  from rather than retyped — see the `notificationPrefs` bullet below.
- seeds ONE pending `enrollmentRequests` doc (contract v1.8, pin A) keyed
  `parent-new` — a NEW, unprovisioned QA uid; no `users/parent-new` doc
  exists (the sanity output prints `exists=false` for it, so the invariant
  is checked every run, not just asserted in a comment). Two athletes, one
  with a dob and tier, one with neither; all three consents true.
- seeds two `athletes/jordan/diagnostics` captures (contract v1.8, pin C):
  an older `published-1` with a value for **every** `DIAGNOSTIC_SECTIONS`
  field id (13, enumerated [above](#athletesathleteiddiagnosticscaptureid-contract-v18-sprint-10)),
  and a newer `draft-1` with just the launch monitor's first two fields —
  both `capturedBy: 'coach-luke'`.
- seeds ONE pending `staffInvites` doc (contract v1.8, pin E) at a
  clearly-fake address (`invite-test@example.com`, role coach,
  `specialistId: null`) — never a real person's email. There is no
  matching auth account for it anywhere, so it stays `pending`;
  `provision-family.mjs` is what would resolve and consume it, against
  production, not this script.
- seeds `notificationPrefs` (contract v1.8, pin G) on every `users` doc:
  parent-dana gets a real map, one entry per `NOTIFICATION_CATEGORIES` id,
  each `{ email: true, sms: false }`; every other seeded `users` doc gets
  `notificationPrefs: null`.
- seeds `coachNote` (contract v1.8, pin H) as `null` on every session
  **except** jordan's past attended training block `2026-11-09-2` (already
  in the `bookings` seed above), which gets a real note — so the roster's
  session-note editor has one real pre-filled example alongside the blank
  default.
- seeds `athletes.fitnessPackageId` (contract v1.9, Sprint 11 pin A):
  `WHITFIELD_FITNESS_PACKAGE_IDS` sets jordan `f-8`, reese `f-4`, and nico an
  **explicit `null`** — chosen over omitting the key. All three other
  package-shaped pointers on `athletes` (`packageId`, `contractMinutes`,
  `coachId`) are always-present fields that are sometimes null, never an
  absent key, and nico already carries that "here's the real empty state"
  role for `contractMinutes` (above) — giving `fitnessPackageId` the same
  treatment keeps one consistent rule for the whole document instead of two
  different ways to mean "nothing here," and it means the emulator's raw
  Firestore data (e.g. the Emulator UI, or a REST read) shows the field on
  every athlete rather than requiring a reader to already know which keys
  can be silently missing. Rules/hooks/`entitlementsFor()` don't care either
  way — absent and explicit `null` are pinned to read identically.
- seeds TWO PAST `phil` bookings for jordan (contract v1.9, Sprint 11 DB
  lane bullet) — `addPastPhilSessions()` hand-adds two `phil` sessions on
  the two most recent Phil working days (Mon/Wed/Fri) strictly earlier in
  the **current calendar month** relative to when the script runs (never
  the generated season, which starts 2026-11-02 — the current date can
  precede season start, as it does for this pin), then books jordan into
  both with `status: 'attended'` (both already happened) and `pool:
  'specialist'`. Together with jordan's `f-8` fitness package above, this
  makes `entitlementsFor()`'s derived Phil `used` **2 of 8** the moment the
  emulator loads — matching TEAM.md pin G's own example copy
  ("2 of 8 performance sessions used this month") verbatim, not a
  coincidence. Throws if fewer than two such days exist earlier in the
  current month (possible in the first few days of a month) rather than
  silently seeding less than the pin asks for.
- seeds ONE upcoming `phil` booking for reese (contract v1.9, Sprint 11 DB
  lane bullet) — against the first Phil slot `addSpecialistSessions()`'s
  forward window generates, `status: 'confirmed'`, `createdBy: 'parent-dana'`
  (reese has no `users` doc of her own, same parent-linkage reasoning as her
  other bookings above). Combined with jordan's existing upcoming `mental`
  booking (contract v1.7, above), the household now has an upcoming
  specialist row for **two different members**, not just one, so the Family
  Reservations view (pin F) has more than a single-member story to render.
- sets a real `sessions.coachId` on jordan's upcoming `2026-11-02-1`
  training booking (contract v1.9, Sprint 11 DB lane bullet) — `buildSeason()`
  always leaves `coachId` null (schedule.js never assigns one), so without
  this the Reservations view's derived `instructor` field would have no
  real training-block example anywhere in the seed. Set to `coach-luke`,
  jordan's own assigned coach, after the `WHITFIELD_BOOKINGS` loop builds
  that session's booking.
- **contract v1.9.1 (owner ruling, Sprint 11 amendment, applied mid-sprint):**
  `packages/elite` and `packages/elite-247` now carry `philSessions: 16`
  (routing lane's edit to `ELITE_TIERS` in `frontend/src/portal/data/packages.js`;
  `yannickSessions` stays null, unchanged). Both this script and
  `provision-family.mjs` bundle `ELITE_TIERS` from that file and spread every
  field through unchanged (`{ ...fields(p), kind: 'elite' }` — see
  `buildDocs()`/`loadPackages()`), so the `16` reaches `packages/elite*` with
  **no script change** the moment routing's edit merges; neither script ever
  hand-copies a catalogue value. **No emulator athlete is seeded on an Elite
  package** — all three Whitfield kids are `g-8-3`/`g-4-2` golf packages
  (`seed.js`), so `entitlementsFor()`'s `source: 'elite'` branch for Phil is
  not exercisable against this emulator seed at all. Not fixed by reassigning
  a Whitfield package (no invented data on top of an existing real demo
  story) — flagged here instead: `provision-family.mjs`'s MackBee household
  already has a real Elite athlete for this, Quinn MackBee (`makel-test-3`,
  `packageId: 'elite'`), but that only reaches **production**, gated behind
  a signed-in account and never run by this seed. If the PM wants the Elite
  branch exercisable in the emulator for the live pass, that needs a new
  seeded athlete (or a deliberate package change on an existing one), which
  is a product decision, not this report's call to make unilaterally.
  **Resolved, contract v2.0 (Sprint 12):** TEAM.md's Sprint 12 DB-lane bullet
  makes that product decision explicitly ("one Elite athlete") — this seed
  now adds the small `parker` household with one Elite athlete,
  `sage-parker`, per the note earlier in this section (search
  "`parker`" above), rather than reassigning a Whitfield package.
  `packages/elite-247` no longer exists in the v2.0 catalogue (retired,
  pin A) — 24/7 access is `packages/elite.access247: true` now, not a
  second tier — so this whole bullet's `philSessions`/`elite-247` mechanics
  are historical record of the v1.9.1 ruling, not current schema.
- **contract v2.1 (Sprint 13 pin, "token model Part 2") — the exact seed
  facts the pin lists**, no more, no fewer, all computed off the seed's own
  runtime clock (`today`, already built for the `contractLogs` block) rather
  than hardcoded, the same discipline every date-dependent fact in this
  script already follows:
  - `tokenPeriods/jordan_<currentPeriodKey>` — `granted` read off jordan's
    live `t-12` package (not hand-typed 12, though it evaluates to 12),
    `source: 'stripe'`, a fake `eventId: 'evt_seed_1'`. `<currentPeriodKey>`
    is `periodFor(today, 1)`'s own output at run time, so the doc id itself
    tracks whenever the seed actually runs.
  - `graceTokens/grace-1` for reese (`reason: 'session-cancelled'`,
    `sourceSessionId: '2026-11-11-0'`, `expiresAt` = today + 20 days,
    `createdBy: 'ops'`) — combined with the next bullet into ONE coherent
    minting scenario (my judgment call, flagged in the report: pin E's own
    two minting triggers make "staff cancelled a session reese was
    confirmed on" the natural story, not two unrelated facts that happen to
    share a name).
  - The cancelled-session/cancelled-booking pair (pin G): a real generated
    session, `2026-11-11-0` (Wed 3 PM training, not otherwise referenced by
    this seed), gets `status: 'cancelled'` and `booked: 0`; reese's booking
    there, `reese_2026-11-11-0`, gets `status: 'cancelled'`,
    `cancelledBy: 'system'`, `cancelReason: 'session-cancelled'` — the grace
    token above is minted for exactly this event.
  - ONE seed-only FULL session, `2026-11-16-w0` — **the single exception to
    the flat capacity-15 rule (pin J) anywhere in this seed**, a new
    hand-added letter (`-w`) on the existing `-s`/`-x` extras convention,
    `capacity: 2`, booked by jordan and reese (both `confirmed`, `periodKey`
    set via `periodFor()`), with `waitlist/2026-11-16-w0_nico` completing
    the scenario so the waitlisted state (row, position, "Join waitlist")
    is exercisable without inventing 15 fabricated bookings on a real
    session. This session's `status` is set explicitly to `'scheduled'` —
    unlike the generic generated-session loop, which still writes no
    `status` field at all (the pre-existing gap this document has flagged
    since Sprint 9); see the `waitlist` collection section above for why
    this matters to routing's pin-F rule.
  - `households.membership` — **absent on `whitfield`** (stays active, zero
    migration) and `{ status: 'past_due', stripeSubscriptionStatus:
    'past_due', currentPeriodStart, currentPeriodEnd, lastEventId:
    'evt_seed_2', updatedAt }` on `parker` (its own anchor-15 period via
    `periodFor()`, never hand-typed), plus `parker.stripeCustomerId:
    'cus_seed_parker'` (was `null`).
  - `stripeEvents/evt_seed_2` — `{ type: 'invoice.payment_failed', customer:
    'cus_seed_parker', householdId: 'parker', receivedAt, outcome:
    'past_due' }`, cross-referencing `parker`'s `stripeCustomerId` and
    `membership.lastEventId` above rather than an independent fixture.
  - `sessions.booked` stays consistent with `bookings` throughout (the same
    invariant every earlier booking loop in this script maintains): the
    cancelled session's `booked` drops to `0`, the FULL session's `booked`
    is written as `2` (== its capacity), matching what a real transaction
    sequence would have left behind.
  - `main()`'s print-plan output gains five dedicated blocks (`tokenPeriods`,
    `graceTokens`, the cancelled session/booking pair, the FULL
    session/waitlist trio, `households.membership` + `stripeEvents`) listing
    every new doc by id, alongside the generic per-collection sample dump
    every collection already gets.
