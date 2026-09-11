import React from 'react';
import { color, font } from './tokens';

import AthleteRow, { AttendanceControls } from './components/AthleteRow';
import BottomTabBar from './components/BottomTabBar';
import Button from './components/Button';
import DayGridCell, { DayGridLegend } from './components/DayGridCell';
import Field from './components/Field';
import MediaPlaceholder from './components/MediaPlaceholder';
import NumericField from './components/NumericField';
import ProgressMeter from './components/ProgressMeter';
import SavedToast from './components/SavedToast';
import SequenceLadder from './components/SequenceLadder';
import SessionCard from './components/SessionCard';
import StatusBadge, { CapacityPill } from './components/StatusBadge';
import PackageCard from './components/PackageCard';
import AllowancePools from './components/AllowancePools';
import SkeletonCard, { SkeletonBar, SkeletonSessionCard } from './components/Skeleton';
import ToggleRow from './components/Toggle';
import TypeChip from './components/TypeChip';
import { Card, ErrorNotice } from './components/Primitives';

import SignIn from './screens/SignIn';
import NotProvisioned from './screens/NotProvisioned';
import Registration from './screens/Registration';
import MySchedule from './screens/MySchedule';
import BookSession from './screens/BookSession';
import ParentDashboard from './screens/ParentDashboard';
import CoachDashboard from './screens/CoachDashboard';
import Roster, { SessionAttendance } from './screens/Roster';
import DiagnosticCapture from './screens/DiagnosticCapture';
import AthleteDashboard from './screens/AthleteDashboard';
import PracticeDNA from './screens/PracticeDNA';
import CommitmentContract from './screens/CommitmentContract';
import AthleteDetail from './screens/AthleteDetail';
import Billing from './screens/Billing';
import NotificationPreferences from './screens/NotificationPreferences';
import AdminDashboard from './screens/AdminDashboard';
import StaffRoles from './screens/StaffRoles';
import NewsletterComposer from './screens/NewsletterComposer';
import OnboardingFlow from './screens/OnboardingFlow';
import TourStandings from './screens/TourStandings';
import SpecialistBooking from './screens/SpecialistBooking';
import SpecialistDay from './screens/SpecialistDay';

import { ALLOWANCE, ALLOWANCE_NO_TOURNAMENTS } from './data/seed';
import { ELITE_TIERS, FITNESS_PACKAGES, GOLF_PACKAGES } from './data/packages';

/**
 * Review harness. Renders every component variant and every screen state side
 * by side so the build can be diffed against the artboards in
 * docs/portal/design-handoff.md.
 *
 * Development only - this is not a portal route a member ever reaches.
 */

