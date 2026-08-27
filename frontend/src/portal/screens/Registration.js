import React, { useState } from 'react';
import { BLOCK_RANGE_LABEL, color, font, radius, tint } from '../tokens';
import Button, { Spinner } from '../components/Button';
import Field, { SelectField } from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import TierCard from '../components/TierCard';
import { BackLink, Banner, Body, Card, ScreenTitle, Tick } from '../components/Primitives';
import { useTiers } from '../hooks';
import { CONSENTS, RELATIONSHIPS } from '../data/seed';

/**
 * 02 · Registration - public, multi-step.
 * States: Step 1 Guardian, Step 2 Athlete with validation error, Step 3 Tier,
 * Step 4 Consent, Submitting, Success.
 *
 * @param {'guardian'|'athlete'|'tier'|'consent'|'submitting'|'success'} variant
 */
const STEP_INDEX = { guardian: 0, athlete: 1, tier: 2, consent: 3, submitting: 3, success: 3 };

const STEP_TITLES = [
  'Guardian contact',
  'Athlete details',
  'Membership tier',
  'Consent and waiver',
];

export default function Registration({ variant = 'guardian', bare = false, onBack, onFinish }) {
  const step = STEP_INDEX[variant] ?? 0;
  const submitting = variant === 'submitting';

  if (variant === 'success') return <Success bare={bare} onFinish={onFinish} />;

  return (
    <PhoneFrame
      bare={bare}
      header={<StepHeader step={step} onBack={onBack} />}
      footer={<StepFooter variant={variant} step={step} />}
    >
      <div style={{ padding: '20px 22px 24px', position: 'relative' }}>
        {step === 0 ? <GuardianStep /> : null}
        {step === 1 ? <AthleteStep /> : null}
        {step === 2 ? <TierStep /> : null}
        {step === 3 ? <ConsentStep /> : null}
      </div>

      {/*
        A blocking overlay, not just a button spinner: consent records are
        written before the account exists, so an interrupted submit leaves a
        family half-enrolled. The copy says why rather than just spinning.
      */}
      {submitting ? <SubmittingOverlay /> : null}
    </PhoneFrame>
  );
}

function StepHeader({ step, onBack }) {
  return (
    <div style={{ padding: '12px 22px 14px', borderBottom: `1px solid ${color.frameRule}` }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <BackLink onClick={onBack}>‹ Back</BackLink>
        <div style={{ flex: 1 }} />
        <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
          Step {step + 1} of {STEP_TITLES.length}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 5, marginTop: 13 }}>
        {STEP_TITLES.map((title, i) => (
          <div
            key={title}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= step ? color.primary : color.rule,
            }}
          />
        ))}
      </div>

      <ScreenTitle size={24} style={{ marginTop: 12 }}>
        {STEP_TITLES[step]}
      </ScreenTitle>
    </div>
  );
}

function StepFooter({ variant, step }) {
  const submitting = variant === 'submitting';
  // Step 2 is shown with a validation error, so its CTA is disabled - the step
  // CTA disables while the step has an error.
  const blocked = variant === 'athlete';

  const label = submitting
    ? 'Submitting enrollment'
    : step === 3
    ? 'Sign and submit'
    : 'Continue';

  return (
    <div
      style={{
        borderTop: `1px solid ${color.frameRule}`,
        padding: '14px 22px 22px',
      }}
    >
      <Button loading={submitting} disabled={blocked}>
        {label}
      </Button>
    </div>
  );
}

function GuardianStep() {
  const [relationship, setRelationship] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Guardian name" value="Dana Whitfield" onChange={() => {}} />
      <Field label="Email" type="email" value="dana@email.com" onChange={() => {}} />
      <Field
        label="Mobile"
        type="tel"
        value="(612) 555-0148"
        onChange={() => {}}
        hint="Used for schedule-change texts. You control this later in Notification Preferences."
      />
      <SelectField
        label="Relationship to athlete"
        value={relationship}
        options={RELATIONSHIPS}
        onChange={setRelationship}
      />
    </div>
  );
}

function AthleteStep() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Athlete name" value="Jordan Whitfield" onChange={() => {}} />
      {/*
        Date of birth is required because it determines U13 vs U18 eligibility -
        the error says so rather than just marking the field red.
      */}
      <Field
        label="Date of birth"
        value=""
        placeholder="MM / DD / YYYY"
        onChange={() => {}}
        error="Date of birth is required — it determines U13 vs U18 eligibility."
      />
      <Field label="Emergency contact" value="" placeholder="Name and mobile" onChange={() => {}} />

      <Card>
        <div
          style={{
            font: `500 11px ${font.body}`,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: color.textSecondary,
            marginBottom: 9,
          }}
        >
          Allergies or medical conditions
        </div>
        <textarea
          rows={3}
          style={{
            width: '100%',
            height: 70,
            background: color.track,
            border: `1px solid ${color.rule}`,
            borderRadius: radius.input,
            padding: 11,
            font: `400 14px ${font.body}`,
            color: color.text,
            outline: 'none',
            resize: 'none',
          }}
        />
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 9 }}>
          Visible to on-site coaching staff during live sessions only. Not shown in admin views.
        </Body>
      </Card>
    </div>
  );
}

