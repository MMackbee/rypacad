import React, { useState } from 'react';
import { color, font } from '../tokens';
import { useAssignPackages } from '../hooks';
import Button from './Button';
import { SelectField } from './Field';
import NumericField from './NumericField';
import SavedToast from './SavedToast';
import { Body, Card, SectionLabel } from './Primitives';
import { ALL_PACKAGES } from '../data/packages';

/**
 * AthleteDetail's staff-side Membership card (Sprint 12 pin, TEAM.md
 * "Sprint 12 pins — the token model", contract v2.0). Rewritten from the
 * Sprint 11 two-select (golf + fitness) editor: ONE package select spanning
 * the whole catalogue (t-6 … t-20, elite, single — `ALL_PACKAGES` from
 * data/packages.js, names + price with "pending" when the catalogue flags
 * it), plus a period-anchor-day control (1-28) that calls
 * useHouseholdSettings().setPeriodAnchorDay. Save -> useAssignPackages().
 * assign(athleteId, { packageId }) — one field now, not two.
 *
 * ops/owner get the editor; coach/mental see the identical facts read-only;
 * parent/athlete see nothing here (their own view is screens/Membership.js).
 *
 * INTEGRATION: useHouseholdSettings() is a genuinely NEW hook (TEAM.md's
 * Sprint 12 hook seam) that does not exist anywhere in this worktree's
 * hooks/index.js yet (confirmed by grep) — CRA's webpack build hard-fails on
 * a statically-known import of a missing export (the Sprint 11 lesson,
 * TEAM.md integration notes), so it is NOT imported here. The anchor-day
 * control below is driven by a local harness fixture instead (`anchorDay`
 * state seeded from `initialAnchorDay`, save is a local no-op that resolves
 * after a beat) — see the `// INTEGRATION:` comment at its call site. Routing
 * wires the real hook at merge.
 */

const PACKAGE_SELECT_OPTIONS = ALL_PACKAGES.map((p) => ({
  value: p.id,
  label: `${p.name} — $${p.price}${p.pending ? ' (pending)' : ''}`,
}));

export default function AthleteMembershipCard({ athleteId, athlete, role, initialAnchorDay = 1 }) {
  const canEdit = role === 'ops' || role === 'owner';
  const canView = canEdit || role === 'coach' || role === 'mental';
  if (!canView) return null;

  const currentPackageId = athlete?.packageId ?? null;

  if (!canEdit) {
    const packageName = ALL_PACKAGES.find((p) => p.id === currentPackageId)?.name ?? '—';
    return (
      <Card large>
        <SectionLabel style={{ marginBottom: 12 }}>Membership</SectionLabel>
        <ReadOnlyRow label="Package" value={packageName} />
      </Card>
    );
  }

  return (
    <MembershipEditor athleteId={athleteId} currentPackageId={currentPackageId} initialAnchorDay={initialAnchorDay} />
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

function MembershipEditor({ athleteId, currentPackageId, initialAnchorDay }) {
  const [packageId, setPackageId] = useState(currentPackageId ?? '');
  // The athlete record loads after mount, so the select follows the loaded
  // value once it arrives - and after a save, when the bump refetches it (a
  // no-op then, since it already matches what was just chosen).
  React.useEffect(() => {
    setPackageId(currentPackageId ?? '');
  }, [currentPackageId]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const savedTimer = React.useRef(null);
  React.useEffect(() => () => savedTimer.current && clearTimeout(savedTimer.current), []);

  const assignState = useAssignPackages();
  const dirty = packageId !== (currentPackageId ?? '');

  const handleSave = async () => {
    if (!packageId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await assignState.assign(athleteId, { packageId });
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

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>Membership</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SelectField label="Package" value={packageId} options={PACKAGE_SELECT_OPTIONS} onChange={setPackageId} />
      </div>

      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 12 }}>
          {error}
        </Body>
      ) : null}

      {saved ? <SavedToast message="Membership saved" style={{ marginTop: 13 }} /> : null}

      <Button
        height={46}
        disabled={!packageId || !dirty}
        loading={saving}
        onClick={handleSave}
        style={{ marginTop: 13 }}
      >
        {saving ? 'Saving' : 'Save membership'}
      </Button>

      <div style={{ height: 1, background: color.rule, margin: '16px 0' }} />

      <PeriodAnchorEditor initialAnchorDay={initialAnchorDay} />
    </Card>
  );
}

/**
 * Period anchor day (1-28) — the household's token-period start (contract
 * v2.0 pin B). See this file's header INTEGRATION note: useHouseholdSettings
 * does not exist in this worktree's hooks yet, so this control runs on a
 * local fixture rather than a real write.
 */
function PeriodAnchorEditor({ initialAnchorDay }) {
  const [anchorDay, setAnchorDay] = useState(initialAnchorDay);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = anchorDay !== initialAnchorDay;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    // INTEGRATION: wire useHouseholdSettings().setPeriodAnchorDay(anchorDay)
    // here once routing lands the hook — this resolve() stands in for it so
    // the control is reviewable (Save/Saved cycle, dirty gating) without a
    // real write.
    await new Promise((resolve) => setTimeout(resolve, 500));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2600);
  };

  return (
    <div>
      <SectionLabel style={{ marginBottom: 10 }}>Period anchor</SectionLabel>
      <Body size={11} tone={color.textTertiary} style={{ marginBottom: 10 }}>
        Day of the month the household's token period starts and tokens expire (1-28).
      </Body>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <NumericField
            label="Anchor day"
            value={anchorDay}
            unit="1-28"
            onChange={(v) => setAnchorDay(Math.min(28, Math.max(1, Number(v) || 1)))}
          />
        </div>
        <Button height={44} disabled={!dirty} loading={saving} onClick={handleSave} style={{ flex: 'none', width: 120 }}>
          {saving ? 'Saving' : 'Save'}
        </Button>
      </div>
      {saved ? <SavedToast message="Anchor day saved" style={{ marginTop: 11 }} /> : null}
    </div>
  );
}
