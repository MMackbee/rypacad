import React, { useState } from 'react';
import { color, font, radius } from '../../tokens';
import Field from '../Field';
import StatusBadge from '../StatusBadge';
import { Body } from '../Primitives';
import { useHouseholdsDirectory } from '../../hooks/billing';
import { searchAthletes } from '../../data/staffBooking';
import {
  ATHLETES_LOAD_FAILED,
  FIND_ATHLETE_LABEL,
  FIND_ATHLETE_PLACEHOLDER,
  ON_THIS_SESSION,
  TEST_BADGE,
  athleteSubline,
  noAthleteMatches,
} from '../../data/staffBookingCopy';

/**
 * The athlete search (spec 01-spec-admin-booking.md 10.2, 10.5): the "Find
 * an athlete" field, the households directory loaded on the field's first
 * focus (or at once when `armed`) rather than on every Admin open, and up
 * to eight result rows (data/staffBooking.js searchAthletes). Each row is
 * a 44px button: the name, then "{household} · {package}"; a test athlete
 * carries a Test badge. Rows in `disabledIds` read `disabledLabel` and
 * cannot be tapped; test athletes cannot either when `disableTest` (the
 * roster's picker - on the Admin card a test athlete opens its screen,
 * which says it cannot be booked).
 *
 * @param {(athlete: object) => void} onPick  searchAthletes' row.
 */
export default function AthleteSearch({ onPick, disabledIds = [], disabledLabel = ON_THIS_SESSION, armed = false, disableTest = false }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  return (
    <div onFocus={() => setFocused(true)}>
      <Field label={FIND_ATHLETE_LABEL} placeholder={FIND_ATHLETE_PLACEHOLDER} value={query} onChange={setQuery} />
      {armed || focused ? (
        <Results query={query} onPick={onPick} disabledIds={disabledIds} disabledLabel={disabledLabel} disableTest={disableTest} />
      ) : null}
    </div>
  );
}

/** The directory's matches; mounted only once the search is armed, so the directory loads then. */
function Results({ query, onPick, disabledIds, disabledLabel, disableTest }) {
  const { data, error } = useHouseholdsDirectory();
  if (error) return <Body size={12} style={{ marginTop: 10 }}>{ATHLETES_LOAD_FAILED}</Body>;
  if (!data || !String(query).trim()) return null;
  const found = searchAthletes(data, query);
  if (!found.length) return <Body size={12} style={{ marginTop: 10 }}>{noAthleteMatches(query)}</Body>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
      {found.map((a) => {
        const on = disabledIds.includes(a.athleteId);
        const off = on || (disableTest && a.test);
        return (
          <ResultRow
            key={a.athleteId}
            athlete={a}
            note={on ? disabledLabel : null}
            disabled={off}
            onClick={off ? undefined : () => onPick(a)}
          />
        );
      })}
    </div>
  );
}

function ResultRow({ athlete, note, disabled, onClick }) {
  const sub = athleteSubline(athlete.householdName, athlete.packageName);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        minHeight: 44,
        padding: '8px 12px',
        boxSizing: 'border-box',
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.input,
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', font: `600 14px ${font.body}`, color: color.text, overflowWrap: 'anywhere' }}>{athlete.name}</span>
        {sub ? (
          <span style={{ display: 'block', font: `400 12px ${font.body}`, color: color.textTertiary, marginTop: 2, overflowWrap: 'anywhere' }}>{sub}</span>
        ) : null}
      </span>
      {athlete.test ? <StatusBadge>{TEST_BADGE}</StatusBadge> : null}
      {note ? <span style={{ flex: 'none', font: `500 12px ${font.body}`, color: color.textTertiary }}>{note}</span> : null}
    </button>
  );
}
