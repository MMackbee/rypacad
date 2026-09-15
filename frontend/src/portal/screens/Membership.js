import React from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import AllowancePools from '../components/AllowancePools';
import BottomTabBar from '../components/BottomTabBar';
import MemberSection from '../components/MemberSection';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard, { SkeletonBar } from '../components/Skeleton';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useMembership, usingRealMembershipHook } from '../components/useMembershipCompat';
import { GOLF_PACKAGES, ELITE_TIERS, DROP_IN, FITNESS_PACKAGES } from '../data/packages';
import { SPECIALIST_MONTHLY_CAP } from '../data/specialists';
import { nextMonthFirstShort, todayISO } from '../data/calendar';

/**
 * 19 · Membership — parent + athlete (Sprint 11 pin D, contract v1.9).
 * Route /portal/membership; the retired /portal/billing redirects here
 * (routing lane). Life Time-style: one section per household member (an
 * athlete's own view has exactly one — themselves); per member a Golf card
 * (package + the two pools via the existing AllowancePools), a Performance
 * card (fitness package + Phil used/limit, or the honest "no package on
 * file" line), a Mental game line (Yannick's flat cap), and a contract-tier
 * line linking onward. Prices are catalogue facts ("$260 / month"), never
 * amounts due — and the word "billing" appears nowhere on this screen, per
 * the sprint's own invariant.
 *
 * ENTITLEMENTS ARE DERIVED FROM PACKAGES, NEVER STORED (the pin's own
 * keystone) — every number below is exactly what useMembership()'s
 * `entitlements` returns, never recomputed here.
 *
 * FALLBACK FLAG: `useMembership()` does not exist in this worktree yet — the
 * routing lane's parallel worktree owns hooks/index.js (contract v1.9 D).
 * The fixed-reference fallback swap lives in components/useMembershipCompat.js
 * (shared with SpecialistBooking.js and AthleteDetail's membership card,
 * which all read the same not-yet-landed hook) — `usingRealMembershipHook`
 * is false while it is in effect, and this screen's own `variant` prop
 * drives every state locally instead, the exact same escape hatch
 * TourStandings.js documents for a hook that has no demoOpts of its own.
 * The moment routing's real export lands, `usingRealMembershipHook` flips
 * true and every line below is a pure pass-through of the real hook's
 * {data, loading, error} — `variant='populated'` (the default, and the only
 * variant a live route ever passes) never touches the local demo data
 * again. Flagged in the sprint report.
 *
 * @param {'populated'|'loading'|'error'|'empty'} variant  Harness-only while
 *   the fallback above is in effect (see doc above); ignored once the real
 *   hook lands, same as TourStandings' own `variant`.
 * @param {'parent'|'athlete'} [role]
 * @param {() => void} [onBack]  Hidden when not supplied.
 * @param {() => void} [onRetry]  Re-fetch after a load failure.
 */
export default function Membership({ variant = 'populated', bare = false, role = 'parent', onBack, onRetry }) {
  const hookState = useMembership();
  const navigate = useNavigate();

  const loading = usingRealMembershipHook ? hookState.loading : variant === 'loading';
  const error = usingRealMembershipHook
    ? hookState.error
    : variant === 'error'
    ? new Error("Membership didn't load.")
    : null;
  const data = usingRealMembershipHook
    ? hookState.data
    : variant === 'empty'
    ? { household: null, members: [] }
    : variant === 'populated'
    ? demoMembership()
    : null;

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
          members.map((member) => (
            <MemberSection key={member.athleteId} name={member.name}>
              <GolfCard golf={member.golf} entitlements={member.entitlements} resetsOn={member.resetsOn} />
              <PerformanceCard fitness={member.fitness} phil={member.entitlements?.phil} />
              <MentalLine mental={member.entitlements?.mental} />
              <ContractLine
                contractMinutes={member.contractMinutes}
                onOpen={() => openContract(member)}
                role={role}
              />
            </MemberSection>
          ))
        )}
      </div>
    </PhoneFrame>
  );
}

/** Catalogue price as a fact, never an amount due — Drop-in is per-session, everything else monthly. */
function priceLine(pkg) {
  if (!pkg) return null;
  const cadence = pkg.id === 'drop-in' ? '/ session' : '/ month';
  return `$${pkg.price} ${cadence}`;
}

function GolfCard({ golf, entitlements, resetsOn }) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 4 }}>Golf</SectionLabel>
      {golf ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 12 }}>
            <span style={{ font: `600 15px ${font.body}`, color: color.text }}>{golf.name}</span>
            <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>{priceLine(golf)}</span>
          </div>
          <AllowancePools allowance={{ training: entitlements.training, tournaments: entitlements.tournaments, resetsOn }} />
        </>
      ) : (
        <Body size={12} style={{ marginTop: 8 }}>
          No golf package on file — ask the academy.
        </Body>
      )}
    </Card>
  );
}

/** "2 of 8 performance sessions used this month" (fitness) / "Included with Elite — 3 of 16 used this month" (elite). */
function philSummary(phil) {
  if (!phil) return null;
  if (phil.source === 'elite') return `Included with Elite — ${phil.used} of ${phil.limit} used this month`;
  if (phil.source === 'fitness') return `${phil.used} of ${phil.limit} performance sessions used this month`;
  return null;
}

