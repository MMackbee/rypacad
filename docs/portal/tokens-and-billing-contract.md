# Tokens, billing state, and booking windows

**Status:** v1.1 — policy record of the Sept 15 2026 decisions. **§1–11 are the decisions and stand. §12–15 were written against the Aug 27 snapshot and are superseded by `SPRINT-12-PINS.md`**, which restates the implementation against the architecture that actually exists (client transactions gated by rules, derive-don't-store, sanctioned admin-SDK writers, no callables). Where this file and the pin disagree on *how*, the pin wins; on *what*, this file does. Prices marked *pending* await Luke's OK.

**Supersedes**

- `booking-contract.md` § *The billing cycle* and every reference to `pool`, `training`/`tournaments` allowances, or `poolFor`. The callable-only rule, the transaction shape, and the 12-hour cancellation window all carry forward unchanged.
- `packages.js` in full: `GOLF_PACKAGES`, `FITNESS_PACKAGES`, `ELITE_TIERS`, `DROP_IN`, `makeAllowance`, `poolFor`, `entitlementsFor`, and the `phil`/`mental` specialist pools. There is one pool now.
- The earlier tournament rollover policy (roll one month / training doesn't roll). Replaced by the grace-token rule in §4.

**Out of scope here:** Elite 24/7 access paperwork (Mike/Luke), the Saturday 2–4 adult block (in-person Stripe, not in the app), website fine-print copy.

---

## 1. Products

*Amended 2026-09-17 from the owner's pricing sheet. Prices are not released to parents.*

| Package | Sessions / period | Package price | + Facility access | Total |
|---|---|---|---|---|
| 6 | 6 | $299 | $300 | $599 |
| 12 | 12 | $569 | $300 | $869 |
| 16 | 16 | $719 | $300 | $1,019 |
| Elite | unlimited, one per day | $999 all-in | included | $999 |
| Single token | 1 | $65 *pending* | — | — |

A token is spent on any bookable session — training, tournament, Phil's group PT, a Yannick 1:1. Session `type` is display/roster/Tour only; it never affects charging.

**Facility access** (24/7) is a $300/month add-on on any package, requiring a waiver and parent permission if under 18. It is a line item, not a session entitlement.

**Elite** includes: unlimited golf sessions (one per day), unlimited group PT with Phil (one per day), two individual sessions with Yannick per month, and facility access. No token accounting; the per-day and per-month limits are frequency caps. The no-show tracker (built) is the other brake.

Capacity: **training 14, tournament (RYP Tour) 25**, Phil's group PT 6, Yannick 1:1 1. Set 2026-09-18.

---

## 2. Periods and issuance

A **period** is one Stripe billing cycle for that membership — 1st-to-31st for someone who signed up on the 1st, 15th-to-14th for someone who signed up on the 15th. Nothing is aligned to the calendar month.

Tokens are **issued on `invoice.paid`**, for the period that invoice covers, as a new document:

```
tokenPeriods/{athleteId}_{periodStartISO}
  granted:   package.tokens        // 0 for Elite — Elite never reads this doc
  used:      0
  reserved:  0                     // held by waitlist entries, see §6
  expiresAt: periodEnd
  issuedAt:  serverTimestamp()
  source:    'invoice.paid' | 'reinstatement'
```

A new document per period, never a mutation of the old one. History stays answerable.

---

## 3. Expiry

**Tokens expire at `periodEnd`. Hard.** `used`, `reserved`, whatever is left — gone. Nothing carries. Lapse needs no voiding step because expiry already does it: a lapsed membership simply gets no next `tokenPeriods` document.

Athlete-side cancellations follow the existing 12-hour rule: ≥12h out, `used--` (the token returns to *this* period and still expires with it); <12h, spent. Your own cancellation gives the token back; it never extends it.

---

## 4. The one exception: grace tokens

A token the Academy couldn't honor gets a second life. One trigger, no others:

1. **Academy-side session cancellation** — every confirmed booking on that session is cancelled and each athlete is minted one grace token.
2. **Waitlist never promoted — no grace token** (owner ruling, 2026-10-01; replaces the earlier "one grace token is minted"). When a waitlist closes without a spot, the entry is closed and the reserved token is simply free again. Nothing is minted, for anyone. This covers every way a waitlist closes without a spot:
   - the session date passes with the athlete still waitlisted (the daily 06:00 sweep closes the entry the next morning);
   - the Academy cancels the session the athlete was waiting on (the entry is closed at once; only the athletes who held a **booking** on that session get the grace token in item 1);
   - a spot opens but the athlete fails a check a normal booking applies (the entry is removed and the family is told why).

   In each case the family gets one notice. Elite reserves no token, so an Elite athlete's notice has no token sentence. Grace tokens minted under the old rule before 2026-10-01 stay valid until they expire.

The same ruling fixed three more points of waitlist behavior: a session that has started or is in the past cannot be booked or waitlisted; a family is never auto-booked on the day of the session (it could not cancel), so entries still waiting on the day are closed by the next morning's sweep; and a promotion may never produce a booking a normal tap would refuse (unpaid or lapsed membership, no token for that period, Elite's one-per-type-per-day cap, outside the booking window). One check a normal tap applies is not repeated at promotion: the booking-open date (Oct 10, 2026). It cannot be reached, because the waitlist create rule already refuses a token athlete's join before booking opens, so no such entry exists to promote. If that rule ever changes, the same check must be added to promotion.

```
graceTokens/{auto}
  athleteId, sourceBookingId
  expiresAt:  mintedAt + 30 days
  consumedBy: null | bookingId
```

Grace tokens are spent **first**, soonest-expiry first, before period tokens. They are minted only when the Academy cancels a session on a booked athlete. An athlete whose waitlist closes without a spot, who leaves a waitlist voluntarily, cancels their own booking, or is revoked on lapse gets no grace token.

This is the whole of the old rollover policy, generalized: one month of life, only when it wasn't the family's choice.

---

## 5. Booking windows

Rolling, per membership:

| | Window |
|---|---|
| Token packages | 30 days (**Sprint 20 ruling 0.5; was 32**) |
| Elite | 45 days |

**The window rolls at 07:00 America/Chicago**, not midnight.

```
localNow      = now in America/Chicago
anchorDate    = localNow.time >= 07:00 ? localNow.date : localNow.date - 1
openThrough   = anchorDate + membership.windowDays
bookable iff  localDate(session.startsAt) <= openThrough
```

So at 07:00 on Jan 10 a token holder sees through Feb 9; Elite sees through Feb 24. At 06:59 on Jan 10, one day less. Same rule for both; only `windowDays` differs.

---

## 6. Charging rule

**A booking is charged against the period its session date falls in, never the period it is made in.**

This is what keeps hard expiry honest. January tokens buy January sessions only. A February session booked on Jan 20 is charged from February's tokens — which don't exist yet, so the booking is *provisional* (§7) until Feb's `invoice.paid` issues them.

Charge order when a booking is created or promoted:

```
1. Elite                          -> nothing charged
2. graceTokens (soonest expiry)   -> consumedBy = bookingId
3. tokenPeriods for the session's period, if issued
                                  -> assert used + reserved < granted; used++
4. session's period not issued yet
                                  -> booking.status = 'provisional'
                                     assert provisionalCount(athlete, period) < package.tokens
5. otherwise                      -> error 'allowance-spent'
```

**Provisional cap:** an athlete may hold at most `package.tokens` provisional bookings for any one unissued period. A 12-token family can have 12 confirmed this period and 12 provisional next period, never more. No new number to invent; it also bounds how far a lapsing member can reach into the future.

---

## 7. Booking states

```
bookings/{auto}
  athleteId, sessionId, bookedBy
  status:      'confirmed' | 'provisional' | 'waitlisted' | 'cancelled' | 'revoked'
  periodKey:   periodStartISO the session falls in
  chargedFrom: 'elite' | 'grace' | 'period' | null      // null while provisional/waitlisted
  graceTokenId: string | null
  isMakeup, makeupFor: see §9
  createdAt, cancelledAt, revokedAt
```

| State | Meaning | Seat held? | Token? |
|---|---|---|---|
| **confirmed** | charged from an issued period, grace, or Elite | yes | spent |
| **provisional** | session falls in a period not yet issued | yes | charged on issuance |
| **waitlisted** | session full | no | one token *reserved* (not spent) |
| **cancelled** | by athlete or Academy | no | refunded per §3/§4 |
| **revoked** | membership lapsed | no | nothing — it expires anyway |

Transitions:

- `provisional → confirmed` on `invoice.paid` for that period, oldest `createdAt` first. If issuance is smaller than the provisional count (downgrade), the excess go `cancelled`, newest first.
- `waitlisted → confirmed` on promotion (§8); the reserved token becomes `used`.
- `waitlisted → cancelled`, reserved token released and **no** grace token, when the waitlist closes without a spot (§4 item 2, owner ruling 2026-10-01).
- Anything future `→ revoked` on lapse (§10).

---

## 8. Waitlist

Joining **reserves** one token (`tokenPeriods.reserved++`) so an athlete can't waitlist ten sessions against one token. Elite reserves nothing. Leaving voluntarily releases the reservation.

Promotion is a Firestore trigger on `session.bookedCount` decreasing — the existing Courier/Twilio notification path. Order:

```
1. waitlisters holding an unconsumed grace token, soonest expiry first
2. then by joinedAt ascending
```

The promoted athlete gets a notification and an acceptance window (existing wiring; length is a config value, suggest 4 hours). No acceptance → pass to the next. Promotion creates a confirmed booking through the normal charge order in §6.

"Grace holders first" is what the old "rollover priority" becomes under tokens: a family the Academy already failed once goes to the front.

---

## 9. Makeups — recommend retiring

The old contract's "unlimited makeup" concept conflicts with hard expiry: a booking that spends no token is a free session, and "unlimited" is the exact thing tokens exist to stop. The 12-hour refund window already *is* the makeup mechanism — cancel in time, keep the token.

**Recommendation:** retire `isMakeup`. If the confirmation copy's promise has to survive, the strict reading only: `makeupFor` references one specific no-show booking, one-for-one, same period, and the makeup still consumes a seat. **Open — needs a call before the confirmation copy is rewritten.**

Elite no-shows have no token to forfeit; the existing no-show tracker is the consequence and stays as built.

---

## 10. Membership states

```
memberships/{athleteId}
  packageId, elite: bool, windowDays: 30 | 45
  status: 'active' | 'past_due' | 'lapsed'
  stripeCustomerId, stripeSubscriptionId
  currentPeriodStart, currentPeriodEnd
  lastEvent, lastEventAt
```

| State | Entered by | Existing bookings | New bookings | Tokens |
|---|---|---|---|---|
| **active** | `invoice.paid` | held | allowed, incl. window | issued |
| **past_due** | `invoice.payment_failed` (any retry) | **held** | **blocked** | frozen |
| **lapsed** | final retry failed, or `customer.subscription.deleted` | **revoked** | blocked | none issued |

Freeze before revoke, deliberately. Stripe retries three times over ~10 days; an expired card shouldn't cost a kid their Saturday, and you're not extending credit either — `bookSession` asserts `status == 'active'`, so past_due blocks new bookings with no extra flag.

**Reinstatement** — `invoice.paid` after `lapsed` — issues tokens for the new period and sets `active`. Revoked bookings stay revoked; the seats were released and likely rebooked. The family rebooks from what's available. Say so in the UI so it isn't a support ticket.

---

## 11. Revocation

```
revoke(athleteId):
  membership.status = 'lapsed'
  for booking in bookings where athleteId and session.startsAt > now
                  and status in (confirmed, provisional, waitlisted):
    booking.status = 'revoked'; booking.revokedAt = now
    if was confirmed or provisional:
      session.bookedCount -= 1        // releases the seat -> triggers promotion
    if was waitlisted:
      tokenPeriods.reserved -= 1; remove from waitlist
  // tokens: untouched. They expire on schedule. No next period is issued.
```

**Revocation always releases the seat.** A revoked booking that keeps its seat leaves a phantom hole in a block that shows full — the waitlist has to promote into it.

---

## 12. Callables

All writes to `sessions`, `bookings`, `tokenPeriods`, `graceTokens`, `memberships` go through callable Cloud Functions on the admin SDK, per the existing rule. Clients read and call.

**`bookSession({ athleteId, sessionId })`** — one transaction:

```
session    = get(sessions/{sessionId})
membership = get(memberships/{athleteId})
assert caller.uid == athlete.userId or in athlete.guardianIds     // not-linked
assert membership.status == 'active'                              // membership-inactive
assert session.status == 'open' and session.startsAt > now        // session-closed / session-past
assert withinWindow(session, membership)                          // outside-window
if session.bookedCount >= session.capacity:
  -> joinWaitlist path (reserve token unless Elite); return 'waitlisted'
charge per §6 -> status 'confirmed' or 'provisional'
create booking; session.bookedCount += 1
```

Error codes the UI already distinguishes: `session-full`, `allowance-spent`, `not-linked`, `session-closed`, `session-past`. Add `membership-inactive`, `outside-window`, `provisional-cap`.

**`cancelBooking({ bookingId })`** — unchanged shape; refund goes to `chargedFrom` (grace token un-consumed, or `tokenPeriods.used--`), only if ≥12h out. Seat always released.

**`issueTokens(athleteId, periodStart, periodEnd, source)`** — called by the `invoice.paid` handler. Creates the `tokenPeriods` doc, confirms that period's provisional bookings oldest-first, sets `active`.

**`freeze(athleteId)`** / **`revoke(athleteId)`** — called by the payment-failure and subscription-deleted handlers. §10, §11.

**`promoteWaitlist(sessionId)`** — Firestore trigger on `bookedCount` decrease. §8.

**`cancelSession({ sessionId })`** — staff only. Cancels every booking, mints grace tokens, releases nothing (the session is gone).

---

## 13. Stripe events → actions

| Event | Action |
|---|---|
| `invoice.paid` | `issueTokens` for the period on the invoice; `active` |
| `invoice.payment_failed` | `freeze` — `past_due`. Idempotent across retries |
| `invoice.payment_failed` with `next_payment_attempt == null` | `revoke` — `lapsed` |
| `customer.subscription.deleted` | `revoke` |
| `customer.subscription.updated` (package change) | update `packageId`/`windowDays`; takes effect at next issuance |

Every handler is idempotent on `event.id` — Stripe redelivers.

---

## 14. Reconciliation — webhooks act, the export audits

Webhooks are the mechanism. They are also delayed and occasionally dropped, so a **daily export** is the audit:

```
one row per membership:
  athleteId, packageId, app status, currentPeriodEnd,
  Stripe subscription.status (pulled live via API),
  tokens granted / used / reserved this period,
  open confirmed + provisional + waitlisted counts,
  MISMATCH flag when app status != Stripe status
```

A script, not a cloud function — run it with the DB cleanup for the token migration and keep running it daily. If the export is ever the *only* thing catching a lapse, someone is reading a spreadsheet before a kid can be turned away at the door; the webhooks have to stay primary.

---

## 15. Migration from the three-pool model

- `allowances/{athleteId}_{YYYY-MM}` → `tokenPeriods/{athleteId}_{periodStart}`; `training.used + tournaments.used + phil.used` → `used`; `granted` from the new package map.
- `bookings.pool` → drop; add `periodKey`, `chargedFrom`, `status` (all existing = `confirmed`).
- `athletes.fitnessPackageId` → drop.
- `sessions.capacity` → 15 everywhere.
- Every "sessions remaining" display → one number. Elite displays no number.

---

## 16. Open

1. Prices — awaiting Luke.
2. Makeup rule — retire, or strict one-for-one. §9.
3. Acceptance window length on waitlist promotion — config value, suggest 4h.
4. Fine print (website): tokens are a period entitlement of an active membership and expire at period end; revoked bookings are not reinstated on repayment; grace tokens live 30 days.
