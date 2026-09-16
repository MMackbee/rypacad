# Decision gaps

Open questions and stale premises surfaced while building the token model
(Sprint 12, contract v2.0). Each entry says what is unresolved, what the code
does in the meantime, and who decides. Resolved entries move to the sprint's
integration notes in `TEAM.md`; nothing here is resolved by guessing.

## Owner rulings needed (from the Sprint 12 pin, "Open")

1. **Package prices** — pending Luke. Catalogue prices carry `pending: true`
   and the UI renders "pending" beside them; seeds carry no prices; prod gets
   them only through the user-gated provisioner run.
2. **Saturday 10–12 / 12–2** — two 60-minute sessions or one 2-hour event
   each. The generator produces four 60-minute blocks (10, 11 tournament;
   12, 1 training) and says so in a comment; the calendar sync follows
   whatever the owner titles.
3. **Yannick daytime 1:1 attendee** — athlete (built) or parent (not
   built). Part 1 pins the athlete-attended model; the parent-as-attendee
   shape (guardian attends, a named child's token is spent) is not built.
4. **`SPECIALIST_MONTHLY_CAP.mental`** — 1 per calendar month as pinned, or
   a different cadence. It is a frequency knob, not a pool.
5. **`single`** — a period package (as seeded) or a per-visit sale. Stripe
   sprint question; the catalogue entry costs nothing now.
6. **Waitlist acceptance window** — none in v1 (auto-confirm). Revisit if
   promotion into an unwanted slot becomes a support pattern.

## Stale premises in the Sept 15 handoff (checked against the tree)

- **`firestore.rules.r3`** (Aug 27) is a draft for a data model this app
  never adopted — custom-claim roles, `allowances`, `billing`, `staff`,
  `mentalGame`, `fitnessLogs`. Putting it live would regress every rules
  branch from Sprints 6–11. The token model's rules principle (clients never
  write token ledgers; sessions/bookings writes stay the narrow transaction
  diffs) is implemented inside the current `firestore.rules` instead.
  `NEXT-PROMPT.md` now records the file as dead.
- **`allowances/{athleteId}_{YYYY-MM}`** never existed here — allowances
  were always derived from bookings. The migration in contract §15 reduces
  to: bookings gain `periodKey`, `pool` is retired, `fitnessPackageId` is
  dropped, capacity stays 15.
- **`services/familyService.js` / `calculatePackageCost`** — not in the
  tree (`frontend/src/services/` holds only `userSetupService.js`). Nothing
  to delete.
- **"Elite no-show tracker (already built)"** — there is no separate
  tracker; the `noshow` booking status plus Admin's "No-shows this month"
  query are the mechanism, and Sprint 12 adds a per-athlete count to it.
- **`sessions.bookedCount` / `athlete.userId` / `athlete.guardianIds` /
  `bookedBy`** in the contract's pseudocode map to `sessions.booked`,
  `users.athleteId`, `users.householdId` ⇄ `athletes.householdId`, and
  `bookings.createdBy` here. Names in the code stay as they are.

## Functions

- ~~Lint blocks any functions deploy.~~ Resolved in Sprint 13: the quotes
  rule now matches the file's single-quote convention, `linebreak-style`
  is off (CRLF working tree), and `npm --prefix functions run lint` passes.
- **The kept 2025 triggers run on the v1 API by explicit import.** In
  firebase-functions v6 `require('firebase-functions')` resolves to v2,
  where `functions.firestore.document` and `functions.pubsub.schedule` do
  not exist — nothing in `functions/` was loadable before Sprint 13. The
  fix is `require('firebase-functions/v1')`; migrating the kept triggers to
  v2 is a deliberate separate change, not something to do in passing.
- **Stripe billing cycles anchored on the 29th–31st map to the 28th.** The
  app's periods are anchor-day based and clamp to 1–28, so an invoice
  whose period starts on Jan 31 issues `tokenPeriods/{athlete}_2026-01-28`
  (the only id a hook can look up). Contract call: accept the clamp, or
  require Stripe subscriptions to bill on the 1st–28th.
- **Promotion notifications are email-only unless users carry a phone.**
  The `users` table documents no phone field; `notify.js` reads
  `phoneNumber` or `phone` when present and otherwise sends email only
  through Courier. Decide whether provisioning should capture a guardian
  phone on the users doc (households.guardian.phone exists today).
- **`stripeEvents.outcome == 'processing'`** on a record means a follow-up
  phase (revocation or downgrade trimming) crashed after the event was
  recorded — the daily export should flag those for a manual re-run.
- **`handleSMSResponse` confirms and cancels nothing** (unchanged): a
  YES/NO reply needs a phone → athlete mapping the data model lacks.
- **`onSessionUpdateNotifyWaitlist` is gone** — replaced by the
  `onSessionBookedDecrease` promotion trigger, which treats an absent
  `sessions.status` as `'scheduled'` (generator-written sessions carry no
  status; calendar-synced ones do).
- **`handleSMSResponse` confirms and cancels nothing.** The YES/NO handlers
  are the 2025 stubs; the webhook now verifies Twilio's signature and
  answers the sender, and that is all. Wiring a reply to a real booking
  transition is a Part 2 decision (and needs a phone → athlete mapping the
  data model does not have).
- **`onSessionUpdateNotifyWaitlist` never fires.** It still reads the 2025
  `participants` / `waitlist` arrays; Part 2 rewrites it as the promotion
  trigger on `sessions.booked` decreasing.
- **`sendDailyReminders` was deleted, not fixed.** It read `participants`
  and called an HTTP export as a function. Session reminders, if wanted,
  are a Courier job over `bookings` in Part 2.
