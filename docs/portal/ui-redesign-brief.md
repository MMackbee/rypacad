# UI redesign brief — RYP Academy member portal

**For:** Claude Design, project "Academy app scheduler dashboard"
(`6a3cb2d6-a751-4d92-b6cb-7e2c10e1f18e`).
**From:** the portal build team, 2026-09-18.
**Ask:** restyle the existing member portal so it looks and sounds like it
belongs to the academy's new website. Same product, same screens, same states
— new skin, tighter system.

---

## 0. Read this first: two sources, two jobs

| Source | What it is | What it is good for |
|---|---|---|
| **Luke's draft website** (`RYP-Academy-preview/ryp-share`, nine static pages + one stylesheet) | A marketing-site redesign Luke was working on. Its own note says: "This is a working draft. Prices, dates and copy are still moving." | **Look and tone only.** Palette, type, layout devices, component shapes, photography treatment, voice. |
| **The portal** (this repo: `frontend/src/portal`, `docs/portal/*`) | The live product, built against the owner's written contract. | **Every product fact.** Packages, prices, schedule, capacities, rules, roles, screens, states, copy logic. |

**The draft website is not a source of truth.** Where it states a price, a
schedule, a capacity, a policy, a program name, a date or an address, ignore
it. Section 8 lists every conflict found so none of it leaks into a design by
accident. If a fact is not in this brief or the portal docs, leave a marked
placeholder and ask — do not borrow it from the website.

---

## 1. The product, in one page

A phone-first member portal for a junior golf academy. Most athletes are
minors; their guardians are the paying customers, and that shapes almost every
access decision. **Scheduling is the critical path** — the portal replaces the
academy's old booking tools for the 26/27 season.

**Roles and their bottom tabs (as built):**

| Role | Tabs | Lands on |
|---|---|---|
| Athlete | Home · Schedule · Contract · Tour | Home |
| Parent | Home · Reservations · Billing · Tour · Settings | Home (family overview) |
| Coach | Today · Roster · Capture | Today |
| Specialist coach (Phil) | Sessions · Capture · Tour | My sessions |
| Mental performance coach (Yannick) | Sessions · Admin · Tour | My sessions |
| Ops | Admin · Sessions · Tour | Admin |
| Owner | Admin · Sessions · Staff · Tour | Admin |

**How membership works (the part the UI has to make obvious):**

- A family buys a monthly **package of sessions ("tokens")**: 6, 12 or 16 a
  period, or **Elite** (unlimited, with frequency caps). A single token also
  exists. **Facility access** (24/7) is a separate monthly add-on that needs a
  signed waiver and, under 18, parent permission; Elite includes it.
- One token books any bookable session — training, tournament, Phil's group
  PT, or a Yannick 1-on-1. **Session type is a label, never a price.** It
  drives the chip on a card, the roster and the Tour; it never changes what a
  booking costs.
- Tokens belong to a **billing period** (the family's own Stripe cycle, not the
  calendar month) and **expire hard** at period end. A booking is charged to
  the period its session date falls in.
- **Grace tokens** exist only when the academy failed the family: the academy
  cancelled the session, or a waitlist was never promoted. 30-day life, spent
  first. "Grace token" is the internal word — **every member-facing label says
  "bonus token"**, and so must every design.
- One thing in the written contract is **not built and is not yours to draw**:
  "provisional" bookings, for a session in a period Stripe has not billed yet.
  The concept appears nowhere in the code. If you meet it in the contract,
  ignore it.
- **Booking window** rolls daily at 7:00 AM Central: 32 days for token
  packages, 45 for Elite.
- **Cancelling** is allowed **until the day before** the session, and the token
  returns to its own period. On the day, self-service cancelling is closed and
  the screen points the family at the academy. (An older line in the contract
  describes a 12-hour rule; it was never built and is withdrawn — pin G. Use
  the day-before rule.)
- **Waitlist** holds one token in reserve — **except Elite, which reserves
  nothing**, so an Elite meter shows no reserved segment and no waitlist chip.
  Promotion is automatic and notifies the family; there is no accept-your-spot
  step to design.
- **A booking is charged to the period its session date falls in**, never the
  period it was made in. A booking for a date in the next, not-yet-started
  period is an ordinary confirmed booking carrying a **"next period"** badge —
  design that badge; it appears on Reservations, My Schedule and the meter.
- **Elite caps:** one golf session (training or tournament) per day, one Phil
  session per day, two Yannick sessions per month. Everyone else: one Yannick
  session per month.
- **Capacity is per session:** training 14, tournament (RYP Tour) 25, Phil's
  group PT 6, Yannick 1-on-1 1.
- **Membership standing:** active → past due (existing bookings held, new
  bookings blocked, the retry ladder shown) → lapsed (upcoming bookings
  released). A released booking is **not a new state and gets no "revoked"
  badge**: it is an ordinary cancelled row carrying a system reason line —
  "Cancelled — membership lapsed." Reinstatement does not bring those bookings
  back, and the UI says so.
