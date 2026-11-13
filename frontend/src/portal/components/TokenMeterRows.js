import React from 'react';
import { format, parseISO } from 'date-fns';
import { color, font } from '../tokens';
import StatusBadge from './StatusBadge';
import StaffRowActions from './staffBooking/StaffRowActions';
import { Body } from './Primitives';
import { longDayLabel } from '../data/calendar';
import { firstOf } from '../data/staffCancel';

/**
 * The evidence under a TokenMeter (components/TokenMeter.js): every session
 * that spent a token this period, every waitlist spot holding one, the next
 * period's grant and the last period's use. Its own file so TokenMeter stays
 * under 500 lines (spec 01-spec-admin-booking.md 10.1).
 *
 * On the staff view (owner or ops; Billing.js passes `onCancelRow` and
 * `onMoveRow`) each row carries StaffRowActions after its badge - Move before
 * Cancel, each only where data/staffBooking.js staffMovable and
 * data/staffCancel.js staffCancellable allow it - and the next period's rows
 * (`member.nextSpent`) follow the "Next period from ..." line with the same
 * actions (spec 10.4). The parents' list is unchanged.
 */

function shortDay(iso) {
  return iso ? format(parseISO(iso), 'EEE, MMM d') : '';
}

const STATUS_BADGE = {
  attended: { tone: 'green', label: 'Attended' },
  confirmed: { tone: 'neutral', label: 'Booked' },
  noshow: { tone: 'red', label: 'No-show' },
  waitlisted: { tone: 'yellow', label: 'Waitlist' },
};

/**
 * One row: the day and time, the session, the badge, then the staff actions
 * when the view passes them. The actions are named for the athlete and the
 * row ("Move Jordan's Tue, Nov 10 Training block"): brothers and sisters on
 * one session would otherwise share a name.
 */
export function Row({ row, last, first, periodStart = null, onCancel = null, onMove = null }) {
  const badge = row.viaSingle
    ? { tone: 'green', label: 'Session token' }
    : row.viaGrace
    ? { tone: 'yellow', label: 'Bonus token' }
    : STATUS_BADGE[row.status] || STATUS_BADGE.confirmed;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 0',
        borderBottom: last ? 'none' : `1px solid ${color.ruleSoft}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `500 12px ${font.body}`, color: color.text }}>
          {shortDay(row.date)}
          {row.time ? ` · ${row.time}` : ''}
        </div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>{row.label}</div>
      </div>
      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      <StaffRowActions
        row={row}
        first={first}
        rowLabel={`${shortDay(row.date)}${row.time ? ` ${row.time}` : ''} ${row.label}`}
        periodStart={periodStart}
        onMove={onMove}
        onCancel={onCancel}
      />
    </div>
  );
}

/**
 * The opened list. `onCancelRow` / `onMoveRow`: the staff view's handlers,
 * each handed the tapped row; with either, the next period's rows are listed
 * too. Without both nothing changes from the parents' list.
 */
export function Evidence({ member, onCancelRow = null, onMoveRow = null }) {
  const { spent, reserved, nextPeriod, lastPeriod, tokens } = member;
  const staffView = Boolean(onCancelRow || onMoveRow);
  const first = firstOf(member.name);
  const periodStart = member.period?.start ?? null;
  // The next period's spend as the meter's "<Month>: N of G left" counts it
  // (period-charged rows) and the rows a bonus token paid for, apart - so the
  // two lines on one card add up (review 2026-11-04).
  const nextUsed = nextPeriod ? nextPeriod.used ?? nextPeriod.booked ?? 0 : 0;
  const nextBonus = nextPeriod ? (nextPeriod.booked ?? 0) - nextUsed : 0;
  const rows = [...spent, ...reserved];
  const nextRows = staffView && nextPeriod ? member.nextSpent || [] : [];
  const rowOf = (row, i, list) => (
    <Row
      key={row.id}
      row={row}
      last={i === list.length - 1}
      first={first}
      periodStart={periodStart}
      onCancel={onCancelRow}
      onMove={onMoveRow}
    />
  );
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${color.ruleSoft}`, paddingTop: 6 }}>
      {rows.length ? (
        rows.map(rowOf)
      ) : (
        <Body size={11} tone={color.textTertiary} style={{ padding: '8px 0' }}>
          Nothing booked in this period yet.
        </Body>
      )}
      {/* A single athlete's tokens are bought, never granted per period: no
          grant line, only what is already booked past this period's end.
          No line at all after the season's last period (nextPeriod null). */}
      {!nextPeriod ? null : tokens.perPurchase ? (
        nextPeriod.booked || nextPeriod.reserved ? (
          <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>
            From {longDayLabel(nextPeriod.start)}:{' '}
            {[nextPeriod.booked ? `${nextPeriod.booked} booked` : null, nextPeriod.reserved ? `${nextPeriod.reserved} on a waitlist` : null]
              .filter(Boolean)
              .join(' · ')}
          </Body>
        ) : null
      ) : (
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>
          Next period from {longDayLabel(nextPeriod.start)}:{' '}
          {tokens.unlimited ? 'unlimited' : `${nextPeriod.granted} token${nextPeriod.granted === 1 ? '' : 's'}`}
          {nextUsed ? ` · ${nextUsed} already booked` : ''}
          {nextBonus ? ` · ${nextBonus} on a bonus token` : ''}
          {nextPeriod.reserved ? ` · ${nextPeriod.reserved} on a waitlist` : ''}
        </Body>
      )}
      {/* The staff view only (spec 10.4): next period's bookings, movable and cancellable. */}
      {nextRows.length ? <div style={{ marginTop: 4 }}>{nextRows.map(rowOf)}</div> : null}
      {lastPeriod && !tokens.unlimited && !tokens.perPurchase ? (
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 4 }}>
          Last period ({shortDay(lastPeriod.start)} – {shortDay(lastPeriod.end)}): used {lastPeriod.used} of {lastPeriod.granted}
        </Body>
      ) : null}
    </div>
  );
}