/** Every screen with the exact state list the handoff specifies for it. */
export const SCREEN_STATES = [
  { id: '01', title: 'Sign In', Screen: SignIn, role: 'public',
    states: [['idle', 'Default'], ['loading', 'Loading'], ['invalid', 'Invalid'], ['locked', 'Locked']] },
  { id: '02', title: 'Registration', Screen: Registration, role: 'public',
    states: [['guardian', '1 Guardian'], ['athlete', '2 Athlete · error'], ['tier', '3 Package'],
             ['consent', '4 Consent'], ['submitting', 'Submitting'], ['success', 'Success']] },
  { id: '03', title: 'Athlete Dashboard', Screen: AthleteDashboard, role: 'athlete',
    states: [['populated', 'Populated'], ['new', 'New athlete'], ['empty', 'No sessions']] },
  { id: '04', title: 'My Schedule', Screen: MySchedule, role: 'athlete',
    states: [['upcoming', 'Upcoming'], ['empty', 'Empty'], ['cancelled', 'Cancelled'],
             // Sprint 9 pin (TEAM.md, "specialist 1-on-1s", cancellation):
             // useSchedule doesn't return cancellable/bookingId per item in
             // this worktree yet (routing lane's parallel worktree) - the
             // real cancel UI is honestly unreachable on today's seed data,
             // same as any other missing hook export in this codebase.
             // demoCancellable is a harness-only flag (see MySchedule.js's
             // own doc comment) that previews the confirm-sheet flow by
             // patching cancellable/bookingId onto the non-today upcoming
             // items - no real caller ever passes it.
             ['upcoming', 'Cancel flow', { demoCancellable: true }]] },
  { id: '05', title: 'Book a Session', Screen: BookSession, role: 'athlete',
    states: [['open', 'Blocks open'],
             // Interactive: tap a marked date to open its sessions, then a
             // session to see the button-level "Reserving…" pattern and the
             // inline failure. The rejection message here only exercises the
             // pipe - the live path supplies real reasons.
             ['open', 'Reserve fails · pick a session', {
               onBook: () =>
                 new Promise((resolve, reject) => {
                   setTimeout(
                     () => reject(new Error('That block filled before the reservation completed.')),
                     1400
                   );
                 }),
             }],
             ['full', 'Block full'],
             ['limitTraining', 'Training spent'], ['limitTournament', 'Tournaments spent'],
             ['confirmed', 'Confirmed'],
             // Sprint 6 pin (TEAM.md, QA #2): a parent gets the child selector
             // above the calendar; an athlete never does.
             ['open', 'Parent · pick a child', { role: 'parent' }],
             // Sprint 7 pin (TEAM.md, "Book-for-kid deep link"): initialAthleteId
             // wins over the first-child default when it names a real household
             // athlete - 'reese' here is the seed's second child, proving this
             // isn't just re-selecting whatever the default would have picked.
             ['open', 'Parent · deep link to Reese', { role: 'parent', initialAthleteId: 'reese' }]] },
  { id: '06', title: 'Practice DNA', Screen: PracticeDNA, role: 'athlete',
    states: [['complete', 'Complete'], ['partial', 'Partial'], ['pending', 'Pending']] },
  { id: '07', title: 'Commitment Contract', Screen: CommitmentContract, role: 'athlete',
    states: [['ontrack', 'On track'], ['behind', 'Behind'], ['complete', 'Month complete'],
             ['none', 'No contract']] },
  { id: '08', title: 'Parent Dashboard', Screen: ParentDashboard, role: 'parent',
    // onBookFor/onBookCoaching are no-ops here purely so the Book-for-kid
    // chip (Sprint 7 pin) and the new "Book 1-on-1 coaching" footer button
    // (Sprint 9 pin, TEAM.md) render in the gallery - a real caller passes
    // routing's navigate handlers instead.
    states: [['one', 'One child', { onBookFor: () => {}, onBookCoaching: () => {} }],
             ['three', 'Three children', { onBookFor: () => {}, onBookCoaching: () => {} }],
             ['payment', 'Payment issue', { onBookFor: () => {}, onBookCoaching: () => {} }]] },
  { id: '09', title: 'Athlete Detail', Screen: AthleteDetail, role: 'parent',
    states: [['populated', 'Populated'], ['limited', 'Limited data'],
             // Sprint 10 pin B (TEAM.md): the "Start a contract" card for a
             // kid with no tier yet - `noTier` overrides the (fragile,
             // flagged) subline heuristic so this state is reviewable
             // regardless of what the seed subline happens to say.
             ['populated', 'No contract tier', { noTier: true }]] },
  { id: '10', title: 'Billing & Subscription', Screen: Billing, role: 'parent',
    states: [['active', 'Active'], ['retry1', 'Retry 1'], ['retry3', 'Retry 3'],
             ['restricted', 'Restricted'], ['updating', 'Updating card']] },
  { id: '11', title: 'Notification Preferences', Screen: NotificationPreferences, role: 'parent',
    states: [['default', 'Default'], ['saved', 'Saved']] },
  { id: '12', title: 'Coach Dashboard', Screen: CoachDashboard, role: 'coach',
    states: [['today', 'Sessions today'], ['concurrent', 'Concurrent'], ['none', 'None today']] },
  { id: '13', title: 'Session Roster & Attendance', Screen: SessionAttendance, role: 'coach',
    states: [['pre', 'Pre-session'], ['progress', 'In progress'], ['complete', 'Completed'],
             ['noshow', 'No-shows'],
             // Sprint 7 pin (TEAM.md): "Enter results" on a TOURNAMENT
             // session, now the Sprint 8 SCORE-entry flow (contract v1.6) -
             // a coach types strokes per athlete instead of tapping a
             // finishing order; position derives downstream. `name: null`
             // so displaySession's own "Tournament block" fallback names it
             // - no invented event name. Tap through the button to see the
             // score-entry flow; seed mode has no persisted results, so it
             // always opens blank, and every row's bracket chip reads
             // "Open" - `useAthleteBrackets` has no export in this worktree
             // yet (Sprint 8 hook seam, TEAM.md), so Roster.js's inert
             // fallback (`{}`, never fetches) is what's live here.
             ['pre', 'Tournament · enter scores',
               { block: { type: 'tournament', name: null, time: '8:30 AM', date: null, meta: null } }]] },
  /*
   * Roster - coach (Sprint 5 pin, TEAM.md): the bottom tab bar's "Roster"
   * destination is now the coach's full assigned roster, not one session's
   * attendance - split out from the screen above, which still holds the
   * in-session IN/OUT flow for when routing wires a session-specific entry
   * point to it.
   */
  { id: '13R', title: 'Roster (coach)', Screen: Roster, role: 'coach',
    states: [['default', 'Populated']] },
  { id: '14', title: 'Diagnostic Capture', Screen: DiagnosticCapture, role: 'coach',
    states: [['empty', 'Empty'], ['uploading', 'Uploading'], ['partial', 'Partial'],
             ['complete', 'Complete']] },
  { id: '15', title: 'Admin Dashboard', Screen: AdminDashboard, role: 'ops admin',
    // 'ops' previews the Sprint 10 pin F tab set (Admin/Sessions/Tour, no
    // Staff) alongside the default owner set the other two states show.
    states: [['populated', 'Populated'], ['filtered', 'Filtered'],
             ['populated', 'Ops · tab set', { role: 'ops' }]] },
  { id: '16', title: 'Staff & Roles', Screen: StaffRoles, role: 'owner',
    states: [['populated', 'Populated'], ['add', 'Add staff']] },
  { id: '17', title: 'Newsletter Composer', Screen: NewsletterComposer, role: 'admin',
    states: [['missing', 'Sections missing'], ['ready', 'All sections in'],
             ['scheduled', 'Scheduled'], ['sent', 'Sent']] },
  /*
   * RYP Tour (Sprint 7 pin, TEAM.md) — season standings for the weekend
   * tournament leaderboard. Not a numbered handoff artboard (billing was
   * parked and this replaced it this sprint), so it sits after the
   * seventeen alongside 08·L and 18. useTourStandings() takes no options
   * (see TourStandings.js), so loading/empty/error are driven by this
   * screen's own `variant` prop rather than a hook demoOpts variant.
   *
   * Sprint 8 pin (TEAM.md, contract v1.6) added the age-bracket split and
   * an athlete-only "Your results" card. 'jordan' below is the seed's own
   * athleteId (data/tour.js's TOUR_SEED_RESULTS already has Jordan Whitfield
   * finishing several tournaments) - not an invented id - so this state
   * proves the own-bracket default and results log against real seed data.
   * The plain 'Populated' state (no athleteId) exercises the graceful
   * degrade every non-athlete role and PortalRoutes.js itself get this
   * sprint: first bracket selected, no "Your results" card - see the sprint
   * report.
   */
  { id: 'TOUR', title: 'RYP Tour', Screen: TourStandings, role: 'athlete + parent + staff',
    states: [['populated', 'Populated'],
             ['populated', 'Athlete · own bracket + results', { role: 'athlete', athleteId: 'jordan' }],
             ['empty', 'Before first tournament'],
             ['loading', 'Loading'], ['error', 'Load failure']] },
  /*
   * Specialist Booking (Sprint 9 pin, TEAM.md, "specialist 1-on-1s") - the
   * Life Time-style 1-on-1 booking flow for Phil and Yannick. Not a numbered
   * handoff artboard, so it sits after the seventeen alongside Tour. This
   * screen has no `variant` prop in the Sprint 9 pin's five-prop contract
   * (unlike every hook-backed demo variant elsewhere) - `harnessStage` is a
   * harness-only addition (see the screen's own doc comment) that mounts
   * directly into the slots/sheet/confirmed/empty-day states without
   * scripting real taps, the same problem TourStandings solved with its own
   * harness-local `variant`. The first tuple element is unused by this
   * screen (no real `variant` prop) and is only a label convenience.
   */
  { id: 'S9', title: 'Specialist Booking', Screen: SpecialistBooking, role: 'athlete + parent',
    states: [['picker', 'Specialist picker'],
             ['slots', 'Day strip + slot list', { harnessStage: 'slots' }],
             ['sheet', 'Detail sheet', { harnessStage: 'sheet' }],
             ['confirmed', 'Confirmed', { harnessStage: 'confirmed' }],
             ['empty-day', 'Empty day', { harnessStage: 'empty-day' }],
             // Parent's 'Booking for' selector, same idiom as BookSession's.
             ['slots', 'Parent · pick a child', { harnessStage: 'slots', role: 'parent' }]] },
  /*
   * Specialist Day / My Sessions (Sprint 9 amendment v1.7.1; nav + Today
   * section added Sprint 10 pins F/I) - the specialist's own day view, not
   * a numbered handoff artboard. No `variant` prop - it always reads real
   * seed/live data via useSpecialistSessions, so each state below only
   * varies who is looking (Phil's own coach-set footer, Yannick's mental
   * set, and ops/owner's switcher).
   */
  { id: 'SD', title: 'Specialist Day (My Sessions)', Screen: SpecialistDay, role: 'mental · coach(phil) · ops/owner',
    states: [
      ['default', 'Yannick · mental', { specialistId: 'mental', role: 'mental' }],
      ['default', 'Phil · coach set', { specialistId: 'phil' }],
      ['default', 'Ops · switcher', { canSwitch: true, role: 'ops' }],
    ] },
  /*
   * Not provisioned (Sprint 4, real enrollment states added Sprint 10 pin
   * A) — the honest state for a signed-in Google account with no users/
   * doc. Not a numbered handoff artboard, so it sits after the seventeen.
   * The demo variant renders the established demo guardian's email and
   * never reads the live auth/enrollment seam.
   */
  { id: 'NP', title: 'Not provisioned', Screen: NotProvisioned, role: 'signed-in · no portal role',
    states: [['none', 'No enrollment'], ['pending', 'Under review'], ['declined', 'Declined']] },
  /*
   * Onboarding walkthrough — practice mode on the real screens (TEAM.md,
   * "Onboarding program v1"). Not a numbered handoff artboard, so it sits
   * after the seventeen. The action steps are interactive here: book a block
   * or tap Log today and the step's gate opens. `initialStep` deep-mounts a
   * step; deep-mounting Done never marks a track complete, so browsing this
   * gallery cannot flip the localStorage completion flags.
   */
  { id: 'OB', title: 'Onboarding walkthrough', Screen: OnboardingFlow, role: 'parent + athlete',
    states: [
      ['chooser', 'Track chooser', { track: null }],
      ['athlete-book', 'Athlete · book practice', { track: 'athlete', initialStep: 2 }],
      ['parent-family', 'Parent · your family', { track: 'parent', initialStep: 1 }],
      ['athlete-done', 'Done · practice recap', { track: 'athlete', initialStep: 5 }],
    ] },
];

