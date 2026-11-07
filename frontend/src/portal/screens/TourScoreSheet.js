import React, { useEffect, useMemo, useRef, useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import AthleteRow from '../components/AthleteRow';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { BackLink, Body, ScreenTitle, Tick } from '../components/Primitives';
import * as hooks from '../hooks';
import { bracketLabel } from '../data/tour';
import { DIVISIONS, buildScoreEntries, divisionOf, needsDivision } from '../data/tourDivisions';

/*
 * Same namespace-import seam Roster.js uses for its hooks: a test or harness
 * that mocks ../hooks without these exports gets the inert shape ({} and
 * never fetches), so every chip reads "Open" and nothing pre-fills.
 */
const NONE = {};
function useNothingFallback() {
  return { data: NONE, loading: false, error: null };
}
const useAthleteBrackets = hooks.useAthleteBrackets || useNothingFallback;
const usePriorTourDivisions = hooks.usePriorTourDivisions || useNothingFallback;

const shownName = (athlete) => athlete.name ?? 'Name unavailable';

/** ['A'] -> 'A'; ['A', 'B'] -> 'A and B'; ['A', 'B', 'C'] -> 'A, B and C'. */
function nameList(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The Tour score sheet - "Enter Tour results" on a Tour event's roster
 * (Sprint 8 pin, contract v1.6; moved out of Roster.js on 2026-11-06, when
 * Boys/Girls made it grow). A coach types each rostered athlete's strokes
 * (18..200). Position, points and standings derive downstream
 * (data/tour.js deriveTourStandings); this sheet never computes or shows a
 * position.
 *
 * Age groups (owner ruling 2026-11-06): each row's chip reads the athlete's
 * group on SEASON_BOUNDS.start - 11 & under, 12–14, 15 & up, or Open with no
 * dob on file - from useAthleteBrackets. Boys and girls rank separately
 * only at 15 & up, and the portal holds no boy/girl fact a coach can read,
 * so every 15 & up row carries a required Boys / Girls pick. A scored row
 * without one is NOT saved and never lands in Open: the footer names each
 * such athlete before the save, the other rows still save, and the result
 * line names who was left out and why. The pick pre-fills from this event's
 * own saved result, else the athlete's most recent saved '15+B' / '15+G'
 * result from any date (usePriorTourDivisions), so a scorer picks once per
 * kid per season; a tap on this sheet always wins. Save waits while the age
 * groups load, and stays off if they failed: every row would land in Open.
 *
 * Scores pre-fill once, the first time real results arrive - a background
 * refresh cannot clobber an edit in progress. A row with no entered (or
 * out-of-range) score is left out of the save, never coerced to 0 - "no
 * score yet" and "scored zero" are different facts. Local state drives the
 * UI in seed and live mode alike; only `resultsState.saveResults` differs
 * (a real write live, a no-op otherwise).
 */
export default function TourScoreSheet({ bare, session, roster, resultsState, onBack }) {
  const [scores, setScores] = useState({}); // { [athleteId]: rawInputString }
  const [picked, setPicked] = useState({}); // { [athleteId]: 'B' | 'G' }, tapped on this sheet
  const seededRef = useRef(false);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [saveError, setSaveError] = useState(null);
  // The last good save: how many rows landed, and the names it left out for want of Boys/Girls.
  const [lastSave, setLastSave] = useState({ saved: 0, notSaved: [] });
  // Every name and Boys/Girls this sheet has seen on a saved result or sent
  // in a save, kept where a re-read cannot blank it (review 2026-11-04): a
  // save bumps 'tournamentResults', and the results data reads null while
  // that re-read runs or after it fails, with this sheet still open.
  const savedNamesRef = useRef(new Map());
  const savedDivisionRef = useRef(new Map());
  (resultsState.data?.results ?? []).forEach((r) => {
    if (typeof r.name === 'string' && r.name) savedNamesRef.current.set(r.athleteId, r.name);
    const d = divisionOf(r.bracket);
    if (d) savedDivisionRef.current.set(r.athleteId, d);
  });

  const athleteIds = useMemo(() => roster.map((a) => a.id), [roster]);
  const bracketsState = useAthleteBrackets(athleteIds);
  const groupByAthlete = bracketsState.data ?? NONE;
  const priorState = usePriorTourDivisions(athleteIds);
  // A pre-fill read that failed is no pre-fill: the scorer picks by hand.
  const priorRef = useRef(NONE);
  if (priorState.data) priorRef.current = priorState.data;

  useEffect(() => {
    const rows = resultsState.data?.results;
    if (seededRef.current || !rows) return;
    seededRef.current = true;
    const seeded = {};
    rows.forEach((r) => {
      if (r.score != null) seeded[r.athleteId] = String(r.score);
    });
    setScores(seeded);
  }, [resultsState.data]);

  const groupOf = (id) => groupByAthlete[id] ?? null;
  const divisionFor = (id) => picked[id] ?? savedDivisionRef.current.get(id) ?? priorRef.current[id] ?? null;

  const setScore = (athleteId, raw) => {
    if (saveState === 'saving') return;
    // Digits only, capped at 3 characters - the pin's max (200) is 3 digits.
    const cleaned = raw.replace(/[^0-9]/g, '').slice(0, 3);
    setScores((prev) => ({ ...prev, [athleteId]: cleaned }));
    setSaveState('idle');
  };

  const pick = (athleteId, division) => {
    if (saveState === 'saving') return;
    setPicked((prev) => ({ ...prev, [athleteId]: division }));
    setSaveState('idle');
  };

  // Only a real, in-range strokes count is "entered" - 18..200 per the pin.
  const validScore = (athleteId) => {
    const raw = scores[athleteId];
    if (raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 18 && n <= 200 ? n : null;
  };

  // Each row carries the name off this very roster (contract v1.5.1); a row
  // the roster could not read keeps the name already saved on its result.
  const rows = roster.map((a) => ({
    athleteId: a.id,
    name: a.name ?? savedNamesRef.current.get(a.id) ?? null,
    label: shownName(a),
    group: groupOf(a.id),
    division: divisionFor(a.id),
    score: validScore(a.id),
  }));
  const { entries, needsDivision: blocked } = buildScoreEntries(rows);
  const enteredCount = rows.filter((r) => r.score != null).length;
  const allScored = roster.length > 0 && enteredCount >= roster.length;
  const anySplit = rows.some((r) => needsDivision(r.group));
  const groupsLoading = Boolean(bracketsState.loading);
  const groupsFailed = Boolean(bracketsState.error);

  const handleSave = async () => {
    if (!entries.length) return;
    const leftOut = blocked.map((b) => b.label);
    setSaveState('saving');
    setSaveError(null);
    try {
      await resultsState.saveResults(entries);
      entries.forEach((e) => {
        if (typeof e.name === 'string' && e.name) savedNamesRef.current.set(e.athleteId, e.name);
        const d = divisionOf(e.bracket);
        if (d) savedDivisionRef.current.set(e.athleteId, d);
      });
      setLastSave({ saved: entries.length, notSaved: leftOut });
      setSaveState('saved');
    } catch (err) {
      setSaveState('idle');
      setSaveError(err && typeof err.message === 'string' && err.message ? err.message : null);
    }
  };

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '4px 22px 14px', background: color.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <BackLink onClick={onBack}>‹ Attendance</BackLink>
          </div>
          <ScreenTitle size={21}>Enter scores</ScreenTitle>
          <div style={{ font: `400 12px ${font.body}`, color: color.textSecondary, marginTop: 5 }}>
            {session?.name}
            {session?.meta ? ` · ${session.meta}` : ''}
          </div>
          <Body size={12} style={{ marginTop: 10 }}>
            {allScored
              ? 'Every athlete has a score.'
              : "Enter each athlete's strokes. Tour standings are calculated automatically."}
          </Body>
          {anySplit ? (
            <Body size={12} style={{ marginTop: 6 }}>
              Boys and girls are ranked separately at 15 & up: choose Boys or Girls for each of those athletes.
            </Body>
          ) : null}
        </div>
      }
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px', background: color.bg }}>
          {saveError ? (
            <Body size={12} tone={color.error} style={{ marginBottom: 10 }}>
              {saveError} Nothing was saved — tap Save scores to try again.
            </Body>
          ) : null}
          {saveState === 'saved' ? (
            lastSave.notSaved.length ? (
              <PartlySavedNotice saved={lastSave.saved} names={lastSave.notSaved} />
            ) : (
              <SavedNotice />
            )
          ) : blocked.length ? (
            <Body size={12} tone={color.secondary} style={{ marginBottom: 10 }}>
              Choose Boys or Girls for {nameList(blocked.map((b) => b.label))}.{' '}
              {blocked.length === 1 ? 'That score is' : 'Those scores are'} not saved until you do.
            </Body>
          ) : null}
          {groupsLoading ? (
            <Body size={12} style={{ marginBottom: 10 }}>
              Loading age groups…
            </Body>
          ) : groupsFailed ? (
            <Body size={12} tone={color.error} style={{ marginBottom: 10 }}>
              Age groups didn't load. Go back and open the score sheet again before saving.
            </Body>
          ) : null}
          <Button
            variant="pinned"
            height={56}
            loading={saveState === 'saving'}
            disabled={!entries.length || groupsLoading || groupsFailed}
            onClick={handleSave}
            style={saveState === 'saved' ? { marginTop: 10 } : null}
          >
            {saveState === 'saving' ? 'Saving scores' : 'Save scores'}
          </Button>
        </div>
      }
    >
      <div style={{ padding: '0 22px 20px' }}>
        {roster.map((athlete, i) => {
          const group = groupOf(athlete.id);
          return (
            <AthleteRow
              key={athlete.id}
              name={shownName(athlete)}
              meta={athlete.meta}
              avatarSize={42}
              nameSize={16}
              divider={i < roster.length - 1}
              trailing={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatusBadge tone="neutral">{bracketLabel(group)}</StatusBadge>
                  <ScoreField
                    value={scores[athlete.id] ?? ''}
                    onChange={(v) => setScore(athlete.id, v)}
                    disabled={saveState === 'saving'}
                  />
                </div>
              }
            >
              {needsDivision(group) ? (
                <DivisionPicker
                  name={shownName(athlete)}
                  value={divisionFor(athlete.id)}
                  onChange={(d) => pick(athlete.id, d)}
                  disabled={saveState === 'saving'}
                />
              ) : null}
            </AthleteRow>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

/**
 * Boys / Girls for one athlete 15 & up - a real control, so the chosen side
 * takes the solid "tappable" fill (flag 02, StatusBadge.js); an unpicked row
 * says so in caution yellow beside the two buttons.
 */
function DivisionPicker({ name, value, onChange, disabled }) {
  return (
    <div role="group" aria-label={`Boys or Girls for ${name}`} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
      {DIVISIONS.map((d) => {
        const on = value === d.id;
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(d.id)}
            style={{
              height: 40,
              minWidth: 64,
              padding: '0 12px',
              borderRadius: radius.control,
              border: `1.5px solid ${on ? color.primary : color.controlBorder}`,
              background: on ? color.primary : 'transparent',
              color: on ? '#000' : color.textSecondary,
              font: `600 12px ${font.body}`,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {d.label}
          </button>
        );
      })}
      {value ? null : <span style={{ font: `500 11px ${font.body}`, color: color.secondary }}>Choose one</span>}
    </div>
  );
}

/**
 * Strokes input - same visual idiom as NumericField's input (screen 14):
 * track fill, 1px border, 8px radius, right-aligned 600-weight figures.
 * Purpose-built because NumericField's label + unit layout is for a stacked
 * list of metrics, not one compact field in an AthleteRow's trailing slot.
 */
function ScoreField({ value, onChange, disabled }) {
  return (
    <input
      inputMode="numeric"
      value={value}
      disabled={disabled}
      placeholder="—"
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: 64,
        height: 44,
        background: color.track,
        border: `1px solid ${color.border}`,
        borderRadius: radius.input,
        font: `600 15px ${font.body}`,
        color: disabled ? color.mutedText : color.text,
        textAlign: 'right',
        padding: '0 10px',
        outline: 'none',
      }}
    />
  );
}

/** Same green-toast idiom as NotificationPreferences' SavedToast. */
function SavedNotice() {
  return (
    <div
      style={{
        background: 'rgba(0,175,81,.1)',
        border: `1px solid ${color.primary}`,
        borderRadius: 10,
        padding: '11px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: color.primary,
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
        }}
      >
        <Tick size={9} />
      </span>
      <span style={{ font: `500 13px ${font.body}`, color: color.primary }}>Scores saved</span>
    </div>
  );
}

/** A save that left rows out: what landed, who did not, and why - caution yellow, never the green toast. */
function PartlySavedNotice({ saved, names }) {
  return (
    <div
      role="status"
      style={{
        background: tint.yellow,
        border: `1px solid ${tint.yellowBorder}`,
        borderRadius: 10,
        padding: '11px 14px',
        font: `500 13px/1.45 ${font.body}`,
        color: color.secondary,
      }}
    >
      {saved === 1 ? '1 score saved.' : `${saved} scores saved.`} Not saved: {nameList(names)}. Choose Boys or Girls,
      then tap Save scores again.
    </div>
  );
}
