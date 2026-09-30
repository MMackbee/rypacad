import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font, radius, tint } from '../tokens';
import { SpendNote } from '../components/AllowancePools';
import { capReachedCopy, LockedDayNotice, reasonCopy, SeeMembershipLink } from '../components/BookingReasons';
import { JoinWaitlistButton, WaitlistedConfirmationBody } from '../components/WaitlistAction';
import BookingOpensBanner from '../components/BookingOpensBanner';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import CalendlyPanel from '../components/CalendlyPanel';
import { RangeCalendarCard } from '../components/CalendarCard';
import EntitlementSummary from '../components/EntitlementSummary';
import PhoneFrame from '../components/PhoneFrame';
import SessionCard from '../components/SessionCard';
import { CapacityPill } from '../components/StatusBadge';
import { Avatar } from '../components/MediaPlaceholder';
import SkeletonCard, { SkeletonBar, SkeletonSessionCard } from '../components/Skeleton';
import {
  BackLink,
  Body,
  Card,
  ErrorNotice,
  ScreenTitle,
  SectionLabel,
  SignOutButton,
  Tick,
} from '../components/Primitives';
import { seedSpecialistDays, useBooking, useHouseholdAthletes, useMembership, useSpecialistSlots } from '../hooks';
import { SPECIALISTS } from '../data/specialists';
import { windowDaysFor } from '../data/packages';
// Pure calendar/season helpers per the seam rule already established in
// BookSession.js/CommitmentContract.js/TourStandings.js - data still travels
// through the hook seam below; these are formatting helpers, not response
// data.
import { formatDuration, longDayLabel, openThrough, todayISO } from '../data/calendar';
import { slotDayMarks, slotDayStates } from '../data/calendarViews';

/**
 * Sprint 12 pin K (TEAM.md "Sprint 12 pins — the token model", contract
 * v2.0): Phil and Yannick sessions now spend an ORDINARY token — the old
 * fitness-package-sourced "N of M performance sessions" summary and the
 * "no fitness package on file" blocking notice are both deleted (fitness
 * packages don't exist any more; there is one catalogue, one pool). Only
 * Yannick's flat monthly cadence cap survives, per the pin: "the Sprint 11
 * 'no-fitness-package'/'cap-reached' Phil states are deleted; Yannick's
 * 'cap-reached' stays with copy 'next mental game session opens <date>'."
 * `useSpecialistSlots().data.tokens` replaces the old `.entitlement` (same
 * shape useMembership()'s per-member `tokens` returns, per the pinned hook
 * seam) — components/EntitlementSummary.js holds the copy derivation.
 *
 * 05·S · Specialist Booking - athlete + parent (Sprint 9 pin, docs/portal/
 * TEAM.md, "specialist 1-on-1s"). Life Time's own class-scheduling flow,
 * translated: (1) a specialist picker, (2) the shared Month/Week calendar card,
 * (3) the picked day's slot list, (4) a bottom detail sheet with one Reserve
 * CTA -> saving -> the confirmed state, following BookSession's confirmation
 * idiom (practice/live split aside - this flow has no practice mode; the
 * pin does not ask for one).
 */

