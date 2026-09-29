# Frontend - Sprint 20 Implementation Plan (part 1c of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This is part 1c.** Header, Global Constraints, the Day-2 sequencing note and the list of names not in the contract live in `20-frontend.md`; Tasks 3-4 in `20-frontend-part1b.md`; every constraint there applies here. Part 1c consumes `renderScreen` (Task 1), the `data/signup.js` helpers (Task 2), the `data/authCopy.js` strings (Task 3) and the step components (Task 4). **Task 5 starts on a RED worktree** left by Task 4 (see the note at the end of part 1b) - no handoff happens between them.

---

### Task 5: Registration state machine - createFamily / addAthletes, provisioned redirect, link mode (closes part of #8, part of #12)

**Starts RED.** Task 4 cut the step components out of `Registration.js` and did not commit; this task is the other half of that refactor. The same worker runs it immediately after Task 4 - no handoff, review or PM gate in between - and Step 7 below is the first commit for both files.

**Files:**
- Modify: `frontend/src/portal/screens/Registration.js` (rewrite; target under 300 lines), `frontend/src/portal/PortalRoutes.js:501-515,688-697`
- Test: `frontend/src/portal/screens/Registration.test.js`

**Interfaces:**
- Consumes: `callCreateFamily(payload) -> Promise<{ householdId, athleteIds }>`, `callAddAthletes(payload)` from `hooks/callables.js` (contract 1.1-1.3; rejections are `LiveDataError` with `reason`; imported through the D14 namespace guard written out in `20-frontend.md` "Day-2 sequencing"); `useAuthSession().refresh()` (contract 4.1); step components (Task 4); builders (Task 2); `RegistrationSuccess` (Task 6 - until it exists, the `success` phase renders `null`; Task 6 wires it).
- Produces (new, not in contract): `Registration({ variant, bare, mode: 'signup'|'link', account: { email, emailVerified } | null, onRefresh, onBack, onFinish(path) })`; `PortalRoutes.js#RegistrationRoute`; `/portal/settings` "Link another athlete" navigates `('/portal/register', { state: { link: true } })`.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/screens/Registration.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import Registration from './Registration';

const mockCalls = [];
jest.mock('../hooks/callables', () => ({
  callCreateFamily: async (payload) => { mockCalls.push(['createFamily', payload]); return { householdId: 'h1', athleteIds: ['a1'] }; },
  callAddAthletes: async (payload) => { mockCalls.push(['addAthletes', payload]); return { householdId: 'h1', athleteIds: ['a2'] }; },
  callCreateCheckoutSession: async () => ({ url: 'https://checkout.stripe.test/x' }),
}), { virtual: true });
jest.mock('./RegistrationSuccess', () => ({ __esModule: true, default: ({ result }) => `SUCCESS ${result.athleteIds.join(',')}` }));

beforeEach(() => { mockCalls.length = 0; });

async function fillParentToConsent(r) {
  await r.click('Parent or guardian');
  await r.click('Continue');
  expect(r.container.querySelector('[aria-label="Email"]').value).toBe('dana@email.com'); // prefilled from auth
  await r.fill('Your name', 'Dana Whitfield');
  await r.fill('Mobile', '(612) 555-0148');
  await r.fill('Relationship to athlete', 'Mother');
  await r.click('Continue');
  await r.fill('Athlete name', 'Jordan');
  await r.fill('Date of birth', '2012-06-17');
  await r.fill('Handicap', '12');
  await r.click('Continue');
  await r.click('12 tokens');
  await r.click('Continue');
  await r.fill('Type your full legal name', 'Dana Whitfield');
}

test('parent sign-up calls createFamily with the contract payload, refreshes, shows success', async () => {
  const refreshed = [];
  const r = await renderScreen(
    <Registration bare mode="signup" account={{ email: 'dana@email.com', emailVerified: false }} onRefresh={async () => refreshed.push(1)} />
  );
  expect(r.text()).toContain('Step 1 of 5');
  await fillParentToConsent(r);
  await r.click('Sign and submit');
  expect(mockCalls[0][0]).toBe('createFamily');
  expect(mockCalls[0][1]).toMatchObject({
    mode: 'parent',
    contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [{ name: 'Jordan', dob: '2012-06-17', packageId: 't-12', handicap: 12, loginEmail: null, contractMinutes: null }],
    signatureName: 'Dana Whitfield',
  });
  expect(refreshed).toHaveLength(1);
  expect(r.text()).toContain('SUCCESS a1');
  await r.unmount();
});

