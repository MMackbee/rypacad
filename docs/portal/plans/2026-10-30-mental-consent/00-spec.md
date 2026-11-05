# Mental performance consent in the portal — design spec

Drafted 2026-10-30 from Yannick's request (Slack, team group DM, 11:04 CDT: "the
parent/client gets an email/notification that they need to sign the consent/assent
form ... my dashboard will show whether the parent/client have signed the doc before
the next session ... if they already signed it once, they don't have to sign it
again"), Mike's ask for "a tracker for which kids have/haven't signed", and the
owner's ruling that it "can be done in the app, as well as outside of the app".
Revised the same day after a five-reader builder check (workflow wf_35ca73f9-46b:
builder, rules, form coverage, parent UX, codebase fit). Branch `mental/consent`,
worktree `C:\Users\Mac\Desktop\rypacadapp\wt-mental`, cut from `develop` 053caad
(which carries Yannick's notes, athlete pages and contract board, released to
staging 2026-10-29). Ships through staging (rypacad.ryptest.com) to production in
the first week of the season.

The document families sign is **"Ryp Academy Mental Performance Program — Informed
Consent & Service Agreement"**, the FINAL version Mike distributed on 2026-10-30
(`01-consent-form-FINAL.txt` beside this spec is its text, extracted from the
.docx; the .docx lives in the shared Drive under RYP Academy → Operations →
Academy Policy Documents). Mike has sent it to Luke for review, so the text may
still change: see §7 (versions).

## 1. Intent and why

Yannick is a CMPC-track mental performance coach. His Code of Conduct appendix
(Appendix B, "Consent before the first session") requires a signed written consent
from a parent, with the athlete's agreement, before an athlete's first 1:1, and the
athlete's own consent at 18+. The form also records choices the coach must know
before a session: whether audio recording is allowed, where sessions happen, and
(18+) an emergency contact and whether a parent may book or join a session.

Today the form is a Word document with signature lines. Families book Yannick
through Calendly; nothing in the portal asks for, stores or shows this consent, and
a Calendly booking sends no portal email at all (the Calendly webhook writes the
booking as `createdBy: 'system'`, which the booking-confirmed gate skips). Yannick
would have to chase paper from every family that books him, and would not know at
the session whether it was signed or whether he may record.

## 2. Goals, non-goals, anti-goals

Goals
- A family signs the form **in the portal, once per athlete, on a phone, in under
  ten minutes**: the parent's consent plus the athlete's own assent for an athlete
  under 18, or the athlete's own consent at 18+ (form §9/§10 vs §11).
- Every choice on the form is captured, not just a signature: audio recording
  (parent and athlete separately for a minor; the athlete alone at 18+), location
  preference, driving permission, the emergency contact, and for 18+ the
  parent-session permission with the named parent.
- Audio recording and location can be **changed later**, as the form promises
  ("may be changed at any time"), and a minor can withdraw their own recording
  answer without waiting for a parent ("I can say no or change my mind at any
  time", §9). The signature itself is permanent.
- Families are asked **when it matters**, not at every sign-in: when a 1:1 with
  Yannick is booked (email and push with a link, a card on the family home, a line
  on the booking row), the day before an unsigned session, from a standing place
  in the portal, and whenever Yannick presses "Send a reminder".
- Yannick's Athletes list and athlete page show, per athlete: **Signed** (date and
  by whom, plus the recording and location choices), **Not signed**, **Needs 18+
  signature**, or **No date of birth**; athletes with an upcoming 1:1 and no
  signature stand out. The owner and ops see the same status.
- Nothing is asked again once signed, with one exception the form itself makes:
  an athlete who signed as a minor and turns 18 during the program signs §11
  before their next session.
- A family that signs on paper is not stuck: ops or the owner can record a paper
  signature with its date.
- The automatic notices sit behind a server-side switch, so nothing reaches a real
  family until the owner turns it on after the production push (staging shares
  the production backend).

Non-goals
- Blocking a Calendly booking. Calendly is outside the portal; an unsigned athlete
  shows as such on Yannick's screens and he decides at the session.
- PDF generation or an e-signature vendor. The signature is a typed legal name with
  a server timestamp and the signer's account, the shape the research answer
  already uses (`recordedAt == request.time`, `recordedBy == uid`).
- Section 1 of the form (names, date of birth, parent phones and emails). The
  portal already holds these on the household and athlete and shows them at the top
  of the flow; nothing is retyped. The emergency contact is the exception: it is
  asked, because most households do not carry one the family can see (§4.2 step 1).
- A second parent's signature. One parent signs; the form's second line is "if
  applicable".
- The form's "tell Yannick" switches that have no checkbox: declining or resuming
  the attendance-and-goals updates (§6, §10), athlete-approved extra sharing (§6),
  and the 18+ written authorisation for parent updates (§11). These stay outside
  the app in v1 (Yannick keeps them in his intake note); revisit after the first
  month.
- A recorded "declined" assent. If the athlete will not agree, nothing is written,
  the status stays Not signed and the nudges continue; revisit if it happens.
- Per-session location changes. The record keeps a standing preference; a change
  for one session is arranged with Yannick directly, and his card says so.
- Changing anything about the four enrollment consents or the research answer.

