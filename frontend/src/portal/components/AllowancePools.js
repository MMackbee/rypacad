import React from 'react';
import { color, font, radius } from '../tokens';
import { longDayLabel } from '../data/calendar';
import { tokenDayLabel } from '../data/singleToken';
import { SessionTokenPools } from './SessionTokens';

/**
 * The token meter — screens 03, 04, 05, 08, 19 (Sprint 12, contract v2.0).
 *
 * ONE POOL, DERIVED (TEAM.md "Sprint 12 pins — the token model"): a token is
 * spent by any bookable session now — training, tournament, Phil, Yannick —
 * so a balance is one number, never two. This replaces the Sprint 1-11
 * two-pool (training/tournaments) component of the same name and file; the
 * filename stays so every screen's import line is unchanged, only the prop
 * shape moved from `allowance={{training,tournaments}}` to
 * `tokens={{granted,used,reserved,left,unlimited,grace,nextPeriod}}` — the
 * exact shape `tokensFor()` (data/packages.js) and useMembership() return.
 *
 * Elite shows no number at all (pin L: "No countdown anywhere for Elite") —
 * `tokens.unlimited` short-circuits every branch below to a plain label.
 * The single token (`tokens.perPurchase`, ruling 2026-09-29/30) has no
 * period grant to count down from - it renders SessionTokenPools instead.
 */

/** Exhausted reads as a stop, matching the handoff's red "limit reached" tone. */
function toneFor(left) {
  if (left === 0) return color.error;
  if (left === 1) return color.secondary;
  return color.primary;
}

/**
 * @param {object} tokens  `{ granted, used, left, unlimited, grace }` — see
 *   `tokensFor()` in ../data/packages. `null`/`undefined` renders nothing
 *   (no package assigned yet).
 * @param {boolean} compact  One line, for a dense card (08).
 */
export default function AllowancePools({ tokens, compact = false, style }) {
  if (!tokens) return null;

  if (tokens.unlimited) {
    return (
      <div style={{ font: `600 13px ${font.body}`, color: color.primary, ...style }}>
        Elite · unlimited
      </div>
    );
  }

  if (tokens.perPurchase) return <SessionTokenPools tokens={tokens} compact={compact} style={style} />;

  const tone = toneFor(tokens.left);

  if (compact) {
    return (
      <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary, ...style }}>
        <span style={{ font: `600 12px ${font.body}`, color: tone }}>{tokens.left}</span> token
        {tokens.left === 1 ? '' : 's'} left
      </span>
    );
  }

  const pct = tokens.granted ? Math.min(100, (tokens.used / tokens.granted) * 100) : 0;

  return (
    <div style={style}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
        <span
          style={{
            font: `500 11px ${font.body}`,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: color.textSecondary,
            flex: 1,
          }}
        >
          Tokens
        </span>
        <span style={{ font: `600 12px ${font.body}`, color: tone }}>
          {tokens.left === 0 ? 'None left' : `${tokens.left} left`}
        </span>
        <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>
          {tokens.used} of {tokens.granted} used
        </span>
      </div>
      <div style={{ height: 6, background: color.track, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 3 }} />
      </div>
    </div>
  );
}

/**
 * Sprint 13 (contract v2.1, pin E): "the grace line names the reason and
 * expiry" — a grace token is minted only by a supply failure (contract §4),
 * so the line says which one. `graceTokens.reason` is 'session-cancelled' |
 * 'waitlist-expired' (the two minting triggers, pin E); the pinned hook shape
 * (`members[].tokens.grace: [{ id, expiresAt, reason }]`) carries no session
 * date to name a specific block by, so this states the trigger rather than
 * inventing a "the Nov 9 block" detail the hook doesn't supply — see the
 * sprint report.
 */
const GRACE_REASON_COPY = {
  'session-cancelled': 'a session was cancelled',
  'waitlist-expired': "a waitlist spot wasn't filled in time",
  // Not a bonus: a bought single token (ruling 2026-09-29/30), its own line below.
  'single-purchase': 'Session token',
};

/**
 * "Bonus token — a session was cancelled — expires <date>" (falls back to
 * the plain "1 bonus token, expires <date>" when no reason accompanies the
 * entry — e.g. a seed/harness fixture built before this sprint). Reads the
 * soonest-expiry entry only; `tokensFor()` already sorts `grace`
 * soonest-first, so index 0 is always the one that would be spent next.
 */
export function GraceLine({ tokens, style }) {
  const grace = tokens?.grace?.[0];
  if (!grace) return null;
  if (grace.reason === 'single-purchase') {
    // A single athlete's meter (SessionTokenPools) already says this.
    if (tokens.perPurchase) return null;
    return (
      <div style={{ font: `400 11px ${font.body}`, color: color.secondary, marginTop: 6, ...style }}>
        {`${GRACE_REASON_COPY['single-purchase']} - good through ${grace.expiresAt ? tokenDayLabel(grace.expiresAt) : 'the season end'}`}
      </div>
    );
  }
  // A cancelled session's id starts with its date - name the block when we
  // can, fall back to the generic reason copy when we cannot.
  const sourceDate = /^\d{4}-\d{2}-\d{2}/.test(grace.sourceSessionId || '') ? grace.sourceSessionId.slice(0, 10) : null;
  const reasonText =
    grace.reason === 'session-cancelled' && sourceDate
      ? `the ${longDayLabel(sourceDate)} block was cancelled`
      : GRACE_REASON_COPY[grace.reason];
  const expiresLabel = grace.expiresAt ? longDayLabel(grace.expiresAt) : null;
  return (
    <div style={{ font: `400 11px ${font.body}`, color: color.secondary, marginTop: 6, ...style }}>
      {reasonText
        ? `Bonus token — ${reasonText}${expiresLabel ? ` — expires ${expiresLabel}` : ''}`
        : `1 bonus token${expiresLabel ? `, expires ${expiresLabel}` : ''}`}
    </div>
  );
}

/**
 * The line a slot shows before the athlete commits: what booking it spends.
 * Elite spends nothing; a grace token (when present) is always spent before
 * a period token (contract §4), so the note says so rather than claiming a
 * period token is used when it is not.
 */
export function SpendNote({ tokens, style }) {
  if (!tokens) return null;
  if (tokens.unlimited) return <SpendBadge tone={color.primary} style={style}>Included with Elite</SpendBadge>;

  const hasGrace = (tokens.grace?.length ?? 0) > 0;
  if (tokens.left === 0 && !hasGrace) {
    return <SpendBadge tone={color.error} style={style}>{tokens.perPurchase ? 'No session token' : 'No tokens left'}</SpendBadge>;
  }
  // The soonest-expiring grace token is the one spent: a bought single
  // token (ruling 2026-09-29/30) or a bonus.
  const graceNote = tokens.grace?.[0]?.reason === 'single-purchase' ? 'Uses a session token' : 'Uses a bonus token';
  return (
    <SpendBadge tone={color.textTertiary} style={style}>
      {hasGrace ? graceNote : `Spends 1 token · ${tokens.left} left`}
    </SpendBadge>
  );
}

function SpendBadge({ tone, children, style }) {
  return (
    <span
      style={{
        display: 'inline-block',
        marginTop: 6,
        font: `500 10px ${font.body}`,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        color: tone,
        border: `1px solid ${tone === color.error ? color.error : color.ruleFaint}`,
        borderRadius: radius.badge,
        padding: '3px 7px',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