test('link mode skips to athletes and calls addAthletes', async () => {
  const r = await renderScreen(<Registration bare mode="link" account={{ email: 'dana@email.com' }} />);
  expect(r.text()).toContain('Step 1 of 2');
  await r.fill('Athlete name', 'Reese');
  await r.fill('Date of birth', '2014-03-02');
  await r.click('Continue');
  await r.click('6 tokens');
  await r.click('Add athlete');
  expect(mockCalls[0][0]).toBe('addAthletes');
  expect(mockCalls[0][1]).toEqual({ athletes: [{ name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null }], medical: null });
  await r.unmount();
});
```
(`PackageCard`'s clickable root, `components/PackageCard.js:35-39`, is a `<div role="button" tabIndex={0} aria-pressed={selected} onClick={onSelect} onKeyDown={...}>` - already keyboard-operable, NOT a `<button>`, and its text content is the name plus the entitlement line, so a text match never equals `12 tokens`. The ONE edit this task makes to that file is adding `aria-label={pkg.name}` to that root div, directly after `aria-pressed={selected}` (line 38), so it reads `<div role="button" tabIndex={0} aria-pressed={selected} aria-label={pkg.name} onClick={onSelect} ...>`. `renderScreen.button()` (Task 1) matches `[role="button"]` by `aria-label`, so `r.click('12 tokens')` / `r.click('6 tokens')` resolve to the card. No other role/aria change is needed; `SelectDot` stays `aria-hidden`.)

- [ ] **Step 2: Run it** - Expected: FAIL (`Step 1 of 5` not found; `mode` prop unknown).

- [ ] **Step 3: Rewrite `Registration.js`**

```js
import React, { useEffect, useState } from 'react';
import { color, font } from '../tokens';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { BackLink, Body, ScreenTitle } from '../components/Primitives';
import * as callables from '../hooks/callables';
import { todayISO } from '../data/calendar';
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
 * `provisioned` without a reload. `variant` remains the harness deep-link.
 */
const STEPS = {
  signup: [['who', 'Who are you'], ['contact', 'Contact'], ['athletes', 'Athletes'], ['package', 'Choose a package'], ['consent', 'Consent and waiver']],
  link: [['athletes', 'Athletes'], ['package', 'Choose a package']],
};
const VARIANT_STEP = { guardian: 1, athlete: 2, tier: 3, consent: 4, submitting: 4, success: 4 };

