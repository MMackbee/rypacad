# Handoff: RYP Academy Member Portal — Phase 1

## Overview

Design scaffold for the RYP Academy member portal, a junior golf academy in Eden Prairie, MN. Phase 1 covers identity and access, enrollment and diagnostics, Commitment Contract tracking, billing, scheduling and booking, and the weekly newsletter. Six roles: Athlete, Parent/Guardian, Coach, Mental Performance Coach, Ops Admin, Owner/Director.

Most athletes are minors. Their guardians are the paying customers. That shapes almost every access decision in this document.

Scope authority is `RYP_Portal_Design_Handoff_Brief` revision 2 and `RYP_2026-27_Portal_Technical_Construction_Plan` revision 2. Where this design departs from either, it says so in the Flags section of the design file and in **Open Decisions** below.

**Scheduling is the critical path.** The app replaces Uschedule and SignupGenius for the 26/27 season. If booking is not ready and reliable by season start there is no fallback unless one is deliberately kept.

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing intended layout, hierarchy, and behavior. They are **not production code to copy**.

The task is to **recreate these designs in the target codebase's environment** using its established patterns. The technical plan recommends Next.js (React) with managed Postgres, Clerk or Supabase Auth, Stripe Billing, Vercel hosting, and S3-compatible object storage for swing video. If that stack is chosen, build these screens as React components against real endpoints. The HTML here is a single-file design document with inline styles and is not structured for production.

The design file is a "Design Component" — one `.dc.html` file with a template and a logic class. Open it in a browser to read it. Its structure has no bearing on how the real app should be organized.

## Fidelity

**Branded wireframe.** Between lofi and hifi, deliberately.

- **Treat as final:** all colors, all typography, spacing rhythm, border radii, component structure, layout, hierarchy, copy, state logic, and touch-target sizes. These are specified exactly and should be matched.
- **Treat as placeholder:** anything drawn as a diagonally-striped box with a dashed border and a monospace caption. Those mark where real content lands — swing video, avatars, photography, the newsletter body editor, the Stripe Elements iframe. Do not recreate the stripes.
- **Icons are geometric placeholders.** Small squares, circles, and rotated squares stand in for real icons throughout, including the bottom tab bar. Substitute a real icon set (the meaning of each is given per screen below).

## Screens

Nineteen artboards: the brief's seventeen screens, plus two additions flagged as gaps found during design. Every artboard in the design file has a state toggle above it — click the chips to step through states.

### Global chrome

**Phone frame.** 390pt wide (the design file makes this switchable 340–440 to check the range), 812px tall. Content area scrolls; header and bottom tab bar are fixed.

**Status bar.** 13px top padding, 22px sides, time at left in Work Sans 500/12px white. Placeholder glyphs at right.

**Bottom tab bar.** Four items, `border-top: 1px solid #222`, `padding: 9px 8px 20px`, background `#000`. Each item is a 20px glyph above a 10px/500 label, 6px vertical padding. Active item: `#00AF51` glyph and label, glyph background `rgba(0,175,81,.15)`. Inactive: `#666` glyph border, `#888` label.

Tabs per role:
- Athlete — Home / Schedule / Contract / DNA
- Parent — Home / Children / Billing / Settings
- Coach — Today / Roster / Capture / Me

This comes from the 2025 build's dashboard tab strips (`ParentDashboardPage.js` used Overview / Children / Finances / Communication; `CoachDashboardPage.js` used Overview / Students / Sessions / Practice / Communication / Analytics). On a phone those become bottom nav, trimmed to four.

**Section header pattern.** Card section labels are Work Sans 600/10px, `letter-spacing: .14em`, uppercase, `#CCC`. Screen titles are Raleway 700 at 22–26px, `letter-spacing: .01em`. Every card is `background: #1A1A1A`, `border: 1px solid #333`, `border-radius: 12–16px`, `padding: 15–17px`.

---

### 01 · Sign In
**Role:** public · **States:** Default, Loading, Invalid credentials, Account locked

First impression for a parent who just received the enrollment email.

**Layout:** single scrolling column, 24px side padding. 50px top padding, then a centered 76×76 logo placeholder at `border-radius: 18px`, 18px gap, then "RYP ACADEMY" in Raleway 700/15px uppercase with `letter-spacing: .28em`, 7px gap, tagline "Reach Your Potential" in Work Sans 400/13px `#CCC`. 38px gap to the form.

**Fields:** label in Work Sans 500/11px uppercase `#CCC` `letter-spacing: .1em`, 7px gap, then a 52px-tall input, `#1A1A1A` background, `1px solid #333`, `border-radius: 8px`, 15px horizontal padding, Work Sans 400/15px white. 14px between fields. "Forgot password" right-aligned, Work Sans 500/13px `#00AF51`.

**Primary button:** 54px tall, `#00AF51`, `border-radius: 8px`, Work Sans 600/16px `#000`, `box-shadow: 0 8px 26px rgba(0,175,81,.3)`.

**Divider:** 1px `#333` rules either side of "OR" in Work Sans 400/11px `#888`, `letter-spacing: .08em`, 12px gaps.

**Social:** 54px tall, transparent, `1px solid #333`, 18px circular icon placeholder + "Continue with Google" in Work Sans 500/15px white, 11px gap.

**Footer:** centered, "New family?" in `#CCC` with "Start enrollment" in `#00AF51` 600.

**State differences:**
- *Loading* — password field dims to `#141414` / `1px solid #2a2a2a` / `#666` text; "Show" affordance hidden; button label becomes "Signing in" with a 16px spinner (2px border, `rgba(0,0,0,.25)`, top border `#000`, 0.8s linear infinite).
- *Invalid* — password border becomes `#FF4444`; below it a 14px circular `!` badge outlined `#FF4444` and the message "Email or password is incorrect. 2 attempts left." in Work Sans 400/12px `#FF4444`.
- *Locked* — a banner above the form: `rgba(255,68,68,.1)` background, `1px solid #FF4444`, `border-radius: 10px`, 14px padding. Title "Account locked" 600/13px `#FF4444`; body "Five failed attempts. Locked for 30 minutes, or reset your password now." 400/12px `#CCC`. Password field dims. Button becomes `#1e1e1e` / `1px solid #333` / `#555` text and is disabled.

**Design note:** the locked state disables the button rather than hiding it. A greyed control the parent can see explains the wall better than a missing one.

---

### 02 · Registration (multi-step)
**Role:** public · **States:** Step 1 Guardian, Step 2 Athlete with validation error, Step 3 Tier, Step 4 Consent, Submitting, Success

**Header block:** 12px top padding, "‹ Back" in Work Sans 500/14px `#CCC` at left, "Step N of 4" in 400/12px `#888` at right. 13px gap, then a progress bar: four equal segments, 3px tall, `border-radius: 2px`, 5px gap; completed and current segments `#00AF51`, remaining `#2a2a2a`. 12px gap, then the step title in Raleway 700/24px. `border-bottom: 1px solid #222`.

**Footer:** `border-top: 1px solid #222`, 14px top / 22px bottom padding, one full-width 54px primary button.

**Step 1 — Guardian contact.** Guardian name, email, mobile, relationship to athlete (select, with an 8px CSS chevron). Under mobile: "Used for schedule-change texts. You control this later in Notification Preferences." in 400/11px `#888`.

**Step 2 — Athlete details.** Athlete name; date of birth (shown in error: `1px solid #FF4444`, placeholder `#666`, message "Date of birth is required — it determines U13 vs U18 eligibility."); emergency contact. Then a card containing an "Allergies or medical conditions" textarea (70px, `#111`, `1px solid #2a2a2a`) with the note "Visible to on-site coaching staff during live sessions only. Not shown in admin views."

The CTA in this state is disabled: `#1e1e1e` / `1px solid #333` / `#555`.

**Step 3 — Membership tier.** ⚠ Read Open Decisions first.

A caution banner at top: `rgba(244,238,25,.07)`, `1px solid rgba(244,238,25,.4)`, `border-radius: 10px`, 13px padding. Title "TIERS NOT DECIDED" in 600/11px `#F4EE19` uppercase; body "Names, count, and prices are all open. This list renders from data — three shown, one of them unlimited."