/**
 * @param {boolean} [bare]
 * @param {'athlete'|'parent'} [role]
 * @param {string} [initialAthleteId]  Sprint 7's book-for-kid deep-link
 *   pattern, reused verbatim (TEAM.md): preferred over the first household
 *   child once it loads, only when it names a real household athlete.
 *   Ignored for the athlete flow.
 * @param {() => void} [onBack]  Fires from the Confirmed view's Done button.
 * @param {() => void} [onSignOut]  Hidden when not supplied (harness/demo).
 * @param {'slots'|'sheet'|'sheet-full'|'confirmed'|'confirmed-waitlisted'|'empty-day'} [harnessStage]
 *   HARNESS-ONLY - not part of the Sprint 9 pin's five-prop list. This
 *   screen has no `variant` prop in the pin (unlike every hook-backed demo
 *   variant elsewhere), so there is no other way to mount the gallery
 *   directly into the slots/sheet/confirmed/empty-day states without
 *   scripting real taps - the same problem TourStandings solved by adding a
 *   harness-local `variant` on top of a hook with no demoOpts of its own.
 *   Real callers (routing) never pass this; omitted it defaults to the
 *   picker, exactly matching the pinned contract. Flagged in the sprint
 *   report.
 * @param {boolean} [demoCapReached]  HARNESS-ONLY, same category as
 *   `harnessStage` above - previews Yannick's 'cap-reached' state (pin K) in
 *   place of the hook's own data. No real caller ever passes it.
 * @param {string} [harnessSpecialistId]  HARNESS-ONLY — which specialist
 *   `harnessStage` mounts directly into (defaults to SPECIALISTS[0], Phil).
 *   Lets the gallery deep-mount Yannick's flat-cap state too, the same way
 *   `harnessStage` itself skips the picker tap. No real caller ever passes
 *   this — routing always starts at the picker.
 */
