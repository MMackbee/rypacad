# Parallax intake swings and combine scores - spec

Owner request 2026-11-10, description played back and approved 2026-11-11 ("go with your recommendations"). Built as a small change on branch `feat/parallax-combine` from develop 94d7e4d.

## 1. Intent

- **Parallax intake swings** are a one-time onboarding step: every athlete records a set of swings on Parallax once. Coaches need to see, on the session they are running, who has done it and who still needs it, and tick it off when it is done.
- **The combine** is a season-long progress measure. There are four combine distances: under 100 yd, under 125 yd, under 150 yd and under 180 yd. Each attempt is scored out of 1000. Athletes repeat combines through the season, and every score is kept so progress shows.

Success: a coach running a training session ticks Parallax intake swings on the row and types a combine score without leaving the attendance screen flow; an athlete or parent adds their own combine score from home; nobody emails the owner a score.

## 2. Owner rulings (verbatim where quoted)

1. The Parallax tick is one per athlete; "once ticked it stays ticked" on every later session.
2. Combine scores: "a coach or student input"; "open it that they can put scores in for all 4" distances (no single chosen distance per athlete).
3. Every score kept with its date (history, not latest-only).
4. Approved with "go with your recommendations": everything marked *Claude's call* below.

## 3. Parallax intake swings

**Where:** the coach's session attendance screen (`screens/Roster.js` SessionAttendance), on each athlete row of a **golf training session** (`session.type === 'training'`), next to the existing clubhead chip (AthleteRow `children` slot). Not on Phil, mental, Tour event or other session types. *Claude's call.*

**States:**
- Not done: an unticked box labelled "Parallax intake swings".
- Done: ticked, with "done Nov 12 · Luke" (date in Chicago time, first name of whoever ticked it). It stays done on every later session for that athlete.

**Who:**
- Coaches (role `coach`, Phil included) and the owner tick it.
- Yannick (`mental`) and ops see the state but cannot change it. A read-only attendance screen shows the state but the box is disabled.
- Undo: the person who ticked it can undo it within 10 minutes (mis-tap). After that only the owner clears it. *Claude's call* (owner asked for "owner clears a mistake"; the 10-minute undo keeps a mis-tap off the owner's desk).

**Storage:** `athletes/{athleteId}/milestones/parallaxIntake` (one fixed doc id, so "once" is enforced by create-only):
`{ athleteId, at: <server time>, by: <uid>, byName: <first name string, max 40> }`.
- Create: `role in ['coach','owner']`, doc does not exist, `athleteId` equals the path id, `at == request.time`, `by == request.auth.uid`, keys exactly these four.
- Update: never.
- Delete: owner any time; the creator while `request.time < at + 10 minutes`.
- Read: `coach`, `mental`, `ops`, `owner`, any specialist. Families do not read it (not needed). *Claude's call.*
- Why not a field on `athletes/{id}`: that doc carries billing and consents, has no coach write branch today, and families read it; a create-only subdoc gives "once" for free and keeps coach writes off it.

**Reads on the attendance screen:** one `get` per row athlete on training sessions (sessions hold at most 14), cached per athleteId, in a new hook file (not `hooks/index.js`). Seed mode returns a fixed seed (some ticked, some not).

## 4. Combine scores

**Distances:** ids `u100`, `u125`, `u150`, `u180`; labels "Under 100 yd", "Under 125 yd", "Under 150 yd", "Under 180 yd". A score is a whole number 0 to 1000, shown raw ("742", no separators).

**Storage:** `athletes/{athleteId}/combineScores/{autoId}`:
`{ athleteId, distance, score, date: 'YYYY-MM-DD', enteredBy: <uid>, enteredRole: 'coach'|'owner'|'athlete'|'parent', createdAt: <server time> }`.
- Auto ids, so a coach's and an athlete's entries on the same day are both kept.
- Create:
  - coach or owner, any athlete;
  - the athlete's own login (`me().role == 'athlete' && me().athleteId == athleteId`);
  - a parent of that athlete (`me().role == 'parent'` and the athlete doc's `householdId == me().householdId`).
  - Every create: keys exactly the seven above, `enteredBy == request.auth.uid`, `enteredRole == me().role`, `createdAt == request.time`, `distance in [...]`, `score is int && 0 <= score <= 1000`, `date` a real date not ahead of today and not more than 60 days back. *Claude's call on the 60 days* (coaches catch up on last week's combine).
- Update: never (a wrong score is deleted and re-entered).
- Delete: whoever entered it (any time) and the owner.
- Read: the athlete themself, a parent of the household, and `coach`, `mental`, `ops`, `owner`, any specialist.
- Ops and mental do not enter scores. *Claude's call.*
- Never name the subcollection `entries` or `assessments` (collection-group rules at firestore.rules 1041 and 1050 would widen reads). Do not use `coachId` anywhere (production athletes have none).

**Combine screen** (new screen, one per athlete):
- Route for staff and parents: `/portal/combine/:athleteId`; for an athlete login: `/portal/combine` (own athlete).
- Header: athlete name, "Combine".
- Four distance blocks. Each shows the athlete's **best** and **latest** score with dates, a score field (0-1000, whole numbers), a date field defaulting to today (Chicago), and Save.
- History below, newest first: date, distance, score, who entered it as a role word ("Coach", "Athlete", "Parent", "Owner"), and a "Best" mark on the best score per distance. A Delete action on rows the viewer may delete, with an inline confirm (no browser dialogs).
- Validation copy: "Enter a whole number from 0 to 1000."; date "Pick a date no later than today."

**Entry points:**
- Coach: a "Combine" button on each training-session attendance row (beside the tick) opens `/portal/combine/:athleteId` and Back returns to the session. Shown when the screen is not read-only. *Claude's call.*
- Athlete: a Combine card on the athlete home (`AthleteDashboard.js`, one import and one element, file ends at 510 lines) with the latest score per distance and "Combine ›".
- Parent: a Combine card on the child's page (`AthleteDetail.js`) with the same summary and "Combine ›". Staff who open AthleteDetail see it too.

## 5. Not included

Leaderboards, charts, an owner list of who still needs Parallax intake swings, emails or notifications, any change to Phil's assessments (the assessment golf section's Parallax composite score is unrelated and untouched), consent copy changes (combine scores are coaching data, not research data). *Claude's call on consent copy.*

## 6. Constraints

- Files under 500 lines; `Roster.js` (955), `hooks/index.js`, `PortalRoutes.js`, `live.js` are grandfathered and grow only by the few lines that mount new pieces. `AthleteDashboard.js` max 510.
- Repo files are CRLF.
- Rules changes are purely additive (staging and production share one backend). Deploy rules before the frontend.
- Always write "Parallax intake swings" in full in the UI so it is not confused with Phil's Parallax score.
- No real family names or phone numbers in code, tests or commits (public repo).
- New rules probes in `scripts/rules-probes/combine.mjs`, registered in `scripts/verify-rules.mjs`.
- Jest, eslint and the production build stay green.
