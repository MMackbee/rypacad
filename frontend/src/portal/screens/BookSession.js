import React, { useEffect, useRef, useState } from 'react';
import { color, font, glow, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import SessionCard from '../components/SessionCard';
import SkeletonCard, { SkeletonBar, SkeletonSessionCard } from '../components/Skeleton';
import { CapacityPill } from '../components/StatusBadge';
import AllowancePools, { SpendNote } from '../components/AllowancePools';
import { Banner, Body, Card, ErrorNotice, ScreenTitle, Tick } from '../components/Primitives';
import { useBooking } from '../hooks';
// poolFor is domain logic, not response data - the pure helpers in packages.js
// stay importable; it is the data that has to travel through the hook seam.
import { poolFor } from '../data/packages';

/**
 * 05 · Book a Session - athlete.
 * States: Blocks open, Block full, Training limit reached, Tournament limit
 * reached, Confirmed.
 *
 * The two limit states are separate because the allowance is two pools. A spent
 * tournament entitlement leaves every training block bookable, and the reverse —
 * so "limit reached" is never a property of the screen, only of one pool.
 *
 * @param {'open'|'full'|'limitTraining'|'limitTournament'|'confirmed'} variant
 * @param {(slot) => Promise} [onBook]
 *   The live reservation call. While it is pending the tapped block shows the
 *   handoff's button-level pattern (spinner + "Reserving…"); a rejection
 *   renders inline with its reason and the block stays selectable. With no
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
  const { data, loading, error } = useBooking({ variant, practice });
  const [selected, setSelected] = useState(null);
  // The slot the athlete just booked. Persistence is the API's job later; the
  // flow - tap a block, land on the confirmation - has to work now.
  const [booked, setBooked] = useState(null);
  // The in-flight reservation (slot id) and the last attempt's failure.
  const [reserving, setReserving] = useState(null);
  const [failure, setFailure] = useState(null);

  // A booking can resolve after the athlete has navigated away.
  const live = useRef(true);
  // Reset on run, not just clear on cleanup: React 18 StrictMode
  // mounts-unmounts-remounts in dev, and a cleanup-only guard stays false
  // after the simulated unmount — which swallowed every booking resolution
  // and left the card on "Reserving…" forever.
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  // The completion signal for the onboarding walkthrough: fires exactly when
  // the athlete's own tap-through reaches the confirmation. `booked` only ever
  // transitions null → slot, so this fires once per booking. The 'confirmed'
  // demo variant does not fire it — a variant is not an action completing.
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

  const book = (slot) => {
    if (reserving) return;
    if (!onBook) {
      setBooked(slot);
      return;
    }
    setFailure(null);
    setReserving(slot.id);
    Promise.resolve()
      .then(() => onBook(slot))
      .then(() => {
        if (!live.current) return;
        setReserving(null);
        setBooked(slot);
      })
      .catch((err) => {
        if (!live.current) return;
        setReserving(null);
        // The reason travels as-is when it is human text; anything else (a
        // stack, an SDK code object) falls back to plain copy rather than
        // leaking onto the screen.
        setFailure({
          slotId: slot.id,
          reason: err && typeof err.message === 'string' && err.message ? err.message : null,
        });
      });
  };

  const dates = data?.dates ?? [];
  const allowance = data?.allowance;

  // Default to the first day the season actually has sessions on, rather than a
  // hardcoded date that a closure could silently empty.
  const activeDate = selected ?? dates[0]?.iso ?? null;
  const slots = (data?.slots ?? []).filter((s) => s.date === activeDate);

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

            <DateStrip dates={dates} selected={activeDate} onSelect={setSelected} />

            <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failure ? (
                <Banner tone="red" title="Booking didn't go through">
                  {failure.reason || 'The reservation could not be completed.'} Nothing was
                  reserved — tap the block to try again.
                </Banner>
              ) : null}
              {slots.map((slot) => {
                const [time, meridiem] = slot.time.split(' ');
                const isFull = slot.capacity.state === 'full';
                const pool = poolFor(slot.type);
                // Two independent reasons a slot cannot be booked, and they need
                // different copy: the block itself is full, or the athlete has
                // nothing left in the pool this block would spend.
                const poolSpent = allowance ? allowance[pool].left === 0 : false;
                const pending = reserving === slot.id;

                return (
                  <SessionCard
                    key={slot.id}
                    time={time}
                    meridiem={meridiem}
                    type={slot.type}
                    name={slot.name}
                    meta={slot.meta}
                    variant={isFull || poolSpent ? 'full' : 'default'}
                    gutter={54}
                    ruleHeight={36}
                    // Tapping a bookable block books it; full or pool-spent blocks
                    // stay inert rather than failing at a later submit. While one
                    // reservation is in flight nothing else is tappable — two
                    // concurrent bookings is not a state this screen can honor.
                    onClick={isFull || poolSpent || reserving ? undefined : () => book(slot)}
                    spendNote={<SpendNote pool={pool} allowance={allowance} />}
                    action={
                      pending ? (
                        <Button loading height={46} style={{ font: `600 14px ${font.body}` }}>
                          Reserving…
                        </Button>
                      ) : null
                    }
                    trailing={
                      <CapacityPill state={isFull ? 'full' : poolSpent ? 'capped' : slot.capacity.state}>
                        {isFull ? 'Full' : poolSpent ? 'No entries' : slot.capacity.label}
                      </CapacityPill>
                    }
                    footnote={
                      isFull
                        ? slot.note
                        : poolSpent
                        ? `Your ${pool === 'tournaments' ? 'tournament entries' : 'training sessions'} reset ${allowance.resetsOn}. This block has space — it is your allowance that is spent, not the session.`
                        : null
                    }
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

/**
 * Persistent, above the date strip, never a dismissible toast.
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
 * The loading layout, in the loaded layout's geometry: allowance banner, seven
 * 50px date pills, three slot cards on the 54px gutter. No spinner — lists load
 * behind skeletons; spinners are for actions (see components/Skeleton.js).
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
          <SkeletonBar tone="raised" width="92%" height={9} style={{ marginTop: 12 }} />
          <SkeletonBar tone="raised" width="55%" height={9} style={{ marginTop: 6 }} />
        </SkeletonCard>
      </div>

      <div style={{ display: 'flex', gap: 7, overflow: 'hidden', padding: '0 22px' }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <SkeletonBar key={i} width={50} height={53} r={radius.counter} />
        ))}
      </div>

      <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <SkeletonSessionCard key={i} gutter={54} />
        ))}
      </div>
    </div>
  );
}

function DateStrip({ dates, selected, onSelect }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 7,
        overflowX: 'auto',
        padding: '0 22px',
        scrollbarWidth: 'none',
      }}
    >
      {dates.map((d) => {
        const on = d.iso === selected;
        return (
          <button
            key={d.iso}
            type="button"
            onClick={() => onSelect(d.iso)}
            style={{
              width: 50,
              flex: 'none',
              padding: '9px 0',
              borderRadius: radius.counter,
              background: on ? color.primary : 'transparent',
              border: on ? 'none' : `1px solid ${color.border}`,
              boxShadow: on ? glow.datePill : 'none',
              color: on ? '#000' : color.text,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                font: `400 10px ${font.body}`,
                textTransform: 'uppercase',
                opacity: 0.7,
              }}
            >
              {d.dow}
            </div>
            <div style={{ font: `700 17px ${font.body}` }}>{d.date}</div>
          </button>
        );
      })}
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
