import React, { useCallback, useState } from 'react';
import { color, font } from '../../tokens';
import Button from '../Button';
import TrialInput, { TextEntry } from './TrialInput';
import Choice from './Choice';
import FieldRow from './FieldRow';
import { Body, Card, SectionLabel } from '../Primitives';

/**
 * Per-wave equipment (spec 5: "entered once per wave and remembered"):
 * dynamometer ids (pair A/B on dynamometer 1, C/D on 2), handle position,
 * the sitting box, plate software and sampling rate, and the med ball
 * method. Remembered on this device (localStorage - a per-device
 * convenience; storage can be missing or full, so every access is guarded);
 * the stations copy what they use onto each athlete's section as it saves,
 * so the window keeps its own test conditions.
 */
export const EQUIPMENT_KEY = 'ryp.assessments.equipment';
export const EMPTY_EQUIPMENT = { dynamometer1: null, dynamometer2: null, handlePosition: null, boxHeight: null, plateSoftware: null, samplingHz: null, radarMethod: 'speed' };

export function readEquipment() {
  try {
    const raw = window.localStorage.getItem(EQUIPMENT_KEY);
    return { ...EMPTY_EQUIPMENT, ...(raw ? JSON.parse(raw) : {}) };
  } catch (err) {
    return { ...EMPTY_EQUIPMENT };
  }
}

export function useEquipment() {
  const [equipment, setEquipment] = useState(readEquipment);
  const update = useCallback((patch) => {
    setEquipment((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(EQUIPMENT_KEY, JSON.stringify(next));
      } catch (err) {
        /* private mode or full: kept for this page only */
      }
      return next;
    });
  }, []);
  return [equipment, update];
}

export default function EquipmentCard({ equipment, onChange }) {
  const [open, setOpen] = useState(() => !equipment.dynamometer1);
  const summary = [
    equipment.dynamometer1 || equipment.dynamometer2 ? `Dynamometers ${equipment.dynamometer1 || '-'} / ${equipment.dynamometer2 || '-'}` : null,
    equipment.handlePosition ? `handle ${equipment.handlePosition}` : null,
    equipment.boxHeight ? `box ${equipment.boxHeight} cm` : null,
    equipment.plateSoftware ? `${equipment.plateSoftware}${equipment.samplingHz ? ` ${equipment.samplingHz} Hz` : ''}` : null,
    equipment.radarMethod === 'distance' ? 'med ball by distance' : 'med ball by radar',
  ].filter(Boolean).join(' · ');
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionLabel>Equipment</SectionLabel>
          {!open ? <Body size={12} style={{ marginTop: 6 }}>{summary}</Body> : null}
        </div>
        <Button variant="outline" height={38} style={{ width: 'auto', boxShadow: 'none', font: `500 13px ${font.body}` }} onClick={() => setOpen((o) => !o)}>
          {open ? 'Done' : 'Edit equipment'}
        </Button>
      </div>
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <FieldRow label="Dynamometer 1 (A, B)"><TextEntry label="Dynamometer 1" value={equipment.dynamometer1} onCommit={(v) => onChange({ dynamometer1: v })} /></FieldRow>
          <FieldRow label="Dynamometer 2 (C, D)"><TextEntry label="Dynamometer 2" value={equipment.dynamometer2} onCommit={(v) => onChange({ dynamometer2: v })} /></FieldRow>
          <FieldRow label="Handle position"><TextEntry label="Handle position" value={equipment.handlePosition} onCommit={(v) => onChange({ handlePosition: v })} /></FieldRow>
          <FieldRow label="Sitting box height (cm)"><TrialInput label="Sitting box height" value={equipment.boxHeight} rangeKey="boxHeight" onCommit={(v) => onChange({ boxHeight: v })} /></FieldRow>
          <FieldRow label="Plate software and version"><TextEntry label="Plate software" value={equipment.plateSoftware} onCommit={(v) => onChange({ plateSoftware: v })} /></FieldRow>
          <FieldRow label="Plate sampling rate (Hz)"><TrialInput label="Plate sampling rate" value={equipment.samplingHz} rangeKey="samplingHz" onCommit={(v) => onChange({ samplingHz: v })} /></FieldRow>
          <Choice label="Med ball" value={equipment.radarMethod} options={[['speed', 'Radar speed (mph)'], ['distance', 'Throw distance (m)']]} onChange={(v) => { if (v) onChange({ radarMethod: v }); }} />
          <Body size={11} tone={color.textTertiary}>Kept on this device for the next wave.</Body>
        </div>
      ) : null}
    </Card>
  );
}
