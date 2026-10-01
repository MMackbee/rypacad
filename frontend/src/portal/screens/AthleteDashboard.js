import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { color, font, glow, radius } from '../tokens';
import PendingBanner from '../components/PendingBanner';
import ChangePackageSheet, { ChangePackageLink } from '../components/ChangePackageSheet';
import PaymentConfirming from '../components/PaymentConfirming';
import WalkthroughOffer from '../components/WalkthroughOffer';
import { useMyTokens } from '../hooks/billing';
import { useSelfManaged } from '../hooks/useAuthSession';
import AllowancePools, { GraceLine } from '../components/AllowancePools';
import BookChooser, { bookNavigation } from '../components/BookChooser';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import MediaPlaceholder, { Avatar } from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import ProgressMeter from '../components/ProgressMeter';
import TypeChip, { TYPES } from '../components/TypeChip';
import AgeGroupChip from '../components/AgeGroupChip';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { Body, Card, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton, Tick } from '../components/Primitives';
import { useAthleteDashboard } from '../hooks';
import { contractEnabled } from '../data/contractFlag';

/**
 * 03 · Athlete Dashboard - athlete.
 * States: Populated, New athlete, No upcoming sessions.
 *
 * Sprint 6 pin (TEAM.md, QA #4): useAthleteDashboard's allowance and next
 * session are live-wired this sprint - a real athlete with nothing booked
 * reaches this screen as `variant: 'populated'` (the only variant a live
 * caller ever passes) with `nextSession: null`, which is a state the demo
 * harness never previously exercised outside `variant === 'empty'`. The
 * designed empty state now renders whenever there is no next session,
 * regardless of variant, so a live null and the demo 'empty' state are the
 * same condition rather than two that could drift apart.
 *
 * @param {'populated'|'new'|'empty'} variant
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 * @param {() => void} [onSignOut]  Sprint 5 pin: hidden when not supplied
 *   (harness/demo mode); routing wires useAuthSession().signOut() to it.
 */
