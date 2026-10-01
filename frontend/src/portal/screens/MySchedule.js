import React, { useState } from 'react';
import { color, font, radius, WEEKLY_SCHEDULE_LABEL } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import CancelSheet from '../components/CancelSheet';
import { CALENDLY_MANAGED_COPY, cancelReasonCopy } from '../components/BookingReasons';
import { leaveFailureCopy, OnWaitlist } from '../components/WaitlistAction';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import Segmented from '../components/Segmented';
import SessionCard from '../components/SessionCard';
import StatusBadge from '../components/StatusBadge';
import AllowancePools, { GraceLine } from '../components/AllowancePools';
import SkeletonCard, { SkeletonBar, SkeletonSessionCard } from '../components/Skeleton';
import { Banner, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useSchedule } from '../hooks';
import { leaveWaitlist } from '../hooks/waitlist';
import { cancelSeries, laterWeeks } from '../hooks/cancelSeries';
// Pure calendar helper, not response data - same seam rule BookSession and
// CommitmentContract already follow (see their own imports of this module).
import { todayISO } from '../data/calendar';
import { waitlistClosed } from '../data/sessionStart';
import { attendeeNoteFor } from '../data/specialists';

/**
 * 04 · My Schedule - athlete.
 * States: Upcoming, Empty, Cancelled session shown.
 *
 * Sprint 9 pin (TEAM.md, "specialist 1-on-1s", cancellation): specialist
 * bookings render with the same SessionCard/TypeChip path as every other
 * session (the type chip picks up 'phil'/'mental' from TypeChip.js, and the
 * name is whatever the hook's displaySession already formatted - "<sessionNoun>
 * · <name>" for an unlabeled specialist session - this screen renders it
 * verbatim, never re-derives it). Every cancellable upcoming item now gets a
 * "Cancel reservation" affordance behind a confirm sheet; a day-of item shows
 * the call-the-academy line instead, since the pinned `cancellable` rule
 * (status 'confirmed' && date > today) already excludes today by itself.
 *
 * @param {'upcoming'|'empty'|'cancelled'} variant
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 * @param {boolean} [demoCancellable]  HARNESS-ONLY, not part of the pinned
 *   contract. useSchedule doesn't return `cancellable`/`bookingId` per item
 *   in this worktree yet (routing lane's parallel worktree owns hooks/
 *   index.js) - the whole cancel UI is honestly unreachable on real seed/live
 *   data until that lands, same as a missing hook export elsewhere in this
 *   codebase (Roster.js, TourStandings.js). This flag lets the states gallery
 *   preview the cancel flow by patching cancellable/bookingId onto each
 *   non-today upcoming item locally, purely for review - no real caller ever
 *   passes it. Flagged in the sprint report.
 * @param {boolean} [demoWaitlisted]  HARNESS-ONLY, same category as
 *   `demoCancellable` (Sprint 13, contract v2.1 pin F): useSchedule doesn't
 *   return a 'waitlisted' item / `waitlistPosition` in this worktree yet -
 *   patches the first upcoming item to that state for review.
 */