export default function SpecialistBooking({
  bare = false,
  role = 'athlete',
  initialAthleteId,
  initialSpecialist,
  onBack,
  onSignOut,
  harnessStage,
  demoCapReached,
  harnessSpecialistId,
}) {
  const navigate = useNavigate();
  // A home-screen chooser deep-links straight to one specialist (initialSpecialist);
  // the picker is still one back-tap away.
  const initialSpecialistId = harnessStage ? harnessSpecialistId || SPECIALISTS[0].id : initialSpecialist ?? null;
  const [specialistId, setSpecialistId] = useState(initialSpecialistId);
  const specialist = SPECIALISTS.find((s) => s.id === specialistId) || null;

  // Declared ahead of useSpecialistSlots so the parent's selected child can
  // scope the hook's tokens (Sprint 12 pin K); stays null for an athlete,
  // whose own record the hook resolves by itself.
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const slotsState = useSpecialistSlots(specialistId, { athleteId: selectedAthleteId ?? undefined });
  // Pin D: every session type uses the athlete's own package window now
  // (SPECIALIST_BOOKING_WINDOW_DAYS deleted) - useMembership() supplies it.
  const membershipState = useMembership();
  const membershipMembers = membershipState.data?.members ?? [];
  // Memoized so its identity only changes when specialistId or the hook's
  // data actually changes - the effects below key off that stability rather
  // than an array literal rebuilt (and therefore "changed") on every render.
  const days = useMemo(() => slotsState.data?.days ?? [], [slotsState.data]);
  const loading = specialistId != null && slotsState.loading;
  const error = specialistId != null ? slotsState.error : null;

  // Harness stages seed off the hook's own exported seed generator, so the
  // gallery can never drift from what the real seed branch renders.
  const [selectedDate, setSelectedDate] = useState(() => {
    if (!initialSpecialistId) return null;
    const demo = seedSpecialistDays(initialSpecialistId, todayISO());
    const pick =
      harnessStage === 'empty-day'
        ? demo.find((d) => d.slots.length === 0)
        : demo.find((d) => d.slots.length > 0);
    return (pick ?? demo[0])?.date ?? null;
  });
  const [sheetSlot, setSheetSlot] = useState(() => {
    if ((harnessStage !== 'sheet' && harnessStage !== 'sheet-full') || !initialSpecialistId) return null;
    const demo = seedSpecialistDays(initialSpecialistId, todayISO());
    // Pin F: 'sheet-full' forces a slot closed so the gallery can preview
    // the waitlist CTA without depending on a genuinely full seed slot.
    if (harnessStage === 'sheet-full') {
      const day = demo.find((d) => d.slots.length > 0);
      const slot = day?.slots[0];
      return slot && day ? { ...slot, date: day.date, open: false } : null;
    }
    const day = demo.find((d) => d.slots.some((s) => s.open));
    const slot = day?.slots.find((s) => s.open);
    return slot && day ? { ...slot, date: day.date } : null;
  });
  const [reserving, setReserving] = useState(null);
  const [failure, setFailure] = useState(null);
  // Sprint 11 pin G: the typed reason behind `failure`'s message, when the
  // hook supplies one — see confirmReserve's catch block below.
  const [failureReason, setFailureReason] = useState(null);
  // Owner ruling 2026-09-22: a family chooses who attends a Yannick 1:1 - the
  // athlete, or the parent instead. Whose TOKEN is spent is a different
  // question, answered by the child selector above (a parent always books
  // against a named child), so the two controls stay separate.
  const [attendee, setAttendee] = useState('athlete');
  const [booked, setBooked] = useState(() => {
    if (harnessStage === 'confirmed-waitlisted') {
      return { specialist: SPECIALISTS[0], date: todayISO(), time: '3:30 PM', waitlisted: true };
    }
    if (harnessStage !== 'confirmed') return null;
    return { specialist: SPECIALISTS[0], date: todayISO(), time: '3:30 PM' };
  });

  // Selecting a new specialist starts a fresh day/sheet - carrying over a
  // date or a tapped slot from the previous specialist would be nonsense.
  // Skipped on the very first mount so a harness-seeded `harnessStage`
  // (slots/sheet/confirmed/empty-day) isn't immediately clobbered - the
  // reset only matters once specialistId genuinely CHANGES after mount.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setSelectedDate(null);
    setSheetSlot(null);
    setFailure(null);
    setFailureReason(null);
    setAttendee('athlete');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialistId]);

  // Default to the first day this specialist actually has slots on, once a
  // specialist is picked and no day is selected yet - same "fill once, don't
  // fight a later manual choice" shape BookSession's own household-default
  // effect uses. `selectedDate` is deliberately IN the deps here (unlike
  // that effect) because the reset effect above needs this one to refire the
  // moment it clears selectedDate back to null.
  useEffect(() => {
    // `loading` in the guard: while a fresh fetch runs, whatever days are
    // in hand are the PREVIOUS query's — picking a default off them landed
    // on an empty today instead of the first day with availability
    // (integration browser pass).
    if (!specialistId || selectedDate || loading || !days.length) return;
    const withSlots = days.find((d) => d.slots.length > 0);
    setSelectedDate((withSlots ?? days[0]).date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialistId, days, selectedDate, loading]);

  // Parent 'Booking for' selector - the exact pattern BookSession.js already
  // uses (read there for the household + preferred-id logic this mirrors).
  const household = useHouseholdAthletes();
  const isParent = role === 'parent';
  const householdAthletes = household.data ?? [];
  useEffect(() => {
    if (!isParent || selectedAthleteId || !householdAthletes.length) return;
    const preferred = householdAthletes.some((a) => a.id === initialAthleteId)
      ? initialAthleteId
      : householdAthletes[0].id;
    setSelectedAthleteId(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, householdAthletes.length, initialAthleteId]);

  const selfMember = isParent
    ? membershipMembers.find((m) => m.athleteId === selectedAthleteId) ?? null
    : membershipMembers[0] ?? null;
  const windowDays = windowDaysFor(selfMember?.package ?? null);
  const openThroughDate = openThrough(new Date(), windowDays);

  // Reservation rides BookSession's own seam (routing's ruling: no booking
  // action lives on the slots hook): useBooking's book() with the tapped
  // slot translated to its shape - { id, date, type }.
  const booking = useBooking({ withSlots: false });
  const reserve = (slot, opts) =>
    booking.book({ id: slot.sessionId, date: slot.date, type: specialistId }, opts);
  const disabledForNoAthlete = isParent && !selectedAthleteId;

  // Pin K: an ordinary token now. `capReached` is the hook's own mental
  // frequency flag; `demoCapReached` is the harness override.
  const tokens = slotsState.data?.tokens ?? null;
  const capReached =
    demoCapReached != null ? demoCapReached : specialistId === 'mental' && Boolean(slotsState.data?.capReached);
  const hasGrace = (tokens?.grace?.length ?? 0) > 0;
  const tokensSpent = tokens ? !tokens.unlimited && tokens.left === 0 && !hasGrace : false;
  // Sprint 20 (spec 5, D16): the hook computes bookingOpen(Date.now(), pkg)
  // (contract 4.3); absent (routing Task 10 not merged yet) reads as open so
  // the in-app list never locks on a missing field - the rules still refuse.
  const gateOpen = slotsState.data?.bookingOpen ?? true;
  const blocked = tokensSpent || capReached || !gateOpen;
  // Sprint 20 (spec 6.1): Yannick books through Calendly when the hook says so
  // (SPECIALISTS.mental.bookingMode === 'calendly' AND a URL is configured);
  // anything else - Phil, the seed, an emulator with no URL - keeps the slot
  // list. `householdId` is the hook's own (contract 4.3 as amended by D9: the
  // slots payload carries it for both the parent and the athlete caller).
  const calendly = specialistId === 'mental' && slotsState.data?.bookingMode === 'calendly' && Boolean(slotsState.data?.calendlyUrl);
  const householdId = slotsState.data?.householdId ?? null;

  const confirmReserve = (slot) => {
    if (reserving) return;
    if (disabledForNoAthlete || blocked) return;
    setFailure(null);
    setFailureReason(null);
    setReserving(slot.sessionId);
    Promise.resolve()
      .then(() =>
        reserve(slot, {
          ...(isParent ? { athleteId: selectedAthleteId } : {}),
          ...(specialist.id === 'mental' ? { attendee } : {}),
        }))
      .then((result) => {
        setReserving(null);
        setSheetSlot(null);
        // Pin F: book() resolves { status: 'waitlisted' } for a full slot.
        setBooked({
          specialist,
          date: slot.date,
          time: slot.time,
          tokens,
          waitlisted: result && result.status === 'waitlisted',
          position: result && result.position != null ? result.position : null,
        });
      })
      .catch((err) => {
        setReserving(null);
        // err.reason: 'no-tokens-left' | 'outside-window' | 'cap-reached' |
        // 'full' | 'membership-inactive' — read defensively; a non-typed
        // rejection falls back to the plain message.
        setFailureReason(err && err.reason ? err.reason : null);
        setFailure(err && typeof err.message === 'string' && err.message ? err.message : null);
      });
  };

  if (booked) {
    return <Confirmed bare={bare} booked={booked} onBack={onBack} />;
  }

  const selectedDay = days.find((d) => d.date === selectedDate) || null;
  const selectedDateLocked = Boolean(selectedDate) && selectedDate > openThroughDate;
  const dayStates = slotDayStates(days);
  // Tournament (yellow) / closed (red) days, derived in the hook from every
  // session on the date (calendar lane 2026-09-30).
  const dayMarks = slotDayMarks(days);
  // The same one-line caption Book a Session's card carries (toggle review).
  // A yellow day here is any tournament day, which may have no times with
  // this specialist - so "or yellow" only while every yellow day has some.
  const tournamentDays = Object.keys(dayMarks).filter((iso) => dayMarks[iso] === 'tournament');
  const yellowBookable = tournamentDays.length > 0 && tournamentDays.every((iso) => dayStates[iso] !== 'open');
  const calendarHint = `Days marked green${yellowBookable ? ' or yellow' : ''} have open times — tap one to see them.${
    Object.values(dayStates).includes('full') ? ' Dashed days are full — tap one for the waitlist.' : ''}`;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {specialist ? (
            <BackLink onClick={() => setSpecialistId(null)}>‹ Specialists</BackLink>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>
              {onBack ? <BackLink onClick={onBack}>‹ Back</BackLink> : null}
              <ScreenTitle style={{ marginTop: onBack ? 6 : 0 }}>Coaching</ScreenTitle>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <SignOutButton onSignOut={onSignOut} />
        </div>
      }
      footer={<BottomTabBar role={role} active={undefined} />}
    >
      <div style={{ padding: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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

        {!specialist ? (
          <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Body size={12}>Sessions with Phil and Yannick use a token, same as any other session.</Body>
            {SPECIALISTS.map((s) => (
              <SpecialistCard key={s.id} specialist={s} onSelect={() => setSpecialistId(s.id)} />
            ))}
          </div>
        ) : loading ? (
          <SlotsSkeleton />
        ) : error ? (
          <div style={{ padding: '0 22px' }}>
            <ErrorNotice title="Open times didn't load">
              {error && typeof error.message === 'string' && error.message
                ? error.message
                : "Open times didn't load. Check your connection and try again."}
            </ErrorNotice>
          </div>
        ) : (
          <>
            <div style={{ padding: '0 22px' }}>
              <SpecialistHeader specialist={specialist} />
            </div>
            <div style={{ padding: '0 22px' }}>
              <EntitlementSummary
                specialistId={specialistId}
                tokens={tokens}
                capReached={capReached}
                onSeeMembership={() => navigate('/portal/membership')}
              />
            </div>
            {calendly ? (
              <div style={{ padding: '0 22px' }}>
                <CalendlyPanel
                  data={slotsState.data}
                  tokens={tokens}
                  capReached={capReached}
                  attendee={attendee}
                  onAttendee={setAttendee}
                  householdId={householdId}
                />
              </div>
            ) : (
              <>
                {!gateOpen ? (
                  <div style={{ padding: '0 22px' }}>
                    <BookingOpensBanner />
                  </div>
                ) : null}
                {/* The shared Month/Week card; Month is the default, as on Book a
                    Session (tester 2026-09-30: the week strip confused), and a stored
                    choice still wins. Both views paint the window and share selectedDate. */}
                <div style={{ padding: '0 22px' }}>
                  <RangeCalendarCard
                    rangeStart={days[0]?.date}
                    rangeEnd={days[days.length - 1]?.date}
                    anchor={selectedDate}
                    dayStates={dayStates}
                    dayMarks={dayMarks}
                    variant="booking"
                    selected={selectedDate}
                    onSelectDay={(day) => setSelectedDate(day.iso)}
                    defaultView="month"
                    hint={calendarHint}
                  />
                </div>
                {selectedDateLocked ? (
                  <div style={{ padding: '0 22px' }}>
                    <LockedDayNotice date={selectedDate} windowDays={windowDays} gateOpen={gateOpen} />
                  </div>
                ) : (
                  <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <SlotList
                      day={selectedDay}
                      specialist={specialist}
                      disabled={disabledForNoAthlete || blocked}
                      reserving={reserving}
                      onSelect={(slot, date) => {
                        setFailure(null);
                        setSheetSlot({ ...slot, date });
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {sheetSlot ? (
        <DetailSheet
          specialist={specialist}
          slot={sheetSlot}
          tokens={tokens}
          saving={reserving === sheetSlot.sessionId}
          failure={failure}
          failureReason={failureReason}
          disabled={disabledForNoAthlete || blocked}
          capReached={capReached}
          onClose={() => {
            if (reserving) return;
            setSheetSlot(null);
            setFailure(null);
            setFailureReason(null);
          }}
          attendee={attendee}
          onAttendee={setAttendee}
          onReserve={() => confirmReserve(sheetSlot)}
          onSeeMembership={() => navigate('/portal/membership')}
        />
      ) : null}
    </PhoneFrame>
  );
}

/** One card per SPECIALISTS entry - avatar placeholder, name, discipline, blurb. */
function SpecialistCard({ specialist, onSelect }) {
  return (
    <Card large onClick={onSelect} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <Avatar size={56} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `700 18px ${font.head}`, color: color.text }}>{specialist.name}</div>
        <div
          style={{
            font: `500 11px ${font.body}`,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: color.textSecondary,
            marginTop: 3,
          }}
        >
          {specialist.discipline}
        </div>
        <Body size={12} style={{ marginTop: 8 }}>
          {specialist.whatToExpect}
        </Body>
      </div>
      <span aria-hidden="true" style={{ color: color.textTertiary, flex: 'none', alignSelf: 'center' }}>
        ›
      </span>
    </Card>
  );
}

function SpecialistHeader({ specialist }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Avatar size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `700 17px ${font.head}`, color: color.text }}>{specialist.name}</div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
          {specialist.discipline}
        </div>
      </div>
    </div>
  );
}

/**
 * The picked day's slots - time, the slot's real duration, and the spot state. v1.7.1: Phil's
 * sessions are GROUP sessions (capacity 6), so a capacity-above-1 slot says
 * how many spots remain ("4 spots left") the way Life Time's own class rows
 * do; a capacity-1 slot (Yannick) stays the binary Open/Booked. An empty day
 * (no slots scheduled at all) gets the pinned quiet line rather than an
 * empty list.
 */
function spotLabel(slot) {
  if (slot.capacity <= 1) return slot.open ? 'Open' : 'Booked';
  if (!slot.open) return 'Full';
  const left = slot.capacity - slot.booked;
  return `${left} spot${left === 1 ? '' : 's'} left`;
}

function SlotList({ day, specialist, disabled, reserving, onSelect }) {
  if (!day) return null;
  const slots = day.slots || [];
  return (
    <>
      <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{day.dayLabel}</div>
      {slots.length === 0 ? (
        <Body size={12}>No open times this day — pick another day.</Body>
      ) : (
        slots.map((slot) => {
          const [time, meridiem] = (slot.time || '').split(' ');
          const pending = reserving === slot.sessionId;
          return (
            <SessionCard
              key={slot.sessionId}
              time={time}
              meridiem={meridiem}
              type={specialist.id}
              name={specialist.sessionNoun}
              meta={formatDuration(slot.durationMinutes)}
              variant={slot.open ? 'default' : 'full'}
              // Pin F: a full slot's tap still opens the detail sheet - its
              // Reserve CTA becomes "Join waitlist" there (DetailSheet below).
              onClick={!disabled && !pending ? () => onSelect(slot, day.date) : undefined}
              trailing={
                <CapacityPill state={slot.open ? 'available' : 'full'}>
                  {spotLabel(slot)}
                </CapacityPill>
              }
            />
          );
        })
      )}
    </>
  );
}

/**
 * Bottom detail sheet on tap - specialist + discipline, long day label +
 * time, one what-to-expect line, what the booking spends (pin K: an ordinary
 * token now, not an allowance exemption), and a single Reserve CTA with a
 * saving state. Same bottom-sheet idiom CommitmentContract's DaySheet/
 * LogSheet already use.
 */
function DetailSheet({
  specialist,
  slot,
  tokens,
  saving,
  failure,
  failureReason,
  disabled,
  capReached,
  attendee,
  onAttendee,
  onClose,
  onReserve,
  onSeeMembership,
}) {
  const [time, meridiem] = (slot.time || '').split(' ');
  const full = !slot.open;
  return (
    <div
      onClick={saving ? undefined : onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: tint.overlay,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>{specialist.name}</ScreenTitle>
        <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
          {specialist.discipline}
        </div>
        <div style={{ font: `600 15px ${font.body}`, color: color.text, marginTop: 14 }}>
          {longDayLabel(slot.date)}
        </div>
        <div style={{ font: `400 13px ${font.body}`, color: color.textSecondary, marginTop: 3 }}>
          {time} {meridiem} · {formatDuration(slot.durationMinutes)}
        </div>
        <Body size={12} style={{ marginTop: 12 }}>
          {specialist.whatToExpect}
        </Body>
        <div style={{ marginTop: 10 }}>
          <SpendNote tokens={tokens} />
        </div>
        {specialist.id === 'mental' && onAttendee ? (
          <div style={{ marginTop: 14 }}>
            <SectionLabel>Who is attending?</SectionLabel>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {[['athlete', 'The athlete'], ['parent', 'A parent']].map(([value, label]) => {
                const on = attendee === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onAttendee(value)}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      cursor: 'pointer',
                      borderRadius: radius.input,
                      border: `1px solid ${on ? color.primary : color.controlBorder}`,
                      background: on ? tint.green : 'transparent',
                      color: on ? color.primary : color.textSecondary,
                      font: `600 13px ${font.body}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <Body size={11} tone={color.textTertiary} style={{ marginTop: 6 }}>
              Either way this books the session for the athlete and spends
              their token. Yannick sees who to expect.
            </Body>
          </div>
        ) : null}
        {full ? (
          <Body size={12} tone={color.secondary} style={{ marginTop: 12 }}>
            This time is full — joining the waitlist reserves one token.
          </Body>
        ) : null}
        {capReached ? (
          <Body size={12} tone={color.secondary} style={{ marginTop: 12 }}>
            {capReachedCopy()}
          </Body>
        ) : null}
        {failure ? (
          <div style={{ marginTop: 12 }}>
            <Body size={12} tone={color.error}>
              {reasonCopy(failureReason) ?? failure} Nothing was reserved — try again.
            </Body>
            {failureReason === 'membership-inactive' ? (
              <SeeMembershipLink onClick={onSeeMembership} style={{ marginTop: 6 }} />
            ) : null}
          </div>
        ) : null}
        {full ? (
          <JoinWaitlistButton loading={saving} disabled={disabled} height={54} onClick={onReserve} style={{ marginTop: 18 }} />
        ) : (
          <Button height={54} loading={saving} disabled={disabled} style={{ marginTop: 18 }} onClick={onReserve}>
            {saving ? 'Reserving' : 'Reserve'}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Sprint 6 pin (QA #2), reused verbatim for this flow's own child selector -
 * see BookSession.js's AthleteSelector, which this mirrors exactly (real
 * names only, from useHouseholdAthletes(); no household means nothing to
 * select).
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

/** The picker/loading layout in the loaded slot list's geometry. */
function SlotsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading open times"
      style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SkeletonBar tone="raised" width={40} height={40} r="50%" />
        <div style={{ flex: 1 }}>
          <SkeletonBar tone="raised" width={110} height={15} />
          <SkeletonBar tone="raised" width={130} height={9} style={{ marginTop: 6 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} height={68} style={{ width: 50 }} />
        ))}
      </div>
      <SkeletonSessionCard />
      <SkeletonSessionCard />
    </div>
  );
}

/** Confirmed - following BookSession's confirmation pattern. */
function Confirmed({ bare, booked, onBack }) {
  return (
    <PhoneFrame
      bare={bare}
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          <Button onClick={onBack}>Done</Button>
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
        {booked.waitlisted ? (
          // Pin F: book() resolved { status: 'waitlisted', position } for a
          // full slot.
          <WaitlistedConfirmationBody
            name={booked.specialist.sessionNoun}
            when={`${longDayLabel(booked.date)} · ${booked.time}`}
            position={booked.position ?? null}
          />
        ) : (
          <>
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

            <ScreenTitle size={26}>Reservation confirmed</ScreenTitle>

            <Card tone="green" large style={{ width: '100%', marginTop: 6 }}>
              <div style={{ font: `700 19px ${font.head}`, color: color.text }}>
                {booked.specialist.sessionNoun}
              </div>
              <div style={{ display: 'flex', gap: 26, marginTop: 14 }}>
                <MetaCol label="When" value={`${longDayLabel(booked.date)} · ${booked.time}`} />
                <MetaCol label="With" value={booked.specialist.name} />
              </div>
              <div style={{ borderTop: `1px solid ${color.border}`, marginTop: 14, paddingTop: 12 }}>
                <Body size={12}>Spends {spendLabelFor(booked.tokens)}.</Body>
              </div>
            </Card>
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

/** "elite" | "grace" | "token" spend copy — mirrors BookSession's own helper. */
function spendLabelFor(tokens) {
  if (!tokens) return '1 token';
  if (tokens.unlimited) return 'nothing — included with Elite';
  if ((tokens.grace?.length ?? 0) > 0) return 'a bonus token';
  return '1 token';
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
