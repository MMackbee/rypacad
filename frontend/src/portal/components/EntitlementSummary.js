import React from 'react';
import { color, font } from '../tokens';
import { SPECIALIST_MONTHLY_CAP } from '../data/specialists';
import { Banner, Body } from './Primitives';

/**
 * SpecialistBooking's entitlement summary line / blocking notice (Sprint 11
 * pin G, contract v1.9). Extracted out of screens/SpecialistBooking.js to
 * keep that screen closer to the project's file-size convention — this
 * piece is self-contained (pure copy derivation plus one small component)
 * and the screen only needs to resolve `entitlement` (off useSpecialistSlots' own `entitlement`,
 * the parent-selected child or the athlete themself) and pass it in.
 *
 * "2 of 8 performance sessions used this month" (fitness) / "Included with
 * Elite — 3 of 16 used this month" (elite, Sprint 11 amendment v1.9.1 — the
 * 16 here is ONLY the harness preview default in demoEntitlement below; the
 * real render path (summaryFor) always reads `entitlement.limit`, never a
 * hardcoded number) / "up to 2 mental game sessions a month" (Yannick, flat,
 * unchanged) / the blocking notice + "See membership" link for Phil when no
 * fitness package is on file — slots still render elsewhere on the screen,
 * only the reserve action is gated by the caller reading `entitlement.source
 * === 'none'` itself.
 */

/**
 * HARNESS-ONLY preview data, used only when
 * the harness passes an explicit source. Never used by a real caller.
 */
export function demoEntitlement(specialistId, source) {
  if (specialistId === 'mental') {
    return { used: 0, limit: SPECIALIST_MONTHLY_CAP, left: SPECIALIST_MONTHLY_CAP, source: 'flat' };
  }
  if (specialistId !== 'phil') return null;
  if (source === 'none') return { used: 0, limit: 0, left: 0, source: 'none' };
  if (source === 'elite') return { used: 3, limit: 16, left: 13, source: 'elite' };
  return { used: 2, limit: 8, left: 6, source: 'fitness' };
}

/** The pin's exact wording per source — never recomputed differently in two places. */
export function summaryFor(specialistId, entitlement) {
  if (!entitlement) return null;
  const { used, limit, source } = entitlement;
  if (specialistId === 'mental') return `up to ${limit} mental game sessions a month`;
  if (source === 'elite') return `Included with Elite — ${used} of ${limit} used this month`;
  if (source === 'fitness') return `${used} of ${limit} performance sessions used this month`;
  return null; // source 'none' -> the blocking notice, not a summary line
}

export default function EntitlementSummary({ specialistId, entitlement, onSeeMembership }) {
  if (specialistId === 'phil' && entitlement?.source === 'none') {
    return (
      <Banner
        tone="yellow"
        title="No fitness package on file"
        action={
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
        }
      >
        Phil's performance sessions come from a fitness package — ask the academy to add one.
      </Banner>
    );
  }

  const summary = summaryFor(specialistId, entitlement);
  if (!summary) return null;
  return (
    <Body size={12} tone={color.textSecondary}>
      {summary}
    </Body>
  );
}
