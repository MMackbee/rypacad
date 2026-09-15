import React, { useState } from 'react';
import { color, font } from '../tokens';
import * as hooks from '../hooks';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import CancelSheet from '../components/CancelSheet';
import MediaPlaceholder from '../components/MediaPlaceholder';
import MemberSection from '../components/MemberSection';
import PhoneFrame from '../components/PhoneFrame';
import Segmented from '../components/Segmented';
import SessionCard from '../components/SessionCard';
import { SkeletonBar, SkeletonSessionCard } from '../components/Skeleton';
import { Body, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { SPECIALISTS } from '../data/specialists';
import { SEASON, SEASON_BY_DATE, dayLabel as seasonDayLabel, upcomingDates } from '../data/season';
import { todayISO } from '../data/calendar';

/**
 * 20 · Family Reservations — parent (Sprint 11 pin F, contract v1.9). Route
 * /portal/reservations, one of the parent tab bar's four stops (Home ·
 * Reservations · Tour · Settings — BottomTabBar.js). The owner's Life Time
 * reference: one family-grouped view, a section per household member, in
 * household order, each with Upcoming/Past tabs and date-block rows (date ·
 * time · duration · instructor · type chip). "Cancel reservation" reuses
 * MySchedule's own confirm-sheet pattern (components/CancelSheet.js) and the
 * exact same cancellable rule (confirmed && date > today). No waitlist state
 * this sprint.
 *
 * FALLBACK FLAG: `useHouseholdReservations()` does not exist in this
 * worktree yet — routing lane's parallel worktree owns hooks/index.js
 * (contract v1.9 F). Same fixed-reference swap Membership.js and
 * TourStandings.js already use for their own missing exports, so the hook
 * call stays unconditional (rules of hooks): `useHouseholdReservations`
 * below is the real export when present, otherwise a fallback that always
 * returns `{data: null, loading: false, error: null, cancel: <rejects>}`.
 * While the fallback is in effect, this screen's own `variant` prop drives
 * every state locally off real generated-season sessions (data/season.js —
 * the same season every other booking screen reads, never invented dates)
 * plus real specialist slot times (hooks' own exported `seedSpecialistDays`,
 * the same seed generator SpecialistBooking.js already uses for its demo
 * days). The moment routing's real export lands, `usingRealHook` flips true
 * and this screen is a pure pass-through — `variant='populated'` (the
 * default, and the only variant a live route ever passes) never touches the
 * local demo data again. Flagged in the sprint report.
 *
 * @param {'populated'|'loading'|'error'|'empty'} variant  Harness-only while
 *   the fallback above is in effect; ignored once the real hook lands.
 * @param {() => void} [onBook]  "Book a session" in the empty states.
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 */
function useHouseholdReservationsFallback() {
  return {
    data: null,
    loading: false,
    error: null,
    cancel: async () => {
      throw new Error('Cancelling is not available yet.');
    },
  };
}
// Looked up via a variable key, not `hooks.useHouseholdReservations` or
// `hooks['useHouseholdReservations']` — see components/useMembershipCompat.js's
// own doc for the full explanation: CRA's webpack build hard-errors "export
// not found" on EITHER form of a statically-known namespace property access
// that is genuinely absent from hooks/index.js (confirmed against the real
// dev server), unlike esbuild which only warns. Only a property name
// webpack cannot read directly out of the AST avoids the check.
const RESERVATIONS_KEY = 'useHouseholdReservations';
const useHouseholdReservations = hooks[RESERVATIONS_KEY] || useHouseholdReservationsFallback;
const usingRealHook = Boolean(hooks[RESERVATIONS_KEY]);

export default function Reservations({ variant = 'populated', bare = false, onBook, onRetry }) {
  const hookState = useHouseholdReservations();
  const [tab, setTab] = useState('upcoming');
  const [cancelTarget, setCancelTarget] = useState(null);

  const loading = usingRealHook ? hookState.loading : variant === 'loading';
  const error = usingRealHook
    ? hookState.error
    : variant === 'error'
    ? new Error("Reservations didn't load.")
    : null;
  const data = usingRealHook
    ? hookState.data
    : variant === 'empty'
    ? { members: [] }
    : variant === 'populated'
    ? demoReservations()
    : null;
  const cancel = hookState.cancel;

  const members = data?.members ?? [];
  const isEmpty = !loading && !error && members.length === 0;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <ScreenTitle size={22}>Reservations</ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role="parent" active="reservations" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Segmented value={tab} onChange={setTab} />

        {loading ? (
          <ReservationsSkeleton />
        ) : error ? (
          <ErrorNotice title="Reservations didn't load" onRetry={onRetry}>
            Your family's reservations didn't load. Check your connection and try again.
          </ErrorNotice>
        ) : isEmpty ? (
          <HouseholdEmptyState onBook={onBook} />
        ) : (
          members.map((member) => (
            <MemberSection key={member.athleteId} name={member.name}>
              <MemberList
                items={tab === 'past' ? member.past : member.upcoming}
                past={tab === 'past'}
                onBook={onBook}
                onCancelRequest={(item) => setCancelTarget({ ...item, athleteName: member.name })}
              />
            </MemberSection>
          ))
        )}
      </div>

      {cancelTarget ? (
        <CancelSheet
          summary={`${cancelTarget.athleteName} · ${cancelTarget.dayLabel} · ${cancelTarget.time} ${cancelTarget.meridiem} · ${cancelTarget.name}`}
          onClose={() => setCancelTarget(null)}
          onConfirm={() => cancel(cancelTarget.bookingId)}
          onCancelled={() => setCancelTarget(null)}
        />
      ) : null}
    </PhoneFrame>
  );
}

