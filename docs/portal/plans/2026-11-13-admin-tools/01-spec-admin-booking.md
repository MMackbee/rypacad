# Staff booking tools: add, move and cancel for any athlete (owner 2026-11-13) - spec

Owner request 2026-11-13: "i still need the ability to add kids to sessions, move them from sessions, and cancel sessions for them from my panel. We need to start giving the admin true admin functions."
The owner picked approach C and approved the calls in section 2 ("C, your calls are fine, go ahead").

- Base: develop 770acb5. Functions on production are c638528, and `git diff c638528..770acb5 -- functions firestore.rules` is empty, so develop's functions are production's.
- Sister doc: `00-spec-small.md` (Yannick's contract, Outstanding card).
- Status: design only. Nothing is built.

Anything marked *builder's call (Claude)* was decided by Claude while writing this doc, not by the owner. A builder may revisit those calls; everything else is settled.

## 1. Why

Since 2026-11-12, staff can cancel one athlete's booking from the Billing staff view. They still cannot add an athlete to a session or move one.

- A free session for an unpaid athlete needs a terminal script the owner runs (`scripts/comp-booking.mjs`).
- The roster, where the owner stands when a kid walks in or switches days, offers only "Cancel session".

So every add or move ends up in the owner's inbox or in a script.

**Success:** the owner or ops adds, moves or cancels any athlete's portal booking from the panel in under a minute, with no script. The family's tokens, seat counts, emails and lists stay exactly right.

## 2. Decided by the owner (2026-11-13)

1. **Approach C: both entry styles, one shared set of sheets.**
   - **(A) "Manage bookings" on the Admin screen** (`/portal/admin`, `screens/AdminDashboard.js`).
     - Search an athlete by name.
     - That athlete's screen lists this billing period's and next period's bookings, each with **Move** and **Cancel**.
     - It also has **Book a session**: pick a day, then a session with seats left, then token or Free, then confirm.
   - **(B) Buttons where the information already lives:**
     - On the session roster (`/portal/attendance`, `SessionAttendance` in `screens/Roster.js`): **Add athlete** next to Cancel session, and **Move** + **Cancel** on each athlete's row.
     - On the family's staff Billing view (`/portal/admin/households/:householdId`, `screens/Billing.js` / `components/TokenMeter.js`): **Book a session** per athlete, and **Move** next to the existing staff Cancel. Next-period rows get the same actions.
2. **What an add costs.**
   - An add uses one of the athlete's tokens by default, in the same charge order as a family booking: grace first, then the period (`lib.chargeFor` / `lib.tokensPosition`).
   - A **Free** switch writes `comp: true`. A Free booking never counts as spent.
   - Unpaid athletes can only be added Free. Unpaid means billing not active, or the membership does not allow booking.
   - When no tokens are left, the sheet says so and offers Free.
3. **Overfill.** Staff may overfill a full session after the confirm "This session is full (14 of 14) - add anyway?".
4. **Past sessions and the window.**
   - Staff may add or move into today's or past sessions within the **current open billing period**. Earlier periods are refused, by the same "period over" rule as `staffCancelBooking` (`functions/portal/staff-cancel-decide.js:135`).
   - Staff may also add or move into future sessions beyond the family booking window.
5. **Skipped limits.** Staff actions skip the booking window, the handicap-only Tuesday block (`reservedOk`) and Elite's one-a-day limit. Each skip shows a warning line in the sheet.
6. **Emails.**
   - An add sends the family the usual "Session booked" email.
   - A move sends the usual move email: the new booking's "Session booked".
   - A staff cancel stays silent, as today.
7. **Who and what.** Owner and ops both. Yannick's mental 1:1s (Calendly, type `mental`) are excluded from add, move and cancel.

## 3. Goals

1. The owner or ops can add any non-test athlete to any portal session in the current period or later. A token is used, or the booking is Free. Full sessions are allowed after a confirm.
2. The owner or ops can move any of an athlete's confirmed or no-show bookings in the current period or later to another session of the same kind, in one server step.
3. The owner or ops can cancel from all three places. This is the existing `staffCancelBooking` and its sheet, reused unchanged in behaviour.
4. All three entry points open the same sheets with the same words.
5. Every charge, seat count and email is decided on the server, in one transaction, the same way a family booking, move or promotion is decided.

## 4. Non-goals

- **Money.** No refunds, no Stripe, no new tokens minted. Free mints nothing; it just spends nothing.
- **Families.** No family-facing UI change. Family screens, family copy and the rules stay as they are. A staff-made booking shows in the family's lists like any other booking.
- **Yannick.** No Calendly, no mental 1:1s.
- **Batch work.** No bulk add, no Repeat weekly for staff, no adding siblings in one call (one add per athlete). *Builder's call (Claude).*
- **Attendance.** No "add as attended". Attendance is marked on the roster as usual. *Builder's call (Claude).*
- **Sessions.** No capacity editing, no un-hiding sessions, no waitlist rule changes.
- **Audit.** No audit screen. The booking document (`createdBy`, `createdVia`) and the function log line are the record.
- **Rules.** No `firestore.rules` change.

## 5. Anti-goals and what prevents each

| Anti-goal | What prevents it |
|---|---|
| **Double-charging a token** | The charge is decided only on the server, in one transaction. That transaction reads the period's bookings, the grace spends of any period and the waitlist holds (`lib.tokensPosition`, as `waitlist-order.js` and `move-decide.js` do). The doc id `{athleteId}_{sessionId}` turns a second add of the same athlete into the refusal `already-booked`, so a retry after a lost answer is refused, never doubled. Free writes `comp: true`. The token counters skip it (`lib.js:256-257`, `data/packages.js:341`, `hooks/live.js:720-722`). One place did not: the downgrade trim. `revoke.js:214` `futurePeriodBookings` skipped only cancelled and grace rows, so a Free next-period add could push a paid booking out on a downgrade. This change makes it skip `comp` too (section 9.6; builder check 2026-11-13). A staff move gives the old row back exactly once: `decideMove`'s `notOld` filter (`move-decide.js:242-243`, `:259-261`) leaves the old row out of the position before `moveCharge` (`:108-127`). The staff path reuses that same position build, never `moveCharge` alone. |
| **A seat counter drifting** | The booking and the counter are written in the same transaction. An add writes `booked = max(live roster, counter) + 1`, which also heals a counter that reads low (the `promotion.js:168` formula). A cancel or a move-out writes `counter - 1`, floored at 0. No increment sentinels are used. Overfill pushes `booked` above `capacity` on purpose. Promotion stays off until `booked < capacity` (`promotion.js:306-315`), and a family's +1 is refused above capacity (`firestore.rules:1259-1282`). |
| **A family left with a booking they can't see** | `householdId` always comes from the athlete doc, never from the request. `date` and `type` come from the session, and `periodKey` from the household's anchor day. An athlete with no household is refused. The status is `confirmed`. The family sees it under Reservations or My Schedule (today on) and on Billing (this and next period). |
| **Staff silently booking a test athlete onto a real session** | The server refuses with `test-athlete` when the athlete or the household has `test: true`. That is the same line the rules draw (`firestore.rules:85-86`) and `move-decide.js:197` draws. The client labels test athletes "Test" and offers no Book button for them. |
| A half-done move | One transaction, as today (`move.js:208-225`). |
| Two emails for one action | One notice per add or move, and a staff cancel stays silent (section 9.5). |

## 6. Constraints

- **Rules.**
  - None needed. Every write is a callable using the Admin SDK.
  - Staff already read every booking, session, athlete, household, waitlist entry, grace token and token period.
  - If a rules change ever becomes necessary, it must be additive only: new branches or values, and no existing clause narrowed.
- **Staging is production data.** Staging (`rypacad.ryptest.com`, built from develop) runs on the **production** database. Anything clicked there books a real seat on a real session. Test athletes cannot book, so the hands-on check runs on the local emulator (section 14).
- **The live client during release.**
  - Functions deploy before the app.
  - The live family app calls `moveBooking({bookingId, toSessionId})` and must see no change.
  - Staff mode is chosen by the caller's role (`users/{uid}.role`), never by a request flag.
  - Response fields are additive only.
- **File size.** Files stay under 500 lines.
  - Already over the limit (touch only where a mount point is needed): `screens/Roster.js` (973), `PortalRoutes.js` (1166), `hooks/index.js` (4000+).
  - At the limit: `functions/portal/lib.js` (497) and `hooks/billing.js` (499) get **no net lines**.
  - Close to it: `components/TokenMeter.js` (481), `data/billingHub.js` (477), `functions/index.js` (482).
  - New code goes in new files.
- **CRLF.** Repo files are CRLF. Edit through a node normalize/restore, never `sed -i`.
- **Public repo.** Fixture names only (Jordan, Riley, Casey) in code, tests and commits.
- **Copy rules.** "Tour event", never "tournament", in user-facing copy. Elite copy never mentions tokens. Free copy never promises a token back.
- **Deploys.**
  - Functions: the owner runs the `npx firebase-tools` command.
  - App: push develop for staging, then the owner pushes `develop:main`.
  - Claude never deploys and never pushes main.

## 7. Approaches considered

**Where the tools live:**
- **A. Admin search only.** One place, but from the roster you would have to leave the screen and search.
- **B. Buttons in context only.** There would be no way to put an athlete on a session that isn't on a roster you have open, short of opening the family's billing.
- **C. Both, sharing one set of sheets.** **The owner picked C** (2026-11-13).

**How the server does it:**
- **S1. Staff client writes under new rules branches.** Rejected: rules cannot run the charge order, grace spends across periods, waitlist holds or the overfill confirm. It would also mean a rules deploy on a backend shared with real families.
- **S2. A new callable `staffBookSession`, a staff mode inside `moveBooking`, and `staffCancelBooking` reused (chosen).** Each action reuses the transaction and charge code that already exists for it. *Builder's call (Claude), inside the owner's approved approach.*
- **S3. One `staffBooking` callable with `action: add | move | cancel`.** Rejected: it would fork `moveBooking`'s charge and transaction code, or duplicate it, and staff cancel is already live.

## 8. What exists today (recon, develop 770acb5)

- **`staffCancelBooking`**
  - Handler: `functions/portal/staff-cancel.js:129-148`. Reads, decides, then writes `cancelReason: 'staff'` (`:104`) and lowers `booked`, floored (`:117`). Silent (header `:20-28`).
  - Decide: `staff-cancel-decide.js`.
    - Roles: `STAFF_ROLES` owner/ops (`:40`).
    - Statuses: `CANCELLABLE` confirmed/noshow (`:42`).
    - `bookingRefusal` (`:126-138`): `period-over` when `periodFor(date, anchor).periodEnd < today` (`:135`). There is no before-start check.
    - `tokenBack` (`:114-116`).
  - Client:
    - `data/staffCancel.js`: `staffCancellable` (`:49-55`), and `siblingsFor` (`:68-79`), which reads only `m.spent` (this period).
    - `hooks/staffCancel.js:33-47`.
    - `components/StaffCancelSheet.js`.
    - `screens/Billing.js:85-91` and `:180`.
    - `components/TokenMeter.js`: `RowCancel` (`:85-106`) and `Evidence` (`:155-217`). Evidence lists this period's rows only; the next period is a count line (`:183-199`).
- **`moveBooking`**
  - `functions/portal/move.js`: loads everything in one transaction (`:87-126`), writes (`:138-187`), handler `:197-226`.
  - `move-decide.js`:
    - `ownsBooking` is family-only (`:136-143`).
    - Refuses a started old session (`:162`), a past target (`:178`), outside the window (`:179`), a test athlete (`:197`), membership (`:198`), not open yet (`:201`), the handicap block (`:202-206`) and full (`:207`).
    - Elite's one-a-day check: `:244`. Charge rules (a)-(d): `:108-127`. A comp stays free: `:252-255`.
  - `sendMoveReconfirm`, keyed `{id}_move_{createdAt ms}` (`move.js:241-269`, key `:262`).
  - Client: `hooks/move.js` `loadMoveOptions` is household-scoped (`:64-67`) and limited to the family window plus `moveTargetOpen` (`:94-95`).
- **Family booking create rules.**
  - `firestore.rules:1565-1583`: only the athlete or a household parent may create. There is no staff branch.
  - Shape: `:1406-1432`, where `createdVia` admits only `'repeat'` (`:1429`).
  - Test athletes never book: `:85-86`. Handicap block: `reservedOk` `:205-208`. Window: `:1534-1542`.
  - Staff never move a counter from a client: `bookedMoverOk` `:1316-1321`.
- **`scripts/comp-booking.mjs`**
  - Refusals `:79-93`: pending athletes only; no full, past, hidden or reserved sessions.
  - Writes `createdBy: 'staff'`, `comp: true` (`:101-124`).
  - **Bug** (`:104-110`): re-confirming a cancelled row updates only `status`, `chargedFrom`, `comp` (plus `rebookedAt`). These stay behind: `cancelledBy`, `cancelReason`, `cancelCategory`, `cancelNote`, `cancelledAt`, `movedTo` and **`graceTokenId`**.
  - With a stale `graceTokenId` the row is not a free comp (`move-decide.js:94-97`), and it consumes that grace token again (`lib.js:260-261`).
- **Emails.**
  - `notify-gates.js:26-33` `shouldNoticeBookingCreated` skips only promoted, `createdBy: 'system'` and `createdVia: 'repeat'`. A `createdVia: 'staff'` row already passes.
  - `:119-126` `shouldNoticeMoveReconfirm` accepts `createdVia: 'move'` only.
  - `functions/index.js`:
    - `onBookingCreated` `:232-268`.
    - `onBookingCancelled`: its re-confirm branch is `:289-292`, and it sends cancel receipts only for `'member'` / `'session-cancelled'` (`:304`).
  - Copy: `notices.js:135-143` `bookingConfirmed`, which ends with `CANCEL_OR_MOVE` (`:38-39`).
- **Promotion.** No same-day or past promotion (`promotion.js:157`). `taken = max(live, booked)` (`:168`). `seatOpened` needs `booked < capacity` (`:306-315`).
- **Single-token guard.** `single-guard.js:40-45` checks every confirmed spend of a `single_` token, including Admin SDK writes.
- **Roster.**
  - `SessionAttendance` (`screens/Roster.js:246`). Cancel session for ops/owner: `:467`, `:531-540`. Greyed cancelled/moved rows: `:717`.
  - Rows come from `hooks/index.js:3950-3972`. Each row has only `bookingId, athleteId, name, attendee, status, noshowReason`.
- **Admin.**
  - Cards: `AdminDashboard.js:162-173`.
  - Directory: `hooks/billing.js:256-273`. Each athlete has `{id, name, packageName}`; each household has `test`.
- **Billing hub.** `data/billingHub.js:115-160` `periodRows` (no `type` field). This and next period's rows: `:199-200`. Next period as counts only: `:262-272`.

## 9. Server design

### 9.1 `staffBookSession` (new callable)

**Files:**
- `functions/portal/staff-book-decide.js` (pure)
- `functions/portal/staff-book.js` (the callable)
- `functions/portal/staff-book.test.js`
- Exported from `functions/index.js`, with `runWith({secrets: []})`. The callable sends no notice itself; the booking triggers do.

**Request:** `{athleteId: string, sessionId: string, free?: boolean, allowFull?: boolean}`.
- Ids must pass `goodId`: 1..200 characters, no `/`, not `.`, `..` or `__x__`. Reuse the one in `staff-cancel-decide.js`.
- `free` and `allowFull` are absent or boolean.
- Anything else is `bad-request`.

**Reads.** All in one transaction, all before any write:
1. `users/{uid}`. A caller who is not owner or ops reads nothing more.
2. `athletes/{athleteId}`.
3. `households/{athlete.householdId}`.
4. `packages/{athlete.packageId}`.
5. `sessions/{sessionId}`.
6. `bookings/{athleteId}_{sessionId}`.
7. The live roster count: `bookings where sessionId ==`.

If the session exists, also, as `move.js:113-124` does:
- `tokenPeriods/{athleteId}_{periodKey}`;
- `lib.periodBookingsQuery` for the session's period;
- the athlete's `waitlist` entries;
- the athlete's `graceTokens`;
- the grace spends (`lib.graceSpendQueries`).

*Builder's call (Claude):* put the shared token-input read in a small `functions/portal/booking-reads.js` that both callables use, if that keeps `move.js` simpler. Otherwise copy it.

**Decision order.** The first failing check wins. `PRE` is `failed-precondition`.

| # | reason | code | when |
|---|---|---|---|
| 1 | `signed-out` | unauthenticated | no auth |
| 2 | `bad-request` | invalid-argument | request shape |
| 3 | `not-staff` | permission-denied | role is not `owner` or `ops` |
| 4 | `athlete-missing` | not-found | no athlete doc |
| 5 | `no-household` | PRE | athlete has no `householdId`, or the household doc is missing |
| 6 | `test-athlete` | PRE | `athlete.test === true` or `household.test === true` |
| 7 | `session-missing` | PRE | no session doc, or no `date` |
| 8 | `calendly` | PRE | `session.type === 'mental'`, `session.source === 'calendly'` or `session.unresolved === true` |
| 9 | `session-cancelled` | PRE | `status === 'cancelled'` (absent status means scheduled) |
| 10 | `session-hidden` | PRE | `hidden === true` (*builder's call (Claude)*: the block is off the schedule and off staff lists, so nobody runs it; un-hide it first, as `comp-booking.mjs` requires today) |
| 11 | `display-only` | PRE | `bookable === false` |
| 12 | `period-over` | PRE | `lib.periodFor(session.date, household.periodAnchorDay).periodEnd < todayISO(now)` |
| 13 | `already-booked` | PRE | the `{athleteId}_{sessionId}` row exists and is not `cancelled` (confirmed, attended or noshow) |
| 14 | `not-paid` | PRE | `!free` and (`!pkg` or `!lib.membershipAllowsBooking(household, athlete)`) |
| 15 | `no-session-token` / `no-tokens-left` | PRE | `!free` and `lib.chargeFor` finds nothing; `no-session-token` when `position.perPurchase` |
| 16 | `full` | PRE | `!allowFull` and `taken >= capacity`, where `taken = max(live, Number(session.booked) or 0)`. Details `{reason, taken, capacity}` |

`full` is checked last on purpose. That way the overfill question is always the last confirm before anything commits.

**Skipped, reported as `overrides`** (never refusals):
- `started`: `sessionStarted(session, now)`.
- `outside-window`: `session.date > gates.openThrough(now, gates.windowMonthsFor(pkg))`.
- `handicap-reserved`: `maxHandicap` set and the athlete is not under it.
- `one-per-day`: `gates.eliteDailyCapHit`.
- `full`: only when `allowFull` was sent.

`lib.bookingOpen` is skipped silently; its date has passed.

**Charge:**
- **Free** writes `chargedFrom: 'period'`, `graceTokenId: null`, `comp: true`. No token is read as spent, whatever the package. On Elite the client hides the switch (section 10.5), but the server still accepts `free`.
- **Otherwise** the position is built exactly as `move-decide.js:259-272` builds it:
  - Period rows plus grace spends, de-duplicated.
  - The waitlist entries with their period keys.
  - `ignoreWaitlistIds` set to this session's entry, if the athlete waits on it.
  - Then `lib.chargeFor({position, sessionDate: session.date})`, which gives:
    - `elite`, when the package is unlimited;
    - `grace` with the soonest-expiring token still valid on the session date;
    - `period`, when `left > 0`.
  - The period is the **session's** period. A next-period add spends a next-period token: its issued `tokenPeriods` doc, or the package fallback.

**Writes.** Buffered after every read, in the same transaction.

1. `bookings/{athleteId}_{sessionId}`. Use `tx.create` when the doc does not exist. Use a whole-document `tx.set` when a **cancelled** row exists.
   ```
   athleteId, sessionId,
   householdId:  athlete.householdId,
   date:         session.date,
   type:         session.type,
   status:       'confirmed',
   periodKey:    lib.periodFor(session.date, household.periodAnchorDay).periodKey,
   chargedFrom:  'elite' | 'grace' | 'period'    ('period' when free)
   graceTokenId: <graceTokens id> | null         (null unless 'grace')
   createdBy:    <staff uid>
   createdVia:   'staff'
   createdAt:    serverTimestamp()
   comp:         true                            (only when free; absent otherwise)
   rebookedAt:   serverTimestamp()               (only when a cancelled row was replaced)
   ```
   The whole-document set is what fixes the `comp-booking.mjs` bug. No old cancel field survives, no `movedTo`/`movedFrom`/`cancelledFrom`, no `noshowReason`, no `comp*` and no stale `graceTokenId`. There is no `attendee` field: group sessions carry none, and mental sessions are refused.
2. `sessions/{sessionId}`: `{booked: taken + 1}`. Overfill is allowed, so this may exceed `capacity`.
3. `waitlist/{sessionId}_{athleteId}`: delete it if the athlete was waiting on this session.

**Response:**
```
{bookingId, athleteId, sessionId, periodKey, chargedFrom, graceTokenId, comp, rebooked, booked, capacity, overrides}
```
`booked` is the new count.

**Log** (*builder's call (Claude)*): one line with ids only, never names:
```
console.log('staff booking', JSON.stringify({action: 'add', by: uid, role, athleteId, sessionId, chargedFrom, comp, overrides}))
```

### 9.2 `moveBooking` gains a staff mode

- **When it applies.** Staff mode is on when `users/{uid}.role` is `owner` or `ops` (the same `isStaff` as staff cancel). A family caller never reaches it.
- **Request.** Gains an optional `allowFull: boolean`, which is ignored unless the caller is staff. A family's `{bookingId, toSessionId}` behaves exactly as today.

| Check (`move-decide.js`) | Family (today) | Staff |
|---|---|---|
| `ownsBooking` `:153` | required | skipped (role check instead) |
| old status `:154` | `confirmed` | `confirmed` or `noshow`. `attended` is refused as `attended`; anything else is `not-confirmed` |
| `calendly-managed`, `mental-no-move`, `same-session`, `session-missing` | kept | kept |
| `already-started` (old) `:162` | kept | replaced: the old booking's period is over, so `period-over` |
| `different-type`, `session-cancelled`, `session-hidden`, `display-only` | kept | kept |
| `session-past` (target) `:178` | kept | replaced: the target's period is over, so `period-over`; started means the override `started` |
| `outside-window` `:179` | kept | skipped, override |
| `already-booked` | kept | kept |
| test athlete `:197` | `membership-inactive` | `test-athlete` |
| membership, non-comp `:198` | kept | kept (`membership-inactive`) |
| `booking-not-open` `:201` | kept | skipped |
| `handicap-reserved` `:202` | kept | skipped, override |
| `full` `:207` | kept | refused unless `allowFull`; details `{taken, capacity}` |
| `one-per-day` `:244` | kept | skipped, override |
| charge (a)-(d) `:108-127`; a comp stays free `:252-255` | kept | kept |

- **New refusals.** `REFUSALS` gains `attended`, `period-over` and `test-athlete`. This is additive.
- **Payment never changes on a move** (*builder's call (Claude)*).
  - There is no Free switch on Move: a move keeps how the booking was paid. To make it free, cancel it and add it Free.
  - An unpaid athlete's paid booking is refused as `membership-inactive`. The copy points to "Cancel it and add Free".
- **Writes.** As today (`move.js:138-187`), with one difference: in staff mode the old row also gets `cancelledFrom: old.status`, recording a moved no-show (*builder's call (Claude)*, the same field `staff-cancel.js` writes).
  - The new row keeps `createdVia: 'move'`, so every existing email gate holds unchanged. Its `createdBy` is the staff uid, plus `movedFrom`.
  - The target counter is `taken + 1`, which may exceed capacity when `allowFull` was sent.
- **Response.** As today plus `overrides`. The same log line, with `action: 'move'`.
- **File size.** `move-decide.js` is 279 lines. If the staff branches push it past about 450, move them into `move-staff.js` (*builder's call (Claude)*).

### 9.3 `staffCancelBooking`

- **Next-period rows need nothing on the server.** `period-over` refuses only an ended period, and a next-period row's period has not started.
- **Add a `mental` refusal** (`code: PRE`, *builder's call (Claude)* implementing the owner's exclusion). Yannick's 1:1s go through Calendly whenever it is configured (`screens/SpecialistBooking.js:266-271`), so those rows are Calendly-sourced and already refused as `calendly`. The new refusal also covers a `mental` row booked in the portal (the in-app fallback).
- **Client side:** `staffCancellable` gains `row.type !== 'mental'`, and the billing rows gain `type`. CHANGE ONE, CHANGE BOTH.

### 9.4 Seat counter and waitlist (all inside the same transaction)

- **Add:** `booked = max(live, counter) + 1`, and the athlete's own waitlist entry on that session is deleted. No other entry is touched, and no promotion fires: the counter only rose.
- **Overfill:**
  - The counter may exceed capacity.
  - Promotion waits until a cancel brings `booked` back under `capacity` (`seatOpened`).
  - Families cannot take +1 (rules) but can always give back -1.
  - The family Book tab shows the session as Full.
  - Waitlist entries stay until the morning sweep, as on any full session.
- **Move:** the old session gets `-1`, floored. Promotion offers that seat if the session is still ahead, and never for today or the past (`promotion.js:157`). The target is handled as an add.
- **Cancel:** unchanged.

### 9.5 Emails

| Action | Row written | Trigger and gate | Family gets |
|---|---|---|---|
| Add, new row | create, `createdVia: 'staff'` | `onBookingCreated`, `shouldNoticeBookingCreated`: already true, no change | "Session booked" |
| Add over a cancelled row | whole-document set | `onBookingCancelled` re-confirm branch: **widened** (below) | "Session booked" |
| Move | old row `cancelReason: 'moved'`; new row `createdVia: 'move'` | as today | "Session booked" for the new session, nothing for the old one |
| Staff cancel | `cancelReason: 'staff'` | `onBookingCancelled` ignores it (`index.js:304`) | nothing |
| Free add | as Add, `comp: true` | as Add | "Session booked" (the copy never mentions tokens) |

- **The widened re-confirm gate.**
  - `notify-gates.js` `shouldNoticeMoveReconfirm` accepts `createdVia` of `'move'` **or `'staff'`**, still only when `createdAt` changed. Only the server rewrites `createdAt`.
  - A family re-book of a cancelled staff row keeps `createdAt`, so it stays silent, as every family re-book is today.
  - The sender's key becomes `{bookingId}_{createdVia}_{createdAt ms}`, which is unchanged for moves.
  - Renaming the gate is optional.
- **Sessions that already started** (*builder's call (Claude)*, pending Open question 1). The add still sends the usual email, as approved. `notices.bookingConfirmed` drops the `CANCEL_OR_MOVE` sentence when the session had already started at send time ("You can cancel or move it in the app any time before it starts." is false then). The gate is unchanged.
- **Reminders.** `sessionReminders` and the waitlist "promoted" email apply to staff-made rows like any others.

### 9.6 Cases

| Case | Add | Move (staff) | Cancel (staff) |
|---|---|---|---|
| Elite | `chargedFrom: 'elite'`; one-a-day is a warning | charge stays Elite | no token back (today) |
| Single token | grace `single_` first, then an issued comp period; else `no-session-token`, so Free is offered | (a)-(d); a single token carries while valid | the token comes back (today) |
| Free comp | `comp: true`, counted nowhere | stays free (`comp*` fields copied) | no token back (today) |
| Unpaid (billing pending, `oneTime` mismatch, no package) | Free only (`not-paid`) | comp moves; paid is refused `membership-inactive` | allowed |
| Household past_due or lapsed | Free only (`membershipAllowsBooking`) | as unpaid | allowed |
| Later lapse | `revoke.js` cancels future bookings, staff-made and Free ones included, as it does today's comps | unchanged | unchanged |
| Later downgrade | `trimDowngrade` keeps the newest bookings that fit the new grant. **Changed here:** `futurePeriodBookings` (`revoke.js:214`) also skips `comp` rows, so a Free booking neither counts against the grant nor gets trimmed (owner: a Free booking never counts as spent) | unchanged | unchanged |
| Test athlete or test household | `test-athlete` | `test-athlete` | allowed (unchanged) |
| Hidden / cancelled / display-only session | refused | refused (target) | n/a |
| Tour event (`tournament`) / Phil session | allowed like training; Elite's cap counts them | same type only | allowed |
| Mental / Calendly / unresolved slot | `calendly` | `calendly-managed` / `mental-no-move` | `calendly` / `mental` |
| Athlete already on the session | `already-booked` | `already-booked` | n/a |
| A cancelled row for that athlete and session exists | whole-document replace, "Session booked" via the widened gate | as today (replace) | n/a |
| Athlete waiting on that session | entry deleted, position ignores it | entry deleted (today) | n/a |
| Session today, started, or earlier this period | allowed, override `started` | allowed both ways (old and new) | allowed (today) |
| Session in an earlier period | `period-over` | `period-over` | `period-over` (today) |
| Beyond the family window, up to season end | allowed, override `outside-window` | allowed | allowed |

### 9.7 Function files

- **New:** `staff-book-decide.js`, `staff-book.js`, `staff-book.test.js`, and possibly `booking-reads.js` and `move-staff.js`.
- **Changed:**
  - `move-decide.js`, `move.js`, `move.test.js` (or a new `move-staff.test.js`);
  - `notify-gates.js` and its test;
  - `notices.js` and its test (the started variant);
  - `staff-cancel-decide.js` and its test (`mental`);
  - `revoke.js` and its test (`futurePeriodBookings` skips `comp`);
  - `index.js` (export plus one header line; stay under 500);
  - `test/check-exports.js` (23 functions; `staffBookSession: []`).

## 10. Client design

### 10.1 Shared pieces (new files; *builder's call (Claude)* on names)

**`data/staffBooking.js`** (pure, no Firebase):
- `searchAthletes(directory, query)`: case-insensitive match on any word of the name, at most 8 results, test athletes flagged.
- `staffAddFacts(session, ctx, now)` returns `{offer, held, waiting, full, taken, capacity, started, warnings[], charge}`. `charge` is one of `elite`, `grace`, `single`, `period`, `none`, `unknown` or `free-only`.
- `staffMovable(row)`: confirmed or noshow, not Calendly, not `mental`, and the period not over. This is the same test as `staffCancellable` plus the not-`mental` rule.
- `rosterRowToStaffRow(row, session)`: turns a roster row into the billing-hub row shape the sheets take.

**`data/staffBookingCopy.js`:** every string in section 10.5 and the refusal map.

**`hooks/staffBooking.js`:**
- `useStaffAthlete(athleteId)` reads the athlete, household, package, bookings (by `athleteId`, staff reads all), sessions by id, waitlist and `liveTokens`. It returns the athlete model.
- `useStaffDaySessions(dateISO)` uses `fetchSessionsInRange(day, day)`, minus hidden, cancelled, display-only and mental sessions.
- `staffBookSession({athleteId, sessionId, free, allowFull})` and `staffMoveBooking({bookingId, toSessionId, allowFull})`. Both call through `hooks/callables.js` (a new `callStaffBookSession`; Move reuses `callMoveBooking`) and then bump `bookings`, `sessions` and `waitlist`. A refusal rejects with an Error whose `reason` and copy come from `staffBookingCopy`, and whose `details` (`taken`, `capacity`) are read off the callable error's `cause.details`.

**Components** (`components/staffBooking/`):
- `StaffSessionPicker`: day plus session list.
- `AthletePicker`: search plus list.
- `StaffAddSheet`: the confirm step.
- `StaffMoveSheet`: picker, then confirm.
- `StaffRowActions`: the Move and Cancel buttons.
- `ManageBookingsCard`.

**Screen:** `screens/StaffAthleteBookings.js`.

**Cancel** keeps `components/StaffCancelSheet.js`, with no API change:
- From the roster, `members` is built from the roster rows of the same household.
- From the athlete screen, `members` is the athlete alone.

`siblingsFor` must also search the next period's rows (`m.nextSpent`).

**Small changes to existing files:**
- `hooks/index.js` `liveSessionAttendance`: one added line, spreading the fields the sheets need from the booking doc (`householdId, source, type, date, periodKey, chargedFrom, comp, graceTokenId`).
- `data/billingHub.js`: rows gain `type`; members gain `nextSpent: nextRows.spent`.
- `hooks/billing.js`: directory athletes gain `test: a.test === true` on the existing line, with no net lines.
- `components/TokenMeter.js`: `Row`, `RowCancel` and `Evidence` move to `components/TokenMeterRows.js` so the file stays under 500. The row's action slot takes `StaffRowActions`.

### 10.2 Entry point A: the Admin screen

**The card.** `ManageBookingsCard` sits on `/portal/admin` right after the Outstanding card (*builder's call (Claude)*), for both owner and ops.
- Label: **"Manage bookings"**.
- Body: "Add, move or cancel a session for any athlete."
- Field (44px): label "Find an athlete", placeholder "Start typing a name".
- The directory loads on the field's first focus, not on every Admin open (*builder's call (Claude)*).
- Each result is a 44px row: the name, then under it "{household} · {package}". Test athletes show a "Test" badge.
- No match: "No athlete matches "{query}"."
- Load failure: "Athletes didn't load. Check your connection and try again."
- Tapping a result opens the athlete's screen.

**The athlete's screen.** A new route, `/portal/admin/athletes/:athleteId/bookings` (*builder's call (Claude)*), with RequireRole ops/owner. Its wrapper can live in a new small routes file, keeping `PortalRoutes.js` growth to the route entry.

- **Header.**
  - Back link: "‹ Admin".
  - Label: "Bookings · staff view".
  - Title: the athlete's name.
  - Sub-line: "{household} · {package}".
- **Token line:** one of
  - "{left} of {granted} tokens left this period"
  - "Elite"
  - "{n} session tokens"
  - "Not paid yet - Free only"
  - "Membership past due - Free only"
  - "Membership lapsed - Free only"
  - "No package on file - Free only"
- **Buttons:** **Book a session** (primary, 50px) and "Family billing" (outline, 44px, opens `/portal/admin/households/:householdId`).
- **Status line:** after any change, the success line shows above the list (`role="status"`).
- **Groups:**
  - "This period · {Nov 1 - Nov 30}"
  - "Next period · {Dec 1 - Dec 31}"
  - "Later", shown only when it has rows. This covers Elite's month after next and staff adds past the window. *Builder's call (Claude)*, a superset of the owner's "this and next month".
  - Empty group: "Nothing booked."
- **Rows:**
  - "Tue Nov 17 · 4:00 PM", then the session label, then a badge: Booked / No-show / Attended / Bonus token / Session token / Free / Waitlist.
  - `StaffRowActions` on rows that pass `staffMovable` / `staffCancellable`.
  - A Calendly row reads "Cancel in Calendly".
  - Attended, mental and waitlist rows have no actions.
- **Test athlete:** a card reading "{First} is a test athlete. Test athletes can't be booked onto real sessions.", and no Book button.
- **Missing athlete:** "That athlete isn't on file."

### 10.3 Entry point B1: the session roster

All logic lives in new components. `Roster.js` gains only two mount points and the status line.

- **Header.**
  - **Add athlete** (outline, 44px) sits beside Cancel session (dangerOutline): two equal halves at 375px.
  - It shows for ops and owner, not for coach or mental accounts.
  - It hides when the session is cancelled, is a mental session, is held for an unmatched Calendly booking (`held`), or is a typed demo URL in live mode (`demoInLive`).
  - It still shows on a read-only roster (ops) and on past sessions. The server judges the period.
- **Row.**
  - Under the name, in the children slot (the `TrainingRowExtras` pattern), go "Move" and "Cancel" as 44px text buttons.
  - Aria labels: "Move Jordan", "Cancel Jordan's booking".
  - Shown for ops and owner on rows that pass `staffMovable` / `staffCancellable`, and never on a cancelled session.
- **After a change.**
  - A sticky status line shows the success line, as `staleLine` does today.
  - The roster reloads.
  - A moved row reappears greyed as "Moved to Thu Nov 19, 4:00 PM". A cancelled row reads "Cancelled · Sick". Both lines already come from `coachLine`.

### 10.4 Entry point B2: the staff Billing view

- **Book a session.** Under each member's meter, inside `MemberSection`, on the staff view only: **Book a session** (outline, 44px), shown for every package state. Unpaid members get the Free-only sheet. A test household shows the test line instead of the button.
- **Rows.** "Move" sits before the existing "Cancel" after the badge, both 44px. Move is hidden where `staffMovable` is false.
- **Next-period rows.** On the staff view only, the evidence list adds the next period's rows under the "Next period from Dec 1: ..." line, with the same actions. The parent's view is unchanged.
- **Line.** The page's existing banner line (`cancelLine`) carries the success line for all three actions.

### 10.5 The sheets: steps and copy

**Pick a day and a session** (`StaffSessionPicker`). Used by Book a session and Move.

- **Day picker** (*builder's call (Claude)*: it fits 375px without a scroller):
  - A native date input labelled "Day", 44px.
  - `min` is the athlete's current period start; `max` is the season end (`SEASON_BOUNDS.end`).
  - "‹ Previous day" and "Next day ›" buttons, 44px. The default day is today.
- **List:** that day's sessions as `SessionCard` rows (time, type, name).
  - Pill: "{n} left", or "Full · {taken} of {capacity}".
  - Tags: "Started", "Reserved {n} or better", "Waitlisted" (the athlete waits on it).
  - Order: sessions with seats left first, then full ones.
  - A session the athlete already holds reads "Booked" and cannot be tapped.
  - Move lists only the same type, and never the booking's own session.
- **Other states:**
  - Empty: "No sessions to book on {Tue Nov 17}."
  - Loading: "Finding sessions..."
  - Failure: "Sessions didn't load. Check your connection and try again."
  - A "Close" button closes the sheet.

**Pick an athlete** (`AthletePicker`). Used by the roster's Add athlete.
- Title: "Add an athlete to {Training block}, {Tue Nov 17, 4:00 PM}".
- The same search field and rows as the Admin card.
- Athletes already on the session read "On this session". Test athletes read "Test". Neither can be tapped.

**Confirm the add** (`StaffAddSheet`). It loads the athlete model and, when it was opened from the roster, the session doc.

- **Title:**
  - "Add {First} to this session?"
  - When full: **"This session is full ({taken} of {capacity}) - add anyway?"**
- **Summary:** "{Name} · {Tue Nov 17, 4:00 PM} · {Training block}".
- **Charge line:** exactly one of these.

| charge | line | Free switch | Confirm |
|---|---|---|---|
| period | "Uses 1 of {First}'s tokens for this period - {left} left." (next period: "for next period (from {Dec 1}) - {left} left.") | off, can be turned on | "Add {First}" |
| grace (bonus) | "Uses {First}'s bonus token (good through {Nov 20})." | off, can be turned on | "Add {First}" |
| single | "Uses one of {First}'s session tokens." | off, can be turned on | "Add {First}" |
| elite | "Elite - nothing to use." | hidden | "Add {First}" |
| unknown (beyond next period) | "Uses a token from that period if one is left." | off, can be turned on | "Add {First}" |
| none | "{First} has no tokens left for {this period / next period}. Switch on Free to add anyway." | off; confirm is disabled until it is on | "Add {First} free" |
| free-only | "{First} isn't paid up, so this booking is Free." (or "...'s membership is past due / lapsed, so ...") | on and locked | "Add {First} free" |
| Free switched on | "Free - no token used." | on | "Add {First} free" |

- **Free switch:** a `ToggleRow` labelled "Free", 44px.
- **Warnings:** one line each, in warning tone, above the buttons.
  - Window: "Past {First}'s booking window - families can book through {Dec 31}."
  - Handicap: "Reserved for handicaps of {5} or better - {First}'s is {9}." (or "...- {First} has no handicap on file.")
  - Elite: "{First} already has a {Training block} on {Tue Nov 17} - Elite includes one a day."
  - Started: "This session has already started." (today) or "This session was on {Tue Nov 10}." (an earlier day).
  - Waiting: "{First} is on this session's waitlist - adding takes {First} off it."
  - Full, with others waiting (*builder's call (Claude)*, one extra waitlist read): "{n} on the waitlist for this session."
- **Buttons:**
  - The confirm label is from the table. On a full session it is **"Add anyway"**. While busy it reads "Adding...".
  - The keep button reads "Back".
  - One call per tap (a busy ref).
  - The first call already carries `allowFull: true` when the staff member answered the full question.

**Move** (`StaffMoveSheet`):
- **Title:** "Move {First} to another {Training block | Tour event | Phil session}" (`moveTitle`).
- **Picker:** as above.
- **Confirm question:**
  - `moveQuestion`: "Move {First} from {Tue Nov 17, 4:00 PM} to {Thu Nov 19, 4:00 PM}?"
  - When full: **"{Thu Nov 19, 4:00 PM} is full ({taken} of {capacity}) - move {First} anyway?"**
- **Charge line:** one of
  - "The token moves with it."
  - "Uses a {December} token; the {November} one comes back."
  - "Stays free."
  - None for Elite.
- **Warnings:** the same lines as an add.
- **Buttons:** "Move" / "Move anyway" and "Keep it". While busy: "Moving...".

**Cancel:** `StaffCancelSheet`, unchanged. The reason is required, siblings are listed unticked, and its labels and success line are as released on 2026-11-12.

**Success lines.** These show on the page that opened the sheet; the sheet closes.
- Add, period: "{First} is booked for {Tue Nov 17, 4:00 PM} - 1 token used."
- Add, other charges: "... - bonus token used." / "... - session token used." / "..., free." / Elite: "{First} is booked for {Tue Nov 17, 4:00 PM}."
- Overfill: append " The session now has {booked} of {capacity}."
- Move: "{First} moved to {Thu Nov 19, 4:00 PM}."
- Cancel: the existing `staffCancelLine`.
- No answer from the server: "We couldn't confirm the change. Check the list before trying again." The lists reload.

**Refusal copy.** On a refusal the sheet stays open and nothing changes. A refusal about the session goes back to the picker, reloaded, under "{line} Nothing was changed.". A refusal about the athlete or the booking ends the sheet with that line and a Close button.

| reason | line |
|---|---|
| `signed-out` | "You are signed out. Sign in and try again." |
| `not-staff` | "Only the owner or ops can change bookings here." |
| `bad-request` | "That change wasn't complete. Try again." |
| `athlete-missing` / `booking-missing` | "That athlete isn't on file any more." / "That booking no longer exists." |
| `no-household` | "{First} has no family on file, so the booking would have nowhere to show." |
| `test-athlete` | "{First} is a test athlete and can't be booked onto real sessions." |
| `session-missing` | "That session isn't on the schedule any more." |
| `calendly` / `calendly-managed` / `mental-no-move` / `mental` | "Yannick's 1:1s are booked and changed in Calendly." |
| `session-cancelled` | "The academy cancelled that session." |
| `session-hidden` | "That session is hidden from the schedule. Show it first, then add." |
| `display-only` | "That session isn't booked through the portal." |
| `period-over` | "That session is in a billing period that's over." |
| `already-booked` | "{First} is already on that session." |
| `not-confirmed` | "This booking was already changed." |
| `attended` | "This booking is marked attended, so it can't move." |
| `not-paid` / `membership-inactive` | add: "{First} isn't paid up - switch on Free."; move: "{First}'s membership isn't active, so a paid booking can't move. Cancel it and add Free instead." |
| `no-tokens-left` / `no-session-token` | add: the sheet turns to the "none" row above; move: "{First} has no tokens left for that period. Cancel it and add Free instead." |
| `full` | the sheet turns into the full question with the server's `{taken} of {capacity}` |
| `different-type` / `same-session` | "Pick a session of the same kind." / "Pick a different session." |
| anything else | the server's own message |

### 10.6 Layout

- Every tappable element is at least 44px tall: buttons, rows, the day input, toggles and the row actions.
- At 375px the side gutter is 22px, as every portal screen uses, and there is no horizontal scroll.
- Two-button rows split in equal halves. Sheets are bottom sheets with `maxHeight: 85%` and internal scroll (the `MoveSheet` pattern).
- Labels name the athlete, so siblings' buttons differ for a screen reader.

### 10.7 Seed (practice) mode

The same rule as `hooks/move.js`: nothing live is called.
- The directory is the seed household.
- The athlete screen is built from the billing seed member's rows.
- The day list comes from `data/season.js` (`sessionsForDate`).
- Add, Move and Cancel resolve `{simulated: true}`, and the success line reads the same.
- A typed `/portal/attendance` URL in live mode with no session shows no staff actions.

## 11. `scripts/comp-booking.mjs`

**Retire it in this branch** (*builder's call (Claude)*). A Free add from the panel covers every case it served: an unpaid athlete, a seat and its count in one commit, and the usual email. The panel also re-confirms a cancelled row cleanly, where the script carries the stale-field bug (section 8).

- **Delete** the script and `scripts/test/comp-booking.test.mjs` in the branch's last commit, after the emulator check (section 14 step 2) has proved a Free add for an unpaid athlete, including over a cancelled row.
- **Update the comments that name it:** `notify-gates.js`, `data/bookingChanges.js`, `scripts/hide-sessions.mjs`, `scripts/provision-test-family.mjs`, and the DATA-MODEL `comp` row.
- **Leave dated plan docs as history.**
- **Keep** `comp-grant.mjs` and `comp-membership.mjs`. They comp memberships, not sessions.

## 12. Docs to update in the same change

- **`docs/portal/DATA-MODEL.md`:**
  - `createdVia` gains `'staff'`, written by `staffBookSession`.
  - `createdBy` may be a staff uid.
  - The `comp` writer is the panel, not the script.
  - `cancelledFrom` is written on a moved row in staff mode.
  - `moveBooking` has a staff mode.
  - The re-confirm notice key is `{id}_{createdVia}_{ms}`.
- **`functions/index.js` header:** one line for `staffBookSession`.
- **The auto-memory notes** for comp booking and staff cancel point to the panel.

## 13. Tests

**Functions** (`cd functions && node portal/<file>.test.js`, `node test/check-exports.js`, `npx eslint .`; JSDoc and 80 columns, tests included):
- **`staff-book.test.js`** (decide and handler, on `fake-firestore`):
  - Every refusal in table order, each with nothing written.
  - The charge order: grace before period, the soonest-expiring grace, a grace token expired before the session date skipped, Elite, a single token, an issued comp period for a single athlete.
  - Free on every package.
  - Unpaid, lapsed and past-due cases refused unless Free.
  - The next period's tokens used for a next-period session.
  - Waitlist holds counted, with the athlete's own entry on this session ignored and deleted.
  - Overrides reported: `started`, `outside-window`, `handicap-reserved`, `one-per-day`, `full`.
  - `full` refused without `allowFull`, with details.
  - Overfill writes `capacity + 1`.
  - The counter healed from a low value (`max(live, counter) + 1`).
  - The exact document on create, and the whole-document replace over a cancelled row: no `cancel*`, `movedTo`, `comp*`, `noshowReason` or stale `graceTokenId`, and `rebookedAt` set.
  - `already-booked` for confirmed, attended and noshow rows.
  - Test athlete and test household refused.
  - A non-staff caller reads nothing past `users`.
- **`move.test.js`** or a new `move-staff.test.js`:
  - Staff moves a family's booking.
  - A parent's `allowFull: true` is ignored (still `full`).
  - Staff skip the window, handicap and one-a-day limits, with each override reported.
  - Moves from a started or past old session inside the period, and from a `noshow` row (old row gets `cancelledFrom`).
  - `attended` refused; `period-over` on the old row and on the target.
  - `test-athlete` refused.
  - Charges (a)-(d) unchanged; a comp stays free; an unpaid paid booking refused.
  - The family cases still pass unchanged.
- **`notify-gates.test.js`:**
  - Re-confirm is true for `staff` and `move` with a new `createdAt`.
  - False for `staff` with the same `createdAt` (a family re-book), for `repeat` and for no `createdVia`.
  - `shouldNoticeBookingCreated` is true for `createdVia: 'staff'`.
- **`notices.test.js`:** the started variant has no "before it starts" sentence.
- **`staff-cancel.test.js`:** the `mental` refusal; a next-period row cancels with the token back.
- **`check-exports.js`:** 23 functions, and `staffBookSession` binds no secrets.

**Rules:** `scripts/verify-rules.mjs` and every probe run unchanged and green.
- *Builder's call (Claude):* add two lines to `scripts/rules-probes/booking-changes.mjs`, mirroring the `'move'` ones at `:152` and `:177-179`:
  - a family create with `createdVia: 'staff'` is refused;
  - a family re-book of a row carrying `createdVia: 'staff'` is allowed.

**Frontend** (`cd frontend && CI=true npx react-scripts test --watchAll=false <pattern>`, `npx eslint src`, `CI=true npm run build`):
- `data/staffBooking.test.js`:
  - search;
  - `staffAddFacts`: every charge kind, every warning, full, held, waiting;
  - `staffMovable`;
  - the roster adapter;
  - `siblingsFor` with next-period rows.
- `data/staffBookingCopy.test.js`: every line in 10.5.
- `hooks/staffBooking.test.js`: seed echoes, callable payloads, bumps, the refusal mapping including `details`.
- `StaffAddSheet.test.js`:
  - the Free switch states (locked when unpaid, disabled confirm until on when there are no tokens, hidden for Elite);
  - the full title and "Add anyway";
  - a `full` refusal turning into the question;
  - warnings shown;
  - the busy guard;
  - an unconfirmed answer.
- `StaffMoveSheet.test.js` and `StaffSessionPicker.test.js`:
  - the date bounds;
  - seats-left first;
  - Booked rows not tappable;
  - Move lists the same type only.
- `ManageBookingsCard.test.js`: lazy load, test badge, no match.
- `StaffAthleteBookings.test.js`: the groups, actions per row, the test athlete card.
- `Roster.staffbooking.test.js`:
  - Add athlete beside Cancel session for owner and ops, never for coach or mental, none on mental or cancelled sessions;
  - row actions;
  - the status line.
- `Billing.staffbooking.test.js`:
  - Book per athlete;
  - Move beside Cancel;
  - next-period rows with actions on the staff view, none on the parent view.
- The existing TokenMeter, Billing, Roster and PortalRoutes tests stay green. Add a PortalRoutes case for the new route's role guard.

## 14. Release order

1. **Build and merge.** Build on a branch from develop. Every gate in section 13 must be green, then merge to develop. Nothing is deployed yet.
2. **Emulator check** (hands-on), with launch config `ryp-qa-emulator` on port 3001, plus the Firestore, Auth and Functions emulators and a seeded or copied family.
   - Do this here and not on staging: staging books real seats, and test athletes cannot book.
   - Check: as owner and as ops, an add with a token, a Free add, an unpaid athlete (Free only), an overfill, an add on today's started session and on an earlier day this period, an add beyond the window, a re-confirm over a cancelled row, a move (including into a full session), a cancel of a next-period row, and every entry point.
   - Read the `notifications` ledger docs to confirm one "Session booked" per add or move, and none for the cancel.
   - Check every sheet at 375px in the browser pane (mobile preset).
3. **Functions deploy** (the owner runs it):
   ```
   npx firebase-tools deploy --only functions:staffBookSession,functions:moveBooking,functions:staffCancelBooking,functions:onBookingCancelled,functions:onBookingCreated,functions:stripeWebhook
   ```
   - The live family app keeps working: `moveBooking` is unchanged for families, and the other changes are additive.
   - `staffBookSession` is a new 1st-gen callable, deployed the way `staffCancelBooking` was on 2026-11-12. If its first call fails with an internal or permission error, check the invoker binding (the rypacad GCP org-constraints note).
4. **Push develop.** Staging rebuilds on production data. Do a read-only check there:
   - the Admin card search;
   - an athlete's screen and its groups;
   - the day picker lists;
   - the roster's buttons;
   - the test athlete's screen saying it cannot be booked.

   Make no real adds on staging unless the owner wants that add for real.
5. **Release.** The owner pushes `develop:main`.
6. **No rules deploy.**

## 15. Builder's calls (Claude), in one place

1. A new callable plus a `moveBooking` staff mode, with staff cancel reused (S2).
2. Staff mode chosen by role, never by a request flag; `allowFull` ignored for families.
3. Hidden sessions refused (`session-hidden`).
4. `full` checked last, so the overfill question is the final confirm.
5. No Free switch on Move: a move keeps its payment, and an unpaid paid booking cannot move (cancel and add Free instead).
6. Staff may move `noshow` rows; `cancelledFrom` is written on the moved row.
7. Staff cancel refuses `mental` rows, and `staffCancellable` hides them.
8. The started-session email keeps sending but drops the "before it starts" sentence (Open question 1).
9. The athlete screen also lists a "Later" group.
10. The athlete screen's route is `/portal/admin/athletes/:athleteId/bookings`.
11. The Manage bookings card sits after Outstanding, and the directory loads on first focus.
12. The day picker is a date input with previous/next buttons.
13. A waitlist count line shows on a full session.
14. One add per athlete: no sibling add, no bulk add, no add-as-attended.
15. `comp-booking.mjs` is retired in this branch after the emulator check.
16. Two rules probes are added; no rules change.
17. Function logs carry ids only.
18. The downgrade trim (`revoke.js` `futurePeriodBookings`) skips Free (`comp`) rows. This is the owner's ruling applied where the code missed it (builder check 2026-11-13). `stripeWebhook` joins the deploy.

## 16. Open for the owner

Nothing is open.

The one question the draft raised is settled as *builder's call (Claude)* under the owner's approved rule "an add sends the family the usual email":
- An add on a session that already started still sends "Session booked", without the "cancel or move it any time before it starts" sentence (section 9.5).
- The owner can ask to silence it later.
