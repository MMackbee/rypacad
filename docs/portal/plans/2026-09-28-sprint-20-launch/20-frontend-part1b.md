# Frontend - Sprint 20 Implementation Plan (part 1b of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This is part 1b.** Header, Global Constraints, the Day-2 sequencing note, Tasks 1-2 and the list of names not in the contract live in `20-frontend.md`; every constraint there applies here. Part 1b consumes `renderScreen` (Task 1) and the `data/signup.js` helpers (Task 2).

---

### Task 3: SignUp screen, SignIn "Create a login", footer to /portal/signup (closes #7)

**Files:**
- Create: `frontend/src/portal/data/authCopy.js`, `frontend/src/portal/screens/SignUp.js`
- Modify: `frontend/src/portal/screens/SignIn.js:42-49,55-57,120-246,430-450`, `frontend/src/portal/PortalRoutes.js:497-500`
- Test: `frontend/src/portal/data/authCopy.test.js`, `frontend/src/portal/screens/SignUp.test.js`

**Interfaces:**
- Consumes: `useAuthSession()` members `user`, `provisioned`, `loading`, `error`, `signIn()`, `createLogin(email, password) -> Promise<{sent}>` (throws `LiveDataError` with `reason` `'email-in-use'` | `'weak-password'`), `claimState` (contract 4.1); `LANDING_BY_ROLE`, `BrandHeader` (`SignIn.js:42,383`).
- Produces (new, not in contract): `data/authCopy.js` exports `VERIFY_EMAIL_SENDER`, `VERIFY_TITLE`, `verifyBody(email)`, `RESEND`, `VERIFIED`, `STRANGER_PARENT_CTA`, `STRANGER_CHILD_CTA`, `STRANGER_CHILD_HINT`, `CHECK_AGAIN`, `LEGACY_CTA`, `ALREADY_CLAIMED`, `EMAIL_IN_USE`, `FAMILY_LINK_FAIL`, `USE_PARENT_EMAIL`, `notProvisionedView({ claimState, legacyStatus }) -> 'checking'|'verify'|'already-claimed'|'legacy'|'stranger'`; `SignUp({ bare, onSignIn })` default export; `LANDING_BY_ROLE.mental` becomes `'/portal/my-sessions'` (admin hidden from mental, #11).

- [ ] **Step 1: Write the failing copy test**

`frontend/src/portal/data/authCopy.test.js`:
```js
import { EMAIL_IN_USE, VERIFY_EMAIL_SENDER, notProvisionedView, verifyBody } from './authCopy';

test('verify copy names the sender (contract 9.4)', () => {
  expect(VERIFY_EMAIL_SENDER).toMatch(/^noreply@.+\.firebaseapp\.com$/);
  expect(verifyBody('kid@email.com')).toBe(`We sent a link to kid@email.com from ${VERIFY_EMAIL_SENDER}. Open it, then tap I've verified.`);
  expect(EMAIL_IN_USE).toBe('This email already has a login - sign in instead');
});

test('the claim-state table (spec 3.2)', () => {
  expect(notProvisionedView({ claimState: 'checking', legacyStatus: 'none' })).toBe('checking');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: null })).toBe('checking');
  expect(notProvisionedView({ claimState: 'needs-verification', legacyStatus: 'none' })).toBe('verify');
  expect(notProvisionedView({ claimState: 'already-claimed', legacyStatus: 'none' })).toBe('already-claimed');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: 'pending' })).toBe('legacy');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: 'declined' })).toBe('legacy');
  expect(notProvisionedView({ claimState: 'none', legacyStatus: 'none' })).toBe('stranger');
  expect(notProvisionedView({ claimState: 'error', legacyStatus: 'none' })).toBe('stranger');
  expect(notProvisionedView({ claimState: 'idle', legacyStatus: 'none' })).toBe('stranger');
});
```

- [ ] **Step 2: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/authCopy.test.js` - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `data/authCopy.js`**

