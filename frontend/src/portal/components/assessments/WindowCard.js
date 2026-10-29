import React, { useState } from 'react';
import { color, font, radius } from '../../tokens';
import Button from '../Button';
import { Body, Card, ErrorNotice, SectionLabel } from '../Primitives';
import { MARKER_TEXT, TABLE_ROWS, mcgillEntered } from '../../data/assessmentResults';
import { holdLabel } from '../../data/assessmentScoring';
import { NOT_TESTED_REASONS } from '../../data/assessmentSettings';
import { shortDate } from '../../data/assessmentWindows';

const REASON_LABEL = Object.fromEntries(NOT_TESTED_REASONS);
const SECTION_LABEL = { readiness: 'readiness', anthro: 'anthropometrics', grip: 'grip', cmj: 'CMJ', hop: '10/5', medball: 'med ball', mcgill: 'McGill', golf: 'clubhead speed' };
export const MARKER_TONE = { gain: color.primary, within: color.textTertiary, drop: color.secondary };
const list = (l) => (Array.isArray(l) ? l.filter((v) => v != null).join(', ') : '') || '-';
const join = (parts) => parts.filter(Boolean).join(' · ');

/** Every trial as typed, coach-only values included (spec 5): asymmetry, contact time, McGill raw times. */
function Trials({ w }) {
  const a = w.anthro || {};
  const g = w.grip || {};
  const lines = [];
  if (w.readiness) {
    lines.push(join([`Readiness ${w.readiness.status === 'pass' ? 'pass' : 'not tested'}`,
      w.readiness.hoursSinceHardSession != null ? `${w.readiness.hoursSinceHardSession} h since a hard session` : null,
      w.readiness.golfToday != null ? `golf today ${w.readiness.golfToday ? 'yes' : 'no'}` : null]));
  }
  if (w.anthro) {
    lines.push(join([`Standing ${list(a.standing)}`, `Mass ${list(a.mass)}`,
      (a.sittingRaw || []).some((v) => v != null) ? `Seated ${list(a.sittingRaw)} on a ${a.boxHeight ?? '?'} cm box` : null,
      (a.arm || []).some((v) => v != null) ? `Arm ${list(a.arm)}` : null, (a.hand || []).some((v) => v != null) ? `Hand ${list(a.hand)}` : null]));
  }
  if (w.grip) lines.push(join([`Right ${list(g.right)}`, `Left ${list(g.left)}`, g.deviceRight ? `device ${g.deviceRight}` : null, g.handlePosition ? `handle ${g.handlePosition}` : null, 'circuit rest interval']));
  (w.cmj?.trials || []).forEach((t, i) => {
    if (t) lines.push(join([`Jump ${i + 1}: ${t.heightCm ?? '-'} cm`, t.rsiMod != null ? `RSImod ${t.rsiMod}` : null, t.timeToTakeoffMs != null ? `take-off ${t.timeToTakeoffMs} ms` : null,
      t.peakPowerW != null ? `${t.peakPowerW} W` : null, t.peakPowerWkg != null ? `${t.peakPowerWkg} W/kg` : null, t.asymmetryPct != null ? `asymmetry ${t.asymmetryPct} %` : null]));
  });
  if (w.cmj && (w.cmj.software || w.cmj.samplingHz)) lines.push(`${w.cmj.software || 'Plates'}${w.cmj.samplingHz ? ` at ${w.cmj.samplingHz} Hz` : ''}`);
  (w.hop?.sets || []).forEach((s, i) => {
    if (!s) return;
    lines.push(Array.isArray(s.hopRsi)
      ? `Set ${i + 1}: RSI ${list(s.hopRsi)} · contact ${list(s.hopGctMs)} ms`
      : `Set ${i + 1}: RSI ${s.rsiBest5 ?? '-'} · contact ${s.gctMs ?? '-'} ms`);
  });
  if (w.medball) lines.push(join([`Throws ${list(w.medball.throws)} ${w.medball.method === 'distance' ? 'm' : 'mph'}`, w.medball.massKg ? `${w.medball.massKg} kg` : null, w.medball.side ? `${w.medball.side} side` : null]));
  if (mcgillEntered(w.mcgill)) {
    lines.push(w.mcgill.skippedBackPain ? 'McGill skipped: back pain'
      : `Flexor ${holdLabel(w.mcgill.flexorSec)} · extensor ${holdLabel(w.mcgill.extensorSec)} · right side ${holdLabel(w.mcgill.sideRightSec)} · left side ${holdLabel(w.mcgill.sideLeftSec)}`);
  }
  if (w.golf) lines.push(join([`Speeds ${list(w.golf.speeds)} mph`, w.golf.driver ? `driver ${w.golf.driver}` : null, w.golf.parallaxComposite != null ? `Parallax ${w.golf.parallaxComposite}${w.golf.fps ? ` at ${w.golf.fps} fps` : ''}` : null]));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
      {lines.map((l, i) => <Body key={i} size={12}>{l}</Body>)}
    </div>
  );
}

