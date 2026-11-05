import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import AssessmentFrame, { useLayoutClass } from '../components/AssessmentFrame';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import StatusBadge from '../components/StatusBadge';
import { Tick, BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import StartWaveSheet from '../components/assessments/StartWaveSheet';
import { useAssessmentRoster, useAssessmentSettings } from '../hooks/assessments';
import { assessmentAccess } from '../data/assessmentAccess';
import { CONSENT_LABEL, shortDate, waveBlock } from '../data/assessmentWindows';
import { withDefaults } from '../data/assessmentSettings';
import { academyDateISO } from '../data/calendar';

const CONSENT_TONE = { yes: 'green', no: 'muted', unanswered: 'yellow' };
/** Shown under an athlete whose family has not answered the research question. */
export const UNANSWERED_NOTE = "Tests before a family's yes stay out of research";
const COLUMNS = '44px 2fr 1.4fr 1.6fr 1fr';

/**
 * Assessments - the list (spec 5). Every academy athlete with their research
 * consent (yes / no / not answered), what is due ("Baseline due",
 * "Mid-season eligible", "End of season", in progress and since when, or
 * "Open since Nov 3: mark it complete" past the 14-day entry window) and the
 * last test.
 * Staff pick up to the wave size (four) and start a wave; an athlete who is
 * not due cannot be added. One whose family has not answered the research
 * question can (owner 2026-11-05), with a line saying the results stay out
 * of research. Phone: one column; tablet and desktop: a table.
 */
export default function AssessmentList({ bare = false, viewer, onOpenWave, onOpenAthlete, onOpenSettings, onBack }) {
  const layout = useLayoutClass();
  const staff = assessmentAccess(viewer) === 'staff';
  const today = academyDateISO();
  const { data, loading, error } = useAssessmentRoster({ today });
  const settings = useAssessmentSettings().data?.settings ?? withDefaults(null);
  const waveSize = settings.waveSize;
  const [selected, setSelected] = useState([]);
  const [sheet, setSheet] = useState(false);
  const rows = data?.rows ?? [];
  const chosen = selected.map((id) => rows.find((r) => r.athleteId === id)).filter(Boolean);
  const isDue = (r) => r.due.kind != null;
  const toggle = (row) => setSelected((s) => (s.includes(row.athleteId) ? s.filter((id) => id !== row.athleteId) : s.length >= waveSize ? s : [...s, row.athleteId]));
  const onTabs = viewer?.role === 'coach' || viewer?.role === 'mental';

  return (
    <AssessmentFrame
      bare={bare}
      layout={layout}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: onBack ? 8 : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ScreenTitle size={24}>Assessments</ScreenTitle>
              <Body size={12} style={{ marginTop: 4 }}>Protocol {settings.protocolVersion} · waves of {waveSize}</Body>
            </div>
            {staff && onOpenSettings ? (
              <Button variant="outline" height={40} style={{ width: 'auto', boxShadow: 'none' }} onClick={onOpenSettings}>Settings</Button>
            ) : null}
          </div>
        </div>
      }
      footer={
        <>
          {staff ? (
            <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '12px 22px' }}>
              <Button height={52} disabled={chosen.length === 0} onClick={() => setSheet(true)}>Start wave · {chosen.length} of {waveSize}</Button>
            </div>
          ) : null}
          {onTabs ? <BottomTabBar role={viewer.role} specialistId={viewer.specialistId ?? undefined} assessments={staff} active="assessments" /> : null}
        </>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error ? <ErrorNotice>The athlete list didn't load. Check your connection and try again.</ErrorNotice> : null}
        {loading ? <Body size={12}>Loading athletes…</Body> : null}
        {[['Due now', rows.filter(isDue)], ['Not due yet', rows.filter((r) => !isDue(r))]].map(([title, group]) =>
          group.length ? (
            <Card key={title} large>
              <SectionLabel style={{ marginBottom: 6 }}>{title} · {group.length}</SectionLabel>
              {layout !== 'phone' ? <TableHead /> : null}
              {group.map((row) => (
                <Row key={row.athleteId} row={row} layout={layout} staff={staff} selected={selected.includes(row.athleteId)}
                  full={selected.length >= waveSize} onToggle={toggle} onOpen={() => onOpenAthlete(row.athleteId, row.name)} />
              ))}
            </Card>
          ) : null
        )}
      </div>
      {sheet ? (
        <StartWaveSheet
          rows={chosen}
          settings={settings}
          today={today}
          onClose={() => setSheet(false)}
          onStarted={(result) => {
            setSheet(false);
            setSelected([]);
            if (result.started.length) onOpenWave(result.waveId);
          }}
        />
      ) : null}
    </AssessmentFrame>
  );
}