export default function Registration({ variant, bare = false, mode = 'signup', account = null, onRefresh, onBack, onFinish }) {
  const demo = variant != null;
  const steps = STEPS[mode] || STEPS.signup;
  const today = todayISO();
  const [step, setStep] = useState(demo ? VARIANT_STEP[variant] ?? 0 : 0);
  const [phase, setPhase] = useState(demo && (variant === 'submitting' || variant === 'success') ? variant : 'form');
  const [form, setForm] = useState(() => ({
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
    package: form.athletes.every((a) => a.packageId != null) && athleteErrors.every((e) => !e.packageId && !e.contractMinutes),
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
  const handleSubmit = async () => {
    setSubmitError(null);
    setPhase('submitting');
    try {
      const res = mode === 'link'
        ? await callAddAthletes(buildAddAthletesPayload(form))
        : await callCreateFamily(buildCreateFamilyPayload(form));
      if (onRefresh) await onRefresh();
      setResult(res);
      setPhase('success');
    } catch (err) {
      setPhase('form');
      setSubmitError(err && typeof err.message === 'string' && err.message ? err.message : 'Sign-up could not be saved. Try again.');
    }
  };

  if (phase === 'success') {
    return <RegistrationSuccess bare={bare} mode={mode} form={form} result={result} account={account} onFinish={onFinish} />;
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
          <Button loading={phase === 'submitting'} disabled={phase === 'submitting' || !valid} onClick={handleContinue}>{label}</Button>
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
```
Until Task 6 creates `RegistrationSuccess.js`, create it as a placeholder that Task 6 replaces: `export default function RegistrationSuccess() { return null; }`.

- [ ] **Step 4: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/Registration.test.js` - Expected: PASS (2 tests).

- [ ] **Step 5: PortalRoutes - RegistrationRoute and the link-mode entry**

Replace the `register` route element (`PortalRoutes.js:501-515`) with `element={<RegistrationRoute />}` and add, beside `MembershipRoute`:
```js
/**
 * Sprint 20 (spec 2.1): /portal/register is instant and signed-in. A
 * provisioned account is redirected to its landing - except a parent who
 * arrived from Settings' "Link another athlete" (navigation state `link`),
 * who gets the athletes-only flow that calls addAthletes.
 */
function RegistrationRoute() {
  const live = isLive();
  const { user, provisioned, loading, refresh } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { state } = useLocation();
  const navigate = useNavigate();
  const linkMode = Boolean(state?.link);
  if (live && loading) return null;
  if (live && !user) return <Navigate to="/portal/signin" replace />;
  if (live && provisioned && !(linkMode && user.role === 'parent')) return <Navigate to={landingFor(user)} replace />;
  return (
    <Registration
      bare
      mode={linkMode ? 'link' : 'signup'}
      account={live ? user : null}
      onRefresh={live ? refresh : undefined}
      onBack={() => navigate(linkMode ? '/portal/settings' : '/portal/signin')}
      onFinish={(path) => navigate(path, { replace: true })}
    />
  );
}
```
Delete `RequireSignedIn` (`:104-111`, its only caller is gone). Settings route (`:694`): `onLinkAthlete={() => navigate('/portal/register', { state: { link: true } })}`. The harness (`StatesHarness.js:102`) keeps mounting `Registration` with `variant` - unchanged.

- [ ] **Step 6: Verify** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal` (PASS) and `cd frontend && npx eslint src/portal/screens/Registration.js src/portal/screens/RegistrationSteps.js src/portal/PortalRoutes.js` (clean). `wc -l frontend/src/portal/screens/Registration.js` under 300.

- [ ] **Step 7: Commit**
```bash
git add frontend/src/portal/screens/Registration.js frontend/src/portal/screens/Registration.test.js frontend/src/portal/screens/RegistrationSteps.js frontend/src/portal/screens/RegistrationSteps.test.js frontend/src/portal/screens/RegistrationSuccess.js frontend/src/portal/PortalRoutes.js frontend/src/portal/components/PackageCard.js
git commit -m "feat(registration): who-are-you, contact prefill, handicap + own login, createFamily/addAthletes, link mode route (#8)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: PayButton + Registration Success with per-athlete pay buttons (closes part of #8, part of #12)

**Files:**
- Create: `frontend/src/portal/components/PayButton.js`
- Modify: `frontend/src/portal/screens/RegistrationSuccess.js` (replace the Task 5 placeholder)
- Test: `frontend/src/portal/components/PayButton.test.js`, `frontend/src/portal/screens/RegistrationSuccess.test.js`

**Interfaces:**
- Consumes: `callCreateCheckoutSession({ athleteId, product }) -> Promise<{ url }>` (contract 1.5; `reason` `'email-unverified'` | `'already-active'` | `'price-missing'` | `'stripe-error'` ...); `useAuthSession().resendVerification()`, `refresh()` (contract 4.1); `bookingOpen`, `BOOKING_OPENS_LABEL` (contract 3.1); `packageById` (`packages.js:101`); `VERIFY_TITLE`, `verifyBody`, `RESEND`, `VERIFIED` (Task 3).
- Produces (new, not in contract): `startCheckout({ athleteId, product, go }) -> Promise<void>` (calls the callable then `go(url)`; default `go` is `window.location.assign`); `PayButton({ athleteId, product = 'tier', label, height, variant, email, style })` - renders the button; on `email-unverified` swaps to the verify state (title, body naming the sender, Resend, I've verified -> `refresh()` then retries); any other rejection shows `err.message`. `RegistrationSuccess({ bare, mode, form, result, account, onFinish })`.

- [ ] **Step 1: Write the failing PayButton test**

`frontend/src/portal/components/PayButton.test.js`:
```js
import React from 'react';
import { renderScreen } from '../screens/testRender';
import PayButton, { startCheckout } from './PayButton';

let mockReject = null;
jest.mock('../hooks/callables', () => ({
  callCreateCheckoutSession: async (payload) => {
    if (mockReject) { const e = new Error(mockReject.message); e.reason = mockReject.reason; throw e; }
    return { url: `https://checkout.stripe.test/${payload.athleteId}/${payload.product}` };
  },
}), { virtual: true });
let mockSession;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));
beforeEach(() => {
  mockReject = null;
  mockSession = { resendVerification: async () => ({ sent: true }), refresh: async () => {} };
});

test('startCheckout hands the Stripe url to go()', async () => {
  const gone = [];
  await startCheckout({ athleteId: 'a1', product: 'facility', go: (u) => gone.push(u) });
  expect(gone).toEqual(['https://checkout.stripe.test/a1/facility']);
});

test('the button navigates; an unverified password account gets the verify state', async () => {
  const gone = [];
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" email="dana@email.com" go={(u) => gone.push(u)} />);
  await r.click('Pay now');
  expect(gone).toEqual(['https://checkout.stripe.test/a1/tier']);
  mockReject = { reason: 'email-unverified', message: 'Verify your email first.' };
  await r.click('Pay now');
  expect(r.text()).toContain('Verify your email to finish');
  expect(r.text()).toContain('We sent a link to dana@email.com from noreply@');
  mockReject = null;
  await r.click("I've verified");
  expect(gone).toHaveLength(2);
  await r.unmount();
});

