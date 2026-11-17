import React, { useState } from 'react';
import { SHEET_Z, color, font, radius, tint } from '../../tokens';
import Button from '../Button';
import Checkbox from '../Checkbox';
import Field from '../Field';
import { Body, ScreenTitle } from '../Primitives';
import { signDoorRules } from '../../hooks/door';
import { doorRulesSections } from '../../data/doorRules';

const AGREE = 'I agree to the door rules';

/**
 * The door rules sheet (docs/portal/plans/2026-11-17-door-button/00-spec.md 7),
 * opened from the door card's "Sign the door rules": the facility rules
 * (data/consentTerms.js facilityAccess, which ends "Who may enter" with the
 * door line), in the second person for an adult athlete's own login
 * (`selfWording`); the typed full name; the "I agree" tick; Sign. Signed once
 * per login (signDoorRules). A refusal shows the server's own words and keeps
 * the sheet open; on success `onSigned` (the card closes it and rechecks).
 * The house bottom sheet: an overlay on SHEET_Z (data-portal-overlay, so the
 * Feedback button steps aside), a role="dialog" sheet that scrolls inside.
 */
export default function DoorRulesSheet({ selfWording = false, onClose, onSigned }) {
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const ready = name.trim().length >= 2 && name.trim().length <= 120 && agreed;

  const sign = async () => {
    if (!ready || saving) return;
    setSaving(true);
    setError(null);
    try {
      await signDoorRules(name);
      onSigned();
    } catch (err) {
      setSaving(false);
      setError(err && err.message ? String(err.message) : 'The door rules were not signed. Try again.');
    }
  };

  return (
    <div
      data-portal-overlay=""
      onClick={saving ? undefined : onClose}
      style={{ position: 'absolute', inset: 0, zIndex: SHEET_Z, background: tint.overlay, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Door rules"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          maxHeight: '85%',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>Door rules</ScreenTitle>
        {doorRulesSections(selfWording).map((section) => (
          <div key={section.heading} style={{ marginTop: 14 }}>
            <div style={{ font: `600 12px ${font.body}`, color: color.text }}>{section.heading}</div>
            {section.lines.map((line) => (
              <Body key={line} size={12} style={{ marginTop: 6 }}>
                {line}
              </Body>
            ))}
          </div>
        ))}
        <Field label="Your full name" value={name} onChange={setName} autoComplete="name" style={{ marginTop: 20 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
          <Checkbox checked={agreed} onChange={setAgreed} label={AGREE} />
          <span
            aria-hidden="true"
            onClick={() => setAgreed(!agreed)}
            style={{ font: `500 13px ${font.body}`, color: color.text, cursor: 'pointer' }}
          >
            {AGREE}
          </span>
        </div>
        {error ? (
          <Body size={12} tone={color.error} style={{ marginTop: 12 }}>
            {error}
          </Body>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          <Button height={50} disabled={!ready} loading={saving} onClick={sign}>
            {saving ? 'Signing' : 'Sign'}
          </Button>
          <Button variant="outline" height={46} disabled={saving} onClick={onClose} style={{ boxShadow: 'none' }}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
