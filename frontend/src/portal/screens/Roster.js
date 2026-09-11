import React, { useEffect, useMemo, useRef, useState } from 'react';
import { color, font, radius } from '../tokens';
import AthleteRow, { AttendanceControls } from '../components/AthleteRow';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import TypeChip from '../components/TypeChip';
import SavedToast from '../components/SavedToast';
import { BackLink, Body, Card, ScreenTitle, SectionLabel, SignOutButton, Tick } from '../components/Primitives';
import useRoster from '../hooks/useRoster';
import * as hooks from '../hooks';
import { useCoachRoster, useSession } from '../hooks';
import { isLive } from '../hooks/live';
// Pure calendar/season helpers per the seam rule - data still travels
// through the hooks above.
import { parseTimeToMinutes, todayISO } from '../data/calendar';
import { dayLabel } from '../data/season';

/**
 * An honest status label for a real block: a countdown only when the block
 * genuinely starts within two hours, otherwise the day it runs. Replaces the
 * seed constant that read "STARTS IN 12 MIN" for sessions months out.
 */
function realStartsIn(block) {
  const today = todayISO();
  if (!block.date || block.date > today) return block.date ? dayLabel(block.date, today) : null;
  if (block.date < today) return 'Ended';
  const start = parseTimeToMinutes(block.time);
  if (start == null) return 'Today';
  const diff = start - (new Date().getHours() * 60 + new Date().getMinutes());
  if (diff > 120) return 'Today';
  if (diff > 0) return `Starts in ${diff} min`;
  return diff > -60 ? 'Now' : 'Ended';
}

/**
 * The routing lane is adding `useSessionAttendance(sessionId)` to hooks/index.js
 * in parallel against the Sprint 6 pin (TEAM.md) - it does not exist in this
 * worktree yet. A namespace import (`* as hooks` above) plus this fallback
 * keeps the hook call below unconditional (rules of hooks) and keeps this
 * screen buildable today; `hooks.useSessionAttendance` is resolved once per
 * module load, never mid-render, so which function runs cannot flip across
 * renders of a mounted screen. Once routing's export lands and the branches
 * merge, this fallback stops being used automatically - nothing here needs
 * to change.
 */
function useSessionAttendanceFallback() {
  return { data: null, loading: false, error: null, mark: () => {} };
}
const useSessionAttendance = hooks.useSessionAttendance || useSessionAttendanceFallback;

/**
 * Same parallel-lane situation as useSessionAttendance above, for the Sprint
 * 7 pin (TEAM.md), now superseded by the Sprint 8 pin (contract v1.6):
 * `useTournamentResults(sessionId)` -> { data: { results: [{ athleteId,
 * name, bracket, score, position }] }, loading, error, saveResults(entries) },
 * entries = [{ athleteId, name, bracket, score }] - POSITION IS NO LONGER
 * WRITTEN, it derives downstream from score; every read below goes through
 * `data?.results`. The fallback is inert (no data, no-op save), matching
 * useSessionAttendance's own "screens must not crash with the live flag off"
 * convention - harmless in seed/demo mode, where score entry still works
 * entirely in this screen's local state and only the persisted save is a
 * no-op.
 */
function useTournamentResultsFallback() {
  return { data: null, loading: false, error: null, saveResults: async () => {} };
}
const useTournamentResults = hooks.useTournamentResults || useTournamentResultsFallback;

/**
 * NEW hook for Sprint 8 (TEAM.md "Hook seam", contract v1.6):
 * `useAthleteBrackets(athleteIds)` -> { data: { [athleteId]: bracketId |
 * null }, loading, error } - resolves each rostered athlete's age bracket
 * (computed from dob as of season start) for the score-entry screen's
 * per-row chip. Same parallel-lane situation as the two hooks above, but
 * this export does not exist AT ALL in this worktree yet (confirmed: no
 * `useAthleteBrackets` in hooks/index.js) - the routing lane is building it
 * against v1.6 in a parallel worktree. The fallback is the exact inert
 * shape the pin specifies - `{}` and never fetches - so every row's chip
 * reads "Open" (unknown bracket) until the real hook lands; nothing here
 * needs to change once it does.
 */
