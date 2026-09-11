import React, { useEffect, useMemo, useRef, useState } from 'react';
import { color, font, glow, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
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
import { useHouseholdAthletes } from '../hooks';
import * as hooks from '../hooks';
// Pure calendar/season helpers per the seam rule already established in
// BookSession.js/CommitmentContract.js/TourStandings.js - data still travels
// through the hook seam below; these are formatting helpers, not response
// data.
import { addDaysISO, longDayLabel, todayISO } from '../data/calendar';
import { dayLabel, datePill } from '../data/season';

/**
 * 05·S · Specialist Booking - athlete + parent (Sprint 9 pin, docs/portal/
 * TEAM.md, "specialist 1-on-1s"). Life Time's own class-scheduling flow,
 * translated: (1) a specialist picker, (2) a horizontal 14-day strip,
 * (3) the picked day's slot list, (4) a bottom detail sheet with one Reserve
 * CTA -> saving -> the confirmed state, following BookSession's confirmation
 * idiom (practice/live split aside - this flow has no practice mode; the
 * pin does not ask for one).
 *
 * ============================================================================
 * FLAGGED FALLBACKS - both routing-lane deliverables this screen codes
 * against, neither of which exists in this worktree yet (confirmed absent:
 * no data/specialists.js, no hooks.useSpecialistSlots, as of this branch).
 * The routing lane owns both in a parallel worktree (agent/routing/sprint9-
 * specialists). Everything below marked FALLBACK is a local stand-in only;
 * delete it once both land and this branch merges with routing's.
 *
 * 1. data/specialists.js (SPECIALISTS, SPECIALIST_BOOKING_WINDOW_DAYS) - a
 *    plain data import this screen is pinned to use, but the FILE itself
 *    does not exist in this worktree, which is a different situation from
 *    Roster.js/TourStandings.js's missing-EXPORT-in-an-existing-module case:
 *    a static import of a nonexistent file fails esbuild's bundle outright,
 *    so the namespace-import-with-fallback pattern those two files use does
 *    not apply here (it needs the module to exist, just not export the
 *    name yet). SPECIALISTS_FALLBACK below carries only the two facts
 *    TEAM.md pins verbatim per specialist (id/name/discipline/sessionNoun -
 *    real people, not invented) plus a one-line "what to expect" description
 *    - authored UI copy in the same spirit as every other hand-written
 *    screen description in this codebase (PackageCard's inclusion bullets,
 *    CommitmentContract's tier descriptions), never a fabricated business
 *    fact like a price, count or credential.
 * 2. hooks.useSpecialistSlots(specialistId) - genuinely missing from
 *    hooks/index.js in this worktree (confirmed via grep), so THIS one
 *    follows the real Roster.js/TourStandings.js pattern: namespace import +
 *    inert fallback, called unconditionally every render. The pin doesn't
 *    name where the actual reservation call lives beyond "the existing
 *    createBooking, unchanged signature - BookSession's confirmation idiom
 *    is the model" - I assumed the hook bundles its own `book(slot,
 *    {athleteId})` the exact way useBooking bundles its own book(). If
 *    routing lands it as a separately named export instead, this file's
 *    call site is a one-line rename, nothing structural. Until the real hook
 *    exists, `days` falls back to demoDaysFor() below - a believable
 *    fortnight matching the pin's own seed description ("Yannick Tue/Thu
 *    late afternoons, Phil Mon/Wed/Fri, 45-min slots" - invented TIMES only,
 *    per the pin's own explicit allowance for this exact seed, never
 *    invented people) - so the screen is reviewable end to end today.
 * ============================================================================
 */

const SPECIALISTS_FALLBACK = [
  {
    id: 'phil',
    name: 'Phil',
    discipline: 'Performance coaching',
    sessionNoun: 'Performance session',
    whatToExpect: 'One-on-one performance coaching, built around your swing and technique.',
  },
  {
    id: 'mental',
    name: 'Yannick',
    discipline: 'Mental game',
    sessionNoun: 'Mental game session',
    whatToExpect: 'One-on-one mental game work — focus, routine and course management.',
  },
];
const SPECIALIST_BOOKING_WINDOW_DAYS_FALLBACK = 14;

function useSpecialistSlotsFallback() {
  return {
    data: null,
    loading: false,
    error: null,
    // Inert: resolves the tapped slot locally, the same no-op shape
    // useBooking's book() takes when the app isn't live (see BookSession.js).
    book: async (slot) => slot,
  };
}
const useSpecialistSlots = hooks.useSpecialistSlots || useSpecialistSlotsFallback;
// Resolved once per module load alongside the fallback above (never
// mid-render, same invariant Roster.js documents) - tells the demo-data path
// below whether it's standing in for a genuinely absent hook (true, this
// worktree today) or riding shotgun on the real one once it lands (false).
const usingFallbackSpecialistHook = !hooks.useSpecialistSlots;

/**
 * Local stand-in for the real hook's seed branch (see the flagged-fallback
 * note above) - a believable 14-day fortnight, Yannick Tue/Thu, Phil
 * Mon/Wed/Fri, one demo slot per active day, every 5th active day already
 * "Booked" so both capacity states are reviewable. Dates derive from
 * todayISO()/addDaysISO() per this codebase's own rule that dates never get
 * hardcoded - only the CLOCK TIME is invented, exactly as the pin sanctions
 * for this screen's real seed branch.
 */
function demoDaysFor(specialistId) {
  const today = todayISO();
  const activeDows = specialistId === 'mental' ? [2, 4] : [1, 3, 5]; // Tue/Thu vs Mon/Wed/Fri
  const time = specialistId === 'mental' ? '4:30 PM' : '3:30 PM';
  const days = [];
  let activeIndex = 0;
  for (let i = 0; i < SPECIALIST_BOOKING_WINDOW_DAYS_FALLBACK; i++) {
    const date = addDaysISO(today, i);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    const active = activeDows.includes(dow);
    if (active) activeIndex++;
    days.push({
      date,
      dayLabel: dayLabel(date, today),
      slots: active
        ? [
            {
              sessionId: `${date}-demo-${specialistId}`,
              time,
              capacity: 1,
              booked: activeIndex % 5 === 0 ? 1 : 0,
              open: activeIndex % 5 !== 0,
            },
          ]
        : [],
    });
  }
  return days;
}

/**
 * @param {boolean} [bare]
 * @param {'athlete'|'parent'} [role]
 * @param {string} [initialAthleteId]  Sprint 7's book-for-kid deep-link
 *   pattern, reused verbatim (TEAM.md): preferred over the first household
 *   child once it loads, only when it names a real household athlete.
 *   Ignored for the athlete flow.
 * @param {() => void} [onBack]  Fires from the Confirmed view's Done button.
 * @param {() => void} [onSignOut]  Hidden when not supplied (harness/demo).
 * @param {'slots'|'sheet'|'confirmed'|'empty-day'} [harnessStage]
 *   HARNESS-ONLY - not part of the Sprint 9 pin's five-prop list. This
 *   screen has no `variant` prop in the pin (unlike every hook-backed demo
 *   variant elsewhere), so there is no other way to mount the gallery
 *   directly into the slots/sheet/confirmed/empty-day states without
 *   scripting real taps - the same problem TourStandings solved by adding a
 *   harness-local `variant` on top of a hook with no demoOpts of its own.
 *   Real callers (routing) never pass this; omitted it defaults to the
 *   picker, exactly matching the pinned contract. Flagged in the sprint
 *   report.
 */
export default function SpecialistBooking({
  bare = false,
  role = 'athlete',
  initialAthleteId,
  onBack,
  onSignOut,
  harnessStage,
}) {
  const initialSpecialistId = harnessStage ? SPECIALISTS_FALLBACK[0].id : null;
  const [specialistId, setSpecialistId] = useState(initialSpecialistId);
  const specialist = SPECIALISTS_FALLBACK.find((s) => s.id === specialistId) || null;

  const slotsState = useSpecialistSlots(specialistId);
  // Memoized so its identity only changes when specialistId or the real
  // hook's data actually changes - the effects below key off that stability
  // rather than an array literal rebuilt (and therefore "changed") on every
  // render. Falls back to the local demo fortnight ONLY while the real hook
  // is genuinely absent (see usingFallbackSpecialistHook) - once it lands,
  // a real loading state shows the skeleton honestly instead of demo data.
  const days = useMemo(() => {
    if (slotsState.data?.days) return slotsState.data.days;
    if (usingFallbackSpecialistHook && specialistId) return demoDaysFor(specialistId);
    return [];
  }, [specialistId, slotsState.data]);
  const loading = specialistId != null && slotsState.loading;
  const error = specialistId != null ? slotsState.error : null;

  const [selectedDate, setSelectedDate] = useState(() => {
    if (!initialSpecialistId) return null;
    const demo = demoDaysFor(initialSpecialistId);
    const pick =
      harnessStage === 'empty-day'
        ? demo.find((d) => d.slots.length === 0)
        : demo.find((d) => d.slots.length > 0);
    return (pick ?? demo[0])?.date ?? null;
  });
  const [sheetSlot, setSheetSlot] = useState(() => {
    if (harnessStage !== 'sheet' || !initialSpecialistId) return null;
    const demo = demoDaysFor(initialSpecialistId);
    const day = demo.find((d) => d.slots.some((s) => s.open));
    const slot = day?.slots.find((s) => s.open);
    return slot && day ? { ...slot, date: day.date } : null;
  });
  const [reserving, setReserving] = useState(null);
  const [failure, setFailure] = useState(null);
  const [booked, setBooked] = useState(() => {
    if (harnessStage !== 'confirmed') return null;
    return { specialist: SPECIALISTS_FALLBACK[0], date: todayISO(), time: '3:30 PM' };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialistId]);

  // Default to the first day this specialist actually has slots on, once a
  // specialist is picked and no day is selected yet - same "fill once, don't
  // fight a later manual choice" shape BookSession's own household-default
  // effect uses. `selectedDate` is deliberately IN the deps here (unlike
  // that effect) because the reset effect above needs this one to refire the
  // moment it clears selectedDate back to null.
  useEffect(() => {
    if (!specialistId || selectedDate || !days.length) return;
    const withSlots = days.find((d) => d.slots.length > 0);
    setSelectedDate((withSlots ?? days[0]).date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialistId, days, selectedDate]);

  // Parent 'Booking for' selector - the exact pattern BookSession.js already
  // uses (read there for the household + preferred-id logic this mirrors).
  const household = useHouseholdAthletes();
  const isParent = role === 'parent';
  const [selectedAthleteId, setSelectedAthleteId] = useState(null);
  const householdAthletes = household.data ?? [];
  useEffect(() => {
    if (!isParent || selectedAthleteId || !householdAthletes.length) return;
    const preferred = householdAthletes.some((a) => a.id === initialAthleteId)
      ? initialAthleteId
      : householdAthletes[0].id;
    setSelectedAthleteId(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParent, householdAthletes.length, initialAthleteId]);

  const reserve = slotsState.book || (async (slot) => slot);
  const disabledForNoAthlete = isParent && !selectedAthleteId;

  const confirmReserve = (slot) => {
    if (reserving) return;
    if (disabledForNoAthlete) return;
    setFailure(null);
    setReserving(slot.sessionId);
    Promise.resolve()
      .then(() => reserve(slot, isParent ? { athleteId: selectedAthleteId } : undefined))
      .then(() => {
        setReserving(null);
        setSheetSlot(null);
        setBooked({ specialist, date: slot.date, time: slot.time });
      })
      .catch((err) => {
        setReserving(null);
        setFailure(err && typeof err.message === 'string' && err.message ? err.message : null);
      });
  };

  if (booked) {
    return <Confirmed bare={bare} booked={booked} onBack={onBack} />;
  }

  const selectedDay = days.find((d) => d.date === selectedDate) || null;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {specialist ? (
            <BackLink onClick={() => setSpecialistId(null)}>‹ Specialists</BackLink>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <ScreenTitle>1-on-1 Coaching</ScreenTitle>
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
            <Body size={12}>
              Sessions with Phil and Yannick don't use your training or tournament allowance.
            </Body>
            {SPECIALISTS_FALLBACK.map((s) => (
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
              <DayStrip days={days} selectedDate={selectedDate} onSelect={setSelectedDate} />
            </div>
            <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <SlotList
                day={selectedDay}
                specialist={specialist}
                disabled={disabledForNoAthlete}
                reserving={reserving}
                onSelect={(slot, date) => {
                  setFailure(null);
                  setSheetSlot({ ...slot, date });
                }}
              />
            </div>
          </>
        )}
      </div>

      {sheetSlot ? (
        <DetailSheet
          specialist={specialist}
          slot={sheetSlot}
          saving={reserving === sheetSlot.sessionId}
          failure={failure}
          disabled={disabledForNoAthlete}
          onClose={() => {
            if (reserving) return;
            setSheetSlot(null);
            setFailure(null);
          }}
          onReserve={() => confirmReserve(sheetSlot)}
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
 * The 14-day window, today first, tappable pills - weekday + date, a dot
 * when the day has open slots. Same selected/unselected idiom as
 * MySchedule's Segmented control and BookSession's date pills (glow.datePill).
 */
function DayStrip({ days, selectedDate, onSelect }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 7,
        overflowX: 'auto',
        paddingBottom: 2,
        scrollbarWidth: 'none',
      }}
    >
      {days.map((d) => {
        const pill = datePill(d.date);
        const on = d.date === selectedDate;
        const hasOpen = (d.slots || []).some((s) => s.open);
        return (
          <button
            key={d.date}
            type="button"
            onClick={() => onSelect(d.date)}
            style={{
              width: 50,
              flex: 'none',
              padding: '9px 0',
              borderRadius: radius.control,
              border: on ? 'none' : `1px solid ${color.border}`,
              background: on ? color.primary : 'transparent',
              boxShadow: on ? glow.datePill : 'none',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                font: `400 10px ${font.body}`,
                textTransform: 'uppercase',
                opacity: on ? 1 : 0.7,
                color: on ? '#000' : color.textTertiary,
              }}
            >
              {pill.dow}
            </div>
            <div style={{ font: `700 17px ${font.head}`, color: on ? '#000' : color.text, marginTop: 2 }}>
              {pill.date}
            </div>
            <div style={{ height: 8, display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 3 }}>
              {hasOpen ? (
                <span
                  aria-hidden="true"
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: on ? '#000' : color.primary,
                  }}
                />
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The picked day's slots - time, 45 min, Open/Booked (capacity 1, so
 * binary). An empty day (no slots scheduled at all) gets the pinned quiet
 * line rather than an empty list.
 */
function SlotList({ day, specialist, disabled, reserving, onSelect }) {
  if (!day) return null;
  const slots = day.slots || [];
  return (
    <>
      <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{day.dayLabel}</div>
      {slots.length === 0 ? (
        <Body size={12}>No open times this day — try the next dot.</Body>
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
              meta="45 min"
              variant={slot.open ? 'default' : 'full'}
              onClick={slot.open && !disabled && !pending ? () => onSelect(slot, day.date) : undefined}
              trailing={
                <CapacityPill state={slot.open ? 'available' : 'full'}>
                  {slot.open ? 'Open' : 'Booked'}
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
 * time, one what-to-expect line, the pinned allowance-exemption line, and a
 * single Reserve CTA with a saving state. Same bottom-sheet idiom
 * CommitmentContract's DaySheet/LogSheet already use.
 */
function DetailSheet({ specialist, slot, saving, failure, disabled, onClose, onReserve }) {
  const [time, meridiem] = (slot.time || '').split(' ');
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
          {time} {meridiem} · 45 min
        </div>
        <Body size={12} style={{ marginTop: 12 }}>
          {specialist.whatToExpect}
        </Body>
        <Body size={12} tone={color.textTertiary} style={{ marginTop: 10 }}>
          This session does not use your training or tournament allowance.
        </Body>
        {failure ? (
          <Body size={12} tone={color.error} style={{ marginTop: 12 }}>
            {failure} Nothing was reserved — try again.
          </Body>
        ) : null}
        <Button height={54} loading={saving} disabled={disabled} style={{ marginTop: 18 }} onClick={onReserve}>
          {saving ? 'Reserving' : 'Reserve'}
        </Button>
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
            <Body size={12}>This session does not use your training or tournament allowance.</Body>
          </div>
        </Card>
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
