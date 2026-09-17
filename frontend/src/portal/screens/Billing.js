import React from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import MemberSection from '../components/MemberSection';
import PhoneFrame from '../components/PhoneFrame';
import SequenceLadder from '../components/SequenceLadder';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import StatusBadge from '../components/StatusBadge';
import TokenMeter from '../components/TokenMeter';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { ordinal, statusFor } from '../data/billingHub';
import useBillingHub from '../hooks/billing';

/**
 * 10 · Billing — the parents' hub (contract v2.4, Sprint 16: "the hub for
 * parents to see how many tokens are left"). Route /portal/billing, the
 * parent tab bar's Billing tab; a parent hitting /portal/membership lands
 * here, an athlete keeps their own Membership view.
 *
 * Three questions, in order: is the membership in good standing (the hero,
 * from households.membership — Stripe's status, never guessed); how many
 * tokens does each athlete have left and why (TokenMeter, from the SAME
 * tokensFor the booking gate runs, with the evidence one tap away); what is
 * the plan (packages, billing day, catalogue prices marked pending).
 *
 * NO FAKE MONEY: no card art, no invoice rows, no amounts until Stripe data
 * exists. "Update payment method" opens the Stripe customer portal login
 * link when the academy configured one (REACT_APP_STRIPE_PORTAL_URL);
 * otherwise the hero says to contact the academy.
 *
 * @param {'populated'|'past_due'|'lapsed'|'loading'|'error'|'empty'} variant
 *   Harness-only. Live routes pass nothing.
 */