function PerformanceCard({ fitness, phil }) {
  const summary = philSummary(phil);
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 4 }}>Performance</SectionLabel>
      {fitness ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <span style={{ font: `600 15px ${font.body}`, color: color.text }}>{fitness.name}</span>
          <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>{priceLine(fitness)}</span>
        </div>
      ) : summary ? null : (
        <Body size={12} style={{ marginTop: 8 }}>
          No fitness package on file — ask the academy.
        </Body>
      )}
      {summary ? (
        <Body size={12} style={{ marginTop: 8 }}>
          {summary}
        </Body>
      ) : null}
    </Card>
  );
}

/** A line, not a card — the pin's own layout (Yannick's cap is always the flat, un-tiered knob). */
function MentalLine({ mental }) {
  if (!mental) return null;
  return (
    <Body size={12} tone={color.textSecondary} style={{ padding: '0 2px' }}>
      Mental game — {mental.used} of {mental.limit} sessions used this month
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
            {[0, 1].map((j) => (
              <div key={j} style={{ marginTop: j ? 11 : 15 }}>
                <SkeletonBar tone="raised" height={6} r={3} />
              </div>
            ))}
          </SkeletonCard>
          <SkeletonCard large height={64} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 * HARNESS-ONLY fallback data — see the module doc above. Mirrors contract
 * v1.9 D's member shape exactly, using the real catalogue constants
 * (data/packages.js, data/specialists.js) so the numbers are at least
 * internally consistent even though the usage counts (`used`) are invented
 * for preview — there is no bookings query available without the real hook.
 * Never reached once hooks.useMembership exists (usingRealMembershipHook above).
 * ------------------------------------------------------------------------ */

const DEMO_RESETS_ON = nextMonthFirstShort(todayISO());
const ALL_GOLF = [...GOLF_PACKAGES, DROP_IN, ...ELITE_TIERS];

function golfById(id) {
  const p = ALL_GOLF.find((g) => g.id === id);
  return p ? { ...p, kind: ELITE_TIERS.some((e) => e.id === id) ? 'elite' : id === 'drop-in' ? 'drop-in' : 'golf' } : null;
}

function fitnessById(id) {
  return FITNESS_PACKAGES.find((f) => f.id === id) ?? null;
}

function pool(used, limit) {
  return { used, limit, left: Math.max(0, (limit ?? 0) - used) };
}

/**
 * Elite's Phil inclusion — owner ruling, Sprint 11 amendment v1.9.1: 16
 * sessions a month. This constant exists ONLY to seed the harness preview
 * below; the real render path never hardcodes it (see philSummary above,
 * which always reads `phil.limit` off the hook's own entitlements object).
 * ELITE_TIERS.philSessions itself stays null in data/packages.js until
 * routing's entitlementsFor (contract v1.9 C) lands the real derivation —
 * that file is not this lane's to edit.
 */
const ELITE_PHIL_SESSIONS_DEMO = 16;

function demoMembership() {
  const golf83 = golfById('g-8-3');
  const golf42 = golfById('g-4-2');
  const elite = golfById('elite');
  const f8 = fitnessById('f-8');

  return {
    household: { id: 'demo-household', name: 'Household' },
    members: [
      {
        athleteId: 'jordan',
        name: 'Jordan',
        golf: golf83,
        fitness: f8,
        contractMinutes: 45,
        resetsOn: DEMO_RESETS_ON,
        entitlements: {
          training: pool(3, golf83.training),
          tournaments: pool(1, golf83.tournaments),
          phil: { ...pool(2, f8.sessions), source: 'fitness' },
          mental: { ...pool(0, SPECIALIST_MONTHLY_CAP), source: 'flat' },
        },
      },
      {
        athleteId: 'reese',
        name: 'Reese',
        golf: golf42,
        fitness: null,
        contractMinutes: 20,
        resetsOn: DEMO_RESETS_ON,
        entitlements: {
          training: pool(2, golf42.training),
          tournaments: pool(2, golf42.tournaments),
          phil: { ...pool(0, 0), source: 'none' },
          mental: { ...pool(1, SPECIALIST_MONTHLY_CAP), source: 'flat' },
        },
      },
      {
        // Preview-only: the real seed's nico carries g-4-2, not Elite (see
        // TEAM.md's Sprint 11 ownership note) — this entry exists purely to
        // exercise the source:'elite' copy in the harness and never coexists
        // with real data (usingRealMembershipHook gates the whole function).
        athleteId: 'demo-elite',
        name: 'Nico',
        golf: elite,
        fitness: null,
        contractMinutes: null,
        resetsOn: DEMO_RESETS_ON,
        entitlements: {
          training: pool(4, elite.training),
          tournaments: pool(0, elite.tournaments),
          phil: { ...pool(3, ELITE_PHIL_SESSIONS_DEMO), source: 'elite' },
          mental: { ...pool(0, SPECIALIST_MONTHLY_CAP), source: 'flat' },
        },
      },
    ],
  };
}
