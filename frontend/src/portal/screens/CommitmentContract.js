import React, { useEffect, useState } from 'react';
import { color, font, glow, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import NumericField from '../components/NumericField';
import PhoneFrame from '../components/PhoneFrame';
import ContractCalendar from '../components/ContractCalendar';
import { DayGridLegend } from '../components/DayGridCell';
import { Body, Card, ErrorNotice, ScreenTitle, Tick } from '../components/Primitives';
import SkeletonCard from '../components/Skeleton';
import { useContract, usePracticeLog } from '../hooks';
// todayISO is a pure calendar helper, not response data — like poolFor in
// BookSession, the helpers stay importable; data travels through the hook seam.
import { todayISO } from '../data/calendar';

/**
 * 07 · Commitment Contract - athlete. ⭐
 * States: On track, Behind, Month complete, No contract selected.
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
 * @param {'ontrack'|'behind'|'complete'|'none'} variant
 * @param {boolean} [practice]
 *   Onboarding practice mode (docs/portal/TEAM.md, "Onboarding program v1").
 *   "Log today" logs locally: today's cell flips to logged and the hero count
 *   moves, all in component state — the real one-tap habit, demonstrated on
 *   the real grid, with zero Firestore writes. Resets on unmount. Default off,
 *   so the non-onboarding screen is byte-for-byte unchanged in behavior.
 * @param {(entry) => void} [onLogged]
 *   Practice mode only: fires once when the practice day is logged —
 *   `{ iso }`. The onboarding step's completion signal.
 */
export default function CommitmentContract({
  variant = 'ontrack',
  bare = false,
  practice = false,
  onLog,
  onLogged,
}) {
  const { data, loading, error } = useContract({ variant });
  const [sheetDay, setSheetDay] = useState(null);
  // The practice log lives here and nowhere else — component state is the
  // whole record, per the practice-mode invariant (zero Firestore writes).
  const [practiceLogged, setPracticeLogged] = useState(null);
  // Real (non-practice) logging: the timer/manual entry sheet, and the
  // minutes actually saved today once the coach... athlete taps Save. The
  // contract tier is a minimum, not a unit (Sprint 5 pin) — this is the
  // real practiced amount, which can run above or below the tier.
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [todayLog, setTodayLog] = useState(null); // minutes, or null if not logged today

  const practiceLog = usePracticeLog({ practice });

  if (variant === 'none') return <NoContract bare={bare} data={data} />;

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
  const behind = variant === 'behind';
  const complete = variant === 'complete';

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
    : () => setShowLogSheet(true);

  const handleSaveLog = (minutes) => {
    practiceLog.logPractice({ minutes });
    setTodayLog(minutes);
    setShowLogSheet(false);
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
              {data?.tierMinutes} min tier
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
          logged={Boolean(practiceLogged) || todayLog != null}
          loggedMinutes={todayLog ?? data?.tierMinutes}
        />
      }
    >
      <div style={{ padding: '0 22px 20px', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
        <HeroCard state={state} stats={stats} behind={behind} complete={complete} />

        <Card large>
          {/* FullCalendar draws the real current month; we only paint states. */}
          <ContractCalendar
            start={data?.month?.start}
            dayStates={dayStates}
            onSelectDay={setSheetDay}
          />
          <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
            {data?.caption}
          </Body>
          <div style={{ marginTop: 12 }}>
            <DayGridLegend />
          </div>
        </Card>

        <StatsRow stats={displayStats} />
      </div>

      {sheetDay ? <DaySheet day={sheetDay} onClose={() => setSheetDay(null)} /> : null}
      {showLogSheet ? (
        <LogSheet
          contractMinutes={data?.tierMinutes}
          onClose={() => setShowLogSheet(false)}
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
function ContractFooter({ complete, hint, onLog, minutes, logged = false, loggedMinutes }) {
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

/** Read-only grid: a past day opens this rather than toggling in place. */
/** '2026-08-14' -> 'August 14', via the platform, not hand math. */
function sheetTitle(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
}

function DaySheet({ day, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: tint.overlay,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>{sheetTitle(day.iso)}</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          {day.state === 'logged'
            ? 'Logged. Tap below to remove this entry if it was recorded by mistake.'
            : 'Not logged. A late entry is allowed until the month closes.'}
        </Body>
        <Button
          variant={day.state === 'logged' ? 'outline' : 'primary'}
          height={50}
          onClick={onClose}
          style={{ marginTop: 16, boxShadow: 'none' }}
        >
          {day.state === 'logged' ? 'Remove entry' : 'Add late entry'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Sprint 5 pin: variable practice logging. The contract tier is a minimum,
 * not a unit — this sheet captures the real minutes practiced, two ways: a
 * running timer (no typing) or a manual entry (for a session already run
 * elsewhere). Whichever mode is showing when Save is tapped is what gets
 * logged; switching modes does not combine them.
 */
function LogSheet({ contractMinutes, onClose, onSave }) {
  const [mode, setMode] = useState('timer');
  const [running, setRunning] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [manualMinutes, setManualMinutes] = useState('');

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const timerMinutes = Math.floor(elapsedSec / 60);
  const mm = String(timerMinutes).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  const manualValue = Math.max(0, Math.round(Number(manualMinutes) || 0));
  const minutesToSave = mode === 'timer' ? timerMinutes : manualValue;
  const canSave = minutesToSave > 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: tint.overlay,
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>Log practice</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          {contractMinutes
            ? `${contractMinutes} min is the contract minimum, not a unit — log the real time practiced.`
            : 'Log the real time practiced.'}
        </Body>

        <div
          style={{
            display: 'flex',
            marginTop: 16,
            background: color.dimmed,
            border: `1px solid ${color.border}`,
            borderRadius: radius.control,
            padding: 3,
          }}
        >
          {[['timer', 'Timer'], ['manual', 'Enter minutes']].map(([key, label]) => {
            const on = key === mode;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                style={{
                  flex: 1,
                  height: 36,
                  border: 'none',
                  borderRadius: radius.pill,
                  background: on ? color.primary : 'transparent',
                  font: `${on ? 600 : 500} 13px ${font.body}`,
                  color: on ? '#000' : color.textTertiary,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {mode === 'timer' ? (
          <div style={{ textAlign: 'center', marginTop: 22 }}>
            <div style={{ font: `700 44px ${font.head}`, color: color.text, letterSpacing: '.04em' }}>
              {mm}:{ss}
            </div>
            <Button
              variant={running ? 'dangerOutline' : 'primary'}
              height={50}
              style={{ marginTop: 16, boxShadow: 'none' }}
              onClick={() => setRunning((r) => !r)}
            >
              {running ? 'Stop' : elapsedSec > 0 ? 'Resume' : 'Start'}
            </Button>
          </div>
        ) : (
          <div style={{ marginTop: 18 }}>
            <NumericField
              label="Minutes practiced"
              unit="min"
              value={manualMinutes}
              onChange={setManualMinutes}
            />
          </div>
        )}

        <Button height={54} disabled={!canSave} style={{ marginTop: 22 }} onClick={() => onSave(minutesToSave)}>
          {canSave ? `Save · ${minutesToSave} min` : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function NoContract({ bare, data }) {
  const [selected, setSelected] = useState(null);

  return (
    <PhoneFrame
      bare={bare}
      footer={
        <>
          <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '13px 22px 14px' }}>
            <Button height={56} disabled={!selected} style={{ borderRadius: 10 }}>
              {selected ? `Start the ${selected} min contract` : 'Select a tier to continue'}
            </Button>
          </div>
          <BottomTabBar role="athlete" active="contract" />
        </>
      }
    >
      <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <ScreenTitle size={24}>Pick your daily investment</ScreenTitle>
        <Body size={13}>
          Five days a week, every week. Complete the month and you go on the Commitment Board.
        </Body>

        {(data?.tiers ?? []).map((tier) => (
          <TierChoice
            key={tier.minutes}
            tier={tier}
            selected={selected === tier.minutes}
            onSelect={() => setSelected(tier.minutes)}
          />
        ))}

        <Body size={11} tone={color.textTertiary}>
          Both a physical and a digital signature are required. Your coach countersigns at your next
          block.
        </Body>
      </div>
    </PhoneFrame>
  );
}

function TierChoice({ tier, selected, onSelect }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        background: color.surface,
        border: `1px solid ${selected ? color.primary : color.border}`,
        borderRadius: radius.cardLarge,
        padding: 17,
        display: 'flex',
        gap: 13,
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 26,
          height: 26,
          flex: 'none',
          marginTop: 2,
          borderRadius: '50%',
          border: `1.5px solid ${selected ? color.primary : color.faintText}`,
          background: selected ? color.primary : 'transparent',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {selected ? (
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#000' }} />
        ) : null}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ font: `700 30px ${font.head}`, color: color.text }}>{tier.minutes}</span>
          <span style={{ font: `500 14px ${font.body}`, color: color.textSecondary }}>min / day</span>
        </div>
        <Body size={12} style={{ marginTop: 6 }}>
          {tier.description}
        </Body>
        {tier.footnote ? (
          <div
            style={{
              font: `500 10px ${font.body}`,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: color.secondary,
              marginTop: 9,
            }}
          >
            {tier.footnote}
          </div>
        ) : null}
      </div>
    </div>
  );
}
