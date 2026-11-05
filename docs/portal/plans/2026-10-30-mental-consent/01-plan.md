# Mental Performance Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Families sign Yannick's "Ryp Academy Mental Performance Program — Informed Consent & Service Agreement" in the portal once per athlete (the parent's §10 plus the athlete's §9 assent on the same phone, or the athlete's own §11 at 18+), are asked when a 1:1 is booked, the day before it and when Yannick presses "Send a reminder", can change the recording and location choices later, and Yannick, ops and the owner see who has signed; on staging and ready for `develop:main` before the first portal-booked 1:1 that needs it (Thu Nov 12).

**Architecture:** One Firestore document per athlete, `mentalConsents/{athleteId}`, guarded by an additive rules block (the security boundary, proven by a new `scripts/rules-probes/mental-consent.mjs`). The client keeps every decision in pure modules (`data/mentalConsent.js` status, copy and dates, `data/mentalConsentWrites.js` the exact write shapes, `data/consentFlow.js` the five-step state machine, the device draft and the exit), Firestore access in `hooks/mentalConsentLive.js` and the hooks in `hooks/mentalConsent.js` (family) and `hooks/mentalConsentStaff.js` (ops/owner) (the `mentalLive.js`/`mental.js` precedent), and new components under `components/consent/` so no grandfathered screen grows more than a few lines. The server mirrors the status rule in `functions/portal/mental-consent-status.js` (CHANGE ONE, CHANGE BOTH, held together by one shared case table), gates in `notify-gates.js`, copy in a new `consent-notices.js`, the trigger, job and receipt bodies in `mental-consent.js` and the callable in `mental-consent-request.js`; `functions/index.js` only wires and re-exports. Every automatic notice sits behind `config/mentalConsent.notices`.

**Tech Stack:** React 18 (CRA 5, plain JS), react-router-dom 6, firebase 9 modular SDK, date-fns 4, jest via react-scripts (`renderScreen` from `screens/testRender.js`, no Testing Library), Firestore rules v2 (emulator REST probes, Node 22 ESM), Cloud Functions v1 (`firebase-functions/v1`, firebase-admin, `portal/tiny.js` runner, `portal/fake-firestore.js`, eslint-config-google), Node `node:test` for scripts.

**Spec:** `docs/portal/plans/2026-10-30-mental-consent/00-spec.md` (owner-approved 2026-11-05, rulings in its §10) and the form text `01-consent-form-FINAL.txt` beside it. Section numbers (§3, §6.2 ...) refer to the spec; "form §9" refers to the form. What the spec left to the builder is settled under "Decided here" at the end.

## Global Constraints