Then **N tier cards from data**. Per card: name in Raleway 700/17px, a sub-line in 400/11px `#888`, and a price slot at right — `1px dashed #F4EE19`, `border-radius: 6px`, `5px 9px` padding, monospace 600/9px `#F4EE19`, two lines reading `$ ——` / `/ mo`. Below, inclusion bullets: a 4×4px `#00AF51` square (2px radius) with 9px gap and 400/12px `#CCC` text, 6px between bullets. Optional footnote separated by `1px solid #2e2e2e` at 13px margin / 11px padding.

The unlimited tier gets `border: 1px solid #00AF51` and `box-shadow: 0 6px 20px rgba(0,175,81,.14)`. Every other tier gets `1px solid #333`.

After the list, a dashed slot marker: `1px dashed #333`, monospace 400/11px `#6f6f6f`, centered — "TIER SLOT — rendered from data. No hardcoded name, count, or price; add or remove a tier without touching the layout."

**Requirements:** no hardcoded tier name, count, price, or inclusion text. The layout must survive 1..n tiers. Exactly one tier is flagged unlimited.

**Step 4 — Consent and waiver.** Intro: "Jordan is a minor. Each of these is a separate decision — none is bundled into the others."

Three cards, each with a 26px checkbox (checked: `#00AF51` fill with a CSS tick; unchecked: `1.5px solid #555`), 13px gap, then title 600/14px white, body 400/12px `#CCC` at 1.55 line-height, and a link in 500/12px `#00AF51`:

1. **Data collection** — "Name, date of birth, guardian contact, emergency and medical info, and training records. Collected only where a feature needs it." · "Read what is stored →" · checked
2. **Video capture** — "Multi-angle swing video at the Diagnostic and during training blocks, used for coaching review and benchmarked against your athlete's own progress." · "Read retention policy →" · checked
3. **Media release** — "Permission to use photos or video of your athlete in RYP marketing. Declining does not affect enrollment or training." · "Read media terms →" · **unchecked**, with a footnote in 500/10px `#F4EE19` uppercase: "Optional — enrollment continues either way"

Then a guardian signature card: a "Type your full legal name" field and the note "Re-confirmed annually. Covers athletic injury risk and media release."

CTA reads "Sign and submit".

**Submitting.** The consent body stays visible. CTA becomes `rgba(0,175,81,.45)` with a spinner and the label "Submitting enrollment". A full-frame overlay at `rgba(0,0,0,.55)` holds a centered card: 26px spinner (2.5px `#2a2a2a` border, `#00AF51` top), "Creating the account" in 600/14px white, and "Do not close this. Consent records are written before the account exists." in 400/11px `#CCC`.

**Success.** Centered: a 72px circle, `rgba(0,175,81,.12)` fill, `2px solid #00AF51`, containing a CSS tick. "Enrollment submitted" in Raleway 700/26px. Body: "Phil reviews new enrollments within one business day. You'll get an email when the account is active, then Diagnostic scheduling opens." Then a "What happens next" card with three numbered steps (step 1 filled `#00AF51`, steps 2–3 outlined `#444`): Diagnostic Protocol booked / Commitment Contract tier selected with your coach / First block on the 3–7 PM weekday schedule. Full-width "Go to dashboard" button.

**Design note:** consent is three cards, not three checkboxes in a row. Media release is optional and declining it does not block enrollment — bundling it with the injury waiver would weaken both.

---

### 03 · Athlete Dashboard
**Role:** athlete · **States:** Populated, New athlete, No upcoming sessions

**Header:** "Thursday, Feb 18" in 400/12px `#888` above "Jordan" in Raleway 700/22px; a 40px circular avatar placeholder at right.

**Populated.** Next-session card (`1px solid #00AF51`, `box-shadow: 0 8px 26px rgba(0,175,81,.14)`): label row "NEXT SESSION · TODAY" in 600/10px `#00AF51` uppercase with "in 5h 20m" in 500/11px `#CCC` at right. Then a type chip + block label row, the rotation name in Raleway 700/20px, then a three-column meta row (Time / Bay / Coach) with 400/10px uppercase `#888` labels above 600/14px white values.

Commitment Contract card: label row with "On track" in 500/11px `#00AF51`; then `12` in Raleway 700/40px beside "of 13 days · February" in 400/14px `#CCC`; an 8px meter (`#111` track, `#00AF51` fill at 92%); then "45 min per day, 5 days a week. 6 contract days left this month."

Quick actions: 2-column grid, 10px gap, 78px minimum height. Primary is a filled `#00AF51` card with "Log today" in 600/14px `#000`; secondary is `#1A1A1A` / `1px solid #333` with "Book a slot" in white.

Code of Grit card: three bullets — Try Hard / Train Smart / Support Each Other & Enjoy the Journey.

**New athlete.** A `1px solid #F4EE19` card: "START HERE" label, "Book your Diagnostic" in Raleway 700/19px, body "Everything starts with objective data. Your baseline capture sets the Practice DNA you'll be measured against — your own numbers, not a model swing.", and a "Find a time" button. Then an onboarding checklist: enrollment complete (filled green with tick), Diagnostic not booked (outlined `#F4EE19`), Commitment Contract tier (outlined `#3a3a3a`, `#888` text), first training block (same). Then a 126px media placeholder: "WELCOME VIDEO — Luke, 60 sec — what the first week looks like".

**No upcoming sessions.** A dashed card, centered: 44px dashed icon placeholder, "No upcoming sessions" in Raleway 700/17px, body "Your last block was Thursday. Makeup sessions are unlimited within the billing cycle — reschedule into any open age-appropriate block.", and a "Browse open slots" button. The contract card still shows below — daily minutes are independent of scheduled blocks.

---

### 04 · My Schedule
**Role:** athlete · **States:** Upcoming, Empty, Cancelled session shown

**Segmented control:** `#1A1A1A` container, `1px solid #333`, `border-radius: 9px`, 3px padding. Two 38px halves; active is `#00AF51` at `border-radius: 6px` with 600/13px `#000`, inactive is 500/13px `#888`.

**Session list.** Day headers in 600/10px uppercase `letter-spacing: .14em` — `#00AF51` for today, `#888` otherwise. Cards use the **session card** component (see Components).

Sample data, revision-2 accurate: today 4:00 PM training / The Lab / Sim 2 / Luke, badged CONFIRMED · Fri 4:00 PM training / The Workshop / overflow, badged FRIDAY OVERFLOW BLOCK · Sat 8:30 AM **tournament** / The Arena / Brock · Sat 10:30 AM training / The Lab · Mon 5:00 PM training / The Workshop.

**Empty.** Centered: 56px dashed icon, "Nothing scheduled" in Raleway 700/18px, body "Training blocks run 3:00, 4:00, and 5:00 PM, Monday through Thursday. Saturdays alternate training and tournament.", and a "Book a session" button.

**Cancelled.** A banner at top: `rgba(255,68,68,.08)`, `1px solid #FF4444`. "CANCELLED BY ACADEMY" label; body "Presidents' Day, Mon Feb 15 — facility closed. Your block was cancelled and does not count against your Commitment Contract."; then a 46px outlined `#FF4444` "Reschedule as makeup" button. Below it the cancelled card at `opacity: .65` with strikethrough time and name.

**Design note:** a cancelled block states plainly that it does not count against the contract. That is the first question a family asks, and answering it in the card kills a support text.

---

### 05 · Book a Session
**Role:** athlete · **States:** Blocks open, Block full, Tier limit reached, Confirmed

**Rule banner** — persistent, above the date strip, not a dismissible toast. Tone changes by state.

- *Default:* `#1A1A1A` / `1px solid #333`. Title "YOUR TIER · 3 OF 8 BOOKINGS USED" in 600/11px `#CCC`; body "Five bookings left this cycle, resetting Mar 1. Rescheduling a missed block does not count against the limit."
- *Tier limit reached:* `rgba(255,68,68,.07)` / `1px solid rgba(255,68,68,.45)`. Title "TIER LIMIT REACHED" in `#FF4444`; body "You have used all 8 bookings in this billing cycle. Your limit resets Mar 1. Makeup rescheduling is still unlimited, and an unlimited tier removes the cap."

