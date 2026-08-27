# Handoff update — revision 3

The scaffold in `frontend/src/portal/` was built against **revision 2** of the
design handoff, which said tier names, count and prices were undecided. They are
decided. This note is the delta. Nothing already built is wasted — the screens,
the hook seam and the token derivation all hold. What changes is the data model
underneath the tiers, and the amount of 2025 code still in the tree.

---

## 1. Pricing is confirmed

New file: `frontend/src/portal/data/packages.js`. It replaces the placeholder
`TIERS` in `seed.js`.

| Golf package | $/mo | Training | Tournaments |
|---|---|---|---|
| 4 + 2 | 260 | 4 | 2 |
| 8 + 3 | 440 | 8 | 3 |
| 12 + 4 | 600 | 12 | 4 |
| 16 + 4 | 740 | 16 | 4 |
| Drop-in | 65 | 1 | — |

Fitness add-on, bought separately: $120 / $200 / $240 / $260 for 4 / 8 / 12 / 16.
Elite at $1,000 and $1,250, replacing golf + fitness rather than stacking.

**Remove from Registration step 3:**
- the `TIERS NOT DECIDED` caution banner (yellow, `rgba(244,238,25,.07)`)
- the dashed `$ ——` price slots
- the "TIER SLOT — rendered from data" marker

Rendering from data was right and should stay. The banner and the empty price
slots were correct under rev 2 and are now wrong on screen.

Two blanks remain **inside** Elite: the Phil and Yannick session counts, and
whether 24/7 facility access is workable. Keep those rendering from data — they
are `null` in `packages.js` on purpose. Don't invent counts.

---

## 2. Allowances are two pools, not one — the deep change

`seed.js` has `TIER_RULE = { used: 3, limit: 8 }`, and the copy throughout says
"3 OF 8 BOOKINGS USED". That models a single booking pool. Every package is sold
as *training + tournaments*, and those do not substitute for each other. An
athlete can have training sessions left with no tournament entries remaining.

This touches:
- **Book a Session** — show which pool a slot spends *before* the athlete
  commits. "Tier limit reached" becomes pool-specific.
- **My Schedule / Athlete Dashboard** — remaining balance is two numbers.
- **Parent Dashboard** — per-child balances are two numbers each.
- **Data model** — `makeAllowance()` and `poolFor()` in `packages.js`.

Cheaper now than after the screens are wired. This is the single change most
worth doing before more screens get built on the one-pool assumption.

---

## 3. The season schedule

New file: `frontend/src/portal/data/schedule.js`. `generateSeason()` produces
every dated session from the weekly pattern plus a closure list — 263 sessions
for a 17-week season. `capacitySummary()` and `demandSummary()` check an
enrollment plan against what the schedule can actually hold.

Weekday: three afternoon blocks, 3:00 / 4:00 / 5:00 PM, Monday–Thursday. The
6–7 PM adult block and the old 7–9 PM window are both gone with adult
programming. Friday is overflow, off by default. Saturday is four blocks
alternating training, tournament, training, tournament — training first.

Two things in that file are marked OPEN and should not be treated as settled:
Saturday block start times, and tournament block capacity. The second one
matters: at 14 per block the schedule serves ~121 tournament entries a month
while the packages promise 2–4 each. Raising `CAPACITY.tournament` is how you
see what a larger tournament format buys.

Note `docs/portal/design-handoff.md` still says "3–7 PM" in two places (screen
02's success step, screen 12's flow caption). `tokens.js` already derives around
this correctly — the doc is what's stale.

---

## 4. Delete the 2025 surface

`portal/` is 4,725 lines. The 2025 build still in the tree is ~19,700 across
`pages/`, `components/` and `services/` — four times the size of the thing being
built, running on a pricing model that no longer exists.

`/programs` is a **live route** today serving Starter / Developer / Elite /
Champion at $200 / $380 / $540 / $680. Those programs don't exist and those
prices were never 26/27 pricing.

Dead already — nothing imports them:

| File | Lines |
|---|---|
| `pages/ParentDashboardPage.js` | 936 |
| `pages/PackageBuilderPage.js` | 809 |
| `components/EnhancedBookingSystem.js` | 765 |
| `components/AccountSetupModal.js` | 434 |
| `components/SessionView.js` | 234 |
| `pages/HomePage.js` | 215 |

Live but superseded by a portal screen — remove with the route:
`ProgramListPage`, `ProgramDetailPage`, `BookingPage`, `MyBookingsPage`,
`RegistrationPage`, `DashboardPage`, `CoachDashboardPage`, `ParentDashboard`.

Worth keeping for now: `LoginPage` until portal SignIn is wired to real auth,
`UnauthorizedPage`, `ProfilePage`, `AdminWaitlistPage`, and everything in
`services/` — `smsService`, `familyService` and the Courier/Twilio wiring in
`functions/index.js` are the strongest salvage in the repo.

Suggested: one commit that deletes the dead files and unroutes the superseded
ones, rather than pruning page by page. Today's pass was 443 deletions against
18 insertions — right direction, but the files should go whole rather than get
edited down.

---

## 5. Suggested order

1. Two-pool allowance model (§2) — before more screens assume one pool
2. Wire `packages.js` into Registration, remove the caution banner (§1)
3. Delete the 2025 surface in one commit (§4)
4. Wire `schedule.js` into Book a Session and the coach Roster (§3)
5. Then the nine Phase 1 screens not yet built

Nine remain: Athlete Dashboard, Practice DNA, Commitment Contract, Athlete
Detail, Billing, Notification Preferences, Admin Dashboard, Staff & Roles,
Newsletter Composer.
