import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { color, font } from '../tokens';
import PendingBanner from '../components/PendingBanner';
import ChangePackageSheet, { ChangePackageLink } from '../components/ChangePackageSheet';
import PaymentConfirming from '../components/PaymentConfirming';
import WalkthroughOffer from '../components/WalkthroughOffer';
import useBillingHub from '../hooks/billing';
import { billingBadge, loginStatusLine } from '../data/billingCopy';
import BookChooser, { BookChooserSheet, bookNavigation } from '../components/BookChooser';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter, { meterColor } from '../components/ProgressMeter';
import StatusBadge from '../components/StatusBadge';
import TypeChip from '../components/TypeChip';
import { Avatar } from '../components/MediaPlaceholder';
import AllowancePools from '../components/AllowancePools';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { AlertGlyph, Body, Card, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { useHousehold } from '../hooks';
import { ALL_PACKAGES, siblingDiscountApplies } from '../data/packages';
import { contractEnabled } from '../data/contractFlag';

/**
 * Sprint 11 pin D entry point (TEAM.md, contract v1.9): "the ParentDashboard
 * child card's package label taps into /portal/membership." useHousehold's
 * child shape carries `packageId` but not a resolved `packageName` (only
 * useHouseholdAthletes does that join, and this screen intentionally reads
 * the fixed-card useHousehold instead — see its own header comment) — this
 * is a client-side lookup against the real catalogue, the same kind of pure
 * derivation PackageCard.js already does, not an invented name. Sprint 12:
 * one catalogue now (`ALL_PACKAGES`, data/packages.js) — the golf/fitness/
 * Elite-tier lookup this replaced is deleted with the two-pool model.
 */
function packageName(packageId) {
  return ALL_PACKAGES.find((p) => p.id === packageId)?.name ?? null;
}

/**
 * 08 · Parent Dashboard - parent.
 * States: One child, Three children, Payment issue flagged.
 *
 * Designed for two or three children, not one. Multi-child households are the
 * stated norm, and a layout that only looks right with a single card is the
 * wrong default.
 *
 * Sprint 5 pin (TEAM.md): "Link another athlete" moved to Settings
 * (NotificationPreferences.js) - it no longer renders here.
 *
 * @param {'one'|'three'|'payment'} variant
 * @param {boolean} [practice]  The onboarding walkthrough's family step: the
 *   Whitfield seed and its hub, never the signed-in family's own data.
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 * @param {(athleteId: string) => void} [onOpenAthlete]  Each child card calls
 *   this with its own id - routing wires it to /portal/athlete/:athleteId.
 * @param {(athleteId: string) => void} [onBookFor]  Sprint 7 pin (TEAM.md,
 *   "Book-for-kid deep link"): each child card's full-width footer "Book a
 *   session" button calls this with its own id - routing wires it to
 *   /portal/book, passing the id as BookSession's initialAthleteId via
 *   navigation state. Lives at the card's foot (owner's report 2026-09-10:
 *   the old corner chip crowded the standing badge) and stops its own click
 *   from bubbling to the card's open-profile tap.
 * @param {() => void} [onBookCoaching]  Sprint 9 pin (TEAM.md, "specialist
 *   1-on-1s"): the ONE full-width "Book 1-on-1 coaching" action under the
 *   kid cards (not per-card - SpecialistBooking itself carries the child
 *   selector once opened, via its own initialAthleteId prop). Routing wires
 *   this to a plain navigate('/portal/coaching') the same way onBookFor
 *   navigates to /portal/book; PortalRoutes.js wiring is the PM's call at
 *   integration (this lane only adds the prop and the button - flagged in
 *   the sprint report). Hidden when not supplied, same convention as every
 *   other optional affordance in this file.
 */
export default function ParentDashboard({
  variant = 'three',
  bare = false,
  practice = false,
  onOpenAthlete,
  onRetry,
}) {
  const { data, loading, error } = useHousehold({ variant, practice });
  const children = data?.children ?? [];
  const billing = data?.billing;
  const flagged = billing?.status === 'failed';
  // Sprint 16 (contract v2.4): the household's Stripe standing, the same
  // households.membership the Billing hub renders - past_due and lapsed
  // pause booking, so the banner and the ON HOLD badges follow it live.
  // The seed 'payment' variant keeps driving the harness through `billing`.
  // Read off the hub, which already carries households.membership - a
  // separate useMembership() re-fetched the whole household for one field.
  const hub = useBillingHub({ practice });
  const membershipStatus = hub.data?.household?.membership?.status ?? null;
  const paused = membershipStatus === 'past_due' || membershipStatus === 'lapsed';
  const onHold = flagged || paused;
  // Sprint 20 (spec 4.4): per-athlete paid state from the same hub Billing
  // renders; the household-level `membership` above keeps its meaning.
  const hubStatus = hub.data?.status ?? null;
  const billingById = new Map((hub.data?.members ?? []).map((m) => [m.athleteId, m.billing?.status ?? 'active']));
  const [params] = useSearchParams();
  const paidAthleteId = params.get('paid');
  const paidChild = children.find((c) => c.id === paidAthleteId) ?? null;
  // The athlete just back from Stripe is confirming, not unpaid: no second
  // Pay now while the webhook lands - a second checkout double-subscribes.
  const pendingAthletes = (hubStatus?.status === 'pending' ? hubStatus.pendingAthletes : [])
    .filter((a) => a.athleteId !== paidAthleteId);
  // The facility add-ons ticked at sign-up (owner 2026-09-30). One just paid
  // for is confirming the same way: no second add-on checkout meanwhile. A
  // membership return keeps its athlete's add-on row - it is the next step.
  const facilityPending = hub.data?.facilityPending ?? [];
  const facilityRows = facilityPending.filter((r) => !(params.get('product') === 'facility' && r.athleteId === paidAthleteId));
  // Sprint 11 pin D entry point: same direct-navigate() precedent
  // AthleteDashboard's own coaching/membership links already use (this lane
  // never edits PortalRoutes.js) rather than a new onOpenMembership prop —
  // one static internal route, no routing wiring needed.
  const navigate = useNavigate();
  // Owner feedback (2026-09-16): a kid's "Book a session" opens the three-way
  // chooser (golf / performance / mental game) for that kid; the same three
  // options sit inline under the cards for a parent who has not picked a kid
  // yet (the booking screens carry their own child selector).
  const [bookFor, setBookFor] = useState(null);
  // A never-paid athlete's package can still change before Pay now (tester S4, 2026-09-30).
  const [changeFor, setChangeFor] = useState(null);
  const pick = (option, athleteId) => {
    const [to, opts] = bookNavigation(option, athleteId);
    navigate(to, opts);
  };

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div
          style={{
            padding: '8px 22px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              // Sized like the date line + household name so nothing jumps.
              <>
                <SkeletonBar width={96} height={12} />
                <SkeletonBar width={168} height={24} style={{ marginTop: 8 }} />
              </>
            ) : (
              <>
                <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>{data?.date}</div>
                <ScreenTitle style={{ marginTop: 3 }}>{data?.name}</ScreenTitle>
              </>
            )}
          </div>
          <Avatar size={40} name={data?.name} />
        </div>
      }
      footer={<BottomTabBar role="parent" active="home" />}
    >
      {loading ? (
        <HouseholdSkeleton rows={contractEnabled() ? 3 : 2} />
      ) : error ? (
        <div style={{ padding: '0 22px 24px' }}>
          <ErrorNotice title="Family overview didn't load" onRetry={onRetry}>
            Your family's overview didn't load. Check your connection and try again.
          </ErrorNotice>
        </div>
      ) : (
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/*
          Billing is one household-level banner, not a per-child badge - the
          invoice belongs to the household, not to any one athlete. The per-child
          standing badge does flip to ON HOLD, because booking is what actually
          gets restricted.
        */}
        <PaymentConfirming
          athleteId={paidAthleteId}
          whatsNext={{ athlete: paidChild, product: params.get('product'), onBook: paidChild ? () => setBookFor(paidChild) : undefined,
            facilityDue: facilityPending.some((r) => r.athleteId === paidAthleteId) }}
        />
        {/* The sibling rule reads the whole family, paid members included. */}
        <PendingBanner pendingAthletes={pendingAthletes} facilityRows={facilityRows} body={hubStatus?.body} title={hubStatus?.title}
          siblingDiscount={siblingDiscountApplies(hub.data?.members)}
          renderRowExtra={(a) => <ChangePackageLink athlete={a} onOpen={setChangeFor} />} />
        {onHold ? (
          <PaymentBanner billing={flagged ? billing : bannerFor(membershipStatus)} onOpen={() => navigate('/portal/billing')} />
        ) : null}

        {children.map((child) => (
          <ChildCard
            key={child.id}
            child={child}
            onHold={onHold}
            billingStatus={billingById.get(child.id) ?? 'active'}
            onOpen={onOpenAthlete ? () => onOpenAthlete(child.id) : undefined}
            onBookFor={() => setBookFor(child)}
            onOpenMembership={() => navigate('/portal/billing')}
          />
        ))}

        {/* First-visit walkthrough offer, below Pay and the cards; never inside the walkthrough itself. */}
        {practice ? null : <WalkthroughOffer track="parent" />}

        {/*
          Sprint 9 pin (TEAM.md): ONE full-width coaching entry point under
          the kid cards, not a per-card affordance - SpecialistBooking's own
          "Booking for" selector (Sprint 9's mirror of BookSession's child
          picker) is where a specific child gets chosen. Secondary variant,
          same footer-Button precedent as each ChildCard's own "Book a
          session" button (Sprint 7) - a solid green fill here would read as
          equal or higher priority than the per-kid Book buttons above it,
          which flag 02 reserves for a screen's one primary action.
        */}
        <BookChooser onPick={(option) => pick(option, null)} />
        <BookChooserSheet
          open={Boolean(bookFor)}
          athleteName={bookFor?.name}
          onPick={(option) => {
            const child = bookFor;
            setBookFor(null);
            pick(option, child?.id ?? null);
          }}
          onClose={() => setBookFor(null)}
        />
        <ChangePackageSheet athlete={changeFor} onClose={() => setChangeFor(null)} />
      </div>
      )}
    </PhoneFrame>
  );
}

