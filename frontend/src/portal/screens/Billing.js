import React, { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { color, font, radius } from '../tokens';
import BillingSkeleton from '../components/BillingSkeleton';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import FacilityCard from '../components/FacilityCard';
import { ManageBillingButtons } from '../components/ManageBillingButton';
import MemberSection from '../components/MemberSection';
import PayButton from '../components/PayButton';
import PhoneFrame from '../components/PhoneFrame';
import SequenceLadder from '../components/SequenceLadder';
import StaffCancelSheet from '../components/StaffCancelSheet';
import StaffAddSheet from '../components/staffBooking/StaffAddSheet';
import StaffMoveSheet from '../components/staffBooking/StaffMoveSheet';
import StaffAthletePanel from '../components/staffFamily/StaffAthletePanel';
import StaffFamilyAdvanced from '../components/staffFamily/StaffFamilyAdvanced';
import StatusBadge from '../components/StatusBadge';
import TokenMeter from '../components/TokenMeter';
import { BackLink, Banner, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { ordinal, statusFor } from '../data/billingHub';
import { facilitySourceLabel, householdFacility } from '../data/facility';
import { FACILITY_ACCESS, windowCopyFor } from '../data/packages';
import { CONNECTED_LINE, PAY_NOW, PENDING_PLAN_LINE, SINGLE_PLAN_LINE } from '../data/billingCopy';
import { portalTargets } from '../data/billingPortal';
import { contractEnabled } from '../data/contractFlag';
import { householdOnHold, saleOpen, SINGLE_NOT_OPEN_LINE } from '../data/singleToken';
import { firstOf, staffMayCancel } from '../data/staffCancel';
import { staffMayBook } from '../data/staffBooking';
import { BOOK_A_SESSION, testAthleteLine } from '../data/staffBookingCopy';
import { FAMILY_STAFF_LABEL, athleteFocus, staffFamilyRole } from '../data/staffFamily';
import useBillingHub from '../hooks/billing';

/**
 * 10 · Billing — the parents' hub (contract v2.4, Sprint 16: "the hub for
 * parents to see how many tokens are left"). Route /portal/billing, the
 * parent tab bar's Billing tab; a parent hitting /portal/membership lands
 * here, an athlete keeps their own Membership view. The self-managed 18+
 * athlete (Mike S6 2026-09-30) is their own payer: `role="athlete"` is their
 * one-member household under the athlete tab bar, with its Billing tab.
 *
 * Three questions, in order: is the membership in good standing (the hero,
 * from households.membership — Stripe's status, never guessed); how many
 * tokens does each athlete have left and why (TokenMeter, from the SAME
 * tokensFor the booking gate runs, with the evidence one tap away); what is
 * the plan (packages, billing day, catalogue prices marked pending).
 *
 * NO FAKE MONEY: no card art, no invoice rows, no amounts until Stripe data
 * exists. The past-due hero's "Update payment method" and "Manage billing in
 * Stripe" on Card & invoices both sign the payer straight into Stripe (owner
 * 2026-11-17, ManageBillingButton; review F7): shown once the family has a
 * Stripe customer, one button per customer when there are several
 * (data/billingPortal.js). The email sign-in link (REACT_APP_STRIPE_PORTAL_URL)
 * is only the fallback after a failure; with no customer the hero says to
 * contact the academy.
 *
 * Staff cancel (owner approved 2026-11-12): on the staff view the owner or
 * ops has a Cancel on each Booked or No-show row of a meter's "This period"
 * list (StaffCancelSheet.js). The cancel reloads the page's data
 * (hooks/staffCancel.js) and the line saying what happened stays above it.
 *
 * Staff booking (owner 2026-11-13, spec 01-spec-admin-booking.md 10.4): the
 * owner or ops also has Book a session under each meter, whatever the
 * package state (StaffAddSheet), and Move before each row's Cancel
 * (StaffMoveSheet), and the meters list the next period's rows. A test
 * household or athlete reads the test line instead of Book, and its rows
 * never move (plan decision 6). All three sheets leave their line in the
 * same place.
 *
 * The family page (owner 2026-11-16: "I click on a family in 3 different
 * spots and get different options in each one"): the staff view is the ONE
 * place the owner and ops work on a family. Under each athlete's meter and
 * Book a session sits "Manage {name}" (StaffAthletePanel: package, facility
 * access, Issue tokens, handicap, consent, bookings further out, the links
 * to results, combine and the coaching view), and at the foot Advanced
 * (StaffFamilyAdvanced: billing day, Stripe ids). `?athlete=<id>` opens the
 * page on one athlete (data/staffFamily.js).
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
  const location = useLocation();
  // The family page: the staff view, for the owner and ops.
  const family = staff && staffFamilyRole(role);
  const focusId = family ? athleteFocus(location.search) : null;

  // The family page keeps showing what it had while the hub reloads after a
  // save (Issue tokens, a package, the handicap all bump it): dropping to the
  // skeleton would close the open Manage section and lose its "saved" note.
  const kept = useRef(null);
  if (family && hook.data) kept.current = { householdId, data: hook.data };
  const held = family && !hook.data && !hook.error && kept.current?.householdId === householdId ? kept.current.data : null;

  const demo = variant === 'loading' || variant === 'error' || variant === 'empty';
  const loading = demo ? variant === 'loading' : hook.loading && !held;
  const error = demo ? (variant === 'error' ? new Error("Billing didn't load.") : null) : hook.error;
  const data = demo
    ? variant === 'empty'
      ? { household: null, members: [], status: statusFor(null), portalUrl: null }
      : null
    : hook.data ?? held;

  const members = data?.members ?? [];
  const status = data?.status ?? null;
  const isEmpty = !loading && !error && members.length === 0;
  const self = !staff && role === 'athlete';
  // Manage billing in Stripe: one button for the family, or one per Stripe customer (data/billingPortal.js).
  const targets = portalTargets(data?.household, members);
  // A failing card or a lapsed membership: no Add a token on any meter.
  const onHold = householdOnHold(data?.household);
  // Staff cancel: the tapped row and its athlete while the sheet is open, then the line it left.
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelLine, setCancelLine] = useState(null);
  const onCancelRow = staff && staffMayCancel(role)
    ? (member) => (row) => {
        setCancelLine(null);
        setCancelTarget({ row, member });
      }
    : null;
  // Staff booking: the member being booked, or the row being moved, while its sheet is open.
  const mayBook = staff && staffMayBook(role);
  const [bookTarget, setBookTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const isTest = (member) => data?.household?.test === true || member.test === true;
  const onMoveRow = mayBook
    ? (member) => (row) => {
        setCancelLine(null);
        setMoveTarget({ row, member });
      }
    : null;
  const onBook = (member) => {
    setCancelLine(null);
    setBookTarget(member);
  };

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: onBack ? 8 : 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {staff ? <SectionLabel style={{ marginBottom: 4 }}>{FAMILY_STAFF_LABEL}</SectionLabel> : null}
              <ScreenTitle size={22}>{staff ? data?.household?.name || 'Household' : 'Billing'}</ScreenTitle>
            </div>
            {status && !loading && !error ? <StatusBadge tone={status.badge.tone}>{status.badge.label}</StatusBadge> : null}
          </div>
        </div>
      }
      // Only a self-managed athlete reaches Billing as an athlete (PortalRoutes).
      footer={<BottomTabBar role={staff || self ? role : 'parent'} active={staff ? 'admin' : 'billing'} selfManaged={self || undefined} />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Above the loading branch: it stays while the page reloads after the cancel. */}
        {cancelLine ? (
          <div role="status">
            <Banner tone="green">{cancelLine}</Banner>
          </div>
        ) : null}
        {loading ? (
          <BillingSkeleton />
        ) : error ? (
          <ErrorNotice title="Billing didn't load" onRetry={onRetry}>
            Your membership didn't load. Check your connection and try again.
          </ErrorNotice>
        ) : (
          <>
            <StatusHero status={status} targets={targets} portalUrl={staff ? null : data?.portalUrl} staff={staff} />
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
                  {/* The single token is bought one at a time (ruling 2026-09-29/30): its
                      meter carries the Buy button, from the day they go on sale; staff never pay.
                      A pending athlete pays from the hero's Pay now alone (owner 2026-10-01).
                      A paid monthly token member's meter offers Add a token at their
                      package's rate (owner 2026-10-10) at any time, whatever is left
                      (addAnytime; owner 2026-11-11: "lets just put a add tokens button on
                      the billing page"). */}
                  <TokenMeter
                    member={member}
                    defaultOpen={members.length === 1}
                    showPrices={staff}
                    buy={!staff}
                    onHold={onHold}
                    addAnytime
                    onCancelRow={onCancelRow ? onCancelRow(member) : undefined}
                    onMoveRow={onMoveRow && !isTest(member) ? onMoveRow(member) : undefined}
                  />
                  {mayBook ? <StaffBookSlot member={member} test={isTest(member)} onBook={onBook} /> : null}
                  <CoachingLine coaching={member.coaching} />
                  {contractEnabled() ? (
                    // Athlete detail is a parent/staff route; the athlete's own is the Contract.
                    <ContractLine
                      contractMinutes={member.contractMinutes}
                      target={self ? 'contract' : 'athlete'}
                      onOpen={() => navigate(self ? '/portal/contract' : `/portal/athlete/${member.athleteId}`)}
                    />
                  ) : null}
                  {/* The family page (2026-11-16): everything else staff do for this athlete. */}
                  {family ? (
                    <StaffAthletePanel
                      member={member}
                      role={role}
                      focus={focusId === member.athleteId}
                      onMoveRow={onMoveRow && !isTest(member) ? onMoveRow(member) : null}
                      onCancelRow={onCancelRow ? onCancelRow(member) : null}
                    />
                  ) : null}
                </MemberSection>
              ))
            )}

            {/* ONE family card, never one per athlete (owner ruling 2026-09-30). */}
            <FacilityCard members={members} readOnly={staff} self={self} />
            {members.length ? <PlanCard household={data?.household} members={members} showPrices={staff} self={self} /> : null}
            <ConnectionCard targets={targets} portalUrl={data?.portalUrl} staff={staff} />
            {family ? <StaffFamilyAdvanced householdId={householdId ?? data?.household?.id ?? null} anchorDay={data?.household?.anchorDay ?? 1} /> : null}
          </>
        )}
      </div>
      {cancelTarget ? (
        <StaffCancelSheet
          row={cancelTarget.row}
          member={cancelTarget.member}
          members={members}
          onClose={() => setCancelTarget(null)}
          onCancelled={(line) => {
            setCancelTarget(null);
            setCancelLine(line);
          }}
        />
      ) : null}
      {bookTarget ? (
        <StaffAddSheet
          athleteId={bookTarget.athleteId}
          name={bookTarget.name}
          onClose={() => setBookTarget(null)}
          onDone={(line) => {
            setBookTarget(null);
            setCancelLine(line);
          }}
        />
      ) : null}
      {moveTarget ? (
        <StaffMoveSheet
          row={moveTarget.row}
          name={moveTarget.member.name}
          onClose={() => setMoveTarget(null)}
          onDone={(line) => {
            setMoveTarget(null);
            setCancelLine(line);
          }}
        />
      ) : null}
    </PhoneFrame>
  );
}

