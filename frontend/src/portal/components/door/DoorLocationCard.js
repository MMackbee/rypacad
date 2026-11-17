import React, { useState } from 'react';
import { color, font, radius } from '../../tokens';
import Button from '../Button';
import StatusBadge from '../StatusBadge';
import DoorChoice from './DoorChoice';
import { Body, Card, SectionLabel } from '../Primitives';
import { currentLocation } from '../../hooks/door';
import {
  LOCATION_FIX_MAX_M,
  LOCATION_FIX_WARN_M,
  NEEDS_LOCATION,
  OPEN_SECONDS_MAX,
  OPEN_SECONDS_MIN,
  RADIUS_OPTIONS,
  locationSet,
  phoneCheck,
} from '../../data/doorAdmin';
import { doorCopy } from '../../data/doorRules';

export const SAVE_FAILED = "Didn't save. Check your connection and try again.";
/** Asked before a reading becomes the academy's location (review 2026-11-17 spec-3). */
export const SAVE_HERE = "Save this as the academy's location? Only do this inside the academy.";

const saveMessage = (err) => (err && err.message === NEEDS_LOCATION ? NEEDS_LOCATION : SAVE_FAILED);
const tooRough = (m) => `Too rough a reading (accurate to about ${m} m). Step inside the academy and try again.`;
const accuracyLine = (m) =>
  m > LOCATION_FIX_WARN_M
    ? `This reading is accurate to about ${m} m. A closer one is better: try again away from the door and windows.`
    : `This reading is accurate to about ${m} m.`;
const checkLine = (c) =>
  `This phone is about ${c.distanceM} m from the academy (reading accurate to about ${c.accuracyM} m). ` +
  (c.ok ? 'A family standing here could unlock.' : 'A family standing here would be too far away to unlock.');

/** A save run by a card: its own error line, cleared on the next try. */
export function useDoorSave(onSave) {
  const [error, setError] = useState(null);
  const save = async (patch) => {
    setError(null);
    try {
      await onSave(patch);
      return true;
    } catch (err) {
      setError(saveMessage(err));
      return false;
    }
  };
  return [save, error, setError];
}

export function ErrorLine({ children }) {
  return children ? (
    <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
      {children}
    </Body>
  ) : null;
}

/**
 * Academy location, the reach and the door's open time, on the Facility door
 * staff screen (docs/portal/plans/2026-11-17-door-button/00-spec.md 7).
 *
 * Review 2026-11-17 (app-1, spec-3): "Use this phone's location" takes a
 * fresh reading (never a cached one), refuses one rougher than
 * LOCATION_FIX_MAX_M, and asks before saving it, so a laptop's or a car
 * park's guess never becomes the academy. "Check this phone's distance"
 * runs the family check (the reach plus up to 150 m of the reading's
 * accuracy) on this phone, so the location can be tried before Everyone is
 * on: the staff Unlock skips the location check.
 */
