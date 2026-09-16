import React from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import AllowancePools, { GraceLine } from '../components/AllowancePools';
import BottomTabBar from '../components/BottomTabBar';
import MemberSection from '../components/MemberSection';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { BackLink, Banner, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useMembership } from '../hooks';

/**
 * 19 · Membership — parent + athlete (Sprint 12 pin, contract v2.0). Route
 * /portal/membership; the retired /portal/billing redirects here (routing
 * lane). Life Time-style: one section per household member (an athlete's own
 * view has exactly one — themselves); per member ONE Tokens card (used /
 * granted / left, a grace line when a bonus token is on file, and an honest
 * "N booked next period" line), one Coaching line (Yannick's flat monthly
 * cadence, pin K), and the contract-tier line linking onward. Elite reads a
 * single "Unlimited · 24/7 access · books N days out" line with no
 * countdown anywhere (pin L) — no Tokens card, no Coaching cap, since Elite
 * has neither. Prices are catalogue facts, never amounts due, rendered with
 * "pending" when the catalogue flags them so — and the word "billing" stays
 * off every live member surface (unchanged Sprint 11 ruling; a membership
 * *status* line is Part 2 and is not billing).
 *
 * Golf/Performance cards and the old Mental line are deleted — this sprint
 * replaced the two-pool entitlement model wholesale (TEAM.md "Sprint 12
 * pins — the token model").
 *
 * Sprint 13 (contract v2.1, pin H): a household status line, once per
 * household, above the member sections — `data.household.membership` is
 * `{ status, currentPeriodEnd } | null`, and null means active (the pin's
 * own absent-as-null rule) — active renders nothing loud, past_due and
 * lapsed render the pin's exact copy. An athlete-linked account's own
 * `household` is always null (useMembership's single-self-entry branch), so
 * this line only ever appears on the parent view — consistent with a
 * household's Stripe status being the payer's concern, not shown as a gap.
 *
 * ENTITLEMENTS ARE DERIVED, NEVER STORED (the pin's own keystone) — every
 * number below is exactly what useMembership()'s `tokens` returns.
 *
 * The Coaching line reads `member.coaching: { used, limit }` - Yannick's
 * mental-game count for the calendar month against SPECIALIST_MONTHLY_CAP
 * .mental (pin K), derived by useMembership() at Sprint 12 integration. It
 * renders nothing when the field is absent.
 *
 * `variant` is harness-only: every live route passes the default
 * 'populated', a pure pass-through of useMembership() (seed or live). The
 * other three states need no data and drive the same branches locally, the
 * way TourStandings' variant does.
 *
 * @param {'populated'|'loading'|'error'|'empty'} variant  Harness-only (see above).
 * @param {'parent'|'athlete'} [role]
 * @param {() => void} [onBack]  Hidden when not supplied.
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 * @param {Array} [demoMembers]  HARNESS-ONLY — an explicit members array,
 *   rendered as if `variant === 'populated'` had returned it. Real routes
 *   never pass this; it exists only so the states gallery can preview
 *   the tokens/Elite/grace-token member shapes the seed doesn't produce yet.
 * @param {object} [demoHousehold]  HARNESS-ONLY, same category as
 *   `demoMembers` — overrides `data.household` so the states gallery can
 *   preview the Sprint 13 past_due/lapsed status line, which no seed
 *   household carries yet. No real caller ever passes it.
 */
