import React from 'react';
import { color, font } from '../tokens';
import { SpendNote } from './AllowancePools';
import { Banner } from './Primitives';

/**
 * SpecialistBooking's token/cap summary line (Sprint 12 pin K, TEAM.md
 * "Sprint 12 pins — the token model", contract v2.0). Rewritten from the
 * Sprint 11 fitness/elite-sourced Phil summary: Phil and Yannick now spend
 * an ORDINARY token (`tokens`, the same shape useMembership()'s per-member
 * `tokens` returns — `useSpecialistSlots().data.tokens` replaces the old
 * `.entitlement`), so the summary is the same SpendNote every other booking
 * surface shows. Only Yannick's flat monthly cadence survives as a distinct
 * blocking state (pin K: "the Sprint 11 'no-fitness-package'/'cap-reached'
 * Phil states are deleted; Yannick's 'cap-reached' stays with copy 'next
 * mental game session opens <date>'").
 */
export default function EntitlementSummary({ specialistId, tokens, capReached, onSeeMembership }) {
  if (specialistId === 'mental' && capReached) {
    return (
      <Banner
        tone="yellow"
        title="This month's mental game cap is booked"
        action={
          onSeeMembership ? (
            <button
              type="button"
              onClick={onSeeMembership}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                font: `500 12px ${font.body}`,
                color: color.primary,
                cursor: 'pointer',
              }}
            >
              See membership ›
            </button>
          ) : undefined
        }
      >
        Next mental game session opens next month.
      </Banner>
    );
  }

  if (!tokens) return null;
  return (
    <>
      <SpendNote tokens={tokens} />
      {/* A token held by a waitlist place is not left to spend - say where it
          went, as Book a Session's banner does (AllowancePools.js). */}
      {!tokens.unlimited && tokens.reserved > 0 ? (
        <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 6 }}>
          {tokens.reserved} held on a waitlist
        </div>
      ) : null}
    </>
  );
}
