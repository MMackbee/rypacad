import React, { useEffect, useState } from 'react';
import { color, font, radius } from '../tokens';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import CancelSheet from '../components/CancelSheet';
import FieldRow from '../components/assessments/FieldRow';
import SaveState from '../components/assessments/SaveState';
import TrialInput, { TextEntry } from '../components/assessments/TrialInput';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useAthleteAssessments } from '../hooks/assessments';
import { saveSection, saveWindowFields } from '../hooks/assessmentsLive';
import useSaveTracker from '../hooks/assessmentSaves';
import { clubheadScores } from '../data/assessmentScoring';
import { setAt } from '../data/assessmentInput';
import { ENTRY_WINDOW_DAYS, GOLF_WINDOW_DAYS, KIND_LABEL, daysBetween, shortDate, toISODate } from '../data/assessmentWindows';

export const CLUBHEAD_CUE = "Fastest swing you've got. Don't worry about where it goes.";
export const EMPTY_GOLF = { speeds: [], driver: null, parallaxComposite: null, fps: null };

/** A coach-set swing date: in the last 14 days (spec 4.1) and never in the future. */
export function swingDateProblem(date, today) {
  const d = daysBetween(date, today);
  if (d == null) return 'Pick a date.';
  if (d < 0) return "The swing date can't be in the future.";
  if (d > ENTRY_WINDOW_DAYS) return `Pick a date in the last ${ENTRY_WINDOW_DAYS} days.`;
  return null;
}

const latestOpen = (windows) => [...(windows || [])].filter((w) => w.status === 'open').sort((a, b) => (a.circuitDate || '').localeCompare(b.circuitDate || '')).pop() ?? null;

/**
 * Clubhead speed and Parallax in the golf session (spec 2, decision 2;
 * protocol Section 4): every coach, from their own login, on the athlete's
 * open window - the golf section and its date are the only writes the
 * rules allow them. 3 warm-up swings, then 5 maximal (the trial-count
 * setting); every speed saves as typed; the first save dates the golf
 * today and the date can be moved to another day in the last 14. Golf more
 * than 7 days after the circuit (or not the same day, when the circuit
 * says so) is warned here and flagged in the results.
 */
