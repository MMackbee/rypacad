# Cancel up to the start, Move any booking - spec

Owner request 2026-11-11, description approved the same day ("go with your recommendations"). Branch `feat/booking-changes` from develop 94d7e4d. Recon: workflow wf_bef02016-411 (five readers: family UI, write paths, rules, staff side, policy copy).

## 1. Why

A parent emailed the owner at 10 AM to move two kids off that day's 4 PM training: "I'm not able to cancel or adjust in the portal." Today a family can cancel only until the day before, the day itself shows "Same-day cancellations aren't available in the app - contact the front desk.", and there is no Move at all (changing days means cancel and rebook). So every switch on the day lands in the owner's inbox and is done by hand, and coaches mark kids who simply stayed home as no-shows and type the reason.

Owner: "we need to make the cancel and reschedule process easier so that I dont have parents in my inbox"; "Move or cancel with reason so that im not doing no shows, and reasons for no shows"; on the token: "no give them the token back, we dont care that much as long as they let us know".

Success: a family that can't make a session cancels or moves it in the app right up to the start, says why, and the coach sees it on the list. The owner gets no email for it.

## 2. Goals

1. A family (parent login, or an athlete with their own login) can **cancel** any portal booking **until the session starts**, choosing a reason. The token always comes back.
2. A family can **move** any portal booking **until the session starts** to another open session of the same kind in their booking window, in one step.
3. Coaches see family cancels with their reason, and moves, on the session attendance list, greyed and not counted.
4. No email or notice to the owner or staff. The family gets the usual cancel receipt (cancel) or booking confirmation (move).

## 3. Non-goals and anti-goals