export default function AthleteDashboard({
  variant = 'populated',
  bare = false,
  practice = false,
  onLog,
  onBook,
  onRetry,
  onSignOut,
}) {
  const { data, loading, error } = useAthleteDashboard({ variant, practice });
  const athlete = data?.athlete;
  const next = data?.nextSession;
  // Hidden contract (owner, 2026-09-30): no card, no Log today, no checklist row.
  const showContract = contractEnabled();
  const contract = showContract ? data?.contract : null;
  const onboarding = (data?.onboarding ?? []).filter((item) => showContract || item.id !== 'contract');
  // Sprint 9 pin (TEAM.md, "specialist 1-on-1s"): the coaching entry point
  // navigates by path string - /portal/coaching is routing-lane work landing
  // in parallel (this lane never edits PortalRoutes.js). Consistent with how
  // BottomTabBar already navigates internally rather than every screen
  // threading an onNavigate prop through.
  const navigate = useNavigate();
  // Sprint 20 (spec 4.4): the athlete's own paid state and the ?paid= return.
  const mine = useMyTokens({ practice });
  const mineStatus = mine.data?.status ?? null;
  const [params] = useSearchParams();
  // The facility add-on ticked at sign-up (owner 2026-09-30), as on the
  // family page: hidden only while its own ?paid= return confirms. It is the
  // FAMILY's add-on on a child's login; the adult who is their own household
  // reads it without the word "family".
  const selfManaged = useSelfManaged();
  const facilityPending = mine.data?.facilityPending ?? [];
  const facilityRows = facilityPending.filter((r) => !(params.get('product') === 'facility' && r.athleteId === params.get('paid')));
  // Their own package can still change before Pay now (tester S4, 2026-09-30).
  const [changeFor, setChangeFor] = useState(null);

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              // Sized like the date line + name so the header holds its height.
              <>
                <SkeletonBar width={96} height={12} />
                <SkeletonBar width={150} height={24} style={{ marginTop: 8 }} />
              </>
            ) : (
              <>
                <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>
                  {athlete?.date}
                </div>
                <ScreenTitle style={{ marginTop: 3 }}>{athlete?.name}</ScreenTitle>
              </>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Avatar size={40} name={athlete?.name} />
            <SignOutButton onSignOut={onSignOut} />
          </div>
        </div>
      }
      footer={<BottomTabBar role="athlete" active="home" />}
    >
      {loading ? (
        <DashboardSkeleton contract={showContract} />
      ) : error ? (
        <div style={{ padding: '0 22px 24px' }}>
          <ErrorNotice title="Dashboard didn't load" onRetry={onRetry}>
            Your dashboard didn't load. Check your connection and try again.
          </ErrorNotice>
        </div>
      ) : (
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PaymentConfirming
          athleteId={params.get('paid')}
          whatsNext={{ athlete, product: params.get('product'), self: true, selfManaged, onBook, onSeason: () => navigate('/portal/season'),
            facilityDue: facilityPending.length > 0 }}
        />
        {/* No second Pay now while the ?paid= return confirms (double subscription). */}
        <PendingBanner
          pendingAthletes={(mineStatus?.status === 'pending' ? mineStatus.pendingAthletes : []).filter((a) => a.athleteId !== params.get('paid'))}
          facilityRows={facilityRows}
          self={selfManaged}
          body={mineStatus?.body}
          title={mineStatus?.title}
          renderRowExtra={(a) => <ChangePackageLink athlete={a} onOpen={setChangeFor} />}
        />
        <ChangePackageSheet athlete={changeFor} self onClose={() => setChangeFor(null)} />
        {/* Live: shown until a published diagnostic exists (contract v1.8 C);
            seed: the demo 'new' variant. */}
        {variant === 'new' || data?.diagnosticCaptured === false ? <StartHere onBook={onBook} /> : null}
        {variant === 'new' ? <OnboardingChecklist items={onboarding} /> : null}
        {variant === 'new' ? (
          <MediaPlaceholder height={126} caption="WELCOME VIDEO — Luke, 60 sec — what the first week looks like" />
        ) : null}
        {/* First-visit walkthrough offer, below Pay; never inside the walkthrough itself. */}
        {practice ? null : <WalkthroughOffer track="athlete" unlimited={Boolean(athlete?.tokens?.unlimited)} />}

        {next ? (
          <NextSessionCard next={next} />
        ) : variant !== 'new' ? (
          // No invented session: null is the honest shape once live-wired
          // (QA #4) - the same empty state the demo 'empty' variant already
          // used, not a separate state to keep in sync by hand. Suppressed
          // only for 'new', whose own "Start here" messaging already fills
          // this space.
          <NoSessions onBook={onBook} unlimited={Boolean(athlete?.tokens?.unlimited)} />
        ) : null}

        {/*
          The contract card shows in the empty state too. Daily minutes are
          independent of scheduled blocks - an athlete with nothing booked still
          owes their contract day, and hiding it here would suggest otherwise.
        */}
        {contract ? <ContractCard contract={contract} /> : null}

        {/* Sprint 12 (contract v2.0): the allowance card becomes the tokens
            card - ONE number; Elite shows no number, "Elite · unlimited"
            (AllowancePools' own unlimited branch). */}
        {athlete?.tokens ? (
          <Card>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
              {/* Elite holds no tokens (tester Mike 2026-09-30): no token label. */}
              <SectionLabel style={{ flex: 1 }}>{athlete.tokens.unlimited ? 'Your package' : 'Tokens this period'}</SectionLabel>
              {/*
                Sprint 11 pin D entry point: "AthleteDashboard's allowance
                card gets a 'Membership' link." Direct navigate(), same
                precedent CoachingAction below already sets for this screen
                (this lane never edits PortalRoutes.js).
              */}
              <button
                type="button"
                onClick={() => navigate('/portal/membership')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: `500 11px ${font.body}`,
                  color: color.primary,
                  cursor: 'pointer',
                }}
              >
                Membership ›
              </button>
            </div>
            <AllowancePools tokens={athlete.tokens} />
            <GraceLine tokens={athlete.tokens} />
          </Card>
        ) : null}

        {variant === 'populated' && showContract ? <QuickActions onLog={onLog} /> : null}
        {/* Sprint 9 pin (TEAM.md): one entry point to the specialist 1-on-1
            flow, same gating as QuickActions above it (populated only) so
            the empty/new states stay exactly as designed - not a restructure,
            an addition below the existing action hierarchy. */}
        {variant === 'populated' ? (
          <BookChooser
            onPick={(option) => {
              const [to, opts] = bookNavigation(option, null);
              navigate(to, opts);
            }}
          />
        ) : null}
      </div>
      )}
    </PhoneFrame>
  );
}

