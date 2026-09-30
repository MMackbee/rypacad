/**
 * The viewer's Month/Week calendar preference (owner request 2026-09-30).
 *
 * One global localStorage key, so a switch on one screen carries to the
 * next. Follows hooks/onboarding.js: storage can be unavailable or throw
 * (private browsing, blocked storage, quota), so every read and write is
 * wrapped and a failure falls back to the screen's own default view.
 *
 * Nothing here touches Firestore, so the hook is safe in practice and
 * onboarding mode. Deliberately NOT re-exported from ./index.js: screen tests
 * jest.mock('../hooks'), and a re-export would erase this hook from them.
 *
 * Each mounted instance holds its own state; another screen picks the value
 * up when it mounts. There is no live cross-instance sync.
 */

import { useCallback, useState } from 'react';
import { CALENDAR_VIEW_KEY, isCalendarView } from '../data/calendarViews';

/** The stored view, or null when nothing valid is stored or storage throws. */
export function readCalendarView() {
  try {
    const v = window.localStorage.getItem(CALENDAR_VIEW_KEY);
    return isCalendarView(v) ? v : null;
  } catch (err) {
    return null;
  }
}

/** Stores a valid view; invalid values and storage failures are ignored. */
export function writeCalendarView(view) {
  if (!isCalendarView(view)) return;
  try {
    window.localStorage.setItem(CALENDAR_VIEW_KEY, view);
  } catch (err) {
    // Write rejected (private mode/quota): the in-memory state still flips,
    // it just will not survive a reload.
  }
}

/**
 * `[view, setView]`. The initial view is the stored choice, else
 * `screenDefault` (else 'month').
 */
export default function useCalendarView(screenDefault = 'month') {
  const [view, setViewState] = useState(
    () => readCalendarView() ?? (isCalendarView(screenDefault) ? screenDefault : 'month')
  );
  const setView = useCallback((next) => {
    if (!isCalendarView(next)) return;
    setViewState(next);
    writeCalendarView(next);
  }, []);
  return [view, setView];
}