```js
/**
 * Auth-flow copy (Sprint 20, contract 9.4/9.6) in one place: SignUp, SignIn,
 * NotProvisioned and the pay gate all render these strings, so they cannot
 * drift. Firebase's default verification template is sent by Firebase itself
 * from noreply@<authDomain> (spec 12.1: templates stay default), which is
 * why the sender is derived from the existing REACT_APP_FIREBASE_AUTH_DOMAIN
 * and not from the SMTP sender the functions use for notices.
 */
export const VERIFY_EMAIL_SENDER = `noreply@${process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'rypacad.firebaseapp.com'}`;
export const VERIFY_TITLE = 'Verify your email to finish';
export function verifyBody(email) {
  return `We sent a link to ${email} from ${VERIFY_EMAIL_SENDER}. Open it, then tap I've verified.`;
}
export const RESEND = 'Resend';
export const VERIFIED = "I've verified";
export const STRANGER_PARENT_CTA = "I'm a parent - start sign-up";
export const STRANGER_CHILD_CTA = 'My parent enrolled me';
export const STRANGER_CHILD_HINT = 'Use the email they entered, then tap Check again.';
export const CHECK_AGAIN = 'Check again';
export const LEGACY_CTA = 'Sign-up is now instant - start here';
export const ALREADY_CLAIMED = 'This login is already set up - sign in with it';
export const EMAIL_IN_USE = 'This email already has a login - sign in instead';
export const USE_PARENT_EMAIL = 'Use the email your parent entered.';
export const FAMILY_LINK_FAIL =
  'Ask your parent to allow sign-in for this app in Family Link, or create a password login below.';

/** Which NotProvisioned body renders (spec 3.2 + 2.4's legacy states). */
export function notProvisionedView({ claimState, legacyStatus }) {
  if (claimState === 'checking' || legacyStatus == null) return 'checking';
  if (claimState === 'needs-verification') return 'verify';
  if (claimState === 'already-claimed') return 'already-claimed';
  if (legacyStatus === 'pending' || legacyStatus === 'declined') return 'legacy';
  return 'stranger';
}
```

- [ ] **Step 4: Run it** - Expected: PASS.

- [ ] **Step 5: Write the failing SignUp screen test**

`frontend/src/portal/screens/SignUp.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import SignUp from './SignUp';

let mockSession;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));

beforeEach(() => {
  mockSession = {
    user: null, provisioned: false, loading: false, error: null, claimState: 'idle',
    signIn: async () => {},
    createLogin: async (email) => {
      if (email === 'taken@email.com') {
        const err = new Error('This email already has a login - sign in instead');
        err.reason = 'email-in-use';
        throw err;
      }
      return { sent: true };
    },
  };
});

