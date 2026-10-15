# Physical Performance Assessments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Diagnostic Capture with Phil Herder's Physical Performance Assessment protocol v1.2 in the portal: wave-of-four circuit entry, golf-session clubhead and Parallax entry, computed scores and change markers, a coach results view, editable protocol settings, research consent at sign-up plus a one-time confirm for existing families, and a staging test copy for Phil's dry run.

**Architecture:** Every score is computed from stored trials by pure modules in `frontend/src/portal/data/` (`assessmentScoring.js`, `assessmentSettings.js`, `assessmentWindows.js`, `assessmentInput.js`, `assessmentAccess.js`, `assessmentResults.js`, `researchConsent.js`), unit-tested with jest. Firestore access lives in new hook modules (`hooks/assessmentsLive.js` writes and reads, `hooks/assessments.js` seed/live read hooks, `hooks/researchConsent.js`) following the `scholarships.js` precedent: they import primitives from `./live`, never the other way, and fall back to seed data when `isLive()` is false. `firestore.rules` is the boundary (per-section field masks, numeric ranges, `enteredBy == uid`, `updatedAt == request.time`), proven by new probe modules run from `scripts/verify-rules.mjs`. Screens use a new responsive frame (`components/AssessmentFrame.js`) instead of the 430 px column.

**Tech Stack:** React 18 (CRA 5, plain JS), react-router-dom 6, firebase 9 modular SDK (`firebase/firestore`), jest via react-scripts, Firestore rules v2 (emulator REST probes, Node 22 ESM, dependency-free), Cloud Functions v1 (`firebase-functions/v1`, firebase-admin, tiny runner tests, eslint-config-google), Node `node:test` for scripts.

**Spec:** `docs/portal/plans/2026-10-14-assessments/00-spec.md` (approved; owner and Phil rulings 2026-10-14/15). Procedure text and standard cues are quoted from Phil's protocol document `RYP_Academy_Assessment_ProtocolV1.2.pdf` (Sections 2-5), the source the spec summarizes. This plan is the MVP release (spec 1, release A); what it could only default is listed for the owner and Phil in Task 26 Step 1.

## Global Constraints

- Protocol version label default `v1.2`; a procedure change asks for a new label and suggests the next patch (`v1.2` -> `v1.2.1`, `v1.2.1` -> `v1.2.2`).
- One window doc per athlete per test window: `athletes/{athleteId}/assessments/{season}-{kind}`, kind `baseline | mid | end`, season August-July (`2026-27` for 2026-11-03).
- Every result keeps `protocolVersion` and the `circuitMode` snapshot it ran under; results under a different version or procedure mode (trial counts, grip rest, stations, McGill mode, med ball side, golf timing) are flagged and their change markers are switched off, never silently compared; results under another 10/5 or RSImod entry mode are flagged and the 10/5 marker is switched off. The coefficient set is kept on the window, but every maturity offset is computed with the current coefficients.
- Scores are never stored as typed finals; they are computed from trials (protocol Section 5).
- Validation ranges, enforced in `firestore.rules` and mirrored in `data/assessmentInput.js`: grip 0-100 kg; standing height 90-215 cm; mass 15-160 kg; sitting raw 40-140 cm; box 20-80 cm; arm 40-110 cm; hand 10-25 cm; CMJ height 0-90 cm; RSImod 0-2; peak power 0-8000 W; asymmetry 0-60 %; RSI best-5 0-5; GCT 80-600 ms; med ball 0-60 mph (radar) or 0-25 m (distance); McGill 0-300 s; clubhead 30-140 mph; Parallax composite 0-100; fps 30-1000.
- Ranges the spec does not give, chosen here: peak power 0-100 W/kg; time to take-off 100-2000 ms; plate sampling 1-5000 Hz; weekly and golf hours 0-60; hours since a hard session 0-336; RYP sessions since prior 0-200; other-sport hours 0-40; text fields 40 (device, handle, driver, sport) or 80 (golf volume, competitive level) characters.
- Trial-count caps (settings form and rules): grip 1-5 per hand, CMJ scored 1-3, 10/5 scored sets 1-4 with 10 hops per set, med ball scored 1-5, clubhead maximal 1-8; wave size 1-4; waves per session 1-10.
- One section per window write (`saveSection`), so the rules check only that section's trials and stay inside Firestore's per-request expression cap (measured on the emulator: a fourth CMJ trial or a second every-hop 10/5 set checked value by value is refused for cost alone). A 10/5 set is Smart2Move's summary `{ rsiBest5, gctMs }` or every hop as two parallel lists `{ hopRsi: [<=10], hopGctMs: [<=10] }`; every-hop values are range-checked by the client only.
- The circuit runs on one shared tablet (spec decision 2): a section is written whole, so two devices typing into the same athlete's section are last writer wins. The rules cannot tell a stale copy from a correction (an unchanged section plus a moved `wave` reads as a legitimate re-wave), and a read-then-write transaction would refuse every save made offline, so this release does not guard it in code: one device works on an athlete at a time (starting a wave with an athlete moves them out of the wave they were in, so the screen that held them is closed first).
- Med ball mass at the first test of the season by body mass: under 45 kg = 2 kg; 45-65 kg = 3 kg; over 65 kg = 4 kg; mass and method (speed or distance) are fixed for the season ("block mixing"), the profile's season only moves forward, and a window takes a med ball only under a profile of its own season; the owner may correct a mistake.
- Maturity offset (Moore et al. 2015, as printed in the protocol): boys -8.128741 + 0.0070346 x (age x sitting height); girls -7.709133 + 0.0042232 x (age x standing height). Category: pre (< -1.0), circa (-1.0 to +1.0), post (> +1.0). Coefficients are a setting marked unverified until Phil checks the paper; results then say "estimate, coefficients unverified". Anchors: boy 14.0 / sitting 78.0 -> -0.447; girl 12.0 / standing 150.0 -> -0.107.
- Change-marker thresholds (one editable table): clubhead +/-2 %, CMJ +/-5 %, 10/5 RSI +/-8 %, med ball +/-5 %, grip +/-5 %, Parallax none. Green = gain beyond threshold, gray = within, yellow = drop beyond with "check maturity and readiness".
- Flags: growth > 3 cm since the prior window; 10/5 contact time > 250 ms (that set is not reported); Parallax under 120 fps = timing gaps directional only; McGill flexion:extension > 1.0, right:left differs from 1.0 by more than 0.05, side bridge:extension > 0.75; a 300 s hold is "300+ (capped)" and its ratios are marked capped; first retest = learning effect; cross-version; different circuit mode; another 10/5 or RSImod entry mode; windows less than 8 weeks (56 days) apart.
- Windows are timed from the athlete's own first test and at least 8 weeks apart; a late joiner whose mid-season window (8 weeks after the baseline) would not leave 8 weeks before the season end (`SEASON_BOUNDS.end`, 2027-02-27; a baseline after Nov 7) defaults to end of season, mid-season still selectable.
- An open window is in progress for 14 days (the entry window). After that it reads "Open since Nov 3: mark it complete", cannot join a wave, `startWave` skips it, and the rules refuse to move it into a wave or to a new circuit date; it is marked complete instead.
- Dates are set by the coach within 14 days of entry (never in the future, academy date in America/Chicago); golf is due within 7 days of the circuit (or the same day when the setting says so); McGill as a separate block within 14 days.
- Layout: phone < 700 px one athlete at a time; tablet 700-1100 px two columns; desktop > 1100 px the full grid of four and a results table.
- Access: owner and ops read and write; Phil (`specialistId 'phil'`) and coach or mental accounts with `users.assessor == true` read and write all sections; every other coach reads and writes the golf section only; families have no raw access; delete is owner only (spec 3's bullet; its table also names ops, so the owner confirms in Task 26 Step 1); only the owner sets `users.assessor`.
- Research consent: ticked = yes, unticked = no, both recorded; an athlete under 18 is yes only with the assent box ticked too; 18+ answer for themselves; `consents.research = { value, assent, recordedAt, recordedBy }`; research use applies only to windows whose `circuitDate` is on or after a `value == true` `recordedAt`; an athlete whose research answer is not recorded cannot be added to a wave.
- Consent wording is the owner-approved copy of 2026-10-15, verbatim, and nothing else; `{name}` is the athlete's first name. The spec words only the 18+ checkbox, so an 18+ member on their own login reads the approved line, Read more sheet and one-time confirm with their own first name; second-person drafts wait for the owner (Task 26 Step 1).
- Not in this plan: release B (the family summary, spec 4.5: `athletes/{athleteId}/assessmentReports`, its rules and spec 9's "family summary read" probe; families read no assessment data in this release) and release C (Smart2Move file import).
- Production rollout in the spec 10 order: functions, rules, portal. The diagnostics read rules stay, read-only, for this release (the live bundle reads diagnostics beside everything else on the athlete home and the admin dashboard) and go once the portal is live (Task 27).
- The staging test copy (`REACT_APP_TEST_COPY=true`) refuses to start against any Firebase project but `ryp-academy-app`; every staging deploy names `--project staging` (`.firebaserc`'s default is production).
- Files stay under 500 lines; new code goes in new files; the grandfathered `hooks/live.js`, `hooks/index.js`, `PortalRoutes.js`, `Roster.js`, `seed-firestore.mjs` and `verify-rules.mjs` only get the edits named here.
- Repo files are CRLF (`core.autocrlf=true`): edit existing files with the Edit tool; never `sed -i`; new files may be written with the Write tool.
- Never push, never deploy, never run a command with `--prod`, never touch production data, never start a dev server on port 3000, never read credential stores. The staging seed's `--yes` run is the owner's.
- Test commands: `node functions/portal/<file>.test.js`; `cd functions && npx eslint .`; `cd frontend && CI=true npx react-scripts test --watchAll=false <pattern>`; `cd frontend && npx eslint src/portal`; `cd frontend && npm run build`; `node --test scripts/test/*.test.mjs`; `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"`.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; work stays on branch `assessments/v1.2` in `C:\Users\Mac\Desktop\rypacadapp\wt-assessments`.

## Review Focus

1. **An evening wave dated tomorrow.** Sessions run until 7 PM Chicago, which is after midnight UTC; a reasonable coach expects the circuit date to be the academy's date. The start-wave sheet must default to `academyDateISO()`, never a UTC date. Pinned in Task 12 Step 1 (system time 2026-11-04T00:30Z shows 2026-11-03).
2. **The tablet loses wifi mid-wave.** A Firestore write offline neither lands nor fails, and the SDK's memory cache drops it if the page reloads or iPad Safari evicts it (Safari also ignores the leave prompt); the coach expects to know which entries are not on the server and not to lose them. A save not acknowledged in 8 s shows "Not saved yet", the typed values stay, leaving the wave asks first, and every unsaved entry is kept on the tablet until the server has it, then shown and sent again when the wave reopens. Pinned in Task 11 Step 1 (tracker, device store) and Task 13 Step 1 (leave guard, reopening).
3. **A typo or a tablet keyboard quirk in a trial.** "32,5" is 32.5; "32.5kg", "150" for grip or "-3" are refused inline and never sent, so one bad entry cannot fail the section's save and drop the trials already typed. Pinned in Task 11 Step 1 (TrialInput) and Task 14 Step 1 (grip station keeps R1 when R2 is refused).
4. **An incomplete athlete record.** Legacy athletes may have no date of birth, sex is entered at intake, a mid-season window has no sitting height, the box height may be missing. Results must say what is missing and show no maturity category, never NaN or a wrong category. Pinned in Task 17 Step 1.
5. **A family's research save fails.** If the rules refuse it (a rules deploy that failed or was rolled back) or the parent is offline, "Save my answer" fails; the family must not be trapped behind the sheet. After a failure the sheet offers "Skip for now", and the question returns at the next sign-in. Pinned in Task 23 Step 1.

---

## File Structure

**Pure modules (frontend/src/portal/data/)**
- Create `assessmentScoring.js` - every score, ratio, flag test and change marker from stored trials (spec 6).
- Create `assessmentSettings.js` - the v1.2 defaults, merge with stored settings, procedure-change detection, version labels, circuit-mode snapshot, stations and cues, med ball mass bands.
- Create `assessmentWindows.js` - seasons, window ids, day math, what is due per athlete, research consent status, date checks, wave ids.
- Create `assessmentInput.js` - the shared range table, parsing of typed trials and text, fixed-length trial lists.
- Create `assessmentAccess.js` - staff / reader / none per signed-in user, settings editors, who gets the tab; the seed-mode viewer.
- Create `assessmentResults.js` - the coach results view model per window (scores, maturity, markers, flags, rows for the table).
- Create `assessmentSeed.js` - the seed-mode fixture (fake athletes, windows, profiles).
- Create `researchConsent.js` - the approved research copy, the yes/no/assent rule, first names, under-18 test.
- Modify `seed.js` - drop `DIAGNOSTIC_ATHLETE`/`DIAGNOSTIC_SECTIONS`, rename the coach seed row, drop the research sentence from the data-collection consent.
- Modify `athlete.js` - drop the Practice DNA fixtures.
- Modify `admin.js` - the seed "Diagnostic not entered" row becomes "Baseline due".
- Modify `consentTerms.js` - the research section leaves the data-collection sheet.
- Modify `signup.js` - each athlete entry carries a research answer; the createFamily payload sends it.

**Hooks (frontend/src/portal/hooks/)**
- Create `assessmentsLive.js` - Firestore reads and writes for windows, profiles, settings, the wave start transaction, the assessor flag.
- Create `assessments.js` - `useAssessmentSettings`, `useAssessmentRoster`, `useWave`, `useAthleteAssessments`, `useOpenAssessmentWindows` (seed and live).
- Create `assessmentSaves.js` - the save tracker: saving / saved / slow / error per entry, retry, leave guard; the device store that keeps unsaved entries until the server has them.
- Create `assessorTab.js` - the signed-in session's "shows the Assessments tab" flag for BottomTabBar.
- Create `researchConsent.js` - `saveResearchConsent` and `useResearchConfirm`.
- Modify `useAuthSession.js` - `user.assessor`, publish the tab flag.
- Modify `index.js` - remove the diagnostics hooks; admin "Baseline due" from assessment windows; staff rows carry `assessor`.
- Modify `live.js` - remove the three diagnostics functions.

**Components (frontend/src/portal/components/)**
- Create `AssessmentFrame.js` - layout classes (`layoutFor`, `useLayoutClass`) and the wide frame.
- Create `assessments/TrialInput.js` - typed trial and text entry that commit on blur.
- Create `assessments/Choice.js` - labelled choice buttons.
- Create `assessments/SaveState.js` - one entry's save state line.
- Create `assessments/StationShell.js` - cue, rotation order, per-athlete cards, not tested and pain stop, phone switcher.
- Create `assessments/FieldRow.js` - a label and its inputs, the stations' one row shape.
- Create `assessments/testHarness.js` - test support for the station views (one athlete's window and profile, every save recorded); never imported by the app.
- Create `assessments/NotTestedSheet.js` - the reason-code sheet.
- Create `assessments/EquipmentCard.js` - per-wave equipment, remembered on the device.
- Create `assessments/IntakeStation.js`, `AnthroStation.js`, `GripStation.js`, `JumpStation.js`, `MedballStation.js`, `McGillStation.js`, `HoldTimer.js` - the six stations.
- Create `assessments/StartWaveSheet.js` - circuit date and kinds, then the wave start.
- Create `assessments/WindowCard.js` - one window on the results screen: scores and markers, maturity, flags, every trial, the staff actions.
- Create `assessments/ResultsTable.js` - the desktop table of every window.
- Create `assessments/VersionSheet.js` - the new protocol version label a procedure change asks for.
- Create `assessments/ResearchLine.js` - the research status line and the owner's "Record a change".
- Create `assessments/ClubheadChip.js` - the session-roster entry to golf entry.
- Create `AssessmentsEntryCard.js` - the admin and athlete-detail way in.
- Create `AssessorToggle.js` - the owner's Assessments permission switch on Staff & Roles.
- Create `Checkbox.js` - the round tick, moved out of `RegistrationConsent.js`.
- Create `ResearchChoice.js` - the research checkbox, the line under it and the assent box.
- Create `ResearchSheet.js` - the "Read more" sheet.
- Create `ResearchConfirmGate.js` - the one-time confirm for existing families.
- Create `TestCopyRibbon.js` - the "Test copy" marker on the staging build.
- Create `frontend/src/testCopyGuard.js` - a test-copy build refuses to start against any project but staging; `frontend/src/firebase.js` calls it first.
- Modify `BottomTabBar.js` - Capture goes; Assessments for Phil and assessors.

**Screens and routes (frontend/src/portal/)**
- Create `AssessmentRoutes.js` - route wrappers and the assessment guard (keeps `PortalRoutes.js` from growing).
- Create `screens/AssessmentList.js`, `screens/AssessmentWave.js`, `screens/AssessmentResults.js`, `screens/AssessmentGolf.js`, `screens/AssessmentSettings.js`.
- Modify `PortalRoutes.js` - remove the capture route; add the assessment routes, the research gate, the ribbon.
- Modify `screens/AdminDashboard.js`, `screens/AthleteDetail.js`, `screens/AthleteDashboard.js`, `screens/StaffRoles.js`, `screens/Roster.js`, `screens/RegistrationConsent.js`, `screens/Registration.js`, `StatesHarness.js`.
- Delete `screens/DiagnosticCapture.js`, `screens/DiagnosticCapture.test.js`, `screens/PracticeDNA.js`.

**Server and scripts**
- Modify `firestore.rules` - assessments, profiles, settings, collection-group reads, the assessor guard and read, the research branch; diagnostics read-only (Task 9), then removed once the portal is live (Task 27).
- Create `scripts/rules-probes/assessments.mjs`, `scripts/rules-probes/research.mjs` - emulator probes, run by `scripts/verify-rules.mjs`.
- Modify `scripts/verify-rules.mjs` - export `docName`, run the new probe tasks.
- Modify `functions/portal/family-validate.js`, `functions/portal/family.js` - store the consents, research per athlete.
- Create `functions/portal/family-consents.test.js` - createFamily writes the consents (stand-in Firestore).
- Modify `scripts/seed-firestore.mjs` - assessments fixtures replace diagnostics.
- Create `scripts/lib/assessment-fixtures.mjs`, `scripts/test/assessment-fixtures.test.mjs` - the invented athletes' windows, profiles and research answers, shared by both seeds.
- Create `scripts/seed-staging-assessments.mjs`, `scripts/test/seed-staging-assessments.test.mjs` - the staging-only seed.
- Modify `docs/portal/DATA-MODEL.md` - assessments, profile, settings, consents; diagnostics removed.
- Modify `.firebaserc` - the `staging` alias for `ryp-academy-app`.

---

### Task 1: Scoring module

**Files:**
- Create: `frontend/src/portal/data/assessmentScoring.js`
- Test: `frontend/src/portal/data/assessmentScoring.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all pure, null-safe, never NaN):
  - constants `CAP_SECONDS = 300`, `GROWTH_FLAG_CM = 3`, `GCT_FLAG_MS = 250`, `FPS_DIRECTIONAL_BELOW = 120`, `SITTING_TOLERANCE_CM = 0.4`, `BEST_HOPS = 5`, `MATURITY_LABEL = { pre, circa, post }`
  - `round(n: number, dp = 2): number|null`
  - `isoToMs(iso: string): number|null` (UTC midnight; null for anything not a real date)
  - `closestTwoMean(values: (number|null)[]): number|null`
  - `needsThirdMeasure(values, tolerance = 0.4): boolean`
  - `decimalAge(dob: string, dateISO: string): number|null`
  - `maturityOffset({ sex: 'male'|'female', age, sittingCm, standingCm, coefficients: { boys: {a,b}, girls: {a,b} } }): number|null`
  - `maturityCategory(offset): 'pre'|'circa'|'post'|null`
  - `growthCm(current, prior): number|null`, `growthFlag(current, prior): boolean`
  - `anthroFinals(anthro): { standing, mass, sitting, legLength, arm, hand, needsThirdSitting }`
  - `gripScores(grip, massKg): { bestRight, bestLeft, best, relativeBest, restNote }`
  - `rsiModFrom(heightCm, timeToTakeoffMs): number|null`
  - `cmjScores(cmj, { rsiModEntry: 'typed'|'computed', massKg }): { bestHeight, bestRsiMod, bestPeakW, bestPeakWkg, asymmetryPct }`
  - `hopSet(set: { rsiBest5, gctMs } | { hopRsi: number[], hopGctMs: number[] }, hopEntry: 'summary'|'per-hop'): { rsi, gctMs, flagged }`, `hopScores(hop, { hopEntry }): { sets, best, allFlagged }`
  - `medballScores(medball): { best, method, massKg, side }`
  - `clubheadScores(golf): { best, top3Mean, parallax, fpsDirectional }`
  - `mcgillScores(mcgill): { skipped, flexExt, rightLeft, sideRightExt, sideLeftExt, summary: 'balanced'|'working-on-it'|null }` where each ratio is `{ value, capped, flagged } | null`
  - `holdLabel(seconds): string`
  - `changeMarker(current, previous, thresholdPct): 'gain'|'within'|'drop'|null`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/portal/data/assessmentScoring.test.js`:

```js
import {
  anthroFinals, changeMarker, clubheadScores, closestTwoMean, cmjScores, decimalAge, gripScores, growthCm, growthFlag,
  holdLabel, hopScores, hopSet, isoToMs, maturityCategory, maturityOffset, mcgillScores, medballScores, needsThirdMeasure, rsiModFrom,
} from './assessmentScoring';

// The protocol's printed coefficients (Moore et al. 2015, protocol Section 3).
const MOORE = { boys: { a: -8.128741, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } };

describe('repeated measures (protocol Section 3)', () => {
  test('closest two of three; two is their mean; one is itself; none is null', () => {
    expect(closestTwoMean([150.2, 150.4, 151.6])).toBeCloseTo(150.3, 6);
    expect(closestTwoMean([151.6, 150.2, 150.4])).toBeCloseTo(150.3, 6);
    expect(closestTwoMean([150.0, 151.2, 151.4])).toBeCloseTo(151.3, 6);
    expect(closestTwoMean([150.2, 150.4])).toBeCloseTo(150.3, 6);
    expect(closestTwoMean([150.2, null, null])).toBe(150.2);
    expect(closestTwoMean([null, null])).toBeNull();
    expect(closestTwoMean(undefined)).toBeNull();
  });
  test('an exact tie keeps the lower pair, whatever floating point says', () => {
    // In floating point 80.4 - 80.0 is 0.40000000000000568 and 80.8 - 80.4 is 0.3999999999999915.
    expect(closestTwoMean([80.0, 80.4, 80.8])).toBeCloseTo(80.2, 6);
  });
  test('a third seated measure is asked for only when the first two differ by more than 0.4 cm', () => {
    expect(needsThirdMeasure([118.0, 118.4])).toBe(false);
    expect(needsThirdMeasure([118.0, 118.5])).toBe(true);
    expect(needsThirdMeasure([118.0, 118.5, 118.2])).toBe(false);
    expect(needsThirdMeasure([118.0, null])).toBe(false);
  });
});

describe('anthropometrics', () => {
  test('sitting is the seated measure minus the box; leg length is standing minus sitting', () => {
    const f = anthroFinals({ standing: [152.1, 152.3], mass: [41.0, 41.2], boxHeight: 40, sittingRaw: [118.0, 118.2], arm: [65.0], hand: [17.5, 17.7] });
    expect(f).toEqual({ standing: 152.2, mass: 41.1, sitting: 78.1, legLength: 74.1, arm: 65, hand: 17.6, needsThirdSitting: false });
  });
  test('no box height means no sitting height and no leg length, never NaN', () => {
    const f = anthroFinals({ standing: [152.2], sittingRaw: [118.1] });
    expect(f.sitting).toBeNull();
    expect(f.legLength).toBeNull();
    expect(anthroFinals(undefined)).toEqual({ standing: null, mass: null, sitting: null, legLength: null, arm: null, hand: null, needsThirdSitting: false });
  });
  test('the growth flag trips above 3 cm since the prior window', () => {
    expect(growthCm(155.4, 152.2)).toBe(3.2);
    expect(growthFlag(155.4, 152.2)).toBe(true);
    expect(growthFlag(155.2, 152.2)).toBe(false);
    expect(growthFlag(155.4, null)).toBe(false);
  });
});

describe('maturity offset (Moore et al. 2015, as the protocol prints it)', () => {
  test("Phil's anchors: boy 14.0 / sitting 78.0 is about -0.447; girl 12.0 / standing 150.0 is about -0.107", () => {
    expect(maturityOffset({ sex: 'male', age: 14.0, sittingCm: 78.0, standingCm: 160, coefficients: MOORE })).toBe(-0.447);
    expect(maturityOffset({ sex: 'female', age: 12.0, sittingCm: 70, standingCm: 150.0, coefficients: MOORE })).toBe(-0.107);
  });
  test('boys use sitting height, girls standing height; any missing input is null', () => {
    expect(maturityOffset({ sex: 'male', age: 14, sittingCm: null, standingCm: 160, coefficients: MOORE })).toBeNull();
    expect(maturityOffset({ sex: 'female', age: 12, sittingCm: 70, standingCm: null, coefficients: MOORE })).toBeNull();
    expect(maturityOffset({ sex: null, age: 12, sittingCm: 70, standingCm: 150, coefficients: MOORE })).toBeNull();
    expect(maturityOffset({ sex: 'male', age: null, sittingCm: 78, standingCm: 160, coefficients: MOORE })).toBeNull();
    expect(maturityOffset({ sex: 'male', age: 14, sittingCm: 78, standingCm: 160, coefficients: null })).toBeNull();
  });
  test('categories: pre below -1.0, circa from -1.0 to +1.0, post above +1.0', () => {
    expect(maturityCategory(-1.001)).toBe('pre');
    expect(maturityCategory(-1)).toBe('circa');
    expect(maturityCategory(1)).toBe('circa');
    expect(maturityCategory(1.001)).toBe('post');
    expect(maturityCategory(null)).toBeNull();
  });
  test('decimal age from the date of birth at the circuit date', () => {
    expect(decimalAge('2012-11-03', '2026-11-03')).toBe(14);
    expect(decimalAge('2012-05-03', '2026-11-03')).toBe(14.5);
    expect(decimalAge('2012-02-30', '2026-11-03')).toBeNull();
    expect(decimalAge(null, '2026-11-03')).toBeNull();
    expect(decimalAge('2027-01-01', '2026-11-03')).toBeNull();
    expect(isoToMs('2026-11-03')).toBe(Date.UTC(2026, 10, 3));
    expect(isoToMs('Nov 3')).toBeNull();
  });
});

describe('grip, CMJ, 10/5, med ball, clubhead', () => {
  test('grip: best per hand, the better hand, best / body mass, always the circuit rest interval', () => {
    expect(gripScores({ right: [24.5, 25.1, null], left: [23.0, 22.4, 23.8] }, 41.1)).toEqual({
      bestRight: 25.1, bestLeft: 23.8, best: 25.1, relativeBest: 0.61, restNote: 'circuit rest interval',
    });
    expect(gripScores(undefined, 41.1)).toMatchObject({ best: null, relativeBest: null });
    expect(gripScores({ right: [25.1] }, null).relativeBest).toBeNull();
  });
  test('CMJ, typed RSImod: best height, best RSImod, peak power, the highest jump\'s asymmetry', () => {
    const cmj = { trials: [
      { heightCm: 31.2, rsiMod: 0.41, peakPowerW: 2100, asymmetryPct: 6.5 },
      { heightCm: 32.0, rsiMod: 0.39, peakPowerW: 2150, peakPowerWkg: null, asymmetryPct: 4.2 },
    ] };
    expect(cmjScores(cmj, { rsiModEntry: 'typed', massKg: 41.1 })).toEqual({ bestHeight: 32, bestRsiMod: 0.41, bestPeakW: 2150, bestPeakWkg: 52.3, asymmetryPct: 4.2 });
  });
  test('CMJ, computed RSImod: jump height (m) / time to take-off (s)', () => {
    expect(rsiModFrom(35, 800)).toBe(0.44);
    expect(rsiModFrom(35, 0)).toBeNull();
    const cmj = { trials: [{ heightCm: 35, timeToTakeoffMs: 800 }, { heightCm: 33, timeToTakeoffMs: 700 }, null] };
    expect(cmjScores(cmj, { rsiModEntry: 'computed' }).bestRsiMod).toBe(0.47);
  });
  test('10/5 per set: the best reportable set; a set over 250 ms is flagged and not reported', () => {
    const r = hopScores({ sets: [{ rsiBest5: 2.31, gctMs: 198 }, { rsiBest5: 2.45, gctMs: 262 }] });
    expect(r.best).toBe(2.31);
    expect(r.sets[1]).toEqual({ rsi: 2.45, gctMs: 262, flagged: true });
    expect(r.allFlagged).toBe(false);
    expect(hopScores({ sets: [{ rsiBest5: 2.4, gctMs: 251 }] })).toMatchObject({ best: null, allFlagged: true });
    expect(hopScores(undefined)).toEqual({ sets: [], best: null, allFlagged: false });
  });
  test('10/5 per hop: mean of the five highest RSIs and the mean contact time of those five', () => {
    const rsi = [2.1, 2.3, 1.9, 2.4, 2.2, 2.0, 2.35, 1.8, 2.25, 2.05];
    const gct = [200, 190, 230, 185, 210, 240, 195, 260, 205, 220];
    expect(hopSet({ hopRsi: rsi, hopGctMs: gct }, 'per-hop')).toEqual({ rsi: 2.3, gctMs: 197, flagged: false });
    expect(hopSet({ hopRsi: [...rsi.slice(0, 4), null, null], hopGctMs: gct }, 'per-hop').rsi).toBeNull();
    expect(hopSet({ hopRsi: rsi, hopGctMs: Array(10).fill(260) }, 'per-hop').flagged).toBe(true);
  });
  test('med ball: the best trail-side throw with mass and side', () => {
    expect(medballScores({ massKg: 3, side: 'trail', method: 'speed', throws: [28.4, 29.1, null] })).toEqual({ best: 29.1, method: 'speed', massKg: 3, side: 'trail' });
    expect(medballScores({ method: 'distance', throws: [6.25, 6.4] }).best).toBe(6.4);
  });
  test('clubhead: best and the mean of the top three of five; under 120 fps is directional only', () => {
    expect(clubheadScores({ speeds: [88.2, 90.1, 89.5, 91.0, 87.9], parallaxComposite: 72, fps: 110 })).toEqual({ best: 91, top3Mean: 90.2, parallax: 72, fpsDirectional: true });
    expect(clubheadScores({ speeds: [88.2, 90.1], fps: 240 })).toEqual({ best: 90.1, top3Mean: null, parallax: null, fpsDirectional: false });
  });
});

describe('McGill (protocol Section 4)', () => {
  test('balanced when no ratio is flagged', () => {
    const r = mcgillScores({ flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 48, skippedBackPain: false });
    expect(r.flexExt).toEqual({ value: 0.67, capped: false, flagged: false });
    expect(r.rightLeft.flagged).toBe(false);
    expect(r.summary).toBe('balanced');
  });
  test('flags: F:E above 1.0, R:L more than 0.05 from 1.0, side:extension above 0.75 - each boundary itself passes', () => {
    expect(mcgillScores({ flexorSec: 95, extensorSec: 90, sideRightSec: 50, sideLeftSec: 50 }).summary).toBe('working-on-it');
    expect(mcgillScores({ flexorSec: 50, extensorSec: 60, sideRightSec: 63, sideLeftSec: 60 }).rightLeft.flagged).toBe(false);
    expect(mcgillScores({ flexorSec: 50, extensorSec: 60, sideRightSec: 64, sideLeftSec: 60 }).rightLeft.flagged).toBe(true);
    expect(mcgillScores({ flexorSec: 50, extensorSec: 60, sideRightSec: 45, sideLeftSec: 45 }).sideRightExt.flagged).toBe(false);
    expect(mcgillScores({ flexorSec: 50, extensorSec: 60, sideRightSec: 46, sideLeftSec: 46 }).sideRightExt.flagged).toBe(true);
  });
  test('a 300 s hold is capped: its ratios are marked capped and never flagged', () => {
    const r = mcgillScores({ flexorSec: 120, extensorSec: 300, sideRightSec: 80, sideLeftSec: 82 });
    expect(r.flexExt).toMatchObject({ capped: true, flagged: false });
    expect(r.sideRightExt.capped).toBe(true);
    expect(holdLabel(300)).toBe('300+ (capped)');
    expect(holdLabel(62)).toBe('62 s');
    expect(holdLabel(null)).toBe('-');
  });
  test('skipped for low back pain, or incomplete: no summary', () => {
    expect(mcgillScores({ skippedBackPain: true, sideRightSec: 40, sideLeftSec: 41 })).toMatchObject({ skipped: true, summary: null });
    expect(mcgillScores({ flexorSec: 60, extensorSec: 90, sideRightSec: 50 }).summary).toBeNull();
  });
});

describe('change markers (protocol Section 5)', () => {
  test('gain beyond +threshold, drop beyond -threshold, within otherwise; the threshold itself is within', () => {
    expect(changeMarker(102, 100, 2)).toBe('within');
    expect(changeMarker(102.1, 100, 2)).toBe('gain');
    expect(changeMarker(98, 100, 2)).toBe('within');
    expect(changeMarker(97.9, 100, 2)).toBe('drop');
    expect(changeMarker(90.1, 88.2, 2)).toBe('gain');
  });
  test('no marker without both values or without a threshold (Parallax)', () => {
    expect(changeMarker(72, 70, null)).toBeNull();
    expect(changeMarker(null, 70, 5)).toBeNull();
    expect(changeMarker(70, 0, 5)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/assessmentScoring.test.js`
Expected: FAIL - "Cannot find module './assessmentScoring' from 'src/portal/data/assessmentScoring.test.js'".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/data/assessmentScoring.js`:

```js
/**
 * Physical Performance Assessment scoring - Phil Herder's protocol v1.2
 * (docs/portal/plans/2026-10-14-assessments/00-spec.md, Section 6). PURE:
 * no Firestore, no clock, no React. Every screen (and, later, the family
 * summary) computes scores here from the stored trials; a score is never
 * typed in or stored as a final value (protocol Section 5).
 *
 * Inputs are the window sections as stored (athletes/{id}/assessments/
 * {windowId}, docs/portal/DATA-MODEL.md): lists of trials in which a trial
 * not typed yet is null. Every function tolerates a missing section and
 * returns null rather than NaN.
 */

export const CAP_SECONDS = 300;
export const GROWTH_FLAG_CM = 3;
export const GCT_FLAG_MS = 250;
export const FPS_DIRECTIONAL_BELOW = 120;
export const SITTING_TOLERANCE_CM = 0.4;
export const BEST_HOPS = 5;
export const MATURITY_LABEL = { pre: 'Pre-PHV', circa: 'Circa-PHV', post: 'Post-PHV' };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const nums = (list) => (Array.isArray(list) ? list.filter(isNum) : []);
const maxOf = (list) => {
  const l = nums(list);
  return l.length ? Math.max(...l) : null;
};
const meanOf = (list) => {
  const l = nums(list);
  return l.length ? l.reduce((sum, v) => sum + v, 0) / l.length : null;
};

/** `n` rounded to `dp` places, or null when it is not a number. */
export function round(n, dp = 2) {
  if (!isNum(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** 'YYYY-MM-DD' as UTC-midnight ms, or null for anything else (2026-02-30 included: Date.parse rolls it over). */
export function isoToMs(iso) {
  if (typeof iso !== 'string' || !ISO.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== iso ? null : ms;
}

/**
 * The final value of up to three repeated measures: the mean of the closest
 * two. One measure is itself, none is null. With three, an exact tie in the
 * two gaps keeps the lower pair; gaps are compared to a thousandth so
 * floating-point noise never decides a tie.
 */
export function closestTwoMean(values) {
  const l = nums(values).slice(0, 3);
  if (l.length === 0) return null;
  if (l.length === 1) return l[0];
  if (l.length === 2) return (l[0] + l[1]) / 2;
  const [a, b, c] = [...l].sort((x, y) => x - y);
  return round(c - b, 3) < round(b - a, 3) ? (b + c) / 2 : (a + b) / 2;
}

/** True when exactly two measures are in and they differ by more than `tolerance`: take a third. */
export function needsThirdMeasure(values, tolerance = SITTING_TOLERANCE_CM) {
  const l = nums(values);
  return l.length === 2 && round(Math.abs(l[0] - l[1]), 3) > tolerance;
}

/** Decimal age in years at `dateISO`, to two places; null without both dates or before birth. */
export function decimalAge(dob, dateISO) {
  const born = isoToMs(dob);
  const at = isoToMs(dateISO);
  if (born == null || at == null || at < born) return null;
  return round((at - born) / (365.25 * 86400000), 2);
}

/**
 * Moore et al. (2015) maturity offset - years from peak height velocity - as
 * the protocol prints it: boys a + b x (age x sitting height), girls a + b x
 * (age x standing height). `coefficients` is the settings map
 * ({ boys: { a, b }, girls: { a, b } }), unverified until Phil checks the
 * paper. Null when the sex, the age, the height it needs or the
 * coefficients are missing.
 */
export function maturityOffset({ sex, age, sittingCm, standingCm, coefficients }) {
  const set = sex === 'male' ? coefficients?.boys : sex === 'female' ? coefficients?.girls : null;
  const height = sex === 'male' ? sittingCm : standingCm;
  if (!set || !isNum(set.a) || !isNum(set.b) || !isNum(age) || !isNum(height)) return null;
  return round(set.a + set.b * (age * height), 3);
}

/** 'pre' below -1.0, 'post' above +1.0, 'circa' between (both ends included). */
export function maturityCategory(offset) {
  if (!isNum(offset)) return null;
  if (offset < -1) return 'pre';
  if (offset > 1) return 'post';
  return 'circa';
}

/** Standing-height change since the prior window, cm to one place, or null. */
export function growthCm(currentStanding, priorStanding) {
  return isNum(currentStanding) && isNum(priorStanding) ? round(currentStanding - priorStanding, 1) : null;
}

/** The growth flag: standing height up more than 3 cm since the prior window. */
export function growthFlag(currentStanding, priorStanding) {
  const g = growthCm(currentStanding, priorStanding);
  return g != null && g > GROWTH_FLAG_CM;
}

/**
 * One window's anthropometric finals. Each measure is its closest-two mean;
 * sitting height is the seated measure minus the box; leg length is standing
 * minus sitting. `needsThirdSitting` asks for a third seated measure when the
 * first two differ by more than 0.4 cm.
 */
export function anthroFinals(anthro) {
  const a = anthro || {};
  const standing = closestTwoMean(a.standing);
  const seated = closestTwoMean(a.sittingRaw);
  const box = isNum(a.boxHeight) ? a.boxHeight : null;
  const sitting = seated != null && box != null ? seated - box : null;
  return {
    standing: round(standing, 1),
    mass: round(closestTwoMean(a.mass), 1),
    sitting: round(sitting, 1),
    legLength: standing != null && sitting != null ? round(standing - sitting, 1) : null,
    arm: round(closestTwoMean(a.arm), 1),
    hand: round(closestTwoMean(a.hand), 1),
    needsThirdSitting: needsThirdMeasure(a.sittingRaw),
  };
}

/** Grip: best per hand, the better hand, and best / body mass (kg/kg). Always the "circuit rest interval". */
export function gripScores(grip, massKg) {
  const g = grip || {};
  const bestRight = maxOf(g.right);
  const bestLeft = maxOf(g.left);
  const best = maxOf([bestRight, bestLeft]);
  return {
    bestRight: round(bestRight, 1),
    bestLeft: round(bestLeft, 1),
    best: round(best, 1),
    relativeBest: best != null && isNum(massKg) && massKg > 0 ? round(best / massKg, 2) : null,
    restNote: 'circuit rest interval',
  };
}

/** RSImod from jump height (cm) and time to take-off (ms): metres / seconds, two places. */
export function rsiModFrom(heightCm, timeToTakeoffMs) {
  if (!isNum(heightCm) || !isNum(timeToTakeoffMs) || timeToTakeoffMs <= 0) return null;
  return round(heightCm / 100 / (timeToTakeoffMs / 1000), 2);
}

/**
 * CMJ: best height and best RSImod (typed from Smart2Move, or computed from
 * height and time to take-off - the rsiModEntry setting), best peak power in
 * W and W/kg (a typed W/kg wins; else W / body mass), and the L/R asymmetry of
 * the highest jump - an injury-screening value for coaches only.
 */
export function cmjScores(cmj, { rsiModEntry = 'typed', massKg = null } = {}) {
  const trials = (cmj?.trials ?? []).filter(Boolean);
  const rsi = trials.map((t) => (rsiModEntry === 'computed' ? rsiModFrom(t.heightCm, t.timeToTakeoffMs) : t.rsiMod));
  const highest = trials.reduce((best, t) => (isNum(t.heightCm) && (!best || t.heightCm > best.heightCm) ? t : best), null);
  const peakW = maxOf(trials.map((t) => t.peakPowerW));
  const typedWkg = maxOf(trials.map((t) => t.peakPowerWkg));
  const wkg = typedWkg != null ? typedWkg : peakW != null && isNum(massKg) && massKg > 0 ? peakW / massKg : null;
  return {
    bestHeight: round(highest ? highest.heightCm : null, 1),
    bestRsiMod: round(maxOf(rsi), 2),
    bestPeakW: round(peakW, 0),
    bestPeakWkg: round(wkg, 1),
    asymmetryPct: round(highest ? highest.asymmetryPct : null, 1),
  };
}

/**
 * One 10/5 set as scored. Per-set entry is Smart2Move's summary: the best-5
 * RSI and its mean contact time. Every-hop entry ({ hopRsi: [10], hopGctMs:
 * [10] }, parallel lists) scores the mean of the five highest RSIs (five
 * typed hops needed) and the mean contact time of those five. A set whose contact time is over 250 ms is flagged and not reported.
 */
export function hopSet(set, hopEntry = 'summary') {
  if (!set) return { rsi: null, gctMs: null, flagged: false };
  if (hopEntry === 'per-hop' || Array.isArray(set.hopRsi)) {
    const gcts = Array.isArray(set.hopGctMs) ? set.hopGctMs : [];
    const hops = (Array.isArray(set.hopRsi) ? set.hopRsi : []).map((rsi, i) => ({ rsi, gctMs: gcts[i] })).filter((h) => isNum(h.rsi));
    if (hops.length < BEST_HOPS) return { rsi: null, gctMs: null, flagged: false };
    const top = [...hops].sort((x, y) => y.rsi - x.rsi).slice(0, BEST_HOPS);
    const gct = meanOf(top.map((h) => h.gctMs));
    return { rsi: round(meanOf(top.map((h) => h.rsi)), 2), gctMs: round(gct, 0), flagged: gct != null && gct > GCT_FLAG_MS };
  }
  const gct = isNum(set.gctMs) ? set.gctMs : null;
  return { rsi: round(isNum(set.rsiBest5) ? set.rsiBest5 : null, 2), gctMs: gct, flagged: gct != null && gct > GCT_FLAG_MS };
}

/** 10/5: every set scored, and the best reportable (unflagged) set's RSI. */
export function hopScores(hop, { hopEntry = 'summary' } = {}) {
  const sets = (hop?.sets ?? []).map((s) => hopSet(s, hopEntry));
  const reportable = sets.filter((s) => s.rsi != null && !s.flagged);
  return {
    sets,
    best: reportable.length ? Math.max(...reportable.map((s) => s.rsi)) : null,
    allFlagged: reportable.length === 0 && sets.some((s) => s.rsi != null),
  };
}

/** Med ball: the best trail-side throw (mph, or m when the method is distance), with ball mass and side. */
export function medballScores(medball) {
  const m = medball || {};
  return { best: round(maxOf(m.throws), m.method === 'distance' ? 2 : 1), method: m.method ?? null, massKg: m.massKg ?? null, side: m.side ?? null };
}

/** Clubhead: best and the mean of the top three of five; Parallax as entered; under 120 fps the timing gaps are directional only. */
export function clubheadScores(golf) {
  const g = golf || {};
  const speeds = nums(g.speeds).sort((x, y) => y - x);
  return {
    best: round(speeds.length ? speeds[0] : null, 1),
    top3Mean: speeds.length >= 3 ? round(meanOf(speeds.slice(0, 3)), 1) : null,
    parallax: isNum(g.parallaxComposite) ? g.parallaxComposite : null,
    fpsDirectional: isNum(g.fps) && g.fps < FPS_DIRECTIONAL_BELOW,
  };
}

function ratio(num, den, flagIf) {
  if (!isNum(num) || !isNum(den) || den <= 0) return null;
  const value = round(num / den, 3);
  const capped = num >= CAP_SECONDS || den >= CAP_SECONDS;
  return { value: round(value, 2), capped, flagged: !capped && flagIf(value) };
}

/**
 * McGill ratios (protocol Section 4): flexion:extension (flag > 1.0),
 * right:left (flag when it differs from 1.0 by more than 0.05), and each
 * side bridge : extension (flag > 0.75). A ratio with a 300 s capped hold is
 * marked capped and never flagged. `summary` is what the family summary will
 * say - balanced, or working on it - only when all four ratios exist.
 */
export function mcgillScores(mcgill) {
  const m = mcgill || {};
  if (m.skippedBackPain === true) {
    return { skipped: true, flexExt: null, rightLeft: null, sideRightExt: null, sideLeftExt: null, summary: null };
  }
  const flexExt = ratio(m.flexorSec, m.extensorSec, (r) => r > 1.0);
  const rightLeft = ratio(m.sideRightSec, m.sideLeftSec, (r) => round(Math.abs(r - 1), 3) > 0.05);
  const sideRightExt = ratio(m.sideRightSec, m.extensorSec, (r) => r > 0.75);
  const sideLeftExt = ratio(m.sideLeftSec, m.extensorSec, (r) => r > 0.75);
  const all = [flexExt, rightLeft, sideRightExt, sideLeftExt];
  const summary = all.every(Boolean) ? (all.some((r) => r.flagged) ? 'working-on-it' : 'balanced') : null;
  return { skipped: false, flexExt, rightLeft, sideRightExt, sideLeftExt, summary };
}

/** A hold for display: "300+ (capped)" at the cap, "62 s" otherwise, "-" when not timed. */
export function holdLabel(seconds) {
  if (!isNum(seconds)) return '-';
  return seconds >= CAP_SECONDS ? '300+ (capped)' : `${seconds} s`;
}

/**
 * The change marker against the previous window (protocol Section 5):
 * 'gain' beyond +threshold %, 'drop' beyond -threshold %, 'within' otherwise;
 * null when either value is missing or the test has no threshold (Parallax).
 */
export function changeMarker(current, previous, thresholdPct) {
  if (!isNum(current) || !isNum(previous) || previous === 0 || !isNum(thresholdPct)) return null;
  const pct = round(((current - previous) / Math.abs(previous)) * 100, 3);
  if (pct > thresholdPct) return 'gain';
  if (pct < -thresholdPct) return 'drop';
  return 'within';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/assessmentScoring.test.js`
Expected: PASS (23 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/data/assessmentScoring.js frontend/src/portal/data/assessmentScoring.test.js
git commit -m "feat(assessments): scoring module for protocol v1.2

Every score, ratio, flag and change marker computed from stored trials,
with Phil's maturity anchors as tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Protocol settings and test windows

**Files:**
- Create: `frontend/src/portal/data/assessmentSettings.js`
- Create: `frontend/src/portal/data/assessmentWindows.js`
- Test: `frontend/src/portal/data/assessmentSettings.test.js`
- Test: `frontend/src/portal/data/assessmentWindows.test.js`

**Interfaces:**
- Consumes: `isoToMs` (Task 1); `addDaysISO`, `academyDateISO` from `data/calendar.js`; `SEASON_BOUNDS` from `data/season.js` (`{ start: '2026-11-03', end: '2027-02-27' }`).
- Produces, `assessmentSettings.js`:
  - `PROTOCOL_VERSION = 'v1.2'`, `DEFAULT_SETTINGS`, `SETTINGS_KEYS`, `TRIAL_LIMITS: { [countKey]: [min, max] }`, `PROCEDURE_KEYS`, `MODE_KEYS` (the six procedure keys that switch every marker off, then `ENTRY_KEYS`), `ENTRY_KEYS = ['hopEntry', 'rsiModEntry']`, `NOT_TESTED_REASONS: [key, label][]`, `STATIONS: { id, label, sections, notTestedKeys, cue }[]`
  - `withDefaults(stored): Settings`, `procedureChanged(before, after): boolean`, `nextPatch(version): string`, `validVersionLabel(label): boolean`
  - `circuitModeOf(settings): CircuitMode` = `{ trialCounts, gripRestSec, stations, mcgillMode, medballSide, golfTiming, waveSize, hopEntry, rsiModEntry, coefficientSet, coefficientsVerified }`
  - `modeDifferences(a: CircuitMode, b: CircuitMode): string[]`, `medballMassFor(massKg): 2|3|4|null`, `stationsFor(circuitMode, kinds: string[]): Station[]`
- Produces, `assessmentWindows.js`:
  - `KINDS`, `KIND_LABEL`, `ASSESSMENT_SECTIONS` (the ten section names), `MIN_GAP_DAYS = 56`, `ENTRY_WINDOW_DAYS = 14`, `GOLF_WINDOW_DAYS = 7`, `MCGILL_WINDOW_DAYS = 14`, `CONSENT_LABEL`
  - `seasonOf(dateISO): string|null`, `windowIdFor(season, kind): string`, `daysBetween(fromISO, toISO): number|null`, `weeksBetween(fromISO, toISO): number|null`, `shortDate(iso): string` ("Nov 3")
  - `dueStatus(windows, today): { kind, kinds: string[], label, inProgress, stale, eligibleOn, lastTestDate, windowId }`; `staleOpen(window, today): boolean` (an open window whose circuit date is more than 14 days before `today`: it is completed, never re-waved)
  - `consentStatus(athlete): 'yes'|'no'|'unanswered'`, `waveBlock(row): string|null`, `circuitDateProblem(date, today): string|null`, `newWaveId(circuitDate, random = Math.random): string`
  - `toISODate(value): string|null` (Firestore Timestamp, Date, ms or ISO string -> Chicago date), `researchCountsFrom(research): string|null`, `inResearch(research, circuitDate): boolean`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/data/assessmentSettings.test.js`:

```js
import {
  DEFAULT_SETTINGS, ENTRY_KEYS, circuitModeOf, medballMassFor, modeDifferences, nextPatch, procedureChanged, stationsFor, validVersionLabel, withDefaults,
} from './assessmentSettings';

describe('settings merge (spec 4.6)', () => {
  test('nothing stored is the v1.2 default', () => {
    expect(withDefaults(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.protocolVersion).toBe('v1.2');
    expect(DEFAULT_SETTINGS.trialCounts).toEqual({ grip: 3, cmjPractice: 1, cmjScored: 2, hopPractice: 1, hopScored: 2, medballPractice: 1, medballScored: 3, clubheadWarmup: 3, clubheadMax: 5 });
    expect(DEFAULT_SETTINGS.thresholds).toEqual({ clubhead: 2, cmj: 5, hop: 8, medball: 5, grip: 5, parallax: null });
    expect(DEFAULT_SETTINGS.coefficients).toEqual({ set: 'moore-2015', verified: false, boys: { a: -8.128741, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } });
  });
  test('a stored partial map is merged over the default; unknown keys are dropped', () => {
    const s = withDefaults({ trialCounts: { grip: 2 }, waveSize: 3, coefficients: { verified: true, boys: { a: -8.1 } }, updatedBy: 'u1' });
    expect(s.trialCounts.grip).toBe(2);
    expect(s.trialCounts.cmjScored).toBe(2);
    expect(s.waveSize).toBe(3);
    expect(s.coefficients).toEqual({ set: 'moore-2015', verified: true, boys: { a: -8.1, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } });
    expect('updatedBy' in s).toBe(false);
  });
});

describe('procedure changes bump the protocol version', () => {
  const d = DEFAULT_SETTINGS;
  test('trial counts, rest, stations, McGill mode, med ball side, golf timing and wave size are procedure', () => {
    expect(procedureChanged(d, { ...d, trialCounts: { ...d.trialCounts, grip: 2 } })).toBe(true);
    expect(procedureChanged(d, { ...d, gripRestSec: { min: 30, max: 30 } })).toBe(true);
    expect(procedureChanged(d, { ...d, stations: { ...d.stations, mcgill: false } })).toBe(true);
    expect(procedureChanged(d, { ...d, mcgillMode: 'separate' })).toBe(true);
    expect(procedureChanged(d, { ...d, waveSize: 3 })).toBe(true);
  });
  test('thresholds, coefficients and entry modes are not', () => {
    expect(procedureChanged(d, { ...d, thresholds: { ...d.thresholds, cmj: 6 } })).toBe(false);
    expect(procedureChanged(d, { ...d, coefficients: { ...d.coefficients, verified: true } })).toBe(false);
    expect(procedureChanged(d, { ...d, hopEntry: 'per-hop', rsiModEntry: 'computed', wavesPerSession: 4 })).toBe(false);
  });
  test('the order keys come back from Firestore in never reads as a change', () => {
    const reordered = { ...d, stations: Object.fromEntries(Object.entries(d.stations).reverse()) };
    expect(procedureChanged(d, reordered)).toBe(false);
  });
  test('the next patch label, and what a label may be', () => {
    expect(nextPatch('v1.2')).toBe('v1.2.1');
    expect(nextPatch('v1.2.1')).toBe('v1.2.2');
    expect(nextPatch('v2.0')).toBe('v2.0.1');
    expect(nextPatch('junk')).toBe('v1.2.1');
    expect(validVersionLabel('v1.2.1')).toBe(true);
    expect(validVersionLabel('v1.3')).toBe(true);
    expect(validVersionLabel('1.2.1')).toBe(false);
    expect(validVersionLabel('v1')).toBe(false);
  });
});

describe('the circuit mode a window is run under', () => {
  test('the snapshot carries what makes two results comparable', () => {
    expect(circuitModeOf(DEFAULT_SETTINGS)).toEqual({
      trialCounts: DEFAULT_SETTINGS.trialCounts, gripRestSec: { min: 15, max: 20 }, stations: DEFAULT_SETTINGS.stations,
      mcgillMode: 'wave', medballSide: 'trail', golfTiming: 'within-7', waveSize: 4, hopEntry: 'summary', rsiModEntry: 'typed',
      coefficientSet: 'moore-2015', coefficientsVerified: false,
    });
  });
  test('reduced trials, a different rest or another entry mode differ (spec 4.1); the coefficient set does not', () => {
    const full = circuitModeOf(DEFAULT_SETTINGS);
    const cut = circuitModeOf({ ...DEFAULT_SETTINGS, trialCounts: { ...DEFAULT_SETTINGS.trialCounts, hopScored: 1 } });
    expect(modeDifferences(full, cut)).toEqual(['trialCounts']);
    expect(modeDifferences(full, circuitModeOf({ ...DEFAULT_SETTINGS, hopEntry: 'per-hop', rsiModEntry: 'computed' }))).toEqual(['hopEntry', 'rsiModEntry']);
    expect(ENTRY_KEYS).toEqual(['hopEntry', 'rsiModEntry']);
    // Every maturity offset is computed with the current coefficients, so windows under another set stay comparable.
    expect(modeDifferences(full, { ...full, coefficientSet: 'other-2020' })).toEqual([]);
    expect(modeDifferences(full, null)).toEqual([]);
  });
});

describe('med ball mass bands (protocol Section 3)', () => {
  test('under 45 kg 2 kg; 45-65 kg 3 kg; over 65 kg 4 kg', () => {
    expect(medballMassFor(44.9)).toBe(2);
    expect(medballMassFor(45)).toBe(3);
    expect(medballMassFor(65)).toBe(3);
    expect(medballMassFor(65.1)).toBe(4);
    expect(medballMassFor(null)).toBeNull();
  });
});

describe('stations, in the fixed order', () => {
  const ids = (mode, kinds) => stationsFor(mode, kinds).map((s) => s.id);
  test('baseline and end run McGill; a wave of mid-season athletes does not', () => {
    const mode = circuitModeOf(DEFAULT_SETTINGS);
    expect(ids(mode, ['baseline'])).toEqual(['intake', 'anthro', 'grip', 'jump', 'medball', 'mcgill']);
    expect(ids(mode, ['mid', 'mid'])).toEqual(['intake', 'anthro', 'grip', 'jump', 'medball']);
    expect(ids(mode, ['mid', 'end'])).toContain('mcgill');
  });
  test('stations switched off in the settings are left out', () => {
    const mode = circuitModeOf({ ...DEFAULT_SETTINGS, stations: { ...DEFAULT_SETTINGS.stations, grip: false, cmj: false, hop: false } });
    expect(ids(mode, ['baseline'])).toEqual(['intake', 'anthro', 'medball', 'mcgill']);
  });
  test('every station carries its standard cue', () => {
    const grip = stationsFor(circuitModeOf(DEFAULT_SETTINGS), ['baseline']).find((s) => s.id === 'grip');
    expect(grip.cue).toBe('Squeeze as hard as you can. Go, go, go, relax.');
  });
});
```

Create `frontend/src/portal/data/assessmentWindows.test.js`:

```js
import {
  circuitDateProblem, consentStatus, daysBetween, dueStatus, inResearch, newWaveId, researchCountsFrom, seasonOf, staleOpen, toISODate, waveBlock,
  weeksBetween, windowIdFor,
} from './assessmentWindows';

const win = (kind, circuitDate, over = {}) => ({ id: `2026-27-${kind}`, season: '2026-27', kind, circuitDate, status: 'complete', ...over });

describe('seasons and window ids', () => {
  test('a season runs August to July', () => {
    expect(seasonOf('2026-11-03')).toBe('2026-27');
    expect(seasonOf('2027-02-27')).toBe('2026-27');
    expect(seasonOf('2027-07-31')).toBe('2026-27');
    expect(seasonOf('2027-08-01')).toBe('2027-28');
    expect(seasonOf('Nov 3')).toBeNull();
    expect(windowIdFor('2026-27', 'mid')).toBe('2026-27-mid');
  });
  test('day and week counts between two dates', () => {
    expect(daysBetween('2026-11-03', '2026-12-29')).toBe(56);
    expect(weeksBetween('2026-11-03', '2026-12-29')).toBe(8);
    expect(weeksBetween('2026-11-03', '2026-12-28')).toBe(7);
    expect(weeksBetween('2026-11-03', '2026-11-02')).toBeNull();
  });
});

describe('what is due (spec 5, list)', () => {
  test('never tested this season: baseline due', () => {
    expect(dueStatus([], '2026-11-03')).toMatchObject({ kind: 'baseline', kinds: ['baseline'], label: 'Baseline due', lastTestDate: null });
  });
  test('an open window is in progress for 14 days', () => {
    expect(dueStatus([win('baseline', '2026-11-03', { status: 'open' })], '2026-11-04')).toMatchObject({
      kind: 'baseline', kinds: ['baseline'], label: 'Baseline in progress', inProgress: true, stale: false, windowId: '2026-27-baseline',
    });
    expect(dueStatus([win('baseline', '2026-11-03', { status: 'open' })], '2026-11-17')).toMatchObject({ kind: 'baseline', stale: false });
  });
  test('an open window more than 14 days old is never re-waved: it reads "mark it complete" and blocks the wave', () => {
    const left = [win('baseline', '2026-11-03', { status: 'open' })];
    expect(dueStatus(left, '2026-11-18')).toMatchObject({
      kind: null, kinds: [], label: 'Open since Nov 3: mark it complete', inProgress: true, stale: true, windowId: '2026-27-baseline',
    });
    expect(waveBlock({ consent: 'yes', due: dueStatus(left, '2027-01-05') })).toBe('Open since Nov 3: mark it complete');
    expect(staleOpen(left[0], '2026-11-17')).toBe(false);
    expect(staleOpen(left[0], '2026-11-18')).toBe(true);
    expect(staleOpen(win('baseline', '2026-11-03'), '2027-01-05')).toBe(false);
  });
  test('mid-season is eligible 8 weeks after the baseline, and end of season may be chosen instead (late joiners)', () => {
    expect(dueStatus([win('baseline', '2026-11-03')], '2026-12-28')).toMatchObject({ kind: null, kinds: [], label: 'Mid-season from Dec 29', eligibleOn: '2026-12-29' });
    expect(dueStatus([win('baseline', '2026-11-03')], '2026-12-29')).toMatchObject({ kind: 'mid', kinds: ['mid', 'end'], label: 'Mid-season eligible', lastTestDate: '2026-11-03' });
  });
  test('a late joiner whose mid-season would leave no 8 weeks before the season end (Feb 27) defaults to end of season; mid-season stays a choice', () => {
    expect(dueStatus([win('baseline', '2026-12-15')], '2027-02-08')).toMatchObject({ kind: null, kinds: [], label: 'End of season from Feb 9', eligibleOn: '2027-02-09' });
    expect(dueStatus([win('baseline', '2026-12-15')], '2027-02-09')).toMatchObject({ kind: 'end', kinds: ['end', 'mid'], label: 'End of season' });
    expect(dueStatus([win('baseline', '2026-11-07')], '2027-01-02')).toMatchObject({ kind: 'mid', kinds: ['mid', 'end'] });
    expect(dueStatus([win('baseline', '2026-11-08')], '2027-01-03')).toMatchObject({ kind: 'end', kinds: ['end', 'mid'] });
  });
  test('end of season 8 weeks after mid-season; then the season is complete', () => {
    const done = [win('baseline', '2026-11-03'), win('mid', '2026-12-29')];
    expect(dueStatus(done, '2027-02-22')).toMatchObject({ kind: null, label: 'End of season from Feb 23' });
    expect(dueStatus(done, '2027-02-23')).toMatchObject({ kind: 'end', kinds: ['end'], label: 'End of season', lastTestDate: '2026-12-29' });
    expect(dueStatus([...done, win('end', '2027-02-24')], '2027-02-27')).toMatchObject({ kind: null, label: 'Season complete' });
  });
  test('last season does not count toward this one', () => {
    const old = { ...win('baseline', '2026-03-01'), id: '2025-26-baseline', season: '2025-26' };
    expect(dueStatus([old], '2026-11-03')).toMatchObject({ kind: 'baseline', lastTestDate: '2026-03-01' });
  });
});

describe('research consent and who can join a wave', () => {
  test('yes, no, or not answered', () => {
    expect(consentStatus({ consents: { research: { value: true } } })).toBe('yes');
    expect(consentStatus({ consents: { research: { value: false } } })).toBe('no');
    expect(consentStatus({ consents: {} })).toBe('unanswered');
    expect(consentStatus({ consents: { research: { value: 'yes' } } })).toBe('unanswered');
    expect(consentStatus(null)).toBe('unanswered');
  });
  test('not answered cannot be added; not due says why; a "no" can still be tested', () => {
    const due = dueStatus([], '2026-11-03');
    expect(waveBlock({ consent: 'unanswered', due })).toBe("Waiting on the family's research answer");
    expect(waveBlock({ consent: 'no', due })).toBeNull();
    expect(waveBlock({ consent: 'yes', due: dueStatus([win('baseline', '2026-11-03')], '2026-11-10') })).toBe('Mid-season from Dec 29');
  });
  test('research counts only from the date a yes was recorded', () => {
    const yes = { value: true, recordedAt: { toDate: () => new Date('2026-10-15T18:00:00Z') } };
    expect(researchCountsFrom(yes)).toBe('2026-10-15');
    expect(inResearch(yes, '2026-11-03')).toBe(true);
    expect(inResearch(yes, '2026-10-14')).toBe(false);
    expect(researchCountsFrom({ value: false, recordedAt: '2026-10-15T18:00:00Z' })).toBeNull();
    expect(inResearch(null, '2026-11-03')).toBe(false);
  });
  test('timestamps become the academy (Chicago) date', () => {
    expect(toISODate('2026-10-15T03:00:00Z')).toBe('2026-10-14');
    expect(toISODate(new Date('2026-10-15T18:00:00Z'))).toBe('2026-10-15');
    expect(toISODate(Date.UTC(2026, 9, 15, 18))).toBe('2026-10-15');
    expect(toISODate(null)).toBeNull();
    expect(toISODate('not a date')).toBeNull();
  });
});

describe('circuit dates and wave ids', () => {
  test('a circuit date is in the last 14 days and never in the future', () => {
    expect(circuitDateProblem('2026-11-03', '2026-11-03')).toBeNull();
    expect(circuitDateProblem('2026-10-20', '2026-11-03')).toBeNull();
    expect(circuitDateProblem('2026-10-19', '2026-11-03')).toBe('Pick a date in the last 14 days.');
    expect(circuitDateProblem('2026-11-04', '2026-11-03')).toBe("The circuit date can't be in the future.");
    expect(circuitDateProblem('', '2026-11-03')).toBe('Pick a date.');
  });
  test('a wave id names its date', () => {
    expect(newWaveId('2026-11-03', () => 0.5)).toBe('wave-2026-11-03-i');
    expect(newWaveId('2026-11-03')).toMatch(/^wave-2026-11-03-[a-z0-9]{1,5}$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/assessmentSettings.test.js src/portal/data/assessmentWindows.test.js`
Expected: FAIL - "Cannot find module './assessmentSettings'" and "Cannot find module './assessmentWindows'".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/data/assessmentSettings.js`:

```js
/**
 * Protocol settings - assessmentSettings/current (spec 4.6). Procedure
 * details that may change after the first timed wave are settings, not
 * code: Phil and the owner edit them on the staff Settings screen, and every
 * window keeps a snapshot of what it ran under (circuitModeOf) so a
 * reduced-trial or short-rest result is never compared as if it were
 * full-spec. PURE: no Firestore, no React.
 */

export const PROTOCOL_VERSION = 'v1.2';

/** The protocol's v1.2 values (spec 4.6 table; protocol Sections 2-5). */
export const DEFAULT_SETTINGS = {
  protocolVersion: PROTOCOL_VERSION,
  trialCounts: { grip: 3, cmjPractice: 1, cmjScored: 2, hopPractice: 1, hopScored: 2, medballPractice: 1, medballScored: 3, clubheadWarmup: 3, clubheadMax: 5 },
  gripRestSec: { min: 15, max: 20 },
  stations: { intake: true, anthro: true, grip: true, cmj: true, hop: true, medball: true, mcgill: true, segments: false, keiser: false },
  mcgillMode: 'wave',
  medballSide: 'trail',
  golfTiming: 'within-7',
  waveSize: 4,
  wavesPerSession: 5,
  hopEntry: 'summary',
  rsiModEntry: 'typed',
  coefficients: { set: 'moore-2015', verified: false, boys: { a: -8.128741, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } },
  thresholds: { clubhead: 2, cmj: 5, hop: 8, medball: 5, grip: 5, parallax: null },
};

export const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

/** [min, max] per trial count - the same caps firestore.rules holds (assessmentSettings). */
export const TRIAL_LIMITS = {
  grip: [1, 5], cmjPractice: [0, 3], cmjScored: [1, 3], hopPractice: [0, 2], hopScored: [1, 4],
  medballPractice: [0, 3], medballScored: [1, 5], clubheadWarmup: [0, 5], clubheadMax: [1, 8],
};

/** The settings that change the procedure: saving one asks for a new protocol version label. */
export const PROCEDURE_KEYS = ['trialCounts', 'gripRestSec', 'stations', 'mcgillMode', 'medballSide', 'golfTiming', 'waveSize'];

/**
 * The entry modes (spec 4.1: "hop and RSImod entry modes"): results typed
 * under another mode are flagged, and only the marker that entry feeds is
 * switched off (the 10/5 marker for hopEntry; RSImod has no marker). The
 * coefficient set is kept on the window but is not a mode difference:
 * every maturity offset is computed with the current coefficients.
 */
export const ENTRY_KEYS = ['hopEntry', 'rsiModEntry'];

/** The circuit-mode keys two results must share to be compared (protocol Section 5: "trial counts and rest intervals used"), then the entry modes. */
export const MODE_KEYS = ['trialCounts', 'gripRestSec', 'stations', 'mcgillMode', 'medballSide', 'golfTiming', ...ENTRY_KEYS];

/** Not-tested codes (protocol Section 5): absent, ill, pain, injury, equipment failure. */
export const NOT_TESTED_REASONS = [['absent', 'Absent'], ['ill', 'Ill'], ['pain', 'Pain'], ['injury', 'Injury'], ['equipment', 'Equipment']];

/** The fixed station order (protocol Section 2) and each station's standard cue (Sections 2-4). */
export const STATIONS = [
  { id: 'intake', label: 'Readiness & intake', sections: ['readiness', 'log'], notTestedKeys: ['readiness'],
    cue: 'Pain check first. Do not test an athlete who is ill, reports current pain, or has an unresolved injury: record not tested with a reason and retest within 7 days.' },
  { id: 'anthro', label: 'Anthropometrics', sections: ['anthro'], notTestedKeys: ['anthro'],
    cue: 'Shoes off, minimal clothing. Standing height to 0.1 cm and body mass to 0.1 kg; take a second measure if the first looks off.' },
  { id: 'grip', label: 'Grip', sections: ['grip'], notTestedKeys: ['grip'],
    cue: 'Squeeze as hard as you can. Go, go, go, relax.' },
  { id: 'jump', label: 'CMJ, then 10/5', sections: ['cmj', 'hop'], notTestedKeys: ['cmj', 'hop'],
    cue: 'CMJ: "Dip fast and jump as high as you can." 10/5: "Off the ground as fast as you can, and as high as you can. Hot ground."' },
  { id: 'medball', label: 'Med ball', sections: ['medball'], notTestedKeys: ['medball'],
    cue: 'Push the ground and throw it through the wall.' },
  { id: 'mcgill', label: 'McGill', sections: ['mcgill'], notTestedKeys: ['mcgill'],
    cue: 'Flexor, extensor, right side bridge, left side bridge. One warning for posture, then stop. Stop every hold at 300 s.' },
];

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Key-order-independent JSON, so a Firestore map read back in another key order is not a change. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (isMap(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}

/** Stored settings merged over the defaults: every known key present, unknown keys (updatedAt, updatedBy) dropped. */
export function withDefaults(stored) {
  const s = isMap(stored) ? stored : {};
  const out = {};
  for (const key of SETTINGS_KEYS) {
    const d = DEFAULT_SETTINGS[key];
    const v = s[key];
    if (v === undefined || (v === null && d !== null)) out[key] = isMap(d) ? { ...d } : d;
    else out[key] = isMap(d) && isMap(v) ? { ...d, ...v } : v;
  }
  const c = isMap(s.coefficients) ? s.coefficients : {};
  out.coefficients = {
    ...out.coefficients,
    boys: { ...DEFAULT_SETTINGS.coefficients.boys, ...(isMap(c.boys) ? c.boys : {}) },
    girls: { ...DEFAULT_SETTINGS.coefficients.girls, ...(isMap(c.girls) ? c.girls : {}) },
  };
  return out;
}

/** True when a save changes the procedure (PROCEDURE_KEYS): the protocol says any procedure change increments the version. */
export function procedureChanged(before, after) {
  const a = withDefaults(before);
  const b = withDefaults(after);
  return PROCEDURE_KEYS.some((k) => stable(a[k]) !== stable(b[k]));
}

/** The next patch label: v1.2 -> v1.2.1, v1.2.1 -> v1.2.2; anything unreadable -> v1.2.1. */
export function nextPatch(version) {
  const m = /^v(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(version || ''));
  if (!m) return `${PROTOCOL_VERSION}.1`;
  return `v${m[1]}.${m[2]}.${m[3] ? Number(m[3]) + 1 : 1}`;
}

/** A protocol label: v1.2 or v1.2.1 (the same pattern firestore.rules holds). */
export function validVersionLabel(label) {
  return /^v\d+\.\d+(\.\d+)?$/.test(String(label || ''));
}

/** The snapshot a window keeps of the settings it ran under (spec 4.1 circuitMode). */
export function circuitModeOf(settings) {
  const s = withDefaults(settings);
  return {
    trialCounts: s.trialCounts,
    gripRestSec: s.gripRestSec,
    stations: s.stations,
    mcgillMode: s.mcgillMode,
    medballSide: s.medballSide,
    golfTiming: s.golfTiming,
    waveSize: s.waveSize,
    hopEntry: s.hopEntry,
    rsiModEntry: s.rsiModEntry,
    coefficientSet: s.coefficients.set,
    coefficientsVerified: s.coefficients.verified === true,
  };
}

/** The circuit-mode keys on which two windows differ; [] when either is missing. */
export function modeDifferences(a, b) {
  if (!isMap(a) || !isMap(b)) return [];
  return MODE_KEYS.filter((k) => stable(a[k]) !== stable(b[k]));
}

/** The med ball for a body mass at the first test: under 45 kg 2 kg, 45-65 kg 3 kg, over 65 kg 4 kg. */
export function medballMassFor(massKg) {
  if (typeof massKg !== 'number' || !Number.isFinite(massKg)) return null;
  if (massKg < 45) return 2;
  if (massKg > 65) return 4;
  return 3;
}

/**
 * The stations a wave runs, in the fixed order. McGill runs at baseline and
 * end only, so a wave of nothing but mid-season athletes has no McGill
 * station; a station switched off in the settings is left out.
 */
export function stationsFor(circuitMode, kinds = []) {
  const on = { ...DEFAULT_SETTINGS.stations, ...(isMap(circuitMode?.stations) ? circuitMode.stations : {}) };
  const anyFull = kinds.length === 0 || kinds.some((k) => k !== 'mid');
  return STATIONS.filter((st) => {
    if (st.id === 'jump') return on.cmj !== false || on.hop !== false;
    if (st.id === 'mcgill') return on.mcgill !== false && anyFull;
    return on[st.id] !== false;
  });
}
```

Create `frontend/src/portal/data/assessmentWindows.js`:

```js
/**
 * Test windows (spec 4.1, 5, 6 "Rules"): seasons, window ids, what each
 * athlete is due, research consent status and the date checks a coach's
 * entry must pass. PURE. Windows are timed from the athlete's own first test
 * and are at least 8 weeks apart; a late joiner may skip mid-season and be
 * compared at end of season instead, which is the coach's choice at the
 * start of a wave (`kinds`, the default first). An open window is in
 * progress for 14 days; after that it is completed, never re-waved.
 */
import { academyDateISO, addDaysISO } from './calendar';
import { isoToMs } from './assessmentScoring';
import { SEASON_BOUNDS } from './season';

export const KINDS = ['baseline', 'mid', 'end'];
export const KIND_LABEL = { baseline: 'Baseline', mid: 'Mid-season', end: 'End of season' };
/** Every section a window doc may hold - the same list firestore.rules checks enteredBy against. */
export const ASSESSMENT_SECTIONS = ['readiness', 'log', 'anthro', 'grip', 'cmj', 'hop', 'medball', 'mcgill', 'golf', 'notTested'];
export const MIN_GAP_DAYS = 56;
export const ENTRY_WINDOW_DAYS = 14;
export const GOLF_WINDOW_DAYS = 7;
export const MCGILL_WINDOW_DAYS = 14;
export const CONSENT_LABEL = { yes: 'Research: yes', no: 'Research: no', unanswered: 'Research: not answered' };

/** The season a date belongs to - August to July: '2026-27' for 2026-11-03. */
export function seasonOf(dateISO) {
  if (isoToMs(dateISO) == null) return null;
  const y = Number(dateISO.slice(0, 4));
  const start = Number(dateISO.slice(5, 7)) >= 8 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

/** athletes/{id}/assessments/{windowId}: one doc per athlete per test window. */
export function windowIdFor(season, kind) {
  return `${season}-${kind}`;
}

/** Whole days from one 'YYYY-MM-DD' to another (negative when earlier), or null. */
export function daysBetween(fromISO, toISO) {
  const a = isoToMs(fromISO);
  const b = isoToMs(toISO);
  return a == null || b == null ? null : Math.round((b - a) / 86400000);
}

/** Whole weeks from the first test to a circuit date (weeks of Academy exposure), or null. */
export function weeksBetween(fromISO, toISO) {
  const d = daysBetween(fromISO, toISO);
  return d == null || d < 0 ? null : Math.floor(d / 7);
}

/** "Nov 3". */
export function shortDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const byDate = (a, b) => (a.circuitDate || '').localeCompare(b.circuitDate || '');

/**
 * An open window whose circuit date is more than 14 days before `today`.
 * Windows stay open for days (golf and a McGill block are entered on an open
 * window), but past the 14-day entry window a new wave would type over its
 * trials under a new date: it is marked complete instead (the rules refuse
 * the re-wave too).
 */
export function staleOpen(w, today) {
  return Boolean(w) && w.status === 'open' && (daysBetween(w.circuitDate, today) ?? 0) > ENTRY_WINDOW_DAYS;
}

/**
 * What an athlete is due today, from their windows (any season): an open
 * window is in progress for 14 days, then reads "mark it complete"; never
 * tested this season is "Baseline due"; mid season is eligible 8 weeks after
 * the baseline (end of season may be chosen instead); end of season 8 weeks
 * after mid season. A late joiner - a mid-season window 8 weeks after the
 * baseline would leave no 8 weeks before the season end (SEASON_BOUNDS.end) -
 * defaults to end of season (protocol Section 1: "will be compared at end of
 * season instead"), mid-season still a choice. `kinds` are the windows a wave
 * may start for them now, the first being the default; `kind` is null when
 * nothing can start.
 */
export function dueStatus(windows, today) {
  const season = seasonOf(today);
  const all = (windows || []).filter((w) => w && w.circuitDate).sort(byDate);
  const lastTestDate = all.length ? all[all.length - 1].circuitDate : null;
  const mine = all.filter((w) => w.season === season);
  const base = { inProgress: false, stale: false, eligibleOn: null, lastTestDate, windowId: null };
  const open = mine.find((w) => w.status === 'open');
  if (open && staleOpen(open, today)) {
    return { ...base, kind: null, kinds: [], label: `Open since ${shortDate(open.circuitDate)}: mark it complete`, inProgress: true, stale: true, windowId: open.id };
  }
  if (open) return { ...base, kind: open.kind, kinds: [open.kind], label: `${KIND_LABEL[open.kind]} in progress`, inProgress: true, windowId: open.id };
  const has = (k) => mine.find((w) => w.kind === k);
  const after = (prev, kinds, label) => {
    const eligibleOn = addDaysISO(prev.circuitDate, MIN_GAP_DAYS);
    return today >= eligibleOn
      ? { ...base, kind: kinds[0], kinds, label, eligibleOn }
      : { ...base, kind: null, kinds: [], label: `${KIND_LABEL[kinds[0]]} from ${shortDate(eligibleOn)}`, eligibleOn };
  };
  if (!has('baseline')) return { ...base, kind: 'baseline', kinds: ['baseline'], label: 'Baseline due' };
  if (!has('mid') && !has('end')) {
    const seasonEnd = seasonOf(SEASON_BOUNDS.end) === season ? SEASON_BOUNDS.end : null;
    const midOn = addDaysISO(has('baseline').circuitDate, MIN_GAP_DAYS);
    const late = seasonEnd != null && addDaysISO(midOn, MIN_GAP_DAYS) > seasonEnd;
    return late ? after(has('baseline'), ['end', 'mid'], 'End of season') : after(has('baseline'), ['mid', 'end'], 'Mid-season eligible');
  }
  if (!has('end')) return after(has('mid'), ['end'], 'End of season');
  return { ...base, kind: null, kinds: [], label: 'Season complete' };
}

/** The athlete's research answer (spec 4.3): 'yes', 'no', or 'unanswered' when no answer is recorded. */
export function consentStatus(athlete) {
  const r = athlete?.consents?.research;
  if (!r || typeof r.value !== 'boolean') return 'unanswered';
  return r.value ? 'yes' : 'no';
}

/** Why a list row cannot join a wave, or null when it can (spec 5: not answered cannot be added). */
export function waveBlock(row) {
  if (row.consent === 'unanswered') return "Waiting on the family's research answer";
  if (!row.due.kind) return row.due.label;
  return null;
}

/** A coach-set circuit date: in the last 14 days (spec 4.1) and never in the future. */
export function circuitDateProblem(date, today) {
  const d = daysBetween(date, today);
  if (d == null) return 'Pick a date.';
  if (d < 0) return "The circuit date can't be in the future.";
  if (d > ENTRY_WINDOW_DAYS) return 'Pick a date in the last 14 days.';
  return null;
}

/** A wave id that names its date: 'wave-2026-11-03-k3x9q'. */
export function newWaveId(circuitDate, random = Math.random) {
  return `wave-${circuitDate}-${random().toString(36).slice(2, 7)}`;
}

/** A Firestore Timestamp, Date, ms or ISO string as the academy (Chicago) date, or null. */
export function toISODate(value) {
  if (value == null) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : academyDateISO(date);
}

/** The first circuit date a research "yes" covers (it is never applied retroactively), or null. */
export function researchCountsFrom(research) {
  return research && research.value === true ? toISODate(research.recordedAt) : null;
}

/** Whether a window's results may be used in research (spec 4.3). */
export function inResearch(research, circuitDate) {
  const from = researchCountsFrom(research);
  return Boolean(from && circuitDate && circuitDate >= from);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/assessmentSettings.test.js src/portal/data/assessmentWindows.test.js`
Expected: PASS (both suites).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/data/assessmentSettings.js frontend/src/portal/data/assessmentSettings.test.js frontend/src/portal/data/assessmentWindows.js frontend/src/portal/data/assessmentWindows.test.js
git commit -m "feat(assessments): protocol settings, circuit mode and test windows

Settings are data with v1.2 defaults; a procedure change asks for a new
version label; entry modes are part of the circuit mode; windows are due 8
weeks apart from the athlete's own first test, a late joiner defaults to
end of season, and an open window past 14 days is completed, never
re-waved; research counts only from a recorded yes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Entry ranges and access levels

**Files:**
- Create: `frontend/src/portal/data/assessmentInput.js`
- Create: `frontend/src/portal/data/assessmentAccess.js`
- Test: `frontend/src/portal/data/assessmentInput.test.js`
- Test: `frontend/src/portal/data/assessmentAccess.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces, `assessmentInput.js`:
  - `RANGES: { [rangeKey]: { lo, hi, unit, name } }` - keys `grip, standing, mass, sittingRaw, boxHeight, arm, hand, cmjHeight, rsiMod, timeToTakeoffMs, peakPowerW, peakPowerWkg, asymmetryPct, rsi, gctMs, medballSpeed, medballDistance, mcgill, clubhead, parallax, fps, samplingHz, weeklyHours, hoursSinceHard, sessions, otherSportHours`
  - `rangeLabel(rangeKey): string` ("0-100 kg")
  - `parseTrial(text, rangeKey): { ok: true, value: number|null } | { ok: false, error: string }`
  - `parseText(text, max): string|null`
  - `setAt(list, index, value, length): (number|object|null)[]`
- Produces, `assessmentAccess.js`:
  - `assessmentAccess(user): 'staff'|'reader'|null` (user = `useAuthSession().user`: `{ role, specialistId, assessor }`)
  - `canEditAssessmentSettings(user): boolean`, `showsAssessmentsTab(user): boolean`
  - `SEED_VIEWER = { uid: 'phil', role: 'coach', specialistId: 'phil', assessor: false }`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/data/assessmentInput.test.js`:

```js
import { RANGES, parseText, parseTrial, rangeLabel, setAt } from './assessmentInput';

describe('the range table matches the rules (spec 4.4)', () => {
  test('spec ranges', () => {
    const pick = (k) => [RANGES[k].lo, RANGES[k].hi];
    expect(pick('grip')).toEqual([0, 100]);
    expect(pick('standing')).toEqual([90, 215]);
    expect(pick('mass')).toEqual([15, 160]);
    expect(pick('sittingRaw')).toEqual([40, 140]);
    expect(pick('boxHeight')).toEqual([20, 80]);
    expect(pick('arm')).toEqual([40, 110]);
    expect(pick('hand')).toEqual([10, 25]);
    expect(pick('cmjHeight')).toEqual([0, 90]);
    expect(pick('rsiMod')).toEqual([0, 2]);
    expect(pick('peakPowerW')).toEqual([0, 8000]);
    expect(pick('asymmetryPct')).toEqual([0, 60]);
    expect(pick('rsi')).toEqual([0, 5]);
    expect(pick('gctMs')).toEqual([80, 600]);
    expect(pick('medballSpeed')).toEqual([0, 60]);
    expect(pick('medballDistance')).toEqual([0, 25]);
    expect(pick('mcgill')).toEqual([0, 300]);
    expect(pick('clubhead')).toEqual([30, 140]);
    expect(pick('parallax')).toEqual([0, 100]);
    expect(pick('fps')).toEqual([30, 1000]);
  });
  test('the label a coach reads', () => {
    expect(rangeLabel('grip')).toBe('0-100 kg');
    expect(rangeLabel('rsiMod')).toBe('0-2');
  });
});

describe('typed trials', () => {
  test('a number, a comma decimal, a leading point; blank clears', () => {
    expect(parseTrial('32.5', 'grip')).toEqual({ ok: true, value: 32.5 });
    expect(parseTrial(' 32,5 ', 'grip')).toEqual({ ok: true, value: 32.5 });
    expect(parseTrial('.45', 'rsiMod')).toEqual({ ok: true, value: 0.45 });
    expect(parseTrial('', 'grip')).toEqual({ ok: true, value: null });
    expect(parseTrial('  ', 'grip')).toEqual({ ok: true, value: null });
  });
  test('a unit, a sign, two separators or letters are refused', () => {
    for (const junk of ['32.5kg', '-3', '+3', '1.2.3', '1,234.5', 'abc', '3 2']) {
      expect(parseTrial(junk, 'grip')).toEqual({ ok: false, error: 'Numbers only, like 32.5' });
    }
  });
  test('outside the range is refused with the range', () => {
    expect(parseTrial('150', 'grip')).toEqual({ ok: false, error: 'Grip is 0-100 kg' });
    expect(parseTrial('100', 'grip')).toEqual({ ok: true, value: 100 });
    expect(parseTrial('79', 'gctMs')).toEqual({ ok: false, error: 'Contact time is 80-600 ms' });
    expect(parseTrial('301', 'mcgill')).toEqual({ ok: false, error: 'Hold is 0-300 s' });
  });
  test('text is trimmed, capped, and blank is null', () => {
    expect(parseText('  Takei 5401 ', 40)).toBe('Takei 5401');
    expect(parseText('x'.repeat(50), 40)).toHaveLength(40);
    expect(parseText('   ', 40)).toBeNull();
  });
});

describe('fixed-length trial lists', () => {
  test('a trial lands in its slot; untyped slots are null', () => {
    expect(setAt(undefined, 1, 24.5, 3)).toEqual([null, 24.5, null]);
    expect(setAt([23.0, null, null], 0, null, 3)).toEqual([null, null, null]);
    expect(setAt([23.0], 2, 25.0, 3)).toEqual([23.0, null, 25.0]);
  });
  test('a list longer than the count keeps its trials', () => {
    expect(setAt([1, 2, 3], 0, 9, 2)).toEqual([9, 2, 3]);
  });
});
```

Create `frontend/src/portal/data/assessmentAccess.test.js`:

```js
import { SEED_VIEWER, assessmentAccess, canEditAssessmentSettings, showsAssessmentsTab } from './assessmentAccess';

describe('assessment access mirrors firestore.rules assessStaff / assessReader', () => {
  test('owner, ops, Phil and assessor staff are staff', () => {
    expect(assessmentAccess({ role: 'owner' })).toBe('staff');
    expect(assessmentAccess({ role: 'ops' })).toBe('staff');
    expect(assessmentAccess({ role: 'coach', specialistId: 'phil' })).toBe('staff');
    expect(assessmentAccess({ role: 'coach', assessor: true })).toBe('staff');
    expect(assessmentAccess({ role: 'mental', specialistId: 'mental', assessor: true })).toBe('staff');
  });
  test('every other coach reads (and writes golf only); families and mental without the permission have none', () => {
    expect(assessmentAccess({ role: 'coach' })).toBe('reader');
    expect(assessmentAccess({ role: 'mental', specialistId: 'mental' })).toBeNull();
    expect(assessmentAccess({ role: 'parent', assessor: true })).toBeNull();
    expect(assessmentAccess({ role: 'athlete' })).toBeNull();
    expect(assessmentAccess(null)).toBeNull();
  });
  test('Phil and the owner edit the settings; the tab is for Phil and assessor staff', () => {
    expect(canEditAssessmentSettings({ role: 'owner' })).toBe(true);
    expect(canEditAssessmentSettings({ role: 'coach', specialistId: 'phil' })).toBe(true);
    expect(canEditAssessmentSettings({ role: 'ops' })).toBe(false);
    expect(canEditAssessmentSettings({ role: 'coach', assessor: true })).toBe(false);
    expect(showsAssessmentsTab({ role: 'coach', specialistId: 'phil' })).toBe(true);
    expect(showsAssessmentsTab({ role: 'coach', assessor: true })).toBe(true);
    expect(showsAssessmentsTab({ role: 'coach' })).toBe(false);
    expect(showsAssessmentsTab({ role: 'owner' })).toBe(false);
    expect(assessmentAccess(SEED_VIEWER)).toBe('staff');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/assessmentInput.test.js src/portal/data/assessmentAccess.test.js`
Expected: FAIL - "Cannot find module './assessmentInput'" and "Cannot find module './assessmentAccess'".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/data/assessmentInput.js`:

```js
/**
 * What a coach may type into a trial (spec 4.4). The SAME ranges
 * firestore.rules enforces on athletes/{id}/assessments - change one, change
 * the other. A refused value is never sent: the rules check the whole
 * section a write carries, so one typo would otherwise fail the save of
 * every trial typed beside it.
 */

export const RANGES = {
  grip: { lo: 0, hi: 100, unit: 'kg', name: 'Grip' },
  standing: { lo: 90, hi: 215, unit: 'cm', name: 'Standing height' },
  mass: { lo: 15, hi: 160, unit: 'kg', name: 'Body mass' },
  sittingRaw: { lo: 40, hi: 140, unit: 'cm', name: 'Seated height' },
  boxHeight: { lo: 20, hi: 80, unit: 'cm', name: 'Box height' },
  arm: { lo: 40, hi: 110, unit: 'cm', name: 'Arm length' },
  hand: { lo: 10, hi: 25, unit: 'cm', name: 'Hand length' },
  cmjHeight: { lo: 0, hi: 90, unit: 'cm', name: 'Jump height' },
  rsiMod: { lo: 0, hi: 2, unit: '', name: 'RSImod' },
  timeToTakeoffMs: { lo: 100, hi: 2000, unit: 'ms', name: 'Time to take-off' },
  peakPowerW: { lo: 0, hi: 8000, unit: 'W', name: 'Peak power' },
  peakPowerWkg: { lo: 0, hi: 100, unit: 'W/kg', name: 'Peak power' },
  asymmetryPct: { lo: 0, hi: 60, unit: '%', name: 'Asymmetry' },
  rsi: { lo: 0, hi: 5, unit: '', name: 'RSI' },
  gctMs: { lo: 80, hi: 600, unit: 'ms', name: 'Contact time' },
  medballSpeed: { lo: 0, hi: 60, unit: 'mph', name: 'Throw speed' },
  medballDistance: { lo: 0, hi: 25, unit: 'm', name: 'Throw distance' },
  mcgill: { lo: 0, hi: 300, unit: 's', name: 'Hold' },
  clubhead: { lo: 30, hi: 140, unit: 'mph', name: 'Clubhead speed' },
  parallax: { lo: 0, hi: 100, unit: '', name: 'Parallax composite' },
  fps: { lo: 30, hi: 1000, unit: 'fps', name: 'Frame rate' },
  samplingHz: { lo: 1, hi: 5000, unit: 'Hz', name: 'Sampling rate' },
  weeklyHours: { lo: 0, hi: 60, unit: 'h', name: 'Weekly hours' },
  hoursSinceHard: { lo: 0, hi: 336, unit: 'h', name: 'Hours since a hard session' },
  sessions: { lo: 0, hi: 200, unit: '', name: 'RYP sessions' },
  otherSportHours: { lo: 0, hi: 40, unit: 'h', name: 'Other sport hours' },
};

/** "0-100 kg". */
export function rangeLabel(rangeKey) {
  const r = RANGES[rangeKey];
  return r ? `${r.lo}-${r.hi}${r.unit ? ` ${r.unit}` : ''}` : '';
}

const NUMBER = /^(\d+(\.\d+)?|\.\d+)$/;

/**
 * A typed trial: blank is null (clears the trial); a comma decimal is a
 * decimal point (tablet keyboards); a unit, a sign or any other character is
 * refused; a value outside the range is refused with the range.
 */
export function parseTrial(text, rangeKey) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { ok: true, value: null };
  const normalized = raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw;
  if (!NUMBER.test(normalized)) return { ok: false, error: 'Numbers only, like 32.5' };
  const value = Number(normalized);
  const r = RANGES[rangeKey];
  if (r && (value < r.lo || value > r.hi)) return { ok: false, error: `${r.name} is ${rangeLabel(rangeKey)}` };
  return { ok: true, value };
}

/** Typed text: trimmed, capped at `max`, blank is null. */
export function parseText(text, max) {
  const t = String(text ?? '').trim().slice(0, max).trim();
  return t === '' ? null : t;
}

/** `list` with `value` in slot `index`, at least `length` long, untyped slots null. */
export function setAt(list, index, value, length) {
  const src = Array.isArray(list) ? list : [];
  const n = Math.max(length, index + 1, src.length);
  const out = Array.from({ length: n }, (_, i) => (src[i] === undefined ? null : src[i]));
  out[index] = value;
  return out;
}
```

Create `frontend/src/portal/data/assessmentAccess.js`:

```js
/**
 * Who may do what with assessments (spec 3) - the client half of
 * firestore.rules' assessStaff() / assessReader(). Navigation only: the
 * rules are the boundary. `user` is useAuthSession().user.
 *   staff  - owner, ops, Phil (specialistId 'phil'), and a coach or mental
 *            account the owner gave the Assessments permission
 *            (users.assessor == true): read and write every section.
 *   reader - every other coach: read everything, write the golf section.
 *   null   - families, and anyone else.
 */
export function assessmentAccess(user) {
  if (!user) return null;
  if (user.role === 'owner' || user.role === 'ops') return 'staff';
  if (user.specialistId === 'phil') return 'staff';
  if ((user.role === 'coach' || user.role === 'mental') && user.assessor === true) return 'staff';
  if (user.role === 'coach') return 'reader';
  return null;
}

/** Settings are Phil's and the owner's (spec 4.6). */
export function canEditAssessmentSettings(user) {
  return Boolean(user) && (user.role === 'owner' || user.specialistId === 'phil');
}

/** The Assessments tab replaces Capture for Phil and assessor staff (spec 5); owners and ops reach it from Admin. */
export function showsAssessmentsTab(user) {
  return Boolean(user) && (user.specialistId === 'phil' || ((user.role === 'coach' || user.role === 'mental') && user.assessor === true));
}

/** Seed mode (the review scaffold) shows the assessment screens as Phil sees them. */
export const SEED_VIEWER = { uid: 'phil', role: 'coach', specialistId: 'phil', assessor: false };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/assessmentInput.test.js src/portal/data/assessmentAccess.test.js`
Expected: PASS (both suites).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/data/assessmentInput.js frontend/src/portal/data/assessmentInput.test.js frontend/src/portal/data/assessmentAccess.js frontend/src/portal/data/assessmentAccess.test.js
git commit -m "feat(assessments): entry ranges, trial parsing and access levels

The rules' ranges as one client table; comma decimals accepted, units and
out-of-range typos refused before they are sent; staff / reader / none.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Firestore rules for assessments

**Files:**
- Modify: `firestore.rules` - helpers after `reservedOk` (~line 165); `users` create/update (~lines 202-214); `athletes` read (~lines 246-252); new matches after `/private/medical` (~line 474); collection-group reads and `assessmentSettings` after the diagnostics collection-group block (~line 507)
- Create: `scripts/rules-probes/assessments.mjs`
- Modify: `scripts/verify-rules.mjs` - import at the top; `runPass` (~line 933)
- Test: `scripts/verify-rules.mjs` (emulator, both passes)

**Interfaces:**
- Consumes: `seed`, `del`, `call`, `createAs`, `updateAs`, `listAs`, `expect`, `token`, `t`, `BASE` exported by `scripts/verify-rules.mjs`.
- Produces (rules contract every later task writes against):
  - `athletes/{athleteId}/assessments/{season}-{kind}`: create by `assessStaff()` with exactly `{ athleteId, season, kind, protocolVersion, circuitMode, status: 'open', circuitDate, golfDate: null, mcgillDate: null, weeksOfExposure, wave: { id, position 1-4, coachUid: <caller> }, enteredBy: {}, createdAt: <server>, updatedAt: <server> }`, where `season` is the circuit date's August-July season, `protocolVersion` reads `vN.N[.N]` and `circuitMode` holds only `circuitModeOf`'s keys; update by `assessStaff()` of ONE section per write - `{ <section>, enteredBy.<section>: <caller>, updatedAt: <server> }` for a section in `readiness|log|anthro|grip|cmj|hop|medball|mcgill|golf|notTested` - or of the window fields `status|circuitDate|golfDate|mcgillDate|weeksOfExposure|wave` (+ `updatedAt`) with no section and no mark, where a change of `wave` or `circuitDate` needs the window's own stored circuit date within the last 16 days (an older open window is completed, never re-waved); update by any `coach` of `golf` (one-section form) or `golfDate` alone on an open window; CMJ holds at most 3 trials; a 10/5 set is `{ rsiBest5, gctMs }` or `{ hopRsi: [<=10], hopGctMs: [<=10] }`; a med ball write needs the profile's `season` to be the window's (the owner may correct); read by `assessReader()`; delete by the owner.
  - `athletes/{athleteId}/assessmentProfile/current`: `{ athleteId, sex, firstTestDate, medballMassKg, medballMethod, dominantHand, gripDevice, handlePosition, driver, season, updatedAt: <server>, updatedBy: <caller> }`, written by `assessStaff()`; `firstTestDate`, and within a season `medballMethod`/`medballMassKg`, fixed once set; `season` only moves forward (the owner may correct all of these).
  - `assessmentSettings/current`: written by the owner or Phil, read by every staff role; every value checked (trial counts, thresholds 0-50 or null, coefficients `{ a: -20..0, b: 0..0.1 }` per sex, `verified` and every station switch a bool, grip rest shortest <= longest).
  - Collection-group reads of `assessments` and `assessmentProfile` for `assessReader()`.
  - `users.assessor` (bool): set or changed by the owner only. An assessor coach lists every athlete.
  - `scripts/rules-probes/assessments.mjs` exports `taskAssessments()`.

- [ ] **Step 1: Write the failing probe**

Create `scripts/rules-probes/assessments.mjs`:

```js
/**
 * Assessments (docs/portal/plans/2026-10-14-assessments/00-spec.md, Sections
 * 3, 4.1-4.6): who reads and writes athletes/{id}/assessments,
 * assessmentProfile and assessmentSettings; each section's shape and ranges;
 * the golf-only coach branch; the med ball season lock; the collection-group
 * reads; the owner-only users.assessor and the assessor's athlete list. Run
 * by scripts/verify-rules.mjs in both passes. It seeds and removes everything
 * it touches; the only clock it reads is today's (recentDate's dates, and the
 * season a window dated today belongs to).
 */
import { BASE, call, createAs, del, expect, listAs, seed, t, token, updateAs } from '../verify-rules.mjs';

const dayOut = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
/** The August-July season of a date ('2026-27'), as the rules tie a window's season to its circuit date. */
const seasonFor = (iso) => {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
const SEASON = seasonFor(dayOut(0));
const NEXT_SEASON = seasonFor(dayOut(366));
const ATH = 'ath-assess';
const W = `${SEASON}-baseline`;
const W_END = `${SEASON}-end`;
const COL = `athletes/${ATH}/assessments`;
const PROFILE = `athletes/${ATH}/assessmentProfile`;
const uids = { phil: 'phil-assess-probe', assessor: 'assessor-probe', owner: 'owner-assess-probe', mental: 'mental-assess-probe', toggle: 'toggle-assess-probe' };
const tok = (u) => token(u, { email: `${u}@example.com`, email_verified: true });
const status = (r) => r.status;

/** A collection-group list as a real user; a refused query answers 403 on the response or in the stream. */
async function groupListAs(auth, collectionId) {
  const res = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId, allDescendants: true }] } }) });
  const body = await res.json().catch(() => null);
  const err = Array.isArray(body) ? body.find((r) => r && r.error)?.error : body?.error;
  return err ? err.code : res.status;
}

const windowBody = (over = {}) => ({ athleteId: ATH, season: SEASON, kind: 'baseline', protocolVersion: 'v1.2', circuitMode: { waveSize: 4 }, status: 'open',
  circuitDate: dayOut(0), golfDate: null, mcgillDate: null, weeksOfExposure: 0, wave: { id: 'wave-probe', position: 1, coachUid: uids.phil }, enteredBy: {}, ...over });
const settingsBody = (over = {}) => ({ protocolVersion: 'v1.2',
  trialCounts: { grip: 3, cmjPractice: 1, cmjScored: 2, hopPractice: 1, hopScored: 2, medballPractice: 1, medballScored: 3, clubheadWarmup: 3, clubheadMax: 5 },
  gripRestSec: { min: 15, max: 20 }, stations: { intake: true, mcgill: true }, mcgillMode: 'wave', medballSide: 'trail', golfTiming: 'within-7', waveSize: 4,
  wavesPerSession: 5, hopEntry: 'summary', rsiModEntry: 'typed',
  coefficients: { set: 'moore-2015', verified: false, boys: { a: -8.128741, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042232 } },
  thresholds: { clubhead: 2, parallax: null }, updatedBy: uids.phil, ...over });

/** A section write as hooks/assessmentsLive.js saveSection sends it: the section, enteredBy.<section>, updatedAt server time. */
const section = (auth, by, name, value, id = W, extraMarks = []) => updateAs(auth, COL, id, { [name]: value, enteredBy: { [name]: by, ...Object.fromEntries(extraMarks.map((m) => [m, by])) } },
  [name, `enteredBy.${name}`, ...extraMarks.map((m) => `enteredBy.${m}`)], ['updatedAt']);

export async function taskAssessments() {
  console.log('Assessments: staff, golf-only coaches, families none; shapes, ranges, enteredBy, the med ball lock, settings, users.assessor');
  const phil = tok(uids.phil);
  const assessor = tok(uids.assessor);
  const owner = tok(uids.owner);
  const mental = tok(uids.mental);
  const toggle = tok(uids.toggle);
  const cleanup = async () => {
    for (const id of [W, W_END, `${SEASON}-mid`, '1999-00-baseline']) await del(COL, id);
    await del(PROFILE, 'current');
    await del('assessmentSettings', 'current');
    await del('athletes', ATH);
    for (const u of [...Object.values(uids), 'new-staff-probe']) await del('users', u);
  };
  try {
    await seed('users', uids.phil, { role: 'coach', specialistId: 'phil' });
    await seed('users', uids.assessor, { role: 'coach', assessor: true });
    await seed('users', uids.owner, { role: 'owner' });
    await seed('users', uids.mental, { role: 'mental', specialistId: 'mental' });
    await seed('users', uids.toggle, { role: 'coach' });
    await seed('athletes', ATH, { name: 'Probe Athlete', householdId: 'hh', dob: '2012-04-10', contractMinutes: null, coachId: null, packageId: 't-6' });

    // The athlete list for starting a wave.
    expect('an assessor coach reads an athlete', await call('GET', `/athletes/${ATH}`, null, assessor).then(status), 200);
    expect('an assessor coach lists every athlete', await listAs(assessor, 'athletes', {}), 200);
    expect('a plain coach still cannot list every athlete', await listAs(t.coach, 'athletes', {}), 403);

    // Opening a window.
    expect('a coach without the permission cannot open a window', await createAs(t.coach, COL, W, windowBody({ wave: { id: 'w', position: 1, coachUid: 'coach-probe' } }), ['createdAt', 'updatedAt']), 403);
    expect('the window id must be season-kind', await createAs(phil, COL, `${SEASON}-mid`, windowBody(), ['createdAt', 'updatedAt']), 403);
    expect('a window cannot open complete', await createAs(phil, COL, W, windowBody({ status: 'complete' }), ['createdAt', 'updatedAt']), 403);
    expect('a window cannot open dated 20 days back', await createAs(phil, COL, W, windowBody({ circuitDate: dayOut(-20) }), ['createdAt', 'updatedAt']), 403);
    expect('a window cannot open with entries already marked', await createAs(phil, COL, W, windowBody({ enteredBy: { grip: uids.phil } }), ['createdAt', 'updatedAt']), 403);
    expect("a window cannot name another coach's wave", await createAs(phil, COL, W, windowBody({ wave: { id: 'w', position: 1, coachUid: uids.assessor } }), ['createdAt', 'updatedAt']), 403);
    expect("a window's season is its circuit date's season", await createAs(phil, COL, '1999-00-baseline', windowBody({ season: '1999-00' }), ['createdAt', 'updatedAt']), 403);
    expect('a protocol label that is not vN.N refused', await createAs(phil, COL, W, windowBody({ protocolVersion: 'junk' }), ['createdAt', 'updatedAt']), 403);
    expect('a circuit mode with keys no snapshot has refused', await createAs(phil, COL, W, windowBody({ circuitMode: { anything: 'x' } }), ['createdAt', 'updatedAt']), 403);
    expect('Phil opens a baseline window', await createAs(phil, COL, W, windowBody(), ['createdAt', 'updatedAt']), 200);
    expect('an assessor coach opens an end window', await createAs(assessor, COL, W_END, windowBody({ kind: 'end', wave: { id: 'wave-probe', position: 2, coachUid: uids.assessor } }), ['createdAt', 'updatedAt']), 200);

    // Reads: every coach and staff; never a family; never mental without the permission.
    for (const [who, auth, wanted] of [['Phil', phil, 200], ['an assessor', assessor, 200], ['a plain coach', t.coach, 200], ['ops', t.ops, 200],
      ['the owner', owner, 200], ['mental without the permission', mental, 403], ['the parent', t.parent, 403], ['an athlete login', t.athlete, 403], ['a login with no role', t.stranger, 403]]) {
      expect(`${who}: window read`, await call('GET', `/${COL}/${W}`, null, auth).then(status), wanted);
    }
    expect('a coach lists every window (collection group)', await groupListAs(t.coach, 'assessments'), 200);
    expect('a parent cannot list windows', await groupListAs(t.parent, 'assessments'), 403);
    expect('an athlete login cannot list windows', await groupListAs(t.athlete, 'assessments'), 403);

    // Sections: valid and in range, enteredBy is the writer, updatedAt is the server's.
    const grip = { right: [32.5, null, null], left: [], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' };
    expect('Phil writes grip', await section(phil, uids.phil, 'grip', grip), 200);
    expect('grip 150 kg refused', await section(phil, uids.phil, 'grip', { ...grip, right: [150] }), 403);
    expect('six grip trials refused', await section(phil, uids.phil, 'grip', { ...grip, right: [30, 30, 30, 30, 30, 30] }), 403);
    expect("grip marked as someone else's refused", await section(phil, uids.assessor, 'grip', grip), 403);
    expect('a mark on a section the write does not touch refused', await section(phil, uids.phil, 'grip', grip, W, ['cmj']), 403);
    expect('a client-chosen updatedAt refused', await updateAs(phil, COL, W, { grip, enteredBy: { grip: uids.phil }, updatedAt: new Date('2026-01-01T00:00:00Z') }, ['grip', 'enteredBy.grip', 'updatedAt']), 403);
    expect('grip beside a kind change refused', await updateAs(phil, COL, W, { grip, enteredBy: { grip: uids.phil }, kind: 'mid' }, ['grip', 'enteredBy.grip', 'kind'], ['updatedAt']), 403);
    expect('grip beside a protocol change refused', await updateAs(phil, COL, W, { grip, enteredBy: { grip: uids.phil }, protocolVersion: 'v9.9' }, ['grip', 'enteredBy.grip', 'protocolVersion'], ['updatedAt']), 403);
    expect('an assessor coach edits the same section (last writer marks it)', await section(assessor, uids.assessor, 'grip', { ...grip, left: [30.1] }), 200);
    expect('anthropometrics in range', await section(phil, uids.phil, 'anthro', { standing: [152.1, 152.3], mass: [41.0], boxHeight: 40, sittingRaw: [118.0], arm: [], hand: [] }), 200);
    expect('a 4th standing measure refused', await section(phil, uids.phil, 'anthro', { standing: [152, 152, 152, 152] }), 403);
    expect('standing height 300 cm refused', await section(phil, uids.phil, 'anthro', { standing: [300] }), 403);
    expect('a stored growth flag is not part of the shape', await section(phil, uids.phil, 'anthro', { standing: [152], growthFlag: true }), 403);
    const trial = { heightCm: 31.2, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2100, peakPowerWkg: 51.1, asymmetryPct: 6 };
    expect('CMJ trials in range', await section(phil, uids.phil, 'cmj', { trials: [trial, null], software: 'S2M 3.1', samplingHz: 1000 }), 200);
    expect('RSImod 2.5 refused', await section(phil, uids.phil, 'cmj', { trials: [{ ...trial, rsiMod: 2.5 }] }), 403);
    expect('asymmetry 61 % refused', await section(phil, uids.phil, 'cmj', { trials: [{ ...trial, asymmetryPct: 61 }] }), 403);
    expect('three CMJ trials in range', await section(phil, uids.phil, 'cmj', { trials: [trial, trial, trial], software: 'S2M 3.1', samplingHz: 1000 }), 200);
    expect('four CMJ trials refused', await section(phil, uids.phil, 'cmj', { trials: [trial, trial, trial, trial] }), 403);
    expect('two sections in one write refused', await updateAs(phil, COL, W, { grip, cmj: { trials: [trial] }, enteredBy: { grip: uids.phil, cmj: uids.phil } }, ['grip', 'cmj', 'enteredBy.grip', 'enteredBy.cmj'], ['updatedAt']), 403);
    const everyHop = { hopRsi: Array(10).fill(2.1), hopGctMs: Array(10).fill(200) };
    expect('10/5 every hop (two sets) and per set', await section(phil, uids.phil, 'hop', { sets: [everyHop, everyHop, { rsiBest5: 2.3, gctMs: 198 }] }), 200);
    expect('11 hops in a set refused', await section(phil, uids.phil, 'hop', { sets: [{ ...everyHop, hopRsi: Array(11).fill(2.1) }] }), 403);
    expect('five 10/5 sets refused', await section(phil, uids.phil, 'hop', { sets: Array(5).fill({ rsiBest5: 2.3, gctMs: 198 }) }), 403);
    expect('a 50 ms contact time refused', await section(phil, uids.phil, 'hop', { sets: [{ rsiBest5: 2.3, gctMs: 50 }] }), 403);
    expect('a set with both shapes refused', await section(phil, uids.phil, 'hop', { sets: [{ rsiBest5: 2.3, hopRsi: Array(10).fill(2.1) }] }), 403);
    expect('McGill holds in range, capped at 300', await section(phil, uids.phil, 'mcgill', { flexorSec: 300, extensorSec: 95, sideRightSec: null, sideLeftSec: null, skippedBackPain: false }), 200);
    expect('a 301 s hold refused', await section(phil, uids.phil, 'mcgill', { flexorSec: 301 }), 403);
    expect('readiness and the training log', await section(phil, uids.phil, 'readiness', { status: 'pass', reason: null, hoursSinceHardSession: 20, golfToday: false, notes: null }), 200);
    expect('an unknown readiness status refused', await section(phil, uids.phil, 'readiness', { status: 'maybe' }), 403);
    expect('the training log', await section(phil, uids.phil, 'log', { location: 'external', externalContent: 'machines', weeklyHours: 6, rypSessionsSincePrior: 0,
      golfVolume: '3 rounds a week', competitiveLevel: 'Handicap 8', otherSport: 'Soccer', otherSportHours: 4 }), 200);
    expect('a not-tested reason code', await section(phil, uids.phil, 'notTested', { medball: 'equipment' }), 200);
    expect('an unknown reason code refused', await section(phil, uids.phil, 'notTested', { medball: 'tired' }), 403);
    expect('Phil changes the circuit date within 14 days', await updateAs(phil, COL, W, { circuitDate: dayOut(-3) }, ['circuitDate'], ['updatedAt']), 200);
    expect('a circuit date 20 days back refused', await updateAs(phil, COL, W, { circuitDate: dayOut(-20) }, ['circuitDate'], ['updatedAt']), 403);
    expect('a circuit date two days ahead refused', await updateAs(phil, COL, W, { circuitDate: dayOut(2) }, ['circuitDate'], ['updatedAt']), 403);
    // A window left open past the entry window is completed, never re-waved (a new wave would type over its trials under a new date).
    const MID = `${SEASON}-mid`;
    await seed(COL, MID, { ...windowBody({ kind: 'mid', circuitDate: dayOut(-30) }), createdAt: new Date(), updatedAt: new Date() });
    expect('a window open 30 days cannot be re-waved to today', await updateAs(phil, COL, MID, { circuitDate: dayOut(0), wave: { id: 'wave-probe-2', position: 1, coachUid: uids.phil }, weeksOfExposure: 4 },
      ['circuitDate', 'wave', 'weeksOfExposure'], ['updatedAt']), 403);
    expect('a window open 30 days cannot join another wave', await updateAs(phil, COL, MID, { wave: { id: 'wave-probe-2', position: 1, coachUid: uids.phil } }, ['wave'], ['updatedAt']), 403);
    expect('a window open 30 days is still marked complete', await updateAs(phil, COL, MID, { status: 'complete' }, ['status'], ['updatedAt']), 200);
    await del(COL, MID);

    // The med ball method and mass are fixed for the season once the profile holds them.
    const profile = { athleteId: ATH, sex: 'female', firstTestDate: dayOut(0), medballMassKg: 3, medballMethod: 'speed', dominantHand: 'right',
      gripDevice: 'D1', handlePosition: '3', driver: null, season: SEASON, updatedBy: uids.phil };
    expect('Phil writes the profile', await createAs(phil, PROFILE, 'current', profile, ['updatedAt']), 200);
    expect('a parent cannot read the profile', await call('GET', `/${PROFILE}/current`, null, t.parent).then(status), 403);
    expect('a coach lists profiles (collection group)', await groupListAs(t.coach, 'assessmentProfile'), 200);
    expect('a parent cannot list profiles', await groupListAs(t.parent, 'assessmentProfile'), 403);
    const throws = { massKg: 3, side: 'trail', method: 'speed', throws: [28.4, null, null] };
    expect('med ball by the season method and mass', await section(phil, uids.phil, 'medball', throws), 200);
    expect('the other method in the same season refused', await section(phil, uids.phil, 'medball', { ...throws, method: 'distance', throws: [6.2] }), 403);
    expect('another ball in the same season refused', await section(phil, uids.phil, 'medball', { ...throws, massKg: 4 }), 403);
    expect('61 mph refused', await section(phil, uids.phil, 'medball', { ...throws, throws: [61] }), 403);
    expect('Phil updates the sex on the profile', await updateAs(phil, PROFILE, 'current', { sex: 'male', updatedBy: uids.phil }, ['sex', 'updatedBy'], ['updatedAt']), 200);
    expect('Phil cannot switch the season method', await updateAs(phil, PROFILE, 'current', { medballMethod: 'distance', updatedBy: uids.phil }, ['medballMethod', 'updatedBy'], ['updatedAt']), 403);
    expect('Phil cannot move the first test date', await updateAs(phil, PROFILE, 'current', { firstTestDate: dayOut(-1), updatedBy: uids.phil }, ['firstTestDate', 'updatedBy'], ['updatedAt']), 403);
    // "Block mixing" cannot be undone by moving the season: back to an old one and the lock would be off.
    expect('the season never moves back (with the method switched in the same write)', await updateAs(phil, PROFILE, 'current',
      { season: '1999-00', medballMethod: 'distance', medballMassKg: 4, updatedBy: uids.phil }, ['season', 'medballMethod', 'medballMassKg', 'updatedBy'], ['updatedAt']), 403);
    expect('a new season resets the method', await updateAs(phil, PROFILE, 'current', { season: NEXT_SEASON, medballMethod: null, medballMassKg: null, updatedBy: uids.phil },
      ['season', 'medballMethod', 'medballMassKg', 'updatedBy'], ['updatedAt']), 200);
    expect("a window of another season than the profile's takes no med ball from staff", await section(phil, uids.phil, 'medball', { ...throws, method: 'distance', throws: [6.2] }), 403);
    expect('and the season cannot be put back', await updateAs(phil, PROFILE, 'current', { season: SEASON, updatedBy: uids.phil }, ['season', 'updatedBy'], ['updatedAt']), 403);
    expect("the owner may still correct that window's med ball", await section(owner, uids.owner, 'medball', throws), 200);
    expect('the owner corrects a method', await updateAs(owner, PROFILE, 'current', { season: SEASON, medballMethod: 'distance', updatedBy: uids.owner },
      ['season', 'medballMethod', 'updatedBy'], ['updatedAt']), 200);

    // Golf coaches: the golf section of an open window, nothing else.
    const golf = { speeds: [88.4, 90.1], driver: 'TSR3 10.5', parallaxComposite: 72, fps: 240 };
    expect('a golf coach writes golf', await section(t.coach, 'coach-probe', 'golf', golf), 200);
    expect('a golf coach sets the golf date', await updateAs(t.coach, COL, W, { golfDate: dayOut(0) }, ['golfDate'], ['updatedAt']), 200);
    expect('clubhead 150 mph refused', await section(t.coach, 'coach-probe', 'golf', { ...golf, speeds: [150] }), 403);
    expect('nine swings refused', await section(t.coach, 'coach-probe', 'golf', { ...golf, speeds: Array(9).fill(88) }), 403);
    expect('Parallax 101 refused', await section(t.coach, 'coach-probe', 'golf', { ...golf, parallaxComposite: 101 }), 403);
    expect('a golf coach cannot write grip', await section(t.coach, 'coach-probe', 'grip', grip), 403);
    expect('a golf coach cannot change the circuit date', await updateAs(t.coach, COL, W, { circuitDate: dayOut(-1) }, ['circuitDate'], ['updatedAt']), 403);
    expect('a parent cannot write golf', await section(t.parent, 'p-probe', 'golf', golf), 403);
    expect('an assessor completes the end window', await updateAs(assessor, COL, W_END, { status: 'complete' }, ['status'], ['updatedAt']), 200);
    expect('a golf coach cannot write golf on a complete window', await section(t.coach, 'coach-probe', 'golf', golf, W_END), 403);
    expect('staff still correct a complete window', await section(phil, uids.phil, 'golf', golf, W_END), 200);

    // Delete: the owner only.
    expect('Phil cannot delete a window', await call('DELETE', `/${COL}/${W_END}`, null, phil).then(status), 403);
    expect('ops cannot delete a window', await call('DELETE', `/${COL}/${W_END}`, null, t.ops).then(status), 403);
    expect('the owner deletes a window', await call('DELETE', `/${COL}/${W_END}`, null, owner).then(status), 200);

    // Settings: Phil and the owner write; every staff role reads.
    expect('ops cannot write the settings', await createAs(t.ops, 'assessmentSettings', 'current', settingsBody({ updatedBy: 'ops-probe' }), ['updatedAt']), 403);
    expect('an assessor coach cannot write the settings', await createAs(assessor, 'assessmentSettings', 'current', settingsBody({ updatedBy: uids.assessor }), ['updatedAt']), 403);
    expect('Phil writes the settings', await createAs(phil, 'assessmentSettings', 'current', settingsBody(), ['updatedAt']), 200);
    const ownerSettings = (over) => { const body = settingsBody({ updatedBy: uids.owner, ...over }); return updateAs(owner, 'assessmentSettings', 'current', body, Object.keys(body), ['updatedAt']); };
    expect('the owner writes the settings', await ownerSettings({ protocolVersion: 'v1.2.1' }), 200);
    expect('a wave of five refused', await ownerSettings({ waveSize: 5 }), 403);
    expect('six grip trials refused', await ownerSettings({ trialCounts: { ...settingsBody().trialCounts, grip: 6 } }), 403);
    expect('four scored CMJs refused', await ownerSettings({ trialCounts: { ...settingsBody().trialCounts, cmjScored: 4 } }), 403);
    expect('a version label without the v refused', await ownerSettings({ protocolVersion: '1.2.2' }), 403);
    const coefficients = settingsBody().coefficients;
    expect('a threshold that is not a number refused', await ownerSettings({ thresholds: { clubhead: 'ten' } }), 403);
    expect('a threshold outside 0-50 % refused', await ownerSettings({ thresholds: { cmj: -50 } }), 403);
    expect('a coefficient that is not a number refused', await ownerSettings({ coefficients: { ...coefficients, boys: { a: 'abc', b: 0.0070346 } } }), 403);
    expect('a coefficient set without the girls refused', await ownerSettings({ coefficients: { set: 'moore-2015', verified: false, boys: coefficients.boys } }), 403);
    expect('the coefficient check is true or false', await ownerSettings({ coefficients: { ...coefficients, verified: 'yes' } }), 403);
    expect('a station is on or off', await ownerSettings({ stations: { grip: 'maybe' } }), 403);
    expect('the shortest grip rest is not longer than the longest', await ownerSettings({ gripRestSec: { min: 30, max: 10 } }), 403);
    expect('the owner corrects a coefficient against the paper', await ownerSettings({ coefficients: { ...coefficients, verified: true, boys: { a: -8.1, b: 0.007 } } }), 200);
    expect('another document id refused', await createAs(phil, 'assessmentSettings', 'draft', settingsBody(), ['updatedAt']), 403);
    for (const [who, auth, wanted] of [['a plain coach', t.coach, 200], ['mental', mental, 200], ['ops', t.ops, 200], ['the parent', t.parent, 403], ['an athlete login', t.athlete, 403]]) {
      expect(`${who}: settings read`, await call('GET', '/assessmentSettings/current', null, auth).then(status), wanted);
    }

    // users.assessor is the owner's to give.
    expect('ops cannot give the Assessments permission', await updateAs(t.ops, 'users', uids.toggle, { assessor: true }), 403);
    expect('the owner gives it', await updateAs(owner, 'users', uids.toggle, { assessor: true }), 200);
    expect('it is a bool', await updateAs(owner, 'users', uids.toggle, { assessor: 'yes' }), 403);
    expect('nobody gives it to themselves', await updateAs(toggle, 'users', uids.toggle, { assessor: false }), 403);
    expect('ops cannot create a staff account that has it', await createAs(t.ops, 'users', 'new-staff-probe', { role: 'coach', assessor: true }, []), 403);
    expect('ops still creates a staff account without it', await createAs(t.ops, 'users', 'new-staff-probe', { role: 'coach' }, []), 200);
  } finally {
    await cleanup();
  }
}
```

- [ ] **Step 2: Wire the probe into the runner and run it to verify it fails**

In `scripts/verify-rules.mjs`, add the import after the existing `import { fsFields, fsValue, localEmulatorHost, LOCAL_HOSTS } from './lib/firestore-rest.mjs';` line:

```js
import { taskAssessments } from './rules-probes/assessments.mjs';
```

and in `runPass`, replace:

```js
    await taskSeats(); await taskPast(); await taskWaitlist(); await taskSingle(); await taskScholarship(); await taskReserved(); await taskReissue();
```

with:

```js
    await taskSeats(); await taskPast(); await taskWaitlist(); await taskSingle(); await taskScholarship(); await taskReserved(); await taskReissue();
    await taskAssessments();
```

Run: `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"` (from the worktree root; prepend the JDK to PATH first if `java` is not found: `export PATH="/c/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot/bin:$PATH"` in Git Bash).
Expected: FAIL - the run ends `N FAILED`; the Assessments lines that need the new rules (for example `PASS ... Phil opens a baseline window -> 403 (wanted 200)` shows as `FAIL`), while every earlier task still passes.

- [ ] **Step 3: Add the rules helpers**

In `firestore.rules`, replace:

```
    function reservedOk(s, a) {
      return !(s.get('maxHandicap', null) is int)
        || (a.get('handicap', null) is int && a.handicap <= s.maxHandicap);
    }
```

with:

```
    function reservedOk(s, a) {
      return !(s.get('maxHandicap', null) is int)
        || (a.get('handicap', null) is int && a.handicap <= s.maxHandicap);
    }

    // ---- assessments helpers (2026-10-14, Phil's protocol v1.2) ---------
    // docs/portal/plans/2026-10-14-assessments/00-spec.md, Section 3. Raw
    // assessment data is staff-only. assessStaff(): the owner and ops, Phil
    // (specialistId 'phil') and any coach or mental account the owner gave
    // the Assessments permission (users.assessor == true) - read and write
    // every section. assessReader(): those, plus every other coach, who
    // reads everything and writes the golf section only. Families never read
    // raw data. data/assessmentAccess.js is the client half.
    function assessStaff() {
      return me().role in ['ops', 'owner']
        || me().get('specialistId', null) == 'phil'
        || (me().role in ['coach', 'mental'] && me().get('assessor', false) == true);
    }
    function assessReader() {
      return assessStaff() || me().role == 'coach';
    }
    // Spec 4.4 ranges - the same table as data/assessmentInput.js RANGES.
    // The list checks are written out index by index, with no nested calls:
    // Firestore caps the expressions one request may evaluate, and a
    // section's trials are checked on every write of that section.
    function inRange(v, lo, hi) {
      return v is number && v >= lo && v <= hi;
    }
    function optNum(v, lo, hi) {
      return v == null || (v is number && v >= lo && v <= hi);
    }
    function optText(v, max) {
      return v == null || (v is string && v.size() <= max);
    }
    function optOneOf(v, values) {
      return v == null || v in values;
    }
    // Up to N trials, each a number in range or null (not typed yet).
    function trials3(l, lo, hi) {
      return l is list && l.size() <= 3
        && (l.size() < 1 || optNum(l[0], lo, hi))
        && (l.size() < 2 || optNum(l[1], lo, hi))
        && (l.size() < 3 || optNum(l[2], lo, hi));
    }
    function trials5(l, lo, hi) {
      return l is list && l.size() <= 5
        && (l.size() < 1 || optNum(l[0], lo, hi))
        && (l.size() < 2 || optNum(l[1], lo, hi))
        && (l.size() < 3 || optNum(l[2], lo, hi))
        && (l.size() < 4 || optNum(l[3], lo, hi))
        && (l.size() < 5 || optNum(l[4], lo, hi));
    }
    function trials8(l, lo, hi) {
      return l is list && l.size() <= 8
        && (l.size() < 1 || optNum(l[0], lo, hi))
        && (l.size() < 2 || optNum(l[1], lo, hi))
        && (l.size() < 3 || optNum(l[2], lo, hi))
        && (l.size() < 4 || optNum(l[3], lo, hi))
        && (l.size() < 5 || optNum(l[4], lo, hi))
        && (l.size() < 6 || optNum(l[5], lo, hi))
        && (l.size() < 7 || optNum(l[6], lo, hi))
        && (l.size() < 8 || optNum(l[7], lo, hi));
    }
    function isoDate(s) {
      return s is string && s.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}');
    }
    // Spec 4.1: a coach-set date is within 14 days of entry and never ahead
    // of today. timestamp.date() is midnight UTC; an academy (Chicago) date
    // is never ahead of the UTC date, and 16 days back covers 14 Chicago
    // days plus the time zone. An invalid date (2026-02-30) errors and is
    // refused. data/assessmentWindows.js circuitDateProblem is exact.
    function recentDate(s) {
      let p = s.split('-');
      let day = timestamp.date(int(p[0]), int(p[1]), int(p[2]));
      return day > request.time - duration.value(16, 'd')
        && day < request.time + duration.value(1, 'd');
    }
    // The August-July season a 'YYYY-MM-DD' date falls in ('2026-27' for
    // 2026-11-03; data/assessmentWindows.js seasonOf): a window's season is
    // its circuit date's.
    function seasonOk(season, date) {
      let p = date.split('-');
      let start = int(p[1]) >= 8 ? int(p[0]) : int(p[0]) - 1;
      let s = season.split('-');
      return s.size() == 2 && int(s[0]) == start && int(s[1]) == (start + 1) % 100;
    }
```

- [ ] **Step 4: The users guard and the assessor's athlete read**

In `firestore.rules`, replace:

```
    match /users/{userId} {
      allow read: if signedIn()
        && (request.auth.uid == userId || me().role in ['ops', 'owner']);

      allow create: if signedIn() && me().role in ['ops', 'owner']
        && (me().role == 'owner' || request.resource.data.role != 'owner');
```

with:

```
    match /users/{userId} {
      allow read: if signedIn()
        && (request.auth.uid == userId || me().role in ['ops', 'owner']);

      // 2026-10-14 (assessments spec 3): users.assessor - the Assessments
      // permission - is the owner's to give (Staff & Roles). A bool; no other
      // staff write may set or change it, and the member self-write below
      // never names it.
      function assessorOk(touched) {
        return request.resource.data.get('assessor', false) is bool
          && (me().role == 'owner' || !touched);
      }

      allow create: if signedIn() && me().role in ['ops', 'owner']
        && (me().role == 'owner' || request.resource.data.role != 'owner')
        && assessorOk(request.resource.data.keys().hasAny(['assessor']));
```

Then replace:

```
          && !(
            userId == request.auth.uid
            && me().role != 'owner'
            && request.resource.data.diff(resource.data).affectedKeys().hasAny(['role'])
          )
        )
```

with:

```
          && !(
            userId == request.auth.uid
            && me().role != 'owner'
            && request.resource.data.diff(resource.data).affectedKeys().hasAny(['role'])
          )
          && assessorOk(request.resource.data.diff(resource.data).affectedKeys().hasAny(['assessor']))
        )
```

Then, in the `athletes` read rule, replace:

```
        || me().role in ['mental', 'ops', 'owner']
        || me().get('specialistId', null) != null
      );

      // Sprint 10 (contract v1.8, A "Enrollment"): the FIRST client write on
```

with:

```
        || me().role in ['mental', 'ops', 'owner']
        || me().get('specialistId', null) != null
        // 2026-10-14 (assessments spec 3, 5): a coach with the Assessments
        // permission lists every academy athlete to start a wave.
        || (me().role == 'coach' && me().get('assessor', false) == true)
      );

      // Sprint 10 (contract v1.8, A "Enrollment"): the FIRST client write on
```

- [ ] **Step 5: The window and profile matches**

In `firestore.rules`, replace:

```
        allow create: if signedIn() && me().role in ['ops', 'owner'];
      }
    }

    // ---- diagnostics collection-group read ------------------------------
```

with:

```
        allow create: if signedIn() && me().role in ['ops', 'owner'];
      }

      // ---- athletes/{id}/assessments/{windowId} ------------------------
      // 2026-10-14 (assessments spec 4.1). One doc per athlete per test
      // window, id '{season}-{kind}' ('2026-27-baseline'). assessStaff()
      // reads and writes every section; any other coach reads and writes the
      // golf section of an OPEN window (golf coaches enter clubhead speed and
      // Parallax from their own logins). Families never read it. Writes are
      // client writes (hooks/assessmentsLive.js), so this block is the
      // boundary:
      //   - create: a window opens at the start of a wave - fixed shape,
      //     status 'open', no entries marked, server times;
      //   - update: ONE section per write (saveSection), with
      //     enteredBy[section] == the writer and no other mark moved; or the
      //     window's own fields (status, dates, weeks, wave) with no section
      //     and no mark; updatedAt is always the server time; athleteId,
      //     season, kind, protocolVersion, circuitMode and createdAt never
      //     change. One section per write keeps each request inside
      //     Firestore's per-request expression cap: only that section's
      //     trials are checked;
      //   - every value in range (spec 4.4);
      //   - the med ball method and mass are fixed for the season once the
      //     profile holds them (Phil: "block mixing");
      //   - delete: the owner only.
      // No score is ever stored here: scores are computed from these trials
      // (data/assessmentScoring.js).
      match /assessments/{windowId} {
        function waveOk(w) {
          return w is map && w.keys().hasOnly(['id', 'position', 'coachUid'])
            && w.id is string && w.id.size() > 0 && w.id.size() <= 48
            && w.position is int && w.position >= 1 && w.position <= 4
            && w.coachUid == request.auth.uid;
        }
        function weeksOk(d) {
          return d.get('weeksOfExposure', null) == null
            || (d.weeksOfExposure is int && d.weeksOfExposure >= 0 && d.weeksOfExposure <= 520);
        }
        function readinessOk(r) {
          return r is map
            && r.keys().hasOnly(['status', 'reason', 'hoursSinceHardSession', 'golfToday', 'notes'])
            && optOneOf(r.get('status', null), ['pass', 'not-tested'])
            && optOneOf(r.get('reason', null), ['absent', 'ill', 'pain', 'injury', 'equipment'])
            && optNum(r.get('hoursSinceHardSession', null), 0, 336)
            && (r.get('golfToday', null) == null || r.golfToday is bool)
            && optText(r.get('notes', null), 500);
        }
        function logOk(l) {
          return l is map
            && l.keys().hasOnly(['location', 'externalContent', 'weeklyHours', 'rypSessionsSincePrior', 'golfVolume', 'competitiveLevel', 'otherSport', 'otherSportHours'])
            && optOneOf(l.get('location', null), ['ryp', 'external', 'none'])
            && optOneOf(l.get('externalContent', null), ['machines', 'bodyweight', 'class'])
            && optNum(l.get('weeklyHours', null), 0, 60)
            && optNum(l.get('rypSessionsSincePrior', null), 0, 200)
            && optText(l.get('golfVolume', null), 80)
            && optText(l.get('competitiveLevel', null), 80)
            && optText(l.get('otherSport', null), 40)
            && optNum(l.get('otherSportHours', null), 0, 40);
        }
        function anthroOk(a) {
          return a is map
            && a.keys().hasOnly(['standing', 'mass', 'boxHeight', 'sittingRaw', 'arm', 'hand'])
            && trials3(a.get('standing', []), 90, 215)
            && trials3(a.get('mass', []), 15, 160)
            && optNum(a.get('boxHeight', null), 20, 80)
            && trials3(a.get('sittingRaw', []), 40, 140)
            && trials3(a.get('arm', []), 40, 110)
            && trials3(a.get('hand', []), 10, 25);
        }
        function gripOk(g) {
          return g is map
            && g.keys().hasOnly(['right', 'left', 'deviceRight', 'deviceLeft', 'handlePosition', 'dominant'])
            && trials5(g.get('right', []), 0, 100)
            && trials5(g.get('left', []), 0, 100)
            && optText(g.get('deviceRight', null), 40)
            && optText(g.get('deviceLeft', null), 40)
            && optText(g.get('handlePosition', null), 40)
            && optOneOf(g.get('dominant', null), ['right', 'left']);
        }
        function cmjTrialOk(t) {
          return t == null || (t is map
            && t.keys().hasOnly(['heightCm', 'rsiMod', 'timeToTakeoffMs', 'peakPowerW', 'peakPowerWkg', 'asymmetryPct'])
            && optNum(t.get('heightCm', null), 0, 90)
            && optNum(t.get('rsiMod', null), 0, 2)
            && optNum(t.get('timeToTakeoffMs', null), 100, 2000)
            && optNum(t.get('peakPowerW', null), 0, 8000)
            && optNum(t.get('peakPowerWkg', null), 0, 100)
            && optNum(t.get('asymmetryPct', null), 0, 60));
        }
        function cmjOk(c) {
          let l = c.get('trials', []);
          return c is map
            && c.keys().hasOnly(['trials', 'software', 'samplingHz'])
            && l is list && l.size() <= 3
            && (l.size() < 1 || cmjTrialOk(l[0]))
            && (l.size() < 2 || cmjTrialOk(l[1]))
            && (l.size() < 3 || cmjTrialOk(l[2]))
            && optText(c.get('software', null), 40)
            && optNum(c.get('samplingHz', null), 1, 5000);
        }
        // A 10/5 set is Smart2Move's per-set summary { rsiBest5, gctMs }, or
        // every hop as two parallel lists { hopRsi, hopGctMs } (the hopEntry
        // setting) - never both. Every-hop values are checked for shape
        // here, not type or range: two sets of twenty values each are past
        // what one request may evaluate (measured on the emulator: a value-
        // by-value type check passes one set and refuses a second for cost
        // alone). data/assessmentInput.js holds their ranges (rsi 0-5,
        // gctMs 80-600) and never sends a value outside them, and
        // data/assessmentScoring.js hopSet scores numbers only.
        function hopSetOk(s) {
          return s == null || (s is map && (
            (s.keys().hasOnly(['rsiBest5', 'gctMs'])
              && optNum(s.get('rsiBest5', null), 0, 5)
              && optNum(s.get('gctMs', null), 80, 600))
            || (s.keys().hasOnly(['hopRsi', 'hopGctMs'])
              && s.get('hopRsi', []) is list && s.get('hopRsi', []).size() <= 10
              && s.get('hopGctMs', []) is list && s.get('hopGctMs', []).size() <= 10)));
        }
        function hopOk(h) {
          let l = h.get('sets', []);
          return h is map && h.keys().hasOnly(['sets'])
            && l is list && l.size() <= 4
            && (l.size() < 1 || hopSetOk(l[0]))
            && (l.size() < 2 || hopSetOk(l[1]))
            && (l.size() < 3 || hopSetOk(l[2]))
            && (l.size() < 4 || hopSetOk(l[3]));
        }
        // The profile holds the season's method and mass, so a med ball
        // write needs the profile to be in the window's own season (a
        // profile moved to another season would otherwise switch the lock
        // off) and then matches it. The owner may correct.
        function medballMatches(p, m) {
          return (p.get('season', null) == null || p.season == request.resource.data.season)
            && (p.get('medballMethod', null) == null || p.medballMethod == m.method)
            && (p.get('medballMassKg', null) == null || m.get('massKg', null) == null || p.medballMassKg == m.massKg);
        }
        function medballLockOk(m) {
          let path = /databases/$(database)/documents/athletes/$(athleteId)/assessmentProfile/current;
          return !exists(path) || me().role == 'owner' || medballMatches(get(path).data, m);
        }
        function medballOk(m) {
          return m is map
            && m.keys().hasOnly(['massKg', 'side', 'method', 'throws'])
            && optOneOf(m.get('massKg', null), [2, 3, 4])
            && optOneOf(m.get('side', null), ['trail', 'dominant'])
            && m.get('method', null) in ['speed', 'distance']
            && (m.method == 'speed' ? trials5(m.get('throws', []), 0, 60) : trials5(m.get('throws', []), 0, 25))
            && medballLockOk(m);
        }
        function mcgillOk(m) {
          return m is map
            && m.keys().hasOnly(['flexorSec', 'extensorSec', 'sideRightSec', 'sideLeftSec', 'skippedBackPain'])
            && optNum(m.get('flexorSec', null), 0, 300)
            && optNum(m.get('extensorSec', null), 0, 300)
            && optNum(m.get('sideRightSec', null), 0, 300)
            && optNum(m.get('sideLeftSec', null), 0, 300)
            && (m.get('skippedBackPain', null) == null || m.skippedBackPain is bool);
        }
        function golfOk(g) {
          return g is map
            && g.keys().hasOnly(['speeds', 'driver', 'parallaxComposite', 'fps'])
            && trials8(g.get('speeds', []), 30, 140)
            && optText(g.get('driver', null), 40)
            && optNum(g.get('parallaxComposite', null), 0, 100)
            && optNum(g.get('fps', null), 30, 1000);
        }
        function notTestedOk(n) {
          let codes = ['absent', 'ill', 'pain', 'injury', 'equipment'];
          return n is map
            && n.keys().hasOnly(['readiness', 'anthro', 'grip', 'cmj', 'hop', 'medball', 'mcgill', 'golf'])
            && optOneOf(n.get('readiness', null), codes) && optOneOf(n.get('anthro', null), codes)
            && optOneOf(n.get('grip', null), codes) && optOneOf(n.get('cmj', null), codes)
            && optOneOf(n.get('hop', null), codes) && optOneOf(n.get('medball', null), codes)
            && optOneOf(n.get('mcgill', null), codes) && optOneOf(n.get('golf', null), codes);
        }
        // One section written, marked as the writer's, no other mark moved.
        function sectionWrite(d, changed, marks, s) {
          return changed.hasOnly([s, 'enteredBy', 'updatedAt'])
            && marks.hasOnly([s])
            && d.enteredBy.get(s, null) == request.auth.uid;
        }
        // The window's own fields: no section and no mark. Moving a window
        // into a wave or to another circuit date needs its stored circuit
        // date to be recent too: a window left open past the entry window
        // is completed, never re-waved over its trials.
        function fieldsWrite(d, changed, marks) {
          return changed.hasOnly(['status', 'circuitDate', 'golfDate', 'mcgillDate', 'weeksOfExposure', 'wave', 'updatedAt'])
            && marks.size() == 0
            && d.status in ['open', 'complete']
            && (!changed.hasAny(['wave', 'circuitDate']) || (isoDate(resource.data.circuitDate) && recentDate(resource.data.circuitDate)))
            && (!changed.hasAny(['circuitDate']) || (isoDate(d.circuitDate) && recentDate(d.circuitDate) && seasonOk(d.season, d.circuitDate)))
            && (!changed.hasAny(['golfDate']) || d.golfDate == null || (isoDate(d.golfDate) && recentDate(d.golfDate)))
            && (!changed.hasAny(['mcgillDate']) || d.mcgillDate == null || (isoDate(d.mcgillDate) && recentDate(d.mcgillDate)))
            && (!changed.hasAny(['weeksOfExposure']) || weeksOk(d))
            && (!changed.hasAny(['wave']) || waveOk(d.wave));
        }
        function windowCreateOk() {
          let d = request.resource.data;
          return d.keys().hasOnly(['athleteId', 'season', 'kind', 'protocolVersion', 'circuitMode', 'status', 'circuitDate', 'golfDate', 'mcgillDate', 'weeksOfExposure', 'wave', 'enteredBy', 'createdAt', 'updatedAt'])
            && d.keys().hasAll(['athleteId', 'season', 'kind', 'protocolVersion', 'circuitMode', 'status', 'circuitDate', 'wave', 'enteredBy', 'createdAt', 'updatedAt'])
            && d.athleteId == athleteId
            && d.season is string && d.season.matches('[0-9]{4}-[0-9]{2}')
            && d.kind in ['baseline', 'mid', 'end']
            && windowId == d.season + '-' + d.kind
            && d.protocolVersion is string && d.protocolVersion.size() <= 16 && d.protocolVersion.matches('v[0-9]+[.][0-9]+([.][0-9]+)?')
            && d.circuitMode is map
            && d.circuitMode.keys().hasOnly(['trialCounts', 'gripRestSec', 'stations', 'mcgillMode', 'medballSide', 'golfTiming', 'waveSize', 'hopEntry', 'rsiModEntry', 'coefficientSet', 'coefficientsVerified'])
            && d.status == 'open'
            && isoDate(d.circuitDate) && recentDate(d.circuitDate) && seasonOk(d.season, d.circuitDate)
            && d.get('golfDate', null) == null && d.get('mcgillDate', null) == null
            && weeksOk(d)
            && waveOk(d.wave)
            && d.enteredBy is map && d.enteredBy.size() == 0
            && d.createdAt == request.time && d.updatedAt == request.time;
        }
        function staffUpdateOk() {
          let d = request.resource.data;
          let changed = d.diff(resource.data).affectedKeys();
          let marks = d.enteredBy.diff(resource.data.enteredBy).affectedKeys();
          return d.updatedAt == request.time
            && (fieldsWrite(d, changed, marks)
              || (sectionWrite(d, changed, marks, 'readiness') && readinessOk(d.readiness))
              || (sectionWrite(d, changed, marks, 'log') && logOk(d.log))
              || (sectionWrite(d, changed, marks, 'anthro') && anthroOk(d.anthro))
              || (sectionWrite(d, changed, marks, 'grip') && gripOk(d.grip))
              || (sectionWrite(d, changed, marks, 'cmj') && cmjOk(d.cmj))
              || (sectionWrite(d, changed, marks, 'hop') && hopOk(d.hop))
              || (sectionWrite(d, changed, marks, 'medball') && medballOk(d.medball))
              || (sectionWrite(d, changed, marks, 'mcgill') && mcgillOk(d.mcgill))
              || (sectionWrite(d, changed, marks, 'golf') && golfOk(d.golf))
              || (sectionWrite(d, changed, marks, 'notTested') && notTestedOk(d.notTested)));
        }
        // Any coach: the golf section, or the golf date, of an open window.
        function golfUpdateOk() {
          let d = request.resource.data;
          let changed = d.diff(resource.data).affectedKeys();
          let marks = d.enteredBy.diff(resource.data.enteredBy).affectedKeys();
          return resource.data.status == 'open'
            && d.updatedAt == request.time
            && ((sectionWrite(d, changed, marks, 'golf') && golfOk(d.golf))
              || (changed.hasOnly(['golfDate', 'updatedAt']) && (d.golfDate == null || (isoDate(d.golfDate) && recentDate(d.golfDate)))));
        }
        allow read: if signedIn() && assessReader();
        allow create: if signedIn() && assessStaff() && windowCreateOk();
        allow update: if signedIn() && (
          (assessStaff() && staffUpdateOk())
          || (me().role == 'coach' && golfUpdateOk())
        );
        allow delete: if signedIn() && me().role == 'owner';
      }

      // ---- athletes/{id}/assessmentProfile/current ----------------------
      // 2026-10-14 (assessments spec 4.2): sex (entered by the coach at
      // intake), the first-test date that anchors the rolling baseline, the
      // season's med ball mass and method, device and handle position. Staff
      // only, like the windows.
      match /assessmentProfile/{docId} {
        function profileOk() {
          let d = request.resource.data;
          return docId == 'current'
            && d.keys().hasOnly(['athleteId', 'sex', 'firstTestDate', 'medballMassKg', 'medballMethod', 'dominantHand', 'gripDevice', 'handlePosition', 'driver', 'season', 'updatedAt', 'updatedBy'])
            && d.athleteId == athleteId
            && optOneOf(d.get('sex', null), ['male', 'female'])
            && (d.get('firstTestDate', null) == null || isoDate(d.firstTestDate))
            && optOneOf(d.get('medballMassKg', null), [2, 3, 4])
            && optOneOf(d.get('medballMethod', null), ['speed', 'distance'])
            && optOneOf(d.get('dominantHand', null), ['right', 'left'])
            && optText(d.get('gripDevice', null), 40)
            && optText(d.get('handlePosition', null), 40)
            && optText(d.get('driver', null), 40)
            && (d.get('season', null) == null || (d.season is string && d.season.matches('[0-9]{4}-[0-9]{2}')))
            && d.updatedAt == request.time
            && d.updatedBy == request.auth.uid;
        }
        // Phil: "block mixing" - within a season the med ball method and
        // mass never change once set, and the first-test date never moves.
        // The season only moves forward ('2026-27' -> '2027-28'): moving it
        // back, or to an old one, would switch the lock off. The owner may
        // correct a mistake.
        function profileLockOk() {
          let before = resource.data;
          let after = request.resource.data;
          let was = before.get('season', null);
          let now = after.get('season', null);
          return (before.get('firstTestDate', null) == null || after.get('firstTestDate', null) == before.firstTestDate)
            && (was == now
              ? ((before.get('medballMethod', null) == null || after.get('medballMethod', null) == before.medballMethod)
                && (before.get('medballMassKg', null) == null || after.get('medballMassKg', null) == before.medballMassKg))
              : (was == null || (now is string && now > was)));
        }
        allow read: if signedIn() && assessReader();
        allow create: if signedIn() && assessStaff() && profileOk();
        allow update: if signedIn() && assessStaff() && profileOk() && (me().role == 'owner' || profileLockOk());
        allow delete: if signedIn() && me().role == 'owner';
      }
    }

    // ---- diagnostics collection-group read ------------------------------
```

- [ ] **Step 6: The collection-group reads and the settings doc**

In `firestore.rules`, replace:

```
    match /{path=**}/diagnostics/{captureId} {
      allow read: if signedIn() && (
        me().role in ['mental', 'ops', 'owner']
        || me().get('specialistId', null) != null
        || (me().role == 'coach' && athleteData(resource.data.athleteId).coachId == request.auth.uid)
      );
    }
```

with:

```
    match /{path=**}/diagnostics/{captureId} {
      allow read: if signedIn() && (
        me().role in ['mental', 'ops', 'owner']
        || me().get('specialistId', null) != null
        || (me().role == 'coach' && athleteData(resource.data.athleteId).coachId == request.auth.uid)
      );
    }

    // ---- assessments collection-group reads (2026-10-14) ---------------
    // The list, the wave and the admin "Baseline due" row read every window
    // (and every profile) in one unfiltered collectionGroup query - no index
    // needed. The condition never reads the document, so the list is
    // provable for exactly the assessReader() set the per-doc rules allow.
    match /{path=**}/assessments/{windowId} {
      allow read: if signedIn() && assessReader();
    }
    match /{path=**}/assessmentProfile/{docId} {
      allow read: if signedIn() && assessReader();
    }

    // ---- assessmentSettings/current (2026-10-14, spec 4.6) --------------
    // Procedure details are settings, not code: Phil (specialistId 'phil')
    // and the owner edit them; every staff role reads them. Trial counts are
    // capped where the window rules stop checking (data/assessmentSettings.js
    // TRIAL_LIMITS); the version label is 'v1.2' or 'v1.2.1'. Every value
    // the scoring reads is checked too (data/assessmentInput.js RANGES
    // thresholdPct, coefficientA, coefficientB): a threshold is 0-50 % or
    // null (no marker), each Moore coefficient a number, the coefficient
    // check and every station switch a bool, grip rest shortest <= longest.
    match /assessmentSettings/{docId} {
      function countOk(c, key, lo, hi) {
        return c.get(key, null) is int && c[key] >= lo && c[key] <= hi;
      }
      function thresholdOk(t, key) {
        return t.get(key, null) == null || inRange(t[key], 0, 50);
      }
      function stationOk(s, key) {
        return s.get(key, true) is bool;
      }
      function coefficientOk(c) {
        return c is map && c.keys().hasOnly(['a', 'b'])
          && inRange(c.get('a', null), -20, 0) && inRange(c.get('b', null), 0, 0.1);
      }
      function settingsOk() {
        let d = request.resource.data;
        let c = d.get('trialCounts', {});
        return docId == 'current'
          && d.keys().hasOnly(['protocolVersion', 'trialCounts', 'gripRestSec', 'stations', 'mcgillMode', 'medballSide', 'golfTiming', 'waveSize', 'wavesPerSession', 'hopEntry', 'rsiModEntry', 'coefficients', 'thresholds', 'updatedAt', 'updatedBy'])
          && d.keys().hasAll(['protocolVersion', 'trialCounts', 'gripRestSec', 'stations', 'mcgillMode', 'medballSide', 'golfTiming', 'waveSize', 'wavesPerSession', 'hopEntry', 'rsiModEntry', 'coefficients', 'thresholds', 'updatedAt', 'updatedBy'])
          && d.protocolVersion is string && d.protocolVersion.matches('v[0-9]+[.][0-9]+([.][0-9]+)?')
          && c is map
          && c.keys().hasOnly(['grip', 'cmjPractice', 'cmjScored', 'hopPractice', 'hopScored', 'medballPractice', 'medballScored', 'clubheadWarmup', 'clubheadMax'])
          && countOk(c, 'grip', 1, 5) && countOk(c, 'cmjPractice', 0, 3) && countOk(c, 'cmjScored', 1, 3)
          && countOk(c, 'hopPractice', 0, 2) && countOk(c, 'hopScored', 1, 4)
          && countOk(c, 'medballPractice', 0, 3) && countOk(c, 'medballScored', 1, 5)
          && countOk(c, 'clubheadWarmup', 0, 5) && countOk(c, 'clubheadMax', 1, 8)
          && d.gripRestSec is map && d.gripRestSec.keys().hasOnly(['min', 'max'])
          && inRange(d.gripRestSec.get('min', null), 0, 120) && inRange(d.gripRestSec.get('max', null), 0, 120)
          && d.gripRestSec.min <= d.gripRestSec.max
          && d.stations is map
          && d.stations.keys().hasOnly(['intake', 'anthro', 'grip', 'cmj', 'hop', 'medball', 'mcgill', 'segments', 'keiser'])
          && stationOk(d.stations, 'intake') && stationOk(d.stations, 'anthro') && stationOk(d.stations, 'grip')
          && stationOk(d.stations, 'cmj') && stationOk(d.stations, 'hop') && stationOk(d.stations, 'medball')
          && stationOk(d.stations, 'mcgill') && stationOk(d.stations, 'segments') && stationOk(d.stations, 'keiser')
          && d.mcgillMode in ['wave', 'separate']
          && d.medballSide in ['trail', 'dominant']
          && d.golfTiming in ['same-day', 'within-7']
          && d.waveSize is int && d.waveSize >= 1 && d.waveSize <= 4
          && d.wavesPerSession is int && d.wavesPerSession >= 1 && d.wavesPerSession <= 10
          && d.hopEntry in ['summary', 'per-hop']
          && d.rsiModEntry in ['typed', 'computed']
          && d.coefficients is map
          && d.coefficients.keys().hasOnly(['set', 'verified', 'boys', 'girls'])
          && d.coefficients.get('set', null) is string && d.coefficients.set.size() <= 40
          && d.coefficients.get('verified', null) is bool
          && coefficientOk(d.coefficients.get('boys', null)) && coefficientOk(d.coefficients.get('girls', null))
          && d.thresholds is map
          && d.thresholds.keys().hasOnly(['clubhead', 'cmj', 'hop', 'medball', 'grip', 'parallax'])
          && thresholdOk(d.thresholds, 'clubhead') && thresholdOk(d.thresholds, 'cmj') && thresholdOk(d.thresholds, 'hop')
          && thresholdOk(d.thresholds, 'medball') && thresholdOk(d.thresholds, 'grip') && thresholdOk(d.thresholds, 'parallax')
          && d.updatedAt == request.time
          && d.updatedBy == request.auth.uid;
      }
      allow read: if signedIn() && me().role in ['coach', 'mental', 'ops', 'owner'];
      allow create, update: if signedIn()
        && (me().role == 'owner' || me().get('specialistId', null) == 'phil')
        && settingsOk();
    }
```

- [ ] **Step 7: Run the probe to verify it passes**

Run: `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"`
Expected: PASS - the self-check lines pass, every `Assessments:` line reads PASS in Pass A and Pass B, and the run ends `ALL PASS (both passes)`.

- [ ] **Step 8: Commit**

```bash
git add firestore.rules scripts/rules-probes/assessments.mjs scripts/verify-rules.mjs
git commit -m "feat(rules): assessments windows, profiles, settings and the assessor permission

Staff write every section, other coaches the golf section of an open
window, families nothing; per-section shapes and spec ranges; enteredBy is
the writer; a window's season is its circuit date's and an old open window
is never re-waved; the med ball method is fixed for the season and the
season only moves forward; every settings value is checked;
users.assessor is the owner's to give.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Live data adapter

**Files:**
- Create: `frontend/src/portal/hooks/assessmentsLive.js`
- Test: `frontend/src/portal/hooks/assessmentsLive.test.js`

**Interfaces:**
- Consumes: `ERR`, `LiveDataError`, `isLive`, `requireUser`, `wrap` (`hooks/live.js`); `bump` (`hooks/invalidate.js`); `academyDateISO` (`data/calendar.js`); `SETTINGS_KEYS`, `circuitModeOf`, `validVersionLabel`, `withDefaults` (Task 2); `ASSESSMENT_SECTIONS`, `KINDS`, `seasonOf`, `staleOpen`, `weeksBetween`, `windowIdFor` (Task 2); the rules contract of Task 4.
- Produces:
  - `ASSESSMENTS_KEY = 'assessments'`, `ASSESSMENT_SETTINGS_KEY = 'assessmentSettings'`, `WINDOW_FIELDS`, `PROFILE_FIELDS`, `MAX_WAVE = 4`
  - `fetchAssessmentSettings(): Promise<object|null>`
  - `fetchAllAssessmentWindows(): Promise<Window[]>` (collection group; each row `{ id, athleteId, ...doc }`)
  - `fetchAthleteWindows(athleteId): Promise<Window[]>`
  - `fetchAllAssessmentProfiles(): Promise<Profile[]>`, `fetchAssessmentProfile(athleteId): Promise<Profile|null>`
  - `startWave({ waveId, circuitDate, entries: { athleteId, kind, position }[], settings, today? }): Promise<{ waveId, started: string[], skipped: { athleteId, reason: 'complete'|'stale' }[] }>` (`today` defaults to `academyDateISO()`)
  - `saveSection({ athleteId, windowId, section, value }): Promise<{ section }>` (never bumps; last writer wins - the circuit runs on one shared tablet)
  - `saveWindowFields({ athleteId, windowId, fields }): Promise<object>` (bumps only for `status`)
  - `saveAssessmentProfile({ athleteId, patch }): Promise<object>`
  - `saveAssessmentSettings(settings): Promise<{ protocolVersion }>`
  - `setStaffAssessor({ uid, assessor: boolean }): Promise<{ uid, assessor }>` (bumps `'users'`)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/portal/hooks/assessmentsLive.test.js`:

```js
/**
 * hooks/assessmentsLive.js: every write's shape is the contract with
 * firestore.rules (athletes/{id}/assessments, assessmentProfile,
 * assessmentSettings, users.assessor; scripts/rules-probes/assessments.mjs),
 * so each is pinned field for field here.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => ({ kind: 'collection', path: path.join('/') }),
  collectionGroup: (_db, id) => ({ kind: 'group', id }),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  serverTimestamp: () => 'SERVER_TIME',
  getDoc: async (ref) => mockSnap(ref.path),
  getDocs: async (ref) => {
    mockReads.push(ref.kind === 'group' ? `group:${ref.id}` : ref.path);
    if (mockReadError) throw mockReadError;
    const paths = Object.keys(mockStore).filter((p) => {
      const parts = p.split('/');
      return ref.kind === 'group' ? parts.length === 4 && parts[2] === ref.id : p.startsWith(`${ref.path}/`) && parts.length === ref.path.split('/').length + 1;
    });
    return { docs: paths.map(mockSnap) };
  },
  updateDoc: async (ref, data) => {
    if (mockWriteError) throw mockWriteError;
    mockWrites.push(['update', ref.path, data]);
  },
  setDoc: async (ref, data, opts) => {
    if (mockWriteError) throw mockWriteError;
    mockWrites.push(['set', ref.path, data, opts ?? null]);
  },
  runTransaction: async (_db, run) => {
    const writes = [];
    const out = await run({
      get: async (ref) => mockSnap(ref.path),
      set: (ref, data) => { writes.push(['set', ref.path, data]); },
      update: (ref, data) => { writes.push(['update', ref.path, data]); },
    });
    if (mockWriteError) throw mockWriteError;
    mockWrites.push(...writes);
    return out;
  },
}));
jest.mock('./invalidate', () => ({ __esModule: true, bump: (key) => mockBumps.push(key), useInvalidation: () => 0 }));

import { auth } from '../../firebase';
import { ERR } from './live';
import {
  ASSESSMENTS_KEY, ASSESSMENT_SETTINGS_KEY, fetchAllAssessmentWindows, fetchAssessmentSettings, saveAssessmentProfile, saveAssessmentSettings,
  saveSection, saveWindowFields, setStaffAssessor, startWave,
} from './assessmentsLive';
import { DEFAULT_SETTINGS, circuitModeOf } from '../data/assessmentSettings';

let mockStore;
let mockReads;
let mockWrites;
let mockBumps;
let mockReadError;
let mockWriteError;
function mockSnap(path) {
  return { id: path.split('/').pop(), exists: () => path in mockStore, data: () => mockStore[path], ref: { parent: { parent: { id: path.split('/')[1] } } } };
}
const caught = async (promise) => {
  try { await promise; } catch (e) { return e; }
  return null;
};
const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });

beforeEach(() => {
  auth.currentUser = { uid: 'phil' };
  process.env.REACT_APP_PORTAL_LIVE_DATA = 'true';
  mockStore = {};
  mockReads = [];
  mockWrites = [];
  mockBumps = [];
  mockReadError = null;
  mockWriteError = null;
});
afterEach(() => {
  auth.currentUser = null;
  delete process.env.REACT_APP_PORTAL_LIVE_DATA;
});

describe('reads', () => {
  test('every window in one collection-group read; athleteId from the doc or its path', async () => {
    mockStore['athletes/a1/assessments/2026-27-baseline'] = { athleteId: 'a1', kind: 'baseline' };
    mockStore['athletes/a2/assessments/2026-27-baseline'] = { kind: 'baseline' };
    const rows = await fetchAllAssessmentWindows();
    expect(mockReads).toEqual(['group:assessments']);
    expect(rows.map((r) => [r.id, r.athleteId])).toEqual([['2026-27-baseline', 'a1'], ['2026-27-baseline', 'a2']]);
  });
  test('settings are null until saved; a refused read is the typed permission error', async () => {
    expect(await fetchAssessmentSettings()).toBeNull();
    mockStore['assessmentSettings/current'] = { protocolVersion: 'v1.2.1' };
    expect(await fetchAssessmentSettings()).toEqual({ protocolVersion: 'v1.2.1' });
    mockReadError = denied();
    expect(await caught(fetchAllAssessmentWindows())).toMatchObject({ code: ERR.PERMISSION });
  });
});

describe('saveSection writes one section, its mark and the server time - nothing else', () => {
  test('the exact write, and no refresh of other screens mid-wave', async () => {
    const grip = { right: [32.5, null, null], left: [], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' };
    await expect(saveSection({ athleteId: 'a1', windowId: '2026-27-baseline', section: 'grip', value: grip })).resolves.toEqual({ section: 'grip' });
    expect(mockWrites).toEqual([['update', 'athletes/a1/assessments/2026-27-baseline', { grip, 'enteredBy.grip': 'phil', updatedAt: 'SERVER_TIME' }]]);
    expect(mockBumps).toEqual([]);
  });
  test('an unknown section, a missing id or a non-map value is refused before any write', async () => {
    expect(await caught(saveSection({ athleteId: 'a1', windowId: 'w', section: 'score', value: {} }))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(saveSection({ athleteId: 'a1', section: 'grip', value: {} }))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(saveSection({ athleteId: 'a1', windowId: 'w', section: 'grip', value: [1] }))).toMatchObject({ code: ERR.INVALID });
    expect(mockWrites).toEqual([]);
  });
  test('a refused write is the typed permission error; seed mode writes nothing', async () => {
    mockWriteError = denied();
    expect(await caught(saveSection({ athleteId: 'a1', windowId: 'w', section: 'golf', value: { speeds: [88] } }))).toMatchObject({ code: ERR.PERMISSION });
    process.env.REACT_APP_PORTAL_LIVE_DATA = 'false';
    mockWriteError = null;
    await expect(saveSection({ athleteId: 'a1', windowId: 'w', section: 'golf', value: { speeds: [88] } })).resolves.toEqual({ section: 'golf', simulated: true });
    expect(mockWrites).toEqual([]);
  });
});

describe('startWave', () => {
  const settings = DEFAULT_SETTINGS;
  const start = (entries, over = {}) => startWave({ waveId: 'wave-2026-11-03-abc', circuitDate: '2026-11-03', entries, settings, today: '2026-11-05', ...over });

  test('opens a window and a profile per new athlete, exactly as the rules admit', async () => {
    const r = await start([{ athleteId: 'a1', kind: 'baseline', position: 1 }]);
    expect(r).toEqual({ waveId: 'wave-2026-11-03-abc', started: ['a1'], skipped: [] });
    expect(mockWrites).toEqual([
      ['set', 'athletes/a1/assessments/2026-27-baseline', {
        athleteId: 'a1', season: '2026-27', kind: 'baseline', protocolVersion: 'v1.2', circuitMode: circuitModeOf(settings), status: 'open',
        circuitDate: '2026-11-03', golfDate: null, mcgillDate: null, weeksOfExposure: 0, wave: { id: 'wave-2026-11-03-abc', position: 1, coachUid: 'phil' },
        enteredBy: {}, createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME',
      }],
      ['set', 'athletes/a1/assessmentProfile/current', {
        athleteId: 'a1', sex: null, firstTestDate: '2026-11-03', medballMassKg: null, medballMethod: null, dominantHand: null, gripDevice: null,
        handlePosition: null, driver: null, season: '2026-27', updatedAt: 'SERVER_TIME', updatedBy: 'phil',
      }],
    ]);
    expect(mockBumps).toEqual([ASSESSMENTS_KEY]);
  });

  test('an athlete already in an open window joins the new wave and keeps every entry (two tablets, or a retest after "absent")', async () => {
    mockStore['athletes/a1/assessments/2026-27-baseline'] = { athleteId: 'a1', status: 'open', grip: { right: [30] }, circuitDate: '2026-11-03' };
    mockStore['athletes/a1/assessmentProfile/current'] = { athleteId: 'a1', firstTestDate: '2026-11-03', season: '2026-27', sex: 'female' };
    const r = await start([{ athleteId: 'a1', kind: 'baseline', position: 2 }], { circuitDate: '2026-11-05' });
    expect(r.started).toEqual(['a1']);
    expect(mockWrites).toEqual([['update', 'athletes/a1/assessments/2026-27-baseline', {
      wave: { id: 'wave-2026-11-03-abc', position: 2, coachUid: 'phil' }, circuitDate: '2026-11-05', weeksOfExposure: 0, updatedAt: 'SERVER_TIME',
    }]]);
  });

  test('an open window more than 14 days old is skipped, never moved into the wave (it is completed instead)', async () => {
    mockStore['athletes/a1/assessments/2026-27-baseline'] = { athleteId: 'a1', status: 'open', grip: { right: [30] }, circuitDate: '2026-11-03' };
    const r = await start([{ athleteId: 'a1', kind: 'baseline', position: 1 }], { circuitDate: '2026-11-20', today: '2026-11-20' });
    expect(r).toEqual({ waveId: 'wave-2026-11-03-abc', started: [], skipped: [{ athleteId: 'a1', reason: 'stale' }] });
    expect(mockWrites).toEqual([]);
  });

  test('a profile already in a later season is left alone: the season only moves forward', async () => {
    mockStore['athletes/a1/assessmentProfile/current'] = { athleteId: 'a1', firstTestDate: '2026-11-03', season: '2027-28' };
    await start([{ athleteId: 'a1', kind: 'end', position: 1 }]);
    expect(mockWrites.map(([, path]) => path)).toEqual(['athletes/a1/assessments/2026-27-end']);
  });

  test('a complete window is skipped; weeks of exposure count from the first test; a new season resets the med ball', async () => {
    mockStore['athletes/a1/assessments/2026-27-baseline'] = { status: 'complete' };
    mockStore['athletes/a2/assessmentProfile/current'] = { athleteId: 'a2', firstTestDate: '2026-11-03', season: '2026-27', medballMethod: 'speed' };
    mockStore['athletes/a3/assessmentProfile/current'] = { athleteId: 'a3', firstTestDate: '2026-01-10', season: '2025-26', medballMethod: 'speed', medballMassKg: 3, sex: 'male' };
    const r = await start([{ athleteId: 'a1', kind: 'baseline', position: 1 }, { athleteId: 'a2', kind: 'mid', position: 2 }, { athleteId: 'a3', kind: 'baseline', position: 3 }],
      { circuitDate: '2026-12-29' });
    expect(r.skipped).toEqual([{ athleteId: 'a1', reason: 'complete' }]);
    expect(r.started).toEqual(['a2', 'a3']);
    const byPath = Object.fromEntries(mockWrites.map(([, path, data]) => [path, data]));
    expect(byPath['athletes/a2/assessments/2026-27-mid'].weeksOfExposure).toBe(8);
    expect('athletes/a2/assessmentProfile/current' in byPath).toBe(false);
    expect(byPath['athletes/a3/assessmentProfile/current']).toMatchObject({ firstTestDate: '2026-01-10', season: '2026-27', medballMethod: null, medballMassKg: null, sex: 'male' });
    expect('athletes/a1/assessments/2026-27-baseline' in byPath).toBe(false);
  });

  test('a wave is 1 to 4 athletes with a kind and a position; the date must be a date', async () => {
    const five = [1, 2, 3, 4, 5].map((i) => ({ athleteId: `a${i}`, kind: 'baseline', position: Math.min(i, 4) }));
    expect(await caught(start(five))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(start([]))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(start([{ athleteId: 'a1', kind: 'final', position: 1 }]))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(start([{ athleteId: 'a1', kind: 'baseline', position: 1 }], { circuitDate: 'Nov 3' }))).toMatchObject({ code: ERR.INVALID });
    expect(mockWrites).toEqual([]);
  });
});

describe('window fields, profile, settings, the assessor flag', () => {
  test('window fields: only the five the rules admit; a status change refreshes the lists', async () => {
    await saveWindowFields({ athleteId: 'a1', windowId: 'w', fields: { golfDate: '2026-11-04' } });
    await saveWindowFields({ athleteId: 'a1', windowId: 'w', fields: { status: 'complete' } });
    expect(mockWrites).toEqual([
      ['update', 'athletes/a1/assessments/w', { golfDate: '2026-11-04', updatedAt: 'SERVER_TIME' }],
      ['update', 'athletes/a1/assessments/w', { status: 'complete', updatedAt: 'SERVER_TIME' }],
    ]);
    expect(mockBumps).toEqual([ASSESSMENTS_KEY]);
    expect(await caught(saveWindowFields({ athleteId: 'a1', windowId: 'w', fields: { kind: 'mid' } }))).toMatchObject({ code: ERR.INVALID });
  });
  test('profile: a merge of known fields with the writer and the server time', async () => {
    await saveAssessmentProfile({ athleteId: 'a1', patch: { sex: 'female' } });
    expect(mockWrites).toEqual([['set', 'athletes/a1/assessmentProfile/current', { sex: 'female', athleteId: 'a1', updatedAt: 'SERVER_TIME', updatedBy: 'phil' }, { merge: true }]]);
    expect(await caught(saveAssessmentProfile({ athleteId: 'a1', patch: { score: 1 } }))).toMatchObject({ code: ERR.INVALID });
  });
  test('settings: the whole doc, defaults filled in, with the writer and the server time', async () => {
    await expect(saveAssessmentSettings({ ...DEFAULT_SETTINGS, protocolVersion: 'v1.2.1', waveSize: 3 })).resolves.toEqual({ protocolVersion: 'v1.2.1' });
    const [[op, path, data]] = mockWrites;
    expect([op, path]).toEqual(['set', 'assessmentSettings/current']);
    expect(data).toEqual({ ...DEFAULT_SETTINGS, protocolVersion: 'v1.2.1', waveSize: 3, updatedAt: 'SERVER_TIME', updatedBy: 'phil' });
    expect(mockBumps).toEqual([ASSESSMENT_SETTINGS_KEY]);
    expect(await caught(saveAssessmentSettings({ ...DEFAULT_SETTINGS, protocolVersion: '1.3' }))).toMatchObject({ code: ERR.INVALID });
  });
  test('the Assessments permission: one bool on the users doc, then the staff list re-reads', async () => {
    await expect(setStaffAssessor({ uid: 'u2', assessor: true })).resolves.toEqual({ uid: 'u2', assessor: true });
    expect(mockWrites).toEqual([['update', 'users/u2', { assessor: true }]]);
    expect(mockBumps).toEqual(['users']);
    expect(await caught(setStaffAssessor({ uid: 'u2', assessor: 'yes' }))).toMatchObject({ code: ERR.INVALID });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/assessmentsLive.test.js`
Expected: FAIL - "Cannot find module './assessmentsLive' from 'src/portal/hooks/assessmentsLive.test.js'".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/hooks/assessmentsLive.js`:

```js
/**
 * Assessments - the portal's Firestore reads and writes (spec 4, 5). New
 * surface, kept out of live.js / index.js (the scholarships.js precedent):
 * it imports shared primitives FROM ./live, never the other way.
 *
 * firestore.rules is the boundary (athletes/{id}/assessments,
 * assessmentProfile, assessmentSettings, users.assessor;
 * scripts/rules-probes/assessments.mjs), and every write here is shaped to
 * pass it:
 *   - saveSection writes ONE section, its enteredBy mark and the server
 *     updatedAt, nothing else: the rules then check only that section's
 *     trials. It never bumps - the wave screen holds what was typed, and a
 *     refetch of every window per keystroke would flash the screen;
 *   - startWave opens (or re-waves) up to four athletes' windows in one
 *     transaction, keeping every entry of a window that is already open;
 *     an open window more than 14 days old is skipped, never re-waved.
 * Seed mode (isLive() false) writes nothing and resolves, like every other
 * write off the live flag.
 */
import { collection, collectionGroup, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, isLive, requireUser, wrap } from './live';
import { bump } from './invalidate';
import { academyDateISO } from '../data/calendar';
import { SETTINGS_KEYS, circuitModeOf, validVersionLabel, withDefaults } from '../data/assessmentSettings';
import { ASSESSMENT_SECTIONS, KINDS, seasonOf, staleOpen, weeksBetween, windowIdFor } from '../data/assessmentWindows';

export const ASSESSMENTS_KEY = 'assessments';
export const ASSESSMENT_SETTINGS_KEY = 'assessmentSettings';
/** The window fields a write may change outside the sections (rules: fieldsWrite). */
export const WINDOW_FIELDS = ['status', 'circuitDate', 'golfDate', 'mcgillDate', 'weeksOfExposure'];
export const PROFILE_FIELDS = ['sex', 'firstTestDate', 'medballMassKg', 'medballMethod', 'dominantHand', 'gripDevice', 'handlePosition', 'driver', 'season'];
export const MAX_WAVE = 4;

const windowRef = (athleteId, windowId) => doc(db, 'athletes', athleteId, 'assessments', windowId);
const profileRef = (athleteId) => doc(db, 'athletes', athleteId, 'assessmentProfile', 'current');
const settingsRef = () => doc(db, 'assessmentSettings', 'current');
const rowOf = (d) => ({ id: d.id, ...d.data(), athleteId: d.data().athleteId ?? d.ref.parent.parent.id });
const invalid = (message) => new LiveDataError(ERR.INVALID, message);

/** assessmentSettings/current as stored, or null before the first save (screens use withDefaults). */
export async function fetchAssessmentSettings() {
  try {
    const snap = await getDoc(settingsRef());
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    throw wrap(err, 'fetchAssessmentSettings');
  }
}

/** Every window academy-wide: one unfiltered collection-group read (no index), filtered by the caller. */
export async function fetchAllAssessmentWindows() {
  try {
    const snap = await getDocs(collectionGroup(db, 'assessments'));
    return snap.docs.map(rowOf);
  } catch (err) {
    throw wrap(err, 'fetchAllAssessmentWindows');
  }
}

/** One athlete's windows, any season. */
export async function fetchAthleteWindows(athleteId) {
  if (!athleteId) throw invalid('fetchAthleteWindows: athleteId is required.');
  try {
    const snap = await getDocs(collection(db, 'athletes', athleteId, 'assessments'));
    return snap.docs.map(rowOf);
  } catch (err) {
    throw wrap(err, 'fetchAthleteWindows');
  }
}

/** Every assessment profile: one unfiltered collection-group read. */
export async function fetchAllAssessmentProfiles() {
  try {
    const snap = await getDocs(collectionGroup(db, 'assessmentProfile'));
    return snap.docs.map(rowOf);
  } catch (err) {
    throw wrap(err, 'fetchAllAssessmentProfiles');
  }
}

/** athletes/{id}/assessmentProfile/current, or null. */
export async function fetchAssessmentProfile(athleteId) {
  if (!athleteId) throw invalid('fetchAssessmentProfile: athleteId is required.');
  try {
    const snap = await getDoc(profileRef(athleteId));
    return snap.exists() ? { athleteId, ...snap.data() } : null;
  } catch (err) {
    throw wrap(err, 'fetchAssessmentProfile');
  }
}

/**
 * The profile startWave writes: the first-test date is set once and never
 * moves; a new season clears the med ball method and mass (they are fixed
 * per season); everything else carries over.
 */
function profileFor(prev, athleteId, season, circuitDate, uid) {
  const sameSeason = prev?.season === season;
  return {
    athleteId,
    sex: prev?.sex ?? null,
    firstTestDate: prev?.firstTestDate ?? circuitDate,
    medballMassKg: sameSeason ? prev?.medballMassKg ?? null : null,
    medballMethod: sameSeason ? prev?.medballMethod ?? null : null,
    dominantHand: prev?.dominantHand ?? null,
    gripDevice: prev?.gripDevice ?? null,
    handlePosition: prev?.handlePosition ?? null,
    driver: prev?.driver ?? null,
    season,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
}

/**
 * Start a wave (spec 5, list -> Start wave): for each athlete, open the
 * window `{season}-{kind}` with the settings' circuit-mode snapshot, or - when
 * that window is already open (absent last time, or a second tablet) - move
 * it into this wave and keep every entry. A complete window is skipped, and
 * so is an open one whose circuit date is more than 14 days before `today`
 * (reason 'stale': it is marked complete, never re-waved over its trials;
 * firestore.rules refuses that move too). Creates the profile (first-test
 * date) when the athlete has none for this season; a profile already in a
 * later season is left alone (the rules let the season only move forward).
 * One transaction: every athlete starts or none does.
 */
export async function startWave({ waveId, circuitDate, entries, settings, today = academyDateISO() }) {
  if (!waveId || typeof waveId !== 'string') throw invalid('startWave: waveId is required.');
  const season = seasonOf(circuitDate);
  if (!season) throw invalid('startWave: circuitDate must be a YYYY-MM-DD date.');
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_WAVE) {
    throw invalid(`startWave: a wave is 1 to ${MAX_WAVE} athletes.`);
  }
  for (const e of entries) {
    if (!e || !e.athleteId || !KINDS.includes(e.kind) || !Number.isInteger(e.position) || e.position < 1 || e.position > MAX_WAVE) {
      throw invalid('startWave: every athlete needs an id, a kind and a position from 1 to 4.');
    }
  }
  if (!isLive()) return { waveId, started: entries.map((e) => e.athleteId), skipped: [], simulated: true };
  const user = requireUser();
  const s = withDefaults(settings);
  const mode = circuitModeOf(s);
  let result;
  try {
    result = await runTransaction(db, async (tx) => {
      const reads = [];
      for (const e of entries) {
        const wRef = windowRef(e.athleteId, windowIdFor(season, e.kind));
        const pRef = profileRef(e.athleteId);
        reads.push({ e, wRef, pRef, window: await tx.get(wRef), profile: await tx.get(pRef) });
      }
      const started = [];
      const skipped = [];
      for (const r of reads) {
        const prof = r.profile.exists() ? r.profile.data() : null;
        if (r.window.exists() && r.window.data().status === 'complete') {
          skipped.push({ athleteId: r.e.athleteId, reason: 'complete' });
          continue;
        }
        if (r.window.exists() && staleOpen(r.window.data(), today)) {
          skipped.push({ athleteId: r.e.athleteId, reason: 'stale' });
          continue;
        }
        const wave = { id: waveId, position: r.e.position, coachUid: user.uid };
        const weeksOfExposure = weeksBetween(prof?.firstTestDate ?? circuitDate, circuitDate) ?? 0;
        if (r.window.exists()) {
          tx.update(r.wRef, { wave, circuitDate, weeksOfExposure, updatedAt: serverTimestamp() });
        } else {
          tx.set(r.wRef, {
            athleteId: r.e.athleteId, season, kind: r.e.kind, protocolVersion: s.protocolVersion, circuitMode: mode, status: 'open',
            circuitDate, golfDate: null, mcgillDate: null, weeksOfExposure, wave, enteredBy: {},
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        }
        if (!prof || !prof.firstTestDate || (prof.season ?? '') < season) {
          tx.set(r.pRef, profileFor(prof, r.e.athleteId, season, circuitDate, user.uid));
        }
        started.push(r.e.athleteId);
      }
      return { started, skipped };
    });
  } catch (err) {
    throw wrap(err, 'startWave');
  }
  bump(ASSESSMENTS_KEY);
  return { waveId, ...result };
}

/**
 * One section as typed (spec 5: "Every entry saves as typed"): the section,
 * its enteredBy mark, the server time. The section is written whole, so two
 * devices typing into the same section are last writer wins: the circuit
 * runs on one shared tablet (spec decision 2), and the rules cannot tell a
 * stale copy from a correction without a transaction, which would refuse
 * every save made offline.
 */
export async function saveSection({ athleteId, windowId, section, value }) {
  if (!athleteId || !windowId) throw invalid('saveSection: athleteId and windowId are required.');
  if (!ASSESSMENT_SECTIONS.includes(section)) throw invalid(`saveSection: ${section} is not a section.`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('saveSection: a section is a map.');
  if (!isLive()) return { section, simulated: true };
  const user = requireUser();
  try {
    await updateDoc(windowRef(athleteId, windowId), { [section]: value, [`enteredBy.${section}`]: user.uid, updatedAt: serverTimestamp() });
  } catch (err) {
    throw wrap(err, 'saveSection');
  }
  return { section };
}

/** The window's own fields (status, dates, weeks). A status change refreshes the list screens. */
export async function saveWindowFields({ athleteId, windowId, fields }) {
  if (!athleteId || !windowId) throw invalid('saveWindowFields: athleteId and windowId are required.');
  const keys = Object.keys(fields || {});
  if (keys.length === 0 || keys.some((k) => !WINDOW_FIELDS.includes(k))) {
    throw invalid(`saveWindowFields: only ${WINDOW_FIELDS.join(', ')}.`);
  }
  if (!isLive()) return { ...fields, simulated: true };
  requireUser();
  try {
    await updateDoc(windowRef(athleteId, windowId), { ...fields, updatedAt: serverTimestamp() });
  } catch (err) {
    throw wrap(err, 'saveWindowFields');
  }
  if (keys.includes('status')) bump(ASSESSMENTS_KEY);
  return { ...fields };
}

/** Profile fields (sex at intake, dominant hand, the season's med ball), merged, with the writer. */
export async function saveAssessmentProfile({ athleteId, patch }) {
  if (!athleteId) throw invalid('saveAssessmentProfile: athleteId is required.');
  const keys = Object.keys(patch || {});
  if (keys.length === 0 || keys.some((k) => !PROFILE_FIELDS.includes(k))) {
    throw invalid(`saveAssessmentProfile: only ${PROFILE_FIELDS.join(', ')}.`);
  }
  if (!isLive()) return { ...patch, simulated: true };
  const user = requireUser();
  try {
    await setDoc(profileRef(athleteId), { ...patch, athleteId, updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
  } catch (err) {
    throw wrap(err, 'saveAssessmentProfile');
  }
  return { ...patch };
}

/** The whole settings doc, defaults filled in, with the writer (Phil or the owner). */
export async function saveAssessmentSettings(settings) {
  const s = withDefaults(settings);
  if (!validVersionLabel(s.protocolVersion)) throw invalid('saveAssessmentSettings: the version label looks like v1.2.1.');
  if (!isLive()) return { protocolVersion: s.protocolVersion, simulated: true };
  const user = requireUser();
  try {
    await setDoc(settingsRef(), { ...Object.fromEntries(SETTINGS_KEYS.map((k) => [k, s[k]])), updatedAt: serverTimestamp(), updatedBy: user.uid });
  } catch (err) {
    throw wrap(err, 'saveAssessmentSettings');
  }
  bump(ASSESSMENT_SETTINGS_KEY);
  return { protocolVersion: s.protocolVersion };
}

/** The owner's Assessments permission switch on Staff & Roles (users.assessor). */
export async function setStaffAssessor({ uid, assessor }) {
  if (!uid || typeof assessor !== 'boolean') throw invalid('setStaffAssessor: a uid and true or false.');
  if (!isLive()) return { uid, assessor, simulated: true };
  requireUser();
  try {
    await updateDoc(doc(db, 'users', uid), { assessor });
  } catch (err) {
    throw wrap(err, 'setStaffAssessor');
  }
  bump('users');
  return { uid, assessor };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/assessmentsLive.test.js`
Expected: PASS (4 describe blocks).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/hooks/assessmentsLive.js frontend/src/portal/hooks/assessmentsLive.test.js
git commit -m "feat(assessments): Firestore adapter for windows, profiles, settings and the assessor flag

One section per write, as the rules check it; startWave opens or re-waves
up to four windows in one transaction, never resets an open window, and
skips one left open past the 14-day entry window.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Read hooks and the seed fixture

**Files:**
- Create: `frontend/src/portal/data/assessmentSeed.js`
- Create: `frontend/src/portal/hooks/assessments.js`
- Test: `frontend/src/portal/hooks/assessments.test.js`

**Interfaces:**
- Consumes: `fetchAllAthletes`, `fetchAthlete`, `fetchAthletesByIds`, `isLive` (`hooks/live.js`); `useSeedResource`; `useInvalidation`; Task 5 fetchers and keys; `withDefaults`, `circuitModeOf`, `DEFAULT_SETTINGS` (Task 2); `consentStatus`, `dueStatus` (Task 2).
- Produces:
  - `data/assessmentSeed.js`: `SEED_ASSESSMENT_ATHLETES` (`{ id, name, dob, consents }[]`), `SEED_ASSESSMENT_WINDOWS`, `SEED_ASSESSMENT_PROFILES`, `SEED_WAVE_ID = 'wave-2026-11-05-seed'`
  - `rosterRows({ athletes, windows, today }): { athleteId, name, dob, consent, due, windows }[]` (sorted by name)
  - `waveView({ waveId, windows, athletes, profiles }): { waveId, circuitDate, circuitMode, protocolVersion, athletes: { athleteId, name, dob, position, windowId, kind, window, profile, prior }[] } | null`
  - `openWindowsByAthlete(windows): { [athleteId]: { windowId, kind, circuitDate, golfDate, circuitMode } }`
  - `useAssessmentSettings(): { data: { settings, stored }, loading, error }`
  - `useAssessmentRoster({ today }): { data: { rows }, loading, error }`
  - `useWave(waveId): { data: WaveView|null, loading, error }`
  - `useAthleteAssessments(athleteId): { data: { athlete: { id, name, dob, consents }|null, profile, windows, settings }, loading, error }`
  - `useOpenAssessmentWindows({ enabled = true } = {}): { data: { byAthlete }, loading, error }` (disabled: no read, `byAthlete` empty - a viewer the rules refuse never sends the collection-group query)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/portal/hooks/assessments.test.js`:

```js
/**
 * hooks/assessments.js: the pure view builders, and the hooks in seed and
 * live mode (the Firestore adapter is mocked; its own shapes are pinned in
 * assessmentsLive.test.js).
 */
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAllAthletes: jest.fn(),
  fetchAthlete: jest.fn(),
  fetchAthletesByIds: jest.fn(),
}));
jest.mock('./assessmentsLive', () => ({
  ...jest.requireActual('./assessmentsLive'),
  __esModule: true,
  fetchAllAssessmentWindows: jest.fn(),
  fetchAllAssessmentProfiles: jest.fn(),
  fetchAthleteWindows: jest.fn(),
  fetchAssessmentProfile: jest.fn(),
  fetchAssessmentSettings: jest.fn(),
}));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as live from './live';
import * as adapter from './assessmentsLive';
import {
  openWindowsByAthlete, rosterRows, useAssessmentRoster, useAssessmentSettings, useAthleteAssessments, useOpenAssessmentWindows, useWave, waveView,
} from './assessments';
import { SEED_WAVE_ID } from '../data/assessmentSeed';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mountHook(useHook) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await settle();
  return { result, unmount: () => act(async () => root.unmount()) };
}

const win = (athleteId, kind, circuitDate, over = {}) => ({ id: `2026-27-${kind}`, athleteId, season: '2026-27', kind, circuitDate, status: 'complete', ...over });

describe('pure views', () => {
  test('roster rows: every athlete, by name, with consent, what is due and their windows', () => {
    const rows = rosterRows({
      athletes: [{ id: 'b', name: 'Zed', consents: { research: { value: false } } }, { id: 'a', name: 'Amy' }, { id: 'c' }],
      windows: [win('b', 'baseline', '2026-11-03')],
      today: '2026-11-10',
    });
    expect(rows.map((r) => [r.athleteId, r.name, r.consent, r.due.label])).toEqual([
      ['a', 'Amy', 'unanswered', 'Baseline due'],
      ['c', 'c', 'unanswered', 'Baseline due'],
      ['b', 'Zed', 'no', 'Mid-season from Dec 29'],
    ]);
    expect(rows[2].windows).toHaveLength(1);
  });
  test('a wave: its athletes by position, each with profile and earlier windows; an unknown wave is null', () => {
    const windows = [
      win('a', 'mid', '2026-12-29', { status: 'open', wave: { id: 'w1', position: 2 } }),
      win('b', 'baseline', '2026-12-29', { status: 'open', wave: { id: 'w1', position: 1 } }),
      win('a', 'baseline', '2026-11-03', { wave: { id: 'w0', position: 1 } }),
    ];
    const v = waveView({ waveId: 'w1', windows, athletes: [{ id: 'a', name: 'Amy', dob: '2012-01-01' }, { id: 'b', name: 'Bo' }], profiles: [{ athleteId: 'a', sex: 'female' }] });
    expect(v.athletes.map((x) => [x.athleteId, x.position, x.kind, x.windowId])).toEqual([['b', 1, 'baseline', '2026-27-baseline'], ['a', 2, 'mid', '2026-27-mid']]);
    expect(v.athletes[1].profile).toEqual({ athleteId: 'a', sex: 'female' });
    expect(v.athletes[1].prior.map((p) => p.id)).toEqual(['2026-27-baseline']);
    expect(v.athletes[0].prior).toEqual([]);
    expect(v.circuitDate).toBe('2026-12-29');
    expect(waveView({ waveId: 'nope', windows, athletes: [], profiles: [] })).toBeNull();
  });
  test('open windows by athlete, for the golf coach roster', () => {
    expect(openWindowsByAthlete([win('a', 'baseline', '2026-11-03', { status: 'open' }), win('b', 'baseline', '2026-11-03')])).toEqual({
      a: { windowId: '2026-27-baseline', kind: 'baseline', circuitDate: '2026-11-03', golfDate: null, circuitMode: null },
    });
  });
});

describe('seed mode (the review scaffold)', () => {
  test('the roster, a wave, an athlete and the settings come from the fixture', async () => {
    const roster = await mountHook(() => useAssessmentRoster({ today: '2026-11-05' }));
    expect(roster.result.current.data.rows.map((r) => r.name)).toEqual(['Ava Moreno', 'Ben Ortiz', 'Cal Duarte', 'Dev Patel', 'Eli Brooks']);
    await roster.unmount();
    const wave = await mountHook(() => useWave(SEED_WAVE_ID));
    expect(wave.result.current.data.athletes.map((a) => a.name)).toEqual(['Dev Patel', 'Eli Brooks']);
    await wave.unmount();
    const ava = await mountHook(() => useAthleteAssessments('seed-ava'));
    expect(ava.result.current.data.windows.map((w) => w.id)).toEqual(['2026-27-baseline']);
    expect(ava.result.current.data.profile.sex).toBe('female');
    await ava.unmount();
    const settings = await mountHook(() => useAssessmentSettings());
    expect(settings.result.current.data).toMatchObject({ stored: false, settings: { protocolVersion: 'v1.2' } });
    await settings.unmount();
    expect(adapter.fetchAllAssessmentWindows).not.toHaveBeenCalled();
  });
});

describe('live mode', () => {
  beforeEach(() => { live.isLive.mockReturnValue(true); });

  test('a wave reads every window and profile once, then only its own athletes', async () => {
    adapter.fetchAllAssessmentWindows.mockResolvedValue([win('a', 'baseline', '2026-11-03', { status: 'open', wave: { id: 'w1', position: 1 } }), win('z', 'baseline', '2026-11-03')]);
    adapter.fetchAllAssessmentProfiles.mockResolvedValue([]);
    live.fetchAthletesByIds.mockResolvedValue([{ id: 'a', name: 'Amy' }]);
    const h = await mountHook(() => useWave('w1'));
    expect(h.result.current.data.athletes.map((x) => x.name)).toEqual(['Amy']);
    expect(live.fetchAthletesByIds).toHaveBeenCalledWith(['a']);
    await h.unmount();
  });

  test("a coach who may not read the athlete record still gets the athlete's windows", async () => {
    live.fetchAthlete.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    adapter.fetchAssessmentProfile.mockResolvedValue(null);
    adapter.fetchAthleteWindows.mockResolvedValue([win('a', 'mid', '2026-12-29'), win('a', 'baseline', '2026-11-03')]);
    adapter.fetchAssessmentSettings.mockResolvedValue({ thresholds: { cmj: 6 } });
    const h = await mountHook(() => useAthleteAssessments('a'));
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.athlete).toBeNull();
    expect(h.result.current.data.windows.map((w) => w.kind)).toEqual(['baseline', 'mid']);
    expect(h.result.current.data.settings.thresholds).toMatchObject({ cmj: 6, clubhead: 2 });
    await h.unmount();
  });

  test('the roster joins every athlete to their windows; open windows for the golf roster', async () => {
    live.fetchAllAthletes.mockResolvedValue([{ id: 'a', name: 'Amy', consents: { research: { value: true } } }]);
    adapter.fetchAllAssessmentWindows.mockResolvedValue([win('a', 'baseline', '2026-11-03', { status: 'open' })]);
    const roster = await mountHook(() => useAssessmentRoster({ today: '2026-11-04' }));
    expect(roster.result.current.data.rows[0]).toMatchObject({ athleteId: 'a', consent: 'yes', due: { label: 'Baseline in progress' } });
    await roster.unmount();
    const open = await mountHook(() => useOpenAssessmentWindows());
    expect(Object.keys(open.result.current.data.byAthlete)).toEqual(['a']);
    await open.unmount();
  });

  test('a viewer who may not read windows (mental without the permission) sends no read at all', async () => {
    const off = await mountHook(() => useOpenAssessmentWindows({ enabled: false }));
    expect(off.result.current.data).toEqual({ byAthlete: {} });
    expect(adapter.fetchAllAssessmentWindows).not.toHaveBeenCalled();
    await off.unmount();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/assessments.test.js`
Expected: FAIL - "Cannot find module './assessments' from 'src/portal/hooks/assessments.test.js'".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/data/assessmentSeed.js`:

```js
/**
 * Seed-mode fixture for the assessment screens (REACT_APP_PORTAL_LIVE_DATA
 * off): five invented athletes - never a real family - covering every list
 * state: research yes / no / not answered, baseline due, two athletes in an
 * open wave, and one complete baseline with every section typed. Dates are
 * fixed (this is the review scaffold).
 */
import { DEFAULT_SETTINGS, circuitModeOf } from './assessmentSettings';

const research = (value) => ({ research: { value, assent: value, recordedAt: '2026-10-15T15:00:00Z', recordedBy: 'seed' } });

export const SEED_ASSESSMENT_ATHLETES = [
  { id: 'seed-ava', name: 'Ava Moreno', dob: '2012-04-10', consents: research(true) },
  { id: 'seed-ben', name: 'Ben Ortiz', dob: '2010-08-22', consents: research(false) },
  { id: 'seed-cal', name: 'Cal Duarte', dob: '2013-01-30', consents: {} },
  { id: 'seed-dev', name: 'Dev Patel', dob: '2011-11-05', consents: research(true) },
  { id: 'seed-eli', name: 'Eli Brooks', dob: '2009-06-14', consents: research(true) },
];

export const SEED_WAVE_ID = 'wave-2026-11-05-seed';
const MODE = circuitModeOf(DEFAULT_SETTINGS);
const baseline = (athleteId, over) => ({
  id: '2026-27-baseline', athleteId, season: '2026-27', kind: 'baseline', protocolVersion: 'v1.2', circuitMode: MODE,
  golfDate: null, mcgillDate: null, weeksOfExposure: 0, enteredBy: {}, ...over,
});

export const SEED_ASSESSMENT_WINDOWS = [
  baseline('seed-ava', {
    status: 'complete', circuitDate: '2026-11-03', golfDate: '2026-11-03', wave: { id: 'wave-2026-11-03-seed', position: 1, coachUid: 'phil' },
    readiness: { status: 'pass', reason: null, hoursSinceHardSession: 30, golfToday: false, notes: null },
    log: { location: 'ryp', externalContent: null, weeklyHours: 6, rypSessionsSincePrior: 0, golfVolume: '2 rounds a week', competitiveLevel: 'Handicap 9', otherSport: null, otherSportHours: null },
    anthro: { standing: [152.1, 152.3], mass: [41.0, 41.2], boxHeight: 40, sittingRaw: [118.0, 118.2], arm: [], hand: [] },
    grip: { right: [24.5, 25.1, 24.8], left: [23.0, 22.4, 23.8], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' },
    cmj: { trials: [{ heightCm: 31.2, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2100, peakPowerWkg: null, asymmetryPct: 6.5 },
      { heightCm: 32.0, rsiMod: 0.39, timeToTakeoffMs: null, peakPowerW: 2150, peakPowerWkg: null, asymmetryPct: 4.2 }], software: 'Smart2Move', samplingHz: 1000 },
    hop: { sets: [{ rsiBest5: 2.31, gctMs: 198 }, { rsiBest5: 2.45, gctMs: 262 }] },
    medball: { massKg: 3, side: 'trail', method: 'speed', throws: [28.4, 29.1, 28.9] },
    mcgill: { flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 48, skippedBackPain: false },
    golf: { speeds: [88.2, 90.1, 89.5, 91.0, 87.9], driver: 'TSR3 10.5', parallaxComposite: 72, fps: 240 },
  }),
  baseline('seed-dev', {
    status: 'open', circuitDate: '2026-11-05', wave: { id: SEED_WAVE_ID, position: 1, coachUid: 'phil' },
    readiness: { status: 'pass', reason: null, hoursSinceHardSession: 48, golfToday: true, notes: null },
    anthro: { standing: [158.2], mass: [], boxHeight: 40, sittingRaw: [], arm: [], hand: [] },
  }),
  baseline('seed-eli', { status: 'open', circuitDate: '2026-11-05', wave: { id: SEED_WAVE_ID, position: 2, coachUid: 'phil' } }),
];

export const SEED_ASSESSMENT_PROFILES = [
  { athleteId: 'seed-ava', sex: 'female', firstTestDate: '2026-11-03', medballMassKg: 3, medballMethod: 'speed', dominantHand: 'right', gripDevice: 'D1', handlePosition: '3', driver: 'TSR3 10.5', season: '2026-27' },
  { athleteId: 'seed-dev', sex: 'male', firstTestDate: '2026-11-05', medballMassKg: null, medballMethod: null, dominantHand: null, gripDevice: null, handlePosition: null, driver: null, season: '2026-27' },
  { athleteId: 'seed-eli', sex: null, firstTestDate: '2026-11-05', medballMassKg: null, medballMethod: null, dominantHand: null, gripDevice: null, handlePosition: null, driver: null, season: '2026-27' },
];
```

Create `frontend/src/portal/hooks/assessments.js`:

```js
/**
 * Assessments - the read hooks every assessment screen mounts (spec 5). Seed
 * mode resolves the fixture in data/assessmentSeed.js; live mode reads
 * through hooks/assessmentsLive.js. The views are built by the pure
 * functions exported here, so each screen gets the same shape in both modes.
 * Invalidation keys: 'assessments' (startWave, a status change) and
 * 'assessmentSettings' (a settings save).
 */
import useSeedResource from './useSeedResource';
import { useInvalidation } from './invalidate';
import { fetchAllAthletes, fetchAthlete, fetchAthletesByIds, isLive } from './live';
import {
  ASSESSMENTS_KEY, ASSESSMENT_SETTINGS_KEY, fetchAllAssessmentProfiles, fetchAllAssessmentWindows, fetchAssessmentProfile, fetchAssessmentSettings,
  fetchAthleteWindows,
} from './assessmentsLive';
import { withDefaults } from '../data/assessmentSettings';
import { consentStatus, dueStatus } from '../data/assessmentWindows';
import { SEED_ASSESSMENT_ATHLETES, SEED_ASSESSMENT_PROFILES, SEED_ASSESSMENT_WINDOWS } from '../data/assessmentSeed';

const byDate = (a, b) => (a.circuitDate || '').localeCompare(b.circuitDate || '');
const byAthlete = (windows) => {
  const out = {};
  for (const w of windows) (out[w.athleteId] = out[w.athleteId] || []).push(w);
  return out;
};

/** The list (spec 5): every academy athlete, consent, what is due, last test, by name. */
export function rosterRows({ athletes, windows, today }) {
  const mine = byAthlete(windows || []);
  return (athletes || [])
    .map((a) => {
      const own = (mine[a.id] || []).sort(byDate);
      return { athleteId: a.id, name: a.name || a.id, dob: a.dob ?? null, consent: consentStatus(a), due: dueStatus(own, today), windows: own };
    })
    .sort((x, y) => x.name.localeCompare(y.name));
}

/** One wave: its windows by position, each with the athlete's profile and earlier windows (growth check, med ball). */
export function waveView({ waveId, windows, athletes, profiles }) {
  const members = (windows || []).filter((w) => w.wave?.id === waveId).sort((a, b) => a.wave.position - b.wave.position);
  if (members.length === 0) return null;
  const athleteById = new Map((athletes || []).map((a) => [a.id, a]));
  const profileById = new Map((profiles || []).map((p) => [p.athleteId, p]));
  return {
    waveId,
    circuitDate: members[0].circuitDate,
    circuitMode: members[0].circuitMode,
    protocolVersion: members[0].protocolVersion,
    athletes: members.map((w) => ({
      athleteId: w.athleteId,
      name: athleteById.get(w.athleteId)?.name ?? w.athleteId,
      dob: athleteById.get(w.athleteId)?.dob ?? null,
      position: w.wave.position,
      windowId: w.id,
      kind: w.kind,
      window: w,
      profile: profileById.get(w.athleteId) ?? null,
      prior: (windows || []).filter((p) => p.athleteId === w.athleteId && p.id !== w.id && (p.circuitDate || '') < (w.circuitDate || '')).sort(byDate),
    })),
  };
}

/** Each athlete's open window (the latest), for the golf coach's session roster. */
export function openWindowsByAthlete(windows) {
  const out = {};
  for (const w of [...(windows || [])].filter((x) => x.status === 'open').sort(byDate)) {
    out[w.athleteId] = { windowId: w.id, kind: w.kind, circuitDate: w.circuitDate, golfDate: w.golfDate ?? null, circuitMode: w.circuitMode ?? null };
  }
  return out;
}

const pickAthlete = (a) => (a ? { id: a.id, name: a.name ?? null, dob: a.dob ?? null, consents: a.consents ?? {} } : null);

/** One athlete's results: the athlete (null when the caller may not read the record), profile, windows by date, settings. */
function athleteView({ athlete, profile, windows, settings }) {
  return { athlete: pickAthlete(athlete), profile: profile ?? null, windows: [...(windows || [])].sort(byDate), settings: withDefaults(settings) };
}

/** assessmentSettings/current with the v1.2 defaults filled in; `stored` is false before the first save. */
export function useAssessmentSettings() {
  const live = isLive();
  const gen = useInvalidation(ASSESSMENT_SETTINGS_KEY);
  return useSeedResource(
    live ? null : { settings: withDefaults(null), stored: false },
    live
      ? { source: async () => { const s = await fetchAssessmentSettings(); return { settings: withDefaults(s), stored: s != null }; }, deps: ['assessment-settings', gen] }
      : undefined
  );
}

/** The list: every academy athlete with consent and what is due on `today` (the academy date). */
export function useAssessmentRoster({ today }) {
  const live = isLive();
  const gen = useInvalidation(ASSESSMENTS_KEY);
  return useSeedResource(
    live ? null : { rows: rosterRows({ athletes: SEED_ASSESSMENT_ATHLETES, windows: SEED_ASSESSMENT_WINDOWS, today }) },
    live
      ? {
          source: async () => {
            const [athletes, windows] = await Promise.all([fetchAllAthletes(), fetchAllAssessmentWindows()]);
            return { rows: rosterRows({ athletes, windows, today }) };
          },
          deps: ['assessment-roster', today, gen],
        }
      : undefined
  );
}

/** One wave (spec 5): its athletes in position order, with their windows and profiles. */
export function useWave(waveId) {
  const live = isLive();
  const gen = useInvalidation(ASSESSMENTS_KEY);
  return useSeedResource(
    live ? null : waveView({ waveId, windows: SEED_ASSESSMENT_WINDOWS, athletes: SEED_ASSESSMENT_ATHLETES, profiles: SEED_ASSESSMENT_PROFILES }),
    live
      ? {
          source: async () => {
            const [windows, profiles] = await Promise.all([fetchAllAssessmentWindows(), fetchAllAssessmentProfiles()]);
            const ids = windows.filter((w) => w.wave?.id === waveId).map((w) => w.athleteId);
            const athletes = ids.length ? await fetchAthletesByIds(ids) : [];
            return waveView({ waveId, windows, athletes, profiles });
          },
          deps: ['assessment-wave', waveId, gen],
        }
      : undefined
  );
}

/** One athlete's windows, profile and the settings (results, golf entry). A refused athlete read is null, not an error. */
export function useAthleteAssessments(athleteId) {
  const live = isLive() && athleteId != null;
  const gen = useInvalidation(ASSESSMENTS_KEY);
  const settingsGen = useInvalidation(ASSESSMENT_SETTINGS_KEY);
  return useSeedResource(
    live
      ? null
      : athleteView({
          athlete: SEED_ASSESSMENT_ATHLETES.find((a) => a.id === athleteId),
          profile: SEED_ASSESSMENT_PROFILES.find((p) => p.athleteId === athleteId),
          windows: SEED_ASSESSMENT_WINDOWS.filter((w) => w.athleteId === athleteId),
          settings: null,
        }),
    live
      ? {
          source: async () => {
            const [athlete, profile, windows, settings] = await Promise.all([
              fetchAthlete(athleteId).catch(() => null),
              fetchAssessmentProfile(athleteId),
              fetchAthleteWindows(athleteId),
              fetchAssessmentSettings(),
            ]);
            return athleteView({ athlete, profile, windows, settings });
          },
          deps: ['assessment-athlete', athleteId, gen, settingsGen],
        }
      : undefined
  );
}

/**
 * Which athletes have an open window: the golf coach's "Clubhead speed"
 * entry on the session roster. `enabled: false` (a viewer the rules refuse,
 * such as a mental account without the Assessments permission) reads
 * nothing and answers no open windows.
 */
export function useOpenAssessmentWindows({ enabled = true } = {}) {
  const live = isLive() && enabled;
  const gen = useInvalidation(ASSESSMENTS_KEY);
  return useSeedResource(
    live ? null : { byAthlete: enabled ? openWindowsByAthlete(SEED_ASSESSMENT_WINDOWS) : {} },
    live ? { source: async () => ({ byAthlete: openWindowsByAthlete(await fetchAllAssessmentWindows()) }), deps: ['assessment-open', gen] } : undefined
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/assessments.test.js`
Expected: PASS (3 describe blocks).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/data/assessmentSeed.js frontend/src/portal/hooks/assessments.js frontend/src/portal/hooks/assessments.test.js
git commit -m "feat(assessments): read hooks for the list, a wave, an athlete and the settings

Seed and live mode share one set of pure view builders; a coach who may not
read an athlete record still gets that athlete's windows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: "Baseline due" on the admin dashboard

Spec 8: the admin "Diagnostic not entered" row becomes "Baseline due", read from the assessment windows instead of the diagnostics collection group. This task replaces that read (and `fetchAllDiagnostics` with it); Task 8 removes the rest of Diagnostic Capture from the portal and Task 9 its rules, seed and data-model section. An athlete is "Baseline due" when they have no baseline window in the current season (`seasonOf(today)`), the same rule the assessments list uses.

**Files:**
- Modify: `frontend/src/portal/hooks/index.js` (imports ~44-123; `deriveWhoNeedsCall` ~3563-3630; `liveAdminDashboard` ~3650-3742; `useAdminDashboard` ~3824-3872)
- Modify: `frontend/src/portal/hooks/live.js` (import line 18; `fetchAllDiagnostics` ~1967-1984)
- Modify: `frontend/src/portal/data/seed.js` (~324-326), `frontend/src/portal/data/admin.js:22`
- Modify: `frontend/src/portal/hooks/index.contract.test.js` (~130), `frontend/src/portal/hooks/index.reserved.test.js` (~20, 217)
- Create: `frontend/src/portal/hooks/index.assessments.test.js`

**Interfaces:**
- Consumes: `ASSESSMENTS_KEY`, `fetchAllAssessmentWindows` (Task 5); `seasonOf` (Task 2).
- Produces: `deriveWhoNeedsCall({ athletes, pendingCount, noshowBookings, contractLogs, baselineAthleteIds: string[]|null, today })` returning `{ pendingEnrollment, noshows, contractBehind, baselineDue: { athleteId, name }[] }`; admin outstanding rows `{ id: 'baseline-<athleteId>', kind: 'baseline', why: 'Baseline due', tag: 'Assessment', tone: 'yellow' }`; `hooks/index.assessments.test.js` (Task 10 adds to it).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/hooks/index.assessments.test.js`:

```js
/**
 * Diagnostic Capture is gone (assessments spec 8): the admin "Diagnostic not
 * entered" row is "Baseline due" now, read from the assessment windows - and
 * a refused windows read (rules that do not grant it yet) drops those
 * rows instead of the whole dashboard.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
// CRA's resetMocks clears these before every test: each test sets its own.
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAllAthletes: jest.fn(),
  fetchAllHouseholds: jest.fn(),
  fetchContractLogsSince: jest.fn(),
  fetchNoShowBookingsSince: jest.fn(),
  fetchPendingEnrollmentRequests: jest.fn(),
  fetchSessionsInRange: jest.fn(),
}));
jest.mock('./assessmentsLive', () => ({ ...jest.requireActual('./assessmentsLive'), __esModule: true, fetchAllAssessmentWindows: jest.fn() }));
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import * as live from './live';
import * as adapter from './assessmentsLive';
import * as calendar from '../data/calendar';
import { deriveWhoNeedsCall, useAdminDashboard } from './index';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mountHook(useHook) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await settle();
  return { result, unmount: () => act(async () => root.unmount()) };
}

const ATHLETES = [
  { id: 'a1', name: 'Jordan Whitfield', contractMinutes: null, packageId: 't-6' },
  { id: 'a2', name: 'Reese Whitfield', contractMinutes: null, packageId: 't-6' },
];

test('deriveWhoNeedsCall: every athlete with no baseline window is "Baseline due"; unknown lists nobody', () => {
  const who = (baselineAthleteIds) =>
    deriveWhoNeedsCall({ athletes: ATHLETES, pendingCount: 0, noshowBookings: [], contractLogs: [], baselineAthleteIds, today: '2026-11-10' });
  expect(who(['a2']).baselineDue).toEqual([{ athleteId: 'a1', name: 'Jordan Whitfield' }]);
  expect(who(null).baselineDue).toEqual([]);
  expect('missingDiagnostic' in who([])).toBe(false);
});

describe('the admin dashboard', () => {
  beforeEach(() => {
    calendar.todayISO.mockReturnValue('2026-11-10');
    live.isLive.mockReturnValue(true);
    live.fetchAllAthletes.mockResolvedValue(ATHLETES);
    for (const f of [live.fetchAllHouseholds, live.fetchContractLogsSince, live.fetchNoShowBookingsSince, live.fetchPendingEnrollmentRequests, live.fetchSessionsInRange]) {
      f.mockResolvedValue([]);
    }
  });

  test('"Baseline due" for an athlete with no baseline window this season (an open one counts as tested)', async () => {
    adapter.fetchAllAssessmentWindows.mockResolvedValue([{ id: '2026-27-baseline', athleteId: 'a2', season: '2026-27', kind: 'baseline', status: 'open' }]);
    const h = await mountHook(() => useAdminDashboard());
    expect(h.result.current.data.outstanding).toEqual([
      { id: 'baseline-a1', kind: 'baseline', athleteId: 'a1', who: 'Jordan Whitfield', why: 'Baseline due', tag: 'Assessment', tone: 'yellow', packageIds: null },
    ]);
    await h.unmount();
  });

  test('a baseline from last season does not count, as on the assessments list', async () => {
    adapter.fetchAllAssessmentWindows.mockResolvedValue([{ id: '2025-26-baseline', athleteId: 'a2', season: '2025-26', kind: 'baseline', status: 'complete' }]);
    const h = await mountHook(() => useAdminDashboard());
    expect(h.result.current.data.outstanding.map((r) => r.id)).toEqual(['baseline-a1', 'baseline-a2']);
    await h.unmount();
  });

  test('a refused windows read drops those rows, never the dashboard', async () => {
    adapter.fetchAllAssessmentWindows.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    const h = await mountHook(() => useAdminDashboard());
    expect(h.result.current.error).toBeNull();
    expect(h.result.current.data.outstanding).toEqual([]);
    expect(h.result.current.data.metrics.enrolled).toBe(2);
    await h.unmount();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/index.assessments.test.js`
Expected: FAIL - `baselineDue` is undefined and the dashboard still reads diagnostics.

- [ ] **Step 3: The admin dashboard reads the assessment windows**

In `frontend/src/portal/hooks/index.js`, replace:

```js
  fetchAllAthletes,
  fetchAllDiagnostics,
  fetchAllHouseholds,
```

with:

```js
  fetchAllAthletes,
  fetchAllHouseholds,
```

then replace:

```js
import useScholarships from './scholarships';
```

with:

```js
import useScholarships from './scholarships';
// 2026-10-14 (assessments spec 8): the admin "Baseline due" row reads the
// assessment windows, the module that replaced the diagnostics reads.
import { ASSESSMENTS_KEY, fetchAllAssessmentWindows } from './assessmentsLive';
import { seasonOf } from '../data/assessmentWindows';
```

Then, in `frontend/src/portal/hooks/index.js`, replace:

```js
 * @param {Array} args.publishedDiagnosticAthleteIds - athleteIds with >=1 published diagnostic.
```

with:

```js
 * @param {Array|null} args.baselineAthleteIds - athleteIds with a baseline assessment window this season (any status); null when the windows could not be read, which lists nobody.
```

then replace:

```js
  contractLogs,
  publishedDiagnosticAthleteIds,
  today,
}) {
```

with:

```js
  contractLogs,
  baselineAthleteIds,
  today,
}) {
```

then replace:

```js
  const publishedSet = new Set(publishedDiagnosticAthleteIds ?? []);
  const missingDiagnostic = athletes
    .filter((a) => !publishedSet.has(a.id))
    .map((a) => ({ athleteId: a.id, name: a.name ?? null }));

  return {
    pendingEnrollment: { count: pendingCount },
    noshows,
    contractBehind,
    missingDiagnostic,
  };
```

with:

```js
  // Assessments spec 8: "Baseline due" replaces "Diagnostic not entered" -
  // an athlete with no baseline window is due one. Unknown (null) lists
  // nobody rather than every athlete.
  const tested = new Set(baselineAthleteIds ?? []);
  const baselineDue = baselineAthleteIds == null
    ? []
    : athletes.filter((a) => !tested.has(a.id)).map((a) => ({ athleteId: a.id, name: a.name ?? null }));

  return {
    pendingEnrollment: { count: pendingCount },
    noshows,
    contractBehind,
    baselineDue,
  };
```

then replace:

```js
  const [athletes, sessionsThisWeek, pending, noshowBookings, contractLogs, diagnostics, households] =
    await Promise.all([
      fetchAllAthletes(),
      fetchSessionsInRange(weekStart, weekEnd),
      fetchPendingEnrollmentRequests(),
      fetchNoShowBookingsSince(monthStart),
      fetchContractLogsSince(monthStart),
      fetchAllDiagnostics(),
      fetchAllHouseholds(),
    ]);
```

with:

```js
  // The assessment windows read may fail on its own (rules that do not
  // grant it yet): that drops the "Baseline due" rows, never the dashboard.
  const [athletes, sessionsThisWeek, pending, noshowBookings, contractLogs, windows, households] =
    await Promise.all([
      fetchAllAthletes(),
      fetchSessionsInRange(weekStart, weekEnd),
      fetchPendingEnrollmentRequests(),
      fetchNoShowBookingsSince(monthStart),
      fetchContractLogsSince(monthStart),
      fetchAllAssessmentWindows().catch(() => null),
      fetchAllHouseholds(),
    ]);
```

then replace:

```js
  const publishedDiagnosticAthleteIds = diagnostics
    .filter((d) => d.status === 'published')
    .map((d) => d.athleteId);
  const who = deriveWhoNeedsCall({
    athletes,
    pendingCount: pending.length,
    noshowBookings,
    contractLogs,
    publishedDiagnosticAthleteIds,
    today,
  });
```

with:

```js
  // This season's baselines only (the list's rule, data/assessmentWindows.js dueStatus): last season's do not count.
  const season = seasonOf(today);
  const baselineAthleteIds = windows == null ? null : windows.filter((w) => w.kind === 'baseline' && w.season === season).map((w) => w.athleteId);
  const who = deriveWhoNeedsCall({
    athletes,
    pendingCount: pending.length,
    noshowBookings,
    contractLogs,
    baselineAthleteIds,
    today,
  });
```

then replace:

```js
  for (const d of who.missingDiagnostic) {
    outstanding.push({
      id: `diagnostic-${d.athleteId}`,
      kind: 'diagnostic',
      athleteId: d.athleteId,
      who: d.name ?? d.athleteId,
      why: 'Diagnostic not entered',
      tag: 'Onboarding',
      tone: 'yellow',
      packageIds: null,
    });
  }
```

with:

```js
  for (const d of who.baselineDue) {
    outstanding.push({
      id: `baseline-${d.athleteId}`,
      kind: 'baseline',
      athleteId: d.athleteId,
      who: d.name ?? d.athleteId,
      why: 'Baseline due',
      tag: 'Assessment',
      tone: 'yellow',
      packageIds: null,
    });
  }
```

then replace:

```js
  const contractLogsGen = useInvalidation('contractLogs');
  const diagnosticsGen = useInvalidation('diagnostics');
  const enrollmentGen = useInvalidation('enrollmentRequests');
```

with:

```js
  const contractLogsGen = useInvalidation('contractLogs');
  const assessmentsGen = useInvalidation(ASSESSMENTS_KEY);
  const enrollmentGen = useInvalidation('enrollmentRequests');
```

then replace:

```js
            contractLogsGen,
            diagnosticsGen,
            enrollmentGen,
```

with:

```js
            contractLogsGen,
            assessmentsGen,
            enrollmentGen,
```

In `frontend/src/portal/hooks/live.js`, replace:

```js
  collection,
  collectionGroup,
  deleteDoc,
```

with:

```js
  collection,
  deleteDoc,
```

and the collection-group read:

In `frontend/src/portal/hooks/live.js`, replace:

```
/**
 * Every diagnostics capture academy-wide, via the collectionGroup read
 * firestore.rules' `/{path=**}/diagnostics/{captureId}` match grants
 * (contract v1.8, C + D). Unfiltered and sorted/filtered client-side
 * (status === 'published' for the "no diagnostic yet" list) rather than a
 * `where('status', ...)` server-side filter, so this needs no
 * collection-group-scoped index at all — the routing lane's own
 * "index-free where reasonably possible" preference, since collection-group
 * equality indexes are NOT automatic the way single-collection ones are.
 */
export async function fetchAllDiagnostics() {
  try {
    const snap = await getDocs(collectionGroup(db, 'diagnostics'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    throw wrap(err, 'fetchAllDiagnostics');
  }
}

/**
```

with:

```
/**
```

In `frontend/src/portal/hooks/index.contract.test.js`, replace:

```js
    deriveWhoNeedsCall({ athletes, pendingCount: 0, noshowBookings: [], contractLogs, publishedDiagnosticAthleteIds: [], today })
```

with:

```js
    deriveWhoNeedsCall({ athletes, pendingCount: 0, noshowBookings: [], contractLogs, baselineAthleteIds: [], today })
```

In `frontend/src/portal/hooks/index.reserved.test.js`, replace:

```js
  fetchAllAthletes: jest.fn(),
  fetchAllDiagnostics: jest.fn(),
  fetchAllHouseholds: jest.fn(),
```

with:

```js
  fetchAllAthletes: jest.fn(),
  fetchAllHouseholds: jest.fn(),
```

then replace:

```js
jest.mock('./grace', () => ({ ...jest.requireActual('./grace'), __esModule: true, fetchTokenPeriod: jest.fn() }));
```

with:

```js
jest.mock('./grace', () => ({ ...jest.requireActual('./grace'), __esModule: true, fetchTokenPeriod: jest.fn() }));
jest.mock('./assessmentsLive', () => ({ ...jest.requireActual('./assessmentsLive'), __esModule: true, fetchAllAssessmentWindows: jest.fn() }));
```

then replace:

```js
import * as grace from './grace';
```

with:

```js
import * as grace from './grace';
import * as adapter from './assessmentsLive';
```

then replace:

```js
      live.fetchContractLogsSince, live.fetchAllDiagnostics, live.fetchAllHouseholds]) fetch.mockResolvedValue([]);
```

with:

```js
      live.fetchContractLogsSince, adapter.fetchAllAssessmentWindows, live.fetchAllHouseholds]) fetch.mockResolvedValue([]);
```

In `frontend/src/portal/data/seed.js`, replace:

```js
  { id: 'o1', label: 'Diagnostic not entered', detail: '2 athletes' },
```

with:

```js
  { id: 'o1', label: 'Baseline due', detail: '2 athletes' },
```

In `frontend/src/portal/data/admin.js`, replace:

```js
  { id: 'o4', who: '2 athletes', why: 'Diagnostic not entered since enrollment', tag: 'Onboarding', tone: 'yellow', packageIds: ['t-6'] },
```

with:

```js
  { id: 'o4', who: '2 athletes', why: 'Baseline due', tag: 'Assessment', tone: 'yellow', packageIds: ['t-6'] },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks src/portal/screens/AdminDashboard`
Expected: PASS - `index.assessments.test.js`, `index.contract.test.js`, `index.reserved.test.js` and every other hooks suite.

Run: `cd frontend && npx eslint src/portal`
Expected: no output (no unused `collectionGroup` or `fetchAllDiagnostics` left behind).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/hooks/index.js frontend/src/portal/hooks/live.js frontend/src/portal/hooks/index.assessments.test.js frontend/src/portal/hooks/index.contract.test.js frontend/src/portal/hooks/index.reserved.test.js frontend/src/portal/data/seed.js frontend/src/portal/data/admin.js
git commit -m "feat(assessments): Baseline due on the admin dashboard

The Diagnostic not entered row becomes Baseline due, read from this
season's assessment windows; a refused windows read drops those rows,
never the dashboard. The diagnostics collection-group read goes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Remove Diagnostic Capture from the portal

Spec 8: production holds 0 diagnostics docs (checked 2026-10-14). Everything of the old capture leaves the portal: the screen and its route and tab, `DIAGNOSTIC_SECTIONS`, the diagnostics hooks and live functions, the AthleteDetail capture card and the unrouted Practice DNA stub. The athlete home's "Book your Diagnostic" card keyed off the diagnostics read; with that read gone it shows only in the harness's `new` variant. The rules, the emulator seed and DATA-MODEL follow in Task 9.

**Files:**
- Delete: `frontend/src/portal/screens/DiagnosticCapture.js`, `frontend/src/portal/screens/DiagnosticCapture.test.js`, `frontend/src/portal/screens/PracticeDNA.js`
- Modify: `frontend/src/portal/PortalRoutes.js` (~lines 39, 63, 104, 111, 894-902), `frontend/src/portal/PortalRoutes.warm.test.js:34`, `frontend/src/portal/PortalRoutes.test.js` (append a test)
- Modify: `frontend/src/portal/components/BottomTabBar.js:63-82`, `frontend/src/portal/components/BottomTabBar.test.js:54-62`
- Modify: `frontend/src/portal/StatesHarness.js` (~lines 33, 35, 169-170, 241-243, 703)
- Modify: `frontend/src/portal/hooks/index.js` (imports ~44-123, 150-160; ~2741-2818; ~2915-2971; ~3031-3046)
- Modify: `frontend/src/portal/hooks/live.js` (~1821-1891)
- Modify: `frontend/src/portal/screens/AthleteDetail.js` (~19-39, 75, 158, 241-303), `frontend/src/portal/screens/AthleteDetail.test.js:15`
- Modify: `frontend/src/portal/screens/AthleteDashboard.js:147-149`, `frontend/src/portal/screens/AthleteDashboard.test.js`
- Modify: `frontend/src/portal/data/seed.js` (~348-400), `frontend/src/portal/data/athlete.js` (~34-140)
- Modify: `frontend/src/portal/hooks/index.contract.test.js` (~19, 197)
- Test: the test files above.

**Interfaces:**
- Consumes: Task 7's `hooks/index.js` (the admin dashboard no longer reads diagnostics).
- Produces: `BottomTabBar` coach set `Today, Roster` and Phil set `Sessions, Tour` (Task 10 adds Assessments); no `useDiagnostic`, `usePracticeDNA`, `fetchAthleteDiagnostics` or `saveDiagnosticCapture` anywhere in the portal.

- [ ] **Step 1: Write the failing tests**

In `frontend/src/portal/components/BottomTabBar.test.js`, replace:

```js
  const coach = await renderScreen(<BottomTabBar role="coach" selfManaged />);
  expect(labels(coach)).toEqual(['Today', 'Roster', 'Capture']);
  await coach.unmount();
});
```

with:

```js
  const coach = await renderScreen(<BottomTabBar role="coach" selfManaged />);
  expect(labels(coach)).toEqual(['Today', 'Roster']);
  await coach.unmount();
});

test('Diagnostic Capture is gone: no Capture tab for a coach or for Phil (assessments spec 8)', async () => {
  const coach = await renderScreen(<BottomTabBar role="coach" />);
  expect(labels(coach)).toEqual(['Today', 'Roster']);
  await coach.unmount();
  const phil = await renderScreen(<BottomTabBar role="coach" specialistId="phil" />);
  expect(labels(phil)).not.toContain('Capture');
  await phil.unmount();
});
```

In `frontend/src/portal/screens/AthleteDashboard.test.js`, replace:

```js
let mockOnboarding = null;
```

with:

```js
let mockOnboarding = null;
let mockOldCaptureFlag = true;
```

then replace:

```js
      onboarding: mockOnboarding,
      diagnosticCaptured: true,
```

with:

```js
      onboarding: mockOnboarding,
      diagnosticCaptured: mockOldCaptureFlag,
```

and append at the end of the file:

```js
test('the old "Book your Diagnostic" card never shows from live data (assessments spec 8)', async () => {
  mockContract = null;
  mockOldCaptureFlag = false;
  const r = await renderScreen(<AthleteDashboard bare />);
  expect(r.text()).not.toContain('Book your Diagnostic');
  await r.unmount();
  mockOldCaptureFlag = true;
});
```

Append to `frontend/src/portal/PortalRoutes.test.js`:

```js
test("a coach's old Capture link lands on their own home (Diagnostic Capture is gone)", async () => {
  mockLive.value = true;
  mockUser.value = { uid: 'c1', role: 'coach' };
  const r = await mount('/portal/capture');
  expect(r.pathname()).toBe('/portal/coach');
  expect(r.container.textContent).toBe('COACH HOME');
  await r.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/BottomTabBar.test.js src/portal/screens/AthleteDashboard.test.js src/portal/PortalRoutes.test.js`
Expected: FAIL - `BottomTabBar.test.js` (received `['Today', 'Roster', 'Capture']`), `AthleteDashboard.test.js` (text contains "Book your Diagnostic"), `PortalRoutes.test.js` (pathname is `/portal/capture`).

- [ ] **Step 3: Delete the screens and their route, tab and harness entries**

Run:

```bash
git rm frontend/src/portal/screens/DiagnosticCapture.js frontend/src/portal/screens/DiagnosticCapture.test.js frontend/src/portal/screens/PracticeDNA.js
```

In `frontend/src/portal/PortalRoutes.js`, replace:

```js
const loadRoster = () => import('./screens/Roster');
const loadCapture = () => import('./screens/DiagnosticCapture');
```

with:

```js
const loadRoster = () => import('./screens/Roster');
```

then replace:

```js
const SessionAttendance = named(loadRoster, 'SessionAttendance');
const CaptureFlow = named(loadCapture, 'CaptureFlow');
```

with:

```js
const SessionAttendance = named(loadRoster, 'SessionAttendance');
```

then replace:

```js
  attendance: [loadRoster],
  capture: [loadCapture],
  admin: [loadAdmin],
```

with:

```js
  attendance: [loadRoster],
  admin: [loadAdmin],
```

then replace:

```js
  coach: [loadRoster, loadCapture, loadAthleteDetail, loadTour],
```

with:

```js
  coach: [loadRoster, loadAthleteDetail, loadTour],
```

then replace:

```js
      <Route
        path="capture"
        element={
          <RequireRole roles={['coach']}>
            {/* Roster-first: pick the kid, then capture (owner's flow). */}
            <CaptureFlow bare onCancel={go('/portal/coach')} />
          </RequireRole>
        }
      />

      {/* Staff — admin admits every staff role's read surface; Staff & Roles
```

with:

```js
      {/* Staff — admin admits every staff role's read surface; Staff & Roles
```

In `frontend/src/portal/PortalRoutes.warm.test.js`, replace:

```js
jest.mock('./screens/DiagnosticCapture', () => ({ ...mockScreen('DiagnosticCapture'), CaptureFlow: () => null }));
jest.mock('./screens/SeasonSchedule', () => mockScreen('SeasonSchedule'));
```

with:

```js
jest.mock('./screens/SeasonSchedule', () => mockScreen('SeasonSchedule'));
```

In `frontend/src/portal/components/BottomTabBar.js`, replace:

```js
    { key: 'roster', label: 'Roster', icon: 'list', route: '/portal/roster' },
    { key: 'capture', label: 'Capture', icon: 'camera', route: '/portal/capture' },
  ],
```

with:

```js
    { key: 'roster', label: 'Roster', icon: 'list', route: '/portal/roster' },
  ],
```

then replace:

```js
    { key: 'sessions', label: 'Sessions', icon: 'today', route: '/portal/my-sessions' },
    { key: 'capture', label: 'Capture', icon: 'camera', route: '/portal/capture' },
    { key: 'tour', label: 'Tour', icon: 'trophy', route: '/portal/tour' },
  ],
  /**
   * Sprint 10 pin F: the three staff role tab sets, all pointing at the same
```

with:

```js
    { key: 'sessions', label: 'Sessions', icon: 'today', route: '/portal/my-sessions' },
    { key: 'tour', label: 'Tour', icon: 'trophy', route: '/portal/tour' },
  ],
  /**
   * Sprint 10 pin F: the three staff role tab sets, all pointing at the same
```

In `frontend/src/portal/StatesHarness.js`, replace:

```js
import Roster, { SessionAttendance } from './screens/Roster';
import DiagnosticCapture from './screens/DiagnosticCapture';
import AthleteDashboard from './screens/AthleteDashboard';
import PracticeDNA from './screens/PracticeDNA';
import CommitmentContract from './screens/CommitmentContract';
```

with:

```js
import Roster, { SessionAttendance } from './screens/Roster';
import AthleteDashboard from './screens/AthleteDashboard';
import CommitmentContract from './screens/CommitmentContract';
```

then replace:

```js
  { id: '06', title: 'Practice DNA', Screen: PracticeDNA, role: 'athlete',
    states: [['complete', 'Complete'], ['partial', 'Partial'], ['pending', 'Pending']] },
  { id: '07', title: 'Commitment Contract', Screen: CommitmentContract, role: 'athlete',
```

with:

```js
  { id: '07', title: 'Commitment Contract', Screen: CommitmentContract, role: 'athlete',
```

then replace:

```js
  { id: '14', title: 'Diagnostic Capture', Screen: DiagnosticCapture, role: 'coach',
    states: [['empty', 'Empty'], ['uploading', 'Uploading'], ['partial', 'Partial'],
             ['complete', 'Complete']] },
  { id: '15', title: 'Admin Dashboard', Screen: AdminDashboard, role: 'ops admin',
```

with:

```js
  { id: '15', title: 'Admin Dashboard', Screen: AdminDashboard, role: 'ops admin',
```

then replace:

```js
            <SavedToast message="Draft saved" />
            <SavedToast message="Published to Practice DNA" />
```

with:

```js
            <SavedToast message="Draft saved" />
```

- [ ] **Step 4: Remove the diagnostics hooks and live functions**

In `frontend/src/portal/hooks/index.js`, replace:

```js
  fetchAthlete,
  fetchAthleteDiagnostics,
  fetchAthletesByIds,
```

with:

```js
  fetchAthlete,
  fetchAthletesByIds,
```

then replace:

```js
  isLive,
  saveDiagnosticCapture,
  saveNotificationPrefs,
```

with:

```js
  isLive,
  saveNotificationPrefs,
```

then replace:

```js
  COACH_OUTSTANDING,
  DIAGNOSTIC_ATHLETE,
  DIAGNOSTIC_SECTIONS,
  HOUSEHOLD,
```

with:

```js
  COACH_OUTSTANDING,
  HOUSEHOLD,
```

then replace:

```js
  ONBOARDING,
  DNA_MODULES,
  DNA_STATES,
  DNA_SUMMARY,
  CONTRACT_TIERS,
```

with:

```js
  ONBOARDING,
  CONTRACT_TIERS,
```

Delete the diagnostics hook:

In `frontend/src/portal/hooks/index.js`, replace:

```
/**
 * Live payload for useDiagnostic(athleteId) (contract v1.8, C) — the
 * athlete's latest PUBLISHED capture (or null, "no capture yet"), their
 * single open DRAFT (or null), and the section/field catalogue every
 * capture's `values` are keyed against. Caller access (assigned coach /
 * specialist / mental / ops / owner see both; athlete/parent see published
 * only, draft always null for them) is firestore.rules' job, not this
 * function's — it fetches both lists and lets a caller who cannot read
 * drafts simply get an empty one back from fetchAthleteDiagnostics rather
 * than branching on role here.
 */
async function liveDiagnostic(athleteId) {
  // TWO queries, not one over every status (PM integration browser pass):
  // a parent's read rule is published-only, and Firestore denies a LIST
  // wholesale when any document could fail the rule — so the single
  // all-statuses query errored for every parent and their kid's detail
  // read "No capture yet" despite two published captures. The published
  // query is provable for every reader; the draft query is only provable
  // for staff, so a denial there means "no draft for you", not a failure.
  const published = await fetchAthleteDiagnostics(athleteId, { publishedOnly: true });
  let draft = null;
  try {
    const drafts = await fetchAthleteDiagnostics(athleteId, { draftOnly: true });
    draft = drafts[0] ?? null;
  } catch (err) {
    if (err?.code !== ERR.PERMISSION) throw err;
  }
  return { latest: published[0] ?? null, draft, sections: DIAGNOSTIC_SECTIONS };
}

/**
 * GET /athletes/:id/diagnostics (14) — contract v1.8, C. PINNED SHAPE
 * (supersedes the prior no-arg, seed-only version): { data: { latest
 * (published capture | null), draft (open draft | null), sections },
 * loading, error, saveDraft(values, notes), publish(values, notes) }.
 *
 * DEVIATION FLAGGED: the old signature took no athleteId and returned
 * { athlete, sections } with no latest/draft/save actions at all — this is
 * a breaking payload shape change, called out per this lane's "changing a
 * payload shape requires stating it in the report" rule. DiagnosticCapture
 * (frontend lane's, in parallel) must be updated to call
 * useDiagnostic(athleteId) and read data.latest/data.draft instead of
 * data.athlete.
 *
 * Seed mode keeps DIAGNOSTIC_ATHLETE's synthetic capture as `latest` (never
 * a draft — the harness demonstrates the capture FORM against
 * DIAGNOSTIC_SECTIONS, not a resume-a-draft state) so the harness's
 * existing states keep rendering; saveDraft/publish are local no-op echoes
 * there, matching every other write action's seed posture in this file.
 */
export function useDiagnostic(athleteId) {
  const live = isLive() && athleteId != null;
  const diagnosticsGen = useInvalidation('diagnostics');

  const state = useSeedResource(
    live
      ? null
      : {
          latest: { athlete: DIAGNOSTIC_ATHLETE, values: {}, notes: null },
          draft: null,
          sections: DIAGNOSTIC_SECTIONS,
        },
    live
      ? { source: () => liveDiagnostic(athleteId), deps: ['diagnostic', athleteId, diagnosticsGen] }
      : undefined
  );

  const saveDraft = async (values, notes = null) => {
    if (!live) return { athleteId, status: 'draft', simulated: true };
    return saveDiagnosticCapture(athleteId, { values, notes, publish: false });
  };
  const publish = async (values, notes = null) => {
    if (!live) return { athleteId, status: 'published', simulated: true };
    return saveDiagnosticCapture(athleteId, { values, notes, publish: true });
  };

  return { ...state, saveDraft, publish };
}

/**
```

with:

```
/**
```

Then, in `frontend/src/portal/hooks/index.js`, replace:

```js
  const [nextSessions, logs, published, tokens] = await Promise.all([
    upcoming.length ? fetchSessionsByIds([upcoming[0].sessionId]) : Promise.resolve([]),
    contractMinutes != null ? fetchContractLogs(ctx.athlete.id) : Promise.resolve(null),
    fetchAthleteDiagnostics(ctx.athlete.id, { publishedOnly: true }),
    homeTokens(ctx.athlete, ctx.pkg, ctx.bookings, normalizeAnchorDay(ctx.household?.periodAnchorDay), today),
  ]);
```

with:

```js
  const [nextSessions, logs, tokens] = await Promise.all([
    upcoming.length ? fetchSessionsByIds([upcoming[0].sessionId]) : Promise.resolve([]),
    contractMinutes != null ? fetchContractLogs(ctx.athlete.id) : Promise.resolve(null),
    homeTokens(ctx.athlete, ctx.pkg, ctx.bookings, normalizeAnchorDay(ctx.household?.periodAnchorDay), today),
  ]);
```

then replace:

```js
  // `published` (contract v1.8 C): whether a published diagnostic exists
  // yet - the home screen's "Start here" card keys off it in live mode
  // instead of the demo-only `variant === 'new'` flag.
  return {
```

with:

```js
  return {
```

then replace:

```js
    onboarding: null,
    diagnosticCaptured: published.length > 0,
    codeOfGrit: CODE_OF_GRIT,
```

with:

```js
    onboarding: null,
    codeOfGrit: CODE_OF_GRIT,
```

Delete the Practice DNA hook:

In `frontend/src/portal/hooks/index.js`, replace:

```
/**
 * GET /athletes/:id/diagnostics (06).
 *
 * Returns raw captured measurements and nothing else. No score, grade, letter
 * or percentile is derived anywhere in this path — the Blueprint measures an
 * athlete against their own future progress, not a model swing, and a rating
 * computed here would leak onto the screen.
 */
export function usePracticeDNA({ variant = 'complete' } = {}) {
  const captured = DNA_STATES[variant] ?? DNA_STATES.complete;
  return useSeedResource({
    summary: DNA_SUMMARY[variant] ?? DNA_SUMMARY.complete,
    modules: DNA_MODULES.map((m) => ({ ...m, captured: captured.includes(m.id) })),
  });
}

/** GET + POST /athletes/:id/commitment-contract (07). */
```

with:

```
/** GET + POST /athletes/:id/commitment-contract (07). */
```

then delete the two per-athlete diagnostics functions:

In `frontend/src/portal/hooks/live.js`, replace:

```
/**
 * Every diagnostics capture for one athlete (contract v1.8, C), newest
 * first. `publishedOnly` is how a member caller (athlete/parent) stays
 * inside firestore.rules' PUBLISHED-only read grant; a staff caller omits it
 * and sees drafts too. Sorted client-side rather than via orderBy() so no
 * new composite index is needed for a subcollection this small (a handful
 * of captures per athlete, ever).
 */
export async function fetchAthleteDiagnostics(athleteId, { publishedOnly = false, draftOnly = false } = {}) {
  if (!athleteId) {
    throw new LiveDataError(ERR.INVALID, 'fetchAthleteDiagnostics: athleteId is required.');
  }
  try {
    // One status per query: the published-only read rule makes an
    // unfiltered list unprovable for athletes/parents (see liveDiagnostic).
    const filters = publishedOnly
      ? [where('status', '==', 'published')]
      : draftOnly
      ? [where('status', '==', 'draft')]
      : [];
    const snap = await getDocs(query(collection(db, 'athletes', athleteId, 'diagnostics'), ...filters));
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (b.capturedAt?.toMillis?.() ?? 0) - (a.capturedAt?.toMillis?.() ?? 0));
    return rows;
  } catch (err) {
    throw wrap(err, 'fetchAthleteDiagnostics');
  }
}

/**
 * Save a diagnostics capture (contract v1.8, C) — upserts the athlete's
 * single OPEN draft (queried by status == 'draft', never a guessed id: this
 * collection uses auto-ids, so there is no `{athleteId}_{x}` keyspace to
 * probe the way bookings/contractLogs do). `publish: true` flips the
 * capture to 'published'; because the query only ever finds a doc whose
 * status is still 'draft', a SECOND save after publishing finds nothing and
 * creates a fresh capture instead of reopening the published one — exactly
 * "a second publish creates a new capture; history is the collection."
 */
export async function saveDiagnosticCapture(athleteId, { values, notes = null, publish = false }) {
  if (!athleteId) {
    throw new LiveDataError(ERR.INVALID, 'saveDiagnosticCapture: athleteId is required.');
  }
  const user = requireUser();
  try {
    const status = publish ? 'published' : 'draft';
    const now = serverTimestamp();
    const openDraft = await getDocs(
      query(collection(db, 'athletes', athleteId, 'diagnostics'), where('status', '==', 'draft'))
    );
    if (!openDraft.empty) {
      const ref = openDraft.docs[0].ref;
      await updateDoc(ref, { values, notes, status, updatedAt: now });
      bump('diagnostics');
      return { id: ref.id, athleteId, status };
    }
    const ref = doc(collection(db, 'athletes', athleteId, 'diagnostics'));
    await setDoc(ref, {
      athleteId,
      capturedBy: user.uid,
      capturedAt: now,
      updatedAt: now,
      status,
      values,
      notes,
    });
    bump('diagnostics');
    return { id: ref.id, athleteId, status };
  } catch (err) {
    throw wrap(err, 'saveDiagnosticCapture');
  }
}

/**
```

with:

```
/**
```

In `frontend/src/portal/hooks/index.contract.test.js`, replace:

```js
  fetchAthlete: jest.fn(),
  fetchAthleteDiagnostics: jest.fn(),
  fetchBookings: jest.fn(),
```

with:

```js
  fetchAthlete: jest.fn(),
  fetchBookings: jest.fn(),
```

then replace:

```js
    live.fetchContractLogs.mockResolvedValue([]);
    live.fetchAthleteDiagnostics.mockResolvedValue([]);
    const h = await mountHook(() => useAthleteDashboard());
```

with:

```js
    live.fetchContractLogs.mockResolvedValue([]);
    const h = await mountHook(() => useAthleteDashboard());
```

- [ ] **Step 5: The athlete screens and the seed data**

In `frontend/src/portal/screens/AthleteDetail.js`, delete the diagnostics hook:

In `frontend/src/portal/screens/AthleteDetail.js`, replace:

```
/**
 * Sprint 10 pin C: same fallback rationale as DiagnosticCapture.js's own
 * useDiagnosticState - useDiagnostic() in this worktree takes no argument
 * and returns { athlete, sections }, not the pinned { latest, draft,
 * sections }. Called with the pinned athleteId argument regardless (the old
 * implementation just ignores it); `latest` defaults to null (honest "no
 * capture yet") until routing lands the real shape.
 */
function useLatestDiagnostic(athleteId) {
  const state = hooks.useDiagnostic(athleteId);
  // `sections` is the field catalogue the capture's `values` are keyed
  // against — it lives BESIDE `latest` in the hook payload, not inside it
  // (PM integration browser pass: the card read latest.sections, which a
  // capture doc never carries, so it rendered "No capture yet" forever).
  return {
    latest: state.data?.latest ?? null,
    sections: state.data?.sections ?? [],
    loading: state.loading,
    error: state.error,
  };
}

/** The pinned contract tier set (contract v1.8 §B) - not invented. */
```

with:

```
/** The pinned contract tier set (contract v1.8 §B) - not invented. */
```

then, in `frontend/src/portal/screens/AthleteDetail.js`, replace:

```js
  const athlete = data?.athlete;
  const diagnostic = useLatestDiagnostic(athleteId);
```

with:

```js
  const athlete = data?.athlete;
```

then replace:

```js
            {showContract ? <ContractHistory history={data.history} /> : null}
            <ProgressSummary latest={diagnostic.latest} sections={diagnostic.sections} />
```

with:

```js
            {showContract ? <ContractHistory history={data.history} /> : null}
```

and delete the capture card:

In `frontend/src/portal/screens/AthleteDetail.js`, replace:

```
/**
 * Sprint 10 pin C: the scan found this card shipping developer commentary
 * ("arrives here in a later phase") straight to a parent. It now shows the
 * latest PUBLISHED diagnostic capture's real values, grouped by section
 * exactly as they were entered, or the honest empty state when there is
 * none - never a promise about a future phase.
 */
function ProgressSummary({ latest, sections: catalogue = [] }) {
  // A capture doc is { values: { <fieldId>: number|string }, ... }; the
  // display groups those values by the catalogue's sections and shows only
  // the sections/fields the coach actually entered (an indoor capture
  // never fills the outdoor sections, and a blank row is not a result).
  const values = latest?.values ?? null;
  const sections = values
    ? catalogue
        .map((s) => ({
          id: s.id,
          title: s.title,
          fields: (s.fields ?? [])
            .filter((f) => values[f.id] !== undefined && values[f.id] !== null && values[f.id] !== '')
            .map((f) => ({ id: f.id, label: f.label, unit: f.unit, value: values[f.id] })),
        }))
        .filter((s) => s.fields.length > 0)
    : [];
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 13 }}>Diagnostic capture</SectionLabel>
      {sections.length === 0 ? (
        <Body size={12}>No capture yet — the coach records this at a session.</Body>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map((section) => (
            <div key={section.id ?? section.title}>
              <div style={{ font: `600 12px ${font.body}`, color: color.text, marginBottom: 6 }}>
                {section.title}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                {(section.fields ?? []).map((f) => (
                  <div key={f.id ?? f.label} style={{ minWidth: 70 }}>
                    <div
                      style={{
                        font: `400 9px ${font.body}`,
                        textTransform: 'uppercase',
                        letterSpacing: '.08em',
                        color: color.textTertiary,
                      }}
                    >
                      {f.label}
                    </div>
                    <div style={{ font: `600 15px ${font.body}`, color: color.text, marginTop: 2 }}>
                      {f.value ?? '—'}
                      {f.unit ? <span style={{ font: `400 11px ${font.body}` }}> {f.unit}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/**
```

with:

```
/**
```

In `frontend/src/portal/screens/AthleteDetail.test.js`, replace:

```js
  useDiagnostic: () => ({ data: null, loading: false, error: null }),
  useAthleteTier: () => ({ setTier: async () => {} }),
```

with:

```js
  useAthleteTier: () => ({ setTier: async () => {} }),
```

In `frontend/src/portal/screens/AthleteDashboard.js`, replace:

```js
        {/* Live: shown until a published diagnostic exists (contract v1.8 C);
            seed: the demo 'new' variant. */}
        {variant === 'new' || data?.diagnosticCaptured === false ? <StartHere onBook={onBook} /> : null}
```

with:

```js
        {/* The harness's 'new' variant only: the live gate was the diagnostics
            read, removed with Diagnostic Capture (assessments spec 8). */}
        {variant === 'new' ? <StartHere onBook={onBook} /> : null}
```

and delete the capture catalogue:

In `frontend/src/portal/data/seed.js`, replace:

```
/** Screen 14. Four numeric sections plus the video capture. */
export const DIAGNOSTIC_ATHLETE = {
  name: 'A. Nguyen',
  meta: 'Diagnostic Protocol · Feb 18 · age 12',
};

export const DIAGNOSTIC_SECTIONS = [
  {
    id: 'launch',
    title: 'Launch monitor',
    fields: [
      { id: 'clubhead', label: 'Clubhead speed', unit: 'mph' },
      { id: 'ball', label: 'Ball speed', unit: 'mph' },
      { id: 'smash', label: 'Smash factor', unit: '' },
      { id: 'carry7i', label: 'Carry 7i', unit: 'yd' },
    ],
  },
  {
    id: 'mobility',
    title: 'Mobility & stability',
    fields: [
      { id: 'hip', label: 'Hip rotation', unit: '°' },
      { id: 'shoulder', label: 'Shoulder rotation', unit: '°' },
      { id: 'balance', label: 'Single-leg balance', unit: 'sec' },
    ],
  },
  {
    id: 'shortgame',
    title: 'Short game',
    fields: [
      { id: 'd30', label: '30 yd dispersion', unit: 'ft' },
      { id: 'd50', label: '50 yd dispersion', unit: 'ft' },
      { id: 'd70', label: '70 yd dispersion', unit: 'ft' },
    ],
  },
  {
    id: 'putting',
    title: 'Putting',
    fields: [
      { id: 'p3', label: '3 ft made', unit: '/10' },
      { id: 'p6', label: '6 ft made', unit: '/10' },
      { id: 'p10', label: '10 ft start line', unit: '%' },
    ],
  },
];

/**
```

with:

```
/**
```

In `frontend/src/portal/data/athlete.js`, delete the Practice DNA fixtures:

In `frontend/src/portal/data/athlete.js`, replace:

```
/* ---------------------------------------------------------------- 06 ----- */

/**
 * Six modules, always in this order.
 *
 * Hard constraint from the handoff: no score, grade, letter or percentile
 * anywhere on this screen. Deltas read against the athlete's own last capture
 * only — the Blueprint is explicit that athletes are measured against their own
 * future progress, not a model swing. `stats` below are raw measurements, never
 * a rating.
 *
 * `source` (Sprint 5, direction-only): where the module's data comes from —
 * 'measured' (captured on facility equipment), 'self' (athlete-reported,
 * needs an entry form), 'upload' (athlete/guardian-submitted, needs a
 * dropzone stub), or 'parallax' (a named future integration, no API invented
 * yet). Screens render badges/forms off this field.
 */
export const DNA_MODULES = [
  {
    id: 'swing',
    name: 'Swing Biomechanics',
    descriptor: 'Multi-angle video at key positions',
    kind: 'media',
    caption: 'SWING CAPTURE — 4 angles · Nov 14',
    source: 'measured',
  },
  {
    id: 'launch',
    name: 'Launch Monitor',
    descriptor: 'Clubhead and ball speed, smash, carry',
    kind: 'stats',
    stats: [
      { key: 'Clubhead', value: '89 mph' },
      { key: 'Ball speed', value: '128 mph' },
      { key: 'Carry 7i', value: '142 yd' },
    ],
    source: 'parallax',
  },
  {
    id: 'mobility',
    name: 'Mobility & Stability',
    descriptor: 'Hip and shoulder rotation, single-leg balance',
    kind: 'stats',
    stats: [
      { key: 'Hip rot.', value: '41°' },
      { key: 'Shoulder', value: '86°' },
      { key: 'Balance', value: '22 sec' },
    ],
    source: 'measured',
  },
  {
    id: 'shortgame',
    name: 'Short Game',
    descriptor: 'Wedge distance control from 30, 50, 70 yd',
    kind: 'stats',
    stats: [
      { key: '30 yd', value: '11 ft' },
      { key: '50 yd', value: '14 ft' },
      { key: '70 yd', value: '19 ft' },
    ],
    source: 'self',
  },
  {
    id: 'putting',
    name: 'Putting Stroke',
    descriptor: 'Start-line control from 3, 6 and 10 feet',
    kind: 'stats',
    stats: [
      { key: '3 ft', value: '9 / 10' },
      { key: '6 ft', value: '6 / 10' },
      { key: '10 ft', value: '72%' },
    ],
    source: 'self',
  },
  {
    id: 'mental',
    name: 'Mental Game Intake',
    descriptor: 'Yannick’s questionnaire — pressure and routine',
    kind: 'media',
    caption: 'INTAKE RESPONSES — seeds the Debrief prompts',
    source: 'upload',
  },
];

/** Which modules are captured, per state. Order above never changes. */
export const DNA_STATES = {
  complete: ['swing', 'launch', 'mobility', 'shortgame', 'putting', 'mental'],
  partial: ['swing', 'launch', 'mobility'],
  pending: [],
};

export const DNA_SUMMARY = {
  complete: {
    tone: 'green',
    count: '6 of 6',
    pct: 100,
    title: 'Baseline captured Nov 14',
    body: 'Next re-capture opens Mar 14 — four months on, so the comparison means something.',
  },
  partial: {
    tone: 'yellow',
    count: '3 of 6',
    pct: 50,
    title: 'Baseline partly captured',
    body: 'Short game, putting, and mental intake still open.',
  },
  pending: {
    tone: 'yellow',
    count: '0 of 6',
    pct: 0,
    title: 'Nothing captured yet',
    body: 'Diagnostic Protocol booked for Feb 27. Everything on this screen fills in from it.',
  },
};

/* ---------------------------------------------------------------- 07 ----- */
```

with:

```
/* ---------------------------------------------------------------- 07 ----- */
```

- [ ] **Step 6: Run every gate to verify it passes**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal`
Expected: PASS - every portal suite, including `BottomTabBar.test.js`, `AthleteDashboard.test.js`, `PortalRoutes.test.js`, `PortalRoutes.warm.test.js`, `AthleteDetail.test.js`, `index.contract.test.js` and `index.assessments.test.js`.

Run: `cd frontend && npx eslint src/portal && npm run build`
Expected: no lint errors (no unused `DNA_*` or `DIAGNOSTIC_*` left behind); "Compiled successfully".

Run: `git grep -n -E "DiagnosticCapture|PracticeDNA|DIAGNOSTIC_SECTIONS|useDiagnostic|fetchAllDiagnostics|fetchAthleteDiagnostics|saveDiagnosticCapture|usePracticeDNA" -- frontend`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/portal
git commit -m "chore(assessments): remove Diagnostic Capture from the portal

Screen, route, tab, harness entries, diagnostics hooks and live
functions, the athlete detail card and the Practice DNA stub go; the
athlete home's diagnostics read goes with them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Diagnostics rules read-only, the emulator seed and the data model

Spec 8 removes the diagnostics rules, but the live bundle reads diagnostics on the athlete home and the admin dashboard inside one `Promise.all` with everything else: rules that refuse those reads would fail both screens for every family and the owner from the rules deploy until the new portal is live. So this release keeps the diagnostics **read** rules (read-only: create and update go) and deploys in the spec 10 order (functions, rules, portal) with no broken window; Task 27, after the portal is live, removes the read rules too. The emulator seed's diagnostics and DATA-MODEL's diagnostics section go now.

**Files:**
- Modify: `firestore.rules` (~394-454: the per-athlete diagnostics match keeps its read rule only; ~477-507: the collection-group read stays, with a note)
- Modify: `scripts/rules-probes/assessments.mjs` (append `taskDiagnosticsReadOnly`), `scripts/verify-rules.mjs` (import, runPass)
- Modify: `scripts/seed-firestore.mjs` (~139-145, ~985-1045, ~1531, ~1688-1694), `docs/portal/DATA-MODEL.md` (~28, ~812-876, ~1357-1366, ~2055-2058)
- Test: `scripts/verify-rules.mjs` (emulator, both passes)

**Interfaces:**
- Consumes: `groupListAs`, `tok`, `uids`, `ATH` in `scripts/rules-probes/assessments.mjs` (Task 4).
- Produces: `taskDiagnosticsReadOnly()` in `scripts/rules-probes/assessments.mjs` (Task 27 replaces it with `taskDiagnosticsGone()`); `scripts/verify-rules.mjs` runs `await taskAssessments(); await taskDiagnosticsReadOnly();`.

- [ ] **Step 1: Write the failing probe**

Append to `scripts/rules-probes/assessments.mjs`:

```js
// Assessments spec 8: Diagnostic Capture is gone (production held 0 docs on 2026-10-14). Its rules stay
// read-only for this release - a portal bundle from before it reads diagnostics beside everything else
// while the rules deploy first - and plan Task 27 removes the reads after the portal is live.
export async function taskDiagnosticsReadOnly() {
  console.log('Diagnostics: read-only for this release (Diagnostic Capture removed)');
  const owner = tok(uids.owner);
  await seed('users', uids.owner, { role: 'owner' });
  await seed('athletes', ATH, { name: 'Probe Athlete', householdId: 'hh', dob: '2012-04-10', contractMinutes: null, coachId: 'coach-probe', packageId: 't-6' });
  await seed(`athletes/${ATH}/diagnostics`, 'old-1', { athleteId: ATH, capturedBy: 'coach-probe', status: 'published', values: {}, notes: null });
  try {
    for (const [who, auth] of [['the owner', owner], ['ops', t.ops], ['the assigned coach', t.coach]]) {
      expect(`${who}: a capture still reads (an old bundle keeps loading)`, await call('GET', `/athletes/${ATH}/diagnostics/old-1`, null, auth).then(status), 200);
    }
    expect('the owner: the collection-group list still reads', await groupListAs(owner, 'diagnostics'), 200);
    expect('the assigned coach: a new capture refused', await createAs(t.coach, `athletes/${ATH}/diagnostics`, 'new-1',
      { athleteId: ATH, capturedBy: 'coach-probe', status: 'draft', values: {}, notes: null }, ['capturedAt', 'updatedAt']), 403);
  } finally {
    await del(`athletes/${ATH}/diagnostics`, 'old-1');
    await del(`athletes/${ATH}/diagnostics`, 'new-1');
    await del('athletes', ATH);
    await del('users', uids.owner);
  }
}
```

In `scripts/verify-rules.mjs`, replace:

```js
import { taskAssessments } from './rules-probes/assessments.mjs';
```

with:

```js
import { taskAssessments, taskDiagnosticsReadOnly } from './rules-probes/assessments.mjs';
```

and replace:

```js
    await taskAssessments();
```

with:

```js
    await taskAssessments(); await taskDiagnosticsReadOnly();
```

- [ ] **Step 2: Run the probe to verify it fails**

Run: `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"`
Expected: FAIL - `the assigned coach: a new capture refused -> 200 (wanted 403)`; the read lines pass.

- [ ] **Step 3: The diagnostics rules become read-only**

In `firestore.rules`, replace:

```
      // ---- athletes/{id}/diagnostics/{captureId} -----------------------
      // Sprint 10 (contract v1.8, C "Diagnostics persistence"). Shape:
```

with:

```
      // ---- athletes/{id}/diagnostics/{captureId} -----------------------
      // READ-ONLY since 2026-10-14: Diagnostic Capture was removed
      // (assessments spec 8; production held 0 docs) and no client writes
      // a capture any more. The read grant stays for this release only: a
      // portal bundle from before it reads diagnostics on the athlete home
      // and the admin dashboard beside everything else, and the rules
      // deploy ahead of the portal (spec 10). The follow-up after the
      // portal is live (assessments plan Task 27) removes this block and
      // the collection-group read below.
      // Sprint 10 (contract v1.8, C "Diagnostics persistence"). Shape:
```

then replace:

```
        // Field/type checks only — caller-identity on capturedBy is handled
        // separately per create/update below, because the two operations
        // mean different things for that field (see the comment there).
        function diagnosticFieldsOk() {
          let d = request.resource.data;
          return d.keys().hasAll(['athleteId', 'capturedBy', 'capturedAt', 'updatedAt', 'status', 'values', 'notes'])
            && d.keys().hasOnly(['athleteId', 'capturedBy', 'capturedAt', 'updatedAt', 'status', 'values', 'notes'])
            && d.athleteId == athleteId
            && d.capturedBy is string
            && d.status in ['draft', 'published']
            && d.values is map
            && (d.notes is string || d.notes == null);
        }
        // On CREATE, capturedBy is who is capturing right now — the caller.
        allow create: if signedIn() && diagnosticStaffOk() && diagnosticFieldsOk()
          && request.resource.data.capturedBy == request.auth.uid
          && request.resource.data.capturedAt == request.time
          && request.resource.data.updatedAt == request.time;
        // On UPDATE, capturedBy/capturedAt stay whatever they originally
        // were — immutable history, NOT re-pinned to the current caller.
        // Deliberately does NOT require the current editor to be the
        // original capturer: any qualifying staff member (diagnosticStaffOk)
        // may continue or publish a draft someone else opened — a
        // specialist finishing a coach's in-progress capture is a real
        // workflow, not an edge case to block.
        allow update: if signedIn() && diagnosticStaffOk() && diagnosticFieldsOk()
          && request.resource.data.capturedAt == resource.data.capturedAt
          && request.resource.data.capturedBy == resource.data.capturedBy
          && request.resource.data.updatedAt == request.time;
        allow read: if signedIn() && (
```

with:

```
        allow read: if signedIn() && (
```

then replace:

```
    // ---- diagnostics collection-group read ------------------------------
    // Sprint 10 (contract v1.8, C + D): the Admin "athletes with no
```

with:

```
    // ---- diagnostics collection-group read ------------------------------
    // Read-only until assessments plan Task 27 removes it with the
    // per-athlete diagnostics match (Diagnostic Capture removed 2026-10-14).
    // Sprint 10 (contract v1.8, C + D): the Admin "athletes with no
```

- [ ] **Step 4: The emulator seed and the data model**

In `scripts/seed-firestore.mjs`, delete the header paragraph:

In `scripts/seed-firestore.mjs`, replace:

```
 *   diagnostics — two `athletes/jordan/diagnostics` captures (contract v1.8,
 *                  Sprint 10 pin C): an older PUBLISHED one with a value for
 *                  every DIAGNOSTIC_SECTIONS field id, and a newer DRAFT with
 *                  just a couple of fields filled in — both `capturedBy:
 *                  'coach-luke'`. Field ids are read straight off
 *                  DIAGNOSTIC_SECTIONS in seed.js and enumerated in
 *                  DATA-MODEL.md, never retyped independently.
 *   loginInvites / calendlyEvents — Sprint 20: one open child-login invite (reese) and one Calendly-sourced Yannick session + booking + ledger row (see the cal- block below).
```

with:

```
 *   loginInvites / calendlyEvents — Sprint 20: one open child-login invite (reese) and one Calendly-sourced Yannick session + booking + ledger row (see the cal- block below).
```

delete the fixture:

In `scripts/seed-firestore.mjs`, replace:

```
  // athletes/jordan/diagnostics (contract v1.8, Sprint 10 pin C) — two
  // captures keyed by the same DIAGNOSTIC_SECTIONS field ids the Diagnostic
  // Capture screen renders (read straight off seed.js, enumerated in
  // DATA-MODEL.md so the key list can't drift from what this script writes):
  //   published-1 — the older, COMPLETE capture: every one of the 13 field
  //     ids across all four sections has a value, status 'published', so the
  //     parent/athlete PUBLISHED-only read and the AthleteDetail "Progress
  //     summary" replacement (pin C) both have something real to render.
  //   draft-1 — the newer, IN-PROGRESS capture: only the launch monitor's
  //     first two fields are filled in, status 'draft' — a parent/athlete
  //     read must never see this one; only staff/coach/specialist reads do.
  // Both capturedBy coach-luke, jordan's assigned coach.
  const diagCapturedAtPublished = new Date();
  diagCapturedAtPublished.setDate(diagCapturedAtPublished.getDate() - 30);
  diagCapturedAtPublished.setHours(16, 0, 0, 0);
  const diagCapturedAtDraft = new Date();
  diagCapturedAtDraft.setDate(diagCapturedAtDraft.getDate() - 2);
  diagCapturedAtDraft.setHours(16, 30, 0, 0);
  const jordanDiagnostics = new Map([
    [
      'published-1',
      {
        athleteId: 'jordan',
        capturedBy: coachUid,
        capturedAt: diagCapturedAtPublished,
        updatedAt: diagCapturedAtPublished,
        status: 'published',
        // Every DIAGNOSTIC_SECTIONS field id (13, across launch/mobility/
        // shortgame/putting) — see DATA-MODEL.md for the enumerated list.
        values: {
          clubhead: 88,
          ball: 118,
          smash: 1.34,
          carry7i: 145,
          hip: 42,
          shoulder: 85,
          balance: 22,
          d30: 6,
          d50: 9,
          d70: 13,
          p3: 9,
          p6: 6,
          p10: 55,
        },
        notes: 'Full capture, all four sections — clean session, no equipment issues.',
      },
    ],
    [
      'draft-1',
      {
        athleteId: 'jordan',
        capturedBy: coachUid,
        capturedAt: diagCapturedAtDraft,
        updatedAt: diagCapturedAtDraft,
        status: 'draft',
        // Only a couple of fields — an in-progress capture, on purpose.
        values: { clubhead: 90, ball: 121 },
        notes: null,
      },
    ],
  ]);

  // contractLogs — Jordan's practice history for the last ~2 weeks (contract
```

with:

```
  // contractLogs — Jordan's practice history for the last ~2 weeks (contract
```

then, in `scripts/seed-firestore.mjs`, replace:

```js
    enrollmentRequests,
    'athletes/jordan/diagnostics': jordanDiagnostics,
    staffInvites,
```

with:

```js
    enrollmentRequests,
    staffInvites,
```

and delete the sanity print:

In `scripts/seed-firestore.mjs`, replace:

```
  console.log('\nathletes/jordan/diagnostics (contract v1.8):');
  for (const [id, doc] of collections['athletes/jordan/diagnostics']) {
    console.log(
      `  athletes/jordan/diagnostics/${id}: status=${doc.status} capturedBy=${doc.capturedBy}` +
        ` fields=${Object.keys(doc.values).length}/13 notes=${JSON.stringify(doc.notes)}`
    );
  }

  console.log('\nstaffInvites (contract v1.8):');
```

with:

```
  console.log('\nstaffInvites (contract v1.8):');
```

In `docs/portal/DATA-MODEL.md`, delete the id-conventions row:

In `docs/portal/DATA-MODEL.md`, replace:

```
| `athletes/{athleteId}/diagnostics` | auto id | **Contract v1.8, Sprint 10.** A capture history, not a keyspace-enforced singleton — an athlete gets many captures over time, so there is no natural deterministic key the way `bookings`/`contractLogs`/`tournamentResults` have one. Seed uses readable slugs (`published-1`, `draft-1`) in the same "readable over random, the emulator mints no real auto-ids anyway" spirit as the `users` row above. |
| `staffInvites` | auto id | **Contract v1.8, Sprint 10.** Not a keyspace-enforced collection either — many invites can exist over time, including two for the same email (a re-invite after one lapses). Seed uses a readable slug (`invite-1`). |
```

with:

```
| `staffInvites` | auto id | **Contract v1.8, Sprint 10.** Not a keyspace-enforced collection either — many invites can exist over time, including two for the same email (a re-invite after one lapses). Seed uses a readable slug (`invite-1`). |
```

the section:

In `docs/portal/DATA-MODEL.md`, replace:

```
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
```

with:

```
### `athletes/{athleteId}/diagnostics/{captureId}` (removed 2026-10-14)

Diagnostic Capture was removed with the assessments release (assessments spec 8; production held 0 docs on 2026-10-14). The portal no longer reads or writes a capture. `firestore.rules` keeps a read-only grant (per athlete and collection group) so a bundle from before the release keeps loading while the rules deploy first; the follow-up after the portal is live (assessments plan Task 27) removes it and this note.

### `staffInvites/{id}` (contract v1.8, Sprint 10)
```

the query note:

In `docs/portal/DATA-MODEL.md`, replace:

```
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
```

with:

```
Two more v1.8 reads, both single equality filters on one field — automatic
```

and the seeding bullet:

In `docs/portal/DATA-MODEL.md`, replace:

```
- seeds two `athletes/jordan/diagnostics` captures (contract v1.8, pin C):
  an older `published-1` with a value for **every** `DIAGNOSTIC_SECTIONS`
  field id (13, enumerated [above](#athletesathleteiddiagnosticscaptureid-contract-v18-sprint-10)),
  and a newer `draft-1` with just the launch monitor's first two fields —
  both `capturedBy: 'coach-luke'`.
- seeds ONE pending `staffInvites` doc (contract v1.8, pin E) at a
```

with:

```
- seeds ONE pending `staffInvites` doc (contract v1.8, pin E) at a
```

- [ ] **Step 5: Run every gate to verify it passes**

Run: `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"`
Expected: `ALL PASS (both passes)`, including every `Diagnostics:` line.

Run: `node scripts/seed-firestore.mjs --dry-run`
Expected: the plan prints with no `athletes/jordan/diagnostics` collection and exits 0.

Run: `node --test scripts/test/*.test.mjs`
Expected: `# fail 0`.

Run: `git grep -n -E "DiagnosticCapture|PracticeDNA|DIAGNOSTIC_SECTIONS|useDiagnostic|fetchAllDiagnostics|fetchAthleteDiagnostics|saveDiagnosticCapture|usePracticeDNA" -- frontend scripts firestore.rules functions`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules scripts/rules-probes/assessments.mjs scripts/verify-rules.mjs scripts/seed-firestore.mjs docs/portal/DATA-MODEL.md
git commit -m "chore(assessments): diagnostics rules read-only; seed and data model

No client creates or updates a capture; the read grants stay for this
release so the live bundle keeps loading while the rules deploy first
(spec 10 order), and go after the portal is live. The emulator seed's
captures and DATA-MODEL's diagnostics section go now.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The Assessments permission - session, tab bar and Staff & Roles

**Files:**
- Create: `frontend/src/portal/hooks/assessorTab.js`
- Modify: `frontend/src/portal/hooks/useAuthSession.js` (imports ~11-13; doc ~76; `toUser` ~118-131; `unprovisionedUser` ~134-136; `resolveProfile` ~210-230; the auth listener ~238-245; `refresh` ~260)
- Modify: `frontend/src/portal/components/BottomTabBar.js` (imports, `TABS.coach`, `TABS.coachSpecialist`, `TABS.mental`, the component)
- Modify: `frontend/src/portal/hooks/index.js` (`liveStaff`, ~3890)
- Create: `frontend/src/portal/components/AssessorToggle.js`
- Modify: `frontend/src/portal/screens/StaffRoles.js` (imports; the staff row ~96-108)
- Test: `frontend/src/portal/hooks/useAuthSession.test.js`, `frontend/src/portal/components/BottomTabBar.test.js`, `frontend/src/portal/components/AssessorToggle.test.js`, `frontend/src/portal/screens/StaffRoles.test.js`, `frontend/src/portal/hooks/index.assessments.test.js`

**Interfaces:**
- Consumes: `showsAssessmentsTab` (Task 3); `setStaffAssessor` (Task 5); the rules' owner-only `users.assessor` (Task 4).
- Produces:
  - `useAuthSession().user.assessor: boolean`
  - `hooks/assessorTab.js`: `publishAssessorTab(value: boolean): void`, `useAssessorTab(): boolean`
  - `BottomTabBar` prop `assessments?: boolean` (default: the session's `useAssessorTab()`); tab `{ key: 'assessments', label: 'Assessments', route: '/portal/assessments' }` for coach, Phil's set and mental, shown for Phil (`specialistId === 'phil'`) or when `assessments` is true
  - `useStaff().data.staff[i].assessor: boolean`
  - `AssessorToggle({ member: { id, name, role, assessor } })`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/portal/hooks/useAuthSession.test.js`, replace:

```js
import useAuthSession, { claimStateOf, createLoginError, resendError, resolveSelfManaged, useSelfManaged, verifyContinueUrl } from './useAuthSession';
```

with:

```js
import useAuthSession, { claimStateOf, createLoginError, resendError, resolveSelfManaged, useSelfManaged, verifyContinueUrl } from './useAuthSession';
import { useAssessorTab } from './assessorTab';
```

then append at the end of the file:

```js
describe('the Assessments permission (assessments spec 3, 5)', () => {
  test('user.assessor comes from the users doc; the tab flag is on for assessor staff and Phil, off for a plain coach and on sign-out', async () => {
    let emit = null;
    onAuthStateChanged.mockImplementation((_auth, cb) => { emit = cb; return () => {}; });
    const seen = {};
    function Probe() {
      seen.session = useAuthSession();
      seen.tab = useAssessorTab();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => { root.render(<Probe />); });
    const signIn = async (profile) => {
      live.fetchCurrentUser.mockResolvedValue(profile);
      await act(async () => { emit({ uid: profile.uid, email: `${profile.uid}@example.com`, emailVerified: true }); await new Promise((r) => setTimeout(r, 0)); });
    };
    await signIn({ uid: 'u-data', role: 'coach', assessor: true });
    expect(seen.session.user).toMatchObject({ role: 'coach', assessor: true });
    expect(seen.tab).toBe(true);
    await signIn({ uid: 'u-golf', role: 'coach' });
    expect(seen.session.user.assessor).toBe(false);
    expect(seen.tab).toBe(false);
    await signIn({ uid: 'u-phil', role: 'coach', specialistId: 'phil' });
    expect(seen.tab).toBe(true);
    await signIn({ uid: 'u-parent', role: 'parent', householdId: 'hh', assessor: true });
    expect(seen.tab).toBe(false);
    await act(async () => { emit(null); });
    expect(seen.tab).toBe(false);
    await act(async () => root.unmount());
  });
});
```

In `frontend/src/portal/components/BottomTabBar.test.js`, replace:

```js
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, useSelfManaged: () => mockSessionSelfManaged }));
```

with:

```js
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, useSelfManaged: () => mockSessionSelfManaged }));
import { publishAssessorTab } from '../hooks/assessorTab';
```

and append at the end of the file:

```js
test('Assessments: for Phil and for staff the owner gave the permission; never a plain coach (assessments spec 5)', async () => {
  const phil = await renderScreen(<BottomTabBar role="coach" specialistId="phil" active="assessments" />);
  expect(labels(phil)).toEqual(['Sessions', 'Assessments', 'Tour']);
  expect(phil.button('Assessments').getAttribute('aria-current')).toBe('page');
  await phil.click('Assessments');
  expect(phil.location().pathname).toBe('/portal/assessments');
  await phil.unmount();
  const assessor = await renderScreen(<BottomTabBar role="coach" assessments />);
  expect(labels(assessor)).toEqual(['Today', 'Roster', 'Assessments']);
  await assessor.unmount();
  publishAssessorTab(true);
  try {
    const fromSession = await renderScreen(<BottomTabBar role="coach" />);
    expect(labels(fromSession)).toEqual(['Today', 'Roster', 'Assessments']);
    await fromSession.unmount();
  } finally {
    publishAssessorTab(false);
  }
  const plain = await renderScreen(<BottomTabBar role="coach" />);
  expect(labels(plain)).toEqual(['Today', 'Roster']);
  await plain.unmount();
  const mental = await renderScreen(<BottomTabBar role="mental" />);
  expect(labels(mental)).toEqual(['Sessions', 'Tour']);
  await mental.unmount();
  const owner = await renderScreen(<BottomTabBar role="owner" assessments />);
  expect(labels(owner)).not.toContain('Assessments');
  await owner.unmount();
});
```

Create `frontend/src/portal/components/AssessorToggle.test.js`:

```js
import React from 'react';
import { renderScreen } from '../screens/testRender';
import AssessorToggle from './AssessorToggle';

let mockCalls;
let mockFail;
jest.mock('../hooks/assessmentsLive', () => ({
  __esModule: true,
  setStaffAssessor: async (args) => {
    mockCalls.push(args);
    if (mockFail) throw new Error('Missing or insufficient permissions.');
    return args;
  },
}));

beforeEach(() => {
  mockCalls = [];
  mockFail = false;
});

test("the owner switches a coach's Assessments permission on and off; each write names that account", async () => {
  const r = await renderScreen(<AssessorToggle member={{ id: 'u-data', name: 'Data Coach', role: 'coach', assessor: false }} />);
  const toggle = () => r.button('Assessments for Data Coach');
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  await r.click('Assessments for Data Coach');
  expect(mockCalls).toEqual([{ uid: 'u-data', assessor: true }]);
  expect(toggle().getAttribute('aria-checked')).toBe('true');
  await r.click('Assessments for Data Coach');
  expect(mockCalls).toEqual([{ uid: 'u-data', assessor: true }, { uid: 'u-data', assessor: false }]);
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  await r.unmount();
});

test('a refused write leaves the switch where it was and says so', async () => {
  mockFail = true;
  const r = await renderScreen(<AssessorToggle member={{ id: 'u-data', name: 'Data Coach', role: 'coach', assessor: true }} />);
  await r.click('Assessments for Data Coach');
  expect(r.button('Assessments for Data Coach').getAttribute('aria-checked')).toBe('true');
  expect(r.text()).toContain('The Assessments permission did not save. Try again.');
  await r.unmount();
});
```

Create `frontend/src/portal/screens/StaffRoles.test.js`:

```js
import React from 'react';
import { renderScreen } from './testRender';
import StaffRoles from './StaffRoles';

let mockStaff;
jest.mock('../hooks', () => ({
  useStaff: () => ({ data: { staff: mockStaff, pendingInvites: [], roles: [], auditNote: '', screeningNote: '' }, loading: false, error: null, invite: async () => ({}) }),
}));
jest.mock('../hooks/assessmentsLive', () => ({ __esModule: true, setStaffAssessor: async (args) => args }));

test('the Assessments switch sits on coach and mental rows, never on owner or ops (assessments spec 3)', async () => {
  mockStaff = [
    { id: 'o', name: 'Owner One', role: 'owner', mfa: true },
    { id: 'c', name: 'Data Coach', role: 'coach', assessor: true, mfa: true },
    { id: 'm', name: 'Yannick', role: 'mental', mfa: true },
    { id: 'x', name: 'Ops Person', role: 'ops', mfa: true },
  ];
  const r = await renderScreen(<StaffRoles bare />);
  expect(r.button('Assessments for Data Coach').getAttribute('aria-checked')).toBe('true');
  expect(r.button('Assessments for Yannick').getAttribute('aria-checked')).toBe('false');
  expect(r.button('Assessments for Owner One')).toBeNull();
  expect(r.button('Assessments for Ops Person')).toBeNull();
  await r.unmount();
});
```

In `frontend/src/portal/hooks/index.assessments.test.js`, replace:

```js
  fetchSessionsInRange: jest.fn(),
}));
```

with:

```js
  fetchSessionsInRange: jest.fn(),
  fetchStaffUsers: jest.fn(),
  fetchPendingStaffInvites: jest.fn(),
}));
```

then replace:

```js
import { deriveWhoNeedsCall, useAdminDashboard } from './index';
```

with:

```js
import { deriveWhoNeedsCall, useAdminDashboard, useStaff } from './index';
```

and append at the end of the file:

```js
test('the staff list carries the Assessments permission (absent is off)', async () => {
  live.isLive.mockReturnValue(true);
  live.fetchStaffUsers.mockResolvedValue([{ id: 'u1', displayName: 'Data Coach', role: 'coach', assessor: true }, { id: 'u2', displayName: 'Golf Coach', role: 'coach' }]);
  live.fetchPendingStaffInvites.mockResolvedValue([]);
  const h = await mountHook(() => useStaff());
  expect(h.result.current.data.staff.map((s) => [s.name, s.assessor])).toEqual([['Data Coach', true], ['Golf Coach', false]]);
  await h.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/useAuthSession.test.js src/portal/components/BottomTabBar.test.js src/portal/components/AssessorToggle.test.js src/portal/screens/StaffRoles.test.js src/portal/hooks/index.assessments.test.js`
Expected: FAIL - "Cannot find module './assessorTab'" (useAuthSession and BottomTabBar tests), "Cannot find module './AssessorToggle'", no button "Assessments for Data Coach" on Staff & Roles, and `[['Data Coach', undefined], ...]` from useStaff.

- [ ] **Step 3: The session flag and user.assessor**

Create `frontend/src/portal/hooks/assessorTab.js`:

```js
/**
 * Whether the signed-in account shows the Assessments tab (assessments spec
 * 5: "the Capture tab becomes Assessments for Phil and assessor staff").
 * useAuthSession publishes it on every profile resolution and clears it on
 * sign-out; BottomTabBar reads it, since it renders on every staff screen
 * with no session of its own - the same store as useSelfManaged. A module of
 * its own so the screen tests that mock useAuthSession keep a working bar.
 */
import { useSyncExternalStore } from 'react';

let current = false;
const listeners = new Set();

/** Set the flag (true only for a strict true). */
export function publishAssessorTab(value) {
  const next = value === true;
  if (current === next) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the signed-in account is Phil or holds the Assessments permission; false in seed mode. */
export function useAssessorTab() {
  return useSyncExternalStore(subscribe, () => current, () => false);
}
```

In `frontend/src/portal/hooks/useAuthSession.js`, replace:

```js
import { callClaimInvite } from './callables';
```

with:

```js
import { callClaimInvite } from './callables';
import { publishAssessorTab } from './assessorTab';
import { showsAssessmentsTab } from '../data/assessmentAccess';
```

then replace:

```js
 *   { user: { uid, email, role, athleteId, householdId, specialistId, emailVerified, selfManaged } | null,
```

with:

```js
 *   { user: { uid, email, role, athleteId, householdId, specialistId, assessor, emailVerified, selfManaged } | null,
```

then replace:

```js
    specialistId: profile.specialistId != null ? profile.specialistId : null,
    // Sprint 20 (spec 4.2): paying and claiming need a verified email.
```

with:

```js
    specialistId: profile.specialistId != null ? profile.specialistId : null,
    // 2026-10-14 (assessments spec 3): the owner's Assessments permission.
    assessor: profile.assessor === true,
    // Sprint 20 (spec 4.2): paying and claiming need a verified email.
```

then replace:

```js
  return { uid: fbUser.uid, email: fbUser.email != null ? fbUser.email : null, role: null, athleteId: null, householdId: null, emailVerified: Boolean(fbUser.emailVerified), selfManaged: false };
```

with:

```js
  return { uid: fbUser.uid, email: fbUser.email != null ? fbUser.email : null, role: null, athleteId: null, householdId: null, assessor: false, emailVerified: Boolean(fbUser.emailVerified), selfManaged: false };
```

then replace:

```js
      if (seq !== seqRef.current) return 'stale';
      publishSelfManaged(selfManaged);
      setSession({ user: toUser(profile, fbUser, selfManaged), provisioned: true, loading: false, error: null });
      return 'provisioned';
    } catch (err) {
      if (seq !== seqRef.current) return 'stale';
      publishSelfManaged(false);
```

with:

```js
      if (seq !== seqRef.current) return 'stale';
      publishSelfManaged(selfManaged);
      const user = toUser(profile, fbUser, selfManaged);
      publishAssessorTab(showsAssessmentsTab(user));
      setSession({ user, provisioned: true, loading: false, error: null });
      return 'provisioned';
    } catch (err) {
      if (seq !== seqRef.current) return 'stale';
      publishSelfManaged(false);
      publishAssessorTab(false);
```

then replace:

```js
      if (!fbUser) {
        publishSelfManaged(false);
        setSession(SIGNED_OUT);
```

with:

```js
      if (!fbUser) {
        publishSelfManaged(false);
        publishAssessorTab(false);
        setSession(SIGNED_OUT);
```

then replace:

```js
    if (!fbUser) { publishSelfManaged(false); setSession(SIGNED_OUT); return; }
```

with:

```js
    if (!fbUser) { publishSelfManaged(false); publishAssessorTab(false); setSession(SIGNED_OUT); return; }
```

- [ ] **Step 4: The tab bar**

In `frontend/src/portal/components/BottomTabBar.js`, replace:

```js
import { useSelfManaged } from '../hooks/useAuthSession';
```

with:

```js
import { useSelfManaged } from '../hooks/useAuthSession';
import { useAssessorTab } from '../hooks/assessorTab';

/** Assessments (spec 5): Phil and assessor staff only - see `assessments` below. */
const ASSESSMENTS_TAB = { key: 'assessments', label: 'Assessments', icon: 'chart', route: '/portal/assessments' };
```

then replace:

```js
    { key: 'roster', label: 'Roster', icon: 'list', route: '/portal/roster' },
  ],
```

with:

```js
    { key: 'roster', label: 'Roster', icon: 'list', route: '/portal/roster' },
    ASSESSMENTS_TAB,
  ],
```

then replace:

```js
    { key: 'sessions', label: 'Sessions', icon: 'today', route: '/portal/my-sessions' },
    { key: 'tour', label: 'Tour', icon: 'trophy', route: '/portal/tour' },
  ],
  /**
   * Sprint 10 pin F: the three staff role tab sets, all pointing at the same
```

with:

```js
    { key: 'sessions', label: 'Sessions', icon: 'today', route: '/portal/my-sessions' },
    ASSESSMENTS_TAB,
    { key: 'tour', label: 'Tour', icon: 'trophy', route: '/portal/tour' },
  ],
  /**
   * Sprint 10 pin F: the three staff role tab sets, all pointing at the same
```

then replace:

```js
  mental: [
    { key: 'sessions', label: 'Sessions', icon: 'today', route: '/portal/my-sessions' },
    { key: 'tour', label: 'Tour', icon: 'trophy', route: '/portal/tour' },
  ],
};
```

with:

```js
  mental: [
    { key: 'sessions', label: 'Sessions', icon: 'today', route: '/portal/my-sessions' },
    ASSESSMENTS_TAB,
    { key: 'tour', label: 'Tour', icon: 'trophy', route: '/portal/tour' },
  ],
};
```

then replace:

```js
 * @param {boolean} [selfManaged]  With `role === 'athlete'`: the self-managed
 *   set (Billing, Settings). Defaults to the signed-in session's
 *   user.selfManaged (useSelfManaged), so no athlete screen threads it.
 */
export default function BottomTabBar({ role = 'athlete', active, onChange, specialistId, selfManaged }) {
  const sessionSelfManaged = useSelfManaged();
  const payer = role === 'athlete' && (selfManaged ?? sessionSelfManaged) === true;
  const set = role === 'coach' && specialistId ? TABS.coachSpecialist : payer ? TABS.athleteSelfManaged : TABS[role] || TABS.athlete;
  // The Contract tab goes while the contract is hidden (owner, 2026-09-30).
  const items = contractEnabled() ? set : set.filter((tab) => tab.key !== 'contract');
```

with:

```js
 * @param {boolean} [selfManaged]  With `role === 'athlete'`: the self-managed
 *   set (Billing, Settings). Defaults to the signed-in session's
 *   user.selfManaged (useSelfManaged), so no athlete screen threads it.
 * @param {boolean} [assessments]  The Assessments tab on the coach, Phil and
 *   mental sets. Defaults to the signed-in session's flag (useAssessorTab:
 *   Phil, or the owner's Assessments permission); Phil's specialistId always
 *   shows it. No other role's set has the tab.
 */
export default function BottomTabBar({ role = 'athlete', active, onChange, specialistId, selfManaged, assessments }) {
  const sessionSelfManaged = useSelfManaged();
  const sessionAssessor = useAssessorTab();
  const payer = role === 'athlete' && (selfManaged ?? sessionSelfManaged) === true;
  const showAssessments = (assessments ?? sessionAssessor) === true || specialistId === 'phil';
  const set = role === 'coach' && specialistId ? TABS.coachSpecialist : payer ? TABS.athleteSelfManaged : TABS[role] || TABS.athlete;
  // The Contract tab goes while the contract is hidden (owner, 2026-09-30).
  const items = set.filter((tab) => (contractEnabled() || tab.key !== 'contract') && (tab.key !== 'assessments' || showAssessments));
```

- [ ] **Step 5: Staff rows carry the permission, and the owner's switch**

In `frontend/src/portal/hooks/index.js`, replace:

```js
        role: u.role ?? null,
        specialistId: u.specialistId ?? null,
        mfa: null,
```

with:

```js
        role: u.role ?? null,
        specialistId: u.specialistId ?? null,
        // 2026-10-14 (assessments spec 3): absent is off.
        assessor: u.assessor === true,
        mfa: null,
```

Create `frontend/src/portal/components/AssessorToggle.js`:

```js
import React, { useState } from 'react';
import { color, font } from '../tokens';
import { Toggle } from './Toggle';
import { setStaffAssessor } from '../hooks/assessmentsLive';

/**
 * The owner's Assessments permission for one coach or mental account
 * (assessments spec 3: "switched on by the owner in Staff & Roles"). On, the
 * account runs assessment waves and edits every section. Writes
 * users/{uid}.assessor, which firestore.rules lets the owner alone set; a
 * refused or failed write leaves the switch where it was and says so. The
 * bare Toggle, not ToggleRow: the row's own click would send every change
 * twice.
 */
export default function AssessorToggle({ member }) {
  const [on, setOn] = useState(member.assessor === true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const change = async (next) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await setStaffAssessor({ uid: member.id, assessor: next });
      setOn(next);
    } catch (err) {
      setError('The Assessments permission did not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `500 13px ${font.body}`, color: color.text }}>Assessments</div>
        <div style={{ font: `400 11px/1.5 ${font.body}`, color: error ? color.error : color.textTertiary }}>
          {error || 'Runs assessment waves and edits every section.'}
        </div>
      </div>
      <Toggle checked={on} onChange={change} label={`Assessments for ${member.name}`} />
    </div>
  );
}
```

In `frontend/src/portal/screens/StaffRoles.js`, replace:

```js
import AthleteRow from '../components/AthleteRow';
```

with:

```js
import AthleteRow from '../components/AthleteRow';
import AssessorToggle from '../components/AssessorToggle';
```

then replace:

```js
                trailing={
                  <StatusBadge tone={member.mfa ? 'green' : 'yellow'}>
                    {member.mfa ? 'MFA on' : 'MFA off'}
                  </StatusBadge>
                }
              />
              {member.note ? (
```

with:

```js
                trailing={
                  <StatusBadge tone={member.mfa ? 'green' : 'yellow'}>
                    {member.mfa ? 'MFA on' : 'MFA off'}
                  </StatusBadge>
                }
              />
              {/* 2026-10-14 (assessments spec 3): coaches and mental only. */}
              {member.role === 'coach' || member.role === 'mental' ? <AssessorToggle member={member} /> : null}
              {member.note ? (
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/useAuthSession.test.js src/portal/components/BottomTabBar.test.js src/portal/components/AssessorToggle.test.js src/portal/screens/StaffRoles.test.js src/portal/hooks/index.assessments.test.js src/portal/PortalRoutes`
Expected: PASS (all six suites).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/portal/hooks/assessorTab.js frontend/src/portal/hooks/useAuthSession.js frontend/src/portal/hooks/useAuthSession.test.js frontend/src/portal/components/BottomTabBar.js frontend/src/portal/components/BottomTabBar.test.js frontend/src/portal/components/AssessorToggle.js frontend/src/portal/components/AssessorToggle.test.js frontend/src/portal/screens/StaffRoles.js frontend/src/portal/screens/StaffRoles.test.js frontend/src/portal/hooks/index.js frontend/src/portal/hooks/index.assessments.test.js
git commit -m "feat(assessments): the Assessments permission and tab

users.assessor reaches the session; Phil and assessor staff get the
Assessments tab where Capture was; the owner switches it per coach on
Staff & Roles.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Responsive frame, trial inputs and save tracking

**Files:**
- Create: `frontend/src/portal/components/AssessmentFrame.js`
- Create: `frontend/src/portal/components/assessments/TrialInput.js`
- Create: `frontend/src/portal/components/assessments/Choice.js`
- Create: `frontend/src/portal/components/assessments/SaveState.js`
- Create: `frontend/src/portal/hooks/assessmentSaves.js`
- Test: `frontend/src/portal/components/AssessmentFrame.test.js`, `frontend/src/portal/components/assessments/TrialInput.test.js`, `frontend/src/portal/hooks/assessmentSaves.test.js`

**Interfaces:**
- Consumes: `PhoneFrame` (its `style` prop overrides the bare frame's `maxWidth`); `parseTrial`, `parseText`, `rangeLabel` (Task 3).
- Produces:
  - `layoutFor(width): 'phone'|'tablet'|'desktop'`, `useLayoutClass(): 'phone'|'tablet'|'desktop'`, `FRAME_MAX_WIDTH = { phone: 430, tablet: 1100, desktop: 1440 }`, default `AssessmentFrame({ bare, layout, header, footer, children })`
  - `TrialInput({ label, value, rangeKey, onCommit(value: number|null), disabled, width })` (default export) and `TextEntry({ label, value, max, onCommit(value: string|null), disabled })`
  - `Choice({ label, value, options: [key, text][], onChange(key|null), clearable, disabled })`; each option button's aria-label is `` `${label}: ${text}` ``
  - `SaveState({ entry, onRetry })`
  - `useSaveTracker(): { entries: { [key]: { state: 'saving'|'saved'|'slow'|'error', message } }, run(key, fn: () => Promise), retry(key), unsaved: number }`; `SLOW_SAVE_MS = 8000`, `SLOW_SAVE_COPY`
  - the device store of unsaved entries (Review Focus 2): `PENDING_KEY = 'ryp.assessments.pending'`, `pendingKey({ kind, athleteId, windowId, section })`, `keepPending({ kind: 'section'|'fields'|'profile', athleteId, windowId?, section?, value }): Kept` (adds `key` and `stamp`; a section replaces, a fields or profile patch merges), `dropPending(kept)` (only when it is still the latest kept for its key), `pendingFor(pairs: [athleteId, windowId][]): Kept[]`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/components/assessments/TrialInput.test.js`:

```js
import React, { act, useState } from 'react';
import { renderScreen } from '../../screens/testRender';
import TrialInput, { TextEntry } from './TrialInput';
import Choice from './Choice';
import SaveState from './SaveState';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const blur = (r, label) => act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
const type = async (r, label, text) => { await r.fill(label, text); await blur(r, label); };

describe('a typed trial (Review Focus 3)', () => {
  test('"32,5" is 32.5 and is committed on blur', async () => {
    const commits = [];
    const r = await renderScreen(<TrialInput label="Grip right 1" value={null} rangeKey="grip" onCommit={(v) => commits.push(v)} />);
    await type(r, 'Grip right 1', '32,5');
    expect(commits).toEqual([32.5]);
    expect(r.container.querySelector('[role="alert"]')).toBeNull();
    await r.unmount();
  });
  test('a unit, a sign or an out-of-range typo is refused inline and never sent', async () => {
    const commits = [];
    const r = await renderScreen(<TrialInput label="Grip right 1" value={null} rangeKey="grip" onCommit={(v) => commits.push(v)} />);
    await type(r, 'Grip right 1', '32.5kg');
    expect(r.text()).toContain('Numbers only, like 32.5');
    expect(field(r, 'Grip right 1').getAttribute('aria-invalid')).toBe('true');
    await type(r, 'Grip right 1', '-3');
    expect(r.text()).toContain('Numbers only, like 32.5');
    await type(r, 'Grip right 1', '150');
    expect(r.text()).toContain('Grip is 0-100 kg');
    expect(commits).toEqual([]);
    await type(r, 'Grip right 1', '15.0');
    expect(commits).toEqual([15]);
    expect(r.text()).not.toContain('Grip is 0-100 kg');
    await r.unmount();
  });
  test('clearing a stored trial commits null; the same value commits nothing; Enter commits', async () => {
    const commits = [];
    const r = await renderScreen(<TrialInput label="Mass 1" value={41.2} rangeKey="mass" onCommit={(v) => commits.push(v)} />);
    expect(field(r, 'Mass 1').value).toBe('41.2');
    await type(r, 'Mass 1', '41.2');
    expect(commits).toEqual([]);
    await type(r, 'Mass 1', '');
    expect(commits).toEqual([null]);
    await r.fill('Mass 1', '40.9');
    await act(async () => {
      field(r, 'Mass 1').focus();
      field(r, 'Mass 1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(commits).toEqual([null, 40.9]);
    await r.unmount();
  });
  test('a stored value that changes while the field is not being edited is shown', async () => {
    function Host() {
      const [v, setV] = useState(41.2);
      return (
        <>
          <TrialInput label="Mass 1" value={v} rangeKey="mass" onCommit={() => {}} />
          <button type="button" onClick={() => setV(39.8)}>Reload</button>
        </>
      );
    }
    const r = await renderScreen(<Host />);
    await r.click('Reload');
    expect(field(r, 'Mass 1').value).toBe('39.8');
    await r.unmount();
  });
});

test('text entry: trimmed, capped and committed on blur; blank is null', async () => {
  const commits = [];
  const r = await renderScreen(<TextEntry label="Driver" value={null} max={10} onCommit={(v) => commits.push(v)} />);
  await type(r, 'Driver', '  TSR3 10.5 degrees ');
  expect(commits).toEqual(['TSR3 10.5']);
  await r.unmount();
});

test('choices: each answer is its own labelled button; a clearable choice clears on a second tap', async () => {
  const picks = [];
  const r = await renderScreen(<Choice label="Ava readiness" value="pass" options={[['pass', 'Pass'], ['not-tested', 'Not tested']]} clearable onChange={(k) => picks.push(k)} />);
  expect(r.button('Ava readiness: Pass').getAttribute('aria-pressed')).toBe('true');
  await r.click('Ava readiness: Not tested');
  await r.click('Ava readiness: Pass');
  expect(picks).toEqual(['not-tested', null]);
  await r.unmount();
});

test('save state: saving, saved, the slow copy, and an error with a retry', async () => {
  let retried = 0;
  const show = async (entry) => {
    const r = await renderScreen(<SaveState entry={entry} onRetry={() => { retried += 1; }} />);
    const text = r.text();
    if (entry?.state === 'error') await r.click('Try again');
    await r.unmount();
    return text;
  };
  expect(await show(null)).toBe('');
  expect(await show({ state: 'saving' })).toBe('Saving…');
  expect(await show({ state: 'saved' })).toBe('Saved');
  expect(await show({ state: 'slow', message: 'Not saved yet.' })).toBe('Not saved yet.');
  expect(await show({ state: 'error', message: "Didn't save." })).toContain("Didn't save.");
  expect(retried).toBe(1);
});
```

Create `frontend/src/portal/hooks/assessmentSaves.test.js`:

```js
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useSaveTracker, { PENDING_KEY, SLOW_SAVE_COPY, SLOW_SAVE_MS, dropPending, keepPending, pendingFor } from './assessmentSaves';

async function mountTracker() {
  const result = { current: null };
  function Probe() {
    result.current = useSaveTracker();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  return { result, unmount: () => act(async () => root.unmount()) };
}
const flush = () => act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });

beforeEach(() => {
  jest.useFakeTimers();
  try { window.localStorage.clear(); } catch (err) { /* jsdom always has it */ }
});
afterEach(() => { jest.useRealTimers(); });

describe('the save tracker (Review Focus 2: the tablet loses wifi)', () => {
  test('a save not acknowledged in 8 s reads "Not saved yet" and still counts as unsaved', async () => {
    const h = await mountTracker();
    await act(async () => { h.result.current.run('a1:grip', () => new Promise(() => {})); });
    expect(h.result.current.entries['a1:grip']).toEqual({ state: 'saving', message: null });
    expect(h.result.current.unsaved).toBe(1);
    await act(async () => { jest.advanceTimersByTime(SLOW_SAVE_MS - 1); });
    expect(h.result.current.entries['a1:grip'].state).toBe('saving');
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(h.result.current.entries['a1:grip']).toEqual({ state: 'slow', message: SLOW_SAVE_COPY });
    expect(h.result.current.unsaved).toBe(1);
    await h.unmount();
  });

  test('saved clears it; a failure is an error with a retry; the latest save of an entry decides its state', async () => {
    const h = await mountTracker();
    let attempts = 0;
    const flaky = async () => { attempts += 1; if (attempts === 1) throw new Error('offline'); };
    await act(async () => { h.result.current.run('a1:cmj', flaky); });
    await flush();
    expect(h.result.current.entries['a1:cmj']).toEqual({ state: 'error', message: "Didn't save." });
    await act(async () => { h.result.current.retry('a1:cmj'); });
    await flush();
    expect(h.result.current.entries['a1:cmj'].state).toBe('saved');
    expect(attempts).toBe(2);
    let finishFirst;
    await act(async () => { h.result.current.run('a2:grip', () => new Promise((resolve) => { finishFirst = resolve; })); });
    await act(async () => { h.result.current.run('a2:grip', async () => {}); });
    await flush();
    expect(h.result.current.entries['a2:grip'].state).toBe('saved');
    await act(async () => { finishFirst(); });
    await flush();
    expect(h.result.current.entries['a2:grip'].state).toBe('saved');
    expect(h.result.current.unsaved).toBe(0);
    await h.unmount();
  });

  test('closing the tab with an unsaved entry asks first; with everything saved it does not', async () => {
    const h = await mountTracker();
    let finish;
    await act(async () => { h.result.current.run('a1:mcgill', () => new Promise((resolve) => { finish = resolve; })); });
    const ask = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(ask()).toBe(true);
    await act(async () => { finish(); });
    await flush();
    expect(ask()).toBe(false);
    await h.unmount();
  });
});

describe("the device store (Review Focus 2: a reload, or iPad Safari evicting the page, drops the SDK's queued writes)", () => {
  const grip = (right) => ({ kind: 'section', athleteId: 'a1', windowId: '2026-27-baseline', section: 'grip', value: { right } });
  test('an unsaved section is kept until the server has it; only the latest save of it drops it', () => {
    const first = keepPending(grip([30]));
    const second = keepPending(grip([30, 31]));
    expect(first.key).toBe('a1:2026-27-baseline:grip');
    expect(pendingFor([['a1', '2026-27-baseline']]).map((k) => k.value)).toEqual([{ right: [30, 31] }]);
    dropPending(first);
    expect(pendingFor([['a1', '2026-27-baseline']])).toHaveLength(1);
    dropPending(second);
    expect(pendingFor([['a1', '2026-27-baseline']])).toEqual([]);
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });
  test('profile and field patches merge, so an earlier patch still waiting is not lost; other windows stay out', () => {
    keepPending({ kind: 'profile', athleteId: 'a1', value: { sex: 'female' } });
    keepPending({ kind: 'profile', athleteId: 'a1', value: { dominantHand: 'right' } });
    keepPending({ kind: 'fields', athleteId: 'a1', windowId: '2026-27-baseline', value: { mcgillDate: '2026-11-05' } });
    keepPending({ kind: 'section', athleteId: 'a2', windowId: '2026-27-mid', section: 'cmj', value: { trials: [] } });
    expect(pendingFor([['a1', '2026-27-baseline']]).map((k) => [k.key, k.value])).toEqual([
      ['a1:profile', { sex: 'female', dominantHand: 'right' }],
      ['a1:2026-27-baseline:fields', { mcgillDate: '2026-11-05' }],
    ]);
  });
  test('storage that is unreadable keeps nothing and never throws', () => {
    window.localStorage.setItem(PENDING_KEY, 'not json');
    expect(pendingFor([['a1', '2026-27-baseline']])).toEqual([]);
    expect(() => keepPending(grip([30]))).not.toThrow();
  });
});
```

Create `frontend/src/portal/components/AssessmentFrame.test.js`:

```js
import React, { act } from 'react';
import { renderScreen } from '../screens/testRender';
import AssessmentFrame, { layoutFor, useLayoutClass } from './AssessmentFrame';

test('layout classes (spec 5): phone below 700 px, tablet 700-1100 px, desktop above 1100 px', () => {
  expect(layoutFor(390)).toBe('phone');
  expect(layoutFor(699)).toBe('phone');
  expect(layoutFor(700)).toBe('tablet');
  expect(layoutFor(1100)).toBe('tablet');
  expect(layoutFor(1101)).toBe('desktop');
  expect(layoutFor(undefined)).toBe('phone');
});

test('the frame drops the 430 px column above phone width', async () => {
  for (const [layout, width] of [['phone', '430px'], ['tablet', '1100px'], ['desktop', '1440px']]) {
    const r = await renderScreen(<AssessmentFrame bare layout={layout}>content</AssessmentFrame>);
    expect(r.container.querySelector('div').style.maxWidth).toBe(width);
    await r.unmount();
  }
});

test('the layout follows the window', async () => {
  const seen = [];
  function Probe() {
    seen.push(useLayoutClass());
    return null;
  }
  window.innerWidth = 390;
  const r = await renderScreen(<Probe />);
  await act(async () => { window.innerWidth = 1280; window.dispatchEvent(new Event('resize')); });
  expect(seen[0]).toBe('phone');
  expect(seen[seen.length - 1]).toBe('desktop');
  await r.unmount();
  window.innerWidth = 1024;
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/assessments/TrialInput.test.js src/portal/hooks/assessmentSaves.test.js src/portal/components/AssessmentFrame.test.js`
Expected: FAIL - "Cannot find module './TrialInput'", "Cannot find module './assessmentSaves'", "Cannot find module './AssessmentFrame'".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/components/AssessmentFrame.js`:

```js
import React, { useEffect, useState } from 'react';
import PhoneFrame from './PhoneFrame';

/**
 * The assessment screens' layout (spec 5: "a shared layout replaces the
 * 430 px column for these screens"): phone (< 700 px) one athlete at a time,
 * tablet (700-1100 px) two columns, desktop (> 1100 px) the full grid of the
 * four athletes and a results table. Every other portal screen keeps
 * PhoneFrame's phone column.
 */
export const PHONE_BELOW = 700;
export const TABLET_UP_TO = 1100;
export const FRAME_MAX_WIDTH = { phone: 430, tablet: 1100, desktop: 1440 };

export function layoutFor(width) {
  if (typeof width !== 'number' || !Number.isFinite(width) || width < PHONE_BELOW) return 'phone';
  return width <= TABLET_UP_TO ? 'tablet' : 'desktop';
}

const widthNow = () => (typeof window === 'undefined' ? 0 : window.innerWidth);

/** The window's layout class, following resizes and rotations. */
export function useLayoutClass() {
  const [layout, setLayout] = useState(() => layoutFor(widthNow()));
  useEffect(() => {
    const onResize = () => setLayout(layoutFor(widthNow()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return layout;
}

/** PhoneFrame's chrome (pinned header and footer, one scroller) at the width the layout class allows. */
export default function AssessmentFrame({ bare = false, layout = 'phone', header, footer, children }) {
  return (
    <PhoneFrame bare={bare} header={header} footer={footer} style={bare ? { maxWidth: FRAME_MAX_WIDTH[layout] ?? FRAME_MAX_WIDTH.phone } : undefined}>
      {children}
    </PhoneFrame>
  );
}
```

Create `frontend/src/portal/components/assessments/TrialInput.js`:

```js
import React, { useEffect, useRef, useState } from 'react';
import { color, font, radius } from '../../tokens';
import { parseText, parseTrial, rangeLabel } from '../../data/assessmentInput';

const inputStyle = (invalid, width) => ({
  width,
  height: 44,
  boxSizing: 'border-box',
  background: color.track,
  border: `1px solid ${invalid ? color.error : color.border}`,
  borderRadius: radius.input,
  font: `600 16px ${font.body}`, // 16px: no iOS zoom on focus
  color: color.text,
  padding: '0 10px',
  outline: 'none',
});

/**
 * One typed trial (spec 5: "Every entry saves as typed"). The text stays as
 * the coach typed it; on blur or Enter it is parsed - a comma decimal is a
 * decimal point, a unit or any other character is refused - and checked
 * against the range firestore.rules enforces. A refusal shows under the field
 * and is NEVER sent, so a typo cannot fail the section's save and drop the
 * trials typed beside it. A valid value reaches `onCommit` only when it
 * differs from the stored one.
 */
export default function TrialInput({ label, value, rangeKey, onCommit, disabled = false, width = 84 }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [error, setError] = useState(null);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setText(value == null ? '' : String(value));
  }, [value]);

  const commit = () => {
    editing.current = false;
    const parsed = parseTrial(text, rangeKey);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    if (parsed.value !== (value ?? null)) onCommit(parsed.value);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width }}>
      <input
        aria-label={label}
        aria-invalid={error ? 'true' : undefined}
        inputMode="decimal"
        placeholder={rangeLabel(rangeKey)}
        value={text}
        disabled={disabled}
        onFocus={() => { editing.current = true; }}
        onChange={(e) => { editing.current = true; setText(e.target.value); }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ ...inputStyle(Boolean(error), '100%'), textAlign: 'right' }}
      />
      {error ? <span role="alert" style={{ font: `400 11px/1.3 ${font.body}`, color: color.error }}>{error}</span> : null}
    </div>
  );
}

/** Typed text (device id, driver, golf volume): trimmed, capped at `max`, committed on blur; blank is null. */
export function TextEntry({ label, value, max = 40, onCommit, disabled = false }) {
  const [text, setText] = useState(value ?? '');
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(value ?? '');
  }, [value]);
  const commit = () => {
    editing.current = false;
    const next = parseText(text, max);
    if (next !== (value ?? null)) onCommit(next);
  };
  return (
    <input
      aria-label={label}
      value={text}
      maxLength={max}
      disabled={disabled}
      onFocus={() => { editing.current = true; }}
      onChange={(e) => { editing.current = true; setText(e.target.value); }}
      onBlur={commit}
      style={inputStyle(false, '100%')}
    />
  );
}
```

Create `frontend/src/portal/components/assessments/Choice.js`:

```js
import React from 'react';
import { color, font, radius } from '../../tokens';

/**
 * Mutually exclusive answers (Pass / Not tested, Right / Left, Speed /
 * Distance). Every option is a real button whose aria-label carries the
 * question - "Ava readiness: Pass" - so a station with four athletes on
 * screen has one unambiguous control per answer. `clearable`: tapping the
 * chosen answer again clears it.
 */
export default function Choice({ label, value, options, onChange, clearable = false, disabled = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ font: `500 11px ${font.body}`, color: color.textSecondary }}>{label}</div>
      <div role="group" aria-label={label} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(([key, text]) => {
          const on = key === value;
          return (
            <button
              key={String(key)}
              type="button"
              aria-pressed={on}
              aria-label={`${label}: ${text}`}
              disabled={disabled}
              onClick={() => onChange(on && clearable ? null : key)}
              style={{
                minHeight: 40,
                padding: '0 14px',
                borderRadius: radius.pill,
                border: `1px solid ${on ? color.primary : color.controlBorder}`,
                background: on ? color.primary : 'transparent',
                color: on ? '#000' : color.textSecondary,
                font: `${on ? 600 : 500} 13px ${font.body}`,
                cursor: disabled ? 'default' : 'pointer',
              }}
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

Create `frontend/src/portal/components/assessments/SaveState.js`:

```js
import React from 'react';
import { color, font } from '../../tokens';

/** One entry's save state, as hooks/assessmentSaves.js tracks it. Nothing until the first save. */
export default function SaveState({ entry, onRetry }) {
  if (!entry) return null;
  const text = { font: `500 11px/1.4 ${font.body}` };
  if (entry.state === 'saving') return <span style={{ ...text, color: color.textTertiary }}>Saving…</span>;
  if (entry.state === 'saved') return <span style={{ ...text, color: color.primary }}>Saved</span>;
  if (entry.state === 'slow') return <span role="status" style={{ ...text, color: color.secondary }}>{entry.message}</span>;
  return (
    <span role="alert" style={{ ...text, color: color.error }}>
      {entry.message}{' '}
      <button type="button" onClick={onRetry} style={{ background: 'none', border: 'none', padding: 0, ...text, color: color.primary, cursor: 'pointer' }}>
        Try again
      </button>
    </span>
  );
}
```

Create `frontend/src/portal/hooks/assessmentSaves.js`:

```js
/**
 * The wave's save tracker (spec 5: "Every entry saves as typed"; Review
 * Focus 2). A Firestore write made offline neither lands nor fails - it waits
 * in the SDK and is lost if the tab closes - so a coach on gym wifi must see
 * which entries have not reached the server:
 *   saving -> saved, or error (with retry), or - not acknowledged in 8 s -
 *   slow: "Not saved yet. Keep this screen open: it saves when the
 *   connection is back."
 * `unsaved` counts every entry not saved; while it is above 0 closing or
 * reloading the tab asks first, and the wave screen's back link asks too.
 * The latest save of an entry decides its state.
 *
 * iPad Safari ignores the beforeunload prompt, and the Firestore SDK's
 * memory cache drops writes still queued when the page reloads or Safari
 * evicts it. So the wave also keeps every save on this device (localStorage,
 * PENDING_KEY) until the server has it, and re-applies and re-sends what is
 * still there when the wave opens again (screens/AssessmentWave.js).
 * Storage can be missing, full or unreadable: every access is guarded, and a
 * save never waits on it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const SLOW_SAVE_MS = 8000;
export const SLOW_SAVE_COPY = 'Not saved yet. Keep this screen open: it saves when the connection is back.';
const ERROR_COPY = "Didn't save.";

export default function useSaveTracker() {
  const [entries, setEntries] = useState({});
  const runs = useRef({});

  const run = useCallback((key, fn) => {
    const prev = runs.current[key];
    if (prev?.timer) clearTimeout(prev.timer);
    const n = (prev?.n ?? 0) + 1;
    const latest = () => runs.current[key]?.n === n;
    const timer = setTimeout(() => {
      if (latest()) setEntries((all) => (all[key]?.state === 'saving' ? { ...all, [key]: { state: 'slow', message: SLOW_SAVE_COPY } } : all));
    }, SLOW_SAVE_MS);
    runs.current[key] = { n, fn, timer };
    setEntries((all) => ({ ...all, [key]: { state: 'saving', message: null } }));
    return Promise.resolve()
      .then(fn)
      .then(
        () => {
          if (!latest()) return;
          clearTimeout(timer);
          setEntries((all) => ({ ...all, [key]: { state: 'saved', message: null } }));
        },
        () => {
          if (!latest()) return;
          clearTimeout(timer);
          setEntries((all) => ({ ...all, [key]: { state: 'error', message: ERROR_COPY } }));
        }
      );
  }, []);

  const retry = useCallback((key) => {
    const r = runs.current[key];
    if (r) run(key, r.fn);
  }, [run]);

  useEffect(() => () => Object.values(runs.current).forEach((r) => clearTimeout(r.timer)), []);

  const unsaved = Object.values(entries).filter((e) => e.state !== 'saved').length;

  useEffect(() => {
    if (!unsaved) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  return { entries, run, retry, unsaved };
}

/** Unsaved entries kept on this device: { [key]: { key, kind, athleteId, windowId, section, value, stamp } }. */
export const PENDING_KEY = 'ryp.assessments.pending';
let stamps = 0;

function readPending() {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    const all = raw ? JSON.parse(raw) : {};
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch (err) {
    return {};
  }
}

function writePending(all) {
  try {
    if (Object.keys(all).length) window.localStorage.setItem(PENDING_KEY, JSON.stringify(all));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch (err) {
    /* private mode or full: the in-page tracker still holds the entry */
  }
}

/** One entry's storage key: a window's section, a window's own fields, or the athlete's profile. */
export function pendingKey({ kind, athleteId, windowId, section }) {
  if (kind === 'profile') return `${athleteId}:profile`;
  return `${athleteId}:${windowId}:${kind === 'fields' ? 'fields' : section}`;
}

/**
 * Keep one save until the server has it, and return it as kept. A section is
 * written whole, so it replaces what was kept; a fields or profile patch
 * merges into what is kept, so an earlier patch still waiting is not lost.
 */
export function keepPending(entry) {
  const all = readPending();
  const key = pendingKey(entry);
  const prev = all[key];
  stamps += 1;
  const value = entry.kind !== 'section' && prev ? { ...prev.value, ...entry.value } : entry.value;
  const kept = { ...entry, key, value, stamp: `${Date.now()}-${stamps}` };
  all[key] = kept;
  writePending(all);
  return kept;
}

/** The server has this save: drop it, unless a later save of the same entry is kept. */
export function dropPending(kept) {
  const all = readPending();
  if (all[kept.key] && all[kept.key].stamp === kept.stamp) {
    delete all[kept.key];
    writePending(all);
  }
}

/** What is still kept for these athletes' windows, given as [athleteId, windowId] pairs. */
export function pendingFor(pairs) {
  return Object.values(readPending()).filter((e) => e && pairs.some(([athleteId, windowId]) => e.athleteId === athleteId && (e.kind === 'profile' || e.windowId === windowId)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/assessments/TrialInput.test.js src/portal/hooks/assessmentSaves.test.js src/portal/components/AssessmentFrame.test.js`
Expected: PASS (three suites).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/components/AssessmentFrame.js frontend/src/portal/components/AssessmentFrame.test.js frontend/src/portal/components/assessments frontend/src/portal/hooks/assessmentSaves.js frontend/src/portal/hooks/assessmentSaves.test.js
git commit -m "feat(assessments): responsive frame, trial inputs and save tracking

Phone, tablet and desktop layout classes; typed trials parsed and range
checked before they are sent; every save tracked, slow saves called out,
leaving with unsaved entries asks first, and unsaved entries are kept on
the device until the server has them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The assessments list, starting a wave, and the way in

**Files:**
- Create: `frontend/src/portal/screens/AssessmentList.js`
- Create: `frontend/src/portal/components/assessments/StartWaveSheet.js`
- Create: `frontend/src/portal/components/AssessmentsEntryCard.js`
- Create: `frontend/src/portal/AssessmentRoutes.js`
- Modify: `frontend/src/portal/PortalRoutes.js` (imports ~17; `CURRENT_ROUTE_CHUNKS` ~87-107; `NEXT_ROUTE_CHUNKS['my-sessions']` ~112; `AdminRoute` ~396-418; a new `<Route>` before the Staff block ~904)
- Modify: `frontend/src/portal/screens/AdminDashboard.js` (props ~80-90; after `<SignupsCard>` ~155)
- Test: `frontend/src/portal/screens/AssessmentList.test.js`, `frontend/src/portal/AssessmentRoutes.test.js`, `frontend/src/portal/screens/AdminDashboard.test.js` (append)

**Interfaces:**
- Consumes: `useAssessmentRoster`, `useAssessmentSettings` (Task 6); `startWave` (Task 5); `assessmentAccess`, `SEED_VIEWER` (Task 3); `CONSENT_LABEL`, `KIND_LABEL`, `circuitDateProblem`, `newWaveId`, `shortDate`, `waveBlock` (Task 2); `academyDateISO` (`data/calendar.js`); `AssessmentFrame`, `useLayoutClass`, `Choice` (Task 11); `BottomTabBar` `assessments` prop (Task 10).
- Produces:
  - `AssessmentList({ bare, viewer, onOpenWave(waveId), onOpenAthlete(athleteId, name), onOpenSettings(), onBack? })`
  - `StartWaveSheet({ rows, settings, today, onClose, onStarted({ waveId, started, skipped }) })`; `SKIP_REASON` (the copy for `startWave`'s `complete` and `stale` skips: an athlete the wave could not take is named before the wave opens)
  - `AssessmentsEntryCard({ onOpen, title?, body?, label? })`
  - `AssessmentRoutes.js`: `RequireAssessment({ level: 'staff'|'reader', landingFor, children })`, `useViewer(): { viewer, loading }`, `AssessmentListRoute()`, `loadAssessmentList`
  - Route `/portal/assessments` (staff only); `AdminDashboard` prop `onOpenAssessments`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/screens/AssessmentList.test.js`:

```js
import React from 'react';
import { renderScreen } from './testRender';
import AssessmentList from './AssessmentList';

let mockRows;
let mockStarts;
let mockStartFails;
let mockSkipped;
jest.mock('../hooks/assessments', () => ({
  useAssessmentRoster: () => ({ data: { rows: mockRows }, loading: false, error: null }),
  useAssessmentSettings: () => ({ data: { settings: jest.requireActual('../data/assessmentSettings').withDefaults(null), stored: false }, loading: false, error: null }),
}));
jest.mock('../hooks/assessmentsLive', () => ({
  startWave: async (args) => {
    mockStarts.push(args);
    if (mockStartFails) throw new Error('unavailable');
    const skipped = mockSkipped.filter((s) => args.entries.some((e) => e.athleteId === s.athleteId));
    return { waveId: args.waveId, started: args.entries.map((e) => e.athleteId).filter((id) => !skipped.some((s) => s.athleteId === id)), skipped };
  },
}));

const due = (label, kind, extra = {}) => ({ label, kind, kinds: kind ? [kind] : [], inProgress: false, eligibleOn: null, lastTestDate: null, windowId: null, ...extra });
const PHIL = { uid: 'phil', role: 'coach', specialistId: 'phil' };

beforeEach(() => {
  mockStarts = [];
  mockStartFails = false;
  mockSkipped = [];
  mockRows = [
    { athleteId: 'a', name: 'Ava Moreno', consent: 'yes', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'b', name: 'Ben Ortiz', consent: 'no', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'c', name: 'Cal Duarte', consent: 'unanswered', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'd', name: 'Dev Patel', consent: 'yes', due: due('Mid-season eligible', 'mid', { kinds: ['mid', 'end'], lastTestDate: '2026-11-03' }), windows: [] },
    { athleteId: 'e', name: 'Eli Brooks', consent: 'yes', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'f', name: 'Fay Kim', consent: 'yes', due: due('Baseline due', 'baseline'), windows: [] },
    { athleteId: 'g', name: 'Gus Lee', consent: 'yes', due: due('Mid-season from Dec 29', null, { lastTestDate: '2026-11-03' }), windows: [] },
  ];
});
afterEach(() => {
  jest.useRealTimers();
  window.innerWidth = 1024;
});

const list = (props = {}) => renderScreen(<AssessmentList bare viewer={PHIL} onOpenWave={() => {}} onOpenAthlete={() => {}} onOpenSettings={() => {}} {...props} />);
const checked = (r, name) => r.button(`Select ${name}`).getAttribute('aria-checked');

test('every athlete with research consent, what is due and the last test (spec 5)', async () => {
  const r = await list();
  for (const text of ['Ava Moreno', 'Research: yes', 'Research: no', 'Research: not answered', 'Baseline due', 'Mid-season eligible', 'Last test Nov 3', 'Never tested', 'Mid-season from Dec 29']) {
    expect(r.text()).toContain(text);
  }
  expect(r.text()).toContain('Protocol v1.2');
  await r.unmount();
});

test('not answered cannot be added; a "no" can; up to four; not due cannot', async () => {
  const r = await list();
  expect(r.button('Select Cal Duarte').disabled).toBe(true);
  expect(r.text()).toContain("Waiting on the family's research answer");
  expect(r.button('Select Gus Lee').disabled).toBe(true);
  for (const name of ['Ben Ortiz', 'Ava Moreno', 'Dev Patel', 'Eli Brooks']) await r.click(`Select ${name}`);
  expect(checked(r, 'Ben Ortiz')).toBe('true');
  expect(r.button('Select Fay Kim').disabled).toBe(true);
  expect(r.text()).toContain('Start wave · 4 of 4');
  await r.click('Select Ben Ortiz');
  expect(r.button('Select Fay Kim').disabled).toBe(false);
  await r.unmount();
});

test('an evening wave is dated by the academy (Chicago), not UTC (Review Focus 1)', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-04T00:30:00Z')); // Nov 3, 6:30 PM in Chicago
  const opened = [];
  const r = await list({ onOpenWave: (id) => opened.push(id) });
  await r.click('Select Ava Moreno');
  await r.click('Select Dev Patel');
  await r.click('Start wave · 2 of 4');
  expect(r.container.querySelector('[aria-label="Circuit date"]').value).toBe('2026-11-03');
  await r.click('Dev Patel window: End of season');
  await r.click('Start wave');
  expect(mockStarts).toHaveLength(1);
  expect(mockStarts[0]).toMatchObject({
    circuitDate: '2026-11-03',
    entries: [{ athleteId: 'a', kind: 'baseline', position: 1 }, { athleteId: 'd', kind: 'end', position: 2 }],
  });
  expect(mockStarts[0].waveId).toMatch(/^wave-2026-11-03-/);
  expect(opened).toEqual([mockStarts[0].waveId]);
  await r.unmount();
});

test('a circuit date outside the last 14 days, or a failed start, keeps the sheet open and says why', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-10T18:00:00Z'));
  const r = await list();
  await r.click('Select Ava Moreno');
  await r.click('Start wave · 1 of 4');
  await r.fill('Circuit date', '2026-10-20');
  expect(r.text()).toContain('Pick a date in the last 14 days.');
  expect(r.button('Start wave').disabled).toBe(true);
  await r.fill('Circuit date', '2026-11-09');
  mockStartFails = true;
  await r.click('Start wave');
  expect(r.text()).toContain('The wave did not start. Check the connection and try again.');
  expect(r.button('Start wave')).not.toBeNull();
  await r.unmount();
});

test('athletes the wave could not take are named before it opens; a wave of nobody opens nothing', async () => {
  mockSkipped = [{ athleteId: 'd', reason: 'complete' }, { athleteId: 'e', reason: 'stale' }];
  const opened = [];
  const r = await list({ onOpenWave: (id) => opened.push(id) });
  for (const name of ['Ava Moreno', 'Dev Patel', 'Eli Brooks']) await r.click(`Select ${name}`);
  await r.click('Start wave · 3 of 4');
  await r.click('Start wave');
  expect(r.text()).toContain('Not in this wave: Dev Patel (that window is already complete), Eli Brooks (that window has been open more than 14 days: mark it complete first).');
  expect(opened).toEqual([]);
  await r.click('Open the wave');
  expect(opened).toEqual([mockStarts[0].waveId]);
  await r.unmount();

  mockSkipped = [{ athleteId: 'a', reason: 'complete' }];
  const none = await list({ onOpenWave: (id) => opened.push(id) });
  await none.click('Select Ava Moreno');
  await none.click('Start wave · 1 of 4');
  await none.click('Start wave');
  expect(none.text()).toContain('No wave started');
  expect(none.button('Open the wave')).toBeNull();
  await none.click('Close');
  expect(opened).toHaveLength(1);
  expect(none.text()).not.toContain('No wave started');
  await none.unmount();
});

test('a window in progress says since when; one open past 14 days says to complete it and cannot join a wave', async () => {
  const open = [{ id: '2026-27-baseline', circuitDate: '2026-11-03', status: 'open' }];
  mockRows = [
    { athleteId: 'a', name: 'Ava Moreno', consent: 'yes', due: due('Baseline in progress', 'baseline', { inProgress: true, windowId: '2026-27-baseline' }), windows: open },
    { athleteId: 'b', name: 'Ben Ortiz', consent: 'yes', due: due('Open since Nov 3: mark it complete', null, { inProgress: true, stale: true, windowId: '2026-27-baseline' }), windows: open },
  ];
  const r = await list();
  expect(r.text()).toContain('Baseline in progress · since Nov 3');
  expect(r.text()).toContain('Open since Nov 3: mark it complete');
  expect(r.button('Select Ava Moreno').disabled).toBe(false);
  expect(r.button('Select Ben Ortiz').disabled).toBe(true);
  await r.unmount();
});

test('tablet and desktop get a table; a phone a single column', async () => {
  window.innerWidth = 1280;
  const wide = await list();
  expect(wide.text()).toContain('Research');
  expect(wide.text()).toContain('Last test');
  expect(wide.container.querySelector('[role="columnheader"]')).not.toBeNull();
  await wide.unmount();
  window.innerWidth = 390;
  const phone = await list();
  expect(phone.container.querySelector('[role="columnheader"]')).toBeNull();
  await phone.unmount();
});

test('owners come from Admin and go back there; Phil gets the Assessments tab', async () => {
  const back = [];
  const owner = await list({ viewer: { uid: 'o1', role: 'owner' }, onBack: () => back.push(1) });
  await owner.click('‹ Admin');
  expect(back).toEqual([1]);
  expect(owner.button('Assessments')).toBeNull();
  await owner.unmount();
  const phil = await list();
  expect(phil.button('Assessments').getAttribute('aria-current')).toBe('page');
  await phil.unmount();
});
```

Create `frontend/src/portal/AssessmentRoutes.test.js`:

```js
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

const mockLive = { value: true };
const mockUser = { value: null };
jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));
jest.mock('./screens/CoachDashboard', () => ({ __esModule: true, default: () => 'COACH HOME' }));
jest.mock('./screens/SpecialistDay', () => ({ __esModule: true, default: () => 'MY SESSIONS' }));
jest.mock('./screens/ParentDashboard', () => ({ __esModule: true, default: () => 'FAMILY HOME' }));
jest.mock('./screens/AthleteDashboard', () => ({ __esModule: true, default: () => 'ATHLETE HOME' }));
jest.mock('./screens/AdminDashboard', () => {
  const { createElement } = require('react');
  return { __esModule: true, default: ({ onOpenAssessments }) => createElement('button', { type: 'button', onClick: onOpenAssessments }, 'ADMIN') };
});
jest.mock('./screens/AssessmentList', () => {
  const { createElement } = require('react');
  return { __esModule: true, default: ({ viewer, onBack }) => createElement('button', { type: 'button', onClick: onBack }, `LIST as ${viewer.role}${onBack ? ' with back' : ''}`) };
});
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
jest.mock('./hooks/useAuthSession', () => ({
  ...jest.requireActual('./hooks/useAuthSession'),
  __esModule: true,
  default: () => ({ user: mockUser.value, provisioned: Boolean(mockUser.value), loading: false, signOut: async () => {}, refresh: () => {} }),
}));

function Spy({ onLoc }) { onLoc(useLocation()); return null; }
async function mount(path) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const loc = { current: null };
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Spy onLoc={(l) => { loc.current = l; }} />
        <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
      </MemoryRouter>
    );
  });
  for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); });
  return {
    text: () => container.textContent,
    pathname: () => loc.current.pathname,
    click: async () => { await act(async () => { container.querySelector('button').click(); }); for (let i = 0; i < 5; i += 1) await act(async () => { await Promise.resolve(); }); },
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

afterEach(() => { mockUser.value = null; mockLive.value = true; });

test('Phil, an assessor coach, ops and the owner reach the list', async () => {
  for (const user of [{ uid: 'p', role: 'coach', specialistId: 'phil' }, { uid: 'a', role: 'coach', assessor: true }, { uid: 'o', role: 'ops' }, { uid: 'w', role: 'owner' }]) {
    mockUser.value = user;
    const r = await mount('/portal/assessments');
    expect(r.pathname()).toBe('/portal/assessments');
    expect(r.text()).toContain(`LIST as ${user.role}`);
    await r.unmount();
  }
});

test('a coach without the permission, Yannick and families go to their own home', async () => {
  for (const [user, home] of [[{ uid: 'c', role: 'coach' }, '/portal/coach'], [{ uid: 'y', role: 'mental', specialistId: 'mental' }, '/portal/my-sessions'], [{ uid: 'p', role: 'parent', householdId: 'h' }, '/portal/family'], [{ uid: 'k', role: 'athlete', athleteId: 'a' }, '/portal/home']]) {
    mockUser.value = user;
    const r = await mount('/portal/assessments');
    expect(r.pathname()).toBe(home);
    await r.unmount();
  }
});

test("the owner's Admin card opens the list, and its back link returns to Admin", async () => {
  mockUser.value = { uid: 'w', role: 'owner' };
  const r = await mount('/portal/admin');
  await r.click();
  expect(r.pathname()).toBe('/portal/assessments');
  expect(r.text()).toBe('LIST as owner with back');
  await r.click();
  expect(r.pathname()).toBe('/portal/admin');
  await r.unmount();
});
```

Append to `frontend/src/portal/screens/AdminDashboard.test.js`:

```js
test('the Assessments card opens the assessments screen; it is hidden without a destination', async () => {
  const opened = [];
  const r = await renderScreen(<AdminDashboard bare role="owner" onOpenAssessments={() => opened.push(1)} />);
  await r.click('Open assessments');
  expect(opened).toEqual([1]);
  await r.unmount();
  const none = await renderScreen(<AdminDashboard bare role="owner" />);
  expect(none.button('Open assessments')).toBeNull();
  await none.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AssessmentList.test.js src/portal/AssessmentRoutes.test.js src/portal/screens/AdminDashboard.test.js`
Expected: FAIL - "Cannot find module './AssessmentList'", the routes test lands on the index (no `/portal/assessments` route), and no "Open assessments" button.

- [ ] **Step 3: The start-wave sheet and the entry card**

Create `frontend/src/portal/components/assessments/StartWaveSheet.js`:

```js
import React, { useState } from 'react';
import { color, font, radius, tint } from '../../tokens';
import Button from '../Button';
import Choice from './Choice';
import { Body, ScreenTitle } from '../Primitives';
import { startWave } from '../../hooks/assessmentsLive';
import { KIND_LABEL, circuitDateProblem, newWaveId } from '../../data/assessmentWindows';

export const LETTERS = ['A', 'B', 'C', 'D'];

/** Why startWave left an athlete out (hooks/assessmentsLive.js). */
export const SKIP_REASON = {
  complete: 'that window is already complete',
  stale: 'that window has been open more than 14 days: mark it complete first',
};

/**
 * Start a wave (spec 5): the circuit date - the academy's date today by
 * default, never a UTC date (Review Focus 1), editable within the last 14
 * days - and, for an athlete who may take either, which window this is
 * (mid-season, or end of season for a late joiner; the default is first).
 * The rotation order is the order the athletes were picked: A, B, C, D. The
 * CancelSheet idiom: it restates what is about to happen and never closes on
 * failure. An athlete the wave could not take (a window already complete,
 * or one left open past the 14-day entry window, perhaps by a second
 * tablet) is named before the wave opens, never dropped silently.
 */
export default function StartWaveSheet({ rows, settings, today, onClose, onStarted }) {
  const [date, setDate] = useState(today);
  const [kinds, setKinds] = useState(() => Object.fromEntries(rows.map((r) => [r.athleteId, r.due.kind])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const problem = circuitDateProblem(date, today);
  const nameOf = (id) => rows.find((r) => r.athleteId === id)?.name ?? id;

  const start = async () => {
    if (problem || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await startWave({
        waveId: newWaveId(date),
        circuitDate: date,
        entries: rows.map((r, i) => ({ athleteId: r.athleteId, kind: kinds[r.athleteId], position: i + 1 })),
        settings,
        today,
      });
      if (result.skipped.length === 0) {
        onStarted(result);
        return;
      }
      setSaving(false);
      setDone(result);
    } catch (err) {
      setSaving(false);
      setError('The wave did not start. Check the connection and try again.');
    }
  };

  if (done) {
    return (
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 520, background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}
        >
          <ScreenTitle size={19}>{done.started.length ? 'Wave started' : 'No wave started'}</ScreenTitle>
          <Body size={12} style={{ marginTop: 8 }}>
            Not in this wave: {done.skipped.map((s) => `${nameOf(s.athleteId)} (${SKIP_REASON[s.reason] ?? s.reason})`).join(', ')}.
          </Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
            {done.started.length ? (
              <Button height={50} onClick={() => onStarted(done)}>Open the wave</Button>
            ) : (
              <Button variant="outline" height={50} style={{ boxShadow: 'none' }} onClick={() => onStarted(done)}>Close</Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={saving ? undefined : onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}
      >
        <ScreenTitle size={19}>Start a wave</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          {rows.length} athlete{rows.length === 1 ? '' : 's'}, in rotation order. Every station runs in the fixed order.
        </Body>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, font: `500 11px ${font.body}`, color: color.textSecondary }}>
          Circuit date
          <input
            type="date"
            aria-label="Circuit date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            style={{ height: 44, background: color.track, border: `1px solid ${problem ? color.error : color.border}`, borderRadius: radius.input, color: color.text, font: `500 16px ${font.body}`, padding: '0 10px' }}
          />
        </label>
        {problem ? <Body size={12} tone={color.error} style={{ marginTop: 6 }}>{problem}</Body> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
          {rows.map((r, i) => (
            <div key={r.athleteId}>
              <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{LETTERS[i]} · {r.name}</div>
              {r.due.kinds.length > 1 ? (
                <Choice
                  label={`${r.name} window`}
                  value={kinds[r.athleteId]}
                  options={r.due.kinds.map((k) => [k, KIND_LABEL[k]])}
                  onChange={(k) => { if (k) setKinds((all) => ({ ...all, [r.athleteId]: k })); }}
                />
              ) : (
                <Body size={12}>{KIND_LABEL[kinds[r.athleteId]]}</Body>
              )}
            </div>
          ))}
        </div>
        {error ? <Body size={12} tone={color.error} style={{ marginTop: 12 }}>{error}</Body> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <Button height={50} loading={saving} disabled={Boolean(problem)} onClick={start}>Start wave</Button>
          <Button variant="outline" height={50} disabled={saving} style={{ boxShadow: 'none' }} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
```

Create `frontend/src/portal/components/AssessmentsEntryCard.js`:

```js
import React from 'react';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';

/** The way in to the assessment screens for owners and ops (spec 5: "owners reach it from the admin dashboard and athlete detail"). */
export default function AssessmentsEntryCard({
  onOpen,
  title = 'Assessments',
  body = "Phil's physical assessment program: who is due, start a wave, read every result.",
  label = 'Open assessments',
}) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>{title}</SectionLabel>
      <Body size={12}>{body}</Body>
      <Button variant="secondary" height={44} onClick={onOpen} style={{ marginTop: 12, boxShadow: 'none' }}>
        {label}
      </Button>
    </Card>
  );
}
```

- [ ] **Step 4: The list screen**

Create `frontend/src/portal/screens/AssessmentList.js`:

```js
import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import { Tick, BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import StartWaveSheet from '../components/assessments/StartWaveSheet';
import { useAssessmentRoster, useAssessmentSettings } from '../hooks/assessments';
import { assessmentAccess } from '../data/assessmentAccess';
import { CONSENT_LABEL, shortDate, waveBlock } from '../data/assessmentWindows';
import { withDefaults } from '../data/assessmentSettings';
import { academyDateISO } from '../data/calendar';

const CONSENT_TONE = { yes: 'green', no: 'muted', unanswered: 'yellow' };
const COLUMNS = '44px 2fr 1.4fr 1.6fr 1fr';

/**
 * Assessments - the list (spec 5). Every academy athlete with their research
 * consent (yes / no / not answered), what is due ("Baseline due",
 * "Mid-season eligible", "End of season", in progress and since when, or
 * "Open since Nov 3: mark it complete" past the 14-day entry window) and the
 * last test.
 * Staff pick up to the wave size (four) and start a wave; an athlete whose
 * research answer is not recorded cannot be added, and nor can one who is
 * not due. Phone: one column; tablet and desktop: a table.
 */
export default function AssessmentList({ bare = false, viewer, onOpenWave, onOpenAthlete, onOpenSettings, onBack }) {
  const layout = useLayoutClass();
  const staff = assessmentAccess(viewer) === 'staff';
  const today = academyDateISO();
  const { data, loading, error } = useAssessmentRoster({ today });
  const settings = useAssessmentSettings().data?.settings ?? withDefaults(null);
  const waveSize = settings.waveSize;
  const [selected, setSelected] = useState([]);
  const [sheet, setSheet] = useState(false);
  const rows = data?.rows ?? [];
  const chosen = selected.map((id) => rows.find((r) => r.athleteId === id)).filter(Boolean);
  const isDue = (r) => r.due.kind != null;
  const toggle = (row) => setSelected((s) => (s.includes(row.athleteId) ? s.filter((id) => id !== row.athleteId) : s.length >= waveSize ? s : [...s, row.athleteId]));
  const onTabs = viewer?.role === 'coach' || viewer?.role === 'mental';

  return (
    <AssessmentFrame
      bare={bare}
      layout={layout}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: onBack ? 8 : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ScreenTitle size={24}>Assessments</ScreenTitle>
              <Body size={12} style={{ marginTop: 4 }}>Protocol {settings.protocolVersion} · waves of {waveSize}</Body>
            </div>
            {staff && onOpenSettings ? (
              <Button variant="outline" height={40} style={{ width: 'auto', boxShadow: 'none' }} onClick={onOpenSettings}>Settings</Button>
            ) : null}
          </div>
        </div>
      }
      footer={
        <>
          {staff ? (
            <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '12px 22px' }}>
              <Button height={52} disabled={chosen.length === 0} onClick={() => setSheet(true)}>Start wave · {chosen.length} of {waveSize}</Button>
            </div>
          ) : null}
          {onTabs ? <BottomTabBar role={viewer.role} specialistId={viewer.specialistId ?? undefined} assessments={staff} active="assessments" /> : null}
        </>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error ? <ErrorNotice>The athlete list didn't load. Check your connection and try again.</ErrorNotice> : null}
        {loading ? <Body size={12}>Loading athletes…</Body> : null}
        {[['Due now', rows.filter(isDue)], ['Not due yet', rows.filter((r) => !isDue(r))]].map(([title, group]) =>
          group.length ? (
            <Card key={title} large>
              <SectionLabel style={{ marginBottom: 6 }}>{title} · {group.length}</SectionLabel>
              {layout !== 'phone' ? <TableHead /> : null}
              {group.map((row) => (
                <Row key={row.athleteId} row={row} layout={layout} staff={staff} selected={selected.includes(row.athleteId)}
                  full={selected.length >= waveSize} onToggle={toggle} onOpen={() => onOpenAthlete(row.athleteId, row.name)} />
              ))}
            </Card>
          ) : null
        )}
      </div>
      {sheet ? (
        <StartWaveSheet
          rows={chosen}
          settings={settings}
          today={today}
          onClose={() => setSheet(false)}
          onStarted={(result) => {
            setSheet(false);
            setSelected([]);
            if (result.started.length) onOpenWave(result.waveId);
          }}
        />
      ) : null}
    </AssessmentFrame>
  );
}

function TableHead() {
  const head = { font: `600 10px ${font.body}`, letterSpacing: '.1em', textTransform: 'uppercase', color: color.textTertiary };
  return (
    <div role="row" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 10, padding: '6px 0', borderBottom: `1px solid ${color.rule}` }}>
      <span />
      {['Athlete', 'Research', 'Due', 'Last test'].map((h) => <span key={h} role="columnheader" style={head}>{h}</span>)}
    </div>
  );
}

function Row({ row, layout, staff, selected, full, onToggle, onOpen }) {
  const block = waveBlock(row);
  const disabled = Boolean(block) || (!selected && full);
  const last = row.due.lastTestDate ? `Last test ${shortDate(row.due.lastTestDate)}` : 'Never tested';
  const since = row.due.inProgress && !row.due.stale ? row.windows.find((w) => w.id === row.due.windowId)?.circuitDate ?? null : null;
  const name = (
    <button type="button" onClick={onOpen} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: `600 14px ${font.body}`, color: color.text, cursor: 'pointer' }}>
      {row.name}
    </button>
  );
  const consent = <StatusBadge tone={CONSENT_TONE[row.consent]}>{CONSENT_LABEL[row.consent]}</StatusBadge>;
  const dueText = <span style={{ font: `500 12px ${font.body}`, color: row.due.kind ? color.secondary : color.textTertiary }}>{row.due.label}{since ? ` · since ${shortDate(since)}` : ''}</span>;
  const lastText = <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>{last}</span>;
  const select = staff ? <SelectBox checked={selected} disabled={disabled} label={`Select ${row.name}`} onClick={() => onToggle(row)} /> : <span />;
  const note = row.consent === 'unanswered' ? <Body size={11} tone={color.secondary}>{block}</Body> : null;
  if (layout === 'phone') {
    return (
      <div style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: `1px solid ${color.rowRule}` }}>
        {select}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {name}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{consent}{dueText}{lastText}</div>
          {note}
        </div>
      </div>
    );
  }
  return (
    <div role="row" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${color.rowRule}` }}>
      {select}
      <div>{name}{note}</div>
      <div>{consent}</div>
      {dueText}
      {lastText}
    </div>
  );
}

function SelectBox({ checked, disabled, label, onClick }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{ width: 44, height: 44, flex: 'none', border: 'none', background: 'transparent', padding: 0, display: 'grid', placeItems: 'center', cursor: disabled ? 'default' : 'pointer', opacity: disabled && !checked ? 0.35 : 1 }}
    >
      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: radius.badge, display: 'grid', placeItems: 'center', background: checked ? color.primary : 'transparent', border: checked ? 'none' : `1.5px solid ${color.faintText}` }}>
        {checked ? <Tick size={11} /> : null}
      </span>
    </button>
  );
}
```

- [ ] **Step 5: The route, the guard and the Admin card**

Create `frontend/src/portal/AssessmentRoutes.js`:

```js
import React, { lazy } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import useAuthSession from './hooks/useAuthSession';
import { isLive } from './hooks/live';
import { SEED_VIEWER, assessmentAccess } from './data/assessmentAccess';

/*
 * The assessment routes' wrappers (spec 5), kept out of the grandfathered
 * PortalRoutes.js, which imports them and adds one <Route> per screen. Each
 * screen is its own chunk; the loaders are exported for the warm-up.
 */
export const loadAssessmentList = () => import('./screens/AssessmentList');
const AssessmentList = lazy(loadAssessmentList);

/** The signed-in user; in seed mode (the review scaffold), Phil. */
export function useViewer() {
  const live = isLive();
  const session = useAuthSession(live ? undefined : { variant: 'idle' });
  return { viewer: live ? session.user : SEED_VIEWER, loading: live && session.loading };
}

/**
 * The assessment guard, inside RequireRole (spec 3): 'staff' admits the
 * owner, ops, Phil and assessor staff; 'reader' every coach as well. Anyone
 * else goes to their own landing. Seed mode passes everyone, like
 * RequireRole. firestore.rules is the boundary; this is navigation.
 */
export function RequireAssessment({ level, landingFor, children }) {
  const { viewer, loading } = useViewer();
  if (!isLive()) return children;
  if (loading) return null;
  const access = assessmentAccess(viewer);
  const ok = level === 'reader' ? access != null : access === 'staff';
  return ok ? children : <Navigate to={landingFor(viewer)} replace />;
}

/** /portal/assessments - owners and ops arrive from Admin and go back there; Phil and assessors use the tab. */
export function AssessmentListRoute() {
  const { viewer } = useViewer();
  const navigate = useNavigate();
  const fromAdmin = viewer?.role === 'ops' || viewer?.role === 'owner';
  return (
    <AssessmentList
      bare
      viewer={viewer}
      onOpenWave={(waveId) => navigate(`/portal/assessments/wave/${waveId}`)}
      onOpenAthlete={(athleteId, name) => navigate(`/portal/assessments/athlete/${athleteId}`, { state: { name } })}
      onOpenSettings={() => navigate('/portal/assessments/settings')}
      onBack={fromAdmin ? () => navigate('/portal/admin') : undefined}
    />
  );
}
```

In `frontend/src/portal/PortalRoutes.js`, replace:

```js
import { bump } from './hooks/invalidate';
```

with:

```js
import { bump } from './hooks/invalidate';
import { AssessmentListRoute, RequireAssessment, loadAssessmentList } from './AssessmentRoutes';
```

then replace:

```js
  admin: [loadAdmin],
  staff: [loadStaff],
};
```

with:

```js
  admin: [loadAdmin],
  staff: [loadStaff],
  assessments: [loadAssessmentList],
};
```

then replace:

```js
  'my-sessions': [loadRoster],
```

with:

```js
  'my-sessions': [loadRoster, loadAssessmentList],
```

then replace:

```js
      onOpenScholarships={owner ? () => navigate('/portal/admin/scholarships') : undefined}
      onSignOut={onSignOut}
```

with:

```js
      onOpenScholarships={owner ? () => navigate('/portal/admin/scholarships') : undefined}
      onOpenAssessments={() => navigate('/portal/assessments')}
      onSignOut={onSignOut}
```

then replace:

```js
      {/* Staff — admin admits every staff role's read surface; Staff & Roles
```

with:

```js
      {/* Assessments (2026-10-14 spec 5): the list - Phil, assessor staff,
          ops and owner (AssessmentRoutes.js). */}
      <Route
        path="assessments"
        element={
          <RequireRole roles={['coach', 'mental', 'ops', 'owner']}>
            <RequireAssessment level="staff" landingFor={landingFor}>
              <AssessmentListRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />

      {/* Staff — admin admits every staff role's read surface; Staff & Roles
```

In `frontend/src/portal/screens/AdminDashboard.js`, replace:

```js
import ScholarshipsCard from '../components/ScholarshipsCard';
```

with:

```js
import ScholarshipsCard from '../components/ScholarshipsCard';
import AssessmentsEntryCard from '../components/AssessmentsEntryCard';
```

then replace:

```js
  onOpenScholarships,
  demoMembership,
}) {
```

with:

```js
  onOpenScholarships,
  onOpenAssessments,
  demoMembership,
}) {
```

then replace:

```js
        <SignupsCard onOpenSignups={onOpenSignups} />
```

with:

```js
        <SignupsCard onOpenSignups={onOpenSignups} />
        {/* 2026-10-14 (assessments spec 5): owners and ops reach the assessments from here. */}
        {onOpenAssessments ? <AssessmentsEntryCard onOpen={onOpenAssessments} /> : null}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AssessmentList.test.js src/portal/AssessmentRoutes.test.js src/portal/screens/AdminDashboard src/portal/PortalRoutes`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/portal/screens/AssessmentList.js frontend/src/portal/screens/AssessmentList.test.js frontend/src/portal/components/assessments/StartWaveSheet.js frontend/src/portal/components/AssessmentsEntryCard.js frontend/src/portal/AssessmentRoutes.js frontend/src/portal/AssessmentRoutes.test.js frontend/src/portal/PortalRoutes.js frontend/src/portal/screens/AdminDashboard.js frontend/src/portal/screens/AdminDashboard.test.js
git commit -m "feat(assessments): the athlete list and starting a wave

Every athlete with research consent, what is due and the last test; pick up
to four and start a wave dated by the academy, naming any athlete the wave
could not take; owners and ops reach it from Admin, Phil and assessors from
the tab.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The wave screen and the readiness & intake station

**Files:**
- Create: `frontend/src/portal/screens/AssessmentWave.js`
- Create: `frontend/src/portal/components/assessments/StationShell.js`
- Create: `frontend/src/portal/components/assessments/NotTestedSheet.js`
- Create: `frontend/src/portal/components/assessments/EquipmentCard.js`
- Create: `frontend/src/portal/components/assessments/FieldRow.js`
- Create: `frontend/src/portal/components/assessments/IntakeStation.js`
- Modify: `frontend/src/portal/AssessmentRoutes.js` (add the wave route wrapper), `frontend/src/portal/PortalRoutes.js` (import, one `<Route>`)
- Test: `frontend/src/portal/screens/AssessmentWave.test.js`, `frontend/src/portal/components/assessments/StationShell.test.js`, `frontend/src/portal/AssessmentRoutes.test.js` (one mock, one test)

**Interfaces:**
- Consumes: `useWave` (Task 6); `saveSection`, `saveAssessmentProfile`, `saveWindowFields` (Task 5); `useSaveTracker`, `keepPending`, `dropPending`, `pendingFor` (Task 11); `AssessmentFrame`, `useLayoutClass`, `TrialInput`, `TextEntry`, `Choice`, `SaveState` (Task 11); `stationsFor`, `NOT_TESTED_REASONS`, `STATIONS` (Task 2); `shortDate` (Task 2); `LETTERS` (Task 12, `StartWaveSheet.js`); `CancelSheet`; `useViewer` (Task 12).
- Produces:
  - `AssessmentWave({ bare, waveId, initialStation, onBack })`; `STATION_VIEWS` (exported) maps a station id to `{ View, rotation? }` - Task 14-16 add `anthro`, `grip`, `jump`, `medball`, `mcgill`
  - Every station view: `View({ athlete, equipment, circuitMode, onSave(athleteId, section, value), onSaveProfile(athleteId, patch), onSaveFields(athleteId, fields) })`; `rotation(athletes, circuitMode): string|null` is the order line under the cue
  - `StationShell({ station, athletes, layout, order, entries, onRetry, onNotTested(athleteId, keys, reason|null), renderAthlete(athlete) })`; `painStopBefore(window, stationId): Station|null` (the earlier station, in the fixed order, where the athlete was stopped for pain)
  - `AssessmentWave` keeps every save on the device until the server has it and, when the wave opens, re-applies and re-sends what is still kept (Task 11's store)
  - `useEquipment(): [equipment, update(patch)]`, `EQUIPMENT_KEY = 'ryp.assessments.equipment'`, `EMPTY_EQUIPMENT = { dynamometer1, dynamometer2, handlePosition, boxHeight, plateSoftware, samplingHz, radarMethod }`
  - `FieldRow({ label, children })`, `NotTestedSheet({ name, onPick(reason), onClose })`
  - Route `/portal/assessments/wave/:waveId` (staff), `AssessmentWaveRoute`, `loadAssessmentWave`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/screens/AssessmentWave.test.js`:

```js
import React, { act } from 'react';
import { renderScreen } from './testRender';
import AssessmentWave from './AssessmentWave';
import { DEFAULT_SETTINGS, circuitModeOf } from '../data/assessmentSettings';

let mockWave;
let mockSaves;
let mockHang;
jest.mock('../hooks/assessments', () => ({ useWave: () => ({ data: mockWave, loading: false, error: null }) }));
jest.mock('../hooks/assessmentsLive', () => {
  const record = (kind) => async (args) => {
    mockSaves.push([kind, args]);
    if (mockHang) await new Promise(() => {});
    return args;
  };
  return { saveSection: record('section'), saveAssessmentProfile: record('profile'), saveWindowFields: record('fields') };
});

const MODE = circuitModeOf(DEFAULT_SETTINGS);
const athlete = (athleteId, name, position, over = {}) => ({
  athleteId, name, dob: '2012-04-10', position, windowId: '2026-27-baseline', kind: 'baseline',
  window: { id: '2026-27-baseline', athleteId, season: '2026-27', kind: 'baseline', status: 'open', circuitDate: '2026-11-03', circuitMode: MODE, enteredBy: {} },
  profile: { athleteId, sex: null, season: '2026-27' }, prior: [], ...over,
});
const sections = (kind) => mockSaves.filter(([k, a]) => k === 'section' && a.section === kind).map(([, a]) => a);
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const wave = (props = {}) => renderScreen(<AssessmentWave bare waveId="w1" onBack={() => {}} {...props} />);

beforeEach(() => {
  mockSaves = [];
  mockHang = false;
  window.innerWidth = 1024;
  try { window.localStorage.clear(); } catch (err) { /* jsdom always has it */ }
  mockWave = { waveId: 'w1', circuitDate: '2026-11-03', circuitMode: MODE, protocolVersion: 'v1.2', athletes: [athlete('a', 'Ava Moreno', 1), athlete('b', 'Ben Ortiz', 2)] };
});
afterEach(() => { window.innerWidth = 1024; });

test('the wave header, the fixed station order and the standard cue', async () => {
  const r = await wave();
  expect(r.text()).toContain('Wave · Nov 3');
  expect(r.text()).toContain('Protocol v1.2');
  expect(r.button('1 Readiness & intake').getAttribute('aria-pressed')).toBe('true');
  expect(r.text()).toContain('Pain check first.');
  expect(r.text()).toContain('A · Ava Moreno');
  expect(r.text()).toContain('B · Ben Ortiz');
  await r.unmount();
});

test('intake saves each answer as given: readiness, hours, golf today, sex at the first test, the training log', async () => {
  const r = await wave();
  await r.click('Ava Moreno readiness: Pass');
  await type(r, 'Ava Moreno hours since a hard session', '20');
  await r.click('Ava Moreno golf today: No');
  await r.click('Ava Moreno sex: Female');
  await r.click('Ava Moreno training location: External');
  await r.click('Ava Moreno external training: Machines / barbells');
  await type(r, 'Ava Moreno weekly training hours', '6,5');
  expect(sections('readiness').pop()).toEqual({ athleteId: 'a', windowId: '2026-27-baseline', section: 'readiness',
    value: { status: 'pass', reason: null, hoursSinceHardSession: 20, golfToday: false, notes: null } });
  expect(mockSaves.find(([k]) => k === 'profile')[1]).toEqual({ athleteId: 'a', patch: { sex: 'female' } });
  expect(sections('log').pop().value).toEqual({ location: 'external', externalContent: 'machines', weeklyHours: 6.5, rypSessionsSincePrior: null,
    golfVolume: null, competitiveLevel: null, otherSport: null, otherSportHours: null });
  expect(r.text()).toContain('Saved');
  await r.unmount();
});

test('not tested with a reason code, and undo; a pain stop says to retest and refer', async () => {
  const r = await wave();
  await r.click('Ava Moreno: not tested');
  await r.click('Ill');
  expect(sections('notTested').pop()).toMatchObject({ athleteId: 'a', value: { readiness: 'ill' } });
  expect(r.text()).toContain('Not tested: Ill');
  await r.click('Undo not tested');
  expect(sections('notTested').pop().value).toEqual({});
  await r.click('Ben Ortiz: pain, stop');
  expect(sections('notTested').pop()).toMatchObject({ athleteId: 'b', value: { readiness: 'pain' } });
  expect(r.text()).toContain('Stopped for pain. Retest within 7 days; refer per RYP policy.');
  await r.unmount();
});

test('phone: one athlete at a time with a switcher; tablet: both side by side', async () => {
  window.innerWidth = 390;
  const phone = await wave();
  expect(phone.text()).toContain('A · Ava Moreno');
  expect(phone.text()).not.toContain('B · Ben Ortiz');
  await phone.click('Show B · Ben Ortiz');
  expect(phone.text()).toContain('B · Ben Ortiz');
  expect(phone.text()).not.toContain('A · Ava Moreno');
  await phone.unmount();
  window.innerWidth = 1024;
  const tablet = await wave();
  expect(tablet.text()).toContain('A · Ava Moreno');
  expect(tablet.text()).toContain('B · Ben Ortiz');
  await tablet.unmount();
});

test('leaving with an entry not on the server asks first (Review Focus 2); with everything saved it does not', async () => {
  mockHang = true;
  const left = [];
  const r = await wave({ onBack: () => left.push(1) });
  await r.click('Ava Moreno readiness: Pass');
  await r.click('‹ Assessments');
  expect(r.text()).toContain('Leave this wave?');
  expect(r.text()).toContain('1 entry has not reached the server yet.');
  await r.click('Stay on the wave');
  expect(left).toEqual([]);
  await r.click('‹ Assessments');
  await r.click('Leave anyway');
  expect(left).toEqual([1]);
  await r.unmount();
  mockHang = false;
  const saved = [];
  const r2 = await wave({ onBack: () => saved.push(1) });
  await r2.click('Ben Ortiz readiness: Pass');
  await r2.click('‹ Assessments');
  expect(saved).toEqual([1]);
  await r2.unmount();
});

test('an entry not on the server is kept on this tablet: reopening the wave shows it and sends it again (Review Focus 2)', async () => {
  mockHang = true;
  const first = await wave();
  await type(first, 'Ava Moreno hours since a hard session', '20');
  await first.unmount();
  mockHang = false;
  mockSaves = [];
  const again = await wave();
  await again.flush();
  expect(field(again, 'Ava Moreno hours since a hard session').value).toBe('20');
  expect(sections('readiness')).toEqual([{ athleteId: 'a', windowId: '2026-27-baseline', section: 'readiness',
    value: { status: null, reason: null, hoursSinceHardSession: 20, golfToday: null, notes: null } }]);
  expect(again.text()).toContain('All saved');
  expect(window.localStorage.getItem('ryp.assessments.pending')).toBeNull();
  await again.unmount();
});

test('equipment is entered once and remembered on this device', async () => {
  window.localStorage.setItem('ryp.assessments.equipment', JSON.stringify({ dynamometer1: 'D-07', dynamometer2: 'D-09', handlePosition: '3' }));
  const r = await wave();
  expect(r.text()).toContain('D-07');
  await r.click('Edit equipment');
  await r.fill('Plate software', 'Smart2Move 4.2');
  await act(async () => { field(r, 'Plate software').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(JSON.parse(window.localStorage.getItem('ryp.assessments.equipment'))).toMatchObject({ dynamometer1: 'D-07', plateSoftware: 'Smart2Move 4.2' });
  await r.unmount();
});

test('an unknown wave says so', async () => {
  mockWave = null;
  const r = await wave();
  expect(r.text()).toContain('This wave was not found.');
  await r.unmount();
});
```

In `frontend/src/portal/AssessmentRoutes.test.js`, replace:

```js
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
```

with:

```js
jest.mock('./screens/AssessmentWave', () => ({ __esModule: true, default: ({ waveId, initialStation }) => `WAVE ${waveId} at ${initialStation ?? 'start'}` }));
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
```

and append at the end of the file:

```js
test('a wave opens for staff; a coach without the permission goes home', async () => {
  mockUser.value = { uid: 'p', role: 'coach', specialistId: 'phil' };
  const r = await mount('/portal/assessments/wave/wave-2026-11-03-abc');
  expect(r.text()).toBe('WAVE wave-2026-11-03-abc at start');
  await r.unmount();
  mockUser.value = { uid: 'c', role: 'coach' };
  const c = await mount('/portal/assessments/wave/wave-2026-11-03-abc');
  expect(c.pathname()).toBe('/portal/coach');
  await c.unmount();
});
```

Create `frontend/src/portal/components/assessments/StationShell.test.js`:

```js
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import StationShell, { painStopBefore } from './StationShell';
import { STATIONS } from '../../data/assessmentSettings';

// StationShell reads LETTERS from StartWaveSheet, which imports the Firestore adapter.
jest.mock('../../hooks/assessmentsLive', () => ({ startWave: async () => ({}) }));

const station = (id) => STATIONS.find((s) => s.id === id);
const athlete = (w) => ({ athleteId: 'a', name: 'Ava Moreno', position: 1, window: { id: '2026-27-baseline', ...w } });
const shell = (id, w) => renderScreen(
  <StationShell station={station(id)} athletes={[athlete(w)]} layout="tablet" order={null} entries={{}} onRetry={() => {}} onNotTested={() => {}} renderAthlete={() => 'STATION INPUTS'} />
);

test('not tested at intake - the readiness answer, the not-tested control or a pain stop - skips every later station', async () => {
  for (const w of [{ readiness: { status: 'not-tested', reason: 'ill' } }, { notTested: { readiness: 'ill' } }, { notTested: { readiness: 'pain' } }]) {
    const r = await shell('anthro', w);
    expect(r.text()).not.toContain('STATION INPUTS');
    expect(r.text()).toContain('Not tested at readiness');
    await r.unmount();
  }
  const intake = await shell('intake', { notTested: { readiness: 'pain' } });
  expect(intake.text()).toContain('Stopped for pain. Retest within 7 days; refer per RYP policy.');
  await intake.unmount();
});

test('a pain stop at a station ends the later ones for that athlete; the stations before it are untouched', async () => {
  const w = { notTested: { grip: 'pain' } };
  expect(painStopBefore(w, 'medball').id).toBe('grip');
  expect(painStopBefore(w, 'grip')).toBeNull();
  expect(painStopBefore(w, 'anthro')).toBeNull();
  const later = await shell('jump', w);
  expect(later.text()).toContain('Stopped for pain at Grip. Retest within 7 days; refer per RYP policy.');
  expect(later.text()).not.toContain('STATION INPUTS');
  await later.unmount();
  const before = await shell('anthro', w);
  expect(before.text()).toContain('STATION INPUTS');
  await before.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AssessmentWave.test.js src/portal/components/assessments/StationShell.test.js src/portal/AssessmentRoutes.test.js`
Expected: FAIL - "Cannot find module './AssessmentWave'", "Cannot find module './StationShell'" and the wave path landing on the index.

- [ ] **Step 3: Shared pieces: field row, not-tested sheet, equipment**

Create `frontend/src/portal/components/assessments/FieldRow.js`:

```js
import React from 'react';
import { color, font } from '../../tokens';

/** A label at left and its input(s) at right - the station cards' one row shape. */
export default function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 140px', minWidth: 0, font: `400 13px ${font.body}`, color: color.textSecondary }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</div>
    </div>
  );
}
```

Create `frontend/src/portal/components/assessments/NotTestedSheet.js`:

```js
import React from 'react';
import { color, radius, tint } from '../../tokens';
import Button from '../Button';
import { Body, ScreenTitle } from '../Primitives';
import { NOT_TESTED_REASONS } from '../../data/assessmentSettings';

/** "Not tested" with the protocol's reason codes (absent, ill, pain, injury, equipment) - the CancelSheet overlay idiom. */
export default function NotTestedSheet({ name, onPick, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}
      >
        <ScreenTitle size={19}>Not tested · {name}</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>Pick the reason. Retest within 7 days.</Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {NOT_TESTED_REASONS.map(([key, label]) => (
            <Button key={key} variant="outline" height={46} style={{ boxShadow: 'none' }} onClick={() => onPick(key)}>{label}</Button>
          ))}
          <Button variant="outline" height={46} style={{ boxShadow: 'none', marginTop: 6 }} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
```

Create `frontend/src/portal/components/assessments/EquipmentCard.js`:

```js
import React, { useCallback, useState } from 'react';
import { color, font } from '../../tokens';
import Button from '../Button';
import TrialInput, { TextEntry } from './TrialInput';
import Choice from './Choice';
import FieldRow from './FieldRow';
import { Body, Card, SectionLabel } from '../Primitives';

/**
 * Per-wave equipment (spec 5: "entered once per wave and remembered"):
 * dynamometer ids (pair A/B on dynamometer 1, C/D on 2), handle position,
 * the sitting box, plate software and sampling rate, and the med ball
 * method. Remembered on this device (localStorage - a per-device
 * convenience; storage can be missing or full, so every access is guarded);
 * the stations copy what they use onto each athlete's section as it saves,
 * so the window keeps its own test conditions.
 */
export const EQUIPMENT_KEY = 'ryp.assessments.equipment';
export const EMPTY_EQUIPMENT = { dynamometer1: null, dynamometer2: null, handlePosition: null, boxHeight: null, plateSoftware: null, samplingHz: null, radarMethod: 'speed' };

export function readEquipment() {
  try {
    const raw = window.localStorage.getItem(EQUIPMENT_KEY);
    return { ...EMPTY_EQUIPMENT, ...(raw ? JSON.parse(raw) : {}) };
  } catch (err) {
    return { ...EMPTY_EQUIPMENT };
  }
}

export function useEquipment() {
  const [equipment, setEquipment] = useState(readEquipment);
  const update = useCallback((patch) => {
    setEquipment((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(next));
      } catch (err) {
        /* private mode or full: kept for this page only */
      }
      return next;
    });
  }, []);
  return [equipment, update];
}

export default function EquipmentCard({ equipment, onChange }) {
  const [open, setOpen] = useState(() => !equipment.dynamometer1);
  const summary = [
    equipment.dynamometer1 || equipment.dynamometer2 ? `Dynamometers ${equipment.dynamometer1 || '-'} / ${equipment.dynamometer2 || '-'}` : null,
    equipment.handlePosition ? `handle ${equipment.handlePosition}` : null,
    equipment.boxHeight ? `box ${equipment.boxHeight} cm` : null,
    equipment.plateSoftware ? `${equipment.plateSoftware}${equipment.samplingHz ? ` ${equipment.samplingHz} Hz` : ''}` : null,
    equipment.radarMethod === 'distance' ? 'med ball by distance' : 'med ball by radar',
  ].filter(Boolean).join(' · ');
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionLabel>Equipment</SectionLabel>
          {!open ? <Body size={12} style={{ marginTop: 6 }}>{summary}</Body> : null}
        </div>
        <Button variant="outline" height={38} style={{ width: 'auto', boxShadow: 'none', font: `500 13px ${font.body}` }} onClick={() => setOpen((o) => !o)}>
          {open ? 'Done' : 'Edit equipment'}
        </Button>
      </div>
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <FieldRow label="Dynamometer 1 (A, B)"><TextEntry label="Dynamometer 1" value={equipment.dynamometer1} onCommit={(v) => onChange({ dynamometer1: v })} /></FieldRow>
          <FieldRow label="Dynamometer 2 (C, D)"><TextEntry label="Dynamometer 2" value={equipment.dynamometer2} onCommit={(v) => onChange({ dynamometer2: v })} /></FieldRow>
          <FieldRow label="Handle position"><TextEntry label="Handle position" value={equipment.handlePosition} onCommit={(v) => onChange({ handlePosition: v })} /></FieldRow>
          <FieldRow label="Sitting box height (cm)"><TrialInput label="Sitting box height" value={equipment.boxHeight} rangeKey="boxHeight" onCommit={(v) => onChange({ boxHeight: v })} /></FieldRow>
          <FieldRow label="Plate software and version"><TextEntry label="Plate software" value={equipment.plateSoftware} onCommit={(v) => onChange({ plateSoftware: v })} /></FieldRow>
          <FieldRow label="Plate sampling rate (Hz)"><TrialInput label="Plate sampling rate" value={equipment.samplingHz} rangeKey="samplingHz" onCommit={(v) => onChange({ samplingHz: v })} /></FieldRow>
          <Choice label="Med ball" value={equipment.radarMethod} options={[['speed', 'Radar speed (mph)'], ['distance', 'Throw distance (m)']]} onChange={(v) => { if (v) onChange({ radarMethod: v }); }} />
          <Body size={11} tone={color.textTertiary}>Kept on this device for the next wave.</Body>
        </div>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 4: The station shell and the intake station**

Create `frontend/src/portal/components/assessments/StationShell.js`:

```js
import React, { useState } from 'react';
import { color, font, radius } from '../../tokens';
import Button from '../Button';
import SaveState from './SaveState';
import NotTestedSheet from './NotTestedSheet';
import { LETTERS } from './StartWaveSheet';
import { Body, Card, SectionLabel } from '../Primitives';
import { NOT_TESTED_REASONS, STATIONS } from '../../data/assessmentSettings';

const REASON_LABEL = Object.fromEntries(NOT_TESTED_REASONS);
const RANK = { error: 3, slow: 2, saving: 1, saved: 0 };

/**
 * The earlier station, in the fixed order, where this athlete was stopped
 * for pain, or null. Intake is the readiness check's own case (below).
 */
export function painStopBefore(w, stationId) {
  const at = STATIONS.findIndex((s) => s.id === stationId);
  return STATIONS.slice(0, Math.max(0, at)).find((s) => s.id !== 'intake' && s.notTestedKeys.some((k) => w.notTested?.[k] === 'pain')) ?? null;
}

/**
 * One station of the wave (spec 5): its standard cue, the athletes in
 * rotation order, and per athlete a "not tested" control with the
 * protocol's reason codes and a pain stop ("Stop any test immediately if
 * the athlete reports pain"). Phone (< 700 px) shows one athlete at a time
 * with a switcher; tablet two columns; desktop all four side by side. An
 * athlete not tested at readiness - the readiness answer, or intake's not
 * tested and pain-stop controls (notTested.readiness) - skips every later
 * station, and a pain stop at any station ends that athlete's later stations
 * (protocol Section 2: do not test an athlete who reports current pain;
 * Phil confirms, Task 26 Step 1). "Undo not tested" at the station where it
 * was recorded opens the later ones again.
 */
export default function StationShell({ station, athletes, layout, order, entries, onRetry, onNotTested, renderAthlete }) {
  const [current, setCurrent] = useState(0);
  const [askFor, setAskFor] = useState(null);
  const index = Math.min(current, Math.max(0, athletes.length - 1));
  const shown = layout === 'phone' ? athletes.slice(index, index + 1) : athletes;
  const columns = layout === 'desktop' ? Math.max(1, athletes.length) : layout === 'tablet' ? Math.min(2, Math.max(1, athletes.length)) : 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card large>
        <SectionLabel>{station.label}</SectionLabel>
        <Body size={13} style={{ marginTop: 8 }}>{station.cue}</Body>
        {order ? <Body size={11} tone={color.textTertiary} style={{ marginTop: 8 }}>{order}</Body> : null}
      </Card>
      {layout === 'phone' && athletes.length > 1 ? (
        <div role="tablist" aria-label="Athletes" style={{ display: 'flex', gap: 6 }}>
          {athletes.map((a, i) => {
            const on = i === index;
            const label = `${LETTERS[a.position - 1]} · ${a.name}`;
            return (
              <button key={a.athleteId} type="button" role="tab" aria-selected={on} aria-label={`Show ${label}`} onClick={() => setCurrent(i)}
                style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, border: `1px solid ${on ? color.primary : color.controlBorder}`, background: on ? color.primary : 'transparent', color: on ? '#000' : color.textSecondary, font: `600 13px ${font.body}` }}>
                {LETTERS[a.position - 1]}
              </button>
            );
          })}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12 }}>
        {shown.map((a) => (
          <AthleteCard key={a.athleteId} athlete={a} station={station} entries={entries} onRetry={onRetry} onNotTested={onNotTested}
            onAsk={() => setAskFor(a)} renderAthlete={renderAthlete} />
        ))}
      </div>
      {askFor ? (
        <NotTestedSheet
          name={askFor.name}
          onClose={() => setAskFor(null)}
          onPick={(reason) => {
            onNotTested(askFor.athleteId, station.notTestedKeys, reason);
            setAskFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AthleteCard({ athlete, station, entries, onRetry, onNotTested, onAsk, renderAthlete }) {
  const w = athlete.window;
  const reason = station.notTestedKeys.map((k) => w.notTested?.[k]).find(Boolean) ?? null;
  const readinessOff = w.readiness?.status === 'not-tested' || Boolean(w.notTested?.readiness);
  const atReadiness = station.id !== 'intake' && readinessOff;
  const readinessReason = (w.readiness?.status === 'not-tested' ? w.readiness.reason : null) ?? w.notTested?.readiness ?? null;
  const painAt = station.id !== 'intake' && !atReadiness ? painStopBefore(w, station.id) : null;
  const keys = [...station.sections, 'notTested', 'profile', 'fields'].map((s) => `${athlete.athleteId}:${s}`);
  const tracked = keys.filter((k) => entries[k]);
  const worstKey = tracked.sort((x, y) => RANK[entries[y].state] - RANK[entries[x].state])[0];
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0, font: `700 15px ${font.head}`, color: color.text }}>
          {LETTERS[athlete.position - 1]} · {athlete.name}
        </div>
        <SaveState entry={worstKey ? entries[worstKey] : null} onRetry={() => onRetry(worstKey)} />
      </div>
      {reason ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Body size={13}>Not tested: {REASON_LABEL[reason]}</Body>
          {reason === 'pain' ? <Body size={12} tone={color.error}>Stopped for pain. Retest within 7 days; refer per RYP policy.</Body> : null}
          <Button variant="outline" height={40} style={{ boxShadow: 'none' }} onClick={() => onNotTested(athlete.athleteId, station.notTestedKeys, null)}>
            Undo not tested
          </Button>
        </div>
      ) : atReadiness ? (
        <Body size={13}>Not tested at readiness ({REASON_LABEL[readinessReason] ?? 'no reason given'}). Retest within 7 days.</Body>
      ) : painAt ? (
        <Body size={13} tone={color.error}>Stopped for pain at {painAt.label}. Retest within 7 days; refer per RYP policy.</Body>
      ) : (
        <>
          {renderAthlete(athlete)}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button variant="outline" height={40} aria-label={`${athlete.name}: not tested`} style={{ boxShadow: 'none' }} onClick={onAsk}>Not tested</Button>
            <Button variant="dangerOutline" height={40} aria-label={`${athlete.name}: pain, stop`} style={{ boxShadow: 'none' }}
              onClick={() => onNotTested(athlete.athleteId, station.notTestedKeys, 'pain')}>
              Pain - stop
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
```

Create `frontend/src/portal/components/assessments/IntakeStation.js`:

```js
import React from 'react';
import Choice from './Choice';
import FieldRow from './FieldRow';
import TrialInput, { TextEntry } from './TrialInput';
import { SectionLabel } from '../Primitives';
import { NOT_TESTED_REASONS } from '../../data/assessmentSettings';

export const EMPTY_READINESS = { status: null, reason: null, hoursSinceHardSession: null, golfToday: null, notes: null };
export const EMPTY_LOG = { location: null, externalContent: null, weeklyHours: null, rypSessionsSincePrior: null, golfVolume: null, competitiveLevel: null, otherSport: null, otherSportHours: null };
const YES_NO = [[true, 'Yes'], [false, 'No']];

/**
 * Station 1 - readiness & intake (protocol Sections 2 and 5): the pain
 * check (pass, or not tested with a reason), hours since the last hard
 * session, golf played today, low back pain (McGill flexor and extensor are
 * then skipped), sex - entered by the coach (spec decision 8) - and the
 * training and location log. Each answer saves as it is given.
 */
export default function IntakeStation({ athlete, onSave, onSaveProfile }) {
  const { athleteId, name, window: w } = athlete;
  const r = { ...EMPTY_READINESS, ...(w.readiness || {}) };
  const log = { ...EMPTY_LOG, ...(w.log || {}) };
  const setR = (patch) => onSave(athleteId, 'readiness', { ...r, ...patch });
  const setLog = (patch) => onSave(athleteId, 'log', { ...log, ...patch });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Choice label={`${name} readiness`} value={r.status} options={[['pass', 'Pass'], ['not-tested', 'Not tested']]}
        onChange={(status) => setR({ status, reason: status === 'not-tested' ? r.reason : null })} />
      {r.status === 'not-tested' ? (
        <Choice label={`${name} reason`} value={r.reason} options={NOT_TESTED_REASONS} onChange={(reason) => setR({ reason })} />
      ) : null}
      <FieldRow label="Hours since a hard session">
        <TrialInput label={`${name} hours since a hard session`} value={r.hoursSinceHardSession} rangeKey="hoursSinceHard" onCommit={(v) => setR({ hoursSinceHardSession: v })} />
      </FieldRow>
      <Choice label={`${name} golf today`} value={r.golfToday} options={YES_NO} onChange={(golfToday) => setR({ golfToday })} />
      {athlete.kind !== 'mid' ? (
        <Choice label={`${name} low back pain now`} value={w.mcgill?.skippedBackPain ?? null} options={YES_NO}
          onChange={(v) => onSave(athleteId, 'mcgill', { ...(w.mcgill || {}), skippedBackPain: v })} />
      ) : null}
      <Choice label={`${name} sex`} value={athlete.profile?.sex ?? null} options={[['male', 'Male'], ['female', 'Female']]}
        onChange={(sex) => { if (sex) onSaveProfile(athleteId, { sex }); }} />
      <FieldRow label="Readiness notes">
        <TextEntry label={`${name} readiness notes`} value={r.notes} max={500} onCommit={(notes) => setR({ notes })} />
      </FieldRow>
      <SectionLabel style={{ marginTop: 6 }}>Training & location</SectionLabel>
      <Choice label={`${name} training location`} value={log.location} options={[['ryp', 'RYP'], ['external', 'External'], ['none', 'None']]}
        onChange={(location) => setLog({ location, externalContent: location === 'external' ? log.externalContent : null })} />
      {log.location === 'external' ? (
        <Choice label={`${name} external training`} value={log.externalContent}
          options={[['machines', 'Machines / barbells'], ['bodyweight', 'Bodyweight / bands / cable'], ['class', 'General fitness class']]}
          onChange={(externalContent) => setLog({ externalContent })} />
      ) : null}
      <FieldRow label="Weekly training hours">
        <TrialInput label={`${name} weekly training hours`} value={log.weeklyHours} rangeKey="weeklyHours" onCommit={(v) => setLog({ weeklyHours: v })} />
      </FieldRow>
      <FieldRow label="RYP sessions since the last window">
        <TrialInput label={`${name} RYP sessions since the last window`} value={log.rypSessionsSincePrior} rangeKey="sessions" onCommit={(v) => setLog({ rypSessionsSincePrior: v })} />
      </FieldRow>
      <FieldRow label="Golf practice and competition">
        <TextEntry label={`${name} golf volume`} value={log.golfVolume} max={80} onCommit={(golfVolume) => setLog({ golfVolume })} />
      </FieldRow>
      <FieldRow label="Competitive level">
        <TextEntry label={`${name} competitive level`} value={log.competitiveLevel} max={80} onCommit={(competitiveLevel) => setLog({ competitiveLevel })} />
      </FieldRow>
      <FieldRow label="Other organized sport">
        <TextEntry label={`${name} other sport`} value={log.otherSport} max={40} onCommit={(otherSport) => setLog({ otherSport })} />
      </FieldRow>
      {log.otherSport ? (
        <FieldRow label="Other sport hours a week">
          <TrialInput label={`${name} other sport hours`} value={log.otherSportHours} rangeKey="otherSportHours" onCommit={(v) => setLog({ otherSportHours: v })} />
        </FieldRow>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: The wave screen and its route**

Create `frontend/src/portal/screens/AssessmentWave.js`:

```js
import React, { useEffect, useState } from 'react';
import { color, font, radius } from '../tokens';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import Button from '../components/Button';
import CancelSheet from '../components/CancelSheet';
import StationShell from '../components/assessments/StationShell';
import EquipmentCard, { useEquipment } from '../components/assessments/EquipmentCard';
import IntakeStation from '../components/assessments/IntakeStation';
import { BackLink, Body, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { useWave } from '../hooks/assessments';
import { saveAssessmentProfile, saveSection, saveWindowFields } from '../hooks/assessmentsLive';
import useSaveTracker, { dropPending, keepPending, pendingFor } from '../hooks/assessmentSaves';
import { stationsFor } from '../data/assessmentSettings';
import { shortDate } from '../data/assessmentWindows';

/**
 * The station views, in the fixed order (protocol Section 2). A station
 * without a view here is not offered yet.
 */
export const STATION_VIEWS = {
  intake: { View: IntakeStation },
};

/** The save tracker's key for a kept entry: athleteId:section, athleteId:profile or athleteId:fields. */
const trackerKey = (kept) => `${kept.athleteId}:${kept.kind === 'section' ? kept.section : kept.kind}`;

/** Send one kept save (`value` is what this write carries); the device copy goes once the server has it. */
function send(kept, value = kept.value) {
  const done = (result) => {
    dropPending(kept);
    return result;
  };
  const { athleteId, windowId } = kept;
  if (kept.kind === 'section') return saveSection({ athleteId, windowId, section: kept.section, value }).then(done);
  if (kept.kind === 'fields') return saveWindowFields({ athleteId, windowId, fields: value }).then(done);
  return saveAssessmentProfile({ athleteId, patch: value }).then(done);
}

/**
 * One wave of four (spec 5): the fixed station order, each station's cue,
 * the athletes in rotation order, the equipment entered once, and every
 * entry saved as it is typed - one section per write
 * (hooks/assessmentsLive.js saveSection). What was typed lives here once the
 * wave has loaded, so nothing a background read brings back can overwrite
 * it; the save tracker says what has not reached the server yet, and
 * leaving with anything unsaved asks first (Review Focus 2). Every save is
 * also kept on this device until the server has it: a reload, or iPad
 * Safari evicting the page, loses the SDK's queued writes and ignores the
 * leave prompt, so when the wave opens again what is still kept is shown
 * and sent again.
 * `initialStation` reopens one station (the McGill block run later).
 */
export default function AssessmentWave({ bare = false, waveId, initialStation = null, onBack }) {
  const layout = useLayoutClass();
  const { data, loading, error } = useWave(waveId);
  const tracker = useSaveTracker();
  const [equipment, setEquipment] = useEquipment();
  const [windows, setWindows] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [index, setIndex] = useState(null);
  const [leaving, setLeaving] = useState(false);

  const { run } = tracker;
  useEffect(() => {
    if (windows || !data) return;
    const kept = pendingFor(data.athletes.map((a) => [a.athleteId, a.windowId]));
    const ws = Object.fromEntries(data.athletes.map((a) => [a.athleteId, a.window]));
    const ps = Object.fromEntries(data.athletes.map((a) => [a.athleteId, a.profile]));
    for (const k of kept) {
      if (k.kind === 'section') ws[k.athleteId] = { ...ws[k.athleteId], [k.section]: k.value };
      else if (k.kind === 'fields') ws[k.athleteId] = { ...ws[k.athleteId], ...k.value };
      else ps[k.athleteId] = { ...(ps[k.athleteId] || {}), ...k.value };
    }
    setWindows(ws);
    setProfiles(ps);
    for (const k of kept) run(trackerKey(k), () => send(k));
  }, [data, windows, run]);

  const athletes = data && windows ? data.athletes.map((a) => ({ ...a, window: windows[a.athleteId], profile: profiles[a.athleteId] ?? null })) : [];
  const stations = data ? stationsFor(data.circuitMode, data.athletes.map((a) => a.kind)).filter((s) => STATION_VIEWS[s.id]) : [];
  const at = index ?? Math.max(0, stations.findIndex((s) => s.id === initialStation));
  const station = stations[at] ?? null;

  const saveSectionOf = (athleteId, section, value) => {
    const windowId = windows[athleteId].id;
    setWindows((all) => ({ ...all, [athleteId]: { ...all[athleteId], [section]: value } }));
    const kept = keepPending({ kind: 'section', athleteId, windowId, section, value });
    tracker.run(`${athleteId}:${section}`, () => send(kept));
  };
  const saveProfileOf = (athleteId, patch) => {
    setProfiles((all) => ({ ...all, [athleteId]: { ...(all[athleteId] || {}), ...patch } }));
    const kept = keepPending({ kind: 'profile', athleteId, value: patch });
    tracker.run(`${athleteId}:profile`, () => send(kept, patch));
  };
  const saveFieldsOf = (athleteId, fields) => {
    const windowId = windows[athleteId].id;
    setWindows((all) => ({ ...all, [athleteId]: { ...all[athleteId], ...fields } }));
    const kept = keepPending({ kind: 'fields', athleteId, windowId, value: fields });
    tracker.run(`${athleteId}:fields`, () => send(kept, fields));
  };
  const markNotTested = (athleteId, keys, reason) => {
    const next = { ...(windows[athleteId].notTested || {}) };
    for (const k of keys) {
      if (reason) next[k] = reason;
      else delete next[k];
    }
    saveSectionOf(athleteId, 'notTested', next);
  };
  const leave = () => (tracker.unsaved ? setLeaving(true) : onBack());

  const header = (
    <div style={{ padding: '4px 22px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackLink onClick={leave}>‹ Assessments</BackLink>
        <div style={{ flex: 1 }} />
        <span style={{ font: `500 11px ${font.body}`, color: tracker.unsaved ? color.secondary : color.textTertiary }}>
          {tracker.unsaved ? `${tracker.unsaved} not saved yet` : 'All saved'}
        </span>
      </div>
      {data ? (
        <>
          <ScreenTitle size={21} style={{ marginTop: 8 }}>Wave · {shortDate(data.circuitDate)}</ScreenTitle>
          <Body size={12} style={{ marginTop: 3 }}>Protocol {data.protocolVersion} · {data.athletes.length} athlete{data.athletes.length === 1 ? '' : 's'}</Body>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {stations.map((s, i) => {
              const on = i === at;
              return (
                <button key={s.id} type="button" aria-pressed={on} onClick={() => setIndex(i)}
                  style={{ minHeight: 36, padding: '0 12px', borderRadius: radius.pill, border: `1px solid ${on ? color.primary : color.controlBorder}`, background: on ? color.primary : 'transparent', color: on ? '#000' : color.textSecondary, font: `${on ? 600 : 500} 12px ${font.body}` }}>
                  {i + 1} {s.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );

  const footer = station ? (
    <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '12px 22px 18px', display: 'flex', gap: 10 }}>
      <Button variant="outline" height={50} disabled={at === 0} style={{ boxShadow: 'none' }} onClick={() => setIndex(at - 1)}>‹ Previous station</Button>
      {at < stations.length - 1 ? (
        <Button height={50} onClick={() => setIndex(at + 1)}>Next station ›</Button>
      ) : (
        <Button height={50} onClick={leave}>Finish wave</Button>
      )}
    </div>
  ) : null;

  const View = station ? STATION_VIEWS[station.id] : null;
  return (
    <AssessmentFrame bare={bare} layout={layout} header={header} footer={footer}>
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && !windows ? <ErrorNotice>The wave didn't load. Check your connection and try again.</ErrorNotice> : null}
        {loading && !windows ? <Body size={12}>Loading the wave…</Body> : null}
        {!loading && !error && !data ? <Body size={13}>This wave was not found.</Body> : null}
        {station && View ? (
          <>
            <EquipmentCard equipment={equipment} onChange={setEquipment} />
            <StationShell
              station={station}
              athletes={athletes}
              layout={layout}
              order={View.rotation ? View.rotation(athletes, data.circuitMode) : null}
              entries={tracker.entries}
              onRetry={tracker.retry}
              onNotTested={markNotTested}
              renderAthlete={(a) => (
                <View.View athlete={a} equipment={equipment} circuitMode={data.circuitMode} onSave={saveSectionOf} onSaveProfile={saveProfileOf} onSaveFields={saveFieldsOf} />
              )}
            />
          </>
        ) : null}
      </div>
      {leaving ? (
        <CancelSheet
          title="Leave this wave?"
          summary={`${tracker.unsaved} ${tracker.unsaved === 1 ? 'entry has' : 'entries have'} not reached the server yet. If you leave now, ${tracker.unsaved === 1 ? 'it' : 'they'} may be lost.`}
          confirmLabel="Leave anyway"
          busyLabel="Leaving"
          keepLabel="Stay on the wave"
          onClose={() => setLeaving(false)}
          onConfirm={async () => {}}
          onCancelled={onBack}
        />
      ) : null}
    </AssessmentFrame>
  );
}
```

In `frontend/src/portal/AssessmentRoutes.js`, replace:

```js
import { Navigate, useNavigate } from 'react-router-dom';
```

with:

```js
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
```

then replace:

```js
const AssessmentList = lazy(loadAssessmentList);
```

with:

```js
const AssessmentList = lazy(loadAssessmentList);
export const loadAssessmentWave = () => import('./screens/AssessmentWave');
const AssessmentWave = lazy(loadAssessmentWave);
```

and append at the end of the file:

```js
/** /portal/assessments/wave/:waveId - navigation state `station` reopens one station (a McGill block run later). */
export function AssessmentWaveRoute() {
  const { waveId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  return <AssessmentWave bare waveId={waveId} initialStation={state?.station ?? null} onBack={() => navigate('/portal/assessments')} />;
}
```

In `frontend/src/portal/PortalRoutes.js`, replace:

```js
import { AssessmentListRoute, RequireAssessment, loadAssessmentList } from './AssessmentRoutes';
```

with:

```js
import { AssessmentListRoute, AssessmentWaveRoute, RequireAssessment, loadAssessmentList } from './AssessmentRoutes';
```

then replace:

```js
              <AssessmentListRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
```

with:

```js
              <AssessmentListRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
      <Route
        path="assessments/wave/:waveId"
        element={
          <RequireRole roles={['coach', 'mental', 'ops', 'owner']}>
            <RequireAssessment level="staff" landingFor={landingFor}>
              <AssessmentWaveRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AssessmentWave.test.js src/portal/components/assessments/StationShell.test.js src/portal/AssessmentRoutes.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/portal/screens/AssessmentWave.js frontend/src/portal/screens/AssessmentWave.test.js frontend/src/portal/components/assessments frontend/src/portal/AssessmentRoutes.js frontend/src/portal/AssessmentRoutes.test.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(assessments): the wave screen and readiness & intake

Fixed station order with the standard cues, not tested with reason codes
and a pain stop that ends the athlete's later stations, equipment
remembered on the tablet, phone / tablet / desktop layouts, a guard on
leaving with unsaved entries, and unsaved entries re-sent on reopening.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Anthropometrics and grip stations

**Files:**
- Create: `frontend/src/portal/components/assessments/testHarness.js` (test support, imported by station tests only)
- Create: `frontend/src/portal/components/assessments/AnthroStation.js`
- Create: `frontend/src/portal/components/assessments/GripStation.js`
- Modify: `frontend/src/portal/screens/AssessmentWave.js` (imports; `STATION_VIEWS`)
- Test: `frontend/src/portal/components/assessments/AnthroStation.test.js`, `frontend/src/portal/components/assessments/GripStation.test.js`, `frontend/src/portal/screens/AssessmentWave.test.js` (append)

**Interfaces:**
- Consumes: the station-view contract and `STATION_VIEWS` (Task 13); `TrialInput`, `Choice`, `FieldRow` (Tasks 11, 13); `anthroFinals`, `growthCm`, `GROWTH_FLAG_CM`, `gripScores` (Task 1); `setAt` (Task 3); `shortDate` (Task 2); `LETTERS` (Task 12); `EMPTY_EQUIPMENT` (Task 13).
- Produces:
  - `StationHarness({ View, athlete, equipment?, circuitMode?, saves: [] })` (test support: holds the window and profile, records every save as `[section|'profile'|'fields', value]`)
  - `AnthroStation` view, `EMPTY_ANTHRO`; `GripStation` view, `EMPTY_GRIP`, `gripRotation(athletes, circuitMode): string`
  - `STATION_VIEWS.anthro`, `STATION_VIEWS.grip`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/components/assessments/testHarness.js`:

```js
import React, { useState } from 'react';
import { EMPTY_EQUIPMENT } from './EquipmentCard';
import { DEFAULT_SETTINGS, circuitModeOf } from '../../data/assessmentSettings';

/**
 * Test support for the station views (never imported by the app): holds one
 * athlete's window and profile the way AssessmentWave does, and records
 * every save as [section | 'profile' | 'fields', value].
 */
export const MODE = circuitModeOf(DEFAULT_SETTINGS);

export function stationAthlete({ athleteId = 'a', name = 'Ava Moreno', position = 1, kind = 'baseline', window = {}, profile = null, prior = [] } = {}) {
  return { athleteId, name, position, kind, windowId: `2026-27-${kind}`, window: { id: `2026-27-${kind}`, athleteId, kind, season: '2026-27', status: 'open', circuitDate: '2026-11-03', circuitMode: MODE, enteredBy: {}, ...window }, profile, prior };
}

export function StationHarness({ View, athlete, equipment = {}, circuitMode = MODE, saves }) {
  const [w, setW] = useState(athlete.window);
  const [p, setP] = useState(athlete.profile);
  return (
    <View
      athlete={{ ...athlete, window: w, profile: p }}
      equipment={{ ...EMPTY_EQUIPMENT, ...equipment }}
      circuitMode={circuitMode}
      onSave={(id, section, value) => { saves.push([section, value]); setW((x) => ({ ...x, [section]: value })); }}
      onSaveProfile={(id, patch) => { saves.push(['profile', patch]); setP((x) => ({ ...(x || {}), ...patch })); }}
      onSaveFields={(id, fields) => { saves.push(['fields', fields]); setW((x) => ({ ...x, ...fields })); }}
    />
  );
}
```

Create `frontend/src/portal/components/assessments/AnthroStation.test.js`:

```js
import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import AnthroStation from './AnthroStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete, extra = {}) => {
  const saves = [];
  return renderScreen(<StationHarness View={AnthroStation} athlete={athlete} saves={saves} {...extra} />).then((r) => Object.assign(r, { saves }));
};

test('baseline: up to three measures each, the box from the equipment, the finals as they are entered', async () => {
  const r = await station(stationAthlete(), { equipment: { boxHeight: 40 } });
  await type(r, 'Ava Moreno standing height 1', '152.1');
  expect(r.saves[0]).toEqual(['anthro', { standing: [152.1, null, null], mass: [], boxHeight: 40, sittingRaw: [], arm: [], hand: [] }]);
  await type(r, 'Ava Moreno standing height 2', '152.3');
  await type(r, 'Ava Moreno body mass 1', '41.1');
  await type(r, 'Ava Moreno seated height 1', '118.0');
  await type(r, 'Ava Moreno seated height 2', '118.2');
  expect(r.text()).toContain('Standing 152.2 cm · mass 41.1 kg · sitting 78.1 cm · leg 74.1 cm');
  expect(field(r, 'Ava Moreno arm length 1')).toBeNull();
  await r.unmount();
});

test('a third seated measure is asked for when the first two differ by more than 0.4 cm', async () => {
  const r = await station(stationAthlete(), { equipment: { boxHeight: 40 } });
  await type(r, 'Ava Moreno seated height 1', '118.0');
  await type(r, 'Ava Moreno seated height 2', '118.6');
  expect(r.text()).toContain('take a third');
  await type(r, 'Ava Moreno seated height 3', '118.1');
  expect(r.text()).not.toContain('take a third');
  await r.unmount();
});

test('no box height: the seated measures are kept and the coach is told where the box goes', async () => {
  const r = await station(stationAthlete());
  expect(r.text()).toContain('Enter the sitting box height under Equipment.');
  await r.unmount();
});

test('mid-season: standing and mass, the growth check, and a repeat sitting measure offered only past 3 cm', async () => {
  const prior = [{ id: '2026-27-baseline', circuitDate: '2026-11-03', anthro: { standing: [152.2], sittingRaw: [118.1], boxHeight: 40 } }];
  const r = await station(stationAthlete({ kind: 'mid', prior }), { equipment: { boxHeight: 40 } });
  expect(field(r, 'Ava Moreno seated height 1')).toBeNull();
  await type(r, 'Ava Moreno standing height 1', '155.4');
  expect(r.text()).toContain('Standing height +3.2 cm since Nov 3. Over 3 cm: the sitting height on file is stale for the maturity offset.');
  await r.click('Measure sitting height again');
  expect(field(r, 'Ava Moreno seated height 1')).not.toBeNull();
  await r.unmount();
  const small = await station(stationAthlete({ kind: 'mid', prior }), { equipment: { boxHeight: 40 } });
  await type(small, 'Ava Moreno standing height 1', '153.0');
  expect(small.text()).toContain('Standing height +0.8 cm since Nov 3.');
  expect(small.button('Measure sitting height again')).toBeNull();
  await small.unmount();
});

test('segment measures appear only when the setting turns them on', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, stations: { ...MODE.stations, segments: true } } });
  expect(field(r, 'Ava Moreno arm length 1')).not.toBeNull();
  expect(field(r, 'Ava Moreno hand length 3')).not.toBeNull();
  await r.unmount();
});
```

Create `frontend/src/portal/components/assessments/GripStation.test.js`:

```js
import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import GripStation, { gripRotation } from './GripStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete, extra = {}) => {
  const saves = [];
  return renderScreen(<StationHarness View={GripStation} athlete={athlete} saves={saves} {...extra} />).then((r) => Object.assign(r, { saves }));
};

test('the rotation: pairs on two dynamometers, right then left, three rounds, the circuit rest interval', () => {
  const four = [1, 2, 3, 4].map((position) => ({ position }));
  expect(gripRotation(four, MODE)).toBe('Dynamometer 1: A right, A left, B right, B left · Dynamometer 2: C right, C left, D right, D left - 3 rounds. Rest 15-20 s between same-hand efforts (circuit rest interval).');
  expect(gripRotation(four.slice(0, 1), { ...MODE, trialCounts: { ...MODE.trialCounts, grip: 2 } })).toBe('Dynamometer 1: A right, A left - 2 rounds. Rest 15-20 s between same-hand efforts (circuit rest interval).');
});

test('a refused trial is never sent and never drops the trials beside it (Review Focus 3)', async () => {
  const r = await station(stationAthlete({ position: 3 }), { equipment: { dynamometer1: 'D-07', dynamometer2: 'D-09', handlePosition: '3' } });
  await type(r, 'Ava Moreno grip right 1', '24,5');
  expect(r.saves).toEqual([['grip', { right: [24.5, null, null], left: [], deviceRight: 'D-09', deviceLeft: 'D-09', handlePosition: '3', dominant: null }]]);
  await type(r, 'Ava Moreno grip right 2', '150');
  expect(r.text()).toContain('Grip is 0-100 kg');
  expect(r.saves).toHaveLength(1);
  await type(r, 'Ava Moreno grip right 2', '25.1');
  expect(r.saves[1][1].right).toEqual([24.5, 25.1, null]);
  await r.unmount();
});

test('the dominant hand goes on the window and the profile; the best per hand and per kilo show as trials come in', async () => {
  const r = await station(stationAthlete({ window: { anthro: { mass: [41.1] } } }));
  await r.click('Ava Moreno dominant hand: Right');
  expect(r.saves).toEqual([['grip', expect.objectContaining({ dominant: 'right' })], ['profile', { dominantHand: 'right' }]]);
  await type(r, 'Ava Moreno grip right 1', '25.1');
  await type(r, 'Ava Moreno grip left 1', '23.8');
  expect(r.text()).toContain('Best right 25.1 kg · left 23.8 kg · 0.61 kg/kg (circuit rest interval)');
  await r.unmount();
});

test('the trial count follows the circuit mode', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, trialCounts: { ...MODE.trialCounts, grip: 2 } } });
  expect(field(r, 'Ava Moreno grip right 2')).not.toBeNull();
  expect(field(r, 'Ava Moreno grip right 3')).toBeNull();
  await r.unmount();
});
```

Append to `frontend/src/portal/screens/AssessmentWave.test.js`:

```js
test('the wave offers anthropometrics and grip after intake, with the grip rotation', async () => {
  const r = await wave();
  expect(r.button('2 Anthropometrics')).not.toBeNull();
  await r.click('3 Grip');
  expect(r.text()).toContain('Squeeze as hard as you can. Go, go, go, relax.');
  expect(r.text()).toContain('Dynamometer 1: A right, A left, B right, B left');
  await r.unmount();
});

test('a pain stop at intake: the athlete is offered no anthropometrics or grip (safety)', async () => {
  const r = await wave();
  await r.click('Ava Moreno: pain, stop');
  expect(r.text()).toContain('Stopped for pain.');
  await r.click('2 Anthropometrics');
  expect(field(r, 'Ava Moreno standing height 1')).toBeNull();
  expect(field(r, 'Ben Ortiz standing height 1')).not.toBeNull();
  expect(r.text()).toContain('Not tested at readiness (Pain). Retest within 7 days.');
  await r.click('3 Grip');
  expect(field(r, 'Ava Moreno grip right 1')).toBeNull();
  await r.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/assessments/AnthroStation.test.js src/portal/components/assessments/GripStation.test.js src/portal/screens/AssessmentWave.test.js`
Expected: FAIL - "Cannot find module './AnthroStation'", "Cannot find module './GripStation'", and no button "2 Anthropometrics".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/components/assessments/AnthroStation.js`:

```js
import React, { useState } from 'react';
import { color } from '../../tokens';
import Button from '../Button';
import FieldRow from './FieldRow';
import TrialInput from './TrialInput';
import { Body } from '../Primitives';
import { GROWTH_FLAG_CM, anthroFinals, growthCm } from '../../data/assessmentScoring';
import { setAt } from '../../data/assessmentInput';
import { shortDate } from '../../data/assessmentWindows';

export const EMPTY_ANTHRO = { standing: [], mass: [], boxHeight: null, sittingRaw: [], arm: [], hand: [] };

/** The most recent earlier window with a standing height, for the growth check. */
function priorStanding(prior) {
  for (const w of [...(prior || [])].reverse()) {
    const standing = anthroFinals(w.anthro).standing;
    if (standing != null) return { standing, date: w.circuitDate };
  }
  return null;
}

/**
 * Station 2 - anthropometrics (protocol Section 3; spec 6). Standing height
 * and body mass every window, up to three measures, the final being the mean
 * of the closest two. Sitting height (on the box from the equipment) at
 * baseline and end, a third measure asked for when the first two differ by
 * more than 0.4 cm; arm and hand when the segments setting is on. Mid-season
 * runs the growth check against the last standing height: past 3 cm the
 * sitting height on file is stale and a repeat measure is offered.
 */
export default function AnthroStation({ athlete, equipment, circuitMode, onSave }) {
  const { athleteId, name, window: w } = athlete;
  const a = { ...EMPTY_ANTHRO, ...(w.anthro || {}) };
  const full = athlete.kind !== 'mid';
  const segments = full && circuitMode?.stations?.segments === true;
  const box = a.boxHeight ?? equipment.boxHeight ?? null;
  const finals = anthroFinals({ ...a, boxHeight: box });
  const prior = priorStanding(athlete.prior);
  const growth = prior ? growthCm(finals.standing, prior.standing) : null;
  const stale = !full && growth != null && growth > GROWTH_FLAG_CM;
  const [repeatSitting, setRepeatSitting] = useState(() => (a.sittingRaw || []).some((v) => v != null));
  const save = (field, i) => (v) => onSave(athleteId, 'anthro', { ...a, boxHeight: box, [field]: setAt(a[field], i, v, 3) });
  const trio = (field, rangeKey, text) => [0, 1, 2].map((i) => (
    <TrialInput key={i} label={`${name} ${text} ${i + 1}`} value={a[field]?.[i] ?? null} rangeKey={rangeKey} onCommit={save(field, i)} width={74} />
  ));
  const summary = [
    finals.standing != null ? `Standing ${finals.standing} cm` : null,
    finals.mass != null ? `mass ${finals.mass} kg` : null,
    finals.sitting != null ? `sitting ${finals.sitting} cm` : null,
    finals.legLength != null ? `leg ${finals.legLength} cm` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FieldRow label="Standing height (cm)">{trio('standing', 'standing', 'standing height')}</FieldRow>
      <FieldRow label="Body mass (kg)">{trio('mass', 'mass', 'body mass')}</FieldRow>
      {growth != null ? (
        <Body size={12} tone={stale ? color.secondary : color.textTertiary}>
          Standing height {growth >= 0 ? '+' : ''}{growth} cm since {shortDate(prior.date)}
          {stale ? '. Over 3 cm: the sitting height on file is stale for the maturity offset.' : '.'}
        </Body>
      ) : null}
      {stale && !repeatSitting ? (
        <Button variant="outline" height={40} style={{ boxShadow: 'none' }} onClick={() => setRepeatSitting(true)}>Measure sitting height again</Button>
      ) : null}
      {full || repeatSitting ? (
        <>
          <FieldRow label="Seated height on the box (cm)">{trio('sittingRaw', 'sittingRaw', 'seated height')}</FieldRow>
          {box == null ? <Body size={12} tone={color.secondary}>Enter the sitting box height under Equipment.</Body> : null}
          {finals.needsThirdSitting ? <Body size={12} tone={color.secondary}>The first two seated measures differ by more than 0.4 cm: take a third.</Body> : null}
        </>
      ) : null}
      {segments ? (
        <>
          <FieldRow label="Arm length (cm)">{trio('arm', 'arm', 'arm length')}</FieldRow>
          <FieldRow label="Hand length (cm)">{trio('hand', 'hand', 'hand length')}</FieldRow>
        </>
      ) : null}
      <Body size={12}>{summary || 'Final values appear as measures are entered.'}</Body>
    </div>
  );
}
```

Create `frontend/src/portal/components/assessments/GripStation.js`:

```js
import React from 'react';
import Choice from './Choice';
import FieldRow from './FieldRow';
import TrialInput from './TrialInput';
import { LETTERS } from './StartWaveSheet';
import { Body } from '../Primitives';
import { anthroFinals, gripScores } from '../../data/assessmentScoring';
import { setAt } from '../../data/assessmentInput';

export const EMPTY_GRIP = { right: [], left: [], deviceRight: null, deviceLeft: null, handlePosition: null, dominant: null };

/** The grip rotation (protocol Section 3): pairs A/B on dynamometer 1 and C/D on 2, right then left, N rounds. */
export function gripRotation(athletes, circuitMode) {
  const n = circuitMode?.trialCounts?.grip ?? 3;
  const rest = circuitMode?.gripRestSec ?? { min: 15, max: 20 };
  const pair = (list) => list.map((a) => `${LETTERS[a.position - 1]} right, ${LETTERS[a.position - 1]} left`).join(', ');
  const first = athletes.filter((a) => a.position <= 2);
  const second = athletes.filter((a) => a.position > 2);
  const devices = [first.length ? `Dynamometer 1: ${pair(first)}` : null, second.length ? `Dynamometer 2: ${pair(second)}` : null].filter(Boolean).join(' · ');
  return `${devices} - ${n} round${n === 1 ? '' : 's'}. Rest ${rest.min}-${rest.max} s between same-hand efforts (circuit rest interval).`;
}

/**
 * Station 3 - grip (protocol Section 3). Every trial per hand in kg; the
 * athlete's pair device and the handle position come from the equipment and
 * are kept on the window; the dominant hand is noted on the window and the
 * profile. Always flagged "circuit rest interval": the rest is 15-20 s, not
 * a fully rested 30 s.
 */
export default function GripStation({ athlete, equipment, circuitMode, onSave, onSaveProfile }) {
  const { athleteId, name, window: w } = athlete;
  const g = { ...EMPTY_GRIP, ...(w.grip || {}) };
  const n = circuitMode?.trialCounts?.grip ?? 3;
  const device = (athlete.position <= 2 ? equipment.dynamometer1 : equipment.dynamometer2) || null;
  const scores = gripScores(g, anthroFinals(w.anthro).mass);
  const base = () => ({ ...g, deviceRight: device ?? g.deviceRight, deviceLeft: device ?? g.deviceLeft, handlePosition: equipment.handlePosition ?? g.handlePosition });
  const save = (hand, i) => (v) => onSave(athleteId, 'grip', { ...base(), [hand]: setAt(g[hand], i, v, n) });
  const trials = (hand) => Array.from({ length: n }, (_, i) => (
    <TrialInput key={i} label={`${name} grip ${hand} ${i + 1}`} value={g[hand]?.[i] ?? null} rangeKey="grip" onCommit={save(hand, i)} width={74} />
  ));
  const best = [
    scores.bestRight != null ? `Best right ${scores.bestRight} kg` : null,
    scores.bestLeft != null ? `left ${scores.bestLeft} kg` : null,
    scores.relativeBest != null ? `${scores.relativeBest} kg/kg` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <FieldRow label="Right (kg)">{trials('right')}</FieldRow>
      <FieldRow label="Left (kg)">{trials('left')}</FieldRow>
      <Choice label={`${name} dominant hand`} value={g.dominant ?? athlete.profile?.dominantHand ?? null} options={[['right', 'Right'], ['left', 'Left']]}
        onChange={(dominant) => {
          onSave(athleteId, 'grip', { ...base(), dominant });
          if (dominant) onSaveProfile(athleteId, { dominantHand: dominant });
        }} />
      <Body size={12}>Device {device || g.deviceRight || 'not set'} · handle {equipment.handlePosition || g.handlePosition || 'not set'}</Body>
      {best ? <Body size={12}>{best} (circuit rest interval)</Body> : null}
    </div>
  );
}
```

In `frontend/src/portal/screens/AssessmentWave.js`, replace:

```js
import IntakeStation from '../components/assessments/IntakeStation';
```

with:

```js
import IntakeStation from '../components/assessments/IntakeStation';
import AnthroStation from '../components/assessments/AnthroStation';
import GripStation, { gripRotation } from '../components/assessments/GripStation';
```

then replace:

```js
export const STATION_VIEWS = {
  intake: { View: IntakeStation },
};
```

with:

```js
export const STATION_VIEWS = {
  intake: { View: IntakeStation },
  anthro: { View: AnthroStation },
  grip: { View: GripStation, rotation: gripRotation },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/assessments/AnthroStation.test.js src/portal/components/assessments/GripStation.test.js src/portal/screens/AssessmentWave.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/components/assessments frontend/src/portal/screens/AssessmentWave.js frontend/src/portal/screens/AssessmentWave.test.js
git commit -m "feat(assessments): anthropometrics and grip stations

Closest-two measures with the third-seated prompt, the growth check and a
repeat sitting measure past 3 cm; grip in rotation on paired dynamometers
with the circuit rest interval noted.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Jump (CMJ, then 10/5) and med ball stations

**Files:**
- Create: `frontend/src/portal/components/assessments/JumpStation.js`
- Create: `frontend/src/portal/components/assessments/MedballStation.js`
- Modify: `frontend/src/portal/screens/AssessmentWave.js` (imports; `STATION_VIEWS`)
- Test: `frontend/src/portal/components/assessments/JumpStation.test.js`, `frontend/src/portal/components/assessments/MedballStation.test.js`, `frontend/src/portal/screens/AssessmentWave.test.js` (append)

**Interfaces:**
- Consumes: the station-view contract (Task 13); `StationHarness`, `stationAthlete`, `MODE` (Task 14); `cmjScores`, `hopScores`, `hopSet`, `medballScores`, `anthroFinals` (Task 1); `medballMassFor` (Task 2); `setAt` (Task 3); `LETTERS` (Task 12).
- Produces: `JumpStation` view, `EMPTY_CMJ`, `EMPTY_TRIAL`, `jumpRotation(athletes, circuitMode)`; `MedballStation` view, `medballRotation(athletes, circuitMode)`; `STATION_VIEWS.jump`, `STATION_VIEWS.medball`. CMJ is written as `{ trials: [trial|null x scored], software, samplingHz }`; 10/5 as `{ sets: [{ rsiBest5, gctMs } | { hopRsi: [x10], hopGctMs: [x10] } | null] }`; med ball as `{ massKg, side, method, throws }`, with the profile's season method and mass set on the first throw.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/components/assessments/JumpStation.test.js`:

```js
import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import JumpStation, { jumpRotation } from './JumpStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete, extra = {}) => {
  const saves = [];
  return renderScreen(<StationHarness View={JumpStation} athlete={athlete} saves={saves} {...extra} />).then((r) => Object.assign(r, { saves }));
};
const last = (r, section) => r.saves.filter(([s]) => s === section).pop()[1];

test('the rotation: practice, scored jumps in rotation, then the 10/5 sets', () => {
  expect(jumpRotation([{ position: 1 }, { position: 2 }], MODE)).toBe('CMJ: 1 practice, then 2 scored, in rotation (A, B) - everyone jumps before anyone repeats. 10/5: 1 practice set, then 2 scored sets of 10.');
});

test('CMJ with RSImod typed from Smart2Move: each trial saves with the plate software and rate', async () => {
  const r = await station(stationAthlete({ window: { anthro: { mass: [41.1] } } }), { equipment: { plateSoftware: 'Smart2Move 4.2', samplingHz: 1000 } });
  expect(field(r, 'Ava Moreno CMJ 1 time to take-off (ms)')).toBeNull();
  await type(r, 'Ava Moreno CMJ 1 height (cm)', '31.2');
  expect(last(r, 'cmj')).toEqual({ trials: [{ heightCm: 31.2, rsiMod: null, timeToTakeoffMs: null, peakPowerW: null, peakPowerWkg: null, asymmetryPct: null }, null], software: 'Smart2Move 4.2', samplingHz: 1000 });
  await type(r, 'Ava Moreno CMJ 1 RSImod', '0.41');
  await type(r, 'Ava Moreno CMJ 2 height (cm)', '32.0');
  await type(r, 'Ava Moreno CMJ 2 peak power (W)', '2150');
  expect(r.text()).toContain('Best CMJ 32 cm · RSImod 0.41 · 2150 W · 52.3 W/kg');
  await type(r, 'Ava Moreno CMJ 1 RSImod', '2.5');
  expect(r.text()).toContain('RSImod is 0-2');
  await r.unmount();
});

test('CMJ with RSImod computed: time to take-off is typed instead and RSImod follows', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, rsiModEntry: 'computed' } });
  expect(field(r, 'Ava Moreno CMJ 1 RSImod')).toBeNull();
  await type(r, 'Ava Moreno CMJ 1 height (cm)', '35');
  await type(r, 'Ava Moreno CMJ 1 time to take-off (ms)', '800');
  expect(r.text()).toContain('RSImod 0.44');
  await r.unmount();
});

test('10/5 per set: a set over 250 ms contact is flagged and not reported', async () => {
  const r = await station(stationAthlete());
  await type(r, 'Ava Moreno 10/5 set 1 RSI best 5', '2.31');
  await type(r, 'Ava Moreno 10/5 set 1 contact time (ms)', '198');
  await type(r, 'Ava Moreno 10/5 set 2 RSI best 5', '2.45');
  await type(r, 'Ava Moreno 10/5 set 2 contact time (ms)', '262');
  expect(last(r, 'hop')).toEqual({ sets: [{ rsiBest5: 2.31, gctMs: 198 }, { rsiBest5: 2.45, gctMs: 262 }] });
  expect(r.text()).toContain('Set 2: contact time 262 ms is over 250 ms. Coach the pattern; this set is not reported.');
  expect(r.text()).toContain('Best 10/5 RSI 2.31');
  await r.unmount();
});

test('10/5 every hop: ten RSIs and contact times per set, scored as the best five', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, hopEntry: 'per-hop' } });
  await type(r, 'Ava Moreno 10/5 set 1 hop 1 RSI', '2.1');
  expect(last(r, 'hop')).toEqual({ sets: [{ hopRsi: [2.1, null, null, null, null, null, null, null, null, null], hopGctMs: [] }, null] });
  for (const [i, v] of [[2, '2.3'], [3, '1.9'], [4, '2.4'], [5, '2.2']]) await type(r, `Ava Moreno 10/5 set 1 hop ${i} RSI`, v);
  for (const i of [1, 2, 3, 4, 5]) await type(r, `Ava Moreno 10/5 set 1 hop ${i} contact time (ms)`, '200');
  expect(r.text()).toContain('Best 10/5 RSI 2.18');
  expect(field(r, 'Ava Moreno 10/5 set 2 hop 10 RSI')).not.toBeNull();
  await r.unmount();
});

test('a circuit with the 10/5 switched off in settings shows only the CMJ', async () => {
  const r = await station(stationAthlete(), { circuitMode: { ...MODE, stations: { ...MODE.stations, hop: false } } });
  expect(field(r, 'Ava Moreno CMJ 1 height (cm)')).not.toBeNull();
  expect(field(r, 'Ava Moreno 10/5 set 1 RSI best 5')).toBeNull();
  await r.unmount();
});
```

Create `frontend/src/portal/components/assessments/MedballStation.test.js`:

```js
import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import MedballStation, { medballRotation } from './MedballStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete, extra = {}) => {
  const saves = [];
  return renderScreen(<StationHarness View={MedballStation} athlete={athlete} saves={saves} {...extra} />).then((r) => Object.assign(r, { saves }));
};

test('the rotation names the side and the trials', () => {
  expect(medballRotation([{ position: 1 }, { position: 2 }], MODE)).toBe('Alternate athletes (A, B): 1 practice, then 3 scored throws each, trail side only. Ball starts at the back hip; feet may pivot but not step.');
});

test('the first test of the season assigns the ball by body mass and fixes the method on the profile', async () => {
  const r = await station(stationAthlete({ window: { anthro: { mass: [41.1] } }, profile: { athleteId: 'a', season: '2026-27' } }), { equipment: { radarMethod: 'speed' } });
  expect(r.text()).toContain('Suggested by body mass: 2 kg');
  await type(r, 'Ava Moreno throw 1 (mph)', '28.4');
  expect(r.saves).toEqual([
    ['medball', { massKg: 2, side: 'trail', method: 'speed', throws: [28.4, null, null] }],
    ['profile', { medballMethod: 'speed', medballMassKg: 2, season: '2026-27' }],
  ]);
  await type(r, 'Ava Moreno throw 2 (mph)', '29.1');
  expect(r.saves.filter(([s]) => s === 'profile')).toHaveLength(1);
  expect(r.text()).toContain('Best throw 29.1 mph · 2 kg · trail side');
  await r.unmount();
});

test("this season's method and ball are kept; mixing methods is blocked (Phil)", async () => {
  const profile = { athleteId: 'a', season: '2026-27', medballMethod: 'speed', medballMassKg: 3 };
  const r = await station(stationAthlete({ profile }), { equipment: { radarMethod: 'distance' } });
  expect(r.text()).toContain("Ava Moreno's season method is radar speed; mixing methods is blocked.");
  expect(r.text()).toContain('Ball: 3 kg, assigned at the first test and kept all season.');
  await type(r, 'Ava Moreno throw 1 (mph)', '30');
  expect(r.saves).toEqual([['medball', { massKg: 3, side: 'trail', method: 'speed', throws: [30, null, null] }]]);
  await r.unmount();
});

test('by distance the range is metres, and a ball can be picked when body mass is missing', async () => {
  const r = await station(stationAthlete({ profile: { athleteId: 'a', season: '2026-27' } }), { equipment: { radarMethod: 'distance' } });
  expect(r.text()).toContain('Measure body mass first, or pick a ball.');
  await r.click('Ava Moreno ball: 4 kg');
  await type(r, 'Ava Moreno throw 1 (m)', '30');
  expect(r.text()).toContain('Throw distance is 0-25 m');
  await type(r, 'Ava Moreno throw 1 (m)', '6.4');
  expect(r.saves[0]).toEqual(['medball', { massKg: 4, side: 'trail', method: 'distance', throws: [6.4, null, null] }]);
  await r.unmount();
});
```

Append to `frontend/src/portal/screens/AssessmentWave.test.js`:

```js
test('the wave offers CMJ then 10/5, and the med ball, in order', async () => {
  const r = await wave();
  expect(r.button('4 CMJ, then 10/5')).not.toBeNull();
  await r.click('5 Med ball');
  expect(r.text()).toContain('Push the ground and throw it through the wall.');
  await r.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/assessments/JumpStation.test.js src/portal/components/assessments/MedballStation.test.js src/portal/screens/AssessmentWave.test.js`
Expected: FAIL - "Cannot find module './JumpStation'", "Cannot find module './MedballStation'", and no button "4 CMJ, then 10/5".

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/components/assessments/JumpStation.js`:

```js
import React from 'react';
import { color } from '../../tokens';
import FieldRow from './FieldRow';
import TrialInput from './TrialInput';
import { LETTERS } from './StartWaveSheet';
import { Body, SectionLabel } from '../Primitives';
import { anthroFinals, cmjScores, hopScores } from '../../data/assessmentScoring';
import { setAt } from '../../data/assessmentInput';

export const EMPTY_CMJ = { trials: [], software: null, samplingHz: null };
export const EMPTY_TRIAL = { heightCm: null, rsiMod: null, timeToTakeoffMs: null, peakPowerW: null, peakPowerWkg: null, asymmetryPct: null };
const HOPS = 10;

/** Station 4's order line (protocol Section 3). */
export function jumpRotation(athletes, circuitMode) {
  const c = circuitMode?.trialCounts ?? {};
  const order = athletes.map((a) => LETTERS[a.position - 1]).join(', ');
  return `CMJ: ${c.cmjPractice ?? 1} practice, then ${c.cmjScored ?? 2} scored, in rotation (${order}) - everyone jumps before anyone repeats. 10/5: ${c.hopPractice ?? 1} practice set, then ${c.hopScored ?? 2} scored sets of 10.`;
}

/**
 * Station 4 - CMJ, then 10/5, on the force plates (protocol Section 3). The
 * values Smart2Move shows are typed per scored trial (spec decision 3); the
 * practice jump and set are not recorded. RSImod is typed, or computed from
 * height and time to take-off (the rsiModEntry setting); the 10/5 set is the
 * per-set summary or every hop (the hopEntry setting). A set whose contact
 * time is over 250 ms is flagged and not reported. Asymmetry and contact time
 * are coach-only values. A circuit with the CMJ or the 10/5 switched off in
 * settings shows only the other.
 */
export default function JumpStation({ athlete, equipment, circuitMode, onSave }) {
  const { athleteId, name, window: w } = athlete;
  const cmj = { ...EMPTY_CMJ, ...(w.cmj || {}) };
  const hop = { sets: [], ...(w.hop || {}) };
  const scored = circuitMode?.trialCounts?.cmjScored ?? 2;
  const setCount = circuitMode?.trialCounts?.hopScored ?? 2;
  const computed = circuitMode?.rsiModEntry === 'computed';
  const everyHop = circuitMode?.hopEntry === 'per-hop';
  const showCmj = circuitMode?.stations?.cmj !== false;
  const showHop = circuitMode?.stations?.hop !== false;
  const cmjBest = cmjScores(cmj, { rsiModEntry: circuitMode?.rsiModEntry, massKg: anthroFinals(w.anthro).mass });
  const hopBest = hopScores(hop, { hopEntry: circuitMode?.hopEntry });

  const fields = [
    ['heightCm', 'cmjHeight', 'height (cm)'],
    computed ? ['timeToTakeoffMs', 'timeToTakeoffMs', 'time to take-off (ms)'] : ['rsiMod', 'rsiMod', 'RSImod'],
    ['peakPowerW', 'peakPowerW', 'peak power (W)'],
    ['peakPowerWkg', 'peakPowerWkg', 'peak power (W/kg)'],
    ['asymmetryPct', 'asymmetryPct', 'L/R asymmetry (%)'],
  ];
  const saveTrial = (i, field) => (v) => {
    const trial = { ...EMPTY_TRIAL, ...(cmj.trials[i] || {}), [field]: v };
    onSave(athleteId, 'cmj', { trials: setAt(cmj.trials, i, trial, scored), software: equipment.plateSoftware ?? cmj.software, samplingHz: equipment.samplingHz ?? cmj.samplingHz });
  };
  const saveSet = (s, next) => onSave(athleteId, 'hop', { sets: setAt(hop.sets, s, next, setCount) });
  const summaryOf = (s) => (hop.sets[s] && !Array.isArray(hop.sets[s].hopRsi) ? hop.sets[s] : {});
  const hopsOf = (s) => (hop.sets[s] && Array.isArray(hop.sets[s].hopRsi) ? hop.sets[s] : { hopRsi: [], hopGctMs: [] });

  const cmjLine = [
    cmjBest.bestHeight != null ? `Best CMJ ${cmjBest.bestHeight} cm` : null,
    cmjBest.bestRsiMod != null ? `RSImod ${cmjBest.bestRsiMod}` : null,
    cmjBest.bestPeakW != null ? `${cmjBest.bestPeakW} W` : null,
    cmjBest.bestPeakWkg != null ? `${cmjBest.bestPeakWkg} W/kg` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {showCmj ? <SectionLabel>CMJ</SectionLabel> : null}
      {showCmj && Array.from({ length: scored }, (_, i) => (
        <FieldRow key={i} label={`Jump ${i + 1}`}>
          {fields.map(([field, rangeKey, text]) => (
            <TrialInput key={field} label={`${name} CMJ ${i + 1} ${text}`} value={cmj.trials[i]?.[field] ?? null} rangeKey={rangeKey} onCommit={saveTrial(i, field)} width={78} />
          ))}
        </FieldRow>
      ))}
      {showCmj && cmjLine ? <Body size={12}>{cmjLine}</Body> : null}
      {showHop ? <SectionLabel style={{ marginTop: 6 }}>10/5 repeated hop</SectionLabel> : null}
      {showHop && Array.from({ length: setCount }, (_, s) => (
        <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {everyHop ? (
            Array.from({ length: HOPS }, (__, h) => (
              <FieldRow key={h} label={`Set ${s + 1}, hop ${h + 1}`}>
                {[['hopRsi', 'rsi', 'RSI'], ['hopGctMs', 'gctMs', 'contact time (ms)']].map(([field, rangeKey, text]) => (
                  <TrialInput key={field} label={`${name} 10/5 set ${s + 1} hop ${h + 1} ${text}`} value={hopsOf(s)[field]?.[h] ?? null} rangeKey={rangeKey} width={78}
                    onCommit={(v) => { const cur = hopsOf(s); saveSet(s, { hopRsi: cur.hopRsi ?? [], hopGctMs: cur.hopGctMs ?? [], [field]: setAt(cur[field], h, v, HOPS) }); }} />
                ))}
              </FieldRow>
            ))
          ) : (
            <FieldRow label={`Set ${s + 1}`}>
              {[['rsiBest5', 'rsi', 'RSI best 5'], ['gctMs', 'gctMs', 'contact time (ms)']].map(([field, rangeKey, text]) => (
                <TrialInput key={field} label={`${name} 10/5 set ${s + 1} ${text}`} value={summaryOf(s)[field] ?? null} rangeKey={rangeKey} width={78}
                  onCommit={(v) => { const cur = summaryOf(s); saveSet(s, { rsiBest5: cur.rsiBest5 ?? null, gctMs: cur.gctMs ?? null, [field]: v }); }} />
              ))}
            </FieldRow>
          )}
          {hopBest.sets[s]?.flagged ? (
            <Body size={12} tone={color.secondary}>Set {s + 1}: contact time {hopBest.sets[s].gctMs} ms is over 250 ms. Coach the pattern; this set is not reported.</Body>
          ) : null}
        </div>
      ))}
      {showHop && hopBest.best != null ? <Body size={12}>Best 10/5 RSI {hopBest.best}</Body> : null}
    </div>
  );
}
```

Create `frontend/src/portal/components/assessments/MedballStation.js`:

```js
import React, { useState } from 'react';
import { color } from '../../tokens';
import Choice from './Choice';
import FieldRow from './FieldRow';
import TrialInput from './TrialInput';
import { LETTERS } from './StartWaveSheet';
import { Body } from '../Primitives';
import { anthroFinals, medballScores } from '../../data/assessmentScoring';
import { medballMassFor } from '../../data/assessmentSettings';
import { setAt } from '../../data/assessmentInput';

const METHOD_LABEL = { speed: 'radar speed', distance: 'throw distance' };

/** Station 5's order line (protocol Section 3). */
export function medballRotation(athletes, circuitMode) {
  const c = circuitMode?.trialCounts ?? {};
  const side = circuitMode?.medballSide === 'dominant' ? 'dominant side' : 'trail side';
  return `Alternate athletes (${athletes.map((a) => LETTERS[a.position - 1]).join(', ')}): ${c.medballPractice ?? 1} practice, then ${c.medballScored ?? 3} scored throws each, ${side} only. Ball starts at the back hip; feet may pivot but not step.`;
}

/**
 * Station 5 - rotational med ball (protocol Section 3). The ball is assigned
 * at the athlete's first test of the season by body mass (under 45 kg 2 kg,
 * 45-65 kg 3 kg, over 65 kg 4 kg) and kept all season; the method (radar
 * speed or throw distance) is fixed for the season too - "block mixing". The
 * first throw records both on the profile; firestore.rules refuses the other
 * method or another ball for the rest of the season.
 */
export default function MedballStation({ athlete, equipment, circuitMode, onSave, onSaveProfile }) {
  const { athleteId, name, window: w } = athlete;
  const m = w.medball || {};
  const p = athlete.profile || {};
  const sameSeason = p.season === w.season;
  const lockedMethod = sameSeason ? p.medballMethod ?? null : null;
  const lockedMass = sameSeason ? p.medballMassKg ?? null : null;
  const method = lockedMethod ?? m.method ?? equipment.radarMethod ?? 'speed';
  const suggested = medballMassFor(anthroFinals(w.anthro).mass);
  const [picked, setPicked] = useState(null);
  const mass = lockedMass ?? m.massKg ?? picked ?? suggested;
  const n = circuitMode?.trialCounts?.medballScored ?? 3;
  const side = circuitMode?.medballSide ?? 'trail';
  const unit = method === 'distance' ? 'm' : 'mph';
  const best = medballScores({ ...m, method }).best;

  const save = (i) => (v) => {
    onSave(athleteId, 'medball', { massKg: mass, side, method, throws: setAt(m.throws, i, v, n) });
    if (!lockedMethod || (mass != null && lockedMass == null)) onSaveProfile(athleteId, { medballMethod: method, medballMassKg: mass, season: w.season });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lockedMethod && equipment.radarMethod && equipment.radarMethod !== lockedMethod ? (
        <Body size={12} tone={color.secondary}>{name}'s season method is {METHOD_LABEL[lockedMethod]}; mixing methods is blocked.</Body>
      ) : null}
      {lockedMass ? (
        <Body size={12}>Ball: {lockedMass} kg, assigned at the first test and kept all season.</Body>
      ) : (
        <>
          <Choice label={`${name} ball`} value={mass} options={[[2, '2 kg'], [3, '3 kg'], [4, '4 kg']]} onChange={setPicked} />
          <Body size={11} tone={color.textTertiary}>{suggested ? `Suggested by body mass: ${suggested} kg` : 'Measure body mass first, or pick a ball.'}</Body>
        </>
      )}
      <FieldRow label={`Scored throws (${unit})`}>
        {Array.from({ length: n }, (_, i) => (
          <TrialInput key={`${method}-${i}`} label={`${name} throw ${i + 1} (${unit})`} value={m.method === method ? m.throws?.[i] ?? null : null}
            rangeKey={method === 'distance' ? 'medballDistance' : 'medballSpeed'} onCommit={save(i)} width={78} />
        ))}
      </FieldRow>
      {best != null ? <Body size={12}>Best throw {best} {unit} · {mass ?? '?'} kg · {side} side</Body> : null}
    </div>
  );
}
```

In `frontend/src/portal/screens/AssessmentWave.js`, replace:

```js
import GripStation, { gripRotation } from '../components/assessments/GripStation';
```

with:

```js
import GripStation, { gripRotation } from '../components/assessments/GripStation';
import JumpStation, { jumpRotation } from '../components/assessments/JumpStation';
import MedballStation, { medballRotation } from '../components/assessments/MedballStation';
```

then replace:

```js
  grip: { View: GripStation, rotation: gripRotation },
};
```

with:

```js
  grip: { View: GripStation, rotation: gripRotation },
  jump: { View: JumpStation, rotation: jumpRotation },
  medball: { View: MedballStation, rotation: medballRotation },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/assessments/JumpStation.test.js src/portal/components/assessments/MedballStation.test.js src/portal/screens/AssessmentWave.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/components/assessments frontend/src/portal/screens/AssessmentWave.js frontend/src/portal/screens/AssessmentWave.test.js
git commit -m "feat(assessments): CMJ, 10/5 and med ball stations

Smart2Move values typed per scored trial with RSImod typed or computed,
10/5 per set or every hop with the 250 ms flag, and the med ball's season
ball and method fixed at the first throw.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: McGill station and the hold timer

**Files:**
- Create: `frontend/src/portal/components/assessments/HoldTimer.js`
- Create: `frontend/src/portal/components/assessments/McGillStation.js`
- Modify: `frontend/src/portal/screens/AssessmentWave.js` (import; `STATION_VIEWS`)
- Test: `frontend/src/portal/components/assessments/HoldTimer.test.js`, `frontend/src/portal/components/assessments/McGillStation.test.js`, `frontend/src/portal/screens/AssessmentWave.test.js` (append)

**Interfaces:**
- Consumes: the station-view contract (Task 13); `StationHarness`, `stationAthlete`, `MODE` (Task 14); `CAP_SECONDS`, `round`, `holdLabel`, `mcgillScores` (Task 1); `MCGILL_WINDOW_DAYS`, `daysBetween`, `shortDate`, `toISODate` (Task 2); `TrialInput` (Task 11); `LETTERS` (Task 12); `AssessmentWave`'s `initialStation` prop (Task 13).
- Produces: `HoldTimer({ label, value, onCommit, disabled })` and `TICK_MS`; `McGillStation` view, `EMPTY_MCGILL`, `HOLDS` (`[key, name]` in protocol order), `mcgillRotation(athletes, circuitMode)`; `STATION_VIEWS.mcgill`. The McGill section is written as `{ flexorSec, extensorSec, sideRightSec, sideLeftSec, skippedBackPain }`; the window's `mcgillDate` is set (once) to the academy date of the first hold saved, so Task 17 can flag a block run more than 14 days after the circuit.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/components/assessments/HoldTimer.test.js`:

```js
import React, { act, useState } from 'react';
import { renderScreen } from '../../screens/testRender';
import HoldTimer from './HoldTimer';

let commits;
function Host({ initial = null }) {
  const [value, setValue] = useState(initial);
  return <HoldTimer label="Ava Moreno trunk flexor" value={value} onCommit={(v) => { commits.push(v); setValue(v); }} />;
}

beforeEach(() => {
  commits = [];
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-03T16:00:00Z'));
});
afterEach(() => { jest.useRealTimers(); });

test('start, then stop: the hold is the time between, to 0.1 s', async () => {
  const r = await renderScreen(<Host />);
  expect(r.text()).toContain('-');
  await r.click('Ava Moreno trunk flexor: start');
  await act(async () => { jest.advanceTimersByTime(62400); });
  expect(r.text()).toContain('62 s');
  await r.click('Ava Moreno trunk flexor: stop');
  expect(commits).toEqual([62.4]);
  expect(r.text()).toContain('62.4 s');
  expect(r.button('Time again')).not.toBeNull();
  await r.unmount();
});

test('a tablet that sleeps mid-hold loses no time: the hold is measured from the clock, not the ticks', async () => {
  const r = await renderScreen(<Host />);
  await r.click('Ava Moreno trunk flexor: start');
  jest.setSystemTime(new Date('2026-11-03T16:01:30Z'));
  await r.click('Ava Moreno trunk flexor: stop');
  expect(commits).toEqual([90]);
  await r.unmount();
});

test('the hold stops itself at 300 s and reads "300+ (capped)"', async () => {
  const r = await renderScreen(<Host />);
  await r.click('Ava Moreno trunk flexor: start');
  await act(async () => { jest.advanceTimersByTime(301000); });
  expect(commits).toEqual([300]);
  expect(r.text()).toContain('300+ (capped)');
  expect(r.button('Ava Moreno trunk flexor: stop')).toBeNull();
  await r.unmount();
});

test('a stopwatch time can be typed instead, within 0-300 s', async () => {
  const r = await renderScreen(<Host />);
  await r.fill('Ava Moreno trunk flexor (s)', '75');
  await act(async () => { r.container.querySelector('[aria-label="Ava Moreno trunk flexor (s)"]').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(commits).toEqual([75]);
  expect(r.text()).toContain('75 s');
  await r.unmount();
});
```

Create `frontend/src/portal/components/assessments/McGillStation.test.js`:

```js
import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import McGillStation, { mcgillRotation } from './McGillStation';
import { MODE, StationHarness, stationAthlete } from './testHarness';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const station = (athlete) => {
  const saves = [];
  return renderScreen(<StationHarness View={McGillStation} athlete={athlete} saves={saves} />).then((r) => Object.assign(r, { saves }));
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-03T16:00:00Z'));
});
afterEach(() => { jest.useRealTimers(); });

test('the order line, and the note when McGill runs as its own block', () => {
  const two = [{ position: 1 }, { position: 2 }];
  expect(mcgillRotation(two, MODE)).toBe('Each athlete in turn (A, B): trunk flexor, trunk extensor, right side bridge, left side bridge.');
  expect(mcgillRotation(two, { ...MODE, mcgillMode: 'separate' })).toContain('runs McGill as its own block within 14 days');
});

test('the four holds in protocol order; the first hold saved dates the McGill', async () => {
  const r = await station(stationAthlete());
  const starts = [...r.container.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')).filter((l) => l && l.endsWith(': start'));
  expect(starts).toEqual(['Ava Moreno trunk flexor: start', 'Ava Moreno trunk extensor: start', 'Ava Moreno right side bridge: start', 'Ava Moreno left side bridge: start']);
  await r.click('Ava Moreno trunk flexor: start');
  await act(async () => { jest.advanceTimersByTime(120000); });
  await r.click('Ava Moreno trunk flexor: stop');
  expect(r.saves).toEqual([
    ['mcgill', { flexorSec: 120, extensorSec: null, sideRightSec: null, sideLeftSec: null, skippedBackPain: false }],
    ['fields', { mcgillDate: '2026-11-03' }],
  ]);
  await type(r, 'Ava Moreno trunk extensor (s)', '100');
  expect(r.saves.filter(([s]) => s === 'fields')).toHaveLength(1);
  await r.unmount();
});

test('the ratios, flagged as the protocol says, and a capped hold marks its ratios capped', async () => {
  const r = await station(stationAthlete({ window: { mcgill: { flexorSec: 120, extensorSec: 100, sideRightSec: 60, sideLeftSec: 70, skippedBackPain: false }, mcgillDate: '2026-11-03' } }));
  expect(r.text()).toContain('Flexion:extension 1.2 - flag · Right:left 0.86 - flag · Right side:extension 0.6 · Left side:extension 0.7');
  await type(r, 'Ava Moreno trunk extensor (s)', '300');
  expect(r.text()).toContain('300+ (capped)');
  expect(r.text()).toContain('Flexion:extension 0.4 (capped)');
  await r.unmount();
});

test('back pain skips the McGill, and the skip can be undone', async () => {
  const r = await station(stationAthlete());
  await r.click('Ava Moreno: skip, back pain');
  expect(r.saves[0]).toEqual(['mcgill', { flexorSec: null, extensorSec: null, sideRightSec: null, sideLeftSec: null, skippedBackPain: true }]);
  expect(r.text()).toContain('Skipped: back pain. No holds are taken.');
  expect(r.button('Ava Moreno trunk flexor: start')).toBeNull();
  await r.click('Undo skip');
  expect(r.saves.pop()).toEqual(['mcgill', { flexorSec: null, extensorSec: null, sideRightSec: null, sideLeftSec: null, skippedBackPain: false }]);
  await r.unmount();
});

test('a block run more than 14 days after the circuit is warned about, not refused', async () => {
  jest.setSystemTime(new Date('2026-11-20T16:00:00Z'));
  const r = await station(stationAthlete());
  expect(r.text()).toContain('17 days after the circuit (Nov 3). McGill is due within 14 days; this result will be flagged.');
  await type(r, 'Ava Moreno trunk flexor (s)', '88');
  expect(r.saves[1]).toEqual(['fields', { mcgillDate: '2026-11-20' }]);
  await r.unmount();
});

test('a mid-season athlete in a mixed wave is not asked for McGill', async () => {
  const r = await station(stationAthlete({ kind: 'mid' }));
  expect(r.text()).toContain('McGill runs at baseline and end of season only.');
  expect(r.button('Ava Moreno trunk flexor: start')).toBeNull();
  await r.unmount();
});
```

Append to `frontend/src/portal/screens/AssessmentWave.test.js`:

```js
test('McGill is the sixth and last station of a baseline wave; a block run later opens on it', async () => {
  const r = await wave({ initialStation: 'mcgill' });
  expect(r.button('6 McGill').getAttribute('aria-pressed')).toBe('true');
  expect(r.text()).toContain('Stop every hold at 300 s.');
  expect(r.button('Finish wave')).not.toBeNull();
  await r.unmount();
});

test('a wave of mid-season athletes has no McGill', async () => {
  mockWave = { ...mockWave, athletes: [athlete('a', 'Ava Moreno', 1, { kind: 'mid' })] };
  const r = await wave();
  expect(r.button('6 McGill')).toBeNull();
  expect(r.button('5 Med ball')).not.toBeNull();
  await r.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/assessments/HoldTimer.test.js src/portal/components/assessments/McGillStation.test.js src/portal/screens/AssessmentWave.test.js`
Expected: FAIL - "Cannot find module './HoldTimer'", "Cannot find module './McGillStation'", and `r.button('6 McGill')` is null.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/components/assessments/HoldTimer.js`:

```js
import React, { useEffect, useRef, useState } from 'react';
import { color, font } from '../../tokens';
import Button from '../Button';
import TrialInput from './TrialInput';
import { CAP_SECONDS, holdLabel, round } from '../../data/assessmentScoring';

export const TICK_MS = 250;

/**
 * One McGill hold (protocol Section 3; spec 5): Start, then Stop when the
 * athlete loses position after the one warning. The hold is the clock time
 * since Start (Date.now()), not a count of ticks, so a tablet that sleeps
 * or a slow render loses nothing; it stops itself at 300 s and records 300,
 * shown "300+ (capped)". A time from a stopwatch can be typed instead.
 */
export default function HoldTimer({ label, value, onCommit, disabled = false }) {
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const running = startedAt != null;
  const elapsed = running ? Math.min(CAP_SECONDS, (now - startedAt) / 1000) : null;

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && elapsed >= CAP_SECONDS) {
      setStartedAt(null);
      commit.current(CAP_SECONDS);
    }
  }, [running, elapsed]);

  const start = () => {
    const t = Date.now();
    setNow(t);
    setStartedAt(t);
  };
  const stop = () => {
    const seconds = Math.min(CAP_SECONDS, round((Date.now() - startedAt) / 1000, 1));
    setStartedAt(null);
    onCommit(seconds);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div aria-live="polite" style={{ minWidth: 112, font: `700 20px ${font.head}`, color: running ? color.primary : color.text }}>
        {running ? `${Math.floor(elapsed)} s` : holdLabel(value)}
      </div>
      {running ? (
        <Button height={44} aria-label={`${label}: stop`} style={{ width: 'auto', padding: '0 22px' }} onClick={stop}>Stop</Button>
      ) : (
        <>
          <Button variant="outline" height={44} aria-label={`${label}: start`} disabled={disabled} style={{ width: 'auto', padding: '0 22px', boxShadow: 'none' }} onClick={start}>
            {value != null ? 'Time again' : 'Start'}
          </Button>
          <TrialInput label={`${label} (s)`} value={value} rangeKey="mcgill" onCommit={onCommit} disabled={disabled} width={74} />
        </>
      )}
    </div>
  );
}
```

The `'Time again'` button carries the aria-label `${label}: start`; `renderScreen`'s `button()` matches by text or by aria-label, so the test finds it either way.

Create `frontend/src/portal/components/assessments/McGillStation.js`:

```js
import React from 'react';
import { color } from '../../tokens';
import Button from '../Button';
import FieldRow from './FieldRow';
import HoldTimer from './HoldTimer';
import { LETTERS } from './StartWaveSheet';
import { Body } from '../Primitives';
import { mcgillScores } from '../../data/assessmentScoring';
import { MCGILL_WINDOW_DAYS, daysBetween, shortDate, toISODate } from '../../data/assessmentWindows';

export const EMPTY_MCGILL = { flexorSec: null, extensorSec: null, sideRightSec: null, sideLeftSec: null, skippedBackPain: false };

/** The four holds in the protocol's order (Section 3). */
export const HOLDS = [['flexorSec', 'trunk flexor'], ['extensorSec', 'trunk extensor'], ['sideRightSec', 'right side bridge'], ['sideLeftSec', 'left side bridge']];

/** Station 6's order line; a circuit set to run McGill as its own block says so. */
export function mcgillRotation(athletes, circuitMode) {
  const order = athletes.map((a) => LETTERS[a.position - 1]).join(', ');
  const block = circuitMode?.mcgillMode === 'separate'
    ? ` This circuit runs McGill as its own block within ${MCGILL_WINDOW_DAYS} days; enter it here on the day it runs.`
    : '';
  return `Each athlete in turn (${order}): ${HOLDS.map(([, n]) => n).join(', ')}.${block}`;
}

const ratioText = (label, r) => (r ? `${label} ${r.value}${r.capped ? ' (capped)' : r.flagged ? ' - flag' : ''}` : null);

/**
 * Station 6 - McGill endurance holds (protocol Section 3), baseline and end
 * of season only. One timer per hold, capped at 300 s; back pain skips the
 * whole test. The first hold saved dates the McGill (`mcgillDate`, the
 * academy date), so a block run later is timed from the day it ran; more
 * than 14 days after the circuit is warned here and flagged in the results,
 * never refused.
 */
export default function McGillStation({ athlete, onSave, onSaveFields }) {
  const { athleteId, name, window: w } = athlete;
  if (athlete.kind === 'mid') return <Body size={13}>McGill runs at baseline and end of season only.</Body>;
  const m = { ...EMPTY_MCGILL, ...(w.mcgill || {}) };
  const today = toISODate(Date.now());
  const after = daysBetween(w.circuitDate, w.mcgillDate ?? today);
  const save = (next) => {
    onSave(athleteId, 'mcgill', next);
    if (!w.mcgillDate) onSaveFields(athleteId, { mcgillDate: today });
  };
  const s = mcgillScores(m);
  const ratios = [
    ratioText('Flexion:extension', s.flexExt),
    ratioText('Right:left', s.rightLeft),
    ratioText('Right side:extension', s.sideRightExt),
    ratioText('Left side:extension', s.sideLeftExt),
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {after != null && after > MCGILL_WINDOW_DAYS ? (
        <Body size={12} tone={color.secondary}>
          {after} days after the circuit ({shortDate(w.circuitDate)}). McGill is due within {MCGILL_WINDOW_DAYS} days; this result will be flagged.
        </Body>
      ) : null}
      {m.skippedBackPain ? (
        <>
          <Body size={13}>Skipped: back pain. No holds are taken.</Body>
          <Button variant="outline" height={40} style={{ boxShadow: 'none' }} onClick={() => save({ ...m, skippedBackPain: false })}>Undo skip</Button>
        </>
      ) : (
        <>
          {HOLDS.map(([key, hold]) => (
            <FieldRow key={key} label={hold[0].toUpperCase() + hold.slice(1)}>
              <HoldTimer label={`${name} ${hold}`} value={m[key]} onCommit={(v) => save({ ...m, [key]: v })} />
            </FieldRow>
          ))}
          {ratios ? <Body size={12}>{ratios}</Body> : null}
          <Button variant="outline" height={40} aria-label={`${name}: skip, back pain`} style={{ boxShadow: 'none' }} onClick={() => save({ ...m, skippedBackPain: true })}>
            Skip - back pain
          </Button>
        </>
      )}
    </div>
  );
}
```

In `frontend/src/portal/screens/AssessmentWave.js`, replace:

```js
import MedballStation, { medballRotation } from '../components/assessments/MedballStation';
```

with:

```js
import MedballStation, { medballRotation } from '../components/assessments/MedballStation';
import McGillStation, { mcgillRotation } from '../components/assessments/McGillStation';
```

then replace:

```js
  medball: { View: MedballStation, rotation: medballRotation },
};
```

with:

```js
  medball: { View: MedballStation, rotation: medballRotation },
  mcgill: { View: McGillStation, rotation: mcgillRotation },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/assessments/HoldTimer.test.js src/portal/components/assessments/McGillStation.test.js src/portal/screens/AssessmentWave.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/components/assessments frontend/src/portal/screens/AssessmentWave.js frontend/src/portal/screens/AssessmentWave.test.js
git commit -m "feat(assessments): McGill station with a 300 s hold timer

Four holds in protocol order timed from the clock (a sleeping tablet loses
nothing), capped at 300 s, a back-pain skip, the ratios with their flags,
and the McGill dated by its first hold so a later block is timed right.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Coach results view

**Files:**
- Create: `frontend/src/portal/data/assessmentResults.js`
- Create: `frontend/src/portal/components/assessments/WindowCard.js`
- Create: `frontend/src/portal/components/assessments/ResultsTable.js`
- Create: `frontend/src/portal/screens/AssessmentResults.js`
- Modify: `frontend/src/portal/AssessmentRoutes.js` (loader, `AssessmentResultsRoute`)
- Modify: `frontend/src/portal/PortalRoutes.js` (imports; `AthleteDetailRoute` passes `onOpenAssessments`; the results route)
- Modify: `frontend/src/portal/screens/AthleteDetail.js` (the `onOpenAssessments` prop and its card)
- Test: `frontend/src/portal/data/assessmentResults.test.js`, `frontend/src/portal/screens/AssessmentResults.test.js`, `frontend/src/portal/AssessmentRoutes.test.js` (mocks and appended tests), `frontend/src/portal/screens/AthleteDetail.test.js` (append)

**Interfaces:**
- Consumes: every scorer in `data/assessmentScoring.js` (Task 1); `withDefaults`, `modeDifferences`, `ENTRY_KEYS` (Task 2); `addDaysISO`, `academyDateISO` (`data/calendar.js`); `KIND_LABEL`, `MIN_GAP_DAYS`, `GOLF_WINDOW_DAYS`, `MCGILL_WINDOW_DAYS`, `CONSENT_LABEL`, `consentStatus`, `daysBetween`, `inResearch`, `shortDate` (Task 2); `assessmentAccess` (Task 3); `saveWindowFields` (Task 5); `useAthleteAssessments(athleteId)` returning `{ athlete, profile, windows, settings }` (Task 6); `AssessmentFrame`, `useLayoutClass` (Task 11); `AssessmentsEntryCard` (Task 12); `useViewer`, `RequireAssessment` (Task 12); `AssessmentWave`'s navigation state `station` (Task 13).
- Produces: `buildResults({ athleteId, athlete, profile, windows, settings, today? })` returning `{ athleteId, name, sex, firstTestDate, consent, coefficientsVerified, windows: WindowResult[] }` newest first, where `WindowResult = { id, kind, kindLabel, circuitDate, status, protocolVersion, weeksOfExposure, wave, scores, growth, maturity: { age, offset, category, label, note, sittingFrom, missing }, previousDate, markers: { clubhead, cmj, hop, medball, grip, parallax } | null, flags: [{ code, text }], notTested, mcgillDue, missing: string[] (what an open window still lacks, with its due date), openDays: number|null (days since the circuit date while open, given `today`), inResearch, window }`; `windowScores(w)`; `TABLE_ROWS` (`{ label, value(r), marker? }`); `ratioCell(ratio)`; `MARKER_TEXT`, `MODE_LABEL`, `UNVERIFIED_NOTE`. Flag codes: `growth`, `sitting-stale`, `gct`, `fps-directional`, `golf-late`, `mcgill-late`, `too-soon`, `first-retest`, `cross-version`, `mode-differs` (markers off), `entry-differs` (another 10/5 or RSImod entry mode: only the 10/5 marker goes off). The screen `AssessmentResults({ bare, athleteId, viewer, fallbackName, onBack, onRunMcgill, today = academyDateISO() })`; `WindowCard` asks before completing an open window that still lacks clubhead speed or McGill; the route `/portal/assessments/athlete/:athleteId` (every coach, ops, owner); `AthleteDetail`'s `onOpenAssessments(name)`. Task 18's golf screen and the family summary (B) build on `buildResults`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/data/assessmentResults.test.js`:

```js
import { TABLE_ROWS, UNVERIFIED_NOTE, buildResults, ratioCell } from './assessmentResults';
import { DEFAULT_SETTINGS, circuitModeOf } from './assessmentSettings';

const MODE = circuitModeOf(DEFAULT_SETTINGS);
const boy = { id: 'a', name: 'Cal Duarte', dob: '2012-11-03', consents: { research: { value: true, assent: true, recordedAt: '2026-10-20T15:00:00Z', recordedBy: 'p' } } };
const win = (over) => ({ athleteId: 'a', season: '2026-27', protocolVersion: 'v1.2', circuitMode: MODE, status: 'complete', golfDate: null, mcgillDate: null, enteredBy: {}, ...over });
const baseline = win({
  id: '2026-27-baseline', kind: 'baseline', circuitDate: '2026-11-03', weeksOfExposure: 0, wave: { id: 'w1', position: 1, coachUid: 'phil' },
  anthro: { standing: [160.0, 160.2], mass: [50.0], boxHeight: 40, sittingRaw: [118.0, 118.0], arm: [], hand: [] },
  grip: { right: [30, 29], left: [28], dominant: 'right' },
  cmj: { trials: [{ heightCm: 32, rsiMod: 0.4, timeToTakeoffMs: null, peakPowerW: 2500, peakPowerWkg: null, asymmetryPct: 5.5 }], software: 'Smart2Move', samplingHz: 1000 },
  hop: { sets: [{ rsiBest5: 2.31, gctMs: 198 }] },
  medball: { massKg: 3, side: 'trail', method: 'speed', throws: [28, 27.5] },
  mcgill: { flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 48, skippedBackPain: false },
  golf: { speeds: [90, 88, 89], driver: null, parallaxComposite: 72, fps: 240 },
});
const mid = win({
  id: '2026-27-mid', kind: 'mid', circuitDate: '2027-01-05', weeksOfExposure: 9, status: 'open', wave: { id: 'w2', position: 2, coachUid: 'phil' },
  anthro: { standing: [161.0], mass: [51.0], boxHeight: null, sittingRaw: [], arm: [], hand: [] },
  grip: { right: [32], left: [] },
  cmj: { trials: [{ heightCm: 32.5, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2550, peakPowerWkg: null, asymmetryPct: 4 }], software: 'Smart2Move', samplingHz: 1000 },
  hop: { sets: [{ rsiBest5: 2.0, gctMs: 205 }] },
  medball: { massKg: 3, side: 'trail', method: 'speed', throws: [28.5] },
  golf: { speeds: [92], driver: null, parallaxComposite: 75, fps: 240 },
});
const results = (windows, over = {}) => buildResults({ athleteId: 'a', athlete: boy, profile: { sex: 'male', firstTestDate: '2026-11-03' }, windows, settings: DEFAULT_SETTINGS, ...over });
const hasNaN = (v) => (typeof v === 'number' ? Number.isNaN(v) : v && typeof v === 'object' ? Object.values(v).some(hasNaN) : false);

test('a first window: scores, the maturity offset marked unverified, research, no markers, no flags', () => {
  const r = results([baseline]);
  expect(r).toMatchObject({ name: 'Cal Duarte', sex: 'male', firstTestDate: '2026-11-03', consent: 'yes', coefficientsVerified: false });
  const [w] = r.windows;
  expect(w).toMatchObject({ kindLabel: 'Baseline', circuitDate: '2026-11-03', weeksOfExposure: 0, inResearch: true, markers: null, flags: [], mcgillDue: false, previousDate: null });
  expect(w.maturity).toEqual({ age: 14, offset: -0.447, category: 'circa', label: 'Circa-PHV', note: UNVERIFIED_NOTE, sittingFrom: null, missing: null });
  expect(w.scores.grip).toMatchObject({ best: 30, relativeBest: 0.6 });
  expect(w.scores.golf).toMatchObject({ best: 90, top3Mean: 89 });
  expect(w.scores.mcgill.flexExt).toEqual({ value: 0.67, capped: false, flagged: false });
});

test('a verified coefficient set drops the estimate note', () => {
  const r = results([baseline], { settings: { ...DEFAULT_SETTINGS, coefficients: { ...DEFAULT_SETTINGS.coefficients, verified: true } } });
  expect(r.windows[0].maturity.note).toBeNull();
  expect(r.coefficientsVerified).toBe(true);
});

test('a retest: newest first, change markers against the previous window, the learning-effect flag', () => {
  const r = results([mid, baseline]);
  expect(r.windows.map((w) => w.id)).toEqual(['2026-27-mid', '2026-27-baseline']);
  const [m] = r.windows;
  expect(m.previousDate).toBe('2026-11-03');
  expect(m.markers).toEqual({ clubhead: 'gain', cmj: 'within', hop: 'drop', medball: 'within', grip: 'gain', parallax: null });
  expect(m.flags).toEqual([{ code: 'first-retest', text: 'First retest: part of any gain may be a learning effect.' }]);
  expect(m.maturity.sittingFrom).toBe('2026-11-03');
  expect(m.maturity.offset).not.toBeNull();
});

test('another protocol version or circuit mode switches the markers off and says why', () => {
  const v = win({ ...mid, protocolVersion: 'v1.2.1', circuitMode: { ...MODE, trialCounts: { ...MODE.trialCounts, cmjScored: 3 }, gripRestSec: { min: 30, max: 30 } } });
  const [m] = results([baseline, v]).windows;
  expect(m.markers).toBeNull();
  expect(m.flags.map((f) => f.text)).toEqual(expect.arrayContaining([
    'Protocol v1.2.1 vs v1.2 on Nov 3: change markers are off.',
    'Circuit mode differs from Nov 3 (trial counts, grip rest): change markers are off.',
  ]));
});

test('another 10/5 or RSImod entry mode is flagged; only the 10/5 marker goes off', () => {
  const v = win({ ...mid, circuitMode: { ...MODE, hopEntry: 'per-hop', rsiModEntry: 'computed' } });
  const [m] = results([baseline, v]).windows;
  expect(m.markers).toEqual({ clubhead: 'gain', cmj: 'within', hop: null, medball: 'within', grip: 'gain', parallax: null });
  expect(m.flags.filter((f) => f.code === 'entry-differs').map((f) => f.text)).toEqual([
    '10/5 entered hop by hop here and as the per-set summary on Nov 3: the 10/5 marker is off.',
    'CMJ RSImod computed from height and time to take-off here and typed from Smart2Move on Nov 3: RSImod is not compared like for like.',
  ]);
  expect(m.flags.map((f) => f.code)).not.toContain('mode-differs');
});

test('what an open window still lacks, with its due date, and how long it has been open', () => {
  const [m] = results([baseline, win({ ...mid, golf: null })], { today: '2027-01-12' }).windows;
  expect(m.missing).toEqual(['Clubhead speed not entered (due by Jan 12)']);
  expect(m.openDays).toBe(7);
  const end = win({ ...baseline, id: '2026-27-end', kind: 'end', status: 'open', circuitDate: '2027-02-16', golf: null, mcgill: null, circuitMode: { ...MODE, golfTiming: 'same-day' } });
  expect(results([end], { today: '2027-02-16' }).windows[0].missing).toEqual(['Clubhead speed not entered (due on Feb 16)', 'McGill not entered (due by Mar 2)']);
  expect(results([win({ ...end, notTested: { golf: 'absent', mcgill: 'pain' } })]).windows[0].missing).toEqual([]);
  expect(results([baseline]).windows[0]).toMatchObject({ missing: [], openDays: null });
});

test('a new ball or method switches the med ball marker off', () => {
  const [m] = results([baseline, win({ ...mid, medball: { massKg: 4, side: 'trail', method: 'speed', throws: [26] } })]).windows;
  expect(m.markers.medball).toBeNull();
  expect(m.markers.grip).toBe('gain');
});

test('timing and data flags: contact time, frame rate, late golf, late McGill, too soon', () => {
  const end = win({
    ...mid, id: '2026-27-end', kind: 'end', circuitDate: '2026-12-15', golfDate: '2026-12-24', mcgillDate: '2027-01-02',
    hop: { sets: [{ rsiBest5: 2.4, gctMs: 262 }, { rsiBest5: 2.2, gctMs: 230 }] },
    golf: { speeds: [91], driver: null, parallaxComposite: 70, fps: 60 },
  });
  const [e] = results([baseline, end]).windows;
  expect(e.flags).toEqual([
    { code: 'gct', text: '10/5 set 1: contact time 262 ms is over 250 ms; not reported.' },
    { code: 'fps-directional', text: 'Parallax at 60 fps: timing gaps are directional only.' },
    { code: 'golf-late', text: 'Clubhead speed 9 days after the circuit (due within 7).' },
    { code: 'mcgill-late', text: 'McGill 18 days after the circuit (due within 14).' },
    { code: 'too-soon', text: '42 days after the previous test (Nov 3); windows are at least 8 weeks apart.' },
    { code: 'first-retest', text: 'First retest: part of any gain may be a learning effect.' },
  ]);
  expect(e.scores.hop.best).toBe(2.2);
  expect(e.mcgillDue).toBe(true);
});

test('golf on another day when the circuit runs it the same day', () => {
  const same = win({ ...baseline, circuitMode: { ...MODE, golfTiming: 'same-day' }, golfDate: '2026-11-04' });
  expect(results([same]).windows[0].flags).toEqual([{ code: 'golf-late', text: 'Clubhead speed on Nov 4, not the circuit day (this circuit runs golf the same day).' }]);
});

test('growth over 3 cm flags the carried sitting height as stale; a repeat sitting measure clears it', () => {
  const grown = win({ ...mid, anthro: { ...mid.anthro, standing: [164.0] } });
  const [g] = results([baseline, grown]).windows;
  expect(g.growth).toEqual({ cm: 3.9, date: '2026-11-03' });
  expect(g.flags.slice(0, 2)).toEqual([
    { code: 'growth', text: 'Growth: standing height up 3.9 cm since Nov 3 (over 3 cm).' },
    { code: 'sitting-stale', text: 'Sitting height is from Nov 3 and may be stale after this growth; a repeat sitting-height measure updates the maturity offset.' },
  ]);
  const repeat = win({ ...grown, anthro: { ...grown.anthro, boxHeight: 40, sittingRaw: [119.0, 119.0] } });
  const [r] = results([baseline, repeat]).windows;
  expect(r.flags.map((f) => f.code)).toEqual(['growth', 'first-retest']);
  expect(r.maturity.sittingFrom).toBeNull();
  expect(r.scores.anthro.sitting).toBe(79);
});

test('Review Focus 4: an incomplete record says what is missing and never shows NaN or a category', () => {
  const bare = win({ ...baseline, anthro: { standing: [150], mass: [], boxHeight: null, sittingRaw: [80, 80], arm: [], hand: [] }, grip: null, cmj: null, hop: null, medball: null, mcgill: null, golf: null });
  const legacy = buildResults({ athleteId: 'a', athlete: { id: 'a', name: 'Legacy Kid', dob: null, consents: {} }, profile: null, windows: [bare], settings: null });
  expect(legacy.consent).toBe('unanswered');
  expect(legacy.windows[0].maturity).toEqual({
    age: null, offset: null, category: null, label: null, note: null, sittingFrom: null,
    missing: 'Maturity offset not computed: no date of birth on file; sex not entered at intake.',
  });
  expect(hasNaN(legacy)).toBe(false);
  for (const row of TABLE_ROWS) expect(() => row.value(legacy.windows[0])).not.toThrow();

  const noBox = results([bare]);
  expect(noBox.windows[0].maturity.missing).toBe('Maturity offset not computed: no box height for the sitting height.');
  const noSitting = results([win({ ...bare, anthro: { ...bare.anthro, sittingRaw: [] } })]);
  expect(noSitting.windows[0].maturity.missing).toBe('Maturity offset not computed: no sitting height.');
  const unread = buildResults({ athleteId: 'a', athlete: null, profile: { sex: 'female' }, windows: [baseline], settings: null });
  expect(unread.name).toBeNull();
  expect(unread.windows[0].maturity.missing).toBe('Maturity offset not computed: the athlete record could not be read.');
  expect(buildResults({ athleteId: 'a', athlete: null, profile: null, windows: null, settings: null }).windows).toEqual([]);
});

test('a ratio cell says capped or flagged', () => {
  expect(ratioCell({ value: 1.2, capped: false, flagged: true })).toBe('1.2 - flag');
  expect(ratioCell({ value: 0.4, capped: true, flagged: false })).toBe('0.4 (capped)');
  expect(ratioCell(null)).toBeNull();
});
```

Create `frontend/src/portal/screens/AssessmentResults.test.js`:

```js
import React from 'react';
import { renderScreen } from './testRender';
import AssessmentResults from './AssessmentResults';
import { DEFAULT_SETTINGS, circuitModeOf, withDefaults } from '../data/assessmentSettings';

let mockData;
let mockError;
let mockSaves;
let mockSaveFails;
jest.mock('../hooks/assessments', () => ({ useAthleteAssessments: () => ({ data: mockData, loading: false, error: mockError }) }));
jest.mock('../hooks/assessmentsLive', () => ({
  saveWindowFields: async (args) => {
    mockSaves.push(args);
    if (mockSaveFails) throw new Error('offline');
    return args.fields;
  },
}));

const MODE = circuitModeOf(DEFAULT_SETTINGS);
const PHIL = { uid: 'phil', role: 'coach', specialistId: 'phil' };
const COACH = { uid: 'c', role: 'coach' };
const win = (over) => ({ athleteId: 'seed-ava', season: '2026-27', protocolVersion: 'v1.2', circuitMode: MODE, golfDate: null, mcgillDate: null, enteredBy: {}, ...over });
const baseline = win({
  id: '2026-27-baseline', kind: 'baseline', status: 'complete', circuitDate: '2026-11-03', weeksOfExposure: 0, wave: { id: 'wave-2026-11-03-seed', position: 1 },
  anthro: { standing: [152.1, 152.3], mass: [41.0, 41.2], boxHeight: 40, sittingRaw: [118.0, 118.2], arm: [], hand: [] },
  grip: { right: [24.5, 25.1, 24.8], left: [23.0, 22.4, 23.8], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' },
  cmj: { trials: [{ heightCm: 31.2, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2100, peakPowerWkg: null, asymmetryPct: 6.5 }], software: 'Smart2Move', samplingHz: 1000 },
  hop: { sets: [{ rsiBest5: 2.31, gctMs: 198 }] },
  medball: { massKg: 3, side: 'trail', method: 'speed', throws: [28.4, 29.1] },
  mcgill: { flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 300, skippedBackPain: false },
  golf: { speeds: [88.2, 90.1, 89.5], driver: 'TSR3', parallaxComposite: 72, fps: 240 },
});
const end = win({
  id: '2026-27-end', kind: 'end', status: 'open', circuitDate: '2027-02-16', weeksOfExposure: 15, wave: { id: 'wave-2027-02-16-x', position: 1 },
  anthro: { standing: [153.0], mass: [42.0], boxHeight: 40, sittingRaw: [118.5, 118.5], arm: [], hand: [] },
  grip: { right: [27.0], left: [24.0] },
});

const screen = (props = {}) => renderScreen(<AssessmentResults bare athleteId="seed-ava" viewer={PHIL} today="2027-02-20" onBack={() => {}} onRunMcgill={() => {}} {...props} />);

beforeEach(() => {
  mockData = {
    athlete: { id: 'seed-ava', name: 'Ava Moreno', dob: '2012-04-10', consents: { research: { value: true, assent: true, recordedAt: '2026-10-15T15:00:00Z', recordedBy: 'p' } } },
    profile: { athleteId: 'seed-ava', sex: 'female', firstTestDate: '2026-11-03' },
    windows: [baseline, end],
    settings: withDefaults(null),
  };
  mockError = null;
  mockSaves = [];
  mockSaveFails = false;
  window.innerWidth = 1024;
});
afterEach(() => { window.innerWidth = 1024; });

test('every window newest first, with maturity, scores, markers and flags', async () => {
  const r = await screen();
  const text = r.text();
  expect(text).toContain('Ava Moreno');
  expect(text).toContain('Research: yes · First test Nov 3 · Female');
  expect(text.indexOf('End of season · Feb 16')).toBeLessThan(text.indexOf('Baseline · Nov 3'));
  expect(text).toContain('Protocol v1.2 · 15 weeks of exposure · in research');
  expect(text).toContain('Maturity offset');
  expect(text).toContain('estimate, coefficients unverified');
  expect(text).toContain('Grip best (kg)27Up');
  expect(text).toContain('First retest: part of any gain may be a learning effect.');
  await r.unmount();
});

test('every trial, with the coach-only values, on request', async () => {
  const r = await screen();
  expect(r.text()).not.toContain('asymmetry 6.5 %');
  await r.click('Show every trial: Baseline, Nov 3');
  expect(r.text()).toContain('Jump 1: 31.2 cm · RSImod 0.41 · 2100 W · asymmetry 6.5 %');
  expect(r.text()).toContain('Set 1: RSI 2.31 · contact 198 ms');
  expect(r.text()).toContain('Flexor 60 s · extensor 90 s · right side 50 s · left side 300+ (capped)');
  expect(r.text()).toContain('Right 24.5, 25.1, 24.8 · Left 23, 22.4, 23.8 · device D1 · handle 3 · circuit rest interval');
  await r.unmount();
});

test('an open window says how long it has been open and what is still missing', async () => {
  const r = await screen();
  expect(r.text()).toContain('Open since Feb 16 (4 days)');
  expect(r.text()).toContain('Clubhead speed not entered (due by Feb 23)');
  expect(r.text()).toContain('McGill not entered (due by Mar 2)');
  await r.unmount();
});

test('staff mark a window complete, after a warning for what is still missing, and run the McGill block it lacks', async () => {
  const runs = [];
  const r = await screen({ onRunMcgill: (waveId) => runs.push(waveId) });
  await r.click('Run McGill block');
  expect(runs).toEqual(['wave-2027-02-16-x']);
  await r.click('Mark window complete');
  expect(mockSaves).toEqual([]);
  expect(r.text()).toContain('Golf coaches can only enter clubhead speed and Parallax on an open window.');
  await r.click('Keep open');
  expect(mockSaves).toEqual([]);
  await r.click('Mark window complete');
  await r.click('Complete anyway');
  expect(mockSaves).toEqual([{ athleteId: 'seed-ava', windowId: '2026-27-end', fields: { status: 'complete' } }]);
  expect(r.button('Mark window complete')).toBeNull();
  await r.unmount();
});

test('a status save that fails says so and leaves the window open', async () => {
  mockSaveFails = true;
  const r = await screen();
  await r.click('Mark window complete');
  await r.click('Complete anyway');
  expect(r.text()).toContain('The window was not marked complete. Check the connection and try again.');
  expect(r.button('Mark window complete')).not.toBeNull();
  await r.unmount();
});

test('coaches without the permission read everything and change nothing', async () => {
  const r = await screen({ viewer: COACH });
  expect(r.button('Mark window complete')).toBeNull();
  expect(r.button('Run McGill block')).toBeNull();
  expect(r.button('Show every trial: Baseline, Nov 3')).not.toBeNull();
  await r.unmount();
});

test('desktop adds the table of every window', async () => {
  window.innerWidth = 1280;
  const r = await screen();
  const heads = [...r.container.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent);
  expect(heads).toEqual(['Measure', 'End of season · Feb 16', 'Baseline · Nov 3']);
  const rows = [...r.container.querySelectorAll('[role="rowheader"]')].map((h) => h.textContent);
  expect(rows).toContain('CMJ height (cm)');
  await r.unmount();
});

test('an athlete record the coach cannot read still shows the results, under the name passed in', async () => {
  mockData = { ...mockData, athlete: null };
  const r = await screen({ fallbackName: 'Ava Moreno' });
  expect(r.text()).toContain('Ava Moreno');
  expect(r.text()).toContain('Maturity offset not computed: the athlete record could not be read.');
  await r.unmount();
});

test('a failed load and an athlete never tested both say so', async () => {
  mockData = null;
  mockError = new Error('offline');
  const r = await screen();
  expect(r.text()).toContain("The results didn't load. Check your connection and try again.");
  await r.unmount();
  mockError = null;
  mockData = { athlete: { id: 'seed-cal', name: 'Cal Duarte', dob: null, consents: {} }, profile: null, windows: [], settings: withDefaults(null) };
  const e = await screen();
  expect(e.text()).toContain('No assessments yet.');
  await e.unmount();
});
```

In `frontend/src/portal/AssessmentRoutes.test.js`, replace:

```js
jest.mock('./screens/AssessmentWave', () => ({ __esModule: true, default: ({ waveId, initialStation }) => `WAVE ${waveId} at ${initialStation ?? 'start'}` }));
```

with:

```js
jest.mock('./screens/AssessmentWave', () => ({ __esModule: true, default: ({ waveId, initialStation }) => `WAVE ${waveId} at ${initialStation ?? 'start'}` }));
jest.mock('./screens/AssessmentResults', () => {
  const { createElement } = require('react');
  return { __esModule: true, default: ({ athleteId, fallbackName, onRunMcgill }) => createElement('button', { type: 'button', onClick: () => onRunMcgill('wave-2026-11-03-abc') }, `RESULTS ${athleteId} ${fallbackName ?? ''}`.trim()) };
});
jest.mock('./screens/AthleteDetail', () => {
  const { createElement } = require('react');
  return { __esModule: true, default: ({ onOpenAssessments }) => createElement('button', { type: 'button', onClick: () => onOpenAssessments('Ava Moreno') }, onOpenAssessments ? 'DETAIL with assessments' : 'DETAIL') };
});
```

Append to `frontend/src/portal/AssessmentRoutes.test.js`:

```js
test("every coach, ops and the owner read an athlete's results; families go home", async () => {
  for (const user of [{ uid: 'c', role: 'coach' }, { uid: 'p', role: 'coach', specialistId: 'phil' }, { uid: 'o', role: 'ops' }, { uid: 'w', role: 'owner' }]) {
    mockUser.value = user;
    const r = await mount('/portal/assessments/athlete/seed-ava');
    expect(r.text()).toBe('RESULTS seed-ava');
    await r.unmount();
  }
  mockUser.value = { uid: 'p', role: 'parent', householdId: 'h' };
  const f = await mount('/portal/assessments/athlete/seed-ava');
  expect(f.pathname()).toBe('/portal/family');
  await f.unmount();
});

test('"Run McGill block" reopens the wave on the McGill station', async () => {
  mockUser.value = { uid: 'p', role: 'coach', specialistId: 'phil' };
  const r = await mount('/portal/assessments/athlete/seed-ava');
  await r.click();
  expect(r.pathname()).toBe('/portal/assessments/wave/wave-2026-11-03-abc');
  expect(r.text()).toBe('WAVE wave-2026-11-03-abc at mcgill');
  await r.unmount();
});

test('athlete detail links coaches and staff to the results, with the name; parents and Yannick get no link', async () => {
  mockUser.value = { uid: 'c', role: 'coach' };
  const r = await mount('/portal/athlete/seed-ava');
  expect(r.text()).toBe('DETAIL with assessments');
  await r.click();
  expect(r.pathname()).toBe('/portal/assessments/athlete/seed-ava');
  expect(r.text()).toBe('RESULTS seed-ava Ava Moreno');
  await r.unmount();
  for (const user of [{ uid: 'p', role: 'parent', householdId: 'h' }, { uid: 'y', role: 'mental', specialistId: 'mental' }]) {
    mockUser.value = user;
    const p = await mount('/portal/athlete/seed-ava');
    expect(p.text()).toBe('DETAIL');
    await p.unmount();
  }
});
```

Append to `frontend/src/portal/screens/AthleteDetail.test.js`:

```js
test('staff and coaches get an Assessments card that opens the results with the name; parents do not', async () => {
  const athlete = { name: 'Jordan', subline: 'Age 14', contractMinutes: 45, packageId: 't-12', loginEmail: null, login: { state: 'none', claimedAt: null } };
  mockDetail = { data: { athlete, history: [], checklist: [], hasEnoughData: false }, loading: false, error: null };
  const opened = [];
  const coach = await renderScreen(<AthleteDetail bare athleteId="a1" role="coach" backLabel="Roster" onBack={() => {}} onOpenAssessments={(name) => opened.push(name)} />);
  await coach.click('Open results');
  expect(opened).toEqual(['Jordan']);
  await coach.unmount();
  const parent = await renderScreen(<AthleteDetail bare athleteId="a1" role="parent" />);
  expect(parent.button('Open results')).toBeNull();
  await parent.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/assessmentResults.test.js src/portal/screens/AssessmentResults.test.js src/portal/AssessmentRoutes.test.js src/portal/screens/AthleteDetail.test.js`
Expected: FAIL - "Cannot find module './assessmentResults'", "Cannot find module './AssessmentResults'", the results route renders nothing, and there is no "Open results" button.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/data/assessmentResults.js`:

```js
/**
 * The coach results view (spec 5 "Results (coach)"; spec 6). PURE: from one
 * athlete's windows, assessment profile and the settings it builds, per
 * window, every score (computed from the trials, never stored), the
 * maturity offset or why there is none, the change markers against the
 * previous window, and the flags. A window run under another protocol
 * version or circuit mode than the one before it has its markers switched
 * off and says why - never silently compared (spec 2, decision 9); one
 * entered under another 10/5 or RSImod entry mode is flagged, and the 10/5
 * marker (the one an entry mode feeds) goes off.
 * Thresholds and coefficients come from the current settings: the
 * thresholds are provisional and Phil edits them in one table (spec 6).
 */
import {
  GCT_FLAG_MS, GROWTH_FLAG_CM, MATURITY_LABEL, anthroFinals, changeMarker, clubheadScores, cmjScores, decimalAge, gripScores, growthCm,
  hopScores, maturityCategory, maturityOffset, mcgillScores, medballScores,
} from './assessmentScoring';
import { ENTRY_KEYS, modeDifferences, withDefaults } from './assessmentSettings';
import { GOLF_WINDOW_DAYS, KIND_LABEL, MCGILL_WINDOW_DAYS, MIN_GAP_DAYS, consentStatus, daysBetween, inResearch, shortDate } from './assessmentWindows';
import { addDaysISO } from './calendar';

export const UNVERIFIED_NOTE = 'estimate, coefficients unverified';
export const MODE_LABEL = { trialCounts: 'trial counts', gripRestSec: 'grip rest', stations: 'stations on', mcgillMode: 'McGill mode', medballSide: 'med ball side', golfTiming: 'golf timing' };
export const MARKER_TEXT = { gain: 'Up', within: 'No change', drop: 'Down - check maturity and readiness' };
const ENTRY_TEXT = {
  hopEntry: { summary: 'as the per-set summary', 'per-hop': 'hop by hop' },
  rsiModEntry: { typed: 'typed from Smart2Move', computed: 'computed from height and time to take-off' },
};
const entryOf = (key, mode) => ENTRY_TEXT[key][mode?.[key]] ?? 'another way';
const MARKER_TESTS = ['clubhead', 'cmj', 'hop', 'medball', 'grip', 'parallax'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const byDate = (a, b) => (a.circuitDate || '').localeCompare(b.circuitDate || '');

/** Every score one window's trials give (spec 6), under the entry modes it ran with. */
export function windowScores(w) {
  const mode = w.circuitMode || {};
  const anthro = anthroFinals(w.anthro);
  return {
    anthro,
    grip: gripScores(w.grip, anthro.mass),
    cmj: cmjScores(w.cmj, { rsiModEntry: mode.rsiModEntry, massKg: anthro.mass }),
    hop: hopScores(w.hop, { hopEntry: mode.hopEntry }),
    medball: medballScores(w.medball),
    mcgill: w.mcgill ? mcgillScores(w.mcgill) : null,
    golf: clubheadScores(w.golf),
  };
}

/** The latest earlier window with a value, { value, date }, or null. */
function latestBefore(earlier, pick) {
  for (const p of [...earlier].reverse()) {
    const value = pick(p);
    if (value != null) return { value, date: p.circuitDate };
  }
  return null;
}

/**
 * Moore (2015) at this window's circuit date. Mid-season has no sitting
 * height of its own unless the growth check asked for a repeat, so it
 * uses the most recent full measure (spec 6); `sittingFrom` names that
 * window. Without a value it needs, `missing` says which - never a guess.
 */
function maturityOf({ athlete, sex, w, anthro, earlier, coefficients }) {
  const own = anthro.sitting;
  const carried = own == null ? latestBefore(earlier, (p) => anthroFinals(p.anthro).sitting) : null;
  const sitting = own ?? carried?.value ?? null;
  const age = athlete ? decimalAge(athlete.dob, w.circuitDate) : null;
  const seated = (w.anthro?.sittingRaw || []).some(isNum);
  const missing = [];
  if (!athlete) missing.push('the athlete record could not be read');
  else if (age == null) missing.push('no date of birth on file');
  if (sex !== 'male' && sex !== 'female') missing.push('sex not entered at intake');
  if (sex === 'male' && sitting == null) missing.push(seated && !isNum(w.anthro?.boxHeight) ? 'no box height for the sitting height' : 'no sitting height');
  if (sex === 'female' && anthro.standing == null) missing.push('no standing height');
  const offset = maturityOffset({ sex, age, sittingCm: sitting, standingCm: anthro.standing, coefficients });
  const category = maturityCategory(offset);
  return {
    age,
    offset,
    category,
    label: category ? MATURITY_LABEL[category] : null,
    note: offset != null && coefficients?.verified !== true ? UNVERIFIED_NOTE : null,
    sittingFrom: sex === 'male' && own == null && carried ? carried.date : null,
    missing: offset == null ? `Maturity offset not computed: ${missing.length ? missing.join('; ') : 'a value it needs is missing'}.` : null,
  };
}

/** The value each change marker compares (spec 6). */
function markerValues(s) {
  return { clubhead: s.golf.best, cmj: s.cmj.bestHeight, hop: s.hop.best, medball: s.medball.best, grip: s.grip.best, parallax: s.golf.parallax };
}

function markersOf(scores, previous, thresholds) {
  const cur = markerValues(scores);
  const old = markerValues(previous);
  const out = {};
  for (const k of MARKER_TESTS) out[k] = changeMarker(cur[k], old[k], thresholds?.[k]);
  if (scores.medball.method !== previous.medball.method || scores.medball.massKg !== previous.medball.massKg) out.medball = null;
  return out;
}

function flagsOf({ w, scores, prev, index, growth, maturity }) {
  const flags = [];
  const add = (code, text) => flags.push({ code, text });
  if (growth && growth.cm > GROWTH_FLAG_CM) {
    add('growth', `Growth: standing height up ${growth.cm} cm since ${shortDate(growth.date)} (over ${GROWTH_FLAG_CM} cm).`);
    if (maturity.sittingFrom) {
      add('sitting-stale', `Sitting height is from ${shortDate(maturity.sittingFrom)} and may be stale after this growth; a repeat sitting-height measure updates the maturity offset.`);
    }
  }
  scores.hop.sets.forEach((set, i) => {
    if (set.flagged) add('gct', `10/5 set ${i + 1}: contact time ${set.gctMs} ms is over ${GCT_FLAG_MS} ms; not reported.`);
  });
  if (scores.golf.fpsDirectional) add('fps-directional', `Parallax at ${w.golf.fps} fps: timing gaps are directional only.`);
  const golfDays = w.golfDate ? daysBetween(w.circuitDate, w.golfDate) : null;
  if (golfDays != null) {
    if (w.circuitMode?.golfTiming === 'same-day' && golfDays !== 0) {
      add('golf-late', `Clubhead speed on ${shortDate(w.golfDate)}, not the circuit day (this circuit runs golf the same day).`);
    } else if (golfDays > GOLF_WINDOW_DAYS) {
      add('golf-late', `Clubhead speed ${golfDays} days after the circuit (due within ${GOLF_WINDOW_DAYS}).`);
    }
  }
  const mcgillDays = w.mcgillDate ? daysBetween(w.circuitDate, w.mcgillDate) : null;
  if (mcgillDays != null && mcgillDays > MCGILL_WINDOW_DAYS) add('mcgill-late', `McGill ${mcgillDays} days after the circuit (due within ${MCGILL_WINDOW_DAYS}).`);
  if (prev) {
    const gap = daysBetween(prev.circuitDate, w.circuitDate);
    if (gap != null && gap < MIN_GAP_DAYS) add('too-soon', `${gap} days after the previous test (${shortDate(prev.circuitDate)}); windows are at least 8 weeks apart.`);
    if (index === 1) add('first-retest', 'First retest: part of any gain may be a learning effect.');
    if ((prev.protocolVersion ?? null) !== (w.protocolVersion ?? null)) {
      add('cross-version', `Protocol ${w.protocolVersion} vs ${prev.protocolVersion} on ${shortDate(prev.circuitDate)}: change markers are off.`);
    }
    const diffs = modeDifferences(prev.circuitMode, w.circuitMode);
    const procedure = diffs.filter((k) => !ENTRY_KEYS.includes(k));
    const on = shortDate(prev.circuitDate);
    if (procedure.length) add('mode-differs', `Circuit mode differs from ${on} (${procedure.map((k) => MODE_LABEL[k]).join(', ')}): change markers are off.`);
    if (diffs.includes('hopEntry')) {
      add('entry-differs', `10/5 entered ${entryOf('hopEntry', w.circuitMode)} here and ${entryOf('hopEntry', prev.circuitMode)} on ${on}: the 10/5 marker is off.`);
    }
    if (diffs.includes('rsiModEntry')) {
      add('entry-differs', `CMJ RSImod ${entryOf('rsiModEntry', w.circuitMode)} here and ${entryOf('rsiModEntry', prev.circuitMode)} on ${on}: RSImod is not compared like for like.`);
    }
  }
  return flags;
}

/**
 * What an open window still lacks, each with its due date (spec 4.1: golf
 * within 7 days of the circuit, or the same day when the circuit says so;
 * McGill within 14). Golf coaches write only an open window, so completing
 * one with clubhead speed missing ends their entry: the card asks first.
 */
function missingOf(w, scores, mcgillDue) {
  const out = [];
  if (scores.golf.best == null && !w.notTested?.golf) {
    const due = w.circuitMode?.golfTiming === 'same-day' ? `on ${shortDate(w.circuitDate)}` : `by ${shortDate(addDaysISO(w.circuitDate, GOLF_WINDOW_DAYS))}`;
    out.push(`Clubhead speed not entered (due ${due})`);
  }
  if (mcgillDue) out.push(`McGill not entered (due by ${shortDate(addDaysISO(w.circuitDate, MCGILL_WINDOW_DAYS))})`);
  return out;
}

/**
 * One athlete's results, newest window first (spec 5). `athlete` is null
 * when the viewer may not read the record; `today` (the academy date) dates
 * how long an open window has been open.
 */
export function buildResults({ athleteId, athlete, profile, windows, settings, today = null }) {
  const s = withDefaults(settings);
  const all = [...(windows || [])].filter(Boolean).sort(byDate);
  const sex = profile?.sex ?? null;
  const research = athlete?.consents?.research ?? null;
  const rows = all.map((w, index) => {
    const earlier = all.slice(0, index);
    const prev = earlier.length ? earlier[earlier.length - 1] : null;
    const scores = windowScores(w);
    const prior = latestBefore(earlier, (p) => anthroFinals(p.anthro).standing);
    const growth = prior && scores.anthro.standing != null ? { cm: growthCm(scores.anthro.standing, prior.value), date: prior.date } : null;
    const maturity = maturityOf({ athlete, sex, w, anthro: scores.anthro, earlier, coefficients: s.coefficients });
    const diffs = prev ? modeDifferences(prev.circuitMode, w.circuitMode) : [];
    const comparable = Boolean(prev) && (prev.protocolVersion ?? null) === (w.protocolVersion ?? null) && diffs.every((k) => ENTRY_KEYS.includes(k));
    const markers = comparable ? markersOf(scores, windowScores(prev), s.thresholds) : null;
    const mcgillDue = w.kind !== 'mid' && !w.mcgill && !w.notTested?.mcgill && w.circuitMode?.stations?.mcgill !== false;
    return {
      id: w.id,
      kind: w.kind,
      kindLabel: KIND_LABEL[w.kind] ?? w.kind,
      circuitDate: w.circuitDate,
      status: w.status,
      protocolVersion: w.protocolVersion ?? null,
      weeksOfExposure: isNum(w.weeksOfExposure) ? w.weeksOfExposure : null,
      wave: w.wave ?? null,
      scores,
      growth,
      maturity,
      previousDate: prev ? prev.circuitDate : null,
      markers: markers && diffs.includes('hopEntry') ? { ...markers, hop: null } : markers,
      flags: flagsOf({ w, scores, prev, index, growth, maturity }),
      notTested: w.notTested || {},
      mcgillDue,
      missing: missingOf(w, scores, mcgillDue),
      openDays: w.status === 'open' && today ? daysBetween(w.circuitDate, today) : null,
      inResearch: inResearch(research, w.circuitDate),
      window: w,
    };
  });
  return {
    athleteId,
    name: athlete?.name ?? null,
    sex,
    firstTestDate: profile?.firstTestDate ?? null,
    consent: consentStatus(athlete),
    coefficientsVerified: s.coefficients.verified === true,
    windows: rows.reverse(),
  };
}

/** A McGill ratio as one cell: "1.2 - flag", "0.4 (capped)", or null. */
export function ratioCell(r) {
  return r ? `${r.value}${r.capped ? ' (capped)' : r.flagged ? ' - flag' : ''}` : null;
}

const medballCell = (m) => (m.best == null ? null : `${m.best} ${m.method === 'distance' ? 'm' : 'mph'}`);

/** The score rows of the results card and the desktop table, in protocol order; `marker` names the change marker shown beside it. */
export const TABLE_ROWS = [
  { label: 'Weeks of exposure', value: (r) => r.weeksOfExposure },
  { label: 'Standing height (cm)', value: (r) => r.scores.anthro.standing },
  { label: 'Body mass (kg)', value: (r) => r.scores.anthro.mass },
  { label: 'Sitting height (cm)', value: (r) => r.scores.anthro.sitting },
  { label: 'Maturity offset (years)', value: (r) => r.maturity.offset },
  { label: 'Maturity', value: (r) => r.maturity.label },
  { label: 'Grip best (kg)', value: (r) => r.scores.grip.best, marker: 'grip' },
  { label: 'Grip / body mass', value: (r) => r.scores.grip.relativeBest },
  { label: 'CMJ height (cm)', value: (r) => r.scores.cmj.bestHeight, marker: 'cmj' },
  { label: 'CMJ RSImod', value: (r) => r.scores.cmj.bestRsiMod },
  { label: 'Peak power (W/kg)', value: (r) => r.scores.cmj.bestPeakWkg },
  { label: 'CMJ asymmetry (%)', value: (r) => r.scores.cmj.asymmetryPct },
  { label: '10/5 RSI', value: (r) => r.scores.hop.best, marker: 'hop' },
  { label: 'Med ball', value: (r) => medballCell(r.scores.medball), marker: 'medball' },
  { label: 'Clubhead best (mph)', value: (r) => r.scores.golf.best, marker: 'clubhead' },
  { label: 'Clubhead top 3 (mph)', value: (r) => r.scores.golf.top3Mean },
  { label: 'Parallax composite', value: (r) => r.scores.golf.parallax, marker: 'parallax' },
  { label: 'McGill flexion:extension', value: (r) => ratioCell(r.scores.mcgill?.flexExt) },
  { label: 'McGill right:left', value: (r) => ratioCell(r.scores.mcgill?.rightLeft) },
  { label: 'McGill right side:extension', value: (r) => ratioCell(r.scores.mcgill?.sideRightExt) },
  { label: 'McGill left side:extension', value: (r) => ratioCell(r.scores.mcgill?.sideLeftExt) },
];
```

Create `frontend/src/portal/components/assessments/WindowCard.js`:

```js
import React, { useState } from 'react';
import { color, font, radius } from '../../tokens';
import Button from '../Button';
import { Body, Card, ErrorNotice, SectionLabel } from '../Primitives';
import { MARKER_TEXT, TABLE_ROWS } from '../../data/assessmentResults';
import { holdLabel } from '../../data/assessmentScoring';
import { NOT_TESTED_REASONS } from '../../data/assessmentSettings';
import { shortDate } from '../../data/assessmentWindows';

const REASON_LABEL = Object.fromEntries(NOT_TESTED_REASONS);
const SECTION_LABEL = { readiness: 'readiness', anthro: 'anthropometrics', grip: 'grip', cmj: 'CMJ', hop: '10/5', medball: 'med ball', mcgill: 'McGill', golf: 'clubhead speed' };
export const MARKER_TONE = { gain: color.primary, within: color.textTertiary, drop: color.secondary };
const list = (l) => (Array.isArray(l) ? l.filter((v) => v != null).join(', ') : '') || '-';
const join = (parts) => parts.filter(Boolean).join(' · ');

/** Every trial as typed, coach-only values included (spec 5): asymmetry, contact time, McGill raw times. */
function Trials({ w }) {
  const a = w.anthro || {};
  const g = w.grip || {};
  const lines = [];
  if (w.readiness) {
    lines.push(join([`Readiness ${w.readiness.status === 'pass' ? 'pass' : 'not tested'}`,
      w.readiness.hoursSinceHardSession != null ? `${w.readiness.hoursSinceHardSession} h since a hard session` : null,
      w.readiness.golfToday != null ? `golf today ${w.readiness.golfToday ? 'yes' : 'no'}` : null]));
  }
  if (w.anthro) {
    lines.push(join([`Standing ${list(a.standing)}`, `Mass ${list(a.mass)}`,
      (a.sittingRaw || []).some((v) => v != null) ? `Seated ${list(a.sittingRaw)} on a ${a.boxHeight ?? '?'} cm box` : null,
      (a.arm || []).some((v) => v != null) ? `Arm ${list(a.arm)}` : null, (a.hand || []).some((v) => v != null) ? `Hand ${list(a.hand)}` : null]));
  }
  if (w.grip) lines.push(join([`Right ${list(g.right)}`, `Left ${list(g.left)}`, g.deviceRight ? `device ${g.deviceRight}` : null, g.handlePosition ? `handle ${g.handlePosition}` : null, 'circuit rest interval']));
  (w.cmj?.trials || []).forEach((t, i) => {
    if (t) lines.push(join([`Jump ${i + 1}: ${t.heightCm ?? '-'} cm`, t.rsiMod != null ? `RSImod ${t.rsiMod}` : null, t.timeToTakeoffMs != null ? `take-off ${t.timeToTakeoffMs} ms` : null,
      t.peakPowerW != null ? `${t.peakPowerW} W` : null, t.peakPowerWkg != null ? `${t.peakPowerWkg} W/kg` : null, t.asymmetryPct != null ? `asymmetry ${t.asymmetryPct} %` : null]));
  });
  if (w.cmj && (w.cmj.software || w.cmj.samplingHz)) lines.push(`${w.cmj.software || 'Plates'}${w.cmj.samplingHz ? ` at ${w.cmj.samplingHz} Hz` : ''}`);
  (w.hop?.sets || []).forEach((s, i) => {
    if (!s) return;
    lines.push(Array.isArray(s.hopRsi)
      ? `Set ${i + 1}: RSI ${list(s.hopRsi)} · contact ${list(s.hopGctMs)} ms`
      : `Set ${i + 1}: RSI ${s.rsiBest5 ?? '-'} · contact ${s.gctMs ?? '-'} ms`);
  });
  if (w.medball) lines.push(join([`Throws ${list(w.medball.throws)} ${w.medball.method === 'distance' ? 'm' : 'mph'}`, w.medball.massKg ? `${w.medball.massKg} kg` : null, w.medball.side ? `${w.medball.side} side` : null]));
  if (w.mcgill) {
    lines.push(w.mcgill.skippedBackPain ? 'McGill skipped: back pain'
      : `Flexor ${holdLabel(w.mcgill.flexorSec)} · extensor ${holdLabel(w.mcgill.extensorSec)} · right side ${holdLabel(w.mcgill.sideRightSec)} · left side ${holdLabel(w.mcgill.sideLeftSec)}`);
  }
  if (w.golf) lines.push(join([`Speeds ${list(w.golf.speeds)} mph`, w.golf.driver ? `driver ${w.golf.driver}` : null, w.golf.parallaxComposite != null ? `Parallax ${w.golf.parallaxComposite}${w.golf.fps ? ` at ${w.golf.fps} fps` : ''}` : null]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
      {lines.map((l, i) => <Body key={i} size={12}>{l}</Body>)}
    </div>
  );
}

/**
 * One window on the results screen (spec 5): kind and date, protocol,
 * weeks of exposure and research, the maturity offset or why it is
 * missing, each score with its change marker, the flags, what was not
 * tested, and every trial on request. An open window says since when and
 * what it still lacks (clubhead speed, McGill) with the due date. Staff mark
 * it complete (or reopen it) and run a McGill block the window is missing;
 * completing one that still lacks something asks first, because golf
 * coaches can only enter on an open window.
 */
export default function WindowCard({ result: r, status, staff, busy, failed, onStatus, onRunMcgill }) {
  const [showTrials, setShowTrials] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const missing = status === 'open' ? r.missing ?? [] : [];
  const toggleStatus = () => {
    if (status !== 'open') onStatus('open');
    else if (missing.length) setConfirming(true);
    else onStatus('complete');
  };
  const title = `${r.kindLabel} · ${shortDate(r.circuitDate)}`;
  const notTested = Object.entries(r.notTested).map(([k, v]) => `${SECTION_LABEL[k] ?? k} (${REASON_LABEL[v] ?? v})`);
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, font: `700 16px ${font.head}`, color: color.text }}>{title}</div>
        <span style={{ padding: '3px 10px', borderRadius: radius.pill, border: `1px solid ${color.controlBorder}`, font: `600 11px ${font.body}`, color: status === 'open' ? color.secondary : color.textSecondary }}>
          {status === 'open' ? 'Open' : 'Complete'}
        </span>
      </div>
      <Body size={12} style={{ marginTop: 4 }}>
        {join([`Protocol ${r.protocolVersion ?? '?'}`, r.weeksOfExposure != null ? `${r.weeksOfExposure} weeks of exposure` : null, r.inResearch ? 'in research' : 'not in research'])}
      </Body>
      {status === 'open' && r.openDays != null && r.openDays >= 0 ? (
        <Body size={12} style={{ marginTop: 4 }}>Open since {shortDate(r.circuitDate)} ({r.openDays} {r.openDays === 1 ? 'day' : 'days'})</Body>
      ) : null}
      {missing.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
          {missing.map((m) => <Body key={m} size={12} tone={color.secondary}>{m}</Body>)}
        </div>
      ) : null}
      <Body size={13} style={{ marginTop: 10 }}>
        {r.maturity.offset != null
          ? `Maturity offset ${r.maturity.offset} · ${r.maturity.label}${r.maturity.note ? ` (${r.maturity.note})` : ''}`
          : r.maturity.missing}
      </Body>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
        {TABLE_ROWS.filter((row) => row.value(r) != null && row.label !== 'Maturity offset (years)' && row.label !== 'Maturity').map((row) => {
          const marker = row.marker && r.markers ? r.markers[row.marker] : null;
          return (
            <div key={row.label} style={{ display: 'flex', gap: 10, font: `400 13px ${font.body}`, color: color.textSecondary }}>
              <span style={{ flex: 1 }}>{row.label}</span>
              <span style={{ color: color.text }}>{row.value(r)}</span>
              {marker ? <span style={{ color: MARKER_TONE[marker] }}>{MARKER_TEXT[marker]}</span> : null}
            </div>
          );
        })}
      </div>
      {r.flags.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          <SectionLabel>Flags</SectionLabel>
          {r.flags.map((f) => <Body key={f.code + f.text} size={12} tone={color.secondary}>{f.text}</Body>)}
        </div>
      ) : null}
      {notTested.length ? <Body size={12} style={{ marginTop: 8 }}>Not tested: {notTested.join(', ')}</Body> : null}
      {showTrials ? <Trials w={r.window} /> : null}
      {failed ? <ErrorNotice title="Not saved" style={{ marginTop: 10 }}>The window was not marked {status === 'open' ? 'complete' : 'open'}. Check the connection and try again.</ErrorNotice> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <Button variant="outline" height={40} aria-label={`${showTrials ? 'Hide' : 'Show'} every trial: ${r.kindLabel}, ${shortDate(r.circuitDate)}`} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={() => setShowTrials((v) => !v)}>
          {showTrials ? 'Hide trials' : 'Every trial'}
        </Button>
        {staff && r.mcgillDue && onRunMcgill ? (
          <Button variant="outline" height={40} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={onRunMcgill}>Run McGill block</Button>
        ) : null}
        {staff ? (
          <Button variant={status === 'open' ? 'secondary' : 'outline'} height={40} loading={busy} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }}
            onClick={toggleStatus}>
            {status === 'open' ? 'Mark window complete' : 'Reopen window'}
          </Button>
        ) : null}
      </div>
      {confirming && status === 'open' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <Body size={12}>
            Complete this window with {missing.length === 1 ? 'this' : 'these'} still missing? Golf coaches can only enter clubhead speed and Parallax on an open window.
          </Body>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" height={40} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={() => { setConfirming(false); onStatus('complete'); }}>
              Complete anyway
            </Button>
            <Button variant="outline" height={40} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={() => setConfirming(false)}>Keep open</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
```

Create `frontend/src/portal/components/assessments/ResultsTable.js`:

```js
import React from 'react';
import { color, font } from '../../tokens';
import { MARKER_TONE } from './WindowCard';
import { MARKER_TEXT, TABLE_ROWS } from '../../data/assessmentResults';
import { shortDate } from '../../data/assessmentWindows';

const ARROW = { gain: '↑', within: '=', drop: '↓' };
const cell = { padding: '7px 10px', borderBottom: `1px solid ${color.rowRule}`, font: `400 12px ${font.body}`, color: color.textSecondary, textAlign: 'left' };

/** Desktop (> 1100 px): every window side by side, newest first, one row per score with its change marker (spec 5). */
export default function ResultsTable({ windows }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <div role="table" aria-label="Results by window" style={{ display: 'table', width: '100%', borderCollapse: 'collapse' }}>
        <div role="row" style={{ display: 'table-row' }}>
          <div role="columnheader" style={{ ...cell, display: 'table-cell', font: `600 11px ${font.body}`, color: color.textTertiary }}>Measure</div>
          {windows.map((r) => (
            <div key={r.id} role="columnheader" style={{ ...cell, display: 'table-cell', font: `600 11px ${font.body}`, color: color.text }}>{r.kindLabel} · {shortDate(r.circuitDate)}</div>
          ))}
        </div>
        {TABLE_ROWS.filter((row) => windows.some((r) => row.value(r) != null)).map((row) => (
          <div key={row.label} role="row" style={{ display: 'table-row' }}>
            <div role="rowheader" style={{ ...cell, display: 'table-cell' }}>{row.label}</div>
            {windows.map((r) => {
              const marker = row.marker && r.markers ? r.markers[row.marker] : null;
              const value = row.value(r);
              return (
                <div key={r.id} role="cell" style={{ ...cell, display: 'table-cell', color: color.text }}>
                  {value ?? '-'}
                  {marker ? <span title={MARKER_TEXT[marker]} aria-label={MARKER_TEXT[marker]} style={{ marginLeft: 6, color: MARKER_TONE[marker] }}>{ARROW[marker]}</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Create `frontend/src/portal/screens/AssessmentResults.js`:

```js
import React, { useMemo, useState } from 'react';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import WindowCard from '../components/assessments/WindowCard';
import ResultsTable from '../components/assessments/ResultsTable';
import { BackLink, Body, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { useAthleteAssessments } from '../hooks/assessments';
import { saveWindowFields } from '../hooks/assessmentsLive';
import { assessmentAccess } from '../data/assessmentAccess';
import { buildResults } from '../data/assessmentResults';
import { CONSENT_LABEL, shortDate } from '../data/assessmentWindows';
import { academyDateISO } from '../data/calendar';

const SEX_LABEL = { male: 'Male', female: 'Female' };

/**
 * One athlete's results (spec 5 "Results (coach)"): every window, newest
 * first, as data/assessmentResults.js builds it; on desktop the table of
 * every window above the cards. Every coach reads it; staff (Phil,
 * assessors, ops, owner) mark a window complete or reopen it and run a
 * McGill block it is missing. The athlete record itself may be refused to
 * a golf coach outside their sessions; the results still show, under the
 * name the list passed.
 */
export default function AssessmentResults({ bare = false, athleteId, viewer, fallbackName = null, onBack, onRunMcgill, today = academyDateISO() }) {
  const layout = useLayoutClass();
  const { data, loading, error } = useAthleteAssessments(athleteId);
  const staff = assessmentAccess(viewer) === 'staff';
  const [status, setStatus] = useState({});
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState(null);
  const results = useMemo(() => (data ? buildResults({ athleteId, ...data, today }) : null), [athleteId, data, today]);
  const name = results?.name ?? fallbackName ?? 'Athlete';

  const setWindowStatus = async (windowId, next) => {
    setBusy(windowId);
    setFailed(null);
    try {
      await saveWindowFields({ athleteId, windowId, fields: { status: next } });
      setStatus((all) => ({ ...all, [windowId]: next }));
    } catch (err) {
      setFailed(windowId);
    } finally {
      setBusy(null);
    }
  };

  const about = results
    ? [CONSENT_LABEL[results.consent], results.firstTestDate ? `First test ${shortDate(results.firstTestDate)}` : null, SEX_LABEL[results.sex] ?? null].filter(Boolean).join(' · ')
    : null;
  const header = (
    <div style={{ padding: '4px 22px 12px' }}>
      <BackLink onClick={onBack}>‹ Back</BackLink>
      <ScreenTitle size={21} style={{ marginTop: 8 }}>{name}</ScreenTitle>
      {about ? <Body size={12} style={{ marginTop: 3 }}>{about}</Body> : null}
    </div>
  );

  return (
    <AssessmentFrame bare={bare} layout={layout} header={header}>
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && !data ? <ErrorNotice>The results didn't load. Check your connection and try again.</ErrorNotice> : null}
        {loading && !data ? <Body size={12}>Loading results…</Body> : null}
        {results && results.windows.length === 0 ? <Body size={13}>No assessments yet.</Body> : null}
        {results && results.windows.length && layout === 'desktop' ? <ResultsTable windows={results.windows} /> : null}
        {results
          ? results.windows.map((r) => (
              <WindowCard
                key={r.id}
                result={r}
                status={status[r.id] ?? r.status}
                staff={staff}
                busy={busy === r.id}
                failed={failed === r.id}
                onStatus={(next) => setWindowStatus(r.id, next)}
                onRunMcgill={r.wave && onRunMcgill ? () => onRunMcgill(r.wave.id) : null}
              />
            ))
          : null}
      </div>
    </AssessmentFrame>
  );
}
```

In `frontend/src/portal/AssessmentRoutes.js`, replace:

```js
export const loadAssessmentWave = () => import('./screens/AssessmentWave');
const AssessmentWave = lazy(loadAssessmentWave);
```

with:

```js
export const loadAssessmentWave = () => import('./screens/AssessmentWave');
const AssessmentWave = lazy(loadAssessmentWave);
export const loadAssessmentResults = () => import('./screens/AssessmentResults');
const AssessmentResults = lazy(loadAssessmentResults);
```

Append to `frontend/src/portal/AssessmentRoutes.js`:

```js
/**
 * /portal/assessments/athlete/:athleteId - every coach, ops and owner
 * (reader level). Navigation state `name` is the athlete's name from the
 * list or athlete detail, shown when the record itself is not readable.
 * "Run McGill block" reopens the window's wave on its McGill station.
 */
export function AssessmentResultsRoute() {
  const { athleteId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { viewer } = useViewer();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return (
    <AssessmentResults
      bare
      athleteId={athleteId}
      viewer={viewer}
      fallbackName={state?.name ?? null}
      onBack={() => (canGoBack ? navigate(-1) : navigate('/portal'))}
      onRunMcgill={(waveId) => navigate(`/portal/assessments/wave/${waveId}`, { state: { station: 'mcgill' } })}
    />
  );
}
```

In `frontend/src/portal/PortalRoutes.js`, replace:

```js
import { AssessmentListRoute, AssessmentWaveRoute, RequireAssessment, loadAssessmentList } from './AssessmentRoutes';
```

with:

```js
import { AssessmentListRoute, AssessmentResultsRoute, AssessmentWaveRoute, RequireAssessment, loadAssessmentList } from './AssessmentRoutes';
import { assessmentAccess } from './data/assessmentAccess';
```

then replace:

```js
      backLabel={backLabel}
      onBack={() => navigate(back)}
    />
  );
}

/**
 * Bare /portal:
```

with:

```js
      backLabel={backLabel}
      onBack={() => navigate(back)}
      onOpenAssessments={assessmentAccess(user) ? (name) => navigate(`/portal/assessments/athlete/${athleteId}`, { state: { name } }) : undefined}
    />
  );
}

/**
 * Bare /portal:
```

then replace:

```js
            <RequireAssessment level="staff" landingFor={landingFor}>
              <AssessmentWaveRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
```

with:

```js
            <RequireAssessment level="staff" landingFor={landingFor}>
              <AssessmentWaveRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
      <Route
        path="assessments/athlete/:athleteId"
        element={
          <RequireRole roles={['coach', 'mental', 'ops', 'owner']}>
            <RequireAssessment level="reader" landingFor={landingFor}>
              <AssessmentResultsRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
```

In `frontend/src/portal/screens/AthleteDetail.js`, replace:

```js
import AthleteMembershipCard from '../components/AthleteMembershipCard';
```

with:

```js
import AssessmentsEntryCard from '../components/AssessmentsEntryCard';
import AthleteMembershipCard from '../components/AthleteMembershipCard';
```

then replace:

```js
export default function AthleteDetail({ variant = 'populated', bare = false, athleteId, noTier, role = 'parent', backLabel, onBack }) {
```

with:

```js
export default function AthleteDetail({ variant = 'populated', bare = false, athleteId, noTier, role = 'parent', backLabel, onBack, onOpenAssessments }) {
```

then replace:

```js
        <HandicapCard athleteId={athleteId} athlete={athlete} role={role} />
```

with:

```js
        <HandicapCard athleteId={athleteId} athlete={athlete} role={role} />
        {/* Assessments (2026-10-14 spec 5): coaches, Phil, ops and owner open
            this athlete's results; the route passes the handler only to them. */}
        {onOpenAssessments ? (
          <AssessmentsEntryCard
            body="Every physical assessment window for this athlete: scores, flags and every trial."
            label="Open results"
            onOpen={() => onOpenAssessments(athlete?.name ?? null)}
          />
        ) : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/assessmentResults.test.js src/portal/screens/AssessmentResults.test.js src/portal/AssessmentRoutes.test.js src/portal/screens/AthleteDetail.test.js src/portal/PortalRoutes`
Expected: PASS (the existing PortalRoutes suites included: the athlete-detail route only gains a prop).

Run: `cd frontend && npx eslint src/portal`
Expected: no errors, no warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/data/assessmentResults.js frontend/src/portal/data/assessmentResults.test.js frontend/src/portal/components/assessments frontend/src/portal/screens/AssessmentResults.js frontend/src/portal/screens/AssessmentResults.test.js frontend/src/portal/AssessmentRoutes.js frontend/src/portal/AssessmentRoutes.test.js frontend/src/portal/PortalRoutes.js frontend/src/portal/screens/AthleteDetail.js frontend/src/portal/screens/AthleteDetail.test.js
git commit -m "feat(assessments): coach results view with markers and flags

Every window newest first: scores from the trials, the maturity offset
or what is missing, change markers switched off across versions and
modes, the protocol's flags, every trial on request, the desktop table,
and staff actions to complete a window (asking first while clubhead speed
or McGill is missing) or run its McGill block.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Golf-session clubhead speed and Parallax entry

**Files:**
- Create: `frontend/src/portal/screens/AssessmentGolf.js`
- Create: `frontend/src/portal/components/assessments/ClubheadChip.js`
- Modify: `frontend/src/portal/screens/Roster.js` (imports; `SessionAttendance` takes `onOpenClubhead` and shows the chip on training sessions)
- Modify: `frontend/src/portal/AssessmentRoutes.js` (loader, `AssessmentGolfRoute`)
- Modify: `frontend/src/portal/PortalRoutes.js` (import; `SessionAttendanceRoute` passes `onOpenClubhead`; the golf route)
- Test: `frontend/src/portal/screens/AssessmentGolf.test.js`, `frontend/src/portal/screens/Roster.clubhead.test.js`, `frontend/src/portal/screens/Roster.reserved.test.js` (one mock), `frontend/src/portal/AssessmentRoutes.test.js` (one mock, appended tests)

**Interfaces:**
- Consumes: `useAthleteAssessments` (Task 6) and `useOpenAssessmentWindows({ enabled })` returning `{ data: { byAthlete: { [athleteId]: { windowId, kind, circuitDate, golfDate, circuitMode } } } }` (Task 6); `saveSection`, `saveWindowFields` (Task 5); `useSaveTracker` (Task 11); `TrialInput`, `TextEntry`, `FieldRow`, `SaveState` (Tasks 11 and 13); `clubheadScores` (Task 1); `KIND_LABEL`, `ENTRY_WINDOW_DAYS`, `GOLF_WINDOW_DAYS`, `daysBetween`, `shortDate`, `toISODate` (Task 2); `RequireAssessment` (Task 12).
- Produces: `AssessmentGolf({ bare, athleteId, fallbackName, onBack })`, `CLUBHEAD_CUE`, `EMPTY_GOLF`, `swingDateProblem(date, today)`; `ClubheadChip({ entry, name, onOpen })`; `SessionAttendance`'s `onOpenClubhead(athleteId, name)` (passed only to a viewer `assessmentAccess` admits, so a mental account without the permission never sends the refused windows read); the route `/portal/assessments/golf/:athleteId` (reader level: every coach). Golf is written as `{ speeds: [mph x clubheadMax], driver, parallaxComposite, fps }` with the window's `golfDate` - the two writes firestore.rules lets any coach make on an open window.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/screens/AssessmentGolf.test.js`:

```js
import React, { act } from 'react';
import { renderScreen } from './testRender';
import AssessmentGolf from './AssessmentGolf';
import { DEFAULT_SETTINGS, circuitModeOf, withDefaults } from '../data/assessmentSettings';

let mockData;
let mockSaves;
jest.mock('../hooks/assessments', () => ({ useAthleteAssessments: () => ({ data: mockData, loading: false, error: null }) }));
jest.mock('../hooks/assessmentsLive', () => ({
  saveSection: async (args) => { mockSaves.push(['section', args]); return args; },
  saveWindowFields: async (args) => { mockSaves.push(['fields', args]); return args; },
}));

const MODE = circuitModeOf(DEFAULT_SETTINGS);
const open = (over = {}) => ({ id: '2026-27-baseline', athleteId: 'seed-dev', kind: 'baseline', season: '2026-27', status: 'open', circuitDate: '2026-11-03', golfDate: null, circuitMode: MODE, enteredBy: {}, ...over });
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const screen = (props = {}) => renderScreen(<AssessmentGolf bare athleteId="seed-dev" onBack={() => {}} {...props} />);

beforeEach(() => {
  mockSaves = [];
  mockData = { athlete: { id: 'seed-dev', name: 'Dev Patel', dob: '2011-11-05', consents: {} }, profile: { athleteId: 'seed-dev', driver: 'TSR3 10.5' }, windows: [open()], settings: withDefaults(null) };
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-05T22:00:00Z')); // Nov 5, 4 PM in Chicago
});
afterEach(() => { jest.useRealTimers(); });

test('the cue, the swing counts and the open window', async () => {
  const r = await screen();
  expect(r.text()).toContain('Dev Patel');
  expect(r.text()).toContain('Baseline · circuit Nov 3');
  expect(r.text()).toContain("Fastest swing you've got. Don't worry about where it goes.");
  expect(r.text()).toContain('3 warm-up swings, then 5 maximal.');
  await r.unmount();
});

test('each swing saves the golf section; the first save dates the golf today', async () => {
  const r = await screen();
  await type(r, 'Swing 1 (mph)', '88.2');
  expect(mockSaves).toEqual([
    ['section', { athleteId: 'seed-dev', windowId: '2026-27-baseline', section: 'golf', value: { speeds: [88.2, null, null, null, null], driver: 'TSR3 10.5', parallaxComposite: null, fps: null } }],
    ['fields', { athleteId: 'seed-dev', windowId: '2026-27-baseline', fields: { golfDate: '2026-11-05' } }],
  ]);
  for (const [i, v] of [[2, '90.1'], [3, '89.5'], [4, '91'], [5, '87.9']]) await type(r, `Swing ${i} (mph)`, v);
  expect(r.text()).toContain('Best 91 mph · top 3 90.2 mph');
  expect(mockSaves.filter(([k]) => k === 'fields')).toHaveLength(1);
  await type(r, 'Parallax composite', '72');
  await type(r, 'Frame rate (fps)', '60');
  expect(r.text()).toContain('Under 120 fps: timing gaps are directional only.');
  expect(mockSaves.pop()[1].value).toEqual({ speeds: [88.2, 90.1, 89.5, 91, 87.9], driver: 'TSR3 10.5', parallaxComposite: 72, fps: 60 });
  await r.unmount();
});

test('a speed out of range is refused inline and never sent', async () => {
  const r = await screen();
  await type(r, 'Swing 1 (mph)', '150');
  expect(r.text()).toContain('Clubhead speed is 30-140 mph');
  expect(mockSaves).toEqual([]);
  await r.unmount();
});

test('the swing date: any day in the last 14, never the future; late golf is warned', async () => {
  jest.setSystemTime(new Date('2026-11-12T18:00:00Z'));
  const r = await screen();
  expect(r.text()).toContain('Nov 12 is 9 days after the circuit (Nov 3); golf is due within 7 days. It will be flagged.');
  await r.fill('Swing date', '2026-11-13');
  expect(r.text()).toContain("The swing date can't be in the future.");
  expect(mockSaves).toEqual([]);
  await r.fill('Swing date', '2026-11-09');
  expect(mockSaves).toEqual([['fields', { athleteId: 'seed-dev', windowId: '2026-27-baseline', fields: { golfDate: '2026-11-09' } }]]);
  expect(r.text()).not.toContain('It will be flagged.');
  await r.unmount();
});

test('a circuit that runs golf the same day says so on any other day', async () => {
  mockData = { ...mockData, windows: [open({ circuitMode: { ...MODE, golfTiming: 'same-day' } })] };
  const r = await screen();
  expect(r.text()).toContain('This circuit runs golf the same day (Nov 3); Nov 5 will be flagged.');
  await r.unmount();
});

test('no open window says so, under the name the roster passed', async () => {
  mockData = { ...mockData, athlete: null, windows: [open({ status: 'complete' })] };
  const r = await screen({ fallbackName: 'Dev Patel' });
  expect(r.text()).toContain('Dev Patel has no open assessment window. Phil opens one when he starts a wave.');
  expect(field(r, 'Swing 1 (mph)')).toBeNull();
  await r.unmount();
});
```

Create `frontend/src/portal/screens/Roster.clubhead.test.js`:

```js
import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';

let mockOpen;
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: [
      { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'confirmed' },
      { bookingId: 'b2', athleteId: 'a2', name: 'Sam Lee', status: 'confirmed' },
    ],
    loading: false,
    error: null,
    mark: () => {},
    sessionNote: null,
    sessionStatus: 'scheduled',
    sessionMaxHandicap: null,
  }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => true }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: { byAthlete: mockOpen }, loading: false, error: null }) }));

const block = (type) => ({ date: '2026-11-05', time: '3:00 PM', type, name: type === 'training' ? 'Training block' : 'RYP Tour', meta: '2 of 6 booked' });
const roster = (type, props = {}) => renderScreen(<SessionAttendance bare sessionId="2026-11-05-0" block={block(type)} onBack={() => {}} {...props} />);

beforeEach(() => {
  mockOpen = { a1: { windowId: '2026-27-baseline', kind: 'baseline', circuitDate: '2026-11-03', golfDate: null, circuitMode: null } };
});

test('a training session shows "Clubhead speed" on an athlete with an open window, and opens the entry', async () => {
  const opened = [];
  const r = await roster('training', { onOpenClubhead: (id, name) => opened.push([id, name]) });
  expect(r.button('Clubhead speed: Sam Lee')).toBeNull();
  await r.click('Clubhead speed: Jordan Whitfield');
  expect(opened).toEqual([['a1', 'Jordan Whitfield']]);
  await r.unmount();
});

test('golf already entered reads as entered; it can still be opened to correct', async () => {
  mockOpen = { a1: { ...mockOpen.a1, golfDate: '2026-11-05' } };
  const r = await roster('training', { onOpenClubhead: () => {} });
  expect(r.text()).toContain('Clubhead speed · entered');
  await r.unmount();
});

test('a Tour event, or a roster opened without the handler, shows no chip', async () => {
  const tour = await roster('tournament', { onOpenClubhead: () => {} });
  expect(tour.button('Clubhead speed: Jordan Whitfield')).toBeNull();
  await tour.unmount();
  const plain = await roster('training');
  expect(plain.button('Clubhead speed: Jordan Whitfield')).toBeNull();
  await plain.unmount();
});
```

In `frontend/src/portal/screens/Roster.reserved.test.js`, replace:

```js
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => mockLive }));
```

with:

```js
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => mockLive }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: null, loading: false, error: null }) }));
```

In `frontend/src/portal/AssessmentRoutes.test.js`, replace:

```js
jest.mock('./screens/AssessmentResults', () => {
```

with:

```js
jest.mock('./screens/AssessmentGolf', () => ({ __esModule: true, default: ({ athleteId, fallbackName }) => `GOLF ${athleteId} ${fallbackName ?? ''}`.trim() }));
jest.mock('./screens/AssessmentResults', () => {
```

Append to `frontend/src/portal/AssessmentRoutes.test.js`:

```js
test('every coach reaches clubhead entry; families go home', async () => {
  for (const user of [{ uid: 'c', role: 'coach' }, { uid: 'p', role: 'coach', specialistId: 'phil' }]) {
    mockUser.value = user;
    const r = await mount('/portal/assessments/golf/seed-dev');
    expect(r.text()).toBe('GOLF seed-dev');
    await r.unmount();
  }
  mockUser.value = { uid: 'k', role: 'athlete', athleteId: 'seed-dev' };
  const a = await mount('/portal/assessments/golf/seed-dev');
  expect(a.pathname()).toBe('/portal/home');
  await a.unmount();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AssessmentGolf.test.js src/portal/screens/Roster.clubhead.test.js src/portal/AssessmentRoutes.test.js`
Expected: FAIL - "Cannot find module './AssessmentGolf'", no "Clubhead speed: Jordan Whitfield" button, and the golf route renders nothing.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/components/assessments/ClubheadChip.js`:

```js
import React from 'react';
import { color, font, radius } from '../../tokens';

/**
 * The golf coach's way in to clubhead entry (spec 5: "golf coaches see a
 * 'Clubhead speed' entry on an athlete with an open window in their
 * session roster"). Nothing without an open window; once golf is in it
 * reads "entered" and still opens, to correct.
 */
export default function ClubheadChip({ entry, name, onOpen }) {
  if (!entry) return null;
  const done = Boolean(entry.golfDate);
  return (
    <button
      type="button"
      aria-label={`Clubhead speed: ${name}`}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      style={{
        marginTop: 6,
        minHeight: 36,
        padding: '0 12px',
        borderRadius: radius.pill,
        border: `1px solid ${done ? color.controlBorder : color.primary}`,
        background: 'transparent',
        color: done ? color.textSecondary : color.primary,
        font: `600 12px ${font.body}`,
        cursor: 'pointer',
      }}
    >
      {done ? 'Clubhead speed · entered' : 'Clubhead speed'}
    </button>
  );
}
```

Create `frontend/src/portal/screens/AssessmentGolf.js`:

```js
import React, { useEffect, useState } from 'react';
import { color, font, radius } from '../tokens';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import CancelSheet from '../components/CancelSheet';
import FieldRow from '../components/assessments/FieldRow';
import SaveState from '../components/assessments/SaveState';
import TrialInput, { TextEntry } from '../components/assessments/TrialInput';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useAthleteAssessments } from '../hooks/assessments';
import { saveSection, saveWindowFields } from '../hooks/assessmentsLive';
import useSaveTracker from '../hooks/assessmentSaves';
import { clubheadScores } from '../data/assessmentScoring';
import { setAt } from '../data/assessmentInput';
import { ENTRY_WINDOW_DAYS, GOLF_WINDOW_DAYS, KIND_LABEL, daysBetween, shortDate, toISODate } from '../data/assessmentWindows';

export const CLUBHEAD_CUE = "Fastest swing you've got. Don't worry about where it goes.";
export const EMPTY_GOLF = { speeds: [], driver: null, parallaxComposite: null, fps: null };

/** A coach-set swing date: in the last 14 days (spec 4.1) and never in the future. */
export function swingDateProblem(date, today) {
  const d = daysBetween(date, today);
  if (d == null) return 'Pick a date.';
  if (d < 0) return "The swing date can't be in the future.";
  if (d > ENTRY_WINDOW_DAYS) return `Pick a date in the last ${ENTRY_WINDOW_DAYS} days.`;
  return null;
}

const latestOpen = (windows) => [...(windows || [])].filter((w) => w.status === 'open').sort((a, b) => (a.circuitDate || '').localeCompare(b.circuitDate || '')).pop() ?? null;

/**
 * Clubhead speed and Parallax in the golf session (spec 2, decision 2;
 * protocol Section 4): every coach, from their own login, on the athlete's
 * open window - the golf section and its date are the only writes the
 * rules allow them. 3 warm-up swings, then 5 maximal (the trial-count
 * setting); every speed saves as typed; the first save dates the golf
 * today and the date can be moved to another day in the last 14. Golf more
 * than 7 days after the circuit (or not the same day, when the circuit
 * says so) is warned here and flagged in the results.
 */
export default function AssessmentGolf({ bare = false, athleteId, fallbackName = null, onBack }) {
  const layout = useLayoutClass();
  const { data, loading, error } = useAthleteAssessments(athleteId);
  const tracker = useSaveTracker();
  const [w, setW] = useState(null);
  const [dateError, setDateError] = useState(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (w === null && data) setW(latestOpen(data.windows) ?? false);
  }, [data, w]);

  const name = data?.athlete?.name ?? fallbackName ?? 'This athlete';
  const today = toISODate(Date.now());
  const counts = w ? w.circuitMode?.trialCounts ?? {} : {};
  const n = counts.clubheadMax ?? 5;
  const golf = { ...EMPTY_GOLF, driver: data?.profile?.driver ?? null, ...(w?.golf || {}) };
  const scores = clubheadScores(golf);

  const saveDate = (golfDate) => {
    setW((cur) => ({ ...cur, golfDate }));
    tracker.run(`${athleteId}:fields`, () => saveWindowFields({ athleteId, windowId: w.id, fields: { golfDate } }));
  };
  const saveGolf = (patch) => {
    const next = { ...golf, ...patch };
    setW((cur) => ({ ...cur, golf: next }));
    tracker.run(`${athleteId}:golf`, () => saveSection({ athleteId, windowId: w.id, section: 'golf', value: next }));
    if (!w.golfDate) saveDate(today);
  };
  const leave = () => (tracker.unsaved ? setLeaving(true) : onBack());

  const golfDate = w ? w.golfDate ?? today : null;
  const after = w ? daysBetween(w.circuitDate, golfDate) : null;
  const sameDay = w && w.circuitMode?.golfTiming === 'same-day';
  const warning = !w ? null
    : sameDay && after !== 0 ? `This circuit runs golf the same day (${shortDate(w.circuitDate)}); ${shortDate(golfDate)} will be flagged.`
      : after != null && after > GOLF_WINDOW_DAYS ? `${shortDate(golfDate)} is ${after} days after the circuit (${shortDate(w.circuitDate)}); golf is due within ${GOLF_WINDOW_DAYS} days. It will be flagged.`
        : null;

  const header = (
    <div style={{ padding: '4px 22px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackLink onClick={leave}>‹ Back</BackLink>
        <div style={{ flex: 1 }} />
        <SaveState entry={tracker.entries[`${athleteId}:golf`] ?? tracker.entries[`${athleteId}:fields`] ?? null} onRetry={() => tracker.retry(`${athleteId}:golf`)} />
      </div>
      <ScreenTitle size={21} style={{ marginTop: 8 }}>Clubhead speed</ScreenTitle>
      <Body size={12} style={{ marginTop: 3 }}>{name}{w ? ` · ${KIND_LABEL[w.kind]} · circuit ${shortDate(w.circuitDate)}` : ''}</Body>
    </div>
  );

  return (
    <AssessmentFrame bare={bare} layout={layout} header={header}>
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && !data ? <ErrorNotice>The assessment didn't load. Check your connection and try again.</ErrorNotice> : null}
        {loading && !data ? <Body size={12}>Loading…</Body> : null}
        {w === false ? <Body size={13}>{name} has no open assessment window. Phil opens one when he starts a wave.</Body> : null}
        {w ? (
          <>
            <Card large>
              <SectionLabel>Clubhead speed</SectionLabel>
              <Body size={13} style={{ marginTop: 8 }}>{CLUBHEAD_CUE}</Body>
              <Body size={11} tone={color.textTertiary} style={{ marginTop: 8 }}>{counts.clubheadWarmup ?? 3} warm-up swings, then {n} maximal.</Body>
            </Card>
            <Card large>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FieldRow label="Swing date">
                  <input type="date" aria-label="Swing date" value={golfDate} max={today}
                    onChange={(e) => {
                      const problem = swingDateProblem(e.target.value, today);
                      setDateError(problem);
                      if (!problem) saveDate(e.target.value);
                    }}
                    style={{ height: 44, background: color.track, border: `1px solid ${dateError ? color.error : color.border}`, borderRadius: radius.input, color: color.text, font: `500 16px ${font.body}`, padding: '0 10px' }} />
                </FieldRow>
                {dateError ? <Body size={12} tone={color.error}>{dateError}</Body> : null}
                {warning ? <Body size={12} tone={color.secondary}>{warning}</Body> : null}
                <FieldRow label="Maximal swings (mph)">
                  {Array.from({ length: n }, (_, i) => (
                    <TrialInput key={i} label={`Swing ${i + 1} (mph)`} value={golf.speeds?.[i] ?? null} rangeKey="clubhead" width={78}
                      onCommit={(v) => saveGolf({ speeds: setAt(golf.speeds, i, v, n) })} />
                  ))}
                </FieldRow>
                <FieldRow label="Driver">
                  <TextEntry label="Driver" value={golf.driver} max={40} onCommit={(driver) => saveGolf({ driver })} />
                </FieldRow>
                {scores.best != null ? (
                  <Body size={12}>Best {scores.best} mph{scores.top3Mean != null ? ` · top 3 ${scores.top3Mean} mph` : ''}</Body>
                ) : null}
              </div>
            </Card>
            <Card large>
              <SectionLabel>Parallax</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                <FieldRow label="Composite">
                  <TrialInput label="Parallax composite" value={golf.parallaxComposite} rangeKey="parallax" width={78} onCommit={(parallaxComposite) => saveGolf({ parallaxComposite })} />
                </FieldRow>
                <FieldRow label="Frame rate (fps)">
                  <TrialInput label="Frame rate (fps)" value={golf.fps} rangeKey="fps" width={78} onCommit={(fps) => saveGolf({ fps })} />
                </FieldRow>
                {scores.fpsDirectional ? <Body size={12} tone={color.secondary}>Under 120 fps: timing gaps are directional only.</Body> : null}
              </div>
            </Card>
          </>
        ) : null}
      </div>
      {leaving ? (
        <CancelSheet
          title="Leave this entry?"
          summary="Something typed here has not reached the server yet. If you leave now, it may be lost."
          confirmLabel="Leave anyway"
          busyLabel="Leaving"
          keepLabel="Stay"
          onClose={() => setLeaving(false)}
          onConfirm={async () => {}}
          onCancelled={onBack}
        />
      ) : null}
    </AssessmentFrame>
  );
}
```

In `frontend/src/portal/screens/Roster.js`, replace:

```js
import { ReservedChip } from '../components/Reserved';
```

with:

```js
import { ReservedChip } from '../components/Reserved';
import ClubheadChip from '../components/assessments/ClubheadChip';
import { useOpenAssessmentWindows } from '../hooks/assessments';
```

then replace:

```js
export function SessionAttendance({ variant = 'pre', bare = false, onBack, sessionId, blockIndex, block, role = 'coach' }) {
```

with:

```js
export function SessionAttendance({ variant = 'pre', bare = false, onBack, sessionId, blockIndex, block, role = 'coach', onOpenClubhead }) {
```

then replace:

```js
  const liveAttendance = useSessionAttendance(sessionId);
  const live = isLive() && sessionId != null;
```

with:

```js
  const liveAttendance = useSessionAttendance(sessionId);
  const live = isLive() && sessionId != null;
  // Assessments (2026-10-14 spec 5): which athletes have an open window, for
  // the golf coach's "Clubhead speed" entry on a training session. Read only
  // when the route gave the entry (a viewer the rules let read windows).
  const openWindows = useOpenAssessmentWindows({ enabled: Boolean(onOpenClubhead) });
```

then replace:

```js
                avatarSize={42}
                nameSize={16}
                divider={i < roster.length - 1 && !noShow}
                trailing={
                  sessionCancelled ? (
                    <StatusBadge tone="muted">Cancelled</StatusBadge>
                  ) : (
                    <AttendanceControls
                      value={value}
                      onChange={(next) => mark(athlete.id, next)}
                    />
                  )
                }
              />
```

with:

```js
                avatarSize={42}
                nameSize={16}
                divider={i < roster.length - 1 && !noShow}
                trailing={
                  sessionCancelled ? (
                    <StatusBadge tone="muted">Cancelled</StatusBadge>
                  ) : (
                    <AttendanceControls
                      value={value}
                      onChange={(next) => mark(athlete.id, next)}
                    />
                  )
                }
              >
                {session?.type === 'training' && onOpenClubhead ? (
                  <ClubheadChip entry={openWindows.data?.byAthlete?.[athlete.id]} name={athlete.name} onOpen={() => onOpenClubhead(athlete.id, athlete.name)} />
                ) : null}
              </AthleteRow>
```

In `frontend/src/portal/AssessmentRoutes.js`, replace:

```js
export const loadAssessmentResults = () => import('./screens/AssessmentResults');
const AssessmentResults = lazy(loadAssessmentResults);
```

with:

```js
export const loadAssessmentResults = () => import('./screens/AssessmentResults');
const AssessmentResults = lazy(loadAssessmentResults);
export const loadAssessmentGolf = () => import('./screens/AssessmentGolf');
const AssessmentGolf = lazy(loadAssessmentGolf);
```

Append to `frontend/src/portal/AssessmentRoutes.js`:

```js
/** /portal/assessments/golf/:athleteId - every coach, from the session roster; navigation state `name` is the roster's name for the athlete. */
export function AssessmentGolfRoute() {
  const { athleteId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return <AssessmentGolf bare athleteId={athleteId} fallbackName={state?.name ?? null} onBack={() => (canGoBack ? navigate(-1) : navigate('/portal'))} />;
}
```

In `frontend/src/portal/PortalRoutes.js`, replace:

```js
import { AssessmentListRoute, AssessmentResultsRoute, AssessmentWaveRoute, RequireAssessment, loadAssessmentList } from './AssessmentRoutes';
```

with:

```js
import { AssessmentGolfRoute, AssessmentListRoute, AssessmentResultsRoute, AssessmentWaveRoute, RequireAssessment, loadAssessmentList } from './AssessmentRoutes';
```

then replace:

```js
      sessionId={state?.sessionId ?? undefined}
      block={state?.block ?? undefined}
      role={role}
    />
```

with:

```js
      sessionId={state?.sessionId ?? undefined}
      block={state?.block ?? undefined}
      role={role}
      onOpenClubhead={!live || assessmentAccess(user) ? (athleteId, name) => navigate(`/portal/assessments/golf/${athleteId}`, { state: { name } }) : undefined}
    />
```

then replace:

```js
            <RequireAssessment level="reader" landingFor={landingFor}>
              <AssessmentResultsRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
```

with:

```js
            <RequireAssessment level="reader" landingFor={landingFor}>
              <AssessmentResultsRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
      <Route
        path="assessments/golf/:athleteId"
        element={
          <RequireRole roles={['coach', 'mental', 'ops', 'owner']}>
            <RequireAssessment level="reader" landingFor={landingFor}>
              <AssessmentGolfRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AssessmentGolf.test.js src/portal/screens/Roster src/portal/AssessmentRoutes.test.js src/portal/PortalRoutes`
Expected: PASS.

Run: `cd frontend && npx eslint src/portal`
Expected: no errors, no warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/screens/AssessmentGolf.js frontend/src/portal/screens/AssessmentGolf.test.js frontend/src/portal/components/assessments/ClubheadChip.js frontend/src/portal/screens/Roster.js frontend/src/portal/screens/Roster.clubhead.test.js frontend/src/portal/screens/Roster.reserved.test.js frontend/src/portal/AssessmentRoutes.js frontend/src/portal/AssessmentRoutes.test.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(assessments): clubhead speed and Parallax from the golf session

A 'Clubhead speed' chip on training-session rosters for athletes with an
open window opens the golf entry: five maximal swings, driver, Parallax
composite and frame rate, dated the day it is entered, late golf warned.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Protocol settings screen and the version sheet

**Files:**
- Create: `frontend/src/portal/screens/AssessmentSettings.js`
- Create: `frontend/src/portal/components/assessments/VersionSheet.js`
- Modify: `frontend/src/portal/data/assessmentInput.js` (four ranges for the settings form; a signed entry for the Moore coefficients)
- Modify: `frontend/src/portal/AssessmentRoutes.js` (loader, `AssessmentSettingsRoute`)
- Modify: `frontend/src/portal/PortalRoutes.js` (import; the settings route)
- Test: `frontend/src/portal/screens/AssessmentSettings.test.js`, `frontend/src/portal/data/assessmentInput.test.js` (appended test), `frontend/src/portal/AssessmentRoutes.test.js` (one mock, appended test)

**Interfaces:**
- Consumes: `useAssessmentSettings()` returning `{ data: { settings, stored } }` (Task 6); `saveAssessmentSettings(settings)` (Task 5, refuses a label that is not `vN.N[.N]`, bumps `'assessmentSettings'`); `withDefaults`, `procedureChanged`, `nextPatch`, `validVersionLabel`, `TRIAL_LIMITS` (Task 2); `canEditAssessmentSettings`, `assessmentAccess` (Task 3); `Choice`, `TrialInput` (Task 11); `AssessmentFrame`, `useLayoutClass` (Task 11); `RequireAssessment` (Task 12). `AssessmentList`'s `onOpenSettings` already navigates to `/portal/assessments/settings` (Task 12).
- Produces: `AssessmentSettings({ bare, viewer, onBack })`; `VersionSheet({ current, saving, error, onSave(label), onClose })` and `versionProblem(label, current)`; `RANGES.restSec` (0-120 s), `RANGES.thresholdPct` (0-50 %), `RANGES.coefficientA` (-20 to 0) and `RANGES.coefficientB` (0-0.1) - the ranges firestore.rules checks on `assessmentSettings` (Task 4); `parseTrial` takes a leading minus only for a range that goes below 0; the Moore a and b per sex are editable (spec 4.6: Phil checks them against the paper); the route `/portal/assessments/settings` (staff level; editing for the owner and Phil only, as firestore.rules allows).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/screens/AssessmentSettings.test.js`:

```js
import React, { act } from 'react';
import { renderScreen } from './testRender';
import AssessmentSettings from './AssessmentSettings';
import { DEFAULT_SETTINGS, withDefaults } from '../data/assessmentSettings';

let mockSettings;
let mockSaves;
let mockSaveFails;
jest.mock('../hooks/assessments', () => ({ useAssessmentSettings: () => ({ data: mockSettings, loading: false, error: null }) }));
jest.mock('../hooks/assessmentsLive', () => ({
  saveAssessmentSettings: async (s) => {
    mockSaves.push(s);
    if (mockSaveFails) throw new Error('offline');
    return { protocolVersion: s.protocolVersion };
  },
}));

const PHIL = { uid: 'phil', role: 'coach', specialistId: 'phil' };
const ASSESSOR = { uid: 'a', role: 'coach', assessor: true };
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const type = async (r, label, text) => {
  await r.fill(label, text);
  await act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const screen = (viewer = PHIL) => renderScreen(<AssessmentSettings bare viewer={viewer} onBack={() => {}} />);

beforeEach(() => {
  mockSettings = { settings: withDefaults(null), stored: false };
  mockSaves = [];
  mockSaveFails = false;
});

test('Phil sees every setting at the v1.2 defaults', async () => {
  const r = await screen();
  expect(r.text()).toContain('Protocol v1.2');
  expect(r.text()).toContain('These are the protocol v1.2 defaults; nothing has been saved yet.');
  expect(field(r, 'CMJ scored jumps').value).toBe('2');
  expect(field(r, 'Grip trials per hand').value).toBe('3');
  expect(r.button('McGill: Inside the wave').getAttribute('aria-pressed')).toBe('true');
  expect(r.text()).toContain('Readiness & intake is always on: the pain check comes first.');
  expect(r.button('Save settings').disabled).toBe(true);
  await r.unmount();
});

test('a procedure change asks for the next version label and saves under it', async () => {
  const r = await screen();
  await r.fill('CMJ scored jumps', '3');
  await r.click('Save settings');
  expect(r.text()).toContain('This changes the procedure.');
  expect(field(r, 'New protocol version').value).toBe('v1.2.1');
  await r.click('Save as v1.2.1');
  expect(mockSaves).toHaveLength(1);
  expect(mockSaves[0]).toEqual({ ...withDefaults(null), protocolVersion: 'v1.2.1', trialCounts: { ...DEFAULT_SETTINGS.trialCounts, cmjScored: 3 } });
  expect(r.text()).toContain('Saved. Protocol v1.2.1.');
  expect(r.button('Save settings').disabled).toBe(true);
  await r.unmount();
});

test('the version sheet refuses an unchanged or malformed label', async () => {
  const r = await screen();
  await r.click('McGill: Its own block within 14 days');
  await r.click('Save settings');
  await r.fill('New protocol version', 'v1.2');
  expect(r.text()).toContain('Use a new label, like v1.2.1.');
  expect(r.button('Save as v1.2').disabled).toBe(true);
  await r.fill('New protocol version', 'version 2');
  expect(r.text()).toContain('A version label looks like v1.2.1.');
  await r.fill('New protocol version', 'v1.3');
  await r.click('Save as v1.3');
  expect(mockSaves[0]).toMatchObject({ protocolVersion: 'v1.3', mcgillMode: 'separate' });
  await r.unmount();
});

test('entry modes, thresholds and the coefficient check are not procedure: they save under the same version', async () => {
  const r = await screen();
  await r.click('10/5 entry: Every hop');
  await r.click('Maturity coefficients: Checked against the paper');
  await type(r, 'Threshold clubhead (%)', '3');
  await type(r, 'Threshold Parallax (%)', '');
  await r.click('Save settings');
  expect(r.text()).not.toContain('This changes the procedure.');
  expect(mockSaves).toHaveLength(1);
  expect(mockSaves[0]).toMatchObject({ protocolVersion: 'v1.2', hopEntry: 'per-hop', thresholds: { ...DEFAULT_SETTINGS.thresholds, clubhead: 3, parallax: null } });
  expect(mockSaves[0].coefficients.verified).toBe(true);
  await r.unmount();
});

test('the Moore coefficients are editable (Phil checks them against the paper) and save under the same version', async () => {
  const r = await screen();
  expect(field(r, 'Boys coefficient a').value).toBe('-8.128741');
  await type(r, 'Boys coefficient a', '-8.1287');
  await type(r, 'Girls coefficient b', '0.0042');
  await r.click('Save settings');
  expect(r.text()).not.toContain('This changes the procedure.');
  expect(mockSaves[0].protocolVersion).toBe('v1.2');
  expect(mockSaves[0].coefficients).toEqual({ ...DEFAULT_SETTINGS.coefficients, boys: { a: -8.1287, b: 0.0070346 }, girls: { a: -7.709133, b: 0.0042 } });
  await r.unmount();
});

test('a blank or out-of-range coefficient keeps Save off', async () => {
  const r = await screen();
  await type(r, 'Girls coefficient a', '-25');
  expect(r.text()).toContain('Coefficient a is -20 to 0');
  await type(r, 'Girls coefficient a', '');
  expect(r.button('Save settings').disabled).toBe(true);
  await r.unmount();
});

test('the shortest grip rest may not be longer than the longest', async () => {
  const r = await screen();
  await type(r, 'Grip rest shortest (s)', '25');
  expect(r.text()).toContain("The shortest rest can't be longer than the longest.");
  expect(r.button('Save settings').disabled).toBe(true);
  await type(r, 'Grip rest longest (s)', '30');
  expect(r.button('Save settings').disabled).toBe(false);
  await r.unmount();
});

test('a failed save says so and keeps the change', async () => {
  mockSaveFails = true;
  const r = await screen();
  await r.click('10/5 entry: Every hop');
  await r.click('Save settings');
  expect(r.text()).toContain('The settings were not saved. Check the connection and try again.');
  expect(r.button('10/5 entry: Every hop').getAttribute('aria-pressed')).toBe('true');
  expect(r.button('Save settings').disabled).toBe(false);
  await r.unmount();
});

test('assessor staff read the settings and cannot change them', async () => {
  mockSettings = { settings: { ...withDefaults(null), protocolVersion: 'v1.2.1' }, stored: true };
  const r = await screen(ASSESSOR);
  expect(r.text()).toContain('Protocol v1.2.1');
  expect(r.text()).toContain('Only Phil and the owner change these settings.');
  expect(r.button('Save settings')).toBeNull();
  expect(field(r, 'CMJ scored jumps').disabled).toBe(true);
  expect(r.button('McGill: Inside the wave').disabled).toBe(true);
  await r.unmount();
});
```

In `frontend/src/portal/AssessmentRoutes.test.js`, replace:

```js
jest.mock('./screens/AssessmentGolf', () => ({ __esModule: true, default: ({ athleteId, fallbackName }) => `GOLF ${athleteId} ${fallbackName ?? ''}`.trim() }));
```

with:

```js
jest.mock('./screens/AssessmentGolf', () => ({ __esModule: true, default: ({ athleteId, fallbackName }) => `GOLF ${athleteId} ${fallbackName ?? ''}`.trim() }));
jest.mock('./screens/AssessmentSettings', () => ({ __esModule: true, default: ({ viewer }) => `SETTINGS as ${viewer.role}` }));
```

Append to `frontend/src/portal/AssessmentRoutes.test.js`:

```js
test('settings open for staff; a coach without the permission goes home', async () => {
  mockUser.value = { uid: 'a', role: 'coach', assessor: true };
  const r = await mount('/portal/assessments/settings');
  expect(r.text()).toBe('SETTINGS as coach');
  await r.unmount();
  mockUser.value = { uid: 'c', role: 'coach' };
  const c = await mount('/portal/assessments/settings');
  expect(c.pathname()).toBe('/portal/coach');
  await c.unmount();
});
```

Append to `frontend/src/portal/data/assessmentInput.test.js`:

```js
test('a Moore coefficient may be negative; every other entry still refuses a sign', () => {
  expect(parseTrial('-8.128741', 'coefficientA')).toEqual({ ok: true, value: -8.128741 });
  expect(parseTrial('0.0070346', 'coefficientB')).toEqual({ ok: true, value: 0.0070346 });
  expect(parseTrial('-21', 'coefficientA')).toEqual({ ok: false, error: 'Coefficient a is -20 to 0' });
  expect(parseTrial('0.2', 'coefficientB')).toEqual({ ok: false, error: 'Coefficient b is 0-0.1' });
  expect(parseTrial('-3', 'grip')).toEqual({ ok: false, error: 'Numbers only, like 32.5' });
  expect(rangeLabel('coefficientA')).toBe('-20 to 0');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AssessmentSettings.test.js src/portal/data/assessmentInput.test.js src/portal/AssessmentRoutes.test.js`
Expected: FAIL - "Cannot find module './AssessmentSettings'", the settings route renders nothing, and "-8.128741" is refused as "Numbers only, like 32.5".

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/portal/data/assessmentInput.js`, replace:

```js
  otherSportHours: { lo: 0, hi: 40, unit: 'h', name: 'Other sport hours' },
};
```

with:

```js
  otherSportHours: { lo: 0, hi: 40, unit: 'h', name: 'Other sport hours' },
  // The settings form (spec 4.6): grip rest, the change-marker thresholds and the Moore (2015)
  // coefficients, as firestore.rules checks them on assessmentSettings.
  restSec: { lo: 0, hi: 120, unit: 's', name: 'Rest' },
  thresholdPct: { lo: 0, hi: 50, unit: '%', name: 'Threshold' },
  coefficientA: { lo: -20, hi: 0, unit: '', name: 'Coefficient a' },
  coefficientB: { lo: 0, hi: 0.1, unit: '', name: 'Coefficient b' },
};
```

then replace:

```js
  return r ? `${r.lo}-${r.hi}${r.unit ? ` ${r.unit}` : ''}` : '';
```

with:

```js
  return r ? `${r.lo}${r.lo < 0 ? ' to ' : '-'}${r.hi}${r.unit ? ` ${r.unit}` : ''}` : '';
```

then replace:

```js
const NUMBER = /^(\d+(\.\d+)?|\.\d+)$/;
```

with:

```js
const NUMBER = /^(\d+(\.\d+)?|\.\d+)$/;
/** A range below 0 (the Moore coefficient a) takes a leading minus; nothing else does. */
const SIGNED = /^-?(\d+(\.\d+)?|\.\d+)$/;
```

then replace:

```js
  if (!NUMBER.test(normalized)) return { ok: false, error: 'Numbers only, like 32.5' };
  const value = Number(normalized);
  const r = RANGES[rangeKey];
```

with:

```js
  const r = RANGES[rangeKey];
  if (!(r && r.lo < 0 ? SIGNED : NUMBER).test(normalized)) return { ok: false, error: 'Numbers only, like 32.5' };
  const value = Number(normalized);
```

Create `frontend/src/portal/components/assessments/VersionSheet.js`:

```js
import React, { useState } from 'react';
import { color, font, radius, tint } from '../../tokens';
import Button from '../Button';
import { Body, ScreenTitle } from '../Primitives';
import { nextPatch, validVersionLabel } from '../../data/assessmentSettings';

/** Why a new protocol version label cannot be used, or null. */
export function versionProblem(label, current) {
  if (!validVersionLabel(label)) return 'A version label looks like v1.2.1.';
  if (label === current) return `Use a new label, like ${nextPatch(current)}.`;
  return null;
}

/**
 * The protocol says any procedure change increments the version (spec
 * 4.6): saving one asks for the new label, the next patch suggested
 * (v1.2 -> v1.2.1). Results run under the old label are then flagged
 * cross-version, never silently compared. It never closes on failure.
 */
export default function VersionSheet({ current, saving, error, onSave, onClose }) {
  const [label, setLabel] = useState(nextPatch(current));
  const problem = versionProblem(label.trim(), current);
  return (
    <div onClick={saving ? undefined : onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 520, background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}>
        <ScreenTitle size={19}>New protocol version</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          This changes the procedure. The protocol says any procedure change increments the version, so results from here on are kept apart from {current} results.
        </Body>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14, font: `500 11px ${font.body}`, color: color.textSecondary }}>
          Version label
          <input aria-label="New protocol version" value={label} maxLength={16} onChange={(e) => setLabel(e.target.value)}
            style={{ height: 44, background: color.track, border: `1px solid ${problem ? color.error : color.border}`, borderRadius: radius.input, color: color.text, font: `500 16px ${font.body}`, padding: '0 10px' }} />
        </label>
        {problem ? <Body size={12} tone={color.error} style={{ marginTop: 6 }}>{problem}</Body> : null}
        {error ? <Body size={12} tone={color.error} style={{ marginTop: 6 }}>{error}</Body> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <Button height={50} loading={saving} disabled={Boolean(problem)} onClick={() => onSave(label.trim())}>Save as {label.trim()}</Button>
          <Button variant="outline" height={50} disabled={saving} style={{ boxShadow: 'none' }} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
```

Create `frontend/src/portal/screens/AssessmentSettings.js`:

```js
import React, { useEffect, useState } from 'react';
import { color, font, radius } from '../tokens';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import Button from '../components/Button';
import Choice from '../components/assessments/Choice';
import FieldRow from '../components/assessments/FieldRow';
import TrialInput from '../components/assessments/TrialInput';
import VersionSheet from '../components/assessments/VersionSheet';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useAssessmentSettings } from '../hooks/assessments';
import { saveAssessmentSettings } from '../hooks/assessmentsLive';
import { canEditAssessmentSettings } from '../data/assessmentAccess';
import { PROTOCOL_VERSION, TRIAL_LIMITS, procedureChanged, withDefaults } from '../data/assessmentSettings';

const COUNTS = [
  ['grip', 'Grip trials per hand'], ['cmjPractice', 'CMJ practice jumps'], ['cmjScored', 'CMJ scored jumps'],
  ['hopPractice', '10/5 practice sets'], ['hopScored', '10/5 scored sets'], ['medballPractice', 'Med ball practice throws'],
  ['medballScored', 'Med ball scored throws'], ['clubheadWarmup', 'Clubhead warm-up swings'], ['clubheadMax', 'Clubhead maximal swings'],
];
const STATION_TOGGLES = [['anthro', 'Anthropometrics'], ['grip', 'Grip'], ['cmj', 'CMJ'], ['hop', '10/5'], ['medball', 'Med ball'], ['mcgill', 'McGill'], ['segments', 'Arm and hand length']];
const THRESHOLDS = [['clubhead', 'clubhead'], ['cmj', 'CMJ'], ['hop', '10/5 RSI'], ['medball', 'med ball'], ['grip', 'grip'], ['parallax', 'Parallax']];
const ON_OFF = [[true, 'On'], [false, 'Off']];
const selectStyle = { height: 44, minWidth: 74, background: color.track, border: `1px solid ${color.border}`, borderRadius: radius.input, color: color.text, font: `600 16px ${font.body}`, padding: '0 10px' };

function NumberSelect({ label, value, min, max, disabled, onChange }) {
  return (
    <select aria-label={label} value={String(value)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} style={selectStyle}>
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => <option key={n} value={String(n)}>{n}</option>)}
    </select>
  );
}

/**
 * The protocol's procedure as settings, not code (spec 2 decision 9; spec
 * 4.6). Phil and the owner edit; other assessment staff read. Saving a
 * change to the procedure (trial counts, grip rest, stations, McGill mode,
 * med ball side, golf timing, wave size) asks for a new protocol version
 * label; entry modes, waves per session, the Moore coefficients and their
 * check, and the thresholds save under the same label. Every window keeps the settings it
 * ran under, so nothing here rewrites a result already taken.
 * Readiness & intake is always on: the pain check comes first.
 */
export default function AssessmentSettings({ bare = false, viewer, onBack }) {
  const layout = useLayoutClass();
  const { data, error } = useAssessmentSettings();
  const canEdit = canEditAssessmentSettings(viewer);
  const [base, setBase] = useState(null);
  const [draft, setDraft] = useState(null);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedAs, setSavedAs] = useState(null);
  useEffect(() => {
    if (!base && data) {
      setBase(withDefaults(data.settings));
      setDraft(withDefaults(data.settings));
    }
  }, [data, base]);

  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setSavedAs(null); };
  const setIn = (key, patch) => set({ [key]: { ...draft[key], ...patch } });
  const rest = draft?.gripRestSec ?? {};
  const restProblem = rest.min != null && rest.max != null && rest.min > rest.max ? "The shortest rest can't be longer than the longest." : null;
  const coefficients = draft ? [draft.coefficients.boys.a, draft.coefficients.boys.b, draft.coefficients.girls.a, draft.coefficients.girls.b] : [];
  const incomplete = draft ? rest.min == null || rest.max == null || coefficients.some((v) => v == null) : true;
  const dirty = Boolean(draft && base) && JSON.stringify(draft) !== JSON.stringify(base);

  const save = async (protocolVersion) => {
    setSaving(true);
    setSaveError(null);
    const next = { ...draft, protocolVersion };
    try {
      await saveAssessmentSettings(next);
      setBase(next);
      setDraft(next);
      setAsking(false);
      setSavedAs(protocolVersion);
    } catch (err) {
      setSaveError('The settings were not saved. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };
  const onSave = () => (procedureChanged(base, draft) ? setAsking(true) : save(base.protocolVersion));

  const header = (
    <div style={{ padding: '4px 22px 12px' }}>
      <BackLink onClick={onBack}>‹ Assessments</BackLink>
      <ScreenTitle size={21} style={{ marginTop: 8 }}>Protocol settings</ScreenTitle>
      {base ? <Body size={12} style={{ marginTop: 3 }}>Protocol {base.protocolVersion}</Body> : null}
    </div>
  );
  const footer = canEdit && draft ? (
    <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '12px 22px 18px' }}>
      <Button height={52} loading={saving && !asking} disabled={!dirty || Boolean(restProblem) || incomplete} onClick={onSave}>Save settings</Button>
    </div>
  ) : null;

  return (
    <AssessmentFrame bare={bare} layout={layout} header={header} footer={footer}>
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && !data ? <ErrorNotice>The settings didn't load. Check your connection and try again.</ErrorNotice> : null}
        {data && !data.stored ? <Body size={12}>These are the protocol {PROTOCOL_VERSION} defaults; nothing has been saved yet.</Body> : null}
        {!canEdit ? <Body size={12}>Only Phil and the owner change these settings.</Body> : null}
        {savedAs ? <Body size={12} tone={color.primary}>Saved. Protocol {savedAs}.</Body> : null}
        {saveError && !asking ? <ErrorNotice title="Not saved">{saveError}</ErrorNotice> : null}
        {draft ? (
          <>
            <Card large>
              <SectionLabel style={{ marginBottom: 10 }}>Trial counts</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {COUNTS.map(([key, label]) => (
                  <FieldRow key={key} label={label}>
                    <NumberSelect label={label} value={draft.trialCounts[key]} min={TRIAL_LIMITS[key][0]} max={TRIAL_LIMITS[key][1]} disabled={!canEdit} onChange={(v) => setIn('trialCounts', { [key]: v })} />
                  </FieldRow>
                ))}
                <FieldRow label="Grip rest (s)">
                  <TrialInput label="Grip rest shortest (s)" value={rest.min ?? null} rangeKey="restSec" width={74} disabled={!canEdit} onCommit={(v) => setIn('gripRestSec', { min: v })} />
                  <TrialInput label="Grip rest longest (s)" value={rest.max ?? null} rangeKey="restSec" width={74} disabled={!canEdit} onCommit={(v) => setIn('gripRestSec', { max: v })} />
                </FieldRow>
                {restProblem ? <Body size={12} tone={color.error}>{restProblem}</Body> : null}
              </div>
            </Card>
            <Card large>
              <SectionLabel style={{ marginBottom: 10 }}>Stations</SectionLabel>
              <Body size={12} style={{ marginBottom: 10 }}>Readiness & intake is always on: the pain check comes first.</Body>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {STATION_TOGGLES.map(([key, label]) => (
                  <Choice key={key} label={label} value={draft.stations[key] !== false} options={ON_OFF} disabled={!canEdit} onChange={(v) => setIn('stations', { [key]: v })} />
                ))}
                <Choice label="McGill" value={draft.mcgillMode} options={[['wave', 'Inside the wave'], ['separate', 'Its own block within 14 days']]} disabled={!canEdit} onChange={(v) => set({ mcgillMode: v })} />
                <Choice label="Med ball side" value={draft.medballSide} options={[['trail', 'Trail side'], ['dominant', 'Dominant side']]} disabled={!canEdit} onChange={(v) => set({ medballSide: v })} />
                <Choice label="Golf timing" value={draft.golfTiming} options={[['same-day', 'Same day as the circuit'], ['within-7', 'Within 7 days']]} disabled={!canEdit} onChange={(v) => set({ golfTiming: v })} />
                <FieldRow label="Athletes per wave">
                  <NumberSelect label="Athletes per wave" value={draft.waveSize} min={1} max={4} disabled={!canEdit} onChange={(v) => set({ waveSize: v })} />
                </FieldRow>
                <FieldRow label="Waves per session">
                  <NumberSelect label="Waves per session" value={draft.wavesPerSession} min={1} max={10} disabled={!canEdit} onChange={(v) => set({ wavesPerSession: v })} />
                </FieldRow>
              </div>
            </Card>
            <Card large>
              <SectionLabel style={{ marginBottom: 10 }}>Entry</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Choice label="10/5 entry" value={draft.hopEntry} options={[['summary', 'Per-set summary'], ['per-hop', 'Every hop']]} disabled={!canEdit} onChange={(v) => set({ hopEntry: v })} />
                <Choice label="CMJ RSImod" value={draft.rsiModEntry} options={[['typed', 'Typed from Smart2Move'], ['computed', 'Computed from height and time to take-off']]} disabled={!canEdit} onChange={(v) => set({ rsiModEntry: v })} />
              </div>
            </Card>
            <Card large>
              <SectionLabel style={{ marginBottom: 10 }}>Maturity and change markers</SectionLabel>
              <Body size={12}>
                Moore (2015) maturity offset: a + b x (age x sitting height) for boys, a + b x (age x standing height) for girls. Check them against the paper.
              </Body>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {[['boys', 'Boys'], ['girls', 'Girls']].map(([sex, label]) => (
                  <FieldRow key={sex} label={`${label} (a, b)`}>
                    <TrialInput label={`${label} coefficient a`} value={draft.coefficients[sex].a ?? null} rangeKey="coefficientA" width={120} disabled={!canEdit}
                      onCommit={(v) => setIn('coefficients', { [sex]: { ...draft.coefficients[sex], a: v } })} />
                    <TrialInput label={`${label} coefficient b`} value={draft.coefficients[sex].b ?? null} rangeKey="coefficientB" width={120} disabled={!canEdit}
                      onCommit={(v) => setIn('coefficients', { [sex]: { ...draft.coefficients[sex], b: v } })} />
                  </FieldRow>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <Choice label="Maturity coefficients" value={draft.coefficients.verified === true} options={[[false, 'Unverified'], [true, 'Checked against the paper']]} disabled={!canEdit}
                  onChange={(v) => setIn('coefficients', { verified: v })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {THRESHOLDS.map(([key, label]) => (
                  <FieldRow key={key} label={`Threshold, ${label} (%)`}>
                    <TrialInput label={`Threshold ${label} (%)`} value={draft.thresholds[key] ?? null} rangeKey="thresholdPct" width={74} disabled={!canEdit} onCommit={(v) => setIn('thresholds', { [key]: v })} />
                  </FieldRow>
                ))}
                <Body size={11} tone={color.textTertiary}>Thresholds are provisional (protocol Section 5). Blank means no marker.</Body>
              </div>
            </Card>
          </>
        ) : null}
      </div>
      {asking && base ? (
        <VersionSheet current={base.protocolVersion} saving={saving} error={saveError} onSave={save} onClose={() => { setAsking(false); setSaveError(null); }} />
      ) : null}
    </AssessmentFrame>
  );
}
```

In `frontend/src/portal/AssessmentRoutes.js`, replace:

```js
export const loadAssessmentGolf = () => import('./screens/AssessmentGolf');
const AssessmentGolf = lazy(loadAssessmentGolf);
```

with:

```js
export const loadAssessmentGolf = () => import('./screens/AssessmentGolf');
const AssessmentGolf = lazy(loadAssessmentGolf);
export const loadAssessmentSettings = () => import('./screens/AssessmentSettings');
const AssessmentSettings = lazy(loadAssessmentSettings);
```

Append to `frontend/src/portal/AssessmentRoutes.js`:

```js
/** /portal/assessments/settings - assessment staff read; the screen lets only Phil and the owner edit (spec 4.6). */
export function AssessmentSettingsRoute() {
  const { viewer } = useViewer();
  const navigate = useNavigate();
  return <AssessmentSettings bare viewer={viewer} onBack={() => navigate('/portal/assessments')} />;
}
```

In `frontend/src/portal/PortalRoutes.js`, replace:

```js
import { AssessmentGolfRoute, AssessmentListRoute, AssessmentResultsRoute, AssessmentWaveRoute, RequireAssessment, loadAssessmentList } from './AssessmentRoutes';
```

with:

```js
import {
  AssessmentGolfRoute, AssessmentListRoute, AssessmentResultsRoute, AssessmentSettingsRoute, AssessmentWaveRoute, RequireAssessment, loadAssessmentList,
} from './AssessmentRoutes';
```

then replace:

```js
            <RequireAssessment level="reader" landingFor={landingFor}>
              <AssessmentGolfRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
```

with:

```js
            <RequireAssessment level="reader" landingFor={landingFor}>
              <AssessmentGolfRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
      <Route
        path="assessments/settings"
        element={
          <RequireRole roles={['coach', 'mental', 'ops', 'owner']}>
            <RequireAssessment level="staff" landingFor={landingFor}>
              <AssessmentSettingsRoute />
            </RequireAssessment>
          </RequireRole>
        }
      />
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AssessmentSettings.test.js src/portal/AssessmentRoutes.test.js src/portal/data/assessmentInput.test.js src/portal/PortalRoutes`
Expected: PASS.

Run: `cd frontend && npx eslint src/portal`
Expected: no errors, no warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/screens/AssessmentSettings.js frontend/src/portal/screens/AssessmentSettings.test.js frontend/src/portal/components/assessments/VersionSheet.js frontend/src/portal/data/assessmentInput.js frontend/src/portal/data/assessmentInput.test.js frontend/src/portal/AssessmentRoutes.js frontend/src/portal/AssessmentRoutes.test.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(assessments): protocol settings with version labels

Phil and the owner edit trial counts, grip rest, stations, McGill mode,
med ball side, golf timing, wave size, entry modes, the Moore coefficients
and their check, and the thresholds; a procedure change asks for the next
version label.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: createFamily stores the consents and each athlete's research answer

**Files:**
- Modify: `functions/portal/family-validate.js` (`normalizeResearch`; `normalizeAthlete` carries `research`; export)
- Modify: `functions/portal/family.js` (`consentsDoc`; `athleteDoc` takes the consents; `writeAthletes` and `createFamilyHandler` pass them; export)
- Create: `functions/portal/family-consents.test.js`
- Modify: `functions/portal/family-validate.test.js` (the normalized athlete now carries `research: null`; the research cases)

**Interfaces:**
- Consumes: `lib.ageAt(dobISO, todayISO)`, `lib.todayISO(now)`; `fake-firestore.js`'s `fakeDb(docs)` (transactions buffer writes; a doc ref's `.collection()` is not modelled, so the consents test sends no medical note).
- Produces: the createFamily payload's athlete entries accept `research: { value: boolean, assent: boolean | null }` (absent = not asked); `normalizeResearch(raw, { dob, todayISO })` returning `{ value, assent } | null` and refusing anything else with reason `research-invalid`; every athlete createFamily writes carries `consents: { dataCollection, videoCapture, mediaRelease, research: { value, assent, recordedAt, recordedBy } | null, signature: { name, date } }` (spec 4.3). Under 18 the value is true only with the assent ticked too; 18+ the assent is null. addAthletes (link mode, no consent step) writes no `consents`: those athletes get the one-time confirm (Task 23). Task 21 sends `research` from sign-up; Task 22's rules branch writes `consents.research` with the same shape.

- [ ] **Step 1: Write the failing tests**

Create `functions/portal/family-consents.test.js`:

```js
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const {fakeDb} = require('./fake-firestore');
const family = require('./family');
const v = require('./family-validate');

const NOW = new Date('2026-10-20T15:00:00Z');
const kid = (over) => Object.assign({name: 'Jordan', dob: '2012-06-17',
  packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null},
over);
const payload = (over) => Object.assign({
  mode: 'parent',
  contact: {name: 'Dana Whitfield', email: 'dana@example.test',
    phone: '(612) 555-0148', relationship: 'Mother'},
  athletes: [kid({research: {value: true, assent: true}}),
    kid({name: 'Reese', dob: '2014-03-02', research: {value: false,
      assent: false}})],
  consents: {dataCollection: true, videoCapture: true, mediaRelease: true,
    facilityAccess: false},
  signatureName: 'Dana Whitfield',
}, over);
const ctx = (uid, email) => ({auth: {uid, token: {email}}});

/**
 * @param {!Object} docs The fake store's map.
 * @return {!Array<!Object>} The athlete docs written, in id order.
 */
function athletes(docs) {
  return Object.keys(docs).filter((p) => /^athletes\/[^/]+$/.test(p))
      .sort().map((p) => docs[p]);
}

test('createFamily stores every consent, the signature and each research ' +
    'answer on the athletes', async () => {
  const docs = {};
  await family.createFamilyHandler(payload(), ctx('u1', 'dana@example.test'),
      {db: fakeDb(docs), now: NOW});
  const [jordan, reese] = athletes(docs);
  const stamp = jordan.consents.research.recordedAt;
  assert.deepEqual(jordan.consents, {dataCollection: true, videoCapture: true,
    mediaRelease: true, research: {value: true, assent: true,
      recordedAt: stamp, recordedBy: 'u1'},
    signature: {name: 'Dana Whitfield', date: '2026-10-20'}});
  assert.deepEqual(reese.consents.research.value, false);
  assert.deepEqual(reese.consents.research.assent, false);
  assert.equal(reese.consents.research.recordedBy, 'u1');
});

test('under 18, a yes without the assent box is recorded as no', async () => {
  const docs = {};
  await family.createFamilyHandler(payload({athletes: [kid({research:
    {value: true, assent: false}})]}), ctx('u2', 'dana@example.test'),
  {db: fakeDb(docs), now: NOW});
  assert.deepEqual([athletes(docs)[0].consents.research.value,
    athletes(docs)[0].consents.research.assent], [false, false]);
});

test('an 18+ athlete answers for themselves: assent is null', async () => {
  const docs = {};
  await family.createFamilyHandler(payload({mode: 'athlete',
    contact: {name: 'Sam Reyes', email: 'sam@example.test',
      phone: '+15550111'},
    athletes: [kid({name: 'Sam Reyes', dob: '2006-01-01',
      research: {value: true}})]}), ctx('u3', 'sam@example.test'),
  {db: fakeDb(docs), now: NOW});
  assert.deepEqual([athletes(docs)[0].consents.research.value,
    athletes(docs)[0].consents.research.assent], [true, null]);
});

test('a tab on the old bundle sends no research: stored as not asked',
    async () => {
      const docs = {};
      await family.createFamilyHandler(payload({athletes: [kid()]}),
          ctx('u4', 'dana@example.test'), {db: fakeDb(docs), now: NOW});
      assert.equal(athletes(docs)[0].consents.research, null);
      assert.equal(athletes(docs)[0].consents.dataCollection, true);
    });

test('addAthletes writes no consents: the one-time confirm asks', async () => {
  const docs = {
    'users/u5': {role: 'parent', householdId: 'hh5',
      email: 'dana@example.test'},
    'households/hh5': {guardian: {email: 'dana@example.test'}},
  };
  await family.addAthletesHandler({athletes: [kid({research: {value: true,
    assent: true}})]}, ctx('u5', 'dana@example.test'),
  {db: fakeDb(docs), now: NOW});
  assert.equal('consents' in athletes(docs)[0], false);
});

test('normalizeResearch: absent is null; anything but booleans is refused',
    () => {
      const opts = {dob: '2012-06-17', todayISO: '2026-10-20'};
      assert.equal(v.normalizeResearch(undefined, opts), null);
      assert.equal(v.normalizeResearch(null, opts), null);
      assert.deepEqual(v.normalizeResearch({value: true, assent: true}, opts),
          {value: true, assent: true});
      for (const junk of ['yes', true, [], {value: 'yes'},
        {value: true, assent: 'yes'}]) {
        assert.throws(() => v.normalizeResearch(junk, opts),
            (e) => e instanceof v.ValidationError &&
              e.reason === 'research-invalid', JSON.stringify(junk));
      }
    });

run();
```

In `functions/portal/family-validate.test.js`, replace:

```js
    loginEmail: 'jordan@email.com', facilityRequested: false});
```

with:

```js
    loginEmail: 'jordan@email.com', facilityRequested: false, research: null});
```

then replace the file's last line:

```js
    });

run();
```

with:

```js
    });

test('research: last in the entry order, refused unless booleans', () => {
  refuses(Object.assign(base(), {athletes: [kid({research: 'yes'})]}),
      'research-invalid');
  // An earlier refusal still wins.
  refuses(Object.assign(base(), {athletes: [kid({facilityRequested: 'yes',
    research: 'yes'})]}), 'facility-requested-invalid');
  const p = v.validateFamilyPayload(Object.assign(base(), {athletes:
    [kid({research: {value: true, assent: true}})]}), {todayISO: TODAY});
  assert.deepEqual(p.athletes[0].research, {value: true, assent: true});
});

run();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node functions/portal/family-consents.test.js`
Expected: FAIL - `athletes(docs)[0].consents` is undefined (TypeError reading `research`).

Run: `node functions/portal/family-validate.test.js`
Expected: FAIL - "happy path normalizes" (no `research` key yet).

- [ ] **Step 3: Write minimal implementation**

In `functions/portal/family-validate.js`, replace:

```js
/**
 * One athlete entry, normalized. Order: athlete-name-required, dob-invalid,
 * unknown-package, contract-tier, handicap-range, child-email-invalid,
 * child-email-is-guardian, facility-requested-invalid.
```

with:

```js
/**
 * The research opt-in for one athlete (assessments spec 7): `{value,
 * assent}`. Absent is null - not asked (a tab on the bundle from before the
 * question), so the one-time confirm asks at the next sign-in. Under 18 it
 * is yes only when the assent box is ticked too; 18+ answer for themselves
 * and the assent is null. Anything but booleans is refused.
 * @param {*} raw The entry's `research`.
 * @param {{dob: string, todayISO: string}} opts The athlete's date of birth
 *     and Chicago today.
 * @return {?{value: boolean, assent: ?boolean}} The answer, or null.
 */
function normalizeResearch(raw, opts) {
  if (raw === undefined || raw === null) return null;
  const okAssent = (x) => x === undefined || x === null ||
      typeof x === 'boolean';
  if (typeof raw !== 'object' || Array.isArray(raw) ||
      typeof raw.value !== 'boolean' || !okAssent(raw.assent)) {
    throw new ValidationError('research-invalid',
        'Answer the research question: tick the box or leave it unticked.');
  }
  const age = lib.ageAt(opts.dob, opts.todayISO);
  const minor = age === null || age < ADULT_AGE;
  if (!minor) return {value: raw.value, assent: null};
  const assent = raw.value === true && raw.assent === true;
  return {value: assent, assent};
}

/**
 * One athlete entry, normalized. Order: athlete-name-required, dob-invalid,
 * unknown-package, contract-tier, handicap-range, child-email-invalid,
 * child-email-is-guardian, facility-requested-invalid, research-invalid.
```

then replace:

```js
  return {name, dob, packageId: e.packageId, contractMinutes: minutes,
    handicap, loginEmail, facilityRequested};
}
```

with:

```js
  const research = normalizeResearch(e.research, {dob,
    todayISO: opts.todayISO});
  return {name, dob, packageId: e.packageId, contractMinutes: minutes,
    handicap, loginEmail, facilityRequested, research};
}
```

then replace:

```js
  lower, normalizeAthlete, normalizeAthletes, normalizeEmergencyContact,
  storedEmergencyContact, validateAddAthletesPayload, validateFamilyPayload,
};
```

with:

```js
  lower, normalizeAthlete, normalizeAthletes, normalizeEmergencyContact,
  normalizeResearch, storedEmergencyContact, validateAddAthletesPayload,
  validateFamilyPayload,
};
```

In `functions/portal/family.js`, replace:

```js
 * @param {boolean} facilityConsent `consents.facilityAccess`.
 * @param {string} todayISO Chicago today, `'YYYY-MM-DD'`.
 * @return {!Object} The document body.
 */
function athleteDoc(a, householdId, uid, facilityConsent, todayISO) {
```

with:

```js
 * @param {boolean} facilityConsent `consents.facilityAccess`.
 * @param {string} todayISO Chicago today, `'YYYY-MM-DD'`.
 * @param {?Object=} consents createFamily's consents and signature (see
 *     consentsDoc); absent for addAthletes, which has no consent step.
 * @return {!Object} The document body.
 */
function athleteDoc(a, householdId, uid, facilityConsent, todayISO,
    consents) {
```

then replace:

```js
  if (a.contractMinutes !== null) doc.contractStart = todayISO;
  return doc;
}
```

with:

```js
  if (a.contractMinutes !== null) doc.contractStart = todayISO;
  if (consents) doc.consents = consentsDoc(consents, a.research, uid);
  return doc;
}

/**
 * `athletes/{id}.consents` (assessments spec 4.3): what the consent step
 * asked, stored instead of discarded - the household and staff read it.
 * The research answer is per athlete, dated and signed by the caller; a
 * window's results count for research only from that date on.
 * @param {{dataCollection: boolean, videoCapture: boolean,
 *     mediaRelease: boolean, signature: {name: string, date: string}}}
 *     consents The validated consents and the signature.
 * @param {?{value: boolean, assent: ?boolean}} research The athlete's
 *     answer, or null when not asked.
 * @param {string} uid The caller.
 * @return {!Object} The consents map.
 */
function consentsDoc(consents, research, uid) {
  return {
    dataCollection: consents.dataCollection === true,
    videoCapture: consents.videoCapture === true,
    mediaRelease: consents.mediaRelease === true,
    research: research ? {value: research.value, assent: research.assent,
      recordedAt: now(), recordedBy: uid} : null,
    signature: consents.signature,
  };
}
```

then replace:

```js
 *     medical: ?string, facilityConsent: boolean,
 *     todayISO: string}} args The writes.
```

with:

```js
 *     medical: ?string, facilityConsent: boolean,
 *     todayISO: string, consents: (?Object|undefined)}} args The writes.
```

then replace:

```js
    tx.set(ref, athleteDoc(a, args.householdId, args.uid,
        args.facilityConsent, args.todayISO));
```

with:

```js
    tx.set(ref, athleteDoc(a, args.householdId, args.uid,
        args.facilityConsent, args.todayISO, args.consents || null));
```

then replace:

```js
        medical: p.medical, facilityConsent: p.consents.facilityAccess,
        todayISO});
```

with:

```js
        medical: p.medical, facilityConsent: p.consents.facilityAccess,
        todayISO, consents: Object.assign({}, p.consents,
            {signature: {name: p.signatureName, date: todayISO}})});
```

then replace:

```js
  addAthletes, addAthletesHandler, athleteDoc, claimInvite,
  claimInviteHandler, createFamily, createFamilyHandler, householdNameFor,
  medicalDoc, userDocFor,
};
```

with:

```js
  addAthletes, addAthletesHandler, athleteDoc, claimInvite,
  claimInviteHandler, consentsDoc, createFamily, createFamilyHandler,
  householdNameFor, medicalDoc, userDocFor,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node functions/portal/family-consents.test.js && node functions/portal/family-validate.test.js && node functions/portal/family.test.js && node functions/portal/family-facility.test.js`
Expected: every case `ok`, ending `N passing`, exit 0.

Run: `cd functions && npx eslint .`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add functions/portal/family-validate.js functions/portal/family.js functions/portal/family-consents.test.js functions/portal/family-validate.test.js
git commit -m "feat(functions): createFamily stores consents and research answers

The consent step's answers and signature land on each athlete instead of
being discarded; research is per athlete, yes under 18 only with the
assent ticked, dated and signed by the caller.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Research opt-in at sign-up

**Files:**
- Create: `frontend/src/portal/data/researchConsent.js`
- Create: `frontend/src/portal/components/Checkbox.js` (moved out of `RegistrationConsent.js`)
- Create: `frontend/src/portal/components/ResearchChoice.js`
- Create: `frontend/src/portal/components/ResearchSheet.js`
- Modify: `frontend/src/portal/screens/RegistrationConsent.js` (Checkbox import and re-export; the research card in `ConsentStep`)
- Modify: `frontend/src/portal/data/consentTerms.js` (the research section leaves Data collection; two `SELF_WORDING` entries)
- Modify: `frontend/src/portal/data/seed.js` (`CONSENTS` Data collection body loses its research sentence)
- Modify: `frontend/src/portal/data/signup.js` (entries carry the answer; the createFamily payload sends `research` per athlete)
- Modify: `frontend/src/portal/screens/Registration.js` (ConsentStep research props; the Read more sheet; `todayISO` to the payload)
- Test: `frontend/src/portal/data/researchConsent.test.js`, `frontend/src/portal/components/ResearchSheet.test.js`, `frontend/src/portal/screens/RegistrationSteps.test.js` (one edit, appended tests), `frontend/src/portal/data/signup.test.js` (one edit, appended test), `frontend/src/portal/screens/Registration.test.js` (one edit, appended test), `frontend/src/portal/screens/Registration.off.test.js` (one edit)

**Interfaces:**
- Consumes: the createFamily contract of Task 20 (`athletes[i].research = { value, assent }`, re-normalized on the server); `isAdultOnDate(dob, todayISO)` in `data/signup.js`; `Tick` in `components/Primitives.js`.
- Produces: `data/researchConsent.js` - `firstName(name)`, `researchLabel(name)`, `researchLine(name)`, `assentLabel(name)`, `RESEARCH_SELF_LABEL`, `researchSheet(name)` (`[{ heading, lines }]`), `RESEARCH_CONFIRM_TITLE`, `confirmBody(name)`, `RESEARCH_SAVE_LABEL`, `RESEARCH_CONTACT`, `researchAnswer({ ticked, assent, minor })` returning `{ value, assent }` (the same rule as the server's `normalizeResearch`); `components/Checkbox.js` default export `Checkbox({ checked, onChange, label })` (still re-exported by `RegistrationConsent.js` for `RegistrationFacility.js`); `ResearchChoice({ name, self, minor, ticked, assent, onChange({ ticked, assent }), onReadMore })`; `ResearchSheet({ name, onClose })`; `ConsentStep`'s new optional props `athletes`, `todayISO`, `onResearch(key, { research, researchAssent })`, `onOpenResearch({ name, self })`; `newAthleteEntry()` gains `research: false, researchAssent: false`. Only approved copy (spec 7, owner 2026-10-15) is used: an 18+ athlete on their own login gets the approved first-person checkbox, and the approved line under it and Read more sheet with their own first name (the second-person drafts wait for the owner, Task 26 Step 1); `buildCreateFamilyPayload(form, { contract, todayISO })`. Task 23 reuses `researchConsent.js`, `ResearchChoice` and `ResearchSheet`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/data/researchConsent.test.js`:

```js
import {
  RESEARCH_SELF_LABEL, assentLabel, confirmBody, firstName, researchAnswer, researchLabel, researchLine, researchSheet,
} from './researchConsent';

test('the approved copy (owner, 2026-10-15), with the first name', () => {
  expect(firstName('  Jordan Whitfield ')).toBe('Jordan');
  expect(researchLabel('Jordan')).toBe("Research (optional): Jordan's results may be used in research.");
  expect(researchLine('Jordan')).toBe("Saying no changes nothing about Jordan's coaching or testing.");
  expect(assentLabel('Jordan')).toBe("I've talked about this with Jordan, and they agree too.");
  expect(RESEARCH_SELF_LABEL).toBe('Research (optional): my results may be used in research.');
  // Nothing beyond the approved copy: the second-person drafts wait for the owner (plan Task 26 Step 1).
  const copy = require('./researchConsent');
  expect(copy.RESEARCH_SELF_LINE).toBeUndefined();
  expect(copy.confirmSelfBody).toBeUndefined();
  expect(confirmBody('Jordan')).toBe("This season Phil Herder's assessment program measures each athlete's strength, power and growth. We'd like to include Jordan's results in RYP's research, with names removed. It's optional and changes nothing about their coaching.");
});

test('the Read more sheet: three sections, the athlete named (an 18+ member reads it with their own name)', () => {
  const sheet = researchSheet('Jordan');
  expect(sheet.map((s) => s.heading)).toEqual(['What it covers', 'How it is used', 'Your choice']);
  expect(sheet[0].lines[0]).toContain("With your permission we include Jordan's results in that research");
  expect(sheet[1].lines[0]).toBe('Names, contact details, dates of birth and anything else that identifies a person are removed first. Findings may be published or shared with research partners only in that form. Video and photos are never used under this consent.');
  expect(sheet[2].lines[0]).toContain('If you say no, Jordan is tested and coached exactly the same way, and their results are used only to coach them.');
  expect(sheet[2].lines[0]).toContain('results from before a "yes" are never added later.');
  expect(researchSheet('Sam')[0].lines[0]).toContain("With your permission we include Sam's results in that research");
});

test('yes under 18 needs both boxes; 18+ answer alone and have no assent', () => {
  expect(researchAnswer({ ticked: true, assent: true, minor: true })).toEqual({ value: true, assent: true });
  expect(researchAnswer({ ticked: true, assent: false, minor: true })).toEqual({ value: false, assent: false });
  expect(researchAnswer({ ticked: false, assent: true, minor: true })).toEqual({ value: false, assent: false });
  expect(researchAnswer({ ticked: true, assent: false, minor: false })).toEqual({ value: true, assent: null });
  expect(researchAnswer({ ticked: false, minor: false })).toEqual({ value: false, assent: null });
});
```

Create `frontend/src/portal/components/ResearchSheet.test.js`:

```js
import React from 'react';
import { renderScreen } from '../screens/testRender';
import ResearchSheet from './ResearchSheet';

test('the Read more sheet reads the approved sections and closes', async () => {
  const closed = [];
  const r = await renderScreen(<ResearchSheet name="Jordan" onClose={() => closed.push(1)} />);
  for (const heading of ['What it covers', 'How it is used', 'Your choice']) expect(r.text()).toContain(heading);
  expect(r.text()).toContain("we include Jordan's results in that research");
  expect(r.text()).toContain('by emailing makel@rypgolf.com');
  await r.click('Close');
  expect(closed).toEqual([1]);
  await r.unmount();
});
```

In `frontend/src/portal/screens/RegistrationSteps.test.js`, replace:

```js
  // The data sheet keeps its access matrix, says what research use covers
  // (owner 2026-10-01), and gains nothing it should not.
  const d = await renderScreen(<ConsentInfoSheet id="dataCollection" onClose={() => {}} />);
  expect(d.text()).toContain('Owner/Director');
  expect(d.text()).toContain('Training and performance numbers may also be used in research, with names removed.');
  expect(d.text()).toContain('Research use');
  for (const line of CONSENT_TERMS.dataCollection[0].lines) expect(d.text()).toContain(line);
  expect(d.text()).not.toContain('Who may enter');
  await d.unmount();
```

with:

```js
  // The data sheet keeps its access matrix; research use left it for its own
  // opt-in (assessments spec 7, owner 2026-10-15) and gains nothing it should not.
  const d = await renderScreen(<ConsentInfoSheet id="dataCollection" onClose={() => {}} />);
  expect(d.text()).toContain('Owner/Director');
  expect(d.text()).not.toMatch(/research/i);
  expect(d.text()).not.toContain('Who may enter');
  await d.unmount();
```

Append to `frontend/src/portal/screens/RegistrationSteps.test.js`:

```js
function ResearchHarness({ mode = 'parent', athletes: initial }) {
  const [athletes, setAthletes] = React.useState(initial);
  const [opened, setOpened] = React.useState(null);
  return (
    <>
      <ConsentStep mode={mode} consents={{ dataCollection: true, videoCapture: true }} onChange={() => {}} signatureName="" onSignatureChange={() => {}}
        onOpenInfo={() => {}} showErrors={false} athletes={athletes} todayISO="2026-10-15" onOpenResearch={setOpened}
        onResearch={(key, p) => setAthletes((all) => all.map((a) => (a.key === key ? { ...a, ...p } : a)))} />
      <output>{JSON.stringify(athletes.map((a) => [a.research, a.researchAssent]))}{opened ? ` read ${opened.name} ${opened.self}` : ''}</output>
    </>
  );
}

test('research (spec 7): one opt-in per athlete; under 18 the assent box appears once ticked', async () => {
  const r = await renderScreen(<ResearchHarness athletes={[
    { ...newAthleteEntry(), key: 'k1', name: 'Jordan Whitfield', dob: '2012-06-17' },
    { ...newAthleteEntry(), key: 'k2', name: 'Sam Lee', dob: '2007-01-01' },
  ]} />);
  const state = () => r.container.querySelector('output').textContent;
  expect(r.text()).toContain("Research (optional): Jordan's results may be used in research.");
  expect(r.text()).toContain("Saying no changes nothing about Jordan's coaching or testing.");
  expect(r.button("I've talked about this with Jordan, and they agree too.")).toBeNull();
  await r.click("Research (optional): Jordan's results may be used in research.");
  await r.click("I've talked about this with Jordan, and they agree too.");
  expect(state()).toBe('[[true,true],[false,false]]');
  await r.click("Research (optional): Sam's results may be used in research.");
  expect(r.button("I've talked about this with Sam, and they agree too.")).toBeNull();
  await r.click("Research (optional): Jordan's results may be used in research.");
  expect(state()).toBe('[[false,false],[true,false]]');
  await r.click('Read more about research for Jordan');
  expect(state()).toContain('read Jordan false');
  await r.unmount();
});

test('research: an 18+ athlete signing for themselves answers in the first person, with no assent box', async () => {
  const r = await renderScreen(<ResearchHarness mode="athlete" athletes={[{ ...newAthleteEntry(), key: 'k1', name: 'Sam Reyes', dob: '2000-01-01' }]} />);
  expect(r.text()).toContain('Research (optional): my results may be used in research.');
  expect(r.text()).toContain("Saying no changes nothing about Sam's coaching or testing.");
  await r.click('Research (optional): my results may be used in research.');
  expect(r.container.querySelectorAll('[role="checkbox"][aria-label^="I\'ve talked"]')).toHaveLength(0);
  await r.click('Read more about research');
  expect(r.container.querySelector('output').textContent).toBe('[[true,false]] read Sam true');
  await r.unmount();
});
```

In `frontend/src/portal/data/signup.test.js`, replace:

```js
        { name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: 45, handicap: 12, loginEmail: 'jordan@email.com', facilityRequested: false },
        { name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null, facilityRequested: false },
      ],
```

with:

```js
        { name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: 45, handicap: 12, loginEmail: 'jordan@email.com', facilityRequested: false, research: { value: false, assent: false } },
        { name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null, facilityRequested: false, research: { value: false, assent: false } },
      ],
```

Append to `frontend/src/portal/data/signup.test.js`:

```js
describe('research per athlete (assessments spec 7)', () => {
  const base = {
    mode: 'parent', contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    emergencyContact: '', medical: '', consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false }, signatureName: 'Dana Whitfield',
  };
  test('under 18 yes needs the assent; an 18+ athlete and the athlete login answer alone; addAthletes sends none', () => {
    const minor = entry({ research: true, researchAssent: true });
    const noAssent = entry({ name: 'Reese', research: true, researchAssent: false });
    const adult = entry({ name: 'Sam', dob: '2007-01-01', research: true });
    const body = buildCreateFamilyPayload({ ...base, athletes: [minor, noAssent, adult] }, { todayISO: '2026-10-15' });
    expect(body.athletes.map((a) => a.research)).toEqual([{ value: true, assent: true }, { value: false, assent: false }, { value: true, assent: null }]);
    const self = buildCreateFamilyPayload({ ...base, mode: 'athlete', athletes: [entry({ dob: '2000-01-01', research: true })] }, { todayISO: '2026-10-15' });
    expect(self.athletes[0].research).toEqual({ value: true, assent: null });
    expect(buildAddAthletesPayload({ ...base, athletes: [minor] }).athletes[0]).not.toHaveProperty('research');
    expect(newAthleteEntry()).toMatchObject({ research: false, researchAssent: false });
  });
});
```

In `frontend/src/portal/screens/Registration.test.js`, replace:

```js
  expect(mockCalls[0][1].athletes[0]).toEqual({ name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: 45, handicap: null, loginEmail: null, facilityRequested: false });
```

with:

```js
  expect(mockCalls[0][1].athletes[0]).toEqual({ name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: 45, handicap: null, loginEmail: null, facilityRequested: false, research: { value: false, assent: false } });
```

Append to `frontend/src/portal/screens/Registration.test.js`:

```js
test('research (spec 7): the consent step asks per athlete, and createFamily gets the answer', async () => {
  const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com', emailVerified: false }} onRefresh={async () => {}} />);
  await fillParentToConsent(r);
  await r.click('Read more about research for Jordan');
  expect(r.text()).toContain('What it covers');
  await r.click('Close');
  await r.click("Research (optional): Jordan's results may be used in research.");
  await r.click("I've talked about this with Jordan, and they agree too.");
  await r.click('Sign and submit');
  expect(mockCalls[0][1].athletes[0].research).toEqual({ value: true, assent: true });
  await r.unmount();
});
```

In `frontend/src/portal/screens/Registration.off.test.js`, replace:

```js
    { name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: null, facilityRequested: false, handicap: null, loginEmail: null },
  ]);
```

with:

```js
    { name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: null, facilityRequested: false, handicap: null, loginEmail: null, research: { value: false, assent: false } },
  ]);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/researchConsent.test.js src/portal/components/ResearchSheet.test.js src/portal/screens/RegistrationSteps.test.js src/portal/data/signup.test.js src/portal/screens/Registration`
Expected: FAIL - "Cannot find module './researchConsent'", "Cannot find module './ResearchSheet'", no research checkbox on the consent step, and the payloads carry no `research`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/portal/data/researchConsent.js`:

```js
/**
 * The research opt-in (assessments spec 7) - PURE. The wording is the
 * owner-approved copy of 2026-10-15, verbatim, and nothing else; `name` is
 * the athlete's first name. The spec words the 18+ checkbox only, so an 18+
 * member on their own login gets that checkbox and the approved line and
 * Read more sheet with their own first name. Second-person rewordings are
 * the owner's to approve first (plan Task 26 Step 1).
 *
 * The rule, the same one functions/portal/family-validate.js
 * normalizeResearch applies: ticked = yes, unticked = no, both recorded; an
 * athlete under 18 is yes only when the assent box is ticked too; 18+
 * answer for themselves and have no assent.
 */
export const RESEARCH_CONTACT = 'makel@rypgolf.com';
export const RESEARCH_SELF_LABEL = 'Research (optional): my results may be used in research.';
export const RESEARCH_CONFIRM_TITLE = 'One quick question about research';
export const RESEARCH_SAVE_LABEL = 'Save my answer';

/** 'Jordan' from 'Jordan Whitfield'. */
export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || 'your athlete';
}

export const researchLabel = (name) => `Research (optional): ${name}'s results may be used in research.`;
export const researchLine = (name) => `Saying no changes nothing about ${name}'s coaching or testing.`;
export const assentLabel = (name) => `I've talked about this with ${name}, and they agree too.`;
export const confirmBody = (name) =>
  `This season Phil Herder's assessment program measures each athlete's strength, power and growth. We'd like to include ${name}'s results in RYP's research, with names removed. It's optional and changes nothing about their coaching.`;

/** The "Read more" sheet, section by section. */
export function researchSheet(name) {
  const choice = `If you say no, ${name} is tested and coached exactly the same way, and their results are used only to coach them.`;
  return [
    {
      heading: 'What it covers',
      lines: [`RYP Academy and the RYP Golf Research Institute study how junior golfers develop. With your permission we include ${name}'s results in that research: the physical assessment (strength, jump, throw and trunk tests, height and growth measures), clubhead speed and swing-sequencing numbers, attendance, and the training details you tell us about.`],
    },
    {
      heading: 'How it is used',
      lines: ['Names, contact details, dates of birth and anything else that identifies a person are removed first. Findings may be published or shared with research partners only in that form. Video and photos are never used under this consent.'],
    },
    {
      heading: 'Your choice',
      lines: [`This is optional. ${choice} You can change your answer at any time by emailing ${RESEARCH_CONTACT}. A change applies from that date on; results from before a "yes" are never added later.`],
    },
  ];
}

/** The answer recorded: `{ value, assent }`. */
export function researchAnswer({ ticked, assent, minor }) {
  if (!minor) return { value: ticked === true, assent: null };
  const both = ticked === true && assent === true;
  return { value: both, assent: both };
}
```

Create `frontend/src/portal/components/Checkbox.js`:

```js
import React from 'react';
import { color, radius } from '../tokens';
import { Tick } from './Primitives';

/** The round tick: the consent cards, the facility add-on (RegistrationFacility.js) and the research opt-in. */
export default function Checkbox({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={Boolean(checked)}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 26,
        height: 26,
        flex: 'none',
        borderRadius: radius.pill,
        background: checked ? color.primary : 'transparent',
        border: checked ? 'none' : `1.5px solid ${color.faintText}`,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {checked ? <Tick size={11} /> : null}
    </button>
  );
}
```

Create `frontend/src/portal/components/ResearchChoice.js`:

```js
import React from 'react';
import { color, font } from '../tokens';
import Checkbox from './Checkbox';
import { Body } from './Primitives';
import { RESEARCH_SELF_LABEL, assentLabel, researchLabel, researchLine } from '../data/researchConsent';

/**
 * One athlete's research opt-in (assessments spec 7): ticked = yes,
 * unticked = no. Under 18 the assent box shows once the first is ticked,
 * and unticking the first clears it. An 18+ athlete with their own login
 * (`self`) answers for themselves: the approved first-person checkbox, and
 * the approved line under it with their own first name. Used by sign-up's consent step and the
 * one-time confirm.
 */
export default function ResearchChoice({ name, self = false, minor = true, ticked, assent, onChange, onReadMore }) {
  const label = self ? RESEARCH_SELF_LABEL : researchLabel(name);
  return (
    <div style={{ display: 'flex', gap: 13 }}>
      <Checkbox checked={ticked} label={label} onChange={(v) => onChange({ ticked: v, assent: v ? assent : false })} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{label}</div>
        <Body size={12} style={{ marginTop: 6 }}>{researchLine(name)}</Body>
        {!self && minor && ticked ? (
          <div style={{ display: 'flex', gap: 13, marginTop: 12 }}>
            <Checkbox checked={assent} label={assentLabel(name)} onChange={(v) => onChange({ ticked, assent: v })} />
            <div style={{ flex: 1, minWidth: 0, font: `500 13px/1.45 ${font.body}`, color: color.text }}>{assentLabel(name)}</div>
          </div>
        ) : null}
        {onReadMore ? (
          <button
            type="button"
            aria-label={self ? 'Read more about research' : `Read more about research for ${name}`}
            onClick={onReadMore}
            style={{ background: 'none', border: 'none', padding: 0, marginTop: 9, font: `500 12px ${font.body}`, color: color.primary, cursor: 'pointer' }}
          >
            Read more →
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

Create `frontend/src/portal/components/ResearchSheet.js`:

```js
import React from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from './Button';
import { Body, ScreenTitle } from './Primitives';
import { researchSheet } from '../data/researchConsent';

/** The research "Read more" sheet (assessments spec 7), the approved copy section by section; `name` is the athlete's first name. */
export default function ResearchSheet({ name, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', zIndex: 5 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '80%', overflowY: 'auto', background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}
      >
        <ScreenTitle size={19}>Research</ScreenTitle>
        {researchSheet(name).map((section) => (
          <div key={section.heading} style={{ marginTop: 14 }}>
            <div style={{ font: `600 12px ${font.body}`, color: color.text }}>{section.heading}</div>
            {section.lines.map((line) => <Body key={line} size={12} style={{ marginTop: 6 }}>{line}</Body>)}
          </div>
        ))}
        <Button variant="outline" height={46} onClick={onClose} style={{ marginTop: 18, boxShadow: 'none' }}>Close</Button>
      </div>
    </div>
  );
}
```

In `frontend/src/portal/screens/RegistrationConsent.js`, replace:

```js
import { Body, Card, ScreenTitle, Tick } from '../components/Primitives';
import { useEnrollmentForm } from '../hooks';
import { CONSENT_TERMS, consentWording } from '../data/consentTerms';
import { FACILITY_WAIVER_FOOTNOTE, FACILITY_WAIVER_REQUIRED } from '../data/signup';
```

with:

```js
import Checkbox from '../components/Checkbox';
import ResearchChoice from '../components/ResearchChoice';
import { Body, Card, ScreenTitle } from '../components/Primitives';
import { useEnrollmentForm } from '../hooks';
import { CONSENT_TERMS, consentWording } from '../data/consentTerms';
import { firstName } from '../data/researchConsent';
import { FACILITY_WAIVER_FOOTNOTE, FACILITY_WAIVER_REQUIRED, isAdultOnDate } from '../data/signup';

// The tick moved to components/Checkbox.js; RegistrationFacility.js still imports it from here.
export { default as Checkbox } from '../components/Checkbox';
```

then replace:

```js
 * footnote says why, and the error says how to get past it either way.
 */
export function ConsentStep({ mode, consents, onChange, signatureName, onSignatureChange, onOpenInfo, showErrors, facilityRequired = false }) {
```

with:

```js
 * footnote says why, and the error says how to get past it either way.
 * Research (assessments spec 7) is its own opt-in, one per athlete, below
 * the consents: shown when the caller passes `onResearch` (sign-up), with
 * `athletes` and `todayISO` deciding who is under 18.
 */
export function ConsentStep({
  mode, consents, onChange, signatureName, onSignatureChange, onOpenInfo, showErrors, facilityRequired = false,
  athletes = [], todayISO, onResearch, onOpenResearch,
}) {
```

then replace:

```js
      {showErrors && !(consents.dataCollection && consents.videoCapture) ? (
```

with:

```js
      {onResearch ? (
        <Card large>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {(mode === 'athlete' ? athletes.slice(0, 1) : athletes).map((a) => {
              const self = mode === 'athlete';
              const name = firstName(a.name);
              return (
                <ResearchChoice
                  key={a.key}
                  name={name}
                  self={self}
                  minor={!self && !isAdultOnDate(a.dob, todayISO)}
                  ticked={a.research === true}
                  assent={a.researchAssent === true}
                  onChange={({ ticked, assent }) => onResearch(a.key, { research: ticked, researchAssent: assent })}
                  onReadMore={onOpenResearch ? () => onOpenResearch({ name, self }) : undefined}
                />
              );
            })}
          </div>
        </Card>
      ) : null}

      {showErrors && !(consents.dataCollection && consents.videoCapture) ? (
```

then replace the end of the file (the end of `ConsentInfoSheet` and the old `Checkbox`):

```js
        <Button variant="outline" height={46} onClick={onClose} style={{ marginTop: 18, boxShadow: 'none' }}>
          Close
        </Button>
      </div>
    </div>
  );
}

/** The round tick the consent cards use; the package step's facility add-on (RegistrationFacility.js) reuses it. */
export function Checkbox({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={Boolean(checked)}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 26,
        height: 26,
        flex: 'none',
        borderRadius: radius.pill,
        background: checked ? color.primary : 'transparent',
        border: checked ? 'none' : `1.5px solid ${color.faintText}`,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {checked ? <Tick size={11} /> : null}
    </button>
  );
}
```

with:

```js
        <Button variant="outline" height={46} onClick={onClose} style={{ marginTop: 18, boxShadow: 'none' }}>
          Close
        </Button>
      </div>
    </div>
  );
}
```

In `frontend/src/portal/data/consentTerms.js`, replace:

```js
export const CONSENT_TERMS = {
  // Owner 2026-10-01 (Phil): research use rides on the Data collection
  // consent, so the sheet says exactly what that covers.
  dataCollection: [
    {
      heading: 'Research use',
      lines: [
        'RYP Academy may use training and performance numbers, such as attendance, fitness results and swing measurements, in research it may publish, on their own or combined with other data the academy collects.',
        'Names, contact details, dates of birth and anything else that identifies a person are removed first. Video and photos are never published under this consent.',
        'Ask us in writing at any time and we leave your athlete’s numbers out of any future research.',
      ],
    },
  ],
  videoCapture: [
```

with:

```js
export const CONSENT_TERMS = {
  // Research use left the Data collection consent (assessments spec 7,
  // owner 2026-10-15): it was an opt-out there and is its own opt-in now,
  // per athlete - data/researchConsent.js.
  videoCapture: [
```

then replace:

```js
  'Name, date of birth, guardian contact, emergency and medical info, and training records. Collected only where a feature needs it. Training and performance numbers may also be used in research, with names removed.':
    'Your name, date of birth, contact details, emergency and medical info, and training records. Collected only where a feature needs it. Your training and performance numbers may also be used in research, with names removed.',
  'Ask us in writing at any time and we leave your athlete’s numbers out of any future research.':
    'Ask us in writing at any time and we leave your numbers out of any future research.',
```

with:

```js
  'Name, date of birth, guardian contact, emergency and medical info, and training records. Collected only where a feature needs it.':
    'Your name, date of birth, contact details, emergency and medical info, and training records. Collected only where a feature needs it.',
```

In `frontend/src/portal/data/seed.js`, replace:

```js
      'Name, date of birth, guardian contact, emergency and medical info, and training records. Collected only where a feature needs it. Training and performance numbers may also be used in research, with names removed.',
```

with:

```js
      'Name, date of birth, guardian contact, emergency and medical info, and training records. Collected only where a feature needs it.',
```

In `frontend/src/portal/data/signup.js`, replace:

```js
import { householdFacility } from './facility';
```

with:

```js
import { householdFacility } from './facility';
import { researchAnswer } from './researchConsent';
```

then replace:

```js
    key: `new-${seq}`, name: '', dob: '', packageId: null, contractMinutes: null, contractPicked: false, handicap: '', ownLogin: false, loginEmail: '',
  };
```

with:

```js
    key: `new-${seq}`, name: '', dob: '', packageId: null, contractMinutes: null, contractPicked: false, handicap: '', ownLogin: false, loginEmail: '',
    // Assessments spec 7: the research opt-in and, under 18, the assent box.
    research: false, researchAssent: false,
  };
```

then replace:

```js
/** Contract 1.2 request body. Athlete mode: no relationship, no child login (the caller IS the login). */
export function buildCreateFamilyPayload(form, { contract = contractEnabled() } = {}) {
  const parent = form.mode === 'parent';
```

with:

```js
/**
 * Contract 1.2 request body. Athlete mode: no relationship, no child login
 * (the caller IS the login). Each athlete carries its research answer
 * (assessments spec 7), under 18 by `todayISO`; createFamily re-checks it.
 */
export function buildCreateFamilyPayload(form, { contract = contractEnabled(), todayISO } = {}) {
  const parent = form.mode === 'parent';
  const researchOf = (a) => researchAnswer({ ticked: a.research === true, assent: a.researchAssent === true, minor: parent && !isAdultOnDate(a.dob, todayISO) });
```

then replace:

```js
    athletes: athleteBodies(form, contract).map((a) => (parent ? a : { ...a, loginEmail: null })),
```

with:

```js
    athletes: athleteBodies(form, contract).map((a, i) => ({ ...(parent ? a : { ...a, loginEmail: null }), research: researchOf(form.athletes[i]) })),
```

In `frontend/src/portal/screens/Registration.js`, replace:

```js
import { AthleteStep, ConsentStep, ConsentInfoSheet, ContactStep, ContractStep, PackageStep, SubmittingOverlay, WhoStep } from './RegistrationSteps';
```

with:

```js
import { AthleteStep, ConsentStep, ConsentInfoSheet, ContactStep, ContractStep, PackageStep, SubmittingOverlay, WhoStep } from './RegistrationSteps';
import ResearchSheet from '../components/ResearchSheet';
```

then replace:

```js
  const setConsents = (fn) => setForm((f) => ({ ...f, consents: typeof fn === 'function' ? fn(f.consents) : fn }));
```

with:

```js
  const setConsents = (fn) => setForm((f) => ({ ...f, consents: typeof fn === 'function' ? fn(f.consents) : fn }));
  // The research "Read more" sheet: { name, self } or null (assessments spec 7).
  const [researchSheet, setResearchSheet] = useState(null);
```

then replace:

```js
        : await callCreateFamily(buildCreateFamilyPayload(form, { contract: withContract }));
```

with:

```js
        : await callCreateFamily(buildCreateFamilyPayload(form, { contract: withContract, todayISO: today }));
```

then replace:

```js
            onSignatureChange={(v) => patch({ signatureName: v })} onOpenInfo={setInfoSheet} showErrors={showErrors}
            facilityRequired={facilityRequired} />
```

with:

```js
            onSignatureChange={(v) => patch({ signatureName: v })} onOpenInfo={setInfoSheet} showErrors={showErrors}
            facilityRequired={facilityRequired} athletes={form.athletes} todayISO={today} onResearch={updateAthlete} onOpenResearch={setResearchSheet} />
```

then replace:

```js
      {infoSheet ? <ConsentInfoSheet id={infoSheet} mode={form.mode} onClose={() => setInfoSheet(null)} /> : null}
```

with:

```js
      {infoSheet ? <ConsentInfoSheet id={infoSheet} mode={form.mode} onClose={() => setInfoSheet(null)} /> : null}
      {researchSheet ? <ResearchSheet name={researchSheet.name} onClose={() => setResearchSheet(null)} /> : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/researchConsent.test.js src/portal/components/ResearchSheet.test.js src/portal/screens/RegistrationSteps.test.js src/portal/data/signup.test.js src/portal/screens/Registration src/portal/screens/RegistrationFacility.test.js`
Expected: PASS.

Run: `cd frontend && npx eslint src/portal`
Expected: no errors, no warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/data/researchConsent.js frontend/src/portal/data/researchConsent.test.js frontend/src/portal/components/Checkbox.js frontend/src/portal/components/ResearchChoice.js frontend/src/portal/components/ResearchSheet.js frontend/src/portal/components/ResearchSheet.test.js frontend/src/portal/screens/RegistrationConsent.js frontend/src/portal/data/consentTerms.js frontend/src/portal/data/seed.js frontend/src/portal/data/signup.js frontend/src/portal/data/signup.test.js frontend/src/portal/screens/Registration.js frontend/src/portal/screens/Registration.test.js frontend/src/portal/screens/Registration.off.test.js frontend/src/portal/screens/RegistrationSteps.test.js
git commit -m "feat(signup): research opt-in per athlete at the consent step

The approved copy, one checkbox per athlete with the assent box under 18,
a Read more sheet, and the answer sent to createFamily. Research leaves
the Data collection consent, where it was an opt-out.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Research consent rules - the one-time answer and the owner's recorded change

The rules half of the one-time research confirm (spec 4.3, 7): the household's parent, or the 18+ member who created their own household, records `consents.research` once; the owner records a later change with the earlier answer kept on the history. Task 23 builds the screens on this contract. A parent may answer for an 18+ athlete in their household (assent null) until the owner rules otherwise (Task 26 Step 1).

**Files:**
- Modify: `firestore.rules` (the research branch on `athletes/{athleteId}`)
- Create: `scripts/rules-probes/research.mjs`
- Modify: `scripts/verify-rules.mjs` (import and run `taskResearch`)
- Test: `scripts/verify-rules.mjs` (emulator, both passes)

**Interfaces:**
- Consumes: the athlete doc's `consents.research` written by createFamily (Task 20); `verify-rules.mjs` exports `updateAs`, `seed`, `del`, `expect`, `token`, `t`, `uid`; Task 9's runPass line `await taskAssessments(); await taskDiagnosticsReadOnly();`.
- Produces: rules - the household's parent, or the 18+ member who created their own household, sets `consents.research` once (that key only, while none is recorded), `{ value, assent, recordedAt: <server>, recordedBy: <caller> }`; the owner records a change, `{ value, assent, recordedAt: <server>, recordedBy: <owner>, history: [...earlier history, the answer it replaces] }`; a yes under 18 needs the assent, 18+ the assent is null. `scripts/rules-probes/research.mjs` exports `taskResearch()`.

- [ ] **Step 1: Write the failing probe**

Create `scripts/rules-probes/research.mjs`:

```js
/**
 * Research consent (assessments spec 4.3, 7): the one-time confirm - the
 * household's parent, or the 18+ member who created their own household,
 * sets consents.research once, that key only, dated by the server and
 * signed by the caller; a yes under 18 needs the assent - and the owner's
 * recorded change, the earlier answer kept on the history. Run by
 * scripts/verify-rules.mjs in both passes; it seeds and removes
 * everything it touches.
 */
import { del, expect, seed, t, token, uid, updateAs } from '../verify-rules.mjs';

const KID = 'ath-research-kid';
const ADULT_CHILD = 'ath-research-adult';
const SELF = 'ath-research-self';
const SELF_HH = 'hh-research-self';
const users = { owner: 'owner-research-probe', self: 'research-self-probe', kid: 'research-kid-probe' };
const tok = (u) => token(u, { email: `${u}@example.com`, email_verified: true });
const kidBody = (extra = {}) => ({ name: 'Research Kid', householdId: 'hh', dob: '2012-04-10', contractMinutes: null, coachId: null, packageId: 't-6', ...extra });
const selfBody = { name: 'Self Member', householdId: SELF_HH, dob: '2000-01-01', contractMinutes: null, coachId: null, packageId: 't-6' };
/** The write hooks/researchConsent.js makes: consents.research, its recordedAt the server's time. */
const answer = (auth, id, research, serverTime = ['consents.research.recordedAt']) =>
  updateAs(auth, 'athletes', id, { consents: { research } }, ['consents.research'], serverTime);

export async function taskResearch() {
  console.log('Research consent: the one-time confirm (parent, 18+ self), that key only, assent under 18; the owner records a change');
  const owner = tok(users.owner);
  const self = tok(users.self);
  const kid = tok(users.kid);
  const reset = (extra = {}) => seed('athletes', KID, kidBody(extra));
  try {
    await seed('users', users.owner, { role: 'owner' });
    await seed('users', users.self, { role: 'athlete', athleteId: SELF, householdId: SELF_HH });
    await seed('users', users.kid, { role: 'athlete', athleteId: KID, householdId: 'hh' });
    await seed('households', SELF_HH, { name: 'Self family', createdBy: users.self });
    await seed('athletes', SELF, selfBody);
    await seed('athletes', ADULT_CHILD, kidBody({ name: 'Adult Child', dob: '2000-01-01' }));

    await reset();
    expect('under 18, a yes without the assent is refused', await answer(t.parent, KID, { value: true, assent: false, recordedBy: uid.parent }), 403);
    expect('the parent records yes with the assent', await answer(t.parent, KID, { value: true, assent: true, recordedBy: uid.parent }), 200);
    expect('a second answer from the parent is refused', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent }), 403);
    await reset({ consents: { dataCollection: true, videoCapture: true, mediaRelease: false, research: null, signature: { name: 'Dana', date: '2026-10-01' } } });
    expect('a sign-up record with research null takes the answer', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent }), 200);
    await reset();
    expect('under 18 the assent is a yes or a no, never left out', await answer(t.parent, KID, { value: false, recordedBy: uid.parent }), 403);
    expect('another household cannot answer', await answer(t.other, KID, { value: false, assent: false, recordedBy: uid.other }), 403);
    expect("the child's own login cannot answer", await answer(kid, KID, { value: false, assent: false, recordedBy: users.kid }), 403);
    expect('a coach cannot answer', await answer(t.coach, KID, { value: false, assent: false, recordedBy: uid.coach }), 403);
    expect('the answer is signed by the caller', await answer(t.parent, KID, { value: false, assent: false, recordedBy: 'someone-else' }), 403);
    // A minute back: a client "now" can land in the same millisecond as request.time on a local emulator.
    expect('the answer is dated by the server', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent, recordedAt: new Date(Date.now() - 60000) }, []), 403);
    expect('a first answer carries no history', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent, history: [] }), 403);
    expect('no other consent rides along', await updateAs(t.parent, 'athletes', KID,
      { consents: { mediaRelease: true, research: { value: false, assent: false, recordedBy: uid.parent } } },
      ['consents.mediaRelease', 'consents.research'], ['consents.research.recordedAt']), 403);
    expect('no other field rides along', await updateAs(t.parent, 'athletes', KID,
      { name: 'Renamed', consents: { research: { value: false, assent: false, recordedBy: uid.parent } } },
      ['name', 'consents.research'], ['consents.research.recordedAt']), 403);
    expect('an 18+ athlete in the family: yes, no assent', await answer(t.parent, ADULT_CHILD, { value: true, assent: null, recordedBy: uid.parent }), 200);
    expect('18+: an assent is refused', await answer(self, SELF, { value: true, assent: true, recordedBy: users.self }), 403);
    expect('the 18+ member records their own answer', await answer(self, SELF, { value: true, assent: null, recordedBy: users.self }), 200);

    const earlier = { value: true, assent: true, recordedAt: new Date('2026-10-15T15:00:00Z'), recordedBy: uid.parent };
    await reset({ consents: { research: earlier } });
    expect('the parent cannot change a recorded answer', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent }), 403);
    expect('the owner must keep the earlier answer', await answer(owner, KID, { value: false, assent: false, recordedBy: users.owner, history: [] }), 403);
    expect('the owner records a change, the earlier answer on its history', await answer(owner, KID, { value: false, assent: false, recordedBy: users.owner, history: [earlier] }), 200);
  } finally {
    for (const id of [KID, ADULT_CHILD, SELF]) await del('athletes', id);
    await del('households', SELF_HH);
    for (const u of Object.values(users)) await del('users', u);
  }
}
```

In `scripts/verify-rules.mjs`, replace:

```js
import { taskAssessments, taskDiagnosticsReadOnly } from './rules-probes/assessments.mjs';
```

with:

```js
import { taskAssessments, taskDiagnosticsReadOnly } from './rules-probes/assessments.mjs';
import { taskResearch } from './rules-probes/research.mjs';
```

then replace:

```js
    await taskAssessments(); await taskDiagnosticsReadOnly();
```

with:

```js
    await taskAssessments(); await taskDiagnosticsReadOnly(); await taskResearch();
```

- [ ] **Step 2: Run the probe to verify it fails**

Run: `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"`
Expected: FAIL - every "records ... answer" case answers 403 (no branch yet).

- [ ] **Step 3: The research branch**

In `firestore.rules`, replace:

```
      allow update: if signedIn() && pendingPackageUpdateOk() && (
        (me().role == 'parent' && resource.data.householdId == me().householdId)
        || (me().role == 'athlete' && me().athleteId == athleteId
            && get(/databases/$(database)/documents/households/$(resource.data.householdId)).data.createdBy == request.auth.uid)
      );
```

with:

```
      allow update: if signedIn() && pendingPackageUpdateOk() && (
        (me().role == 'parent' && resource.data.householdId == me().householdId)
        || (me().role == 'athlete' && me().athleteId == athleteId
            && get(/databases/$(database)/documents/households/$(resource.data.householdId)).data.createdBy == request.auth.uid)
      );

      // ---- research consent (assessments spec 4.3, 7) -------------------
      // The one-time confirm: the household's parent, or the 18+ member who
      // created their own household (the same test as the package switch
      // above), records consents.research once - that key only, while none
      // is recorded, dated by the server and signed by the caller. The
      // owner records a later change (the family emails it), the earlier
      // answer moved onto the history, so every window keeps the answer it
      // ran under. Under 18 a yes needs the assent; 18+ the assent is null.
      function adultRecord() {
        let dob = resource.data.get('dob', null);
        return dob is string && dob.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')
          && timestamp.date(int(dob.split('-')[0]) + 18, int(dob.split('-')[1]), int(dob.split('-')[2])) <= request.time;
      }
      function researchOnlyChange() {
        return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['consents'])
          && request.resource.data.consents.diff(resource.data.get('consents', {})).affectedKeys().hasOnly(['research']);
      }
      function researchAnswerOk(r, adult) {
        return r is map
          && r.keys().hasOnly(['value', 'assent', 'recordedAt', 'recordedBy', 'history'])
          && r.value is bool
          && r.recordedAt == request.time
          && r.recordedBy == request.auth.uid
          && (adult ? r.get('assent', null) == null
            : (r.get('assent', null) is bool && (r.value == false || r.assent == true)));
      }
      function researchFirstOk(adult) {
        let r = request.resource.data.consents.research;
        return researchOnlyChange()
          && resource.data.get('consents', {}).get('research', null) == null
          && researchAnswerOk(r, adult)
          && !r.keys().hasAny(['history']);
      }
      function researchChangeOk() {
        let prev = resource.data.get('consents', {}).get('research', null);
        let r = request.resource.data.consents.research;
        return researchOnlyChange()
          && researchAnswerOk(r, adultRecord())
          && r.get('history', []) == (prev == null ? [] : prev.get('history', []).concat([{
            'value': prev.get('value', null), 'assent': prev.get('assent', null),
            'recordedAt': prev.get('recordedAt', null), 'recordedBy': prev.get('recordedBy', null)}]));
      }
      allow update: if signedIn() && (
        (me().role == 'parent' && resource.data.householdId == me().householdId && researchFirstOk(adultRecord()))
        || (me().role == 'athlete' && me().athleteId == athleteId
            && get(/databases/$(database)/documents/households/$(resource.data.householdId)).data.createdBy == request.auth.uid
            && researchFirstOk(true))
        || (me().role == 'owner' && researchChangeOk())
      );
```

- [ ] **Step 4: Run the probe to verify it passes**

Run: `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"`
Expected: every line PASS, ending `ALL PASS (both passes)`.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules scripts/rules-probes/research.mjs scripts/verify-rules.mjs
git commit -m "feat(rules): research consent - the one-time answer and the owner's change

The parent (or the 18+ member who made their own household) sets
consents.research once, that key only, dated by the server; a yes under
18 needs the assent; the owner records a later change with the earlier
answer kept on the history.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: One-time research confirm for existing families, and the owner's recorded change

**Files:**
- Create: `frontend/src/portal/hooks/researchConsent.js`
- Create: `frontend/src/portal/components/ResearchConfirmGate.js`
- Create: `frontend/src/portal/components/assessments/ResearchLine.js`
- Modify: `frontend/src/portal/data/assessmentWindows.js` (`inResearch` reads the history)
- Modify: `frontend/src/portal/screens/AssessmentResults.js` (the research line)
- Modify: `frontend/src/portal/PortalRoutes.js` (the gate around the family and athlete homes)
- Test: `frontend/src/portal/hooks/researchConsent.test.js`, `frontend/src/portal/components/ResearchConfirmGate.test.js`, `frontend/src/portal/components/assessments/ResearchLine.test.js`, `frontend/src/portal/data/assessmentWindows.test.js` (append), `frontend/src/portal/screens/AssessmentResults.test.js` (one edit), `frontend/src/portal/PortalRoutes.test.js` and `frontend/src/portal/AssessmentRoutes.test.js` (one mock each)

**Interfaces:**
- Consumes: `researchAnswer`, `firstName`, `confirmBody`, `RESEARCH_CONFIRM_TITLE`, `RESEARCH_SAVE_LABEL` (Task 21); `ResearchChoice`, `ResearchSheet` (Task 21); `joinNames`, `isAdultOnDate` (`data/signup.js`); `fetchAthlete`, `fetchHousehold`, `fetchHouseholdAthletes`, `requireUser`, `wrap`, `isLive` (`hooks/live.js`); `ASSESSMENTS_KEY` (Task 5); `useAuthSession`; `toISODate`, `shortDate` (Task 2); the research rules of Task 22 (the write shapes below are that contract); `AssessmentResults`'s `today` prop (Task 17).
- Produces: `hooks/researchConsent.js` - `RESEARCH_KEY = 'research'`, `pendingResearch({ user, athletes, household, todayISO })` returning `[{ id, name, self, minor }]`, `saveResearchConsent({ athleteId, answer })` (writes `consents.research = { value, assent, recordedAt: serverTimestamp(), recordedBy }`), `recordResearchChange({ athleteId, answer, current })` (the owner; the earlier answer appended to `history`), `useResearchConfirm(user)` returning `{ data: { pending } }`; `ResearchConfirmGate({ children })` (the approved title, body and checkboxes; an 18+ member reads `confirmBody` with their own first name); `ResearchLine({ athleteId, research, minor, canChange })` and `researchStatus(research)`; `inResearch(research, circuitDate)` now answers from the answer in force on the circuit date (history included).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/portal/hooks/researchConsent.test.js`:

```js
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => ({
  doc: (_db, ...path) => ({ path: path.join('/') }),
  serverTimestamp: () => 'SERVER_TIME',
  updateDoc: async (ref, data) => {
    if (mockWriteError) throw mockWriteError;
    mockWrites.push([ref.path, data]);
  },
}));
jest.mock('./invalidate', () => ({ __esModule: true, bump: (key) => mockBumps.push(key), useInvalidation: () => 0 }));
jest.mock('./live', () => ({ ...jest.requireActual('./live'), isLive: () => true }));

import { auth } from '../../firebase';
import { ASSESSMENTS_KEY } from './assessmentsLive';
import { RESEARCH_KEY, pendingResearch, recordResearchChange, saveResearchConsent } from './researchConsent';

let mockWrites;
let mockBumps;
let mockWriteError;
beforeEach(() => {
  mockWrites = [];
  mockBumps = [];
  mockWriteError = null;
  auth.currentUser = { uid: 'p1' };
});

test('a parent is asked about every household athlete with no answer recorded', () => {
  const athletes = [
    { id: 'a1', name: 'Jordan Whitfield', dob: '2012-06-17', consents: { dataCollection: true, research: null } },
    { id: 'a2', name: 'Reese Whitfield', dob: '2007-01-01' },
    { id: 'a3', name: 'Sam Whitfield', dob: '2013-01-01', consents: { research: { value: false, assent: false } } },
  ];
  expect(pendingResearch({ user: { uid: 'p1', role: 'parent' }, athletes, household: null, todayISO: '2026-10-15' })).toEqual([
    { id: 'a1', name: 'Jordan Whitfield', self: false, minor: true },
    { id: 'a2', name: 'Reese Whitfield', self: false, minor: false },
  ]);
});

test("an 18+ member who created their own household answers for themselves; a child's login never does", () => {
  const me = [{ id: 's1', name: 'Sam Reyes', dob: '2000-01-01' }];
  expect(pendingResearch({ user: { uid: 'u1', role: 'athlete', athleteId: 's1' }, athletes: me, household: { createdBy: 'u1' }, todayISO: '2026-10-15' }))
    .toEqual([{ id: 's1', name: 'Sam Reyes', self: true, minor: false }]);
  expect(pendingResearch({ user: { uid: 'kid', role: 'athlete', athleteId: 's1' }, athletes: me, household: { createdBy: 'p1' }, todayISO: '2026-10-15' })).toEqual([]);
  expect(pendingResearch({ user: { uid: 'c1', role: 'coach' }, athletes: me, household: null, todayISO: '2026-10-15' })).toEqual([]);
});

test('saveResearchConsent writes consents.research only, dated and signed, and refreshes the gate', async () => {
  await saveResearchConsent({ athleteId: 'a1', answer: { value: true, assent: true } });
  expect(mockWrites).toEqual([['athletes/a1', { 'consents.research': { value: true, assent: true, recordedAt: 'SERVER_TIME', recordedBy: 'p1' } }]]);
  expect(mockBumps).toEqual([RESEARCH_KEY]);
  await expect(saveResearchConsent({ athleteId: 'a1', answer: { value: 'yes' } })).rejects.toThrow('saveResearchConsent');
});

test("the owner's recorded change keeps the earlier answer on the history", async () => {
  auth.currentUser = { uid: 'owner1' };
  const current = { value: true, assent: true, recordedAt: 'TS-1015', recordedBy: 'p1', history: [{ value: false, assent: false, recordedAt: 'TS-1001', recordedBy: 'p1' }] };
  await recordResearchChange({ athleteId: 'a1', answer: { value: false, assent: false }, current });
  expect(mockWrites).toEqual([['athletes/a1', { 'consents.research': {
    value: false, assent: false, recordedAt: 'SERVER_TIME', recordedBy: 'owner1',
    history: [{ value: false, assent: false, recordedAt: 'TS-1001', recordedBy: 'p1' }, { value: true, assent: true, recordedAt: 'TS-1015', recordedBy: 'p1' }],
  } }]]);
  expect(mockBumps).toEqual([RESEARCH_KEY, ASSESSMENTS_KEY]);
  mockWrites = [];
  await recordResearchChange({ athleteId: 'a2', answer: { value: true, assent: null }, current: null });
  expect(mockWrites[0][1]['consents.research'].history).toEqual([]);
});

test('a refused write is reported, not swallowed', async () => {
  mockWriteError = Object.assign(new Error('denied'), { code: 'permission-denied' });
  await expect(saveResearchConsent({ athleteId: 'a1', answer: { value: false, assent: false } })).rejects.toBeTruthy();
  expect(mockBumps).toEqual([]);
});
```

Create `frontend/src/portal/components/ResearchConfirmGate.test.js`:

```js
import React from 'react';
import { renderScreen } from '../screens/testRender';
import ResearchConfirmGate from './ResearchConfirmGate';
import { confirmBody } from '../data/researchConsent';

let mockUser;
let mockPending;
let mockSaves;
let mockFailIds;
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), isLive: () => true }));
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => ({ user: mockUser, loading: false }) }));
jest.mock('../hooks/researchConsent', () => ({
  useResearchConfirm: () => ({ data: mockPending ? { pending: mockPending } : null, loading: false, error: mockPending ? null : new Error('offline') }),
  saveResearchConsent: async (args) => {
    mockSaves.push(args);
    if (mockFailIds.includes(args.athleteId)) throw new Error('permission-denied');
    return { athleteId: args.athleteId };
  },
}));

const gate = () => renderScreen(<ResearchConfirmGate><div>FAMILY HOME</div></ResearchConfirmGate>);
let uidSeq = 0;
beforeEach(() => {
  uidSeq += 1;
  mockUser = { uid: `parent-${uidSeq}`, role: 'parent', householdId: 'hh' };
  mockPending = [{ id: 'a1', name: 'Jordan Whitfield', self: false, minor: true }, { id: 'a2', name: 'Reese Whitfield', self: false, minor: true }];
  mockSaves = [];
  mockFailIds = [];
});

test('a family with an athlete not answered sees the question before the home, in the approved words', async () => {
  const r = await gate();
  expect(r.text()).toContain('One quick question about research');
  expect(r.text()).toContain(confirmBody('Jordan and Reese'));
  expect(r.text()).toContain("Research (optional): Reese's results may be used in research.");
  expect(r.text()).not.toContain('FAMILY HOME');
  await r.click('Read more about research for Jordan');
  expect(r.text()).toContain('What it covers');
  await r.click('Close');
  await r.unmount();
});

test('unticked saves as no; a yes under 18 needs the assent; then the home opens', async () => {
  const r = await gate();
  await r.click("Research (optional): Jordan's results may be used in research.");
  await r.click("I've talked about this with Jordan, and they agree too.");
  await r.click('Save my answer');
  expect(mockSaves).toEqual([
    { athleteId: 'a1', answer: { value: true, assent: true } },
    { athleteId: 'a2', answer: { value: false, assent: false } },
  ]);
  expect(r.text()).toContain('FAMILY HOME');
  await r.unmount();
});

test('Review Focus 5: a refused save says so, retries only what failed, and offers Skip for now', async () => {
  mockFailIds = ['a2'];
  const r = await gate();
  await r.click('Save my answer');
  expect(r.text()).toContain('Your answer was not saved. Check the connection and try again, or skip for now: we will ask again the next time you sign in.');
  expect(r.text()).not.toContain('FAMILY HOME');
  mockFailIds = [];
  await r.click('Save my answer');
  expect(mockSaves.map((s) => s.athleteId)).toEqual(['a1', 'a2', 'a2']);
  expect(r.text()).toContain('FAMILY HOME');
  await r.unmount();

  mockFailIds = ['a1', 'a2'];
  const again = await gate();
  await again.click('Save my answer');
  await again.click('Skip for now');
  expect(again.text()).toContain('FAMILY HOME');
  await again.unmount();
  const reopened = await gate();
  expect(reopened.text()).toContain('FAMILY HOME');
  await reopened.unmount();
});

test('an 18+ member answers for themselves, in the approved words with their own name', async () => {
  mockUser = { uid: 'self-1', role: 'athlete', athleteId: 's1', householdId: 'hs' };
  mockPending = [{ id: 's1', name: 'Sam Reyes', self: true, minor: false }];
  const r = await gate();
  expect(r.text()).toContain(confirmBody('Sam'));
  await r.click('Research (optional): my results may be used in research.');
  await r.click('Save my answer');
  expect(mockSaves).toEqual([{ athleteId: 's1', answer: { value: true, assent: null } }]);
  await r.unmount();
});

test('nothing pending, or a read that failed: straight to the home, never trapped', async () => {
  mockPending = [];
  const none = await gate();
  expect(none.text()).toBe('FAMILY HOME');
  await none.unmount();
  mockPending = null;
  const failed = await gate();
  expect(failed.text()).toBe('FAMILY HOME');
  await failed.unmount();
});
```

Create `frontend/src/portal/components/assessments/ResearchLine.test.js`:

```js
import React from 'react';
import { renderScreen } from '../../screens/testRender';
import ResearchLine, { researchStatus } from './ResearchLine';

let mockChanges;
let mockFail;
jest.mock('../../hooks/researchConsent', () => ({
  recordResearchChange: async (args) => {
    mockChanges.push(args);
    if (mockFail) throw new Error('offline');
    return { athleteId: args.athleteId };
  },
}));

const yes = { value: true, assent: true, recordedAt: '2026-10-15T15:00:00Z', recordedBy: 'p1' };
beforeEach(() => { mockChanges = []; mockFail = false; });

test('the status reads the answer and its date; the history says what came before', async () => {
  expect(researchStatus(null)).toBe('Research: not answered');
  expect(researchStatus(yes)).toBe('Research: yes since Oct 15');
  expect(researchStatus({ value: false, assent: false, recordedAt: '2026-11-02T15:00:00Z' })).toBe('Research: no (recorded Nov 2)');
  const r = await renderScreen(<ResearchLine athleteId="a1" research={{ value: false, assent: false, recordedAt: '2026-11-02T15:00:00Z', history: [yes] }} minor canChange={false} />);
  expect(r.text()).toContain('Research: no (recorded Nov 2)');
  expect(r.text()).toContain('Earlier: yes from Oct 15.');
  expect(r.button('Record a change')).toBeNull();
  await r.unmount();
});

test("the owner records a family's change; under 18 a yes needs the assent", async () => {
  const r = await renderScreen(<ResearchLine athleteId="a1" research={null} minor canChange />);
  await r.click('Record a change');
  await r.click('Research answer: Yes');
  await r.click('Save change');
  expect(mockChanges).toEqual([{ athleteId: 'a1', answer: { value: false, assent: false }, current: null }]);
  await r.click('Record a change');
  await r.click('Research answer: Yes');
  await r.click('Athlete assent: Given');
  await r.click('Save change');
  expect(mockChanges[1]).toEqual({ athleteId: 'a1', answer: { value: true, assent: true }, current: null });
  await r.unmount();
});

test('a failed change says so and keeps the editor open', async () => {
  mockFail = true;
  const r = await renderScreen(<ResearchLine athleteId="a1" research={yes} minor={false} canChange />);
  await r.click('Record a change');
  await r.click('Research answer: No');
  await r.click('Save change');
  expect(mockChanges[0].answer).toEqual({ value: false, assent: null });
  expect(r.text()).toContain('The change was not saved. Check the connection and try again.');
  expect(r.button('Save change')).not.toBeNull();
  await r.unmount();
});
```

Append to `frontend/src/portal/data/assessmentWindows.test.js`:

```js
test('research counts by the answer in force on the circuit date: a later no keeps the yes before it', () => {
  const changed = { value: false, assent: false, recordedAt: '2026-11-10T15:00:00Z', history: [{ value: true, assent: true, recordedAt: '2026-10-15T15:00:00Z' }] };
  expect(inResearch(changed, '2026-11-03')).toBe(true);
  expect(inResearch(changed, '2026-11-20')).toBe(false);
  expect(inResearch(changed, '2026-10-01')).toBe(false);
  const later = { value: true, assent: true, recordedAt: '2026-12-01T15:00:00Z', history: [{ value: false, assent: false, recordedAt: '2026-10-15T15:00:00Z' }] };
  expect(inResearch(later, '2026-11-03')).toBe(false);
  expect(inResearch(later, '2026-12-01')).toBe(true);
});
```

In `frontend/src/portal/screens/AssessmentResults.test.js`, replace:

```js
  expect(text).toContain('Research: yes · First test Nov 3 · Female');
```

with:

```js
  expect(text).toContain('First test Nov 3 · Female');
  expect(text).toContain('Research: yes since Oct 15');
```

In `frontend/src/portal/PortalRoutes.test.js`, replace:

```js
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
```

with:

```js
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
// The one-time research confirm wraps the family and athlete homes; nothing is pending here.
jest.mock('./hooks/researchConsent', () => ({ useResearchConfirm: () => ({ data: { pending: [] }, loading: false, error: null }), saveResearchConsent: async () => ({}) }));
```

In `frontend/src/portal/AssessmentRoutes.test.js`, replace:

```js
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
```

with:

```js
jest.mock('./hooks/live', () => ({ ...jest.requireActual('./hooks/live'), isLive: () => mockLive.value }));
jest.mock('./hooks/researchConsent', () => ({ useResearchConfirm: () => ({ data: { pending: [] }, loading: false, error: null }), saveResearchConsent: async () => ({}) }));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/researchConsent.test.js src/portal/components/ResearchConfirmGate.test.js src/portal/components/assessments/ResearchLine.test.js src/portal/data/assessmentWindows.test.js src/portal/screens/AssessmentResults.test.js`
Expected: FAIL - "Cannot find module './researchConsent'" (hooks), "Cannot find module './ResearchConfirmGate'", "Cannot find module './ResearchLine'", the history case of `inResearch`, and the results screen's research line.

- [ ] **Step 3: Write minimal implementation**

In `frontend/src/portal/data/assessmentWindows.js`, replace:

```js
/** Whether a window's results may be used in research (spec 4.3). */
export function inResearch(research, circuitDate) {
  const from = researchCountsFrom(research);
  return Boolean(from && circuitDate && circuitDate >= from);
}
```

with:

```js
/**
 * Whether a window's results may be used in research (spec 4.3): the
 * answer in force on its circuit date - the current one, or one the
 * owner's recorded change moved onto `history`. A yes never reaches back
 * before its own date, and a later no leaves the windows before it as
 * they were.
 */
export function inResearch(research, circuitDate) {
  if (!research || !circuitDate) return false;
  const answers = [...(Array.isArray(research.history) ? research.history : []), research]
    .map((r) => ({ value: r?.value === true, from: toISODate(r?.recordedAt) }))
    .filter((r) => r.from)
    .sort((a, b) => a.from.localeCompare(b.from));
  const inForce = answers.filter((r) => r.from <= circuitDate).pop();
  return Boolean(inForce && inForce.value);
}
```

Create `frontend/src/portal/hooks/researchConsent.js`:

```js
/**
 * Research consent (assessments spec 4.3, 7): the one-time confirm for
 * families whose athletes have no research answer recorded, and the
 * owner's recorded change. New module, the scholarships.js precedent:
 * primitives come from ./live, never the other way. The writes are the
 * contract with firestore.rules' research branch on athletes/{id}
 * (scripts/rules-probes/research.mjs): consents.research only.
 */
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ERR, LiveDataError, fetchAthlete, fetchHousehold, fetchHouseholdAthletes, isLive, requireUser, wrap } from './live';
import { bump, useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { ASSESSMENTS_KEY } from './assessmentsLive';
import { academyDateISO } from '../data/calendar';
import { isAdultOnDate } from '../data/signup';

export const RESEARCH_KEY = 'research';

const unanswered = (a) => Boolean(a) && (a.consents?.research ?? null) == null;
const invalid = (message) => new LiveDataError(ERR.INVALID, message);
const okAnswer = (answer) => Boolean(answer) && typeof answer.value === 'boolean' && (answer.assent == null || typeof answer.assent === 'boolean');

/**
 * Whose answer the signed-in user owes: a parent, every household athlete
 * with none recorded; an athlete login, their own record - only the 18+
 * member who created their own household (a child's login never answers).
 */
export function pendingResearch({ user, athletes, household, todayISO }) {
  if (!user) return [];
  const list = (athletes || []).filter(unanswered);
  if (user.role === 'parent') return list.map((a) => ({ id: a.id, name: a.name ?? '', self: false, minor: !isAdultOnDate(a.dob, todayISO) }));
  if (user.role === 'athlete' && household?.createdBy === user.uid) {
    return list.filter((a) => a.id === user.athleteId).map((a) => ({ id: a.id, name: a.name ?? '', self: true, minor: false }));
  }
  return [];
}

/** The family's answer: consents.research, dated by the server, signed by the caller. */
export async function saveResearchConsent({ athleteId, answer }) {
  if (!athleteId || !okAnswer(answer)) throw invalid('saveResearchConsent: an athlete and a yes or no.');
  if (!isLive()) return { athleteId, simulated: true };
  const user = requireUser();
  try {
    await updateDoc(doc(db, 'athletes', athleteId), {
      'consents.research': { value: answer.value, assent: answer.assent ?? null, recordedAt: serverTimestamp(), recordedBy: user.uid },
    });
  } catch (err) {
    throw wrap(err, 'saveResearchConsent');
  }
  bump(RESEARCH_KEY);
  return { athleteId };
}

/** The owner records a change the family asked for; the answer it replaces moves onto the history. */
export async function recordResearchChange({ athleteId, answer, current }) {
  if (!athleteId || !okAnswer(answer)) throw invalid('recordResearchChange: an athlete and a yes or no.');
  if (!isLive()) return { athleteId, simulated: true };
  const user = requireUser();
  const history = current
    ? [...(Array.isArray(current.history) ? current.history : []),
      { value: current.value ?? null, assent: current.assent ?? null, recordedAt: current.recordedAt ?? null, recordedBy: current.recordedBy ?? null }]
    : [];
  try {
    await updateDoc(doc(db, 'athletes', athleteId), {
      'consents.research': { value: answer.value, assent: answer.assent ?? null, recordedAt: serverTimestamp(), recordedBy: user.uid, history },
    });
  } catch (err) {
    throw wrap(err, 'recordResearchChange');
  }
  bump(RESEARCH_KEY);
  bump(ASSESSMENTS_KEY);
  return { athleteId };
}

/** The one-time confirm's list for the signed-in family; seed mode and staff owe nothing. */
export function useResearchConfirm(user) {
  const live = isLive() && Boolean(user) && (user.role === 'parent' || user.role === 'athlete');
  const gen = useInvalidation(RESEARCH_KEY);
  return useSeedResource(
    live ? null : { pending: [] },
    live
      ? {
          source: async () => {
            const todayISO = academyDateISO();
            if (user.role === 'parent') return { pending: pendingResearch({ user, athletes: await fetchHouseholdAthletes(user.householdId), household: null, todayISO }) };
            const [athlete, household] = await Promise.all([fetchAthlete(user.athleteId), fetchHousehold(user.householdId)]);
            return { pending: pendingResearch({ user, athletes: [athlete], household, todayISO }) };
          },
          deps: ['research-confirm', user?.uid, gen],
        }
      : undefined
  );
}
```

Create `frontend/src/portal/components/ResearchConfirmGate.js`:

```js
import React, { useState } from 'react';
import { color } from '../tokens';
import Button from './Button';
import PhoneFrame from './PhoneFrame';
import ResearchChoice from './ResearchChoice';
import ResearchSheet from './ResearchSheet';
import { Body, Card, ErrorNotice, ScreenTitle } from './Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { isLive } from '../hooks/live';
import { saveResearchConsent, useResearchConfirm } from '../hooks/researchConsent';
import { RESEARCH_CONFIRM_TITLE, RESEARCH_SAVE_LABEL, confirmBody, firstName, researchAnswer } from '../data/researchConsent';
import { joinNames } from '../data/signup';

/** Users who chose "Skip for now" after a failed save, until the page loads again (the next sign-in). */
const skipped = new Set();

/**
 * The one-time research confirm (assessments spec 7): a family whose
 * athletes have no research answer recorded sees the same checkboxes once,
 * before their home, and "Save my answer" records them (unticked saves as
 * no). Never a trap (Review Focus 5): a read that fails or is still loading
 * shows the home; a refused save says so, retries only what failed, and
 * offers "Skip for now" - the question returns at the next sign-in.
 */
export default function ResearchConfirmGate({ children }) {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { data } = useResearchConfirm(live ? user : null);
  const [done, setDone] = useState(false);
  const [, setSkipTick] = useState(0);
  const pending = data?.pending ?? [];
  if (!live || !user || done || skipped.has(user.uid) || pending.length === 0) return children;
  return (
    <ResearchConfirm
      pending={pending}
      onDone={() => setDone(true)}
      onSkip={() => { skipped.add(user.uid); setSkipTick((n) => n + 1); }}
    />
  );
}

function ResearchConfirm({ pending, onDone, onSkip }) {
  const [answers, setAnswers] = useState(() => Object.fromEntries(pending.map((p) => [p.id, { ticked: false, assent: false }])));
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState(null);

  const save = async () => {
    setSaving(true);
    setFailed(false);
    const now = [...saved];
    for (const p of pending.filter((x) => !saved.includes(x.id))) {
      try {
        await saveResearchConsent({ athleteId: p.id, answer: researchAnswer({ ...answers[p.id], minor: p.minor }) });
        now.push(p.id);
      } catch (err) {
        setFailed(true);
      }
    }
    setSaved(now);
    setSaving(false);
    if (now.length === pending.length) onDone();
  };

  return (
    <PhoneFrame
      bare
      header={<div style={{ padding: '18px 22px 8px' }}><ScreenTitle size={22}>{RESEARCH_CONFIRM_TITLE}</ScreenTitle></div>}
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '12px 22px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button height={52} loading={saving} onClick={save}>{RESEARCH_SAVE_LABEL}</Button>
          {failed ? <Button variant="outline" height={46} disabled={saving} style={{ boxShadow: 'none' }} onClick={onSkip}>Skip for now</Button> : null}
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
        <Body size={13}>{confirmBody(joinNames(pending.map((p) => firstName(p.name))))}</Body>
        {pending.map((p) => {
          const name = firstName(p.name);
          return (
            <Card key={p.id} large>
              <ResearchChoice
                name={name}
                self={p.self}
                minor={p.minor}
                ticked={answers[p.id].ticked}
                assent={answers[p.id].assent}
                onChange={(next) => setAnswers((all) => ({ ...all, [p.id]: next }))}
                onReadMore={() => setSheet({ name })}
              />
              {saved.includes(p.id) ? <Body size={11} tone={color.primary} style={{ marginTop: 8 }}>Saved</Body> : null}
            </Card>
          );
        })}
        {failed ? (
          <ErrorNotice title="Not saved">
            Your answer was not saved. Check the connection and try again, or skip for now: we will ask again the next time you sign in.
          </ErrorNotice>
        ) : null}
      </div>
      {sheet ? <ResearchSheet name={sheet.name} onClose={() => setSheet(null)} /> : null}
    </PhoneFrame>
  );
}
```

Create `frontend/src/portal/components/assessments/ResearchLine.js`:

```js
import React, { useState } from 'react';
import { color } from '../../tokens';
import Button from '../Button';
import Choice from './Choice';
import { Body } from '../Primitives';
import { recordResearchChange } from '../../hooks/researchConsent';
import { researchAnswer } from '../../data/researchConsent';
import { shortDate, toISODate } from '../../data/assessmentWindows';

const dated = (r) => {
  const d = toISODate(r?.recordedAt);
  return d ? shortDate(d) : null;
};

/** "Research: yes since Oct 15", "Research: no (recorded Nov 2)", "Research: not answered". */
export function researchStatus(research) {
  if (!research || typeof research.value !== 'boolean') return 'Research: not answered';
  const when = dated(research);
  return research.value ? `Research: yes since ${when ?? 'an unknown date'}` : `Research: no${when ? ` (recorded ${when})` : ''}`;
}

/**
 * The athlete's research answer on the results screen (spec 4.3): the
 * answer, its date and what came before. The owner records a change the
 * family asked for by email ("You can change your answer at any time by
 * emailing ..."); it applies from today, and the earlier answer stays on
 * the history so earlier windows keep theirs. Under 18 a yes needs the
 * athlete's assent too.
 */
export default function ResearchLine({ athleteId, research, minor, canChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(false);
  const [assent, setAssent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const history = Array.isArray(research?.history) ? research.history : [];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await recordResearchChange({ athleteId, answer: researchAnswer({ ticked: value, assent, minor }), current: research ?? null });
      setEditing(false);
      setValue(false);
      setAssent(false);
    } catch (err) {
      setError('The change was not saved. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
      <Body size={12}>{researchStatus(research)}</Body>
      {history.length ? (
        <Body size={11} tone={color.textTertiary}>
          Earlier: {history.map((h) => `${h.value ? 'yes' : 'no'} from ${dated(h) ?? 'an unknown date'}`).join('; ')}.
        </Body>
      ) : null}
      {canChange && !editing ? (
        <Button variant="outline" height={36} style={{ width: 'auto', padding: '0 14px', boxShadow: 'none', alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>
          Record a change
        </Button>
      ) : null}
      {canChange && editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Choice label="Research answer" value={value} options={[[true, 'Yes'], [false, 'No']]} onChange={setValue} />
          {minor && value ? <Choice label="Athlete assent" value={assent} options={[[true, 'Given'], [false, 'Not given']]} onChange={setAssent} /> : null}
          <Body size={11} tone={color.textTertiary}>Record what the family asked for. It applies from today; earlier windows keep the answer they ran under.</Body>
          {error ? <Body size={12} tone={color.error}>{error}</Body> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button height={40} loading={saving} style={{ width: 'auto', padding: '0 16px' }} onClick={save}>Save change</Button>
            <Button variant="outline" height={40} disabled={saving} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

In `frontend/src/portal/screens/AssessmentResults.js`, replace:

```js
import ResultsTable from '../components/assessments/ResultsTable';
```

with:

```js
import ResultsTable from '../components/assessments/ResultsTable';
import ResearchLine from '../components/assessments/ResearchLine';
```

then replace:

```js
import { CONSENT_LABEL, shortDate } from '../data/assessmentWindows';
```

with:

```js
import { shortDate } from '../data/assessmentWindows';
import { isAdultOnDate } from '../data/signup';
```

then replace:

```js
  const about = results
    ? [CONSENT_LABEL[results.consent], results.firstTestDate ? `First test ${shortDate(results.firstTestDate)}` : null, SEX_LABEL[results.sex] ?? null].filter(Boolean).join(' · ')
    : null;
```

with:

```js
  const about = results
    ? [results.firstTestDate ? `First test ${shortDate(results.firstTestDate)}` : null, SEX_LABEL[results.sex] ?? null].filter(Boolean).join(' · ')
    : null;
  const athlete = data?.athlete ?? null;
```

then replace:

```js
      {about ? <Body size={12} style={{ marginTop: 3 }}>{about}</Body> : null}
```

with:

```js
      {about ? <Body size={12} style={{ marginTop: 3 }}>{about}</Body> : null}
      {athlete ? (
        <ResearchLine athleteId={athleteId} research={athlete.consents?.research ?? null} minor={!isAdultOnDate(athlete.dob, today)}
          canChange={viewer?.role === 'owner'} />
      ) : null}
```

In `frontend/src/portal/PortalRoutes.js`, replace:

```js
import { assessmentAccess } from './data/assessmentAccess';
```

with:

```js
import { assessmentAccess } from './data/assessmentAccess';
import ResearchConfirmGate from './components/ResearchConfirmGate';
```

then replace:

```js
          <RequireRole roles={['athlete']}>
            <AthleteDashboard
              bare
              onLog={go('/portal/contract')}
              onBook={go('/portal/book')}
              onSignOut={onSignOut}
            />
```

with:

```js
          <RequireRole roles={['athlete']}>
            {/* Assessments spec 7: the one-time research confirm, the 18+ member's own. */}
            <ResearchConfirmGate>
              <AthleteDashboard
                bare
                onLog={go('/portal/contract')}
                onBook={go('/portal/book')}
                onSignOut={onSignOut}
              />
            </ResearchConfirmGate>
```

then replace:

```js
          <RequireRole roles={['parent']}>
            <ParentDashboard
              bare
              onOpenAthlete={openAthlete}
              onSignOut={onSignOut}
            />
```

with:

```js
          <RequireRole roles={['parent']}>
            {/* Assessments spec 7: the one-time research confirm before the family home. */}
            <ResearchConfirmGate>
              <ParentDashboard
                bare
                onOpenAthlete={openAthlete}
                onSignOut={onSignOut}
              />
            </ResearchConfirmGate>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/hooks/researchConsent.test.js src/portal/components/ResearchConfirmGate.test.js src/portal/components/assessments/ResearchLine.test.js src/portal/data/researchConsent.test.js src/portal/data/assessmentWindows.test.js src/portal/screens/AssessmentResults.test.js src/portal/PortalRoutes src/portal/AssessmentRoutes.test.js`
Expected: PASS.

Run: `cd frontend && npx eslint src/portal`
Expected: no errors, no warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/portal/hooks/researchConsent.js frontend/src/portal/hooks/researchConsent.test.js frontend/src/portal/components/ResearchConfirmGate.js frontend/src/portal/components/ResearchConfirmGate.test.js frontend/src/portal/components/assessments/ResearchLine.js frontend/src/portal/components/assessments/ResearchLine.test.js frontend/src/portal/data/assessmentWindows.js frontend/src/portal/data/assessmentWindows.test.js frontend/src/portal/screens/AssessmentResults.js frontend/src/portal/screens/AssessmentResults.test.js frontend/src/portal/PortalRoutes.js frontend/src/portal/PortalRoutes.test.js frontend/src/portal/AssessmentRoutes.test.js
git commit -m "feat(consent): one-time research confirm and the owner's recorded change

Families with an athlete not answered see the approved question once
before their home, never trapped behind it; the results screen shows the
answer in force and its history, and the owner records a change the
family asks for, so every window keeps the answer it ran under.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Emulator fixtures, the data model, and the end-to-end wave on the emulator

**Files:**
- Create: `scripts/lib/assessment-fixtures.mjs`
- Create: `scripts/test/assessment-fixtures.test.mjs`
- Modify: `scripts/seed-firestore.mjs` (import; bundle list; fixtures in `buildDocs`; the dry-run block)
- Modify: `docs/portal/DATA-MODEL.md` (id rows; the assessments section)

**Interfaces:**
- Consumes: the bundled `circuitModeOf`, `DEFAULT_SETTINGS`, `PROTOCOL_VERSION` (`data/assessmentSettings.js`) and `seasonOf` (`data/assessmentWindows.js`) through `scripts/lib/bundle-frontend.mjs`; the window, profile and consents shapes of Tasks 4, 20 and 22.
- Produces: `assessmentFixtures({ todayISO, mode, seasonOf, athletes, protocolVersion, coachUid, guardianUid, signatureName })` returning `{ consents: { [athleteId]: consentsMap }, collections: { 'athletes/<id>/assessments': Map, 'athletes/<id>/assessmentProfile': Map } }`, `STORIES` (`tested | due | declined | unanswered`), `addDaysISO(iso, n)`; Task 25's staging seed reuses all three. The emulator gets: jordan tested at baseline 63 days back (mid-season eligible), reese research no (baseline due), nico not answered (the list cannot add him; Dana's one-time confirm asks), sage-parker research yes (baseline due).

- [ ] **Step 1: Write the failing test**

Create `scripts/test/assessment-fixtures.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORIES, addDaysISO, assessmentFixtures } from '../lib/assessment-fixtures.mjs';

// The frontend's season rule (August-July), restated for the test only.
const seasonOf = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
const MODE = { waveSize: 4, trialCounts: { cmjScored: 2 } };
const fx = (athletes, over = {}) => assessmentFixtures({ todayISO: '2026-10-15', mode: MODE, seasonOf, athletes, ...over });

test('tested: a complete baseline nine weeks back with every section, and its profile', () => {
  const { collections } = fx([{ id: 'kid1', story: 'tested', sex: 'female' }]);
  const windows = collections['athletes/kid1/assessments'];
  assert.deepEqual([...windows.keys()], ['2026-27-baseline']);
  const w = windows.get('2026-27-baseline');
  assert.equal(w.circuitDate, addDaysISO('2026-10-15', -63));
  assert.equal(w.circuitDate, '2026-08-13');
  assert.equal(w.status, 'complete');
  assert.equal(w.protocolVersion, 'v1.2');
  assert.deepEqual(w.circuitMode, MODE);
  for (const s of ['readiness', 'log', 'anthro', 'grip', 'cmj', 'hop', 'medball', 'mcgill', 'golf']) {
    assert.ok(w[s], s);
    assert.equal(w.enteredBy[s], 'phil', s);
  }
  const profile = collections['athletes/kid1/assessmentProfile'].get('current');
  assert.deepEqual([profile.sex, profile.firstTestDate, profile.medballMassKg, profile.medballMethod, profile.season], ['female', '2026-08-13', 2, 'speed', '2026-27']);
});

test('research per story: yes, no, or not answered; an 18+ athlete has no assent', () => {
  const { consents } = fx([{ id: 'a', story: 'tested' }, { id: 'b', story: 'due', adult: true }, { id: 'c', story: 'declined' }, { id: 'd', story: 'unanswered' }]);
  assert.deepEqual([consents.a.research.value, consents.a.research.assent], [true, true]);
  assert.equal(consents.a.research.recordedAt.toISOString().slice(0, 10), '2026-08-06');
  assert.deepEqual([consents.b.research.value, consents.b.research.assent], [true, null]);
  assert.deepEqual([consents.c.research.value, consents.c.research.assent], [false, false]);
  assert.equal(consents.d.research, null);
  assert.deepEqual(consents.d.signature, { name: 'Fixture Guardian', date: '2026-08-06' });
  assert.equal(consents.d.dataCollection, true);
});

test('only tested athletes have windows', () => {
  const { collections } = fx([{ id: 'b', story: 'due' }, { id: 'c', story: 'declined' }, { id: 'd', story: 'unanswered' }]);
  assert.deepEqual(Object.keys(collections), []);
});

test('every typed value sits inside the ranges firestore.rules holds', () => {
  const w = fx([{ id: 'k', story: 'tested' }]).collections['athletes/k/assessments'].get('2026-27-baseline');
  const inRange = (list, lo, hi) => list.every((v) => v == null || (v >= lo && v <= hi));
  assert.ok(inRange(w.grip.right.concat(w.grip.left), 0, 100));
  assert.ok(inRange(w.anthro.standing, 90, 215) && inRange(w.anthro.mass, 15, 160) && inRange(w.anthro.sittingRaw, 40, 140));
  assert.ok(w.anthro.boxHeight >= 20 && w.anthro.boxHeight <= 80);
  assert.ok(w.cmj.trials.length <= 3 && w.cmj.trials.every((t) => inRange([t.heightCm], 0, 90) && inRange([t.rsiMod], 0, 2) && inRange([t.asymmetryPct], 0, 60)));
  assert.ok(w.hop.sets.every((s) => inRange([s.rsiBest5], 0, 5) && inRange([s.gctMs], 80, 600)));
  assert.ok(inRange(w.medball.throws, 0, 60) && [2, 3, 4].includes(w.medball.massKg));
  assert.ok(inRange([w.mcgill.flexorSec, w.mcgill.extensorSec, w.mcgill.sideRightSec, w.mcgill.sideLeftSec], 0, 300));
  assert.ok(inRange(w.golf.speeds, 30, 140) && inRange([w.golf.parallaxComposite], 0, 100) && inRange([w.golf.fps], 30, 1000));
});

test('an unknown story is refused, and the stories are the four documented', () => {
  assert.deepEqual(STORIES, ['tested', 'due', 'declined', 'unanswered']);
  assert.throws(() => fx([{ id: 'x', story: 'mystery' }]), /unknown story "mystery"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test scripts/test/*.test.mjs`
Expected: FAIL - "Cannot find module ... scripts/lib/assessment-fixtures.mjs".

- [ ] **Step 3: Write minimal implementation**

Create `scripts/lib/assessment-fixtures.mjs`:

```js
/**
 * Assessment fixtures (docs/portal/plans/2026-10-14-assessments): the
 * windows, assessment profiles and research answers the emulator seed
 * (scripts/seed-firestore.mjs) and the staging test copy
 * (scripts/seed-staging-assessments.mjs) write for INVENTED athletes only.
 * Pure and dependency-free: dates are relative to `todayISO`; `mode` is the
 * caller's circuitModeOf(DEFAULT_SETTINGS) and `seasonOf` the frontend's,
 * both bundled from frontend/src/portal/data, so the protocol is never
 * retyped here. Every value sits inside the ranges firestore.rules holds.
 *
 * One story per athlete:
 *   tested     - research yes (recorded 70 days back) and a COMPLETE
 *                baseline 63 days back, every section typed: mid-season
 *                eligible today. (Run before 9 weeks into the season, the
 *                baseline falls in the previous season and reads "Baseline
 *                due" instead.)
 *   due        - research yes (recorded 10 days back), never tested.
 *   declined   - research no: tested and coached the same, baseline due.
 *   unanswered - consents with no research answer: the list cannot add
 *                them, and the family's one-time confirm asks.
 */
export const STORIES = ['tested', 'due', 'declined', 'unanswered'];

const DAY_MS = 86400000;
export function addDaysISO(iso, n) {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
const stamp = (iso, hourUtc) => new Date(`${iso}T${String(hourUtc).padStart(2, '0')}:00:00Z`);

/** One complete baseline's sections, as the stations write them. */
const SECTIONS = {
  readiness: { status: 'pass', reason: null, hoursSinceHardSession: 30, golfToday: false, notes: null },
  log: { location: 'ryp', externalContent: null, weeklyHours: 6, rypSessionsSincePrior: 0, golfVolume: '2 rounds a week', competitiveLevel: 'Club junior', otherSport: null, otherSportHours: null },
  anthro: { standing: [152.1, 152.3], mass: [41.0, 41.2], boxHeight: 40, sittingRaw: [118.0, 118.2], arm: [], hand: [] },
  grip: { right: [24.5, 25.1, 24.8], left: [23.0, 22.4, 23.8], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' },
  cmj: {
    trials: [
      { heightCm: 31.2, rsiMod: 0.41, timeToTakeoffMs: null, peakPowerW: 2100, peakPowerWkg: null, asymmetryPct: 6.5 },
      { heightCm: 32.0, rsiMod: 0.39, timeToTakeoffMs: null, peakPowerW: 2150, peakPowerWkg: null, asymmetryPct: 4.2 },
    ],
    software: 'Smart2Move',
    samplingHz: 1000,
  },
  hop: { sets: [{ rsiBest5: 2.31, gctMs: 198 }, { rsiBest5: 2.45, gctMs: 262 }] },
  medball: { massKg: 2, side: 'trail', method: 'speed', throws: [28.4, 29.1, 28.9] },
  mcgill: { flexorSec: 60, extensorSec: 90, sideRightSec: 50, sideLeftSec: 48, skippedBackPain: false },
  golf: { speeds: [88.2, 90.1, 89.5, 91.0, 87.9], driver: 'Fixture driver', parallaxComposite: 72, fps: 240 },
};

function consentsFor(a, todayISO, guardianUid, signatureName) {
  const recorded = addDaysISO(todayISO, a.story === 'tested' ? -70 : -10);
  const yes = a.story === 'tested' || a.story === 'due';
  return {
    dataCollection: true,
    videoCapture: true,
    mediaRelease: false,
    research: a.story === 'unanswered' ? null : { value: yes, assent: a.adult ? null : yes, recordedAt: stamp(recorded, 15), recordedBy: guardianUid },
    signature: { name: signatureName, date: addDaysISO(todayISO, -70) },
  };
}

export function assessmentFixtures({
  todayISO, mode, seasonOf, athletes, protocolVersion = 'v1.2', coachUid = 'phil', guardianUid = 'fixture-guardian', signatureName = 'Fixture Guardian',
}) {
  const consents = {};
  const collections = {};
  let tested = 0;
  for (const a of athletes) {
    if (!STORIES.includes(a.story)) throw new Error(`assessmentFixtures: unknown story "${a.story}" for ${a.id}`);
    consents[a.id] = consentsFor(a, todayISO, guardianUid, signatureName);
    if (a.story !== 'tested') continue;
    const circuitDate = addDaysISO(todayISO, -63);
    const season = seasonOf(circuitDate);
    const at = stamp(circuitDate, 22);
    collections[`athletes/${a.id}/assessments`] = new Map([[`${season}-baseline`, {
      athleteId: a.id, season, kind: 'baseline', protocolVersion, circuitMode: mode, status: 'complete',
      circuitDate, golfDate: circuitDate, mcgillDate: circuitDate, weeksOfExposure: 0,
      wave: { id: `wave-${circuitDate}-fixtr`, position: (tested % 4) + 1, coachUid },
      ...SECTIONS,
      notTested: {},
      enteredBy: Object.fromEntries(Object.keys(SECTIONS).map((s) => [s, coachUid])),
      createdAt: at,
      updatedAt: at,
    }]]);
    collections[`athletes/${a.id}/assessmentProfile`] = new Map([['current', {
      athleteId: a.id, sex: a.sex ?? null, firstTestDate: circuitDate, medballMassKg: 2, medballMethod: 'speed', dominantHand: 'right',
      gripDevice: 'D1', handlePosition: '3', driver: 'Fixture driver', season, updatedAt: at, updatedBy: coachUid,
    }]]);
    tested += 1;
  }
  return { consents, collections };
}
```

In `scripts/seed-firestore.mjs`, replace:

```js
import { bundleFrontend, fwdPath } from './lib/bundle-frontend.mjs';
```

with:

```js
import { bundleFrontend, fwdPath } from './lib/bundle-frontend.mjs';
import { assessmentFixtures } from './lib/assessment-fixtures.mjs';
```

then replace:

```js
    `export { NOTIFICATION_CATEGORIES } from '${fwdPath(path.join(dataDir, 'parent.js'))}';`,
  ], { tmpPrefix: 'ryp-seed-' });
```

with:

```js
    `export { NOTIFICATION_CATEGORIES } from '${fwdPath(path.join(dataDir, 'parent.js'))}';`,
    // Assessments (2026-10-14): the circuit-mode snapshot and the season rule
    // the fixtures need, bundled like everything else rather than retyped.
    `export { DEFAULT_SETTINGS, PROTOCOL_VERSION, circuitModeOf } from '${fwdPath(path.join(dataDir, 'assessmentSettings.js'))}';`,
    `export { seasonOf } from '${fwdPath(path.join(dataDir, 'assessmentWindows.js'))}';`,
  ], { tmpPrefix: 'ryp-seed-' });
```

then replace:

```js
    householdId: parkerHouseholdId,
    packageId: 'elite',
    contractMinutes: null,
    coachId: null,
  });
```

with:

```js
    householdId: parkerHouseholdId,
    packageId: 'elite',
    contractMinutes: null,
    coachId: null,
  });

  // Assessments (2026-10-14 spec): jordan tested at baseline nine weeks ago
  // (mid-season eligible), reese said no to research (baseline due), nico's
  // family has not answered (the list cannot add him, and Dana's one-time
  // confirm asks at sign-in), sage-parker said yes (baseline due). Every doc
  // comes from scripts/lib/assessment-fixtures.mjs; the consents land on the
  // athlete docs, the windows and profiles in their subcollections.
  const assessment = assessmentFixtures({
    todayISO: isoDate(new Date()),
    mode: portal.circuitModeOf(portal.DEFAULT_SETTINGS),
    seasonOf: portal.seasonOf,
    protocolVersion: portal.PROTOCOL_VERSION,
    coachUid: 'phil',
    guardianUid: 'parent-dana',
    signatureName: 'Dana Whitfield',
    athletes: [
      { id: 'jordan', story: 'tested', sex: 'female' },
      { id: 'reese', story: 'declined' },
      { id: 'nico', story: 'unanswered' },
      { id: parkerAthleteId, story: 'due' },
    ],
  });
  for (const [id, consents] of Object.entries(assessment.consents)) athletes.get(id).consents = consents;
```

then replace:

```js
    calendlyEvents,
    notifications,
  };
}
```

with:

```js
    calendlyEvents,
    notifications,
    ...assessment.collections,
  };
}
```

then replace:

```js
  if (DRY_RUN) {
    console.log('\n[dry-run] nothing written. Set FIRESTORE_EMULATOR_HOST and re-run to seed the emulator.');
```

with:

```js
  console.log('\nAssessments (2026-10-14): research answers, windows, profiles:');
  for (const [id, doc] of collections.athletes) {
    const r = doc.consents?.research;
    if (doc.consents) console.log(`  athletes/${id}: research=${r ? (r.value ? 'yes' : 'no') : 'not answered'}`);
  }
  for (const [name, docs] of Object.entries(collections)) {
    if (!/\/assessments$|\/assessmentProfile$/.test(name)) continue;
    for (const [id, doc] of docs) {
      console.log(`  ${name}/${id}: ${doc.kind ? `${doc.status} ${doc.kind} circuit ${doc.circuitDate}` : `sex=${doc.sex} firstTestDate=${doc.firstTestDate}`}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n[dry-run] nothing written. Set FIRESTORE_EMULATOR_HOST and re-run to seed the emulator.');
```

In `docs/portal/DATA-MODEL.md`, replace:

```md
| `scholarshipMeta` | the UTC day, `YYYY-MM-DD` | **2026-10-01.** `submitScholarship`'s daily counter, one doc per day. No seed. |
```

with:

```md
| `scholarshipMeta` | the UTC day, `YYYY-MM-DD` | **2026-10-01.** `submitScholarship`'s daily counter, one doc per day. No seed. |
| `athletes/{athleteId}/assessments` | `{season}-{kind}` (`2026-27-baseline`) | **2026-10-14 (assessments).** One window per athlete per test window, enforced by the keyspace: a wave cannot open a second baseline in a season. See [below](#assessments-2026-10-14). |
| `athletes/{athleteId}/assessmentProfile` | `current` | **2026-10-14.** One profile per athlete: sex, first-test date, the season's med ball. |
| `assessmentSettings` | `current` | **2026-10-14.** The one protocol settings doc; absent == the v1.2 defaults in `data/assessmentSettings.js`. |
```

Append to `docs/portal/DATA-MODEL.md`:

```md

## Assessments (2026-10-14)

Phil Herder's Physical Performance Assessment protocol v1.2 replaces Diagnostic Capture (spec: `docs/portal/plans/2026-10-14-assessments/00-spec.md`; plan: `01-plan.md` beside it). Scores are never stored: every screen computes them from the trials (`frontend/src/portal/data/assessmentScoring.js`, `assessmentResults.js`). Writes are client writes validated by `firestore.rules` (`scripts/rules-probes/assessments.mjs`, `research.mjs`); one section per write, so each request checks only that section's trials and stays inside the rules' per-request expression cap.

### `athletes/{athleteId}/assessments/{season}-{kind}`

| Field | Type | Notes |
|---|---|---|
| `athleteId`, `season`, `kind` | string | `kind` is `baseline \| mid \| end`; the doc id is `{season}-{kind}`. |
| `protocolVersion` | string | `v1.2`; results under another version are flagged and never compared. |
| `circuitMode` | map | The settings snapshot the window ran under (`circuitModeOf`): trial counts, grip rest, stations, McGill mode, med ball side, golf timing, wave size, hop and RSImod entry, coefficient set. |
| `status` | string | `open \| complete`. |
| `circuitDate`, `golfDate`, `mcgillDate` | `YYYY-MM-DD` \| null | Coach-set, within 14 days of entry (rules `recentDate`); `season` is the circuit date's August-July season. An open window older than 14 days is marked complete, never moved into a new wave. Golf is due within 7 days of the circuit; McGill may be its own block within 14. The first golf or McGill save dates it. |
| `weeksOfExposure` | int | Weeks from the profile's `firstTestDate` to `circuitDate`. |
| `wave` | map | `{ id, position 1-4, coachUid }`. |
| `readiness`, `log`, `anthro`, `grip`, `cmj`, `hop`, `medball`, `mcgill`, `golf`, `notTested` | map | One section each, shapes and ranges in the spec (4.1, 4.4) and `data/assessmentInput.js`. A 10/5 set is `{ rsiBest5, gctMs }` or every hop as `{ hopRsi: [<=10], hopGctMs: [<=10] }` (shape-checked by the rules, range-checked by the client). CMJ holds at most 3 scored trials. |
| `enteredBy` | map | `{ [section]: uid }`, the writer of each section. |
| `createdAt`, `updatedAt` | timestamp | Server time. |

Access: owner, ops, Phil (`specialistId 'phil'`) and assessor staff read and write every section; every other coach reads, and writes the golf section and `golfDate` of an open window; families never read raw windows; delete is owner only. Collection-group reads (`collectionGroup('assessments')`) carry the same read rule and need no composite index (no filter, no order).

### `athletes/{athleteId}/assessmentProfile/current`

`{ athleteId, sex 'male' | 'female' | null, firstTestDate, medballMassKg 2 | 3 | 4, medballMethod 'speed' | 'distance', dominantHand, gripDevice, handlePosition, driver, season, updatedAt, updatedBy }`. Within a season the med ball method and mass never change once set, the first-test date never moves, and `season` only moves forward (Phil: "block mixing"); a window's med ball must be entered under a profile of its own season; the owner may correct a mistake. Staff write; staff and coaches read.

### `assessmentSettings/current`

The protocol's procedure as settings (spec 4.6): `protocolVersion`, `trialCounts`, `gripRestSec`, `stations`, `mcgillMode`, `medballSide`, `golfTiming`, `waveSize`, `wavesPerSession`, `hopEntry`, `rsiModEntry`, `coefficients` (Moore 2015, `verified`), `thresholds`, `updatedAt`, `updatedBy`. Every key is written on each save. The owner and Phil write; staff read. A procedure change saves under a new version label.

### New fields on existing docs

- `users.assessor` (boolean, absent == false): the Assessments permission for a coach or mental account. Only the owner sets it (Staff & Roles); it shows the Assessments tab and admits the account to every assessment write.
- `athletes.consents` (map, absent on athletes created before 2026-10-14): `{ dataCollection, videoCapture, mediaRelease, research, signature: { name, date } }`, written by `createFamily`. `research` is `{ value, assent, recordedAt, recordedBy, history? }` or null: under 18 a yes needs the assent; 18+ the assent is null. The household's parent (or the 18+ member who created their own household) may set it once when none is recorded (the one-time confirm); the owner records a later change, the earlier answer appended to `history`. A window counts for research only under the answer in force on its `circuitDate`.

Seed (`scripts/seed-firestore.mjs`, fixtures in `scripts/lib/assessment-fixtures.mjs`): jordan has a complete baseline 63 days back (mid-season eligible) and research yes; reese research no; nico not answered (the list cannot add him and Dana is asked at sign-in); sage-parker research yes. No `assessmentSettings` doc is seeded, so the defaults path runs.
```

- [ ] **Step 4: Run the tests and the seed dry run**

Run: `node --test scripts/test/*.test.mjs`
Expected: PASS, every test file (`# fail 0`).

Run: `node scripts/seed-firestore.mjs --dry-run`
Expected: the counts end with a `total:` line and the new block lists `athletes/jordan: research=yes`, `athletes/reese: research=no`, `athletes/nico: research=not answered`, `athletes/sage-parker: research=yes`, `athletes/jordan/assessments/<season>-baseline: complete baseline circuit <today-63>` and `athletes/jordan/assessmentProfile/current: sex=female ...`, then `[dry-run] nothing written.`

- [ ] **Step 5: Run the full wave end to end on the emulator**

This exercises the live code path against the local emulators only (never port 3000, never production). Three terminals, from the worktree root:

Run (terminal 1): `npx firebase-tools emulators:start --only firestore,auth --project rypacad`
Expected: "All emulators ready".

Run (terminal 2): `npm run seed:emulator`
Expected: `Done: N documents seeded.`

Run (terminal 3): `cd frontend && PORT=3004 BROWSER=none REACT_APP_USE_EMULATORS=true REACT_APP_PORTAL_LIVE_DATA=true npx react-scripts start`
Expected: "Compiled successfully" on http://localhost:3004.

Then in a browser at `http://localhost:3004/portal/signin`, from the console:

1. `await window.__rypTestAuth.signInAs('phil')`, open `/portal/assessments`. Expected: the Assessments tab is highlighted; Jordan reads "Mid-season eligible", Reese and Sage "Baseline due", Nico "Waiting on the family's research answer" with no select box.
2. Select Reese and Jordan, Start wave (today's date, Jordan's window "Mid-season"). Expected: the wave opens with stations 1-6 (McGill because Reese is a baseline); at each station type at least one value per athlete; the header reads "All saved" after each entry; in McGill start and stop one hold.
3. Open Reese's results from the list. Expected: "Baseline · <today>", every typed trial under "Every trial", the maturity offset (or "not computed: sex not entered at intake" when intake left her sex blank), "not in research". Open Jordan's: two windows, the mid-season one with change markers and "First retest" flagged; Mark window complete on it. Leave Reese's open.
4. `await window.__rypTestAuth.signInAs('coach-luke')`, open a training session Reese is booked on from the coach home. Expected: Reese's row shows "Clubhead speed" (her window is open; Jordan's, now complete, shows none); enter five swings and a Parallax composite; back as Phil, Reese's results show the clubhead rows.
5. `await window.__rypTestAuth.signInAs('parent-dana')`, open `/portal/family`. Expected: "One quick question about research" for Nico; tick nothing and Save my answer; the family home opens; signing in again does not ask again.
6. With the wave open, resize the window to 375x812, 1024x768 and 1440x900. Expected: one athlete with a switcher, two columns, four columns; Phil's results at 1440 wide show the table of every window.

Stop the three processes (Ctrl+C) when done. Nothing is committed from this step.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/assessment-fixtures.mjs scripts/test/assessment-fixtures.test.mjs scripts/seed-firestore.mjs docs/portal/DATA-MODEL.md
git commit -m "chore(seed): assessment fixtures for the emulator, and the data model

Invented athletes in every list state (tested, due, declined, not
answered), shared with the staging test copy; DATA-MODEL documents the
windows, profile, settings, users.assessor and athletes.consents.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 25: The staging-safe seed and the "Test copy" marker

**Files:**
- Create: `scripts/seed-staging-assessments.mjs`
- Create: `scripts/test/seed-staging-assessments.test.mjs`
- Create: `frontend/src/portal/components/TestCopyRibbon.js`
- Create: `frontend/src/testCopyGuard.js` (the test copy refuses to start against any project but staging)
- Modify: `frontend/src/firebase.js` (the guard runs before Firebase is initialized)
- Modify: `frontend/src/portal/PortalRoutes.js` (render the marker)
- Modify: `.firebaserc` (a `staging` alias for `ryp-academy-app`)
- Test: `frontend/src/portal/components/TestCopyRibbon.test.js`, `frontend/src/testCopyGuard.test.js`

**Interfaces:**
- Consumes: `assessmentFixtures` (Task 24); `fsFields` (`scripts/lib/firestore-rest.mjs`, pure encoding only - its `PROJECT_ID`, `docName` and `commit` are production-bound and are never imported here); `prodAccessToken` (`scripts/lib/prod-auth.mjs`, the owner's firebase-tools login, called only on `--yes`); `bundleFrontend`.
- Produces: `scripts/seed-staging-assessments.mjs` exporting `STAGING_PROJECT = 'ryp-academy-app'`, `PRODUCTION_PROJECT = 'rypacad'`, `HOUSEHOLD_ID`, `TEST_ATHLETES`, `assertStagingTarget(project)`, `parseArgs(argv)`, `planStaging({ todayISO, mode, seasonOf, protocolVersion, ownerUid, philUid, assessorUid })` returning `[{ path, data }]`, `main({ argv, fetchImpl, getToken, loadPortal, log, todayISO })`. Flags: `--dry-run` (offline: no token, no network), `--yes` (the owner's write), `--wipe-assessments` (with `--yes`: deletes the test athletes' windows and profiles and `assessmentSettings/current` first), `--owner-uid`, `--phil-uid`, `--assessor-uid` (staff role docs on staging), `--project` (anything but `ryp-academy-app` is refused). `TestCopyRibbon` (shown when `REACT_APP_TEST_COPY=true`); `frontend/src/testCopyGuard.js` exporting `TEST_COPY_PROJECT = 'ryp-academy-app'` and `assertTestCopyTarget(env)` (throws when `REACT_APP_TEST_COPY === 'true'` and `REACT_APP_FIREBASE_PROJECT_ID` is anything but `ryp-academy-app`, naming `rypacad` as the LIVE database), called by `firebase.js` before `initializeApp`, so a test-copy build pointed at production never starts; the `.firebaserc` alias `staging` (`--project staging` is `ryp-academy-app`). Task 26's owner steps run these.

- [ ] **Step 1: Write the failing tests**

Create `scripts/test/seed-staging-assessments.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUSEHOLD_ID, STAGING_PROJECT, TEST_ATHLETES, assertStagingTarget, main, parseArgs, planStaging } from '../seed-staging-assessments.mjs';

const seasonOf = () => '2026-27';
const portal = { circuitModeOf: () => ({ waveSize: 4 }), DEFAULT_SETTINGS: {}, PROTOCOL_VERSION: 'v1.2', seasonOf };
/** A recording stand-in for fetch: every call is kept; list calls answer from `subdocs`. */
function fakeFetch(subdocs = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    if (!init.method || init.method === 'GET') {
      const key = Object.keys(subdocs).find((k) => url.includes(`/documents/${k}?`));
      return { ok: true, status: 200, json: async () => ({ documents: (subdocs[key] || []).map((p) => ({ name: `projects/${STAGING_PROJECT}/databases/(default)/documents/${p}` })) }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return Object.assign(fn, { calls });
}
const run = (argv, extra = {}) => main({ argv, fetchImpl: extra.fetchImpl ?? fakeFetch(), getToken: extra.getToken ?? (async () => 'TOKEN'), loadPortal: () => portal, log: () => {}, todayISO: '2026-10-15' });

test('only the staging test copy is ever a target; production is refused by name', async () => {
  assert.equal(assertStagingTarget('ryp-academy-app'), 'ryp-academy-app');
  assert.throws(() => assertStagingTarget('rypacad'), /PRODUCTION/);
  assert.throws(() => assertStagingTarget('some-other-project'), /not the staging test copy/);
  const fetchImpl = fakeFetch();
  let tokens = 0;
  await assert.rejects(run(['--yes', '--project', 'rypacad'], { fetchImpl, getToken: async () => { tokens += 1; return 'T'; } }), /PRODUCTION/);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(tokens, 0);
});

test('without --dry-run or --yes nothing happens', async () => {
  const fetchImpl = fakeFetch();
  await assert.rejects(run([], { fetchImpl }), /--dry-run.*--yes/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('--dry-run is offline: no token, no request, the plan returned', async () => {
  const fetchImpl = fakeFetch();
  let tokens = 0;
  const out = await run(['--dry-run'], { fetchImpl, getToken: async () => { tokens += 1; return 'T'; } });
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(tokens, 0);
  assert.equal(out.written, 0);
  assert.ok(out.docs.length > TEST_ATHLETES.length);
});

test('the plan: one invented household, every athlete named "... Test", fixtures for the tested ones, staff only when asked', () => {
  const docs = planStaging({ todayISO: '2026-10-15', mode: { waveSize: 4 }, seasonOf, protocolVersion: 'v1.2' });
  const athletes = docs.filter((d) => /^athletes\/[^/]+$/.test(d.path));
  assert.equal(athletes.length, 8);
  assert.ok(athletes.every((d) => d.data.householdId === HOUSEHOLD_ID && / Test$/.test(d.data.name)));
  assert.equal(docs.filter((d) => d.path.startsWith('users/')).length, 0);
  assert.deepEqual(docs.filter((d) => d.path.endsWith('/assessments/2026-27-baseline')).map((d) => d.path).sort(), ['athletes/test-ava/assessments/2026-27-baseline', 'athletes/test-ben/assessments/2026-27-baseline']);
  assert.equal(athletes.find((d) => d.path === 'athletes/test-hal').data.consents.research, null);
  const staffed = planStaging({ todayISO: '2026-10-15', mode: {}, seasonOf, protocolVersion: 'v1.2', ownerUid: 'u-owner', philUid: 'u-phil', assessorUid: 'u-data' });
  const users = Object.fromEntries(staffed.filter((d) => d.path.startsWith('users/')).map((d) => [d.path, d.data]));
  assert.deepEqual([users['users/u-owner'].role, users['users/u-phil'].specialistId, users['users/u-data'].assessor], ['owner', 'phil', true]);
});

test('--yes writes to ryp-academy-app only, with the owner token, in one commit per 400 writes', async () => {
  const fetchImpl = fakeFetch();
  const out = await run(['--yes', '--phil-uid', 'u-phil'], { fetchImpl });
  assert.ok(fetchImpl.calls.length >= 1);
  assert.ok(fetchImpl.calls.every((c) => c.url.includes(`/projects/${STAGING_PROJECT}/`) && !c.url.includes('/projects/rypacad/')));
  assert.ok(fetchImpl.calls.every((c) => c.init.headers.authorization === 'Bearer TOKEN'));
  const writes = fetchImpl.calls.flatMap((c) => JSON.parse(c.init.body).writes);
  assert.equal(writes.length, out.docs.length);
  assert.ok(writes.every((w) => w.update.name.startsWith(`projects/${STAGING_PROJECT}/databases/(default)/documents/`)));
});

test('--wipe-assessments deletes only the test athletes\' windows and profiles and the settings, before writing', async () => {
  const fetchImpl = fakeFetch({ 'athletes/test-cal/assessments': ['athletes/test-cal/assessments/2026-27-baseline'], 'athletes/test-ava/assessmentProfile': ['athletes/test-ava/assessmentProfile/current'] });
  await run(['--yes', '--wipe-assessments'], { fetchImpl });
  const lists = fetchImpl.calls.filter((c) => !c.init.method || c.init.method === 'GET');
  assert.equal(lists.length, TEST_ATHLETES.length * 2);
  assert.ok(lists.every((c) => /\/documents\/athletes\/test-[a-z]+\/(assessments|assessmentProfile)\?/.test(c.url)));
  const commits = fetchImpl.calls.filter((c) => c.init.method === 'POST');
  const deletes = JSON.parse(commits[0].init.body).writes.map((w) => w.delete);
  assert.deepEqual(deletes.map((d) => d.split('/documents/')[1]).sort(), ['assessmentSettings/current', 'athletes/test-ava/assessmentProfile/current', 'athletes/test-cal/assessments/2026-27-baseline']);
  assert.ok(JSON.parse(commits[1].init.body).writes.every((w) => w.update));
});

test('the flags parse', () => {
  assert.deepEqual(parseArgs(['--yes', '--wipe-assessments', '--owner-uid', 'o', '--phil-uid', 'p']), { project: STAGING_PROJECT, dryRun: false, yes: true, wipe: true, ownerUid: 'o', philUid: 'p', assessorUid: null });
});
```

Create `frontend/src/portal/components/TestCopyRibbon.test.js`:

```js
import React from 'react';
import { renderScreen } from '../screens/testRender';
import TestCopyRibbon from './TestCopyRibbon';

const saved = { copy: process.env.REACT_APP_TEST_COPY, project: process.env.REACT_APP_FIREBASE_PROJECT_ID };
afterEach(() => {
  process.env.REACT_APP_TEST_COPY = saved.copy;
  process.env.REACT_APP_FIREBASE_PROJECT_ID = saved.project;
  if (saved.copy === undefined) delete process.env.REACT_APP_TEST_COPY;
  if (saved.project === undefined) delete process.env.REACT_APP_FIREBASE_PROJECT_ID;
});

test('nothing on the live portal', async () => {
  delete process.env.REACT_APP_TEST_COPY;
  const r = await renderScreen(<TestCopyRibbon />);
  expect(r.text()).toBe('');
  await r.unmount();
});

test('the test copy says so on every screen', async () => {
  process.env.REACT_APP_TEST_COPY = 'true';
  process.env.REACT_APP_FIREBASE_PROJECT_ID = 'ryp-academy-app';
  const r = await renderScreen(<TestCopyRibbon />);
  expect(r.text()).toBe('Test copy · fake athletes');
  await r.unmount();
});

```

Create `frontend/src/testCopyGuard.test.js`:

```js
import { TEST_COPY_PROJECT, assertTestCopyTarget } from './testCopyGuard';

test('the live portal (no test-copy flag) starts as it always has', () => {
  expect(() => assertTestCopyTarget({ REACT_APP_FIREBASE_PROJECT_ID: 'rypacad' })).not.toThrow();
  expect(() => assertTestCopyTarget({})).not.toThrow();
});

test('the test copy starts against the staging project', () => {
  expect(TEST_COPY_PROJECT).toBe('ryp-academy-app');
  expect(() => assertTestCopyTarget({ REACT_APP_TEST_COPY: 'true', REACT_APP_FIREBASE_PROJECT_ID: 'ryp-academy-app' })).not.toThrow();
});

test('a test copy built against the live database, or any other project, refuses to start', () => {
  expect(() => assertTestCopyTarget({ REACT_APP_TEST_COPY: 'true', REACT_APP_FIREBASE_PROJECT_ID: 'rypacad' })).toThrow(/the LIVE database/);
  expect(() => assertTestCopyTarget({ REACT_APP_TEST_COPY: 'true', REACT_APP_FIREBASE_PROJECT_ID: 'some-other-project' })).toThrow(/not ryp-academy-app/);
  expect(() => assertTestCopyTarget({ REACT_APP_TEST_COPY: 'true' })).toThrow(/not ryp-academy-app/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/test/*.test.mjs`
Expected: FAIL - "Cannot find module ... scripts/seed-staging-assessments.mjs".

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/TestCopyRibbon.test.js src/testCopyGuard.test.js`
Expected: FAIL - "Cannot find module './TestCopyRibbon'" and "Cannot find module './testCopyGuard'".

- [ ] **Step 3: Write minimal implementation**

Create `scripts/seed-staging-assessments.mjs`:

```js
#!/usr/bin/env node
/**
 * The staging TEST COPY's fake athletes, for Phil's dry run before release
 * (assessments spec 9; owner, 2026-10-15): one invented household, eight
 * invented athletes named "... Test" in every list state, and - when the
 * owner passes their staging uids - the staff role docs that let the owner,
 * Phil and the data-collection coach sign in to the test copy.
 *
 *   node scripts/seed-staging-assessments.mjs --dry-run
 *   node scripts/seed-staging-assessments.mjs --yes [--owner-uid <uid>] [--phil-uid <uid>] [--assessor-uid <uid>] [--wipe-assessments]
 *
 * Safety: the ONLY project this script will write is the staging project
 * `ryp-academy-app`; `rypacad` (production) and every other id are refused
 * before any token is read or request made. It never imports the
 * production-bound helpers of lib/firestore-rest.mjs (their PROJECT_ID is
 * rypacad) - only the pure value encoder. --dry-run is offline. --yes is
 * the owner's: it authenticates as their firebase-tools login. Writes
 * replace the script's own docs only (fixed ids); --wipe-assessments also
 * deletes what Phil typed into the test athletes and the settings doc.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bundleFrontend, fwdPath } from './lib/bundle-frontend.mjs';
import { fsFields } from './lib/firestore-rest.mjs';
import { prodAccessToken } from './lib/prod-auth.mjs';
import { assessmentFixtures } from './lib/assessment-fixtures.mjs';

export const STAGING_PROJECT = 'ryp-academy-app';
export const PRODUCTION_PROJECT = 'rypacad';
export const HOUSEHOLD_ID = 'test-copy-family';
export const TEST_ATHLETES = [
  { id: 'test-ava', name: 'Ava Test', dob: '2012-04-10', story: 'tested', sex: 'female' },
  { id: 'test-ben', name: 'Ben Test', dob: '2010-08-22', story: 'tested', sex: 'male' },
  { id: 'test-cal', name: 'Cal Test', dob: '2013-01-30', story: 'due' },
  { id: 'test-dev', name: 'Dev Test', dob: '2011-11-05', story: 'due' },
  { id: 'test-eli', name: 'Eli Test', dob: '2009-06-14', story: 'due' },
  { id: 'test-fay', name: 'Fay Test', dob: '2014-02-19', story: 'due' },
  { id: 'test-gus', name: 'Gus Test', dob: '2012-09-01', story: 'declined' },
  { id: 'test-hal', name: 'Hal Test', dob: '2013-05-25', story: 'unanswered' },
];
const BATCH = 400;

export function assertStagingTarget(project) {
  if (project === PRODUCTION_PROJECT) {
    throw new Error(`Refusing: ${project} is PRODUCTION. This script only writes the staging test copy (${STAGING_PROJECT}).`);
  }
  if (project !== STAGING_PROJECT) throw new Error(`Refusing: ${project} is not the staging test copy (${STAGING_PROJECT}).`);
  return project;
}

export function parseArgs(argv) {
  const has = (f) => argv.includes(f);
  const val = (f) => {
    const i = argv.indexOf(f);
    return i > -1 ? argv[i + 1] ?? null : null;
  };
  return {
    project: val('--project') ?? STAGING_PROJECT,
    dryRun: has('--dry-run'),
    yes: has('--yes'),
    wipe: has('--wipe-assessments'),
    ownerUid: val('--owner-uid'),
    philUid: val('--phil-uid'),
    assessorUid: val('--assessor-uid'),
  };
}

/** Every doc the test copy needs, `{ path, data }`, fixed ids only. */
export function planStaging({ todayISO, mode, seasonOf, protocolVersion, ownerUid = null, philUid = null, assessorUid = null }) {
  const fx = assessmentFixtures({
    todayISO, mode, seasonOf, protocolVersion, coachUid: philUid ?? 'phil', guardianUid: 'test-copy-guardian', signatureName: 'Test Guardian', athletes: TEST_ATHLETES,
  });
  const docs = [{
    path: `households/${HOUSEHOLD_ID}`,
    data: { name: 'Test family (test copy)', guardian: { name: 'Test Guardian', email: 'test-guardian@example.com', phone: null }, stripeCustomerId: null, stripeSubscriptionId: null, periodAnchorDay: 1 },
  }];
  for (const a of TEST_ATHLETES) {
    docs.push({
      path: `athletes/${a.id}`,
      data: { name: a.name, dob: a.dob, householdId: HOUSEHOLD_ID, packageId: 't-6', contractMinutes: null, coachId: null, handicap: null, loginEmail: null, consents: fx.consents[a.id] },
    });
  }
  for (const [col, docsIn] of Object.entries(fx.collections)) for (const [id, data] of docsIn) docs.push({ path: `${col}/${id}`, data });
  const staff = (role, specialistId, displayName, extra = {}) => ({ role, householdId: null, athleteId: null, staff: true, specialistId, displayName, email: null, ...extra });
  if (ownerUid) docs.push({ path: `users/${ownerUid}`, data: staff('owner', null, 'Owner (test copy)') });
  if (philUid) docs.push({ path: `users/${philUid}`, data: staff('coach', 'phil', 'Phil Herder') });
  if (assessorUid) docs.push({ path: `users/${assessorUid}`, data: staff('coach', null, 'Data coach (test copy)', { assessor: true }) });
  return docs;
}

const docName = (project, p) => `projects/${project}/databases/(default)/documents/${p}`;
const base = (project) => `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

async function commit(project, writes, { fetchImpl, auth }) {
  for (let i = 0; i < writes.length; i += BATCH) {
    const res = await fetchImpl(`${base(project)}:commit`, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      body: JSON.stringify({ writes: writes.slice(i, i + BATCH) }),
    });
    if (!res.ok) throw new Error(`Commit to ${project} failed (${res.status}).`);
  }
}

/** The paths --wipe-assessments deletes: the test athletes' windows and profiles, and the settings doc. Nothing else. */
async function wipePaths(project, { fetchImpl, auth }) {
  const paths = [];
  for (const a of TEST_ATHLETES) {
    for (const sub of ['assessments', 'assessmentProfile']) {
      const res = await fetchImpl(`${base(project)}/athletes/${a.id}/${sub}?pageSize=100`, { headers: { authorization: auth } });
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(`Listing athletes/${a.id}/${sub} on ${project} failed (${res.status}).`);
      const body = await res.json();
      for (const d of body.documents || []) paths.push(d.name.split('/documents/')[1]);
    }
  }
  return [...paths, 'assessmentSettings/current'];
}

function loadPortalData() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dataDir = path.join(repoRoot, 'frontend', 'src', 'portal', 'data');
  return bundleFrontend(repoRoot, [
    `export { DEFAULT_SETTINGS, PROTOCOL_VERSION, circuitModeOf } from '${fwdPath(path.join(dataDir, 'assessmentSettings.js'))}';`,
    `export { seasonOf } from '${fwdPath(path.join(dataDir, 'assessmentWindows.js'))}';`,
  ], { tmpPrefix: 'ryp-staging-' });
}

export async function main({
  argv = process.argv.slice(2), fetchImpl = fetch, getToken = prodAccessToken, loadPortal = loadPortalData, log = console.log,
  todayISO = new Date().toISOString().slice(0, 10),
} = {}) {
  const args = parseArgs(argv);
  const project = assertStagingTarget(args.project);
  if (!args.dryRun && !args.yes) throw new Error('Nothing written. Re-run with --dry-run to see the plan, or --yes (the owner) to write the staging test copy.');
  const portal = loadPortal();
  const docs = planStaging({
    todayISO, mode: portal.circuitModeOf(portal.DEFAULT_SETTINGS), seasonOf: portal.seasonOf, protocolVersion: portal.PROTOCOL_VERSION,
    ownerUid: args.ownerUid, philUid: args.philUid, assessorUid: args.assessorUid,
  });
  log(`Staging test copy (${project}): ${docs.length} docs`);
  for (const d of docs) log(`  ${d.path}`);
  if (args.dryRun) {
    log('[dry-run] nothing written; no token read, no request made.');
    return { written: 0, docs };
  }
  const auth = `Bearer ${await getToken()}`;
  if (args.wipe) {
    const gone = await wipePaths(project, { fetchImpl, auth });
    await commit(project, gone.map((p) => ({ delete: docName(project, p) })), { fetchImpl, auth });
    log(`Wiped ${gone.length} assessment docs on ${project}.`);
  }
  await commit(project, docs.map((d) => ({ update: { name: docName(project, d.path), fields: fsFields(d.data) } })), { fetchImpl, auth });
  log(`Written: ${docs.length} docs to ${project}.`);
  return { written: docs.length, docs };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
```

Create `frontend/src/portal/components/TestCopyRibbon.js`:

```js
import React from 'react';
import { color, font, radius } from '../tokens';

/**
 * The staging test copy's marker (assessments spec 9): a build with
 * REACT_APP_TEST_COPY=true (the separate Railway service Phil uses for the
 * dry run) says "Test copy" on every screen, so nobody mistakes it for the
 * live portal. A test-copy build pointed at any project but staging never
 * gets this far: frontend/src/testCopyGuard.js stops it before Firebase
 * starts. The live portal never sets the variable.
 */
export default function TestCopyRibbon() {
  if (process.env.REACT_APP_TEST_COPY !== 'true') return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 6, right: 6, zIndex: 1000, pointerEvents: 'none',
        padding: '3px 10px', borderRadius: radius.pill,
        background: color.secondary, color: '#000',
        font: `700 10px ${font.body}`, letterSpacing: '.08em', textTransform: 'uppercase',
      }}
    >
      Test copy · fake athletes
    </div>
  );
}
```

Create `frontend/src/testCopyGuard.js`:

```js
/**
 * The staging test copy's guard (assessments spec 9): a build with
 * REACT_APP_TEST_COPY=true is Phil's rehearsal portal and must point at the
 * staging project. Any other project - above all the live one, rypacad -
 * refuses to start, before Firebase is initialized (firebase.js calls this
 * first), so a rehearsal wave can never be written beside real families.
 * `env` is process.env, which CRA fills at build time.
 */
export const TEST_COPY_PROJECT = 'ryp-academy-app';

export function assertTestCopyTarget(env) {
  if (env.REACT_APP_TEST_COPY !== 'true') return;
  const project = env.REACT_APP_FIREBASE_PROJECT_ID;
  if (project === TEST_COPY_PROJECT) return;
  throw new Error(
    `Refusing to start: this is the test copy (REACT_APP_TEST_COPY=true) but REACT_APP_FIREBASE_PROJECT_ID is "${project ?? ''}", not ${TEST_COPY_PROJECT}${project === 'rypacad' ? ' - that is the LIVE database' : ''}. Fix the test copy service's variables and redeploy.`
  );
}
```

In `frontend/src/firebase.js`, replace:

```js
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
```

with:

```js
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { assertTestCopyTarget } from './testCopyGuard';
```

then replace:

```js
// Initialize Firebase
let app;
```

with:

```js
// Assessments spec 9: the staging test copy never starts against any
// project but staging (testCopyGuard.js) - checked before Firebase starts.
assertTestCopyTarget(process.env);

// Initialize Firebase
let app;
```

In `.firebaserc`, replace:

```json
    "default": "rypacad"
```

with:

```json
    "default": "rypacad",
    "staging": "ryp-academy-app"
```

In `frontend/src/portal/PortalRoutes.js`, replace:

```js
import ResearchConfirmGate from './components/ResearchConfirmGate';
```

with:

```js
import ResearchConfirmGate from './components/ResearchConfirmGate';
import TestCopyRibbon from './components/TestCopyRibbon';
```

then replace:

```js
  return (
    <Suspense fallback={null}>
    <Routes>
```

with:

```js
  return (
    <>
    {/* Assessments spec 9: the staging test copy says so on every screen. */}
    <TestCopyRibbon />
    <Suspense fallback={null}>
    <Routes>
```

then replace:

```js
    </Routes>
    </Suspense>
  );
}
```

with:

```js
    </Routes>
    </Suspense>
    </>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/test/*.test.mjs`
Expected: PASS (`# fail 0`).

Run: `node scripts/seed-staging-assessments.mjs --dry-run`
Expected: `Staging test copy (ryp-academy-app): 13 docs`, the paths (one household, eight athletes, two windows, two profiles), then `[dry-run] nothing written; no token read, no request made.`

Run: `node scripts/seed-staging-assessments.mjs --dry-run --project rypacad`
Expected: exit 1, "Refusing: rypacad is PRODUCTION. This script only writes the staging test copy (ryp-academy-app)."

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/components/TestCopyRibbon.test.js src/testCopyGuard.test.js src/portal/PortalRoutes src/portal/AssessmentRoutes.test.js`
Expected: PASS.

Run: `cd frontend && npm run build`
Expected: "Compiled successfully." (the live build sets no REACT_APP_TEST_COPY, so the guard passes).

Run: `node -e "console.log(JSON.parse(require('fs').readFileSync('.firebaserc', 'utf8')).projects)"`
Expected: `{ default: 'rypacad', staging: 'ryp-academy-app' }` (the default stays production; the test copy is always named).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-staging-assessments.mjs scripts/test/seed-staging-assessments.test.mjs frontend/src/portal/components/TestCopyRibbon.js frontend/src/portal/components/TestCopyRibbon.test.js frontend/src/testCopyGuard.js frontend/src/testCopyGuard.test.js frontend/src/firebase.js frontend/src/portal/PortalRoutes.js .firebaserc
git commit -m "chore(staging): fake-athlete seed for the test copy, and its marker

A seed that can only write ryp-academy-app (production refused by name,
offline dry run, owner-run --yes, optional wipe of what the dry run
typed), a Test copy badge on a build with REACT_APP_TEST_COPY, a test copy
that refuses to start against any project but staging, and a staging
alias so no rules deploy for it falls through to production.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 26: Owner-run steps - rulings, the staging test copy for Phil, then production

Every step below is the **owner's** (or Phil's) to run (rulings, pushes, deploys, Firebase console, Railway, and the staging seed's `--yes`). The implementing agent prepares, runs the gates, and hands the commands over in its final message; it never pushes, deploys or writes to a hosted project itself.

**Files:** none changed here (a ruling that changes code goes on `assessments/v1.2` as its own commit, with its tests, before Step 8). Branch `assessments/v1.2` in `C:\Users\Mac\Desktop\rypacadapp\wt-assessments`; the main checkout is `C:\Users\Mac\Desktop\rypacadapp\rypacad` (`develop`; `main` is production and deploys on push).

**Interfaces:**
- Consumes: everything in Tasks 1-25; `scripts/seed-staging-assessments.mjs` (Task 25); `firestore.rules` (Tasks 4, 9, 22); `functions/portal/family.js` (Task 20); `REACT_APP_TEST_COPY`, `frontend/src/testCopyGuard.js` and the `.firebaserc` alias `staging` (Task 25).
- Produces: the owner's and Phil's rulings on what the plan could only default; a separate test copy of the portal on the staging Firebase project `ryp-academy-app` with fake athletes, served by its own Railway service from the branch; then the production rollout in the spec 10 order: functions, rules, portal. Task 27 follows once the portal is live.

- [ ] **Step 1: Rulings before the merge (owner and Phil)**

The plan implements a default for each; the agent lists them in its final message, and the answers are needed before Step 8 (the dry run in Step 7 is the place to try them):

1. **Phil - a pain stop at any station.** The plan ends every later station for that athlete after a pain stop anywhere in the circuit (protocol Section 2: do not test an athlete who reports current pain); "Undo not tested" at that station opens them again. If Phil rules that a pain stop ends only that station, `painStopBefore` in `components/assessments/StationShell.js` returns null for every station after intake, and `StationShell.test.js` says so.
2. **Phil - late joiners and the season end.** With the season ending Feb 27 (`SEASON_BOUNDS.end`), a baseline after Nov 7 leaves no room for mid-season and end of season 8 weeks apart, so those athletes default to end of season (mid-season still selectable on the start-wave sheet). The protocol's cover says end of season is in March: confirm that the academy's end-of-season window is the last weeks before Feb 27.
3. **Owner - the 18+ wording.** The approved copy words only the 18+ checkbox ("Research (optional): my results may be used in research."), so an 18+ member on their own login reads the approved line, Read more sheet and one-time confirm with their own first name ("Saying no changes nothing about Sam's coaching or testing."). Drafts in the second person, for approval or rewording:
   - line under the checkbox: "Saying no changes nothing about your coaching or testing."
   - Read more, *What it covers*: "... With your permission we include your results in that research: ..."; *Your choice*: "If you say no, you are tested and coached exactly the same way, and your results are used only to coach you."
   - one-time confirm body: "This season Phil Herder's assessment program measures each athlete's strength, power and growth. We'd like to include your results in RYP's research, with names removed. It's optional and changes nothing about your coaching."
   If approved, they go in `data/researchConsent.js` beside the approved copy and are used where `self` is true (`ResearchChoice`, `ResearchSheet`, `ResearchConfirmGate`), with tests pinning each string.
4. **Owner - a parent answering for an 18+ athlete in their household.** Sign-up and the rules let the parent answer research for an athlete aged 18 or over with no agreement from that athlete (assent null); the spec covers only 18+ athletes on their own login. The alternatives: the parent ticks the assent box for every athlete they answer for, whatever the age (sign-up, `normalizeResearch` and the rules branch change together), or only the athlete answers (then an 18+ athlete with no login stays "not answered" and cannot join a wave).
5. **Owner - who deletes raw assessments.** The spec's table gives owner and ops delete; its bullet says owner only. The plan implements owner only (`firestore.rules` and the probes "Phil cannot delete a window", "ops cannot delete a window"). If ops may delete too, that is one rules line and the ops probe flips to 200.

- [ ] **Step 2: Every gate green on the branch (agent)**

Run each from `C:\Users\Mac\Desktop\rypacadapp\wt-assessments`:

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false`
Expected: every suite passes.

Run: `cd frontend && npx eslint src/portal`
Expected: no output.

Run: `cd frontend && npm run build`
Expected: "Compiled successfully." (warnings allowed only if they were there before this branch).

Run: `for f in functions/portal/*.test.js; do node "$f" || exit 1; done && cd functions && npx eslint .`
Expected: every file ends `N passing`; eslint prints nothing.

Run: `node --test scripts/test/*.test.mjs`
Expected: `# fail 0`.

Run: `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"`
Expected: `ALL PASS (both passes)`.

Run: `node scripts/seed-firestore.mjs --dry-run && node scripts/seed-staging-assessments.mjs --dry-run`
Expected: both end with their "nothing written" line.

- [ ] **Step 3: Staging project ready, and empty (owner, Firebase console, work account)**

In the Firebase console for `ryp-academy-app`:
1. Firestore Database: if there is no `(default)` database, create one in Native mode, in the same location as `rypacad`.
2. Authentication > Sign-in method: enable Google (and Email/Password if Phil signs in with a password on the live portal).
3. Project settings > Your apps: if there is no web app, add one; keep its config values (apiKey, authDomain, projectId `ryp-academy-app`, storageBucket, messagingSenderId, appId) for Step 5.

Expected: Firestore shows an empty `(default)` database (no collections); Authentication > Users lists nobody; Google sign-in is enabled.

**Hard stop - anything already there.** The project was in use until 2026-09-17, and the assessments list reads every athlete doc in the project, so anything left would show on Phil's tablet beside the fake athletes. If Firestore holds any collection, or Authentication lists any user, stop and clear it first: export what must be kept, delete every collection and every user, and re-check that both are empty before Step 4.

- [ ] **Step 4: Rules on staging, and the branch on GitHub (owner)**

Run: `cd C:\Users\Mac\Desktop\rypacadapp\wt-assessments && npx firebase-tools deploy --only firestore:rules --project staging`
Expected: "=== Deploying to 'ryp-academy-app'...", "rules file firestore.rules compiled successfully", "Deploy complete!". Only staging's rules change. Never drop `--project staging`: `.firebaserc`'s default is `rypacad`, so without it this would put the new rules on production ahead of the functions. If the first line names `rypacad`, stop and tell the agent.

Run: `cd C:\Users\Mac\Desktop\rypacadapp\wt-assessments && git push origin assessments/v1.2`
Expected: the branch on GitHub (no deploy: Railway's production service builds `main` only).

- [ ] **Step 5: The test copy's Railway service (owner, Railway dashboard)**

1. New service from the same GitHub repo, branch `assessments/v1.2`, with the production portal service's root directory, build and start commands copied exactly.
2. Variables: the six `REACT_APP_FIREBASE_*` values from Step 3's staging web app (never the `rypacad` ones), `REACT_APP_PORTAL_LIVE_DATA=true`, `REACT_APP_TEST_COPY=true`, `REACT_APP_CONTRACT_ENABLED` as production has it. Leave `REACT_APP_STRIPE_PUBLISHABLE_KEY` unset (no payments on the test copy). CRA bakes `REACT_APP_*` at build, so set them before the first deploy, or redeploy after.
3. Generate a Railway domain for the service, then add that domain to `ryp-academy-app` > Authentication > Settings > Authorized domains.

Expected: the domain serves the portal with a yellow "TEST COPY · FAKE ATHLETES" badge at the top right. A blank page whose browser console reads "Refusing to start: this is the test copy ..." means `REACT_APP_FIREBASE_PROJECT_ID` is not `ryp-academy-app` (with `rypacad`, the message names the LIVE database): the build never started Firebase; fix the variables and redeploy before anyone signs in.

- [ ] **Step 6: Staff on the test copy, and the fake athletes (owner)**

1. The owner and Phil each open the test copy once and sign in (they land on "not set up"). The data-collection coach does too, if they will rehearse.
2. Copy each person's User UID from `ryp-academy-app` > Authentication > Users.
3. Run (the owner's firebase-tools login must be the work account: `npx firebase-tools login:list`):

Run: `cd C:\Users\Mac\Desktop\rypacadapp\wt-assessments && node scripts/seed-staging-assessments.mjs --dry-run --owner-uid <ownerUid> --phil-uid <philUid>`
Expected: `Staging test copy (ryp-academy-app): 15 docs` and the list, `[dry-run] nothing written; no token read, no request made.`

Run: `cd C:\Users\Mac\Desktop\rypacadapp\wt-assessments && node scripts/seed-staging-assessments.mjs --yes --owner-uid <ownerUid> --phil-uid <philUid>`
Expected: `Written: 15 docs to ryp-academy-app.` Add `--assessor-uid <dataCoachUid>` for the data-collection coach (16 docs).

- [ ] **Step 7: Phil's dry run on his tablet (Phil, with the owner)**

On the test copy: Phil's Assessments tab lists Ava and Ben "Mid-season eligible", Cal, Dev, Eli, Fay and Gus "Baseline due" (Gus said no to research), and Hal "Waiting on the family's research answer". Phil runs a timed wave of four (Cal, Dev, Eli, Fay), every station, on the tablet, then opens results. What he checks against the equipment (spec 11): what Smart2Move shows per CMJ and per 10/5 set (settings: RSImod typed or computed, 10/5 per set or every hop), the radar on the med ball, Parallax frame rate and composite scale, McGill inside the wave or as its own block, and the wave timing; and Step 1's pain stop. Golf entry has no roster on staging (no sessions): open `/portal/assessments/golf/test-cal`. Settings changes made here stay on the test copy.

To reset for another rehearsal:

Run: `cd C:\Users\Mac\Desktop\rypacadapp\wt-assessments && node scripts/seed-staging-assessments.mjs --yes --wipe-assessments --owner-uid <ownerUid> --phil-uid <philUid>`
Expected: `Wiped N assessment docs on ryp-academy-app.` then `Written: 15 docs to ryp-academy-app.`

Code changes from the dry run or from Step 1's rulings go on `assessments/v1.2` (re-run Step 2, owner pushes the branch; the test copy redeploys).

- [ ] **Step 8: Production - merge and gates (agent, then owner approval)**

After Phil's sign-off, every Step 1 ruling answered, and the owner's go:

Run: `cd C:\Users\Mac\Desktop\rypacadapp\rypacad && git checkout develop && git merge --no-ff assessments/v1.2`
Expected: a merge commit on `develop`, no conflicts (if `develop` moved, resolve and re-run Step 2's gates in the main checkout).

Re-run every Step 2 command in `C:\Users\Mac\Desktop\rypacadapp\rypacad`. Expected: the same results.

Before going live, check the dependencies (spec 10): the data-collection coach has a staff login; golf coaches have logins. Without the staff-audit fix for coach athlete reads, a golf coach's clubhead screen and results show the name from the roster and "the athlete record could not be read" for maturity; entry still works.

- [ ] **Step 9: Production - functions, then rules, then portal, back to back (owner)**

The spec 10 order, with no broken window: the rules keep the diagnostics reads (read-only, Task 9), so the live bundle - whose athlete home and admin dashboard read diagnostics beside everything else - keeps loading between the rules deploy and the portal push, and every read the new portal makes is granted by the time it is live. Production holds 0 diagnostics docs (checked 2026-10-14), so nothing is lost.

Run: `cd C:\Users\Mac\Desktop\rypacadapp\rypacad && npx firebase-tools deploy --only functions:createFamily,functions:addAthletes,functions:claimInvite --project rypacad`
Expected: "Deploy complete!" for the three functions (createFamily now stores consents and research answers; the live bundle's sign-up sends none and is unaffected).

Run: `cd C:\Users\Mac\Desktop\rypacadapp\rypacad && npx firebase-tools deploy --only firestore:rules --project rypacad`
Expected: "Deploy complete!". The live portal still loads every screen.

Run: `cd C:\Users\Mac\Desktop\rypacadapp\rypacad && git push origin develop:main`
Expected: Railway builds and deploys the portal; wait for the deploy to finish.

Then Task 27 removes the diagnostics read rules.

- [ ] **Step 10: Production checks (owner)**

1. Owner: Admin shows the Assessments card; Assessments lists every academy athlete with "Research: not answered" until families answer; Staff & Roles shows the Assessments switch on coach and mental rows - switch it on for the data-collection coach.
2. Phil: his tab bar shows Assessments (no Capture); Settings shows protocol v1.2 defaults ("nothing has been saved yet").
3. A family sign-in (the owner's own test household, never a real family's account): "One quick question about research" appears once; after Save my answer the home opens and it does not ask again.
4. No assessment data exists until Phil's first wave on Nov 3; no purge or backfill of real families' records is part of this release.

If the portal must be rolled back: the owner reverts the merge on `develop` (`git revert -m 1 <mergeCommit>`), pushes `develop:main` first (the old bundle runs on the new rules: the diagnostics reads are still granted), then deploys the reverted rules (`cd C:\Users\Mac\Desktop\rypacadapp\rypacad && npx firebase-tools deploy --only firestore:rules --project rypacad`). The functions can stay: the old bundle never sends a research answer and ignores the stored consents.

---

### Task 27: After the portal is live - remove the diagnostics read rules

The follow-up Task 9 left for after the release (spec 8, spec 10 order): once the new portal is live no bundle reads diagnostics, so the read-only grants go. **Start only after the owner confirms Task 26 Step 8 is done and the new portal is live.** Work on a new branch from `develop` in the main checkout (`assessments/v1.2` is merged by then): a commit on `develop` before the release would deploy these rules too early.

**Files:**
- Modify: `firestore.rules` (the read-only per-athlete diagnostics match ~394-430; the diagnostics collection-group read ~477-510; one comment ~1590)
- Modify: `scripts/rules-probes/assessments.mjs` (`taskDiagnosticsReadOnly` becomes `taskDiagnosticsGone`), `scripts/verify-rules.mjs` (import, runPass)
- Modify: `docs/portal/DATA-MODEL.md` (the "removed 2026-10-14" note)
- Test: `scripts/verify-rules.mjs` (emulator, both passes)

**Interfaces:**
- Consumes: `taskDiagnosticsReadOnly`, `groupListAs`, `tok`, `uids`, `ATH` in `scripts/rules-probes/assessments.mjs` (Tasks 4, 9); the read-only diagnostics rules of Task 9.
- Produces: `taskDiagnosticsGone()`; no diagnostics grant left in `firestore.rules`.

- [ ] **Step 1: The branch**

Run: `cd C:\Users\Mac\Desktop\rypacadapp\rypacad && git checkout develop && git checkout -b assessments/diagnostics-rules`
Expected: "Switched to a new branch 'assessments/diagnostics-rules'".

- [ ] **Step 2: Write the failing probe**

In `scripts/rules-probes/assessments.mjs`, replace:

```js
// Assessments spec 8: Diagnostic Capture is gone (production held 0 docs on 2026-10-14). Its rules stay
// read-only for this release - a portal bundle from before it reads diagnostics beside everything else
// while the rules deploy first - and plan Task 27 removes the reads after the portal is live.
export async function taskDiagnosticsReadOnly() {
  console.log('Diagnostics: read-only for this release (Diagnostic Capture removed)');
  const owner = tok(uids.owner);
  await seed('users', uids.owner, { role: 'owner' });
  await seed('athletes', ATH, { name: 'Probe Athlete', householdId: 'hh', dob: '2012-04-10', contractMinutes: null, coachId: 'coach-probe', packageId: 't-6' });
  await seed(`athletes/${ATH}/diagnostics`, 'old-1', { athleteId: ATH, capturedBy: 'coach-probe', status: 'published', values: {}, notes: null });
  try {
    for (const [who, auth] of [['the owner', owner], ['ops', t.ops], ['the assigned coach', t.coach]]) {
      expect(`${who}: a capture still reads (an old bundle keeps loading)`, await call('GET', `/athletes/${ATH}/diagnostics/old-1`, null, auth).then(status), 200);
    }
    expect('the owner: the collection-group list still reads', await groupListAs(owner, 'diagnostics'), 200);
    expect('the assigned coach: a new capture refused', await createAs(t.coach, `athletes/${ATH}/diagnostics`, 'new-1',
      { athleteId: ATH, capturedBy: 'coach-probe', status: 'draft', values: {}, notes: null }, ['capturedAt', 'updatedAt']), 403);
  } finally {
    await del(`athletes/${ATH}/diagnostics`, 'old-1');
    await del(`athletes/${ATH}/diagnostics`, 'new-1');
    await del('athletes', ATH);
    await del('users', uids.owner);
  }
}
```

with:

```js
// Assessments spec 8: Diagnostic Capture is gone, and every diagnostics grant with it (production held 0 docs on 2026-10-14).
export async function taskDiagnosticsGone() {
  console.log('Diagnostics: no client reads or writes any more (Diagnostic Capture removed)');
  const owner = tok(uids.owner);
  await seed('users', uids.owner, { role: 'owner' });
  await seed('athletes', ATH, { name: 'Probe Athlete', householdId: 'hh', dob: '2012-04-10', contractMinutes: null, coachId: 'coach-probe', packageId: 't-6' });
  await seed(`athletes/${ATH}/diagnostics`, 'old-1', { athleteId: ATH, capturedBy: 'coach-probe', status: 'published', values: {}, notes: null });
  try {
    for (const [who, auth] of [['the owner', owner], ['ops', t.ops], ['the assigned coach', t.coach], ['the parent', t.parent]]) {
      expect(`${who}: diagnostics read refused`, await call('GET', `/athletes/${ATH}/diagnostics/old-1`, null, auth).then(status), 403);
    }
    expect('the owner: diagnostics collection-group list refused', await groupListAs(owner, 'diagnostics'), 403);
    expect('the assigned coach: a new capture refused', await createAs(t.coach, `athletes/${ATH}/diagnostics`, 'new-1',
      { athleteId: ATH, capturedBy: 'coach-probe', status: 'draft', values: {}, notes: null }, ['capturedAt', 'updatedAt']), 403);
  } finally {
    await del(`athletes/${ATH}/diagnostics`, 'old-1');
    await del('athletes', ATH);
    await del('users', uids.owner);
  }
}
```

In `scripts/verify-rules.mjs`, replace:

```js
import { taskAssessments, taskDiagnosticsReadOnly } from './rules-probes/assessments.mjs';
```

with:

```js
import { taskAssessments, taskDiagnosticsGone } from './rules-probes/assessments.mjs';
```

and replace:

```js
    await taskAssessments(); await taskDiagnosticsReadOnly(); await taskResearch();
```

with:

```js
    await taskAssessments(); await taskDiagnosticsGone(); await taskResearch();
```

Run: `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"`
Expected: FAIL - `the owner: diagnostics read refused -> 200 (wanted 403)` and the other read lines.

- [ ] **Step 3: Remove the diagnostics rules and the data-model note**

In `firestore.rules`, delete the read-only per-athlete diagnostics match:

In `firestore.rules`, replace:

```

      // ---- athletes/{id}/diagnostics/{captureId} -----------------------
      // READ-ONLY since 2026-10-14: Diagnostic Capture was removed
      // (assessments spec 8; production held 0 docs) and no client writes
      // a capture any more. The read grant stays for this release only: a
      // portal bundle from before it reads diagnostics on the athlete home
      // and the admin dashboard beside everything else, and the rules
      // deploy ahead of the portal (spec 10). The follow-up after the
      // portal is live (assessments plan Task 27) removes this block and
      // the collection-group read below.
      // Sprint 10 (contract v1.8, C "Diagnostics persistence"). Shape:
      // { athleteId, capturedBy (uid), capturedAt, updatedAt,
      //   status: 'draft'|'published', values: map, notes: string|null }.
      // Writers: the assigned coach, any specialist (me().get('specialistId',
      // null) != null — Sprint 9's null-safe pattern, reused verbatim), or
      // mental/ops/owner — the SAME set that already writes tournamentResults
      // and reads athletes academy-wide. Readers: the athlete's own user and
      // the household parent see PUBLISHED captures only (never a draft mid-
      // capture); staff (the same writer set) see everything, drafts
      // included, so a coach can resume their own in-progress capture.
      //
      // No null-resource read branch is needed here (unlike bookings/
      // contractLogs' `{athleteId}_{date}`-style deterministic-id probes):
      // captureId is an auto-id, never guessed by a client transaction —
      // saveDraft's upsert finds an existing open draft via a QUERY
      // (hooks/live.js), not a get() on a constructed id, so `resource` is
      // never null for a write this rule evaluates.
      match /diagnostics/{captureId} {
        function diagnosticStaffOk() {
          return me().role in ['mental', 'ops', 'owner']
            || (me().role == 'coach' && athleteData(athleteId).coachId == request.auth.uid)
            || me().get('specialistId', null) != null;
        }
        allow read: if signedIn() && (
          diagnosticStaffOk()
          || (me().role == 'athlete' && me().athleteId == athleteId && resource.data.status == 'published')
          || (me().role == 'parent'
              && athleteData(athleteId).householdId == me().householdId
              && resource.data.status == 'published')
        );
      }

      // ---- athletes/{id}/private/medical -------------------------------
```

with:

```
      // ---- athletes/{id}/private/medical -------------------------------
```

then, in `firestore.rules`, replace:

```
    // ---- diagnostics collection-group read ------------------------------
    // Read-only until assessments plan Task 27 removes it with the
    // per-athlete diagnostics match (Diagnostic Capture removed 2026-10-14).
    // Sprint 10 (contract v1.8, C + D): the Admin "athletes with no
    // published diagnostic" list is one collectionGroup('diagnostics')
    // query rather than an N-athlete fan-out, and Firestore requires a
    // rule matched via the {path=**} recursive wildcard for a
    // collection-group query to be allowed at all (the nested
    // /athletes/{athleteId}/diagnostics/{captureId} rule above governs
    // normal per-athlete reads/writes but does NOT, by itself, license a
    // cross-athlete group query).
    //
    // Deliberately narrower than a literal reading of the pin's "coach/
    // mental/ops/owner/specialists" list: mental/ops/owner and any
    // specialist are academy-wide by the SAME precedent as the athletes
    // matrix's v1.7.1 specialist widening, so they read unconditionally.
    // A plain coach does NOT get an unconditional academy-wide grant here —
    // that would let a group query return every OTHER coach's assigned
    // athletes' diagnostics too, which is exactly the cross-family leak this
    // file's own non-negotiable ("assigned athletes only, by assignment,
    // never by role") exists to prevent. Instead a coach's read is proven
    // per-document the same way the bookings/contractLogs coach clauses
    // already do it: athleteData(resource.data.athleteId).coachId == caller,
    // which the diagnostics shape guarantees resource.data.athleteId always
    // carries. Flagged in the routing report as a deliberate tightening
    // beyond the pin's literal wording, not an oversight.
    match /{path=**}/diagnostics/{captureId} {
      allow read: if signedIn() && (
        me().role in ['mental', 'ops', 'owner']
        || me().get('specialistId', null) != null
        || (me().role == 'coach' && athleteData(resource.data.athleteId).coachId == request.auth.uid)
      );
    }

    // ---- assessments collection-group reads (2026-10-14) ---------------
```

with:

```
    // ---- assessments collection-group reads (2026-10-14) ---------------
```

then replace:

```
      // verified against the emulator for exactly this shape - the coach-
      // roster and diagnostics collection-group clauses elsewhere in this
      // file). ops/owner read academy-wide - the same staff-sees-everything
      // precedent bookings/athletes/diagnostics/contractLogs all already
      // grant, extended here so a support call can see a family's grace
```

with:

```
      // verified against the emulator for exactly this shape - the coach-
      // roster clauses elsewhere in this file). ops/owner read academy-wide -
      // the same staff-sees-everything precedent bookings/athletes/
      // contractLogs all already grant, extended here so a support call can
      // see a family's grace
```

In `docs/portal/DATA-MODEL.md`, replace:

```
### `athletes/{athleteId}/diagnostics/{captureId}` (removed 2026-10-14)

Diagnostic Capture was removed with the assessments release (assessments spec 8; production held 0 docs on 2026-10-14). The portal no longer reads or writes a capture. `firestore.rules` keeps a read-only grant (per athlete and collection group) so a bundle from before the release keeps loading while the rules deploy first; the follow-up after the portal is live (assessments plan Task 27) removes it and this note.

### `staffInvites/{id}` (contract v1.8, Sprint 10)
```

with:

```
### `staffInvites/{id}` (contract v1.8, Sprint 10)
```

- [ ] **Step 4: Run the probe to verify it passes**

Run: `npx firebase-tools emulators:exec --only firestore --project rypacad "node --env-file=scripts/emulator.env scripts/verify-rules.mjs"`
Expected: `ALL PASS (both passes)`, including every `Diagnostics:` line.

Run: `git grep -n "diagnostics" -- firestore.rules`
Expected: no output.

- [ ] **Step 5: Commit, then the owner deploys the rules**

```bash
git add firestore.rules scripts/rules-probes/assessments.mjs scripts/verify-rules.mjs docs/portal/DATA-MODEL.md
git commit -m "chore(rules): remove the diagnostics read grants

The assessments portal is live and no bundle reads diagnostics any more;
the read-only grants kept for the release go (production held 0 docs).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Hand the owner (in the final message; the agent never pushes or deploys):

Run: `cd C:\Users\Mac\Desktop\rypacadapp\rypacad && git checkout develop && git merge --no-ff assessments/diagnostics-rules && npx firebase-tools deploy --only firestore:rules --project rypacad`
Expected: "Deploy complete!". The athlete home and the admin dashboard still load (the new portal never reads diagnostics).

Run: `cd C:\Users\Mac\Desktop\rypacadapp\rypacad && git push origin develop:main`
Expected: Railway redeploys the same portal (no portal change in this commit).