**Date strip:** horizontal scroll, 7px gap, no visible scrollbar. Each pill is 50px wide, 9px vertical padding, `border-radius: 10px`; day-of-week in 400/10px uppercase at 0.7 opacity above the date in 700/17px. Selected: `#00AF51` fill, `#000` text, `box-shadow: 0 6px 18px rgba(0,175,81,.26)`. Unavailable: `1px solid #242424`, `#555` text.

**Slot list:** time gutter (54px, 700/17px above 400/10px `#888`), 1px 36px vertical rule, then the type chip, name in 600/14px, meta in 400/11px `#888`, and a capacity pill at right.

Capacity pill: available is `#00AF51` fill with `#000` text reading e.g. "6 LEFT"; full is `1px solid rgba(255,68,68,.5)` / `rgba(255,68,68,.08)` / `#FF4444` reading "FULL"; capped is `1px solid #2e2e2e` / `#666` reading "CAPPED".

A full slot expands with a note separated by `1px solid #2a2a2a`: "Join the waitlist — you are notified if a spot opens, and unlimited makeups still apply."

**Confirmed.** Centered: 72px green tick circle, "Slot reserved" in Raleway 700/26px, "Confirmation sent to dana@email.com". Then a summary card (`1px solid #00AF51`): session name in Raleway 700/19px, a When/Coach meta row, a `1px #333` rule, and "Cancel up to 12 hours ahead to keep this as an unlimited makeup rather than a used session." Footer: "Add to calendar" primary, "Back to schedule" secondary.

---

### 06 · Practice DNA
**Role:** athlete · **States:** Complete baseline, Partial data, Assessment pending

**Header:** "Practice DNA" in Raleway 700/26px, then the framing line — "Your baseline. Every number here is measured against your own future progress, never a model swing."

**Summary card** varies by state: Complete shows a full-width `#00AF51` meter and "6 of 6", captured Nov 14, plus "Next re-capture opens Mar 14 — four months on, so the comparison means something." Partial shows a 50% `#F4EE19` meter and "3 of 6" with "Short game, putting, and mental intake still open." Pending shows a `1px solid #F4EE19` card: "Nothing captured yet" and the scheduled Diagnostic date.

**Six module cards**, always in this order: Swing Biomechanics, Launch Monitor, Mobility & Stability, Short Game, Putting Stroke, Mental Game Intake. Each has a name in 600/14px, a descriptor in 400/11px `#888`, and a status pill — CAPTURED (`1px solid #00AF51` / `rgba(0,175,81,.12)` / `#00AF51`) or PENDING (`1px dashed #3a3a3a` / `#777`). Captured cards expand: video and questionnaire modules show an 86px media placeholder; numeric modules show a 3-up stat row with 400/9px uppercase `#888` keys above 600/15px white values.

**Hard constraint:** no score, grade, letter, or percentile anywhere on this screen. Deltas read against the athlete's own last capture only. This is the entire design of the screen — the Blueprint is explicit that athletes are measured against their own future progress, not a model swing.

---

### 07 · Commitment Contract ⭐
**Role:** athlete · **States:** On track, Behind, Month complete, No contract selected

**The most-used screen in the app. Gets extra attention. Must be excellent on a phone.**

**Header:** "February 2027" in 400/12px `#888` above "45 min tier" in Raleway 700/24px; a status badge at right (999px radius, `6px 12px`, 600/10px uppercase `letter-spacing: .1em`): On track is `rgba(0,175,81,.14)` / `#00AF51`; Behind is `rgba(255,68,68,.1)` / `#FF4444`; Complete is `rgba(244,238,25,.12)` / `#F4EE19`.

**Hero card** (`border-radius: 16px`, 19px padding, border matches state): the logged count in Raleway 700/54px — `#FF4444` when behind, otherwise white — beside "of 19 contract days" in 400/15px `#CCC`. Below, a 10px meter on a `#0d0d0d` track. Then the state line:
- On track — "12 of 13 days due so far. Six contract days left — one miss still keeps the month."
- Behind — "Six days behind with six contract days left. Every remaining day has to be logged to make the Commitment Board."
- Complete — "All 19 contract days logged. You are on February's Commitment Board."

**Month grid.** 7 columns, 5px gap. A weekday header row (M T W T F S S; weekend letters at `#4a4a4a`). Then 28 cells at `aspect-ratio: 1`, `border-radius: 6px`, day number in 500/10px centered. Cell states:
- **logged** — `#00AF51` fill, `#000` 600 text
- **missed** — `rgba(255,68,68,.1)` fill, `1px solid rgba(255,68,68,.45)`, `#FF4444` text
- **open** — `#141414` fill, `1px solid #2e2e2e`, `#888` text
- **closed** — 45° stripes `#141414`/`#1f1f1f` at 3px, `1px solid #2e2e2e`, `#555` text
- **weekend** — transparent, `1px solid #1c1c1c`, `#3a3a3a` text

February 2027 starts on a Monday, so no offset is needed with a Monday-first grid. Feb 15 is a Presidents' Day closure and renders as *closed*. Caption: "Weekends are not contract days. Feb 15 was a Presidents' Day closure and does not count against you."

**Stats row:** three equal columns separated by 1px `#2e2e2e` rules — day streak, minutes logged, days left. Values in Raleway 700/22px above 400/11px `#888` labels.

**Pinned footer.** `border-top: 1px solid #222`, `background: #000`, 13px top / 22px bottom padding. A **56px** primary button, `border-radius: 10px`, 600/17px, `box-shadow: 0 10px 28px rgba(0,175,81,.32)`, reading "Log today · 45 min". Below it a hint in 400/11px `#888` centered: "One tap. Nothing else on this screen needs typing." (Behind state: "Missed a day? Tap it in the grid to add a late entry.") Month-complete replaces the button with an outlined "View Commitment Board".

**No contract selected.** Title "Pick your daily investment", body "Five days a week, every week. Complete the month and you go on the Commitment Board." Then three tier cards — 20 / 45 / 95 min — each with a 26px radio (`1.5px solid #555`), the number in Raleway 700/30px beside "min / day" in 500/14px `#CCC`, and a description. 45 is footnoted "Most common tier"; 95 is footnoted "Split entries supported — see flag 05". Then "Both a physical and a digital signature are required. Your coach countersigns at your next block." CTA is disabled: "Select a tier to continue".

### Mobile treatment for 07 (required by the brief)

Log Today is pinned to the bottom bar at 56px, inside thumb reach, and never scrolls away — the daily task is one tap from cold open with no scrolling. The month grid is **read-only**: tapping a past day opens a sheet rather than editing inline, so a mis-tap while walking cannot silently change a record. Weekend and closure cells are visually recessive so the eye reads only contract days.

---

### 08 · Parent Dashboard
**Role:** parent · **States:** One child, Three children, Payment issue flagged

**Design for two or three children, not one.**

**Header:** date above "Whitfield family" in Raleway 700/22px, avatar at right.

**Payment banner** (payment-issue state only): `rgba(255,68,68,.08)`, `1px solid #FF4444`, `border-radius: 14px`. A 20px circular `!` badge, then "Payment failed — retry 2 of 3" in 600/14px `#FF4444` and body "Next automatic attempt Feb 22. Booking stays open until Feb 26; after that it is restricted for all three athletes." Then a 46px `#FF4444` "Update payment method" button.

**Child cards** — one per linked athlete, **fixed height regardless of how much data the child has**. Avatar 44px, name 600/16px, age line 400/11px `#888`, standing badge at right (ON TRACK green / BEHIND yellow / NEW dashed / ON HOLD red when billing is flagged). A `1px #2a2a2a` rule, then two labelled rows with 66px 400/10px uppercase `#888` label columns:
- **Next** — type chip + "Today 4:00 PM" in 600/13px, then meta in 400/11px `#CCC`
- **Contract** — a 6px meter with the percentage right-aligned in a 38px column, colored green ≥80 / yellow ≥40 / grey below

Sample: Jordan (13, 45 min tier, training today, 92%) · Reese (11, 20 min tier, **tournament** Saturday, 54%) · Nico (9, new Feb 8, training Monday, no data).