test('other failures show the message', async () => {
  mockReject = { reason: 'stripe-error', message: 'Checkout is unavailable right now. Try again in a minute.' };
  const r = await renderScreen(<PayButton athleteId="a1" label="Pay now" go={() => {}} />);
  await r.click('Pay now');
  expect(r.text()).toContain('Checkout is unavailable right now. Try again in a minute.');
  await r.unmount();
});
```

- [ ] **Step 2: Run it** - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `components/PayButton.js`**

```js
import React, { useState } from 'react';
import { color } from '../tokens';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';
import * as callables from '../hooks/callables';
import useAuthSession from '../hooks/useAuthSession';
import { RESEND, VERIFIED, VERIFY_TITLE, verifyBody } from '../data/authCopy';

/** D14 guard (20-frontend.md "Day-2 sequencing"): a partial callables export rejects plainly instead of throwing TypeError. */
function notWired(name) {
  return async () => {
    const err = new Error(`${name} is not available yet. Try again in a minute.`);
    err.reason = 'not-wired';
    throw err;
  };
}
const callCreateCheckoutSession = callables.callCreateCheckoutSession || notWired('createCheckoutSession');

/**
 * The one way the portal starts a Stripe Checkout Session (Sprint 20, spec
 * 4.2/4.5): createCheckoutSession -> the browser navigates to `url`. Stripe
 * returns the family to /portal/family?paid=<athleteId> (or /portal/home).
 * A password account that has not verified its email is refused by the
 * function (reason 'email-unverified'); this renders the verify state (9.4)
 * with Resend / I've verified and retries after a token refresh.
 */
export async function startCheckout({ athleteId, product = 'tier', go = (url) => window.location.assign(url) }) {
  const { url } = await callCreateCheckoutSession({ athleteId, product });
  go(url);
}

export default function PayButton({ athleteId, product = 'tier', label = 'Pay now', height = 50, variant = 'primary', email = null, go, style }) {
  const { resendVerification, refresh } = useAuthSession();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(null); // null | { verify: true } | { error }
  const [resent, setResent] = useState(false);

  const run = async () => {
    setBusy(true);
    setState(null);
    try {
      await startCheckout({ athleteId, product, go });
    } catch (err) {
      if (err && err.reason === 'email-unverified') setState({ verify: true });
      else setState({ error: (err && err.message) || 'Checkout is unavailable right now. Try again in a minute.' });
    } finally {
      setBusy(false);
    }
  };
  const verified = async () => {
    if (refresh) await refresh();
    await run();
  };
  const resend = async () => {
    try { if (resendVerification) await resendVerification(); setResent(true); } catch (err) { setState({ error: (err && err.message) || 'Could not resend. Try again in a minute.' }); }
  };

  if (state && state.verify) {
    return (
      <Card tone="yellow" large style={style}>
        <SectionLabel tone={color.secondary} style={{ marginBottom: 8 }}>{VERIFY_TITLE}</SectionLabel>
        <Body size={12}>{verifyBody(email || 'your email')}</Body>
        {resent ? <Body size={11} tone={color.primary} style={{ marginTop: 6 }}>Sent again.</Body> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button variant="outline" height={44} onClick={resend} style={{ flex: 1, boxShadow: 'none' }}>{RESEND}</Button>
          <Button height={44} loading={busy} onClick={verified} style={{ flex: 1 }}>{VERIFIED}</Button>
        </div>
      </Card>
    );
  }
  return (
    <div style={style}>
      <Button variant={variant} height={height} loading={busy} onClick={run}>{busy ? 'Opening checkout' : label}</Button>
      {state && state.error ? <Body size={12} tone={color.error} style={{ marginTop: 8 }}>{state.error}</Body> : null}
    </div>
  );
}
```

- [ ] **Step 4: Run it** - Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing Success test**

`frontend/src/portal/screens/RegistrationSuccess.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import RegistrationSuccess from './RegistrationSuccess';
import { newAthleteEntry } from '../data/signup';

jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, label }) => <button type="button">{label}|{athleteId}</button>, startCheckout: async () => {} }));

const form = (over) => ({
  mode: 'parent', contact: { name: 'Dana', email: 'dana@email.com', phone: '1', relationship: 'Mother' },
  athletes: [{ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 't-12' }, { ...newAthleteEntry(), name: 'Reese', dob: '2014-03-02', packageId: 'elite', ownLogin: true, loginEmail: 'reese@email.com' }],
  emergencyContact: '', medical: '', consents: {}, signatureName: 'Dana', ...over,
});