- **The schedule is the owner's Google Calendar.** Blocks per day vary and
  will change without a code release. Design for a variable number of blocks a
  day; never draw a fixed timetable as if it were permanent. **One exception,
  already shipped:** a one-line summary of the academy's weekly hours, used in
  the My Schedule empty state and the Registration success step. Keep it — it
  is a sentence generated from one place in code, not a grid. And note that
  **the academy runs Saturdays** (mornings into early afternoon) as well as
  weekday afternoons: date strips, empty states and calendars must not be drawn
  as a weekday-only product.
- **Prices are currently withheld from parents and athletes**
  (`PRICES_RELEASED = false`); staff see them. Every membership, billing and
  registration design must work **with no dollar figure on it**, and have a
  second state for when prices are released.

**Notifications** are email + web push (no SMS). Categories a parent can tune:
Membership & tokens, Sessions, Progress. Billing email cannot be switched off.

---

## 2. Where the portal's look is today

Source: `frontend/src/portal/tokens.js`, `docs/portal/design-handoff.md`.

- **Fidelity:** a *branded wireframe*. Layout, hierarchy, states and touch
  targets are final. Visual polish was deliberately deferred.
- **Colour:** `#000000` background, `#1A1A1A` cards, `#3D3D3D` borders; green
  `#00AF51` primary; yellow `#F4EE19` for caution; amber `#FA9931` as the
  mid-step of the payment retry ladder; red `#FF4444` for error; text
  `#FFFFFF / #CCCCCC / #888888` plus about ten ad-hoc greys.
- **Type:** Raleway 600/700 headings, Work Sans body, system monospace for IDs.
- **Signature:** green-tinted glow shadows on primary emphasis (live card,
  hero card, primary and pinned buttons).
- **Shape:** cards 12–16px radius, inputs/buttons 8–10px, badges 5–6px.
- **Icons:** none. Every icon, including the tab bar, is a geometric
  placeholder square. A real icon set has never been drawn.
- **Brand assets in the app:** the white RYP Academy logo on black
  (`frontend/src/portal/assets/ryp-academy-logo-white.png`) on the sign-in
  header; favicon and home-screen icons are the white logo / "Y" mark on a
  black tile.
- **Frame:** designed at 390pt, verified 340–440. Fixed header and bottom tab
  bar; content scrolls. Admin is the one surface that warrants a desktop
  layout.

Two conventions the build enforces and the redesign must keep:

1. **Solid green fill means "tap". Green outline, tint or text means
   "status".** They sit inches apart on several screens.
2. **Yellow is caution only** — pending, partial, outstanding, unmarked. Never
   a highlight.
3. **A progress meter is never red.** Green at 80%+, the caution hue at 40–79%,
   grey below 40 and for no data, and the colour is derived from the value
   rather than chosen per instance. An athlete who is behind is behind, not an
   error — red would read as a system fault. The same applies to the contract
   day grid: a missed day is not an error state. Alarm colour belongs to things
   the *system* is doing wrong (a failed payment), never to a person's effort.

---

## 3. The reference: what Luke's site looks like

Everything below was read from the draft's stylesheet and all nine pages.
Treat it as a description of a *look*, not a spec to copy.

### 3.1 The idea

The stylesheet says it outright: mono, uppercase, wide-tracked labels are what
make the site "read as an instrument panel rather than a brochure." Near-black
canvas, one accent, hairlines instead of boxes, numbers set like readouts. It
is calm, exact and a little severe — a lab, not a country club.

### 3.2 Palette (complete — the draft forbids colours outside this list)

| Token | Value | Use |
|---|---|---|
| Canvas | `#0D0D0D` | Page background |
| Surface 1 | `#1A1A1A` | Cards, bands, panels |
| Surface 2 | `#2A2A2A` | Hairlines, control outlines |
| Slate | `#6A6A6A` | Non-text marks, axes, counts (fails AA as body text — the draft says so) |
| Silver | `#C8C8C8` | Body copy |
| Muted | silver at 70% (≈ `#909090`) | Secondary copy; clears AA on canvas and surface 1 |
| White | `#FFFFFF` | Headings, names, values |
| Green | `#00AF51` | **The only accent.** Tints at 8 / 20 / 40% |
| Crimson | `#DC2626` | Semantic only — loss, warning. Never decorative; too weak for small text, so it rides on rules and markers |
| Ice | `#78A6CC` | One deliberate exception, for a single diagram |

### 3.3 Type

- **Work Sans** 400 / 500 / 700 / **900**. Headings are 900, line-height 1.02,
  letter-spacing −0.03em, balanced wrapping. Big and tight.
- **IBM Plex Mono** 400 / 500 for every *eyebrow*, *datum*, caption, table
  head, chip and label. Uppercase, 10–12px, tracking 0.10–0.18em. Numbers use
  tabular figures.
