import React, { useState } from 'react';
import { color } from '../tokens';
import Button from './Button';
import Field from './Field';
import { Body, Card, SectionLabel } from './Primitives';
import { U13_HELPER } from '../data/signup';
import { EMAIL_IN_USE, PARENT_USE_SIGNUP, STUDENT_LOGIN_CTA, USE_PARENT_EMAIL, verifyBody } from '../data/authCopy';

/**
 * Sprint 20 (spec 3.1): a child claiming the login their parent entered, or
 * anyone who prefers a password. The same createLogin the SignUp screen uses;
 * success lands via onAuthStateChanged like every other sign-in here. Its
 * own file so SignIn.js stays under the 500-line rule (Task 3 pushed it to
 * 510); SignIn renders it only when useAuthSession exposes createLogin (D14).
 */
export default function CreateLoginSection({ createLogin, disabled }) {
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
        {STUDENT_LOGIN_CTA}
      </Button>
    );
  }
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 10 }}>{STUDENT_LOGIN_CTA}</SectionLabel>
      <Body size={12} style={{ marginBottom: 12 }}>{USE_PARENT_EMAIL} {PARENT_USE_SIGNUP} {U13_HELPER}</Body>
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
