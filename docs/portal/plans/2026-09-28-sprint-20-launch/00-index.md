# Sprint 20 - Launch: plan index (read this first)

Owner rulings 2026-09-28. Sign-up email **2026-10-01**; booking opens for
token members **2026-10-10 07:00 America/Chicago** (Elite books at once);
season starts **2026-11-03**. Spec v3.0.3, contract v3.0.2 + D1-D19, four lane
plans reviewed and fixed 2026-09-28 (spec 16.1). Base branch `portal/r3` at
`0295df9`; four commits ahead of `origin/main`, unpushed by the owner's
ruling (the push is part of the launch bundle, section 7).

## 1. What is where

| Read | For |
|---|---|
| `docs/portal/SPRINT-20-LAUNCH.md` | the spec: rulings (0), sign-up (2), child claim (3), Stripe (4), windows and the Oct 10 gate (5), Yannick via Calendly + Phil (6), admin report (7), Blaze bundle (8), launch fixes (9), data deltas (10), verification (11), **owner checklist (12)**, lanes + cut line (13), accepted gaps (14), review records (16, 16.1) |
| `01-interfaces.md` | the cross-lane contract - callables (1), Firestore shapes with "absent ==" (2), client constants (3), hook contracts (4), rules helpers (5), functions internals (6), scripts (7), env/secret NAMES by host (8), shared copy (9). The contract wins over a stale lane plan. |
| `10-routing.md`, `-part2.md`, `-part3.md` | routing lane: Tasks 1-5 / 6-11 / 12, 12b, 13 |
| `20-frontend.md`, `-part1b.md`, `-part1c.md`, `-part2.md`, `-part3.md`, `-part4.md` | frontend lane: Tasks 1-2 / 3-4 / 5-7 / 8-10 / 11-13 / 14-15 + self-review |
| `30-db.md`, `-part2.md` | db lane: Tasks 1-6 / 7-11 + self-review |
| `40-functions.md`, `-part2.md` ... `-part7.md` (+ `-part6b.md`) | functions lane: Tasks 1-4 / 5-6 / 7 / 8 / 9 / 10 (6 + 6b) / 11-13 + handoffs |
| `docs/portal/RUNBOOK-SPRINT-20.md` | the owner deploy runbook - written by functions Task 12; until then section 7 below and spec 12 |
| GitHub `MMackbee/rypacad` issues #1-#29 | tracking; labels `lane:*`, `pm`, `owner-action`, `blaze`, `day-1`; milestones "Oct 1 - sign-up email" (#1-#25, #28, #29) and "Oct 10 - booking opens" (#26, #27). All 29 open. |
| `docs/portal/TEAM.md` | the lane process (worktree per lane, `agent/<lane>/<task>` off `portal/r3`, PM merges `--no-ff`) |

Every plan file opens with the required sub-skill line (`superpowers:subagent-driven-development`
or `executing-plans`), checkbox steps, and a Global Constraints block; the
constraints are the same across lanes (window 30 / Elite 45, `BOOKING_OPENS_AT =
1791633600000`, charging never branches on session type, tokens derived never
stored, closed `hasOnly` lists, files under 500 lines, no secret VALUES
anywhere, CRLF-safe edits, the `Co-Authored-By: Claude Fable 5.1
<noreply@anthropic.com>` trailer, agents never push or deploy).

## 2. Scope at a glance

| Lane | Agent | Tasks | Issues | Day-1 | MAY SLIP (Oct 10) |
|---|---|---|---|---|---|
| routing | `data-routing` | 14 (1-13 + 12b) | #1-#6 (+ #26 post-launch) | 1-8, 12 | 9 (claim parts only), 10, 11, 12b, 13 |
| frontend | `frontend-dev` | 15 | #7-#12 (+ #27 post-launch) | 1-8, 10, 14, 15 | 9 (facility card only), 11, 12, 13 (the report; the role change ships day 1) |
| db | `db-engineer` | 11 | #13-#15 | all 11 | none |
| functions | `backend-dev` (Blaze) | 13 | #16-#18, #28, #29 | 1-9, 11, 12 | 10 (calendlyWebhook), 13 (harness top-up) |
| PM | `pm-senior` | worktrees, merge order, integration checks, `/code-review` on the diff, `qa-tester` pass | #19 | - | - |
| owner | you | spec 12 checklist | #20-#25 | - | - |

