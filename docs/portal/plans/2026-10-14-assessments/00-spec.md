# Physical Performance Assessments — design spec

Status: draft for review by the owner (Makel) and Phil Herder. Branch `assessments/v1.2`.
Source: Phil's *Physical Performance Assessment Protocol v1.2* (RYP Academy, 26/27 season).
This feature **replaces Diagnostic Capture**; nothing of the old capture is kept.

## 1. Goal and scope

Phil's protocol runs a standardized testing circuit inside regular sessions and needs every
trial stored, scores computed from the trials, and individual rolling baselines. This spec
builds it into the portal.

| Release | Contents |
|---|---|
| **MVP, live before Tue Nov 3 2026** | Assessments tab for Phil and the data-collection coach; wave-of-four circuit entry; golf-coach clubhead speed and Parallax entry; computed scores; coach results view; research consent at sign-up and a one-time confirm for existing families; Diagnostic Capture removed. |
| **In-season upgrade (B)** | Digested results for parents and athletes (family summary + screen). |
| **Later, only if the export format is confirmed (C)** | Smart2Move file import instead of typed values. |

## 2. Decisions (owner, 2026-10-14)

1. Scope: MVP by Nov 3 is option A; the parent/athlete report is an in-season upgrade.
2. Entry: Phil and one data-collection coach on a shared academy tablet run the circuit; golf
   coaches enter clubhead speed and Parallax from their own logins in the golf session.
3. Force plates: coaches type the values Smart2Move shows for each CMJ and each 10/5 set.
   File import is not MVP and is built only if we can confirm exactly how the reports are made.
4. Research consent: one more checkbox in sign-up's consent step; existing families see the
   same checkbox once as a "please confirm" step at their next sign-in.
5. It replaces Diagnostic Capture: take its place, remove its artifacts.
6. Visibility: raw data to **all coaches**; digested data to **athletes and parents**.
7. Screens adapt to window size: phone, tablet and desktop each get their own layout.
8. Athlete sex is entered by the coach at intake (staff-only).

## 3. People and permissions

| Who | Raw assessments | Family summary (B) |
|---|---|---|
| Owner, ops | read, write, delete | read, publish |
| Phil (`specialistId 'phil'`) and staff with the new **Assessments** permission (`users.assessor: true`, switched on by the owner in Staff & Roles) | read, write all sections | read, publish |
| All other coaches (role `coach`) | read; write the **golf section only** | read |
| Parents (household) and the athlete's own login | none | read published |

- Writes are client writes validated by `firestore.rules`: per-section field masks, numeric
  ranges (Section 4.4), `enteredBy == uid` for the section written, `updatedAt == request.time`.
- Delete: owner only.

## 4. Data model

### 4.1 `athletes/{athleteId}/assessments/{windowId}` — one doc per athlete per test window (staff only)