test('creates a login and shows the verification-sent note', async () => {
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  expect(r.button('Create login').disabled).toBe(true);
  await r.fill('Email', 'dana@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  expect(r.text()).toContain('We sent a link to dana@email.com from noreply@');
  expect(r.button('Continue to sign-up')).not.toBeNull();
  await r.unmount();
});

test('email already in use points at sign in', async () => {
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  await r.fill('Email', 'taken@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  expect(r.text()).toContain('This email already has a login - sign in instead');
  await r.unmount();
});

test('a signed-in unprovisioned stranger goes to /portal/register', async () => {
  mockSession.user = { uid: 'u1', email: 'dana@email.com', role: null };
  mockSession.claimState = 'none';
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  expect(r.location().pathname).toBe('/portal/register');
  await r.unmount();
});
```

- [ ] **Step 6: Run it** - Expected: FAIL, cannot find `./SignUp`.

- [ ] **Step 7: Implement `screens/SignUp.js`**

```js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import Button from '../components/Button';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import { AlertGlyph, Banner, Body } from '../components/Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { EMAIL_RE } from '../data/signup';
import { EMAIL_IN_USE, VERIFY_EMAIL_SENDER } from '../data/authCopy';
import { BrandHeader, LANDING_BY_ROLE } from './SignIn';

/**
 * 00 · Sign up (Sprint 20, spec 2.1 step 0) - public. Create a login (email
 * + password, or Google), then continue to /portal/register. Verification is
 * sent at once but is not required to finish sign-up (it is required to pay
 * and to claim a child login). A provisioned account lands on its home; an
 * invited child (claimState other than none) lands on NotProvisioned.
 */
export default function SignUp({ bare = false, onSignIn }) {
  const { user, provisioned, loading, error, signIn, createLogin, claimState } = useAuthSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [failure, setFailure] = useState(null); // { message, inUse }
  const [sent, setSent] = useState(null); // the email the link went to

  useEffect(() => {
    if (!user || loading || sent) return;
    if (provisioned) {
      navigate(user.specialistId ? '/portal/my-sessions' : LANDING_BY_ROLE[user.role] ?? '/portal/not-provisioned', { replace: true });
      return;
    }
    if (claimState === 'checking') return;
    navigate(claimState === 'none' || claimState === 'idle' || claimState == null ? '/portal/register' : '/portal/not-provisioned', { replace: true });
  }, [user, provisioned, loading, sent, claimState, navigate]);

  const canSubmit = EMAIL_RE.test(email.trim()) && password.length >= 6 && !creating && !loading;
  const submit = async () => {
    if (!canSubmit) return;
    setCreating(true);
    setFailure(null);
    try {
      await createLogin(email.trim(), password);
      setSent(email.trim());
    } catch (err) {
      const inUse = err && err.reason === 'email-in-use';
      setFailure({ inUse, message: inUse ? EMAIL_IN_USE : (err && err.message) || 'The login could not be created. Try again.' });
    } finally {
      setCreating(false);
    }
  };
  const goSignIn = () => (onSignIn ? onSignIn() : navigate('/portal/signin'));

  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />
        {sent ? (
          <>
            <Banner tone="green" title="Verification sent">
              We sent a link to {sent} from {VERIFY_EMAIL_SENDER}. You can finish sign-up now; verify before you pay.
            </Banner>
            <Button style={{ marginTop: 14 }} onClick={() => navigate('/portal/register', { replace: true })}>
              Continue to sign-up
            </Button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}>
              <Field label="Email" type="email" value={email} onChange={setEmail} dimmed={creating} />
              <Field label="Password" type="password" value={password} onChange={setPassword} dimmed={creating} hint="At least 6 characters." />
            </div>
            {failure || error ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <AlertGlyph />
                <span style={{ font: `400 12px ${font.body}`, color: color.error }}>
                  {failure ? failure.message : error.message}
                  {failure && failure.inUse ? (
                    <> <button type="button" onClick={goSignIn} style={{ background: 'none', border: 'none', padding: 0, font: `600 12px ${font.body}`, color: color.primary, cursor: 'pointer' }}>Sign in</button></>
                  ) : null}
                </span>
              </div>
            ) : null}
            <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 13 }}>
              <Button loading={creating} disabled={!canSubmit} onClick={submit}>{creating ? 'Creating login' : 'Create login'}</Button>
              <Button variant="outline" disabled={creating || loading} onClick={() => signIn()} style={{ boxShadow: 'none' }}>Continue with Google</Button>
            </div>
          </>
        )}
        <div style={{ flex: 1, minHeight: 20 }} />
        <Body size={13} style={{ textAlign: 'center', paddingTop: 20 }}>
          Already have a login?{' '}
          <button type="button" onClick={goSignIn} style={{ background: 'none', border: 'none', padding: 0, font: `600 13px ${font.body}`, color: color.primary, cursor: 'pointer' }}>Sign in</button>
        </Body>
      </div>
    </PhoneFrame>
  );
}
```

- [ ] **Step 8: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/SignUp.test.js` - Expected: PASS (3 tests).

- [ ] **Step 9: SignIn changes**

