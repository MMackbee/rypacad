import React, { useState } from 'react';
import { color, font, radius } from '../../tokens';
import SessionCard from '../SessionCard';
import { CapacityPill } from '../StatusBadge';
import { Body } from '../Primitives';
import { useStaffDaySessions } from '../../hooks/staffBooking';
import { staffAddFacts } from '../../data/staffBooking';
import { sessionLabel } from '../../data/billingHub';
import { addDaysISO, academyDateISO, parseTimeToMinutes } from '../../data/calendar';
import { handicapLimitOf } from '../../data/reserved';
import { SEASON_BOUNDS } from '../../data/season';
import {
  BOOKED_TAG,
  DAY_LABEL,
  FINDING_SESSIONS,
  NEXT_DAY,
  PREV_DAY,
  SESSIONS_LOAD_FAILED,
  STARTED_TAG,
  WAITLISTED_TAG,
  noSessionsOn,
  reservedTagLine,
  seatsPill,
} from '../../data/staffBookingCopy';

/** `iso` held inside `[min, max]`. */
function clamp(iso, min, max) {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

/** Minutes from midnight for sorting; a time that does not read sorts last. */
function startMinutes(time) {
  return parseTimeToMinutes(time) ?? 24 * 60;
}

/**
 * Pick a day and a session (spec 01-spec-admin-booking.md 10.5), for Book a
 * session and Move. Content only: the add and move sheets wrap it in their
 * StaffSheet and put Close in its footer.
 *
 * The day is a native date input ("Day", 44px) from the athlete's current
 * period start to the season's end, today by default (or `initialDay`),
 * with "‹ Previous day" and "Next day ›". The list is that day's sessions
 * (useStaffDaySessions, re-read when `reloadKey` changes) the athlete may
 * be added to (staffAddFacts `offer`) or already holds: seats left first,
 * then full, each by start time; the pill "{n} left" or "Full · {taken} of
 * {capacity}"; the tags Started and Waitlisted and the Reserved chip. A
 * session the athlete holds reads Booked and cannot be tapped. In `mode`
 * 'move' only `fromRow`'s kind is listed, never its own session. A refusal
 * line (`notice`) sits above the list.
 *
 * @param {object} model  data/staffAthlete.js staffAthleteModel.
 * @param {(session: object) => void} onPick
 * @param {?string} [initialDay]  The day to open on: the sheet's last pick,
 *   so Back and a refusal about the session reopen the picker there, not on
 *   today (walkthrough 2026-11-13). Null opens on today.
 * @param {Date} [now]  The clock (tests pin it).
 */
export default function StaffSessionPicker({ model, mode = 'add', fromRow = null, onPick, notice = null, reloadKey = 0, initialDay = null, now }) {
  const clock = now ?? new Date();
  const min = model.period.start;
  const max = SEASON_BOUNDS.end;
  const [day, setDay] = useState(() => clamp(initialDay || academyDateISO(clock), min, max));
  const { data, loading, error } = useStaffDaySessions(day, reloadKey);
  const go = (iso) => setDay(clamp(iso, min, max));

  const listed = (data || [])
    .filter((s) => mode !== 'move' || (fromRow && s.type === fromRow.type && s.id !== fromRow.sessionId))
    .map((s) => ({ s, facts: staffAddFacts(s, model, clock) }))
    .filter(({ facts }) => facts.offer || facts.held)
    .sort((a, b) => (a.facts.full === b.facts.full ? startMinutes(a.s.time) - startMinutes(b.s.time) : a.facts.full ? 1 : -1));

  let list;
  if (loading) list = <Body size={12}>{FINDING_SESSIONS}</Body>;
  else if (error) list = <Body size={12}>{SESSIONS_LOAD_FAILED}</Body>;
  else if (!listed.length) list = <Body size={12}>{noSessionsOn(day)}</Body>;
  else list = listed.map(({ s, facts }) => <SessionRow key={s.id} session={s} facts={facts} onPick={onPick} />);

  return (
    <div style={{ marginTop: 14 }}>
      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', font: `500 11px ${font.body}`, letterSpacing: '.1em', textTransform: 'uppercase', color: color.textSecondary, marginBottom: 7 }}>
          {DAY_LABEL}
        </span>
        <input
          type="date"
          aria-label={DAY_LABEL}
          value={day}
          min={min}
          max={max}
          onChange={(e) => {
            if (e.target.value) go(e.target.value);
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: 44,
            padding: '0 12px',
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: radius.input,
            color: color.text,
            // 16px: iOS Safari zooms the page into any input under 16px.
            font: `400 16px ${font.body}`,
            colorScheme: 'dark',
          }}
        />
      </label>
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <DayButton label={PREV_DAY} disabled={day <= min} onClick={() => go(addDaysISO(day, -1))} />
        <DayButton label={NEXT_DAY} disabled={day >= max} onClick={() => go(addDaysISO(day, 1))} />
      </div>
      {notice ? (
        <div role="status" style={{ marginTop: 12, font: `400 12px/1.5 ${font.body}`, color: color.error }}>
          {notice}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>{list}</div>
    </div>
  );
}

function DayButton({ label, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        height: 44,
        background: 'transparent',
        border: `1px solid ${color.border}`,
        borderRadius: radius.input,
        color: disabled ? color.faintText : color.text,
        font: `600 13px ${font.body}`,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

/** One session: a tappable SessionCard, or a Booked one that is not. */
function SessionRow({ session: s, facts, onPick }) {
  const [time, meridiem] = String(s.time ?? '').split(' ');
  const name = sessionLabel(s, s.type);
  const limit = handicapLimitOf(s);
  const tags = [facts.started ? STARTED_TAG : null, facts.waiting ? WAITLISTED_TAG : null].filter(Boolean);
  const pill = facts.held ? (
    <CapacityPill state="booked">{BOOKED_TAG}</CapacityPill>
  ) : (
    <CapacityPill state={facts.full ? 'full' : 'available'}>{seatsPill(facts)}</CapacityPill>
  );
  const card = (
    <SessionCard
      time={time}
      meridiem={meridiem}
      type={s.type}
      name={name}
      meta={tags.length ? tags.join(' · ') : null}
      reserved={limit == null ? null : reservedTagLine(limit)}
      variant={facts.full && !facts.held ? 'full' : 'default'}
      trailing={pill}
    />
  );
  if (facts.held) return <div data-staff-session={s.id}>{card}</div>;
  const pick = () => onPick(s);
  return (
    <div
      data-staff-session={s.id}
      role="button"
      tabIndex={0}
      aria-label={`${name} ${s.time ?? ''}, ${seatsPill(facts)}`.trim()}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {card}
    </div>
  );
}