function TableHead() {
  const head = { font: `600 10px ${font.body}`, letterSpacing: '.1em', textTransform: 'uppercase', color: color.textTertiary };
  return (
    <div role="row" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 10, padding: '6px 0', borderBottom: `1px solid ${color.rule}` }}>
      <span />
      {['Athlete', 'Research', 'Due', 'Last test'].map((h) => <span key={h} role="columnheader" style={head}>{h}</span>)}
    </div>
  );
}

function Row({ row, layout, staff, selected, full, onToggle, onOpen }) {
  const block = waveBlock(row);
  const disabled = Boolean(block) || (!selected && full);
  const last = row.due.lastTestDate ? `Last test ${shortDate(row.due.lastTestDate)}` : 'Never tested';
  const since = row.due.inProgress && !row.due.stale ? row.windows.find((w) => w.id === row.due.windowId)?.circuitDate ?? null : null;
  const name = (
    <button type="button" onClick={onOpen} style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', font: `600 14px ${font.body}`, color: color.text, cursor: 'pointer' }}>
      {row.name}
    </button>
  );
  const consent = <StatusBadge tone={CONSENT_TONE[row.consent]}>{CONSENT_LABEL[row.consent]}</StatusBadge>;
  const dueText = <span style={{ font: `500 12px ${font.body}`, color: row.due.kind ? color.secondary : color.textTertiary }}>{row.due.label}{since ? ` · since ${shortDate(since)}` : ''}</span>;
  const lastText = <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>{last}</span>;
  const noteId = row.consent === 'unanswered' ? `research-note-${row.athleteId}` : null;
  const select = staff ? <SelectBox checked={selected} disabled={disabled} label={`Select ${row.name}`} describedBy={noteId} onClick={() => onToggle(row)} /> : <span />;
  const note = noteId ? <Body size={11} tone={color.secondary}><span id={noteId}>{UNANSWERED_NOTE}</span></Body> : null;
  if (layout === 'phone') {
    return (
      <div style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: `1px solid ${color.rowRule}` }}>
        {select}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {name}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{consent}{dueText}{lastText}</div>
          {note}
        </div>
      </div>
    );
  }
  return (
    <div role="row" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${color.rowRule}` }}>
      {select}
      <div>{name}{note}</div>
      <div>{consent}</div>
      {dueText}
      {lastText}
    </div>
  );
}

function SelectBox({ checked, disabled, label, describedBy = null, onClick }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy || undefined}
      disabled={disabled}
      onClick={onClick}
      style={{ width: 44, height: 44, flex: 'none', border: 'none', background: 'transparent', padding: 0, display: 'grid', placeItems: 'center', cursor: disabled ? 'default' : 'pointer', opacity: disabled && !checked ? 0.35 : 1 }}
    >
      <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: radius.badge, display: 'grid', placeItems: 'center', background: checked ? color.primary : 'transparent', border: checked ? 'none' : `1.5px solid ${color.faintText}` }}>
        {checked ? <Tick size={11} /> : null}
      </span>
    </button>
  );
}
