import React from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../../tokens';
import Button from '../Button';
import { Card } from '../Primitives';
import { homeCardFor } from '../../data/mentalConsent';

/**
 * The family home's consent card (spec 4.1, plan Task 13): while an athlete
 * the parent can sign for is Not signed or Needs 18+ and has a confirmed 1:1
 * ahead - "Sign Yannick's consent for Reese before the session on Thu, Nov
 * 12" -> the flow. Nothing otherwise (the athlete card's line is enough).
 */
export default function ConsentHomeCard({ rows }) {
  const navigate = useNavigate();
  const card = homeCardFor(rows || []);
  if (!card) return null;
  return (
    <Card large tone="yellow">
      <div style={{ font: `600 14px/1.45 ${font.body}`, color: color.text }}>{card.text}</div>
      <Button variant="caution" height={44} onClick={() => navigate(card.href)} style={{ marginTop: 12, boxShadow: 'none' }}>
        Sign now
      </Button>
    </Card>
  );
}