/**
 * The loading layout in the loaded layout's geometry: two child cards at the
 * real card's 198px minimum — avatar row, rule, then the Next / Contract /
 * Left meta rows. No spinner — see components/Skeleton.js.
 */
function HouseholdSkeleton({ rows }) {
  return (
    <div
      role="status"
      aria-label="Loading family overview"
      style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {[0, 1].map((i) => (
        <SkeletonCard key={i} large style={{ minHeight: 198 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SkeletonBar tone="raised" width={44} height={44} r="50%" />
            <div style={{ flex: 1 }}>
              <SkeletonBar tone="raised" width={104} height={13} />
              <SkeletonBar tone="raised" width={70} height={9} style={{ marginTop: 6 }} />
            </div>
            <SkeletonBar tone="raised" width={64} height={20} r={5} />
          </div>
          <div style={{ height: 1, background: color.rule, margin: '14px 0 13px' }} />
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} style={{ display: 'flex', gap: 10, marginTop: row ? 12 : 0 }}>
              <SkeletonBar tone="raised" width={66} height={9} style={{ marginTop: 3 }} />
              <SkeletonBar tone="raised" width="55%" height={13} />
            </div>
          ))}
        </SkeletonCard>
      ))}
    </div>
  );
}

/** The contract's own copy for a live status (Sprint 13 pin H), shaped like the seed's `billing`. */
function bannerFor(status) {
  if (status === 'lapsed') {
    return { title: 'Membership lapsed', body: "Upcoming bookings were released. Once payment resumes, book again from what's open." };
  }
  return { title: "Payment didn't go through", body: 'New bookings are paused until it clears; everything already booked is kept.' };
}

