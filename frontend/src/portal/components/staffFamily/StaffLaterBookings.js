import React from 'react';
import { color, font } from '../../tokens';
import StatusBadge from '../StatusBadge';
import StaffRowActions from '../staffBooking/StaffRowActions';
import { Card, SectionLabel } from '../Primitives';
import { CANCEL_IN_CALENDLY, rowWhen, staffRowLabel } from '../../data/staffBookingCopy';
import { LATER_BOOKINGS_LABEL, inCalendly } from '../../data/staffFamily';
import { useStaffAthlete } from '../../hooks/staffBooking';

/**
 * An athlete's bookings further out than next period, on the family page
 * (an Elite athlete books two months ahead). The token meter above lists
 * this period and the next; these rows used to be reachable only on the
 * athlete-bookings screen the family page replaced (2026-11-16). Nothing is
 * drawn when there are none, while they load, or when they fail to: the
 * meter's rows are the page's main list.
 *
 * @param {(row: object) => void} [onMove]  The page's Move sheet.
 * @param {(row: object) => void} [onCancel]  The page's Cancel sheet.
 */
export default function StaffLaterBookings({ athleteId, onMove = null, onCancel = null }) {
  const { data: model } = useStaffAthlete(athleteId);
  const rows = model?.groups?.later ?? [];
  if (!rows.length) return null;
  const test = model.test === true;
  return (
    <section data-staff-later={athleteId} aria-label={LATER_BOOKINGS_LABEL}>
      <Card large>
        <SectionLabel style={{ marginBottom: 4 }}>{LATER_BOOKINGS_LABEL}</SectionLabel>
        {rows.map((row, i) => (
          <LaterRow
            key={row.id}
            row={row}
            last={i === rows.length - 1}
            first={model.first}
            periodStart={model.period.start}
            // A test athlete's rows never move (the server refuses); the cancel is allowed.
            onMove={test ? null : onMove}
            onCancel={onCancel}
          />
        ))}
      </Card>
    </section>
  );
}

/** The badge tones TokenMeter's rows use (components/TokenMeterRows.js). */
const BADGE_TONES = {
  Attended: 'green',
  'No-show': 'red',
  Waitlist: 'yellow',
  'Session token': 'green',
  'Bonus token': 'yellow',
  Free: 'neutral',
  Booked: 'neutral',
};

function LaterRow({ row, last, first, periodStart, onMove, onCancel }) {
  return (
    <div
      data-staff-row={row.id}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: last ? 'none' : `1px solid ${color.ruleSoft}` }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `500 12px ${font.body}`, color: color.text }}>{rowWhen(row.date, row.time)}</div>
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>{row.label}</div>
        {inCalendly(row, periodStart) ? (
          <div style={{ font: `500 11px ${font.body}`, color: color.textSecondary, marginTop: 2 }}>{CANCEL_IN_CALENDLY}</div>
        ) : null}
      </div>
      <StatusBadge tone={BADGE_TONES[row.badge] || 'neutral'}>{row.badge}</StatusBadge>
      <StaffRowActions
        row={row}
        first={first}
        rowLabel={staffRowLabel(row.date, row.time, row.label)}
        periodStart={periodStart}
        onMove={onMove}
        onCancel={onCancel}
      />
    </div>
  );
}
