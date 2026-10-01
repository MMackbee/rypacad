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
 * The waitlist's words (audit 2026-09-30), in one place. A waiting athlete is
 * BOOKED when a spot opens - nobody is asked first - so the copy says that,
 * and what it costs. `unlimited` is Elite: no token wording, ever. With no
 * name in hand (an athlete's own My Schedule) the sentence reads "you are".
 */
export function waitlistPromiseCopy({ name = null, unlimited = false } = {}) {
  const who = name ? `${name} is` : 'you are';
  return unlimited
    ? `If a spot opens, ${who} booked automatically. You can cancel until the day before.`
    : `If a spot opens, ${who} booked automatically and one token is used. You can cancel until the day before.`;
}

/**
 * A place still held on the day of the session (owner ruling R3: nobody is
 * promoted on the day, they could not cancel) - it will not turn into a
 * booking, and the copy must not say it might.
 */
export function waitlistClosedCopy({ unlimited = false } = {}) {
  return unlimited
    ? 'Nobody is booked from a waitlist on the day of the session. This place will close.'
    : 'Nobody is booked from a waitlist on the day of the session. This place will close and its token will be free again.';
}

/** "On the waitlist", with the place only when the server gave one. */
export function waitlistStatusCopy(position) {
  return position != null ? `On the waitlist - #${position} in line` : 'On the waitlist';
}

/**
 * Why "Leave waitlist" did not go through (hooks/waitlist.js leaveWaitlist's
 * typed reasons): the athlete was just booked into the session, or a plain
 * line - never the raw permissions text.
 */
export function leaveFailureCopy(err, name = null) {
  if (err && err.reason === 'promoted') {
    return name ? `${name} was just booked into this session.` : 'You were just booked into this session.';
  }
  if (err && err.reason === 'leave-failed' && err.message) return err.message;
  return 'That waitlist place could not be removed. Try again.';
}

/**
 * "Join waitlist · reserves one token" — offered on a full session instead of
 * a dead Full pill. Solid green fill (Button's primary variant): it is
 * tappable, not a status — flag 02's own rule (StatusBadge.js) stays intact
 * because this is a <Button>, never a badge. An Elite athlete holds no
 * tokens, so their button says "Join waitlist" alone.
 */
export function JoinWaitlistButton({ onClick, loading, disabled, unlimited = false, height = 46, style }) {
  return (
    <Button
      loading={loading}
      disabled={disabled}
      height={height}
      onClick={onClick}
      style={{ font: `600 13px ${font.body}`, ...style }}
    >
      {loading ? 'Joining waitlist…' : unlimited ? 'Join waitlist' : 'Join waitlist · reserves one token'}
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
 * "On the waitlist - #N in line". Says "On the waitlist" alone when
 * `position` is unknown rather than inventing a number — every call site
 * reads `position` off the pinned `waitlistPosition` field on a schedule/
 * reservation item, or the booking result's `position` on the confirmation
 * screens, and all of them come from the waitlistPositions callable.
 */
export function WaitlistPositionLine({ position, style }) {
  return (
    <Body size={12} tone={color.secondary} style={style}>
      {waitlistStatusCopy(position)}
    </Body>
  );
}

/** What happens when a spot opens (waitlistPromiseCopy), as a line. */
export function WaitlistPromiseLine({ name, unlimited, style }) {
  return (
    <Body size={12} style={style}>
      {waitlistPromiseCopy({ name, unlimited })}
    </Body>
  );
}

/**
 * A session the athlete already waits for: the status, what happens next and
 * "Leave waitlist" - never "Join waitlist" again. `error` is the last leave's
 * failure, already worded (leaveFailureCopy). `closed` is the day of the
 * session itself, when no promotion happens any more (waitlistClosedCopy).
 * Shared by the booking cards, the Phil sheet, My Schedule and Reservations.
 */
export function OnWaitlist({ position, name, unlimited, closed = false, onLeave, leaving, error, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      <WaitlistPositionLine position={closed ? null : position} />
      {closed ? <Body size={12}>{waitlistClosedCopy({ unlimited })}</Body> : <WaitlistPromiseLine name={name} unlimited={unlimited} />}
      {error ? (
        <Body size={12} tone={color.error}>
          {error}
        </Body>
      ) : null}
      {onLeave ? <LeaveWaitlistButton loading={leaving} onClick={onLeave} /> : null}
    </div>
  );
}

/**
 * Whether `athleteId` waits on a month row or a Phil slot, and their place.
 * A month row carries `waitlistBy` ({ athleteId: place }) because a parent's
 * two children can wait on one session; an athlete's own login passes no id
 * and reads its only entry. A Phil slot is already the chosen athlete's own
 * (`waitlistPosition`, no map). null when they are not waiting.
 */
export function waitingOn(row, athleteId = null) {
  if (!row || !row.waitlisted) return null;
  const by = row.waitlistBy || null;
  if (!by) return { athleteId, position: row.waitlistPosition ?? null };
  const id = athleteId ?? Object.keys(by)[0];
  return id && id in by ? { athleteId: id, position: by[id] ?? null } : null;
}

/**
 * The waitlisted twin of BookSession's/SpecialistBooking's own "Confirmed"
 * body (tick-in-circle, title, a fact card) — yellow/secondary-toned rather
 * than green (existing tokens only: tint.yellowSoft, color.secondary —
 * neither screen introduces a new color). Callers drop this straight into
 * their existing centered flex wrapper in place of the confirmed content.
 */
export function WaitlistedConfirmationBody({ name, when, position, athleteName = null, unlimited = false }) {
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
          <WaitlistPromiseLine name={athleteName} unlimited={unlimited} style={{ marginTop: 6 }} />
          {unlimited ? null : (
            <Body size={12} style={{ marginTop: 6 }}>
              One token is held while on the waitlist. It is free again if you leave, or if no spot opens.
            </Body>
          )}
        </div>
      </Card>
    </>
  );
}
