import React, { useEffect, useMemo, useRef, useState } from 'react';
import { color, font } from '../tokens';
import AthleteRow from '../components/AthleteRow';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { BackLink, Body, ScreenTitle } from '../components/Primitives';
import CoachSection from '../components/tour/CoachSection';
import { GenderPicker, PartlySavedNotice, SavedNotice, ScoreField } from '../components/tour/SheetParts';
import * as hooks from '../hooks';
import { COACH_BRACKET, bracketLabel, isCoachId, needsGender } from '../data/tourBrackets';
import { buildScoreEntries, pendingLines } from '../data/tourSheet';

/*
 * Same namespace-import seam Roster.js uses for its hooks: a test or harness
 * that mocks ../hooks without these exports gets the inert shape (nothing,
 * and never fetches), so every chip reads "Open" and nothing pre-fills.
 */
const NONE = {};
const NO_HISTORY = { genderById: NONE, coaches: [] };
function useNothingFallback() {
  return { data: null, loading: false, error: null };
}
const useAthleteBrackets = hooks.useAthleteBrackets || useNothingFallback;
const useTourSheetHistory = hooks.useTourSheetHistory || useNothingFallback;

const shownName = (athlete) => athlete.name ?? 'Name unavailable';
const without = (obj, key) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));

/**
 * The Tour score sheet - "Enter Tour results" on a Tour event's roster
 * (Sprint 8 pin; owner rulings 2026-11-06). A coach types each player's
 * strokes (18..200); places, points and standings derive downstream
 * (data/tour.js deriveTourStandings) and this sheet never shows one.
 *
 * Each row's chip is the player's age group on SEASON_BOUNDS.start (10 &
 * under, 11–14, 15–18, or Open with no dob on file) from useAthleteBrackets.
 * Everyone 11 and up needs Boys or Girls before their row saves; 10 & under
 * and Open rows are not asked (gender null). A scored row still missing it,
 * or holding a strokes count outside 18..200, is NOT saved and never
 * silently dropped: the footer names each one before the save, the other
 * rows still save, and the notice after says how many landed and who is
 * still waiting. The pick pre-fills - a tap on this sheet first, then this
 * event's own saved result, then the player's most recent saved result with
 * a gender from any date (useTourSheetHistory) - so it is picked once per
 * kid per season.
 *
 * Coaches (./components/tour/CoachSection.js) play 18 holes and are added
 * per event; a coach row needs Men or Women the same way. Saved coach rows
 * for this event load back in.
 *
 * Scores and coach rows pre-fill once, the first time real results arrive -
 * a background refresh cannot clobber an edit in progress. Save waits while
 * the age groups load, and stays off if they failed (every row would land
 * in Open). Local state drives the UI in seed and live mode alike; only
 * `resultsState.saveResults` differs (a real write live, a no-op otherwise).
 */