function MemberList({ items, past, onBook, onCancelRequest }) {
  if (!items || items.length === 0) {
    return (
      <Body size={12} tone={color.textTertiary} style={{ padding: '4px 2px' }}>
        {past ? (
          'Nothing attended yet this season.'
        ) : (
          <>
            No upcoming reservations
            {onBook ? (
              <>
                {' — '}
                <button
                  type="button"
                  onClick={onBook}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    font: `500 12px ${font.body}`,
                    color: color.primary,
                    cursor: 'pointer',
                  }}
                >
                  Book a session
                </button>
              </>
            ) : null}
          </>
        )}
      </Body>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {items.map((item) => {
        const dayOf = !past && item.isToday;
        const metaParts = [item.dayLabel, `${item.durationMinutes} min`];
        if (item.instructor) metaParts.push(item.instructor);
        return (
          <SessionCard
            key={item.id ?? item.bookingId}
            time={item.time}
            meridiem={item.meridiem}
            type={item.type}
            name={item.name}
            meta={metaParts.join(' · ')}
            variant={item.isToday ? 'live' : 'default'}
            action={
              past ? null : dayOf ? (
                <Body size={11} tone={color.textTertiary}>
                  Same-day cancellations aren't available in the app — contact the front desk.
                </Body>
              ) : item.cancellable && item.bookingId ? (
                <Button
                  variant="dangerOutline"
                  height={44}
                  style={{ boxShadow: 'none' }}
                  onClick={() => onCancelRequest(item)}
                >
                  Cancel reservation
                </Button>
              ) : null
            }
          />
        );
      })}
    </div>
  );
}

function HouseholdEmptyState({ onBook }) {
  return (
    <div
      style={{
        border: `1px dashed ${color.border}`,
        borderRadius: 16,
        padding: '34px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        textAlign: 'center',
      }}
    >
      <MediaPlaceholder height={56} style={{ width: 56 }} />
      <ScreenTitle size={18}>No linked athletes</ScreenTitle>
      <Body size={12}>
        This household has no linked athletes yet — link one from Settings before there's anything
        to reserve.
      </Body>
      {onBook ? (
        <Button height={46} onClick={onBook} style={{ marginTop: 6 }}>
          Book a session
        </Button>
      ) : null}
    </div>
  );
}

function ReservationsSkeleton() {
  return (
    <div role="status" aria-label="Loading reservations" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <SkeletonBar width={96} height={16} />
          <SkeletonSessionCard />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 * HARNESS-ONLY fallback data — see the module doc above. Built off the real
 * generated season (data/season.js) and the real specialist slot generator
 * (hooks' exported seedSpecialistDays) rather than invented dates/times.
 * "Past" stays empty for every member: `todayISO()` in this environment
 * predates the 2026-27 season's Nov 2 start, so there genuinely is no past
 * session to show yet — same honest gap data/seed.js's own BOOKED_PAST = []
 * already models. Never reached once hooks.useHouseholdReservations exists
 * (usingRealHook above).
 * ------------------------------------------------------------------------ */

const TODAY_ISO = todayISO();
const SPECIALIST_BY_ID = new Map(SPECIALISTS.map((s) => [s.id, s]));

function firstSessionOfType(type) {
  for (const date of upcomingDates(SEASON, TODAY_ISO, 60)) {
    const match = (SEASON_BY_DATE.get(date) || []).find((s) => s.type === type);
    if (match) return match;
  }
  return null;
}

function groupItemFrom(session, bookingIdPrefix) {
  if (!session) return null;
  const [time, meridiem] = (session.time || '').split(' ');
  return {
    id: session.id,
    date: session.date,
    dayLabel: seasonDayLabel(session.date, TODAY_ISO),
    isToday: session.date === TODAY_ISO,
    time,
    meridiem,
    type: session.type,
    name: session.label || (session.type === 'tournament' ? 'Tournament block' : 'Training block'),
    // The generator assigns no coach — nothing invented, same as every other
    // screen that reads a group session's (absent) coachId.
    instructor: null,
    durationMinutes: 60,
    bookingId: `${bookingIdPrefix}_${session.id}`,
    status: 'confirmed',
    cancellable: session.date > TODAY_ISO,
  };
}

function firstSpecialistItem(specialistId, bookingIdPrefix) {
  const specialist = SPECIALIST_BY_ID.get(specialistId);
  const days = hooks.seedSpecialistDays(specialistId, TODAY_ISO);
  for (const day of days) {
    const slot = (day.slots || [])[0];
    if (!slot) continue;
    const [time, meridiem] = (slot.time || '').split(' ');
    return {
      id: slot.sessionId,
      date: day.date,
      dayLabel: day.dayLabel,
      isToday: day.date === TODAY_ISO,
      time,
      meridiem,
      type: specialistId,
      name: specialist.sessionNoun,
      instructor: specialist.name,
      durationMinutes: 45,
      bookingId: `${bookingIdPrefix}_${slot.sessionId}`,
      status: 'confirmed',
      cancellable: day.date > TODAY_ISO,
    };
  }
  return null;
}

function demoReservations() {
  const training = groupItemFrom(firstSessionOfType('training'), 'jordan');
  const tournament = groupItemFrom(firstSessionOfType('tournament'), 'reese');
  const phil = firstSpecialistItem('phil', 'jordan');
  const mental = firstSpecialistItem('mental', 'reese');

  return {
    members: [
      {
        athleteId: 'jordan',
        name: 'Jordan',
        upcoming: [training, phil].filter(Boolean),
        past: [],
      },
      {
        athleteId: 'reese',
        name: 'Reese',
        upcoming: [tournament, mental].filter(Boolean),
        past: [],
      },
      {
        athleteId: 'nico',
        name: 'Nico',
        upcoming: [],
        past: [],
      },
    ],
  };
}
