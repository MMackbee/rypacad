import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { SessionsCalendarCard } from '../components/CalendarCard';
import SessionCard from '../components/SessionCard';
import { AgeGroupLegend } from '../components/AgeGroupChip';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { CapacityPill } from '../components/StatusBadge';
import AllowancePools, { GraceLine, SpendNote } from '../components/AllowancePools';
import PayButton from '../components/PayButton';
import { SessionTokenPools } from '../components/SessionTokens';
import { availableCount, BUY_SINGLE_LABEL, graceSpendLabel, isSingleTokenId, saleOpen, SINGLE_NOT_OPEN_LINE } from '../data/singleToken';
import { canRetry, LockedDayNotice, reasonCopy, SeeMembershipLink } from '../components/BookingReasons';
import { JoinWaitlistButton, leaveFailureCopy, OnWaitlist, waitingOn, WaitlistedConfirmationBody } from '../components/WaitlistAction';
import { BackLink, Banner, Body, Card, ErrorNotice, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { useBooking, useHouseholdAthletes, useMembership, useMonthSessions } from '../hooks';
import { leaveWaitlist } from '../hooks/waitlist';
// Pure calendar/season helpers, not response data - the data itself travels
// through the hook seam, but a formatting/derivation helper already imported
// elsewhere in this file stays importable (data/calendar.js's own header
// comment: "both data modes call it").
import BookingOpensBanner from '../components/BookingOpensBanner';
import { windowDaysFor } from '../data/packages';
import { SEASON_BOUNDS, capacityFor, dayLabel } from '../data/season';
import { DEFAULT_DURATION_MINUTES } from '../data/schedule';
import { tourEventExplainer } from '../data/tour';
import { bookingOpen, openThrough, parseTimeToMinutes, todayISO } from '../data/calendar';
import { lockPastDays, sessionStarted, waitlistClosed } from '../data/sessionStart';
import { buildMonthDayMaps, useMonthNavState } from '../components/MonthCalendar';
import RepeatWeekly from '../components/RepeatWeekly';

/** Sessions arrive raw (numeric capacity/booked) from useMonthSessions;
    useBooking's slots carry a pre-formatted capacity object. Accept both. */
function formatCapacity(session) {
  if (session.capacity && typeof session.capacity === 'object') return session.capacity;
  return capacityFor(session);
}

function displayNameFor(session) {
  return session.label || (session.type === 'tournament' ? 'Tour event' : 'Training block');
}

/** First-of-month ISO, shifted by whole months — day-of-month is always 1. */
// shiftMonth/MonthNav moved to components/MonthCalendar.js (code review
// 2026-09-04): shared calendar plumbing lives in components/, not in a
// sibling screen other screens have to import from.

/**
 * 05 · Book a Session - athlete.
 * States: Blocks open, Block full, Training limit reached, Tournament limit
 * reached, Confirmed.
 *
 * Sprint 5 redesign (TEAM.md pin): a month calendar in the Commitment
 * Contract calendar's visual language (ContractCalendar/DayGridCell, reused
 * rather than forked). Days with bookable sessions are marked and tappable;
 * tapping one opens that day's sessions below the grid for the athlete to
 * pick and confirm. The two limit states are separate because the allowance
 * is two pools. A spent tournament entitlement leaves every training block
 * bookable, and the reverse — so "limit reached" is never a property of the
 * screen, only of one pool.
 *
 * Sprint 6 pin (TEAM.md, QA #2): a parent booking for a linked athlete gets a
 * child selector above the calendar - which household athlete the booking is
 * for - sourced from the pinned `useHouseholdAthletes()` hook. The selection
 * travels into the reservation call as `book(slot, { athleteId })`; the
 * athlete flow is unaffected (no selector, no second argument). An athlete
 * account never sees the selector.
 *
 * @param {'open'|'full'|'limitTraining'|'limitTournament'|'confirmed'} variant
 * @param {'athlete'|'parent'} [role]
 *   Who is booking. Athlete (default) behaves exactly as before - no
 *   selector, own allowance. Parent renders the child selector and books
 *   against the selected child's allowance and identity.
 * @param {(slot) => Promise} [onBook]
 *   The live reservation call. While it is pending the tapped session shows
 *   the handoff's button-level pattern (spinner + "Reserving…"); a rejection
 *   renders inline with its reason and the day sheet stays open. With no
 *   onBook the tap confirms instantly — exactly the pre-live behavior.
 * @param {boolean} [practice]
 *   Onboarding practice mode (docs/portal/TEAM.md, "Onboarding program v1").
 *   Forwarded to useBooking as its pinned `{ practice: true }` option, which
 *   pins the hook to the seed source regardless of REACT_APP_PORTAL_LIVE_DATA.
 *   Zero Firestore writes: the booking stays in this component's state exactly
 *   as the pre-live flow does, and resets on unmount.
 * @param {string} [initialAthleteId]
 *   Sprint 7 pin (TEAM.md, "Book-for-kid deep link"): preferred over
 *   defaulting to the first child once the household loads - only when it
 *   matches one of the signed-in parent's own household athletes, so a stale
 *   or foreign id can never select someone else's child. Routing reads this
 *   off navigation state after ParentDashboard's per-kid Book chip. Ignored
 *   entirely for the athlete flow (no selector to default).
 * @param {(booked) => void} [onConfirmed]
 *   Fires once when the confirmation renders after a tap-through booking —
 *   `{ name, when }`. This is the onboarding step's completion signal: the
 *   step advances on the real confirmation, never on "Next" alone.
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 * @param {string} [demoSelectedDate]  HARNESS-ONLY — pre-selects a date
 *   (yyyy-MM-dd) on mount, bypassing the normal tap-a-day flow. No real
 *   caller ever passes it; it exists so the states gallery can deep-mount
 *   the "past the booking window" locked state (pin D) without scripting
 *   a month-navigation + tap sequence.
 * @param {boolean} [demoForceFull]  HARNESS-ONLY (pin F) — every session in
 *   the tapped day reads as full, so the gallery can preview "Join
 *   waitlist" without depending on a genuinely full session existing in the
 *   real season generator's output. No real caller ever passes it.
 */
export default function BookSession({
  variant = 'open',
  role = 'athlete',
  bare = false,
  practice = false,
  initialAthleteId,
  onBack,
  onBook,
  onConfirmed,
  onRetry,
  demoSelectedDate,
  demoForceFull = false,
}) {
  const navigate = useNavigate();
  // Kept for the existing booking behavior: book(), allowance, confirmation
  // copy — exactly the contract the screen already had (Sprint 5 pin).
  const { data, loading, error, book, bookRecurring, bookingFor } = useBooking({ variant, practice });
  // Month state + pre-season auto-jump live in the shared calendar module
  // (components/MonthCalendar.js) so this screen and the coach's Sessions
  // tab cannot drift.
  const firstBookable = data?.slots?.[0]?.date ?? null;
  const { monthISO, changeMonth } = useMonthNavState(firstBookable, todayISO());
  const monthState = useMonthSessions(monthISO, { practice });

  // Household athletes for the parent flow (Sprint 6 pin, QA #2) - always
  // called (rules of hooks); its result is only read when role === 'parent'.
  const household = useHouseholdAthletes();
  const isParent = role === 'parent';
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const householdAthletes = household.data ?? [];
  // Default to the first child once the household loads, without overriding
  // a parent's own switch. Sprint 7 pin (TEAM.md): initialAthleteId - the
  // Book chip's deep link - wins over that default, but ONLY when it names a
  // real household athlete; a stale or foreign id falls back to the first
  // child exactly as before rather than silently selecting nobody.
  useEffect(() => {
    if (!isParent || selectedAthleteId || !householdAthletes.length) return;
    const preferred = householdAthletes.some((a) => a.id === initialAthleteId)
      ? initialAthleteId
      : householdAthletes[0].id;
    setSelectedAthleteId(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, householdAthletes.length, initialAthleteId]);
  const selectedAthlete = isParent
    ? householdAthletes.find((a) => a.id === selectedAthleteId) ?? null
    : null;

  // Sprint 12 (contract v2.0, pin B/D): useMembership() is the pinned source
  // for a member's `package`/`tokens` shape - used here for the booking
  // window (package.windowDays) and, for the athlete flow, the tokens
  // banner/spend notes. The parent flow keeps reading tokens off
  // useHouseholdAthletes() (renamed alongside every other allowance->tokens
  // field in this sprint - see the sprint report) since it already carries
  // per-child data scoped to the household; useMembership() here supplies
  // only the window, matched by athleteId, so a stale membership fetch can
  // never show the wrong child's balance.
  const membershipState = useMembership();
  const membershipMembers = membershipState.data?.members ?? [];
  const selfMember = isParent
    ? membershipMembers.find((m) => m.athleteId === selectedAthleteId) ?? null
    : membershipMembers[0] ?? null;
  const windowDays = windowDaysFor(selfMember?.package ?? null);
  // Onboarding practice books seed data: no day is ever locked there, or the
  // walkthrough's booking step cannot be finished (Mike, 2026-09-30).
  const openThroughDate = practice ? SEASON_BOUNDS.end : openThrough(new Date(), windowDays);
  // Sprint 20 (spec 5, D16): the Oct 10 gate, proactively. Elite - the PAID
  // package, since the webhook corrects packageId to the paid price (spec
  // 4.3) - books at once; everyone else sees the schedule with Reserve inert
  // and the banner until 07:00 America/Chicago on Oct 10. Read once per
  // render off the same package the window comes from. The rules and
  // createBooking refuse independently; this only stops the attempt.
  // Onboarding practice books seed data and writes nothing - the gate never
  // applies there (the walkthrough's booking step must stay completable).
  const gateOpen = practice || bookingOpen(Date.now(), selfMember?.package ?? null);
  // The banner waits for the member row: an Elite family must not see
  // "Not open yet" flash while useMembership loads. Cards stay inert until
  // the package is known either way.
  const showGateBanner = !gateOpen && !membershipState.loading && selfMember != null;

  const [selectedDate, setSelectedDate] = useState(() => demoSelectedDate ?? null);
  // The slot the athlete just booked. Persistence is the API's job later; the
  // flow - tap a day, pick a session, land on the confirmation - has to work now.
  // demoBookedWaitlisted (HARNESS-ONLY, pin F): seed mode's book() has no
  // typed status yet (routing lane), so the waitlisted confirmation card is
  // otherwise unreachable by tapping through - this deep-mounts it directly.
  const [booked, setBooked] = useState(() =>
    demoForceFull && demoSelectedDate
      ? { name: 'Training block', dayLabel: dayLabel(demoSelectedDate, todayISO()), time: '4:00', meridiem: 'PM', waitlisted: true }
      : null
  );
  // The in-flight reservation (session id) and the last attempt's failure.
  const [reserving, setReserving] = useState(null);
  const [failure, setFailure] = useState(null);
  // "Leave waitlist" on a card the athlete already waits on: the session
  // mid-leave, and the last refusal in plain words (WaitlistAction.js). The
  // refusal sits above the list, as on My Schedule: a refused leave reloads
  // the month, and a row the athlete was promoted off no longer has the card.
  const [leavingId, setLeavingId] = useState(null);
  const [leaveFailure, setLeaveFailure] = useState(null);
  // It is about one day's card for one athlete: it goes when either changes.
  useEffect(() => {
    setLeaveFailure(null);
  }, [selectedDate, selectedAthleteId]);

  // A booking can resolve after the athlete has navigated away.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  // The completion signal for the onboarding walkthrough: fires exactly when
  // the athlete's own tap-through reaches the confirmation.
  useEffect(() => {
    if (booked && onConfirmed) {
      onConfirmed({
        name: booked.name,
        when: `${booked.dayLabel} · ${booked.time}`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booked]);

  // The reservation call: the onBook prop when a flow supplies one (the
  // onboarding walkthrough's practice path), otherwise the hook's own book()
  // — which is the real Firestore write in live mode and an instant no-op in
  // seed mode. Skipping book() when no prop was passed would confirm locally
  // without ever writing the booking.
  const reserve = onBook ?? book;
  // `joinWaitlist` is the Join waitlist button's own request (audit
  // 2026-09-30): a plain tap on a session that filled since this screen
  // loaded is refused as 'full', and the card then offers the waitlist.
  const confirmBooking = (session, { joinWaitlist = false } = {}) => {
    if (reserving) return;
    // A parent with nothing selected yet has no athlete to book against —
    // stay put rather than send an ambiguous reservation.
    if (isParent && !selectedAthleteId) return;
    // Closed gate: the card is inert already (DaySessionList `disabled`);
    // this covers a stale closure firing at the boundary.
    if (!gateOpen) return;
    setFailure(null);
    setLeaveFailure(null);
    setReserving(session.id);
    const opts = { ...(isParent ? { athleteId: selectedAthleteId } : {}), ...(joinWaitlist ? { joinWaitlist: true } : {}) };
    Promise.resolve()
      .then(() => reserve(session, Object.keys(opts).length ? opts : undefined))
      .then((result) => {
        if (!live.current) return;
        setReserving(null);
        // Pin F: book() now resolves { status: 'waitlisted' } for a full
        // session instead of rejecting 'full' — same `booked` state either way.
        finalizeBooked(session, result?.status === 'waitlisted', result?.position ?? null, result?.chargedFrom ?? null, result?.graceTokenId ?? null);
      })
      .catch((err) => {
        if (!live.current) return;
        setReserving(null);
        // err.reason: 'no-tokens-left' | 'outside-window' | 'cap-reached' |
        // 'full' | 'membership-inactive' — drives reasonCopy() below; falls
        // back to err.message for anything else.
        setFailure({
          sessionId: session.id,
          reason: err && err.reason ? err.reason : null,
          message: err && typeof err.message === 'string' && err.message ? err.message : null,
        });
      });
  };

  // Who the booking is for, by name - the waitlist copy says "<Name> is booked".
  const athleteName = (isParent ? selectedAthlete?.name : selfMember?.name) ?? null;
  // The write reloads this screen's lists itself, pass or fail; a refusal
  // (the athlete was just promoted) is said in the banner above the list.
  const leaveFromCard = (session, athleteId) => {
    if (leavingId || !athleteId) return;
    setLeaveFailure(null);
    setLeavingId(session.id);
    leaveWaitlist({ sessionId: session.id, athleteId })
      .catch((err) => {
        if (live.current) setLeaveFailure(leaveFailureCopy(err, athleteName));
      })
      .then(() => {
        if (live.current) setLeavingId(null);
      });
  };

  // The untouched slot the recurrence engine repeats from (its `time` is the
  // full "3:00 PM" string the session docs use; `booked` below splits it for
  // display).
  const bookedRaw = useRef(null);
  const finalizeBooked = (session, waitlisted = false, position = null, chargedFrom = null, graceTokenId = null) => {
    bookedRaw.current = session;
    const [time, meridiem] = session.time.split(' ');
    setBooked({
      ...session,
      time,
      meridiem,
      name: displayNameFor(session),
      dayLabel: dayLabel(session.date, todayISO()),
      waitlisted,
      position,
      // What the booking was actually charged to ('elite' | 'grace' |
      // 'period'), when the write says - the confirmation's "Spends" line.
      chargedFrom,
      // The grace token it spent, if any: a bought single token's id says so.
      graceTokenId,
    });
  };

  // Recurrence rides the confirmation screen, live bookings only (the demo
  // and the practice walkthrough never write, so they never offer repeats).
  const handleRepeat =
    bookingFor && !practice
      ? (untilISO) =>
          bookRecurring(bookedRaw.current, {
            athleteId: isParent ? selectedAthleteId : undefined,
            untilISO,
          })
      : undefined;

  // A parent's balance is the SELECTED child's, not the signed-in account's
  // own (a parent has no tokens of their own - the athlete does). The
  // schedule/slots themselves are athlete-agnostic (the same open blocks),
  // so only the tokens source changes for the parent flow. Sprint 12
  // (contract v2.0): ONE pool now - `tokens`, not `allowance` (renamed
  // alongside useMembership's own shape, per the sprint report).
  const tokens = isParent ? selectedAthlete?.tokens : data?.tokens;
  const days = monthState.data?.days ?? [];
  const { dayStates: paintedDayStates, sessionsByDate } = buildMonthDayMaps(days);
  // R2: a past day opens nothing. Practice books seed data and never locks.
  const dayStates = practice ? paintedDayStates : lockPastDays(paintedDayStates);
  const selectedSessionsRaw = selectedDate ? sessionsByDate[selectedDate] ?? [] : [];
  const selectedSessions = demoForceFull
    ? selectedSessionsRaw.map((s) => ({ ...s, capacity: { state: 'full', label: 'Full' } }))
    : selectedSessionsRaw;
  const selectedDateLocked = Boolean(selectedDate) && selectedDate > openThroughDate;

  if (booked) {
    return (
      <Confirmed
        bare={bare}
        confirmation={{
          name: booked.name,
          when: `${booked.dayLabel} · ${booked.time}`,
          // The charge the write made, when it said; else the screen's own read.
          spendLabel: chargeLabelFor(booked) ?? spendLabelFor(tokens),
          // Practice mode sends nothing to anyone - the seed guardian email
          // ("dana@email.com") read as a real notification in the athlete
          // walkthrough (QA 2026-09-08 #9).
          email: practice ? null : data?.confirmation?.email,
          // Elite has no token to keep, so its cancel line stops short.
          note: (tokens?.unlimited && data?.confirmation?.noteUnlimited) || data?.confirmation?.note,
          // For the add-to-calendar template link.
          date: booked.date,
          time: booked.time,
          meridiem: booked.meridiem,
          // Repeat weekly tells a closed week from a holiday extra by type.
          type: booked.type,
          // So the event a family keeps ends when the session does.
          durationMinutes: booked.durationMinutes,
          waitlisted: booked.waitlisted,
          // The waitlisted result carries the joiner's queue position; the
          // line degrades to generic copy while it is null.
          position: booked.position ?? null,
          athleteName,
          unlimited: Boolean(tokens?.unlimited),
        }}
        // Never for a single athlete: every repeated week spends a bought token.
        onRepeat={booked.waitlisted || tokens?.perPurchase ? undefined : handleRepeat}
        // The repeat reaches exactly as far as this athlete's window (the
        // selected child's, for a parent) - the same date that locks days.
        repeatWindow={{ end: openThroughDate, days: windowDays, elite: selfMember?.package?.kind === 'elite' }}
        onBack={() => setBooked(null)}
      />
    );
  }

  if (variant === 'confirmed') {
    return <Confirmed bare={bare} confirmation={data?.confirmation} onBack={onBack} />;
  }

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 16px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Back</BackLink> : null}
          <ScreenTitle style={{ marginTop: onBack ? 6 : 0 }}>Book a Session</ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role={role} active={isParent ? undefined : 'schedule'} />}
    >
      <div style={{ padding: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {loading ? (
          <BookingSkeleton />
        ) : error ? (
          <div style={{ padding: '0 22px' }}>
            <ErrorNotice title="Open blocks didn't load" onRetry={onRetry}>
              The schedule didn't load, and nothing was reserved. Check your connection and try
              again.
            </ErrorNotice>
          </div>
        ) : (
          <>
            {isParent ? (
              <div style={{ padding: '0 22px' }}>
                <AthleteSelector
                  athletes={householdAthletes}
                  loading={household.loading}
                  selectedId={selectedAthleteId}
                  onSelect={setSelectedAthleteId}
                />
              </div>
            ) : null}

            <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {showGateBanner ? <BookingOpensBanner /> : null}
              <TokensBanner
                tokens={tokens}
                athleteId={isParent ? selectedAthleteId : selfMember?.athleteId}
                billingStatus={isParent ? selectedAthlete?.billingStatus : selfMember?.billingStatus}
              />
              {data?.seasonNote ? (
                <Banner tone="green" title="Season">
                  {data.seasonNote}
                </Banner>
              ) : null}
            </div>

            {/* Month/Week toggle (owner request 2026-09-30): the shared card
                renders the same grid, handlers and captions in both views,
                plus the tournament (yellow) / closed (red) day marks the
                hook derives from the same read, and their legend. */}
            <div style={{ padding: '0 22px' }}>
              <SessionsCalendarCard
                monthISO={monthISO}
                changeMonth={changeMonth}
                loading={monthState.loading}
                dayStates={dayStates}
                dayMarks={monthState.data?.dayMarks ?? {}}
                selected={selectedDate}
                onSelectDay={(day) => setSelectedDate(day.iso)}
                onNavigate={() => setSelectedDate(null)}
                hint="Green and yellow days have bookable sessions — tap one to see times."
                emptyCopy={{ month: 'No sessions are scheduled yet.', week: 'No sessions are scheduled this week.' }}
              />
            </div>

            {selectedDate && selectedDateLocked ? (
              <div style={{ padding: '0 22px' }}>
                <LockedDayNotice date={selectedDate} windowDays={windowDays} gateOpen={gateOpen} />
              </div>
            ) : selectedDate ? (
              <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {failure ? (
                  <Banner tone="red" title="Booking didn't go through">
                    {reasonCopy(failure.reason) ?? failure.message ?? 'The reservation could not be completed.'} Nothing
                    was reserved{canRetry(failure.reason) ? ' - tap the session to try again.' : '.'}
                    {failure.reason === 'membership-inactive' ? (
                      <SeeMembershipLink onClick={() => navigate('/portal/membership')} style={{ marginTop: 8 }} />
                    ) : null}
                  </Banner>
                ) : null}
                {leaveFailure ? (
                  <Banner tone="yellow" title="Waitlist">
                    {leaveFailure}
                  </Banner>
                ) : null}
                <DaySessionList
                  iso={selectedDate}
                  sessions={selectedSessions}
                  tokens={tokens}
                  reserving={reserving}
                  // A parent with nothing selected has no athlete to spend a
                  // token for yet, and before the Oct 10 gate nobody but Elite
                  // reserves - sessions stay visible but inert either way.
                  disabled={(isParent && !selectedAthleteId) || !gateOpen}
                  onSelect={confirmBooking}
                  // Waitlist hardening: who is being booked (a parent's
                  // chosen child, or the athlete's own id), so a card they
                  // already wait on says so; the session a plain tap just
                  // found full; and R2's started check (never in practice).
                  athleteId={isParent ? selectedAthleteId ?? '' : selfMember?.athleteId ?? null}
                  athleteName={athleteName}
                  justFilledId={failure?.reason === 'full' ? failure.sessionId : null}
                  checkStarted={!practice}
                  leavingId={leavingId}
                  onLeave={leaveFromCard}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}



/**
 * The tapped day's sessions — time, type chip, spots left, and what the
 * booking would spend (Sprint 12, contract v2.0: one token pool, not a
 * per-session pool). Tapping a bookable one confirms it; a tokens-spent one
 * stays inert rather than failing at a later submit. A full one is no longer
 * dead (pin F): its tap now offers "Join waitlist" through the SAME
 * onSelect()/book() call — the server decides confirmed vs. waitlisted.
 */
function DaySessionList({
  iso,
  sessions,
  tokens,
  reserving,
  disabled,
  onSelect,
  athleteId = null,
  athleteName = null,
  justFilledId = null,
  checkStarted = false,
  leavingId = null,
  onLeave,
}) {
  return (
    <>
      <div style={{ font: `600 13px ${font.body}`, color: color.text, padding: '2px 0 2px' }}>
        {dayLabel(iso, todayISO())}
      </div>
      {/* The key sits with the blocks it explains, so a family reads it while
          choosing rather than hunting for it. Only when the day actually has a
          suggestion - Fridays, Saturdays and tournament-only days show none. */}
      {sessions.some((s) => s.ageGroup) ? <AgeGroupLegend style={{ margin: '2px 0 8px' }} /> : null}
      {/* What a Tour event is, on the day a family first meets one to book. */}
      {sessions.some((s) => s.type === 'tournament') ? <Body size={12}>{tourEventExplainer(tokens?.unlimited)}</Body> : null}
      {sessions.length === 0 ? (
        <Body size={12}>No sessions are scheduled yet.</Body>
      ) : (
        sessions.map((session) => {
          const [time, meridiem] = session.time.split(' ');
          const cap = formatCapacity(session);
          // `justFilledId`: a plain tap just found this one full - it reads
          // Full at once, with Join waitlist as its own tap.
          const isFull = cap.state === 'full' || session.id === justFilledId;
          // Two independent reasons a session cannot be booked, and they
          // need different copy: the block itself is full, or the athlete
          // has no tokens left (and no grace token standing in) to spend.
          // A bonus token stands in only for a session on or before its
          // expiry - the booking check's own rule (live.js selectGraceToken).
          const hasGrace = (tokens?.grace ?? []).some((g) => !g.expiresAt || g.expiresAt >= session.date);
          const tokensSpent = tokens ? !tokens.unlimited && tokens.left === 0 && !hasGrace : false;
          const pending = reserving === session.id;
          // Contract v2.0 pin J: the Saturday adult block is display-only -
          // adults pay at the front desk; it is never a junior booking.
          const displayOnly = session.bookable === false;
          // R2: a session that has started is shown, never offered.
          const started = checkStarted && !displayOnly && sessionStarted(session);
          // Already on this waitlist: say so and offer Leave, never Join again.
          const waiting = displayOnly || started ? null : waitingOn(session, athleteId);
          // R3: nobody is promoted on the day, so today's waitlist takes nobody new.
          const canWaitlist = isFull && !tokensSpent && !displayOnly && !started && !waiting && !(checkStarted && waitlistClosed(session));
          // A full card is never directly tappable - only its JoinWaitlistButton
          // is, so a tap can't double-fire book() via bubbling.
          const tappable = !displayOnly && !tokensSpent && !reserving && !disabled && !isFull && !started && !waiting;

          return (
            <SessionCard
              key={session.id}
              time={time}
              meridiem={meridiem}
              type={session.type}
              ageGroup={session.ageGroup}
              name={displayNameFor(session)}
              variant={isFull || tokensSpent || displayOnly || started || waiting ? 'full' : 'default'}
              gutter={54}
              ruleHeight={36}
              onClick={tappable ? () => onSelect(session) : undefined}
              // A bonus token that expires before this session is not what it spends.
              spendNote={displayOnly || started || waiting ? null : <SpendNote tokens={tokens && !hasGrace ? { ...tokens, grace: [] } : tokens} />}
              action={
                waiting ? (
                  <OnWaitlist
                    position={waiting.position}
                    name={athleteName}
                    unlimited={Boolean(tokens?.unlimited)}
                    closed={checkStarted && waitlistClosed(session)}
                    leaving={leavingId === session.id}
                    onLeave={onLeave ? () => onLeave(session, waiting.athleteId) : undefined}
                  />
                ) : pending ? (
                  <Button loading height={46} style={{ font: `600 14px ${font.body}` }}>
                    {canWaitlist ? 'Joining waitlist…' : 'Reserving…'}
                  </Button>
                ) : canWaitlist ? (
                  <JoinWaitlistButton
                    unlimited={Boolean(tokens?.unlimited)}
                    onClick={() => onSelect(session, { joinWaitlist: true })}
                    disabled={disabled}
                  />
                ) : null
              }
              trailing={
                <CapacityPill state={displayOnly || isFull || started || waiting ? 'full' : tokensSpent ? 'capped' : cap.state}>
                  {displayOnly ? 'Front desk' : started ? 'Started' : waiting ? 'Waitlisted' : isFull ? 'Full' : tokensSpent ? 'No tokens' : cap.label}
                </CapacityPill>
              }
              footnote={
                displayOnly
                  ? 'Adult block — booked and paid at the front desk, not through the portal.'
                  : tokensSpent && !isFull && !started && !waiting
                  ? 'This block has space — it is your tokens that are spent, not the session.'
                  : null
              }
            />
          );
        })
      )}
    </>
  );
}

/** "elite" | "grace" | "token" — which the next booking would spend, charge
 * order per contract §6 (Elite first, then a grace token, then a period
 * token). Used both for the pre-tap spend note and the Confirmed screen. */
function chargeKindFor(tokens) {
  if (!tokens) return 'token';
  if (tokens.unlimited) return 'elite';
  if ((tokens.grace?.length ?? 0) > 0) return 'grace';
  return 'token';
}

function spendLabelFor(tokens) {
  const kind = chargeKindFor(tokens);
  if (kind === 'elite') return 'Included with Elite';
  if (kind === 'grace') return graceSpendLabel(tokens);
  return '1 token';
}

/** The same labels by a booking's own `chargedFrom` (createBooking's result). */
const CHARGE_LABEL = { elite: 'Included with Elite', grace: 'a bonus token', period: '1 token' };

/** A grace charge paid with a bought single token (the write's graceTokenId says so) is a session token, never a bonus. */
function chargeLabelFor(booked) {
  if (booked.chargedFrom === 'grace' && isSingleTokenId(booked.graceTokenId)) return 'a session token';
  return CHARGE_LABEL[booked.chargedFrom];
}

/**
 * Sprint 6 pin (TEAM.md, QA #2) — which household athlete this booking is
 * for, above the calendar so the choice is made before the athlete-agnostic
 * calendar and allowance render for someone. Real names only, from
 * useHouseholdAthletes(); no household means nothing to select, so the card
 * disappears rather than showing an empty chooser.
 */
function AthleteSelector({ athletes, loading, selectedId, onSelect }) {
  if (loading) {
    return (
      <Card large>
        <SkeletonBar tone="raised" width={110} height={10} />
        <SkeletonBar tone="raised" height={44} r={radius.input} style={{ marginTop: 12 }} />
      </Card>
    );
  }
  if (!athletes.length) return null;

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>Booking for</SectionLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {athletes.map((a) => {
          const on = a.id === selectedId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.id)}
              style={{
                height: 44,
                padding: '0 16px',
                display: 'inline-flex',
                alignItems: 'center',
                borderRadius: radius.input,
                border: `1px solid ${on ? color.primary : color.border}`,
                background: on ? color.primary : 'transparent',
                font: `600 13px ${font.body}`,
                color: on ? '#000' : color.text,
                cursor: 'pointer',
              }}
            >
              {a.name}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * Persistent, above the calendar, never a dismissible toast.
 *
 * Sprint 12 (contract v2.0): ONE token pool now, so this collapses from the
 * two-pool banner to a single balance. A limited package hits a ceiling on
 * every visit, so the balance has to be standing context — surfacing it only
 * at submit turns a known constraint into a failed action, which is why this
 * is a banner and not an error. Elite shows no number (pin L).
 */
function TokensBanner({ tokens, athleteId, billingStatus }) {
  if (!tokens) return null;
  if (tokens.unlimited) {
    return (
      <Banner tone="green" title="Elite">
        Unlimited · every session type · no countdown.
      </Banner>
    );
  }
  // The single token (ruling 2026-09-29/30): bought, never reset - the
  // count plus a Buy button while the athlete's billing is active. Until
  // single tokens go on sale (owner ruling 2026-10-01, the booking-open
  // gate) the button is a line saying when.
  if (tokens.perPurchase) {
    const none = availableCount(tokens) === 0;
    return (
      <Banner tone={none ? 'red' : 'neutral'} title={none ? 'No session token' : 'Your session tokens'}>
        <SessionTokenPools tokens={tokens} style={{ margin: '4px 0 6px' }} />
        {!athleteId || (billingStatus ?? 'active') !== 'active' ? null : saleOpen() ? (
          <PayButton athleteId={athleteId} product="tier" label={BUY_SINGLE_LABEL} variant={none ? 'primary' : 'outline'} height={44} style={{ marginTop: 8 }} />
        ) : (
          <Body size={12} style={{ marginTop: 8 }}>{SINGLE_NOT_OPEN_LINE}</Body>
        )}
      </Banner>
    );
  }

  const hasGrace = (tokens.grace?.length ?? 0) > 0;
  const spent = tokens.left === 0 && !hasGrace;

  return (
    <Banner tone={spent ? 'red' : 'neutral'} title={spent ? 'No tokens left this period' : 'Your tokens this period'}>
      <AllowancePools tokens={tokens} style={{ margin: '4px 0 6px' }} />
      {hasGrace ? <GraceLine tokens={tokens} /> : null}
    </Banner>
  );
}

/**
 * The loading layout, in the loaded layout's geometry: allowance banner, then
 * the month calendar card. No spinner — lists load behind skeletons; spinners
 * are for actions (see components/Skeleton.js).
 */
function BookingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading open blocks"
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <div style={{ padding: '0 22px' }}>
        <SkeletonCard>
          <SkeletonBar tone="raised" width={150} height={11} />
          {[0, 1].map((i) => (
            <div key={i} style={{ marginTop: i ? 11 : 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <SkeletonBar tone="raised" width={64} height={11} />
                <SkeletonBar tone="raised" width={90} height={11} />
              </div>
              <SkeletonBar tone="raised" height={6} r={3} />
            </div>
          ))}
        </SkeletonCard>
      </div>

      <div style={{ padding: '0 22px' }}>
        <SkeletonCard large height={260} />
      </div>
    </div>
  );
}

/**
 * Google Calendar event-template URL for the booked block — floating local
 * times pinned by ctz, so no timezone math happens in the client. One-hour
 * blocks per the season convention. Null when the confirmation lacks a
 * parseable date/time (the button hides rather than dead-clicking).
 */
function calendarTemplateUrl(c) {
  // The confirmation splits time/meridiem for display; rejoin for the one
  // canonical 12-hour parser (data/calendar.js).
  const startMinutes = parseTimeToMinutes(`${c.time} ${c.meridiem || ''}`);
  if (!c.date || startMinutes == null) return null;
  // End when the session ends: Saturday's run two hours. Done in minutes so
  // a late start can never produce hour 24.
  const endMinutes = startMinutes + (c.durationMinutes || DEFAULT_DURATION_MINUTES);
  const h = Math.floor(startMinutes / 60);
  const mins = startMinutes % 60;
  const endH = Math.floor(endMinutes / 60) % 24;
  const endM = endMinutes % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const d = c.date.replace(/-/g, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `RYP Academy — ${c.name || 'Training block'}`,
    dates: `${d}T${pad(h)}${pad(mins)}00/${d}T${pad(endH)}${pad(endM)}00`,
    ctz: 'America/Chicago',
    details: 'Booked through the RYP Academy portal.',
    // Edina, not Eden Prairie (owner ruling, 2026-09-22): the invite carried
    // the wrong town, which is the one line of this app that lands in a
    // family's own calendar.
    location: 'RYP Academy, Edina, MN',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function Confirmed({ bare, confirmation, onRepeat, repeatWindow, onBack }) {
  const c = confirmation;
  const calUrl = c ? calendarTemplateUrl(c) : null;
  if (!c) return null;

  // Pin F: a waitlisted join renders the shared WaitlistedConfirmationBody
  // (components/WaitlistAction.js) - no repeat offer, no add-to-calendar.
  if (c.waitlisted) {
    return (
      <PhoneFrame
        bare={bare}
        footer={
          <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
            <Button variant="secondary" onClick={onBack} style={{ boxShadow: 'none' }}>
              Back to schedule
            </Button>
          </div>
        }
      >
        <div
          style={{ padding: '56px 22px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}
        >
          <WaitlistedConfirmationBody
            name={c.name}
            when={c.when}
            position={c.position}
            athleteName={c.athleteName}
            unlimited={c.unlimited}
          />
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame
      bare={bare}
      footer={
        <div
          style={{
            borderTop: `1px solid ${color.frameRule}`,
            padding: '14px 22px 22px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {calUrl ? (
            <Button onClick={() => window.open(calUrl, '_blank', 'noopener')}>
              Add to calendar
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onBack} style={{ boxShadow: 'none' }}>
            Back to schedule
          </Button>
        </div>
      }
    >
      <div
        style={{
          padding: '56px 22px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: tint.green,
            border: `2px solid ${color.primary}`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Tick size={26} color={color.primary} thickness={3} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <ScreenTitle size={26}>Slot reserved</ScreenTitle>
          {/*
            QA #13: never a dangling "Confirmation sent to " with nothing
            after it. Show the line only when the data actually provides a
            guardian/account email; drop it entirely otherwise rather than
            rendering half a sentence.
          */}
          {c.email ? (
            <Body size={13} style={{ marginTop: 8 }}>
              A confirmation is on its way to {c.email} - it also appears under your notices.
            </Body>
          ) : null}
        </div>

        <Card tone="green" large style={{ width: '100%', marginTop: 6 }}>
          <div style={{ font: `700 19px ${font.head}`, color: color.text }}>{c.name}</div>
          <div style={{ display: 'flex', gap: 26, marginTop: 14 }}>
            <MetaCol label="When" value={c.when} />
            <MetaCol label="Spends" value={c.spendLabel ?? '1 token'} />
          </div>
          <div
            style={{
              borderTop: `1px solid ${color.border}`,
              marginTop: 14,
              paddingTop: 12,
            }}
          >
            <Body size={12}>{c.note}</Body>
          </div>
        </Card>

        {onRepeat && repeatWindow ? (
          <RepeatWeekly
            date={c.date}
            time={`${c.time} ${c.meridiem}`}
            type={c.type}
            windowEnd={repeatWindow.end}
            windowDays={repeatWindow.days}
            elite={repeatWindow.elite}
            onRepeat={onRepeat}
          />
        ) : null}
      </div>
    </PhoneFrame>
  );
}

function MetaCol({ label, value }) {
  return (
    <div>
      <div
        style={{
          font: `400 10px ${font.body}`,
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          color: color.textTertiary,
        }}
      >
        {label}
      </div>
      <div style={{ font: `600 14px ${font.body}`, color: color.text, marginTop: 4 }}>{value}</div>
    </div>
  );
}
