import React, { useState } from 'react';
import { BLOCK_RANGE_LABEL, color, font, radius, tint } from '../tokens';
import * as hooks from '../hooks';
import Button, { Spinner } from '../components/Button';
import Field, { SelectField } from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import PackageCard from '../components/PackageCard';
import { BackLink, Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { useEnrollmentForm, usePackages } from '../hooks';
import { DROP_IN } from '../data/packages';

/**
 * Sprint 10 pin A (TEAM.md, contract v1.8 §A): useEnrollment() does not
 * exist anywhere in this worktree's hooks/index.js (confirmed by grep of
 * hooks/index.js - no `useEnrollment` export, only the unrelated, pre-
 * existing `useEnrollmentForm()` that serves the static consent copy).
 * The routing lane is building it in a parallel worktree against the
 * pinned enrollmentRequests/{uid} shape. Coded against the shape this
 * task pins: { data: { status: 'none'|'pending'|'declined'|'approved',
 * request: {...} | null }, loading, error, submit(request) }. Namespace-
 * import + inert-fallback (Roster.js's established pattern) keeps the
 * hook call unconditional (rules of hooks); submit() resolves locally
 * without persisting anything, and status stays 'none', so the whole
 * multi-step flow is real and reviewable without a crash until routing's
 * export lands. Flagged loudly in the sprint report.
 */
function useEnrollmentFallback() {
  return {
    data: { status: 'none', request: null },
    loading: false,
    error: null,
    submit: async (request) => ({ ...request, status: 'pending', simulated: true }),
  };
}
const useEnrollment = hooks.useEnrollment || useEnrollmentFallback;

/**
 * 02 · Registration (multi-step) - public.
 *
 * Sprint 10 pin A: a real form now, not a static mock of four steps. Local
 * step state drives navigation (Continue/Back); every field is real state
 * with a real onChange; the athlete step is a real add/remove LIST (a
 * guardian may be enrolling more than one child at once - the pinned
 * enrollmentRequests schema is athletes: [...] for exactly this reason);
 * package + optional contract tier are chosen PER athlete (contract v1.8 §A
 * /§B: athletes[].packageId, athletes[].contractMinutes); consent is three
 * real checkboxes; submit runs through useEnrollment().submit(request) with
 * a real saving/error cycle, landing on the designed "submitted — under
 * review" success state.
 *
 * The `variant` prop remains the review harness's deep-link into one designed
 * step ('guardian'|'athlete'|'tier'|'consent'|'submitting'|'success') - a
 * demo mount seeds its step/phase from it once and then behaves exactly like
 * the real flow (Continue/Back still work in the gallery), matching every
 * other screen's real/demo split in this codebase.
 */
const STEP_INDEX = { guardian: 0, athlete: 1, tier: 2, consent: 3, submitting: 3, success: 3 };
const STEP_TITLES = ['Guardian contact', 'Athlete details', 'Choose a package', 'Consent and waiver'];

let athleteSeq = 0;
function newAthlete() {
  athleteSeq += 1;
  return { key: `new-${athleteSeq}`, name: '', dob: '', packageId: null, contractMinutes: null };
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Registration({ variant, bare = false, onBack, onFinish }) {
  const enrollment = useEnrollment();
  const demo = variant != null;

  const [step, setStep] = useState(demo ? STEP_INDEX[variant] ?? 0 : 0);
  const [phase, setPhase] = useState(
    demo && (variant === 'submitting' || variant === 'success') ? variant : 'form'
  );

  const [guardian, setGuardian] = useState({
    name: demo ? 'Dana Whitfield' : '',
    email: demo ? 'dana@email.com' : '',
    mobile: demo ? '(612) 555-0148' : '',
    relationship: '',
  });
  const [athletes, setAthletes] = useState([
    demo
      ? { key: 'demo-1', name: 'Jordan Whitfield', dob: '', packageId: null, contractMinutes: null }
      : newAthlete(),
  ]);
  const [emergencyContact, setEmergencyContact] = useState('');
  const [medical, setMedical] = useState('');
  const [consents, setConsents] = useState({ dataCollection: true, videoCapture: true, mediaRelease: false });
  const [signatureName, setSignatureName] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [infoSheet, setInfoSheet] = useState(null); // a consent id, or null

  const updateAthlete = (key, patch) =>
    setAthletes((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const addAthlete = () => setAthletes((prev) => [...prev, newAthlete()]);
  const removeAthlete = (key) => setAthletes((prev) => (prev.length > 1 ? prev.filter((a) => a.key !== key) : prev));

  const guardianValid =
    guardian.name.trim() !== '' && EMAIL_RE.test(guardian.email.trim()) && guardian.mobile.trim() !== '';
  const athletesValid = athletes.every((a) => a.name.trim() !== '' && a.dob !== '');
  const packagesValid = athletes.every((a) => a.packageId != null);
  const consentValid = consents.dataCollection && consents.videoCapture && signatureName.trim() !== '';

  const stepValid = [guardianValid, athletesValid, packagesValid, consentValid][step];

  const goBack = () => {
    if (step === 0) { if (onBack) onBack(); return; }
    setShowErrors(false);
    setStep((s) => s - 1);
  };

  const handleContinue = () => {
    if (!stepValid) { setShowErrors(true); return; }
    setShowErrors(false);
    if (step < 3) { setStep((s) => s + 1); return; }
    handleSubmit();
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setPhase('submitting');
    try {
      await enrollment.submit({
        guardian: { name: guardian.name.trim(), email: guardian.email.trim(), phone: guardian.mobile.trim() },
        athletes: athletes.map((a) => ({
          name: a.name.trim(),
          dob: a.dob || null,
          packageId: a.packageId,
          contractMinutes: a.contractMinutes,
        })),
        consents,
        // Carried alongside the pinned fields (contract v1.8 §A's schema has
        // no emergency-contact/medical field on enrollmentRequests - that
        // information already has a documented home once an athlete doc
        // exists, athletes/{id}/private/medical, TEAM.md's original v1
        // contract). Nothing typed by the guardian is silently dropped;
        // where it lands server-side is flagged as an open question in the
        // sprint report rather than assumed here.
        guardianNotes: { emergencyContact: emergencyContact.trim() || null, medical: medical.trim() || null },
      });
      setPhase('success');
    } catch (err) {
      setPhase('form');
      setSubmitError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'Enrollment could not be submitted. Check your connection and try again.'
      );
    }
  };

  if (phase === 'success') return <Success bare={bare} onFinish={onFinish} />;

  return (
    <PhoneFrame
      bare={bare}
      header={<StepHeader step={step} onBack={goBack} />}
      footer={
        <StepFooter
          phase={phase}
          step={step}
          stepValid={stepValid}
          onContinue={handleContinue}
          submitError={submitError}
        />
      }
    >
      <div style={{ padding: '20px 22px 24px', position: 'relative' }}>
        {step === 0 ? <GuardianStep guardian={guardian} onChange={setGuardian} showErrors={showErrors} /> : null}
        {step === 1 ? (
          <AthleteStep
            athletes={athletes}
            onUpdate={updateAthlete}
            onAdd={addAthlete}
            onRemove={removeAthlete}
            emergencyContact={emergencyContact}
            onEmergencyContact={setEmergencyContact}
            medical={medical}
            onMedical={setMedical}
            showErrors={showErrors}
          />
        ) : null}
        {step === 2 ? <PackageStep athletes={athletes} onUpdate={updateAthlete} showErrors={showErrors} /> : null}
        {step === 3 ? (
          <ConsentStep
            consents={consents}
            onChange={setConsents}
            signatureName={signatureName}
            onSignatureChange={setSignatureName}
            onOpenInfo={setInfoSheet}
            showErrors={showErrors}
          />
        ) : null}
      </div>

      {/*
        A blocking overlay, not just a button spinner: consent records are
        written before the account exists, so an interrupted submit leaves a
        family half-enrolled. The copy says why rather than just spinning.
      */}
      {phase === 'submitting' ? <SubmittingOverlay /> : null}

      {infoSheet ? <ConsentInfoSheet id={infoSheet} onClose={() => setInfoSheet(null)} /> : null}
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

function StepFooter({ phase, step, stepValid, onContinue, submitError }) {
  const submitting = phase === 'submitting';
  const label = submitting ? 'Submitting enrollment' : step === 3 ? 'Sign and submit' : 'Continue';

  return (
    <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
      {submitError ? (
        <Body size={12} tone={color.error} style={{ marginBottom: 10, textAlign: 'center' }}>
          {submitError}
        </Body>
      ) : null}
      <Button loading={submitting} disabled={submitting || !stepValid} onClick={onContinue}>
        {label}
      </Button>
    </div>
  );
}

function GuardianStep({ guardian, onChange, showErrors }) {
  const { data } = useEnrollmentForm();
  const set = (field) => (v) => onChange((prev) => ({ ...prev, [field]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field
        label="Guardian name"
        value={guardian.name}
        onChange={set('name')}
        error={showErrors && guardian.name.trim() === '' ? 'Guardian name is required.' : undefined}
      />
      <Field
        label="Email"
        type="email"
        value={guardian.email}
        onChange={set('email')}
        error={
          showErrors && !/^\S+@\S+\.\S+$/.test(guardian.email.trim())
            ? 'A valid email is required.'
            : undefined
        }
      />
      <Field
        label="Mobile"
        type="tel"
        value={guardian.mobile}
        onChange={set('mobile')}
        error={showErrors && guardian.mobile.trim() === '' ? 'A mobile number is required.' : undefined}
        hint="Used for schedule-change texts. You control this later in Notification Preferences."
      />
      <SelectField
        label="Relationship to athlete"
        value={guardian.relationship}
        options={data?.relationships ?? []}
        onChange={set('relationship')}
      />
    </div>
  );
}

/**
 * Athlete step - a real add/remove LIST (Sprint 10 pin A). The pinned
 * enrollmentRequests schema carries `athletes: [...]` for exactly this
 * reason: many families enroll more than one child in one pass. Emergency
 * contact and the medical note stay single, household-level fields exactly
 * as the design drew them (the pin lists only name/dob/package/tier as
 * per-athlete - asking for a separate emergency contact per child would be
 * inventing structure the design and the pinned schema do not have).
 */
function AthleteStep({
  athletes,
  onUpdate,
  onAdd,
  onRemove,
  emergencyContact,
  onEmergencyContact,
  medical,
  onMedical,
  showErrors,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {athletes.map((athlete, i) => (
        <Card key={athlete.key} large>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 13 }}>
            <SectionLabel style={{ flex: 1 }}>
              {athletes.length > 1 ? `Athlete ${i + 1}` : 'Athlete details'}
            </SectionLabel>
            {athletes.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemove(athlete.key)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '4px 2px',
                  font: `500 12px ${font.body}`,
                  color: color.error,
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field
              label="Athlete name"
              value={athlete.name}
              onChange={(v) => onUpdate(athlete.key, { name: v })}
              error={showErrors && athlete.name.trim() === '' ? 'Athlete name is required.' : undefined}
            />
            {/*
              Date of birth is required because it determines U13 vs U18
              eligibility - the error says so rather than just marking the
              field red, verbatim from the design.
            */}
            <Field
              label="Date of birth"
              type="date"
              value={athlete.dob}
              onChange={(v) => onUpdate(athlete.key, { dob: v })}
              error={
                showErrors && !athlete.dob
                  ? 'Date of birth is required — it determines U13 vs U18 eligibility.'
                  : undefined
              }
            />
          </div>
        </Card>
      ))}

      <button
        type="button"
        onClick={onAdd}
        style={{
          border: `1px dashed ${color.border}`,
          background: 'transparent',
          borderRadius: radius.card,
          padding: '15px 0',
          font: `500 13px ${font.body}`,
          color: color.primary,
          cursor: 'pointer',
        }}
      >
        + Add another athlete
      </button>

      <Field label="Emergency contact" value={emergencyContact} placeholder="Name and mobile" onChange={onEmergencyContact} />

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
          value={medical}
          onChange={(e) => onMedical(e.target.value)}
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
            boxSizing: 'border-box',
          }}
        />
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 9 }}>
          Visible to on-site coaching staff during live sessions only. Not shown in admin views.
        </Body>
      </Card>
    </div>
  );
}

/**
 * Package pick, per athlete (Sprint 10 pin A/B: athletes[].packageId,
 * athletes[].contractMinutes). Reuses the same catalogue PackageStep reads
 * (usePackages()) and the same PackageCard unit - golf packages, the Drop-in
 * single session, and the Elite tiers (which REPLACE a golf pick rather than
 * stacking, same rule as PackageStep). Fitness add-ons are deliberately not
 * offered here - they are a Sprint 11 concern once the membership/
 * permissions surface exists to assign them (TEAM.md, "QUEUED AS SPRINT
 * 10"/"move to Sprint 11"), and the pinned enrollmentRequests schema itself
 * carries only ONE packageId per athlete, not a golf+fitness combo. The
 * optional contract tier (20/45/95, contract v1.8 §B - these three numbers
 * are the pinned set, not invented) sits directly below each athlete's
 * package choice.
 */
function PackageStep({ athletes, onUpdate, showErrors }) {
  const { data: catalogue } = usePackages();
  const [activeKey, setActiveKey] = useState(athletes[0]?.key);
  const active = athletes.find((a) => a.key === activeKey) ?? athletes[0];
  if (!active) return null;

  const dropIn = catalogue?.dropIn ?? DROP_IN;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {athletes.length > 1 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {athletes.map((a, i) => {
            const on = a.key === active.key;
            const done = a.packageId != null;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setActiveKey(a.key)}
                style={{
                  height: 34,
                  padding: '0 14px',
                  borderRadius: radius.pill,
                  border: `1px solid ${on ? color.primary : color.border}`,
                  background: on ? color.primary : 'transparent',
                  font: `${on ? 600 : 500} 12px ${font.body}`,
                  color: on ? '#000' : done ? color.text : color.textTertiary,
                  cursor: 'pointer',
                }}
              >
                {a.name.trim() || `Athlete ${i + 1}`}
                {done ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
      ) : null}

      <SectionLabel>Golf package{active.name.trim() ? ` — ${active.name.trim()}` : ''}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: -6 }}>
        {(catalogue?.golf ?? []).map((p) => (
            <PackageCard
              key={p.id}
              pkg={p}
              selected={active.packageId === p.id}
              onSelect={() => onUpdate(active.key, { packageId: p.id })}
            />
          ))}
        {dropIn ? (
          <PackageCard
            pkg={dropIn}
            cadence="per session"
            selected={active.packageId === dropIn.id}
            onSelect={() => onUpdate(active.key, { packageId: dropIn.id })}
            footnote="No monthly commitment. Booking opens three days ahead rather than on the full schedule."
          />
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 4 }}>
        <SectionLabel>Or choose Elite</SectionLabel>
        <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>replaces the above</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: -6 }}>
        {(catalogue?.elite ?? []).map((t) => (
          <PackageCard
            key={t.id}
            pkg={t}
            emphasised
            selected={active.packageId === t.id}
            onSelect={() => onUpdate(active.key, { packageId: t.id })}
          />
        ))}
      </div>

      {showErrors && active.packageId == null ? (
        <Body size={12} tone={color.error}>
          Pick a package for {active.name.trim() || 'this athlete'} to continue.
        </Body>
      ) : null}

      <SectionLabel style={{ marginTop: 4 }}>Commitment Contract tier (optional)</SectionLabel>
      <ContractTierChoice value={active.contractMinutes} onSelect={(m) => onUpdate(active.key, { contractMinutes: m })} />
    </div>
  );
}