test('one pay button per athlete, the next steps, child-login instructions, no walkthrough', async () => {
  const finished = [];
  const r = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={(p) => finished.push(p)} />
  );
  expect(r.text()).toContain("You're in");
  expect(r.button("Pay for Jordan's 12 tokens|a1")).not.toBeNull();
  expect(r.button("Pay for Reese's Elite|a2")).not.toBeNull();
  expect(r.text()).toContain('Booking opens Fri, Oct 10 at 7 AM');
  expect(r.text()).toContain('Elite books right away once paid');
  expect(r.text()).toContain('you will be brought back here');
  expect(r.text()).toContain('reese@email.com');
  expect(r.text()).toContain("There's no welcome email");
  expect(r.button('Start the walkthrough')).toBeNull();
  await r.click('Go to your family');
  expect(finished).toEqual(['/portal/family']);
  await r.unmount();
});

test('athlete mode goes home', async () => {
  const finished = [];
  const r = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form({ mode: 'athlete', athletes: [form().athletes[0]] })} result={{ householdId: 'h1', athleteIds: ['a1'] }} account={{ email: 'j@email.com' }} onFinish={(p) => finished.push(p)} />
  );
  await r.click('Go to your home');
  expect(finished).toEqual(['/portal/home']);
  await r.unmount();
});
```

- [ ] **Step 6: Run it** - Expected: FAIL (placeholder renders nothing).

- [ ] **Step 7: Implement `RegistrationSuccess.js`**

```js
import React from 'react';
import { color, font, tint } from '../tokens';
import Button from '../components/Button';
import PayButton from '../components/PayButton';
import PhoneFrame from '../components/PhoneFrame';
import { Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { BOOKING_OPENS_LABEL, bookingOpen } from '../data/calendar';
import { packageById } from '../data/packages';

/**
 * "You're in" (Sprint 20, spec 2.1 Success): the receipt, one Pay button per
 * athlete (createCheckoutSession), what happens next, and the role's home.
 * No walkthrough hop (spec 9: Success -> walkthrough -> NotProvisioned loop).
 */
export default function RegistrationSuccess({ bare = false, mode = 'signup', form, result, account, onFinish }) {
  const athleteMode = form.mode === 'athlete';
  const rows = form.athletes.map((a, i) => ({ ...a, athleteId: result?.athleteIds?.[i] ?? null, pkg: packageById(a.packageId) }));
  const anyToken = rows.some((r) => r.pkg && r.pkg.kind !== 'elite');
  const anyElite = rows.some((r) => r.pkg && r.pkg.kind === 'elite');
  const logins = rows.filter((r) => r.loginEmail && r.ownLogin);
  const home = athleteMode ? '/portal/home' : '/portal/family';
  const next = [
    ...(anyToken && !bookingOpen(Date.now()) ? [`Booking opens ${BOOKING_OPENS_LABEL} for token packages.`] : []),
    ...(anyElite ? ['Elite books right away once paid.'] : []),
    `After you pay, Stripe brings you back - you will be brought back here and see "Confirming your payment..." until it clears.`,
    ...logins.map((r) => `${r.name.trim()} signs in at /portal/signin with ${r.loginEmail.trim().toLowerCase()} - Continue with Google, or Create a login with that email - then taps Check again.`),
    "There's no welcome email - this screen is your receipt.",
  ];
  return (
    <PhoneFrame
      bare={bare}
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          <Button variant="secondary" onClick={() => onFinish && onFinish(home)}>{athleteMode ? 'Go to your home' : 'Go to your family'}</Button>
        </div>
      }
    >
      <div style={{ padding: '40px 22px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: tint.green, border: `2px solid ${color.primary}`, display: 'grid', placeItems: 'center' }}>
          <Tick size={26} color={color.primary} thickness={3} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <ScreenTitle size={26}>You're in</ScreenTitle>
          <Body size={13} style={{ marginTop: 10 }}>{mode === 'link' ? 'Added to your family. Pay to start booking.' : 'Your account is ready. Pay to start booking.'}</Body>
        </div>
        <Card large style={{ width: '100%' }}>
          <SectionLabel style={{ marginBottom: 12 }}>Pay</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r) => (
              <PayButton key={r.key} athleteId={r.athleteId} email={account?.email ?? null}
                label={`Pay for ${r.name.trim()}'s ${r.pkg ? r.pkg.name : 'package'}`} />
            ))}
          </div>
        </Card>
        <Card large style={{ width: '100%' }}>
          <SectionLabel style={{ marginBottom: 14 }}>What happens next</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            {next.map((label, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ width: 22, height: 22, flex: 'none', borderRadius: '50%', border: `1px solid ${color.controlBorder}`, display: 'grid', placeItems: 'center', font: `600 11px ${font.body}`, color: color.textTertiary }}>{i + 1}</span>
                <span style={{ font: `400 13px ${font.body}`, color: color.textSecondary }}>{label}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 8: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/RegistrationSuccess.test.js src/portal/screens/Registration.test.js` - Expected: PASS.

- [ ] **Step 9: Commit**
```bash
git add frontend/src/portal/components/PayButton.js frontend/src/portal/components/PayButton.test.js frontend/src/portal/screens/RegistrationSuccess.js frontend/src/portal/screens/RegistrationSuccess.test.js
git commit -m "feat(signup): PayButton via createCheckoutSession with verify-email gate; You're in success with per-athlete pay (#8)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: NotProvisioned - verify-email, stranger, already-claimed, legacy states (closes part of #9, part of #12)

**Files:**
- Modify: `frontend/src/portal/screens/NotProvisioned.js:61-90,116-284`, `frontend/src/portal/PortalRoutes.js:526-529`
- Test: `frontend/src/portal/screens/NotProvisioned.test.js`

**Interfaces:**
- Consumes: `useAuthSession()` -> `user.email`, `user.emailVerified`, `provisioned`, `claimState`, `checkInvite() -> Promise<claimState>`, `resendVerification()`, `signOut()` (contract 4.1); `useEnrollment().data.status` (`hooks/index.js:2306`, legacy pending/declined); `notProvisionedView`, copy constants (Task 3); `LANDING_BY_ROLE`.
- Produces: `NotProvisioned({ bare, variant, onStartEnrollment })` unchanged signature; demo variants gain `'verify' | 'stranger' | 'already-claimed'` beside the legacy `'pending' | 'declined'`.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/screens/NotProvisioned.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import NotProvisioned from './NotProvisioned';

let mockSession;
let mockLegacy;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));
jest.mock('../hooks', () => ({ useEnrollment: () => mockLegacy }));

