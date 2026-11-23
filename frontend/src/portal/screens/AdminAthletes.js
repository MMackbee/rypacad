import React, { useMemo, useState } from 'react';
import { TOUCH_MIN, color, font, radius } from '../tokens';
import { useAthleteRoster } from '../hooks/athleteRoster';
import BottomTabBar from '../components/BottomTabBar';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import ParallaxTick from '../components/combine/ParallaxTick';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { academyDateISO } from '../data/calendar';
import { FITNESS_DOC_ID, INTAKE_DOC_ID, markWords } from '../data/combine';
import {
  COUNT_EMPTY, LOADING_COPY, LOAD_ERROR_TITLE, ROSTER_FILTERS, SCREEN_TITLE, SEARCH_PLACEHOLDER,
  countLine, filterRows, markOf, missingMarks, rosterRows, searchRows, sortRows,
} from '../data/athleteRoster';

// A long name or family name wraps anywhere rather than pushing the row wider than a 320 px phone.
const WRAP = { overflowWrap: 'anywhere', minWidth: 0 };

const chip = (on) => ({
  flex: 'none',
  whiteSpace: 'nowrap',
  minHeight: TOUCH_MIN,
  padding: '0 14px',
  borderRadius: radius.pill,
  border: `1px solid ${on ? color.primary : color.border}`,
  background: on ? color.primary : 'transparent',
  font: `${on ? 600 : 500} 13px ${font.body}`,
  color: on ? '#000' : color.textTertiary,
  cursor: 'pointer',
});

// The small line is 14 px tall. The family link is 44 px to the finger (15 px of padding above and
// below) without making the line any taller: the negative margins take the padding back.
const SMALL_LINE = 14;
const TAP_PAD = (TOUCH_MIN - SMALL_LINE) / 2;
const familyLink = {
  padding: `${TAP_PAD}px 0`,
  margin: `-${TAP_PAD}px 0`,
  border: 'none',
  background: 'none',
  textAlign: 'left',
  font: `500 11px ${font.body}`,
  lineHeight: `${SMALL_LINE}px`,
  color: color.primary,
  textDecoration: 'underline',
  cursor: 'pointer',
  ...WRAP,
};

/**
 * Athletes (hq card 14, 2026-11-23) - owner and ops. Every real athlete, by
 * last name, with the two one-time marks: the Parallax intake swings and the
 * fitness assessment. The owner ticks and undoes them here, one tap, exactly
 * as a coach does on the attendance screen (components/combine/ParallaxTick.js);
 * ops sees them read-only. The family's name opens the family page. The list
 * is read once per open (hooks/athleteRoster.js); a tick updates its row only.
 */
export default function AdminAthletes({ bare = false, role = 'owner', onBack, onOpenHousehold }) {
  const { data, loading, error, retry, tick, undo } = useAthleteRoster();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  // Rows ticked while this filter and search have been on: they stay (done, with their undo) until either changes.
  const [kept, setKept] = useState(() => new Set());
  const changeSearch = (value) => { setSearch(value); setKept(new Set()); };
  // The filter that is already on does nothing, so a row just ticked under it (and its undo) stays.
  const changeFilter = (key) => { if (key === filter) return; setFilter(key); setKept(new Set()); };
  const tickKeeping = (athleteId, docId) => {
    setKept((prev) => new Set(prev).add(athleteId));
    return tick(athleteId, docId);
  };
  // The rows come from the athletes and households alone, so a tick (marks only) never re-sorts the list.
  const athletes = data?.athletes;
  const households = data?.households;
  const rows = useMemo(
    () => sortRows(rosterRows({ athletes, households, today: academyDateISO() })),
    [athletes, households]
  );
  const marks = data?.marks;
  const shown = filterRows(searchRows(rows, search), filter, marks, kept);
  const canTick = data?.viewer?.role === 'owner';
  const missing = missingMarks(rows, marks);
  const ready = !loading && !error;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <ScreenTitle size={22} style={{ marginTop: onBack ? 8 : 0 }}>{SCREEN_TITLE}</ScreenTitle>
          {ready ? (
            <>
              <Field label="Search" placeholder={SEARCH_PLACEHOLDER} value={search} onChange={changeSearch} style={{ marginTop: 12 }} />
              {/* One line that scrolls sideways where the three do not fit: the cut-off third chip is the cue. */}
              <div
                role="group"
                aria-label="Filter"
                style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', margin: '10px -22px 0', padding: '0 22px' }}
              >
                {ROSTER_FILTERS.map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={filter === key} onClick={() => changeFilter(key)} style={chip(filter === key)}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '4px 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <Body size={12}>{LOADING_COPY}</Body>
        ) : error ? (
          <ErrorNotice title={LOAD_ERROR_TITLE} onRetry={retry}>Check your connection and try again.</ErrorNotice>
        ) : (
          <>
            <div role="status" style={{ font: `400 12px/1.55 ${font.body}`, color: color.textSecondary }}>
              {countLine({ rows, shown, marks })}
            </div>
            {shown.length === 0 ? (missing > 0 ? null : (
              <Body size={12} tone={color.textTertiary}>{COUNT_EMPTY}</Body>
            )) : (
              shown.map((row) => (
                <AthleteRow
                  key={row.athleteId}
                  row={row}
                  marks={marks}
                  viewer={data.viewer}
                  canTick={canTick}
                  onTick={tickKeeping}
                  onUndo={undo}
                  onOpenHousehold={onOpenHousehold}
                />
              ))
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

function AthleteRow({ row, marks, viewer, canTick, onTick, onUndo, onOpenHousehold }) {
  const { athleteId, name } = row;
  const markControl = (docId) => {
    const words = markWords(docId);
    const milestone = markOf(marks, athleteId, docId);
    return (
      <ParallaxTick
        name={name}
        milestone={milestone}
        loadError={milestone === undefined}
        label={words.label}
        loadErrorText={words.loadError}
        viewer={viewer}
        canTick={canTick}
        readOnly={!canTick}
        onTick={() => onTick(athleteId, docId)}
        onUndo={() => onUndo(athleteId, docId)}
      />
    );
  };
  const family = row.householdName;
  const familyOpens = Boolean(family) && Boolean(onOpenHousehold) && Boolean(row.householdId);
  return (
    <Card large style={{ padding: '12px 14px' }}>
      <div data-roster-name style={{ font: `600 14px ${font.body}`, color: color.text, ...WRAP }}>{name}</div>
      {row.line || family ? (
        <div data-roster-line style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', marginTop: 2, font: `400 11px/${SMALL_LINE}px ${font.body}`, color: color.textTertiary }}>
          {row.line ? <span style={WRAP}>{row.line}</span> : null}
          {row.line && family ? <span aria-hidden="true" style={{ whiteSpace: 'pre' }}>{' · '}</span> : null}
          {family ? (
            familyOpens ? (
              <button type="button" data-roster-family onClick={() => onOpenHousehold(row.householdId)} style={familyLink}>{family}</button>
            ) : (
              <span style={{ font: `500 11px/${SMALL_LINE}px ${font.body}`, color: color.textSecondary, ...WRAP }}>{family}</span>
            )
          ) : null}
        </div>
      ) : null}
      {/* Two equal columns at every width (a label wraps inside its own); above the line's tap padding so the marks win the overlap. */}
      <div data-roster-marks style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start', gap: '4px 10px', marginTop: 6 }}>
        {markControl(INTAKE_DOC_ID)}
        {markControl(FITNESS_DOC_ID)}
      </div>
    </Card>
  );
}
