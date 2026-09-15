import React, { useState } from 'react';
import { BLOCKS, BLOCK_DAYS, color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import CancelSheet from '../components/CancelSheet';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import Segmented from '../components/Segmented';
import SessionCard from '../components/SessionCard';
import StatusBadge from '../components/StatusBadge';
import AllowancePools from '../components/AllowancePools';
import SkeletonCard, { SkeletonBar, SkeletonSessionCard } from '../components/Skeleton';
import { Banner, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useSchedule } from '../hooks';
// Pure calendar helper, not response data - same seam rule BookSession and
// CommitmentContract already follow (see their own imports of this module).
import { todayISO } from '../data/calendar';

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
 */
export default function MySchedule({ variant = 'upcoming', bare = false, onBook, onRetry, demoCancellable = false }) {
  const scheduleState = useSchedule({ variant });
  const { data, loading, error } = scheduleState;
  const [tab, setTab] = useState('upcoming');
  // The upcoming item currently in the confirm sheet ('keep it' / 'cancel
  // reservation'), or null when the sheet is closed.
  const [cancelTarget, setCancelTarget] = useState(null);

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
  const sessions = withDemoCancel((past ? data?.past : data?.sessions) ?? []);
  // The cancellation notice belongs to the upcoming view - it is a claim about
  // a session that will not run, not a record of one that did.
  const cancelled = past ? null : data?.cancelled ?? null;
  const allowance = data?.allowance ?? null;

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
            allowance={allowance}
            days={days}
            onBook={onBook}
            onCancelRequest={setCancelTarget}
          />
        )}
      </div>

      {cancelTarget ? (
        <CancelSheet
          summary={`${cancelTarget.dayLabel} · ${cancelTarget.time} ${cancelTarget.meridiem} · ${cancelTarget.name}`}
          onClose={() => setCancelTarget(null)}
          onConfirm={() => cancel(cancelTarget.bookingId)}
          onCancelled={() => setCancelTarget(null)}
        />
      ) : null}
    </PhoneFrame>
  );
}

function ScheduleBody({ past, sessions, cancelled, allowance, days, onBook, onCancelRequest }) {
  return (
    <>
        {/*
          Two numbers, never one. Training and tournament entitlements are
          separate pools, so a single "N bookings left" would be wrong for every
          athlete who has spent one and not the other.
        */}
        {allowance ? (
          <Card>
            <SectionLabel style={{ marginBottom: 12 }}>Remaining this cycle</SectionLabel>
            <AllowancePools allowance={allowance} />
            <Body size={11} tone={color.textTertiary} style={{ marginTop: 12 }}>
              Both reset {allowance.resetsOn}. A cancelled or rescheduled block does not count
              against either.
            </Body>
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
              return (
                <SessionCard
                  key={s.id}
                  time={s.time}
                  meridiem={s.meridiem}
                  type={s.type}
                  name={s.name}
                  meta={s.meta}
                  variant={s.isToday ? 'live' : 'default'}
                  trailing={
                    s.badge ? (
                      <StatusBadge tone={s.badge.tone}>{s.badge.label}</StatusBadge>
                    ) : null
                  }
                  action={
                    past ? null : dayOf ? (
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
 * The loading layout in the loaded layout's geometry: allowance card, a day
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
        {[0, 1].map((i) => (
          <div key={i} style={{ marginTop: i ? 11 : 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <SkeletonBar tone="raised" width={64} height={11} />
              <SkeletonBar tone="raised" width={90} height={11} />
            </div>
            <SkeletonBar tone="raised" height={6} r={3} />
          </div>
        ))}
        <SkeletonBar tone="raised" width="80%" height={9} style={{ marginTop: 14 }} />
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
  // Built from the BLOCKS constant so flag 07 stays single-source: if the real
  // block times differ, this copy changes with them rather than drifting.
  const blockList = `${BLOCKS.slice(0, -1).join(', ')}, and ${BLOCKS[BLOCKS.length - 1]}`;
  const dayRange = `${BLOCK_DAYS[0]} through ${BLOCK_DAYS[BLOCK_DAYS.length - 1]}`;

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
      <Body size={12}>
        Training blocks run {blockList}, {dayRange}. Saturdays alternate training and tournament.
      </Body>
      <Button height={46} onClick={onBook} style={{ marginTop: 6 }}>
        Book a session
      </Button>
    </div>
  );
}