Below the cards: a dashed "+ Link another athlete" affordance in 500/13px `#00AF51` (hidden in the payment-issue state). This leads to **08·L**.

**Design note:** each card is a fixed height so a household scans a consistent rhythm — next session, contract, standing — rather than three differently shaped blocks. Billing is one household-level banner, not a per-child badge, because the invoice is the household's.

---

### 08·L · Link an athlete (addition — not in the brief's seventeen)
**Role:** parent · **States:** Choose route, Confirm match, Pending, ID not found

Added because 08's link affordance went nowhere and multi-child households are the stated norm.

**Step 1 — two routes.** "Already enrolled" (`1px solid #00AF51`, badged SIBLING): enter the athlete ID from the welcome email, shown as a masked monospace field `RYP-••••••` with `letter-spacing: .1em`. Body: "Linking sends them a confirmation before you see any of their data." Second card, "New to the academy": runs full enrollment on screen 02, and "Consent is per athlete and is never inherited from a sibling." CTA disabled: "Enter an ID to continue".

**Step 2 — confirm match.** A match card showing the athlete **name-masked** (`R•••• W••••••••` in Raleway 700/18px) with age and enrollment date. Footnote: "The name is masked until the link is confirmed. A wrong ID must never leak another family's athlete name." Then a yellow approval card: "Linking gives you their attendance, contract, and billing. The athlete's existing guardian approves it — not the academy, and not automatically." Then a relationship select and a checkbox for "Make this the primary billing relationship. Only one guardian per athlete can hold it." CTA: "Send link request".

**Step 3 — pending.** A `1px solid #F4EE19` card with a 52px `?` circle: "Waiting on approval" and "Sent to the athlete's existing guardian. The link stays pending for 7 days, then expires. You will not see any of their data until it is approved." Then a pending-links list.

**ID not found.** A `1px solid #FF4444` card with a 52px `!` circle: "No athlete with that ID" and "Check the welcome email, or ask the front desk. The ID is eight characters and starts with RYP." Then the note: "Deliberately does not distinguish 'no such ID' from 'already linked to three guardians' — either message would confirm the ID belongs to a real athlete." Plus "3 attempts remaining before this is rate-limited for an hour."

**Security requirements — implement these, they are the design:**
1. Guardian-approved, never self-serve. The existing guardian approves; the academy does not, and it never happens automatically.
2. Matched athlete name masked until approval.
3. The failure state must not distinguish "no such ID" from "ID exists but is unavailable".
4. Rate-limit ID attempts. An unlimited guesser is an enumeration path into a minors' database.
5. Link requests expire (7 days shown).

---

### 09 · Athlete Detail (parent view)
**Role:** parent · **States:** Populated, Limited data

**Header:** "‹ Whitfield family", then a 48px avatar beside "Jordan Whitfield" in Raleway 700/21px with a sub-line ("Enrolled Nov 3 · 45 min tier · Tier C").

**Populated.** A 2-up stat grid — "94%" attendance since Nov, "3 of 4" months on the Board — values in Raleway 700/26px.

Contract history card: four rows (Nov, Dec, Jan, Feb), each a 46px month label, an 8px meter, and a right-aligned percentage in a 40px column. Green at ≥90%, yellow below. Caption: "Dec sits low because of the Dec 23 – Jan 3 closure. Closure days are excluded from the denominator."

Progress summary card: a 96px media placeholder captioned "COACH SUMMARY — written before Phil's monthly call", then "Practice and course-performance data arrives here in a later phase, read-only from the ecosystem database."

Reflection summaries card (`#141414`, `1px solid #282828`): an unchecked 18px box, "Reflection summaries" in 600/13px `#CCC`, and "Summary level only. Full transcripts are never shown to a parent account — that boundary is enforced server-side, not by hiding this card."

**Limited data.** A `1px solid #F4EE19` card: "New enrollment" and "Jordan enrolled Feb 8. Attendance, contract history, and progress summaries need about a month of data before they say anything useful. This screen fills in as the season runs." Then an "Available now" checklist: 2 sessions attended (green), Diagnostic booked Feb 27 (yellow outline), Contract starts Mar 1 (grey outline).

**Access boundary:** parents see reflection **summaries only, never full transcripts**. Enforce server-side per role — the API must not return transcripts to a parent account regardless of what the UI requests.

---

### 10 · Billing & Subscription
**Role:** parent · **States:** Active, Retry 1, Retry 3, Access restricted, Updating card

**This screen resolves flag 04.** Stripe retries three times over ten days before booking access is restricted, and the parent must understand exactly where they are in that sequence. One red cannot express that.

**Hero card.** Label + badge row, title in Raleway 700/22px, body in 400/13px, optional CTA.

| State | Card bg | Border | Badge | Title |
|---|---|---|---|---|
| Active | `#1A1A1A` | `#333` | ACTIVE `#00AF51` | Next charge Mar 1 |
| Retry 1 | `rgba(244,238,25,.06)` | `#F4EE19` | RETRY 1 OF 3 `#F4EE19` | Card declined Feb 16 |
| Retry 3 | `rgba(255,68,68,.07)` | `#FF4444` | RETRY 3 OF 3 `#FF4444` | Last automatic attempt Feb 26 |
| Restricted | `rgba(255,68,68,.07)` | `#FF4444` | RESTRICTED `#FF4444` | Booking is paused |

Body copy, verbatim:
- *Retry 1* — "Stripe retries automatically on Feb 19. Booking stays open — nothing is restricted yet. Updating the card now retries immediately."
- *Retry 3* — "Two retries have failed. If Feb 26 fails, booking access is restricted for both athletes the same day. Scheduled sessions already booked are kept."
- *Restricted* — "The invoice went unpaid through all three retries. Existing bookings are honoured; new bookings and reschedules are blocked until the invoice clears. Contract logging is unaffected."

CTA is `#F4EE19` at retry 1 and `#FF4444` from retry 3 on, always with `#000` text.

**The sequence ladder** (shown in retry and restricted states only). A vertical timeline, five steps: Invoice due (Feb 16 · charge declined) → Retry 1 (Feb 19) → Retry 2 (Feb 22) → Retry 3 (Feb 26 · last attempt) → Booking access restricted (Feb 26 · all athletes).

Each row is a 22px gutter holding a dot and a connector line, then the step name and date. Dots are 10px normally and **14px at the current position** with a 4px glow ring (`rgba(244,238,25,.15)` or `rgba(255,68,68,.15)`). Passed steps are filled `#FF4444` with a `#FF4444` connector; future steps are transparent with a `#3a3a3a` border and `#2a2a2a` connector. The current step's name is 600/14px white; passed are 500/13px `#CCC`; future are `#777`.

**Membership card:** "Tier C · unlimited access" in 600/15px, "2 athletes · billed monthly", and the dashed yellow price slot. Footnote: "Tier names and prices render from data. Nothing here is an approved figure."

**Payment method card:** a 40×26 card-art placeholder, "Visa ending 4242" (turns `#FF4444` in retry states), meta "Expires 04/27" or "Declining · expires 04/27", and a "Change" link.

**Invoice history:** rows of month + date, a monospace `$ ——` amount in `#F4EE19`, and a PAID/UNPAID pill. Rows separated by `1px solid #262626`.

**Updating card.** Header "Update card". A 92px media placeholder captioned "STRIPE ELEMENTS IFRAME — card fields never render in our DOM", a billing postal code field, and the note "Saving a working card retries the open invoice immediately. If it clears, booking access is restored the same minute." CTA: "Save and retry now".

**Implementation:** use Stripe Checkout, Elements, or Payment Links. Card data must never pass through app servers. Store only `stripe_customer_id` and `stripe_subscription_id`.

**Token gap:** this screen needs one value the brief does not define — an amber-red mid state between `#F4EE19` and `#FF4444`. See Open Decisions.

---

### 11 · Notification Preferences
**Role:** parent · **States:** Default, Saved

**Two channels per category**, not one master toggle. A header row labels the two 52px columns EMAIL and SMS in 400/9px uppercase `#777`.

Four category cards: name in 600/14px, description in 400/11px `#888`, then two toggles.

