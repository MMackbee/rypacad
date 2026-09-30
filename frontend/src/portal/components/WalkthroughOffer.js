import React from 'react';
import { useNavigate } from 'react-router-dom';
import { color } from '../tokens';
import Button from './Button';
import { BackLink, Body, Card, SectionLabel } from './Primitives';
import useOnboardingStatus from '../hooks/onboarding';
import { contractEnabled } from '../data/contractFlag';

/**
 * The first-visit walkthrough offer on the family and athlete homes (tester
 * report 2026-09-30: "I also didn't get a walkthrough when I first started").
 * Sprint 20's instant sign-up lands a new family straight on Home with its
 * Pay buttons (spec 2.1: no walkthrough hop), so this is a quiet card below
 * the payment and athlete cards: never in front of Pay, never a redirect.
 *
 * It shows until the track is completed or the family answers it - "Take the
 * walkthrough" (opens /portal/welcome on the track) or "Not now" - both
 * remembered on this device (hooks/onboarding.js). Settings' "Replay the
 * walkthrough" stays the way back either way. Callers hide it in practice
 * mode: the walkthrough embeds these same home screens.
 *
 * @param {'parent'|'athlete'} track
 */
const BODY = {
  parent:
    'A short practice run on the real screens with a sample family: read the athlete cards, book a block, find the Tour. Nothing you try in it becomes real.',
  athlete:
    'A short practice run on the real screens with sample data: book a block and log a Commitment Contract day. Nothing you try in it becomes real.',
};
/** The athlete line while the contract is hidden (owner, 2026-09-30): the walkthrough skips its log step. */
const ATHLETE_NO_CONTRACT =
  'A short practice run on the real screens with sample data: look around your home, book a block, see how tokens work. Nothing you try in it becomes real.';

export default function WalkthroughOffer({ track, style }) {
  const navigate = useNavigate();
  const { completed, offered, markOffered } = useOnboardingStatus();
  if (!BODY[track] || completed[track] || offered[track]) return null;
  const body = track === 'athlete' && !contractEnabled() ? ATHLETE_NO_CONTRACT : BODY[track];

  const take = () => {
    markOffered(track);
    navigate(`/portal/welcome?track=${track}`);
  };

  return (
    <Card large style={style}>
      <SectionLabel>New here?</SectionLabel>
      <Body size={12} style={{ marginTop: 8 }}>
        {body} It's always in Settings, too.
      </Body>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13 }}>
        <Button variant="secondary" height={44} style={{ flex: 1, boxShadow: 'none' }} onClick={take}>
          Take the walkthrough
        </Button>
        <BackLink onClick={() => markOffered(track)} style={{ padding: '0 4px 0 12px', color: color.textTertiary }}>
          Not now
        </BackLink>
      </div>
    </Card>
  );
}