export default function Billing({
  variant = 'populated',
  bare = false,
  onRetry,
  // Sprint 17 (contract v2.5): the staff view of any household - same hub,
  // read-only (no card CTA), back to Admin, the staff role's tab bar.
  householdId = null,
  staff = false,
  role = 'parent',
  onBack,
}) {
  const hookVariant = variant === 'past_due' || variant === 'lapsed' ? variant : 'populated';
  const hook = useBillingHub({ variant: hookVariant, householdId });
  const navigate = useNavigate();

  const demo = variant === 'loading' || variant === 'error' || variant === 'empty';
  const loading = demo ? variant === 'loading' : hook.loading;
  const error = demo ? (variant === 'error' ? new Error("Billing didn't load.") : null) : hook.error;
  const data = demo
    ? variant === 'empty'
      ? { household: null, members: [], status: statusFor(null), portalUrl: null }
      : null
    : hook.data;

  const members = data?.members ?? [];
  const status = data?.status ?? null;
  const isEmpty = !loading && !error && members.length === 0;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: onBack ? 8 : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {staff ? <SectionLabel style={{ marginBottom: 4 }}>Billing · staff view</SectionLabel> : null}
              <ScreenTitle size={22}>{staff ? data?.household?.name || 'Household' : 'Billing'}</ScreenTitle>
            </div>
            {status && !loading && !error ? <StatusBadge tone={status.badge.tone}>{status.badge.label}</StatusBadge> : null}
          </div>
        </div>
      }
      footer={<BottomTabBar role={staff ? role : 'parent'} active={staff ? 'admin' : 'billing'} />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {loading ? (
          <BillingSkeleton />
        ) : error ? (
          <ErrorNotice title="Billing didn't load" onRetry={onRetry}>
            Your tokens and membership didn't load. Check your connection and try again.
          </ErrorNotice>
        ) : (
          <>
            <StatusHero status={status} portalUrl={staff ? null : data?.portalUrl} staff={staff} />
            {status?.ladder ? (
              <Card large>
                <SectionLabel style={{ marginBottom: 15 }}>Where this stands</SectionLabel>
                <SequenceLadder rungs={status.ladder} current={status.ladderAt} />
              </Card>
            ) : null}

            {isEmpty ? (
              <Card large>
                <SectionLabel style={{ marginBottom: 8 }}>No linked athletes</SectionLabel>
                <Body size={12}>
                  This household has no linked athletes yet — link one from Settings before there's anything to bill.
                </Body>
              </Card>
            ) : (
              members.map((member) => (
                <MemberSection key={member.athleteId} name={member.name}>
                  <TokenMeter member={member} defaultOpen={members.length === 1} />
                  <CoachingLine coaching={member.coaching} />
                  <ContractLine
                    contractMinutes={member.contractMinutes}
                    onOpen={() => navigate(`/portal/athlete/${member.athleteId}`)}
                  />
                </MemberSection>
              ))
            )}

            {members.length ? <PlanCard household={data?.household} members={members} /> : null}
            <ConnectionCard household={data?.household} portalUrl={data?.portalUrl} />
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

const SURFACES = {
  default: { background: color.surface, border: color.border },
  yellow: { background: 'rgba(244,238,25,.06)', border: color.secondary },
  red: { background: 'rgba(255,68,68,.07)', border: color.error },
};

/** The membership's standing — Stripe's status, the contract's copy, dates only when recorded. */
function StatusHero({ status, portalUrl, staff = false }) {
  if (!status) return null;
  const s = SURFACES[status.tone] || SURFACES.default;
  // Staff read the standing; only the payer updates the card.
  const cta = staff ? null : status.cta;
  return (
    <div style={{ background: s.background, border: `1px solid ${s.border}`, borderRadius: radius.cardLarge, padding: 17 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SectionLabel style={{ flex: 1 }}>Membership</SectionLabel>
        <StatusBadge tone={status.badge.tone}>{status.badge.label}</StatusBadge>
      </div>
      <ScreenTitle size={20} style={{ marginTop: 12 }}>
        {status.title}
      </ScreenTitle>
      <Body size={13} style={{ marginTop: 10 }}>
        {status.body}
      </Body>
      {cta ? (
        portalUrl ? (
          <Button
            variant={status.tone === 'red' ? 'danger' : 'caution'}
            height={50}
            style={{ marginTop: 15, boxShadow: 'none' }}
            onClick={() => window.open(portalUrl, '_blank', 'noopener')}
          >
            {cta}
          </Button>
        ) : (
          <Body size={12} tone={color.textSecondary} style={{ marginTop: 12 }}>
            To update your card, contact the academy. Booking reopens the same day the invoice clears.
          </Body>
        )
      ) : null}
    </div>
  );
}

/** "Yannick: 1 of 1 this month" — the mental-game cadence, a line not a card. */
function CoachingLine({ coaching }) {
  if (!coaching || coaching.limit == null) return null;
  return (
    <Body size={12} tone={color.textSecondary} style={{ padding: '0 2px' }}>
      Yannick: {coaching.used} of {coaching.limit} this month
    </Body>
  );
}

function ContractLine({ contractMinutes, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        background: 'none',
        border: 'none',
        padding: '2px 2px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        minHeight: 44,
        font: `500 13px ${font.body}`,
        color: color.primary,
        cursor: 'pointer',
      }}
    >
      <span>{contractMinutes != null ? `${contractMinutes} min contract tier` : 'No contract tier yet'} · View athlete</span>
      <span aria-hidden="true" style={{ color: color.textTertiary }}>
        ›
      </span>
    </button>
  );
}

/** The plan: one row per athlete, catalogue prices as facts, the billing day. */
function PlanCard({ household, members }) {
  const anyPending = members.some((m) => m.package?.pending);
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>Plan</SectionLabel>
      {members.map((m, i) => (
        <div
          key={m.athleteId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '11px 0',
            borderBottom: i < members.length - 1 ? `1px solid ${color.ruleSoft}` : 'none',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{m.name}</div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
              {!m.package
                ? 'No package'
                : m.package.kind === 'elite'
                  ? `${m.package.name} · unlimited`
                  : `${m.package.name} a period`}
              {m.package?.windowDays ? ` · books ${m.package.windowDays} days out` : ''}
            </div>
          </div>
          <div style={{ font: `500 13px ${font.mono}`, color: m.package?.price != null ? color.text : color.textTertiary }}>
            {m.package?.price != null ? `$${m.package.price}` : '—'}
            {m.package?.pending ? <span style={{ font: `400 10px ${font.body}`, color: color.secondary }}> pending</span> : null}
          </div>
        </div>
      ))}
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>
        Billed monthly on the {ordinal(household?.anchorDay ?? 1)}. Tokens reset the same day.
        {anyPending ? " Prices marked pending are awaiting the academy's confirmation." : ''}
      </Body>
    </Card>
  );
}

/** No fake money: what is and isn't connected, in one honest line. */
function ConnectionCard({ household, portalUrl }) {
  const connected = Boolean(household?.stripeCustomerId);
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 8 }}>Card &amp; invoices</SectionLabel>
      <Body size={12}>
        {connected
          ? 'Your card and invoices are managed in Stripe. Invoice history will appear here once online billing is connected.'
          : 'Card and invoice history appear here once online billing is connected.'}
      </Body>
      {portalUrl ? (
        <Button variant="outline" height={42} style={{ marginTop: 12, boxShadow: 'none' }} onClick={() => window.open(portalUrl, '_blank', 'noopener')}>
          Manage billing in Stripe
        </Button>
      ) : null}
    </Card>
  );
}

function BillingSkeleton() {
  return (
    <div role="status" aria-label="Loading billing" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SkeletonCard large height={118} />
      {[0, 1].map((i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonBar width={96} height={16} />
          <SkeletonCard large>
            <SkeletonBar tone="raised" width={110} height={10} />
            <SkeletonBar tone="raised" width={72} height={40} style={{ marginTop: 12 }} />
            <div style={{ marginTop: 14 }}>
              <SkeletonBar tone="raised" height={8} r={4} />
            </div>
          </SkeletonCard>
        </div>
      ))}
    </div>
  );
}
