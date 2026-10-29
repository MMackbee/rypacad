import React, { useEffect, useRef, useState } from 'react';
import { color, font, glow, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { DayGridLegend } from '../components/DayGridCell';
import { RangeCalendarCard } from '../components/CalendarCard';
import { Body, ErrorNotice, ScreenTitle, Tick } from '../components/Primitives';
import SkeletonCard from '../components/Skeleton';
import { DaySheet, LogSheet } from '../components/ContractSheets';
import { useContract, usePracticeLog } from '../hooks';
// todayISO is a pure calendar helper, not response data — like poolFor in
// BookSession, the helpers stay importable; data travels through the hook seam.
import { monthBounds, todayISO } from '../data/calendar';

/**
 * 07 · Commitment Contract - athlete. ⭐
 * States: On track, Behind, Month complete. No tier picker (owner's rule,
 * 2026-10-28): the header shows the derived requirement ("20 min a day",
 * 10 under 12) and the first open stamps it once (ensureContractStart).
 *
 * The most-used screen in the app, and the one the handoff singles out for
 * extra attention. The shape follows from that: Log Today is pinned to the
 * bottom at 56px inside thumb reach and never scrolls away, so the daily task
 * is one tap from a cold open with no scrolling and no typing.
 *
 * The month grid is read-only. Tapping a past day opens a sheet rather than
 * editing inline, because a mis-tap while walking must not silently change a
 * record.
 *
 * Flag 02 lives on this screen: the progress meter and the Log Today button sit
 * inches apart and would both be green. The rule is that solid green fill means
 * tap - so the meter is a bar, not a button, and only the CTA is filled.
 *
 * @param {'ontrack'|'behind'|'complete'} variant
 * @param {boolean} [practice]
 *   Onboarding practice mode (docs/portal/TEAM.md, "Onboarding program v1").
 *   "Log today" logs locally: today's cell flips to logged and the hero count
 *   moves, all in component state — the real one-tap habit, demonstrated on
 *   the real grid, with zero Firestore writes. Resets on unmount. Default off,
 *   so the non-onboarding screen is byte-for-byte unchanged in behavior.
 * @param {(entry) => void} [onLogged]
 *   Practice mode only: fires once when the practice day is logged —
 *   `{ iso }`. The onboarding step's completion signal.
 * @param {string|null} [athleteId]
 *   null (default) is the signed-in athlete's own contract; an id is that
 *   athlete's (spec 4.3, parents log for their kids) - passed to both hooks.
 */
export default function CommitmentContract({
  variant = 'ontrack',
  bare = false,
  practice = false,
  onLog,
  onLogged,
  athleteId = null,
}) {
  const contractHook = useContract({ variant, practice, athleteId });
  const { data, loading, error } = contractHook;
  const [sheetDay, setSheetDay] = useState(null);
  // The practice log lives here and nowhere else — component state is the
  // whole record, per the practice-mode invariant (zero Firestore writes).
  const [practiceLogged, setPracticeLogged] = useState(null);
  // Real (non-practice) logging: which day the LogSheet is open FOR — null
  // is closed, an ISO date is open targeting that day (today via the footer
  // CTA, a past day via the calendar's "Add late entry"; owner's report
  // 2026-09-10: late entry did nothing). The day's minutes still come from
  // usePracticeLog — a local copy of the last delta was a third source of
  // truth (code review 2026-09-04, findings 3 and 4).
  const [logSheetDate, setLogSheetDate] = useState(null);

  const practiceLog = usePracticeLog({ practice, athleteId });

  // The owner's rule (2026-10-28; spec 4.3): no tier picker. The first open
  // stamps the derived requirement and contractStart, once per mount (a
  // failed stamp clears the guard; the next open of the screen tries
  // again). Never in practice mode: the walkthrough writes nothing.
  const stamped = useRef(false);
  useEffect(() => {
    if (practice || !data?.needsStart || stamped.current) return;
    stamped.current = true;
    Promise.resolve(contractHook.ensureContractStart?.()).catch(() => { stamped.current = false; });
  }, [data?.needsStart]); // eslint-disable-line react-hooks/exhaustive-deps

  // The screen predates the hook's live branch, which made data async — every
  // render below assumed it synchronously; rendering through with data still
  // undefined crashed HeroCard (QA re-sweep #4). Loading and error get their
  // own honest frames before anything touches the payload.
  if (loading || error || !data) {
    return (
      <PhoneFrame bare={bare}>
        <div style={{ padding: '24px 22px' }}>
          {error ? (
            <ErrorNotice title="Contract didn't load">
              Your contract didn't load. Check your connection and try again.
            </ErrorNotice>
          ) : (
            <SkeletonCard large height={320} />
          )}
        </div>
      </PhoneFrame>
    );
  }

  const state = data?.state;
  // Live mode renders with the default variant, so the hook's `kind` drives
  // the styling too - keyed off `variant` alone, the red hero never showed
  // under a live Behind pill.
  const behind = variant === 'behind' || state?.kind === 'behind';
  const complete = variant === 'complete' || state?.kind === 'complete';

  // Practice overlays, derived at render: the grid and the hero count move the
  // moment the tap lands, from the same single piece of state — they cannot
  // disagree. Off (null) leaves the hook's data untouched.
  const dayStates = practiceLogged
    ? { ...(data?.dayStates ?? {}), [practiceLogged]: 'logged' }
    : data?.dayStates ?? {};
  const stats = practiceLogged && data?.stats
    ? { ...data.stats, logged: data.stats.logged + 1 }
    : data?.stats;
  // Minutes logged this cycle reads from the practice log, not the tier-times-
  // days placeholder — a day fulfilled at 90 against a 45 contract shows 90.
  const displayStats = stats ? { ...stats, minutes: practiceLog.totalMinutes } : stats;

  const handleLog = practice
    ? () => {
        if (practiceLogged) return;
        const iso = todayISO();
        setPracticeLogged(iso);
        if (onLogged) onLogged({ iso });
      }
    : () => setLogSheetDate(todayISO());

  // `minutes` is the DELTA just practiced; logPractice accumulates it into
  // the day (transactionally in live mode) and the hook re-reports the total.
  const handleSaveLog = (minutes) => {
    practiceLog.logPractice({ minutes, date: logSheetDate ?? undefined });
    setLogSheetDate(null);
    if (onLog) onLog(minutes);
  };

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
              {data?.month?.label}
            </div>
            <ScreenTitle size={24} style={{ marginTop: 3 }}>
              {data?.tierMinutes} min a day
            </ScreenTitle>
          </div>
          <StatusPill badge={state?.badge} />
        </div>
      }
      footer={
        <ContractFooter
          complete={complete}
          hint={state?.hint}
          onLog={handleLog}
          minutes={data?.tierMinutes}
          logged={Boolean(practiceLogged) || Boolean(practiceLog.data?.loggedToday)}
          loggedMinutes={practiceLog.data?.todayMinutes || data?.tierMinutes}
          // Practice mode logs once per walkthrough step, so the logged
          // state must not offer "+ Add more" — handleLog short-circuits
          // there, making it a dead control (code review 2026-09-04).
          canAddMore={!practice}
        />
      }
    >
      <div style={{ padding: '0 22px 20px', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
        <HeroCard state={state} stats={stats} behind={behind} complete={complete} />

        {/* The shared Month/Week card (owner request 2026-09-30). Month is
            this screen's default: FullCalendar draws the real current month;
            we only paint states. Week shows one row of the same month (days
            outside it blank), handed the same dayStates and onSelectDay.
            gridKey carries the logged count into the month grid's key so a
            fulfilled day repaints the moment the hook re-derives - the grid
            otherwise held its mount-time painting until a full reload
            (QA 2026-09-08 #5). */}
        <RangeCalendarCard
          rangeStart={data?.month?.start}
          rangeEnd={data?.month?.start ? monthBounds(data.month.start).end : undefined}
          dayStates={dayStates}
          onSelectDay={setSheetDay}
          blankOutsideRange
          gridKey={stats?.logged ?? 0}
        >
          <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
            {data?.caption}
          </Body>
          <div style={{ marginTop: 12 }}>
            <DayGridLegend />
          </div>
        </RangeCalendarCard>

        <StatsRow stats={displayStats} />
      </div>

      {sheetDay ? (
        <DaySheet
          day={sheetDay}
          onClose={() => setSheetDay(null)}
          // Practice mode keeps the sheet read-only — the walkthrough's
          // one-log-per-step gate must not be sidestepped from a date cell.
          // Real mode wires both actions (owner's report 2026-09-10: both
          // buttons just closed the sheet).
          onAddLate={
            practice
              ? undefined
              : (iso) => {
                  setSheetDay(null);
                  setLogSheetDate(iso);
                }
          }
          onRemove={practice ? undefined : (iso) => practiceLog.removeLog({ date: iso })}
        />
      ) : null}
      {logSheetDate ? (
        <LogSheet
          contractMinutes={data?.tierMinutes}
          forDate={logSheetDate}
          onClose={() => setLogSheetDate(null)}
          onSave={handleSaveLog}
        />
      ) : null}
    </PhoneFrame>
  );
}

function StatusPill({ badge }) {
  if (!badge) return null;
  const tones = {
    green: { bg: 'rgba(0,175,81,.14)', fg: color.primary },
    red: { bg: 'rgba(255,68,68,.1)', fg: color.error },
    yellow: { bg: 'rgba(244,238,25,.12)', fg: color.secondary },
  };
  const t = tones[badge.tone] || tones.green;

  return (
    <span
      style={{
        borderRadius: radius.round,
        padding: '6px 12px',
        background: t.bg,
        color: t.fg,
        font: `600 10px ${font.body}`,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        flex: 'none',
      }}
    >
      {badge.label}
    </span>
  );
}

function HeroCard({ state, stats, behind, complete }) {
  // Outside the contract window (before the start, after the season) there
  // are no contract days to count: the line alone, not "0 of 0".
  if (state?.kind === 'notStarted' || state?.kind === 'ended') {
    return (
      <div
        style={{
          borderRadius: radius.cardLarge,
          padding: 19,
          background: color.surface,
          border: `1px solid ${color.border}`,
        }}
      >
        <Body size={13}>{state.line}</Body>
      </div>
    );
  }
  const border = behind ? color.error : complete ? color.secondary : color.primary;
  const total = stats?.contractDays ?? 0;
  const logged = stats?.logged ?? 0;
  const pct = total ? Math.round((logged / total) * 100) : 0;

  return (
    <div
      style={{
        borderRadius: radius.cardLarge,
        padding: 19,
        background: color.surface,
        border: `1px solid ${border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 11 }}>
        <span
          style={{
            font: `700 54px ${font.head}`,
            lineHeight: 1,
            color: behind ? color.error : color.text,
          }}
        >
          {logged}
        </span>
        <span style={{ font: `400 15px ${font.body}`, color: color.textSecondary }}>
          of {total} contract days
        </span>
      </div>

      {/*
        A bar, not a control. Flag 02: solid green fill means tap on this
        screen, and the Log Today button below is the only thing that is one.
      */}
      <div
        style={{
          height: 10,
          background: '#0d0d0d',
          borderRadius: 5,
          overflow: 'hidden',
          marginTop: 16,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: behind ? color.error : color.primary,
            borderRadius: 5,
          }}
        />
      </div>

      <Body size={13} style={{ marginTop: 14 }}>
        {state.line}
      </Body>
    </div>
  );
}

function StatsRow({ stats }) {
  const rows = [
    [stats?.streak ?? 0, 'day streak'],
    [stats?.minutes ?? 0, 'minutes logged'],
    [stats?.daysLeft ?? 0, 'days left'],
  ];

  return (
    <div style={{ display: 'flex' }}>
      {rows.map(([value, label], i) => (
        <div
          key={label}
          style={{
            flex: 1,
            textAlign: 'center',
            borderLeft: i === 0 ? 'none' : `1px solid ${color.ruleFaint}`,
          }}
        >
          <div style={{ font: `700 22px ${font.head}`, color: color.text }}>{value}</div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 4 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Pinned, 56px, inside thumb reach, and it never scrolls away. The daily task
 * is one tap from a cold open.
 *
 * `logged`: the CTA's slot becomes a green-tinted status bar — not a Button,
 * per flag 02: solid green fill means tap, and a logged day is a state, not
 * an action. `loggedMinutes` is the real amount saved (practice mode: the
 * tier minutes, matching its one-tap semantics; real mode: whatever the
 * timer or manual entry actually recorded, which can be above or below the
 * tier — see LogSheet).
 */
function ContractFooter({
  complete,
  hint,
  onLog,
  minutes,
  logged = false,
  loggedMinutes,
  canAddMore = true,
}) {
  return (
    <>
      <div
        style={{
          borderTop: `1px solid ${color.frameRule}`,
          background: color.bg,
          padding: '13px 22px 14px',
        }}
      >
        {logged ? (
          <div
            style={{
              height: 56,
              borderRadius: 10,
              background: tint.green,
              border: `1px solid ${color.primary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              font: `600 17px ${font.body}`,
              color: color.primary,
            }}
          >
            <Tick size={14} color={color.primary} thickness={2.5} />
            <span>Logged today · {loggedMinutes ?? minutes} min</span>
            {/* Minutes accumulate (a morning and an evening session are one
                day's total), so the logged state keeps a way back into the
                sheet instead of going inert for the rest of the day. */}
            {onLog && canAddMore ? (
              <button
                type="button"
                onClick={onLog}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px 6px',
                  font: `600 13px ${font.body}`,
                  color: color.primary,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                + Add more
              </button>
            ) : null}
          </div>
        ) : complete ? (
          <Button variant="outline" height={56} style={{ borderRadius: 10, boxShadow: 'none' }}>
            View Commitment Board
          </Button>
        ) : (
          <Button
            height={56}
            onClick={onLog}
            style={{ borderRadius: 10, font: `600 17px ${font.body}`, boxShadow: glow.buttonPinned }}
          >
            Log today · {minutes} min
          </Button>
        )}
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
      <BottomTabBar role="athlete" active="contract" />
    </>
  );
}
