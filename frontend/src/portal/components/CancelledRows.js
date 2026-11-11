import React, { useRef } from 'react';
import AthleteRow from './AthleteRow';
import { useCancelledBookings } from '../hooks/cancelledBookings';

/**
 * Family cancels with their reason, and moves, greyed below the athletes on a
 * session's attendance screen (spec 2026-11-11 §6). Not counted and never
 * marked: no IN/OUT, nothing to tap. Nothing at all on the first load, when
 * it fails, or when it is empty - the roster above is the working list. A
 * re-read (every IN/OUT tap bumps 'bookings') keeps the last list on screen,
 * as Roster's lastRows does, so the rows under a coach's finger never jump.
 * Rows keep the roster's 11px rhythm (AthleteRow pads only a divided row).
 */
export default function CancelledRows({ sessionId }) {
  const { data: fresh, loading } = useCancelledBookings(sessionId);
  const last = useRef(null);
  if (fresh) last.current = { sessionId, rows: fresh };
  const data = fresh ?? (loading && last.current?.sessionId === sessionId ? last.current.rows : null);
  if (!data?.length) return null;
  return (
    <div role="group" aria-label="Cancelled or moved" style={{ marginTop: 11 }}>
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