beforeEach(() => {
  mockLegacy = { data: { status: 'none', request: null }, loading: false, error: null, submit: async () => {} };
  mockSession = {
    user: { uid: 'u1', email: 'kid@email.com', emailVerified: false, role: null }, provisioned: false, loading: false,
    claimState: 'none', checkInvite: async () => 'none', resendVerification: async () => ({ sent: true }), signOut: async () => {},
  };
});

test('stranger: two CTAs and Check again re-runs the claim', async () => {
  const checks = [];
  mockSession.checkInvite = async () => { checks.push(1); return 'none'; };
  const started = [];
  const r = await renderScreen(<NotProvisioned bare onStartEnrollment={() => started.push(1)} />);
  await r.click("I'm a parent - start sign-up");
  expect(started).toEqual([1]);
  await r.click('My parent enrolled me');
  expect(r.text()).toContain('Use the email they entered, then tap Check again.');
  await r.click('Check again');
  expect(checks).toEqual([1]);
  await r.unmount();
});

test('needs-verification names the sender and offers Resend / I\'ve verified', async () => {
  mockSession.claimState = 'needs-verification';
  const resent = []; const checks = [];
  mockSession.resendVerification = async () => { resent.push(1); return { sent: true }; };
  mockSession.checkInvite = async () => { checks.push(1); return 'needs-verification'; };
  const r = await renderScreen(<NotProvisioned bare />);
  expect(r.text()).toContain('Verify your email to finish');
  expect(r.text()).toContain('We sent a link to kid@email.com from noreply@');
  await r.click('Resend');
  await r.click("I've verified");
  expect(resent).toEqual([1]);
  expect(checks).toEqual([1]);
  await r.unmount();
});

test('already claimed and legacy pending', async () => {
  mockSession.claimState = 'already-claimed';
  const a = await renderScreen(<NotProvisioned bare />);
  expect(a.text()).toContain('This login is already set up - sign in with it');
  await a.unmount();
  mockSession.claimState = 'none';
  mockLegacy.data = { status: 'pending', request: { guardian: { name: 'Dana' }, athletes: [] } };
  const started = [];
  const l = await renderScreen(<NotProvisioned bare onStartEnrollment={() => started.push(1)} />);
  await l.click('Sign-up is now instant - start here');
  expect(started).toEqual([1]);
  expect(l.text()).not.toContain("you'll get an email");
  await l.unmount();
});

