import React from 'react';
import { color, font, glow, radius } from '../tokens';
import { ratePerSession } from '../data/packages';

/**
 * Package card — screens 02, 10, 15.
 *
 * This is the handoff's "tier card" unit under revision 3's vocabulary: what it
 * renders is now a *package*, and "tier" means specifically the Elite tiers.
 *
 * Under revision 2 prices were undecided, so this rendered a dashed `$ ——` slot
 * and the comparison axis had to be the inclusion list. Prices are confirmed, so
 * the slot is gone and the price is the headline. What has not changed: nothing
 * here is hardcoded. The layout still survives 1..n packages and a package with
 * fields still unset — see `philSessions` on Elite, which renders as absent
 * rather than as a fabricated number.
 */
export default function PackageCard({
  pkg,
  selected = false,
  emphasised = false,
  onSelect,
  rows = [],
  footnote,
  cadence = '/ mo',
  style,
}) {
  const outlined = selected || emphasised;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        background: color.surface,
        border: `1px solid ${outlined ? color.primary : color.border}`,
        boxShadow: emphasised ? glow.tierCard : 'none',
        borderRadius: radius.cardLarge,
        padding: 17,
        cursor: onSelect ? 'pointer' : 'default',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {onSelect ? <SelectDot selected={selected} /> : null}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `700 17px ${font.head}`, color: color.text }}>{pkg.name}</div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
            {entitlementLine(pkg)}
          </div>
        </div>

        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ font: `700 19px ${font.head}`, color: color.text }}>${pkg.price}</div>
          <div style={{ font: `400 10px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
            {cadence}
          </div>
        </div>
      </div>

      {rows.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
          {rows.map((row) => (
            <div key={row} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
              <span
                style={{
                  width: 4,
                  height: 4,
                  marginTop: 7,
                  flex: 'none',
                  background: color.primary,
                  borderRadius: 2,
                }}
              />
              <span style={{ font: `400 12px/1.5 ${font.body}`, color: color.textSecondary }}>
                {row}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {footnote ? (
        <div
          style={{
            borderTop: `1px solid ${color.ruleFaint}`,
            marginTop: 13,
            paddingTop: 11,
            font: `400 11px/1.5 ${font.body}`,
            color: color.textTertiary,
          }}
        >
          {footnote}
        </div>
      ) : null}
    </div>
  );
}

/** Training + tournaments, or session count for a fitness package. */
function entitlementLine(pkg) {
  if (pkg.sessions != null) return `${pkg.sessions} sessions a month`;

  const parts = [];
  if (pkg.training) parts.push(`${pkg.training} training`);
  if (pkg.tournaments) parts.push(`${pkg.tournaments} tournament${pkg.tournaments === 1 ? '' : 's'}`);
  const rate = ratePerSession(pkg);
  const rateText = rate ? ` · $${Math.round(rate)} a session` : '';
  return parts.length ? parts.join(' · ') + rateText : 'Single session';
}

function SelectDot({ selected }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 20,
        height: 20,
        marginTop: 2,
        flex: 'none',
        borderRadius: '50%',
        border: `1.5px solid ${selected ? color.primary : color.faintText}`,
        background: selected ? color.primary : 'transparent',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {selected ? (
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#000' }} />
      ) : null}
    </span>
  );
}