/**
 * One window on the results screen (spec 5): kind and date, protocol,
 * weeks of exposure and research, the maturity offset or why it is
 * missing, each score with its change marker, the flags, what was not
 * tested, and every trial on request. An open window says since when and
 * what it still lacks (clubhead speed, McGill) with the due date. Staff mark
 * it complete (or reopen it) and run a McGill block the window is missing;
 * completing one that still lacks something asks first, because golf
 * coaches can only enter on an open window.
 */
export default function WindowCard({ result: r, status, staff, busy, failed, onStatus, onRunMcgill }) {
  const [showTrials, setShowTrials] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const missing = status === 'open' ? r.missing ?? [] : [];
  const toggleStatus = () => {
    if (status !== 'open') onStatus('open');
    else if (missing.length) setConfirming(true);
    else onStatus('complete');
  };
  const title = `${r.kindLabel} · ${shortDate(r.circuitDate)}`;
  const notTested = Object.entries(r.notTested).map(([k, v]) => `${SECTION_LABEL[k] ?? k} (${REASON_LABEL[v] ?? v})`);
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, font: `700 16px ${font.head}`, color: color.text }}>{title}</div>
        <span style={{ padding: '3px 10px', borderRadius: radius.pill, border: `1px solid ${color.controlBorder}`, font: `600 11px ${font.body}`, color: status === 'open' ? color.secondary : color.textSecondary }}>
          {status === 'open' ? 'Open' : 'Complete'}
        </span>
      </div>
      <Body size={12} style={{ marginTop: 4 }}>
        {join([`Protocol ${r.protocolVersion ?? '?'}`, r.weeksOfExposure != null ? `${r.weeksOfExposure} weeks of exposure` : null, r.inResearch ? 'in research' : 'not in research'])}
      </Body>
      {status === 'open' && r.openDays != null && r.openDays >= 0 ? (
        <Body size={12} style={{ marginTop: 4 }}>Open since {shortDate(r.circuitDate)} ({r.openDays} {r.openDays === 1 ? 'day' : 'days'})</Body>
      ) : null}
      {missing.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
          {missing.map((m) => <Body key={m} size={12} tone={color.secondary}>{m}</Body>)}
        </div>
      ) : null}
      <Body size={13} style={{ marginTop: 10 }}>
        {r.maturity.offset != null
          ? `Maturity offset ${r.maturity.offset} · ${r.maturity.label}${r.maturity.note ? ` (${r.maturity.note})` : ''}`
          : r.maturity.missing}
      </Body>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
        {TABLE_ROWS.filter((row) => row.value(r) != null && row.label !== 'Maturity offset (years)' && row.label !== 'Maturity').map((row) => {
          const marker = row.marker && r.markers ? r.markers[row.marker] : null;
          return (
            <div key={row.label} style={{ display: 'flex', gap: 10, font: `400 13px ${font.body}`, color: color.textSecondary }}>
              <span style={{ flex: 1 }}>{row.label}</span>
              <span style={{ color: color.text }}>{row.value(r)}</span>
              {marker ? <span style={{ color: MARKER_TONE[marker] }}>{MARKER_TEXT[marker]}</span> : null}
            </div>
          );
        })}
      </div>
      {r.flags.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          <SectionLabel>Flags</SectionLabel>
          {r.flags.map((f) => <Body key={f.code + f.text} size={12} tone={color.secondary}>{f.text}</Body>)}
        </div>
      ) : null}
      {notTested.length ? <Body size={12} style={{ marginTop: 8 }}>Not tested: {notTested.join(', ')}</Body> : null}
      {showTrials ? <Trials w={r.window} /> : null}
      {failed ? <ErrorNotice title="Not saved" style={{ marginTop: 10 }}>The window was not marked {status === 'open' ? 'complete' : 'open'}. Check the connection and try again.</ErrorNotice> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <Button variant="outline" height={40} aria-label={`${showTrials ? 'Hide' : 'Show'} every trial: ${r.kindLabel}, ${shortDate(r.circuitDate)}`} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={() => setShowTrials((v) => !v)}>
          {showTrials ? 'Hide trials' : 'Every trial'}
        </Button>
        {staff && r.mcgillDue && onRunMcgill ? (
          <Button variant="outline" height={40} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={onRunMcgill}>Run McGill block</Button>
        ) : null}
        {staff ? (
          <Button variant={status === 'open' ? 'secondary' : 'outline'} height={40} loading={busy} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }}
            onClick={toggleStatus}>
            {status === 'open' ? 'Mark window complete' : 'Reopen window'}
          </Button>
        ) : null}
      </div>
      {confirming && status === 'open' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <Body size={12}>
            Complete this window with {missing.length === 1 ? 'this' : 'these'} still missing? Golf coaches can only enter clubhead speed and Parallax on an open window.
          </Body>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" height={40} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={() => { setConfirming(false); onStatus('complete'); }}>
              Complete anyway
            </Button>
            <Button variant="outline" height={40} style={{ width: 'auto', padding: '0 16px', boxShadow: 'none' }} onClick={() => setConfirming(false)}>Keep open</Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
