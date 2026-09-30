import React, { useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from './Button';
import PackageCard from './PackageCard';
import { Body, ScreenTitle } from './Primitives';
import { useChangePackage } from '../hooks/packageChange';
import { CHANGEABLE_PACKAGES, canChangePackage, changePackageError } from '../data/packageChange';
import { packageById } from '../data/packages';

/**
 * Change the package before the first payment (tester S4, 2026-09-30: a
 * family that picked Elite by mistake could only pay for it). The link sits
 * on a pending card's athlete row (PendingBanner's renderRowExtra) on the
 * family page and on an athlete's own home; the sheet lists the monthly
 * packages (never the one-time single token) and saves athletes.packageId.
 * The next Pay now checks out whatever is saved. Same overlay idiom as
 * CancelSheet: tapping the scrim closes it, and a failed save keeps the
 * sheet open with the reason.
 */

/**
 * The row's package line: what Pay now charges for, and the way to change it.
 * Never-paid athletes only. The accessible name carries the athlete's name, so
 * a family with several unpaid children does not hear N identical "Change
 * package" buttons; it starts with the visible text (WCAG 2.5.3 label in name).
 */
export function ChangePackageLink({ athlete, onOpen }) {
  if (!athlete || !canChangePackage(athlete.status)) return null;
  const name = packageById(athlete.packageId)?.name ?? null;
  return (
    <div style={{ marginTop: 3, font: `400 11px ${font.body}`, color: color.textTertiary }}>
      {name ? `${name} · ` : null}
      <button
        type="button"
        aria-label={athlete.name ? `Change package for ${athlete.name}` : undefined}
        onClick={() => onOpen(athlete)}
        style={{ background: 'none', border: 'none', padding: 0, font: `500 11px ${font.body}`, color: color.primary, cursor: 'pointer' }}
      >
        Change package
      </button>
    </div>
  );
}

/**
 * @param {{athleteId: string, name: string, packageId: ?string}|null} athlete
 *   The pending row being changed; null renders nothing.
 * @param {boolean} [self]  The athlete's own login ("your package").
 * @param {() => void} onClose  Fires after a save and from Keep / the scrim.
 */
export default function ChangePackageSheet({ athlete, self = false, onClose }) {
  if (!athlete) return null;
  return <Sheet key={athlete.athleteId} athlete={athlete} self={self} onClose={onClose} />;
}

function Sheet({ athlete, self, onClose }) {
  const { change } = useChangePackage();
  const current = athlete.packageId ?? null;
  const [picked, setPicked] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const currentName = packageById(current)?.name ?? null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await change(athlete.athleteId, picked);
      onClose();
    } catch (err) {
      setSaving(false);
      setError(changePackageError(err));
    }
  };

  return (
    <div
      onClick={saving ? undefined : onClose}
      style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '85%',
          overflowY: 'auto',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>{self ? 'Change your package' : `Change ${athlete.name}'s package`}</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>
          Nothing has been charged yet. Pay now checks out the package you pick here.
        </Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
          {CHANGEABLE_PACKAGES.map((p) => (
            <PackageCard key={p.id} pkg={p} selected={picked === p.id} onSelect={() => { if (!saving) setPicked(p.id); }} />
          ))}
        </div>
        {error ? (
          <Body size={12} tone={color.error} style={{ marginTop: 12 }}>
            {error}
          </Body>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <Button height={50} loading={saving} disabled={!picked || picked === current} onClick={save}>
            {saving ? 'Saving' : 'Save package'}
          </Button>
          <Button variant="outline" height={50} disabled={saving} style={{ boxShadow: 'none' }} onClick={onClose}>
            {currentName ? `Keep ${currentName}` : 'Not now'}
          </Button>
        </div>
      </div>
    </div>
  );
}
