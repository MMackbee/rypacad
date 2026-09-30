import React from 'react';
import { color, font, glow, radius } from '../tokens';
import { PRICES_RELEASED } from '../data/packages';

/**
 * Package card — screens 02, 10, 15 (Sprint 12 pin, contract v2.0).
 *
 * This is the handoff's "tier card" unit under revision 3's vocabulary: what it
 * renders is now a *package* from the one token catalogue (data/packages.js's
 * TOKEN_PACKAGES/ELITE/SINGLE_TOKEN) — no golf/fitness stack, no `ratePerSession`
 * (deleted with the two-pool model; the per-token rate below is derived inline,
 * price / tokens, only for the packages that actually sell tokens). Prices
 * render with "pending" beside them when the catalogue flags `pending: true`
 * (contract §1) — never hardcoded, never silently dropped.
 *
 * v2.0.1 (owner, 2026-09-17): prices are NOT released to parents. `showPrices`
 * defaults to the catalogue's PRICES_RELEASED flag, so Registration's package
 * step (the one live, parent-facing caller) shows what a package includes and
 * no dollar figure or per-token rate until the owner releases pricing.
 */
export default function PackageCard({
  pkg,
  selected = false,
  emphasised = false,
  onSelect,
  rows = [],
  footnote,
  // The single token is a one-time $65 purchase, not a period package.
  cadence = pkg.kind === 'single' ? 'one-time' : '/ period',
  showPrices = PRICES_RELEASED,
  style,
}) {
  const outlined = selected || emphasised;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-disabled={onSelect ? undefined : true}
      aria-label={pkg.name}
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
            {entitlementLine(pkg, showPrices)}
          </div>
        </div>

        {showPrices ? (
        <div style={{ textAlign: 'right', flex: 'none' }}>
          <div style={{ font: `700 19px ${font.head}`, color: color.text }}>${pkg.price}</div>
          <div
            style={{
              font: `400 10px ${font.body}`,
              color: pkg.pending ? color.secondary : color.textTertiary,
              marginTop: 2,
            }}
          >
            {cadence}
            {pkg.pending ? ' · pending' : ''}
          </div>
        </div>
        ) : null}
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

/**
 * Elite: unlimited + the differentiators, no token count (pin L). A token
 * package: count + the per-token rate, derived here (price / tokens) rather
 * than stored — the contract's own §1 table is exactly this division.
 * The single token: one session, good through the season's last day
 * (SEASON_BOUNDS.end, Sat 2027-02-27) - bought once, never per period.
 */
function entitlementLine(pkg, showPrices) {
  if (pkg.kind === 'elite') return `Unlimited · 24/7 access · books ${pkg.windowDays} days out`;
  if (pkg.kind === 'single') return '1 session · good through Sat, Feb 27';
  if (pkg.tokens == null) return null;
  if (pkg.tokens === 1) return `1 token · books ${pkg.windowDays} days out`;
  // The per-token rate is a price: withheld with the rest (v2.0.1).
  if (!showPrices) return `${pkg.tokens} tokens a period · books ${pkg.windowDays} days out`;
  const rate = pkg.price / pkg.tokens;
  return `${pkg.tokens} tokens a period · $${rate.toFixed(2)} a token`;
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