- Body 17px / 1.65 on the site; secondary copy 14–15.5px.

### 3.4 Devices worth noticing

- **Eyebrow:** mono green label preceded by a 26px green rule. Opens every
  section.
- **Hairline ledger:** content laid out as rows between 1px `#2A2A2A` rules,
  not as boxed cards — a narrow mono label rail on the left (year, step,
  "Length", "Billing"), the content on the right. Used for results by season,
  staff by discipline, program terms, feature lists, FAQ.
- **Datum numerals:** counts and years in mono, green, 500 weight, tight
  tracking — "52", "2026", "$65".
- **Note card:** surface-1 panel with a 2px green left rule and squared left
  corners. The warning variant swaps the rule to crimson.
- **Tier card:** surface 1, 12px radius, hairline border that warms to 40%
  green on hover; the featured tier sits on an 8% green fill. Mono kicker row,
  heavy title, mono price, hairline list with a short green dash per line.
- **Chips:** mono, uppercase, pill radius, 1px outline. Green outline = live /
  positive; grey outline = neutral / "in development".
- **Status text (registration prototype):** mono 11px — green "4 of 10 open",
  silver "Full · waitlist 2/5", crimson "Full · waitlist closed".
- **Buttons:** primary is green fill with a *canvas-coloured* label, 8px
  radius, 700 weight, turns white on hover. Ghost is a surface-2 outline that
  turns green on hover. Compact in-row action ("Book") is a 6px-radius outline
  button.
- **Inputs:** surface-1 fill, surface-2 border, 8px radius, green border on
  focus. Focus ring everywhere is 2px green, offset 3px.
- **Accordion:** native disclosure, plus/minus drawn from two green hairlines.
- **HUD readout:** a small blurred-glass mono tag pinned to a photo corner with
  a green value — the "instrument" idea at its most literal.
- **Photography:** real facility shots, slightly desaturated, dissolved into
  the canvas with gradient scrims; mono uppercase caption bottom-left.
- **Motion:** an 18px rise-and-fade on scroll, an SVG line that draws itself,
  a fade between still and video. All switched off under reduced-motion.
- **Draft marker:** a tiny crimson "TODO" chip on anything unconfirmed, "so it
  cannot ship by accident."

### 3.5 Voice

Plain, declarative, short. Talks to a parent as an adult. Prefers a number to
an adjective and admits limits ("When it's full, it's full."). Headlines are
statements, not slogans. No exclamation marks, no hype, no emoji. The portal's
copy is already close to this; it should get closer, not louder.

### 3.6 The one app-like page

`registration.html` is a clickable *prototype* of a family booking flow
(sign in → add athletes → a week grid of session cells → "Your sessions"). It
is the best preview of how the site's language behaves as product UI: section
eyebrows, hairline-separated sections, row cards for athletes and bookings,
cells that carry a mono availability line above a small outline button, a
crimson-ruled notice panel. **Use it for feel. Its data model — activities,
age groups by hour, capacities, waitlist limit, the "Sandlot" section — is
mock and conflicts with the real product (section 8).**

---

## 4. Translating the look into the portal

### 4.1 Carry over

- The **instrument-panel label system**: mono uppercase eyebrows, captions,
  table heads, chips. This replaces the portal's current 10px Work Sans
  section labels.
- **One-accent discipline** and the draft's grey ramp (canvas / surface 1 /
  surface 2 / slate / silver / muted / white) in place of the portal's ten
  ad-hoc greys.