function useAthleteBracketsFallback() {
  return { data: {}, loading: false, error: null };
}
const useAthleteBrackets = hooks.useAthleteBrackets || useAthleteBracketsFallback;

/**
 * Roster - coach. The coach's full assigned roster, not one session's
 * attendance (Sprint 5 pin, TEAM.md) - this is the bottom tab bar's "Roster"
 * destination, reached with no session context, so it shows the team rather
 * than jumping into whichever block happens to be running.
 *
 * The session-by-session IN/OUT attendance screen (handoff screen 13, the
 * ⭐ in-session working screen) still exists in full below as
 * `SessionAttendance` - it is what "Start roster" / "View roster" on a
 * Coach Dashboard block card should open. PortalRoutes.js (routing lane,
 * not this lane's file) currently points both that action and this tab at
 * the same /portal/roster route; see the sprint report for the routing
 * follow-up this split needs.
 */
export default function Roster({ bare = false, onSignOut, onOpenAthlete }) {
  const rosterState = useCoachRoster();
  const athletes = rosterState.data ?? [];

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <ScreenTitle style={{ flex: 1 }}>Roster</ScreenTitle>
          <SignOutButton onSignOut={onSignOut} />
        </div>
      }
      footer={<BottomTabBar role="coach" active="roster" />}
    >
      <div style={{ padding: '0 22px 24px' }}>
        {rosterState.loading ? (
          <Card large>
            <Body size={12}>Loading your roster…</Body>
          </Card>
        ) : athletes.length ? (
          <Card large>
            <SectionLabel style={{ marginBottom: 6 }}>Your athletes · {athletes.length}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {athletes.map((a, i) => (
                <AthleteRow
                  key={a.id}
                  name={a.name}
                  meta={a.meta}
                  avatarSize={44}
                  nameSize={16}
                  divider={i < athletes.length - 1}
                  // Sprint 10 pin I: coach roster rows tap through to
                  // AthleteDetail. Optional-affordance convention - a plain
                  // (non-tappable) row without a prop, same as every other
                  // row in this codebase that gates onClick behind a prop.
                  onClick={onOpenAthlete ? () => onOpenAthlete(a.id) : undefined}
                />
              ))}
            </div>
          </Card>
        ) : (
          <div
            style={{
              border: `1px dashed ${color.border}`,
              borderRadius: radius.cardLarge,
              padding: '30px 22px',
              textAlign: 'center',
            }}
          >
            <ScreenTitle size={17}>No assigned athletes</ScreenTitle>
            <Body size={12} style={{ marginTop: 8 }}>
              Athletes assigned to you will show up here.
            </Body>
          </div>
        )}
      </div>
    </PhoneFrame>
  );
}

/**
 * 13 · Session Roster & Attendance - coach.
 * States: Pre-session, In progress, Completed, No-shows flagged.
 *
 * The in-session working screen. Used on a phone or tablet while standing in a
 * loud facility, so: IN/OUT are 64x48 with 7px between them, no typing is
 * required to complete the core task, notes are optional chips rather than
 * required fields, and the header is sticky so the counters stay visible while
 * scrolling a long roster.
 *
 * See useRoster for the unimplemented offline path, which is the highest-risk
 * gap in this screen.
 *
 * Sprint 5 pin (TEAM.md): session start is never time-gated - the button is
 * always tappable, with no window check anywhere in this file - and the
 * reported bug (tapping "Start session" did nothing) was that the button had
 * no onClick at all; `useRoster`'s `sessionState` is driven purely by the
 * demo `variant` prop, with no real transition. `localStatus` below is the
 * fix: a component-local override the coach's own tap sets, the same pattern
 * CommitmentContract uses for its practice-mode overlay.
 *
 * Sprint 6 pin (TEAM.md, QA #6/#7): wired to the routing lane's pinned
 * `useSessionAttendance(sessionId)` -> { data: [{ bookingId, athleteId, name,
 * status }], loading, error, mark(bookingId, status) } when live and a real
 * `sessionId` reaches this screen - IN marks 'attended', OUT marks 'noshow',
 * clearing a mark returns it to 'confirmed'. `useRoster`'s demo/harness path
 * is preserved exactly (unchanged when not live, or when no sessionId is
 * passed) - both hooks are called unconditionally every render and this
 * screen picks which result to use, the same split-on-a-stable-condition
 * pattern PortalRoutes.js already uses for isLive().
 *
 * `sessionId` is meant to reach this screen as a prop from PortalRoutes.js
 * (routing lane, not this lane's file) once the Coach Dashboard's "Start
 * roster"/"View roster" tap threads a real session id through - it does not
 * today (see CoachDashboard.js's BlockCard and the sprint report). Without
 * it this screen falls back to the exact pre-Sprint-6 demo/seed behavior, so
 * nothing regresses while that routing work lands; `blockIndex`, if passed,
 * at least lets a seed-mode caller pick which of today's generated blocks the
 * header describes (COACH_BLOCKS and the season's daily blocks share the same
 * chronological order), closing QA #6 for the part this lane owns.
 *
 * @param {'pre'|'progress'|'complete'|'noshow'} variant
 * @param {string} [sessionId]   Real Firestore session id - live mode only.
 * @param {number} [blockIndex]  Which of today's blocks (0-based) - seed mode.
 */
