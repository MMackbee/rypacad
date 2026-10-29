import React, { useState } from 'react';
import { color, font, radius } from '../../tokens';
import Button from '../Button';
import SaveState from './SaveState';
import NotTestedSheet from './NotTestedSheet';
import { LETTERS } from './StartWaveSheet';
import { Body, Card, SectionLabel } from '../Primitives';
import { NOT_TESTED_REASONS, STATIONS } from '../../data/assessmentSettings';
import { mcgillEntered } from '../../data/assessmentResults';

const REASON_LABEL = Object.fromEntries(NOT_TESTED_REASONS);
const RANK = { error: 3, slow: 2, saving: 1, saved: 0 };
// Saves other than a station's own sections that belong to it: intake asks sex (the profile) and low back pain now
// (the McGill section), McGill dates its block.
const OWN_EXTRA = { intake: ['profile', 'mcgill'], mcgill: ['fields'] };

/**
 * The earlier station, in the fixed order, where this athlete was stopped
 * for pain, or null. Intake is the readiness check's own case (below).
 */
export function painStopBefore(w, stationId) {
  const at = STATIONS.findIndex((s) => s.id === stationId);
  return STATIONS.slice(0, Math.max(0, at)).find((s) => s.id !== 'intake' && s.notTestedKeys.some((k) => w.notTested?.[k] === 'pain')) ?? null;
}

/**
 * One station of the wave (spec 5): its standard cue, the athletes in
 * rotation order, and per athlete a "not tested" control with the
 * protocol's reason codes and a pain stop ("Stop any test immediately if
 * the athlete reports pain"). Phone (< 700 px) shows one athlete at a time
 * with a switcher; tablet two columns; desktop all four side by side. An
 * athlete not tested at readiness - the readiness answer, or intake's not
 * tested and pain-stop controls (notTested.readiness) - skips every later
 * station, and a pain stop at any station ends that athlete's later stations
 * (protocol Section 2: do not test an athlete who reports current pain;
 * Phil confirms, Task 27 Step 1). "Undo not tested" at the station where it
 * was recorded opens the later ones again.
 */
export default function StationShell({ station, athletes, layout, order, entries, onRetry, onNotTested, renderAthlete }) {
  const [current, setCurrent] = useState(0);
  const [askFor, setAskFor] = useState(null);
  const index = Math.min(current, Math.max(0, athletes.length - 1));
  const shown = layout === 'phone' ? athletes.slice(index, index + 1) : athletes;
  const columns = layout === 'desktop' ? Math.max(1, athletes.length) : layout === 'tablet' ? Math.min(2, Math.max(1, athletes.length)) : 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card large>
        <SectionLabel>{station.label}</SectionLabel>
        <Body size={13} style={{ marginTop: 8 }}>{station.cue}</Body>
        {order ? <Body size={11} tone={color.textTertiary} style={{ marginTop: 8 }}>{order}</Body> : null}
      </Card>
      {layout === 'phone' && athletes.length > 1 ? (
        <div role="tablist" aria-label="Athletes" style={{ display: 'flex', gap: 6 }}>
          {athletes.map((a, i) => {
            const on = i === index;
            const label = `${LETTERS[a.position - 1]} · ${a.name}`;
            return (
              <button key={a.athleteId} type="button" role="tab" aria-selected={on} aria-label={`Show ${label}`} onClick={() => setCurrent(i)}
                style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, border: `1px solid ${on ? color.primary : color.controlBorder}`, background: on ? color.primary : 'transparent', color: on ? '#000' : color.textSecondary, font: `600 13px ${font.body}` }}>
                {LETTERS[a.position - 1]}
              </button>
            );
          })}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12 }}>
        {shown.map((a) => (
          <AthleteCard key={a.athleteId} athlete={a} station={station} entries={entries} onRetry={onRetry} onNotTested={onNotTested}
            onAsk={() => setAskFor(a)} renderAthlete={renderAthlete} />
        ))}
      </div>
      {askFor ? (
        <NotTestedSheet
          name={askFor.name}
          onClose={() => setAskFor(null)}
          onPick={(reason) => {
            onNotTested(askFor.athleteId, station.notTestedKeys, reason);
            setAskFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function AthleteCard({ athlete, station, entries, onRetry, onNotTested, onAsk, renderAthlete }) {
  const w = athlete.window;
  const reason = station.notTestedKeys.map((k) => w.notTested?.[k]).find(Boolean) ?? null;
  const readinessOff = w.readiness?.status === 'not-tested' || Boolean(w.notTested?.readiness);
  const atReadiness = station.id !== 'intake' && readinessOff;
  const readinessReason = (w.readiness?.status === 'not-tested' ? w.readiness.reason : null) ?? w.notTested?.readiness ?? null;
  const painAt = station.id !== 'intake' && !atReadiness ? painStopBefore(w, station.id) : null;
  // The badge is this station's saves in any state (its not-tested mark only while it shows here). The athlete's one
  // profile entry (sex at intake, then the dominant hand and the med ball) and a not-tested mark made elsewhere show
  // only while not on the server, so 'Saved' never stands for values this station has not had (review 2026-10-28).
  // The McGill section is intake's back-pain answer until a hold is timed or it is skipped (mcgillEntered).
  const extra = OWN_EXTRA[station.id] || [];
  const sections = station.id === 'mcgill' && !mcgillEntered(w.mcgill) ? station.sections.filter((s) => s !== 'mcgill') : station.sections;
  const own = [...sections, ...extra, ...(reason ? ['notTested'] : [])];
  const tracked = [...new Set([...station.sections, ...extra, 'notTested', 'profile', 'fields'])]
    .filter((s) => { const e = entries[`${athlete.athleteId}:${s}`]; return e && (own.includes(s) || e.state !== 'saved'); })
    .map((s) => `${athlete.athleteId}:${s}`);
  const worstKey = tracked.sort((x, y) => RANK[entries[y].state] - RANK[entries[x].state])[0];
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0, font: `700 15px ${font.head}`, color: color.text }}>
          {LETTERS[athlete.position - 1]} · {athlete.name}
        </div>
        <SaveState entry={worstKey ? entries[worstKey] : null} onRetry={() => onRetry(worstKey)} />
      </div>
      {reason ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Body size={13}>Not tested: {REASON_LABEL[reason]}</Body>
          {reason === 'pain' ? <Body size={12} tone={color.error}>Stopped for pain. Retest within 7 days; refer per RYP policy.</Body> : null}
          <Button variant="outline" height={40} style={{ boxShadow: 'none' }} onClick={() => onNotTested(athlete.athleteId, station.notTestedKeys, null)}>
            Undo not tested
          </Button>
        </div>
      ) : atReadiness ? (
        <Body size={13}>Not tested at readiness ({REASON_LABEL[readinessReason] ?? 'no reason given'}). Retest within 7 days.</Body>
      ) : painAt ? (
        <Body size={13} tone={color.error}>Stopped for pain at {painAt.label}. Retest within 7 days; refer per RYP policy.</Body>
      ) : (
        <>
          {renderAthlete(athlete)}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button variant="outline" height={40} aria-label={`${athlete.name}: not tested`} style={{ boxShadow: 'none' }} onClick={onAsk}>Not tested</Button>
            <Button variant="dangerOutline" height={40} aria-label={`${athlete.name}: pain, stop`} style={{ boxShadow: 'none' }}
              onClick={() => onNotTested(athlete.athleteId, station.notTestedKeys, 'pain')}>
              Pain - stop
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