export default function DoorLocationCard({ config, onSave }) {
  const [save, error, setError] = useDoorSave(onSave);
  const [locating, setLocating] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fix, setFix] = useState(null);
  const [check, setCheck] = useState(null);
  const located = locationSet(config);

  /** A fresh reading for `kind` ('set' or 'check'), or null after saying why not. */
  const read = async (kind) => {
    setLocating(kind);
    setError(null);
    setFix(null);
    setCandidate(null);
    setCheck(null);
    try {
      return await currentLocation({ fresh: true });
    } catch (err) {
      setError(doorCopy('location-needed'));
      return null;
    } finally {
      setLocating(null);
    }
  };

  const useHere = async () => {
    const here = await read('set');
    if (!here) return;
    const m = Math.round(here.accuracy);
    if (m > LOCATION_FIX_MAX_M) setError(tooRough(m));
    else setCandidate({ lat: here.lat, lng: here.lng, m });
  };

  const saveHere = async () => {
    const c = candidate;
    if (!c || saving) return;
    setSaving(true);
    const ok = await save({ lat: c.lat, lng: c.lng });
    setSaving(false);
    if (ok) {
      setCandidate(null);
      setFix(c.m);
    }
  };

  const checkHere = async () => {
    const here = await read('check');
    if (here) setCheck(phoneCheck(here, config));
  };

  const secs = config.openSeconds;
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionLabel>Academy location</SectionLabel>
        <StatusBadge tone={located ? 'green' : 'neutral'}>{located ? 'Set' : 'Not set'}</StatusBadge>
      </div>
      <Button
        variant="secondary"
        height={46}
        loading={locating === 'set'}
        disabled={locating === 'check' || saving}
        onClick={useHere}
        style={{ boxShadow: 'none', font: `600 14px ${font.body}` }}
      >
        Use this phone's location
      </Button>
      <Body size={12} tone={color.textTertiary} style={{ marginTop: 6 }}>
        Stand inside the academy, then tap it.
      </Body>
      {candidate ? (
        <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.input, padding: 12, marginTop: 10 }}>
          <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{SAVE_HERE}</div>
          <Body size={12} tone={candidate.m > LOCATION_FIX_WARN_M ? color.secondary : color.textSecondary} style={{ marginTop: 4 }}>
            {accuracyLine(candidate.m)}
          </Body>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <Button height={44} loading={saving} onClick={saveHere} style={{ boxShadow: 'none', font: `600 14px ${font.body}` }}>
              Save
            </Button>
            <Button variant="outline" height={44} disabled={saving} onClick={() => setCandidate(null)} style={{ boxShadow: 'none', font: `600 14px ${font.body}` }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {fix != null ? (
        <Body size={12} tone={fix > LOCATION_FIX_WARN_M ? color.secondary : color.primary} style={{ marginTop: 6 }}>
          Set from this phone, accurate to about {fix} m.
        </Body>
      ) : null}
      {located ? (
        <>
          <Button
            variant="outline"
            height={44}
            loading={locating === 'check'}
            disabled={locating === 'set' || saving}
            onClick={checkHere}
            style={{ marginTop: 12, boxShadow: 'none', font: `600 14px ${font.body}` }}
          >
            Check this phone's distance
          </Button>
          {check ? (
            <div role="status" style={{ marginTop: 6, font: `400 12px/1.45 ${font.body}`, color: check.ok ? color.primary : color.error }}>
              {checkLine(check)}
            </div>
          ) : null}
        </>
      ) : null}

      <SectionLabel style={{ marginTop: 16, marginBottom: 8 }}>Reach from the academy</SectionLabel>
      <DoorChoice
        label="Reach from the academy"
        value={config.radiusM}
        options={RADIUS_OPTIONS.map((m) => ({ id: m, text: `${m} m` }))}
        onChange={(radiusM) => save({ radiusM })}
      />

      <SectionLabel style={{ marginTop: 16, marginBottom: 8 }}>Door open time</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <StepButton label="One second less" disabled={secs <= OPEN_SECONDS_MIN} onClick={() => save({ openSeconds: secs - 1 })}>
          −
        </StepButton>
        <div style={{ minWidth: 56, textAlign: 'center', font: `600 16px ${font.body}`, color: color.text }}>{secs} s</div>
        <StepButton label="One second more" disabled={secs >= OPEN_SECONDS_MAX} onClick={() => save({ openSeconds: secs + 1 })}>
          +
        </StepButton>
      </div>
      <Body size={12} tone={color.textTertiary} style={{ marginTop: 6 }}>
        Match the door's own unlock time; the app counts it down after an unlock.
      </Body>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}

function StepButton({ label, disabled, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        flex: 'none',
        borderRadius: radius.input,
        border: `1px solid ${color.border}`,
        background: color.track,
        font: `600 18px ${font.body}`,
        color: disabled ? color.faintText : color.text,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