53 lane tasks. The cut-line flag for child logins is `CHILD_LOGIN_ENABLED` in
`frontend/src/portal/data/signup.js` (frontend Task 2): flip it to `false` to
hide the own-login toggle if `claimInvite` (functions Task 8 / routing Task 9)
slips past Oct 1.

## 3. Execution order

**Day 2 (Sep 29) - four worktrees in parallel.**

- routing: **1, 2, 3, 6, 9 first** (the seams every frontend screen imports),
  then 4, 5 (rules; emulator only), then 7, 8, 10, 11, 12, 12b, 13. (D14)
- frontend: 1 -> 15 in order. **Task 4 -> Task 5 is one uninterrupted unit**
  (Task 4 leaves the worktree RED and uncommitted; the same worker runs Task 5,
  whose Step 7 is the first commit for both). Before Task 5 the frontend
  worktree is **rebased onto the routing first group** - check `ls
  frontend/src/portal/hooks/callables.js` and `grep -n BOOKING_OPENS_LABEL
  frontend/src/portal/data/calendar.js`; both must succeed. Until then Task
  1's BookingReasons test reads "Booking opens undefined" - rebase, do not
  patch. Later routing merges (7, 8, 10, 11, 12, 12b, 13) are NOT waited on:
  every day-1 screen carries the namespace-import + inert-fallback guard.
- db: 1 -> 11; 3 before 8, 8 before 9, 10 before 11 (shared files). Task 2's
  e2e dry-run test self-skips until routing's `packages.js` (window 30) is
  merged - "6 pass + 1 skipped" is the expected pre-merge state.
- functions: **1, 2, 3 in that order**, then 4, 5, 6, 7 (7 needs 3, 5, 6), 8
  (creates `secrets.js`), 9, 10, then **11 only after db Task 7 is merged**
  (D15: `.env` / `.env.local` split), then 12, 13. The emulator harnesses
  (Task 7 Step 5, Task 10 Step 6, Task 11 Step 6, Task 13) need the worktree's
  gitignored `functions/.env.local` + `.secret.local` from Task 11 Step 4 -
  write those as soon as db Task 7 lands, or run the harness steps after
  Task 11.