export default function StatesHarness() {
  return (
    <div style={{ background: '#080808', minHeight: '100vh', padding: '44px 48px 90px' }}>
      <Header />
      <ComponentGallery />
      <ScreenGallery />
    </div>
  );
}

function Header() {
  const total = SCREEN_STATES.reduce((n, s) => n + s.states.length, 0);
  return (
    <div style={{ marginBottom: 46, maxWidth: 820 }}>
      <div
        style={{
          font: `700 13px ${font.head}`,
          color: color.text,
          letterSpacing: '.24em',
          textTransform: 'uppercase',
        }}
      >
        RYP Academy
      </div>
      <h1
        style={{
          font: `700 42px/1.1 ${font.head}`,
          color: color.text,
          letterSpacing: '-.01em',
          margin: '14px 0 0',
        }}
      >
        Portal component system and critical path
      </h1>
      <p style={{ font: `400 16px/1.6 ${font.body}`, color: color.textSecondary, maxWidth: 730 }}>
        {SCREEN_STATES.length} screens, {total} states. Built against
        docs/portal/design-handoff.md. Screens 08·L and 18 are additions outside the brief’s seventeen and are not in this pass.
      </p>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section style={{ marginBottom: 54 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 20 }}>
        <h2
          style={{
            font: `700 22px ${font.head}`,
            color: color.text,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <span style={{ font: `400 14px ${font.body}`, color: color.textTertiary }}>
            {subtitle}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Spec({ label, children, width = 360 }) {
  return (
    <div style={{ width, flex: 'none' }}>
      <div
        style={{
          font: `600 10px ${font.body}`,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: color.textTertiary,
          marginBottom: 11,
        }}
      >
        {label}
      </div>
      <Card large>{children}</Card>
    </div>
  );
}

function ComponentGallery() {
  return (
    <Section title="Components" subtitle="Five core units plus six that repeat across four or more screens">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22 }}>
        <Spec label="Session card · 5 variants">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SessionCard time="4:00" meridiem="PM" type="training" name="Training block" meta="Sim 2 · Luke"
              trailing={<StatusBadge tone="green">Confirmed</StatusBadge>} />
            <SessionCard time="4:00" meridiem="PM" type="training" name="Training block" meta="Sim 2 · Luke"
              variant="live" trailing={<StatusBadge tone="green">Now</StatusBadge>} />
            <SessionCard time="8:30" meridiem="AM" type="tournament" name="Tournament block"
              meta="Brock · net scoring" variant="tournament" />
            <SessionCard time="5:00" meridiem="PM" type="cancelled" name="Training block" variant="cancelled" />
            <SessionCard time="4:00" meridiem="PM" type="training" name="Training block" meta="Sim 2" variant="full"
              trailing={<CapacityPill state="full">Full</CapacityPill>} />
          </div>
        </Spec>

        <Spec label="Athlete row · 4 trailing slots">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <AthleteRow name="A. Nguyen" meta="Age 12 · 4th month" divider
              trailing={<StatusBadge tone="green">On track</StatusBadge>} />
            <AthleteRow name="M. Okonkwo" meta="3 no-shows" divider
              trailing={<AttendanceControls value={null} onChange={() => {}} />} />
            <AthleteRow name="R. Sandoval" meta="Contract behind" divider
              trailing={<div style={{ width: 90 }}><ProgressMeter value={54} size="inline" /></div>} />
            <AthleteRow name="J. Whitfield" meta="Age 14"
              trailing={<span style={{ color: color.textTertiary }}>›</span>} />
          </div>
        </Spec>

        <Spec label="Progress meter · never red">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <MeterRow label="on track · ≥80%" value={92} />
            <MeterRow label="behind · 40–79%" value={54} />
            <MeterRow label="no data · <40%" value={null} />
            <MeterRow label="hero, 10px" value={92} size="hero" />
          </div>
        </Spec>

        <Spec label="Status badge · outline = state, dashed = pending">
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <StatusBadge tone="green">Confirmed</StatusBadge>
            <StatusBadge tone="yellow">Outstanding</StatusBadge>
            <StatusBadge tone="red">Restricted</StatusBadge>
            <StatusBadge tone="neutral">Neutral</StatusBadge>
            <StatusBadge tone="neutral" dashed>Pending</StatusBadge>
            <CapacityPill state="available">2 left</CapacityPill>
            <CapacityPill state="capped">Capped</CapacityPill>
          </div>
          <div style={{ font: `400 11px/1.5 ${font.body}`, color: color.textTertiary, marginTop: 12 }}>
            Solid fill is reachable only through Button and CapacityPill — both tappable. See the
            flag-02 note in StatusBadge.js.
          </div>
        </Spec>

        <Spec label="Package card · confirmed pricing" width={380}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <PackageCard pkg={GOLF_PACKAGES[1]} onSelect={() => {}} />
            <PackageCard pkg={FITNESS_PACKAGES[1]} onSelect={() => {}} selected />
            <PackageCard pkg={ELITE_TIERS[0]} emphasised onSelect={() => {}} />
          </div>
        </Spec>

        <Spec label="Allowance pools · two, never one">
          <AllowancePools allowance={ALLOWANCE} />
          <div style={{ height: 1, background: color.rule, margin: '16px 0' }} />
          <AllowancePools allowance={ALLOWANCE_NO_TOURNAMENTS} />
          <div style={{ font: `400 11px/1.5 ${font.body}`, color: color.textTertiary, marginTop: 14 }}>
            Training and tournament entitlements do not substitute for each other, so a spent
            pool never implies the other is spent.
          </div>
        </Spec>

        <Spec label="Type chip · not optional on a session card">
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {['training', 'tournament', 'cancelled', 'makeup', 'diagnostic'].map((t) => (
              <TypeChip key={t} type={t} />
            ))}
          </div>
        </Spec>

        <Spec label="Attendance controls · 64×48, 7px gap">
          <AttendanceStates />
        </Spec>

        <Spec label="Buttons">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button>Primary</Button>
            <Button variant="secondary" style={{ boxShadow: 'none' }}>Secondary</Button>
            <Button variant="caution" style={{ boxShadow: 'none' }}>Close block · 2 unmarked</Button>
            <Button variant="danger">Update payment method</Button>
            <Button loading>Signing in</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Spec>

        <Spec label="Skeleton · list loads never spin">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SkeletonBar tone="raised" width="62%" height={12} />
            <SkeletonBar tone="raised" width="38%" height={9} />
            <SkeletonCard height={78} style={{ marginTop: 6 }} />
            <SkeletonSessionCard style={{ marginTop: 4 }} />
          </div>
          <div style={{ font: `400 11px/1.5 ${font.body}`, color: color.textTertiary, marginTop: 12 }}>
            Bar and card variants, composed per screen in the loaded layout’s geometry so nothing
            jumps when data lands. The spinner stays a button-level treatment for an action the
            member just took; a list that is still fetching never spins.
          </div>
        </Spec>

        <Spec label="Load failure · plain language, retriable">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErrorNotice title="Schedule didn't load" onRetry={() => {}}>
              Your schedule didn't load — your bookings are unaffected. Check your connection and
              try again.
            </ErrorNotice>
            <ErrorNotice title="Open blocks didn't load" />
          </div>
          <div style={{ font: `400 11px/1.5 ${font.body}`, color: color.textTertiary, marginTop: 12 }}>
            No stack traces and no invented causes — the screen writes its own plain line. “Try
            again” renders only when a retry handler is wired; the second card is the un-wired
            state, with no dead button.
          </div>
        </Spec>

        <Spec label="Field · inline validation on blur">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Email" value="dana@email.com" onChange={() => {}} />
            <Field label="Date of birth" value="" placeholder="MM / DD / YYYY" onChange={() => {}}
              error="Date of birth is required — it determines U13 vs U18 eligibility." />
          </div>
        </Spec>

        <Spec label="Numeric field · unit outside the input">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <NumericField label="Clubhead speed" unit="mph" value="98" onChange={() => {}} />
            <NumericField label="Hip rotation" unit="°" value="42" onChange={() => {}} />
            <NumericField label="3 ft made" unit="/10" value="8" onChange={() => {}} />
          </div>
        </Spec>

        <Spec label="Day grid cell · logged ≠ missed ≠ open">
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            <DayGridCell state="logged" day={16} />
            <DayGridCell state="logged" day={17} />
            <DayGridCell state="missed" day={14} />
            <DayGridCell state="open" day={18} />
            <DayGridCell state="available" day={19} />
          </div>
          <DayGridLegend />
          <div style={{ font: `400 11px/1.5 ${font.body}`, color: color.textTertiary, marginTop: 12 }}>
            No more `closed` state (Sprint 5 pin) — logging is legal on any date, so a closure
            paints as an ordinary open day. `available` (rightmost) is the Book a Session month
            calendar reusing this same cell.
          </div>
        </Spec>

        <Spec label="Toggle · 42×25, row is the tap target">
          <ToggleStates />
        </Spec>

        <Spec label="Sequence ladder · graded escalation">
          <SequenceLadder
            current={2}
            rungs={[
              { label: 'Invoice issued', detail: 'Feb 12', step: 0 },
              { label: 'Retry 1', detail: 'Feb 15 · card declined', step: 1 },
              { label: 'Retry 2', detail: 'Feb 22 · next attempt', step: 2 },
              { label: 'Retry 3', detail: 'Feb 25', step: 3 },
              { label: 'Booking restricted', detail: 'Feb 26', step: 4 },
            ]}
          />
        </Spec>

        <Spec label="Media placeholder · marks real content">
          <MediaPlaceholder height={96} caption="SWING VIDEO — 4 angles" />
        </Spec>

        {/* Sprint 10 pin F: the shared "saved" toast, new this sprint - used
            by contract logging, diagnostic capture, notification prefs,
            session notes and contract tier (see SavedToast.js). */}
        <Spec label="Saved toast · shared across every real save">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SavedToast />
            <SavedToast message="Draft saved" />
            <SavedToast message="Published to Practice DNA" />
          </div>
        </Spec>

        <Spec label="Bottom tab bar · member roles" width={200}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['athlete', 'parent', 'coach'].map((role) => (
              <BottomTabBar key={role} role={role} active={undefined} onChange={() => {}} />
            ))}
          </div>
        </Spec>

        {/*
          Sprint 10 pin F: the staff tab sets (owner/ops/mental) and the
          coach-with-specialistId variant (Phil), new this sprint.
        */}
        <Spec label="Bottom tab bar · staff roles" width={200}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['owner', 'ops', 'mental'].map((role) => (
              <BottomTabBar key={role} role={role} active={undefined} onChange={() => {}} />
            ))}
            <BottomTabBar role="coach" specialistId="phil" active={undefined} onChange={() => {}} />
          </div>
        </Spec>
      </div>
    </Section>
  );
}