const SURFACES = {
  default: { background: color.surface, border: color.border },
  yellow: { background: 'rgba(244,238,25,.06)', border: color.secondary },
  red: { background: 'rgba(255,68,68,.07)', border: color.error },
};

/**
 * The membership's standing — Stripe's status, the contract's copy, dates
 * only when recorded. Sprint 20 (spec 4.4): the `pending` branch lists one
 * Pay now per unpaid athlete (createCheckoutSession) instead of the card
 * portal CTA - there is no card to update before the first checkout. A
 * single-token athlete (`perPurchase`) gets the line saying when instead of
 * a button until single tokens go on sale (owner ruling 2026-10-01).
 */
function StatusHero({ status, targets = [], portalUrl, staff = false }) {
  if (!status) return null;
  const s = SURFACES[status.tone] || SURFACES.default;
  // Staff read the standing; only the payer updates the card or pays.
  const cta = staff ? null : status.cta;
  const pendingAthletes = status.status === 'pending' ? status.pendingAthletes ?? [] : [];
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
      {cta && status.status === 'pending' ? (
        pendingAthletes.map((a) => (
          <div key={a.athleteId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 0, font: `600 13px ${font.body}`, color: color.text }}>
              {a.name}
              {a.perPurchase && !saleOpen() ? <Body size={11} tone={color.textTertiary} style={{ marginTop: 3 }}>{SINGLE_NOT_OPEN_LINE}</Body> : null}
            </div>
            {a.perPurchase && !saleOpen() ? null : (
              <PayButton athleteId={a.athleteId} product="tier" label={PAY_NOW} height={44} style={{ width: 132, flex: 'none' }} />
            )}
          </div>
        ))
      ) : cta ? (
        // Past due or lapsed: the card update signs the payer straight into Stripe (review 2026-11-17 F7/UX-2).
        targets.length ? (
          <ManageBillingButtons
            targets={targets}
            label={cta}
            variant={status.tone === 'red' ? 'danger' : 'caution'}
            height={50}
            fallbackUrl={portalUrl}
            style={{ marginTop: 15 }}
          />
        ) : (
          <Body size={12} tone={color.textSecondary} style={{ marginTop: 12 }}>
            To update your card, contact the academy. Booking reopens the same day the invoice clears.
          </Body>
        )
      ) : null}
    </div>
  );
}