function TierStep() {
  const { data: tiers } = useTiers();
  const [selected, setSelected] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <Banner tone="yellow" title="Tiers not decided">
        Names, count, and prices are all open. This list renders from data — {tiers?.length ?? 0}{' '}
        shown, one of them unlimited.
      </Banner>

      {(tiers ?? []).map((tier) => (
        <TierCard
          key={tier.id}
          tier={tier}
          selected={selected === tier.id}
          onSelect={() => setSelected(tier.id)}
        />
      ))}

      <div
        style={{
          border: `1px dashed ${color.border}`,
          borderRadius: radius.card,
          padding: '14px 12px',
          textAlign: 'center',
          font: `400 11px/1.6 ${font.mono}`,
          color: color.captionText,
        }}
      >
        TIER SLOT — rendered from data. No hardcoded name, count, or price; add or remove a tier
        without touching the layout.
      </div>
    </div>
  );
}

function ConsentStep() {
  const [checked, setChecked] = useState(() =>
    CONSENTS.reduce((acc, c) => ({ ...acc, [c.id]: c.checked }), {})
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <Body size={13}>
        Jordan is a minor. Each of these is a separate decision — none is bundled into the others.
      </Body>

      {/*
        Three cards, not three checkboxes in a row. Media release is optional and
        declining it does not block enrollment - bundling it with the injury
        waiver would weaken both.
      */}
      {CONSENTS.map((consent) => (
        <Card key={consent.id} large>
          <div style={{ display: 'flex', gap: 13 }}>
            <Checkbox
              checked={checked[consent.id]}
              onChange={(v) => setChecked((prev) => ({ ...prev, [consent.id]: v }))}
              label={consent.title}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `600 14px ${font.body}`, color: color.text }}>
                {consent.title}
              </div>
              <Body size={12} style={{ marginTop: 6 }}>
                {consent.body}
              </Body>
              <div
                style={{
                  font: `500 12px ${font.body}`,
                  color: color.primary,
                  marginTop: 9,
                  cursor: 'pointer',
                }}
              >
                {consent.link} →
              </div>
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

      <Card large>
        <Field label="Type your full legal name" value="" onChange={() => {}} />
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 9 }}>
          Re-confirmed annually. Covers athletic injury risk and media release.
        </Body>
      </Card>
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

function SubmittingOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: tint.overlay,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <Card
        large
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <Spinner size={26} track={color.rule} head={color.primary} />
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>
          Creating the account
        </div>
        <Body size={11}>
          Do not close this. Consent records are written before the account exists.
        </Body>
      </Card>
    </div>
  );
}

function Success({ bare, onFinish }) {
  const steps = [
    'Diagnostic Protocol booked',
    'Commitment Contract tier selected with your coach',
    `First block on the ${BLOCK_RANGE_LABEL} weekday schedule`,
  ];

  return (
    <PhoneFrame
      bare={bare}
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          <Button onClick={onFinish}>Go to dashboard</Button>
        </div>
      }
    >
      <div
        style={{
          padding: '56px 22px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 18,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: tint.green,
            border: `2px solid ${color.primary}`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Tick size={26} color={color.primary} thickness={3} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <ScreenTitle size={26}>Enrollment submitted</ScreenTitle>
          <Body size={13} style={{ marginTop: 10 }}>
            Phil reviews new enrollments within one business day. You’ll get an email when the
            account is active, then Diagnostic scheduling opens.
          </Body>
        </div>

        <Card large style={{ width: '100%', marginTop: 6 }}>
          <div
            style={{
              font: `600 10px ${font.body}`,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              color: color.textSecondary,
              marginBottom: 14,
            }}
          >
            What happens next
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {steps.map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    flex: 'none',
                    borderRadius: '50%',
                    background: i === 0 ? color.primary : 'transparent',
                    border: i === 0 ? 'none' : `1px solid #444`,
                    display: 'grid',
                    placeItems: 'center',
                    font: `600 11px ${font.body}`,
                    color: i === 0 ? '#000' : color.textTertiary,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ font: `400 13px ${font.body}`, color: color.textSecondary }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PhoneFrame>
  );
}
