import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TOUCH_MIN, color, font } from '../../tokens';
import { Body, Card, SectionLabel } from '../Primitives';
import { useCombineCard } from '../../hooks/combine';
import { COMBINE_DISTANCES, COMBINE_LOAD_ERROR, NO_SCORE, formatScore, shortDay } from '../../data/combine';

const linkStyle = {
  background: 'none',
  border: 'none',
  padding: '0 0 0 12px',
  minHeight: TOUCH_MIN,
  margin: `${-(TOUCH_MIN - 16) / 2}px 0`,
  font: `500 11px ${font.body}`,
  color: color.primary,
  cursor: 'pointer',
};

/**
 * The combine summary on the athlete home and the athlete page (spec 4):
 * the latest score per distance and "Combine ›" to the Combine screen at
 * `to`. Nothing in practice (the onboarding walkthrough), while loading, or
 * for an athlete login with no athlete on file; a failed read still links.
 */
export default function CombineCard({ athleteId = null, practice = false, to }) {
  const navigate = useNavigate();
  const { data, loading, error } = useCombineCard({ athleteId, practice });
  if (practice || loading || (!data && !error)) return null;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Combine</SectionLabel>
        <button type="button" onClick={() => navigate(to)} style={linkStyle}>Combine ›</button>
      </div>
      {data ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {COMBINE_DISTANCES.map((d) => {
            const latest = data.summary?.[d.id]?.latest ?? null;
            return (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Body size={12}>{d.label}</Body>
                <Body size={12} tone={latest ? color.text : color.textTertiary}>
                  {latest ? `${formatScore(latest.score)} · ${shortDay(latest.date)}` : NO_SCORE}
                </Body>
              </div>
            );
          })}
        </div>
      ) : (
        <Body size={12} tone={color.error} style={{ marginTop: 8 }}>{COMBINE_LOAD_ERROR}</Body>
      )}
    </Card>
  );
}