Anti-goals (what would make this a failure even if it works)
- A sign-in gate in front of every family in launch week. The research question
  already fires once at sign-in; this form is long and has choices, and only
  families who book Yannick need it.
- The 18+ athlete's record (emergency contact, who may attend) or any family's
  recording choice readable by coaches or by other families, or a parent granting
  themselves a session an adult athlete never agreed to.
- A family that signed being asked again because the text changed a comma, or
  because they booked a second session.
- A signature recorded without the full text having been on screen.
- A consent email reaching a real family before the production app can open the
  link.

## 3. Who signs, and when they are asked

Who: the form applies to "athletes and parents/guardians who use tokens for
sessions with Yannick" (form, purpose paragraph). The portal asks for it per
**athlete**, whenever that athlete has a confirmed `mental` booking, whether the
attendee is the athlete or the parent (bookings carry `attendee: 'athlete' |
'parent'`; parent sessions exist only alongside athlete sessions, form §2, so the
athlete's consent is the one that matters).

**The calendar date for "18 today" and "16 today" is the UTC date**, exactly as the
research consent does it (`hooks/researchConsent.js`: the rules count 18 from UTC
midnight of the birthday, so the client feeds `isAdultOnDate` the UTC date). The
flow's branch choice, the 16+ driving gate, the re-sign eligibility, the status
function and the functions mirror all use it; the Jest seam test sits at UTC
midnight (about 18:00/19:00 Chicago the evening before). An athlete with no date
of birth, or a malformed one, cannot start the flow ("Add Ava's date of birth
first", an ops/owner edit), the rules refuse the athlete arm and `adult == true`,
and Yannick's row shows "No date of birth". Before shipping, report how many
athletes with mental bookings lack a dob.

Signer, by the athlete's age on the day of signing:
- **Under 18:** the household's parent signs §10 on their own login; the athlete
  gives the §9 assent in the same sitting on the parent's phone ("Hand the phone
  to Ava" — the athlete reads §9 in their own words, picks their recording answer,
  ticks "I agree to take part" and types their name). At any age the athlete types
  their own name with the parent present; under 13 the parent may tick "I read
  this aloud to Nico", recorded as `assent.readAloud`. The record keeps the
  parent's account as the signer and the athlete's typed name as the assent.
  (Pending Yannick: whether his AASP standard needs anything more; see §10.)
- **18 or older:** the athlete signs §11. On their own login when one is
  **claimed** (a `users` doc with `athleteId == id`: the 18+ member who created
  their own household, or a child login that has been claimed; an unclaimed invite
  does not count). Then the parent's screen says "Max signs this on his own login",
  with no button, and every notice about it goes to Max alone. Without a claimed
  login, the parent's screen says "Max is 18 or older and signs for himself" and
  hands the phone over: the hand-over confirm sits between step 1 and step 2, so
  Max reads and signs on his own screen and the parent takes the phone back at
  Done. The record then has the parent's account as `signedBy` and `signer.role:
  'athlete'` with Max's typed name.
- **Turning 18 after signing as a minor:** the status becomes "Needs 18+
  signature" on the birthday (derived, never written); the next nudge and
  Yannick's screens say so; recording is not permitted until the re-sign; the §11
  flow records `adultSignature` on the same document and re-answers the choices as
  an adult, the minor-era record kept underneath in the history. Yannick
  countersigns again (his earlier countersign shows as history).

When they are asked (every path leads to the same flow, §4.2):
1. **A 1:1 is booked** (the Calendly webhook, or an in-app mental booking when no
   Calendly URL is configured): the existing `onBookingCreated` trigger gains its
   own pure gate, `shouldNoticeConsentNeeded`, evaluated **before** the
   booking-confirmed gate (which returns early for every Calendly booking):
   `type == 'mental'`, `status == 'confirmed'`, not a test household or athlete,
   athlete not Signed, switch on. One `consent-needed` notice goes out, naming the
   athlete and the session date, with the portal link. Keyed on athlete and
   session date, so a same-day reschedule sends nothing new.
2. **The day before** an unsigned session: the daily 17:00 reminder job (which
   today skips Calendly bookings because Calendly sends its own reminders) checks
   the type before that skip and sends `consent-reminder` for a `mental` booking
   dated tomorrow whose athlete is still not Signed. One per athlete per date.
3. **Yannick presses "Send a reminder"** on the athlete page, after a confirm
   sheet naming the athlete and family: the same notice, at most once a day per
   athlete (duplicate when any `consent-needed` ledger row for the athlete was
   created today, including a booking-triggered one). This also covers the five
   1:1s already booked before this ships.
4. **The family goes looking:** the family screen's athlete card carries a
   "Mental performance consent" line, the family home shows a card while any
   athlete with an upcoming 1:1 is unsigned, and the booking row for a 1:1 says
   "Consent needed".
5. **New families at sign-up are not asked.** They meet path 1 when they first
   book Yannick. (Adding a fifth card to registration would put a ten-minute form
   in front of every new family for a session most never book.)

Who receives the notices: for a minor, the household's parents only, never the
child's own login (it would be told to sign something only the parent can sign).
For an 18+ athlete with a claimed login, that login only; otherwise the household's
parents. The `consent-signed` receipt follows the same audience. The two
automatic notices' email is locked on the way billing email is (one line in
`channelAllowed`, mirrored in `parent.js`); push follows the `schedule`
preference. For `attendee: 'parent'` the copy reads "Before your session with
Yannick about Ava".

## 4. What the family sees

### 4.1 Entry points
Routes `/portal/consent/mental` and `/portal/consent/mental/:athleteId` admit roles
`parent` and `athlete`. An under-18 athlete login sees "Your parent signs this"
everywhere and no action.
- `ParentDashboard` (`/portal/family`): a card above the athlete cards while any
  household athlete is Not signed or Needs 18+ signature **and** has a confirmed
  `mental` booking in the future: "Sign Yannick's consent for Ava before her session
  on Thu Nov 5" → the flow. No card when nothing is booked (the family screen line
  is enough then).
- The athlete card on the family screen and `AthleteDetail`: one line, "Mental
  performance consent · Not signed · Sign now" / "Signed Oct 30 by Dana ·
  Change choices" / "Needs Max's 18+ signature · Sign now" / "Signed Oct 30 ·
  Max manages this" (adult with a claimed login: no Change choices for the parent)
  / "Waiting for Ava's agreement · Continue" (a draft, §4.2 step 5) / "Draft
  expired · Start again".
- `Reservations` (`/portal/reservations`, the parent's bookings screen; parents
  have no schedule tab) and `MySchedule` (`/portal/schedule`, the athlete's own
  login): a `mental` booking row whose athlete is not Signed gets a "Consent
  needed · Sign" line under the existing Calendly-managed copy (minor's login:
  "Your parent signs this").
- `AthleteDashboard` (`/portal/home`, the athlete's own login): the same line for
  the 18+ athlete.
- The notice link opens `/portal/consent/mental`, which lists the household's
  athletes with their status and opens the flow for the one tapped (a household
  with one athlete goes straight in). After Done, the list offers the next unsigned
  athlete; each athlete is one full pass (the form is per athlete, §10 "the athlete
  named above"), with no shared reading of §2–§8.

### 4.2 The flow — `/portal/consent/mental/:athleteId`
Phone-first, five screens, a progress line at the top ("Step 2 of 5"), the back
link available until the hand-over, nothing saved until the last step succeeds.

1. **Who this is for.** The athlete's name, date of birth and age, the signing
   parent's name (from `users/{uid}.displayName`, else the auth display name, else
   the household guardian's name; the typed name at step 4 is what the record
   keeps) and email, and who signs: "Dana signs as Ava's parent, then Ava agrees" /
   "Max is 18 or older and signs for himself". **Emergency contact** (name, phone,
   relationship optional): prefilled from `households.emergencyContact` when the
   household has one (only Sprint-20 self-sign-up households do; approved
   households keep it in `private/medical`, which no family login can read; the
   staging test family has none), otherwise blank. Required at 18+; for a minor
   "Same as parent" is allowed. Stored in `choices.emergencyContact` for every
   record. The form's purpose paragraph closes the screen.
2. **The agreement.** Form §2–§8 verbatim, each section a card with its heading,
   in the second person exactly as written. Not collapsible: the text is the
   consent. A sticky "Continue" at the bottom; the step is complete only after the
   last section has scrolled into view (the button says "Scroll to the end to
   continue" until then). In the adult-on-parent-login variant the hand-over
   confirm ("Hand the phone to Max") comes before this step.
3. **Your choices.**
   - Location preference: Academy quiet area (Option A) / Eden Prairie conference
     room (Option B) / Online (Option C) / Decide session by session. Required.
   - Driving permission (minor flow only, shown only when the athlete is 16 or
     older today): "My athlete has my permission to drive themselves to and from
     Option B sessions when other occupants are present" Yes / No. Required when
     shown. Not asked under 16 (`driving: null`, read as no); once the athlete
     turns 16 the family line and Yannick's card say "Driving permission not
     answered · Change choices", with no automated nudge.
   - Audio recording of athlete sessions: I consent / I do not consent, with the
     form's "may be changed at any time". Required.
   - 18+ flow only: "A parent/guardian may book a parent session or join a joint
     session" I give permission / I do not; when yes, the parent's name (free
     text, prefilled with the household guardian's name in a parent-created
     household, blank in a self-managed one).
4. **Signature.** Minor flow: §10's acknowledgements as a read-only list, one
   checkbox "I have read and agree to all of the above", the typed full legal name,
   and the line "Typing your name signs this agreement for Ava, dated today." 18+
   flow: §11's four paragraphs (sole client; parent and joint sessions only with
   written permission; the turn-18 rule; this form governs the academy program)
   and its closing paragraph, the checkbox "I confirm I am 18 or older and agree",
   the typed name. The 18+ flow saves here.
5. **Athlete's agreement** (minor flow only). The hand-over confirm first: "Hand
   the phone to Ava — your answers are locked"; from here the back link returns
   only to this confirm, and unlocking re-shows step 4 to the parent. Then §9 in
   full in the athlete's voice, the athlete's recording answer (I agree / I do not
   agree), the checkbox "I agree to take part in mental performance coaching", the
   typed name (soft-checked against the athlete's first name: a mismatch warns,
   never blocks), and under 13 the parent's optional "I read this aloud to Nico"
   tick. "Done" saves everything in one write. If the athlete is not there, "Ava
   isn't here" keeps the parent's part on the device (localStorage
   `ryp.mentalConsent.{uid}.{athleteId}` = `{ v, version, savedAt, choices,
   parentName }`, the registration draft precedent) and the family line reads
   "Waiting for Ava's agreement · Continue"; nothing is recorded, so the status
   stays Not signed, the nudges continue and Yannick sees that. On resume the
   record is re-read first (exists → Signed, draft deleted), then the version and
   adulthood are re-checked (changed → restart at step 2 with a one-line reason),
   and step 4 is always shown again so the typed name is re-confirmed on the day
   it is recorded. A draft expires after 7 days ("Draft expired · Start again").

Done screen: "Signed · Oct 30. Yannick will see this before Ava's session. You can
change the recording or location choice any time from Ava's card." If the save is
refused because a record already exists (another parent, or Max on his own login,
signed meanwhile), the record is re-read and the Done screen shows its Signed form
("Already signed by Dana on Oct 30"), the draft deleted. A `consent-signed`
receipt goes to the audience in §3.

The audio answers are recorded separately (parent's and athlete's); Yannick may
record only when both are yes (form §9: "only if my parent and I both say yes").

### 4.3 Changing choices later
"Change choices" on the athlete card opens step 3 alone (location, driving where
it applies, audio; the emergency contact; 18+: the parent-session permission and
name). Saving appends the previous `{ choices, assent }` to the record's history
and stamps who changed them. The signature is never re-done here.

- A minor's own recording answer (`assent.audio`) is changed to **yes** only by the
  hand-the-phone step (the parent's login, the athlete typing); it can be
  **withdrawn** (set to no, never back to yes) by the athlete's own login or by
  Yannick (role `mental`) when an athlete tells him at a session, stamped with who
  withdrew it; the card then reads "Recording: no (Ava withdrew Nov 12)".
  (Pending Yannick and the owner; see §10.)
- For an **adult** record, the §11 fields (`parentSessions`, `parentName`,
  `emergencyContact`, `audio`) change only with the athlete's typed confirmation
  (`adultConfirm: { name, at == request.time }`) in the same write, whoever holds
  the phone; location may be changed by the household without it. Once a claimed
  athlete login exists, the parent's account is refused every create and update on
  that record. (Pending the owner and Yannick; see §10.)

## 5. What Yannick, the owner and ops see

- **Athletes list** (`/portal/mental`): a trailing line per row — "Signed" /
  "Not signed" / "Needs 18+" / "No date of birth". Rows with a future 1:1 and no
  signature sort to the top under a "Needs consent before a session" label; a
  chip filter "Needs consent" shows only those. The existing Intake/No intake
  line stays.
- **Athlete page** (`/portal/mental/:athleteId`): a **Consent** card between
  Intake and Sessions: "Signed Oct 30 by Dana Whitfield (parent) · Ava agreed ·
  Recording: yes (both) · Location: Eden Prairie · Driving: no · Emergency
  contact: … · Version 2026-10-30 · Countersigned Oct 31" with:
  - "Countersign" (until he has): records his acknowledgement, the form's
    "Yannick Artigolle (Signature)" line. Status copy becomes "Complete".
  - "Send a reminder" (while Not signed / Needs 18+): the confirm sheet, then the
    notice now; "Sent today" when the duplicate guard answers.
  - "Recording withdrawn" (minor, while `assent.audio` is yes): the one-way
    withdrawal above.
  - 18+: the parent-session permission and name; the contact line shows the
    athlete's login email (when any) and the consent's emergency contact instead
    of the household guardian.
  - Needs 18+: "Recording: needs 18+ signature" (not permitted until re-signed).
  - Paper: "Signed on paper, recorded by Ops on Nov 2"; blank choices render "not
    transcribed" (recording reads as no, location as session by session).
- **Owner and ops** (the staff households directory and the athlete admin card):
  the same status line and, for ops and the owner only, "Record a paper
  signature": the date signed, which section (§10 with the athlete's assent name
  and audio answer, or §11), the signer's name, and the choices as far as the
  paper shows them. The owner alone can correct a paper record (dates, names,
  section, version; prior values appended to history). A portal record is never
  edited by staff; a correction there is an Admin SDK job.
- **Coaches** see nothing of it.

## 6. Data and rules

### 6.1 `mentalConsents/{athleteId}` — one document per athlete
Its own top-level collection, not a key on `athletes/{id}` (whose document the
assigned coach can read), so the emergency contact and every family's choices stay
off coach-readable documents and the rules branch is self-contained. Absent ==
never signed.

| Field | Type | Notes |
|---|---|---|
| `athleteId`, `householdId` | string | `athleteId` == the path; `householdId` == the athlete document's `householdId` (pinned by `athleteData()` at create, never from the body alone) |
| `version` | string | the form version signed, `'2026-10-30'` for FINAL (§7); format-checked only |
| `method` | `'portal' \| 'paper'` | |
| `signedAt` | timestamp | portal: `== request.time`; paper: the date on the form, `<= request.time` and on or after 2026-01-01 |
| `signedBy` | string | uid of the account that recorded it (parent, athlete, or ops/owner for paper) |
| `signer` | map | `{ role: 'parent' \| 'athlete', name: string }` — the typed legal name; `role` is `'athlete'` iff `adult` |
| `adult` | boolean | true when §11 was signed (the athlete was 18+ that UTC day) |
| `assent` | map \| null | minor: `{ name, audio: boolean, at, readAloud: boolean, withdrawnBy: string \| null }`; adult: null |
| `choices` | map | `{ location: 'A' \| 'B' \| 'C' \| 'any', audio: boolean, driving: boolean \| null, emergencyContact: { name, phone, relationship: string \| null }, parentSessions: boolean \| null, parentName: string \| null, updatedAt, updatedBy }` — minor: `parentSessions`/`parentName` null; adult: `parentSessions` boolean, `parentName` set iff true, `driving` null; paper: `location` may be null |
| `adultConfirm` | map \| null | `{ name, at }` — the adult athlete's typed confirmation of the latest §11-field change (§4.3) |
| `adultSignature` | map \| null | `{ signedAt, signedBy, name, version }` — the §11 re-sign after a minor-era signature |
| `countersign` | map \| null | `{ at, by }` — Yannick's acknowledgement; reset to null by a re-sign (the old one goes to history) |
| `history` | array | earlier `{ choices, assent, countersign? }` snapshots, oldest first, appended on every change |

Lengths: names ≤ 120, phone ≤ 40, relationship ≤ 60.

Status (`consentStatusFor(athlete, record, todayISO)` in
`frontend/src/portal/data/mentalConsent.js`, mirrored byte-for-byte in a new
`functions/portal/mental-consent.js` with a CHANGE ONE, CHANGE BOTH header, the
`membershipAllowsBooking` precedent): no dob → `no-dob`; no record → `unsigned`;
record with `adult: true` or an `adultSignature` → `signed`; record signed as a
minor and the athlete is 18+ today → `needs-adult`; otherwise `signed`. A paper
record counts as signed. Recording allowed == status `signed` and (`adult` or
`adultSignature` ? `choices.audio` : `choices.audio && assent.audio`).

Test households: the functions skip the nudges when **either** `household.test`
or `athlete.test` is true (the Monday check-in email reads the household mark, the
rules read the athlete mark; `mark-test-household.mjs` sets both). Test athletes
still show on Yannick's list and can sign on staging.

### 6.2 Rules (additive; nothing existing changes)
A new top-level helper `adultOn(a)` beside `athleteData()`, with the research
branch's Feb-29-safe body over `a.get('dob', null)` (the existing `adultRecord()`
is scoped inside `match /athletes` and reads the athlete's own `resource`, so it
cannot be reused from here; it stays untouched this release). Shorthands below:
`d` = `request.resource.data`, `a` = `athleteData(athleteId)`, `changed` =
`d.diff(resource.data).affectedKeys()`.

- **read:** `(me().role == 'parent' && me().householdId == resource.data.householdId)
  || (me().role == 'athlete' && me().athleteId == athleteId) || me().role in
  ['mental', 'ops', 'owner']`, role test first (athlete logins also carry
  `householdId`; staff docs carry null).
- **create (portal), common:** `d.athleteId == athleteId && d.householdId == a.householdId
  && d.method == 'portal' && d.signedAt == request.time && d.signedBy ==
  request.auth.uid && d.version.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}') &&
  d.adult == adultOn(a) && d.countersign == null && d.adultSignature == null &&
  d.adultConfirm == null && d.history == [] && d.choices.updatedAt == request.time
  && d.choices.updatedBy == request.auth.uid && d.choices.location in ['A','B','C','any']`,
  the field set exact, and one of two shapes by `d.adult`: `minorShape` (`signer.role
  == 'parent'`, `assent` = `{ name 1..120, audio bool, at == request.time, readAloud
  bool, withdrawnBy null }`, `choices.parentSessions == null && parentName == null`,
  `driving` bool or null, `emergencyContact` a map) or `adultShape` (`signer.role ==
  'athlete'`, `assent == null`, `emergencyContact` with name and phone, `parentSessions`
  bool, `parentName` a string iff `parentSessions`, `driving == null`).
  - **parent arm:** `me().role == 'parent' && me().householdId == d.householdId`,
    and for `d.adult` no claimed athlete login exists
    (`!exists(/users/$(a.loginUid))` is not expressible: the claimed login is
    found by the client, so the rule instead refuses the parent arm when the
    athlete document carries `loginClaimedBy` — **builder: confirm which field the
    claimed-login state lives on (`hooks/index.js` `login: { state, claimedAt }`)
    and pin the rule to it; if nothing on the athlete doc says "claimed", add the
    one boolean the claim function already knows, written by `claimInvite`**).
  - **athlete arm:** `me().role == 'athlete' && me().athleteId == athleteId &&
    adultOn(a)`; `d.adult == true` follows. No `households.createdBy` test (a
    claimed child login that turned 18 is exactly the §11 case).
- **create (paper):** `me().role in ['ops', 'owner'] && d.method == 'paper' &&
  d.signedBy == request.auth.uid && d.signedAt is timestamp && d.signedAt <=
  request.time && d.signedAt >= timestamp.date(2026, 1, 1)`, the same nested shapes
  with `adult` stated by ops, `assent.at` defaulting to `signedAt`, `location`
  nullable, `history == []`; ops may also record a paper §11 re-sign as
  `adultSignature` with a past `signedAt`.
- **update, choices (family):** `changed.hasOnly(['choices', 'history', 'assent',
  'adultConfirm'])`, `d.choices.updatedAt == request.time && d.choices.updatedBy ==
  request.auth.uid`, `d.history == resource.data.get('history', []).concat([{ choices:
  resource.data.choices, assent: resource.data.assent }])` (the research `concat`
  form; the client resends the prior array), the per-branch shape kept. Arms: the
  parent by stored `householdId` for a minor record, or for an adult record with
  no claimed login; the athlete's own login by `athleteId`. For an adult record,
  any change to `audio`, `emergencyContact`, `parentSessions` or `parentName`
  requires `d.adultConfirm == { name: string 1..120, at: request.time }`; a
  location-only change does not. When `assent` changes: parent arm only,
  `resource.data.adult == false`, `adultSignature == null`, `assent.name` unchanged,
  `assent.audio` bool, `assent.at == request.time`, `withdrawnBy == null`.
- **update, recording withdrawal:** `changed.hasOnly(['assent', 'history'])`,
  `resource.data.assent.audio == true && d.assent.audio == false && d.assent.at ==
  request.time && d.assent.withdrawnBy == request.auth.uid`, everything else in
  `assent` unchanged, history appended; arms: the athlete's own login, or role
  `mental`. Never back to true here.
- **update, 18+ re-sign:** `changed.hasOnly(['adultSignature', 'choices', 'history',
  'countersign'])`, `resource.data.adult == false && resource.data.adultSignature ==
  null && adultOn(a)`, `d.adultSignature == { signedAt: request.time, signedBy:
  request.auth.uid, name 1..120, version }`, `d.choices` in `adultShape` with the
  update stamps, `d.countersign == null`, history appended with `{ choices, assent,
  countersign }`; arms: the parent by stored `householdId` (hand-the-phone) or the
  athlete's own login.
- **update, countersign:** role `mental`, `changed.hasOnly(['countersign'])`,
  `resource.data.countersign == null`, `d.countersign == { at: request.time, by:
  request.auth.uid }`.
- **update, paper correction:** role `owner`, `resource.data.method == 'paper'`,
  `changed.hasOnly(['signedAt', 'signer', 'adult', 'assent', 'version', 'choices',
  'history', 'signedBy'])`, `d.signedBy == request.auth.uid`, history appended.
- **delete:** nobody.
- `verify-rules`: a new `scripts/rules-probes/mental-consent.mjs` exporting
  `taskMentalConsent`, imported and called after `taskMental` in `runPass`; it
  seeds its own `mc-parent`, `mc-kid-login`, `mc-adult-login`, `mc-mental`,
  `mc-ops`, `mc-owner` users and athletes with dobs eighteen years before the UTC
  date ± 1 day, probes every allow and refusal above (coach read, other-family
  read, a minor's claimed login creating, a parent creating for another household's
  athlete id with their own household in the body, a minor record without assent,
  an adult record with one, `adult` not matching the dob, countersign by ops,
  countersign twice, a parent flipping an adult's `parentSessions` without
  `adultConfirm`, withdrawal back to true), and deletes everything in `finally`.

The additive check: the rules baseline is **`develop`** (904fd1f is what
production runs since 2026-10-29), not `main` (against `origin/main` the file
already differs by hundreds of lines). The gate is `git diff develop --
firestore.rules` showing additions only, plus the full two-pass `verify-rules`.
Phil's Task 28 (dropping the kept diagnostics rules) and the unused `inRange`
cleanup wait until after this release.

### 6.3 Functions
All new server code lives in `functions/portal/mental-consent.js` (`lib.js` is at
496 lines): the status mirror, the gates, the callable body and the trigger body;
`functions/index.js` only wraps and exports. `functions/test/check-exports.js`
gains `requestMentalConsent` and the `mentalConsents` trigger (both with
`MAIL_SECRETS`), count 20. Copy builders go in `notices.js` if it stays under 500
lines, else in the new module. No `firestore.indexes.json` change: the job rides
the existing `bookings (status, date)` composite, the family reads one equality,
staff read the collection unfiltered, the functions read by id.

- **The switch:** `config/mentalConsent { notices: boolean, enabledAt }`, the
  `config/contract` shape (owner-writable), read by the trigger's consent branch,
  the job's consent branch and the callable; each answers `disabled` while false.
  `scripts/set-mental-consent-flag.mjs` is `set-contract-flag.mjs` cloned. The
  receipt trigger and the rules are not gated (only the test family can sign
  before the production app is live). The owner turns it on right after
  `develop:main`.
- `onBookingCreated`: `shouldNoticeConsentNeeded(booking, athlete, household,
  record, config)` in `notify-gates.js`, evaluated before the booking-confirmed
  gate in its own try/catch, regardless of `source` or `createdBy`; sends
  `consent-needed` (`category: 'schedule'`, `subjectKey: 'consent:' + athleteId +
  ':' + booking.date`). Copy: "Before Ava's session with Yannick on Thu, Nov 5,
  please sign the mental performance consent: https://portal.rypacademy.com/portal/consent/mental"
  (emails are plain text; the push opens `LINKS[kind]`).
- `runSessionReminders`: before the Calendly skip, for a `mental` booking dated
  tomorrow whose athlete is not Signed, `consent-reminder` (`subjectKey:
  'consent-reminder:' + athleteId + ':' + date`); the summary gains `consent` and
  `consentDuplicate`; `jobs.test.js` gets a fake-store case for the Calendly skip
  plus the consent branch; `verify-notifications` is re-run on the emulator.
- New callable `requestMentalConsent({ athleteId })` (v1 `onCall`, `runWith({
  secrets: MAIL_SECRETS })`, the caller's role read from `users/{uid}`): sends
  `consent-needed` with `subjectKey: 'consent:' + athleteId + ':' + todayISO`,
  answers `duplicate` when any `consent-needed` ledger row for the athlete has
  `createdAt` today (one query on `notifications` by `athleteId`), and refuses with
  `HttpsError` details `reason` `'not-mental' | 'already-signed' | 'test-household'
  | 'disabled'`. Called through `hooks/callables.js` `callRequestMentalConsent`.
- New trigger on `mentalConsents/{athleteId}` create with `method == 'portal'`:
  `consent-signed` receipt to the §3 audience ("Thanks — Ava's mental performance
  consent is signed. You can change the recording or location choice any time from
  Ava's card in the portal."; the change-choices sentence is dropped for an adult
  record sent to a household). No notice for a paper record.
- `notify.js`: the three kinds → `LINKS` `/portal/consent/mental`; `consent-needed`
  and `consent-reminder` email locked on in `channelAllowed` (mirrored in
  `parent.js` `lockedChannels` and its footnote). Recipients: `athleteId` null on
  the send for a minor so the child login is never addressed, the athlete id kept
  in `subjectKey` and the ledger; the claimed adult login addressed directly.
- `docs/portal/DATA-MODEL.md` gains a `mentalConsents` section, the three notice
  kinds and ledger ids, the `config/mentalConsent` doc and the test-mark rule.

## 7. Versions of the text

The form text lives in `frontend/src/portal/data/mentalConsentTerms.js` as
`{ version: '2026-10-30', purpose, sections: [{ id, heading, paragraphs }] }` for
the purpose paragraph and §2–§8, plus `ASSENT_POINTS` (§9's bullets),
`PARENT_ACKNOWLEDGEMENTS` (§10's bullets), `ADULT_TERMS` (§11's four paragraphs)
and `ADULT_CLOSING` (§11's closing paragraph), each a verbatim copy of
`01-consent-form-FINAL.txt`; a unit test diffs the module against that file so
the two cannot drift. A later revision from Luke is a new version string and text;
families who signed an earlier version are **not** asked again (the record keeps
the version they signed; a cached older bundle correctly writes the version it
showed), unless Yannick and the owner say a change is material, in which case the
status rule gains "signed an older version than X" → Not signed for that athlete
set. The owner approves the copy before it goes in; the module is the academy's
single copy, like `consentTerms.js`.

One consequence to decide: the form carries Yannick's mobile number (§8). The
portal's JavaScript bundle is public, so the number would be readable by anyone
who fetches it. Either keep it (it is also on the paper form every family gets) or
show the email address only in the app.

## 8. Seed, harness, tests, staging

- Seed mode (`isLive() === false`, `data/seed.js` `mentalFixtures`): jordan signed
  as a minor (assent yes, audio yes/yes, location B, driving no, countersigned);
  reese added to the fixtures with a confirmed mental booking at today+7 and no
  record (so the family card, the booking line and Yannick's "Needs consent" row
  all appear); a **new 18+ fixture athlete** (an 18+ Parker sibling; no 18+ athlete
  exists in either seed today and re-aging sage-parker would move her tournament
  bracket and assessment fixtures) signed §11; nico untouched. The emulator seed
  (`scripts/seed-firestore.mjs`) writes the same; its printed total and the
  `verify-rules` PASS count are figures to re-record, not tests.
- `StatesHarness`: the flow's five steps, the 18+ variant and the
  adult-on-parent-login hand-over, the waiting-for-assent state, the Consent card
  in each status, the paper sheet (three to five `SCREEN_STATES` entries).
- Frontend structure: `hooks/mentalConsent.js` (re-exported from `hooks/index.js`;
  `MENTAL_CONSENT_KEY` bumped on every write and added to `useMentalAthletes` and
  `useMentalAthlete` deps, with the record joined into both payloads); screens
  behind loaders with warm-list entries; a `components/consent/` folder
  (`ConsentLine`, `ConsentHomeCard`, `ConsentBookingLine`, `ConsentCard`,
  `PaperSignatureSheet`), since `AthleteDashboard` (508 lines), `AdminDashboard`
  (496) and `ParentDashboard` (482) cannot grow in place. Reads: a parent one
  `where('householdId', '==')` query, an athlete login `getDoc`, staff `getDocs`.
- Jest: the status function (minor, adult, the UTC birthday seam, no dob, paper,
  older version, recording-allowed), the flow's gating (no save before the last
  step, scroll-to-end, required choices, driving only at 16+, the hand-over lock,
  the draft resume rules and expiry, the already-exists path), the family lines
  and cards, Yannick's list sort and filter, the athlete page card and buttons,
  the changing-choices and withdrawal write shapes. Functions: the gates
  (including the switch and both test marks), the three notices, the callable's
  role, duplicate guard and refusals, the receipt trigger, `check-exports`.
- Staging walk (the RYP Test Family; test athletes can sign but are never
  nudged): Yannick presses "Send a reminder" on Ava **before** anyone signs and
  sees it refused (test household, or disabled while the switch is off); the test
  parent signs for ryp-test-ava (minor, assent on the same phone, "Ava isn't here"
  once to see the draft); ryp-test-max signs §11 by hand-the-phone (he has no
  login); Yannick sees both, countersigns, records Ava's withdrawal; the parent
  changes Ava's location; the owner records and corrects a paper signature. The
  two automatic notices are exercised on the emulator (`verify-notifications`),
  not on staging.
- Yannick's staging test guide (a published artifact generated from the
  scratchpad, not a repo file) gains a section for this after the merge; Phil's is
  untouched.

## 9. Rollout

1. Plan (`01-plan.md`) from this spec; build on `mental/consent` with the
   worktree's own emulator (ports 8081/9100/5002, `firebase.mental.json`).
2. Gate: jest, functions tests (`check-exports` count 20), `verify-rules` two
   passes, seed; `git diff develop -- firestore.rules` additive.
3. Merge to `develop` → staging; rules deploy, functions deploy (`onBookingCreated`
   and `sessionReminders` updated, `requestMentalConsent` and the `mentalConsents`
   trigger created), push `develop`. The switch stays off: no real family can
   receive a notice.
4. The owner and Yannick walk the staging section of his guide; then
   `develop:main`.
5. Right after the production push the owner runs
   `node scripts/set-mental-consent-flag.mjs --prod --on --yes`; Yannick presses
   "Send a reminder" for the athletes already booked; families who sign on paper
   in the meantime are recorded by ops.

## 10. Decided here, and left to the builder

Decided (my calls; overturn any of them):
- One parent signature. The form's second line is optional.
- Yannick countersigns in the app with one tap; nothing is incomplete without
  it, but the record then matches the paper form's last line.
- Ops and the owner can record a paper signature; the owner alone corrects one.
- No nudge at sign-up; the first 1:1 booking is the first ask.
- A text revision does not re-ask families by default.
- The automatic notices sit behind `config/mentalConsent.notices`.
- The emergency contact is asked for minors too, "same as parent" allowed.
- The UTC date decides 18 and 16, matching the rules and the research consent.

Left to the builder: component layout within the existing `PhoneFrame`/`Card`
system; whether the §2–§8 cards reuse `ConsentInfoSheet`'s section renderer;
exact copy of the three notices beyond the sentences above; the scroll-to-end
mechanism; the exact field the parent arm reads for "a claimed login exists"
(§6.2); the callable's name if a better one fits the `functions/index.js`
conventions.

**Owner approval 2026-11-05: "go with your recommendations on the consent form".** Every
option below is settled as recommended: (1) the athlete types their own name on the parent's
phone, with the read-aloud tick under 13; (2) once an 18+ athlete has a claimed login the
parent's account can neither sign nor change their record; (3) a minor's own login and Yannick
can set the athlete's recording answer to no, never back to yes; (4) Claude's call, as no
option was recommended: **email only** - the in-app text and every notice say "contact Yannick
at yannick@rypgolf.com" and his mobile number appears nowhere in the repository (public on
GitHub), the bundle or the notices; (5) it rides the next `develop:main` once staging is
checked, aiming before the first portal-booked 1:1 that needs it (Thu Nov 12).
The plan is built on develop 2e844de (Calendly held sessions `unresolved: true` and the
Nov 4 booking follow-ups landed after this spec was written).

Open for the owner and Yannick (the plan assumes the recommendation in each):
1. **Assent on the parent's phone.** The athlete types their own name at any age
   with the parent present, plus an optional "read aloud" tick under 13. Or does
   Yannick's AASP standard need the assent from the athlete's own account, or a
   parent-attested assent for young athletes (the research consent's "I've talked
   about this with Nico, and they agree too")?
2. **Who controls an adult athlete's record.** Recommendation: once the 18+
   athlete has a claimed login, the parent's account can neither sign nor change
   anything on it; without a login, changes to the §11 fields need the athlete's
   typed confirmation whoever holds the phone, and location alone can be changed
   by the household. The alternative is the household changing anything, with the
   account recorded.
3. **Withdrawing recording.** Recommendation: a minor's own login and Yannick can
   both set the athlete's recording answer to no (never back to yes). The
   alternative is the parent's hand-the-phone step only.
4. **Keep the mobile number** in the in-app text (§7), or email only?
5. **Timing:** this rides the next `develop:main` after the current staging round
   is approved, or waits a week.