- **Hairline ledger rows** for anything list-like that is read rather than
  operated: reservations, notices, invoices, the two period summary lines.
  (Rows that are themselves tappable — roster, settings, households — take the
  geometry but keep a card's affordance; see 4.2.)
- **Datum numerals** for every number that does work: tokens left, days to
  expiry, seats open, Tour points, attendance counts.
- **Note card with a coloured left rule** for inline notices (booking blocked,
  past due, waitlist explained, bonus token issued).
- **Button shapes and the green-fill-with-dark-label primary.**
- **Mono status lines** for availability on session cards.
- **The voice.**

### 4.2 Adapt — do not copy at marketing scale

- **Type scale.** The site's 42–92px display sizes are for a landing page.
  In-app screen titles stay around 22–26px; keep the 900 weight and tight
  tracking, drop the size. Body 14–15px, not 17.
- **Density and touch.** The site is read sitting down with a mouse. The
  portal is used one-handed, and two screens (Commitment Contract logging,
  coach attendance) are used **standing up**. Minimum 44px targets; attendance
  IN/OUT stays 64×48; pinned primary buttons stay 56px; inputs 50–52px. The
  prototype's 13px "Book" button is too small for the app as drawn.
- **Status colours.** The site gets by with green + crimson. The portal has
  more states than that: caution (pending, waitlisted, unmarked, outstanding)
  and a **payment retry ladder** that must escalate across three automatic
  Stripe attempts and then restriction — a parent shown maximum alarm at retry
  1 ignores it by retry 3. Keep a caution hue and a
  mid-alarm hue, tuned to sit on the new canvas. Propose values; keep the
  meanings. Two specific traps: the site's `#2A2A2A` input border is ~1.2:1 on
  surface 1 — too faint to be a field edge in a form people fill on a phone;
  and its crimson `#DC2626` at 12px is ~3.6:1 on surface 1, against ~5.1:1 for
  the portal's current `#FF4444`. Keep the brighter red for error text.
- **Green as label vs green as action.** The site uses green text freely for
  labels. That is compatible with the portal's rule only if **fill** stays
  reserved for tappable things. Green eyebrows and values: fine. A green-filled
  badge that is not a button: not fine.
- **Cards vs ledgers.** Keep real cards where a thing is an object you act on
  (a session, an athlete, a package). Use ledger rows where it is a record you
  read. Where a row is itself the tap target — a roster row, a settings row, a
  household row — it may take the ledger's hairline geometry but must keep a
  card's affordance: a full-bleed hit area at 44px minimum, a visible pressed
  state, and a clear trailing element (chevron, meter or control). A flat rule
  with no affordance is wrong on every surface used one-handed.
- **Photography.** The portal has almost none and should stay light — it is a
  tool. If imagery appears (sign-in, onboarding, empty states), use the site's
  treatment: desaturated, scrimmed into the canvas, mono caption.
- **Motion.** No scroll reveals in an app. Keep transitions short and
  functional; respect reduced-motion.

### 4.3 Leave on the website

The hero video, the 3D book, the zone map and triad diagrams, the honor roll,
the staff bios, the marketing footer, the in-page text editor bar, and every
programme/price/camp/calendar block.

### 4.4 Decisions to propose (recommendation given; owner signs off)

1. **Headings: Raleway → Work Sans 900.** Recommended. One family, matches the
   site, one fewer font to load.
2. **Add IBM Plex Mono** for labels and numerals, replacing system monospace.
   Recommended.
3. **Canvas `#000000` → `#0D0D0D`.** Recommended for parity with the site, with
   one cost to note: the app icons, install splash and sign-in header were just
   built on pure black. Show both so the owner can see whether the seam
   matters.
4. **Green glow shadows.** The site has none — it is flat and hairlined. The
   handoff calls the glow the brand signature. Recommended: retire it
   everywhere except, at most, the pinned primary button. Show with and
   without.
5. **Border token.** Move to the site's `#2A2A2A` hairline and let surface
   fill carry separation (the handoff already flagged that a border alone
   never clears contrast on black).
6. **A real icon set.** Needed regardless. Meanings: Home, Schedule/Calendar,
   Contract/Target, Tour/Trophy, Reservations, Billing/Card, Settings, Today,
   Roster/List, Capture/Camera, Admin, Sessions, Staff/People; inline chevron,
   tick, warning, info, close. Line icons at a weight that sits with Plex Mono.

---

## 5. Screens and priority

All routes live under `/portal`. Every screen already exists and works; the
job is restyling, not re-architecting. Keep each screen's states.

**Tier 1 — what parents touch every week (design these first, all states)**

| Screen | Route | What must stay true |
|---|---|---|
| **Billing hub** (parent) | `/billing` | The owner's words: this is *the* place a parent sees how many tokens are left, and it has to be rock solid. Per athlete: a token meter (granted / used / reserved-on-waitlist / left), days to expiry, **bonus tokens** with their own expiry and the reason they were issued, membership standing with the retry ladder, a link out to manage payment. Period context is **two summary lines, not a browsable history**: "Next period from <date>: N tokens · N already booked" and "Last period (<range>): used N of M", plus an expandable list of this period's own sessions as the evidence behind the number. Works with prices hidden. Staff see the same page read-only at `/admin/households/:id`. |
| **Book a session** | `/book` | Date strip → sessions for that day. Each card: time, type chip, seats open, state (open / full → waitlist / already booked / outside window / blocked, with a plain reason). A parent picks which child first. Limits are shown in a persistent banner, never only at submit. |
| **Parent home** | `/family` | One card per child: next session, tokens left, a per-child Book action, anything needing attention. |
| **Reservations** | `/reservations` | Family-grouped upcoming bookings, one section per household member; cancel with the day-before rule explained in the sheet. |
| **Athlete home / Schedule / Membership** | `/home` `/schedule` `/membership` | The athlete's own version: next session, token meter (no prices), upcoming and past, waitlist position. |

**Tier 2**

| Screen | Route | Note |
|---|---|---|
| Sign in · not provisioned | `/signin` `/not-provisioned` | Email + password and Google. The white logo header is new and stays. Password reset is **not a separate screen**: it is a "Forgot password" action on Sign In plus an inline status line with three states — sending, sent ("Reset email sent to <email>"), and failed. Draw all three on the Sign In artboard. |
| Registration (multi-step) + onboarding walkthrough | `/register` `/welcome` | Package step hides prices until released; consent step includes the facility-access waiver. Blocking submit overlay stays. |
| Specialist 1-on-1 booking | `/coaching` | Phil (group PT, cap 6) and Yannick (1-on-1); monthly cap shown up front. |
| RYP Tour standings | `/tour` | Every role. Brackets ship as **10 & under · 11–13 · 14 & up**, plus **Open** for an athlete with no date of birth. Display only — brackets never gate a booking. A natural home for datum numerals and ledger rows. |
| Settings / notification preferences | `/settings` | Category × channel toggles, push enable card, recent notices list. The row is the tap target, not the toggle. |
| Commitment Contract | `/contract` | Used standing up. One pinned 56px Log button; read-only month grid. |
| Season calendar | `/season` | Athlete only. The academy's published Google Calendar rendered as a live full-month view, plus a "calendar not connected" state. Information, not booking — `/book` is where capacity lives. Restyling this means theming a **third-party calendar component** (month grid, day numbers, event pills, "+more" link, popover, toolbar) through CSS, not composing portal components, so scope it separately. It is also live but unlinked — style it and flag the missing entry point rather than inventing navigation. |

**Do not design:** Practice DNA. The screen still exists in the harness but the
owner turned it off for players and its route redirects home.

**Tier 3 — staff**

| Screen | Route | Note |
|---|---|---|
| Coach Today · Roster · Session attendance | `/coach` `/roster` `/attendance` | Attendance is used standing up in a loud room: 64×48 IN/OUT, counters update instantly, soft-gated Close. Do not trade touch targets for style. |
| Diagnostic capture | `/capture` | Roster-first, then capture. |
| Specialist day view | `/my-sessions` | Phil / Yannick land here. |
| Admin dashboard · Households · Athlete detail | `/admin` `/admin/households/:id` `/athlete/:id` | **Needs a desktop layout** as well as phone. Staff see prices. |
| Staff & roles | `/staff` | Owner only. |

**States every screen must be drawn in:** loading (skeleton), empty, error with
retry, and its own domain states — e.g. Billing: active / past-due steps 1–4 /
lapsed / Elite (no meter, no countdown) / no package yet / prices hidden vs
shown. Past due is **one screen at three ladder positions** (Card declined →
Retry N of 3 → Booking access restricted), not three screens, and there is no
"reinstated" state — reinstatement returns the account to plain active.

**The harness capture attached with this brief is the definitive state list:
what is in it is in scope, what is not is out.** That keeps "all states" a
thing both sides can accept or reject on delivery. Three corrections to the
capture, which the build team will hand over with it: Practice DNA is retired,
so ignore it; Sign In's three password-reset states are missing from it and
are in scope; and the Season calendar is not in the harness at all but is in
scope per the Tier 2 table. Anything else you believe is missing, raise it
rather than inventing it.

---

## 6. Non-negotiables

- **Dark only.** No light theme.
- **Phone first:** 390pt, verified 340–440, no horizontal scroll. Fixed header
  and bottom tab bar.
- **Contrast:** AA for all text. The draft site's own findings apply — slate
  `#6A6A6A` fails as body text, crimson and green fail at 10–11px on surface 1.
  Small coloured text needs checking case by case.
- **Touch targets:** 44px minimum; the exceptions in 4.2 stay larger.
- **No dollar figure on a parent or athlete design** unless it is the explicit
  "prices released" state.
- **Session type never implies price** — no "tournament costs 2 tokens"
  affordances, no per-type pricing badges.
- **No invented data.** No coach names on sessions (none are assigned), no bay
  numbers, no made-up session names, no fixed timetable.
- **Placeholders are marked.** The portal's striped dashed box and the site's
  crimson TODO chip do the same job; pick one treatment and use it for
  anything unconfirmed.
- **Copy stays honest about consequences:** no self-service cancel on the day,
  revoked bookings not restored after reinstatement, waitlist holds a token.

---

## 7. What to deliver

1. **Token sheet**, in two distinct parts, because the code is in two states:
   **(a)** a one-to-one old → new mapping for the tokens that exist today in
   `tokens.js` — `color`, `tint`, `font` (families only), `glow`, `radius`,
   `BORDER_TOKEN`, `placeholder`. This part is what makes the build a
   find-and-replace. Ignore `BLOCKS`, `WEEKLY_SCHEDULE`, `SCHEDULE_DAYS`,
   `ROTATIONS` and `TOUCH_MIN` — they live in that file but they are product
   facts and touch rules, not visual tokens. **(b)** a *new* type scale and
   spacing scale, which do not exist as tokens at all today (both are inline
   literals on every screen). Deliver them as a proposal with the adoption cost
   named — see §7.1.
2. **Component sheet** in all states: button (primary / ghost / in-row /
   pinned / loading / disabled), field, numeric field, toggle, segmented
   control, chip and type chip, status badge, capacity pill, **token meter**
   (with the bonus-token line and the Elite no-number variant), **sequence
   ladder** (the payment retry escalation), **progress meter** (its three value
   bands and no-data), **day-grid cell and legend** (the contract month grid),
   **attendance control** (the 64×48 IN/OUT pair, marked and unmarked), session
   card, athlete row, ledger row, note card, sheet, toast, skeleton, error
   notice with retry, bottom tab bar (3-, 4- and 5-tab), header with back
   affordance.
3. **Tier 1 screens** at 390pt in every state, then Tier 2, then Tier 3, with
   Admin also at desktop width.
4. **Icon set** per 4.4 (6).
5. **The 4.4 decisions shown side by side** so the owner can choose.
6. A short **"what changed and why"** note per screen — restyle only; flag
   separately anything you think should change structurally.
7. **A copy pass, proposed and never applied silently.** The voice work in §3.5
   is an instruction to change words, and that cannot ride inside a restyle.
   Where you would reword, deliver a separate list: screen, element, current
   string, proposed string, reason. Any line stating a rule, a consequence or a
   number — cancellation, expiry, waitlist, standing, caps, capacity — is
   owner-approved wording from the contract and may not be changed without the
   owner saying so.

### 7.1 What each kind of change costs to build

Worth knowing before you propose: the portal is styled with ~1,150 inline React
style objects and one token file. Colour discipline is good (~850 token
references against ~45 stray hex values); type and spacing are literals
everywhere.

| Change | Cost |
|---|---|
| Palette, hairline colour, radii, glow, heading font family | **Cheap** — almost entirely `tokens.js`, plus five colours in `index.css`, a dozen font lines in two embedded calendar stylesheets, and the `#000` on-green button labels |
| Adding tokens that do not exist yet (type scale, spacing scale) | **Medium** — new tokens are easy; adopting them is the per-screen work below |
| Type scale, weights, spacing rhythm, layout, empty states, hover and pressed states | **Expensive** — every screen, because these are literals today |
| Icon set | **Medium** — one component each; the tab bar already carries the intended glyph name per tab |

So: a full restyle of colour, shape and elevation is realistic in one pass. A
new spacing and type system is a bigger commitment — propose it, price it
honestly, and rank it, rather than assuming it lands with the recolour.

**Sequencing.** Deliverable 5 — the §4.4 comparisons — comes first and alone:
one screen (the Billing hub) rendered each way, so the owner can settle the
font, canvas, glow and border questions before ~25 screens get drawn on top of
them. Screens start after that ruling. Anything still unanswered stays a marked
placeholder rather than blocking the next deliverable. Questions go to the
owner through the portal build team.

**Attach to the design project alongside this brief.** From the draft site, as
visual reference: `assets/css/ryp.css`; screenshots of home, programs, results,
team and registration at desktop and phone width; `img/logo-academy-white.png`
and `img/logo-academy-stack.png`. **From the portal — the thing being
restyled, without which deliverable 1 is impossible:**
`frontend/src/portal/tokens.js` (the literal input to the token mapping);
`frontend/src/portal/components/BottomTabBar.js`;
`docs/portal/design-handoff.md`; and **a full screenshot set of the
component-states harness** at 390pt — every component variant and every screen
state — plus the Admin dashboard at desktop width. A design team cannot map
"old → new" having never seen the old.

---

## 8. DO NOT IMPORT — where the draft site conflicts with the product

Every row below is something the draft website states that the portal's
contract contradicts or does not contain. None of it goes into a portal design.

| The draft site says | The product says | Do |
|---|---|---|
| Drop-in $65/hour, "first session free"; Traditional $250–$850/month for 4, 8 or 12 sessions; Elite $1,000; Year-Round Junior $500 | Packages are 6 / 12 / 16 sessions, Elite, and a single token; facility access is a separate add-on. Prices exist but are **withheld from parents** | No prices on parent/athlete designs. No "Traditional", "Drop-In" or "Year-Round Junior" products |
| Elite = four days a week, Mon–Thu, one hour a month with Yannick, by application | Elite = unlimited, one golf session a day, one Phil session a day, two Yannick sessions a month, facility access included, 45-day window | Use the product definition |
| "Unlimited makeup sessions within the billing cycle" | No makeup concept in the token model. Cancel until the day before and the token returns; bonus tokens only when the academy cancels or a waitlist is never promoted | Never write "makeup" |
| "Fitness included" in every track; "strength and speed work twice a week", built into the blocks | Phil's group PT is an ordinary bookable session and spends a token like any other type. Nothing is included free, and there is no weekly fitness quota | No "included" or "free" affordance on Phil's sessions, no "2× a week" line |
| Two programmes — "Winter Program" (three months, Nov–Feb) and "Year-Round Coaching" (twelve months); tuition "prorated to the day"; a membership that can be "paused" for winter | The portal has no programmes, no fixed term, no proration and no pause. A membership is a monthly package on the household's own Stripe cycle, and tokens expire hard at period end | No programme switcher, no "pause membership" row, no "prorated" copy |
| "Ages 7 to 18"; the prototype rejects a date of birth outside that range | The portal has no age eligibility rule and no age gate. Date of birth is collected only to derive a Tour bracket | No age range in registration copy, no age-validation error state on the date-of-birth field |
| 24-hour cancellation, and "inside 24 hours you may be charged" (simulator context) | Cancel **until the day before** and keep the token; day-of is not self-service. Simulator booking is not in the portal at all | Use the day-before rule |
| Booking opens 3 days ahead; monthly members "hold permanent scheduling rights" | Rolling window: 32 days, Elite 45, rolling at 7:00 AM Central. No recurring or permanent slots | Use the window |
| Fixed blocks 3 / 4 / 5 / 6 PM labelled Traditional / Elite U18 / Elite U13 / Adult; prototype gates hours by age group (13+ at 3 and 5, 12U at 4 and 6) | Sessions come from the owner's calendar and vary by day. Types are training, tournament, Phil group PT, Yannick 1-on-1. Booking is not gated by age group. Tour brackets are 10 & under / 11–13 / 14 & up, plus **Open** for an athlete with no date of birth — display only, and fixed at season start so nobody changes bracket mid-season | No fixed timetable, no age-gated cells |
| Capacities: golf 10, fitness 6, multisport 8, tournament 16 "placeholder", dodgeball 24 | Training 14, tournament 25, Phil 6, Yannick 1 | Use the product numbers |
| Waitlist capped at 5, then "waitlist closed"; availability written as "4 of 10 open" | No waitlist size limit; joining reserves a token, and promotion is automatic with no acceptance window. Availability reads **"N left"** or **"Full"** | No "x/5", no "waitlist closed", no "N of CAP open" |
| Activities: Golf / Fitness / Multisport; "Sandlot Membership" nightly dodgeball | Not products in the portal | Omit |
| Commitment Contract tiers 20 / 45 / **90** minutes | Portal tiers are 20 / 45 / **95** | Use the portal's; mismatch is logged for the owner |
| Card retried three times over ten days, *then* booking access pauses | New bookings are blocked as soon as the membership is past due; existing bookings are held through the retries; lapse revokes future bookings | Use the product rule |
| Points for training consistency and contracts; Titleist credit at 1 point = $1; academy handicap index; live leaderboard "published on the site" | The portal has RYP Tour standings: tournament points by finishing position. Rewards, redemption and handicaps are out of scope | Tour standings only |
| Debrief check-in chatbot, RYP-RED, F.O.R.G.E. tracking, Parallax licences, seminar "recordings available through the portal" | None are in the portal | Do not design surfaces for them or promise them |
| Camps, scholarships, gift cards, Frozen Open, simulator rental rules | Not in the portal | Omit |
| Season "begins November 3", opening hours, phone number, "roster capped" messaging | Not portal facts | Omit |
| Academy address: 6529 Cecilia Circle, **Edina**, MN | The portal's calendar invites currently say **Eden Prairie**, MN, as does the original handoff | Put no address in a design; mismatch is logged for the owner |
| Named staff, bios, results, honor roll | Marketing content. The portal reads staff from its own data. The only people the product names in UI are the two specialists: Phil (group PT) and Yannick (mental performance 1-on-1) | No other names in designs |
| Prototype sign-in: email + password only | Email + password **and** Google sign-in, plus password reset and a "not provisioned yet" screen | Keep the portal's flows |

Things the draft site says that **do** match the product, so there is no
conflict to worry about: parents see summaries rather than transcripts of
mental-performance work; one family account holds several athlete profiles;
sessions are 60 minutes; Stripe
retries three times over about ten days (what happens *after* each retry
differs — see the table); the tagline "Reach Your Potential". The single-token
price on the site happens to match the portal's figure, but it is still
unreleased and the product around it differs, so treat it as a conflict.

### 8.1 Vocabulary — the words the designs must use

Labels in a mockup become labels in the product. The left column is the
website's word; only the right column may appear in a design.

| The site's word | The product's word |
|---|---|
| Sessions per month, class reservation | **Tokens**, per **period** — "Uses 1 token · 7 left this period" |
| Billing cycle, month | **Period** (the household's own Stripe cycle) — "Tokens reset <date>" |
| Makeup | There is none. The academy-failure token is a **bonus token** — "1 bonus token, expires <date>" |
| Drop-In | **Single token** |
| Traditional 4 / 8 / 12 | **6 tokens / 12 tokens / 16 tokens** |
| Elite U13, Elite U18 | **Elite** — one package. "Unlimited · 24/7 access · books 45 days out", and no count for Elite |
| Traditional Class, golf session, class | **Training block** / **Tournament block**; specialist sessions are **Performance session** (Phil) and **Mental game session** (Yannick) |
| Saturday tournaments, points standings | **RYP Tour** — brackets 10 & under / 11–13 / 14 & up / Open |
| 12U, 13+, U13, U18 | Only the Tour brackets above, and they never gate a booking |
| "4 of 10 open", "waitlist 3/5", "waitlist closed" | **"N left"** / **"Full"** / **Join waitlist** with a position; no cap |
| Books 3 days ahead | **32 days** (Elite 45); a locked day reads "opens 7 AM on <date>" |
| 24-hour cancellation | "Cancel until the day before the session to keep your token." |
| 20 / 45 / 90 min | **20 / 45 / 95 min** |
| "Booking access paused after the retries" | Past due: "New bookings are paused until it clears; everything already booked is kept." Lapsed: "Upcoming bookings were released." Badges: **Active · Retry N of 3 · Past due · Restricted** |
| The Four Zones (Construction, Calibration, Transfer, Performance) | No portal equivalent — leave the zone map on the website (§4.3). A session is a **Training block** or **Tournament block**. The old "Workshop / Lab / Arena" rotation was an invented placeholder and **no rotation name ships** — do not letter session cards with one |
| Phil Herder, Director of Performance and Fitness | **Phil · Performance coaching** |
| Yannick Artigolle, Mental performance & life coach | **Yannick · Mental game** |
| A named coach on a session | No coach name on parent or athlete surfaces — none is assigned |

---

## 9. Known defects to fix while you are in there

These are real problems in the current UI, found while preparing this brief.
They are visual and interaction defects, so they are in scope for a restyle —
solve them in the new system rather than reproducing them.

1. **Text inputs have no focus state.** Every input sets `outline: 'none'`, and
   the one global focus rule covers only buttons and links. Keyboard users get
   nothing. The draft site's answer is good: a 2px green ring at 3px offset,
   plus a green field border on focus.
2. **Inline field errors are unreachable in registration.** The step's primary
   button disables while the step is invalid, so the code that would show the
   error never runs, and nothing validates on blur. Design the validation
   moment, not just the error style — the handoff's pattern (on blur, below
   the field) is the intent.
3. **Selected and recommended look identical.** In the package chooser the
   selected card and the emphasised card carry the same green border. Two
   different meanings need two different treatments.
4. **Package cards are nearly empty with prices hidden**, and repeat each
   other. This is the default state today, so it is the one that most needs
   design attention.
5. **Controls under the 44px floor.** Roughly ten interactive elements are
   below the minimum. Correct them in the new components rather than carrying
   them across.
6. **Staff lose their tab bar on the Tour screen**, and a few surfaces have no
   route in and out (the athlete Settings link, the season schedule, the
   capture picker). Flag anything structural you hit; do not silently redesign
   the navigation.
7. **Stale copy** survives in the onboarding walkthrough describing the retired
   two-pool model. Any copy you touch should match the token model in §1.

---

## 10. Open questions (for the owner — the designer should not guess)

1. **Address:** Edina (draft site) or Eden Prairie (portal calendar invites and
   handoff)? Logged in `DECISION-GAPS.md`, Sprint 19.
2. **Commitment Contract top tier:** 90 minutes (draft site) or 95 (portal)?
   Logged in `DECISION-GAPS.md`, Sprint 19.
3. **The 4.4 decisions:** font change, canvas colour, glow, border token.
4. **When prices release** — this decides which state of the Billing hub,
   Membership and Registration ships first.
5. **Does the website redesign ship?** If Luke's direction changes, the portal
   should follow the site's final system, not this draft. The token mapping in
   deliverable 1 is what makes that cheap.

---

## 11. Reference index

Draft website (look and tone only): `assets/css/ryp.css` — the whole system,
with Luke's reasoning in the comments · `index.html` — hero, ledgers, note and
commitment panels, staff grid · `programs.html` — tier cards, terms lists,
tables · `results.html` — datum numerals, season ledger · `team.html` — label
rail + people grid · `faq.html` — accordion · `philosophy.html` — interactive
diagram and stat panels · `registration.html` + `assets/js/registration.js` —
the app-like prototype · `img/logo-academy-white.png`,
`img/logo-academy-stack.png`.

Portal (facts): `docs/portal/tokens-and-billing-contract.md` — policy ·
`docs/portal/SPRINT-12-PINS.md` — the token model and the owner's amendments ·
`docs/portal/DATA-MODEL.md` · `docs/portal/design-handoff.md` — the original
screen-by-screen spec, state lists and touch targets ·
`docs/portal/DECISION-GAPS.md` · `frontend/src/portal/tokens.js` ·
`frontend/src/portal/components/BottomTabBar.js` ·
`frontend/src/portal/PortalRoutes.js` · `frontend/src/portal/StatesHarness.js`.
