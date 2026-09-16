import React from 'react';
import { color, font, tint } from '../tokens';
import Button from './Button';
import { Body, Card, ScreenTitle, Tick } from './Primitives';

/**
 * Waitlist UI, shared by BookSession.js and SpecialistBooking.js (Sprint 13
 * pin, contract v2.1 §F). Both screens are already over the project's
 * 500-line file guideline, so the pin's own instruction is followed here:
 * the join/leave affordances and the waitlisted confirmation card live once,
 * in components/, and each screen only wires a click handler to it.
 *
 * `useWaitlist(sessionId, { athleteId })` (the position/leave() source) is a
 * NEW hook that does not exist in this worktree's hooks/index.js yet — every
 * caller of `WaitlistPositionLine`/`LeaveWaitlistButton` marks its own call
 * Wired to hooks/waitlist.js (leaveWaitlist) and the booking result's
 * position at Sprint 13 integration.
 */

/**
 * "Join waitlist · reserves one token" — offered on a full session instead of
 * a dead Full pill. Solid green fill (Button's primary variant): it is
 * tappable, not a status — flag 02's own rule (StatusBadge.js) stays intact
 * because this is a <Button>, never a badge.
 */
export function JoinWaitlistButton({ onClick, loading, disabled, height = 46, style }) {
  return (
    <Button
      loading={loading}
      disabled={disabled}
      height={height}
      onClick={onClick}
      style={{ font: `600 13px ${font.body}`, ...style }}
    >
      {loading ? 'Joining waitlist…' : 'Join waitlist · reserves one token'}
    </Button>
  );
}

/**
 * "Leave waitlist" — the same weight CancelSheet's own "Cancel reservation"
 * carries (dangerOutline): giving up a reserved spot is the same class of
 * action as cancelling a confirmed one.
 */
export function LeaveWaitlistButton({ onClick, loading, style }) {
  return (
    <Button
      variant="dangerOutline"
      height={44}
      loading={loading}
      style={{ boxShadow: 'none', ...style }}
      onClick={onClick}
    >
      {loading ? 'Leaving…' : 'Leave waitlist'}
    </Button>
  );
}

/**
 * "You're #N on the waitlist." Degrades to a generic line when `position` is
 * unknown rather than inventing a number — every call site currently reads
 * `position` off the pinned `waitlistPosition` field on a schedule/
 * reservation item, or the booking result's `position` on the confirmation
 * screens (Sprint 13 integration).
 */
export function WaitlistPositionLine({ position, style }) {
  return (
    <Body size={12} tone={color.secondary} style={style}>
      {position != null
        ? `You're #${position} on the waitlist.`
        : "You're on the waitlist — we'll notify you if a spot opens."}
    </Body>
  );
}

/**
 * The waitlisted twin of BookSession's/SpecialistBooking's own "Confirmed"
 * body (tick-in-circle, title, a fact card) — yellow/secondary-toned rather
 * than green (existing tokens only: tint.yellowSoft, color.secondary —
 * neither screen introduces a new color). Callers drop this straight into
 * their existing centered flex wrapper in place of the confirmed content.
 */
export function WaitlistedConfirmationBody({ name, when, position }) {
  return (
    <>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: tint.yellowSoft,
          border: `2px solid ${color.secondary}`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Tick size={26} color={color.secondary} thickness={3} />
      </div>

      <ScreenTitle size={26}>You're on the waitlist</ScreenTitle>

      <Card tone="yellow" large style={{ width: '100%', marginTop: 6 }}>
        <div style={{ font: `700 19px ${font.head}`, color: color.text }}>{name}</div>
        <Body size={12} style={{ marginTop: 10 }}>
          {when}
        </Body>
        <div style={{ borderTop: `1px solid ${color.border}`, marginTop: 14, paddingTop: 12 }}>
          <WaitlistPositionLine position={position} />
          <Body size={12} style={{ marginTop: 6 }}>
            Reserving your place holds one token — you'll be notified if a spot opens.
          </Body>
        </div>
      </Card>
    </>
  );
}
