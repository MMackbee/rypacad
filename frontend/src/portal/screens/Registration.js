import React, { useEffect, useRef, useState } from 'react';
import { color, font } from '../tokens';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { BackLink, Body, ScreenTitle } from '../components/Primitives';
import * as callables from '../hooks/callables';
import { todayISO } from '../data/calendar';
import { SINGLE_ON_SALE, SINGLE_TOKEN } from '../data/packages';
import { EMAIL_RE, buildAddAthletesPayload, buildCreateFamilyPayload, newAthleteEntry, validateAthleteEntry } from '../data/signup';
import { AthleteStep, ConsentStep, ConsentInfoSheet, ContactStep, PackageStep, SubmittingOverlay, WhoStep } from './RegistrationSteps';
import RegistrationSuccess from './RegistrationSuccess';

/**
 * Sprint 20 (D14): hooks/callables.js is routing Task 6 (first merge group),
 * so the module is on disk; this guards a partial export while the two lanes
 * integrate. The fallback rejects the way the real client would on a dead
 * function, so the form shows a plain error rather than a stack trace.
 */
function notWired(name) {
  return async () => {
    const err = new Error(`${name} is not available yet. Try again in a minute.`);
    err.reason = 'not-wired';
    throw err;
  };
}
const callCreateFamily = callables.callCreateFamily || notWired('createFamily');
const callAddAthletes = callables.callAddAthletes || notWired('addAthletes');

/**
 * 02 · Registration (Sprint 20, spec 2.1) - signed-in, instant. Two modes:
 * 'signup' (who-are-you -> contact -> athletes -> package -> consent ->
 * createFamily) and 'link' (a provisioned parent adding athletes: athletes
 * -> package -> addAthletes). No approval queue: the callable writes the
 * family in one transaction and `onRefresh` (useAuthSession().refresh) flips
 * `provisioned` without a reload - but only when the family LEAVES the
 * Success receipt (`finish`), never on submit: RegistrationRoute redirects
 * a provisioned account to its landing, so refreshing on submit would
 * unmount the receipt (pay buttons, child-login steps) before it rendered.
 * `variant` remains the harness deep-link.
 */
const STEPS = {
  signup: [['who', 'Who are you'], ['contact', 'Contact'], ['athletes', 'Athletes'], ['package', 'Choose a package'], ['consent', 'Consent and waiver']],
  link: [['athletes', 'Athletes'], ['package', 'Choose a package']],
};
const VARIANT_STEP = { guardian: 1, athlete: 2, tier: 3, consent: 4, submitting: 4, success: 4 };

/**
 * The half-filled form survives a reload (launch 2026-09-29: on a phone,
 * switching apps to look up a handicap can reload the tab and every field was
 * lost). sessionStorage, keyed by the signed-in uid and mode: it dies with the
 * tab, so a shared computer never keeps a child's details, and it is cleared
 * on success. Storage can be missing or full - every access is guarded.
 */
function draftKey(mode, account) {
  return account?.uid ? `ryp.signupDraft.${mode}.${account.uid}` : null;
}
function readDraft(key) {
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    const draft = raw ? JSON.parse(raw) : null;
    return draft && draft.v === 1 && draft.form && Number.isInteger(draft.step) ? draft : null;
  } catch (err) {
    return null;
  }
}
function writeDraft(key, value) {
  if (!key) return;
  try {
    if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
    else window.sessionStorage.removeItem(key);
  } catch (err) {
    /* private mode / quota: the form still works, it just won't survive a reload */
  }
}

