import React from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from './Button';
import { Body, ScreenTitle } from './Primitives';
import { researchSheet } from '../data/researchConsent';

/**
 * The research "Read more" sheet (assessments spec 7), the approved copy section by section; `name` is the athlete's first name.
 * data-portal-overlay: the Feedback button steps aside while a sheet is open (hooks/feedback.js OVERLAY_ATTR).
 */
export default function ResearchSheet({ name, onClose }) {
  return (
    <div data-portal-overlay="" onClick={onClose} style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end', zIndex: 5 }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxHeight: '80%', overflowY: 'auto', background: color.surface, borderTop: `1px solid ${color.border}`, borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`, padding: '20px 22px 26px' }}
      >
        <ScreenTitle size={19}>Research</ScreenTitle>
        {researchSheet(name).map((section) => (
          <div key={section.heading} style={{ marginTop: 14 }}>
            <div style={{ font: `600 12px ${font.body}`, color: color.text }}>{section.heading}</div>
            {section.lines.map((line) => <Body key={line} size={12} style={{ marginTop: 6 }}>{line}</Body>)}
          </div>
        ))}
        <Button variant="outline" height={46} onClick={onClose} style={{ marginTop: 18, boxShadow: 'none' }}>Close</Button>
      </div>
    </div>
  );
}
