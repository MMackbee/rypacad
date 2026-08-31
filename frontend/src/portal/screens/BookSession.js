import React, { useEffect, useRef, useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import ContractCalendar from '../components/ContractCalendar';
import SessionCard from '../components/SessionCard';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { CapacityPill } from '../components/StatusBadge';
import AllowancePools, { SpendNote } from '../components/AllowancePools';
import { Banner, Body, Card, ErrorNotice, ScreenTitle, Tick } from '../components/Primitives';
import * as hooksModule from '../hooks';
import { useBooking } from '../hooks';
// Pure calendar/season helpers, not response data — same pattern as poolFor
// below: the data itself travels through the hook seam, but a formatting
// helper that is already imported elsewhere in this file stays importable.
import { poolFor } from '../data/packages';
import { capacityFor, dayLabel } from '../data/season';
import { monthLabel, todayISO } from '../data/calendar';

/**
 * Sprint 5 pin (TEAM.md): `useMonthSessions(monthISO)` -> `{ data: { month,
 * days: [{ date, sessions }] }, loading, error }`, bookable sessions grouped
 * by date for one calendar month. Resolved off the namespace (see
 * CoachDashboard.js for why - the export does not exist in hooks/index.js on
 * this branch yet).
 *
 * The fallback below reuses the existing `useBooking` hook's slot list (the
 * only session data already flowing through a hook on this branch) rather
 * than reaching into data/season.js's raw SEASON_BY_DATE directly, which
 * would bypass the hook seam entirely. `useBooking` only ever fetches a
 * rolling 7-day window, so months outside it read as empty here until the
 * routing lane's real hook lands — the empty-month state below is honest
 * either way, just not always for the reason it displays.
 */
const pinnedUseMonthSessions = hooksModule.useMonthSessions;
function useMonthSessionsFallback(monthISO, bookingData) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!bookingData) return;
    const byDate = new Map();
    for (const slot of bookingData.slots ?? []) {
      const list = byDate.get(slot.date) ?? [];
      // Preserve the pinned raw shape (id, date, time, type, capacity,
      // booked, label, status) as far as this branch can reconstruct it —
      // useBooking's slots already carry a formatted `capacity` object
      // rather than raw numbers, which formatCapacity() below accounts for.
      list.push({
        id: slot.id,
        date: slot.date,
        time: slot.time,
        type: slot.type,
        capacity: slot.capacity,
        label: slot.name === 'Training block' || slot.name === 'Tournament block' ? null : slot.name,
        status: 'scheduled',
      });
      byDate.set(slot.date, list);
    }
    setState({ month: monthLabel(monthISO), days: [...byDate.entries()].map(([date, sessions]) => ({ date, sessions })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthISO, bookingData]);

  return { data: state, loading: !state, error: null };
}

/** Either shape `useMonthSessions` can hand back (see the fallback above). */
function formatCapacity(session) {
  if (session.capacity && typeof session.capacity === 'object') return session.capacity;
  return capacityFor(session);
}

function displayNameFor(session) {
  return session.label || (session.type === 'tournament' ? 'Tournament block' : 'Training block');
}