export default function Registration({ variant, bare = false, mode = 'signup', account = null, onRefresh, onBack, onFinish }) {
  const demo = variant != null;
  const steps = STEPS[mode] || STEPS.signup;
  const today = todayISO();
  const key = demo ? null : draftKey(mode, account);
  const [draft] = useState(() => readDraft(key));
  const [step, setStep] = useState(demo ? VARIANT_STEP[variant] ?? 0 : Math.min(draft?.step ?? 0, steps.length - 1));
  const [phase, setPhase] = useState(demo && (variant === 'submitting' || variant === 'success') ? variant : 'form');
  const [form, setForm] = useState(() => draft?.form ?? ({
    mode: demo ? 'parent' : mode === 'link' ? 'parent' : null,
    contact: { name: demo ? 'Dana Whitfield' : '', email: demo ? 'dana@email.com' : account?.email ?? '', phone: demo ? '(612) 555-0148' : '', relationship: '' },
    athletes: [demo ? { ...newAthleteEntry(), key: 'demo-1', name: 'Jordan Whitfield' } : newAthleteEntry()],
    emergencyContact: '',
    medical: '',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: '',
  }));
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [infoSheet, setInfoSheet] = useState(null);
  const [result, setResult] = useState(demo ? { householdId: 'demo', athleteIds: ['demo-1'] } : null);

  // The auth email arrives after mount on a restored session: prefill once, never overwrite typing.
  useEffect(() => {
    if (account?.email && form.contact.email === '') setForm((f) => ({ ...f, contact: { ...f.contact, email: account.email } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.email]);

  // Keep the draft current while the form is being filled; drop it once the
  // family exists (the receipt and the home banner take over from there).
  useEffect(() => {
    if (phase === 'form') writeDraft(key, { v: 1, step, form });
    else if (phase === 'success') writeDraft(key, null);
  }, [key, phase, step, form]);

  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const setContact = (fn) => setForm((f) => ({ ...f, contact: typeof fn === 'function' ? fn(f.contact) : fn }));
  const setConsents = (fn) => setForm((f) => ({ ...f, consents: typeof fn === 'function' ? fn(f.consents) : fn }));
  const updateAthlete = (key, p) => setForm((f) => ({ ...f, athletes: f.athletes.map((a) => (a.key === key ? { ...a, ...p } : a)) }));
  const addAthlete = () => setForm((f) => ({ ...f, athletes: [...f.athletes, newAthleteEntry()] }));
  const removeAthlete = (key) => setForm((f) => ({ ...f, athletes: f.athletes.length > 1 ? f.athletes.filter((a) => a.key !== key) : f.athletes }));
  const switchToParent = () => { patch({ mode: 'parent' }); setStep(0); setShowErrors(false); };
  const setMode = (m) => setForm((f) => ({ ...f, mode: m, athletes: m === 'athlete' ? f.athletes.slice(0, 1) : f.athletes }));

  const stepId = steps[step][0];
  const athleteErrors = form.athletes.map((a) =>
    validateAthleteEntry(a, { todayISO: today, guardianEmail: form.contact.email, siblings: form.athletes, mode: form.mode || 'parent' })
  );
  const valid = {
    who: form.mode != null,
    contact: form.contact.name.trim() !== '' && EMAIL_RE.test(form.contact.email.trim()) && form.contact.phone.trim() !== '',
    athletes: athleteErrors.every((e) => !e.name && !e.dob && !e.handicap && !e.loginEmail),
    // A restored draft may hold the single token from before it went off sale.
    package: form.athletes.every((a) => a.packageId != null) && athleteErrors.every((e) => !e.packageId && !e.contractMinutes)
      && form.athletes.every((a) => a.packageId !== SINGLE_TOKEN.id || SINGLE_ON_SALE),
    consent: form.consents.dataCollection && form.consents.videoCapture && form.signatureName.trim() !== '',
  }[stepId];

  const goBack = () => {
    if (step === 0) { if (onBack) onBack(); return; }
    setShowErrors(false);
    setStep((s) => s - 1);
  };
  const handleContinue = () => {
    if (!valid) { setShowErrors(true); return; }
    setShowErrors(false);
    if (step < steps.length - 1) { setStep((s) => s + 1); return; }
    handleSubmit();
  };
  // A double tap fires twice before React re-renders the disabled button; the
  // second call used to reach createFamily, come back already-provisioned and
  // redirect home over the receipt. One submit in flight at a time.
  const submitting = useRef(false);
  const handleSubmit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setSubmitError(null);
    setPhase('submitting');
    try {
      const res = mode === 'link'
        ? await callAddAthletes(buildAddAthletesPayload(form))
        : await callCreateFamily(buildCreateFamilyPayload(form));
      setResult(res);
      setPhase('success');
    } catch (err) {
      // A retry after a lost response: the family exists already. Refresh so
      // the route lands the account on its home, whose banner has Pay now.
      if (err && err.reason === 'already-provisioned' && onRefresh) {
        writeDraft(key, null);
        await onRefresh();
        return;
      }
      submitting.current = false;
      setPhase('form');
      setSubmitError(err && typeof err.message === 'string' && err.message ? err.message : 'Sign-up could not be saved. Try again.');
    }
  };
  // Leaving the receipt: flip `provisioned` now (the route lands the role's
  // home either way) - never earlier, see the component comment.
  const finish = async (path) => {
    if (onRefresh) await onRefresh();
    if (onFinish) onFinish(path);
  };

  if (phase === 'success') {
    return <RegistrationSuccess bare={bare} mode={mode} form={form} result={result} account={account} onFinish={finish} />;
  }

  const label = phase === 'submitting' ? (mode === 'link' ? 'Adding athlete' : 'Creating your account')
    : step < steps.length - 1 ? 'Continue' : mode === 'link' ? 'Add athlete' : 'Sign and submit';
  return (
    <PhoneFrame
      bare={bare}
      header={<StepHeader step={step} steps={steps} onBack={goBack} />}
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          {submitError ? <Body size={12} tone={color.error} style={{ marginBottom: 10, textAlign: 'center' }}>{submitError}</Body> : null}
          {/* Never disabled for an invalid step: the tap is what reveals which
              field needs fixing (handleContinue sets showErrors). A greyed-out
              button with no message stranded parents (launch test 2026-09-29). */}
          <Button loading={phase === 'submitting'} disabled={phase === 'submitting'} onClick={handleContinue}>{label}</Button>
        </div>
      }
    >
      <div style={{ padding: '20px 22px 24px', position: 'relative' }}>
        {stepId === 'who' ? <WhoStep mode={form.mode} onChange={setMode} /> : null}
        {stepId === 'contact' ? <ContactStep mode={form.mode} contact={form.contact} onChange={setContact} showErrors={showErrors} /> : null}
        {stepId === 'athletes' ? (
          <AthleteStep mode={form.mode || 'parent'} athletes={form.athletes} onUpdate={updateAthlete} onAdd={addAthlete} onRemove={removeAthlete}
            emergencyContact={form.emergencyContact} onEmergencyContact={(v) => patch({ emergencyContact: v })}
            medical={form.medical} onMedical={(v) => patch({ medical: v })} showErrors={showErrors}
            todayISO={today} guardianEmail={form.contact.email} onSwitchToParent={switchToParent} />
        ) : null}
        {stepId === 'package' ? <PackageStep athletes={form.athletes} onUpdate={updateAthlete} showErrors={showErrors} /> : null}
        {stepId === 'consent' ? (
          <ConsentStep mode={form.mode} consents={form.consents} onChange={setConsents} signatureName={form.signatureName}
            onSignatureChange={(v) => patch({ signatureName: v })} onOpenInfo={setInfoSheet} showErrors={showErrors} />
        ) : null}
      </div>
      {phase === 'submitting' ? <SubmittingOverlay mode={mode} /> : null}
      {infoSheet ? <ConsentInfoSheet id={infoSheet} onClose={() => setInfoSheet(null)} /> : null}
    </PhoneFrame>
  );
}

function StepHeader({ step, steps, onBack }) {
  return (
    <div style={{ padding: '12px 22px 14px', borderBottom: `1px solid ${color.frameRule}` }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <BackLink onClick={onBack}>‹ Back</BackLink>
        <div style={{ flex: 1 }} />
        <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>Step {step + 1} of {steps.length}</span>
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 13 }}>
        {steps.map(([id], i) => <div key={id} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? color.primary : color.rule }} />)}
      </div>
      <ScreenTitle size={24} style={{ marginTop: 12 }}>{steps[step][1]}</ScreenTitle>
    </div>
  );
}