- Work on branch `mental/consent` (base develop `2e844de`) in `C:\Users\Mac\Desktop\rypacadapp\wt-consent`; the lanes run in the worktrees Task 0 sets up and merge back here. Never push, never deploy, never pass `--prod`, never read `scripts/lib/prod-auth.mjs`, never print an env value or a secret file, never use bare `git stash`.
- Email only (owner ruling 2026-11-05): the in-app text and every notice name Yannick by `yannick@rypgolf.com`; no phone number in any file, test, fixture or notice of this branch. Test fixtures use the literal phone `'test-phone'`. Task 19 greps for it, and for the old number by its digits without printing it.
- No real family (the repo is public): no real athlete's or family's name and no real booking date appears in any file, test, fixture or commit message of this branch; tests use the seed families, `Ava Test` and `Max Test`. Task 0 and Task 19 check the branch history against a names list kept off the repo.
- Collection `mentalConsents/{athleteId}`, one document per athlete; absent == never signed; nobody deletes. Field set, exactly: `athleteId, householdId, version, method, signedAt, signedBy, signer, adult, assent, choices, adultConfirm, adultSignature, countersign, history`.
- Portal minor record: `method 'portal'`, `signedAt` and `assent.at` and `choices.updatedAt` the server time, `signedBy` and `choices.updatedBy` the caller, `signer { role: 'parent', name }`, `adult false`, `assent { name, audio: bool, at, readAloud: bool, withdrawnBy: null }`, `choices { location: 'A'|'B'|'C'|'any', audio: bool, driving: bool|null, emergencyContact, parentSessions: null, parentName: null, updatedAt, updatedBy }`, `adultConfirm null, adultSignature null, countersign null, history []`.
- Portal adult record (§11): `signer.role 'athlete'`, `adult true`, `assent null`, `choices.driving null`, `choices.parentSessions` bool, `choices.parentName` a name when `parentSessions` is true else null, `emergencyContact` with name and phone.
- 18+ re-sign of a minor-era record: `adultSignature { signedAt, signedBy, name, version, method: 'portal'|'paper' }` (portal: `signedAt` the server time; paper: the form's date), `choices` re-answered in the adult shape, `countersign` reset to null; `assent` stays as it was.
- Paper record: `method 'paper'`, `signedBy` the ops/owner caller, `signedAt` = Chicago midnight of the date on the form (`paperDateToStamp('2026-10-28')` = `2026-10-28T05:00:00Z`), not in the future and on or after 2026-01-01, minor `assent.at == signedAt`, `choices.location` may be null; same shapes otherwise.
- Emergency contact: `{ name, phone, relationship }`; name (1..120) and phone (1..40) both strings, or both null meaning a minor's "Same as parent"; relationship null or a string of at most 60. The flow refuses a half-filled contact with `validateEmergencyContact`'s copy (`data/signup.js`). Every typed name (signer, assent, parentName, adultConfirm, adultSignature) is 1..120 characters; the client clamps every input to these lengths.
- Every update is a client transaction that reads the record first; the updates that append to `history` append the snapshot's own objects (the countersign appends nothing): `{ choices, assent, adultConfirm }` for a choices change, `{ choices, assent }` for a withdrawal, `{ choices, assent, countersign }` for the 18+ re-sign, and `{ choices, assent, signedAt, signer, adult, version, signedBy }` for a paper correction; any write that touches `choices` restamps `choices.updatedAt`/`updatedBy`, and a paper correction always resends `choices`.
- `CONSENT_VERSION = '2026-10-30'`, exported from `data/mentalConsent.js` (no form text there); `data/mentalConsentTerms.js` re-exports it and only the lazy consent screens import the terms module, so the agreement never ships in the main bundle. A record with any other version still counts as signed (spec §7).
- Status, the same on both sides and pinned by one shared case table: no valid dob → `'no-dob'`; no record → `'unsigned'`; `adult === true` or an `adultSignature` → `'signed'`; signed as a minor and 18 or older today → `'needs-adult'`; otherwise `'signed'`. A paper record counts. Recording allowed == status `'signed'` and (adult record ? `choices.audio` : `choices.audio && assent.audio`). The rules also refuse a portal create for an athlete without a valid dob.
- Dates: 18, 16 and 13 are counted on the UTC date (client `utcTodayISO(now)`, server `utcToday(now)`, rules `adultOn`); booking dates, "today", "tomorrow", "upcoming", the duplicate guard and every date shown to a person are America/Chicago dates (client `academyDateISO(now)`, server `lib.todayISO` / `lib.chicagoDate`). One `now` feeds both on each side.
- Who signs: under 18, the household's parent (§10) with the athlete's assent typed on the same phone (read-aloud tick offered under 13); 18+ with a claimed login, the athlete alone, and the parent account is refused every create and update on that athlete's record, a minor-era (needs-adult) one included (ruling 2); 18+ without one, hand-the-phone on the parent's login, `signer.role 'athlete'`. "Claimed" is one test everywhere: `loginInvites/{athlete.loginEmail}.status == 'claimed'` (rules `athleteLoginClaimed`, the parent's screen, the server's audience); the server also counts the self-created 18+ member (the household's `createdBy` uid has a `users` doc with this `athleteId`); a provisioned athlete login with no invite counts as unclaimed.
- Withdrawal (ruling 3): on a minor-era record without an `adultSignature`, `assent.audio` goes true → false only, by the athlete's own login or role `mental`, stamped `withdrawnBy`; back to true only through the parent's hand-the-phone change while the athlete is under 18; a paper correction never undoes it. An adult record's change to `audio`, `emergencyContact`, `parentSessions` or `parentName` carries `adultConfirm { name, at: server time }`; a location-only change does not.
- Notice kinds: `consent-needed` (booking trigger subjectKey `consent:<athleteId>:<booking.date>`; Yannick's callable `consent:<athleteId>:asked-<Chicago today>`), `consent-reminder` (`consent-reminder:<athleteId>:<date>`), `consent-signed` (`<athleteId>`); category `schedule`; `LINKS` `/portal/consent/mental`; email locked on for `consent-needed` and `consent-reminder`, push follows the `schedule` preference.
- Audience: a minor, or an 18+ athlete with no claimed login → `householdId` set and `athleteId: null` (the household's parents only; the row never shows in a child login's RecentNotices); an 18+ athlete with a claimed login → `householdId: null`, `athleteId` set (that login only).
- The three asks (booking trigger, day-before job, Yannick's callable) send nothing while `config/mentalConsent.notices` is not true, for `household.test === true` or `athlete.test === true`, when the household doc is missing, or when the status is `'signed'` or `'no-dob'`; the two automatic ones also need `type 'mental'`, `status 'confirmed'`, an `athleteId` and `date >=` Chicago today. The `consent-signed` receipt is not gated.
- The switch: `config/mentalConsent { notices: boolean, enabledAt: 'YYYY-MM-DD' | null }`, written only by `scripts/set-mental-consent-flag.mjs`; missing == off. The owner runs `--prod --on --yes` after `develop:main`. Agents never pass `--prod`, and pass `--yes` only against a lane emulator (`resolveTarget` refuses a non-local host without `--prod`).
- Callable `requestMentalConsent({ athleteId })` → `{ status: 'sent' | 'duplicate' }`; refusals carry `details.reason`: `'not-mental'` (permission-denied), `'no-athlete'` (invalid-argument or not-found), `'disabled'`, `'no-household'`, `'test-household'`, `'already-signed'`, `'no-dob'` (failed-precondition), `'send-failed'` (unavailable: the ledger row could not be written). Client: `callRequestMentalConsent` in `hooks/callables.js`.
- Routes `/portal/consent/mental` and `/portal/consent/mental/:athleteId` (`?change=1` opens Change choices; `?withdraw=1` on the list never auto-opens the flow) admit `parent` and `athlete`; Yannick's routes stay `mental` only; coaches see nothing of consent anywhere.
- Reads: a parent `where('householdId', '==', householdId)` (never `getDoc`: the read rule refuses a parent's get of a missing record), an athlete login `getDoc(mentalConsents/<own id>)` (allowed when missing: null), staff `getDocs` on the collection. No `firestore.indexes.json` change.
- Held Calendly sessions (`sessions/cal-<uuid>`, `unresolved: true`, no booking, no athlete) and `other-event` ledger rows never produce a consent ask or a "Consent needed" line: every consent decision starts from a booking with an `athleteId`.
- Backward compatible (staging runs on the production backend): `git diff 2e844de -- firestore.rules` adds lines only; no export leaves `functions/index.js`; every existing notice body is byte-identical; a 3-argument `channelAllowed` call behaves as before; a consent failure never stops another family's reminder. Phil's Task 28 and the unused `inRange` cleanup are not part of this branch.
- Files stay under 500 lines; new code goes in new files. Grandfathered files take only the edits named here: `firestore.rules`, `PortalRoutes.js`, `hooks/live.js`, `hooks/index.js`, `scripts/seed-firestore.mjs`, `scripts/verify-rules.mjs`, `StatesHarness.js`, `AthleteDashboard.js` (508; one import and one element, 510). `ParentDashboard.js` (482), `AdminDashboard.js` (496), `notices.js` (448, untouched), `functions/index.js` (437) and `data/seed.js` (476) stay under 500.
- Repo files are CRLF: edit existing files with the Edit tool or a node script that normalizes to LF, edits and restores CRLF; never `sed -i`; check with `file <path>`.
- Emulators: one untracked config per lane worktree (Task 0 Step 4), never committed; `emulators:exec` sets `FIRESTORE_EMULATOR_HOST` for the command it runs. Before any command that starts the functions emulator, run PREFLIGHT (Task 0 Step 5) in that worktree, tee the output to a log, and require `grep -c 'Trying to access secret' <log>` to print `0`.
- Commands: `cd frontend && CI=true npx react-scripts test --watchAll=false <pattern>`; `cd frontend && npx eslint src/portal --max-warnings=0`; `cd frontend && CI=true npm run build`; `cd functions && node portal/<file>.test.js`; `cd functions && node test/check-exports.js`; `cd functions && npx eslint .`; `npm run test:scripts` (repo root); rules: `npx firebase-tools emulators:exec --only firestore --config <lane config> --project rypacad "node scripts/verify-rules.mjs"`.
- Commits name their files (`git add <paths>`, never `-A` at the root) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A family's second write is refused for good.** Change choices, the withdrawal, the 18+ re-sign and the paper correction all prove `history == old history + [the old values]` in the rules; a client that rebuilds the old values from a display copy (Timestamps turned into ms or ISO strings, a dropped `assent: null` or `adultConfirm: null`) is refused on every write after the signature, and the family only sees "couldn't save". Pinned in Task 8 Step 1 (the builders append the current record's own objects, `toBe`), Task 10 Step 1 (`updateConsent` hands the transaction snapshot's data to the builder) and Task 1 Step 1 (history re-encoded from the GET is 200; one altered entry is 403).
2. **Every unsigned family's line fails to load.** The read rule tests `resource.data.householdId`, so a parent's `getDoc` of a record that does not exist yet is refused, not "not found": the family line, the home card and the flow's resume check would error for exactly the families who need them. Pinned in Task 10 Step 1 (parents read only through the householdId query; `getDoc` never called for a parent) and Task 1 Step 1 (parent query on a household with no records is 200; a parent get of a missing record is 403; an athlete login's get of its own missing record is 404).
3. **The child's own login is told to sign, or an adult's parents are.** `sendNotice` with an `athleteId` addresses that athlete's login and lists the row in its RecentNotices. Pinned in Task 4 Step 1 (a minor with a claimed login: `athleteId: null`, `householdId` set; an 18+ athlete with a claimed invite: `householdId: null`, `athleteId` set; a provisioned 18+ login with no invite: the household) and Task 6 Step 1 (emulator: the minor's ledger row has `athleteId: null` and the two parents as its only recipients).
4. **Yannick's reminder says "Sent" or "Sent today" when nothing went out.** A booking made earlier for a session today writes `consent:<id>:<today>`; a callable keyed the same way would hit that ledger row and report a duplicate; and `sendNotice` answers `{duplicate: false, sent: false}` when its ledger transaction fails. Pinned in Task 5 Step 1 (a row created yesterday for today's session does not block and the callable sends under `consent:<id>:asked-<today>`; a `consent-needed` row created today does block; a failed ledger write rejects with `send-failed`) and Task 14 Step 1 (the card's copy for it).
5. **The evening before an 18th birthday.** From 18:00/19:00 Chicago the UTC date is already tomorrow: a client that mixes `academyDateISO` into the branch gives the parent the minor flow and the rules refuse the save; a gate that swaps the two clocks asks on the wrong day; an `adultOn` off by one day passes every ±1-day probe. Pinned in Task 2 Step 1 (gate rows at `2026-11-06T01:00:00Z`), Task 8 Step 1 (`flowFacts` at the same instant) and Task 1 Step 1 (`mc-bday`, 18 on today's UTC date: minor create 403, §11 create 200).

## Changes since the spec

The spec was written against `053caad`; the branch base is `2e844de`. What moved and how the plan adapts:

1. **Held unmatched Calendly bookings** (`7f4c97e`, `6f6bf91`): an unmatched RYP 1:1 is now `sessions/cal-<eventUuid>` with `unresolved: true`, `booked: 1`, no booking doc and no athlete; other event types are ledgered `other-event` and write nothing. `onBookingCreated` never fires for a hold, Yannick's rows (`mentalAthleteRows`) and the family lines read bookings only, and `SpecialistDay` is unchanged (its held rows get no consent chip). The gate also requires `booking.athleteId`.
2. **Bookings for past dates now reach `onBookingCreated`**: the owner's `calendly-unmatched.mjs --link` (`7f4c97e`) replays old bookings through the webhook, and `comp-booking.mjs` (older than the spec) can write a staff booking for any date. The gate adds `booking.date >=` Chicago today, so it takes `now`; `shouldNoticeConsentNeeded` takes one object `{ booking, athlete, household, record, config, now }` instead of five positional arguments.
3. **Export count**: `check-exports.js` counts 18 today (the spec's base also had 18); this branch adds `requestMentalConsent` and `onMentalConsentSigned`, count 20, both binding `MAIL_SECRETS`.
4. **`functions/index.js` is 437 lines**: both new functions are defined and wrapped in their own modules (the `calendlyWebhook` pattern); `index.js` gains two `exports.` lines, two requires and an 8-line consent call at the top of `onBookingCreated`. `notices.js` is 448 lines, so the copy goes in a new `consent-notices.js` (not `notices.js`, and not `mental-consent.js`, which holds the trigger bodies).
5. **The claimed-login field** (§6.2 left it to the builder): nothing on the athlete doc says "claimed". `claimInvite` sets `loginInvites/{email}.status = 'claimed'` and the athlete doc keeps `loginEmail` (lower-cased, the invite id), so the rules read `get(loginInvites/$(a.loginEmail)).status == 'claimed'` (`athleteLoginClaimed`); no `claimInvite` change and no backfill. The parent's screen and the server's audience use the same test (the spec's "a `users` doc with `athleteId == id`" would also count the provisioned athlete logins `provision-family.mjs` writes without an invite, which the rules treat as unclaimed). The 18+ member who created their own household has no invite and no parent in the household: the server counts them through `households.createdBy`, and the parent arm never applies there.
6. **Ledger and the duplicate guard**: a parents-only send carries `athleteId: null`, so "any `consent-needed` row for the athlete created today" is found by a `subjectKey` range (`consent:<id>:` .. `consent:<id>;`), not an `athleteId` query; the callable's key is `consent:<id>:asked-<today>` so it never collides with a booking row for a session today (Review Focus 4).
7. **The email lock is per kind, not per category**: `channelAllowed(prefs, category, channel, kind)` gains an optional 4th argument; `data/parent.js` gets a footnote on the Sessions category instead of `lockedChannels: ['email']`, which would lock every session email.
8. **Rules context**: the December follow-ups (a membership map with no status key) and the coach-reads-any-athlete grant (`4fa53b1`) do not touch this block; the second confirms why consent stays off `athletes/{id}`. The additivity baseline is `2e844de` (the branch base), not `904fd1f`.
9. **Lane emulators**: one config per lane worktree (Task 0), not `firebase.mental.json` (§9); the functions lane and the integration gate also carry a functions block and placeholder secrets.
10. **`hooks/mental.js` moved** (check-in notes, the board's search and visits): the consent join adds one tolerant fetch and one deps key to `useMentalAthletes` and `useMentalAthlete` and touches nothing else there.
11. **The staff households directory** (§5) is a billing list (`HouseholdsCard`); the consent tracker for ops and the owner is a new `ConsentTrackerCard` beside it on the Admin dashboard (every athlete with a mental booking, past or future), plus the athlete admin card (`AthleteDetail` for ops/owner).
12. **No dob**: an athlete with no valid dob is not nudged (the family cannot fix it; the flow says "Add Ava's date of birth first"), the rules refuse a portal create, and the callable refuses with `'no-dob'`. The spec's "report how many athletes with mental bookings lack a dob" is a staging check (staging reads production): the owner counts the "No date of birth" rows under "Needs consent".

## File Structure

- **rules-data:** `firestore.rules` (helpers `adultOn`, `athleteLoginClaimed`; the `mentalConsents` block; additive), `scripts/rules-probes/mental-consent.mjs` (new), `scripts/verify-rules.mjs` (one import, one call).
- **functions** (`functions/`): new `portal/mental-consent-status.js` (status mirror, pure), `portal/consent-notices.js` (copy), `portal/mental-consent.js` (config, audience, booking-trigger body, day-before branch, receipt trigger), `portal/mental-consent-request.js` (callable), `test/fixtures/consent-status-cases.json` (the shared status table, Task 0); changed `portal/notify-gates.js`, `portal/notify.js`, `portal/jobs.js`, `index.js`, `test/check-exports.js`, `test/verify-notifications.js`; a `*.test.js` beside each new module.
- **frontend** (`frontend/src/portal/`): new `data/mentalConsentTerms.js` (form text), `data/mentalConsent.js` (version, status, dates, family rows and lines, Yannick's summary, the tracker rows), `data/mentalConsentWrites.js` (write shapes), `data/consentFlow.js` (steps, device draft, exit), `data/consentSeed.js`, `hooks/mentalConsentLive.js` (Firestore), `hooks/mentalConsent.js` (family hooks, seed), `hooks/mentalConsentStaff.js` (ops/owner hooks), `screens/MentalConsent.js` (list), `screens/MentalConsentFlow.js` (sign, change), `StatesHarness.consent.test.js`, and under `components/consent/`: `FlowSteps`, `ConsentLine`, `ConsentHomeCard`, `ConsentAthleteHomeLine`, `ConsentBookingLine`, `ConsentDetailCard`, `StaffConsentDetail`, `ConsentCard` (Yannick), `PaperSignatureSheet`, `ConsentTrackerCard`; changed `data/seed.js`, `data/mentalNotes.js`, `data/parent.js`, `hooks/callables.js`, `hooks/index.js`, `hooks/mental.js`, `PortalRoutes.js`, `StatesHarness.js` and the screens `ParentDashboard`, `AthleteDetail`, `Reservations`, `MySchedule`, `AthleteDashboard`, `AdminDashboard`, `MentalAthletes`, `MentalAthlete` with their tests.
- **scripts-docs:** new `scripts/set-mental-consent-flag.mjs`, `scripts/lib/consent-fixtures.mjs` and their tests; changed `scripts/seed-firestore.mjs`, `docs/portal/DATA-MODEL.md`.

| Lane | Worktree (Task 0) | Tasks | Cross-lane |
|---|---|---|---|
| session lead | `wt-consent` | 0 | forks the lanes after the shared table is committed |
| rules-data | `wt-consent` (`mental/consent`) | 1 | none: its shapes are the Global Constraints |
| functions | `wt-consent-fn` (`mental/consent-fn`) | 2, 3, 4, 5, 6 | the shared status table (Task 0) |
| frontend | `wt-consent-fe` (`mental/consent-fe`) | 7 to 16 | the shared status table (Task 0); the write shapes match Task 1 and the callable Task 5 through the Global Constraints |
| scripts-docs | `wt-consent-scripts` (`mental/consent-scripts`) | 17, 18 | none |
| integration | `wt-consent` | 19 (gate), 20 (owner release) | all four lanes merged |

---

### Task 0: Lane setup (the session lead, before any lane starts)

LANE session lead. Depends on: none.

**Files:**
- Create: `functions/test/fixtures/consent-status-cases.json`
- Local only, never committed: the lane worktrees, their `node_modules` junctions, `firebase.consent-fn.json`, `firebase.consent-scripts.json`, `scripts/emulator.consent.env`, `scripts/emulator.consent-fn.env`, the `functions` block of `firebase.consent.json`, `functions/.secret.local` and `functions/.env.local` in `wt-consent` and `wt-consent-fn`, and the names list `<scratchpad>/consent-names.txt`.

**Interfaces:**
- Produces: the shared case table every status test runs (an array of `{ label, athlete, record, utcToday, want }`); the lane branches cut from the commit that adds it; PREFLIGHT.

- [ ] **Step 1: No real names in the branch history**
Write `<scratchpad>/consent-names.txt` (outside the repo): one surname per line, the production families booked with Yannick before release. Run (wt-consent): `git log -p 2e844de..HEAD | grep -icwFf <scratchpad>/consent-names.txt` and `git merge-base --is-ancestor 31cfe78 HEAD && echo 'STOP: the old spec commit is an ancestor'`.
Expected: `0`, and nothing from the second. Today the first is not 0 (the spec's §10 item 5 and the first plan commit named families; this plan's review-fix commit shows them as removed lines). With the owner's go: edit `00-spec.md` §10 item (5) to end "aiming before the first portal-booked 1:1 that needs it (Thu Nov 12).", then `git reset --soft 2e844de`, `git add docs/portal/plans/2026-10-30-mental-consent`, `git commit -m "docs(portal): mental performance consent spec and plan, owner-approved" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`, and re-run until it prints `0`. Nothing else is on the branch yet and nothing was ever pushed.

- [ ] **Step 2: Commit the shared status table**
Create `functions/test/fixtures/consent-status-cases.json`, with `M` = `{ "adult": false, "method": "portal", "version": "2026-10-30", "adultSignature": null }` written out in each row:

| label | athlete.dob | record | utcToday | want |
|---|---|---|---|---|
| no dob, no record | null | null | 2026-11-05 | no-dob |
| malformed dob | "June 2010" | null | 2026-11-05 | no-dob |
| no dob even with a record | null | M | 2026-11-05 | no-dob |
| minor, no record | 2012-05-14 | null | 2026-11-05 | unsigned |
| minor, signed | 2012-05-14 | M | 2026-11-05 | signed |
| signed as a minor, 18 today (UTC) | 2008-11-05 | M | 2026-11-05 | needs-adult |
| signed as a minor, 18 tomorrow | 2008-11-06 | M | 2026-11-05 | signed |
| Feb 29 birthday is 18 on Mar 1 | 2008-02-29 | M | 2026-03-01 | needs-adult |
| Feb 29 birthday is not 18 on Feb 28 | 2008-02-29 | M | 2026-02-28 | signed |
| adult record | 2007-03-02 | M with adult true | 2026-11-05 | signed |
| re-signed after 18 | 2008-11-05 | M with adultSignature { "name": "Max" } | 2026-11-05 | signed |
| paper counts | 2012-05-14 | M with method "paper" | 2026-11-05 | signed |
| an older version still counts | 2012-05-14 | M with version "2026-09-01" | 2026-11-05 | signed |

Commit: `git add functions/test/fixtures/consent-status-cases.json`, then `git commit -m "test(functions): the shared consent status case table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

- [ ] **Step 3: Cut the lane worktrees** (PowerShell, from `C:\Users\Mac\Desktop\rypacadapp\wt-consent`)
```powershell
git worktree add ..\wt-consent-fn -b mental/consent-fn
git worktree add ..\wt-consent-fe -b mental/consent-fe
git worktree add ..\wt-consent-scripts -b mental/consent-scripts
foreach ($w in 'wt-consent-fn','wt-consent-fe','wt-consent-scripts') { foreach ($p in 'frontend','functions') {
  New-Item -ItemType Junction -Path "..\$w\$p\node_modules" -Target "C:\Users\Mac\Desktop\rypacadapp\rypacad\$p\node_modules" } }
```
The rules-data lane stays in `wt-consent` on `mental/consent`. Teardown after Task 19: remove each junction first (`Remove-Item` on the junction path, never a recursive delete), then `git worktree remove`.

- [ ] **Step 4: One emulator config per lane** (each a copy of `firebase.consent.json` with its own ports, `ui` disabled; a `functions` block copied from the tracked `firebase.functions-lane.json` where the lane starts functions)

| worktree | config | firestore / auth / functions / hub / logging | env file |
|---|---|---|---|
| `wt-consent` (rules, then Task 19) | `firebase.consent.json` (exists; add the functions block) | 8083 / 9102 / 5004 / 4403 / 4503 | `scripts/emulator.consent.env`: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8083`, `VERIFY_FUNCTIONS_ORIGIN=http://127.0.0.1:5004` |
| `wt-consent-fn` | `firebase.consent-fn.json` (with the functions block) | 8085 / 9104 / 5005 / 4405 / 4505 | `scripts/emulator.consent-fn.env`: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`, `VERIFY_FUNCTIONS_ORIGIN=http://127.0.0.1:5005` |
| `wt-consent-fe` | none (no emulator) | | |
| `wt-consent-scripts` | `firebase.consent-scripts.json` (no functions) | 8086 / 9105 / - / 4406 / 4506 | none (`emulators:exec` sets the host) |

- [ ] **Step 5: Placeholder secrets and PREFLIGHT** (in `wt-consent` and `wt-consent-fn` only)
`functions/.secret.local` and `functions/.env.local`, each with `SMTP_USER=placeholder`, `SMTP_PASS=placeholder`, `STRIPE_SECRET_KEY=sk_test_placeholder`, `STRIPE_WEBHOOK_SECRET=whsec_functionslane_emulator_only_not_a_real_secret` (the harness's own constant), `CALENDLY_WEBHOOK_SIGNING_KEY=placeholder`, `SLACK_FEEDBACK_TOKEN=placeholder`; `.env.local` also `STRIPE_MODE=test`; no `SMTP_HOST` in either. Never copy `functions/.env` from the main checkout into a worktree (it holds the live `SMTP_HOST`). PREFLIGHT, run from the worktree root before every `--only firestore,functions` command; it prints key names only and refuses on any gap:
```bash
node -e "const fs=require('fs');const K=['SMTP_USER','SMTP_PASS','STRIPE_WEBHOOK_SECRET','STRIPE_SECRET_KEY','CALENDLY_WEBHOOK_SIGNING_KEY','SLACK_FEEDBACK_TOKEN'];for(const f of ['functions/.secret.local','functions/.env.local']){const t=fs.readFileSync(f,'utf8');for(const k of K){const m=t.match(new RegExp('^'+k+'=(.+)$','m'));if(!m||!m[1].trim())throw new Error(f+': '+k+' missing or empty');}if(/^SMTP_HOST=/m.test(t))throw new Error(f+': SMTP_HOST set');}if(fs.existsSync('functions/.env')&&/^SMTP_HOST=/m.test(fs.readFileSync('functions/.env','utf8')))throw new Error('functions/.env: SMTP_HOST set');console.log('preflight ok')"
```
Expected: `preflight ok`.

### Task 1: Rules and probes

LANE rules-data. Depends on: Task 0.

**Files:**
- Modify: `firestore.rules` (after `function athleteData(athleteId) {...}`, lines 49-51; a new block after the closing brace of `match /contractCheckins/{checkinId}`)
- Create: `scripts/rules-probes/mental-consent.mjs`
- Modify: `scripts/verify-rules.mjs` (import beside `taskResearch`; `await taskMentalConsent();` after `await taskMental();` in `runPass`)

**Interfaces:**
- Consumes: rules `signedIn()`, `me()`, `athleteData(id)`; from `scripts/verify-rules.mjs`: `seed, del, call, commitAs, listAs, expect, token, t, uid, BASE`; from `scripts/lib/firestore-rest.mjs`: `fsFields, fsValue`.
- Produces: top-level rules functions `adultOn(a)` and `athleteLoginClaimed(a)`; `match /mentalConsents/{athleteId}`; `export async function taskMentalConsent()`. Module-private helpers in the probe file: `nameOf(col, id)` (from `BASE`), `writeAs(auth, id, encodedFields, { mask, exists, serverTime })` (one commit; `exists: false` for a create, `true` for an update, `undefined` for a set without a precondition), `historyWith(current, keys)` (the current GET's encoded `history` values plus one map of the current encoded fields named by `keys`).

- [ ] **Step 1: Write the failing probes**
Create `scripts/rules-probes/mental-consent.mjs` in the `research.mjs` style: seeds in `try`, deletes everything it wrote in `finally`. Server-time fields go through `updateTransforms` (`REQUEST_TIME`): `signedAt`, `assent.at`, `choices.updatedAt` on a create; `choices.updatedAt`, `assent.at`, `adultConfirm.at`, `adultSignature.signedAt` (portal), `countersign.at` on the updates that carry them. History is always built with `historyWith` from a fresh `call('GET', ...)` so the probe resends the stored values exactly as a client transaction does; every family change (the assent ones included) and every paper correction also resends `choices` with `updatedAt` at `REQUEST_TIME` and `updatedBy` the caller, as `choicesUpdate` and `paperCorrection` do. Paper dates are Chicago midnight (`2026-10-28T05:00:00Z`).

Seeds (UTC date `D = new Date().toISOString().slice(0, 10)`, `minus(years, days)` a dob that many years and days before `D`):
- users: `mc-parent` (parent, `mc-hh`), `mc-other` (parent, `mc-other-hh`), `mc-kid-login` (athlete, `mc-kid`, `mc-hh`), `mc-adult-login` (athlete, `mc-adult`, `mc-hh`), `mc-turned-login` (athlete, `mc-turned-claimed`, `mc-hh`), `mc-mental` (mental), `mc-ops` (ops), `mc-owner` (owner), `mc-phil` (coach, `specialistId 'phil'`); the shared `t.coach` token.
- athletes in `mc-hh`: `mc-kid` (dob `minus(15, 0)`, `loginEmail 'mc-kid@example.com'`), `mc-kid2` (`minus(12, 0)`), `mc-almost` (`minus(18, -1)`: 18 tomorrow), `mc-bday` (`minus(18, 0)`: 18 today), `mc-adult` (`minus(18, 1)`, `loginEmail 'mc-adult@example.com'`), `mc-handover` (`minus(19, 0)`, no login), `mc-open` (`minus(19, 0)`, `loginEmail 'mc-open@example.com'`), `mc-turned` and `mc-turned2` (`minus(18, 1)`, no login), `mc-turned-claimed` (`minus(18, 1)`, `loginEmail 'mc-turned@example.com'`), `mc-nodob` (no dob); `mc-other-kid` in `mc-other-hh`.
- `loginInvites/mc-kid@example.com`, `mc-adult@example.com` and `mc-turned@example.com` `status: 'claimed'`; `loginInvites/mc-open@example.com` `status: 'open'`.
- With the owner bypass, minor portal records: `mentalConsents/mc-turned` (`assent.audio true`, `countersign { at, by: 'mc-mental' }`), `mc-turned2` (`assent.audio true`, `countersign null`), `mc-turned-claimed` (`assent.audio false`).

Probes, each `expect(label, status, wanted)`, in this order (minor body = the Global Constraints' portal minor record with location `'B'`, both audios true, `emergencyContact { name: null, phone: null, relationship: null }`; adult body = the §11 shape, `parentSessions true`, `parentName 'Dana Probe'`, contact `{ name: 'Lee Probe', phone: 'test-phone', relationship: 'aunt' }`). Every refusal of a create runs while its target has no record; a create on an existing doc proves nothing.

```
reads, nothing stored for these athletes yet
  parent lists its household (householdId == mc-hh) .................................. 200
  parent gets mentalConsents/mc-kid before it exists .................................. 403  (why hooks never getDoc for a parent)
  mc-adult-login gets mentalConsents/mc-adult before it exists ........................ 404  (allowed; fetchOwnConsent reads null)
creates
  mc-kid-login creates its own record (a minor, before anyone signed) ................ 403
  mc-other creates for mc-kid with mc-other-hh in the body ............................ 403
  parent creates mc-kid's minor record ................................................ 200
  parent sets mc-kid again (no precondition: an update of the whole doc) .............. 403
  parent creates a minor record for mc-kid2 with assent null .......................... 403
  parent creates mc-kid2 with signedAt sent by the client (a minute back) ............. 403
  parent creates mc-kid2 with signedBy 'someone' / version 'v1' / history [x] /
    countersign set / an extra key / location 'D' / signer.name of 121 chars /
    driving 'yes' ..................................................................... 403 each
  parent creates mc-kid2 (same-as-parent contact, driving null) ....................... 200
  parent creates mc-almost as adult (18 tomorrow) / mc-bday as a minor (18 today) .... 403 each
  parent creates mc-bday §11 .......................................................... 200
  parent creates mc-handover as a minor / §11 with an assent map ..................... 403 each
  parent creates mc-handover §11 with no emergency phone / parentSessions true and
    parentName null ................................................................... 403 each
  parent creates mc-handover §11 ...................................................... 200
  parent creates mc-adult §11 (claimed login) ......................................... 403
  mc-adult-login creates its own §11 .................................................. 200
  parent creates mc-open §11 (its invite is still open) ............................... 200
  parent creates mc-nodob as adult / as a minor ....................................... 403 each
reads of stored records
  parent gets mentalConsents/mc-kid (the transaction read) ............................ 200
  coach / mc-phil / mc-other get mentalConsents/mc-kid ................................ 403 each
  coach / mc-phil list mentalConsents where householdId == mc-hh ...................... 403 each
  mc-mental / mc-ops / mc-owner get mentalConsents/mc-kid ............................. 200 each
  mc-kid-login gets its own; gets mc-adult's .......................................... 200 / 403
  mc-mental lists the collection unfiltered; parent lists it unfiltered ............... 200 / 403
paper (mc-other-kid has no record until the 200)
  mc-ops paper for mc-other-kid with signedAt tomorrow / 2025-12-31T06:00:00Z ......... 403 each
  parent / mc-mental create paper for mc-other-kid .................................... 403 each
  mc-ops creates paper minor for mc-other-kid, signedAt and assent.at
    2026-10-28T05:00:00Z, assent.audio true, location null ............................ 200
updates
  parent changes mc-kid's location to 'C', history historyWith(['choices','assent','adultConfirm']) .. 200
  the same without history / with the old entry's location altered / changing signer . 403 each
  mc-ops / mc-owner / mc-mental change mc-kid's location with a correct history ....... 403 each
  parent sets mc-kid assent.audio false, name unchanged ............................... 200
  parent changes assent.name .......................................................... 403
  mc-kid-login changes mc-kid's choices.location ...................................... 403
  parent puts assent.audio back to true (hand-the-phone) .............................. 200
  mc-kid-login withdraws (true -> false, withdrawnBy mc-kid-login) .................... 200
  mc-kid-login sets it back to true ................................................... 403
  parent changes mc-turned's location before its re-sign (18, no login) ............... 200
  mc-ops withdraws on mc-turned / mc-mental withdraws with withdrawnBy 'someone' ...... 403 each
  mc-mental withdraws on mc-turned .................................................... 200
  parent puts mc-turned's assent.audio back to true (18 now) .......................... 403
  mc-mental withdraws on mc-other-kid (paper) ......................................... 200
  parent changes mc-handover's location only, no adultConfirm ......................... 200
  parent flips mc-handover parentSessions without adultConfirm / with adultConfirm.at
    a client timestamp ................................................................ 403 each
  ... with adultConfirm { name 'Max Probe', at: REQUEST_TIME } ......................... 200
  parent changes mc-adult's location (claimed login) .................................. 403
  mc-adult-login changes audio with adultConfirm ...................................... 200
  parent changes mc-turned-claimed's location / sets its assent.audio true ............ 403 each
re-sign
  mc-kid parent §11 re-sign (still 15) ................................................ 403
  parent re-signs mc-turned: adultSignature { ..., method 'portal' }, adult choices,
    countersign null, history historyWith(['choices','assent','countersign']) ......... 200
  a second re-sign on mc-turned / parent §11 re-sign of mc-turned-claimed ............ 403 each
  mc-turned-login §11 re-sign of its own record ....................................... 200
  mc-ops paper re-sign of mc-turned2 with adultSignature.signedAt tomorrow ............ 403
  mc-mental / parent send mc-turned2 the paper-shaped re-sign below ................... 403 each
  mc-ops paper re-sign of mc-turned2: adultSignature.signedAt 2026-11-01T05:00:00Z,
    method 'paper', adult paper choices (location null, contact both null),
    countersign null, history historyWith(['choices','assent','countersign']) ......... 200
  mc-mental withdraws on mc-turned2 after its re-sign (assent.audio still true) ....... 403
countersign
  mc-mental countersigns mc-kid ....................................................... 200
  mc-mental countersigns mc-kid again / mc-ops countersigns mc-kid2 /
    mc-mental countersigns mc-kid2 with by 'someone' .................................. 403 each
paper correction (mc-other-kid is a withdrawn paper record by now)
  mc-owner corrects signedAt to 2026-10-27T05:00:00Z keeping the stored assent,
    history with choices, assent, signedAt, signer, adult, version, signedBy .......... 200
  mc-owner corrects again resending the stored choices.updatedAt ...................... 403
  mc-owner corrects with assent { audio true, withdrawnBy null, at: signedAt } ........ 403
  mc-ops corrects it / mc-owner "corrects" mc-kid (a portal record) ................... 403 each
delete
  mc-owner / parent delete mentalConsents/mc-kid ...................................... 403 each
```

In `scripts/verify-rules.mjs`: `import { taskMentalConsent } from './rules-probes/mental-consent.mjs';` beside the research import, and `await taskMentalConsent();` directly after `await taskMental();` in `runPass`.

- [ ] **Step 2: Run the probes to verify they fail**
Run (wt-consent root): `npx firebase-tools emulators:exec --only firestore --config firebase.consent.json --project rypacad "node scripts/verify-rules.mjs"`
Expected: every pre-existing section passes; the new section prints FAIL lines such as `parent creates mc-kid's minor record -> 403 (wanted 200)` and `mc-mental gets mentalConsents/mc-kid -> 403 (wanted 200)`; the run ends `N FAILED`, exit 1.

- [ ] **Step 3: Write the rules**
After `athleteData()`, two top-level helpers (the only new code outside the block):

```
    // Mental consent (spec 6.2): 18 from UTC midnight of the 18th birthday, Feb-29-safe
    // (the research branch's adultRecord() arithmetic over any athlete doc).
    function adultOn(a) {
      let dob = a.get('dob', null);
      return dob is string && dob.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')
        && timestamp.date(int(dob.split('-')[0]) + 18, int(dob.split('-')[1]), 1)
          + duration.value(int(dob.split('-')[2]) - 1, 'd') <= request.time;
    }
    // claimInvite marks loginInvites/{loginEmail} 'claimed'; nothing on the athlete doc says so.
    function athleteLoginClaimed(a) {
      let email = a.get('loginEmail', null);
      return email is string && email.size() > 0
        && exists(/databases/$(database)/documents/loginInvites/$(email))
        && get(/databases/$(database)/documents/loginInvites/$(email)).data.get('status', null) == 'claimed';
    }
```

Inside `match /mentalConsents/{athleteId}` (after the `contractCheckins` block, with a header naming the spec, the probe file and "nobody deletes"), these helpers; `d` is `request.resource.data`, `r` is `resource.data`, and every map check is `keys().hasOnly(K) && keys().hasAll(K)`:

| helper | true when |
|---|---|
| `mcAthlete()` | `athleteData(athleteId)` |
| `mcName(n)`, `mcVersion(v)`, `mcPast(t)` | a 1..120 string; matches `[0-9]{4}-[0-9]{2}-[0-9]{2}`; a timestamp `<= request.time` and `>= timestamp.date(2026, 1, 1)` |
| `mcDobOk(a)` | `a.get('dob', null) is string && a.dob.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')` |
| `mcAdultRec(r)` | `r.adult == true` or `r.adultSignature != null` |
| `mcSelf()` | `me().role == 'athlete' && me().athleteId == athleteId` |
| `mcChanged()` | `d.diff(r).affectedKeys()` |
| `mcHistory(entry)` | `d.history == r.get('history', []).concat([entry])` |
| `mcContact(c, required)` | keys `name, phone, relationship`; (`mcName(name)` and phone a 1..40 string) or (not `required` and both null); relationship null or a string of at most 60 |
| `mcChoices(c, adult, paper)` | the eight choice keys; location in `['A', 'B', 'C', 'any']` (or null when `paper`); audio bool; `updatedAt == request.time`; `updatedBy == request.auth.uid`; adult: `driving == null`, parentSessions bool, `parentName` a name when parentSessions else null, `mcContact(contact, !paper)`; minor: driving bool or null, parentSessions and parentName null, `mcContact(contact, false)` |
| `mcAssent(s, at)` | keys `name, audio, at, readAloud, withdrawnBy`; a name; audio and readAloud bool; `s.at == at`; `withdrawnBy == null` |
| `mcCreateCommon(d)` | the 14 keys; `athleteId == athleteId`; `householdId == mcAthlete().householdId`; `mcVersion`; `signedBy == request.auth.uid`; adult bool; signer keys `role, name`, a name, `role == (adult ? 'athlete' : 'parent')`; countersign, adultSignature, adultConfirm null; `history == []` |
| `mcPortalCreate(d)` | common; `mcDobOk(mcAthlete())`; `method 'portal'`; `signedAt == request.time`; `adult == adultOn(mcAthlete())`; `mcChoices(choices, adult, false)`; adult ? `assent == null` : `mcAssent(assent, request.time)` |
| `mcPaperCreate(d)` | common; `method 'paper'`; `mcPast(signedAt)`; `mcChoices(choices, adult, true)`; adult ? `assent == null` : `mcAssent(assent, d.signedAt)` |
| `mcParentOf(hh, adult)` | `me().role == 'parent' && me().householdId == hh && !(adult && athleteLoginClaimed(mcAthlete()))` |
| `mcAdultConfirm(c)` | keys `name, at`; a name; `at == request.time` |
| `mcAdultFieldsChanged(n, o)` | audio, emergencyContact, parentSessions or parentName differ |
| `mcAssentChange(s, r)` | `me().role == 'parent'`; `r.adult == false`, `r.adultSignature == null`, `r.assent != null`; `!adultOn(mcAthlete())`; the assent keys; name and readAloud unchanged; audio bool; `at == request.time`; `withdrawnBy == null` |
| `mcFamilyChange()` | changed within `choices, history, assent, adultConfirm`; `mcChoices(d.choices, mcAdultRec(r), false)`; `mcHistory({choices: r.choices, assent: r.assent, adultConfirm: r.adultConfirm})`; a changed adultConfirm passes `mcAdultConfirm`; an adult record whose §11 fields changed needs `mcAdultConfirm(d.adultConfirm)`; a changed assent passes `mcAssentChange` |
| `mcWithdrawal()` | changed within `assent, history`; `!mcAdultRec(r)`; `r.assent != null && r.assent.audio == true`; the assent keys; `d.assent.audio == false`, `at == request.time`, `withdrawnBy == request.auth.uid`, name and readAloud unchanged; `mcHistory({choices, assent})` |
| `mcResign(paper)` | changed within `adultSignature, choices, history, countersign`; `r.adult == false && r.adultSignature == null && adultOn(mcAthlete())`; adultSignature keys `signedAt, signedBy, name, version, method`, `signedBy == request.auth.uid`, a name, `mcVersion`, `method == (paper ? 'paper' : 'portal')`, signedAt `== request.time` (`mcPast` when `paper`); `mcChoices(d.choices, true, paper)`; `d.countersign == null`; `mcHistory({choices, assent, countersign})` |
| `mcPaperCorrection()` | `r.method == 'paper'`; changed within `signedAt, signer, adult, assent, version, choices, history, signedBy`; `signedBy == request.auth.uid`; `mcPast(signedAt)`; `mcVersion`; signer as at create; `mcChoices(d.choices, d.adult, true)`; adult ? `d.assent == null` : either the stored assent unchanged (`r.assent != null && d.assent == r.assent`) or, when `r.assent` is null or has no `withdrawnBy`, `mcAssent(d.assent, d.signedAt)` (a withdrawal is never undone); `mcHistory` of `{choices, assent, signedAt, signer, adult, version, signedBy}` |

Then the allow lines, exactly:

```
      allow read: if signedIn() && (
        (me().role == 'parent' && me().householdId == resource.data.householdId)
        || mcSelf() || me().role in ['mental', 'ops', 'owner']);
      allow create: if signedIn() && mcPortalCreate(request.resource.data) && (
        mcParentOf(request.resource.data.householdId, request.resource.data.adult)
        || (mcSelf() && adultOn(mcAthlete())));
      allow create: if signedIn() && me().role in ['ops', 'owner'] && mcPaperCreate(request.resource.data);
      allow update: if signedIn() && mcFamilyChange() && (
        mcParentOf(resource.data.householdId, mcAdultRec(resource.data) || adultOn(mcAthlete()))
        || (mcSelf() && mcAdultRec(resource.data)));
      allow update: if signedIn() && mcWithdrawal() && (mcSelf() || me().role == 'mental');
      allow update: if signedIn() && (
        (mcResign(false) && (mcParentOf(resource.data.householdId, true) || mcSelf()))
        || (mcResign(true) && me().role in ['ops', 'owner']));
      allow update: if signedIn() && me().role == 'mental'
        && mcChanged().hasOnly(['countersign']) && resource.data.countersign == null
        && request.resource.data.countersign == { 'at': request.time, 'by': request.auth.uid };
      allow update: if signedIn() && me().role == 'owner' && mcPaperCorrection();
      allow delete: if false;
```

Parenthesize both arms of every `? :`; map literals quote their keys (`{'choices': r.choices, 'assent': r.assent, 'adultConfirm': r.adultConfirm}`). The athlete arm of a family change covers adult records only: a minor's own login only withdraws (Decided here #2).

- [ ] **Step 4: Run the probes to verify they pass; check additivity**
Run: `npx firebase-tools emulators:exec --only firestore --config firebase.consent.json --project rypacad "node scripts/verify-rules.mjs"`
Expected: every line PASS; ends `ALL PASS (both passes)`.

Run: `git diff 2e844de -- firestore.rules | grep -E '^-[^-]'`
Expected: no output.

- [ ] **Step 5: Commit**: `git add firestore.rules scripts/rules-probes/mental-consent.mjs scripts/verify-rules.mjs`, then `git commit -m "feat(rules): mentalConsents - family signs, paper, withdrawal, re-sign, countersign" -m "One doc per athlete off the coach-readable athlete doc. Parents sign a minor's record, an 18+ athlete their own (the parent is refused once a claimed login exists, a minor-era record included), ops/owner record paper, the owner corrects it, Yannick countersigns and records a withdrawal. History is proven on every update; nobody deletes. Additive; probed in taskMentalConsent." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 2: Status mirror and the consent gate

LANE functions. Depends on: Task 0.

**Files:**
- Create: `functions/portal/mental-consent-status.js`, `functions/portal/mental-consent-status.test.js`
- Modify: `functions/portal/notify-gates.js`, `functions/portal/notify-gates.test.js`

**Interfaces:**
- Consumes: `lib.todayISO(now)` from `./lib` (Chicago date); Task 0's `functions/test/fixtures/consent-status-cases.json`.
- Produces (`mental-consent-status.js`, no requires): `utcToday(now: Date): string`, `ageOn(dobISO: ?string, onISO: string): ?number`, `isAdultOn(dobISO, utcTodayISO): boolean`, `isAdultRecord(record): boolean`, `consentStatusFor(athlete: ?Object, record: ?Object, utcTodayISO: string): 'no-dob'|'unsigned'|'signed'|'needs-adult'`. (`notify-gates.js`): `shouldNoticeConsentNeeded({booking, athlete, household, record, config, now}): boolean`.

- [ ] **Step 1: Write the failing tests**
`functions/portal/mental-consent-status.test.js` (tiny runner):

```js
const CASES = require('../test/fixtures/consent-status-cases.json');
test('consentStatusFor: the shared table', () => {
  assert.equal(CASES.length, 13);
  for (const c of CASES) assert.equal(S.consentStatusFor(c.athlete, c.record, c.utcToday), c.want, c.label);
});
test('utcToday: the UTC date; 6 PM in Chicago is already tomorrow', () => {
  assert.equal(S.utcToday(new Date('2026-11-05T23:59:59Z')), '2026-11-05');
  assert.equal(S.utcToday(new Date('2026-11-06T00:00:00Z')), '2026-11-06');
});
test('the client copy carries the same function and runs the same table', () => {
  if (process.env.SKIP_CLIENT_MIRROR) return; // the functions lane; Task 19 runs it live
  const dir = path.join(__dirname, '../../frontend/src/portal/data');
  assert.match(fs.readFileSync(path.join(dir, 'mentalConsent.js'), 'utf8'), /export function consentStatusFor\(athlete, record, utcTodayISO\)/);
  assert.match(fs.readFileSync(path.join(dir, 'mentalConsent.test.js'), 'utf8'), /consent-status-cases\.json/);
});
```

`functions/portal/notify-gates.test.js`, one table test (`NOW = new Date('2026-11-05T15:00:00Z')`, 9 AM Chicago; `NOW2 = new Date('2026-11-06T01:00:00Z')`, 7 PM Nov 5 in Chicago and already Nov 6 in UTC; base `booking = {athleteId: 'ava', householdId: 'hh', type: 'mental', status: 'confirmed', date: '2026-11-12', createdBy: 'system', source: 'calendly'}`, `athlete = {name: 'Ava Test', dob: '2012-05-14'}`, `household = {}`, `record = null`, `config = {notices: true}`, `now = NOW`; each row overrides those):

| override | want |
|---|---|
| none (an unsigned minor's Calendly 1:1, written by `system`) | true |
| booking `createdBy: 'u-dana'`, no `source` (an in-app 1:1) | true |
| `config: {notices: false}`; `config: null` | false; false |
| booking `type: 'training'`; booking `status: 'cancelled'` | false; false |
| `household: {test: true}`; athlete `test: true`; `household: null` (the doc is missing) | false; false; false |
| `record: {adult: false, adultSignature: null}` (signed) | false |
| the same record with athlete dob `2008-11-05` (needs-adult) | true |
| athlete dob null (no-dob) | false |
| booking `date: '2026-11-04'` (a replayed or comped booking); `date: '2026-11-05'` (today) | false; true |
| booking `athleteId: null`; `athlete: null`; `booking: null` | false; false; false |
| `now: NOW2`, booking `date: '2026-11-05'` (still today in Chicago) | true |
| `now: NOW2`, the signed record, athlete dob `2008-11-06` (18 on the UTC date) | true |
| `now: NOW2`, the signed record, athlete dob `2008-11-07` | false |

- [ ] **Step 2: Run them to verify they fail**
Run: `cd functions && node portal/mental-consent-status.test.js` and `node portal/notify-gates.test.js`
Expected: FAIL, "Cannot find module './mental-consent-status'" and "shouldNoticeConsentNeeded is not a function".

- [ ] **Step 3: Implement**
`functions/portal/mental-consent-status.js`: a header naming `frontend/src/portal/data/mentalConsent.js` under "CHANGE ONE, CHANGE BOTH" and saying the status counts 18 on the UTC date to match `firestore.rules` `adultOn`; `ageOn` is `lib.ageAt`'s string arithmetic (no `Date` for the comparison, so Feb 29 turns 18 on Mar 1); `consentStatusFor` follows the Global Constraints order exactly.

`shouldNoticeConsentNeeded` in `notify-gates.js` (JSDoc like its neighbours): false unless `booking.type === 'mental'`, `booking.status === 'confirmed'`, `booking.athleteId`, `athlete`, `household` a non-null object, `config && config.notices === true`, `booking.date >= lib.todayISO(now)`, neither test mark, and `consentStatusFor(athlete, record, utcToday(now))` is `'unsigned'` or `'needs-adult'`. `source` and `createdBy` are never read. Export it beside the two existing gates.

- [ ] **Step 4: Run them to verify they pass**
Run: `cd functions && SKIP_CLIENT_MIRROR=1 node portal/mental-consent-status.test.js && node portal/notify-gates.test.js && npx eslint portal/mental-consent-status.js portal/notify-gates.js`
Expected: `N passing` twice, no `FAIL`, eslint clean.

- [ ] **Step 5: Commit**: `git add functions/portal/mental-consent-status.js functions/portal/mental-consent-status.test.js functions/portal/notify-gates.js functions/portal/notify-gates.test.js`, then `git commit -m "feat(functions): consent status mirror and the consent-needed gate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 3: Notice copy and the per-kind email lock

LANE functions. Depends on: Task 0.

**Files:**
- Create: `functions/portal/consent-notices.js`, `functions/portal/consent-notices.test.js`
- Modify: `functions/portal/notify.js` (`LINKS`, a `LOCKED_EMAIL_KINDS` constant, `channelAllowed`, `planFor`, the `sendNotice` plan line), `functions/portal/notify.test.js`

**Interfaces:**
- Consumes: `notices.dayLabel(dateISO)` (`'Thu, Nov 12'`) and `notices.firstNameOf(athlete)` from `./notices`.
- Produces: `CONSENT_URL = 'https://portal.rypacademy.com/portal/consent/mental'`, `CONTACT_LINE = 'Questions? Contact Yannick at yannick@rypgolf.com.'`, `consentNeeded({athlete, date, attendee, status, toAthlete}) → {title, body}` (`date` may be null), `consentReminder({athlete, date, attendee, status, toAthlete}) → {title, body}`, `consentSigned({athlete, adultRecord, toAthlete}) → {title, body}`. `notify.channelAllowed(prefs, category, channel, kind = null)`; `notify.LOCKED_EMAIL_KINDS = ['consent-needed', 'consent-reminder']`; `LINKS['consent-needed' | 'consent-reminder' | 'consent-signed'] = '/portal/consent/mental'`.

- [ ] **Step 1: Write the failing tests**
`consent-notices.test.js`: one `assert.deepEqual` per row (`ava = {name: 'Ava Test'}`, `max = {name: 'Max Test'}`, date `'2026-11-12'` unless the row says null, `attendee 'athlete'`, `status 'unsigned'`, `toAthlete false` unless the row says otherwise). `<U>` is `CONSENT_URL`; every body below ends with `'\n\n' + CONTACT_LINE`, which the rows leave out:

| builder and inputs | title | body (before the contact line) |
|---|---|---|
| `consentNeeded` ava | `Please sign Yannick's consent for Ava` | `Before Ava's session with Yannick on Thu, Nov 12, please sign the mental performance consent: <U>` |
| `consentNeeded` ava, attendee parent | same | `Before your session with Yannick about Ava on Thu, Nov 12, please sign the mental performance consent: <U>` |
| `consentNeeded` ava, date null | same | `Before Ava's next session with Yannick, please sign the mental performance consent: <U>` |
| `consentNeeded` max, toAthlete | `Please sign Yannick's consent` | `Before your session with Yannick on Thu, Nov 12, please sign the mental performance consent: <U>` |
| `consentNeeded` max, needs-adult | `Max's 18+ signature for Yannick` | `Max is 18 now, so Max signs the mental performance consent before the session with Yannick on Thu, Nov 12: <U>` |
| `consentNeeded` max, needs-adult, toAthlete | `Your 18+ signature for Yannick` | `You're 18 now, so please sign the mental performance consent yourself before your session with Yannick on Thu, Nov 12: <U>` |
| `consentReminder` ava | `Tomorrow: Yannick's consent for Ava` | `Ava's session with Yannick is tomorrow (Thu, Nov 12) and the mental performance consent is not signed yet: <U>` |
| `consentReminder` ava, attendee parent | same | `Your session with Yannick about Ava is tomorrow (Thu, Nov 12) and Ava's mental performance consent is not signed yet: <U>` |
| `consentReminder` ava, needs-adult | same | `Ava's session with Yannick is tomorrow (Thu, Nov 12) and Yannick needs Ava's own 18+ signature first: <U>` |
| `consentReminder` max, toAthlete | `Tomorrow: your consent for Yannick` | `Your session with Yannick is tomorrow (Thu, Nov 12) and your mental performance consent is not signed yet: <U>` |
| `consentSigned` ava, adultRecord false | `Ava's mental performance consent is signed` | `Thanks — Ava's mental performance consent is signed. You can change the recording or location choice any time from Ava's card in the portal.` |
| `consentSigned` max, adultRecord true | `Max's mental performance consent is signed` | `Thanks — Max's mental performance consent is signed.` |
| `consentSigned` max, adultRecord true, toAthlete | `Your mental performance consent is signed` | `Thanks — your mental performance consent is signed. You can change the recording or location choice any time in the portal.` |

A last case runs every row and asserts `!/\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(title + body)` and `body.endsWith(CONTACT_LINE)`.

`notify.test.js`, new cases:

```js
test('channelAllowed: the two consent asks always email; push and every other kind follow the saved value', () => {
  const off = {schedule: {email: false, push: false}};
  assert.equal(channelAllowed(off, 'schedule', 'email', 'consent-needed'), true);
  assert.equal(channelAllowed(off, 'schedule', 'email', 'consent-reminder'), true);
  assert.equal(channelAllowed(off, 'schedule', 'email', 'consent-signed'), false);
  assert.equal(channelAllowed(off, 'schedule', 'email', 'reminder-24h'), false);
  assert.equal(channelAllowed(off, 'schedule', 'push', 'consent-needed'), false);
  assert.equal(channelAllowed(off, 'schedule', 'email'), false);
});
test('LINKS: the three consent kinds open the consent list', () => {
  for (const k of ['consent-needed', 'consent-reminder', 'consent-signed']) assert.equal(LINKS[k], '/portal/consent/mental');
});
```

- [ ] **Step 2: Run them to verify they fail**
Run: `cd functions && node portal/consent-notices.test.js; node portal/notify.test.js`
Expected: FAIL, "Cannot find module './consent-notices'" and the first `channelAllowed` consent assertion.

- [ ] **Step 3: Implement**
`consent-notices.js`: the strings in the tests are the copy; a body is the sentence, `'\n\n'`, then `CONTACT_LINE`. The name is `notices.firstNameOf(athlete)`; the date `notices.dayLabel(date)`. A file header states the email-only ruling.

`notify.js`: `channelAllowed` returns true when `channel === 'email' && LOCKED_EMAIL_KINDS.includes(kind)` before the billing line; `planFor(recipient, category, kind)` passes it through; `sendNotice` calls `planFor(r, args.category, args.kind)`. Update the PREFERENCES header comment to name the two locked kinds and point at `data/parent.js`'s footnote (Task 13).

- [ ] **Step 4: Run them to verify they pass**
Run: `cd functions && node portal/consent-notices.test.js && node portal/notify.test.js && npx eslint portal/consent-notices.js portal/notify.js`
Expected: passing, eslint clean.

- [ ] **Step 5: Commit**: `git add functions/portal/consent-notices.js functions/portal/consent-notices.test.js functions/portal/notify.js functions/portal/notify.test.js`, then `git commit -m "feat(functions): consent notice copy, email locked on for the two consent asks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 4: The booking trigger and the day-before reminder

LANE functions. Depends on: Task 2, Task 3.

**Files:**
- Create: `functions/portal/mental-consent.js`, `functions/portal/mental-consent.test.js`
- Modify: `functions/index.js` (`onBookingCreated`, one require), `functions/portal/jobs.js` (`runSessionReminders`), `functions/portal/jobs.test.js`

**Interfaces:**
- Consumes: Task 2 `shouldNoticeConsentNeeded`, `consentStatusFor`, `utcToday`, `isAdultOn`; Task 3 `consentNeeded`, `consentReminder`; `notify.sendNotice` (called as `notify.sendNotice(...)` so tests can stub it, the `sweep.test.js` precedent).
- Produces (`mental-consent.js`): `readConsentConfig(store) → Promise<{notices: boolean, enabledAt: ?string}>` (`config/mentalConsent`; missing → `{notices: false, enabledAt: null}`); `consentAudience({store, athleteId, athlete, household, householdId, now}) → Promise<{householdId: ?string, athleteId: ?string, toAthlete: boolean}>`; `onMentalBookingCreated({booking, bookingId, store, now}) → Promise<'sent'|'duplicate'|'skipped'>`; `remindConsentFor({booking, bookingId, store, config, now, readers}) → Promise<'sent'|'duplicate'|'skipped'>` (`readers` = `{athletes, households, records}`, each `(id) => Promise<?Object>`). `runSessionReminders`'s summary gains `consent`, `consentDuplicate` and `consentError`.

- [ ] **Step 1: Write the failing tests**
`mental-consent.test.js` (fake db from `./fake-firestore`; `notify.sendNotice` replaced by a recorder: it answers `{duplicate: true}` when `kind_subjectKey` is already in its `seen` set, else adds it, pushes the args to `sent[]` and answers `{duplicate: false, sent: true}`; a row may force an answer; `NOW = new Date('2026-11-05T15:00:00Z')`):

```js
const base = () => ({
  'config/mentalConsent': {notices: true, enabledAt: '2026-11-05'},
  'households/hh': {name: 'Test family'},
  'athletes/ava': {name: 'Ava Test', dob: '2012-05-14', householdId: 'hh', loginEmail: 'ava@example.com'},
  'users/u-ava': {role: 'athlete', athleteId: 'ava', householdId: 'hh'},   // a claimed MINOR login
  'loginInvites/ava@example.com': {status: 'claimed'},
  'athletes/max': {name: 'Max Test', dob: '2007-03-02', householdId: 'hh'},
});
const cal = (o = {}) => Object.assign({athleteId: 'ava', householdId: 'hh', type: 'mental', status: 'confirmed',
  date: '2026-11-12', attendee: 'athlete', createdBy: 'system', source: 'calendly', sessionId: 'cal-1'}, o);
```

| test | input | expect |
|---|---|---|
| a minor's Calendly 1:1 asks the parents only | `onMentalBookingCreated({booking: cal(), bookingId: 'ava_cal-1', store: fakeDb(base()), now: NOW})` | `'sent'`; `sent[0]` has `kind 'consent-needed'`, `category 'schedule'`, `householdId 'hh'`, `athleteId null`, `subjectKey 'consent:ava:2026-11-12'`, `bookingId 'ava_cal-1'`, and the body of `consentNeeded({athlete: ava, date: '2026-11-12', attendee: 'athlete', status: 'unsigned', toAthlete: false})` |
| 18+ with a claimed invite is addressed alone | base with `athletes/max.loginEmail 'max@example.com'` and `loginInvites/max@example.com {status: 'claimed'}`; `consentAudience({athleteId: 'max', athlete: max, household: {name: 'Test family'}, householdId: 'hh', now: NOW, store})` | `{householdId: null, athleteId: 'max', toAthlete: true}` |
| the self-created 18+ member is addressed alone | `households/hm {createdBy: 'u-max2'}`, `users/u-max2 {role: 'athlete', athleteId: 'max2'}`, `athletes/max2 {dob: '2007-03-02', householdId: 'hm'}` | `{householdId: null, athleteId: 'max2', toAthlete: true}` |
| a provisioned 18+ login with no invite: the household | base plus `users/u-max {role: 'athlete', athleteId: 'max'}` | `{householdId: 'hh', athleteId: null, toAthlete: false}` |
| 18+ without a login: the household | base | `{householdId: 'hh', athleteId: null, toAthlete: false}` |
| skipped, nothing sent | no `config/mentalConsent`; `mentalConsents/ava {adult: false, adultSignature: null}`; `households/hh {test: true}`; no `households/hh` doc; `cal({type: 'training'})`; `cal({date: '2026-10-21'})` | `'skipped'` each; `sent.length === 0` |
| the ledger row exists | recorder forced `{duplicate: true}` | `'duplicate'` |

`jobs.test.js`, three new cases (the same recorder, reset per test, and `base()` docs, copied in as `consentBase()`; `now = new Date('2026-11-05T23:00:00Z')`, 5 PM Chicago, tomorrow `2026-11-06`). `reminderDocs()` = `consentBase()` plus `athletes/jo {name: 'Jo Test', dob: '2012-01-01', householdId: 'hh'}`, `mentalConsents/jo {adult: false, adultSignature: null}`, `sessions/tr-1 {date: '2026-11-06', time: '3:00 PM', type: 'training'}` and three bookings dated `2026-11-06`, `status 'confirmed'`, `householdId 'hh'`: `ava_cal-2` (ava, mental, `source 'calendly'`, `sessionId 'cal-2'`), `jo_cal-3` (jo, mental, Calendly, `cal-3`) and `jo_tr-1` (jo, training, `tr-1`):

| case | setup | expect |
|---|---|---|
| consent-reminder before the Calendly skip | `runSessionReminders({now, db: fakeDb(reminderDocs())})` | `pick(r, ['date', 'considered', 'sent', 'skipped', 'consent', 'consentDuplicate', 'consentError'])` = `{date: '2026-11-06', considered: 3, sent: 1, skipped: 2, consent: 1, consentDuplicate: 0, consentError: 0}`; `sent.map((s) => [s.kind, s.subjectKey])` = `[['consent-reminder', 'consent-reminder:ava:2026-11-06'], ['reminder-24h', 'jo_tr-1']]` |
| a second run the same day | the same `db` again | `{consent: 0, consentDuplicate: 1}`; still one `consent-reminder` in `sent` |
| a consent failure never costs a family its training reminder | `db.collection` wrapped so `'mentalConsents'` answers `{doc: () => ({get: async () => { throw new Error('boom'); }})}` | `pick(r, ['sent', 'consent', 'consentError'])` = `{sent: 1, consent: 0, consentError: 2}`; `sent` kinds `['reminder-24h']` |
| the switch off makes no consent read | `config/mentalConsent {notices: false}`; a counter on `db.collection('mentalConsents')` | `[r.consent, reads]` = `[0, 0]` |

- [ ] **Step 2: Run them to verify they fail**
Run: `cd functions && node portal/mental-consent.test.js; node portal/jobs.test.js`
Expected: FAIL, "Cannot find module './mental-consent'"; the jobs cases fail on `consent: undefined`.

- [ ] **Step 3: Implement**
`mental-consent.js` (header: spec §6.3, the switch, the audience rule, "held Calendly sessions have no booking and never reach here"):
- `readConsentConfig`: `notices === true` only.
- `consentAudience`: athlete only when `isAdultOn(athlete.dob, utcToday(now))` and either `loginInvites/{athlete.loginEmail}.status === 'claimed'` or (`household.createdBy` set and `users/{household.createdBy}.athleteId === athleteId`); otherwise the household.
- `onMentalBookingCreated`: return `'skipped'` before any read unless `booking.type === 'mental'`; read config, athlete, household and `mentalConsents/{athleteId}` (household id: `booking.householdId || athlete.householdId`); gate; audience; copy `consentNeeded({athlete, date: booking.date, attendee: booking.attendee || 'athlete', status, toAthlete})`; `notify.sendNotice({kind: 'consent-needed', category: 'schedule', householdId, athleteId, sessionId: booking.sessionId || null, bookingId, subjectKey: \`consent:${booking.athleteId}:${booking.date}\`, title, body})`; map the result to `'duplicate'` / `'sent'`.
- `remindConsentFor`: `'skipped'` before any read unless `config.notices === true`; then the same with the readers, `consentReminder`, kind `consent-reminder`, subjectKey `` `consent-reminder:${booking.athleteId}:${booking.date}` ``.

`jobs.js` `runSessionReminders` (a consent failure is contained; every other family's reminder still goes): `readConsentConfig` in its own try/catch before the loop (a failure logs `consent config read failed:` and counts as off); `households` and `records` cached readers beside `athletes`; in the loop, before the Calendly skip, when `booking.type === 'mental'` and `consentConfig.notices === true`, `remindConsentFor({booking, bookingId: doc.id, store, config: consentConfig, now, readers: {athletes, households, records}})` in its own try/catch: `'sent'` → `summary.consent += 1`, `'duplicate'` → `summary.consentDuplicate += 1`, a throw → `summary.consentError += 1` and `console.error('consent reminder error:', doc.id, err)`; the three counters start at 0 and the log line names them.

`functions/index.js`: `const mentalConsent = require('./portal/mental-consent');` and, as the first statement of the `onBookingCreated` handler after `const booking = ...`:

```js
      // Mental consent (2026-11-05): its own gate, BEFORE the
      // booking-confirmed gate, which skips every Calendly booking.
      try {
        await mentalConsent.onMentalBookingCreated({booking,
          bookingId: context.params.bookingId, store: db, now: new Date()});
      } catch (err) {
        console.error('onBookingCreated consent error:', err);
      }
```

- [ ] **Step 4: Run them to verify they pass**
Run: `cd functions && node portal/mental-consent.test.js && node portal/jobs.test.js && node portal/notify-gates.test.js && npx eslint .`
Expected: passing, eslint clean.

- [ ] **Step 5: Commit**: `git add functions/portal/mental-consent.js functions/portal/mental-consent.test.js functions/portal/jobs.js functions/portal/jobs.test.js functions/index.js`, then `git commit -m "feat(functions): ask for Yannick's consent when a 1:1 is booked and the day before" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 5: Yannick's callable and the signed receipt

LANE functions. Depends on: Task 4.

**Files:**
- Create: `functions/portal/mental-consent-request.js`, `functions/portal/mental-consent-request.test.js`
- Modify: `functions/portal/mental-consent.js` (receipt), `functions/portal/mental-consent.test.js`, `functions/index.js` (two requires, two exports, the header list), `functions/test/check-exports.js`

**Interfaces:**
- Consumes: Task 4 `readConsentConfig`, `consentAudience`; Task 2 `consentStatusFor`, `utcToday`; Task 3 `consentNeeded`, `consentSigned`; `lib.todayISO`, `lib.chicagoDate`; `HttpsError` from `firebase-functions/v1` (`functions.https.HttpsError`, as `family.js` uses it); `MAIL_SECRETS`.
- Produces: `requestMentalConsentHandler(data, context, deps = {db, now}) → Promise<{status: 'sent'|'duplicate'}>`; `requestMentalConsent` (v1 `onCall`, `runWith({secrets: MAIL_SECRETS})`); in `mental-consent.js` `onConsentSignedHandler(snap, context, deps = {db, now}) → Promise<'sent'|'duplicate'|'skipped'>` and `onMentalConsentSigned` (`runWith({secrets: MAIL_SECRETS}).firestore.document('mentalConsents/{athleteId}').onCreate`, never throws); `exports.requestMentalConsent`, `exports.onMentalConsentSigned`; `check-exports` 20.

- [ ] **Step 1: Write the failing tests**
`mental-consent-request.test.js` (`NOW = 2026-11-05T15:00:00Z`; `ctx = {auth: {uid: 'u-yannick'}}`; docs = Task 4's `base()` plus `users/u-yannick {role: 'mental'}`; the Task 4 recorder; `call(docs, data = {athleteId: 'ava'}, c = ctx)` runs `requestMentalConsentHandler(data, c, {db: fakeDb(docs), now: NOW})`). Refusals, one test, in this order, each an `HttpsError` and nothing sent:

| change to the base | code | `details.reason` |
|---|---|---|
| context `{}` | unauthenticated | (any) |
| `users/u-yannick {role: 'ops'}` | permission-denied | `not-mental` |
| data `{}` | invalid-argument | `no-athlete` |
| `config/mentalConsent {notices: false}` | failed-precondition | `disabled` |
| data `{athleteId: 'nobody'}` | not-found | `no-athlete` |
| no `households/hh` doc | failed-precondition | `no-household` |
| `households/hh {test: true}` | failed-precondition | `test-household` |
| `mentalConsents/ava {adult: false, adultSignature: null}` | failed-precondition | `already-signed` |
| `athletes/ava` without a dob | failed-precondition | `no-dob` |
| the recorder forced `{duplicate: false, sent: false, error: 'boom'}` (the ledger write failed) | unavailable | `send-failed` |

```js
test('sends under asked-<today>, naming the next confirmed 1:1', async () => {
  const docs = Object.assign(base(), {
    'bookings/a1': {athleteId: 'ava', type: 'mental', status: 'confirmed', date: '2026-11-19'},
    'bookings/a2': {athleteId: 'ava', type: 'mental', status: 'cancelled', date: '2026-11-08'},
    'bookings/a3': {athleteId: 'ava', type: 'mental', status: 'attended', date: '2026-10-29'},
    'bookings/a4': {athleteId: 'ava', type: 'mental', status: 'confirmed', date: '2026-11-12'},
  });
  assert.deepEqual(await call(docs), {status: 'sent'});
  assert.deepEqual([sent[0].kind, sent[0].subjectKey], ['consent-needed', 'consent:ava:asked-2026-11-05']);
  assert.ok(sent[0].body.includes('on Thu, Nov 12'));
});
test('a consent-needed row created today is a duplicate; one created yesterday for a session today is not', async () => {
  const at = (iso) => ({toMillis: () => Date.parse(iso)});
  const row = (key, iso) => ({[`notifications/consent-needed_${key}`]: {kind: 'consent-needed', subjectKey: key, createdAt: at(iso)}});
  assert.deepEqual(await call(Object.assign(base(), row('consent:ava:2026-11-12', '2026-11-05T14:00:00Z'))), {status: 'duplicate'});
  assert.equal(sent.length, 0);
  assert.deepEqual(await call(Object.assign(base(), row('consent:ava:2026-11-05', '2026-11-04T20:00:00Z'))), {status: 'sent'});
  assert.equal(sent[0].subjectKey, 'consent:ava:asked-2026-11-05');
});
```

`mental-consent.test.js`, receipt cases (`snapOf(record)` = `{id: 'ava', data: () => record}`, `ctxAva` = `{params: {athleteId: 'ava'}}`):

```js
test('receipt: a portal minor record -> consent-signed to the parents, keyed on the athlete', async () => {
  assert.equal(await MC.onConsentSignedHandler(snapOf({method: 'portal', adult: false}), ctxAva, {db: fakeDb(base()), now: NOW}), 'sent');
  assert.deepEqual(pick(sent[0], ['kind', 'householdId', 'athleteId', 'subjectKey']),
    {kind: 'consent-signed', householdId: 'hh', athleteId: null, subjectKey: 'ava'});
});
test('receipt: paper sends nothing; the switch is not consulted', async () => {
  const off = Object.assign(base(), {'config/mentalConsent': {notices: false}});
  assert.equal(await MC.onConsentSignedHandler(snapOf({method: 'paper', adult: false}), ctxAva, {db: fakeDb(off), now: NOW}), 'skipped');
  assert.equal(await MC.onConsentSignedHandler(snapOf({method: 'portal', adult: false}), ctxAva, {db: fakeDb(off), now: NOW}), 'sent');
});
```

`functions/test/check-exports.js`: `requestMentalConsent: MAIL` and `onMentalConsentSigned: MAIL` in `EXPECTED`, the count assertion `20`, the header comment and the message naming both.

- [ ] **Step 2: Run them to verify they fail**
Run: `cd functions && node portal/mental-consent-request.test.js; node portal/mental-consent.test.js; node test/check-exports.js`
Expected: FAIL, the missing module, `onConsentSignedHandler is not a function`, and the export list assertion.

- [ ] **Step 3: Implement**
`mental-consent-request.js` checks in the test's order: `context.auth`; `users/{uid}.role === 'mental'`; `athleteId` a non-empty string; `readConsentConfig(...).notices`; the athlete doc; the household doc (`athlete.householdId`); `household.test` or `athlete.test`; status `'signed'` → already-signed, `'no-dob'` → no-dob. The duplicate guard: `notifications.where('subjectKey', '>=', \`consent:${id}:\`).where('subjectKey', '<', \`consent:${id};\`)`, any row with `kind === 'consent-needed'` whose `lib.chicagoDate(new Date(createdAt.toMillis ? createdAt.toMillis() : createdAt))` is `lib.todayISO(now)` → `{status: 'duplicate'}`. The next date: `bookings.where('athleteId', '==', id)`, `type 'mental'`, `status 'confirmed'`, `date >= today`, the smallest (its `attendee` too), else `null`. Then audience, copy and `notify.sendNotice` with subjectKey `` `consent:${id}:asked-${today}` ``, and the result: `res.duplicate` → `{status: 'duplicate'}`; `!res.sent` → `throw new functions.https.HttpsError('unavailable', 'The reminder could not be sent. Try again.', {reason: 'send-failed'})`; else `{status: 'sent'}`.

`onConsentSignedHandler`: `'skipped'` unless `record.method === 'portal'`; athlete and household reads; audience; `consentSigned({athlete, adultRecord: record.adult === true, toAthlete})`; kind `consent-signed`, subjectKey `context.params.athleteId`.

`functions/index.js`: `const {requestMentalConsent} = require('./portal/mental-consent-request');`, `exports.requestMentalConsent = requestMentalConsent;`, `exports.onMentalConsentSigned = mentalConsent.onMentalConsentSigned;` under a short comment block, and both names in the header's function list.

- [ ] **Step 4: Run them to verify they pass**
Run: `cd functions && node portal/mental-consent-request.test.js && node portal/mental-consent.test.js && node test/check-exports.js && npx eslint . && wc -l index.js portal/mental-consent.js portal/mental-consent-request.js`
Expected: passing; `ok  20 functions exported, secrets bound per contract 6.4`; eslint clean; every file under 500 lines.

- [ ] **Step 5: Commit**: `git add functions/portal/mental-consent-request.js functions/portal/mental-consent-request.test.js functions/portal/mental-consent.js functions/portal/mental-consent.test.js functions/index.js functions/test/check-exports.js`, then `git commit -m "feat(functions): requestMentalConsent callable and the consent-signed receipt" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 6: The emulator replay

LANE functions. Depends on: Task 4, Task 5.

**Files:**
- Modify: `functions/test/verify-notifications.js` (host and origin from the environment; `config` and `mentalConsents` in `wipe()`; a dob on teddy, wren and nell in `seed()`; STEP 8)
- Local only (Task 0): `firebase.consent-fn.json`, `scripts/emulator.consent-fn.env`, `functions/.secret.local`, `functions/.env.local` in `wt-consent-fn`

**Interfaces:**
- Consumes: Tasks 4-5 deployed in the functions emulator; `jobs.runSessionReminders`; `consent-notices`.
- Produces: STEP 8 of the replay; `process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8082'` and `` `${process.env.VERIFY_FUNCTIONS_ORIGIN || 'http://127.0.0.1:5001'}/rypacad/us-central1/stripeWebhook` `` (the defaults keep the functions-lane run unchanged).

- [ ] **Step 1: Write the failing replay step**
In `seed()`: `dob: '2012-05-14'` on teddy, `'2013-01-01'` on wren and nell. STEP 8 after STEP 7 (`plus2` and `tomorrow` as the harness defines them):

```
STEP 8  mental consent: the booking trigger, the email lock, the switch, the day-before job
  set config/mentalConsent {notices: true, enabledAt: today}
  write bookings/teddy_cal-c1 {athleteId 'teddy', sessionId 'cal-c1', type 'mental', status 'confirmed', date plus2,
                               createdBy 'system', source 'calendly', attendee 'athlete', householdId 'hart'}
  waitFor notifications/consent-needed_consent:teddy:<plus2>
  check  [kind, category, householdId, athleteId, subjectKey] = ['consent-needed', 'schedule', 'hart', null, 'consent:teddy:<plus2>']
  check  recipients = ['u-pat:skipped/off', 'u-robin:skipped/no-device']        (parents only; u-teddy is never addressed)
  check  body = consentNeeded({athlete: teddy, date: plus2, attendee: 'athlete', status: 'unsigned', toAthlete: false}).body
  check  NO booking-confirmed_teddy_cal-c1                                       (the Calendly skip still holds)
  write bookings/teddy_cal-c2 {athleteId 'teddy', sessionId 'cal-c2', the rest as c1}; settle(1500)
  check  consent-needed count still 1
  write bookings/wren_cal-c3 {athleteId 'wren', sessionId 'cal-c3', type 'mental', status 'confirmed', date tomorrow,
                              createdBy 'system', source 'calendly', householdId 'lopez'}
  run    jobs.runSessionReminders({now: NOW, db})
  check  [r.consent, r.consentDuplicate, r.consentError] = [1, 0, 0]
  check  notifications/consent-reminder_consent-reminder:wren:<tomorrow> recipients = ['u-sam:skipped/no-device']
                                                                                 (u-sam has schedule email off: the lock)
  check  NO reminder-24h_wren_cal-c3
  set config/mentalConsent {notices: false}
  write bookings/nell_cal-c4 {athleteId 'nell', sessionId 'cal-c4', type 'mental', status 'confirmed', date plus2,
                              createdBy 'system', source 'calendly', householdId 'lopez'}; settle(1500)
  check  NO notifications/consent-needed_consent:nell:<plus2>
```

- [ ] **Step 2: Run it to verify it fails**
Run (wt-consent-fn root): PREFLIGHT, then `npx firebase-tools emulators:exec --only firestore,functions --config firebase.consent-fn.json --project rypacad "node --env-file=scripts/emulator.consent-fn.env functions/test/verify-notifications.js" 2>&1 | tee <scratchpad>/consent-replay-fn.log`, then `grep -c 'Trying to access secret' <scratchpad>/consent-replay-fn.log`.
Expected before Tasks 4-5 are on the branch: `preflight ok`; STEP 8 times out waiting for the consent-needed row and the log ends `1 CHECK(S) FAILED` or more; the grep prints `0`. With them: go to Step 4.

- [ ] **Step 3: Implement**
Only the harness edits above; no production code changes in this task. If STEP 8 finds a defect, fix it in the owning Task 4/5 file with a unit test first.

- [ ] **Step 4: Run it to verify it passes**
Run: the same three commands.
Expected: `preflight ok`; the log contains `=== ALL CHECKS PASSED ===`; the grep prints `0`.

- [ ] **Step 5: Commit**: `git add functions/test/verify-notifications.js`, then `git commit -m "test(functions): replay the consent notices on the emulator" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 7: The form text and the version

LANE frontend. Depends on: Task 0.

**Files:**
- Create: `frontend/src/portal/data/mentalConsent.js` (the version only; Task 8 adds the rest), `frontend/src/portal/data/mentalConsentTerms.js`, `frontend/src/portal/data/mentalConsentTerms.test.js`

**Interfaces:**
- Produces: `data/mentalConsent.js` `CONSENT_VERSION = '2026-10-30'` (a header: no form text in this module; it ships in the main bundle). `data/mentalConsentTerms.js` re-exports `CONSENT_VERSION` and exports `TERMS = { version, purpose, sections: [{ id: 's2'..'s8', heading, paragraphs: string[] }] }`; `ASSENT_INTRO`, `ASSENT_POINTS` (9), `ASSENT_CLOSING`; `PARENT_INTRO`, `PARENT_ACKNOWLEDGEMENTS` (10), `PARENT_CLOSING`; `ADULT_INTRO`, `ADULT_TERMS` (4), `ADULT_CLOSING`; `YANNICK_EMAIL = 'yannick@rypgolf.com'`; `CONTACT_LINE = 'Questions? Contact Yannick at yannick@rypgolf.com.'`; `LOCATION_OPTIONS = [{ id: 'A', label: 'Academy quiet area (Option A)' }, { id: 'B', label: 'Eden Prairie conference room (Option B)' }, { id: 'C', label: 'Online (Option C)' }, { id: 'any', label: 'Decide session by session' }]`; `DRIVING_LABEL` (the form's driving checkbox sentence, from "My athlete has my permission" to "present."); `PARENT_SESSIONS_LABEL = 'A parent/guardian may book a parent session or join a joint session'`. Only lazy consent screens and `components/consent/FlowSteps.js` import the terms module.

- [ ] **Step 1: Write the failing test**
```js
import fs from 'fs';
import path from 'path';
import * as T from './mentalConsentTerms';
import { CONSENT_VERSION } from './mentalConsent';

const LINES = fs.readFileSync(path.resolve(__dirname, '../../../../docs/portal/plans/2026-10-30-mental-consent/01-consent-form-FINAL.txt'), 'utf8')
  .split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const at = (prefix) => LINES.findIndex((l) => l.startsWith(prefix));
const between = (a, b) => LINES.slice(at(a) + 1, at(b));
const HEADINGS = ['2. What the Program Includes', '3. Understanding the Service: Mental Performance Coaching', '4. Parent/Guardian and Joint Sessions',
  '5. Session Locations & Privacy', '6. Confidentiality Agreement', '7. Scheduling & Cancellations', '8. Communication, Audio Recording & Client Records'];

test('purpose and sections 2-8 are the FINAL text, word for word, without the two checkbox lines', () => {
  expect(CONSENT_VERSION).toBe('2026-10-30');
  expect(T.CONSENT_VERSION).toBe(CONSENT_VERSION);
  expect(T.TERMS.version).toBe(CONSENT_VERSION);
  expect(`Purpose of this Form: ${T.TERMS.purpose}`).toBe(LINES[at('Purpose of this Form:')]);
  expect(T.TERMS.sections.map((s) => s.heading)).toEqual(HEADINGS);
  const ends = [...HEADINGS.slice(1), '9. Athlete'];
  T.TERMS.sections.forEach((s, i) => {
    const want = between(HEADINGS[i], ends[i]).filter((l) => !l.startsWith('Location preference:') && !l.startsWith('Driving permission'));
    expect(s.paragraphs).toEqual(want);
  });
});
test('section 9, 10 and 11 parts', () => {
  expect(T.ASSENT_POINTS).toEqual(between('I understand that:', 'Audio recording of my sessions:'));
  expect(T.ASSENT_POINTS).toHaveLength(9);
  expect(T.ASSENT_CLOSING).toBe(LINES[at('By signing below, I agree to participate')]);
  expect(T.PARENT_INTRO).toBe(LINES[at('By signing below, I/we')]);
  expect(T.PARENT_ACKNOWLEDGEMENTS).toEqual(between('By signing below, I/we', 'Audio recording of athlete sessions:'));
  expect(T.PARENT_ACKNOWLEDGEMENTS).toHaveLength(10);
  expect(T.PARENT_CLOSING).toBe(LINES[at('I/We have had the opportunity')]);
  expect(T.ADULT_INTRO).toBe(LINES[at('Athletes who are 18 or older complete this section')]);
  // the next four lines; "Emergency Contact (Name & Phone):" first appears in section 1, so it cannot end a range
  expect(T.ADULT_TERMS).toEqual(LINES.slice(at('Athletes who are 18 or older complete this section') + 1).slice(0, 4));
  expect(T.ADULT_CLOSING).toBe(LINES[at('By signing below, I confirm')]);
});
test('email only: no phone number anywhere in the module; section 8 names the address', () => {
  expect(JSON.stringify(T)).not.toMatch(/\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  expect(T.TERMS.sections[6].paragraphs.join(' ')).toContain('yannick@rypgolf.com');
});
```

`at('By signing below, I/we')` must find section 10's line, not section 9's ("I agree"); the prefixes above are distinct in the FINAL text.

- [ ] **Step 2: Run it to verify it fails**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/mentalConsentTerms.test.js`
Expected: FAIL, "Cannot find module './mentalConsentTerms'".

- [ ] **Step 3: Implement**
Copy each line from `01-consent-form-FINAL.txt` into the terms module as a string literal (no reflow, no smart-quote changes); a header says the module is the academy's single copy, owner-approved, and that a revision is a new `CONSENT_VERSION` in `data/mentalConsent.js` plus new text with the drift test kept green.

- [ ] **Step 4: Run it to verify it passes**
Run: the same command.
Expected: PASS.

- [ ] **Step 5: Commit**: `git add frontend/src/portal/data/mentalConsent.js frontend/src/portal/data/mentalConsentTerms.js frontend/src/portal/data/mentalConsentTerms.test.js`, then `git commit -m "feat(portal): mental consent form text, held to the FINAL copy by a test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 8: Status, family rows, lines and write shapes

LANE frontend. Depends on: Task 7, Task 0 (the shared table).

**Files:**
- Modify: `frontend/src/portal/data/mentalConsent.js`
- Create: `frontend/src/portal/data/mentalConsent.test.js`, `mentalConsentWrites.js`, `mentalConsentWrites.test.js` (all under `frontend/src/portal/data/`)

**Interfaces:**
- Consumes: `ageOnDate`, `isAdultOnDate` from `./signup`; `academyDateISO` from `./calendar`; Task 7 `CONSENT_VERSION`.
- Produces (`mentalConsent.js`):
  - `consentStatusFor(athlete, record, utcTodayISO)` (exact signature; Task 2's test greps it), `utcTodayISO(now = new Date())`, `isAdultRecord(record)`, `recordingAllowed(athlete, record, utcTodayISO)`, `drivingAsked(athlete, utcTodayISO)` (minor and 16+), `msOf(stamp)` (Timestamp `toMillis`, Date, ISO, number → ms or null), `shortDate(stamp)` (`'Oct 30'`, the Chicago date), `paperDateToStamp(iso) → Date` (Chicago midnight of that date).
  - `branchFor({ viewer, athlete, claimedLogin, utcTodayISO }) → 'no-dob'|'minor'|'minor-login'|'adult'|'adult-handover'|'adult-elsewhere'` (`viewer` = `'parent'|'athlete'`); `flowFacts({ viewer, athlete, record, claimedLogin, now = new Date() }) → { utcToday, status, branch, drivingAsked, under13 }` (every value from the one UTC date of `now`; `under13` = age under 13 on it); `signerFor({ userDoc, authUser, household }) → { name, email }` (name: `userDoc.displayName`, else `authUser.displayName`, else `household.guardian.name`; email: `userDoc.email`, else `authUser.email`, else `household.guardian.email`).
  - `familyRows({ viewer, athletes, records, bookings, claimed, draftStates, utcToday, today }) → FamilyRow[]`, `FamilyRow = { athleteId, name, firstName, viewer, status, record, adultToday, claimedLogin, drivingUnanswered, nextMental: { date, attendee } | null, draft: 'fresh'|'expired'|null }`; `nextMental` from bookings with `type 'mental'`, `status 'confirmed'`, `date >= today`, the earliest; `draft` is null whenever a record exists, else `draftStates[id]` mapped `'fresh'`/`'version-changed'` → `'fresh'`, `'expired'` → `'expired'`, `'adult-changed'`/null → null; rows sorted by name.
  - `familyLine(row) → { text, action: 'sign'|'continue'|'restart'|'change'|'withdraw'|null, label: 'Sign now'|'Continue'|'Start again'|'Change choices'|'Stop recording'|null, href }`; `homeCardFor(rows) → { athleteId, text, href } | null`; `bookingLineFor(row) → { text, href } | null`.
  - `STAFF_STATUS_LABEL = { signed: 'Signed', unsigned: 'Not signed', 'needs-adult': 'Needs 18+', 'no-dob': 'No date of birth' }`; `LOCATION_SHORT = { A: 'Academy quiet area', B: 'Eden Prairie', C: 'Online', any: 'Session by session' }`; `staffConsentSummary({ athlete, record, utcToday }) → { status, label: 'Complete'|STAFF_STATUS_LABEL[status], summary: string|null, recording: string, canCountersign, canRemind, canWithdraw, audience: 'athlete'|'household' }` (`canWithdraw` = signed, not `isAdultRecord`, `assent.audio === true`; `audience` = `'athlete'` when 18+ on `utcToday` and `athlete.loginEmail` is set, the closest Yannick's role can read to the server's claimed test); `needsConsentBeforeSession(row) → boolean`; `trackerRows({ athletes, households, records, bookings, today, utcToday }) → TrackerRow[]`, `TrackerRow = { athleteId, name, familyName, nextMental, lastMental, status, label }` (every athlete with a non-cancelled mental booking, past or future; not-signed with a 1:1 ahead first by date, then the other not-signed by name, then signed by name).
- Produces (`mentalConsentWrites.js`, all pure; `stamp` is `serverTimestamp()` in live code and `'NOW'` in tests; `ChoicesInput = { location, audio, driving, emergencyContact: { name, phone, relationship }, parentSessions, parentName }`):
  - `normalizeChoices(input, { adult, uid, stamp })` (trim; blank relationship → null; contact with blank name and phone → both null; minor → `parentSessions`/`parentName` null; adult → `driving` null, `parentName` null unless `parentSessions`)
  - `portalRecord({ athleteId, householdId, uid, adult, signerName, choices, assent, stamp })` (`assent` = `{ name, audio, readAloud }` for a minor, null for an adult)
  - `paperRecord({ athleteId, householdId, uid, signedAt, adult, signerName, version, choices, assent, stamp })`
  - `choicesUpdate({ current, uid, choices, assentAudio, adultConfirmName, stamp })` (history entry `{ choices, assent, adultConfirm: current.adultConfirm ?? null }`), `withdrawalUpdate({ current, uid, stamp })`, `adultResign({ current, uid, name, choices, stamp, paperSignedAt })` (`adultSignature.method` `'paper'` when `paperSignedAt`, else `'portal'`), `countersignUpdate({ uid, stamp })`, `paperCorrection({ current, uid, signedAt, version, adult, signerName, choices, assent, stamp })` (always writes `choices: normalizeChoices(choices ?? current.choices, { adult, uid, stamp })`; a minor's `assent` stays `current.assent` when it was withdrawn or when the name and audio match it, else `{ name, audio, at: signedAt, readAloud: current.assent?.readAloud ?? false, withdrawnBy: null }`), `adultFieldsChanged(prev, next)`.

- [ ] **Step 1: Write the failing tests**
`mentalConsent.test.js`: read the shared table `fs.readFileSync(path.resolve(__dirname, '../../../../functions/test/fixtures/consent-status-cases.json'))` and run every row through `consentStatusFor` (13 rows); fixtures `D = '2026-11-05'`, `minorChoices` (location B, audio true, driving null, a blank contact), `adultChoices` (location C, audio true, parentSessions true, parentName 'Dana Test', contact Lee Test / test-phone / aunt) `adultChoicesStored = normalizeChoices(adultChoices, { adult: true, uid: 'u', stamp: 'T' })` and `minorRec(c, a)` = `{ adult: false, adultSignature: null, choices: { audio: c }, assent: { audio: a } }`; then:

| call (`D = '2026-11-05'`) | expected |
|---|---|
| `recordingAllowed({ dob: '2012-05-14' }, minorRec(choicesAudio, assentAudio), D)` for (true, true), (true, false), (false, true) | `true`, `false`, `false` |
| `recordingAllowed({ dob: '2007-03-02' }, { adult: true, choices: { audio: true }, assent: null }, D)` | `true` |
| `recordingAllowed({ dob: '2008-11-05' }, minorRec(true, true), D)` (needs-adult) | `false` |
| `branchFor` for (parent, no dob), (parent, 2012-05-14), (athlete, 2012-05-14), (athlete, 2007-03-02), (parent, 2007-03-02), (parent, 2007-03-02, claimed) | `'no-dob'`, `'minor'`, `'minor-login'`, `'adult'`, `'adult-handover'`, `'adult-elsewhere'` |
| `drivingAsked({ dob }, D)` for 2010-11-05, 2010-11-06, 2007-03-02 | `true`, `false`, `false` |
| at `NOW2 = new Date('2026-11-06T01:00:00Z')`: `utcTodayISO(NOW2)`; `academyDateISO(NOW2)` | `'2026-11-06'`; `'2026-11-05'` |
| `flowFacts({ viewer: 'parent', athlete: { dob }, record: null, claimedLogin: false, now: NOW2 })` for dob 2008-11-06 | `branch 'adult-handover'`, `status 'unsigned'`, `utcToday '2026-11-06'` |
| the same for dob 2010-11-06; 2013-11-06; 2013-11-07 | `drivingAsked true`; `under13 false`; `under13 true` |
| `paperDateToStamp('2026-10-28').toISOString()`; `paperDateToStamp('2026-11-05').toISOString()`; `shortDate(paperDateToStamp('2026-10-28'))` | `'2026-10-28T05:00:00.000Z'`; `'2026-11-05T06:00:00.000Z'`; `'Oct 28'` |
| `signerFor({ userDoc: { displayName: 'Alex Whitfield', email: 'alex@example.com' }, authUser: {}, household: { guardian: { name: 'Dana', email: 'dana@example.com' } } })` | `{ name: 'Alex Whitfield', email: 'alex@example.com' }` |
| `signerFor({ userDoc: {}, authUser: { displayName: null, email: 'alex@example.com' }, household: { guardian: { name: 'Dana', email: 'dana@example.com' } } })` | `{ name: 'Dana', email: 'alex@example.com' }` |

`familyLine` table (rows from a `row({...})` helper; signed record `signedAt` = `new Date('2026-10-30T17:00:00Z')`, `signer.name 'Dana Whitfield'`):

| row | text | label |
|---|---|---|
| parent, unsigned | `Not signed` | `Sign now` |
| parent, signed | `Signed Oct 30 by Dana` | `Change choices` |
| parent, signed, `draft 'fresh'` (a draft left on another device) | `Signed Oct 30 by Dana` | `Change choices` |
| parent, signed, 16+ now, `driving: null` | `Signed Oct 30 by Dana · Driving permission not answered` | `Change choices` |
| parent, needs-adult (Max), no claimed login | `Needs Max's 18+ signature` | `Sign now` |
| parent, needs-adult (Max), claimed login | `Needs Max's 18+ signature · Max signs this on their own login` | null |
| parent, adult signed, claimed | `Signed Oct 30 · Max manages this` | null |
| parent, unsigned 18+, claimed | `Not signed · Max signs this on their own login` | null |
| parent, draft fresh | `Waiting for Ava's agreement` | `Continue` |
| parent, draft expired | `Draft expired` | `Start again` |
| parent, no dob | `Add Ava's date of birth first` | null |
| athlete (minor), unsigned | `Your parent signs this` | null |
| athlete (minor), signed, both audios yes | `Signed Oct 30 · Your parent manages this · Recording: yes` | `Stop recording` |
| athlete (minor), signed, `assent.audio false` | `Signed Oct 30 · Your parent manages this · Recording: no` | null |
| athlete 18+, unsigned / needs-adult / signed | `Not signed` / `Needs your 18+ signature` / `Signed Oct 30` | `Sign now` / `Sign now` / `Change choices` |

`href` is `/portal/consent/mental/<id>` for sign, continue and restart, `/portal/consent/mental/<id>?change=1` for change and `/portal/consent/mental?withdraw=1` for withdraw (action `'withdraw'`: signed, minor-era record, `assent.audio === true`, athlete viewer). Then:

```js
test('homeCardFor: the first signable athlete with a confirmed 1:1 ahead', () => {
  expect(homeCardFor([signedJordan, unsignedReese({ nextMental: { date: '2026-11-12', attendee: 'athlete' } }), unsignedNico])).toEqual({
    athleteId: 'reese', text: "Sign Yannick's consent for Reese before the session on Thu, Nov 12", href: '/portal/consent/mental/reese' });
  expect(homeCardFor([unsignedNico])).toBeNull();                                 // nothing booked
  expect(homeCardFor([claimedAdultUnsigned({ nextMental: { date: '2026-11-12' } })])).toBeNull(); // no button for the parent
  expect(homeCardFor([needsAdultMax({ nextMental: { date: '2026-11-12' } })])).toEqual({
    athleteId: 'max', text: "Sign Yannick's consent for Max before the session on Thu, Nov 12", href: '/portal/consent/mental/max' });
  expect(homeCardFor([needsAdultMax({ claimedLogin: true, nextMental: { date: '2026-11-12' } })])).toBeNull();
});
test('bookingLineFor', () => {
  expect(bookingLineFor(unsignedReese())).toEqual({ text: 'Consent needed · Sign', href: '/portal/consent/mental/reese' });
  expect(bookingLineFor(minorLoginUnsigned())).toEqual({ text: 'Consent needed · Your parent signs this', href: null });
  expect(bookingLineFor(claimedAdultUnsigned())).toEqual({ text: 'Consent needed · Max signs this on their own login', href: null });
  expect(bookingLineFor(needsAdultMax({ claimedLogin: true }))).toEqual({ text: 'Consent needed · Max signs this on their own login', href: null });
  expect(bookingLineFor(noDob())).toEqual({ text: "Consent needed · Add Ava's date of birth first", href: null });
  expect(bookingLineFor(signedJordan)).toBeNull();
});
test('familyRows: nextMental reads confirmed mental bookings only, from today; a record beats a draft', () => {
  const reese = { id: 'reese', name: 'Reese Whitfield', dob: '2014-03-02' };
  const rows = familyRows({ viewer: 'parent', athletes: [reese], records: [],
    bookings: [{ athleteId: 'reese', type: 'mental', status: 'cancelled', date: '2026-11-08' }, { athleteId: 'reese', type: 'mental', status: 'confirmed', date: '2026-11-04' },
      { athleteId: 'reese', type: 'training', status: 'confirmed', date: '2026-11-06' }, { athleteId: 'reese', type: 'mental', status: 'confirmed', date: '2026-11-12', attendee: 'parent' }],
    claimed: {}, draftStates: {}, utcToday: '2026-11-05', today: '2026-11-05' });
  expect(rows[0].nextMental).toEqual({ date: '2026-11-12', attendee: 'parent' });
  const at = (draftStates, records = []) => familyRows({ viewer: 'parent', athletes: [reese], records, bookings: [], claimed: {}, draftStates, utcToday: '2026-11-05', today: '2026-11-05' })[0];
  expect(at({ reese: 'version-changed' }).draft).toBe('fresh');               // familyLine: 'Waiting for Reese's agreement' / 'Continue'
  expect(at({ reese: 'adult-changed' }).draft).toBeNull();
  expect(at({ reese: 'fresh' }, [{ id: 'reese', ...reeseSignedRecord }])).toMatchObject({ draft: null, status: 'signed' });
});
test('trackerRows: every athlete with a mental booking; not signed with a 1:1 ahead first', () => {
  const m = (athleteId, status, date) => ({ athleteId, type: 'mental', status, date });
  const rows = trackerRows({ athletes: [jordan, reese, nico, sage], households: {}, records: { jordan: jordanSigned }, today: '2026-11-05', utcToday: '2026-11-05',
    bookings: [m('jordan', 'confirmed', '2026-11-19'), m('reese', 'confirmed', '2026-11-12'), m('nico', 'attended', '2026-10-29'), m('sage', 'cancelled', '2026-11-20')] });
  expect(rows.map((r) => [r.athleteId, r.nextMental, r.lastMental])).toEqual([
    ['reese', '2026-11-12', null], ['nico', null, '2026-10-29'], ['jordan', '2026-11-19', null]]);
});
```

`staffConsentSummary` (Yannick's card, spec §5; `athlete = { name: 'Ava Test', dob: '2010-01-01' }` (16 on D); minor record signed Oct 30 by Dana Whitfield, both audios true, location B, driving false, contact same as parent, countersign at Oct 31):

```js
expect(s.label).toBe('Complete');
expect(s.summary).toBe('Signed Oct 30 by Dana Whitfield (parent) · Ava agreed · Recording: yes (both) · Location: Eden Prairie · Driving: no · Emergency contact: same as parent · Version 2026-10-30 · Countersigned Oct 31');
```

plus one-liners: not countersigned → `label 'Signed'`, `canCountersign true`; withdrawn on Nov 12 → `recording 'Recording: no (Ava withdrew Nov 12)'`, `canWithdraw false`; parent no / athlete yes → `'Recording: no (parent)'`; parent yes / athlete no → `'Recording: no (Ava)'`; adult → `'Signed Oct 30 by Max Test (athlete, 18+) · Recording: yes · Location: Online · Parent sessions: yes (Dana Test) · Emergency contact: Lee Test, test-phone (aunt) · Version 2026-10-30'`; re-signed at 18 (`adultSignature { signedAt: Nov 6, name: 'Max Test', method: 'portal' }`, `assent.audio` still true) → summary starts `'Re-signed 18+ Nov 6 by Max Test'`, `canWithdraw false`; the same with `method 'paper'` and signedAt `paperDateToStamp('2026-11-01')` → starts `'Re-signed 18+ on paper Nov 1 by Max Test · recorded by the academy'`; needs-adult → `label 'Needs 18+'`, `recording 'Recording: needs 18+ signature'`, `canRemind true`; Driving part: `'Driving: yes|no'` whenever `choices.driving` is a boolean, `'Driving: not answered'` when null and 16+ on `utcToday`, absent when null and under 16 (dob `2012-05-14`); paper (`signedAt` `paperDateToStamp('2026-10-28')`, `choices.updatedAt` `new Date('2026-11-02T15:00:00Z')`, `history []`, location null, audio false) → summary starts `'Signed on paper Oct 28 by Dana Whitfield (parent) · recorded Nov 2'` (recorded = the older of `history[0]?.choices?.updatedAt` and `choices.updatedAt`) and contains `'Location: not transcribed'` and `'Recording: no'`; unsigned → `{ label: 'Not signed', summary: null, canRemind: true }`; no dob → `{ label: 'No date of birth', canRemind: false }`; `audience`: 18+ with `loginEmail` → `'athlete'`, 18+ without, or a minor with one → `'household'`.

`mentalConsentWrites.test.js` (`stamp 'NOW'`, `uid 'u-dana'`):

```js
test('portalRecord: the minor shape the rules prove', () => {
  expect(portalRecord({ athleteId: 'ava', householdId: 'hh', uid: 'u-dana', adult: false, signerName: ' Dana Test ',
    choices: { location: 'B', audio: true, driving: null, emergencyContact: { name: '', phone: '', relationship: '' }, parentSessions: true, parentName: 'x' },
    assent: { name: 'Ava', audio: true, readAloud: false }, stamp: 'NOW' })).toEqual({
    athleteId: 'ava', householdId: 'hh', version: '2026-10-30', method: 'portal', signedAt: 'NOW', signedBy: 'u-dana',
    signer: { role: 'parent', name: 'Dana Test' }, adult: false,
    assent: { name: 'Ava', audio: true, at: 'NOW', readAloud: false, withdrawnBy: null },
    choices: { location: 'B', audio: true, driving: null, emergencyContact: { name: null, phone: null, relationship: null },
      parentSessions: null, parentName: null, updatedAt: 'NOW', updatedBy: 'u-dana' },
    adultConfirm: null, adultSignature: null, countersign: null, history: [] });
});
test('history appends the current record\'s own objects (Review Focus 1)', () => {
  const current = { choices: { location: 'B' }, assent: { audio: true }, adultConfirm: { name: 'Max', at: 'T0' },
    history: [{ choices: {}, assent: null }], countersign: { at: 'T', by: 'm' } };
  const u = choicesUpdate({ current, uid: 'u-dana', choices: minorChoices, stamp: 'NOW' });
  expect(u.history).toHaveLength(2);
  expect(u.history[1].choices).toBe(current.choices);
  expect(u.history[1].assent).toBe(current.assent);
  expect(u.history[1].adultConfirm).toBe(current.adultConfirm);
  expect(Object.keys(u).sort()).toEqual(['choices', 'history']);
  expect(withdrawalUpdate({ current, uid: 'u-ava', stamp: 'NOW' })).toEqual({
    assent: { ...current.assent, audio: false, at: 'NOW', withdrawnBy: 'u-ava' }, history: [...current.history, { choices: current.choices, assent: current.assent }] });
  const r = adultResign({ current, uid: 'u-dana', name: 'Max Test', choices: adultChoices, stamp: 'NOW' });
  expect(r.history[1]).toEqual({ choices: current.choices, assent: current.assent, countersign: current.countersign });
  expect(r.countersign).toBeNull();
  expect(r.adultSignature).toEqual({ signedAt: 'NOW', signedBy: 'u-dana', name: 'Max Test', version: '2026-10-30', method: 'portal' });
  expect(adultResign({ current, uid: 'u-ops', name: 'Max Test', choices: adultChoices, stamp: 'NOW', paperSignedAt: 'P' }).adultSignature)
    .toMatchObject({ signedAt: 'P', method: 'paper' });
});
test('choicesUpdate: assent and adultConfirm only when asked for', () => {
  const minor = { choices: { location: 'B' }, assent: { name: 'Ava', audio: false, at: 'T', readAloud: false, withdrawnBy: null }, history: [] };
  expect(choicesUpdate({ current: minor, uid: 'u', choices: minorChoices, assentAudio: true, stamp: 'NOW' }).assent)
    .toEqual({ name: 'Ava', audio: true, at: 'NOW', readAloud: false, withdrawnBy: null });
  const adult = { adult: true, choices: { ...adultChoicesStored }, assent: null, history: [] };
  expect(choicesUpdate({ current: adult, uid: 'u', choices: { ...adultChoices, audio: !adultChoices.audio }, adultConfirmName: 'Max Test', stamp: 'NOW' }).adultConfirm)
    .toEqual({ name: 'Max Test', at: 'NOW' });
  expect(adultFieldsChanged(adultChoicesStored, { ...adultChoicesStored, location: 'C' })).toBe(false);
});
```

Plus `paperCorrection`: a withdrawn paper record (`signedAt 'S'`, `assent.withdrawnBy 'u-mental'`, `choices.updatedAt 'OLD'`) corrected by `u-owner` to `signedAt 'S2'` with `assent { name: 'Ava', audio: true }` gives `u.assent` `toBe(current.assent)`, `u.choices` matching `{ updatedAt: 'NOW', updatedBy: 'u-owner' }` and `u.history[0].signedAt` `'S'`.

- [ ] **Step 2: Run them to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/mentalConsent`
Expected: FAIL, "consentStatusFor is not a function" and "Cannot find module './mentalConsentWrites'".

- [ ] **Step 3: Implement**
`mentalConsent.js` header: "CHANGE ONE, CHANGE BOTH with functions/portal/mental-consent-status.js; the shared case table holds them together; 18, 16 and 13 on the UTC date (firestore.rules adultOn)". `consentStatusFor` reuses `isAdultOnDate`. Names in copy are the first word of `name`; the signer's first name likewise. Every displayed date is `shortDate` (Chicago); a 1:1 date is `'Thu, Nov 12'`. `paperCorrection`'s history entry is `{ choices, assent, signedAt, signer, adult, version, signedBy }` of `current`.

- [ ] **Step 4: Run them to verify they pass**
Run: the same command, then `wc -l src/portal/data/mentalConsent.js` (from `frontend`). The client-mirror case of Task 2 runs in Task 19 Step 2, once both lanes are merged.
Expected: PASS; under 500 (move `staffConsentSummary` and `trackerRows` to `data/mentalConsentStaff.js`, same exports through `mentalConsent.js`, if it passes 450).

- [ ] **Step 5: Commit**: `git add frontend/src/portal/data/mentalConsent.js frontend/src/portal/data/mentalConsent.test.js frontend/src/portal/data/mentalConsentWrites.js frontend/src/portal/data/mentalConsentWrites.test.js`, then `git commit -m "feat(portal): consent status, family lines, Yannick's summary and the write shapes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 9: The flow state machine, the device draft and the exit

LANE frontend. Depends on: Task 8.

**Files:**
- Create: `frontend/src/portal/data/consentFlow.js`, `frontend/src/portal/data/consentFlow.test.js`

**Interfaces:**
- Consumes: `CONSENT_VERSION` from `./mentalConsent`; Task 8 `ChoicesInput`; `validateEmergencyContact` from `./signup`.
- Produces:
  - `DRAFT_TTL_DAYS = 7`, `DRAFT_V = 1`, `draftKey(uid, athleteId) → 'ryp.mentalConsent.<uid>.<athleteId>'`, `readDraft(uid, athleteId, storage = window.localStorage) → Draft|null`, `writeDraft(uid, athleteId, draft, storage)`, `clearDraft(uid, athleteId, storage)` (every storage call in try/catch; malformed JSON or `v !== 1` → null), `Draft = { v: 1, version, savedAt: ms, choices: ChoicesInput, parentName }`, `draftState(draft, { version, adultNow, nowMs }) → 'fresh'|'expired'|'version-changed'|'adult-changed'|null`.
  - `initialFlow({ branch, drivingAsked, under13, firstName, contact, parentName, draft = null, draftState = null }) → FlowState`; `FlowState = { branch, steps, step, locked, readToEnd, contact, choices, signature: { agreed, name }, assent: { audio, agreed, name, readAloud }, drivingAsked, under13, firstName, resumed, notice }`. A `'fresh'` draft resumes at the signature; `'version-changed'` restarts at the agreement with the draft's choices; `'adult-changed'` ignores the draft and starts at step 1; `'expired'` starts at step 1.
  - `flowReducer(state, action)`: `{ type: 'set', path, value }` (clamps `*.name` and `parentName` to 120, `contact.phone` to 40, `contact.relationship` to 60), `{ type: 'next' }`, `{ type: 'back' }`, `{ type: 'readToEnd' }`, `{ type: 'unlock' }`.
  - `canContinue(state) → { ok, reason }` (at `'who'`: unless `contact.sameAsParent` (minor only), the first message of `validateEmergencyContact(contact)`; an adult also needs a name and phone: `'Add an emergency contact name and mobile number.'`), `progressLabel(state) → 'Step n of N'`, `savesHere(state) → boolean`, `nameMatches(typed, firstName) → boolean`, `choicesFromFlow(state) → ChoicesInput`, `assentFromFlow(state) → { name, audio, readAloud }`.
  - `consentExit({ viewer, listCount }) → { to, state }`: one listed athlete → the role home (`'/portal/family'` for a parent, `'/portal/home'` for an athlete login) with `state null`; more → `'/portal/consent/mental'` with `state { from: 'flow' }` (the list does not auto-open again).

- [ ] **Step 1: Write the failing test**
`consentFlow.test.js`; `minor()` = `initialFlow({ branch: 'minor', drivingAsked: false, under13: false, firstName: 'Ava', contact: null, parentName: 'Dana Test' })`, `go(state, ...actions)` folds `flowReducer`, `set(path, value)` = `{ type: 'set', path, value }`, `draft` = `{ v: 1, version: '2026-10-30', savedAt: 0, choices: { location: 'B', audio: true, driving: null, emergencyContact: { name: null, phone: null, relationship: null } }, parentName: 'Dana Test' }`, `day = 86400000`. One `expect` per row:

| case | expression | expected |
|---|---|---|
| minor steps | `minor().steps` | `['who', 'agreement', 'choices', 'signature', 'handover', 'assent']` |
| 18+ steps | `initialFlow({ branch: 'adult' }).steps` | `['who', 'agreement', 'choices', 'signature']` |
| hand-over steps | `initialFlow({ branch: 'adult-handover' }).steps` | `['who', 'handover', 'agreement', 'choices', 'signature']` |
| progress | `progressLabel(minor())`; at `'handover'`; adult-handover at `'signature'` | `'Step 1 of 5'`; `'Step 5 of 5'`; `'Step 4 of 4'` |
| who, minor | `contact.sameAsParent` true; all blank, not ticked; name `'Lee'` only; relationship `'aunt'` only | `ok true`; `ok true` (stored as same as parent); `{ ok: false, reason: 'Add a mobile number we can call.' }`; `{ ok: false, reason: 'Add their name, or clear the other emergency fields.' }` |
| who, adult | `canContinue(initialFlow({ branch: 'adult' }))`; then with `contact.name 'Lee'` and `contact.phone 'test-phone'` | `{ ok: false, reason: 'Add an emergency contact name and mobile number.' }`; `ok true` |
| agreement | `canContinue({ ...minor(), step: 'agreement' })`; after `{ type: 'readToEnd' }` | `{ ok: false, reason: 'Scroll to the end to continue' }`; `ok true` |
| choices | at `'choices'`: location B only; location B and audio false | `false`; `true` |
| driving | `drivingAsked: true`, location and audio set; plus `driving false` | `false`; `true` |
| 18+ choices | adult at `'choices'`, location C, audio true, parentSessions true; plus parentName `'Dana'` | `false`; `true` |
| hand-over lock | at `'signature'`, agreed, name `'Dana Test'`, `next` | `step 'handover'`, `locked true`; `back` stays on `'handover'`; `next` → `'assent'`; `back` → `'handover'`; `unlock` → `step 'signature'`, `locked false`, `signature.agreed false` |
| saves at the last step | `savesHere` minor at `'signature'`; at `'assent'`; adult at `'signature'` | `false`; `true`; `true` |
| assent | at `'assent'` with audio true, agreed, name `'Bob'` | `ok true` (the name is soft-checked) |
| name check | `nameMatches('ava test', 'Ava')`; `nameMatches('Bob', 'Ava')` | `true`; `false` |
| clamps | `signature.name` 130 chars, `contact.phone` 50, `contact.relationship` 70 | lengths `120`, `40`, `60` |
| draft state | `draftState(draft, { version: '2026-10-30', adultNow: false, nowMs: 6 * day })`; `8 * day`; version `'2026-12-01'`; `adultNow: true` | `'fresh'`; `'expired'`; `'version-changed'`; `'adult-changed'` |
| resume | `initialFlow({ branch: 'minor', firstName: 'Ava', draft, draftState: 'fresh' })` | `step 'signature'`, `signature.name 'Dana Test'`, `signature.agreed false`, `choices.location 'B'`, `resumed true` |
| new version | the same with `draftState: 'version-changed'` | `step 'agreement'`, `choices.location 'B'`, `notice 'The form was updated since you started, so please read it again.'` |
| turned 18 | `initialFlow({ branch: 'adult-handover', firstName: 'Ava', draft, draftState: 'adult-changed' })` | `step 'who'`, `choices.location null`, `notice 'Ava is 18 now, so Ava signs this for themself.'` |
| expired | `draftState: 'expired'` | `step 'who'` |
| storage | `readDraft('u', 'ava', throwingStorage)`; `writeDraft(...)` with it; `readDraft` of `'{not json'`; `draftKey('u-dana', 'ava')` | `null`; does not throw; `null`; `'ryp.mentalConsent.u-dana.ava'` |
| exit | `consentExit({ viewer: 'parent', listCount: 1 })`; `({ viewer: 'athlete', listCount: 1 })`; `({ viewer: 'parent', listCount: 3 })` | `{ to: '/portal/family', state: null }`; `{ to: '/portal/home', state: null }`; `{ to: '/portal/consent/mental', state: { from: 'flow' } }` |

- [ ] **Step 2: Run it to verify it fails**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/consentFlow.test.js`
Expected: FAIL, "Cannot find module './consentFlow'".

- [ ] **Step 3: Implement** the module in `frontend/src/portal/data/consentFlow.js`. `contact` holds `{ name, phone, relationship, sameAsParent }`; `choicesFromFlow` writes same-as-parent (or an all-blank minor contact) as both-null. `nameMatches` compares the first word of each, case- and accent-insensitive.

- [ ] **Step 4: Run it to verify it passes**
Run: the same command. Expected: PASS.

- [ ] **Step 5: Commit**: `git add frontend/src/portal/data/consentFlow.js frontend/src/portal/data/consentFlow.test.js`, then `git commit -m "feat(portal): the consent flow's steps, hand-over lock, device draft and exit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 10: Reads, writes, hooks and seed data

LANE frontend. Depends on: Task 8, Task 9. Cross-lane: the write shapes are Task 1's (Global Constraints); the callable is Task 5's.

**Files:**
- Create: `frontend/src/portal/hooks/mentalConsentLive.js`, `mentalConsentLive.test.js`, `hooks/mentalConsent.js`, `hooks/mentalConsentStaff.js`, `hooks/mentalConsent.test.js`, `data/consentSeed.js`
- Modify: `data/seed.js` (`mentalFixtures`), `hooks/mental.test.js` (the seed expectations), `hooks/callables.js`, `hooks/index.js` (two lines)

**Interfaces:**
- Consumes: `./live` (`ERR`, `LiveDataError`, `wrap`, `requireUser`, `isLive`, `fetchCurrentUser`, `fetchAthlete`, `fetchHousehold`, `fetchHouseholdAthletes`, `fetchHouseholdBookings`, `fetchBookings`, `fetchAllAthletes`, `fetchAllHouseholds`); `fetchLoginInvite` from `./signups`; `fetchAllMentalBookings` from `./mentalLive`; `bump`, `useInvalidation`; `useSeedResource`; Tasks 8-9.
- Produces:
  - `mentalConsentLive.js`: `MENTAL_CONSENT_KEY = 'mentalConsents'`; `fetchHouseholdConsents(householdId) → Record[]`; `fetchOwnConsent(athleteId) → Record|null`; `fetchAllConsents() → Record[]`; `fetchConsent(athleteId) → Record|null` (staff); `createConsent({ athleteId, doc, reread }) → { status: 'signed' } | { status: 'already', record }` (`setDoc`; on `ERR.PERMISSION` it awaits `reread()` and answers `already` when a record is there, else rethrows); `updateConsent({ athleteId, build }) → void` (`runTransaction`: `tx.get`, NOT_FOUND when missing, `tx.update(ref, build(snap.data()))`). `Record = { id, ...data }` with Timestamps as stored. Every write bumps `MENTAL_CONSENT_KEY`.
  - `hooks/callables.js`: `callRequestMentalConsent = callable('requestMentalConsent')`.
  - `hooks/mentalConsent.js`: `seedFamilyConsents({ as, today, utcToday, demoDraft })`; `useFamilyConsents({ as = 'parent', demoDraft } = {}) → { data: { viewer, rows: FamilyRow[], byId } | null, loading, error }`; `useConsentFlow(athleteId, { demoViewer, demoNoRecord } = {}) → { data: { viewer, uid, athlete, signerName, signerEmail, guardianName, emergencyContact, selfManaged, record, status, branch, drivingAsked, under13, draft, draftState, nextAthleteId, listCount } | null, loading, error, sign(state), saveDraft(state), dropDraft(), change(edits) }`; standalone `countersignConsent(athleteId)`, `withdrawRecording(athleteId)`, `sendConsentReminder(athleteId) → { status }`. `change(edits)`: `edits = { choices, assentAudio?, adultConfirmName? }`. `demoViewer`, `demoNoRecord` and `demoDraft` are harness-only and read by the seed branch alone.
  - `hooks/mentalConsentStaff.js`: `useStaffConsent(athleteId) → { data: { athlete, record, summary } | null, loading, error, recordPaper(input), correctPaper(input) }`; `useConsentTracker() → { data: TrackerRow[] | null, loading, error }` (Task 8 `trackerRows`).
  - `data/consentSeed.js`: `consentSeedRecords() → { jordan, quinn }`; `consentSeedPaperRecord(athleteId)` (a paper minor record dated `paperDateToStamp` of 8 days back, location null, audio false; harness only).
  - `data/seed.js` `mentalFixtures(today)` adds athletes `reese` (`'Reese Whitfield'`, `'2014-03-02'`, `whitfield`) and `quinn` (`'Quinn Parker'`, `'2006-08-20'`, `parker`), session `cal-seed-d` (`addContractDays(today, 7)`, `'4:30 PM'`, mental) with booking `reese_cal-seed-d` (confirmed, attendee athlete), household `parker` (`{ name: 'Parker family', guardian: { name: 'Sam Parker', email: 'sam.parker@example.com', phone: null } }`).
  - `hooks/index.js`: `export { countersignConsent, sendConsentReminder, useConsentFlow, useFamilyConsents, withdrawRecording } from './mentalConsent';` and `export { useConsentTracker, useStaffConsent } from './mentalConsentStaff';`

- [ ] **Step 1: Write the failing tests**
`mentalConsentLive.test.js` (the `mentalLive.test.js` mocks; `auth.currentUser.uid` 'u-dana'):

```js
test('a parent reads by householdId, never getDoc (Review Focus 2)', async () => {
  getDocs.mockResolvedValue(snap([['ava', { householdId: 'hh', athleteId: 'ava' }]]));
  expect(await fetchHouseholdConsents('hh')).toEqual([{ id: 'ava', householdId: 'hh', athleteId: 'ava' }]);
  expect(where).toHaveBeenCalledWith('householdId', '==', 'hh');
  expect(getDoc).not.toHaveBeenCalled();
});
test('an athlete login reads its own doc; a missing one is null', async () => {
  getDoc.mockResolvedValue({ exists: () => false });
  expect(await fetchOwnConsent('max')).toBeNull();
  expect(doc).toHaveBeenCalledWith({}, 'mentalConsents', 'max');
});
test('createConsent: setDoc; a refusal over an existing record is "already"', async () => {
  setDoc.mockResolvedValueOnce();
  expect(await createConsent({ athleteId: 'ava', doc: { a: 1 }, reread: jest.fn() })).toEqual({ status: 'signed' });
  expect(setDoc).toHaveBeenCalledWith({ path: 'mentalConsents/ava' }, { a: 1 });
  setDoc.mockRejectedValueOnce({ code: 'permission-denied' });
  const record = { id: 'ava', signer: { name: 'Dana Test' } };
  expect(await createConsent({ athleteId: 'ava', doc: { a: 1 }, reread: async () => record })).toEqual({ status: 'already', record });
  setDoc.mockRejectedValueOnce({ code: 'permission-denied' });
  await expect(createConsent({ athleteId: 'ava', doc: { a: 1 }, reread: async () => null })).rejects.toMatchObject({ code: ERR.PERMISSION });
});
test('updateConsent hands the snapshot\'s own data to the builder (Review Focus 1)', async () => {
  const data = { choices: { location: 'B' }, assent: null, history: [] };
  const tx = { get: jest.fn(async () => ({ exists: () => true, data: () => data })), update: jest.fn() };
  runTransaction.mockImplementation((db, fn) => fn(tx));
  const build = jest.fn(() => ({ x: 1 }));
  await updateConsent({ athleteId: 'ava', build });
  expect(build.mock.calls[0][0]).toBe(data);
  expect(tx.update).toHaveBeenCalledWith({ path: 'mentalConsents/ava' }, { x: 1 });
});
```

`hooks/mentalConsent.test.js` (seed mode; the `mental.test.js` `mountHook` probe; `academyDateISO` mocked to `'2026-11-05'`; `localStorage.clear()` before each; `seed(o)` = `seedFamilyConsents({ as: 'parent', today: '2026-11-05', utcToday: '2026-11-05', ...o }).rows`):

| case | call | expect |
|---|---|---|
| seed family | `seed()` mapped to `[athleteId, status, nextMental?.date ?? null]` | `[['jordan', 'signed', expect.any(String)], ['nico', 'unsigned', null], ['reese', 'unsigned', '2026-11-12']]`; `homeCardFor(seed()).athleteId` `'reese'` |
| harness draft | `seed({ demoDraft: 'reese' })`, reese's row | `draft 'fresh'` |
| seed athlete view | `seed({ as: 'athlete' })` mapped to `[athleteId, viewer]` | `[['jordan', 'athlete']]` |
| a record signed on another device beats this device's draft | `localStorage['ryp.mentalConsent.u-dana.jordan']` = a fresh draft (`v 1`, `version '2026-10-30'`, `savedAt Date.now()`); mount `useConsentFlow('jordan')` | `data` matches `{ status: 'signed', draft: null, listCount: 3 }`; the key is gone |
| harness-only hand-over | mount `useConsentFlow('quinn', { demoViewer: 'parent', demoNoRecord: true })` | `data.branch` `'adult-handover'` |
| seed tracker | mount `useConsentTracker()` | rows `[athleteId, label]` = `[['reese', 'Not signed'], ['jordan', 'Signed']]` |

`hooks/mental.test.js` (seed mode; reese and quinn now sit in `mentalFixtures`): the Athletes expectation becomes `[['jordan', 14, true, true, true], ['nico', 9, false, false, false], ['quinn', 20, false, false, false], ['reese', 12, false, true, false]]`; the board test keeps its assertions and adds `expect(h.out.current.rows.due.map((r) => r.athleteId)).toEqual(['quinn', 'reese'])` (no check-in, 16 days since `enabledAt` > `OVERDUE_DAYS`).

- [ ] **Step 2: Run them to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/mentalConsent src/portal/hooks/mental.test.js`
Expected: FAIL, missing modules; the Athletes rows lack quinn and reese.

- [ ] **Step 3: Implement**
- Live sources: a parent reads `fetchHouseholdAthletes`, `fetchHouseholdConsents`, `fetchHouseholdBookings`, and `fetchLoginInvite(a.loginEmail)` per athlete (`claimed` = `status === 'claimed'`); an athlete login reads `fetchAthlete(own)`, `fetchOwnConsent(own)`, `fetchBookings(own, { householdId })` and is its own claimed login; staff roles get `{ viewer: null, rows: [] }`. Drafts come from `readDraft(uid, id)` and `draftState(...)`; an `'adult-changed'` draft is cleared (`clearDraft`) as it is read. One `now` per load feeds `academyDateISO(now)` and `utcTodayISO(now)`.
- Deps: `useFamilyConsents` `['family-consents', as, today, useInvalidation(MENTAL_CONSENT_KEY), useInvalidation('bookings')]`; `useConsentFlow` `['consent-flow', athleteId, useInvalidation(MENTAL_CONSENT_KEY)]`; `useStaffConsent` `['staff-consent', athleteId, useInvalidation(MENTAL_CONSENT_KEY)]`; `useConsentTracker` `['consent-tracker', today, useInvalidation(MENTAL_CONSENT_KEY), useInvalidation('bookings')]`.
- `useConsentFlow`: the record is read before the draft, and an existing record deletes the draft (`clearDraft`) and opens as signed; `flowFacts` gives `status`, `branch`, `drivingAsked` and `under13`; `signerFor({ userDoc: users/{uid}, authUser: auth.currentUser, household })` gives `signerName` and `signerEmail` (step 1 shows both); `guardianName` is the household guardian's (the 18+ `parentName` default); `selfManaged` = `household.createdBy === uid` on an athlete login; `emergencyContact` from `household.emergencyContact` when it has a name; `nextAthleteId` the household's next signable unsigned athlete; `listCount` the number of rows `useFamilyConsents` would show this viewer. `sign(state)`: `status 'needs-adult'` → `updateConsent` with `adultResign`, else `createConsent` with `portalRecord` (choices `choicesFromFlow`, assent `assentFromFlow` for a minor) and `reread` = the viewer's own read; on success or `already` it calls `clearDraft`. `saveDraft(state)` writes `{ v: 1, version: CONSENT_VERSION, savedAt: Date.now(), choices: choicesFromFlow(state), parentName: state.signature.name }` and bumps the key. `change(edits)` = `updateConsent` with `choicesUpdate`; `withdrawRecording(athleteId)` = `updateConsent` with `withdrawalUpdate`; `countersignConsent(athleteId)` = `updateConsent` with `countersignUpdate`; `sendConsentReminder(athleteId)` = `callRequestMentalConsent({ athleteId })`.
- `useStaffConsent` reads `fetchAthlete` and `fetchConsent`; `recordPaper(input)` = `createConsent` with `paperRecord`, or for an existing minor record and a §11 paper re-sign `updateConsent` with `adultResign({ ..., paperSignedAt: input.signedAt })`; `correctPaper(input)` = `updateConsent` with `paperCorrection` (owner only, the card hides it otherwise). `useConsentTracker` reads `fetchAllAthletes`, `fetchAllHouseholds`, `fetchAllConsents`, `fetchAllMentalBookings`.
- Seed mode (`isLive()` false): the hooks read `mentalFixtures(today)` and `consentSeedRecords()`; writes echo locally and resolve; `as: 'parent'` is the Whitfield parent `u-dana` ("Dana Whitfield"), `as: 'athlete'` is jordan. `consentSeedRecords().jordan` is a minor portal record signed by `u-dana` ("Dana Whitfield") 9 days back, assent "Jordan" yes, location B, driving false, contact same as parent, countersigned the next day by `mental`; `.quinn` is a §11 record signed on Quinn's own login, recording yes, location C, `parentSessions: false`, contact `{ name: 'Sam Parker', phone: 'test-phone', relationship: 'parent' }`.

- [ ] **Step 4: Run them to verify they pass**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks src/portal/data && npx eslint src/portal --max-warnings=0 && wc -l src/portal/hooks/mentalConsent*.js src/portal/data/seed.js`
Expected: PASS (every hooks and data suite, the updated `hooks/mental.test.js` included); lint clean; each file under 500.

- [ ] **Step 5: Commit**: `git add frontend/src/portal/hooks/mentalConsentLive.js frontend/src/portal/hooks/mentalConsentLive.test.js frontend/src/portal/hooks/mentalConsent.js frontend/src/portal/hooks/mentalConsentStaff.js frontend/src/portal/hooks/mentalConsent.test.js frontend/src/portal/hooks/mental.test.js frontend/src/portal/hooks/callables.js frontend/src/portal/hooks/index.js frontend/src/portal/data/consentSeed.js frontend/src/portal/data/seed.js`, then `git commit -m "feat(portal): consent reads, writes and hooks, with seed records" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 11: The sign flow, the list and the routes

LANE frontend. Depends on: Task 10.

**Files:**
- Create: `frontend/src/portal/screens/MentalConsent.js`, `MentalConsent.test.js`, `screens/MentalConsentFlow.js`, `MentalConsentFlow.test.js`, `components/consent/FlowSteps.js`
- Modify: `frontend/src/portal/PortalRoutes.js` (two loaders, two lazy screens, two small route wrappers `MentalConsentListRoute` and `MentalConsentFlowRoute`, two routes, `CURRENT_ROUTE_CHUNKS.consent`), `frontend/src/portal/PortalRoutes.test.js` (one case)

**Interfaces:**
- Consumes: Task 10 `useFamilyConsents`, `useConsentFlow` (imported from `../hooks/mentalConsent`, so existing tests that mock `../hooks` are unaffected); Task 9 reducer and `consentExit`; Task 7 text; `PhoneFrame`, `Card`, `Button`, `Checkbox`, `Field`, `BackLink`.
- Produces: `MentalConsent({ bare, autoOpen = true, onOpen(athleteId, opts) })` (auto-opens with `onOpen(id, { replace: true })` only when `autoOpen`, exactly one row, and that row's `familyLine` action is not `'withdraw'`); `MentalConsentFlow({ bare, athleteId, change = false, onDone(exit), onBack(exit) })` (`exit = consentExit({ viewer, listCount })`); `FlowSteps.js` exports `WhoStep, AgreementStep, ChoicesForm, SignatureStep, HandOver, AssentStep, DoneScreen` (presentational; state and dispatch as props). Routes `consent/mental` and `consent/mental/:athleteId` under `RequireRole roles={['parent', 'athlete']}`: the list route passes `autoOpen={location.state?.from !== 'flow' && !searchParams.has('withdraw')}` and `onOpen={(id, opts) => navigate(\`/portal/consent/mental/${id}\`, opts)}`; the flow route passes `change={searchParams.get('change') === '1'}` and `onDone`/`onBack` = `(exit) => navigate(exit.to, { state: exit.state })`.

- [ ] **Step 1: Write the failing tests**
`MentalConsentFlow.test.js` mocks `../hooks/mentalConsent` (`useConsentFlow: () => mockFlow`), `../data/calendar`'s `academyDateISO` to `'2026-11-05'` (the `MentalContract.test.js` precedent; the Done screen shows that date) and `window.IntersectionObserver` (captures the callback; `reach()` fires `[{ isIntersecting: true }]` inside `act`). Fields are filled with `r.fill(label, value)` (the `Field`'s `label` is its `aria-label`); taps use `r.click(text)`, which finds `<button>`s by text or aria-label, so every location option and recording answer is a `<button type="button">` whose text is its label, and "Same as parent", "I/We consent", "I agree", "I agree to take part in mental performance coaching", "I have read and agree to all of the above" and the read-aloud tick are `Checkbox`es (a `<button role="checkbox" aria-label={label}>`):

```js
test('minor: five steps, nothing saved until Done, then the Done copy', async () => {
  mockFlow = flow({ branch: 'minor', athlete: { id: 'ava', name: 'Ava Test', dob: '2012-05-14' }, signerName: 'Dana Test', signerEmail: 'dana@example.com' });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" />);
  expect(r.text()).toContain('Step 1 of 5');
  expect(r.text()).toContain('Dana Test signs as Ava\'s parent, then Ava agrees');
  expect(r.text()).toContain('dana@example.com');
  await r.click('Same as parent'); await r.click('Continue');
  expect(r.button('Scroll to the end to continue').disabled).toBe(true);
  reach(); await r.click('Continue');
  expect(r.text()).not.toContain('My athlete has my permission to drive');      // 14 years old
  await r.click('Eden Prairie conference room (Option B)'); await r.click('I/We consent'); await r.click('Continue');
  expect(r.text()).toContain('Typing your name signs this agreement for Ava, dated today.');
  await r.click('I have read and agree to all of the above'); await r.fill('Full legal name', 'Dana Test'); await r.click('Continue');
  expect(r.text()).toContain('Hand the phone to Ava — your answers are locked');
  await r.click('Hand over'); await r.click('I agree'); await r.click('I agree to take part in mental performance coaching');
  await r.fill("Ava's name", 'Ava');
  expect(mockFlow.sign).not.toHaveBeenCalled();
  await r.click('Done');
  expect(mockFlow.sign).toHaveBeenCalledTimes(1);
  expect(r.text()).toContain("Signed · Nov 5. Yannick will see this before Ava's session. You can change the recording or location choice any time from Ava's card.");
});
test('Back from step 1 leaves the consent pages in a one-athlete household', async () => {
  mockFlow = flow({ branch: 'minor', viewer: 'parent', listCount: 1 });
  const onBack = jest.fn();
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" onBack={onBack} />);
  await r.click('Back');
  expect(onBack).toHaveBeenCalledWith({ to: '/portal/family', state: null });
});
test('16+: the driving question is asked and required', ...);           // dob '2010-01-01': Continue disabled until Yes or No
test("'Ava isn't here' keeps the parent's part on the device", ...);    // at the hand-over: saveDraft called once, sign never, onDone called
test('already signed by the other parent: the Done screen says so', ...);
  // sign resolves { status: 'already', record: { signer: { name: 'Dana Whitfield' }, signedAt: new Date('2026-11-03T17:00:00Z') } }
  // -> 'Already signed by Dana Whitfield on Nov 3'
test('resumed draft starts at the signature with the name filled, unticked', ...);
test('no dob, an adult on their own login elsewhere, a minor login', ...);
  // 'Add Ava's date of birth first' / 'Max signs this on their own login' / 'Your parent signs this', no Continue in any
test('adult on the parent\'s phone: the hand-over comes before the agreement; it saves at the signature', ...);
  // 'Max is 18 or older and signs for themself'; 'Hand the phone to Max'; sign called after 'I confirm I am 18 or older and agree' + r.fill('Full legal name', 'Max Test')
test('under 13: the read-aloud tick is offered', ...);                   // 'I read this aloud to Nico'
test('who step: a half-filled emergency contact keeps Continue disabled with the validator copy', ...);
  // r.fill('Emergency contact name', 'Lee') -> button 'Add a mobile number we can call.' disabled
```

`MentalConsent.test.js` (mocks `useFamilyConsents` and `withdrawRecording` from `../hooks/mentalConsent`): one row with `autoOpen` → `onOpen('ava', { replace: true })` on mount; one row with `autoOpen={false}` (back from the flow) → the list renders and `onOpen` is never called; two rows → both names with their `familyLine` text, tapping one calls `onOpen('reese')`; footer contains `'Questions? Contact Yannick at yannick@rypgolf.com.'`. `PortalRoutes.test.js`: `/portal/consent/mental/ava` renders for role parent and athlete and redirects role coach.

- [ ] **Step 2: Run them to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/MentalConsent src/portal/PortalRoutes.test.js`
Expected: FAIL, missing modules and the route case.

- [ ] **Step 3: Implement**
`MentalConsentFlow` drives `flowReducer` with `useReducer(flowReducer, data, init)`; the step bodies are `FlowSteps.js`; the sticky footer button shows `canContinue(state).reason ?? 'Continue'` and is disabled while `!ok`; the agreement renders `TERMS.sections` as one `Card` per section (heading, paragraphs) with an end sentinel observed by `IntersectionObserver` (absent → `readToEnd` at mount); the assent name mismatch shows "That doesn't look like Ava's name — check it's Ava typing." without blocking; `savesHere` → `await sign(state)`; Back is a `BackLink` whose text is `Back` (hidden on the hand-over and assent steps except the hand-over's "Give the phone back to Dana" → `unlock`); on step 1 Back calls `onBack(exit)`, and the Done screen's "Done" button calls `onDone(exit)`. Who-step copy: `'<Signer> signs as <First>\'s parent, then <First> agrees'` / `'<First> is 18 or older and signs for themself'`, the signer's email under the name, the emergency contact fields labelled `Emergency contact name`, `Emergency contact mobile`, `Relationship (optional)`, and the step ends with `TERMS.purpose`; the 18+ `parentName` starts as `guardianName` unless `selfManaged`, then blank. The Done screen offers `nextAthleteId` ("Next: sign for Reese").

- [ ] **Step 4: Run them to verify they pass**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/MentalConsent src/portal/PortalRoutes.test.js && npx eslint src/portal --max-warnings=0`
Expected: PASS, lint clean.

- [ ] **Step 5: Commit**: `git add frontend/src/portal/screens/MentalConsent.js frontend/src/portal/screens/MentalConsent.test.js frontend/src/portal/screens/MentalConsentFlow.js frontend/src/portal/screens/MentalConsentFlow.test.js frontend/src/portal/components/consent/FlowSteps.js frontend/src/portal/PortalRoutes.js frontend/src/portal/PortalRoutes.test.js`, then `git commit -m "feat(portal): sign Yannick's consent in the portal - the five-step flow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 12: Change choices and the athlete's own withdrawal

LANE frontend. Depends on: Task 11.

**Files:**
- Modify: `frontend/src/portal/screens/MentalConsentFlow.js` (the `change` mode), `MentalConsentFlow.test.js`, `screens/MentalConsent.js` (the minor login's withdrawal), `MentalConsent.test.js`

**Interfaces:**
- Consumes: Task 10 `change(edits)`, `withdrawRecording(athleteId)`; Task 8 `adultFieldsChanged`, `familyLine`; `ChoicesForm`, `HandOver` from Task 11.
- Produces: the change screen (`change` true): `ChoicesForm` prefilled from `record.choices`, the emergency contact, for an adult record the parent-session permission and name and, once an adult field differs, the field "Max types their name to confirm" (`adultConfirmName`); for a minor record under 18 a "Change Ava's own answer" button opening `HandOver` then the athlete's recording answer and typed name; Save → `change({ choices, assentAudio?, adultConfirmName? })` → `onDone(exit)`. On the list, a row whose `familyLine` action is `'withdraw'` shows "Stop recording my sessions" instead of opening the flow.

- [ ] **Step 1: Write the failing tests**
```js
test('change, minor: Save sends the choices only; the history is the hook\'s job', async () => {
  mockFlow = flow({ status: 'signed', record: minorRecord, branch: 'minor' });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" change />);
  await r.click('Online (Option C)'); await r.click('Save');
  expect(mockFlow.change).toHaveBeenCalledWith({ choices: expect.objectContaining({ location: 'C' }) });
});
test("change, minor: Ava's own answer needs the hand-over and her name", async () => {
  // r.click("Change Ava's own answer") -> 'Hand the phone to Ava' -> r.click('I agree') -> r.fill("Ava's name", 'Ava') -> r.click('Save')
  expect(mockFlow.change).toHaveBeenCalledWith({ choices: expect.any(Object), assentAudio: true });
});
test('change, adult: recording needs the typed confirmation; location alone does not', async () => {
  // audio flipped: Save disabled until r.fill('Max types their name to confirm', 'Max Test'); then adultConfirmName 'Max Test'
  // location only: change called without adultConfirmName
});
test('a minor login withdraws its recording answer from the list, which never auto-opens for it', async () => {
  mockRows = [row({ viewer: 'athlete', status: 'signed', record: { ...minorRecord, assent: { ...minorRecord.assent, audio: true } } })];
  const onOpen = jest.fn();
  const r = await renderScreen(<MentalConsent bare autoOpen onOpen={onOpen} />, { path: '/portal/consent/mental?withdraw=1' });
  expect(onOpen).not.toHaveBeenCalled();
  await r.click('Stop recording my sessions'); await r.click('Yes, stop recording');
  expect(mockWithdraw).toHaveBeenCalledWith('jordan');
  // with assent.audio false the button is gone and the line reads '... · Recording: no'
});
```

- [ ] **Step 2: Run them to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/MentalConsent`
Expected: FAIL on the four new cases.

- [ ] **Step 3: Implement** the change mode in `MentalConsentFlow.js` and the withdrawal row (confirm sheet: "Stop recording? Yannick won't record your sessions until your parent changes it with you." / "Yes, stop recording" / "Keep it") in `MentalConsent.js`. A refused save shows "This couldn't be saved. Check your connection and try again." and keeps the form.

- [ ] **Step 4: Run them to verify they pass**
Run: the same command, then `wc -l frontend/src/portal/screens/MentalConsentFlow.js frontend/src/portal/components/consent/FlowSteps.js`.
Expected: PASS; both under 500 (move the change form into `components/consent/ChangeChoices.js`, and add it to the commit, if the screen passes 450).

- [ ] **Step 5: Commit**: `git add frontend/src/portal/screens/MentalConsentFlow.js frontend/src/portal/screens/MentalConsentFlow.test.js frontend/src/portal/screens/MentalConsent.js frontend/src/portal/screens/MentalConsent.test.js`, then `git commit -m "feat(portal): change consent choices later; an athlete withdraws their recording answer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 13: The family's lines, home card and booking rows

LANE frontend. Depends on: Task 10 (Task 11 for the routes the links open).

**Files:**
- Create: `frontend/src/portal/components/consent/ConsentLine.js`, `ConsentHomeCard.js`, `ConsentAthleteHomeLine.js`, `ConsentBookingLine.js`, `ConsentDetailCard.js`, `consent.family.test.js` (in `components/consent/`)
- Modify: `screens/ParentDashboard.js`, `screens/AthleteDetail.js`, `screens/Reservations.js`, `screens/MySchedule.js`, `screens/AthleteDashboard.js`, `data/parent.js`; tests `screens/ParentDashboard.test.js`, `screens/Reservations.test.js`, `screens/MySchedule.test.js`, `screens/AthleteDashboard.test.js`, `screens/AthleteDashboard.single.test.js`, `screens/AthleteDetail.test.js`

**Interfaces:**
- Consumes: Task 8 `familyLine`, `homeCardFor`, `bookingLineFor`; Task 10 `useFamilyConsents` (from `../hooks/mentalConsent`).
- Produces: `ConsentLine({ row })` ("Mental performance consent · {text}" plus the action button, which navigates to `href`); `ConsentHomeCard({ rows })` (null when `homeCardFor` is null); `ConsentAthleteHomeLine()` (calls `useFamilyConsents({ as: 'athlete' })`; renders `<ConsentLine>` for its one row when `row.adultToday || familyLine(row).action === 'withdraw'`, else null); `ConsentBookingLine({ line })` and `consentBookingFootnote({ item, row, past }) → element | null` (only for `item.type === 'mental'`, `item.status === 'confirmed'`, not past, a row with a non-null `bookingLineFor`); `ConsentDetailCard({ athleteId, role, demoPaperOpen })`, a switch that calls no hook itself: role `'parent'` → `FamilyConsentDetail` (same file; calls `useFamilyConsents()` and renders the row's `ConsentLine`), `'ops'`/`'owner'` → `StaffConsentDetail` (Task 15; null until then), any other role → null, so a role that resolves after the first render remounts instead of changing the hook order. `data/parent.js` Sessions category gains `footnote: "Yannick's consent requests always go by email; push is your choice."`.

- [ ] **Step 1: Write the failing tests**
`consent.family.test.js`:

```js
test('ConsentLine: the line and the button that opens the flow', async () => {
  const r = await renderScreen(<ConsentLine row={unsignedReese} />, { path: '/portal/family' });
  expect(r.text()).toContain('Mental performance consent · Not signed');
  await r.click('Sign now');
  expect(r.location().pathname).toBe('/portal/consent/mental/reese');
});
test('ConsentLine: Change choices opens ?change=1; no button for a claimed adult', ...);
test('ConsentHomeCard: the card for Reese, nothing when no 1:1 is booked', ...);
  // "Sign Yannick's consent for Reese before the session on Thu, Nov 12"
test('ConsentAthleteHomeLine: a minor login sees Stop recording; an unsigned minor login sees nothing', ...);
  // mocked rows: signed, both audios yes -> 'Stop recording' -> location '/portal/consent/mental', search '?withdraw=1'; unsigned minor -> empty
test('consentBookingFootnote: mental and confirmed and upcoming only', ...);
  // non-null for { type: 'mental', status: 'confirmed' }, unsignedReese, past false; null for type training, status cancelled, past true, or signedJordan
```

Screen tests get mocked rows, not the seed hook (their own fixtures use athlete ids `a1`/`a2`). Each of `ParentDashboard.test.js`, `Reservations.test.js`, `MySchedule.test.js`, `AthleteDashboard.test.js`, `AthleteDashboard.single.test.js` and `AthleteDetail.test.js` gains `let mockConsents; jest.mock('../hooks/mentalConsent', () => ({ useFamilyConsents: () => mockConsents }));` with `mockConsents = { data: null, loading: false, error: null }` in `beforeEach`, so every existing case renders without consent lines; `AthleteDetail.test.js` also mocks `../hooks/mentalConsentStaff` (`useStaffConsent: () => ({ data: null, loading: false, error: null })`). New cases (rows built in Task 8's `FamilyRow` shape):
- `ParentDashboard`: `mockConsents.data = { rows: [unsigned('a2', { firstName: 'Reese', nextMental: { date: '2026-11-12', attendee: 'athlete' } })], byId: { a2: <that row> } }` → text contains "Sign Yannick's consent for Reese before the session on Thu, Nov 12" and "Mental performance consent · Not signed".
- `Reservations`: `byId: { a1: unsigned('a1') }` with the default `row()` (type mental, confirmed) → 'Consent needed · Sign'; `row({ type: 'training' })` → no 'Consent needed'.
- `MySchedule`: `rows: [minorLoginUnsigned('a1')]` → 'Consent needed · Your parent signs this'; `rows: [signed('a1')]` → no 'Consent needed'.

- [ ] **Step 2: Run them to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/consent src/portal/screens/ParentDashboard src/portal/screens/Reservations src/portal/screens/MySchedule`
Expected: FAIL, missing components and the new screen cases.

- [ ] **Step 3: Implement**
Screen edits, nothing else in those files:
- `ParentDashboard.js`: import `useFamilyConsents` and the two components; `const consents = useFamilyConsents();`; `<ConsentHomeCard rows={consents.data?.rows} />` directly above `children.map(...)`; pass `consent={consents.data?.byId?.[child.id]}` to `ChildCard`, which renders `{consent ? <ConsentLine row={consent} /> : null}` as its last row.
- `AthleteDetail.js`: `<ConsentDetailCard athleteId={athleteId} role={role} demoPaperOpen={demoPaperOpen} />` after the login-state card (`demoPaperOpen` a harness-only prop, Task 16).
- `Reservations.js`: `useFamilyConsents()` once; `MemberList` gets `consent={consents.data?.byId?.[member.athleteId]}`; its `SessionCard` `footnote` becomes `rowCancelled ? cancelReasonCopy(...) : consentBookingFootnote({ item, row: consent, past })`.
- `MySchedule.js`: `useFamilyConsents({ as: 'athlete' })`; the same footnote expression with `row: consents.data?.rows?.[0]`.
- `AthleteDashboard.js`: one import and `<ConsentAthleteHomeLine />` directly after `<NextSessionCard ...>`.

- [ ] **Step 4: Run them to verify they pass**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false && npx eslint src/portal --max-warnings=0 && wc -l src/portal/screens/ParentDashboard.js src/portal/screens/AthleteDashboard.js`
Expected: every suite passes; lint clean; ParentDashboard under 500, AthleteDashboard at most 510.

- [ ] **Step 5: Commit**: `git add frontend/src/portal/components/consent/ConsentLine.js frontend/src/portal/components/consent/ConsentHomeCard.js frontend/src/portal/components/consent/ConsentAthleteHomeLine.js frontend/src/portal/components/consent/ConsentBookingLine.js frontend/src/portal/components/consent/ConsentDetailCard.js frontend/src/portal/components/consent/consent.family.test.js frontend/src/portal/screens/ParentDashboard.js frontend/src/portal/screens/AthleteDetail.js frontend/src/portal/screens/Reservations.js frontend/src/portal/screens/MySchedule.js frontend/src/portal/screens/AthleteDashboard.js frontend/src/portal/data/parent.js frontend/src/portal/screens/ParentDashboard.test.js frontend/src/portal/screens/Reservations.test.js frontend/src/portal/screens/MySchedule.test.js frontend/src/portal/screens/AthleteDashboard.test.js frontend/src/portal/screens/AthleteDashboard.single.test.js frontend/src/portal/screens/AthleteDetail.test.js`, then `git commit -m "feat(portal): consent lines on the family home, athlete cards and booking rows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 14: Yannick's Athletes list and Consent card

LANE frontend. Depends on: Task 10. Cross-lane: Task 5's callable.

**Files:**
- Modify: `frontend/src/portal/data/mentalNotes.js` (`mentalAthleteRows`), `data/mentalNotes.test.js`, `hooks/mental.js` (`liveMentalAthletes`, `useMentalAthletes`, `athletePayload`, `seedMentalAthlete`, `liveMentalAthlete`, `useMentalAthlete`), `hooks/mental.test.js`, `hooks/mental.live.test.js`, `screens/MentalAthletes.js`, `MentalAthletes.test.js`, `screens/MentalAthlete.js`, `MentalAthlete.test.js`
- Create: `frontend/src/portal/components/consent/ConsentCard.js`, `ConsentCard.test.js`

**Interfaces:**
- Consumes: Task 8 `consentStatusFor`, `staffConsentSummary`, `STAFF_STATUS_LABEL`, `utcTodayISO`, `isAdultOnDate`; Task 10 `fetchAllConsents`, `fetchConsent`, `MENTAL_CONSENT_KEY`, `consentSeedRecords`, `countersignConsent`, `withdrawRecording`, `sendConsentReminder`.
- Produces: `mentalAthleteRows({ athletes, households, bookings, entries, today, records = {}, utcToday })` rows gain `consentStatus` and `needsConsent` (status not `'signed'` and `nextSession` set); `records === null` (the read failed) gives `consentStatus: null`, `needsConsent: false`. The payload of `useMentalAthlete` gains `consent: { record, summary, unavailable }` (`unavailable` true when the consent read failed) and, for an athlete 18+ on the UTC date with a record or a `loginEmail`, `contact = { familyName, guardianName: null, email: athlete.loginEmail ?? null, phone: null, emergency: <record.choices.emergencyContact when it has a name, else null> }` (otherwise the household contact as today); `ConsentCard({ athleteId, firstName, familyLabel, consent })` with `familyLabel = contact.guardianName ?? null`.

- [ ] **Step 1: Write the failing tests**
`mentalNotes.test.js`:

```js
test('consent on Yannick\'s rows: from bookings only, never a held session', () => {
  const rows = mentalAthleteRows({ athletes: [ava, jo], households: {}, entries: [], today: '2026-11-05', utcToday: '2026-11-05',
    bookings: [{ athleteId: 'ava', type: 'mental', status: 'confirmed', date: '2026-11-12' }],
    records: { jo: { adult: false, adultSignature: null } } });
  expect(rows.map((r) => [r.athleteId, r.consentStatus, r.needsConsent])).toEqual([['ava', 'unsigned', true], ['jo', 'signed', false]]);
  // a held session (sessions/cal-x, unresolved) is not an input at all: the function takes bookings, and a booking with no athleteId matches nobody
  expect(mentalAthleteRows({ athletes: [ava], households: {}, entries: [], today: '2026-11-05', utcToday: '2026-11-05',
    bookings: [{ athleteId: null, type: 'mental', status: 'confirmed', date: '2026-11-12' }] })[0].needsConsent).toBe(false);
  expect(mentalAthleteRows({ athletes: [ava], households: {}, entries: [], today: '2026-11-05', utcToday: '2026-11-05', records: null,
    bookings: [{ athleteId: 'ava', type: 'mental', status: 'confirmed', date: '2026-11-12' }] })[0]).toMatchObject({ consentStatus: null, needsConsent: false });
});
```

`hooks/mental.test.js` (seed): `useMentalAthlete('quinn')` → `data.contact` toEqual `{ familyName: 'Parker family', guardianName: null, email: null, phone: null, emergency: { name: 'Sam Parker', phone: 'test-phone', relationship: 'parent' } }` and `data.consent.summary.status === 'signed'`; jordan's contact stays the existing expectation.

`hooks/mental.live.test.js`: add `const mockConsent = { fetchConsent: jest.fn(), fetchAllConsents: jest.fn() }; jest.mock('./mentalConsentLive', () => ({ ...jest.requireActual('./mentalConsentLive'), fetchConsent: (...a) => mockConsent.fetchConsent(...a), fetchAllConsents: (...a) => mockConsent.fetchAllConsents(...a) }));`, resolve them to `null` and `[]` in `beforeEach` and in `mountAthlete`; the existing "not found (null data)" case stays green; new: `fetchAthlete` with dob `'2012-05-14'` and `fetchConsent` null → `data.consent.summary.label === 'Not signed'`; `fetchConsent` rejecting → `data` not null and `data.consent.unavailable === true`.

`MentalAthletes.test.js`: rows `{ ..., consentStatus, needsConsent }`; the needing rows sort first under "Needs consent before a session"; trailing lines "Signed" / "Not signed" / "Needs 18+" / "No date of birth" beside "Intake"/"No intake" (none when `consentStatus` is null); the chip "Needs consent" shows only those rows and toggles back.

`ConsentCard.test.js` (mocks the three hook actions), one case per row:

| case | taps | expect |
|---|---|---|
| signed, not countersigned | 'Countersign' | `countersignConsent('ava')`; then no Countersign button |
| unsigned, a minor | 'Send a reminder' → 'Send' (send resolves `{ status: 'sent' }`, then `{ status: 'duplicate' }`) | the sheet reads "Send Ava's family a reminder to sign? Dana Whitfield gets an email and a push."; `mockSend('ava')`; then 'Sent', then 'Sent today' |
| 18+, `summary.audience 'athlete'`; a household with no guardian name | 'Send a reminder' | "Send Max a reminder to sign? Max gets an email and a push."; "... the family gets an email and a push." |
| refusals by `reason` | 'Send a reminder' → 'Send' | `test-household` 'This is a test family; reminders never go to test families.'; `disabled` 'Reminders are off until the academy turns them on.'; `already-signed` 'Already signed.'; `no-dob` "Add Ava's date of birth first (ops can add it)."; `no-household` 'No family on file for Ava (ops can fix it).'; `send-failed` "Couldn't send the reminder. Try again." |
| Recording withdrawn (minor, assent yes) | 'Recording withdrawn' → 'Record it' | the sheet reads "Record that Ava withdrew the recording answer? Recording stops until the family changes it."; `withdrawRecording('ava')` |
| needs 18+ | none | 'Recording: needs 18+ signature'; 'Send a reminder' present |
| unavailable | none | 'Consent status unavailable'; no buttons |

`MentalAthlete.test.js`: the Consent card sits between Intake and Sessions; an 18+ athlete's contact line shows the login email and the emergency contact, not the guardian.

- [ ] **Step 2: Run them to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/mentalNotes src/portal/hooks/mental src/portal/screens/MentalAthlete src/portal/components/consent/ConsentCard`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**
`hooks/mental.js`: `liveMentalAthletes` adds `fetchAllConsents().catch(() => null)` to its `Promise.all` (keyed by `id`, or null) and passes `records` and `utcTodayISO()`; `liveMentalAthlete` adds `fetchConsent(athleteId).catch(() => undefined)` (undefined → `unavailable`); the seed paths read `consentSeedRecords()` (`mentalAthleteRows({ ...mentalFixtures(today), today, utcToday: utcTodayISO(), records: consentSeedRecords() })`); `useMentalAthletes` and `useMentalAthlete` add `useInvalidation(MENTAL_CONSENT_KEY)` to their deps. A consent read failure never blanks the Athletes list or the athlete page. `MentalAthlete.js` renders `contact.emergency` as "Emergency: Sam Parker, test-phone (parent)". `ConsentCard` names the recipient from `summary.audience` (`'athlete'` → the athlete's first name; else `familyLabel`, or "the family") and maps a `LiveDataError.reason` to the refusal copy above.

- [ ] **Step 4: Run them to verify they pass**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal && npx eslint src/portal --max-warnings=0 && wc -l src/portal/hooks/mental.js`
Expected: PASS, lint clean, under 500.

- [ ] **Step 5: Commit**: `git add frontend/src/portal/data/mentalNotes.js frontend/src/portal/data/mentalNotes.test.js frontend/src/portal/hooks/mental.js frontend/src/portal/hooks/mental.test.js frontend/src/portal/hooks/mental.live.test.js frontend/src/portal/screens/MentalAthletes.js frontend/src/portal/screens/MentalAthletes.test.js frontend/src/portal/screens/MentalAthlete.js frontend/src/portal/screens/MentalAthlete.test.js frontend/src/portal/components/consent/ConsentCard.js frontend/src/portal/components/consent/ConsentCard.test.js`, then `git commit -m "feat(mental): consent status on Yannick's list, the Consent card, reminders and countersign" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 15: Paper signatures and the staff tracker

LANE frontend. Depends on: Task 10, Task 13 (`ConsentDetailCard`).

**Files:**
- Create: `frontend/src/portal/components/consent/PaperSignatureSheet.js`, `StaffConsentDetail.js`, `ConsentTrackerCard.js`, `consent.staff.test.js`
- Modify: `components/consent/ConsentDetailCard.js` (the ops/owner branch renders `StaffConsentDetail`), `screens/AdminDashboard.js` (one line and its import), `screens/AdminDashboard.test.js`, `AdminDashboard.fallback.test.js`, `AdminDashboard.scholarships.test.js` (one mock each)

**Interfaces:**
- Consumes: Task 10 `useStaffConsent`, `useConsentTracker` (from `../../hooks/mentalConsentStaff`); Task 8 `staffConsentSummary`, `paperDateToStamp`, `CONSENT_VERSION`.
- Produces: `PaperSignatureSheet({ open, athlete, record, mode: 'record'|'correct', onSave(input), onClose })` where `input = { signedAt: Date (paperDateToStamp of the date typed), section: '10'|'11', version (default CONSENT_VERSION; editable in 'correct', and by ops in 'record'), signerName, assentName, assentAudio, choices }`; the assent-audio control is disabled when `record.assent.withdrawnBy` is set; `StaffConsentDetail({ athleteId, role, demoPaperOpen })` shows the status line, "Record a paper signature" (no record, or a minor record when the athlete is 18+ and `section '11'`), and for the owner on a paper record "Correct the paper record"; `ConsentTrackerCard({ onOpenAthlete })` (heading "Mental consent"; each row `<name> · <Thu, Nov 12 | last Oct 29> · <label>`).

- [ ] **Step 1: Write the failing tests**
```js
test('Record a paper signature: date, section, version, names and the choices as far as the paper shows', async () => {
  // ops: open the sheet, date 2026-10-28, section 10, signer 'Dana Whitfield', assent name 'Ava', assent audio 'No', leave location blank
  expect(mockRecordPaper).toHaveBeenCalledWith(expect.objectContaining({ section: '10', version: '2026-10-30', signerName: 'Dana Whitfield', assentName: 'Ava', assentAudio: false,
    choices: expect.objectContaining({ location: null }) }));
  expect(mockRecordPaper.mock.calls[0][0].signedAt.toISOString()).toBe('2026-10-28T05:00:00.000Z');
  // a future date or one before Jan 1 2026 keeps Save disabled with 'Use the date on the paper form'; today's date keeps it enabled
});
test('only the owner corrects a paper record; nobody edits a portal one', ...);
  // ops on a paper record: no 'Correct the paper record'; owner: yes, and an edited version '2026-09-01' reaches mockCorrectPaper; owner on a portal record: no
  // a withdrawn record: the assent-audio control is disabled
test('ConsentDetailCard reads only what the role may read, and survives the role resolving late', async () => {
  // mocks ../../hooks/mentalConsent (useFamilyConsents jest.fn -> {data: null}) and ../../hooks/mentalConsentStaff (useStaffConsent jest.fn -> {data: null})
  // role 'coach' / 'mental': renders nothing, neither hook called
  // role 'parent' then r.rerender with role 'ops': no throw; useStaffConsent first called after the rerender, with 'ava'; never for 'parent'
});
test('ConsentTrackerCard: every athlete with a mental booking, not signed with a 1:1 ahead first, each opens the athlete', ...);
  // 'Mental consent' heading; 'Reese Whitfield · Thu, Nov 12 · Not signed', then 'Nico Whitfield · last Oct 29 · Not signed', then 'Jordan Whitfield · Thu, Nov 19 · Signed'; tap -> onOpenAthlete('reese')
```

The three `AdminDashboard*.test.js` files gain `jest.mock('../hooks/mentalConsentStaff', () => ({ useConsentTracker: () => ({ data: [], loading: false, error: null }) }));` (the `../hooks/billing` precedent).

- [ ] **Step 2: Run them to verify they fail**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/consent/consent.staff.test.js`
Expected: FAIL, missing components.

- [ ] **Step 3: Implement**
`AdminDashboard.js`: `{onOpenAthlete ? <ConsentTrackerCard onOpenAthlete={onOpenAthlete} /> : null}` directly after the `HouseholdsCard` line, with its import. The sheet builds `choices` with blank fields as null (location null, audio false, contact both null, `parentSessions` false for §11) and `adult = section === '11'`; `signedAt` is `paperDateToStamp(<the typed date>)`.

- [ ] **Step 4: Run them to verify they pass**
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal && npx eslint src/portal --max-warnings=0 && wc -l src/portal/screens/AdminDashboard.js`
Expected: PASS, lint clean, AdminDashboard under 500.

- [ ] **Step 5: Commit**: `git add frontend/src/portal/components/consent/PaperSignatureSheet.js frontend/src/portal/components/consent/StaffConsentDetail.js frontend/src/portal/components/consent/ConsentTrackerCard.js frontend/src/portal/components/consent/consent.staff.test.js frontend/src/portal/components/consent/ConsentDetailCard.js frontend/src/portal/screens/AdminDashboard.js frontend/src/portal/screens/AdminDashboard.test.js frontend/src/portal/screens/AdminDashboard.fallback.test.js frontend/src/portal/screens/AdminDashboard.scholarships.test.js`, then `git commit -m "feat(portal): ops and owner record paper consent; the Admin consent tracker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 16: The review harness

LANE frontend. Depends on: Tasks 11-15.

**Files:**
- Modify: `frontend/src/portal/StatesHarness.js`; `screens/MentalConsentFlow.js`, `screens/MentalConsent.js` (pass the harness-only props to their hooks); `screens/MentalAthlete.js` and `hooks/mental.js` (`useMentalAthlete(athleteId, { demoUtcToday, demoRecord })`, seed branch only); `hooks/mental.test.js`
- Create: `frontend/src/portal/StatesHarness.consent.test.js`

**Interfaces:**
- Consumes: `MentalConsentFlow`, `MentalConsent`, `MentalAthlete` (seed), `AthleteDetail`, Task 10's harness-only hook props, `consentSeedPaperRecord`.
- Produces: `SCREEN_STATES` entries `{ id: 'CF', title: 'Mental consent flow', Screen: MentalConsentFlow, role: 'parent · athlete' }` with states `['default', 'Reese · minor, step 1', { athleteId: 'reese' }]`, `['default', 'Quinn · 18+ on their own login', { athleteId: 'quinn', demoViewer: 'athlete', demoNoRecord: true }]`, `['default', '18+ hand-over on the parent phone', { athleteId: 'quinn', demoViewer: 'parent', demoNoRecord: true }]`, `['default', 'Change choices', { athleteId: 'jordan', change: true }]`; `{ id: 'CL', title: 'Mental consent list', Screen: MentalConsent, states: [['default', 'Whitfield family · Reese waiting', { demoDraft: 'reese' }]] }`; MP gains `['default', 'Reese · consent needed', { athleteId: 'reese' }]`, `['default', 'Quinn · 18+ signed', { athleteId: 'quinn' }]`, `['default', 'Jordan · needs 18+', { athleteId: 'jordan', demoUtcToday: '2030-07-01' }]` and `['default', 'Nico · paper, not transcribed', { athleteId: 'nico', demoRecord: 'paper' }]`; '09' (Athlete Detail) gains `['populated', 'Ops · paper signature', { athleteId: 'nico', role: 'ops', demoPaperOpen: true }]`. Live mode ignores every harness-only prop.

- [ ] **Step 1: Write the failing tests**: `StatesHarness.consent.test.js`: `SCREEN_STATES` contains ids `CF` and `CL`, MP has the four new labels and '09' has 'Ops · paper signature'; rendering each new state mounts without throwing. `hooks/mental.test.js` (seed): `useMentalAthlete('jordan', { demoUtcToday: '2030-07-01' }).data.consent.summary.status === 'needs-adult'`; `useMentalAthlete('nico', { demoRecord: 'paper' }).data.consent.summary.summary` contains `'Location: not transcribed'`.
- [ ] **Step 2: Run them**: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/StatesHarness src/portal/hooks/mental.test.js` — FAIL, ids and props missing.
- [ ] **Step 3: Implement** the entries and the props.
- [ ] **Step 4: Run them**: the same command, then `cd frontend && CI=true npm run build && grep -l "Understanding the Service" build/static/js/*.js` — PASS; "Compiled successfully"; the grep names exactly one file and it is not `main.*.js` (the form text ships only in a lazy chunk).
- [ ] **Step 5: Commit**: `git add frontend/src/portal/StatesHarness.js frontend/src/portal/StatesHarness.consent.test.js frontend/src/portal/screens/MentalConsentFlow.js frontend/src/portal/screens/MentalConsent.js frontend/src/portal/screens/MentalAthlete.js frontend/src/portal/hooks/mental.js frontend/src/portal/hooks/mental.test.js`, then `git commit -m "chore(portal): consent states in the review harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 17: The switch script

LANE scripts-docs. Depends on: Task 0.

**Files:**
- Create: `scripts/set-mental-consent-flag.mjs`, `scripts/test/set-mental-consent-flag.test.mjs`

**Interfaces:**
- Consumes: `scripts/lib/firestore-rest.mjs` (`commit, docName, fsFields, getDoc, resolveTarget`).
- Produces: `parseArgs(argv)`, `enabledAtFor({ on, today, current })`, `buildWrite({ on, today, current })` (writes `config/mentalConsent { notices, enabledAt }`), `main(argv, { today })` — `set-contract-flag.mjs` cloned with `contract` → `mentalConsent` and `enabled` → `notices`; usage lines `--prod --on --dry-run`, `--prod --on --yes` (the owner), and the emulator form.

- [ ] **Step 1: Write the failing test**: `set-contract-flag.test.mjs` cloned: `parseArgs` cases unchanged; `buildWrite({ on: true, today: '2026-11-10' }).update.fields` deep-equals `fsFields({ notices: true, enabledAt: '2026-11-10' })` and its name is `docName('config', 'mentalConsent')`; off → `{ notices: false, enabledAt: null }`; a second `--on` keeps a stored `enabledAt`; the emulator case (skipped without `FIRESTORE_EMULATOR_HOST`): dry-run writes nothing, `--yes` writes and reads back.
- [ ] **Step 2: Run it**: `npm run test:scripts` — FAIL, "Cannot find module '../set-mental-consent-flag.mjs'".
- [ ] **Step 3: Implement** the clone; the header says the automatic consent notices (booking, day-before, Yannick's reminder) send nothing while `notices` is false, and the owner turns it on right after `develop:main`.
- [ ] **Step 4: Run it** (wt-consent-scripts root): `npm run test:scripts` and `npx firebase-tools emulators:exec --only firestore --config firebase.consent-scripts.json --project rypacad "node --test scripts/test/set-mental-consent-flag.test.mjs"` — PASS, the emulator case included.
- [ ] **Step 5: Commit**: `git add scripts/set-mental-consent-flag.mjs scripts/test/set-mental-consent-flag.test.mjs`, then `git commit -m "feat(scripts): set-mental-consent-flag - the owner's switch for the consent notices" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 18: Emulator seed and the data model

LANE scripts-docs. Depends on: Task 0 (the shapes are the Global Constraints).

**Files:**
- Create: `scripts/lib/consent-fixtures.mjs`, `scripts/test/consent-fixtures.test.mjs`
- Modify: `scripts/seed-firestore.mjs` (call the fixtures, add the athlete and the collection), `docs/portal/DATA-MODEL.md`

**Interfaces:**
- Produces: `consentFixtures({ now }) → { athletes: Map<id, doc>, mentalConsents: Map<id, doc>, config: [id, doc] }`: athlete `quinn-parker` (`'Quinn Parker'`, dob `'2006-08-20'`, household `parker`, `packageId 'elite'`, `contractMinutes null`, `coachId null`); `mentalConsents/jordan` (minor portal record by `parent-dana`, "Dana Whitfield", signed and countersigned by `mental` the next day, assent "Jordan" yes, location B, driving false, contact same as parent); `mentalConsents/quinn-parker` (§11 by hand-the-phone on `parent-sam`, signer "Quinn Parker", recording yes, location C, `parentSessions true`, `parentName 'Sam Parker'`, contact `{ name: 'Sam Parker', phone: 'test-phone', relationship: 'parent' }`); `config/mentalConsent { notices: false, enabledAt: null }`. Reese (Calendly 1:1 already seeded) and nico stay unsigned.

- [ ] **Step 1: Write the failing check**: `scripts/test/consent-fixtures.test.mjs` asserts the record field sets equal the Global Constraints' 14 keys, `jordan.assent.at` equals `jordan.signedAt`, `quinn-parker.assent === null`, `quinn-parker.choices.driving === null`, and that no value matches the phone pattern.
- [ ] **Step 2: Run it**: `npm run test:scripts` — FAIL, missing module.
- [ ] **Step 3: Implement** the fixtures (Dates for timestamps; `fsValue` encodes them) and in `seed-firestore.mjs` merge `athletes` and `config` and add `mentalConsents` to the returned collections, plus one sanity line in `main()` ("Mental consent: jordan signed (minor, countersigned), quinn-parker signed (18+), reese and nico unsigned; notices off"). `DATA-MODEL.md`: a `mentalConsents/{athleteId}` section (the fields, `adultSignature.method`, the status rule, who reads and writes, the four history entry shapes, nobody deletes), the claimed-login test (an invite with `status 'claimed'`; a provisioned athlete login without an invite counts as unclaimed; the server also counts the self-created 18+ member), the three notice kinds and their ledger ids, `config/mentalConsent`, and the test-mark rule (nudges skip `household.test` or `athlete.test`).
- [ ] **Step 4: Run it** (wt-consent-scripts root): `npm run test:scripts` and `npx firebase-tools emulators:exec --only firestore --config firebase.consent-scripts.json --project rypacad "node scripts/seed-firestore.mjs"` — PASS; the seed commits, prints its total (re-record the figure in the commit message, it is not a test) and the consent line.
- [ ] **Step 5: Commit**: `git add scripts/lib/consent-fixtures.mjs scripts/test/consent-fixtures.test.mjs scripts/seed-firestore.mjs docs/portal/DATA-MODEL.md`, then `git commit -m "chore(seed): mental consent fixtures; DATA-MODEL for mentalConsents and the notices" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

### Task 19: Gate

LANE integration. Depends on: Tasks 1-18; runs in `wt-consent`.

**Files:** none new; fix-ups only, committed as `fix(consent): gate fix-ups`.

**Interfaces:**
- Consumes: everything above.
- Produces: a green branch for the session lead's browser QA and the merge into `develop`.

- [ ] **Step 0: Merge the lanes**: in `wt-consent`, `git merge --no-ff mental/consent-fn`, then `mental/consent-fe`, then `mental/consent-scripts`, each message ending with the trailer.
- [ ] **Step 1: Frontend**: `cd frontend && CI=true npx react-scripts test --watchAll=false` (every suite passes), `npx eslint src/portal --max-warnings=0` (clean), `CI=true npm run build` ("Compiled successfully").
- [ ] **Step 2: Functions**: `cd functions && for f in portal/*.test.js; do node "$f" || exit 1; done && node test/check-exports.js && npx eslint .` — every file `N passing`, `mental-consent-status.test.js` with the client-mirror case live, `ok  20 functions exported`, eslint clean.
- [ ] **Step 3: Rules, scripts, seed, replay**: `npx firebase-tools emulators:exec --only firestore --config firebase.consent.json --project rypacad "node scripts/verify-rules.mjs"` → `ALL PASS (both passes)` (record the PASS count; a figure, not a test); `npm run test:scripts` → pass; the Task 18 seed command with `--config firebase.consent.json` → commits; PREFLIGHT → `preflight ok`; the Task 6 replay with `--config firebase.consent.json` and `--env-file=scripts/emulator.consent.env`, teed to `<scratchpad>/consent-replay.log` → `=== ALL CHECKS PASSED ===` and `grep -c 'Trying to access secret'` prints `0`.
- [ ] **Step 4: Backward compatibility**: `git diff 2e844de -- firestore.rules | grep -E '^-[^-]'` → no output; `git diff 2e844de -- functions/index.js | grep -E '^-\s*exports\.'` → no output; `git diff 2e844de --stat -- firestore.indexes.json` → nothing.
- [ ] **Step 5: Email only and no real names** (bash, wt-consent root; nothing below prints a number or a name):
  - (a) `git diff 2e844de -U0 | grep -E '^\+' | grep -nE '[0-9]{3}[^0-9A-Za-z]{0,2}[0-9]{3}[^0-9A-Za-z]{0,2}[0-9]{4}'` → no output, or only reviewed non-phone numerics (epoch millis, ids), each named in the gate report.
  - (b) `git merge-base --is-ancestor 31cfe78 HEAD && echo 'STOP: the old spec commit is an ancestor'` → prints nothing.
  - (c) `N=$(git show 31cfe78:docs/portal/plans/2026-10-30-mental-consent/01-consent-form-FINAL.txt | grep -oE '\(?[0-9]{3}\)?[ .-]?[0-9]{3}[ .-]?[0-9]{4}' | head -1 | tr -cd '0-9'); [ ${#N} -eq 10 ] || echo 'STOP: digits not found'; PAT="${N:0:3}[^0-9]{0,2}${N:3:3}[^0-9]{0,2}${N:6:4}"; git grep -lE "$PAT" HEAD -- .; git log -p 2e844de..HEAD | grep -cE "$PAT"; grep -rlE "$PAT" frontend/build` → no file names and `0`.
  - (d) `git log -p 2e844de..HEAD | grep -icwFf <scratchpad>/consent-names.txt` and `git log --format=%B 2e844de..HEAD | grep -icwFf <scratchpad>/consent-names.txt` → `0` and `0`.
- [ ] **Step 6: Sizes and hygiene**: `wc -l` on every file this branch created → each under 500; `ParentDashboard.js`, `AdminDashboard.js`, `functions/index.js`, `data/seed.js` under 500, `AthleteDashboard.js` at most 510; `git status --short` → only `firebase.consent.json`, `scripts/emulator.consent.env` and the gitignored `functions/*.local` untracked.
- [ ] **Step 7: Emulator QA list for the session lead** (browser, seed of Task 18): Dana signs reese with "Reese isn't here" once, then finishes; Back from a one-athlete flow lands on the family screen; jordan's own login (`athlete-jordan`, a minor) taps "Stop recording" on its home and withdraws; ops records a paper signature for nico and the owner corrects its date; Yannick countersigns quinn-parker and sends a reminder for reese (refused 'disabled' while the seeded switch is off; after `node --env-file=scripts/emulator.consent.env scripts/set-mental-consent-flag.mjs --on --yes` against the lane emulator it answers Sent, then Sent today).
- [ ] **Step 8: Commit fix-ups**, if any, naming each file: `git commit -m "fix(consent): gate fix-ups"` with the trailer.

### Task 20: Release (the owner runs this)

LANE integration. Depends on: Task 19 green and the session lead's merge of `mental/consent` into `develop` in the main checkout `C:\Users\Mac\Desktop\rypacadapp\rypacad`. Agents run none of it.

- [ ] **Step 0: What else ships.** `firestore:rules` replaces the whole live ruleset with develop's, and the four functions below load develop's copies of every shared module (`notify.js`, `jobs.js`, `lib.js`, `booking-gates.js` ...). In the Firebase console (Firestore → Rules) note the date of the live ruleset and, with the session lead, the develop commit it was deployed from; the same for the last functions deploy. Then `git diff <that commit> develop -- firestore.rules functions/portal functions/index.js` lists everything this release ships besides consent. Go on only when every other hunk is one you mean to ship (the coach athlete-read grant `4fa53b1` is one of them if it has not been deployed yet; its width ruling is still open).
- [ ] **Step 1: Functions** (from the main checkout): `npx firebase-tools deploy --only "functions:onBookingCreated,functions:sessionReminders,functions:requestMentalConsent,functions:onMentalConsentSigned" --project rypacad`. Nothing reaches a family: `config/mentalConsent` does not exist, so every ask answers off.
- [ ] **Step 2: Rules**: `npx firebase-tools deploy --only firestore:rules --project rypacad`.
- [ ] **Step 3: Staging**: `git push origin develop`; wait for Railway Staging (rypacad.ryptest.com), then walk the Staging check below.
- [ ] **Step 4: Production**: `git push origin develop:main`; wait for portal.rypacademy.com to serve the new build (the consent link opens).
- [ ] **Step 5: The switch**: `node scripts/set-mental-consent-flag.mjs --prod --on --dry-run`, read the planned write, then `node scripts/set-mental-consent-flag.mjs --prod --on --yes`.
- [ ] **Step 6: The families already booked**: Yannick presses "Send a reminder" for every athlete under "Needs consent" on his Athletes list (the 1:1s booked before release; the list is with Yannick and the owner, not in the repo); a family that signs on paper meanwhile is recorded by ops from the athlete's admin card. The session lead adds a consent section to Yannick's staging test guide (a published artifact generated from the scratchpad, not a repo file).

## Staging check (the owner and Yannick, between Release Steps 3 and 4)

Staging reads and writes the production database; only the RYP Test Family (`ryp-test-ava`, under 18; `ryp-test-max`, 18+, no login) is used, and the switch is still off.

1. Yannick (staging, role mental) → Athletes: every row carries a consent line beside Intake; "Needs consent" shows the athletes with a 1:1 ahead and no signature. **Count the "No date of birth" rows among them and send the names to ops** (the spec's dob report).
2. Yannick → Ava Test → "Send a reminder" → "Reminders are off until the academy turns them on." (after Release Step 5 the same tap says "This is a test family; reminders never go to test families.").
3. Test parent → `/portal/consent/mental` → Ava Test: Step 1 of 5 to Step 4, the hand-over, then "Ava isn't here". The family screen reads "Waiting for Ava's agreement · Continue". Continue: step 4 shows again with the name filled and unticked; hand over; Ava answers; Done reads "Signed · <today>..." and leaves the consent pages. The receipt email arrives at the test parent's address.
4. Test parent → Max Test: "Max is 18 or older and signs for themself" → "Hand the phone to Max" → the agreement → §11 → Done.
5. Yannick: both show Signed; Countersign each (status "Complete"); on Ava, "Recording withdrawn" → "Recording: no (Ava withdrew <today>)".
6. Test parent → Ava's card → "Change choices" → Online → Save; Yannick's card shows "Location: Online".
7. Owner → Admin: the "Mental consent" card lists every athlete with a mental booking, not signed with a 1:1 ahead first; Ava Test's admin card shows the status line and no paper action (already signed). The paper record and the owner's correction were walked on the emulator (Task 19 Step 7).
8. Nothing left the test family: the owner, Firebase console → Firestore → `notifications`, filters `kind == 'consent-needed'`, then `'consent-reminder'`, then `'consent-signed'`: the first two show no rows; every `consent-signed` row has the RYP Test Family's `householdId` (or `athleteId` `ryp-test-max`); then `node scripts/set-mental-consent-flag.mjs --prod --on --dry-run` still prints `config/mentalConsent: not set`.

## Decided here (not settled by the spec; for the reviewer)

The claimed-login field, the callable's key, the no-dob rule, the per-kind email lock and the staff tracker are under "Changes since the spec" (#5, #6, #12, #7, #11). Also:

1. **Callable name** kept: `requestMentalConsent`, wrapped in its own module like `calendlyWebhook`.
2. **A minor's own login** changes nothing but its own recording answer (to no), from a "Stop recording" line on its home that opens the list with `?withdraw=1`; the family "Change choices" arm for an athlete login covers adult records only, so a child cannot change the parent's answers.
3. **"Same as parent"** is `{ name: null, phone: null, relationship: null }`, minors only (an all-blank minor contact is the same); Yannick's card reads "Emergency contact: same as parent".
4. **Scroll-to-end**: an `IntersectionObserver` on a sentinel after §8; where the API is missing the step counts as read at mount (every supported phone browser has it).
5. **`ConsentInfoSheet` is not reused**: it renders the four enrollment consents in a sheet; the agreement is full-width cards from `mentalConsentTerms.js`.
6. **Notice copy** as pinned in Task 3, every body ending "Questions? Contact Yannick at yannick@rypgolf.com."; gender-neutral wording ("the session", "their own login", "themself") where the spec wrote "her" and "his".
7. **Step count**: "Step n of 5" for a minor (hand-over and assent are both step 5), "Step n of 4" for 18+ (the adult's hand-over is not counted).
8. **Saving**: the create is a plain `setDoc` (a parent cannot read a missing record inside a transaction); a refusal re-reads through the viewer's own query and shows "Already signed by ... on ..." when a record is there. Every later write is a transaction.
9. **Seed fixtures**: reese (Whitfield, invited not claimed) gets the 1:1 a week out; the 18+ fixture is Quinn Parker (dob 2006-08-20), a Parker sibling, so sage-parker's bracket and assessment fixtures do not move; the emulator's Quinn signed §11 by hand-the-phone on `parent-sam`; the switch is seeded off.
10. **Staging walk**: the test family's two athletes are both needed for the portal paths, so the paper record and the owner's correction are walked on the emulator.
11. **Deploy scope**: only the four functions this branch changes or adds; the others keep their deployed code, which behaves identically for their own kinds (Release Step 0 checks what else rides along).
12. **Leaving the flow**: one listed athlete (every athlete login, a one-child family) → the role home; more → the list, which does not auto-open again (`state { from: 'flow' }`).
13. **Turning 18 inside a minor-era record**: the parent can still change location, driving and the contact until the re-sign (unless the athlete has a claimed login), but not the athlete's recording answer; recording is off until the re-sign, and a re-signed record cannot be "withdrawn" (its recording is `choices.audio`).
14. **A household doc missing**: no automatic ask; the callable answers `no-household` and the card says ops can fix it.
15. **Yannick's reminder sheet** names the athlete when they are 18+ with a `loginEmail` (Yannick cannot read invites); the server's audience is the authority.
