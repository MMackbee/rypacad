import React from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from '../components/Button';
import Field from '../components/Field';
import { Body, Card, ScreenTitle, Tick } from '../components/Primitives';
import { useEnrollmentForm } from '../hooks';

/**
 * Registration's consent step, its info sheet and the checkbox (Sprint 20,
 * spec 2.1 step 5) - split out of RegistrationSteps.js so that file stays
 * under 500 lines (the plan's cut plus the new athlete fields ran to 586).
 * RegistrationSteps.js re-exports ConsentStep and ConsentInfoSheet, so
 * Registration.js imports every step from one module as before. The
 * components themselves are the Sprint 10 code, with the adult copy variant.
 */
export function ConsentStep({ mode, consents, onChange, signatureName, onSignatureChange, onOpenInfo, showErrors }) {
  const { data } = useEnrollmentForm();
  const list = data?.consents ?? [];

  const set = (id, v) => onChange((prev) => ({ ...prev, [id]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <Body size={13}>
        {mode === 'athlete'
          ? 'You are signing for yourself. Each of these is a separate decision — none is bundled into the others.'
          : 'Each athlete is a minor. Each of these is a separate decision — none is bundled into the others.'}
      </Body>

      {/*
        Three cards, not three checkboxes in a row. Media release is optional and
        declining it does not block enrollment - bundling it with the injury
        waiver would weaken both.
      */}
      {list.map((consent) => (
        <Card key={consent.id} large>
          <div style={{ display: 'flex', gap: 13 }}>
            <Checkbox
              checked={consents[consent.id] ?? consent.checked}
              onChange={(v) => set(consent.id, v)}
              label={consent.title}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{consent.title}</div>
              <Body size={12} style={{ marginTop: 6 }}>
                {consent.body}
              </Body>
              <button
                type="button"
                onClick={() => onOpenInfo(consent.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginTop: 9,
                  font: `500 12px ${font.body}`,
                  color: color.primary,
                  cursor: 'pointer',
                }}
              >
                {consent.link} →
              </button>
              {consent.footnote ? (
                <div
                  style={{
                    font: `500 10px ${font.body}`,
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    color: color.secondary,
                    marginTop: 9,
                  }}
                >
                  {consent.footnote}
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      ))}

      {showErrors && !(consents.dataCollection && consents.videoCapture) ? (
        <div data-field-error>
          <Body size={12} tone={color.error}>
            Data collection and video capture consent are required to enroll.
          </Body>
        </div>
      ) : null}

      <Card large>
        <Field
          label="Type your full legal name"
          value={signatureName}
          onChange={onSignatureChange}
          error={showErrors && signatureName.trim() === '' ? 'A signature is required.' : undefined}
        />
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 9 }}>
          Re-confirmed annually. Covers athletic injury risk and media release.
        </Body>
      </Card>
    </div>
  );
}

/**
 * In-app sheet for the consent "Read what is stored →" / "Read retention
 * policy →" / "Read media terms →" links (Sprint 10 pin A). Real copy from
 * docs, not a placeholder: each consent's own body is already the design
 * handoff's authoritative description of what is collected and why; the
 * data-collection sheet also carries the handoff's Access control matrix
 * (docs/portal/design-handoff.md, "Access control") verbatim, since that is
 * the closest documented "who can see what is stored" reference on file.
 * Never inert - a real sheet opens, or the link would lose its pointer
 * styling, which this does not.
 */
const CONSENT_INFO = {
  dataCollection: {
    title: 'What is stored',
    extra: (
      <>
        <Body size={12} style={{ marginTop: 12 }}>
          Access is role-scoped and re-checked on every request, never only in the UI:
        </Body>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {[
            ['Athlete', 'Own records only'],
            ['Parent/Guardian', 'Linked athletes only. Reflection access is summary-level only.'],
            ['Coach', "Their own assigned athletes' attendance and logs only."],
            ['Mental Performance Coach', 'Mental-game notes academy-wide, every access logged.'],
            ['Ops Admin', 'Fitness completion, billing status, enrollment — no coaching or mental-game writes.'],
            ['Owner/Director', 'Full access including staff management and audit logs.'],
          ].map(([role, access]) => (
            <div key={role}>
              <div style={{ font: `600 12px ${font.body}`, color: color.text }}>{role}</div>
              <div style={{ font: `400 11px/1.5 ${font.body}`, color: color.textTertiary }}>{access}</div>
            </div>
          ))}
        </div>
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 12 }}>
          MFA is required on every staff role at setup.
        </Body>
      </>
    ),
  },
  videoCapture: { title: 'Retention policy', extra: null },
  mediaRelease: { title: 'Media terms', extra: null },
};

export function ConsentInfoSheet({ id, onClose }) {
  const { data } = useEnrollmentForm();
  const consent = (data?.consents ?? []).find((c) => c.id === id);
  const info = CONSENT_INFO[id] || { title: 'What is stored', extra: null };

  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, background: tint.overlay, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '80%',
          overflowY: 'auto',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>{info.title}</ScreenTitle>
        <Body size={12} style={{ marginTop: 10 }}>
          {consent?.body}
        </Body>
        {info.extra}
        <Button variant="outline" height={46} onClick={onClose} style={{ marginTop: 18, boxShadow: 'none' }}>
          Close
        </Button>
      </div>
    </div>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={Boolean(checked)}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 26,
        height: 26,
        flex: 'none',
        borderRadius: radius.pill,
        background: checked ? color.primary : 'transparent',
        border: checked ? 'none' : `1.5px solid ${color.faintText}`,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {checked ? <Tick size={11} /> : null}
    </button>
  );
}
