import React, { useEffect, useRef, useState } from 'react';
import { color, font } from '../tokens';
import { setAthleteHandicap } from '../hooks';
import Button from './Button';
import Field from './Field';
import SavedToast from './SavedToast';
import { Body, Card, SectionLabel } from './Primitives';
import { HANDICAP_RANGE_ERROR, normalizeHandicap } from '../data/signup';
import { handicapOf } from '../data/reserved';

/**
 * AthleteDetail's staff-side Handicap card (owner ruling 2026-10-02). A
 * handicap-reserved block is booked on athletes.handicap (data/reserved.js),
 * and an athlete with none on file cannot book one - so ops and owner can set
 * or correct it here: a whole number 0 to 54, or blank for none, held to
 * sign-up's own check (data/signup.js normalizeHandicap). A plus handicap is
 * entered as 0. Saves through setAthleteHandicap({ athleteId, handicap }).
 *
 * ops/owner only. Everyone else sees nothing here: a parent or athlete does
 * not change a handicap after sign-up (the rules refuse it too).
 */

export default function HandicapCard({ athleteId, athlete, role }) {
  // The last record that loaded, and whose it is. The card's own save bumps
  // 'athletes', and the detail reloads through "no athlete" (useSeedResource
  // clears its data while it loads): dropping the editor for that moment
  // lost "Handicap saved" with it, so once loaded it stays up on what it had.
  const loaded = useRef(null);
  if (athlete) loaded.current = { athleteId, onFile: handicapOf(athlete) };
  if (role !== 'ops' && role !== 'owner') return null;
  // The record loads after mount: no "None" before it is known - and never
  // another athlete's value while this one's is on its way.
  if (!loaded.current || loaded.current.athleteId !== athleteId) return null;
  return <HandicapEditor key={athleteId} athleteId={athleteId} onFile={loaded.current.onFile} />;
}

const asText = (handicap) => (handicap == null ? '' : String(handicap));
// A plus handicap is on file as 0. Number('+2') is 2, so sign-up's check
// alone would file a plus-2 player as a 2: a leading plus is refused here.
const PLUS_ERROR = 'Enter a plus handicap as 0.';

function HandicapEditor({ athleteId, onFile }) {
  // `stored` is what is on file: the loaded value, then this card's own
  // save until the refetch brings the same number back.
  const [stored, setStored] = useState(onFile);
  const [value, setValue] = useState(asText(onFile));
  useEffect(() => {
    setStored(onFile);
    setValue(asText(onFile));
  }, [onFile]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // The field's own message when the entry is refused before any write.
  const [invalid, setInvalid] = useState(null);
  const [error, setError] = useState(null);
  const savedTimer = useRef(null);
  useEffect(() => () => savedTimer.current && clearTimeout(savedTimer.current), []);

  const dirty = String(value).trim() !== asText(stored);

  const handleSave = async () => {
    const plus = String(value).trim().startsWith('+');
    const handicap = plus ? undefined : normalizeHandicap(value);
    setSaved(false);
    setError(null);
    if (handicap === undefined) {
      setInvalid(plus ? PLUS_ERROR : HANDICAP_RANGE_ERROR);
      return;
    }
    setSaving(true);
    try {
      await setAthleteHandicap({ athleteId, handicap });
      setStored(handicap);
      setValue(asText(handicap));
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The handicap could not be saved. Try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>Handicap</SectionLabel>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>On file</span>
        <span style={{ font: `600 13px ${font.body}`, color: color.text }}>{stored == null ? 'None' : stored}</span>
      </div>
      {/* A text field on purpose: a number input reports a mistyped entry as
          blank, and blank here means "none" - one slip would clear the record. */}
      <Field
        label="Set handicap"
        value={value}
        placeholder="none"
        onChange={(v) => {
          setValue(v);
          setInvalid(null);
        }}
        // Sign-up's own wording for the same check (data/signup.js), or the
        // hint's own sentence for a leading plus.
        error={invalid}
        hint="0 to 54. Leave blank for none. Enter a plus handicap as 0."
      />

      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 12 }}>
          {error}
        </Body>
      ) : null}

      {saved ? <SavedToast message="Handicap saved" style={{ marginTop: 13 }} /> : null}

      <Button height={46} disabled={!dirty} loading={saving} onClick={handleSave} style={{ marginTop: 13 }}>
        {saving ? 'Saving' : 'Save handicap'}
      </Button>
    </Card>
  );
}