**Toggle:** 42×25, `border-radius: 13px`, 2px padding, 19px circular knob. On — `#00AF51` fill, `1px solid #00AF51`, `#000` knob. Off — `#242424` fill, `1px solid #3a3a3a`, `#666` knob. A locked-on toggle is `rgba(0,175,81,.35)` with `rgba(0,175,81,.5)` border.

| Category | Description | Email | SMS |
|---|---|---|---|
| Billing | Charges, failed payments, invoice receipts | on, locked | on, locked |
| Schedule changes | Cancellations, closures, block moves | on | on |
| Weekly newsletter | Program updates, coach and fitness corners, alumni | on | off |
| Progress summaries | Monthly report ahead of the check-in call | on | off |

Billing carries a footnote in 400/10px `#F4EE19`: "Failed-payment notices always send on at least one channel."

Closing note: "Failed-payment notices are transactional, not marketing, and stay on by channel choice only. A parent who has switched both channels off still sees the banner on screen 10."

**Saved state:** a toast between header and list — `rgba(0,175,81,.1)`, `1px solid #00AF51`, `border-radius: 10px` — with a green tick and "Preferences saved" in 500/13px `#00AF51`.

**Design note:** categories differ in urgency. A schedule change 40 minutes before a block needs SMS; a newsletter never does. Newsletter is a category here per revision 2.

---

### 12 · Coach Dashboard
**Role:** coach · **States:** Sessions today, Multiple concurrent blocks, No sessions today

**Header:** date above "Luke" in Raleway 700/22px, plus a count pill at right ("2 blocks" green / "2 concurrent" green / "Off today" neutral).

**Tab strip:** Overview / Students / Sessions — three equal 36px segments, active `#00AF51` with `#000` text. Carried forward from the 2025 build's coach dashboard IA.

**Block cards.** A 56px time gutter, a 1px 44px rule, then the type chip, rotation name in 600/15px, and meta in 400/11px `#CCC`. A status pill at right: NOW (`#00AF51` fill / `#000`), NEXT (`1px solid #333` / `#CCC`), CLOSED (`1px solid #2e2e2e` / `#777`).

The NOW card is `1px solid #00AF51` with `box-shadow: 0 8px 24px rgba(0,175,81,.14)` and a 50px filled "Start roster" button. NEXT cards get a 46px outlined "View roster". CLOSED cards get neither and dim to `#141414`.

*Concurrent state:* two 4:00 PM cards both marked NOW, the first footnoted in `#F4EE19`: "Runs against the makeup group below. Two rosters, not one."

**"Needs a conversation" card:** athlete rows with 32px avatars — M. Okonkwo "3 no-shows this month" in `#FF4444`, R. Sandoval "Contract behind — 7 of 13 days" in `#F4EE19`.

**No sessions today:** a dashed empty card ("Your next assigned block is Mon Feb 22, 5:00 PM") plus an "Outstanding" card in `1px solid #F4EE19` listing Diagnostic not entered (2 athletes) and Attendance not closed (1 block).

**Design note:** concurrent blocks stay as two peer cards, each with its own Start roster button, rather than a combined floor view. A coach running two groups needs two separate attendance records, not one merged list.

**Access rule:** filter every query by coach assignment, not just by role. A coach sees only their own assigned athletes — no cross-family or cross-coach visibility.

---

### 13 · Session Roster & Attendance ⭐
**Role:** coach · **States:** Pre-session, In progress, Completed, No-shows flagged

**The in-session working screen. Used on a phone or tablet while standing in a loud facility. Extra attention.**

**Sticky header.** "‹ Today" at left, a status pill at right (Starts in 12 min / In progress / Completed / 2 no-shows). Then a type chip + block label, the rotation name in Raleway 700/21px, and "4:00–5:00 PM · Sim Bay 2 · 6 expected".

**Counter row:** three equal cards, `border-radius: 10px`, 10px vertical padding, centered. Value in Raleway 700/22px above a 400/9px uppercase label at 0.75 opacity. IN goes green when non-zero, OUT goes red when non-zero, UNMARKED goes `#F4EE19` when non-zero and the session has started. Inactive counters are `#141414` / `1px solid #2a2a2a` / `#777`.

**Roster rows.** 42px circular avatar, name in 600/16px, meta in 400/11px `#888`, then the IN/OUT control pair. Rows separated by `1px solid #1e1e1e` with 11px vertical padding.

**Control pair — the critical measurement.** Each button is **64×48**, `border-radius: 9px`, 700/13px, `letter-spacing: .04em`, with **7px** between them. Unmarked: transparent, `1.5px solid #3a3a3a`, `#CCC` text. Marked IN: `#00AF51` fill and border, `#000` text. Marked OUT: `#FF4444` fill and border, `#000` text. Tapping the active button again clears the mark.

**Three states per athlete, not two.** Unmarked must be distinct from absent. Closing a block with unmarked athletes is what produces bad no-show data.

**Footer:** a 56px CTA. Pre-session "Start session" (filled green). In progress "Close block" — filled green when nothing is unmarked, otherwise `1px solid #F4EE19` with `#F4EE19` text reading "Close block · N unmarked". Completed states offer an outlined "Add a session note". Hint below in 400/11px `#888` centered: "Tap a green or red button again to clear it." / "No-shows are reported to Phil, not the coach chain."

**Optional per-athlete note chip**, indented 54px to align under the name: `#161616` / `1px solid #2a2a2a` normally, `rgba(255,68,68,.08)` / `rgba(255,68,68,.4)` / `#FF4444` for a no-show. Never a required field.

### Mobile treatment for 13 (required by the brief)

IN and OUT at 64×48 with 7px between them — above the 44px floor with room for a gloved or cold hand. No typing required to complete the core task. Unmarked is a real third state. Tapping the active button clears it, so there is no undo bar to find. Notes are optional chips, never required fields. The header is sticky so the counters stay visible while scrolling a long roster.

**⚠ Not designed — see Open Decisions:** offline behavior. This is the one Phase 1 action that cannot be allowed to fail, and the brief does not list an offline state.

---

### 14 · Diagnostic Capture
**Role:** coach/staff · **States:** Empty form, Upload in progress, Partially saved, Complete

**Header:** "‹ Cancel" at left, a save-status label at right (Not saved `#555` / Uploading… `#F4EE19` / Draft saved 2 min ago `#CCC` / All sections complete `#00AF51`). Then a 40px avatar beside the athlete name in Raleway 700/18px and "Diagnostic Protocol · Feb 18 · age 12". Then a 5px progress meter with "N of 6" at right.

**Video section:** a 96px media placeholder, `1px dashed #333` (turns `#F4EE19` while uploading), captioned "TAP TO RECORD OR ATTACH — face-on · down-the-line · overhead · rear" when empty, "SWING VIDEO — 4 angles attached" when done. Uploading adds a 5px progress bar at 64% and "Uploading 3 of 4 angles · 64% · keep this screen open".

**Four numeric sections:** Launch monitor (clubhead speed mph, ball speed mph, smash factor, carry 7i yd) · Mobility & stability (hip rotation °, shoulder rotation °, single-leg balance sec) · Short game (30/50/70 yd dispersion ft) · Putting (3 ft made /10, 6 ft made /10, 10 ft start line %).

**Field row:** label in 400/13px `#CCC` at left, then an **86×44 right-aligned** input (`#111`, `1px solid #333`, `border-radius: 8px`, 600/15px), then the unit in a fixed 30px column in 400/11px `#666` **outside** the input. 9px between rows.

**CTA:** "Publish to Practice DNA" (filled green) when complete; "Waiting on upload" (disabled) while uploading; "Save draft and exit" (outlined) otherwise.

**Design note:** numeric fields are right-aligned with the unit outside the input, so a coach entering nine readings in a row keeps a single thumb path down the screen. **Partial save is the default, not an explicit action** — a Diagnostic runs 90 minutes and will be interrupted.

---

### 15 · Admin Dashboard (Ops)
**Role:** ops admin · **States:** Populated, Filtered by tier

**Phil's monthly-check-in-call prep surface. It must answer "who needs a conversation this week."**

**Header:** "Week of Feb 15" above "Who needs a call" in Raleway 700/24px. Then a filter control: 42px tall, `#1A1A1A`, `1px solid #333` (green when filtered), reading "All tiers · 117 athletes" or "Tier C only · 41 athletes" with a CSS chevron.

