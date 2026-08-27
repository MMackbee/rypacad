import React from 'react';
import { color, font, radius } from '../tokens';
import Button from '../components/Button';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { Body, ScreenTitle, Tick } from '../components/Primitives';
import { useNewsletter } from '../hooks';

/**
 * 17 · Newsletter Composer - admin.
 * States: Draft with sections missing, All sections in, Scheduled, Sent.
 *
 * A checklist first and an editor second. The module's real job is visibility
 * into which sections have landed, because the recurring failure mode is an
 * issue slipping when one contributor did not submit - not the writing.
 *
 * Send is blocked while any section is outstanding, and the only action offered
 * in that state is nudging the named contributor. That is the rule the screen
 * exists to enforce, so the CTA is genuinely disabled rather than warning and
 * letting it through.
 *
 * @param {'missing'|'ready'|'scheduled'|'sent'} variant
 */
export default function NewsletterComposer({ variant = 'missing', bare = false }) {
  const { data } = useNewsletter({ variant });
  const state = data?.state;
  const outstanding = data?.outstandingCount ?? 0;

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
                This week
              </ScreenTitle>
            </div>
            {state ? <StatusBadge tone={state.pill.tone}>{state.pill.label}</StatusBadge> : null}
          </div>

          {state ? <DeadlineBanner banner={state.banner} /> : null}
        </div>
      }
      footer={<ComposerFooter status={data?.status} outstanding={outstanding} hint={state?.hint} />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {(data?.sections ?? []).map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </div>
    </PhoneFrame>
  );
}

function DeadlineBanner({ banner }) {
  const yellow = banner.tone === 'yellow';
  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: radius.control,
        padding: '11px 13px',
        background: yellow ? 'rgba(244,238,25,.07)' : color.dimmed,
        border: `1px solid ${yellow ? 'rgba(244,238,25,.4)' : '#282828'}`,
        font: `400 12px/1.5 ${font.body}`,
        color: yellow ? color.secondary : color.primary,
      }}
    >
      {banner.text}
    </div>
  );
}

/**
 * Outstanding cards tint their whole background so the eye finds the gap before
 * it reads any names - the point of the screen is spotting what has not landed.
 */
function SectionCard({ section }) {
  const landed = section.landed;

  return (
    <div
      style={{
        background: landed ? color.surface : 'rgba(244,238,25,.05)',
        border: `1px solid ${landed ? color.border : color.secondary}`,
        borderRadius: radius.cardLarge,
        padding: 15,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            flex: 'none',
            marginTop: 1,
            borderRadius: '50%',
            background: landed ? color.primary : 'transparent',
            border: landed ? 'none' : `1.5px dashed ${color.secondary}`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {landed ? <Tick size={11} /> : null}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{section.name}</div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
            {section.contributor}
          </div>
        </div>

        <StatusBadge tone={landed ? 'green' : 'yellow'}>
          {landed ? 'In' : 'Outstanding'}
        </StatusBadge>
      </div>

      {landed ? (
        <MediaPlaceholder height={52} caption="SUBMITTED COPY — tap to edit" style={{ marginTop: 13 }} />
      ) : (
        // The only action available against an outstanding section.
        <Button variant="caution" height={40} style={{ marginTop: 13, boxShadow: 'none', font: `600 13px ${font.body}` }}>
          Nudge {section.contributor.split(' · ')[0]}
        </Button>
      )}
    </div>
  );
}

function ComposerFooter({ status, outstanding, hint }) {
  let cta;
  if (outstanding > 0) {
    // Genuinely disabled. Send is blocked while anything is outstanding.
    cta = (
      <Button disabled>
        Send · {outstanding} section{outstanding === 1 ? '' : 's'} missing
      </Button>
    );
  } else if (status === 'scheduled') {
    cta = (
      <Button variant="outline" style={{ boxShadow: 'none' }}>
        Edit or cancel schedule
      </Button>
    );
  } else if (status === 'sent') {
    cta = (
      <Button variant="outline" style={{ boxShadow: 'none' }}>
        Start next issue
      </Button>
    );
  } else {
    cta = <Button>Schedule send</Button>;
  }

  return (
    <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
      {cta}
      <Body
        size={11}
        tone={color.textTertiary}
        style={{ textAlign: 'center', marginTop: 10 }}
      >
        {hint}
      </Body>
    </div>
  );
}
