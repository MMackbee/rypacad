import React, { useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import BoardRow from '../components/mental/BoardRow';
import { Banner, Body, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { useContractBoard } from '../hooks';
import { addDays, weekStartFor } from '../data/contractRule';
import { WEEKS_AHEAD, isSearching, searchRows } from '../data/contractBoard';
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

// The search box under the week switcher (Yannick, 2026-11-04: "search kids").
const searchField = {
  width: '100%',
  boxSizing: 'border-box',
  height: 44,
  padding: '0 44px 0 12px',
  border: `1px solid ${color.controlBorder}`,
  borderRadius: radius.control,
  background: color.surface,
  font: `400 16px ${font.body}`, // 16px: iOS Safari zooms the page into any input under 16px and leaves it zoomed
  color: color.text,
  WebkitAppearance: 'none',
  appearance: 'none',
};
// The full 44px touch target, over the field's 44px right padding.
const clearButton = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: 44,
  height: 44,
  border: 'none',
  borderRadius: radius.control,
  background: 'transparent',
  font: `400 20px ${font.body}`,
  color: color.textSecondary,
  cursor: 'pointer',
};

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
 * The groups as shown: a row whose note prompt is open stays where it was
 * ticked (its group and place) until the prompt closes, so the prompt opens
 * under Yannick's thumb and not two screens down under "Checked in". Rows
 * come from boardRows; `open` maps athleteId -> { group, index } for every
 * open prompt. A pinned athlete who is no longer checked in (unticked, or
 * the tick was refused) is simply not moved.
 */
function pinOpenRows(rows, open) {
  const lists = { due: [...rows.due], thisWeek: [...rows.thisWeek], checkedIn: [...rows.checkedIn] };
  for (const [athleteId, pin] of Object.entries(open)) {
    if (!pin || pin.group === 'checkedIn' || !lists[pin.group]) continue;
    const i = lists.checkedIn.findIndex((r) => r.athleteId === athleteId);
    if (i < 0) continue;
    const [row] = lists.checkedIn.splice(i, 1);
    const target = lists[pin.group];
    target.splice(Math.min(pin.index, target.length), 0, row);
  }
  return lists;
}

/** True when this row's note prompt is open: it is in `open` and still checked in. */
const promptOpen = (open, row) => Boolean(open[row.athleteId]) && Boolean(row.checkedInThisWeek);

/**
 * The Commitment Contract board (2026-10-28, spec 5.4): who logged their
 * minutes, week by week, in three groups - due for a check-in (14 days, the
 * Monday email's list), this week, and checked in this week - with a
 * per-week Checked in tick for Yannick that opens a note prompt under the
 * row (Yannick's staging notes, 2026-10-30). Each row's prompt is its own:
 * ticking a second athlete leaves the first prompt open, and a row keeps
 * its place while its prompt is open. Each row also says where the athlete
 * is at the academy that week, so the switcher goes back week by week and
 * up to WEEKS_AHEAD weeks forward; a future week is read-only. A past week
 * names its groups and rows as that week (never "this week"); Due is
 * always as of today, and says so there. Owner and ops reach it by URL and
 * read it without the tick. Never behind the family contract switch; a
 * banner says when families are not logging yet. "Today" is the academy's
 * America/Chicago date. A search box under the week switcher (Yannick,
 * 2026-11-04: "search kids") narrows every group to the athletes whose name
 * or family name starts with what was typed: it filters AFTER the open-prompt
 * pinning and never hides a row with its prompt open, so that row keeps its
 * place and its typed note; a row's place is always taken in the whole
 * group, never the searched list; the query stays through week switches; a
 * search that leaves no one says so in one line, and a group it empties
 * speaks of the search, not the board.
 */
export default function MentalContract({ bare = false, role = 'mental', onSignOut }) {
  const today = academyDateISO();
  const current = weekStartFor(today);
  const last = addDays(current, 7 * WEEKS_AHEAD);
  const [week, setWeek] = useState(current);
  const [failed, setFailed] = useState(null); // 'checkin' | 'note' | null
  const [open, setOpen] = useState({}); // athleteId -> { group, index }: an open note prompt, and where its row stays
  const [query, setQuery] = useState('');
  const searchInput = useRef(null);
  const { rows, config, setCheckin, setCheckinNote, loading, error } = useContractBoard(week);
  const atCurrent = week === current;
  const isFuture = week > current;
  const canToggle = role === 'mental' && !isFuture;
  const groups = atCurrent ? GROUPS : isFuture ? FUTURE_GROUPS : PAST_GROUPS;
  const weekLabel = atCurrent ? 'This week' : `Week of ${format(parseISO(week), 'MMM d')}`;
  const priorLabel = atCurrent ? 'Last week' : 'Week before';
  const pinned = useMemo(() => (rows ? pinOpenRows(rows, open) : null), [rows, open]);
  const searching = isSearching(query);
  const shown = useMemo(() => {
    if (!pinned) return null;
    const keep = new Set(Object.values(pinned).flat().filter((r) => promptOpen(open, r)).map((r) => r.athleteId));
    return searchRows(pinned, query, keep);
  }, [pinned, open, query]);
  const noMatch = searching && Boolean(shown) && !shown.due.length && !shown.thisWeek.length && !shown.checkedIn.length;

  // A row's place while its prompt is open is its place in the whole group, not in the searched list.
  const openNote = (athleteId, group) => {
    const index = Math.max(0, (pinned?.[group] ?? []).findIndex((r) => r.athleteId === athleteId));
    setOpen((o) => ({ ...o, [athleteId]: { group, index } }));
  };
  const closeNote = (athleteId) => setOpen((o) => {
    if (!(athleteId in o)) return o;
    const next = { ...o };
    delete next[athleteId];
    return next;
  });
  const goTo = (w) => { setOpen({}); setFailed(null); setWeek(w); };

  const toggle = (row, group) => {
    setFailed(null);
    const checkedIn = !row.checkedInThisWeek;
    if (checkedIn) openNote(row.athleteId, group);
    else closeNote(row.athleteId);
    Promise.resolve(setCheckin({ athleteId: row.athleteId, checkedIn })).catch(() => {
      setFailed('checkin');
      closeNote(row.athleteId);
    });
  };

  const saveNote = async (row, text) => {
    setFailed(null);
    try {
      await setCheckinNote({ athleteId: row.athleteId, note: text });
      closeNote(row.athleteId);
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
              {isFuture ? ' · ahead' : ''}
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
          <div style={{ position: 'relative', marginTop: 10 }}>
            <input
              ref={searchInput}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              aria-label="Search athletes"
              placeholder="Search by name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={searchField}
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  searchInput.current?.focus();
                }}
                style={clearButton}
              >
                ×
              </button>
            ) : null}
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
        ) : noMatch ? (
          <div style={{ border: `1px dashed ${color.border}`, borderRadius: radius.card, padding: '12px 14px' }}>
            <Body size={12} tone={color.textTertiary}>No one on the board matches “{query.trim()}”.</Body>
          </div>
        ) : (
          groups.map((g) => {
            const list = shown?.[g.key] ?? [];
            return (
              <section key={g.key}>
                <SectionLabel tone={g.key === 'due' && list.length ? color.errorMid : undefined} style={{ marginBottom: 4 }}>
                  {g.label} · {list.length}
                </SectionLabel>
                {list.length === 0 ? (
                  <div style={{ border: `1px dashed ${color.border}`, borderRadius: radius.card, padding: '12px 14px', marginTop: 6 }}>
                    <Body size={12} tone={color.textTertiary}>
                      {searching ? `No one in this group matches “${query.trim()}”.` : g.empty}
                    </Body>
                  </div>
                ) : (
                  list.map((row) => (
                    <BoardRow
                      key={row.athleteId}
                      row={row}
                      canToggle={canToggle}
                      onToggle={() => toggle(row, g.key)}
                      weekLabel={weekLabel}
                      priorLabel={priorLabel}
                      noteOpen={promptOpen(open, row)}
                      onSaveNote={(text) => saveNote(row, text)}
                      onCloseNote={() => closeNote(row.athleteId)}
                      onEditNote={() => openNote(row.athleteId, g.key)}
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