**Day 3 (Sep 30) - integration, `--no-ff`, in this order:** db -> routing ->
frontend -> functions (functions is its own package; db's `env.template`
rewrite must precede functions Task 11's verification of it). Then the PM
gate:

1. Full frontend jest suite green: `cd frontend && CI=true npx react-scripts test --watchAll=false`; `cd frontend && npm run build`; `npx eslint src/portal`.
2. Rules probe: shared emulator up, `node --env-file=scripts/emulator.env scripts/verify-rules.mjs` -> `ALL PASS`.
3. db: `node --test scripts/test/` -> 9 pass (Task 2's dry-run test no longer skips once `packages.js` is merged); `node scripts/seed-firestore.mjs --dry-run` clean.
4. functions: `cd functions && npm run lint`, every unit file, then the six harnesses **one at a time** on the isolated emulator (Task 11 Step 6 lists the order); expected counts `verify-family.js` 50 checks, `verify-calendly.js` 44 checks / 15 ledger rows.
5. **Claim end to end (the only pre-production run):** from the integrated worktree with `functions/` installed and its `.env.local` / `.secret.local` in place, ONE emulator `npx firebase-tools emulators:start --only firestore,auth,functions --project rypacad`, seed with `npm run seed:emulator`, on :3003 create a login as `reese.whitfield@example.com`, open the verification link the Auth emulator logs, "Check again" -> `claimed`, `provisioned` flips without a reload (routing Task 9's integration bullet).
6. `qa-tester` pass under every role on the emulator sandbox (#19); `/code-review` on the integrated diff.
7. Remove the worktrees and branches (teardown order in section 6) before any dedupe tooling runs.

## 4. The cut line, in one place

| Slips to Oct 10 without breaking the Oct 1 email | Ships day 1 regardless |
|---|---|
| routing 9's claim parts (`createLogin` / `refresh()` are cut-line), 10, 11, 12b, 13 | rules (4, 5), constants (1, 2), hub pending (3), callables (6), live.js gates (7), bookRecurring gates (8), billingStatus on home hooks (12) |
| frontend 9's facility card, 11 (Calendly branch), 12 (non-cancellable rows), 13's report | SignUp, Registration + Success + PayButton, NotProvisioned, pending banners / `?paid=` / Billing hero, launch fixes, the proactive Oct 10 gate UI, the mental-role change |
| functions 10 (`calendlyWebhook`), 13 (harness top-up) | lib/prepaid/catalogue, the Stripe rework (7), `createFamily` / `addAthletes` / `claimInvite` (8), `createCheckoutSession` (9), `index.js` + secrets (11), runbook (12) |
| db: nothing | all 11 |

Post-launch issues: #26 retire the `BOOKING_OPENS_AT` clause and constant
after Oct 10; #27 a Calendly reconciliation view for unresolved / flagged
bookings.

## 5. Task tables

Verification is the task's final run step; every task ends in its own commit
with the trailer. "RED" = the task opens by writing a failing test.

### 5.1 routing (`10-routing*.md`)

| # | Title | Closes | Cut | Verify |
|---|---|---|---|---|
| 1 | Window 30, the Oct 10 gate, season start (RED) | #4 | day-1 | jest `src/portal/data` |
| 2 | Calendly link builder + specialist registry (RED) | #4 | day-1 | jest `data/calendly.test.js` |
| 3 | `statusFor('pending')`, per-athlete billing in the hub, `usePaymentConfirmation`, portal-URL warning (RED) | #5 | day-1 | esbuild `hooks/billing.js`; jest `data`, `hooks/billing.test.js` |
| 4 | Rules - athlete shape, per-athlete billing gate, Oct 10 gate | #1 | day-1 | `node --env-file=scripts/emulator.env scripts/verify-rules.mjs` -> ALL PASS |
| 5 | Rules - Calendly cancel guard, `loginInvites` / `calendlyEvents` reads, parent household exclusions | #1 | day-1 | same probe (Task 4 + 5 lines) |
| 6 | `firebase.js` functions client + `hooks/callables.js` (RED) | #3 | day-1 | jest `hooks/callables.test.js`; esbuild `firebase.js` |
| 7 | `live.js` gates - billing, opens-at, Calendly cancel, next-period copy (RED) | #3 | day-1 | jest `hooks/live.test.js`; esbuild |
| 8 | `bookRecurring` gates once before its loop (K03) | #6 | day-1 | esbuild `hooks/index.js`; jest `src/portal/hooks`; :3003 check |
| 9 | `useAuthSession` - create login, `refresh()`, claim on sign-in, verification (RED) | #2 | MAY SLIP (claim parts) | jest `hooks/useAuthSession.test.js`; routing-alone :3003 check ends in `claimState 'error'` by design; the `claimed` path is PM-gate step 5 |
| 10 | Specialist slots - durations, Calendly mode, gates, K04 month (RED) | #6 | MAY SLIP | jest `hooks/index.test.js` |
| 11 | Rows carry `source` + real durations; Calendly rows not cancellable; attendance block duration | #6 | MAY SLIP | esbuild; jest `src/portal/hooks`; :3003 with a seeded `cal-` booking |
| 12 | Home and membership hooks expose `billingStatus` | #6 | day-1 | esbuild; jest; :3003 as the seeded parent |
| 12b | Child-login line - `loginEmail` + `login { state, claimedAt }` (RED) | #6 | MAY SLIP (with claimInvite) | jest `data/signups.test.js`, `src/portal/hooks` |
| 13 | `useSignups` + the admin `pending` bucket (RED) | #6 | MAY SLIP | jest `src/portal` all PASS; :3003 as the seeded owner |

Shared emulator (started from `wt-routing`, rules hot-reload): `npx
firebase-tools emulators:start --only firestore,auth --project rypacad`
(Firestore 8080, Auth 9099, UI :4000). Dev server `PORT=3003
REACT_APP_USE_EMULATORS=true npm start` from `frontend/`; sign in with
`window.__rypTestAuth.signInAs(<uid>)`. Owns `data/signups.js` (D1) and the
two `PortalRoutes.js` attendance-block edits (D2).

### 5.2 frontend (`20-frontend*.md`)

| # | Title | Closes | Cut | Verify |
|---|---|---|---|---|
| 1 | Test scaffolding (`setupTests.js`, `renderScreen`), Field labels, shared reason copy, 90-minute tier | part of #8, #10, #12 | day-1 | jest `components/BookingReasons.test.js` (4) |
| 2 | Sign-up form helpers - age, validation, `createFamily` payload | part of #8 | day-1 | jest `data/signup.test.js` (9) |
| 3 | SignUp screen, SignIn "Create a login", footer to `/portal/signup` | #7 | day-1 | jest `screens/SignUp.test.js` (4) |
| 4 | Registration steps cut out of `Registration.js` - **leaves the worktree RED, no commit** | part of #8 | day-1 | jest `screens/RegistrationSteps.test.js` (4) |
| 5 | Registration state machine - `createFamily` / `addAthletes`, provisioned redirect, link mode (**starts RED**; rebase gate first) | part of #8, #12 | day-1 | jest `screens/Registration.test.js` (2); first commit for 4 + 5 |
| 6 | PayButton + Registration Success with per-athlete pay buttons | part of #8, #12 | day-1 | jest `PayButton.test.js` (3), `RegistrationSuccess.test.js` |
| 7 | NotProvisioned - verify-email, stranger, already-claimed, legacy states | part of #9, #12 | day-1 | jest `screens/NotProvisioned.test.js` (4) |
| 8 | Billing copy, PendingBanner, PaymentConfirming, ParentDashboard `?paid=` | part of #9 | day-1 | jest `data/billingCopy.test.js` (4), `ParentDashboard.test.js` (2) |
| 9 | FacilityCard, athlete home + Membership pending state | part of #9 | MAY SLIP (facility card only) | jest `Membership.test.js`, `FacilityCard.test.js` |
| 10 | Billing hub pending hero, plan/connected copy, facility rows; AthleteDetail login line | rest of #9 | day-1 | jest `Billing.test.js` (2), `AthleteDetail.test.js` |
| 11 | SpecialistBooking - Book with Yannick (Calendly) + real durations | part of #10 | MAY SLIP | jest `data/specialistGate.test.js`, `SpecialistBooking.test.js` (3) |
| 12 | Calendly rows not cancellable in MySchedule / Reservations | rest of #10 | MAY SLIP | jest `MySchedule.test.js`, `Reservations.test.js` |
| 13 | Admin sign-ups report, dashboard Sign-ups card, admin hidden from mental | #11 | MAY SLIP (report only) | jest `signupsReport.test.js` (3), `AdminSignups.test.js`, `AdminDashboard*.test.js`; grep: no screen imports `data/signups` |
| 14 | Launch fixes - catch-all route, email copy, 375px pass | part of #12 | day-1 | jest `PortalRoutes.test.js` + whole suite; `npm run build`; manual 375x812 pass on :3001 seed mode |
| 15 | Proactive Oct 10 gate UI - BookSession banner + inert Reserve, SpecialistBooking in-app branch | rest of #12 | day-1 | jest `BookSession.test.js` (fake timers); manual clock check |

No emulator in this lane: jest/jsdom with `src/firebase.js` globally mocked.
Manual passes run `PORT=3001 npm start` in seed mode. `PortalRoutes.js` is
edited by Tasks 3, 5, 7, 13, 14 (merge in task order) and by routing Task 11
on disjoint lines.

### 5.3 db (`30-db*.md`)

| # | Title | Closes | Cut | Verify |
|---|---|---|---|---|
| 1 | Confirm the committed Stripe catalogue (never write it - D19) + `write-packages.mjs` planner (RED) | #13 | day-1 | `node --test scripts/test/` (5) |
| 2 | `write-packages.mjs` main - target, diff, masked write (RED) | #13 | day-1 | `node --test scripts/test/` -> 7 pass (6 + 1 skipped until routing's `packages.js` merges) |
| 3 | Calendar sync - drop `mental|yannick`, fix the end-time regex, fixture + test (RED) | #14 | day-1 | `node --test scripts/test/` -> 9 pass |
| 4 | Seed - specialist durations, Yannick at 4:00 / 4:30 / 5:00 | #14 | day-1 | `node scripts/seed-firestore.mjs --dry-run` greps |
| 5 | Seed - a self-signed-up family, pending billing, handicap, `loginEmail`, one open invite, packages without price ids | #14 | day-1 | seed dry-run greps (`loginInvites/reese.whitfield@example.com`, `athletes/nico`) |
| 6 | Seed - one Calendly-sourced session, booking and ledger row | #14 | day-1 | seed dry-run greps (`cal-seedevt0001`) |
| 7 | `functions/` env split - secrets to `.env.local`, `STRIPE_MODE` in `.env`, `env.template` rewrite | #15 | day-1 | greps on `functions/.env` (0 secret names) and `.secret.local` (3 lines); **precedes functions Task 11 (D15)** |
| 8 | DATA-MODEL.md - new fields, two new collections, the `cal-` id form | #15 | day-1 | `grep -c "Sprint 20"` >= 20 etc. |
| 9 | DATA-MODEL.md - window 30, v3.0 query reasoning, seeding workflow | #15 | day-1 | no `32` window lines remain |
| 10 | Window 30 in every other doc | #15 | day-1 | grep baseline -> 0 |
| 11 | DECISION-GAPS accepted gaps + rulings, TEAM.md Sprint 20 stub | #15 | day-1 | greps (`48-hour rule`, `MENTAL_MONTHLY_CAP`) |

No emulator needed for the tests; `npm run packages:emulator -- --mode test
--yes` (new root script) stamps the committed TEST ids onto the emulator's
packages docs. The lane never edits `hooks/index.js`, rules or source, and
never rewrites `functions/config/stripe-catalogue.json` (committed `1b3dc3d`:
TEST ids filled, LIVE null until the owner pastes them).

### 5.4 functions (`40-functions*.md`)

| # | Title | Closes | Cut | Verify |
|---|---|---|---|---|
| 1 | `lib.js` launch helpers (`chicagoTime`, `bookingOpen`, `ageAt`, `membershipAllowsBooking(household, athlete)`) (RED) | part of #17, #18 | day-1 | `node portal/lib.test.js` (31) + lint |
| 2 | `prepaid.js` - the prepaid month + `tiny.js` runner (RED) | part of #17 | day-1 | `node portal/prepaid.test.js` (5) |
| 3 | `catalogue.js` (reads the committed JSON; never writes it - D19) (RED) | part of #17 | day-1 | `node portal/catalogue.test.js` (3) |
| 4 | Payment-received copy + the two Calendly skips (RED) | part of #18, #29 | day-1 | `node portal/notices.test.js`; `node test/verify-notifications.js` |
| 5 | `stripe-resolve.js` - Basil accessors + resolution order (RED) | part of #17 | day-1 | `node portal/stripe-resolve.test.js` (7) |
| 6 | `stripe-billing.js` - per-athlete billing writers, `otherTierLive` (RED) | part of #17 | day-1 | `node portal/stripe-billing.test.js` (5) |
| 7 | `stripe.js` rework - `checkout.session.completed`, per-athlete resolution, `invoicePeriod`, `revoke.revokeAthlete` (D17), launch harness STEP A-E | #17 | day-1 | `node test/verify-lane.js`, `node test/verify-stripe-launch.js` -> ALL CHECKS PASSED |
| 8 | `family.js` - `createFamily`, `addAthletes`, `claimInvite` + `secrets.js` (RED) | #16 (callables #28) | day-1 | `node portal/family-validate.test.js` (4); `node test/verify-family.js` (50 checks) |
| 9 | `checkout.js` - `createCheckoutSession` (prepaid line, trial to the 1st, D11 48-hour rule, D12 scopes) (RED) | part of #17 (#29) | day-1 | `node portal/checkout.test.js` (5); curl 401 after Task 11 |
| 10 | `calendly.js` - `verifyCalendlySignature` + `calendlyWebhook` (RED) | #18 | MAY SLIP | `node portal/calendly-verify.test.js` (4); `node --env-file=.env.local test/verify-calendly.js` (44 checks) |
| 11 | `index.js` exports, `runWith` secrets on all 13 functions, `check-exports.js`, `.env.local` / `.secret.local` (RED) | #28 | day-1 (**after db Task 7**) | `node test/check-exports.js` -> 13 exported; all six harnesses in order |
| 12 | `docs/portal/RUNBOOK-SPRINT-20.md` - the owner deploy runbook | supports #22 (no lane issue) | day-1 | secret-pattern grep prints nothing; 8 `functions:secrets:set` lines |
| 13 | `verify-stripe-launch.js` top-up - Basil `subscription.updated`, facility lapse, `stripe-lookup-failed` | rest of #17 | MAY SLIP | `node test/verify-stripe-launch.js` STEP F-H |

Isolated emulator (never 8080): `cd functions && npx firebase-tools
emulators:start --only firestore,functions --project rypacad --config
../firebase.functions-lane.json` (Firestore 8082, functions 5001). Every
harness wipes and reseeds that instance - never two at once. Task 9 Step 6
is an OWNER-run test-mode Checkout verification on rypacad.ryptest.com after
the TEST deploy, not an agent step.

## 6. Worktree setup (PM, before spawning)

Four worktrees, siblings of `rypacad`: `wt-routing`, `wt-frontend`, `wt-db`,
`wt-functions`, each `git worktree add ../wt-<lane> -b
agent/<lane>/sprint20-launch portal/r3`. Then, per worktree that runs the app:

1. Junction `node_modules` from PowerShell: `New-Item -ItemType Junction -Path wt-<lane>\frontend\node_modules -Target rypacad\frontend\node_modules` (and `functions\node_modules` for `wt-functions`).
2. `cp rypacad/frontend/.env wt-<lane>/frontend/.env`; the file carries `REACT_APP_PORTAL_LIVE_DATA=true`, so every lane dev server overrides: routing `PORT=3003 REACT_APP_USE_EMULATORS=true npm start`, frontend `PORT=3001 npm start` in seed mode. **localhost:3000 is production - never open or sign in there.**
3. The shared emulator starts from `wt-routing` (`--only firestore,auth`); db seeds it from `wt-db` with `npm run seed:emulator`; the functions lane runs its own isolated instance (8082/5001). The functions worktree also needs gitignored `functions/.env` (non-secret keys) copied in, and writes its own `.env.local` / `.secret.local` in Task 11 Step 4.
4. Put the port/env overrides verbatim in each lane prompt; every brief says: stop your own dev server by PID from `netstat -ano | findstr :<port>` - **never `taskkill /F /IM node.exe`**; never `npm install`; never push, never deploy; `--dry-run` only for provisioning/sync scripts.

Teardown: remove the junctions first (`cmd /c rmdir` on the link), stop the
emulators, then `git worktree remove` and delete the branches; restart the
:3001 QA emulator from `rypacad` afterwards. Dedupe tools sweep `wt-*` as
duplicates - never run cleanup mid-sprint.

## 7. Owner checklist and the held launch bundle

| Issue | When | Step (spec 12) | Status |
|---|---|---|---|
| #20 | now | 12.1 Firebase Auth: Email/Password ON; authorized domain `rypacad.ryptest.com`; email templates stay DEFAULT | owner, console |
| #21 | now | 12.2 Stripe: products + monthly prices (test AND live), customer portal link -> `REACT_APP_STRIPE_PORTAL_URL`, a restricted key per mode (Checkout Sessions write, Customers read, Prices read - D12); confirm the six test prices are RECURRING monthly; paste the LIVE ids into the `live` block of the catalogue | test ids committed (`1b3dc3d`); live block, portal link, keys open |
| #22 | after the lane merge | 12.3 `firebase deploy --only firestore:rules,firestore:indexes --project rypacad` | **HELD** for the launch bundle |
| #22 | after 12.3 | 12.4 Railway env (`REACT_APP_CALENDLY_MENTAL_URL`, `REACT_APP_STRIPE_PORTAL_URL`, `REACT_APP_PORTAL_LIVE_DATA=true`, `REACT_APP_FIREBASE_VAPID_KEY`) then the push: `git push origin portal/r3:main` (Railway builds `main`) | **HELD** - 4 commits unpushed |
| #22 | after 12.4 | 12.5 functions TEST: secrets by NAME (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CALENDLY_WEBHOOK_SIGNING_KEY`, `SMTP_USER`, `SMTP_PASS`), `STRIPE_MODE=test`, `firebase deploy --only functions`, TEST Stripe endpoint (five events, API `2025-07-30.basil`) -> set its secret -> redeploy; both webhook curls -> 400 | open |
| #23 | after 12.5 | 12.6 Calendly: Yannick confirms Standard + builds the 30-min event type; you run `GET /users/me` and the `POST /webhook_subscriptions` with `organization` + `user` + `scope: 'user'` + the signing key (token in your shell only); expect `state: active` | open (may slip to Oct 10) |
| #24 | before any smoke booking | 12.7 `node scripts/sync-calendar-sessions.mjs --prod --dry-run` (the mental sessions go) then `--yes`; re-run after every calendar edit | open |
| #24 | then | 12.8 `node scripts/write-packages.mjs --prod --mode test --dry-run` then `--yes`; production smoke (sign-up -> verify -> pay a t-6 with TWO lines on Checkout -> `?paid=` active -> claim a child -> Elite books, t-6 gated -> Yannick via Calendly); delete the smoke household and Stripe test customer | open |
| #22/#24 | Oct 1 | 12.9 functions LIVE: `STRIPE_MODE=live`, live restricted key, redeploy, LIVE endpoint + secret, `write-packages.mjs --mode live --yes`, disable the TEST endpoint | open |
| #25 | Oct 1 | 12.10 one ops approver via `provision-owner.mjs`; Yannick's and Phil's staff docs | open |
| #25 | Oct 1 + daily | 12.11 send the email; day-2 routine: `/portal/admin/signups` unpaid + flagged, `export-memberships.mjs --prod` | open |

Claude runs provisioning, sync and write scripts with `--dry-run` only; the
real writes, every deploy and the push are yours (run-button commands,
prefixed `cd C:\Users\Mac\Desktop\rypacadapp\rypacad &&`). Secret values
never appear in chat or in any tracked file; the Calendly token goes only
into your terminal for the registration `curl`.

## 8. Decisions in force (D1-D19)

Spec 16 and 16.1 hold the full text; the contract marks where each lands.

| D | One line |
|---|---|
| D1 | frontend report helpers in `data/signupsReport.js`; routing keeps `data/signups.js` |
| D2 | the `PortalRoutes.js` attendance-block `durationMinutes` edits are routing Task 11's only |
| D3 | catalogue at `functions/config/stripe-catalogue.json` (add/add wording superseded by D19) |
| D4 | the four secret lists live in `functions/portal/secrets.js`; `index.js` exports only the 13 functions |
| D5 | verification email is Firebase's own (`noreply@<REACT_APP_FIREBASE_AUTH_DOMAIN>`), not `SMTP_FROM` |
| D6 | in-app copy uses a hyphen, the emailed notice an em dash |
| D7 | reasons `athlete-name-required`, `invalid-product`, `already-active` (also facility), `child-email-duplicate` also vs an open OR claimed invite; `claimInvite` returns ids only on `claimed` |
| D8 | new fields `billing.lastEventId`, `facilityBilling.customerId/checkoutSessionId/lastEventId`, `calendlyEvents.flag` + outcome `malformed`, `stripeEvents.athleteId/via` + outcomes `facility-active`, `no-period`, `athlete-lapsed` |
| D9 | `useSignups().data` shape; `householdId` on specialist slots; `loginEmail` + `login` on the child card / athlete detail; `facilityAccessConsent` on hub members |
| D10 | every facility event writes `facilityBilling` / `facilityAccess` only - never household membership, never bookings |
| D11 | the 48-hour rule: a checkout under 48 h before the 1st prepays the NEXT month |
| D12 | restricted key scopes: Checkout Sessions write, Customers read, Prices read |
| D13 | checkout line shape: one recurring + at most one one-time line, every quantity 1 |
| D14 | routing merge order 1, 2, 3, 6, 9 -> 4/5 -> 7, 8, 10, 11, 12, 12b, 13; frontend keeps virtual mocks + runtime guards |
| D15 | functions Task 11 after db Task 7; the functions worktree writes its own `.env.local` / `.secret.local` |
| D16 | the proactive Oct 10 gate UI, "Unmatched Calendly bookings", the child-login line |
| D17 | a tier `customer.subscription.deleted` (and a final `invoice.payment_failed`) is per athlete: `otherTierLive`, `revokeAthlete`, outcome `athlete-lapsed`; the household lapses only when no sibling is live |
| D18 | a lapsed athlete pays again through `createCheckoutSession`; the pending branch outranks the household lapsed block ("Membership ended - pay to book again"); `past_due` is refused with `already-active` |
| D19 | the catalogue is committed (`1b3dc3d`, TEST ids filled, LIVE null); no lane creates or rewrites it |

## 9. Things the PM must not miss

- **Frontend Tasks 4 -> 5 are one RED unit** for one worker; the rebase gate sits between Task 4's cut and Task 5's run.
- **Two emulators, never crossed:** the shared 8080/9099 instance (routing rules probe, db seed, :3003 checks) and the functions lane's 8082/5001 instance (harnesses). The claim end-to-end is the one place all three (auth, firestore, functions) run together - PM gate step 5 in section 3.
- **Counts that changed in the review:** `stripe-billing.test.js` 5 passing; `verify-family.js` 50 checks; `verify-calendly.js` 44 checks / 15 ledger rows; SignUp 4 tests; db Task 2 "6 pass + 1 skipped" pre-merge.
- **Shared files across lanes:** `PortalRoutes.js` (frontend 3, 5, 7, 13, 14 + routing 11), `DATA-MODEL.md` (db 3 then 8 then 9), `TEAM.md` (db 10 then 11), `lib.test.js` fixtures 32 -> 30 (functions Task 1, not db), `hooks/index.js` seed tables (routing Task 10, mirrored by db Task 4).
- **Never in git:** `functions/.env`, `.env.local`, `.secret.local` (functions Task 11 Step 7 checks `git status`), `frontend/.env`.
- **Manual steps agents cannot finish:** frontend Task 14 Step 5 (375px pass with a temporary harness mount to revert) and Task 15 Step 5 (clock check - edit `BOOKING_OPENS_AT` locally and REVERT); functions Task 9 Step 6 (owner test-mode Checkout).
- The functions runbook task (12) has no dedicated issue; it supports #22. `MENTAL_MONTHLY_CAP` is duplicated in `functions/portal/calendly.js` and `data/specialists.js` - change one, change both.