test('a claimed account is sent to its home', async () => {
  mockSession.provisioned = true;
  mockSession.user = { ...mockSession.user, role: 'athlete' };
  const r = await renderScreen(<NotProvisioned bare />, { path: '/portal/not-provisioned' });
  expect(r.location().pathname).toBe('/portal/home');
  await r.unmount();
});
```

- [ ] **Step 2: Run it** - Expected: FAIL (old copy, no CTAs).

- [ ] **Step 3: Rewrite the live body**

`NotProvisioned.js` keeps lines 1-26 (imports, the `useEnrollmentFallback` guard - `useEnrollment` is `hooks/index.js:2306` now, but the guard costs nothing) with these import changes: line 1 becomes `import React, { useEffect, useState } from 'react';`; line 9 becomes `import { BrandHeader, LANDING_BY_ROLE } from './SignIn';`; add `import { ALREADY_CLAIMED, CHECK_AGAIN, LEGACY_CTA, RESEND, STRANGER_CHILD_CTA, STRANGER_CHILD_HINT, STRANGER_PARENT_CTA, VERIFIED, VERIFY_TITLE, notProvisionedView, verifyBody } from '../data/authCopy';` after line 9. The doc comment (lines 28-55) is replaced by:
```js
/**
 * Not provisioned - signed in, no portal role (Sprint 20, spec 3.2 + 2.4).
 *
 * Four live states, chosen by notProvisionedView() from useAuthSession's
 * claimState and the legacy enrollment status: `verify` (an invited child
 * whose password account is not verified yet - Resend / I've verified),
 * `already-claimed` (the invite was used by another login), `legacy` (one of
 * the two historical pending/declined enrollmentRequests - sign-up is
 * instant now, so the only action is to start it), and `stranger` (no
 * invite: a parent starts sign-up, a child re-checks with the email the
 * parent entered). A provisioned account landing here is sent home.
 *
 * Same real/demo split as SignIn: `variant` renders a fixed demo state.
 *
 * @param {'verify'|'stranger'|'already-claimed'|'pending'|'declined'} [variant]
 *   Demo state; omit to run on the real seam. ('none'/'default' -> stranger.)
 * @param {() => void} [onStartEnrollment]  The parent CTA and the legacy CTA
 *   both navigate to /portal/register (RegistrationRoute redirects a
 *   provisioned account). Hidden without it.
 */
```
Replace `LiveNotProvisioned` (`:61-90`) with:
```js
function LiveNotProvisioned({ bare = false, onStartEnrollment }) {
  const { user, provisioned, signOut, claimState, checkInvite, resendVerification } = useAuthSession();
  const enrollment = useEnrollment();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // A claim that succeeded (or any provisioned account landing here) goes home.
  useEffect(() => {
    if (provisioned && user) navigate(user.specialistId ? '/portal/my-sessions' : LANDING_BY_ROLE[user.role] ?? '/portal/not-provisioned', { replace: true });
  }, [provisioned, user, navigate]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try { await signOut(); navigate('/portal/signin', { replace: true }); } catch (e) { setSigningOut(false); }
  };
  return (
    <NotProvisionedBody
      bare={bare}
      email={user?.email ?? null}
      view={notProvisionedView({ claimState, legacyStatus: enrollment.loading ? null : enrollment.data?.status ?? 'none' })}
      onStartEnrollment={onStartEnrollment}
      onCheckAgain={checkInvite}
      onResend={resendVerification}
      onSignOut={handleSignOut}
      signingOut={signingOut}
    />
  );
}
```
Delete `DEMO_REQUEST` (`:92-98`) and replace `DemoNotProvisioned` (`:100-114`) with:
```js
function DemoNotProvisioned({ bare = false, variant = 'stranger' }) {
  const view = variant === 'pending' || variant === 'declined'
    ? 'legacy'
    : ['verify', 'already-claimed', 'stranger'].includes(variant) ? variant : 'stranger';
  return (
    <NotProvisionedBody
      bare={bare}
      email="dana@email.com"
      view={view}
      onStartEnrollment={() => {}}
      onCheckAgain={async () => view === 'verify' ? 'needs-verification' : 'none'}
      onResend={async () => ({ sent: true })}
      onSignOut={() => {}}
      signingOut={false}
    />
  );
}
```
Replace `NotProvisionedBody` (`:116-180`), `NoneState` (`:182-196`), `PendingState` (`:198-224`) and `DeclinedState` (`:226-284`) - spec 2.4 retires the approve/resubmit actions; the two historical docs render only the legacy CTA - with the following, which is the whole rest of the file:
```js
/** Title + body per view (contract 9.4). `checking` shares the stranger copy while the claim runs. */
const VIEW_COPY = {
  verify: { title: VERIFY_TITLE, body: (email) => verifyBody(email || 'your email') },
  'already-claimed': { title: 'Already set up', body: () => ALREADY_CLAIMED },
  legacy: { title: 'Sign-up changed', body: () => 'Approval is no longer needed - sign-up creates the account instantly.' },
  stranger: {
    title: 'Account not linked yet',
    body: () => "You're signed in, but this login isn't linked to an academy family or staff role yet.",
  },
  checking: {
    title: 'Account not linked yet',
    body: () => "You're signed in, but this login isn't linked to an academy family or staff role yet.",
  },
};

