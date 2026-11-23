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
  countLine, filterRows, markOf, rosterRows, searchRows, sortRows,
} from '../data/athleteRoster';

// A long name or family name wraps anywhere rather than pushing the row wider than a 320 px phone.
const WRAP = { overflowWrap: 'anywhere', minWidth: 0 };

const chip = (on) => ({
  minHeight: TOUCH_MIN,
  padding: '0 14px',
  borderRadius: radius.pill,
  border: `1px solid ${on ? color.primary : color.border}`,
  background: on ? color.primary : 'transparent',
  font: `${on ? 600 : 500} 13px ${font.body}`,
  color: on ? '#000' : color.textTertiary,
  cursor: 'pointer',
});

const familyLink = {
  minHeight: TOUCH_MIN,
  padding: 0,
  border: 'none',
  background: 'none',
  textAlign: 'left',
  font: `500 12px ${font.body}`,
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
  const changeFilter = (key) => { setFilter(key); setKept(new Set()); };
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

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <ScreenTitle size={22} style={{ marginTop: onBack ? 8 : 0 }}>{SCREEN_TITLE}</ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <Body size={12}>{LOADING_COPY}</Body>
        ) : error ? (
          <ErrorNotice title={LOAD_ERROR_TITLE} onRetry={retry}>Check your connection and try again.</ErrorNotice>
        ) : (
          <>
            <Field label="Search" placeholder={SEARCH_PLACEHOLDER} value={search} onChange={changeSearch} />
            <div role="group" aria-label="Filter" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ROSTER_FILTERS.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => changeFilter(key)} style={chip(filter === key)}>
                  {label}
                </button>
              ))}
            </div>
            <div role="status" style={{ font: `400 12px/1.55 ${font.body}`, color: color.textSecondary }}>
              {countLine({ rows, shown, marks })}
            </div>
            {shown.length === 0 ? (
              <Body size={12} tone={color.textTertiary}>{COUNT_EMPTY}</Body>
            ) : (
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
        onTick={() => onTick(athleteId, docId)}
        onUndo={() => onUndo(athleteId, docId)}
      />
    );
  };
  return (
    <Card large>
      <div data-roster-name style={{ font: `600 14px ${font.body}`, color: color.text, ...WRAP }}>{name}</div>
      {row.line ? <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2, ...WRAP }}>{row.line}</div> : null}
      {row.householdName ? (
        onOpenHousehold && row.householdId ? (
          <button type="button" data-roster-family onClick={() => onOpenHousehold(row.householdId)} style={familyLink}>{row.householdName}</button>
        ) : (
          <div style={{ font: `500 12px ${font.body}`, color: color.textSecondary, marginTop: 6, ...WRAP }}>{row.householdName}</div>
        )
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', marginTop: 8 }}>
        {markControl(INTAKE_DOC_ID)}
        {markControl(FITNESS_DOC_ID)}
      </div>
    </Card>
  );
}
