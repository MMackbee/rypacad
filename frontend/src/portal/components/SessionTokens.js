import React from 'react';
import { color, font } from '../tokens';
import { Body, Card, SectionLabel } from './Primitives';
import { availableCount, heldLine, SINGLE_EXPIRES_LABEL, singleTokenLine } from '../data/singleToken';

/**
 * The single session token's meters (owner rulings 2026-09-29/30). A single
 * athlete's tokens are bought one at a time - each paid checkout is one
 * graceTokens doc `single_{cs}`, good through Sat, Feb 27 - so there is no
 * period grant, no reset and no "of N" to show: every monthly meter would
 * read "0 of 0 left" for a family that paid. These count what can be booked
 * right now (availableCount: usable grace tokens plus any ops-comp tokens
 * left, less the tokens a waitlist spot holds) and say how long it lasts.
 *
 * AllowancePools (banner, compact, full) and TokenMeter (the Billing hero)
 * branch here on `tokens.perPurchase`; monthly and Elite never do.
 */

function toneFor(n) {
  if (n === 0) return color.error;
  if (n === 1) return color.secondary;
  return color.primary;
}

/**
 * The count for a banner or a dashboard card. `compact` is one line for a
 * dense card ('1 session token'); the full form adds the expiry and any
 * waitlist hold ('1 session token - good through Sat, Feb 27').
 */
export function SessionTokenPools({ tokens, compact = false, style }) {
  if (!tokens) return null;
  const n = availableCount(tokens);
  const tone = toneFor(n);

  if (compact) {
    if (n === 0) {
      return <span style={{ font: `600 12px ${font.body}`, color: color.error, ...style }}>No session token</span>;
    }
    return (
      <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary, ...style }}>
        <span style={{ font: `600 12px ${font.body}`, color: tone }}>{n}</span> session token{n === 1 ? '' : 's'}
      </span>
    );
  }

  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            font: `500 11px ${font.body}`,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: color.textSecondary,
            flex: 1,
          }}
        >
          Session tokens
        </span>
        <span style={{ font: `600 12px ${font.body}`, color: tone }}>{n === 0 ? 'None left' : `${n} left`}</span>
      </div>
      <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 4 }}>{singleTokenLine(tokens)}</div>
    </div>
  );
}

/**
 * The Billing hub's hero for a single athlete (TokenMeter's perPurchase
 * branch): the number that can be booked, how long it lasts, any waitlist
 * hold - no reset line, no bonus chip, no "of N". `buySlot` is an optional
 * Buy button; `children` is the evidence toggle TokenMeter passes in.
 */
export function SessionTokenHero({ member, buySlot = null, price = null, children }) {
  const { package: pkg, tokens } = member;
  const n = availableCount(tokens);
  const held = heldLine(tokens);
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <SectionLabel style={{ flex: 1 }}>Session tokens</SectionLabel>
        <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
          {pkg?.name ?? 'Single token'}
          {price ? ` · ${price}` : ''}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
        <span style={{ font: `700 44px/1 ${font.head}`, color: toneFor(n) }}>{n}</span>
        <span style={{ font: `500 13px ${font.body}`, color: color.textSecondary }}>
          session token{n === 1 ? '' : 's'} left
        </span>
      </div>

      <Body size={11} tone={color.textTertiary} style={{ marginTop: 8 }}>
        Each token is one session, good through {SINGLE_EXPIRES_LABEL}. One-time payments - nothing bills monthly.
      </Body>
      {held ? (
        <Body size={12} tone={color.secondary} style={{ marginTop: 6 }}>
          {held}
        </Body>
      ) : null}
      {buySlot ? <div style={{ marginTop: 12 }}>{buySlot}</div> : null}
      {children}
    </Card>
  );
}
