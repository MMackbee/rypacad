import React, { useRef, useState } from 'react';
import { color, radius, tint } from '../tokens';
import Button from './Button';
import SessionCard from './SessionCard';
import { CapacityPill } from './StatusBadge';
import { Body, ScreenTitle, SectionLabel } from './Primitives';
import { reasonCopy } from './BookingReasons';
import { moveBooking, useMoveOptions } from '../hooks/move';
import { bump } from '../hooks/invalidate';
import { SESSION_STARTED_COPY } from '../data/sessionStart';
import { ALREADY_CHANGED_COPY, dayTimeLabel } from '../data/bookingChanges';
import { firstName } from '../data/whatsNext';

export const MOVE_EMPTY_COPY = 'No open sessions like this in your booking window.';
const LOADING_COPY = 'Finding open sessions...';
const LOAD_FAILED_COPY = "Open sessions didn't load. Check your connection and try again.";
const UNCONFIRMED_COPY = "We couldn't confirm the move. Check your list before trying again.";
/** "<why>. Nothing was changed." - a line without its own full stop gets one. */
function nothingChanged(line) {
  return `${/[.!?]$/.test(line) ? line : `${line}.`} Nothing was changed.`;
}

const TITLE_NOUNS = { training: 'Training block', tournament: 'Tour event', phil: 'Phil session' };

/** "Move to another Training block" / "Tour event" / "Phil session". */
export function moveTitle(type) {
  return `Move to another ${TITLE_NOUNS[type] ?? 'session'}`;
}

/** 'Tue Nov 10, 4:00 PM' for a screen row ('4:00' + 'PM') or an option (fullTime). */
function whenOf(s) {
  return dayTimeLabel(s.date, s.fullTime ?? [s.time, s.meridiem].filter(Boolean).join(' '));
}

/** "Move Jordan from Tue Nov 10, 4:00 PM to Thu Nov 12, 4:00 PM?" ("Move from ..." with no name). */
export function moveQuestion({ name, from, to }) {
  return `Move ${name ? `${name} ` : ''}from ${whenOf(from)} to ${whenOf(to)}?`;
}

/** The callable's refusals in the family's words (plan C2); the booking screens' copy for the rest. */
const OWN_COPY = {
  'not-confirmed': ALREADY_CHANGED_COPY,
  'mental-no-move': "A 1:1 can't be moved in the app.",
  'already-started': SESSION_STARTED_COPY,
  'same-session': 'Pick a different session.',
  'session-missing': "That session isn't on the schedule any more.",
  'different-type': 'Pick a session of the same kind.',
  'session-cancelled': 'The academy cancelled that session.',
  'display-only': "That session isn't booked through the portal.",
  'session-past': 'That session has already started.',
  'booking-missing': 'This booking no longer exists.',
  'not-yours': "This booking isn't on your account.",
};

export function moveRefusalCopy(err) {
  const reason = err?.reason;
  return OWN_COPY[reason] ?? (reason ? reasonCopy(reason) : null) ?? (err?.message || "The move didn't go through.");
}

/**
 * Refusals about the booking being moved (plan C2 #1-#7, #10): there is
 * nothing to pick instead, so the sheet says why and offers only Close.
 * Every other refusal with a reason is about the new session: back to the
 * list, reloaded.
 */
const BOOKING_REFUSALS = new Set(['signed-out', 'bad-request', 'booking-missing', 'not-yours', 'not-confirmed', 'calendly-managed', 'mental-no-move', 'already-started']);

/**
 * The Move sheet (spec 2026-11-11 §5): the open sessions of the same kind,
 * day by day, then "Move Jordan from ... to ...?" with Move / Keep it. One
 * move per tap - Move is busy while the call runs. A failure never claims
 * more than it knows: a refusal about the new session goes back to the list
 * (reloaded) under "... Nothing was changed."; one about the booking itself
 * ends in that line and Close (another device's change reads only "This
 * booking was already changed."); no answer at all (the move may have gone
 * through) asks the family to check their list.
 *
 * @param {object} row  The My Schedule / Reservations row being moved.
 * @param {?string} name  The athlete's name (none on an athlete's own login).
 * @param {() => void} onClose
 * @param {(result: object) => void} onMoved
 */
export default function MoveSheet({ row, name, onClose, onMoved }) {
  const [reloadKey, setReloadKey] = useState(0);
  const { data, loading, error } = useMoveOptions(row, reloadKey);
  const [picked, setPicked] = useState(null);
  const [moving, setMoving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [final, setFinal] = useState(null);
  const busy = useRef(false);
  const days = data?.days ?? [];

  const confirm = async () => {
    if (busy.current || !picked) return;
    busy.current = true;
    setMoving(true);
    try {
      const result = await moveBooking({ bookingId: row.bookingId, toSessionId: picked.id });
      onMoved(result);
      return; // the screen closes the sheet; Move stays busy until it does
    } catch (err) {
      const reason = err?.reason || null;
      if (!reason) {
        bump('bookings');
        bump('sessions');
        setFinal(UNCONFIRMED_COPY);
      } else if (BOOKING_REFUSALS.has(reason)) {
        if (reason === 'not-confirmed' || reason === 'booking-missing') bump('bookings');
        setFinal(reason === 'not-confirmed' ? ALREADY_CHANGED_COPY : nothingChanged(moveRefusalCopy(err)));
      } else {
        setNotice(nothingChanged(moveRefusalCopy(err)));
        setPicked(null);
        setReloadKey((k) => k + 1);
      }
    }
    busy.current = false;
    setMoving(false);
  };

  const close = (
    <Button variant="outline" height={50} style={{ boxShadow: 'none' }} onClick={onClose}>
      Close
    </Button>
  );

  let body;
  if (final) {
    body = (
      <>
        <Body size={12} style={{ marginTop: 10 }}>{final}</Body>
        <div style={{ marginTop: 16 }}>{close}</div>
      </>
    );
  } else if (picked) {
    body = (
      <>
        <Body size={12} style={{ marginTop: 10 }}>{moveQuestion({ name: firstName(name), from: row, to: picked })}</Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <Button height={50} loading={moving} onClick={confirm}>
            {moving ? 'Moving' : 'Move'}
          </Button>
          <Button variant="outline" height={50} disabled={moving} style={{ boxShadow: 'none' }} onClick={() => setPicked(null)}>
            Keep it
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {notice ? (
          <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
            {notice}
          </Body>
        ) : null}
        {loading ? (
          <Body size={12} style={{ marginTop: 10 }}>{LOADING_COPY}</Body>
        ) : error ? (
          <Body size={12} style={{ marginTop: 10 }}>{LOAD_FAILED_COPY}</Body>
        ) : days.length === 0 ? (
          <Body size={12} style={{ marginTop: 10 }}>{MOVE_EMPTY_COPY}</Body>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            {days.map((day) => (
              <div key={day.iso} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <SectionLabel tone={color.textTertiary}>{day.label}</SectionLabel>
                {day.sessions.map((option) => (
                  <div
                    key={option.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${day.label} ${option.fullTime}`}
                    onClick={() => setPicked(option)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPicked(option);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <SessionCard
                      time={option.time}
                      meridiem={option.meridiem}
                      type={option.type}
                      name={option.name}
                      trailing={<CapacityPill state="available">{option.capacityLabel}</CapacityPill>}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16 }}>{close}</div>
      </>
    );
  }

  return (
    <div
      data-portal-overlay=""
      onClick={moving ? undefined : onClose}
      style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '85%',
          overflowY: 'auto',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>{moveTitle(row.type)}</ScreenTitle>
        {body}
      </div>
    </div>
  );
}
