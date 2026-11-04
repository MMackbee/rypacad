import React from 'react';
import { ErrorNotice } from './Primitives';
import { ERR } from '../hooks/live';

/**
 * Why a live roster could not load, in words the coach can act on
 * (2026-11-04, Jenn Huber's report: a roster the rules refused rendered as
 * 0 in / 0 out / 0 unmarked under "3 of 14 booked", with nothing to say).
 * A permission refusal is the owner's to fix - the account's access - never
 * the coach's, so that sentence names the owner and offers no retry.
 */
export function rosterLoadCopy(err) {
  if (err?.code === ERR.PERMISSION) {
    return "Your account can't read athletes, so this roster can't load. Tell the owner to check your access.";
  }
  return "The roster didn't load. Check your connection and try again.";
}

/**
 * The notice itself, the portal's titled red banner (Primitives'
 * ErrorNotice): "Try again" only when a retry can help, which a refusal
 * cannot. `onRetry` is the caller's re-read (SessionAttendance bumps
 * 'bookings'); omitted, the banner states the failure alone.
 */
export default function RosterLoadNotice({ error, onRetry, style }) {
  const refused = error?.code === ERR.PERMISSION;
  return (
    <ErrorNotice title="The roster didn't load" onRetry={refused ? undefined : onRetry} style={style}>
      {refused ? rosterLoadCopy(error) : 'Check your connection and try again.'}
    </ErrorNotice>
  );
}
