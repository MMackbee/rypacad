import React, { useState } from 'react';
import { color, font, glow, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import SessionCard from '../components/SessionCard';
import { CapacityPill } from '../components/StatusBadge';
import AllowancePools, { SpendNote } from '../components/AllowancePools';
import { Banner, Body, Card, ScreenTitle, Tick } from '../components/Primitives';
import { useBooking } from '../hooks';
import { BOOKING_CONFIRMATION } from '../data/seed';
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
 */
export default function BookSession({ variant = 'open', bare = false, onBack }) {
  const { data } = useBooking({ variant });
  const [selected, setSelected] = useState(null);

  const dates = data?.dates ?? [];
  const allowance = data?.allowance;

  // Default to the first day the season actually has sessions on, rather than a
  // hardcoded date that a closure could silently empty.
  const activeDate = selected ?? dates[0]?.iso ?? null;
  const slots = (data?.slots ?? []).filter((s) => s.date === activeDate);

  if (variant === 'confirmed') return <Confirmed bare={bare} onBack={onBack} />;

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
        <div style={{ padding: '0 22px' }}>
          <AllowanceBanner allowance={allowance} />
        </div>

        <DateStrip dates={dates} selected={activeDate} onSelect={setSelected} />

        <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {slots.map((slot) => {
            const [time, meridiem] = slot.time.split(' ');
            const isFull = slot.capacity.state === 'full';
            const pool = poolFor(slot.type);
            // Two independent reasons a slot cannot be booked, and they need
            // different copy: the block itself is full, or the athlete has
            // nothing left in the pool this block would spend.
            const poolSpent = allowance ? allowance[pool].left === 0 : false;

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
                spendNote={<SpendNote pool={pool} allowance={allowance} />}
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

function Confirmed({ bare, onBack }) {
  const c = BOOKING_CONFIRMATION;

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
            <MetaCol label="Coach" value={c.coach} />
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