| Field | Content |
|---|---|
| `kind` | `'baseline' \| 'mid' \| 'end'` |
| `protocolVersion` | `'v1.2'` (cross-version comparisons are flagged) |
| `circuitMode` | trial counts and rest used: `{gripTrials, gripRestSec:[15,20], cmjScored, hopSets, medballThrows}` so a cut or shortened protocol is never treated as full-spec |
| `status` | `'open' \| 'complete'` |
| `circuitDate`, `golfDate`, `mcgillDate` | `YYYY-MM-DD`, set by the coach (within 14 days of entry); golf is due within 7 days of the circuit; McGill may be a separate block within 14 days |
| `weeksOfExposure` | weeks from the athlete's first-test date to `circuitDate` |
| `wave` | `{id, position 1-4, coachUid}` |
| `readiness` | `{status 'pass'\|'not-tested', reason, hoursSinceHardSession, golfToday, notes}` |
| `log` | training and location log: `{location 'ryp'\|'external'\|'none', externalContent 'machines'\|'bodyweight'\|'class'\|null, weeklyHours, rypSessionsSincePrior, golfVolume, competitiveLevel, otherSport, otherSportHours}` |
| `anthro` | `{standing:[cm], mass:[kg], boxHeight, sittingRaw:[cm], arm:[cm], hand:[cm], growthFlag}` — up to 3 measures each; sitting, arm and hand at baseline/end only |
| `grip` | `{right:[kg x3], left:[kg x3], deviceRight, deviceLeft, handlePosition, dominant}` |
| `cmj` | `{trials:[{heightCm, rsiMod, peakPowerW, peakPowerWkg, asymmetryPct}], software, samplingHz}` |
| `hop` | `{sets:[{rsiBest5, gctMs}]}` |
| `medball` | `{massKg, side, method 'radar'\|'distance', throws:[x3]}` |
| `mcgill` | `{flexorSec, extensorSec, sideRightSec, sideLeftSec, skippedBackPain}` — 300 means capped |
| `golf` | `{speeds:[mph x5], driver, parallaxComposite, fps}` |
| `notTested` | `{[station]: 'absent'\|'ill'\|'pain'\|'injury'\|'equipment'}` |
| `enteredBy` | `{[section]: uid}`; plus `createdAt`, `updatedAt` |

Scores are **never stored as typed finals**; they are computed from these trials (Section 6).

### 4.2 `athletes/{athleteId}/assessmentProfile/current` (staff only)

`{sex 'male'|'female', firstTestDate, medballMassKg, dominantHand, gripDevice, handlePosition, driver}`.
`firstTestDate` is set by the first circuit and anchors the athlete's rolling baseline. The med
ball mass is assigned at the first test (<45 kg: 2 kg; 45-65 kg: 3 kg; >65 kg: 4 kg) and kept all season.

### 4.3 Consents on the athlete (readable by the household and staff)

`athletes/{athleteId}.consents = {dataCollection, videoCapture, mediaRelease, research:{value, assent, recordedAt, recordedBy}, signature:{name, date}}`.
Written by `createFamily` at sign-up (it currently checks these and discards them) and, for the
one-time confirm, by the parent through a narrow rules branch that may only set `consents.research`.
Research use applies only to windows whose `circuitDate` is on or after a `research.value == true`
`recordedAt` ("cannot be applied retroactively"); a later change is recorded with its date.

### 4.4 Validation ranges (rules)

Grip 0-100 kg; standing height 90-215 cm; mass 15-160 kg; sitting raw 40-140 cm; box 20-80 cm;
arm 40-110 cm; hand 10-25 cm; CMJ height 0-90 cm; RSImod 0-2; peak power 0-8000 W; asymmetry 0-60 %;
RSI best-5 0-5; GCT 80-600 ms; med ball 0-60 mph (radar) or 0-25 m (distance); McGill 0-300 s;
clubhead 30-140 mph; Parallax composite 0-100 (Phil to confirm the scale); fps 30-1000.

### 4.5 Family summary (in-season, B)

`athletes/{athleteId}/assessmentReports/{windowId}`: digested values only (clubhead best and top-3,
jump height, 10/5 RSI, throw speed, best grip, Parallax composite, trunk balance summary, maturity
category, weeks of exposure, change markers), published by Phil. Parents and the athlete login read it.

## 5. Screens

Routes: `/portal/assessments` (list), `/portal/assessments/wave/:waveId` (circuit),
`/portal/assessments/athlete/:athleteId` (results), golf entry from the coach session roster and
`/portal/assessments/golf/:athleteId`.

- **Navigation**: the Capture tab becomes **Assessments** for Phil and assessor staff; owners reach
  it from the admin dashboard and athlete detail; golf coaches see a "Clubhead speed" entry on an
  athlete with an open window in their session roster.
- **List**: every academy athlete with consent status (yes / no / not answered) and what is due:
  "Baseline due" (never tested), "Mid-season eligible" (8+ weeks since baseline), "End of season",
  last test date. Select up to four, **Start wave**. An athlete with consent not answered cannot be added.
