import React, { useState } from 'react';
import { color, font } from '../../tokens';
import { PeriodAnchorEditor, StripeIdsEditor } from '../AthleteMembershipCard';
import { Body, Card, SectionLabel } from '../Primitives';
import { ADVANCED_BODY, ADVANCED_LABEL } from '../../data/staffFamily';

/**
 * The family's rarely changed settings, at the foot of the family page
 * (owner 2026-11-16): the billing day (period anchor) and the Stripe
 * customer and subscription ids. They are the HOUSEHOLD's, so they sit here
 * once rather than under every athlete, and folded away: a wrong tap on
 * either re-anchors every athlete's tokens or unlinks the family's payments.
 */
export default function StaffFamilyAdvanced({ householdId, anchorDay = 1 }) {
  const [open, setOpen] = useState(false);
  if (!householdId) return null;
  return (
    <Card large>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          minHeight: 44,
          padding: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span>
          <SectionLabel>{ADVANCED_LABEL}</SectionLabel>
          <span style={{ display: 'block', font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 4 }}>{ADVANCED_BODY}</span>
        </span>
        <span aria-hidden="true" style={{ color: color.textTertiary }}>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <div style={{ marginTop: 14 }}>
          <PeriodAnchorEditor householdId={householdId} initialAnchorDay={anchorDay} />
          <div style={{ height: 1, background: color.rule, margin: '16px 0' }} />
          <StripeIdsEditor householdId={householdId} />
          <Body size={11} tone={color.textTertiary} style={{ marginTop: 12 }}>
            These apply to every athlete in the family.
          </Body>
        </div>
      ) : null}
    </Card>
  );
}
