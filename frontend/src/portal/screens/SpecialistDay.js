import React, { useMemo, useState } from 'react';
import { color, font, radius } from '../tokens';
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
 * @param {() => void} [onSignOut]
 */
export default function SpecialistDay({
  bare = false,
  specialistId,
  canSwitch = false,
  onOpenSession,
  onSignOut,
}) {
  const [activeId, setActiveId] = useState(specialistId ?? SPECIALISTS[0].id);
  const specialist = SPECIALISTS.find((s) => s.id === activeId) ?? SPECIALISTS[0];
  const { data, loading, error } = useSpecialistSessions(activeId);
  const sessions = data?.sessions ?? [];

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
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
