import React, { useState } from 'react';
import { color, font } from '../tokens';
import { useHouseholdReservations } from '../hooks';
import { leaveWaitlist } from '../hooks/waitlist';
import { formatDuration } from '../data/calendar';
import { attendeeNoteFor } from '../data/specialists';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import CancelSheet from '../components/CancelSheet';
import { CALENDLY_MANAGED_COPY, cancelReasonCopy } from '../components/BookingReasons';
import { LeaveWaitlistButton, WaitlistPositionLine } from '../components/WaitlistAction';
import MediaPlaceholder from '../components/MediaPlaceholder';
import MemberSection from '../components/MemberSection';
import PhoneFrame from '../components/PhoneFrame';
import Segmented from '../components/Segmented';
import SessionCard from '../components/SessionCard';
import StatusBadge from '../components/StatusBadge';
import { SkeletonBar, SkeletonSessionCard } from '../components/Skeleton';
import { Body, ErrorNotice, ScreenTitle } from '../components/Primitives';

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
 * `variant` is harness-only: every live route passes the default
 * 'populated', a pure pass-through of useHouseholdReservations() (seed or
 * live). The other three states need no data and drive the same branches
 * locally, the way TourStandings' variant does.
 *
 * @param {'populated'|'loading'|'error'|'empty'} variant  Harness-only (see above).
 * @param {() => void} [onBook]  "Book a session" in the empty states.
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 * @param {Array} [demoMembers]  HARNESS-ONLY — an explicit members array,
 *   rendered as if `variant === 'populated'` had returned it. Real routes
 *   never pass this; it exists so the states gallery can preview the
 *   `nextPeriod: true` badge (pin B) the seed doesn't produce yet.
 */

export default function Reservations({ variant = 'populated', bare = false, onBook, onRetry, demoMembers }) {
  const hookState = useHouseholdReservations();
  const [tab, setTab] = useState('upcoming');
  const [cancelTarget, setCancelTarget] = useState(null);
  // Mirrors MySchedule's leave-waitlist state; the write bumps bookings, so
  // the household list refreshes through its own seam.
  const [leavingId, setLeavingId] = useState(null);
  const handleLeaveWaitlist = async (item) => {
    setLeavingId(item.bookingId ?? `${item.athleteId}_${item.id}`);
    try {
      await leaveWaitlist({ sessionId: item.sessionId ?? item.id, athleteId: item.athleteId });
    } finally {
      setLeavingId(null);
    }
  };

  const demo = variant !== 'populated' || Boolean(demoMembers);
  const loading = demoMembers ? false : demo ? variant === 'loading' : hookState.loading;
  const error = demoMembers ? null : demo ? (variant === 'error' ? new Error("Reservations didn't load.") : null) : hookState.error;
  const data = demoMembers ? { members: demoMembers } : demo ? (variant === 'empty' ? { members: [] } : null) : hookState.data;
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
                onLeaveWaitlist={(item) => handleLeaveWaitlist({ ...item, athleteId: member.athleteId })}
                leavingId={leavingId}
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

function MemberList({ items, past, onBook, onCancelRequest, onLeaveWaitlist, leavingId }) {
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
        // Sprint 13 (contract v2.1, pin F/G): a waitlisted or system-
        // cancelled item can ride the same upcoming/past arrays (once
        // routing's hook update lands) — see MySchedule.js's own comment.
        const waitlisted = item.status === 'waitlisted';
        const rowCancelled = item.status === 'cancelled';
        const metaParts = [item.dayLabel, formatDuration(item.durationMinutes)].filter(Boolean);
        if (item.instructor) metaParts.push(item.instructor);
        // Contract v2.1: only a Yannick 1:1 can be booked for the parent,
        // and the family who chose that needs to see which row it was.
        const attending = attendeeNoteFor(item);
        if (attending) metaParts.push(attending);
        return (
          <SessionCard
            key={item.id ?? item.bookingId}
            time={item.time}
            meridiem={item.meridiem}
            type={rowCancelled ? 'cancelled' : item.type}
            ageGroup={rowCancelled ? null : item.ageGroup}
            name={item.name}
            meta={metaParts.join(' · ')}
            variant={rowCancelled ? 'cancelled' : item.isToday ? 'live' : 'default'}
            footnote={rowCancelled ? cancelReasonCopy(item.cancelReason) : null}
            trailing={
              waitlisted ? (
                <StatusBadge tone="yellow">Waitlisted</StatusBadge>
              ) : // Sprint 12 (contract v2.0, pin B): a booking charges against
              // the period its session date falls in, not the period it was
              // made in - a future-period booking is a confirmed booking
              // whose period hasn't been reached yet, badged so rather than
              // hidden.
              !past && item.nextPeriod ? (
                <StatusBadge tone="neutral">Next period</StatusBadge>
              ) : null
            }
            action={
              past || rowCancelled ? null : waitlisted ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <WaitlistPositionLine position={item.waitlistPosition} />
                  <LeaveWaitlistButton
                    loading={leavingId != null && leavingId === (item.bookingId ?? `${item.athleteId}_${item.id}`)}
                    onClick={() => onLeaveWaitlist(item)}
                  />
                </div>
              ) : item.source === 'calendly' ? (
                <Body size={11} tone={color.textTertiary}>{CALENDLY_MANAGED_COPY}</Body>
              ) : dayOf ? (
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