- **Wave (fixed station order)**: 1 Readiness & intake (pain check, log, sex at first test) ·
  2 Anthropometrics · 3 Grip (rotation A-R, A-L, B-R, B-L, three rounds) · 4 CMJ then 10/5 ·
  5 Med ball · 6 McGill (baseline/end only, or "run later as a separate block"). Each station shows
  its standard cue, the athletes in rotation order, a "not tested" control with reason codes, and a
  pain stop. McGill has a hold timer capped at 300 s ("300+ (capped)"). Equipment (dynamometer IDs,
  handle position, plate software and rate, ball mass, radar method) is entered once per wave and
  remembered. Every entry saves as typed.
- **Results (coach)**: scores, maturity offset and category, weeks of exposure, change markers vs
  the previous window, every trial, coach-only values (asymmetry, contact time, McGill raw times),
  flags (growth > 3 cm, contact time > 250 ms, cross-version, first-retest learning effect).
- **Responsive**: a shared layout replaces the 430 px column for these screens — phone (< 700 px)
  one athlete at a time; tablet (700-1100 px) two columns; desktop (> 1100 px) a full grid of the
  four athletes and their trials, and a table view of results.

## 6. Scoring (one pure module, used by every screen and the family summary)

All from the protocol (Sections 3-5). **Phil to confirm** items are marked.

- **Anthropometrics**: final = mean of the closest two of up to three measures; sitting = raw − box
  (third measure if the first two differ by > 0.4 cm); leg length = standing − sitting; decimal age
  from DOB at the circuit date; growth flag if standing height rose > 3 cm since the prior window.
- **Maturity offset (Moore et al. 2015)**: boys −8.128741 + 0.0070346 × (age × sitting height);
  girls −7.709133 + 0.0042232 × (age × standing height). Category: pre (< −1.0), circa (−1.0 to
  +1.0), post (> +1.0). Mid-season uses the most recent full anthropometrics plus the growth check.
  **Phil to confirm the coefficients against the source** (the protocol requires it).
- **Grip**: best per hand; best ÷ body mass; flagged "circuit rest interval".
- **CMJ**: best height and best RSImod; peak power (W, W/kg); L/R asymmetry coach-only.
- **10/5**: best set's best-5 RSI; a set whose contact time > 250 ms is a QC flag, not reported.
  **Phil to confirm Smart2Move shows a best-5 RSI and mean contact time per set.**
- **Med ball**: best trail-side speed (or distance), with ball mass and side.
- **Clubhead**: best and mean of the top 3 of 5; Parallax composite as entered; fps < 120 marks
  timing gaps directional only (raw variables are not in the MVP).
- **McGill**: flexion:extension (flag > 1.0), right:left (flag if |ratio − 1| > 0.05), side:extension
  (flag > 0.75); any ratio with a capped hold is "capped"; family summary: balanced / working on it.
- **Change markers** vs the athlete's previous window: thresholds clubhead ±2 %, CMJ ±5 %, 10/5 RSI
  ±8 %, med ball ±5 %, grip ±5 %, Parallax none. Green = gain beyond threshold, gray = within,
  yellow = drop beyond (with a "check maturity and readiness" note). **Thresholds are provisional
  (protocol Section 5)** and live in one table so Phil can update them.
- **Rules**: nothing reaches a family without that window's maturity offset; windows are timed from
  the athlete's own first test and at least 8 weeks apart; no norms or percentiles in season one.

## 7. Consent and sign-up

- Sign-up's consent step gains a **research** checkbox (ticked = yes, unticked = no; both recorded)
  with a child-assent confirmation; 18+ self-managed athletes answer for themselves. For an athlete
  under 18, research is "yes" only when both the parent's box and the assent box are ticked.
- The research paragraph moves out of the Data collection sheet (it was an opt-out there) into this
  separate opt-in choice.
