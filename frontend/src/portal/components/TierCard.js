import React from 'react';
import { color, font, glow, radius } from '../tokens';

/**
 * Tier card — screens 02, 10, 15.
 *
 * Renders entirely from data. No hardcoded tier name, count, price, or
 * inclusion text; the layout survives 1..n tiers, and exactly one tier carries
 * `unlimited`.
 *
 * Flag 06 (handoff "Open Decisions"): names, count, prices *and* inclusions are
 * all open. No plausible dollar figure may appear anywhere, so the price slot is
 * a dashed placeholder and the comparison axis is the inclusion list instead.
 * The unlimited outline is the only decided differentiator.
 *
 * @param {{name: string, season: string, rows: string[], foot?: string|null,
 *          unlimited: boolean}} tier
 */
export default function TierCard({ tier, selected = false, onSelect }) {
  const emphasised = tier.unlimited;

  return (
    <div
      onClick={onSelect}
      style={{
        background: color.surface,
        border: `1px solid ${emphasised || selected ? color.primary : color.border}`,
        boxShadow: emphasised ? glow.tierCard : 'none',
        borderRadius: radius.cardLarge,
        padding: 17,
        cursor: onSelect ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `700 17px ${font.head}`, color: color.text }}>{tier.name}</div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
            {tier.season}
          </div>
        </div>
        <PriceSlot />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
        {tier.rows.map((row) => (
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

      {tier.foot ? (
        <div
          style={{
            borderTop: `1px solid ${color.ruleFaint}`,
            marginTop: 13,
            paddingTop: 11,
            font: `400 11px/1.5 ${font.body}`,
            color: color.textTertiary,
          }}
        >
          {tier.foot}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The price slot stays visible but empty. The handoff's exclusion list ends with
 * "Any specific dollar figure, anywhere" — showing the shape without a number
 * keeps the layout honest about what has not been decided.
 */
function PriceSlot() {
  return (
    <div
      style={{
        border: `1px dashed ${color.secondary}`,
        borderRadius: radius.pill,
        padding: '5px 9px',
        textAlign: 'center',
        flex: 'none',
        font: `600 9px/1.35 ${font.mono}`,
        color: color.secondary,
      }}
    >
      <div>$ ——</div>
      <div>/ mo</div>
    </div>
  );
}