export default function MySchedule({
  variant = 'upcoming',
  bare = false,
  onBook,
  onRetry,
  demoCancellable = false,
  demoWaitlisted = false,
}) {
  const scheduleState = useSchedule({ variant });
  const { data, loading, error } = scheduleState;
  const [tab, setTab] = useState('upcoming');
  // The upcoming item currently in the confirm sheet ('keep it' / 'cancel
  // reservation'), or null when the sheet is closed. `later` is its later
  // weeks (hooks/cancelSeries.js), fixed when the sheet opens: the list
  // reloads under the sheet once a cancel lands.
  const [cancelTarget, setCancelTarget] = useState(null);
  // Which waitlisted bookingId is mid-leave, for LeaveWaitlistButton's own
  // loading state (no confirm sheet - leaving costs nothing already spent).
  const [leavingId, setLeavingId] = useState(null);
  // Why the last "Leave waitlist" was refused, in plain words. It sits above
  // the list: a refused leave reloads it, and a row the athlete was promoted
  // off is no longer there to carry the line.
  const [leaveFailure, setLeaveFailure] = useState(null);

  const past = tab === 'past';
  const today = todayISO();
  /**
   * See the `demoCancellable` doc above - a non-today item gets a synthetic
   * `cancellable`/`bookingId` so the harness can exercise the real cancel
   * sheet below without a live hook. A no-op when the flag is off, and a
   * no-op for any item that already carries its own real `cancellable` once
   * routing's hook update lands (the ?? below never overrides a real value).
   */
  const withDemoCancel = (list) =>
    demoCancellable
      ? list.map((s) =>
          s.date === today ? s : { ...s, cancellable: s.cancellable ?? true, bookingId: s.bookingId ?? s.id }
        )
      : list;
  // Same harness-only patch shape as withDemoCancel, for the 'waitlisted'
  // item state (see demoWaitlisted's own doc above) - the first upcoming item.
  const withDemoWaitlisted = (list) =>
    demoWaitlisted && list.length
      ? list.map((s, i) =>
          i === 0 ? { ...s, status: 'waitlisted', waitlistPosition: 2, bookingId: s.bookingId ?? s.id } : s
        )
      : list;
  const sessions = withDemoWaitlisted(withDemoCancel((past ? data?.past : data?.sessions) ?? []));
  // The cancellation notice belongs to the upcoming view - it is a claim about
  // a session that will not run, not a record of one that did.
  const cancelled = past ? null : data?.cancelled ?? null;
  const tokens = data?.tokens ?? null;

  // Group by day header so a day is announced once, not per card.
  const days = sessions.reduce((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.label === s.dayLabel) last.items.push(s);
    else acc.push({ label: s.dayLabel, isToday: s.isToday, items: [s] });
    return acc;
  }, []);

  /**
   * Sprint 9 pin (TEAM.md): "useSchedule ... gains cancel(bookingId)" - not
   * present on this hook's return in this worktree yet, the same
   * missing-export situation Roster.js/TourStandings.js handle with a
   * namespace-import fallback, scoped here to one method on an
   * already-existing hook's return value rather than the whole hook (useSchedule
   * itself is real; only this additional method is pending). Falling back to
   * a rejecting stub keeps the confirm sheet's action honestly failing - an
   * inline error in the sheet, never a silent no-op - until the real method
   * lands.
   */
  const cancel =
    scheduleState.cancel ||
    (async () => {
      throw new Error('Cancelling is not available yet.');
    });

  // "Leave waitlist" (Sprint 13 pin F): the waitlisted row carries the
  // session id (`id`) and the athlete it belongs to; the write bumps
  // bookings, so this list refreshes through its own seam.
  const handleLeaveWaitlist = async (item) => {
    setLeavingId(item.bookingId ?? item.id);
    setLeaveFailure(null);
    try {
      await leaveWaitlist({ sessionId: item.sessionId ?? item.id, athleteId: item.athleteId });
    } catch (err) {
      // This is the athlete's own schedule: no name, so "You were just booked".
      setLeaveFailure(leaveFailureCopy(err));
    } finally {
      setLeavingId(null);
    }
  };

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 16px' }}>
          <ScreenTitle>My Schedule</ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role="athlete" active="schedule" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* The tabs are local UI state, not fetched data — they stay live (and
            hold their place) while the list loads or fails. */}
        <Segmented value={tab} onChange={setTab} />

        {leaveFailure ? (
          <Banner tone="yellow" title="Waitlist">
            {leaveFailure}
          </Banner>
        ) : null}

        {loading ? (
          <ScheduleSkeleton />
        ) : error ? (
          <ErrorNotice title="Schedule didn't load" onRetry={onRetry}>
            Your schedule didn't load — your bookings are unaffected. Check your connection and
            try again.
          </ErrorNotice>
        ) : (
          <ScheduleBody
            past={past}
            sessions={sessions}
            cancelled={cancelled}
            tokens={tokens}
            days={days}
            onBook={onBook}
            onCancelRequest={(s) => setCancelTarget({ ...s, later: laterWeeks(s, sessions) })}
            onLeaveWaitlist={handleLeaveWaitlist}
            leavingId={leavingId}
          />
        )}
      </div>

      {cancelTarget ? (
        <CancelSheet
          summary={`${cancelTarget.dayLabel} · ${cancelTarget.time} ${cancelTarget.meridiem} · ${cancelTarget.name}`}
          onClose={() => setCancelTarget(null)}
          onConfirm={() => cancel(cancelTarget.bookingId)}
          laterWeeks={cancelTarget.later}
          onConfirmSeries={() => cancelSeries([cancelTarget, ...cancelTarget.later], cancel)}
          onCancelled={() => setCancelTarget(null)}
        />
      ) : null}
    </PhoneFrame>
  );
}