/**
 * Under a member's meter on the staff view, owner or ops (spec 10.4): Book a
 * session whatever the package state - an unpaid athlete gets the Free-only
 * sheet - named for the athlete so brothers' and sisters' buttons differ for
 * a screen reader (spec 10.6). A test household or athlete reads why not.
 */
function StaffBookSlot({ member, test, onBook }) {
  const first = firstOf(member.name);
  if (test) {
    return (
      <Body size={12} tone={color.textSecondary} style={{ padding: '0 2px' }}>
        {testAthleteLine(first)}
      </Body>
    );
  }
  return (
    <Button variant="outline" height={44} aria-label={first ? `${BOOK_A_SESSION} for ${first}` : undefined} onClick={() => onBook(member)}>
      {BOOK_A_SESSION}
    </Button>
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

function ContractLine({ contractMinutes, target = 'athlete', onOpen }) {
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
      <span>{contractMinutes != null ? `${contractMinutes} min a day` : 'Commitment Contract'} · View {target}</span>
      <span aria-hidden="true" style={{ color: color.textTertiary }}>
        ›
      </span>
    </button>
  );
}

/**
 * The plan: one row per athlete, catalogue prices as facts, the billing day.
 * The single token is a one-time purchase: its row reads "one-time", and the
 * monthly billing footer only shows when someone is on a monthly package.
 * Facility access is the family's (data/facility.js): every athlete's row
 * says where it comes from - "family add-on" or "Elite".
 */
function PlanCard({ household, members, showPrices = false, self = false }) {
  const anyPending = showPrices && members.some((m) => m.package?.pending);
  const anyMonthly = members.some((m) => m.package?.kind !== 'single');
  // Tokens reset for a monthly token package only; Elite holds none.
  const anyMonthlyTokens = members.some((m) => m.package && m.package.kind !== 'single' && m.package.kind !== 'elite');
  const facilitySource = facilitySourceLabel(householdFacility(members), self);
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
                  : m.package.kind === 'single'
                    ? `${m.package.name} · one-time`
                    : `${m.package.name} a month`}
              {m.package ? ` · books ${windowCopyFor(m.package)}` : ''}
              {facilitySource ? ` · facility access: ${facilitySource}` : ''}
              {m.billing?.status === 'pending' || m.billing?.status === 'lapsed'
                ? ` · ${m.package?.kind === 'single' ? SINGLE_PLAN_LINE : PENDING_PLAN_LINE}`
                : ''}
            </div>
          </div>
          {showPrices ? (
            <div style={{ font: `500 13px ${font.mono}`, color: m.package?.price != null ? color.text : color.textTertiary, textAlign: 'right' }}>
              {m.package?.price != null ? `$${m.package.price}` : '—'}
              {m.facilityAccess && m.package?.kind !== 'elite' ? ` + $${FACILITY_ACCESS.price}` : ''}
              {m.package?.pending ? <span style={{ font: `400 10px ${font.body}`, color: color.secondary }}> pending</span> : null}
            </div>
          ) : null}
        </div>
      ))}
      {anyMonthly ? (
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>
          Billed monthly on the {ordinal(household?.anchorDay ?? 1)}.{anyMonthlyTokens ? ' Tokens reset the same day.' : ''}
          {anyPending ? " Prices marked pending are awaiting the academy's confirmation." : ''}
        </Body>
      ) : null}
    </Card>
  );
}

/**
 * No fake money: what is and isn't connected, in one honest line. The payer's
 * Manage billing in Stripe opens their own portal session - one button, or one
 * per Stripe customer (`targets`, data/billingPortal.js); the sign-in link
 * (portalUrl) is only its fallback. Staff never open a family's portal.
 */
function ConnectionCard({ targets, portalUrl, staff = false }) {
  const connected = targets.length > 0;
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 8 }}>Card &amp; invoices</SectionLabel>
      <Body size={12}>
        {connected ? CONNECTED_LINE : 'Card and invoices are managed in Stripe once you have paid.'}
      </Body>
      {connected && !staff ? <ManageBillingButtons targets={targets} fallbackUrl={portalUrl} /> : null}
    </Card>
  );
}
