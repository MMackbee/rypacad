import React, { useMemo, useState } from 'react';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import PhoneFrame from '../components/PhoneFrame';
import SessionCard from '../components/SessionCard';
import { CapacityPill } from '../components/StatusBadge';
import { Body, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { useSpecialistSessions } from '../hooks';
import { SPECIALISTS } from '../data/specialists';

/**
 * My Sessions - the specialist's own day view (Sprint 9 amendment v1.7.1,
 * TEAM.md: "provision Yannick and Phils account seperately to have access to
 * the back end of the booked session side"). The signed-in specialist sees
 * their upcoming sessions over the same rolling window families book
 * against, each with its live booked count and roster names; tapping one
 * opens the exact SessionAttendance screen coaches use, so attendance and
 * no-show reasons work identically for a specialist's session.
 *
 * `specialistId` comes from the caller's users doc (users.specialistId,
 * written by provisioning) - Yannick's resolves to 'mental', Phil's to
 * 'phil'. ops/owner have no specialistId of their own and get the switcher
 * instead (`canSwitch`), starting on the first SPECIALISTS entry.
 *
 * Names may be null for an athlete the caller cannot read (the per-id join
 * drops denied reads rather than failing) - the row falls back to the booked
 * count, never a crash and never an invented name.
 *
 * @param {string} [specialistId]  'phil' | 'mental' - the caller's own link.
 * @param {boolean} [canSwitch]    ops/owner oversight: show the specialist
 *   switcher instead of a fixed identity.
 * @param {(session: object) => void} [onOpenSession]  Tapped session - the
 *   route wires this to the attendance screen with the session's real facts.
 * @param {'owner'|'ops'|'mental'} [role]  Sprint 10 pin F: which staff tab
 *   set the footer shows when this specialist account has no coach role of
 *   its own (Yannick lands here as 'mental'; ops/owner get `canSwitch`).
 *   Ignored when `specialistId === 'phil'` (Phil is a coach account, so the
 *   footer uses the coach-with-specialistId variant instead).
 * @param {() => void} [onSignOut]
 */
export default function SpecialistDay({
  bare = false,
  specialistId,
  canSwitch = false,
  role,
  onOpenSession,
  onSignOut,
}) {
  const [activeId, setActiveId] = useState(specialistId ?? SPECIALISTS[0].id);
  const specialist = SPECIALISTS.find((s) => s.id === activeId) ?? SPECIALISTS[0];
  const { data, loading, error } = useSpecialistSessions(activeId);
  // Memoized so the day-grouping memo below keys off real data changes,
  // not a fresh [] minted every render (CRA exhaustive-deps).
  const sessions = useMemo(() => data?.sessions ?? [], [data]);

  // Day-grouped, preserving the hook's own date order.
  const byDay = useMemo(() => {
    const groups = [];
    for (const s of sessions) {
      const last = groups[groups.length - 1];
      if (last && last.dayLabel === s.dayLabel) last.sessions.push(s);
      else groups.push({ dayLabel: s.dayLabel, sessions: [s] });
    }
    return groups;
  }, [sessions]);

  // Sprint 10 pin I ("SpecialistDay gets a pinned 'Today' section"): the
  // hook's own dayLabel already reads 'Today' for the current date
  // (data/season.js's dayLabel(iso, today)) - no separate date math needed.
  // Reusing the day-strip component from SpecialistBooking.js did not
  // extract cleanly for a single pinned section (it drives a 14-day picker,
  // not a highlight card), so per the pin's own fallback this leaves the
  // full day-grouped list below untouched and adds a highlight above it.
  const todayGroup = byDay.find((g) => g.dayLabel === 'Today');

  // Coach-with-specialistId ('phil') gets the coach tab set variant;
  // Yannick and any ops/owner switcher land on the staff role tab sets.
  const footerRole = specialistId === 'phil' ? 'coach' : role || 'mental';

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SectionLabel style={{ marginBottom: 4 }}>My sessions</SectionLabel>
              <ScreenTitle size={22}>
                {specialist.name} · {specialist.discipline}
              </ScreenTitle>
            </div>
            <SignOutButton onSignOut={onSignOut} />
          </div>
          {canSwitch ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {SPECIALISTS.map((s) => {
                const on = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    style={{
                      flex: 1,
                      height: 34,
                      border: `1px solid ${on ? color.primary : color.controlBorder}`,
                      borderRadius: radius.pill,
                      background: on ? color.primary : 'transparent',
                      font: `${on ? 600 : 500} 12px ${font.body}`,
                      color: on ? '#000' : color.textTertiary,
                      cursor: 'pointer',
                    }}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      }
      footer={
        <BottomTabBar
          role={footerRole}
          specialistId={footerRole === 'coach' ? specialistId : undefined}
          active="sessions"
        />
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!loading && !error && todayGroup ? (
          <div style={{ marginBottom: 8 }}>
            <SectionLabel tone={color.primary} style={{ margin: '2px 0 8px' }}>
              Today
            </SectionLabel>
            {todayGroup.sessions.map((s) => (
              <TodaySessionCard key={s.sessionId} session={s} specialist={specialist} onOpenSession={onOpenSession} />
            ))}
          </div>
        ) : null}

        {loading ? (
          <Body size={12}>Loading your sessions…</Body>
        ) : error ? (
          <Body size={12} tone={color.error}>
            Your sessions didn't load. Check your connection and try again.
          </Body>
        ) : sessions.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${color.border}`,
              borderRadius: radius.cardLarge,
              padding: '30px 22px',
              textAlign: 'center',
            }}
          >
            <ScreenTitle size={17}>Nothing on the calendar</ScreenTitle>
            <Body size={12} style={{ marginTop: 8 }}>
              Sessions added to the academy calendar show up here as families book them.
            </Body>
          </div>
        ) : (
          byDay.map((group) => (
            <div key={group.dayLabel} style={{ marginBottom: 10 }}>
              <SectionLabel style={{ margin: '8px 0' }}>{group.dayLabel}</SectionLabel>
              {group.sessions.map((s) => {
                const [time, meridiem] = (s.time || '').split(' ');
                const names = s.athletes.map((a) => a.name).filter(Boolean);
                return (
                  <SessionCard
                    key={s.sessionId}
                    time={time}
                    meridiem={meridiem}
                    type={activeId}
                    name={specialist.sessionNoun}
                    meta={
                      s.booked === 0
                        ? 'No one booked yet'
                        : names.length
                        ? names.join(', ')
                        : `${s.booked} booked`
                    }
                    onClick={onOpenSession ? () => onOpenSession({ ...s, type: activeId }) : undefined}
                    trailing={
                      <CapacityPill state={s.booked >= s.capacity ? 'full' : 'available'}>
                        {s.booked}/{s.capacity}
                      </CapacityPill>
                    }
                  />
                );
              })}
            </div>
          ))
        )}
      </div>
    </PhoneFrame>
  );
}

/**
 * The pinned "Today" section's row (Sprint 10 pin I) - same fields the full
 * day-grouped list already renders per session, styled with SessionCard's
 * `live` variant (green border) so today's real work stands out above the
 * rest of the rolling window.
 */
function TodaySessionCard({ session, specialist, onOpenSession }) {
  const [time, meridiem] = (session.time || '').split(' ');
  const names = session.athletes.map((a) => a.name).filter(Boolean);
  return (
    <SessionCard
      time={time}
      meridiem={meridiem}
      type={specialist.id}
      variant="live"
      name={specialist.sessionNoun}
      meta={
        session.booked === 0
          ? 'No one booked yet'
          : names.length
          ? names.join(', ')
          : `${session.booked} booked`
      }
      onClick={onOpenSession ? () => onOpenSession({ ...session, type: specialist.id }) : undefined}
      trailing={
        <CapacityPill state={session.booked >= session.capacity ? 'full' : 'available'}>
          {session.booked}/{session.capacity}
        </CapacityPill>
      }
      style={{ marginBottom: 8 }}
    />
  );
}