export default function AssessmentGolf({ bare = false, athleteId, fallbackName = null, onBack }) {
  const layout = useLayoutClass();
  const { data, loading, error } = useAthleteAssessments(athleteId);
  const tracker = useSaveTracker();
  const [w, setW] = useState(null);
  const [dateError, setDateError] = useState(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (w === null && data) setW(latestOpen(data.windows) ?? false);
  }, [data, w]);

  const name = data?.athlete?.name ?? fallbackName ?? 'This athlete';
  const today = toISODate(Date.now());
  const counts = w ? w.circuitMode?.trialCounts ?? {} : {};
  const n = counts.clubheadMax ?? 5;
  const golf = { ...EMPTY_GOLF, driver: data?.profile?.driver ?? null, ...(w?.golf || {}) };
  const scores = clubheadScores(golf);

  const saveDate = (golfDate) => {
    setW((cur) => ({ ...cur, golfDate }));
    tracker.run(`${athleteId}:fields`, () => saveWindowFields({ athleteId, windowId: w.id, fields: { golfDate } }));
  };
  const saveGolf = (patch) => {
    const next = { ...golf, ...patch };
    setW((cur) => ({ ...cur, golf: next }));
    tracker.run(`${athleteId}:golf`, () => saveSection({ athleteId, windowId: w.id, section: 'golf', value: next }));
    if (!w.golfDate) saveDate(today);
  };
  const leave = () => (tracker.unsaved ? setLeaving(true) : onBack());

  const golfDate = w ? w.golfDate ?? today : null;
  const after = w ? daysBetween(w.circuitDate, golfDate) : null;
  const sameDay = w && w.circuitMode?.golfTiming === 'same-day';
  const warning = !w ? null
    : sameDay && after !== 0 ? `This circuit runs golf the same day (${shortDate(w.circuitDate)}); ${shortDate(golfDate)} will be flagged.`
      : after != null && after > GOLF_WINDOW_DAYS ? `${shortDate(golfDate)} is ${after} days after the circuit (${shortDate(w.circuitDate)}); golf is due within ${GOLF_WINDOW_DAYS} days. It will be flagged.`
        : null;

  const header = (
    <div style={{ padding: '4px 22px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackLink onClick={leave}>‹ Back</BackLink>
        <div style={{ flex: 1 }} />
        <SaveState entry={tracker.entries[`${athleteId}:golf`] ?? tracker.entries[`${athleteId}:fields`] ?? null} onRetry={() => tracker.retry(`${athleteId}:golf`)} />
      </div>
      <ScreenTitle size={21} style={{ marginTop: 8 }}>Clubhead speed</ScreenTitle>
      <Body size={12} style={{ marginTop: 3 }}>{name}{w ? ` · ${KIND_LABEL[w.kind]} · circuit ${shortDate(w.circuitDate)}` : ''}</Body>
    </div>
  );

  return (
    <AssessmentFrame bare={bare} layout={layout} header={header}>
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && !data ? <ErrorNotice>The assessment didn't load. Check your connection and try again.</ErrorNotice> : null}
        {loading && !data ? <Body size={12}>Loading…</Body> : null}
        {w === false ? <Body size={13}>{name} has no open assessment window. Phil opens one when he starts a wave.</Body> : null}
        {w ? (
          <>
            <Card large>
              <SectionLabel>Clubhead speed</SectionLabel>
              <Body size={13} style={{ marginTop: 8 }}>{CLUBHEAD_CUE}</Body>
              <Body size={11} tone={color.textTertiary} style={{ marginTop: 8 }}>{counts.clubheadWarmup ?? 3} warm-up swings, then {n} maximal.</Body>
            </Card>
            <Card large>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <FieldRow label="Swing date">
                  <input type="date" aria-label="Swing date" value={golfDate} max={today}
                    onChange={(e) => {
                      const problem = swingDateProblem(e.target.value, today);
                      setDateError(problem);
                      if (!problem) saveDate(e.target.value);
                    }}
                    style={{ height: 44, background: color.track, border: `1px solid ${dateError ? color.error : color.border}`, borderRadius: radius.input, color: color.text, font: `500 16px ${font.body}`, padding: '0 10px' }} />
                </FieldRow>
                {dateError ? <Body size={12} tone={color.error}>{dateError}</Body> : null}
                {warning ? <Body size={12} tone={color.secondary}>{warning}</Body> : null}
                <FieldRow label="Maximal swings (mph)">
                  {Array.from({ length: n }, (_, i) => (
                    <TrialInput key={i} label={`Swing ${i + 1} (mph)`} value={golf.speeds?.[i] ?? null} rangeKey="clubhead" width={78}
                      onCommit={(v) => saveGolf({ speeds: setAt(golf.speeds, i, v, n) })} />
                  ))}
                </FieldRow>
                <FieldRow label="Driver">
                  <TextEntry label="Driver" value={golf.driver} max={40} onCommit={(driver) => saveGolf({ driver })} />
                </FieldRow>
                {scores.best != null ? (
                  <Body size={12}>Best {scores.best} mph{scores.top3Mean != null ? ` · top 3 ${scores.top3Mean} mph` : ''}</Body>
                ) : null}
              </div>
            </Card>
            <Card large>
              <SectionLabel>Parallax</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                <FieldRow label="Composite">
                  <TrialInput label="Parallax composite" value={golf.parallaxComposite} rangeKey="parallax" width={78} onCommit={(parallaxComposite) => saveGolf({ parallaxComposite })} />
                </FieldRow>
                <FieldRow label="Frame rate (fps)">
                  <TrialInput label="Frame rate (fps)" value={golf.fps} rangeKey="fps" width={78} onCommit={(fps) => saveGolf({ fps })} />
                </FieldRow>
                {scores.fpsDirectional ? <Body size={12} tone={color.secondary}>Under 120 fps: timing gaps are directional only.</Body> : null}
              </div>
            </Card>
          </>
        ) : null}
      </div>
      {leaving ? (
        <CancelSheet
          title="Leave this entry?"
          summary="Something typed here has not reached the server yet. If you leave now, it may be lost."
          confirmLabel="Leave anyway"
          busyLabel="Leaving"
          keepLabel="Stay"
          onClose={() => setLeaving(false)}
          onConfirm={async () => {}}
          onCancelled={onBack}
        />
      ) : null}
    </AssessmentFrame>
  );
}
