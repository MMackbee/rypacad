import React, { useState } from 'react';
import { color, font } from '../tokens';
import { useAssignPackages } from '../hooks';
import Button from './Button';
import { SelectField } from './Field';
import SavedToast from './SavedToast';
import { Body, Card, SectionLabel } from './Primitives';
import { GOLF_PACKAGES, ELITE_TIERS, DROP_IN, FITNESS_PACKAGES } from '../data/packages';

/**
 * AthleteDetail's staff-side Membership card (Sprint 11 pin E, TEAM.md,
 * contract v1.9). Extracted out of screens/AthleteDetail.js into its own
 * component file to keep that screen under the project's file-size
 * convention — this card is self-contained (its own hook fallback, its own
 * local edit state) and AthleteDetail only needs to mount it and pass
 * `{athleteId, athlete, role}`.
 *
 * ops/owner get a golf package select (GOLF_PACKAGES + ELITE_TIERS + DROP_IN)
 * and a fitness package select (none + FITNESS_PACKAGES), Save ->
 * useAssignPackages, SavedToast on success, derived entitlements re-render
 * off the bump (the hook bumps 'athletes'; this card just renders what
 * useAthleteDetail returns next, same as everywhere else in this app).
 * coach/mental see the identical facts read-only. parent/athlete see
 * nothing here — their own view is screens/Membership.js. "No separate
 * staff route": this is the same /portal/athlete/:athleteId screen every
 * role already reaches, gated by `role` alone.
 */

const ALL_GOLF_PACKAGES = [...GOLF_PACKAGES, DROP_IN, ...ELITE_TIERS];
const ELITE_IDS = new Set(ELITE_TIERS.map((p) => p.id));

export default function AthleteMembershipCard({ athleteId, athlete, role }) {
  const canEdit = role === 'ops' || role === 'owner';
  const canView = canEdit || role === 'coach' || role === 'mental';
  if (!canView) return null;

  const currentGolfId = athlete?.packageId ?? null;
  const currentFitnessId = athlete?.fitnessPackageId ?? null;

  if (!canEdit) {
    const golfName = ALL_GOLF_PACKAGES.find((p) => p.id === currentGolfId)?.name ?? '—';
    const fitnessName = currentFitnessId
      ? FITNESS_PACKAGES.find((p) => p.id === currentFitnessId)?.name ?? '—'
      : 'None on file';
    return (
      <Card large>
        <SectionLabel style={{ marginBottom: 12 }}>Membership</SectionLabel>
        <ReadOnlyRow label="Golf package" value={golfName} />
        <ReadOnlyRow label="Fitness package" value={fitnessName} style={{ marginTop: 10 }} />
      </Card>
    );
  }

  return (
    <MembershipEditor athleteId={athleteId} currentGolfId={currentGolfId} currentFitnessId={currentFitnessId} />
  );
}

function ReadOnlyRow({ label, value, style }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, ...style }}>
      <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>{label}</span>
      <span style={{ font: `600 13px ${font.body}`, color: color.text }}>{value}</span>
    </div>
  );
}

// A distinct sentinel from SelectField's own '' (its disabled "Select"
// placeholder) — fitness genuinely has a valid "intentionally none" choice,
// which '' would collide with (two options both matching value="").
const FITNESS_NONE = 'none';
const FITNESS_SELECT_OPTIONS = [
  { value: FITNESS_NONE, label: 'None' },
  ...FITNESS_PACKAGES.map((p) => ({ value: p.id, label: p.name })),
];
const GOLF_SELECT_OPTIONS = ALL_GOLF_PACKAGES.map((p) => ({ value: p.id, label: p.name }));

function MembershipEditor({ athleteId, currentGolfId, currentFitnessId }) {
  const [golfId, setGolfId] = useState(currentGolfId ?? '');
  const [fitnessId, setFitnessId] = useState(currentFitnessId ?? FITNESS_NONE);
  // The athlete record loads after mount, so the selects follow the loaded
  // values once they arrive - and after a save, when the bump refetches
  // them (a no-op then, since they already match what was just chosen).
  React.useEffect(() => {
    setGolfId(currentGolfId ?? '');
    setFitnessId(currentFitnessId ?? FITNESS_NONE);
  }, [currentGolfId, currentFitnessId]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  // Timed, not permanent (unlike AthleteDetail's own StartContractCard's
  // one-shot toast) — ops/owner may reassign a package more than once in a
  // sitting, and replacing the whole card with a toast forever would mean a
  // remount just to edit again.
  const savedTimer = React.useRef(null);
  React.useEffect(() => () => savedTimer.current && clearTimeout(savedTimer.current), []);

  const assignState = useAssignPackages();
  const dirty = golfId !== (currentGolfId ?? '') || fitnessId !== (currentFitnessId ?? FITNESS_NONE);

  const handleSave = async () => {
    if (!golfId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await assignState.assign(athleteId, {
        packageId: golfId,
        fitnessPackageId: fitnessId === FITNESS_NONE ? null : fitnessId,
      });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The membership could not be saved. Try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * Sprint 11 amendment v1.9.1 (owner ruling, relayed mid-sprint): Elite
   * already includes 16 Phil sessions a month, so pairing it with an
   * explicit fitness package is unusual but never blocked — an explicit
   * fitness package still wins in the derivation (contract v1.9 C). This
   * hint reads the PENDING (unsaved) golf selection, not the saved athlete
   * record, so it reacts the moment ops/owner picks Elite rather than only
   * after a save.
   */
  const showEliteHint = ELITE_IDS.has(golfId);

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>Membership</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SelectField label="Golf package" value={golfId} options={GOLF_SELECT_OPTIONS} onChange={setGolfId} />
        <div>
          <SelectField
            label="Fitness package"
            value={fitnessId}
            options={FITNESS_SELECT_OPTIONS}
            onChange={setFitnessId}
          />
          {showEliteHint ? (
            <Body size={11} tone={color.secondary} style={{ marginTop: 6 }}>
              Elite already includes Phil sessions.
            </Body>
          ) : null}
        </div>
      </div>

      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 12 }}>
          {error}
        </Body>
      ) : null}

      {saved ? <SavedToast message="Membership saved" style={{ marginTop: 13 }} /> : null}

      <Button
        height={46}
        disabled={!golfId || !dirty}
        loading={saving}
        onClick={handleSave}
        style={{ marginTop: 13 }}
      >
        {saving ? 'Saving' : 'Save membership'}
      </Button>
    </Card>
  );
}
