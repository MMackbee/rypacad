# Facility door button: spec

Owner request (2026-11-14): uSchedule-style "instantaneous access via a button on the app".
Owner "Lets build it" (2026-11-17). Design history: the door design and hostile review of
2026-11-14 (workflows wf_ca1ae1cb-8ef); this spec supersedes both where they differ.

## 1. What it is

A family member opens the portal at the academy door and holds **Unlock**. The portal's server checks
that the family may come in, that the person is at the academy, and then opens the door through
Avigilon Alta. The URL that opens the door lives only on our server.

How the door opens: the owner makes one Alta user ("Portal door - DO NOT DELETE", no admin role,
Remote Unlock on, access to the member door only) with a Cloud Key credential. In Alta, that
credential's **Get webhook URL** dialog produces an **API link**
(`https://api.openpath.com/tokens/cloudKeyUnlockTokens/<token>/use`). A POST to it with no body
unlocks the entries chosen for the link, until the link's end date. No Alta login or JWT is needed
(openpath.readme.io: useCloudKeyUnlockToken has no security block; generateCloudKeyUnlockToken says
the apiUrl "if POST-ed to, will immediately unlock the specified entries"). The owner stores the
API link as the Secret Manager secret `ALTA_UNLOCK_URL`. Nobody else ever sees it.

## 2. Owner rulings (verbatim where quoted)

1. "only visible to parents and kids who have facility access paid for": the server rule
   `householdFacility` (a live Elite membership or a live facility add-on; active or past_due).
2. "yes comped families get it too": a comped Elite (`billing.comp`) counts.
3. Kids: "only 16 and up". A kid's own login gets the button only at 16+ on the day.
4. Academy only: the phone must be at the academy (owner, 2026-11-17, after the location
   trade-offs: "Lets build it").

## 3. Calls made for the owner (defaults; the final message lists them)

- The staff `facilityAccess` switch does not count as paid access (ruling 1 says "paid").
- An Elite athlete with NO `billing` map does not count for the door (hostile review B2). Production
  has none today (read-only count, 2026-11-14), so nobody loses the button.
- past_due counts, as `householdFacility` already says.
- Owner and ops get the button too, from anywhere, without the location check (to let a family
  in remotely, and to test). Coaches and Yannick do not.
- Everyone who presses signs the **door rules** once in the app, per login (the existing facility
  rules plus one new line). A 16-17 athlete also needs a parent in the household to have signed.
  This closes review B4/M2/M3/M4 without touching sign-up's consent records.
- New line in the facility rules (sign-up shows it too): "Use the app's Unlock button only when you
  are at the door, and only to let in your own household and the one guest the rules allow. Never
  open the door for anyone else." (Review 2026-11-17 spec-5: the first wording contradicted "One
  guest may come along" two lines above it; the owner should confirm this wording.)