function PaymentBanner({ billing, onOpen }) {
  return (
    <div
      style={{
        background: 'rgba(255,68,68,.08)',
        border: `1px solid ${color.error}`,
        borderRadius: 14,
        padding: 15,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <AlertGlyph size={20} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 14px ${font.body}`, color: color.error }}>{billing.title}</div>
          <Body size={12} style={{ marginTop: 5 }}>
            {billing.body}
          </Body>
        </div>
      </div>
      <Button variant="danger" height={46} style={{ marginTop: 13 }} onClick={onOpen}>
        See billing
      </Button>
    </div>
  );
}

/**
 * Fixed height regardless of how much data the child has, so a household scans a
 * consistent rhythm - next session, contract, standing - rather than three
 * differently shaped blocks. Nico has no contract data and the card still holds
 * its shape.
 *
 * While the contract is hidden (owner, 2026-09-30) the card drops the
 * Contract row, the On track / Behind badge (a contract standing - billing
 * badges stay) and the "45 min tier" in the age line.
 */
const CONTRACT_STANDINGS = ['On track', 'Behind'];

function ChildCard({ child, onHold, billingStatus, onOpen, onBookFor, onOpenMembership }) {
  const showContract = contractEnabled();
  const childStanding = showContract || !CONTRACT_STANDINGS.includes(child.standing?.label) ? child.standing : null;
  const standing = onHold ? { tone: 'red', label: 'On hold' } : billingBadge(billingStatus) ?? childStanding;
  const childPackageName = packageName(child.packageId);

  return (
    // The whole card opens the athlete's detail (09) - the handoff's flow has
    // 08's child cards leading there, and a card this dense has no room for a
    // separate affordance.
    <Card large onClick={onOpen} style={{ minHeight: 198 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar size={44} name={child.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 16px ${font.body}`, color: color.text }}>{child.name}</div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
            {child.ageLine}
          </div>
          {/* Sprint 20 (spec 3.2, D9): the child-login state, from liveChildCard's
              loginEmail + login. Legacy payloads and the seed carry neither key,
              so nothing renders and the card keeps its shape. */}
          {'loginEmail' in child ? (
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
              {loginStatusLine(child)}
            </div>
          ) : null}
          {/*
            Sprint 11 pin D entry point: the package label taps into
            /portal/membership rather than the card's own onOpen (athlete
            detail) — stops its own click from bubbling, same convention
            onBookFor already uses below for the identical open-profile
            conflict. Hidden without a resolvable package name or the
            callback, matching every other optional affordance in this file.
          */}
          {childPackageName && onOpenMembership ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenMembership();
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                marginTop: 3,
                font: `500 11px ${font.body}`,
                color: color.primary,
                cursor: 'pointer',
              }}
            >
              {childPackageName} ›
            </button>
          ) : null}
        </div>
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          {/* Live cards carry honest nulls the seed never did (QA hotfix):
              no standing signal -> no badge, nothing booked -> plain copy. */}
          {standing ? (
            <StatusBadge tone={standing.tone} dashed={standing.dashed}>
              {standing.label}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <div style={{ height: 1, background: color.rule, margin: '14px 0 13px' }} />

      <MetaRow label="Next">
        {child.next ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TypeChip type={child.next.type} />
              <span style={{ font: `600 13px ${font.body}`, color: color.text }}>
                {child.next.when}
              </span>
            </div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textSecondary, marginTop: 4 }}>
              {child.next.meta}
            </div>
          </>
        ) : (
          <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
            Nothing booked yet
          </span>
        )}
      </MetaRow>

      {showContract ? (
        <MetaRow label="Contract" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ProgressMeter value={child.contract} size="inline" />
            <span
              style={{
                width: 38,
                flex: 'none',
                textAlign: 'right',
                font: `600 12px ${font.body}`,
                color: meterColor(child.contract),
              }}
            >
              {child.contract == null ? '—' : `${child.contract}%`}
            </span>
          </div>
        </MetaRow>
      ) : null}

      {/*
        Sprint 12 (contract v2.0): one token pool, not two - a single number
        per child now (Elite: "Elite · unlimited", AllowancePools' own
        unlimited branch).
      */}
      <MetaRow label="Tokens" style={{ marginTop: 12 }}>
        {child.tokens ? (
          <AllowancePools tokens={child.tokens} compact />
        ) : (
          <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>—</span>
        )}
      </MetaRow>

      {/* Sprint 7 pin (TEAM.md, "Book-for-kid deep link"), repositioned on
          the owner's report (2026-09-10): the compact corner chip crowded —
          and on short names overlapped — the standing badge, so Book is a
          full-width footer action instead: an unmissable target in the one
          place every card has room, after the balances a parent checks
          before booking. Stops its own click from bubbling to the card's
          onClick (open profile) - the two affordances must not fight over
          one tap. Hidden without onBookFor, same convention as every other
          optional affordance in this file. */}
      {onBookFor ? (
        <Button
          variant="secondary"
          height={44}
          style={{ marginTop: 15, boxShadow: 'none' }}
          onClick={(e) => {
            e.stopPropagation();
            onBookFor();
          }}
        >
          Book a session
        </Button>
      ) : null}
    </Card>
  );
}

function MetaRow({ label, children, style }) {
  return (
    <div style={{ display: 'flex', gap: 10, ...style }}>
      <div
        style={{
          width: 66,
          flex: 'none',
          font: `400 10px ${font.body}`,
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          color: color.textTertiary,
          paddingTop: 3,
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
