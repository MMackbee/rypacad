Read `docs/portal/handoff-r3-update.md` first. You built the portal scaffold
against revision 2 of the design handoff, which said tier names, count and
prices were undecided. They're decided now, and that update note is the delta.

Two new files are already in the tree and are the source of truth for what they
cover — don't re-derive them:
- `frontend/src/portal/data/packages.js` — the confirmed 26/27 price list, the
  two-pool allowance helpers, and the Elite tiers
- `frontend/src/portal/data/schedule.js` — `generateSeason()` and the capacity
  helpers, replacing the static sessions in `seed.js`

Run `git status` before you start. Those two files plus the update note are
untracked additions from outside your session.

Work in this order, one commit per step:

**1. Two-pool allowances — do this before building any more screens.**
`seed.js` has `TIER_RULE = { used: 3, limit: 8 }` and the copy says "3 OF 8
BOOKINGS USED". That models one booking pool. Every package sells *training +
tournaments* as two allowances that don't substitute for each other — an athlete
can have training left with no tournaments remaining. Use `makeAllowance()` and
`poolFor()` from `packages.js`. Update Book a Session (show which pool a slot
spends before the athlete commits, and make "limit reached" pool-specific),
My Schedule, and Parent Dashboard. Every screen built on the one-pool assumption
before this lands is a screen that gets reworked.

**2. Wire `packages.js` into Registration step 3.**
Delete the `TIERS NOT DECIDED` caution banner, the dashed `$ ——` price slots,
and the "TIER SLOT — rendered from data" marker. Rendering from data was right
and stays — it's the banner and the empty slots that are now wrong on screen.
Registration needs golf package + optional fitness add-on as stacking
selections, with a running monthly total; Elite is a separate choice that
replaces both. Leave `philSessions` and `yannickSessions` rendering as null —
those counts genuinely aren't set. Do not invent them.

**3. Delete the 2025 surface in one commit.**
The delete list is in §4 of the update note. Delete the six dead files whole
rather than editing them down, and unroute the superseded pages. `/programs` is
live right now serving programs that no longer exist at prices that were never
26/27 pricing — that one matters most.

Do not touch `services/` or `functions/index.js`. The Twilio and Courier wiring
is the strongest salvage in the repo and it's staying.

**4. Wire `schedule.js` into Book a Session and the coach Roster.**
`generateSeason()` produces dated sessions from the weekly pattern plus a
closure list. The holiday calendar isn't final, so take closures as a parameter
rather than hardcoding dates. Two values in that file are marked OPEN — Saturday
block start times and `CAPACITY.tournament` — leave them as written and flagged.

**5. Then the nine Phase 1 screens not yet built:**
Athlete Dashboard, Practice DNA, Commitment Contract, Athlete Detail, Billing,
Notification Preferences, Admin Dashboard, Staff & Roles, Newsletter Composer.

Constraints:
- Scheduling is the critical path — Uschedule and SignupGenius are being retired
  and nothing else covers booking. Prioritise accordingly.
- Keep the `useSeedResource` hook seam. It's the right shape and it's how seed
  data gets swapped for the real API later without touching screens.
- `docs/portal/design-handoff.md` still says "3–7 PM" in two places (screen 02's
  success step, screen 12's flow caption). Three one-hour blocks from 3:00 end at
  6:00. `tokens.js` already derives around this; the doc is what's stale.
