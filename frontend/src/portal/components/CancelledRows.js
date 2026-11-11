import React from 'react';
import AthleteRow from './AthleteRow';
import { useCancelledBookings } from '../hooks/cancelledBookings';

/**
 * Family cancels with their reason, and moves, greyed below the athletes on a
 * session's attendance screen (spec 2026-11-11 §6). Not counted and never
 * marked: no IN/OUT, nothing to tap. Nothing at all while the list loads,
 * when it fails, or when it is empty - the roster above is the working list.
 * Rows keep the roster's 11px rhythm (AthleteRow pads only a divided row).
 */
export default function CancelledRows({ sessionId }) {
  const { data } = useCancelledBookings(sessionId);
  if (!data?.length) return null;
  return (
    <div aria-label="Cancelled or moved" style={{ marginTop: 11 }}>
      {data.map((row, i) => (
        <AthleteRow
          key={row.bookingId}
          name={row.name ?? 'Name unavailable'}
          meta={row.line}
          avatarSize={42}
          nameSize={16}
          divider={i < data.length - 1}
          style={{ opacity: 0.5, padding: '11px 0' }}
        />
      ))}
    </div>
  );
}