In `SignIn.js`:
1. `LANDING_BY_ROLE.mental` -> `'/portal/my-sessions'` (line 46) with the comment `// Sprint 20: admin is ops/owner only; Yannick lands on his sessions.`
2. Destructure `createLogin` from `auth` (line 57): `const { user, provisioned, loading, error, signIn, signInWithEmail, createLogin } = auth;`
3. Track which action errored: add `const [lastAction, setLastAction] = useState(null);` after line 72; in `submitEmail` call `setLastAction('email')` before `signInWithEmail`, and change the Google button's `onClick` to `() => { setLastAction('google'); signIn(); }`.
4. Under the existing error block (after line 210) add:
```js
        {error && lastAction === 'google' ? (
          <Body size={12} style={{ marginTop: 8 }}>{FAMILY_LINK_FAIL}</Body>
        ) : null}
```
5. After the Google `<Button>` (line 237) insert `{typeof createLogin === 'function' ? <CreateLoginSection createLogin={createLogin} disabled={loading} /> : null}` (D14 guard: `/portal/signin` is a day-1 route and `createLogin` is routing Task 9's export - absent, the section is simply not offered) and add this component before `DemoSignIn`:
```js
/**
 * Sprint 20 (spec 3.1): a child claiming the login their parent entered, or
 * anyone who prefers a password. The same createLogin the SignUp screen uses;
 * success lands via onAuthStateChanged like every other sign-in here.
 */
function CreateLoginSection({ createLogin, disabled }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [sent, setSent] = useState(null);
  const canSubmit = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 6 && !busy && !disabled;
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setFailure(null);
    try {
      await createLogin(email.trim(), password);
      setSent(email.trim());
    } catch (err) {
      setFailure(err && err.reason === 'email-in-use' ? EMAIL_IN_USE : (err && err.message) || 'The login could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)} style={{ boxShadow: 'none' }}>
        Create a login
      </Button>
    );
  }
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 10 }}>Create a login</SectionLabel>
      <Body size={12} style={{ marginBottom: 12 }}>{USE_PARENT_EMAIL} {U13_HELPER}</Body>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="New login email" type="email" value={email} onChange={setEmail} />
        <Field label="New password" type="password" value={password} onChange={setPassword} />
      </div>
      {failure ? <Body size={12} tone={color.error} style={{ marginTop: 10 }}>{failure}</Body> : null}
      {sent ? <Body size={12} tone={color.primary} style={{ marginTop: 10 }}>{verifyBody(sent)}</Body> : null}
      <Button height={46} loading={busy} disabled={!canSubmit} onClick={submit} style={{ marginTop: 12 }}>
        {busy ? 'Creating login' : 'Create login'}
      </Button>
    </Card>
  );
}
```
Imports to add at the top of SignIn.js: `import { Card, SectionLabel } from '../components/Primitives';` (merge into the existing Primitives import: `{ AlertGlyph, Body, Card, SectionLabel }`), `import { U13_HELPER } from '../data/signup';`, `import { EMAIL_IN_USE, FAMILY_LINK_FAIL, USE_PARENT_EMAIL, verifyBody } from '../data/authCopy';`.
6. `EnrollmentFooter` (line 441-447): text `New family?{' '}` + span `Start sign-up`.
7. `PortalRoutes.js:499`: `element={<SignIn bare onStartEnrollment={go('/portal/signup')} />}` and add the route right after it:
```js
      <Route path="signup" element={<SignUp bare onSignIn={go('/portal/signin')} />} />
```
with `import SignUp from './screens/SignUp';` beside the SignIn import.

- [ ] **Step 10: Verify** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal` (all portal tests pass) and `cd frontend && npx eslint src/portal/screens/SignIn.js src/portal/screens/SignUp.js src/portal/PortalRoutes.js` (no errors).

- [ ] **Step 11: Commit**
```bash
git add frontend/src/portal/data/authCopy.js frontend/src/portal/data/authCopy.test.js frontend/src/portal/screens/SignUp.js frontend/src/portal/screens/SignUp.test.js frontend/src/portal/screens/SignIn.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(auth): /portal/signup, SignIn create-a-login, Family Link copy, footer to sign-up (#7)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Registration steps - who-are-you, contact prefill, handicap, own-login, adult copy (closes part of #8)

**Files:**
- Create: `frontend/src/portal/screens/RegistrationSteps.js`
- Modify: `frontend/src/portal/screens/Registration.js` (move `GuardianStep`/`AthleteStep`/`PackageStep`/`ContractTierChoice`/`ConsentStep`/`CONSENT_INFO`/`ConsentInfoSheet`/`Checkbox`/`SubmittingOverlay` lines 261-760 out; the file keeps the state machine only - Task 5 rewrites it)
- Test: `frontend/src/portal/screens/RegistrationSteps.test.js`

**Interfaces:**
- Consumes: `newAthleteEntry`, `validateAthleteEntry`, `ageOnDate`, `TIER_MINUTES`, `CHILD_LOGIN_ENABLED`, `U13_HELPER`, `ADULT_REQUIRED` (Task 2); `useEnrollmentForm()` (`hooks/index.js:2284`); `ALL_PACKAGES`; `PackageCard`, `Field`, `SelectField`, `Toggle`, `Card`, `SectionLabel`, `Body`.
- Produces (new, not in contract): `RegistrationSteps.js` exports `WhoStep({ mode, onChange })`, `ContactStep({ mode, contact, onChange, showErrors })`, `AthleteStep({ mode, athletes, onUpdate, onAdd, onRemove, emergencyContact, onEmergencyContact, medical, onMedical, showErrors, todayISO, guardianEmail, onSwitchToParent })`, `PackageStep({ athletes, onUpdate, showErrors })`, `ConsentStep({ mode, consents, onChange, signatureName, onSignatureChange, onOpenInfo, showErrors })`, `ConsentInfoSheet`, `SubmittingOverlay({ mode })`.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/screens/RegistrationSteps.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import { AthleteStep, ConsentStep, WhoStep } from './RegistrationSteps';
import { newAthleteEntry } from '../data/signup';

function Harness({ mode = 'parent', athlete = {} }) {
  const [athletes, setAthletes] = React.useState([{ ...newAthleteEntry(), ...athlete }]);
  const onUpdate = (key, patch) => setAthletes((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  return (
    <AthleteStep mode={mode} athletes={athletes} onUpdate={onUpdate} onAdd={() => {}} onRemove={() => {}}
      emergencyContact="" onEmergencyContact={() => {}} medical="" onMedical={() => {}}
      showErrors todayISO="2026-10-01" guardianEmail="dana@email.com" onSwitchToParent={() => {}} />
  );
}

test('who-are-you offers the two modes', async () => {
  const picked = [];
  const r = await renderScreen(<WhoStep mode={null} onChange={(m) => picked.push(m)} />);
  await r.click("I'm the athlete (18+)");
  await r.click('Parent or guardian');
  expect(picked).toEqual(['athlete', 'parent']);
  await r.unmount();
});

test('own login asks for a child email, shows the U13 helper, rejects the guardian email', async () => {
  const r = await renderScreen(<Harness athlete={{ name: 'Nico', dob: '2017-05-05' }} />);
  expect(r.container.querySelector('[aria-label="Login email"]')).toBeNull();
  await r.click('Own login?');
  expect(r.text()).toContain('Under 13? A Google account needs Family Link permission');
  await r.fill('Login email', 'dana@email.com');
  expect(r.text()).toContain("Use a different email from the guardian's.");
  await r.fill('Handicap', '60');
  expect(r.text()).toContain('Handicap is a whole number from 0 to 54');
  await r.unmount();
});

test('athlete mode: a minor is told a guardian must complete it', async () => {
  const r = await renderScreen(<Harness mode="athlete" athlete={{ name: 'Sam', dob: '2010-01-01' }} />);
  expect(r.text()).toContain('Student sign-up is 18+.');
  expect(r.button("I'm a parent or guardian")).not.toBeNull();
  expect(r.button('Own login?')).toBeNull();
  await r.unmount();
});

test('consent copy switches to the adult variant', async () => {
  const props = { consents: { dataCollection: true, videoCapture: true }, onChange: () => {}, signatureName: '', onSignatureChange: () => {}, onOpenInfo: () => {}, showErrors: false };
  const p = await renderScreen(<ConsentStep mode="parent" {...props} />);
  expect(p.text()).toContain('Each athlete is a minor.');
  await p.unmount();
  const a = await renderScreen(<ConsentStep mode="athlete" {...props} />);
  expect(a.text()).toContain('You are signing for yourself.');
  await a.unmount();
});
```

- [ ] **Step 2: Run it** - Expected: FAIL, cannot find `./RegistrationSteps`.

- [ ] **Step 3: Create `RegistrationSteps.js`** - a verbatim cut, then six exact edits. Every "before" below is the text as it sits in `Registration.js` today (read on 2026-09-28); every "after" is what replaces it. Nothing else in the cut block changes.

**3a. The cut.** Create `frontend/src/portal/screens/RegistrationSteps.js` with exactly this import block, then CUT `Registration.js` lines 261-760 (from `function GuardianStep({ guardian, onChange, showErrors }) {` through the closing `}` of `function SubmittingOverlay() {`) and paste them verbatim under it. `Registration.js` is now RED (it still calls `GuardianStep`/`AthleteStep`/`PackageStep`/`ConsentStep`/`ConsentInfoSheet`/`SubmittingOverlay` that no longer exist in the file) - that is expected; Task 5 rewrites it and no handoff happens in between (see the note at the end of this part).
```js
import React, { useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import Button, { Spinner } from '../components/Button';
import Field, { SelectField } from '../components/Field';
import PackageCard from '../components/PackageCard';
import { Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { Toggle } from '../components/Toggle';
import { useEnrollmentForm } from '../hooks';
import { ALL_PACKAGES } from '../data/packages';
import { ADULT_REQUIRED, CHILD_LOGIN_ENABLED, TIER_MINUTES, U13_HELPER, ageOnDate, validateAthleteEntry } from '../data/signup';

/**
 * Registration's step components (Sprint 20, spec 2.1), cut out of
 * Registration.js so each file stays under 500 lines. Pure presentation over
 * the form state Registration.js owns; every validation message comes from
 * data/signup.js so the function's re-check and the form agree.
 */
```
(`EMAIL_RE` is not referenced anywhere in lines 261-760 - `GuardianStep` uses an inline regex at old line 279, which stays - so nothing else is imported. `Toggle` is the named export of `components/Toggle.js:10`, a `role="switch"` button with `aria-label={label}`.)

**3b. `GuardianStep` -> `ContactStep`.** Before (the whole function, old lines 261-300):
```js
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
```
After (field keys are `name` / `email` / `phone`, matching `form.contact`; the relationship select is parent-only; the email is prefilled from auth by Registration.js and stays editable):
```js
export function ContactStep({ mode, contact, onChange, showErrors }) {
  const { data } = useEnrollmentForm();
  const set = (field) => (v) => onChange((prev) => ({ ...prev, [field]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field
        label="Your name"
        value={contact.name}
        onChange={set('name')}
        error={showErrors && contact.name.trim() === '' ? 'Your name is required.' : undefined}
      />
      <Field
        label="Email"
        type="email"
        value={contact.email}
        onChange={set('email')}
        error={
          showErrors && !/^\S+@\S+\.\S+$/.test(contact.email.trim())
            ? 'A valid email is required.'
            : undefined
        }
        hint="Prefilled from your login. Change it if the family should be reached somewhere else."
      />
      <Field
        label="Mobile"
        type="tel"
        value={contact.phone}
        onChange={set('phone')}
        error={showErrors && contact.phone.trim() === '' ? 'A mobile number is required.' : undefined}
        hint="Used for schedule-change texts. You control this later in Notification Preferences."
      />
      {mode === 'parent' ? (
        <SelectField
          label="Relationship to athlete"
          value={contact.relationship}
          options={data?.relationships ?? []}
          onChange={set('relationship')}
        />
      ) : null}
    </div>
  );
}
```

**3c. `WhoStep` (new)** - insert directly above `ContactStep`:
```js
/** Step 1 (spec 2.1): parent or guardian, or the adult athlete signing up for themselves. */
export function WhoStep({ mode, onChange }) {
  const options = [
    ['parent', 'Parent or guardian', 'You enroll one or more athletes and manage their account.'],
    ['athlete', "I'm the athlete (18+)", 'You sign up for yourself. Under 18? A parent or guardian enrolls you.'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {options.map(([value, title, blurb]) => {
        const on = mode === value;
        return (
          <button key={value} type="button" aria-pressed={on} onClick={() => onChange(value)}
            style={{ textAlign: 'left', borderRadius: radius.cardLarge, padding: 17, cursor: 'pointer',
              border: `1px solid ${on ? color.primary : color.border}`, background: on ? tint.green : color.surface }}>
            <div style={{ font: `600 15px ${font.body}`, color: color.text }}>{title}</div>
            <Body size={12} style={{ marginTop: 5 }}>{blurb}</Body>
          </button>
        );
      })}
    </div>
  );
}
```

**3d. `AthleteStep`.** Before: the whole function, old lines 311-429 (signature `function AthleteStep({ athletes, onUpdate, onAdd, onRemove, emergencyContact, onEmergencyContact, medical, onMedical, showErrors })`; the card header `{athletes.length > 1 ? \`Athlete ${i + 1}\` : 'Athlete details'}`; the name field's error `showErrors && athlete.name.trim() === '' ? 'Athlete name is required.' : undefined`; the DOB field's error `showErrors && !athlete.dob ? 'Date of birth is required — it determines U13 vs U18 eligibility.' : undefined`; the unconditional `+ Add another athlete` button). After - the function in full; the Remove button, the emergency-contact field and the medical card are the old code unchanged:
```js
/**
 * Athlete step - a real add/remove LIST (Sprint 10 pin A), now with the
 * Sprint 20 fields (spec 2.1 step 3): handicap, the own-login toggle with the
 * child's email, the derived age (U13 / 13+), and the 18+ check in athlete
 * mode (with the switch back to parent mode). Emergency contact and the
 * medical note stay single, household-level fields.
 */
export function AthleteStep({
  mode,
  athletes,
  onUpdate,
  onAdd,
  onRemove,
  emergencyContact,
  onEmergencyContact,
  medical,
  onMedical,
  showErrors,
  todayISO,
  guardianEmail,
  onSwitchToParent,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {athletes.map((athlete, i) => {
        const age = ageOnDate(athlete.dob, todayISO);
        const errors = validateAthleteEntry(athlete, { todayISO, guardianEmail, siblings: athletes, mode });
        return (
          <Card key={athlete.key} large>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 13 }}>
              <SectionLabel style={{ flex: 1 }}>
                {mode === 'athlete' ? 'Your details' : athletes.length > 1 ? `Athlete ${i + 1}` : 'Athlete details'}
              </SectionLabel>
              {mode === 'parent' && athletes.length > 1 ? (
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
                error={showErrors && errors.name ? errors.name : undefined}
              />
              {/*
                Date of birth is required because it determines U13 vs 13+
                eligibility (and 18+ in athlete mode). The adult message shows
                WITHOUT showErrors so the switch button appears the moment a
                minor's DOB is typed.
              */}
              <Field
                label="Date of birth"
                type="date"
                value={athlete.dob}
                onChange={(v) => onUpdate(athlete.key, { dob: v })}
                error={errors.dob === ADULT_REQUIRED || showErrors ? errors.dob : undefined}
                hint={age != null ? `Age ${age} · ${age < 13 ? 'U13' : '13+'}` : undefined}
              />
              {errors.dob === ADULT_REQUIRED ? (
                <Button variant="outline" height={44} onClick={onSwitchToParent} style={{ boxShadow: 'none' }}>
                  I'm a parent or guardian
                </Button>
              ) : null}
              <Field
                label="Handicap"
                type="number"
                value={athlete.handicap}
                placeholder="none yet"
                onChange={(v) => onUpdate(athlete.key, { handicap: v })}
                error={errors.handicap}
                hint="Current handicap, 0-54. Leave blank for none yet."
              />
              {mode === 'parent' && CHILD_LOGIN_ENABLED ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: `600 13px ${font.body}`, color: color.text }}>Own login?</div>
                    <Body size={11} tone={color.textTertiary}>
                      Off: your account runs {athlete.name.trim() || 'this athlete'}. On: they sign in with their own email.
                    </Body>
                  </div>
                  <Toggle checked={athlete.ownLogin} onChange={(v) => onUpdate(athlete.key, { ownLogin: v })} label="Own login?" />
                </div>
              ) : null}
              {athlete.ownLogin ? (
                <>
                  <Field
                    label="Login email"
                    type="email"
                    value={athlete.loginEmail}
                    onChange={(v) => onUpdate(athlete.key, { loginEmail: v })}
                    error={errors.loginEmail}
                  />
                  {age != null && age < 13 ? <Body size={11} tone={color.textTertiary}>{U13_HELPER}</Body> : null}
                </>
              ) : null}
            </div>
          </Card>
        );
      })}

      {mode === 'parent' ? (
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
      ) : null}

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
```
Why the `handicap` and `loginEmail` errors render without `showErrors`: the test types the guardian's email / `60` and expects the message at once, and both are cheap, local checks. `name` and `dob` keep the `showErrors` gate (except the adult message) so an untouched form does not open red. The Toggle's hit area is its `aria-label="Own login?"` button (the heading beside it is a div), which `renderScreen.button('Own login?')` (Task 1, aria-label match) resolves.

**3e. `PackageStep` + the tier constant.** Before (old line 442):
```js
function PackageStep({ athletes, onUpdate, showErrors }) {
```
After:
```js
export function PackageStep({ athletes, onUpdate, showErrors }) {
```
Before (old lines 503-504; Task 1 Step 5 already turned the `95` into `90`):
```js
/** The pinned contract tier set (contract v1.8 §B: int in [20, 45, 90] or null) - not invented. */
const TIER_MINUTES = [20, 45, 90];
```
After: both lines DELETED - `TIER_MINUTES` now comes from `../data/signup` (import block in 3a); `ContractTierChoice` (unchanged) reads the imported one. In the `PackageStep` doc comment (old line 440) `(20/45/95, contract v1.8 §B)` becomes `(20/45/90, spec 9)`.

**3f. `ConsentStep` (adult copy).** Before (old lines 539 and 547-549):
```js
function ConsentStep({ consents, onChange, signatureName, onSignatureChange, onOpenInfo, showErrors }) {
```
```js
      <Body size={13}>
        Each athlete is a minor. Each of these is a separate decision — none is bundled into the others.
      </Body>
```
After:
```js
export function ConsentStep({ mode, consents, onChange, signatureName, onSignatureChange, onOpenInfo, showErrors }) {
```
```js
      <Body size={13}>
        {mode === 'athlete'
          ? 'You are signing for yourself. Each of these is a separate decision — none is bundled into the others.'
          : 'Each athlete is a minor. Each of these is a separate decision — none is bundled into the others.'}
      </Body>
```

**3g. `ConsentInfoSheet`, `SubmittingOverlay`.** Before (old line 667): `function ConsentInfoSheet({ id, onClose }) {` -> After: `export function ConsentInfoSheet({ id, onClose }) {`. `Checkbox` and `CONSENT_INFO` stay module-private. Before (old lines 728 and 751-756):
```js
function SubmittingOverlay() {
```
```js
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>
          Creating the account
        </div>
        <Body size={11}>
          Do not close this. Consent records are written before the account exists.
        </Body>
```
After (the callable writes one transaction, so the old sentence is no longer true):
```js
export function SubmittingOverlay({ mode = 'signup' }) {
```
```js
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>
          {mode === 'link' ? 'Adding to your family' : 'Creating the account'}
        </div>
        <Body size={11}>
          Do not close this. Your family and consents are written together in one step.
        </Body>
```

- [ ] **Step 4: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/RegistrationSteps.test.js` - Expected: PASS (4 tests). `wc -l frontend/src/portal/screens/RegistrationSteps.js` must print under 500.

- [ ] **Step 5: No commit here - the worktree is RED on purpose.** `Registration.js` still calls the six step components that just moved (it is not compilable until Task 5 Step 3 rewrites it), so `src/portal` as a whole does not pass and `npm run build` fails at this point. Only the two new files are green: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/RegistrationSteps.test.js src/portal/data` - Expected: PASS. Do NOT hand off, request review or run the PM gate between Task 4 and Task 5; the same worker continues straight into Task 5 (`20-frontend-part1c.md`) and commits `Registration.js` + `RegistrationSteps.js` + both tests together at Task 5 Step 7.

---

Continue with `20-frontend-part1c.md` (Tasks 5-7). **The worktree is RED between Task 4 and Task 5** (Registration.js still calls the old step components while RegistrationSteps.js already exports the new ones); no handoff, review or PM gate happens in between - the same worker runs Task 5 immediately and commits both files together at Task 5 Step 7.