- Around the clock, as the waiver says. No parent notice per unlock in v1. No App Check in v1.
- The Nov 5 Alta mobile keys stay as the fallback when the internet or Alta is down.
- Failure messages give the academy number (612) 234-1644 (the website's number).

## 4. Data (Firestore)

All five collections are new. Only the Admin SDK writes `doorEvents`, `doorLimits` and `doorRules`.

| Path | Shape | Who writes | Who reads |
|---|---|---|---|
| `doorConfig/main` | `{mode: 'off'\|'staff'\|'all', lat: ?number, lng: ?number, radiusM: int 50..1000, openSeconds: int 1..30, updatedAt: timestamp, updatedByUid: string}` | owner, ops (client, rules-validated) | owner, ops |
| `doorPauses/{householdId}` | `{householdId, pausedAt: timestamp, pausedByUid, note: ?string (<=200)}` | owner, ops create/delete | owner, ops |
| `doorRules/{uid}` | `{uid, householdId, athleteId: ?string, role: 'parent'\|'athlete', adult: bool, name, termsVersion, signedAt: timestamp, signedAtMs}` | server (signDoorRules) | the signer; owner, ops |
| `doorEvents/{uid}_{pressId}` | `{uid, role, name, householdId: ?string, householdName: ?string, athleteId: ?string, atMs, at: timestamp, outcome: 'pending'\|'opened'\|'coalesced'\|'test'\|'denied'\|'error', reason: ?string, altaStatus: ?int, latencyMs: ?int, distanceM: ?int (rounded to 10), accuracyM: ?int, test: bool, nonce: string (the invocation's random mark)}` | server (unlockDoor) | owner, ops; a parent where `householdId == me().householdId`; an athlete where `uid == request.auth.uid` |
| `doorLimits/{uid}` | `{callsAtMs: number[], opensAtMs: number[], lastOpenedAtMs: ?number, lastConfirmedOpenAtMs: ?number, updatedAtMs}` | server | nobody |

- A missing `doorConfig/main` means `mode: 'off'` (fail closed). Defaults when fields are absent:
  `radiusM` 200, `openSeconds` 5.
- No coordinates are ever stored: `doorEvents` keeps only the distance from the academy, rounded to
  10 m, and the reported accuracy.
- Indexes: `doorEvents` (householdId ASC, atMs DESC) and (uid ASC, atMs DESC). The staff list orders
  by `atMs` alone (automatic index).

## 5. Server

### 5.1 `functions/portal/door-decide.js` (pure)

Exports `DOOR_TERMS_VERSION = 'door-2026-11-17'`, `STAFF_DOOR_ROLES = ['owner', 'ops']`,
`DEFAULTS = {radiusM: 200, openSeconds: 5}`, `doorFacility(athletes)` and
`decide({user, household, athletes, config, paused, myRules, householdRules, today, location, mode})`.

- `doorFacility(athletes)`: `householdFacility` (facility.js, unchanged) over the athletes with an
  Elite athlete that has no `billing` map treated as not Elite. Returns `householdFacility`'s object.
- `decide` returns `{ok: boolean, reason: ?string, staff: boolean, test: boolean, distanceM: ?number,
  accuracyM: ?number}`. `mode` is `'check'` or `'unlock'`; location is checked only on `'unlock'`.
  `today` is a Chicago `YYYY-MM-DD`. The first failing check wins, in this order:
  1. `config` missing or `config.mode` not in `['staff','all']` -> `off`.
  2. `user.role` in `STAFF_DOOR_ROLES` -> ok, staff (no household, location or rules check).
  3. role not `parent`/`athlete`, or no `householdId` -> `not-eligible`. `config.mode === 'staff'` ->
     `off`.
  4. `!doorFacility(athletes).access` -> `no-access`.
  5. Athlete login: its own athlete doc (`user.athleteId` among `athletes`); `ageAt(dob, today)`
     (lib.js) null or < 16 -> `under-16`.
  6. `paused` -> `paused`.
  7. `myRules` missing, `termsVersion !== DOOR_TERMS_VERSION` or `householdId` differs ->
     `sign-rules`.
  8. Athlete login aged 16-17: no doc in `householdRules` with `role === 'parent'` and the current
     version -> `guardian-rules`.
  9. `config.lat`/`config.lng` not finite numbers -> `not-set-up`.
  10. `mode === 'unlock'`: `location` missing or invalid -> `location-needed`; outside reach ->
      `too-far`. Reach: `distanceM <= radiusM + min(max(accuracy, 0), 150)`.
  - `test` is true when `household.test === true`, or for an athlete login its own athlete doc has
    `test === true`. A test caller still goes through every check.
- `functions/portal/door-geo.js` (pure): `distanceM(a, b)` (haversine, earth radius 6371008.8 m),
  `validLocation(loc)` (finite lat in [-90,90], lng in [-180,180], accuracy finite >= 0, else null),
  `reach(loc, config)` -> `{ok, distanceM, accuracyM}`.

### 5.2 `unlockDoor` callable (`functions/portal/door.js`)

`functions.runWith({secrets: DOOR_SECRETS, timeoutSeconds: 20, memory: '256MB'}).https.onCall`.
`DOOR_SECRETS = ['ALTA_UNLOCK_URL']` in secrets.js, bound on this function only. The handler is
exported as `unlockDoorHandler(data, context, deps)` with seams `{db, fetch, env, now}` (the
feedback.js pattern).

- `{check: true}` -> `{canUnlock, reason, staff, openSeconds}`. Never throws for a refusal; writes
  nothing; makes no Alta call. Throws only `unauthenticated` (`signed-out`).
- `{pressId, location}` -> `{outcome: 'opened'|'coalesced'|'test', openSeconds}` or an `HttpsError`
  with `details.reason`. `pressId` must match `/^[A-Za-z0-9-]{8,64}$/` (`bad-request`).
  1. Auth; `users/{uid}` (missing -> `not-provisioned`, permission-denied).
  2. Reads: `doorConfig/main`; for a family caller the household, its athletes (`householdId ==`),
     `doorPauses/{householdId}`, `doorRules/{uid}`, and for a 16-17 athlete
     `doorRules where householdId ==`.
  3. If `doorEvents/{uid}_{pressId}` exists, answer from it (opened/coalesced/test -> the same
     result; denied/error -> the same reason; pending -> unavailable `in-progress`). No Alta call.
  4. `decide(..., mode: 'unlock')`.
  5. One transaction on `doorLimits/{uid}` that also `tx.create`s the event:
     - more than 40 calls in the last hour (denied included) -> `rate-limited`;
     - denied -> event `denied` with the reason, then throw (failed-precondition);
     - `lastConfirmedOpenAtMs` (set when Alta answered 2xx, or at once for a test household) within
       the coalesce window -> event `coalesced`, no Alta call. The window is the open time,
       at most 10 s (review 2026-11-17 server-2: "Hold again" after the countdown is a real open);
     - `lastOpenedAtMs` within that window but not confirmed (Alta has not answered it) -> event
       `denied` `in-progress` (unavailable), never "already unlocked" (server-3);
     - 12 opens in the last hour -> `rate-limited`;
     - else record the open (`opensAtMs`, `lastOpenedAtMs`) and create the event `pending`.
     - The event carries the invocation's `nonce`: a transaction body that runs again after its
       commit applied finds its own event and carries on, instead of replaying `in-progress`.
  6. Test caller: event `test`, no Alta call, return `{outcome: 'test'}`.
  7. Alta: read `ALTA_UNLOCK_URL`; it must parse as `https:` on `api.openpath.com` or
     `api.eu.openpath.com` with path `/tokens/cloudKeyUnlockTokens/<token>/use`, else event `error`
     `misconfigured` (failed-precondition). POST with no body, `AbortController` at 6 s, no retry.
     2xx -> event `opened` with `altaStatus` and `latencyMs`, and `lastConfirmedOpenAtMs` is set to
     the open's time. Non-2xx -> `alta-error`; abort ->
     `alta-timeout` (both `unavailable`), the open slot is given back, the event records it.
  8. Never log or return the URL or the token, in any message, including thrown errors and their
     causes (a unit test greps every console call and every thrown message for the token).
- The emulator never calls Alta (review 2026-11-17 server-1, spec-1: an emulator whose
  `.secret.local` lacks the name reads the real link from Secret Manager). Under
  `FUNCTIONS_EMULATOR` (any value but empty, `false` or `0`), step 7 answers 204 when
  `DOOR_FAKE_ALTA === '1'` and `misconfigured` otherwise, with no network call either way. Production
  sets neither. `functions/env.template` carries an `ALTA_UNLOCK_URL` placeholder (for `.env.local`
  and `.secret.local`) and `DOOR_FAKE_ALTA=1`.
- A check (`{check: true}`) reads only `users/{uid}` and `doorConfig/main` unless the mode is `all`
  (spec-6): a family's answer is `off` then whatever its household holds. A press reads everything.
- HttpsError codes: refusals `failed-precondition` (`off`, `no-access`, `under-16`, `paused`,
  `sign-rules`, `guardian-rules`, `not-set-up`, `location-needed`, `too-far`, `not-eligible`,
  `misconfigured`), `resource-exhausted` (`rate-limited`), `unavailable` (`alta-error`,
  `alta-timeout`, `in-progress`), `invalid-argument` (`bad-request`). Each carries plain copy.

### 5.3 `signDoorRules` callable (`functions/portal/door-rules.js`)

No secrets. `{name, termsVersion}` -> `{ok: true, termsVersion}`. Signed in; `users/{uid}` with role
`parent` or `athlete` and a `householdId` (else `not-eligible`); `name` trimmed 2-120 characters
(`bad-request`); `termsVersion === DOOR_TERMS_VERSION` (else `stale-terms`, failed-precondition:
"Reload the app to see the latest rules."). Writes `doorRules/{uid}` whole: `adult` is true for a
parent, and for an athlete when `ageAt(dob, today) >= 18`. Signing grants nothing by itself.

### 5.4 Exports

`functions/index.js` exports `unlockDoor` and `signDoorRules`; `functions/test/check-exports.js`
expects them (27 functions), `unlockDoor: ['ALTA_UNLOCK_URL']`, `signDoorRules: []`.

## 6. Rules (`firestore.rules`)

Add, without touching any other clause:
- `doorConfig/{id}`: read owner/ops. Write owner/ops only for `id == 'main'`, keys within
  `mode, lat, lng, radiusM, openSeconds, updatedAt, updatedByUid`; `mode` in the three values;
  `lat`/`lng` null or numbers in range; `radiusM` int 50..1000; `openSeconds` int 1..30;
  `updatedByUid == request.auth.uid`; `updatedAt == request.time`. No delete.
- `doorPauses/{householdId}`: read owner/ops; create owner/ops with `householdId` matching the id,
  `pausedByUid == request.auth.uid`, `pausedAt == request.time`, optional `note` string <= 200;
  delete owner/ops; no update.
- `doorRules/{uid}`: read when `request.auth.uid == uid` or owner/ops. No write.
- `doorEvents/{id}`: read as in section 4 (list queries must filter on the same field). No write.
- `doorLimits/{id}`: no client access.
- Probes: `scripts/rules-probes/door.mjs`, registered in `scripts/verify-rules.mjs`. At least: a
  parent cannot write any door collection; ops writes a valid `doorConfig/main` and is refused a bad
  mode, a radius of 5000 and a foreign `updatedByUid`; a coach cannot read `doorConfig`; a parent
  reads its own household's event and not another's; an athlete reads its own event only; a parent
  reads its own `doorRules` and not another uid's; nobody reads `doorLimits`.

## 7. App

New code goes outside the grandfathered `hooks/live.js`.

- `data/doorRules.js`: `DOOR_TERMS_VERSION` (equal to the server's; a jest test reads
  `functions/portal/door-decide.js` and compares), `ACADEMY_PHONE = '(612) 234-1644'`,
  `doorCopy(reason)`, `cardShows(reason, canUnlock)`.
- `data/consentTerms.js`: the new line ends the "Who may enter" section of `facilityAccess`.
- `hooks/callables.js`: `callUnlockDoor`, `callSignDoorRules`.
- `hooks/door.js`: `useDoorStatus()` (check on mount, only with live data and outside practice mode;
  recheck after signing), `pressUnlock()` (a fresh `crypto.randomUUID()` per press, the location,
  the call), `currentLocation()` (`enableHighAccuracy: true`, `timeout: 10000`,
  `maximumAge: 30000`; `{fresh: true}`, for the staff screen, `maximumAge: 0`; failures map to
  `location-needed`). Its watchdog is 12 s from when location is allowed (the Permissions API says
  `granted`, or changes to it), and 45 s while the browser may still be asking or cannot say
  (review 2026-11-17 app-3: the permission question never eats into the 12 s).
- `components/door/DoorCard.js`, `HoldToUnlock.js`, `DoorRulesSheet.js`:
  - The card shows when `canUnlock`, or the reason is `sign-rules`, `guardian-rules`, `under-16` or
    `paused`. It is hidden for every other reason, while checking, and on a failed check.
  - Hold to unlock: 1 s hold with a progress ring; release early cancels; no iOS callout or text
    selection; a keyboard and screen-reader path (Enter opens "Unlock the door now?" with Unlock and
    Cancel; Unlock puts focus back on the button). The button is off from press to answer, as
    `aria-disabled` so it keeps keyboard focus; a refusal that switches the card moves focus to the
    card's new message (review 2026-11-17 app-7).
  - Before the first press: "The app checks you're at the academy when you unlock." Staff see no
    location line.
  - Copy by outcome/reason (plain, never generic):
    - opened: "Unlocked - pull the door now." and a countdown of `openSeconds`, then "Didn't open?
      Hold again."
    - coalesced: "Already unlocked - pull the door."
    - test: "Test household - the door was not opened."
    - sign-rules: "Read and sign the door rules once to turn on Unlock." with a **Sign the door
      rules** button that opens the sheet.
    - guardian-rules: "A parent needs to sign the door rules in their own app first."
    - under-16: "Athletes under 16 come in with a parent or guardian."
    - paused: "Door unlocking is paused for your family. Call or text the academy at (612) 234-1644."
    - location-needed: "Turn on Location for this site so the app can check you're at the academy."
    - too-far: "You need to be at the academy to unlock the door."
    - rate-limited: "Too many unlocks for now. Call or text the academy at (612) 234-1644."
    - alta-error, alta-timeout, in-progress, misconfigured: "The door didn't answer. If you heard
      the lock click, go in. Otherwise try once more, or call or text (612) 234-1644."
    - off: "Door unlocking is switched off right now."
    - offline (no network, the SDK's unavailable before any answer): "You're offline - the button
      needs a data connection."
  - DoorRulesSheet: the facility rules from `consentTerms.facilityAccess` (with `SELF_WORDING` for an
    adult athlete login), the typed full name, an "I agree to the door rules" tick, **Sign**. On
    success it closes and the card rechecks. A server refusal shows the server's words; no answer
    at all shows "The door rules were not signed. Check your connection and try again." (app-5).
- Mounts: `ParentDashboard` (above `ConsentHomeCard`) and `AthleteDashboard` (near the top).
- Staff screen `/portal/admin/door` (owner, ops), lazy, reached from a "Facility door" card on the
  admin dashboard:
  - **Who can unlock**: Off / Staff only / Everyone (writes `doorConfig/main.mode`). Everyone stays
    disabled until the academy location is set.
  - Every change is a merge of only the fields it changes, plus the stamp (review 2026-11-17
    rules-1, app-2): two staff screens never undo each other's switch or location. The config is
    read back after each save and when the page comes back into view.
  - **Academy location**: set or not set, and **Use this phone's location** ("Stand inside the
    academy"): a fresh reading, refused when rougher than 75 m ("Too rough a reading ..."), then
    "Save this as the academy's location? Only do this inside the academy." with Save and Cancel
    (app-1, spec-3). **Check this phone's distance** runs the family check on this phone ("This
    phone is about N m from the academy ... A family standing here could unlock."). Radius
    100/200/300/500 m; door open time in seconds.
  - The staff Unlock (same control, no location).
  - **Recent activity**: the latest 50 `doorEvents` (time in Chicago, name, family, outcome, reason,
    distance).
  - **Paused families**: the list with Unpause, and Pause a family (pick an athlete; pauses the
    household). A family another staff member paused meanwhile reads "<family> is already paused."
    (rules-2). The households directory loads only when a family is paused or the search is used
    (app-9).
- Seed and practice modes never call the callables; the card stays hidden there.

## 8. Release (owner)

0. Before `feat/door-button` is merged into develop (review 2026-11-17 spec-2): unlockDoor binds
   `ALTA_UNLOCK_URL`, and a declared secret that does not exist fails EVERY functions deploy (the
   SLACK_FEEDBACK_TOKEN precedent, `functions/env.template`). Run
   `npx firebase-tools functions:secrets:set ALTA_UNLOCK_URL --project rypacad` and paste a
   placeholder such as `not-set-yet`: unlockDoor answers `misconfigured` to it and never opens the
   door. Step 2 replaces it. Also put the template's placeholder line
   (`ALTA_UNLOCK_URL=https://placeholder.invalid/not-a-real-door-link`) in `functions/.secret.local`
   and `functions/.env.local` of the main checkout and every worktree, so no emulator ever reads
   the real link (the emulator never POSTs it either way).
1. In Alta, on "Portal door - DO NOT DELETE": Cloud Key -> Get webhook URL -> Entries: the member door
   only -> end Feb 28 2027 11:59 pm -> Generate links -> copy the **API link**. Do not keep the guest
   link.
2. `npx firebase-tools functions:secrets:set ALTA_UNLOCK_URL --project rypacad`, paste the API link at
   the hidden prompt (a new version over step 0's placeholder). Never in chat or a file.
3. Deploy `functions:unlockDoor,functions:signDoorRules`, then `firestore:rules,firestore:indexes`.
4. Push develop (staging). The test can be done from anywhere (owner 2026-11-17: not at the
   academy, checking the logs): on staging as the owner, Admin -> Facility door -> Staff only (owner
   and ops pass with no academy location set) -> hold Unlock. **A staff Unlock really opens the
   member door** for the open time, wherever the owner is: press it only when the academy is open or
   someone there knows. Then
   `npx firebase-tools functions:log --only unlockDoor --project rypacad` shows
   `unlockDoor: opened uid=... role=owner altaStatus=204 latencyMs=...` (any 2xx), and Recent
   activity says Opened. `unlockDoor: error ... reason=misconfigured` means the secret is still the
   placeholder (redeploy unlockDoor after step 2); `reason=alta-error altaStatus=4xx` means the link
   is wrong or past its end date.
5. Before Everyone, someone inside the academy: Use this phone's location (a fresh reading, refused
   when rougher than 75 m, asked before saving), then at the door Check this phone's distance ->
   "A family standing here could unlock."
6. Everyone. Push develop to main.
- If the link leaks: delete the Cloud Key credential in Alta (it kills every link), make a new one,
  set the secret again, redeploy `unlockDoor`. Off switch: Admin -> Facility door -> Off.

## 9. Not in v1

Parent notice per athlete unlock, App Check, a Slack alert on Alta errors, a household daily cap,
minInstances (measure cold starts on staging first), a "recent opens" list on the family card,
retiring the Nov 5 keys, a reminder before the link's end date.