function ScheduleBody({ past, sessions, cancelled, tokens, days, onBook, onCancelRequest, onLeaveWaitlist, leavingId }) {
  return (
    <>
        {/*
          Sprint 12 (contract v2.0): one token pool, not two - a single
          balance now. Elite renders no number (AllowancePools' own
          unlimited branch).
        */}
        {tokens ? (
          <Card>
            {/* Elite holds no tokens (tester Mike 2026-09-30): no token label. */}
            <SectionLabel style={{ marginBottom: 12 }}>{tokens.unlimited ? 'Your package' : 'Tokens this period'}</SectionLabel>
            <AllowancePools tokens={tokens} />
            <GraceLine tokens={tokens} />
          </Card>
        ) : null}

        {cancelled ? (
          <Banner
            tone="red"
            title={cancelled.banner.title}
            action={
              <Button variant="dangerOutline" height={46} style={{ font: `600 14px ${font.body}` }}>
                Reschedule as makeup
              </Button>
            }
          >
            {cancelled.banner.body}
          </Banner>
        ) : null}

        {cancelled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <SectionLabel tone={color.textTertiary}>{cancelled.dayLabel}</SectionLabel>
            <SessionCard
              time={cancelled.time}
              meridiem={cancelled.meridiem}
              type="cancelled"
              name={cancelled.name}
              meta={cancelled.meta}
              variant="cancelled"
              // Pin G: the system cancellation reasons state plainly what
              // happened; a member's own cancel ('member') has nothing to add.
              footnote={cancelReasonCopy(cancelled.cancelReason, { unlimited: Boolean(tokens?.unlimited) })}
            />
          </div>
        ) : null}

        {sessions.length === 0 && !cancelled ? (
          past ? (
            <Body size={12} tone={color.textTertiary} style={{ textAlign: 'center', padding: '20px 0' }}>
              Nothing attended yet this season.
            </Body>
          ) : (
            <EmptyState onBook={onBook} />
          )
        ) : null}

        {days.map((day) => (
          <div key={day.label} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <SectionLabel tone={day.isToday ? color.primary : color.textTertiary}>
              {day.label}
            </SectionLabel>
            {day.items.map((s) => {
              // Sprint 9 pin (TEAM.md): the pinned cancellable rule (status
              // 'confirmed' && date > today) already excludes a day-of item -
              // this screen shows the honest reason (call the front desk)
              // rather than silently rendering nothing where a control might
              // otherwise be.
              const dayOf = !past && s.isToday;
              // Sprint 13 (contract v2.1, pin F/G): a waitlisted or a
              // system-cancelled item can now ride the same sessions/past
              // arrays (once routing's hook update lands) - both get their
              // own trailing/footnote/action treatment below rather than the
              // ordinary confirmed row's.
              const waitlisted = s.status === 'waitlisted';
              const rowCancelled = s.status === 'cancelled';
              return (
                <SessionCard
                  key={s.id}
                  time={s.time}
                  meridiem={s.meridiem}
                  type={rowCancelled ? 'cancelled' : s.type}
                  ageGroup={rowCancelled ? null : s.ageGroup}
                  name={s.name}
                  meta={attendeeNoteFor(s) ?? s.meta}
                  variant={rowCancelled ? 'cancelled' : s.isToday ? 'live' : 'default'}
                  footnote={rowCancelled ? cancelReasonCopy(s.cancelReason, { unlimited: Boolean(tokens?.unlimited) }) : null}
                  trailing={
                    waitlisted ? (
                      <StatusBadge tone="yellow">Waitlisted</StatusBadge>
                    ) : s.badge ? (
                      <StatusBadge tone={s.badge.tone}>{s.badge.label}</StatusBadge>
                    ) : s.nextPeriod ? (
                      // Sprint 12 (contract v2.0, pin B): a booking charges
                      // against the period its session date falls in, not
                      // the period it was made in.
                      <StatusBadge tone="neutral">Next period</StatusBadge>
                    ) : null
                  }
                  action={
                    past || rowCancelled ? null : waitlisted ? (
                      <OnWaitlist
                        position={s.waitlistPosition}
                        unlimited={Boolean(tokens?.unlimited)}
                        // The academy's clock, and any day from the session's
                        // own on: an entry the 06:00 sweep has not closed yet.
                        closed={waitlistClosed(s)}
                        leaving={leavingId != null && leavingId === (s.bookingId ?? s.id)}
                        onLeave={() => onLeaveWaitlist(s)}
                      />
                    ) : s.source === 'calendly' ? (
                      <Body size={11} tone={color.textTertiary}>{CALENDLY_MANAGED_COPY}</Body>
                    ) : dayOf ? (
                      <Body size={11} tone={color.textTertiary}>
                        Same-day cancellations aren't available in the app — contact the front
                        desk.
                      </Body>
                    ) : s.cancellable && s.bookingId ? (
                      <Button
                        variant="dangerOutline"
                        height={44}
                        style={{ boxShadow: 'none' }}
                        onClick={() => onCancelRequest(s)}
                      >
                        Cancel reservation
                      </Button>
                    ) : null
                  }
                />
              );
            })}
          </div>
        ))}
    </>
  );
}

