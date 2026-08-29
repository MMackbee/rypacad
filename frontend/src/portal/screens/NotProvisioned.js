import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { Banner, Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { BrandHeader } from './SignIn';

/**
 * Not provisioned - signed in, no portal role.
 *
 * The honest state for a Google account that authenticated but has no users/
 * doc (TEAM.md, Sprint 4 pins: `provisioned: false`). The routing lane's guard
 * redirects here; the screen's whole job is to say plainly what is true - you
 * are signed in, you are not linked - and offer the two real moves: sign out,
 * or get the front desk to link the account. No invented phone number or email
 * address, because the academy has not published one for this purpose.
 *
 * Same real/demo split as SignIn: a `variant` prop (review harness) renders
 * the established demo guardian's email and never reads the live auth seam;
 * without it the screen runs on useAuthSession().
 *
 * @param {'default'} [variant] Demo state; omit to run on the real seam.
 */
export default function NotProvisioned({ variant, ...rest }) {
  if (variant != null) return <DemoNotProvisioned {...rest} />;
  return <LiveNotProvisioned {...rest} />;
}

function LiveNotProvisioned({ bare = false }) {
  const { user, signOut } = useAuthSession();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/portal/signin', { replace: true });
    } catch (e) {
      // Still signed in - re-enable the button rather than stranding it.
      setSigningOut(false);
    }
  };

  return (
    <NotProvisionedBody
      bare={bare}
      email={user?.email ?? null}
      onSignOut={handleSignOut}
      signingOut={signingOut}
    />
  );
}

/** Harness state: the demo guardian persona (same address SignIn seeds). */
function DemoNotProvisioned({ bare = false }) {
  return (
    <NotProvisionedBody bare={bare} email="dana@email.com" onSignOut={() => {}} signingOut={false} />
  );
}

function NotProvisionedBody({ bare, email, onSignOut, signingOut }) {
  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />

        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <ScreenTitle size={22} style={{ marginBottom: 10 }}>
            Account not linked yet
          </ScreenTitle>
          <Body size={13}>
            Your Google account is signed in, but it isn&apos;t linked to an academy family or
            staff role yet.
          </Body>
        </div>

        <Card style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 7 }}>Signed in as</SectionLabel>
          {/* Seam data can be null on first render - unset shows as unset. */}
          <div style={{ font: `500 14px ${font.body}`, color: email ? color.text : color.mutedText }}>
            {email ?? '—'}
          </div>
        </Card>

        <Banner tone="neutral" title="Contact the academy">
          The front desk links accounts to families and staff roles. Once yours is linked, sign
          in again and your portal will be here.
        </Banner>

        <div style={{ flex: 1, minHeight: 24 }} />

        <Button variant="outline" disabled={signingOut} onClick={onSignOut} style={{ flex: 'none' }}>
          {signingOut ? 'Signing out' : 'Sign out'}
        </Button>
      </div>
    </PhoneFrame>
  );
}
