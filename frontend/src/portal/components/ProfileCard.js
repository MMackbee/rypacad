import React, { useEffect, useState } from 'react';
import { color, font } from '../tokens';
import Button from './Button';
import Field from './Field';
import SavedToast from './SavedToast';
import { Body, Card, SectionLabel } from './Primitives';
import { useProfile } from '../hooks';

/**
 * The signed-in person's own profile facts on Settings (owner feedback,
 * 2026-09-16: "do i need a profile view where i can set my phone/email for
 * sms/email notifications?"). Email is the sign-in address and is read-only
 * here; the phone is a contact number the academy can reach the member at
 * (since Sprint 15 no notice is texted - notices go by email and push).
 * Saved on the user's own users doc.
 */
export default function ProfileCard({ style }) {
  const { data, loading, error, savePhone } = useProfile();
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // The profile loads after mount; the field follows it (and a save's own
  // refetch is a no-op, since it already holds what was just saved).
  useEffect(() => {
    setPhone(data?.phone ?? '');
  }, [data?.phone]);

  const dirty = (phone || '') !== (data?.phone ?? '');

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await savePhone(phone);
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setSaveError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'Your phone number could not be saved. Try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card large style={style}>
      <SectionLabel style={{ marginBottom: 12 }}>Profile</SectionLabel>
      <Field label="Email" value={loading ? '' : data?.email ?? ''} dimmed onChange={() => {}} />
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 6, marginBottom: 14 }}>
        Your sign-in address — email notices go here.
      </Body>
      <Field
        label="Mobile phone"
        value={phone}
        placeholder="(555) 555-5555"
        type="tel"
        onChange={(v) => setPhone(typeof v === 'string' ? v : v?.target?.value ?? '')}
      />
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 6 }}>
        A number the academy can reach you at. Notices arrive by email and push, not text.
      </Body>
      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
          Your profile didn't load. Check your connection and try again.
        </Body>
      ) : null}
      {saveError ? (
        <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
          {saveError}
        </Body>
      ) : null}
      {saved ? <SavedToast message="Phone saved" style={{ marginTop: 11 }} /> : null}
      <Button
        height={44}
        disabled={!dirty || loading}
        loading={saving}
        onClick={handleSave}
        style={{ marginTop: 13, font: `600 14px ${font.body}` }}
      >
        {saving ? 'Saving' : 'Save phone'}
      </Button>
    </Card>
  );
}
