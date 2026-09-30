import React from 'react';
import { color, font, tint } from '../tokens';
import Button from '../components/Button';
import PayButton from '../components/PayButton';
import PhoneFrame from '../components/PhoneFrame';
import { Body, Card, ScreenTitle, SectionLabel, Tick } from '../components/Primitives';
import { VERIFIED, VERIFY_EMAIL_SENDER } from '../data/authCopy';
import { CONFIRMING, PAY_NOW } from '../data/billingCopy';
import { BOOKING_OPENS_LABEL, bookingOpen } from '../data/calendar';
import { packageById, PRICES_RELEASED } from '../data/packages';

/**
 * Until 00:00 Nov 1 America/Chicago every checkout prepays November in full
 * as its own line and the subscription's trial runs to Dec 1, when monthly
 * billing starts (functions/portal/prepaid.js). From Nov 1 checkout
 * prorates, so the receipt stops naming an amount.
 */
const PREPAYS_NOVEMBER_UNTIL = Date.parse('2026-11-01T05:00:00Z');

/** A monthly package (not the one-time single token) with a price to show. */
function pricedMonthly(pkg) {
  return Boolean(pkg) && pkg.kind !== 'single' && Number.isFinite(pkg.price) && PRICES_RELEASED;
}

/**
 * "You're in" (Sprint 20, spec 2.1 Success): the receipt, one Pay button per
 * athlete (createCheckoutSession), what happens next, and the role's home.
 * No walkthrough hop (spec 9: Success -> walkthrough -> NotProvisioned loop).
 * Before Nov 1 the receipt says what is paid today and that billing is then
 * monthly from Dec 1 (UX review P-07), because Stripe's page shows the plan
 * as a trial next to a charge due today. It never says when billing ends.
 */
export default function RegistrationSuccess({ bare = false, mode = 'signup', form, result, account, onFinish }) {
  const athleteMode = form.mode === 'athlete';
  const rows = form.athletes.map((a, i) => ({ ...a, athleteId: result?.athleteIds?.[i] ?? null, pkg: packageById(a.packageId) }));
  const prepaysNovember = Date.now() < PREPAYS_NOVEMBER_UNTIL;
  const priced = prepaysNovember ? rows.filter((r) => pricedMonthly(r.pkg)) : [];
  const payLabel = (r) => (pricedMonthly(r.pkg) && prepaysNovember
    ? `Pay $${r.pkg.price} for ${r.name.trim().split(/\s+/)[0]}'s ${r.pkg.name}`
    : `Pay for ${r.name.trim()}'s ${r.pkg ? r.pkg.name : 'package'}`);
  const payTerms = priced.length === 0 ? null
    : `Today you pay ${priced.length === 1 ? `$${priced[0].pkg.price}` : 'the amount on each button'} for November, then monthly from Dec 1. ` +
      "Stripe's page calls the plan a free trial until Dec 1 because November is paid today as a separate line.";
  const anyToken = rows.some((r) => r.pkg && r.pkg.kind !== 'elite');
  const anyElite = rows.some((r) => r.pkg && r.pkg.kind === 'elite');
  const logins = rows.filter((r) => r.loginEmail && r.ownLogin);
  const home = athleteMode ? '/portal/home' : '/portal/family';
  const page = athleteMode ? 'home page' : 'family page';
  const next = [
    ...(anyToken && !bookingOpen(Date.now()) ? [`Booking opens ${BOOKING_OPENS_LABEL} for token packages.`] : []),
    ...(anyElite ? ['Elite books right away once paid.'] : []),
    // UX review P-09: Stripe returns to the family page (home for an
    // athlete), not here, and this screen is gone after the next tap.
    `After you pay, Stripe sends you to your ${page}. It shows "${CONFIRMING}" for up to a minute.` +
      (!athleteMode && rows.length > 1 ? ` Paying for more than one athlete? The others wait there under ${PAY_NOW}.` : ''),
    ...logins.map((r) => `${r.name.trim()} signs in at ${window.location.host}/portal/signin with ${r.loginEmail.trim().toLowerCase()}. ` +
      `Continue with Google is quickest. With a password: tap Create a login, open the email from ${VERIFY_EMAIL_SENDER}, then tap ${VERIFIED}.`),
    `There's no welcome email. Your ${page} always shows what's paid and what's left to do.`,
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
          {payTerms ? <Body size={12} style={{ marginBottom: 12 }}>{payTerms}</Body> : null}
          {account?.emailVerified === false && account.email ? (
            <Body size={12} style={{ marginBottom: 12 }}>{`First open the link we emailed to ${account.email} (from ${VERIFY_EMAIL_SENDER} - check spam), then tap Pay.`}</Body>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((r) => (
              <PayButton key={r.key} athleteId={r.athleteId} email={account?.email ?? null} label={payLabel(r)} />
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