function NotProvisionedBody({ bare, email, view, onStartEnrollment, onCheckAgain, onResend, onSignOut, signingOut }) {
  const copy = VIEW_COPY[view] || VIEW_COPY.stranger;
  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />

        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <ScreenTitle size={22} style={{ marginBottom: 10 }}>
            {copy.title}
          </ScreenTitle>
          <Body size={13}>{copy.body(email)}</Body>
        </div>

        <Card style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 7 }}>Signed in as</SectionLabel>
          {/* Seam data can be null on first render - unset shows as unset. */}
          <div style={{ font: `500 14px ${font.body}`, color: email ? color.text : color.mutedText }}>
            {email ?? '—'}
          </div>
        </Card>

        {view === 'checking' ? (
          <Card>
            <Body size={12}>Checking your account…</Body>
          </Card>
        ) : view === 'verify' ? (
          <VerifyState onResend={onResend} onVerified={onCheckAgain} />
        ) : view === 'already-claimed' ? (
          <Banner tone="yellow" title="Already set up">{ALREADY_CLAIMED}</Banner>
        ) : view === 'legacy' ? (
          onStartEnrollment ? <Button onClick={onStartEnrollment}>{LEGACY_CTA}</Button> : null
        ) : (
          <StrangerState onStartEnrollment={onStartEnrollment} onCheckAgain={onCheckAgain} />
        )}

        <div style={{ flex: 1, minHeight: 24 }} />

        <Button variant="outline" disabled={signingOut} onClick={onSignOut} style={{ flex: 'none' }}>
          {signingOut ? 'Signing out' : 'Sign out'}
        </Button>
      </div>
    </PhoneFrame>
  );
}

/** Spec 3.2: Resend, and I've verified (the caller reloads the user + token before re-checking). */
function VerifyState({ onResend, onVerified }) {
  const [busy, setBusy] = useState(null); // 'resend' | 'verify'
  const [note, setNote] = useState(null);
  const run = async (kind, fn) => {
    setBusy(kind);
    setNote(null);
    try {
      const out = fn ? await fn() : null;
      if (kind === 'resend') setNote('Sent again.');
      else if (out === 'needs-verification') setNote("Not verified yet - open the link in the email, then tap I've verified.");
    } catch (err) {
      setNote((err && err.message) || 'That did not work. Try again in a minute.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card large>
      {note ? <Body size={12} style={{ marginBottom: 10 }}>{note}</Body> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="outline" height={46} loading={busy === 'resend'} onClick={() => run('resend', onResend)} style={{ flex: 1, boxShadow: 'none' }}>
          {RESEND}
        </Button>
        <Button height={46} loading={busy === 'verify'} onClick={() => run('verify', onVerified)} style={{ flex: 1 }}>
          {VERIFIED}
        </Button>
      </div>
    </Card>
  );
}

/** Spec 3.2: two CTAs - a parent starts sign-up; a child re-runs the claim without signing out. */
function StrangerState({ onStartEnrollment, onCheckAgain }) {
  const [child, setChild] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const check = async () => {
    setBusy(true);
    setNote(null);
    try {
      const out = onCheckAgain ? await onCheckAgain() : 'none';
      if (out === 'none') setNote('No invite for this email yet. Check the email your parent entered, or ask them to add your login.');
    } catch (err) {
      setNote((err && err.message) || 'Could not check. Try again in a minute.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {onStartEnrollment ? <Button onClick={onStartEnrollment}>{STRANGER_PARENT_CTA}</Button> : null}
      <Button variant="outline" onClick={() => setChild(true)} style={{ boxShadow: 'none' }}>
        {STRANGER_CHILD_CTA}
      </Button>
      {child ? (
        <Card large>
          <Body size={12}>{STRANGER_CHILD_HINT}</Body>
          {note ? <Body size={12} tone={color.secondary} style={{ marginTop: 8 }}>{note}</Body> : null}
          <Button height={46} loading={busy} onClick={check} style={{ marginTop: 12 }}>
            {CHECK_AGAIN}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
```
`PortalRoutes.js:528`: `onStartEnrollment={go('/portal/register')}` stays (the stranger's parent CTA and the legacy CTA both start the instant flow; `RegistrationRoute` redirects a provisioned account). The harness (`StatesHarness.js`) keeps its `pending`/`declined` variants (they render the legacy view) and may add `verify` / `stranger` / `already-claimed`.

- [ ] **Step 4: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/NotProvisioned.test.js` - Expected: PASS (4 tests). `wc -l` under 300.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/portal/screens/NotProvisioned.js frontend/src/portal/screens/NotProvisioned.test.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(auth): NotProvisioned verify / stranger / already-claimed / legacy states with Check again (#9, #12)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Continue with `20-frontend-part2.md` (Tasks 8-10).
