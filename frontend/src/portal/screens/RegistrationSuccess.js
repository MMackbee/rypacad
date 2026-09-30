import React from 'react';
import { color, font, tint } from '../tokens';
import Button from '../components/Button';
import PayButton from '../components/PayButton';
import PhoneFrame from '../components/PhoneFrame';
import { Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { VERIFY_EMAIL_SENDER } from '../data/authCopy';
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
          {account?.emailVerified === false && account.email ? (
            <Body size={12} style={{ marginBottom: 12 }}>{`First open the link we emailed to ${account.email} (from ${VERIFY_EMAIL_SENDER} - check spam), then tap Pay.`}</Body>
          ) : null}
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