function MeterRow({ label, value, size = 'card' }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ font: `400 11px ${font.body}`, color: color.textTertiary }}>{label}</span>
        <span style={{ font: `600 11px ${font.body}`, color: color.textSecondary }}>
          {value == null ? '—' : `${value}%`}
        </span>
      </div>
      <ProgressMeter value={value} size={size} />
    </div>
  );
}

function AttendanceStates() {
  const [a, setA] = React.useState(null);
  const [b, setB] = React.useState('in');
  const [c, setC] = React.useState('out');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Labelled label="Unmarked"><AttendanceControls value={a} onChange={setA} /></Labelled>
      <Labelled label="Marked in"><AttendanceControls value={b} onChange={setB} /></Labelled>
      <Labelled label="Marked out"><AttendanceControls value={c} onChange={setC} /></Labelled>
      <div style={{ font: `400 11px/1.5 ${font.body}`, color: color.textTertiary }}>
        Three states, not two. Tapping the active button clears it.
      </div>
    </div>
  );
}

function ToggleStates() {
  const [on, setOn] = React.useState(true);
  const [off, setOff] = React.useState(false);
  return (
    <div>
      <ToggleRow label="Schedule changes" description="Email and SMS" checked={on} onChange={setOn} />
      <ToggleRow label="Rewards" description="Email only" checked={off} onChange={setOff} />
    </div>
  );
}

function Labelled({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 92, font: `400 11px ${font.body}`, color: color.textTertiary }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function ScreenGallery() {
  return (
    <>
      {SCREEN_STATES.map(({ id, title, Screen, role, states }) => (
        <Section key={id} title={`${id} · ${title}`} subtitle={`${role} · ${states.length} states`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 42 }}>
            {/* A state can carry extra props (third element) for behavior the
                variant alone cannot express, like 05's rejecting onBook. The
                key is the label because a variant can appear twice. */}
            {states.map(([variant, label, props]) => (
              <div key={label}>
                <div
                  style={{
                    font: `500 12px ${font.body}`,
                    color: color.textTertiary,
                    marginBottom: 11,
                  }}
                >
                  {label}
                </div>
                <Screen variant={variant} {...(props || null)} />
              </div>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}