/** The pinned contract tier set (contract v1.8 §B: int in [20, 45, 95] or null) - not invented. */
const TIER_MINUTES = [20, 45, 95];

function ContractTierChoice({ value, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {TIER_MINUTES.map((m) => {
        const on = value === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : m)}
            style={{
              flex: 1,
              height: 54,
              borderRadius: radius.card,
              border: `1px solid ${on ? color.primary : color.border}`,
              background: on ? tint.green : color.surface,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <span style={{ font: `700 18px ${font.head}`, color: on ? color.primary : color.text }}>{m}</span>
            <span style={{ font: `400 10px ${font.body}`, color: color.textTertiary }}>min / day</span>
          </button>
        );
      })}
    </div>
  );
}

function ConsentStep({ consents, onChange, signatureName, onSignatureChange, onOpenInfo, showErrors }) {
  const { data } = useEnrollmentForm();
  const list = data?.consents ?? [];

  const set = (id, v) => onChange((prev) => ({ ...prev, [id]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <Body size={13}>
        Each athlete is a minor. Each of these is a separate decision — none is bundled into the others.
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
        <Body size={12} tone={color.error}>
          Data collection and video capture consent are required to enroll.
        </Body>
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

function ConsentInfoSheet({ id, onClose }) {
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
          {/*
            Leads into the onboarding walkthrough (/portal/welcome) rather than
            a cold dashboard — a family's first minutes in the portal are the
            guided practice run, per TEAM.md "Onboarding program v1".
          */}
          <Button onClick={onFinish}>Start the walkthrough</Button>
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
