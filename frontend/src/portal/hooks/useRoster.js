import { useCallback, useMemo, useState } from 'react';
import { ROSTER } from '../data/seed';

/**
 * Attendance marking for screen 13 - the one Phase 1 action that cannot be
 * allowed to fail.
 *
 * Three marks per athlete, not two: 'in', 'out', or null for unmarked. Unmarked
 * has to stay distinct from absent, because collapsing them is exactly what
 * produces bad no-show data. Marking is a toggle - tapping the active button
 * again clears it, so there is no undo affordance to hunt for mid-session.
 *
 * NOT IMPLEMENTED - offline behaviour. The handoff calls this the highest-risk
 * gap in the design ("Not designed, and the highest-risk gap"): a coach in a
 * loud facility on bad wifi is the expected case, not the edge case. The
 * recommendation there is local-first writes with a visible sync indicator and
 * conflict handling on reconnect. This hook keeps all marks in local state,
 * which is the right shape for that, but nothing here persists or syncs yet.
 * Do not ship attendance against a network-only write path.
 */
export default function useRoster({ variant = 'pre' } = {}) {
  const seededMarks = useMemo(() => {
    if (variant === 'progress') return { r1: 'in', r2: 'in', r4: 'in' };
    if (variant === 'complete') {
      return { r1: 'in', r2: 'in', r3: 'in', r4: 'in', r5: 'in', r6: 'in' };
    }
    if (variant === 'noshow') {
      return { r1: 'in', r2: 'out', r3: 'in', r4: 'in', r5: 'out', r6: 'in' };
    }
    return {};
  }, [variant]);

  const [marks, setMarks] = useState(seededMarks);
  const [notes, setNotes] = useState({});

  // Re-seed when the demonstrated state changes (review harness only).
  const [lastVariant, setLastVariant] = useState(variant);
  if (lastVariant !== variant) {
    setLastVariant(variant);
    setMarks(seededMarks);
  }

  const mark = useCallback((athleteId, next) => {
    setMarks((prev) => {
      const updated = { ...prev };
      if (next == null) delete updated[athleteId];
      else updated[athleteId] = next;
      return updated;
    });
  }, []);

  const setNote = useCallback((athleteId, text) => {
    setNotes((prev) => ({ ...prev, [athleteId]: text }));
  }, []);

  const counts = useMemo(() => {
    const inCount = ROSTER.filter((a) => marks[a.id] === 'in').length;
    const outCount = ROSTER.filter((a) => marks[a.id] === 'out').length;
    return {
      in: inCount,
      out: outCount,
      unmarked: ROSTER.length - inCount - outCount,
    };
  }, [marks]);

  const sessionState =
    variant === 'pre'
      ? 'pre'
      : variant === 'complete' || variant === 'noshow'
      ? 'completed'
      : 'progress';

  return { roster: ROSTER, marks, mark, notes, setNote, counts, sessionState };
}