**The named list comes first.** An `1px solid #FF4444` card headed "OUTSTANDING · N". Rows: who in 600/13px white, why in 400/11px `#CCC`, and a category pill at right (`1px solid` in the row's tone, no fill):

| Who | Why | Tag |
|---|---|---|
| Whitfield household | Payment failed — retry 2 of 3 | BILLING (red) |
| M. Okonkwo | 3 no-shows this month | ATTENDANCE (red) |
| R. Sandoval | Contract at 54% with 6 days left | CONTRACT (yellow) |
| 2 athletes | Diagnostic not entered since enrollment | ONBOARDING (yellow) |
| Issue 14 newsletter | Fitness Corner outstanding, deadline passed | NEWSLETTER (yellow) |

**Then metrics as context:** a 2-up stat grid (117 enrolled athletes / 84% average block fill over 4 weeks). An "Enrollment by tier" card — one labelled meter row per tier, rendered from data. A "Block fill this week" bar chart: six columns (Mon–Sat), each a full-width bar whose height is `pct × 0.62` px with a 400/9px `#777` label below. Bars are `#00AF51` at ≥90%, `rgba(0,175,81,.55)` at 50–89%, `#3a3a3a` below 50%. Caption: "Friday is the overflow block — low fill there is expected, not a problem."

**Design note:** the named list sits above the counts because the brief asks the screen to answer who needs a conversation. Metrics are context for the list, not the point of the screen. **This screen earns a desktop treatment** — it is one of two Phase 1 screens where a wider table genuinely beats a phone.

---

### 16 · Staff & Roles
**Role:** owner only · **States:** Populated, Add staff member

**Populated.** Header "Owner only" above "Staff & roles" in Raleway 700/24px, with a "6 accounts" pill at right.

Staff rows: 38px avatar, name in 600/15px, role in 400/11px `#CCC`, and an MFA pill at right — MFA ON (`1px solid #00AF51` / `rgba(0,175,81,.12)`) or MFA OFF (`1px solid #F4EE19` / `rgba(244,238,25,.1)`). Rows with notes expand below a `1px solid #2e2e2e` rule.

| Name | Role | MFA | Note |
|---|---|---|---|
| Luke Benoit | Owner / Program Director | on | Full access including the audit log |
| Phil | Ops Admin | on | — |
| Yannick | Mental Performance Coach | on | Broadest non-owner access — every read is logged |
| Brock | Playing Lessons Coach | on | — |
| Lead Instructor | Coach · assigned athletes only | **off** | MFA not yet enrolled — required before first login |
| Front Desk | Coach · scheduling and intake | **off** | MFA not yet enrolled — required before first login |

Then a dashed "+ Add staff member" affordance, and a note: "Every sensitive-record access is written to the audit log from the first release. The log lives behind this screen, owner-only."

**Add staff member.** Name and work email fields, then a role picker — four cards, each with a 22px radio, role name in 600/13px, scope in 400/11px `#888`, and an MFA pill:

- **Coach** — Attendance and logs for assigned athletes only
- **Mental Performance Coach** — Mental-game notes academy-wide
- **Ops Admin** — Fitness completion, billing status, enrollment
- **Owner / Director** — Full access including staff and audit log

Then the note: "Background check and working-with-minors training are tracked on a spreadsheet outside the app by decision, so there is no field for them here. The gate is procedural: do not create the account until the spreadsheet says clear."

**Revision 2 removed background-check and training tracking from this screen.** I left a stated note where the fields were rather than deleting silently. See Open Decisions — the Blueprint's rule that no credentials issue before screening is clear still stands, and there is now nothing in the interface that can hold it.

---

### 17 · Newsletter Composer
**Role:** admin · **States:** Draft with sections missing, All sections in, Scheduled, Sent

New in revision 2. The module's real job is **visibility into which sections have landed** — the recurring failure mode is an issue slipping because one contributor didn't submit. So this is a checklist first and an editor second.

**Header:** "Issue 14 · Feb 18" above "This week" in Raleway 700/22px, with a status pill at right (Draft yellow / Ready green / Scheduled green / Sent neutral). Then a deadline banner, `border-radius: 9px`, 11px/13px padding:

- *Draft* — `rgba(244,238,25,.07)` / `1px solid rgba(244,238,25,.4)` / `#F4EE19` — "Deadline passed — Tue Feb 17, 12:00 PM. 2 of 4 sections in."
- *Ready* — `#141414` / `1px solid #282828` / `#00AF51` — "All four sections in. Nothing is blocking send."
- *Scheduled* — "Sends Thu Feb 18, 6:00 AM to 96 guardians who opted in."
- *Sent* — "Sent Thu Feb 18, 6:02 AM · 96 recipients · 71% opened."

**Four standing sections, fixed order, not reorderable:**

1. **Program Updates** — Phil · Ops
2. **Coach's Corner** — Yannick · Mental performance
3. **Fitness Corner** — Lead Instructor
4. **Keeping Up with the Ryppers** — Alumni · Luke

Each card: a 24px status mark at left (landed: `#00AF51` fill with a CSS tick; outstanding: `1.5px dashed #F4EE19`), section name in 600/14px, contributor in 400/11px `#888`, and a pill — IN (green) or OUTSTANDING (yellow outline). Landed sections expand to a 52px media placeholder captioned "SUBMITTED COPY — tap to edit". Outstanding sections instead expand to a 40px `1px solid #F4EE19` button reading "Nudge {contributor}".

Outstanding cards tint their whole background `rgba(244,238,25,.05)` and take a `1px solid #F4EE19` border.

**Footer CTA:** "Send · 2 sections missing" **disabled** (`#1e1e1e` / `1px solid #333` / `#555`) while anything is outstanding; "Schedule send" filled green when ready; "Edit or cancel schedule" outlined when scheduled; "Start next issue" outlined when sent. Hint below: "Send unlocks when all four sections are in." / "Goes to guardians who opted into the newsletter category."

**Rule:** send is blocked while any section is outstanding, and the only action available in that state is nudging the named contributor.

**This screen also earns a desktop treatment.**

---

### 18 · Door Access (addition — not in the brief's seventeen)
**Role:** athlete + parent · **States:** Open now, Outside window, No session today

The technical plan lists door-access windows under scheduling with no screen attached. Designed as **a state of the booking rather than a separate feature**: no booking means no code.

**Header:** date above "Facility access" in Raleway 700/22px, plus a status badge (DOOR OPEN green / OUTSIDE WINDOW yellow / NO SESSION neutral).

**Code card** (`border-radius: 16px`, `26px 18px` padding; `1px solid #00AF51` with `box-shadow: 0 10px 30px rgba(0,175,81,.16)` when open, `1px solid #333` otherwise). "ENTRY CODE" label centered, then the code in **Raleway 700/44px with `letter-spacing: .22em`**, centered — white when live, `#3a3a3a` when not (`— — — —`). Then a `1px #2e2e2e` rule and a centered title + body:

- *Open now* — "Tap to unlock" · "Your 4:00 PM block starts in 12 minutes. Access opens 20 minutes before and closes 15 minutes after."
- *Outside window* — "Opens at 3:40 PM" · "Your block is at 4:00 PM. Access opens 20 minutes before. The code changes every session — this one is not live yet."
- *No session* — "Nothing booked today" · "Door access is tied to a booking. Book a block and the code appears here automatically."

**Window visualisation:** a 7px segmented bar showing before / opening / session / closing / after as `#242424`, `rgba(0,175,81,.4)`, `#00AF51`, `rgba(0,175,81,.4)`, `#242424`, with time labels below (3:40 PM / 4:00 / 5:00 / 5:15 PM) in 400/10px `#777`. Caption: "Twenty minutes before, fifteen minutes after. Outside that, the code does not work and the front desk lets you in."

**Guardian note card:** "The same code appears on the linked guardian's account, so a parent doing dropoff does not need the athlete's phone."

**CTA:** 56px — "Unlock the north door" (filled green) / "Opens in 48 minutes" (disabled) / "Browse open blocks" (filled green).

**Two open questions:** whether this is a numeric code, a QR, or a hardware integration; and whether a guardian in the dropoff line needs it on their own account. I assumed yes on the second.

---

## Interactions & Behavior

**Navigation.** Bottom tab bar switches role sections. Detail screens push with a back affordance ("‹ Today", "‹ Whitfield family", "‹ Cancel") in the header, never a bottom-bar change. Registration and the linking flow are stepped with a progress indicator and a back affordance that steps rather than exits.

**Attendance marking (13).** Tap IN or OUT to mark. Tap the active button again to clear it back to unmarked. Counters update immediately. Close block is gated on nothing being unmarked, but the gate is soft — the button is still tappable and states the count, because a coach may legitimately need to close with a gap.

**Contract logging (07).** One tap on the pinned Log Today button records the day at the tier's minute value. The month grid is read-only; a past day opens a sheet.

**Booking (05).** Date strip selects a day, slot list filters to it. A full slot expands a waitlist note in place. Tier limit is surfaced in the persistent banner, never only at submit.

**Newsletter (17).** Send is disabled while any section is outstanding. Nudge is the only available action against an outstanding section.

**Linking (08·L).** Submitting an ID either advances to the masked match confirmation or returns the deliberately-vague failure. Sending a request advances to pending; the request expires after 7 days.

**Form validation.** Inline, on blur, below the field: a 14px circular `!` badge outlined `#FF4444` beside the message in 400/12px `#FF4444`, and the field border becomes `#FF4444`. The step CTA disables while the step has an error. Registration's date of birth is required because it determines U13 vs U18 eligibility.

**Loading.** Two patterns. A button-level spinner replaces the label region and the label changes to a present participle ("Signing in", "Submitting enrollment"). A blocking operation that must not be interrupted also dims the frame with a `rgba(0,0,0,.55)` overlay and a centered card explaining why (registration submit, because consent records are written before the account exists).

**Animation.** The only motion in the scaffold is `@keyframes spin` — `transform: rotate(360deg)`, `0.8s linear infinite`. Everything else is static. Add transitions at your discretion; nothing here depends on them.

**Responsive.** Designed mobile-first at 390pt and verified 340–440. Screens 15 and 17 warrant a desktop layout; the others are phone-native by intent. 07 and 13 are used standing up and should not be re-laid-out for desktop at the cost of their touch targets.

## State Management

Per screen, the state that drives layout:

- **01** `authState: 'idle' | 'loading' | 'invalid' | 'locked'`, `failedAttempts`
- **02** `step: 0..3`, `submitting`, `submitted`, per-field errors, `tiers[]` from the API, `consents: {dataCollection, videoCapture, mediaRelease}`, `signatureName`
- **03** `athlete`, `nextSession | null`, `contract | null`, `onboardingComplete`
- **04** `tab: 'upcoming' | 'past'`, `sessions[]` (each with `type: 'training' | 'tournament'` and `status`)
- **05** `selectedDate`, `slots[]`, `tierRule: {used, limit, resetsOn, unlimited}`, `confirmation | null`
- **06** `modules[6]` each `'captured' | 'pending'`, `baselineDate`, `nextCaptureOpens`
- **07** `tier: 20 | 45 | 95 | null`, `month`, `loggedDays[]`, `contractDays[]`, `closureDays[]`, `todayLogged`
- **08** `children[]`, `householdBilling: {status, retryStep}`
- **08·L** `linkStep`, `athleteId`, `match | null`, `attemptsRemaining`, `pendingLinks[]`
- **09** `childId`, `attendancePct`, `contractHistory[]`, `hasEnoughData`
- **10** `subscription`, `dunning: {step: 0..4, dates[]}`, `paymentMethod`, `invoices[]`, `updatingCard`
- **11** `preferences: {[category]: {email, sms}}`, `saved`
- **12** `blocks[]` each `'closed' | 'now' | 'next'`, `concurrent`, `attentionList[]`
- **13** `session`, `roster[]`, `marks: {[athleteId]: 'in' | 'out' | null}`, `sessionState`, `notes`
- **14** `athleteId`, `videoUpload: {status, progress, angles}`, `sections[4]` each `'empty' | 'saved'`, `draftSavedAt`
- **15** `tierFilter | null`, `outstanding[]`, `enrollmentByTier[]`, `blockFill[]`
- **16** `staff[]`, `addingStaff`, `selectedRole`
- **17** `issue`, `sections[4]` each `{contributor, submittedAt | null, content}`, `issueStatus`
- **18** `booking | null`, `accessWindow: {opensAt, closesAt}`, `code | null`

**Data fetching.** Every screen reads from the API. Representative endpoints from the technical plan §7.1:

```
GET  /athletes/:id · /athletes/:id/diagnostics
POST /athletes/:id/commitment-contract · /athletes/:id/fitness-logs
POST /billing/subscribe · /billing/upgrade        GET /billing/:athleteId/invoices
GET  /schedule/availability                       POST /bookings · /bookings/:id/reschedule
GET  /coach/roster/:sessionId                     GET /admin/fitness-completion
GET  /newsletter/issues/:id  PUT /newsletter/sections/:id  POST /newsletter/issues/:id/send
GET/PUT /guardians/:id/notification-preferences
GET  /admin/audit-logs (owner only)               POST /admin/staff-accounts
```

**Access control — enforce server-side on every request, never only in the UI.** Re-check both the caller's role and row-level ownership before returning data. A parent must never be able to query another family's records by guessing a URL or an ID.

| Role | Access |
|---|---|
| Athlete | Own records only |
| Parent/Guardian | Linked athletes only. Reflection access is **summary-level only** — the API must not expose transcripts to this role |
| Coach | Attendance and logs for **their own assigned athletes only** — filter by coach assignment, not just role |
| Mental Performance Coach | Mental-game notes academy-wide. Broadest non-owner access; require MFA and log every access |
| Ops Admin | Fitness completion, billing status, enrollment. No write access to coaching or mental-game data |
| Owner/Director | Full access including staff management and audit logs |

MFA is required on all staff roles at setup. Parent and athlete accounts stay on standard login.

## Design Tokens

Taken verbatim from the 2025 build's `frontend/src/styles/theme.js`. Verified against the attached codebase — these match exactly.

### Color
| Token | Hex | Usage |
|---|---|---|
| Primary | `#00AF51` | Primary actions, success, active states, brand accent |
| Secondary | `#F4EE19` | Warnings and caution only (see Open Decisions). Dark surfaces only — never on white |
| Background | `#000000` | App background; dark-themed by default |
| Surface | `#1A1A1A` | Cards, panels, raised surfaces |
| Border | `#333333` | Dividers, card outlines, inputs (see Open Decisions) |
| Text primary | `#FFFFFF` | Body and headings |
| Text secondary | `#CCCCCC` | Labels, metadata |
| Error | `#FF4444` | Destructive actions, validation, failed payment |

Supporting values used consistently throughout: `#111` (meter tracks, inset fields), `#141414` (disabled/dimmed surfaces), `#222` (frame dividers), `#242424` (toggle-off), `#262626` / `#2a2a2a` / `#2e2e2e` (nested rules), `#3a3a3a` (unmarked control borders), `#888` (tertiary text), `#777` / `#666` / `#555` (progressively disabled text).

Tinted fills, used for every "state" treatment: `rgba(0,175,81,.12)` and `rgba(0,175,81,.14)`, `rgba(244,238,25,.10)` and `rgba(244,238,25,.12)`, `rgba(255,68,68,.08)` and `rgba(255,68,68,.10)`.

### Typography
- **Headlines** — Raleway 600/700, with `letter-spacing` on section titles (`.01em` on screen titles, `.04em` on labels, `.1em` on section heads, `.24–.28em` on the wordmark)
- **Body** — Work Sans 400/500/600/700
- **Monospace** — `ui-monospace, Menlo, monospace` for IDs, placeholder captions, and code-like values only
- **Scale** — 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 / 48px, per the brief. In practice the artboards also use 9, 10, 11, 13, 15, 17, 21, 22, 26, 40, 44, and 54px — the brief's scale is the intent, not a hard constraint, and the smaller sizes are labels and pills
- **Line heights** — 1.2 tight, 1.5 normal, 1.75 relaxed. Body copy in cards uses 1.45–1.6

### Spacing
4 / 8 / 16 / 24 / 32 / 48 / 64px per the brief. Card interiors use 14–20px, gaps between cards 10–14px, and section padding 20–24px.

### Radius
4 / 8 / 12 / 16px per the brief, plus `999px` for pills and `28–30px` for the phone frame. Cards are 12–16px, inputs and buttons 8–10px, badges and pills 5–6px.

### Shadow
The brand signature is a green-tinted elevation. Used **only** on primary emphasis:
```
0 6px 20px rgba(0,175,81,.12)   /* live session card          */
0 8px 22px rgba(0,175,81,.26)   /* secondary primary button   */
0 8px 26px rgba(0,175,81,.30)   /* primary CTA                */
0 10px 28px rgba(0,175,81,.32)  /* pinned primary CTA (07,13) */
0 10px 30px rgba(0,175,81,.16)  /* hero card                  */
```

### Placeholder treatment
```css
background: repeating-linear-gradient(45deg, #131313 0 5px, #1b1b1b 5px 10px);
border: 1px dashed #333;
border-radius: 8px;
/* caption: ui-monospace 400/9px, #6f6f6f, letter-spacing .06em, centered */
```
Do not recreate this. It marks where real content goes.

### Touch targets
Minimum 44px on any interactive element. Attendance IN/OUT on 13 is 64×48. Pinned primary CTAs on 07 and 13 are 56px. Inputs are 50–52px. Toggles are 42×25 with a 19px knob (the row is the tap target, not the toggle).

## Assets

**None shipped.** Everything visual in the scaffold is CSS.

You will need to supply:
- **RYP logo mark** — 76×76 at `border-radius: 18px` on 01; a 34×34 green-square placeholder with "R" in the canvas header
- **Icon set** — every icon in the scaffold is a geometric placeholder. Bottom tab bars need Home, Schedule/Calendar, Contract/Target, Profile, Children, Billing/Card, Settings, Today, Roster/List, Capture/Camera. Inline icons needed for chevrons (currently rotated CSS squares), ticks (currently rotated CSS borders), warning `!` and info `i` badges, and the Google mark on 01
- **Athlete avatars** — 32 / 38 / 40 / 42 / 44 / 46 / 48px circles
- **Swing video** — multi-angle capture, S3-compatible object storage per the technical plan
- **Payment card art** — 40×26 on 10
- **Welcome video** — Luke, ~60s, on 03's new-athlete state

Fonts: Raleway and Work Sans, weights 400/500/600/700. The scaffold loads them from Google Fonts; self-host for production.

## Open Decisions

Nine flags are written into the design file's Flags section with full reasoning. Summarised here because they affect implementation.

**Resolved in the design, needs a token added.** Screen 10's retry ladder needs one value the brief does not define — an amber-red mid state between `#F4EE19` and `#FF4444`. Four escalating states across ten days cannot all be `#FF4444`; a parent who sees maximum alarm at retry 1 learns to ignore it by retry 3. Add it formally rather than leaving it as a one-screen exception.

**Blocking on 02 step 3.** Tier names, count, prices, **and inclusions** are all open. The only decided fact is that one tier is unlimited. The component is built correctly — variable list, unlimited flagged, nothing hardcoded — but it cannot become a usable screen until at least the per-tier inclusions are decided, since a parent is currently choosing between cards that differ on nothing. Inclusions are a smaller unblock than pricing.

**Affects every screen.** The `#333` border token on `#000` measures ~1.3:1. `#3D3D3D` measures ~1.6:1; neither clears 3:1. A hairline separator is exempt from that threshold, but if these outlines are the only thing distinguishing a card from the page, the honest fix is surface elevation rather than a brighter line. Both values are switchable in the design file's Tweaks panel. **The brief's own contrast warning points at the wrong pair** — `#CCCCCC` on `#1A1A1A` measures ~11:1 and passes AAA comfortably.

**Convention the build must enforce.** Green is assigned to both primary actions and success/on-track states, and they sit inches apart on 07. The scaffold's rule: **solid green fill means tap; green outline or tint means status.** This holds only if enforced everywhere.

**Yellow cannot be both highlight and warning.** The token list assigns it both. The scaffold uses yellow strictly as caution — pending, partial, outstanding, tier-limit, unmarked. Highlight is carried by white weight or green.

**Data-model decision that changes the UI.** The 95-minute tier rarely happens in one sitting. One entry per day is what the scaffold designs; multiple entries per day is more honest and a different screen. Decide before the build, not during.

**Schedule times are inferred.** Revision 2 says three weekday afternoon blocks without naming them. The scaffold uses 3:00, 4:00, 5:00 PM (the Blueprint's four-block grid minus the eliminated 6 PM adult block), and every schedule, booking, and roster screen depends on it. Same question for the four Saturday blocks.

**Screening left the app but the gate did not.** Moving background-check and training tracking to a spreadsheet is a reasonable scope call, but the Blueprint's rule stands — no credentials before screening is clear — and 16 is the screen that issues credentials. With the field gone, nothing in the interface can hold the line. Minimum fix: one unvalidated confirmation checkbox on invite recording who asserted it and when, without duplicating the spreadsheet.

**Deferring analytics leaves visible holes.** 06 shows a captured baseline with nothing to compare against until ecosystem integration lands, and 09's progress summary is a coach-written note rather than data. Both screens are honest about it. Confirm that reads as intentional rather than unfinished.

**Not designed, and the highest-risk gap.** Offline attendance on 13. A coach in a loud facility on bad wifi, and marking attendance is the one Phase 1 action that cannot be allowed to fail. Not in the brief's state list. Recommend local-first writes with a visible sync indicator and conflict handling on reconnect.

**Also not designed:** a fitness-completion audit view. Technical plan §5.6 and Blueprint §12.1 both give Phil a completion-percentage audit before monthly family calls. Screen 15 surfaces who is behind but not the audit table itself, and `GET /admin/fitness-completion` exists in the API surface.

## Not in Scope

Per the brief's exclusion list, none of these are designed and none should be built now:

- Rewards, points balance, redemption, leaderboard — point values undecided, Titleist and Unreal partnerships unconfirmed
- Practice-tracking and course-management platform screens — built outside this codebase, integrating later through the shared ecosystem database
- Transfer Index display — depends on both of the above
- AI reflection chatbot — its escalation path is a design input, not a later detail. Whoever builds it inherits a deterministic distress check, not model judgment alone
- Scholarship application — form fields and recipient undecided
- Camp registration — pricing and staffing not set
- Safety, screening, and training compliance tracking — deliberately on a spreadsheet
- **Any specific dollar figure, anywhere**

**Do not build local versions of the deferred features.** A simple practice log or basic points ledger creates a second source of truth to reconcile when the real platform arrives. Leave the gap visible.

**Do not carry forward from the 2025 build:** the hardcoded pricing model (4x/8x/12x/16x packages at $200/$380/$540/$680 plus fitness and mental add-on tiers), any of those package names, or the token-wallet UI. That is not the 26/27 model.

**One decision that cannot wait:** the shared athlete identifier the ecosystem database will join on. Decide it before the first athlete record is written — retrofitting a cross-system ID after enrollment data exists touches every table.

## Files

| File | What it is |
|---|---|
| `RYP Portal Scaffold.dc.html` | The complete design document — 19 artboards, screen flow, component inventory, and flags. Open in a browser. State toggles sit above each artboard |
| `support.js` | Runtime for the design file. Required for it to render. Not part of the design |

Reference documents, not in this bundle: `RYP_Portal_Design_Handoff_Brief` rev 2 (screen-level spec), `RYP_2026-27_Portal_Technical_Construction_Plan` rev 2 (architecture, data model, phasing), `RYP_Academy_Blueprint_20262027` (business context, Code of Grit, three-step protocol, block schedule, staff directory).

Source codebase read for this design: `frontend/src/styles/theme.js` (tokens, matched exactly), `frontend/src/pages/ParentDashboardPage.js` and `CoachDashboardPage.js` (tab IA, carried forward as bottom nav), `frontend/src/pages/AdminDashboardPage.js`, `frontend/src/App.js` (role-gated routing pattern).
