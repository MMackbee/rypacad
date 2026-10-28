import React from 'react';
import { color, radius, tint } from '../../tokens';
import Button from '../Button';
import { Body, ScreenTitle } from '../Primitives';
import { NOT_TESTED_REASONS } from '../../data/assessmentSettings';

/**
 * "Not tested" with the protocol's reason codes (absent, ill, pain, injury,
 * equipment) - the CancelSheet overlay idiom, data-portal-overlay included
 * so the Feedback button steps aside while it is open.
 */
export default function NotTestedSheet({ name, onPick, onClose }) {
  return (
    <div data-portal-overlay="" onClick={onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}
      >
        <ScreenTitle size={19}>Not tested · {name}</ScreenTitle>
        <Body size={12} style={{ marginTop: 8 }}>Pick the reason. Retest within 7 days.</Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {NOT_TESTED_REASONS.map(([key, label]) => (
            <Button key={key} variant="outline" height={46} style={{ boxShadow: 'none' }} onClick={() => onPick(key)}>{label}</Button>
          ))}
          <Button variant="outline" height={46} style={{ boxShadow: 'none', marginTop: 6 }} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
