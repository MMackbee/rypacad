import React, { useEffect, useRef, useState } from 'react';
import { color, font } from '../tokens';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { BackLink, Banner, Body, ScreenTitle } from '../components/Primitives';
import * as callables from '../hooks/callables';
import { verifySentNote } from '../data/authCopy';
import { todayISO } from '../data/calendar';
import { contractEnabled } from '../data/contractFlag';
import { SINGLE_TOKEN } from '../data/packages';
import { saleOpen } from '../data/singleToken';
import {
  EMAIL_RE, buildAddAthletesPayload, buildCreateFamilyPayload, contractAnswered, emptyEmergencyContact, facilityWaiverRequired,
  newAthleteEntry, restoredFacilityTick, toEmergencyForm, validateAthleteEntry, validateEmergencyContact,
} from '../data/signup';
import useFamilyAthletes from '../hooks/familyAthletes';
import { AthleteStep, ConsentStep, ConsentInfoSheet, ContactStep, ContractStep, PackageStep, SubmittingOverlay, WhoStep } from './RegistrationSteps';
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
 * 'signup' (who-are-you -> contact -> athletes -> package -> contract ->
 * consent -> createFamily) and 'link' (a provisioned parent adding athletes:
 * athletes -> package -> contract -> addAthletes). The Commitment Contract
 * is its own step since owner feedback 2026-09-30; drafts saved before it
 * keep their step numbers, so an old consent-step draft reopens on the
 * contract step with its consents kept. No approval queue: the callable
 * writes the family in one transaction and `onRefresh` (useAuthSession().refresh) flips
 * `provisioned` without a reload - but only when the family LEAVES the
 * Success receipt (`finish`), never on submit: RegistrationRoute redirects
 * a provisioned account to its landing, so refreshing on submit would
 * unmount the receipt (pay buttons, child-login steps) before it rendered.
 * `variant` remains the harness deep-link. `verifySent` ({ email, mailed },
 * from SignUp's navigation state) shows the verification note on step 1, since
 * a new login now lands here without stopping on SignUp's card.
 *
 * Hidden contract (owner ruling 2026-09-30, data/contractFlag.js): with the
 * flag off the contract step does not exist - sign-up is 5 steps, link mode
 * 2 - and every athlete is sent with contractMinutes null. A draft saved on
 * the 6-step layout reopens clamped to the last step; its contract answers
 * are ignored. The harness's `contract` variant forces the step on.
 */
const STEPS = {
  signup: [['who', 'Who are you'], ['contact', 'Contact'], ['athletes', 'Athletes'], ['package', 'Choose a package'],
    ['contract', 'Commitment Contract'], ['consent', 'Consent and waiver']],
  link: [['athletes', 'Athletes'], ['package', 'Choose a package'], ['contract', 'Commitment Contract']],
};
const stepsFor = (mode, contract) =>
  (STEPS[mode] || STEPS.signup).filter(([id]) => contract || id !== 'contract');
/** Harness deep links, by step id so they survive the contract step coming and going. */
const VARIANT_STEP = {
  guardian: 'contact', athlete: 'athletes', tier: 'package', contract: 'contract', consent: 'consent', submitting: 'consent', success: 'consent',
};

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
/**
 * Still draft v1: one from before the split emergency fields holds one
 * string (it restores into the name field), one from before the facility
 * add-on (owner 2026-09-30) restores unticked, and one from when the tick
 * was per athlete restores the family tick if any athlete had it.
 */
function restoreForm(f) {
  return { ...f, emergencyContact: toEmergencyForm(f.emergencyContact), facilityRequested: restoredFacilityTick(f) };
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

export default function Registration({ variant, bare = false, mode = 'signup', account = null, verifySent = null, onRefresh, onBack, onFinish }) {
  const demo = variant != null;
  const withContract = contractEnabled() || variant === 'contract';
  const steps = stepsFor(mode, withContract);
  const today = todayISO();
  const key = demo ? null : draftKey(mode, account);
  const [draft] = useState(() => readDraft(key));
  const [step, setStep] = useState(demo
    ? Math.max(0, steps.findIndex(([id]) => id === VARIANT_STEP[variant]))
    : Math.min(Math.max(draft?.step ?? 0, 0), steps.length - 1));
  const [phase, setPhase] = useState(demo && (variant === 'submitting' || variant === 'success') ? variant : 'form');
  const [form, setForm] = useState(() => (draft?.form ? restoreForm(draft.form) : {
    mode: demo ? 'parent' : mode === 'link' ? 'parent' : null,
    contact: { name: demo ? 'Dana Whitfield' : '', email: demo ? 'dana@email.com' : account?.email ?? '', phone: demo ? '(612) 555-0148' : '', relationship: '' },
    athletes: [demo ? { ...newAthleteEntry(), key: 'demo-1', name: 'Jordan Whitfield' } : newAthleteEntry()],
    facilityRequested: false, // the ONE family facility tick (owner ruling 2026-09-30)
    emergencyContact: emptyEmergencyContact(),
    medical: '',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: '',
  }));
  const [showErrors, setShowErrors] = useState(false);
  const [errorTick, setErrorTick] = useState(0); // bumps on every invalid Continue
  const contentRef = useRef(null);
  const [submitError, setSubmitError] = useState(null); // { message, reason } of the last refused submit
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

  // The steps share PhoneFrame's one scroller: without this, each step opened
  // at the previous one's scroll position, with its tabs and heading off
  // screen (UX review 2026-09-30). Scrolls the frame only, never the page.
  useEffect(() => {
    const scroller = contentRef.current?.parentElement;
    if (scroller) scroller.scrollTop = 0;
  }, [step]);

  // An invalid Continue brings the first message into view: errors render
  // inline, so one below the fold made Continue look dead.
  useEffect(() => {
    if (!errorTick) return;
    contentRef.current?.querySelector('[data-field-error]')?.scrollIntoView?.({ block: 'center' });
  }, [errorTick]);

  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const setContact = (fn) => setForm((f) => ({ ...f, contact: typeof fn === 'function' ? fn(f.contact) : fn }));
  const setConsents = (fn) => setForm((f) => ({ ...f, consents: typeof fn === 'function' ? fn(f.consents) : fn }));
  const setEmergency = (p) => setForm((f) => ({ ...f, emergencyContact: { ...toEmergencyForm(f.emergencyContact), ...p } }));
  // A refused login email (the function's child-email-* reasons: pending,
  // already a login, the guardian's own) is stale once that login changes, so
  // it clears then, not only on the next submit (tester 2026-09-30: it stayed
  // red after Own login went off). Any other refusal stays until the submit.
  const clearLoginRefusal = () => setSubmitError((e) => (e && /^child-email-/.test(e.reason || '') ? null : e));
  const updateAthlete = (key, p) => {
    if ('ownLogin' in p || 'loginEmail' in p) clearLoginRefusal();
    setForm((f) => ({ ...f, athletes: f.athletes.map((a) => (a.key === key ? { ...a, ...p } : a)) }));
  };
  const addAthlete = () => setForm((f) => ({ ...f, athletes: [...f.athletes, newAthleteEntry()] }));
  const removeAthlete = (key) => {
    if (form.athletes.length > 1 && form.athletes.find((a) => a.key === key)?.ownLogin) clearLoginRefusal();
    setForm((f) => ({ ...f, athletes: f.athletes.length > 1 ? f.athletes.filter((a) => a.key !== key) : f.athletes }));
  };
  const switchToParent = () => { patch({ mode: 'parent' }); setStep(0); setShowErrors(false); };
  const setMode = (m) => setForm((f) => ({ ...f, mode: m, athletes: m === 'athlete' ? f.athletes.slice(0, 1) : f.athletes }));

  const stepId = steps[step][0];
  // History state outlives a sign-out, so the note shows only to the account
  // it was written for. Green would read as a selected choice card on this
  // step, so a sent note is neutral here (review 2026-09-30).
  const ownNote = step === 0 && verifySent?.email && account?.email
    && verifySent.email.toLowerCase() === account.email.toLowerCase();
  const note = ownNote ? verifySentNote(verifySent) : null;
  const athleteErrors = form.athletes.map((a) =>
    validateAthleteEntry(a, { todayISO: today, guardianEmail: form.contact.email, siblings: form.athletes, mode: form.mode || 'parent', contract: withContract })
  );
  const emergencyOk = Object.keys(validateEmergencyContact(form.emergencyContact)).length === 0;
  // A family that kept the facility add-on makes its waiver required.
  const facilityRequired = facilityWaiverRequired(form);
  // Link mode: the family being added to may already have facility access
  // or have asked for it, and is then not offered the add-on again.
  const household = useFamilyAthletes(account?.householdId, !demo && mode === 'link');
  const valid = {
    who: form.mode != null,
    contact: form.contact.name.trim() !== '' && EMAIL_RE.test(form.contact.email.trim()) && form.contact.phone.trim() !== '',
    athletes: athleteErrors.every((e) => !e.name && !e.dob && !e.handicap && !e.loginEmail) && emergencyOk,
    // A restored draft may hold the single token from before it is on sale
    // (owner ruling 2026-10-01: from the booking-open gate, by the clock).
    package: form.athletes.every((a) => a.packageId != null) && athleteErrors.every((e) => !e.packageId)
      && form.athletes.every((a) => a.packageId !== SINGLE_TOKEN.id || saleOpen()),
    contract: form.athletes.every(contractAnswered),
    consent: form.consents.dataCollection && form.consents.videoCapture && form.signatureName.trim() !== ''
      && (!facilityRequired || form.consents.facilityAccess === true),
  }[stepId];

  const goBack = () => {
    if (step === 0) { if (onBack) onBack(); return; }
    setShowErrors(false);
    setStep((s) => s - 1);
  };
  const handleContinue = () => {
    if (!valid) { setShowErrors(true); setErrorTick((n) => n + 1); return; }
    // A pre-split draft restored past the athletes step can carry a contact
    // with no mobile: send the family back to it, not into the refusal.
    if (step === steps.length - 1 && !emergencyOk) {
      setStep(steps.findIndex(([id]) => id === 'athletes'));
      setShowErrors(true);
      setErrorTick((n) => n + 1);
      return;
    }
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
        ? await callAddAthletes(buildAddAthletesPayload(form, { contract: withContract }))
        : await callCreateFamily(buildCreateFamilyPayload(form, { contract: withContract }));
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
      // An invited child who still reached the form: the parent already
      // enrolled them, and createFamily's "tap Check again" names a button
      // that is not here. The verify screen claims the invite instead.
      if (err && err.reason === 'invite-open' && onFinish) {
        submitting.current = false;
        writeDraft(key, null);
        onFinish('/portal/not-provisioned');
        return;
      }
      submitting.current = false;
      setPhase('form');
      setSubmitError({
        message: err && typeof err.message === 'string' && err.message ? err.message : 'Sign-up could not be saved. Try again.',
        reason: (err && err.reason) || null,
      });
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
  // Beside the button, so a tap never looks like it did nothing. The who step
  // has no field to mark red.
  const fixNote = showErrors && !valid
    ? stepId === 'who' ? 'Choose one above to continue.' : "Something above needs fixing - it's marked in red."
    : null;
  return (
    <PhoneFrame
      bare={bare}
      header={<StepHeader step={step} steps={steps} onBack={goBack} />}
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          {submitError || fixNote ? <Body size={12} tone={color.error} style={{ marginBottom: 10, textAlign: 'center' }}>{submitError ? submitError.message : fixNote}</Body> : null}
          {/* Never disabled for an invalid step: the tap is what reveals which
              field needs fixing (handleContinue sets showErrors). A greyed-out
              button with no message stranded parents (launch test 2026-09-29). */}
          <Button loading={phase === 'submitting'} disabled={phase === 'submitting'} onClick={handleContinue}>{label}</Button>
        </div>
      }
    >
      <div ref={contentRef} style={{ padding: '20px 22px 24px', position: 'relative' }}>
        {note ? <Banner tone={note.tone === 'green' ? 'neutral' : note.tone} title={note.title} style={{ marginBottom: 18 }}>{note.body}</Banner> : null}
        {stepId === 'who' ? <WhoStep mode={form.mode} onChange={setMode} /> : null}
        {stepId === 'contact' ? <ContactStep mode={form.mode} contact={form.contact} onChange={setContact} showErrors={showErrors} /> : null}
        {stepId === 'athletes' ? (
          <AthleteStep mode={form.mode || 'parent'} linkMode={mode === 'link'} athletes={form.athletes} onUpdate={updateAthlete} onAdd={addAthlete}
            onRemove={removeAthlete} emergencyContact={form.emergencyContact} onEmergencyContact={setEmergency}
            medical={form.medical} onMedical={(v) => patch({ medical: v })} showErrors={showErrors}
            todayISO={today} guardianEmail={form.contact.email} onSwitchToParent={switchToParent} />
        ) : null}
        {stepId === 'package' ? (
          <PackageStep athletes={form.athletes} onUpdate={updateAthlete} showErrors={showErrors} mode={form.mode || 'parent'}
            facility={form.facilityRequested === true} onFacility={(v) => patch({ facilityRequested: v })} household={household} />
        ) : null}
        {stepId === 'contract' ? (
          <ContractStep mode={form.mode || 'parent'} athletes={form.athletes} onUpdate={updateAthlete} showErrors={showErrors} todayISO={today} />
        ) : null}
        {stepId === 'consent' ? (
          <ConsentStep mode={form.mode} consents={form.consents} onChange={setConsents} signatureName={form.signatureName}
            onSignatureChange={(v) => patch({ signatureName: v })} onOpenInfo={setInfoSheet} showErrors={showErrors}
            facilityRequired={facilityRequired} />
        ) : null}
      </div>
      {phase === 'submitting' ? <SubmittingOverlay mode={mode} /> : null}
      {infoSheet ? <ConsentInfoSheet id={infoSheet} mode={form.mode} onClose={() => setInfoSheet(null)} /> : null}
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