/**
 * The loading layout in the loaded layout's geometry: the next-session card,
 * the contract card, the allowance card, then the quick-action pair. No
 * spinner — see components/Skeleton.js.
 */
function DashboardSkeleton({ contract }) {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {/* Next session: label row, chip, 20px name, three meta columns. */}
      <SkeletonCard large>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <SkeletonBar tone="raised" width={118} height={10} />
          <SkeletonBar tone="raised" width={56} height={10} />
        </div>
        <SkeletonBar tone="raised" width={72} height={17} r={5} style={{ marginTop: 12 }} />
        <SkeletonBar tone="raised" width="58%" height={17} style={{ marginTop: 10 }} />
        <div style={{ display: 'flex', marginTop: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1 }}>
              <SkeletonBar tone="raised" width={30} height={9} />
              <SkeletonBar tone="raised" width={54} height={12} style={{ marginTop: 6 }} />
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* Contract: label row, the 40px number, meter, a line of copy. */}
      {contract ? (
        <SkeletonCard large>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <SkeletonBar tone="raised" width={140} height={10} />
            <SkeletonBar tone="raised" width={48} height={10} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 12 }}>
            <SkeletonBar tone="raised" width={46} height={34} />
            <SkeletonBar tone="raised" width={130} height={12} style={{ marginBottom: 4 }} />
          </div>
          <SkeletonBar tone="raised" height={5} r={3} style={{ marginTop: 14 }} />
          <SkeletonBar tone="raised" width="86%" height={9} style={{ marginTop: 14 }} />
        </SkeletonCard>
      ) : null}

      {/* Tokens: label + the one meter (Sprint 12: one pool, not two). */}
      <SkeletonCard>
        <SkeletonBar tone="raised" width={132} height={10} />
        <div style={{ marginTop: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <SkeletonBar tone="raised" width={64} height={11} />
            <SkeletonBar tone="raised" width={90} height={11} />
          </div>
          <SkeletonBar tone="raised" height={6} r={3} />
        </div>
      </SkeletonCard>

      {/* Quick actions: two 78px tiles. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SkeletonCard height={78} />
        <SkeletonCard height={78} />
      </div>
    </div>
  );
}

function NextSessionCard({ next }) {
  return (
    <Card tone="green" large style={{ boxShadow: glow.emphasisCard }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <SectionLabel tone={color.primary} style={{ flex: 1 }}>
          {next.isToday ? 'Next session · today' : 'Next session'}
        </SectionLabel>
        <span style={{ font: `500 11px ${font.body}`, color: color.textSecondary }}>
          {next.dayLabel}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <TypeChip type={next.type} />
        <AgeGroupChip group={next.ageGroup} />
      </div>

      <div style={{ font: `700 20px ${font.head}`, color: color.text, marginTop: 8 }}>
        {next.name}
      </div>

      {/* Coach and bay are unassigned in the schedule - nothing is invented. */}
      <div style={{ display: 'flex', gap: 0, marginTop: 14 }}>
        {[
          ['Time', `${next.time} ${next.meridiem}`],
          ['Day', next.dayLabel],
          // The chip's own label map, not a binary ternary — a mental/phil
          // session read "Training" here while the chip above said
          // otherwise (surface scan 2026-09-11, finding 9).
          ['Type', TYPES[next.type]?.label ?? 'Training'],
        ].map(([label, value]) => (
          <div key={label} style={{ flex: 1 }}>
            <div
              style={{
                font: `400 10px ${font.body}`,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
                color: color.textTertiary,
              }}
            >
              {label}
            </div>
            <div style={{ font: `600 14px ${font.body}`, color: color.text, marginTop: 4 }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const BADGE_TONES = { green: color.primary, red: color.error, yellow: color.secondary };

/**
 * K33: the badge is the Contract screen's own pill from the hook (On track,
 * Behind, Complete), or none before the contract starts / after the season -
 * a hard-coded "On track" here contradicted a Behind contract. Outside the
 * contract window there are no days to count, so the card is the line alone.
 */
function ContractCard({ contract }) {
  const badge = contract.badge;
  const quiet = contract.kind === 'notStarted' || contract.kind === 'ended';
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <SectionLabel style={{ flex: 1 }}>Commitment Contract</SectionLabel>
        {badge ? (
          <span style={{ font: `500 11px ${font.body}`, color: BADGE_TONES[badge.tone] ?? color.primary }}>
            {badge.label}
          </span>
        ) : null}
      </div>

      {quiet ? null : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
            <span style={{ font: `700 40px ${font.head}`, color: color.text }}>{contract.logged}</span>
            <span style={{ font: `400 14px ${font.body}`, color: color.textSecondary }}>
              {/* "due" is load-bearing: this denominator is days due SO FAR,
                  while the Contract screen counts the whole month - unlabeled,
                  the two numbers read as a contradiction (QA 2026-09-08 #6). */}
              of {contract.total} days due · {contract.month}
            </span>
          </div>

          <ProgressMeter value={contract.pct} size="card" style={{ marginTop: 12 }} />
        </>
      )}

      <Body size={12} style={{ marginTop: 12 }}>
        {contract.line}
      </Body>
    </Card>
  );
}

function QuickActions({ onLog }) {
  // Booking moved into the three-way chooser below (owner feedback,
  // 2026-09-16); logging the contract day stays the one-tap action.
  return (
    <Button onClick={onLog} height={64} style={{ borderRadius: radius.card, font: `600 14px ${font.body}` }}>
      Log today
    </Button>
  );
}

/**
 * Sprint 9 pin (TEAM.md, "specialist 1-on-1s"): a single tappable row into
 * the new SpecialistBooking flow. Deliberately not styled as a second
 * primary CTA - QuickActions above already carries the screen's one solid
 * green fill (Log today), and flag 02 reserves that treatment for the
 * screen's primary action. A plain bordered Card row, same open-a-detail
 * idiom as ParentDashboard's ChildCard, keeps this a clear but secondary
 * action.
 */

/**
 * Sprint 10 pin C/I: this card's copy named "Practice DNA" as a destination
 * - Practice DNA is explicitly PARKED this sprint (TEAM.md: "stays retired
 * (copy stops promising it)", its tab left the bottom nav back in Sprint 7).
 * The card now describes the diagnostic itself - your baseline capture,
 * read back on Athlete Detail once a coach publishes it (see AthleteDetail's
 * new "Diagnostic capture" card) - rather than naming a screen nobody can
 * reach. This card's gate is still the `variant === 'new'` demo/seed signal
 * (a brand-new athlete has nothing captured by definition); a real live
 * gate keyed off the athlete's own diagnostic status would need
 * useAthleteDashboard to expose one, which it does not yet - flagged for
 * routing in the sprint report rather than wired against a guess.
 */
function StartHere({ onBook }) {
  return (
    <Card tone="yellow" large>
      <SectionLabel tone={color.secondary}>Start here</SectionLabel>
      <ScreenTitle size={19} style={{ marginTop: 10 }}>
        Book your Diagnostic
      </ScreenTitle>
      <Body size={12} style={{ marginTop: 8 }}>
        Everything starts with objective data. Your baseline capture sets your own numbers as the
        benchmark you're measured against — never a model swing.
      </Body>
      <Button height={46} onClick={onBook} style={{ marginTop: 14 }}>
        Find a time
      </Button>
    </Card>
  );
}

function OnboardingChecklist({ items }) {
  const tones = {
    done: { border: color.primary, fill: color.primary, text: color.text },
    next: { border: color.secondary, fill: 'transparent', text: color.text },
    todo: { border: '#3a3a3a', fill: 'transparent', text: color.textTertiary },
  };

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item) => {
          const t = tones[item.state];
          return (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  width: 20,
                  height: 20,
                  flex: 'none',
                  borderRadius: '50%',
                  border: `1.5px solid ${t.border}`,
                  background: t.fill,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {item.state === 'done' ? <Tick size={10} /> : null}
              </span>
              <span style={{ font: `400 13px ${font.body}`, color: t.text }}>{item.label}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** `unlimited` (Elite) has no token to keep, so the token sentence goes. */
function NoSessions({ onBook, unlimited = false }) {
  return (
    <div
      style={{
        border: `1px dashed ${color.border}`,
        borderRadius: radius.cardLarge,
        padding: '30px 22px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 13,
        textAlign: 'center',
      }}
    >
      <ScreenTitle size={17}>No upcoming sessions</ScreenTitle>
      <Body size={12}>
        Nothing is on your schedule right now - book any open block.
        {unlimited ? '' : ' Cancelling with notice keeps your token.'}
      </Body>
      <Button height={46} onClick={onBook} style={{ marginTop: 4 }}>
        Browse open slots
      </Button>
    </div>
  );
}
