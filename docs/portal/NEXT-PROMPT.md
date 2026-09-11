The portal scaffold is complete — 18 screens, all reading seed data through the
`useSeedResource` seam. Nothing touches Firebase yet. This stretch turns the
first slice into a real application.

Read `docs/portal/booking-contract.md` first. It specifies the write path in
detail and explains why booking comes before auth.

There is a decision meeting on **Thursday Sept 3**. Anything you hit that needs
a human answer goes in `docs/portal/DECISION-GAPS.md` — see the last section.

## 1. Booking write path

Implement `bookSession` and `cancelBooking` as callable Cloud Functions in
`functions/`, following the transaction in the contract exactly. The three
invariants — capacity, the correct allowance pool, guardian linkage — must hold
together inside one Firestore transaction. Distinct error codes per failure, as
the UI already distinguishes them.

Do not let the client write sessions, bookings or allowances. That is the whole
point of the design.

## 2. Security rules

`firestore.rules.r3` is written and reviewed but not live. The current
`firestore.rules` is the 2025 file and lets any authenticated user write any
session document. Swap it in, run the emulator suite against it, and write tests
for at least: a parent reading another family's athlete (deny), a client writing
a session (deny), a coach reading an unassigned athlete (deny), a parent reading
mentalGame (deny).

Roles come from custom claims, set server-side. Never from a user document.

## 3. Auth

`useAuthSession` presents a lockout it does not enforce — the comment in it is
accurate about why. Wire it to the Firebase auth already configured in
`src/firebase.js`. Attempt counting and lockout move server-side. MFA required
on all staff roles; parent and athlete accounts stay standard.

## 4. Read path, one hook at a time

Swap hooks from seed to Firestore individually, starting with the ones booking
depends on: `useBooking`, then `useSchedule`, then the rosters. Keep the rest on
seed. The seam exists so this is incremental — resist a big-bang swap.

`schedule.js` and `season.js` stay the source of truth for the session pattern.
Seed the `sessions` collection from `buildSeason()` rather than hand-writing
documents, so the generated schedule and the database cannot drift.

## Constraints

- Do not touch `services/` or `functions/index.js`'s existing Twilio/Courier
  wiring. Reuse it for waitlist and booking notifications rather than rebuilding.
- Every athlete record is a minor's record. Any query that could return another
  family's data is a bug, not a preference.
- Keep commits one-concern. The last stretch was clean; stay that way.

## Decision gaps — write these down

You will hit places where the code needs a number or a rule nobody has decided.
Do not guess and do not stall. Create and maintain
`docs/portal/DECISION-GAPS.md` with one entry per gap:

- what the code needs
- what you assumed to keep moving (and where that assumption lives)
- what breaks if the real answer differs
- who can answer it

Known open already, so start with these: tournament block capacity
(`CAPACITY.tournament`, currently 14); makeup eligibility (one-for-one against a
missed booking, or open within the cycle); waitlist policy on a freed seat;
Elite's Phil and Yannick session counts; the holiday calendar, still provisional
in `season.js`.

That file is the agenda for Thursday. Make it good.
