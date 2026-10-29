import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import BoardRow from '../components/mental/BoardRow';
import { Banner, Body, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { useContractBoard } from '../hooks';
import { addDays, weekStartFor } from '../data/contractRule';
import { academyDateISO } from '../data/calendar';

const GROUPS = [
  { key: 'due', label: 'Due for a check-in', empty: 'No one is due' },
  { key: 'thisWeek', label: 'This week', empty: 'Everyone is checked in' },
  { key: 'checkedIn', label: 'Checked in this week', empty: 'No check-ins yet this week' },
];

const arrow = (disabled) => ({
  width: 44,
  height: 44,
  flex: 'none',
  border: `1px solid ${color.controlBorder}`,
  borderRadius: radius.control,
  background: 'transparent',
  font: `500 20px ${font.body}`,
  color: disabled ? color.faintText : color.text,
  cursor: disabled ? 'default' : 'pointer',
});

/**
 * The Commitment Contract board (2026-10-28, spec 5.4): who logged their
 * minutes, week by week, in three groups - due for a check-in (14 days, the
 * Monday email's list), this week, and checked in this week - with a
 * per-week Checked in switch for Yannick. Owner and ops reach it by URL and
 * read it without the switch. Never behind the family contract switch; a
 * banner says when families are not logging yet. "Today" is the academy's
 * America/Chicago date.
 */
export default function MentalContract({ bare = false, role = 'mental', onSignOut }) {
  const today = academyDateISO();
  const current = weekStartFor(today);
  const [week, setWeek] = useState(current);
  const [writeFailed, setWriteFailed] = useState(false);
  const { rows, config, setCheckin, loading, error } = useContractBoard(week);
  const canToggle = role === 'mental';
  const atCurrent = week >= current;

  const toggle = (row) => {
    setWriteFailed(false);
    Promise.resolve(setCheckin({ athleteId: row.athleteId, checkedIn: !row.checkedInThisWeek })).catch(() => setWriteFailed(true));
  };

  return (
    <PhoneFrame
      bare={bare}
      style={{ maxWidth: 720 }}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SectionLabel style={{ marginBottom: 4 }}>Commitment contract</SectionLabel>
              <ScreenTitle size={22}>Contract board</ScreenTitle>
            </div>
            <SignOutButton onSignOut={onSignOut} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <button type="button" aria-label="Previous week" style={arrow(false)} onClick={() => setWeek((w) => addDays(w, -7))}>
              ‹
            </button>
            <div style={{ flex: 1, textAlign: 'center', font: `600 14px ${font.body}`, color: color.text }}>
              Week of {format(parseISO(week), 'MMM d')}
            </div>
            <button
              type="button"
              aria-label="Next week"
              disabled={atCurrent}
              style={arrow(atCurrent)}
              onClick={() => setWeek((w) => (w >= current ? w : addDays(w, 7)))}
            >
              ›
            </button>
          </div>
        </div>
      }
      footer={role === 'mental' ? <BottomTabBar role={role} active="mental-contract" /> : <BottomTabBar role={role} />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {config && config.enabled === false ? (
          <Banner tone="yellow">The contract switch is off: families are not logging yet.</Banner>
        ) : null}
        {writeFailed ? (
          <Body size={12} tone={color.error}>That check-in didn't save. Check your connection and try again.</Body>
        ) : null}
        {loading ? (
          <>
            <SkeletonCard large height={90} />
            <SkeletonCard large height={90} />
          </>
        ) : error ? (
          <ErrorNotice title="The board didn't load" />
        ) : (
          GROUPS.map((g) => {
            const list = rows?.[g.key] ?? [];
            return (
              <section key={g.key}>
                <SectionLabel tone={g.key === 'due' && list.length ? color.errorMid : undefined} style={{ marginBottom: 4 }}>
                  {g.label} · {list.length}
                </SectionLabel>
                {list.length === 0 ? (
                  <div style={{ border: `1px dashed ${color.border}`, borderRadius: radius.card, padding: '12px 14px', marginTop: 6 }}>
                    <Body size={12} tone={color.textTertiary}>{g.empty}</Body>
                  </div>
                ) : (
                  list.map((row) => <BoardRow key={row.athleteId} row={row} canToggle={canToggle} onToggle={() => toggle(row)} />)
                )}
              </section>
            );
          })
        )}
      </div>
    </PhoneFrame>
  );
}