/** First-of-month ISO, shifted by whole months — day-of-month is always 1. */
function shiftMonth(monthISO, delta) {
  const [y, m] = monthISO.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

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
 * @param {'open'|'full'|'limitTraining'|'limitTournament'|'confirmed'} variant
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
 * @param {(booked) => void} [onConfirmed]
 *   Fires once when the confirmation renders after a tap-through booking —
 *   `{ name, when, pool }`. This is the onboarding step's completion signal:
 *   the step advances on the real confirmation, never on "Next" alone.
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 */
export default function BookSession({
  variant = 'open',
  bare = false,
  practice = false,
  onBack,
  onBook,
  onConfirmed,
  onRetry,
}) {
  // Kept for the existing booking behavior: book(), allowance, confirmation
  // copy — exactly the contract the screen already had (Sprint 5 pin).
  const { data, loading, error, book } = useBooking({ variant, practice });
  const [monthISO, setMonthISO] = useState(() => `${todayISO().slice(0, 7)}-01`);
  const monthState = pinnedUseMonthSessions
    ? pinnedUseMonthSessions(monthISO)
    : useMonthSessionsFallback(monthISO, data);

  const [selectedDate, setSelectedDate] = useState(null);
  // The slot the athlete just booked. Persistence is the API's job later; the
  // flow - tap a day, pick a session, land on the confirmation - has to work now.
  const [booked, setBooked] = useState(null);
  // The in-flight reservation (session id) and the last attempt's failure.
  const [reserving, setReserving] = useState(null);
  const [failure, setFailure] = useState(null);

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
        pool: poolFor(booked.type),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booked]);

  const confirmBooking = (session) => {
    if (reserving) return;
    if (!onBook) {
      finalizeBooked(session);
      return;
    }
    setFailure(null);
    setReserving(session.id);
    Promise.resolve()
      .then(() => onBook(session))
      .then(() => {
        if (!live.current) return;
        setReserving(null);
        finalizeBooked(session);
      })
      .catch((err) => {
        if (!live.current) return;
        setReserving(null);
        setFailure({
          sessionId: session.id,
          reason: err && typeof err.message === 'string' && err.message ? err.message : null,
        });
      });
  };

  const finalizeBooked = (session) => {
    const [time, meridiem] = session.time.split(' ');
    setBooked({
      ...session,
      time,
      meridiem,
      name: displayNameFor(session),
      dayLabel: dayLabel(session.date, todayISO()),
    });
  };

  const allowance = data?.allowance;
  const days = monthState.data?.days ?? [];
  const dayStates = {};
  const sessionsByDate = {};
  for (const d of days) {
    sessionsByDate[d.date] = d.sessions;
    dayStates[d.date] = d.sessions.length ? 'available' : 'open';
  }
  const monthHasSessions = days.some((d) => d.sessions.length > 0);
  const selectedSessions = selectedDate ? sessionsByDate[selectedDate] ?? [] : [];

  if (booked) {
    return (
      <Confirmed
        bare={bare}
        confirmation={{
          name: booked.name,
          when: `${booked.dayLabel} · ${booked.time}`,
          pool: poolFor(booked.type),
          email: data?.confirmation?.email,
          note: data?.confirmation?.note,
        }}
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
          <ScreenTitle>Book a Session</ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role="athlete" active="schedule" />}
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
            <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <AllowanceBanner allowance={allowance} />
              {data?.seasonNote ? (
                <Banner tone="green" title="Season">
                  {data.seasonNote}
                </Banner>
              ) : null}
            </div>

            <div style={{ padding: '0 22px' }}>
              <Card large>
                <MonthNav
                  label={monthLabel(monthISO)}
                  onPrev={() => {
                    setSelectedDate(null);
                    setMonthISO((m) => shiftMonth(m, -1));
                  }}
                  onNext={() => {
                    setSelectedDate(null);
                    setMonthISO((m) => shiftMonth(m, 1));
                  }}
                />
                {monthState.loading ? (
                  <SkeletonBar height={220} style={{ marginTop: 14 }} />
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <ContractCalendar
                      key={monthISO}
                      start={monthISO}
                      dayStates={dayStates}
                      variant="booking"
                      selected={selectedDate}
                      onSelectDay={(day) => setSelectedDate(day.iso)}
                    />
                  </div>
                )}
                {!monthState.loading && !monthHasSessions ? (
                  <Body size={12} style={{ marginTop: 14, textAlign: 'center' }}>
                    No sessions are scheduled yet.
                  </Body>
                ) : (
                  <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
                    Days marked green have bookable sessions — tap one to see times.
                  </Body>
                )}
              </Card>
            </div>

            {selectedDate ? (
              <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {failure ? (
                  <Banner tone="red" title="Booking didn't go through">
                    {failure.reason || 'The reservation could not be completed.'} Nothing was
                    reserved — tap the session to try again.
                  </Banner>
                ) : null}
                <DaySessionList
                  iso={selectedDate}
                  sessions={selectedSessions}
                  allowance={allowance}
                  reserving={reserving}
                  onSelect={confirmBooking}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

function MonthNav({ label, onPrev, onNext }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <NavArrow direction="prev" onClick={onPrev} />
      <ScreenTitle size={17}>{label}</ScreenTitle>
      <NavArrow direction="next" onClick={onNext} />
    </div>
  );
}

function NavArrow({ direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous month' : 'Next month'}
      style={{
        width: 32,
        height: 32,
        flex: 'none',
        border: `1px solid ${color.border}`,
        borderRadius: radius.input,
        background: 'transparent',
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRight: `1.5px solid ${color.textSecondary}`,
          borderBottom: `1.5px solid ${color.textSecondary}`,
          transform: direction === 'prev' ? 'rotate(135deg)' : 'rotate(-45deg)',
        }}
      />
    </button>
  );
}

/**
 * The tapped day's sessions — time, type chip, spots left, which allowance
 * pool it spends. Tapping a bookable one confirms it; a full or pool-spent
 * one stays inert rather than failing at a later submit.
 */
function DaySessionList({ iso, sessions, allowance, reserving, onSelect }) {
  return (
    <>
      <div style={{ font: `600 13px ${font.body}`, color: color.text, padding: '2px 0 2px' }}>
        {dayLabel(iso, todayISO())}
      </div>
      {sessions.length === 0 ? (
        <Body size={12}>No sessions are scheduled yet.</Body>
      ) : (
        sessions.map((session) => {
          const [time, meridiem] = session.time.split(' ');
          const cap = formatCapacity(session);
          const isFull = cap.state === 'full';
          const pool = poolFor(session.type);
          // Two independent reasons a session cannot be booked, and they need
          // different copy: the block itself is full, or the athlete has
          // nothing left in the pool this block would spend.
          const poolSpent = allowance ? allowance[pool].left === 0 : false;
          const pending = reserving === session.id;

          return (
            <SessionCard
              key={session.id}
              time={time}
              meridiem={meridiem}
              type={session.type}
              name={displayNameFor(session)}
              variant={isFull || poolSpent ? 'full' : 'default'}
              gutter={54}
              ruleHeight={36}
              onClick={isFull || poolSpent || reserving ? undefined : () => onSelect(session)}
              spendNote={<SpendNote pool={pool} allowance={allowance} />}
              action={
                pending ? (
                  <Button loading height={46} style={{ font: `600 14px ${font.body}` }}>
                    Reserving…
                  </Button>
                ) : null
              }
              trailing={
                <CapacityPill state={isFull ? 'full' : poolSpent ? 'capped' : cap.state}>
                  {isFull ? 'Full' : poolSpent ? 'No entries' : cap.label}
                </CapacityPill>
              }
              footnote={
                poolSpent && !isFull
                  ? `Your ${pool === 'tournaments' ? 'tournament entries' : 'training sessions'} reset ${allowance.resetsOn}. This block has space — it is your allowance that is spent, not the session.`
                  : null
              }
            />
          );
        })
      )}
    </>
  );
}

/**
 * Persistent, above the calendar, never a dismissible toast.
 *
 * A limited package hits a ceiling on every visit, so the balance has to be
 * standing context. Surfacing it only at submit turns a known constraint into a
 * failed action, which is why this is a banner and not an error.
 *
 * It always shows both pools. When one is spent the banner says which, and says
 * plainly that the other is unaffected — the single most likely misreading here
 * is a parent seeing "limit reached" and assuming all booking has stopped.
 */
function AllowanceBanner({ allowance }) {
  if (!allowance) return null;

  const spent = ['training', 'tournaments'].filter((k) => allowance[k].left === 0);
  const tone = spent.length ? 'red' : 'neutral';

  const title = spent.length
    ? spent.length === 2
      ? 'No sessions left this cycle'
      : spent[0] === 'tournaments'
      ? 'No tournament entries left'
      : 'No training sessions left'
    : 'Your allowance this cycle';

  return (
    <Banner tone={tone} title={title}>
      <AllowancePools allowance={allowance} style={{ margin: '4px 0 10px' }} />
      {spent.length === 1 ? (
        <>
          Your {spent[0] === 'tournaments' ? 'tournament entries' : 'training sessions'} reset{' '}
          {allowance.resetsOn}.{' '}
          {spent[0] === 'tournaments'
            ? 'Training blocks are unaffected — the two allowances do not substitute for each other.'
            : 'Tournament entries are unaffected — the two allowances do not substitute for each other.'}
        </>
      ) : (
        <>
          Both reset {allowance.resetsOn}. Rescheduling a missed block does not count against
          either allowance.
        </>
      )}
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

function Confirmed({ bare, confirmation, onBack }) {
  const c = confirmation;
  if (!c) return null;

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
          <Button>Add to calendar</Button>
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
          <Body size={13} style={{ marginTop: 8 }}>
            Confirmation sent to {c.email}
          </Body>
        </div>

        <Card tone="green" large style={{ width: '100%', marginTop: 6 }}>
          <div style={{ font: `700 19px ${font.head}`, color: color.text }}>{c.name}</div>
          <div style={{ display: 'flex', gap: 26, marginTop: 14 }}>
            <MetaCol label="When" value={c.when} />
            <MetaCol
              label="Spends"
              value={c.pool === 'tournaments' ? '1 tournament entry' : '1 training session'}
            />
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