export default function Membership({
  variant = 'populated',
  bare = false,
  role = 'parent',
  onBack,
  onRetry,
  demoMembers,
  demoHousehold,
}) {
  const hookState = useMembership();
  const navigate = useNavigate();

  const demo = variant !== 'populated' || Boolean(demoMembers) || Boolean(demoHousehold);
  const loading = demoMembers ? false : demo ? variant === 'loading' : hookState.loading;
  const error = demoMembers ? null : demo ? (variant === 'error' ? new Error("Membership didn't load.") : null) : hookState.error;
  const data = demoMembers || demoHousehold
    ? { household: demoHousehold ?? null, members: demoMembers ?? [] }
    : demo
    ? variant === 'empty'
      ? { household: null, members: [] }
      : null
    : hookState.data;

  const allMembers = data?.members ?? [];
  const members = role === 'athlete' ? allMembers.slice(0, 1) : allMembers;
  const isEmpty = !loading && !error && members.length === 0;

  const openContract = (member) =>
    role === 'athlete' ? navigate('/portal/contract') : navigate(`/portal/athlete/${member.athleteId}`);

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
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {loading ? (
          <MembershipSkeleton />
        ) : error ? (
          <ErrorNotice title="Membership didn't load" onRetry={onRetry}>
            Membership details didn't load. Check your connection and try again.
          </ErrorNotice>
        ) : isEmpty ? (
          <Card large>
            <SectionLabel style={{ marginBottom: 8 }}>No linked athletes</SectionLabel>
            <Body size={12}>
              {role === 'athlete'
                ? 'No package is on file for your account yet — ask the academy.'
                : "This household has no linked athletes yet — link one from Settings before there's a membership to show."}
            </Body>
          </Card>
        ) : (
          <>
            <HouseholdStatusBanner membership={data?.household?.membership} />
            {members.map((member) => (
              <MemberSection key={member.athleteId} name={member.name}>
                {member.package?.kind === 'elite' ? (
                  <EliteCard pkg={member.package} />
                ) : (
                  <TokensCard pkg={member.package} tokens={member.tokens} />
                )}
                <CoachingLine coaching={member.coaching} />
                <ContractLine
                  contractMinutes={member.contractMinutes}
                  onOpen={() => openContract(member)}
                  role={role}
                />
              </MemberSection>
            ))}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

/**
 * Sprint 13 pin H's exact copy: active renders nothing loud (null/'active'
 * short-circuits), past_due and lapsed state plainly what changed and what
 * did not. "billing" appears nowhere in this — a membership *status* line is
 * not the parked billing surface (Sprint 11 ruling, restated in the pin).
 */
function HouseholdStatusBanner({ membership }) {
  if (!membership || membership.status === 'active') return null;
  if (membership.status === 'past_due') {
    return (
      <Banner tone="yellow" title="Payment didn't go through">
        New bookings are paused until it clears; everything already booked is kept.
      </Banner>
    );
  }
  if (membership.status === 'lapsed') {
    return (
      <Banner tone="red" title="Membership lapsed">
        Upcoming bookings were released. Once payment resumes, book again from what's open.
      </Banner>
    );
  }
  return null;
}

/** Catalogue price as a fact, never an amount due — "pending" when the catalogue flags it. */
function priceLine(pkg) {
  if (!pkg) return null;
  return `$${pkg.price} / period${pkg.pending ? ' · pending' : ''}`;
}

function TokensCard({ pkg, tokens }) {
  const nextPeriodBooked = tokens?.nextPeriod?.booked ?? 0;
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 4 }}>Tokens</SectionLabel>
      {pkg ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 12 }}>
            <span style={{ font: `600 15px ${font.body}`, color: color.text }}>{pkg.name}</span>
            <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>{priceLine(pkg)}</span>
          </div>
          <AllowancePools tokens={tokens} />
          <GraceLine tokens={tokens} />
          {nextPeriodBooked > 0 ? (
            <Body size={11} tone={color.textTertiary} style={{ marginTop: 8 }}>
              {nextPeriodBooked} booked next period
            </Body>
          ) : null}
        </>
      ) : (
        <Body size={12} style={{ marginTop: 8 }}>
          No package on file — ask the academy.
        </Body>
      )}
    </Card>
  );
}

/** Pin L: "Unlimited · 24/7 access · books N days out." No countdown anywhere. */
function EliteCard({ pkg }) {
  return (
    <Card large tone="green">
      <SectionLabel style={{ marginBottom: 4 }}>Membership</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 10 }}>
        <span style={{ font: `600 15px ${font.body}`, color: color.text }}>{pkg.name}</span>
        <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>{priceLine(pkg)}</span>
      </div>
      <Body size={13} tone={color.primary} style={{ fontWeight: 600 }}>
        Unlimited · 24/7 access · books {pkg.windowDays} days out
      </Body>
    </Card>
  );
}

/**
 * "Yannick: 1 of 1 this month" — the mental frequency knob (pin K,
 * SPECIALIST_MONTHLY_CAP.mental). A line, not a card, per the pin's own
 * layout. `member.coaching` is derived by useMembership() (Sprint 12
 * integration).
 */
function CoachingLine({ coaching }) {
  if (!coaching) return null;
  return (
    <Body size={12} tone={color.textSecondary} style={{ padding: '0 2px' }}>
      Yannick: {coaching.used} of {coaching.limit} this month
    </Body>
  );
}

function ContractLine({ contractMinutes, onOpen, role }) {
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
      <span>
        {contractMinutes != null ? `${contractMinutes} min contract tier` : 'No contract tier yet'} ·{' '}
        {role === 'athlete' ? 'View contract' : 'View on Athlete Detail'}
      </span>
      <span aria-hidden="true" style={{ color: color.textTertiary }}>
        ›
      </span>
    </button>
  );
}

function MembershipSkeleton() {
  return (
    <div role="status" aria-label="Loading membership" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonBar width={96} height={16} />
          <SkeletonCard large>
            <SkeletonBar tone="raised" width={110} height={10} />
            <SkeletonBar tone="raised" width={150} height={15} style={{ marginTop: 10 }} />
            <div style={{ marginTop: 15 }}>
              <SkeletonBar tone="raised" height={6} r={3} />
            </div>
          </SkeletonCard>
          <SkeletonCard large height={64} />
        </div>
      ))}
    </div>
  );
}