- Not: Yannick's mental 1:1s. Calendly bookings already move and cancel in Calendly; portal-booked `mental` bookings keep today's rule (cancel until the day before, no Move), because Yannick's signed consent form promises 24 hours' notice. *Claude's call.*
- Not: any limit on how often a family cancels or moves; no late-cancel fee; no owner report of reasons.
- Not: any change to waitlist rules (owner ruling R3 2026-10-01: nobody is promoted off a waitlist on the session's own day; a seat freed on the day just stays open for anyone to book or move into).
- Anti-goal: a family losing their original seat because a move half-failed, or getting two emails (receipt plus confirmation) for one move.
- Anti-goal: a cancel after the start giving the token back (that is a no-show; the owner's line).

## 4. Cancel

**When:** from booking until the session's start time (academy clock, America/Chicago). After the start the Cancel button is gone and the row reads "This session has already started." For portal `mental` bookings the old rule stays (until the day before).

**Reason (required in the new app):** the cancel sheet asks "Why can't {first name} make it?" with choices **Sick**, **Injured**, **School**, **Family conflict**, **Other**. Other opens a short note ("A few words", max 140 characters, required with Other). The cancel button stays disabled until a reason is picked. Series cancel ("Cancel this and N later weeks") asks once and stores the same reason on every week.

**Token:** a cancelled booking never counts against the family's tokens (already true today on any day; nothing to build beyond allowing it).

**Receipt:** unchanged (the family's own cancel gets the existing "booking cancelled" receipt; `cancelReason: 'member'` stays the value that triggers it).

**Stored on the booking** (all new, all optional at the rules level so older app versions keep working):
- `cancelCategory`: `'sick' | 'injured' | 'school' | 'family' | 'other'`
- `cancelNote`: string, max 140, only with `'other'`
- `cancelledAt`: server time of the cancel

**Server check:** the rules refuse a family cancel after the session's start time (parsed from the session's `date` and `time` text, Chicago; an unparseable time falls back to today's midnight floor). This only narrows the window for a cancel after the start; older app versions never offer a cancel on the day, so they are unaffected.

## 5. Move

**Where:** a **Move** button next to Cancel on every portal booking a family can still cancel (same screens: parents on Reservations, athlete logins on My Schedule). Not on `mental` bookings, not on Calendly bookings, not after the start.

**The picker:** "Move to another {Training block | Tour event | Phil session}". It lists, day by day from today to the end of the athlete's booking window, every session of the **same kind** that the athlete could book right now if this booking did not exist:
- not started, not cancelled by the academy, not hidden, not display-only;
- has room;
- the reserved handicap block only if the athlete qualifies;
- a token is available for that session's period, counting the booking being moved as given back when it is in the same period;
- not a session the athlete already holds.
If nothing qualifies: "No open sessions like this in your booking window." Tapping a session asks "Move {name} from {old day, time} to {new day, time}?" with Move / Keep it.

**What a move does (one atomic server step):** the old booking is cancelled (`cancelReason: 'moved'`, `movedTo`), its seat is freed, and the athlete is booked into the new session (`movedFrom` on the new booking), charged exactly the way a fresh booking on the new day would be charged with the old booking counted as given back. In practice:
- same token period: the token moves with it (a grace or single token carries over while it is still valid on the new date);
- a different period (for example late November to early December): the new period's token is used and the old one comes back.
If anything fails, nothing changes and the family keeps the original booking. The old session's freed seat goes to the waitlist exactly as a cancel would (the day-of rule R3 included).

**Comp (free) bookings** (written by `scripts/comp-booking.mjs`: `comp: true`, for athletes whose billing is still pending): Move is offered and the booking **stays free** wherever it goes, any period. The move skips the billing check and the token charge for a comp booking, and copies `comp: true` (and its other comp fields) to the new booking. A comp is still one free session; moving it gives nothing extra. The picker for a comp booking lists sessions by every rule above except the token and billing ones. A comp cancel's sheet and receipt never mention a token coming back. *Claude's call.*

**Unpaid or frozen accounts** (an athlete whose billing is pending, a household that is past_due or lapsed) with an ordinary (non-comp) booking: Cancel is offered as today, Move is not shown (they could not book the new session either). *Claude's call.*

**Emails:** no cancel receipt for the old booking; the normal booking confirmation for the new one, including when the new session is one the athlete had booked and cancelled before.

**Why a server step (callable Cloud Function `moveBooking`) and not two app writes:** two writes can lose the seat between them (the waitlist grabs it), double-charge, trip the single-token guard (which cancels the newer of two spends and emails "booking released"), and send two emails. The callable runs every booking check on the server in one transaction, using the same charge and gate logic the server already has.

## 6. Coaches (attendance list)

- Below the athletes on a session's attendance screen, family cancels that carry a reason show greyed: "{name} · Cancelled · Sick" (Other shows the note: "Cancelled · Other: dentist"). Moved-away bookings show greyed "{name} · Moved to Thu Nov 12, 4:00 PM". They are not counted in booked / in / out, cannot be marked IN or OUT, and are hidden when the academy cancelled the whole session.
- A coach whose screen is stale and taps IN or OUT on a kid who just cancelled sees "{name} cancelled - list updated." and the list refreshes, instead of a silent refusal.
- Coaches cannot change a family's reason.
- No-shows stay exactly as they are for kids who neither came nor told anyone.

## 7. Copy changes (app, emails, website)

Old policy wording goes everywhere it appears. Elite copy never mentions tokens.
- Booking confirmation note (tokens): "Plans change? Cancel or move it in the app any time before it starts. The token comes back."
- Booking confirmation note (Elite): "Plans change? Cancel or move it in the app any time before it starts."
- My Schedule / Reservations day-of line: removed; Cancel and Move show until the start; after the start "This session has already started."
- Book screen "booked in" note: "{name} is booked in. Cancel or move it from {Reservations | My Schedule} if plans change." (the day-of variant is deleted).
- Athlete home: " Cancel any time before a session starts and the token comes back."
- Waitlist: "You can cancel or move it any time before it starts."
- Booking-confirmed email: " You can cancel or move it in the app any time before it starts."
- Website FAQ (repo `ryp-academy-site`, `public/faq.html`): "Cancel in the portal any time before the session starts and the token comes back, ready for any other open block. You can also move a booking to another open session. A session missed without cancelling uses its token."
- New strings as in sections 4-6.
- Stale code comments and docs that state the old rule are corrected in the same change (no behaviour).

## 8. Data, rules and functions (additive)

- Rules, family cancel arm: allow the optional `cancelCategory`, `cancelNote`, `cancelledAt` (validated as in section 4), keep `cancelReason == 'member'`, keep `cancelledVia` absent or `'series'`, add the before-start check.
- Rules, re-book arm: may also remove `cancelCategory`, `cancelNote`, `cancelledAt` so a re-confirmed booking does not carry an old reason. Every reader still checks `status == 'cancelled'` before showing a reason.
- Rules, reads: no change (coach, mental, ops and owner already read any booking).
- Functions: new callable `moveBooking({ bookingId, toSessionId })`; the booking-confirmed notice for a move onto a previously cancelled booking (the create trigger does not fire there) uses a notice key that is not blocked by the earlier confirmation for that booking id; `cancelReason: 'moved'` stays silent.
- Deploy order: functions, then rules, then the app (staging first, then production). The website FAQ ships with or after the app.

## 9. Calls Claude made (owner approved "go with your recommendations")

1. Cutoff is the session start; after that it is a no-show (and the rules enforce it).
2. Reasons: Sick, Injured, School, Family conflict, Other (+ note). Required in the new app.
3. Move only to the same kind of session, only with room, handicap block only if eligible, inside the booking window.
4. A move across token periods uses the new period's token (the old one comes back).
5. Portal mental bookings keep the day-before rule and get no Move.
6. Coaches see reasons and moves greyed under the list; moved rows show where to.
7. Series cancel asks once for all weeks.
8. A comp (free) booking can be moved and stays free; its cancel copy never promises a token back.
9. Unpaid or frozen accounts can cancel but see no Move on ordinary bookings.

Builder check (wf_6638c1ee-da8, two builders, 2026-11-11): both raised only the comp / unpaid-account question; settled as calls 8 and 9.

## 10. Left to the builder

Component and file structure (files under 500 lines; `BookSession.js`, `hooks/index.js`, `hooks/live.js`, `Roster.js`, `data/seed.js` are already large and change only where they must); how the picker loads sessions (once, when opened); the server-side time parser; where the bookability rule is shared between the Book tab and the picker; test layout (jest, rules probes in `scripts/rules-probes/`, functions unit tests); emulator QA.

## 11. Constraints

- Production and staging share one Firebase backend with real families: rules and functions changes must keep older app versions working.
- Repo files are CRLF; no real family names or phone numbers in code, tests or commits; "Tour event", never "tournament", in user-facing copy.
- Jest, eslint, the production build, functions tests and `verify-rules` stay green; new rules probes for every case in sections 4, 5 and 8.
