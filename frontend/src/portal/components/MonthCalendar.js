import React, { useEffect, useRef, useState } from 'react';
import { color, radius } from '../tokens';
import { ScreenTitle } from './Primitives';

/**
 * The shared month-calendar plumbing (code review 2026-09-04): BookSession
 * and the coach's Sessions tab render the same month grid, and each had
 * grown its own copy of the nav header, the month-state trio, and the
 * day-state mapping — this file is the single home so the two calendars the
 * owner explicitly wants identical cannot drift.
 */

/** 'yyyy-MM-01' shifted by delta months. */
export function shiftMonth(monthISO, delta) {
  const [y, m] = monthISO.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Month navigation state: current month, prev/next that mark the calendar
 * as user-touched, and a one-time auto-jump to `firstDateISO`'s month when
 * today's month predates it (the pre-season courtesy) — never overriding a
 * month the user picked themselves.
 */
export function useMonthNavState(firstDateISO, todayISOValue) {
  const [monthISO, setMonthISO] = useState(() => `${todayISOValue.slice(0, 7)}-01`);
  const touched = useRef(false);
  useEffect(() => {
    if (touched.current || !firstDateISO) return;
    const opening = `${firstDateISO.slice(0, 7)}-01`;
    setMonthISO((cur) => (opening > cur ? opening : cur));
  }, [firstDateISO]);
  const changeMonth = (delta) => {
    touched.current = true;
    setMonthISO((m) => shiftMonth(m, delta));
  };
  return { monthISO, changeMonth };
}

/**
 * useMonthSessions' days -> the two maps both calendar screens paint from:
 * dayStates ('available' when a day has sessions) and sessionsByDate.
 */
export function buildMonthDayMaps(days) {
  const dayStates = {};
  const sessionsByDate = {};
  for (const d of days) {
    sessionsByDate[d.date] = d.sessions;
    dayStates[d.date] = d.sessions.length ? 'available' : 'open';
  }
  return { dayStates, sessionsByDate };
}

export function MonthNav({ label, onPrev, onNext }) {
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