export default function TourScoreSheet({ bare, session, roster, resultsState, onBack }) {
  const [scores, setScores] = useState({}); // { [athleteId]: raw input }, players and coaches
  const [picked, setPicked] = useState({}); // { [athleteId]: 'boys' | 'girls' }, tapped on this sheet
  const [coaches, setCoaches] = useState([]); // [{ athleteId, name, saved }]
  const seededRef = useRef(false);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [saveError, setSaveError] = useState(null);
  const [lastSave, setLastSave] = useState({ saved: 0, lines: [] });
  // Every name and gender this sheet has seen on a saved result or sent in a
  // save, kept where a re-read cannot blank it (review 2026-11-04): a save
  // bumps 'tournamentResults', and the results read null while that re-read
  // runs or after it fails, with this sheet still open.
  const savedNamesRef = useRef(new Map());
  const savedGenderRef = useRef(new Map());
  (resultsState.data?.results ?? []).forEach((r) => {
    if (typeof r.name === 'string' && r.name) savedNamesRef.current.set(r.athleteId, r.name);
    if (r.gender === 'boys' || r.gender === 'girls') savedGenderRef.current.set(r.athleteId, r.gender);
  });

  const athleteIds = useMemo(() => roster.map((a) => a.id), [roster]);
  const bracketsState = useAthleteBrackets(athleteIds);
  const groupByAthlete = bracketsState.data ?? NONE;
  const historyState = useTourSheetHistory();
  // A history read that failed is no pre-fill: the scorer picks by hand.
  const historyRef = useRef(NO_HISTORY);
  if (historyState.data) historyRef.current = historyState.data;
  const history = historyRef.current;

  useEffect(() => {
    const rows = resultsState.data?.results;
    if (seededRef.current || !rows) return;
    seededRef.current = true;
    const seeded = {};
    rows.forEach((r) => {
      if (r.score != null) seeded[r.athleteId] = String(r.score);
    });
    setScores((prev) => ({ ...seeded, ...prev }));
    const savedCoaches = rows
      .filter((r) => isCoachId(r.athleteId))
      .map((r) => ({ athleteId: r.athleteId, name: r.name || r.athleteId, saved: true }));
    setCoaches((prev) => [...savedCoaches, ...prev.filter((c) => !savedCoaches.some((s) => s.athleteId === c.athleteId))]);
  }, [resultsState.data]);

  const busy = saveState === 'saving';
  const touch = () => setSaveState((s) => (s === 'saving' ? s : 'idle'));
  const setScore = (id, raw) => {
    if (busy) return;
    setScores((prev) => ({ ...prev, [id]: raw }));
    touch();
  };
  const pick = (id, gender) => {
    if (busy) return;
    setPicked((prev) => ({ ...prev, [id]: gender }));
    touch();
  };
  const genderOf = (id) => picked[id] ?? savedGenderRef.current.get(id) ?? history.genderById?.[id] ?? null;
  const groupOf = (id) => groupByAthlete[id] ?? null;

  const addCoach = ({ athleteId, name }) => {
    setCoaches((prev) => [...prev, { athleteId, name, saved: false }]);
    touch();
  };
  const removeCoach = (athleteId) => {
    setCoaches((prev) => prev.filter((c) => c.athleteId !== athleteId || c.saved));
    setScores((prev) => without(prev, athleteId));
    setPicked((prev) => without(prev, athleteId));
  };

  // Each player row carries the name off this very roster (contract
  // v1.5.1); a row the roster could not read keeps the name already saved.
  const rows = [
    ...roster.map((a) => ({
      athleteId: a.id,
      name: a.name ?? savedNamesRef.current.get(a.id) ?? null,
      label: shownName(a),
      bracket: groupOf(a.id),
      gender: genderOf(a.id),
      raw: scores[a.id],
    })),
    ...coaches.map((c) => ({
      athleteId: c.athleteId,
      name: c.name,
      label: c.name,
      bracket: COACH_BRACKET,
      gender: genderOf(c.athleteId),
      raw: scores[c.athleteId],
      coach: true,
    })),
  ];
  const built = buildScoreEntries(rows);
  const pending = pendingLines(built);
  const blocked = new Set([...built.missingGender, ...built.badScore].map((b) => b.athleteId)).size;
  const scoredPlayers = roster.filter((a) => scores[a.id]).length;
  const allScored = roster.length > 0 && scoredPlayers >= roster.length;
  const anyAsked = roster.some((a) => needsGender(groupOf(a.id)));
  const groupsLoading = Boolean(bracketsState.loading);
  const groupsFailed = Boolean(bracketsState.error);
  const onSheet = new Set(coaches.map((c) => c.athleteId));
  const quickPicks = (history.coaches ?? []).filter((c) => !onSheet.has(c.athleteId));

  const handleSave = async () => {
    const { entries } = built;
    if (!entries.length) return;
    const left = pending;
    setSaveState('saving');
    setSaveError(null);
    try {
      await resultsState.saveResults(entries);
      entries.forEach((e) => {
        if (typeof e.name === 'string' && e.name) savedNamesRef.current.set(e.athleteId, e.name);
        if (e.gender) savedGenderRef.current.set(e.athleteId, e.gender);
      });
      setCoaches((prev) => prev.map((c) => (entries.some((e) => e.athleteId === c.athleteId) ? { ...c, saved: true } : c)));
      setLastSave({ saved: entries.length, lines: left });
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
              ? 'Every player has a score.'
              : "Enter each player's strokes: 10 & under play 9 holes, everyone 11 and up plays 18. Tour standings are calculated automatically."}
          </Body>
          {anyAsked ? (
            <Body size={12} style={{ marginTop: 6 }}>
              Choose Boys or Girls for every player 11 and up: the leaderboards rank boys and girls too.
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
            lastSave.lines.length ? (
              <PartlySavedNotice saved={lastSave.saved} lines={lastSave.lines} />
            ) : (
              <SavedNotice />
            )
          ) : pending.length ? (
            <Body size={12} tone={color.secondary} style={{ marginBottom: 10 }}>
              {pending.join(' ')} {blocked === 1 ? 'That score is' : 'Those scores are'} not saved until you do.
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
            loading={busy}
            disabled={!built.entries.length || groupsLoading || groupsFailed}
            onClick={handleSave}
            style={saveState === 'saved' ? { marginTop: 10 } : null}
          >
            {busy ? 'Saving scores' : 'Save scores'}
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
                    label={`Strokes for ${shownName(athlete)}`}
                    value={scores[athlete.id] ?? ''}
                    onChange={(v) => setScore(athlete.id, v)}
                    disabled={busy}
                  />
                </div>
              }
            >
              {needsGender(group) ? (
                <GenderPicker name={shownName(athlete)} value={genderOf(athlete.id)} onChange={(g) => pick(athlete.id, g)} disabled={busy} />
              ) : null}
            </AthleteRow>
          );
        })}
        <CoachSection
          coaches={coaches}
          quickPicks={quickPicks}
          scores={scores}
          genderOf={genderOf}
          onScore={setScore}
          onGender={pick}
          onAdd={addCoach}
          onRemove={removeCoach}
          disabled={busy}
        />
      </div>
    </PhoneFrame>
  );
}