/**
 * The loading layout in the loaded layout's geometry: tokens card, a day
 * label, then session cards on 04's default 52px gutter. No spinner — see
 * components/Skeleton.js.
 */
function ScheduleSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading schedule"
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <SkeletonCard>
        <SkeletonBar tone="raised" width={132} height={10} />
        <div style={{ marginTop: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <SkeletonBar tone="raised" width={64} height={11} />
            <SkeletonBar tone="raised" width={90} height={11} />
          </div>
          <SkeletonBar tone="raised" height={6} r={3} />
        </div>
      </SkeletonCard>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <SkeletonBar width={104} height={10} />
        <SkeletonSessionCard />
        <SkeletonSessionCard />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <SkeletonBar width={82} height={10} />
        <SkeletonSessionCard />
      </div>
    </div>
  );
}

function EmptyState({ onBook }) {
  return (
    <div
      style={{
        border: `1px dashed ${color.border}`,
        borderRadius: radius.cardLarge,
        padding: '34px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        textAlign: 'center',
      }}
    >
      <MediaPlaceholder height={56} style={{ width: 56 }} />
      <ScreenTitle size={18}>Nothing scheduled</ScreenTitle>
      <Body size={12}>Training runs {WEEKLY_SCHEDULE_LABEL}.</Body>
      <Button height={46} onClick={onBook} style={{ marginTop: 6 }}>
        Book a session
      </Button>
    </div>
  );
}
