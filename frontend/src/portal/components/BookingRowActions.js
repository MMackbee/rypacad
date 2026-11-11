import React from 'react';
import { color } from '../tokens';
import Button from './Button';
import { Body } from './Primitives';
import { CALENDLY_MANAGED_COPY } from './BookingReasons';
import { SESSION_STARTED_COPY, rowSession, sessionStarted } from '../data/sessionStart';
import { academyDateISO } from '../data/calendar';
import { MENTAL_DAY_OF_COPY } from '../data/bookingChanges';

/**
 * What a booked row on Reservations and My Schedule offers (spec 2026-11-11
 * §4-§5), first match wins:
 *   none           not a confirmed booking, no booking id, or not cancellable
 *   calendly       cancelled from Calendly's email
 *   started        "This session has already started." (the academy clock;
 *                  a session with no readable time stays open all its day)
 *   mental-day-of  a portal 1:1 on its own day: the day-before line
 *   change         Cancel, and Move unless it is a 1:1, or the account is on
 *                  hold (unpaid, past due, lapsed) and the row is not a comp
 * Pure; `now` is the phone's clock read on the academy's calendar - the
 * server refuses what a slow phone still offers (cancelBooking, the rules,
 * moveBooking).
 */
export function rowActionsFor(row, { now = new Date(), onHold = false } = {}) {
  if (!row || row.status !== 'confirmed' || !row.bookingId) return { kind: 'none' };
  if (row.source === 'calendly') return { kind: 'calendly' };
  if (sessionStarted(rowSession(row), now)) return { kind: 'started' };
  if (row.type === 'mental' && row.date <= academyDateISO(now)) return { kind: 'mental-day-of' };
  if (!row.cancellable) return { kind: 'none' };
  return { kind: 'change', move: row.type !== 'mental' && (row.comp === true || !onHold) };
}

const LINES = { calendly: CALENDLY_MANAGED_COPY, started: SESSION_STARTED_COPY, 'mental-day-of': MENTAL_DAY_OF_COPY };

/**
 * The row's action slot: a plain line, or "Cancel reservation" and (when the
 * screen passes `onMove` and the row may move) "Move" side by side.
 *
 * @param {object} row  A useSchedule / useHouseholdReservations row.
 * @param {boolean} [onHold]  The account is on hold (no Move on an ordinary booking).
 * @param {() => void} onCancel
 * @param {() => void} [onMove]
 */
export default function BookingRowActions({ row, onHold = false, onCancel, onMove }) {
  const actions = rowActionsFor(row, { onHold });
  if (LINES[actions.kind]) {
    return (
      <Body size={11} tone={color.textTertiary}>
        {LINES[actions.kind]}
      </Body>
    );
  }
  if (actions.kind !== 'change') return null;
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <Button variant="dangerOutline" height={44} style={{ flex: 1, boxShadow: 'none' }} onClick={onCancel}>
        Cancel reservation
      </Button>
      {actions.move && onMove ? (
        <Button variant="outline" height={44} style={{ flex: 1, boxShadow: 'none' }} onClick={onMove}>
          Move
        </Button>
      ) : null}
    </div>
  );
}
