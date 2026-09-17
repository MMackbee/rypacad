# The booking write path

The scaffold reads seed data. Everything below is about the first write, and
booking is the one to get right first — it is the only operation where two
people can collide over the same resource, and the only one where a client that
lies costs the Academy a seat.

Three things must be true at the moment a booking is created, and they must be
true *together*:

1. The session has space — `bookedCount < capacity`
2. The athlete has allowance left **in the pool this session spends** —
   training and tournaments are separate, per `packages.js`
3. The caller is the athlete, or a guardian linked to that athlete

Checking these in the client and then writing is wrong in three different ways.
Two parents tapping the last seat both pass the check. A parent with the console
open can write a booking past their allowance. And a guardian can name any
`athleteId` they like.

---

## The rule: clients never write sessions, bookings or allowances

All three go through a callable Cloud Function using the admin SDK. The client's
job is to read state and call `bookSession({ athleteId, sessionId })`. Security
rules make the direct path impossible rather than merely discouraged — see
`firestore.rules.r3`.

This is not extra ceremony. A booking touches three documents atomically; that
is a transaction, and a transaction belongs on the server.

---

## `bookSession({ athleteId, sessionId })`

Runs inside a Firestore transaction. Every read happens inside it, or the
capacity check races.

```
transaction:
  session   = get(sessions/{sessionId})
  athlete   = get(athletes/{athleteId})
  allowance = get(allowances/{athleteId}_{cycleId})

  assert caller.uid == athlete.userId or caller.uid in athlete.guardianIds
  assert session.status == 'open'
  assert session.startsAt > now                  // no booking the past
  assert session.bookedCount < session.capacity  // capacity
  pool = session.type == 'tournament' ? 'tournaments' : 'training'
  assert allowance[pool].used < allowance[pool].limit

  create bookings/{auto} {
    athleteId, sessionId, pool,
    status: 'booked',
    isMakeup: false,
    bookedBy: caller.uid,
    createdAt: serverTimestamp()
  }
  update session   { bookedCount: increment(1) }
  update allowance { [pool].used: increment(1) }
```

Failure modes get distinct error codes, because the UI already distinguishes
them: `session-full`, `allowance-spent`, `not-linked`, `session-closed`,
`session-past`. "Block is full" and "your pool is spent" are different screens.

---

## Cancellation, and the makeup rule

The confirmation copy promises: *"Cancel up to 12 hours ahead to keep this as an
unlimited makeup rather than a used session."* That sentence is a spec.

```
cancelBooking({ bookingId }):
  transaction:
    booking = get(bookings/{bookingId})
    session = get(sessions/{booking.sessionId})
    assert caller may act for booking.athleteId

    hoursOut = (session.startsAt - now) / 3600

    update booking { status: 'cancelled', cancelledAt: serverTimestamp() }
    update session { bookedCount: increment(-1) }        // always frees the seat

    if hoursOut >= 12:
      update allowance { [booking.pool].used: increment(-1) }   // refunded
      update booking   { refunded: true }
    else:
      // Seat is freed for someone else, but the entitlement is spent.
      update booking { refunded: false }
```

The seat is always returned to the session. The *allowance* is only returned
inside the window. Those are different things and conflating them is the easy
bug here.

### Makeups do not spend allowance

"Unlimited makeup rescheduling" means a missed block can be rebooked without
counting. A makeup booking sets `isMakeup: true` and skips the allowance
increment entirely — but still consumes a seat and still checks capacity.

Eligibility needs a decision: a makeup should reference the specific missed
booking (`makeupFor: bookingId`), so one no-show grants exactly one makeup and
"unlimited" can't be farmed into unlimited access. **Open — confirm the intended
rule before building it.** The generous reading (any missed block, any time in
the cycle) and the strict reading (one-for-one, same cycle) produce very
different capacity loads.

---

## The billing cycle

Allowances reset on the billing date, not the 1st and not a rolling 30 days. The
UI already says "resetting Mar 1". Key allowance documents by cycle
(`{athleteId}_{YYYY-MM}` against the cycle start) so a reset is a new document
rather than a mutation — that keeps history and makes a disputed month
answerable.

Stripe's `invoice.paid` webhook is the natural trigger to open the next cycle,
which also means an unpaid account simply has no new allowance document. That is
a cleaner enforcement of the dunning rule than a flag to check everywhere.

---

## Waitlist

`BookSession` already renders a full-block note offering the waitlist. It needs
the same treatment: joining is a write, and notifying on a freed seat is a
Firestore trigger on `session.bookedCount` decreasing. The Courier/Twilio wiring
in `functions/index.js` already does exactly this shape of notification for the
2025 waitlist — reuse it rather than rebuilding.

Whether a freed seat is offered first-come or to the first waitlister is a
policy decision, not a technical one. **Open.**

---

## What to build first

1. `bookSession` + `cancelBooking` callables, with the transaction above
2. `firestore.rules.r3` in place of the 2025 rules — the current file lets any
   authenticated user write any session document
3. Swap `useBooking` to call the function; leave every other hook on seed
4. Then auth, then the rest of the read path

Booking first is deliberate. It is the operation with real concurrency, the one
carrying money-adjacent entitlements, and the one every other screen's numbers
are derived from.
