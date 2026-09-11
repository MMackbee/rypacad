import React from 'react';
import { color, font, radius } from '../tokens';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useNewsletter } from '../hooks';

/**
 * 17 · Newsletter Composer - admin. PARKED (TEAM.md, Sprint 10 pin,
 * "Explicitly PARKED": "the Newsletter composer (invented scaffold; route
 * leaves staff nav, screen stays in the harness)").
 *
 * The scan found this screen full of dead controls: "Nudge {contributor}"
 * buttons with no onClick, a Send/Schedule footer that never persisted
 * anything, section cards that looked editable but weren't. Rather than
 * wire a feature nobody asked to build yet, every one of those becomes one
 * honest "Coming later" notice - never inert-but-styled-as-live. The screen
 * stays mounted here so the harness can still show it existed and was
 * deliberately parked, not forgotten; routing owns removing it from the
 * live staff nav (it already isn't one of BottomTabBar's staff tab sets).
 *
 * @param {'missing'|'ready'|'scheduled'|'sent'} [variant]  Still accepted so
 *   the harness's four gallery swatches keep their labels, but every state
 *   now renders the same honest notice - there is nothing left to compose.
 */
export default function NewsletterComposer({ variant = 'missing', bare = false }) {
  const { data } = useNewsletter({ variant });

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
                Issue {data?.issue?.number} · {data?.issue?.date}
              </div>
              <ScreenTitle size={22} style={{ marginTop: 3 }}>
                Newsletter
              </ScreenTitle>
            </div>
            <StatusBadge tone="neutral" dashed>
              Parked
            </StatusBadge>
          </div>
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px' }}>
        <Card large style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div
            style={{
              width: 44,
              height: 44,
              margin: '0 auto 16px',
              borderRadius: radius.round,
              border: `1.5px dashed ${color.border}`,
            }}
          />
          <ScreenTitle size={18}>Coming later</ScreenTitle>
          <Body size={12} style={{ marginTop: 10 }}>
            The newsletter composer isn't built yet — sections, nudges, and send/schedule are all
            unwired. This screen is parked while intake and live staff surfaces come first.
          </Body>
        </Card>

        {(data?.sections ?? []).length ? (
          <Card large style={{ marginTop: 12 }}>
            <SectionLabel style={{ marginBottom: 10 }}>Planned sections</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.sections.map((s) => (
                <div key={s.id} style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
                  {s.name} · {s.contributor}
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </PhoneFrame>
  );
}