- Wording (approved by the owner 2026-10-15; `{name}` is the athlete's first name):
  - Checkbox: **Research (optional): {name}'s results may be used in research.**
    Line under it: "Saying no changes nothing about {name}'s coaching or testing."
  - Assent checkbox (under 18, shown once the first is ticked): **I've talked about this with
    {name}, and they agree too.**
  - 18+ own login: **Research (optional): my results may be used in research.**
  - "Read more" sheet:
    - *What it covers.* RYP Academy and the RYP Golf Research Institute study how junior golfers
      develop. With your permission we include {name}'s results in that research: the physical
      assessment (strength, jump, throw and trunk tests, height and growth measures), clubhead
      speed and swing-sequencing numbers, attendance, and the training details you tell us about.
    - *How it is used.* Names, contact details, dates of birth and anything else that identifies a
      person are removed first. Findings may be published or shared with research partners only in
      that form. Video and photos are never used under this consent.
    - *Your choice.* This is optional. If you say no, {name} is tested and coached exactly the same
      way, and their results are used only to coach them. You can change your answer at any time by
      emailing makel@rypgolf.com. A change applies from that date on; results from before a "yes"
      are never added later.
  - One-time confirm for existing families: title **One quick question about research**; body
    "This season Phil Herder's assessment program measures each athlete's strength, power and
    growth. We'd like to include {name}'s results in RYP's research, with names removed. It's
    optional and changes nothing about their coaching." Then the same checkboxes, the "Read more"
    sheet and a **Save my answer** button (unticked saves as no).
- `createFamily` stores all consents it already asks for (4.3).
- Existing athletes without `consents.research` see the same checkbox once as a "please confirm"
  step at the parent's next sign-in.

## 8. Removing Diagnostic Capture

Production holds **0** diagnostics docs (checked 2026-10-14). Remove: `screens/DiagnosticCapture.js`
and its route/tab, `DIAGNOSTIC_SECTIONS`, the diagnostics hooks and live functions, the diagnostics
and collection-group rules, the AthleteDetail "Progress" card, the unrouted PracticeDNA stub, the
seed's diagnostics, and DATA-MODEL's diagnostics section. The admin "Diagnostic not entered" row
becomes "Baseline due".

## 9. Testing

- Scoring: unit tests for every function with hand-worked examples from the protocol (maturity
  offset both sexes, closest-two mean, best/top-3, capped ratios, threshold markers, 8-week rule).
- Rules: probes in `scripts/verify-rules.mjs` — staff read/write; golf coach golf-section-only;
  parents and athletes no raw access; family summary read; ranges refused; consent branch.
- Screens: component tests per station and the results view; a full wave end to end on the
  emulator; layout checks at phone, tablet and desktop widths (never on localhost:3000).
- Dry run with Phil before release on a **separate test copy** of the portal (owner, 2026-10-15):
  the staging Firebase project `ryp-academy-app` (work account, unused since the 2026-09-17
  cleanup) with fake athletes, built from the `assessments/v1.2` branch and served at its own web
  address (a separate Railway service), so Phil can run a full wave on his tablet without touching
  real families. Setup needs the owner for the Railway service, its environment variables and the
  staging project's sign-in settings; the steps are in the implementation plan.

## 10. Rollout and dependencies

- Merge `assessments/v1.2` to develop after approval, then: functions deploy (consent storage),
  rules deploy, portal push (`git push origin develop:main`).
- Depends on: a staff login with the Assessments permission for the data-collection coach; golf
  coach logins and the coach athlete-read fix from the staff audit for golf-session entry.

## 11. Open items owned by Phil (equipment, not app blockers)

Time one real wave; confirm the radar reads med ball speed at the wall; confirm what Smart2Move
displays per CMJ and per 10/5 set; confirm Parallax frame rate and composite scale; write the torso
length definition or drop it (MVP records arm and hand only); decide whether McGill runs inside the
wave or as a separate block (the app supports both).