export function SessionAttendance({ variant = 'pre', bare = false, onBack, sessionId, blockIndex, block }) {
  const { roster: demoRoster, marks: demoMarks, mark: demoMark, counts: demoCounts, sessionState: demoState } =
    useRoster({ variant });
  // Seed header: the generated season narrowed by blockIndex. Live header:
  // the TAPPED block's real facts, passed through navigation as `block` —
  // useSession reads the seed season at today's date, which pre-season is
  // empty, so every live tap used to render the default seed block ("Block 2
  // of 3 · Sim Bay 2") no matter which session was opened, and 'STARTS IN 12
  // MIN' was a seed constant (QA 2026-09-08, blocker #1 and #8).
  const { data: seedSession } = useSession(blockIndex != null ? { blockIndex } : undefined);
  const session = block
    ? {
        type: block.type,
        blockLabel: block.date ? dayLabel(block.date, todayISO()) : null,
        // v1.7.1: the shared naming helper covers specialist types too — a
        // Yannick session opened from My Sessions must not read as a
        // 'Training block' (the old binary fallback did exactly that).
        name: block.name || hooks.genericSessionName(block.type),
        meta: [block.time, block.meta].filter(Boolean).join(' · '),
        startsIn: realStartsIn(block),
      }
    : seedSession;

  // Live attendance rows for a real session, always called (rules of hooks) -
  // only used when `live` below is true.
  const liveAttendance = useSessionAttendance(sessionId);
  const live = isLive() && sessionId != null;

  // Tournament results (Sprint 7 pin, TEAM.md), always called (rules of
  // hooks) - only read/written once the coach opens the results view below.
  const tournamentResults = useTournamentResults(sessionId);
  const [view, setView] = useState('attendance'); // 'attendance' | 'results'

  const bookingByAthlete = useMemo(() => {
    if (!liveAttendance.data) return new Map();
    return new Map(liveAttendance.data.map((r) => [r.athleteId, r.bookingId]));
  }, [liveAttendance.data]);

  // bookings.status -> the roster's three-state mark (Sprint 6 pin: IN ->
  // 'attended', OUT -> 'noshow', clearing a mark -> 'confirmed'/unmarked).
  const roster = live
    ? (liveAttendance.data ?? []).map((r) => ({ id: r.athleteId, name: r.name, meta: null }))
    : demoRoster;
  const marks = live
    ? Object.fromEntries(
        (liveAttendance.data ?? [])
          .map((r) => [r.athleteId, r.status === 'attended' ? 'in' : r.status === 'noshow' ? 'out' : null])
          .filter(([, v]) => v != null)
      )
    : demoMarks;
  const counts = live
    ? {
        in: roster.filter((a) => marks[a.id] === 'in').length,
        out: roster.filter((a) => marks[a.id] === 'out').length,
        unmarked: roster.filter((a) => marks[a.id] == null).length,
      }
    : demoCounts;
  const mark = live
    ? (athleteId, next) => {
        const bookingId = bookingByAthlete.get(athleteId);
        if (!bookingId) return;
        liveAttendance.mark(bookingId, next === 'in' ? 'attended' : next === 'out' ? 'noshow' : 'confirmed');
      }
    : demoMark;

  // No-show reasons (owner's report 2026-09-10: "+ Add a reason" was an
  // inert button). Saved to the booking's `noshowReason` through
  // useSessionAttendance.setReason when live; a component-local record in
  // seed/demo — the exact live/demo split `mark` above already follows.
  // `localReasons` doubles as the optimistic echo in live mode, so the chip
  // shows the saved text the moment Save lands rather than after refetch.
  const [editingReason, setEditingReason] = useState(null); // athleteId | null
  const [reasonDraft, setReasonDraft] = useState('');
  const [savingReason, setSavingReason] = useState(false);
  const [reasonError, setReasonError] = useState(null);
  const [localReasons, setLocalReasons] = useState({});
  const reasonFor = (athleteId) => {
    if (localReasons[athleteId] !== undefined) return localReasons[athleteId];
    if (!live) return null;
    const row = (liveAttendance.data ?? []).find((r) => r.athleteId === athleteId);
    return row?.noshowReason ?? null;
  };
  const startReason = (athleteId) => {
    setEditingReason(athleteId);
    setReasonError(null);
    setReasonDraft(reasonFor(athleteId) || '');
  };
  const saveReason = async (athleteId) => {
    const text = reasonDraft.trim();
    setSavingReason(true);
    setReasonError(null);
    try {
      if (live) {
        const bookingId = bookingByAthlete.get(athleteId);
        if (bookingId) await liveAttendance.setReason(bookingId, text || null);
      }
      setLocalReasons((m) => ({ ...m, [athleteId]: text || null }));
      setEditingReason(null);
    } catch (err) {
      setReasonError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The reason could not be saved. Try again.'
      );
    }
    setSavingReason(false);
  };

  // Overrides the demo state the instant the coach actually starts the
  // session - real use never passes a variant, so demoState is always 'pre'
  // until this fires. Live mode has no persisted "session in progress" concept
  // yet (only the attendance marks persist, per the Sprint 6 pin), so it
  // starts 'pre' the same way and is driven by the same local override.
  const [localStatus, setLocalStatus] = useState(null);
  const sessionState = localStatus ?? (live ? 'pre' : demoState);

  const started = sessionState !== 'pre';
  const completed = sessionState === 'completed';

  /**
   * Sprint 10 pin H (TEAM.md, contract v1.8 §H): the completed-state footer
   * "Add a session note" button (the scan's third inert-button instance)
   * opens the exact same inline editor the no-show reason uses. FALLBACK
   * FLAG: `useSessionAttendance` has no `setSessionNote(sessionId, note)`
   * export in this worktree yet (confirmed via grep) - defaults to a local
   * no-op echo. Same live/demo split every other attendance write on this
   * screen already follows: real only when `live && sessionId`, a
   * component-local record otherwise (this screen has no session-scoped
   * seed data to persist a note against).
   */
  const setSessionNote = liveAttendance.setSessionNote || (async () => {});
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState(null);
  const [sessionNote, setSessionNoteLocal] = useState(null);

  const startNote = () => {
    setNoteDraft(sessionNote || '');
    setNoteError(null);
    setEditingNote(true);
  };
  const saveNote = async () => {
    const text = noteDraft.trim();
    setSavingNote(true);
    setNoteError(null);
    try {
      if (live && sessionId) await setSessionNote(sessionId, text || null);
      setSessionNoteLocal(text || null);
      setEditingNote(false);
    } catch (err) {
      setNoteError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The note could not be saved. Try again.'
      );
    }
    setSavingNote(false);
  };

  const statusPill = {
    pre: { tone: 'neutral', label: session?.startsIn },
    progress: { tone: 'green', label: 'In progress' },
    completed:
      counts.out > 0
        ? { tone: 'red', label: `${counts.out} no-shows` }
        : { tone: 'green', label: 'Completed' },
  }[sessionState];

  // Sprint 7 pin (TEAM.md): results entry for a TOURNAMENT session, opened
  // in place (same local-view-state pattern StaffScreen in PortalRoutes.js
  // already uses for its add-mode). The attendance flow above is untouched
  // for every other session type - this is the only branch point.
  if (view === 'results') {
    return (
      <ResultsEntry
        bare={bare}
        session={session}
        roster={roster}
        resultsState={tournamentResults}
        onBack={() => setView('attendance')}
      />
    );
  }

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '4px 22px 14px', background: color.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <BackLink onClick={onBack}>‹ Today</BackLink>
            <div style={{ flex: 1 }} />
            <StatusBadge tone={statusPill.tone}>{statusPill.label}</StatusBadge>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TypeChip type={session?.type} />
            <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
              {session?.blockLabel}
            </span>
          </div>

          <ScreenTitle size={21}>{session?.name}</ScreenTitle>
          <div style={{ font: `400 12px ${font.body}`, color: color.textSecondary, marginTop: 5 }}>
            {session?.meta}
          </div>

          <CounterRow counts={counts} started={started} />
        </div>
      }
      footer={
        <RosterFooter
          sessionState={sessionState}
          unmarked={counts.unmarked}
          completed={completed}
          onStart={() => setLocalStatus('progress')}
          onClose={() => setLocalStatus('completed')}
          onAddNote={startNote}
        />
      }
    >
      <div style={{ padding: '0 22px 20px' }}>
        {/*
          Sprint 10 pin H: the session note, completed state only - a real
          write against sessions.coachNote (live), or a component-local
          record (seed/demo), same split every other attendance write on
          this screen already follows.
        */}
        {completed ? (
          <div style={{ marginBottom: 16 }}>
            {editingNote ? (
              <Card large>
                <SectionLabel style={{ marginBottom: 10 }}>Session note</SectionLabel>
                <ReasonEditor
                  value={noteDraft}
                  onChange={setNoteDraft}
                  onSave={saveNote}
                  onCancel={() => setEditingNote(false)}
                  saving={savingNote}
                  error={noteError}
                  maxLength={500}
                  placeholder="e.g. Ran short groups today, cones set up for Thursday"
                />
              </Card>
            ) : sessionNote ? (
              <Card>
                <SectionLabel style={{ marginBottom: 6 }}>Session note</SectionLabel>
                <Body size={12}>{sessionNote}</Body>
                <button
                  type="button"
                  onClick={startNote}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 0 0',
                    font: `500 12px ${font.body}`,
                    color: color.primary,
                    cursor: 'pointer',
                  }}
                >
                  Edit
                </button>
              </Card>
            ) : null}
          </div>
        ) : null}

        {/* Sprint 7 pin (TEAM.md): "Enter results" on a TOURNAMENT session
            only - the block/type info the screen already receives. Never
            time-gated, same as attendance's Start session - a coach may
            legitimately enter or correct results at any point. */}
        {session?.type === 'tournament' ? (
          <div style={{ marginBottom: 16 }}>
            <Button
              variant="secondary"
              height={46}
              style={{ boxShadow: 'none' }}
              onClick={() => setView('results')}
            >
              {tournamentResults.data?.results?.length ? 'Edit results' : 'Enter results'}
            </Button>
          </div>
        ) : null}
        {roster.map((athlete, i) => {
          const value = marks[athlete.id] ?? null;
          const noShow = value === 'out';

          return (
            <div key={athlete.id}>
              <AthleteRow
                name={athlete.name}
                meta={athlete.meta}
                avatarSize={42}
                nameSize={16}
                divider={i < roster.length - 1 && !noShow}
                trailing={
                  <AttendanceControls
                    value={value}
                    onChange={(next) => mark(athlete.id, next)}
                  />
                }
              />
              {/* Optional reason, indented to align under the name. Never a
                  required field - a required note is how attendance stops
                  getting marked at all. Tap the chip to add or edit; the
                  saved text shows in place of the prompt. */}
              {noShow ? (
                <div
                  style={{
                    marginLeft: 54,
                    marginBottom: 11,
                    paddingBottom: 11,
                    borderBottom:
                      i < roster.length - 1 ? `1px solid ${color.rowRule}` : 'none',
                  }}
                >
                  {editingReason === athlete.id ? (
                    <ReasonEditor
                      value={reasonDraft}
                      onChange={setReasonDraft}
                      onSave={() => saveReason(athlete.id)}
                      onCancel={() => setEditingReason(null)}
                      saving={savingReason}
                      error={reasonError}
                    />
                  ) : (
                    <NoteChip
                      noShow
                      reason={reasonFor(athlete.id)}
                      onClick={() => startReason(athlete.id)}
                    />
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

/**
 * Results entry becomes SCORE entry (Sprint 8 pin, TEAM.md, contract v1.6):
 * a coach types each rostered athlete's strokes (18..200) instead of
 * tapping a finishing order - the derive-don't-store rule now covers
 * position too (data/tour.js's deriveTourStandings computes position from
 * score at read time, grouped by bracket). This screen never computes or
 * displays a position; it only collects scores.
 *
 * Each row also shows the athlete's age bracket as a small status chip
 * (contract v1.6: a write-time snapshot of the athlete's dob-derived
 * bracket) via the NEW `useAthleteBrackets(athleteIds)` hook (TEAM.md's
 * pinned seam, stubbed above - see its fallback comment). An athlete whose
 * bracket cannot be resolved reads "Open" - the pin's own fallback label
 * for the 'open' group, not an invented value.
 *
 * Pre-fills from `resultsState.data?.results` (each row now carries
 * `score`, not `position`) the first time real existing results arrive -
 * same seeded-once guard as before, so a background refresh cannot clobber
 * a coach's in-progress edit. An athlete with no entered (or out-of-range)
 * score is simply left out of the save, never coerced to 0 or clamped -
 * "no score yet" and "scored zero" are different facts.
 *
 * Local `scores` (athleteId -> raw input string) drives the UI in both seed
 * and live mode - only the Save call is mode-specific (the hook's
 * `saveResults` is a real write live, an inert no-op via the fallback
 * otherwise), matching this screen's existing attendance flow.
 */
function ResultsEntry({ bare, session, roster, resultsState, onBack }) {
  const [scores, setScores] = useState({}); // { [athleteId]: rawInputString }
  const seededRef = useRef(false);
  const [saveState, setSaveState] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const [saveError, setSaveError] = useState(null);

  const athleteIds = useMemo(() => roster.map((a) => a.id), [roster]);
  const bracketsState = useAthleteBrackets(athleteIds);
  const bracketByAthlete = bracketsState.data ?? {};

  // Pre-fill once, the first time real existing results arrive - never
  // re-seeds after that, so a background refresh cannot clobber a coach's
  // in-progress edit. `data.results` is the hook's pinned v1.6 envelope,
  // each row now carrying `score` rather than `position`.
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

  const setScore = (athleteId, raw) => {
    if (saveState === 'saving') return;
    // Digits only, capped at 3 characters - the pin's max (200) is 3 digits.
    const cleaned = raw.replace(/[^0-9]/g, '').slice(0, 3);
    setScores((prev) => ({ ...prev, [athleteId]: cleaned }));
    setSaveState('idle');
  };

  // Only a real, in-range strokes count is "entered" - 18..200 per the pin.
  // Empty or out-of-range input is treated exactly like "no score yet":
  // left out of both the count and the save, never coerced or clamped.
  const validScore = (athleteId) => {
    const raw = scores[athleteId];
    if (raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 18 && n <= 200 ? n : null;
  };

  const enteredCount = roster.filter((a) => validScore(a.id) != null).length;
  const allScored = roster.length > 0 && enteredCount >= roster.length;

  const handleSave = async () => {
    setSaveState('saving');
    setSaveError(null);
    try {
      // Each entry carries the athlete's display name off this very roster
      // (contract v1.5.1, unchanged by v1.6) plus its bracket snapshot -
      // null when useAthleteBrackets hasn't resolved one.
      const nameById = new Map(roster.map((a) => [a.id, a.name]));
      const entries = roster
        .map((a) => ({
          athleteId: a.id,
          name: nameById.get(a.id) ?? null,
          bracket: bracketByAthlete[a.id] ?? null,
          score: validScore(a.id),
        }))
        .filter((e) => e.score != null);
      await resultsState.saveResults(entries);
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
              : "Enter each athlete's strokes. Standings are calculated automatically."}
          </Body>
        </div>
      }
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px', background: color.bg }}>
          {saveError ? (
            <Body size={12} tone={color.error} style={{ marginBottom: 10 }}>
              {saveError} Nothing was saved — tap Save scores to try again.
            </Body>
          ) : null}
          {saveState === 'saved' ? <SavedNotice /> : null}
          <Button
            variant="pinned"
            height={56}
            loading={saveState === 'saving'}
            disabled={!enteredCount}
            onClick={handleSave}
            style={saveState === 'saved' ? { marginTop: 10 } : null}
          >
            {saveState === 'saving' ? 'Saving scores' : 'Save scores'}
          </Button>
        </div>
      }
    >
      <div style={{ padding: '0 22px 20px' }}>
        {roster.map((athlete, i) => (
          <AthleteRow
            key={athlete.id}
            name={athlete.name}
            meta={athlete.meta}
            avatarSize={42}
            nameSize={16}
            divider={i < roster.length - 1}
            trailing={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <BracketChip bracket={bracketByAthlete[athlete.id] ?? null} />
                <ScoreField
                  value={scores[athlete.id] ?? ''}
                  onChange={(v) => setScore(athlete.id, v)}
                  disabled={saveState === 'saving'}
                />
              </div>
            }
          />
        ))}
      </div>
    </PhoneFrame>
  );
}

/**
 * Age-bracket chip (Sprint 8 pin, TEAM.md, contract v1.6) - a status, not a
 * control, so per flag 02 (StatusBadge.js) it's the outline/tint treatment,
 * never a solid fill. Shows the bracket id verbatim ('10U' / '11-13' /
 * '14+') to match the owner's own naming; an athlete with no resolvable
 * bracket (no dob on file, or the stubbed hook above) reads "Open" - the
 * pin's own fallback label for the 'open' group, not an invented value.
 */
function BracketChip({ bracket }) {
  return <StatusBadge tone="neutral">{bracket || 'Open'}</StatusBadge>;
}

/**
 * Strokes input - same visual idiom as NumericField's input (screen 14,
 * Diagnostic Capture): track fill, 1px border, 8px radius, right-aligned
 * 600-weight figures. Purpose-built rather than reusing NumericField
 * directly because NumericField's layout is a left label + right unit
 * column built for a stacked list of metrics under one athlete, not one
 * compact field sitting in an AthleteRow's trailing slot beside a
 * BracketChip.
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

/**
 * Three counters, and unmarked is a first-class one. Closing a block with
 * unmarked athletes is what produces bad no-show data, so the count has to be
 * visible the whole time rather than discovered at the footer.
 */
function CounterRow({ counts, started }) {
  const cells = [
    { key: 'in', label: 'In', value: counts.in, tone: color.primary },
    { key: 'out', label: 'Out', value: counts.out, tone: color.error },
    {
      key: 'unmarked',
      label: 'Unmarked',
      value: counts.unmarked,
      // Unmarked only goes yellow once the session has actually started -
      // before that, everyone being unmarked is simply the starting position.
      tone: started ? color.secondary : null,
    },
  ];

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
      {cells.map((c) => {
        const active = c.value > 0 && c.tone;
        return (
          <div
            key={c.key}
            style={{
              flex: 1,
              borderRadius: radius.counter,
              padding: '10px 0',
              textAlign: 'center',
              background: active ? 'transparent' : color.dimmed,
              border: `1px solid ${active ? c.tone : color.rule}`,
            }}
          >
            <div
              style={{
                font: `700 22px ${font.head}`,
                color: active ? c.tone : color.disabledText,
              }}
            >
              {c.value}
            </div>
            <div
              style={{
                font: `400 9px ${font.body}`,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                color: active ? c.tone : color.disabledText,
                opacity: 0.75,
                marginTop: 2,
              }}
            >
              {c.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RosterFooter({ sessionState, unmarked, completed, onStart, onClose, onAddNote }) {
  const hint = completed
    ? 'No-shows are reported to Phil, not the coach chain.'
    : 'Tap a green or red button again to clear it.';

  let cta;
  if (sessionState === 'pre') {
    // Never time-gated - always tappable, with no window check anywhere in
    // this screen. This onClick is the fix: the button previously had none.
    cta = (
      <Button variant="pinned" height={56} onClick={onStart}>
        Start session
      </Button>
    );
  } else if (completed) {
    // Sprint 10 pin H: was inert (no onClick at all) - opens the session
    // note editor rendered above the roster list.
    cta = (
      <Button variant="outline" height={56} onClick={onAddNote} style={{ boxShadow: 'none' }}>
        Add a session note
      </Button>
    );
  } else {
    // The gate on unmarked athletes is soft: the button still works and states
    // the count, because a coach may legitimately need to close with a gap.
    // Blocking it outright would just get attendance abandoned mid-session.
    cta =
      unmarked > 0 ? (
        <Button variant="caution" height={56} style={{ boxShadow: 'none' }} onClick={onClose}>
          Close block · {unmarked} unmarked
        </Button>
      ) : (
        <Button variant="pinned" height={56} onClick={onClose}>
          Close block
        </Button>
      );
  }

  return (
    <div
      style={{
        borderTop: `1px solid ${color.frameRule}`,
        padding: '14px 22px 22px',
        background: color.bg,
      }}
    >
      {cta}
      <div
        style={{
          font: `400 11px ${font.body}`,
          color: color.textTertiary,
          textAlign: 'center',
          marginTop: 10,
        }}
      >
        {hint}
      </div>
    </div>
  );
}

function NoteChip({ noShow, reason, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: noShow ? 'rgba(255,68,68,.08)' : '#161616',
        border: `1px solid ${noShow ? 'rgba(255,68,68,.4)' : color.rule}`,
        borderRadius: radius.badge,
        padding: '6px 10px',
        maxWidth: '100%',
        textAlign: 'left',
        font: `500 11px ${font.body}`,
        color: noShow ? color.error : color.textTertiary,
        cursor: 'pointer',
      }}
    >
      {reason ? `${reason} · edit` : noShow ? '+ Add a reason (optional)' : '+ Add a note'}
    </button>
  );
}

/**
 * Inline reason editor (owner's report 2026-09-10) - a single short text
 * field where the chip sat, saved on Enter or the Save chip, dismissed on
 * Escape or Cancel. Deliberately tiny: the reason is one line for Phil's
 * no-show report, not a note-taking surface (this screen's own rule - typing
 * is never required to complete the core task).
 *
 * Sprint 10 pin H reuses this same idiom for the session note
 * (sessions.coachNote, up to 500 chars) - `maxLength`/`placeholder` are
 * overridable so the one editor serves both without a second component.
 */
function ReasonEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  maxLength = 200,
  placeholder = 'e.g. Sick — parent texted ahead',
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          autoFocus
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={saving}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSave();
            if (e.key === 'Escape') onCancel();
          }}
          style={{
            flex: 1,
            minWidth: 0,
            height: 36,
            background: color.dimmed,
            border: `1px solid ${color.border}`,
            borderRadius: radius.badge,
            padding: '0 10px',
            font: `400 12px ${font.body}`,
            color: color.text,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            background: 'transparent',
            border: `1px solid ${color.primary}`,
            borderRadius: radius.badge,
            padding: '8px 12px',
            font: `600 11px ${font.body}`,
            color: color.primary,
            cursor: 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '8px 4px',
            font: `500 11px ${font.body}`,
            color: color.textTertiary,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
      {error ? (
        <div style={{ font: `400 11px ${font.body}`, color: color.error, marginTop: 6 }}>{error}</div>
      ) : null}
    </div>
  );
}
