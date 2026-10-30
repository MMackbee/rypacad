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
import { WEEKS_AHEAD } from '../data/contractBoard';
import { academyDateISO } from '../data/calendar';

const GROUPS = [
  { key: 'due', label: 'Due for a check-in', empty: 'No one is due' },
  { key: 'thisWeek', label: 'This week', empty: 'Everyone is checked in' },
  { key: 'checkedIn', label: 'Checked in this week', empty: 'No check-ins yet this week' },
];
// A past week is named as that week; Due is always counted from today, so it says so.
const PAST_GROUPS = [
  { key: 'due', label: 'Due for a check-in, as of today', empty: 'No one is due' },
  { key: 'thisWeek', label: 'Not checked in that week', empty: 'Everyone was checked in that week' },
  { key: 'checkedIn', label: 'Checked in that week', empty: 'No check-ins that week' },
];
// A future week is for seeing who is coming in; nobody can be checked in there yet.
const FUTURE_GROUPS = [
  { key: 'due', label: 'Due for a check-in, as of today', empty: 'No one is due' },
  { key: 'thisWeek', label: 'That week', empty: 'No one is on the contract' },
  { key: 'checkedIn', label: 'Checked in that week', empty: 'Check-ins open when the week starts' },
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
 * per-week Checked in tick for Yannick that opens a note prompt (Yannick's
 * staging notes, 2026-10-30). Each row also says where the athlete is at
 * the academy that week, so the switcher goes back week by week and up to
 * WEEKS_AHEAD weeks forward; a future week is read-only. A past week names
 * its groups and rows as that week (never "this week"); Due is always as
 * of today, and says so there. Owner and ops reach it by URL and read it
 * without the tick. Never behind the family contract switch; a banner says
 * when families are not logging yet. "Today" is the academy's
 * America/Chicago date.
 */
export default function MentalContract({ bare = false, role = 'mental', onSignOut }) {
  const today = academyDateISO();
  const current = weekStartFor(today);
  const last = addDays(current, 7 * WEEKS_AHEAD);
  const [week, setWeek] = useState(current);
  const [failed, setFailed] = useState(null); // 'checkin' | 'note' | null
  const [noteFor, setNoteFor] = useState(null); // athleteId whose note composer is open
  const { rows, config, setCheckin, setCheckinNote, loading, error } = useContractBoard(week);
  const atCurrent = week === current;
  const isFuture = week > current;
  const canToggle = role === 'mental' && !isFuture;
  const groups = atCurrent ? GROUPS : isFuture ? FUTURE_GROUPS : PAST_GROUPS;
  const weekLabel = atCurrent ? 'This week' : `Week of ${format(parseISO(week), 'MMM d')}`;
  const priorLabel = atCurrent ? 'Last week' : 'Week before';

  const goTo = (w) => { setNoteFor(null); setFailed(null); setWeek(w); };

  const toggle = (row) => {
    setFailed(null);
    const checkedIn = !row.checkedInThisWeek;
    setNoteFor(checkedIn ? row.athleteId : (noteFor === row.athleteId ? null : noteFor));
    Promise.resolve(setCheckin({ athleteId: row.athleteId, checkedIn })).catch(() => {
      setFailed('checkin');
      setNoteFor((open) => (open === row.athleteId ? null : open));
    });
  };

  const saveNote = async (row, text) => {
    setFailed(null);
    try {
      await setCheckinNote({ athleteId: row.athleteId, note: text });
      setNoteFor((open) => (open === row.athleteId ? null : open));
    } catch (e) {
      setFailed('note');
    }
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
            <button type="button" aria-label="Previous week" style={arrow(false)} onClick={() => goTo(addDays(week, -7))}>
              ‹
            </button>
            <div style={{ flex: 1, textAlign: 'center', font: `600 14px ${font.body}`, color: color.text }}>
              Week of {format(parseISO(week), 'MMM d')}
              {atCurrent ? '' : isFuture ? ' · ahead' : ''}
            </div>
            <button
              type="button"
              aria-label="Next week"
              disabled={week >= last}
              style={arrow(week >= last)}
              onClick={() => goTo(week >= last ? week : addDays(week, 7))}
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
        {failed === 'checkin' ? (
          <Body size={12} tone={color.error}>That check-in didn't save. Check your connection and try again.</Body>
        ) : null}
        {failed === 'note' ? (
          <Body size={12} tone={color.error}>That note didn't save. Check your connection and try again.</Body>
        ) : null}
        {loading ? (
          <>
            <SkeletonCard large height={90} />
            <SkeletonCard large height={90} />
          </>
        ) : error ? (
          <ErrorNotice title="The board didn't load" />
        ) : (
          groups.map((g) => {
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
                  list.map((row) => (
                    <BoardRow
                      key={row.athleteId}
                      row={row}
                      canToggle={canToggle}
                      onToggle={() => toggle(row)}
                      weekLabel={weekLabel}
                      priorLabel={priorLabel}
                      noteOpen={noteFor === row.athleteId && Boolean(row.checkedInThisWeek)}
                      onSaveNote={(text) => saveNote(row, text)}
                      onCloseNote={() => setNoteFor((open) => (open === row.athleteId ? null : open))}
                      onEditNote={() => setNoteFor(row.athleteId)}
                    />
                  ))
                )}
              </section>
            );
          })
        )}
      </div>
    </PhoneFrame>
  );
}
