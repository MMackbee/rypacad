import React from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import FacilityCard from '../components/FacilityCard';
import MemberSection from '../components/MemberSection';
import PendingBanner from '../components/PendingBanner';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import TokenMeter from '../components/TokenMeter';
import { BackLink, Banner, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useMyTokens } from '../hooks/billing';
import { contractEnabled } from '../data/contractFlag';

/**
 * 19 · Membership — the athlete's own tokens (Sprint 12 pin, contract v2.0;
 * rebuilt Sprint 17, contract v2.5). Route /portal/membership for athletes;
 * a parent is redirected to the Billing hub (/portal/billing, Sprint 16).
 *
 * ONE METER, THREE AUDIENCES: this is the same TokenMeter the parent's hub
 * and the staff view render, over `useMyTokens()` — `hubMemberFor` on the
 * athlete's own documents with their household's anchor day. Nothing here
 * counts anything; the number is exactly what the booking gate permits.
 *
 * "billing" still appears nowhere on the athlete surface: the household's
 * standing shows only as the paused-bookings banner when it bites (past
 * due / lapsed), never as amounts or cards.
 *
 * @param {'populated'|'past_due'|'lapsed'|'loading'|'error'|'empty'} variant
 *   Harness-only. Live routes pass nothing.
 * @param {() => void} [onBack]  Hidden when not supplied.
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 */
export default function Membership({ variant = 'populated', bare = false, role = 'athlete', onBack, onRetry }) {
  const hookVariant = variant === 'past_due' || variant === 'lapsed' ? variant : 'populated';
  const hook = useMyTokens({ variant: hookVariant });
  const navigate = useNavigate();

  const demo = variant === 'loading' || variant === 'error' || variant === 'empty';
  const loading = demo ? variant === 'loading' : hook.loading;
  const error = demo ? (variant === 'error' ? new Error("Membership didn't load.") : null) : hook.error;
  const data = demo ? null : hook.data;
  const member = data?.member ?? null;
  const status = data?.status ?? null;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Back</BackLink> : null}
          <ScreenTitle size={22} style={{ marginTop: onBack ? 8 : 0 }}>
            Membership
          </ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role={role} />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {loading ? (
          <MembershipSkeleton />
        ) : error ? (
          <ErrorNotice title="Membership didn't load" onRetry={onRetry}>
            Your tokens didn't load. Check your connection and try again.
          </ErrorNotice>
        ) : !member ? (
          <Card large>
            <SectionLabel style={{ marginBottom: 8 }}>No membership yet</SectionLabel>
            <Body size={12}>No package is on file for your account yet — ask the academy.</Body>
          </Card>
        ) : (
          <>
            <StatusBanner status={status} />
            <PendingBanner pendingAthletes={status?.status === 'pending' ? status.pendingAthletes : []} body={status?.body} title={status?.title} />
            <MemberSection name={member.name}>
              <TokenMeter member={member} defaultOpen />
              <CoachingLine coaching={member.coaching} />
              {contractEnabled() ? (
                <ContractLine contractMinutes={member.contractMinutes} onOpen={() => navigate('/portal/contract')} />
              ) : null}
              <FacilityCard member={member} />
            </MemberSection>
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

/** The paused-bookings banner, only when the household's standing bites (Sprint 13 pin H copy). */
function StatusBanner({ status }) {
  if (!status || !status.paused) return null;
  if (status.status === 'lapsed') {
    return (
      <Banner tone="red" title="Membership lapsed">
        Upcoming bookings were released. Once payment resumes, book again from what's open.
      </Banner>
    );
  }
  return (
    <Banner tone="yellow" title="Payment didn't go through">
      New bookings are paused until it clears; everything already booked is kept.
    </Banner>
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
      <span>{contractMinutes != null ? `${contractMinutes} min contract tier` : 'No contract tier yet'} · View contract</span>
      <span aria-hidden="true" style={{ color: color.textTertiary }}>
        ›
      </span>
    </button>
  );
}

function MembershipSkeleton() {
  return (
    <div role="status" aria-label="Loading membership" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <SkeletonBar width={96} height={16} />
      <SkeletonCard large>
        <SkeletonBar tone="raised" width={110} height={10} />
        <SkeletonBar tone="raised" width={72} height={40} style={{ marginTop: 12 }} />
        <div style={{ marginTop: 14 }}>
          <SkeletonBar tone="raised" height={8} r={4} />
        </div>
      </SkeletonCard>
      <SkeletonCard large height={64} />
    </div>
  );
}
