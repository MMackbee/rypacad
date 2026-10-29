import React, { useState } from 'react';
import { EMPTY_EQUIPMENT } from './EquipmentCard';
import { DEFAULT_SETTINGS, circuitModeOf } from '../../data/assessmentSettings';

/**
 * Test support for the station views (never imported by the app): holds one
 * athlete's window and profile the way AssessmentWave does, and records
 * every save as [section | 'profile' | 'fields', value].
 */
export const MODE = circuitModeOf(DEFAULT_SETTINGS);

export function stationAthlete({ athleteId = 'a', name = 'Ava Moreno', position = 1, kind = 'baseline', window = {}, profile = null, prior = [] } = {}) {
  return { athleteId, name, position, kind, windowId: `2026-27-${kind}`, window: { id: `2026-27-${kind}`, athleteId, kind, season: '2026-27', status: 'open', circuitDate: '2026-11-03', circuitMode: MODE, enteredBy: {}, ...window }, profile, prior };
}

export function StationHarness({ View, athlete, equipment = {}, circuitMode = MODE, saves }) {
  const [w, setW] = useState(athlete.window);
  const [p, setP] = useState(athlete.profile);
  return (
    <View
      athlete={{ ...athlete, window: w, profile: p }}
      equipment={{ ...EMPTY_EQUIPMENT, ...equipment }}
      circuitMode={circuitMode}
      onSave={(id, section, value) => { saves.push([section, value]); setW((x) => ({ ...x, [section]: value })); }}
      onSaveProfile={(id, patch) => { saves.push(['profile', patch]); setP((x) => ({ ...(x || {}), ...patch })); }}
      onSaveFields={(id, fields) => { saves.push(['fields', fields]); setW((x) => ({ ...x, ...fields })); }}
    />
  );
}
