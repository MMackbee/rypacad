import React from 'react';
import SkeletonCard from './Skeleton';
import { ErrorNotice } from './Primitives';
import { bump } from '../hooks/invalidate';

/**
 * The coach's Today overview before its blocks are in (review 2026-11-17):
 * a day still loading is not an empty day. While useCoachDay reads, block
 * skeletons; if the read failed, a plain line and Try again (it re-runs on
 * the sessions generation). Never "No sessions today" - CoachDashboard
 * shows that only for a loaded day with no blocks.
 */
export default function CoachDayPending({ error }) {
  if (error) {
    return (
      <ErrorNotice title="Today's sessions didn't load" onRetry={() => bump('sessions')}>
        Check your connection and try again.
      </ErrorNotice>
    );
  }
  return (
    <div role="status" aria-label="Loading today's sessions" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SkeletonCard large height={96} />
      <SkeletonCard large height={96} />
    </div>
  );
}
