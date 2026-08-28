import React from 'react';
import { color, font } from '../tokens';
import MediaPlaceholder from '../components/MediaPlaceholder';
import { FrameEmbedContext } from '../components/PhoneFrame';
import AllowancePools from '../components/AllowancePools';
import { Body, Card, SectionLabel, Tick } from '../components/Primitives';
import AthleteDashboard from './AthleteDashboard';
import BookSession from './BookSession';
import CommitmentContract from './CommitmentContract';
import ParentDashboard from './ParentDashboard';
import Billing from './Billing';
import NotificationPreferences from './NotificationPreferences';
import { useSchedule } from '../hooks';
// Pure calendar helper, not response data — the seam rule from BookSession.
import { longDayLabel } from '../data/calendar';

/**
 * The onboarding walkthrough's step definitions and step content — split from
 * OnboardingFlow.js (which owns the chrome and the stepping) to keep both
 * files inside the 500-line rule. See OnboardingFlow.js for the program's
 * rules; the short version that governs everything in this file:
 *
 * - Real screens, never duplicated mocks. Practice reads go through the
 *   pinned `{ practice: true }` hook option; practice entries live in the
 *   wrapped screens' component state and evaporate when a step unmounts.
 * - Action steps complete only on the real action (confirmation rendered,
 *   day logged). Copy is plain language and keeps the two-pool wording:
 *   training and tournaments never substitute.
 * - Practice data is the existing Whitfield seed. Nothing here invents data.
 *
 * A step: `{ id, title, instruction, [instructionDone], [gate], [gateLabel],
 * render(ctx) }` where ctx carries `{ track, booking, loggedDay, onBooked,
 * onLogged }` from the flow.
 */

/* ----------------------------------------------------------- step content -- */

/** A real screen filling the space under the chrome, via the PhoneFrame seam. */
function Fill({ children }) {
  return <FrameEmbedContext.Provider value="fill">{children}</FrameEmbedContext.Provider>;
}

/** Real screens stacked in one scroll (parent billing + notifications step). */
function Flow({ children }) {
  return <FrameEmbedContext.Provider value="flow">{children}</FrameEmbedContext.Provider>;
}

function OwnStep({ children }) {
  return (
    <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 13 }}>
      {children}
    </div>
  );
}

function BulletList({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((line) => (
        <div key={line} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
          <span
            style={{
              width: 4,
              height: 4,
              marginTop: 7,
              flex: 'none',
              background: color.primary,
              borderRadius: 2,
            }}
          />
          <span style={{ font: `400 13px/1.5 ${font.body}`, color: color.textSecondary }}>
            {line}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Welcome — the handoff's 03 new-athlete welcome-video placeholder, verbatim. */
function WelcomeStep({ bullets }) {
  return (
    <OwnStep>
      <MediaPlaceholder
        height={126}
        caption="WELCOME VIDEO — Luke, 60 sec — what the first week looks like"
      />
      <Card large>
        <SectionLabel style={{ marginBottom: 12 }}>What the portal does</SectionLabel>
        <BulletList items={bullets} />
      </Card>
    </OwnStep>
  );
}

/**
 * The two-pool explainer. The allowance is the seed's, read through the pinned
 * practice seam — the same numbers every real screen in this walkthrough shows.
 */
function PoolsStep() {
  const { data } = useSchedule({ practice: true });
  return (
    <OwnStep>
      <Card large>
        <SectionLabel style={{ marginBottom: 12 }}>Your allowance this cycle</SectionLabel>
        <AllowancePools allowance={data?.allowance} />
      </Card>
      <Card large>
        <Body size={13}>
          Training sessions and tournament entries are two separate pools, and they never
          substitute for each other: spending every tournament entry leaves all of your training
          sessions bookable, and the reverse. Both reset each billing cycle, and every balance in
          the portal shows both numbers.
        </Body>
      </Card>
    </OwnStep>
  );
}

/**
 * The recap. It names each practice entry explicitly and says plainly that
 * they are gone — the walkthrough's last job is making sure nothing it staged
 * could be mistaken for a real record.
 */
function DoneStep({ track, booking, loggedDay }) {
  return (
    <OwnStep>
      <Card tone="green" large>
        <SectionLabel tone={color.primary} style={{ marginBottom: 12 }}>
          Practice recap
        </SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <RecapRow
            done={Boolean(booking)}
            label={
              booking
                ? `Practice booking — ${booking.name} · ${booking.when} · would have spent 1 ${
                    booking.pool === 'tournaments' ? 'tournament entry' : 'training session'
                  }`
                : 'No practice booking was made'
            }
          />
          {track === 'athlete' ? (
            <RecapRow
              done={Boolean(loggedDay)}
              label={
                loggedDay
                  ? `Practice contract day — ${longDayLabel(loggedDay)}`
                  : 'No practice day was logged'
              }
            />
          ) : null}
        </div>
        <Body size={13} style={{ marginTop: 14 }}>
          Those entries were practice, and they are already gone. Your real schedule, the
          Commitment Contract, and both allowance pools — training and tournaments — are exactly
          as they were.
        </Body>
      </Card>
    </OwnStep>
  );
}

function RecapRow({ done, label }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span
        style={{
          width: 18,
          height: 18,
          flex: 'none',
          marginTop: 1,
          borderRadius: '50%',
          border: `1.5px solid ${done ? color.primary : color.controlBorder}`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {done ? <Tick size={9} color={color.primary} /> : null}
      </span>
      <span style={{ font: `400 13px/1.5 ${font.body}`, color: color.textSecondary }}>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ steps -- */

/**
 * Booking step, shared by both tracks: the REAL BookSession with the pinned
 * `practice` option. Completes only when its confirmation renders.
 */
const bookStep = (instructionBody) => ({
  id: 'book',
  title: 'Book a session',
  gate: 'book',
  gateLabel: 'Book a block to continue',
  instruction: { title: 'Try it', body: instructionBody },
  instructionDone: {
    title: 'Booked',
    body:
      'That confirmation is exactly what a real booking shows — including which pool it spends. This one is practice: nothing was reserved and nothing was spent.',
  },
  render: ({ onBooked }) => (
    <Fill>
      <BookSession bare practice onConfirmed={onBooked} />
    </Fill>
  ),
});

const welcomeStep = (bullets) => ({
  id: 'welcome',
  title: 'Welcome',
  instruction: {
    title: 'Start here',
    body:
      'Luke’s welcome is a minute long. Everything you try in this walkthrough is practice — nothing becomes real.',
  },
  render: () => <WelcomeStep bullets={bullets} />,
});

const doneStep = {
  id: 'done',
  title: 'That was practice',
  instruction: null,
  render: (ctx) => <DoneStep {...ctx} />,
};

export const ATHLETE_STEPS = [
  welcomeStep([
    'Book your training and tournament blocks — two separate allowances, always shown as two numbers.',
    'Log your Commitment Contract day in one tap.',
    'See your Practice DNA baseline — your own numbers, never a model swing.',
  ]),
  {
    id: 'dashboard',
    title: 'Your dashboard',
    instruction: {
      title: 'Look around',
      body:
        'This is your home screen: your next session, your Commitment Contract, and what is left of both allowance pools. Scroll it, then continue.',
    },
    render: () => (
      <Fill>
        <AthleteDashboard bare variant="populated" />
      </Fill>
    ),
  },
  bookStep(
    'Book a block for real: pick a day, tap an open block, and land on the confirmation. Each block says which pool it spends before you commit.'
  ),
  {
    id: 'log',
    title: 'Log a practice day',
    gate: 'log',
    gateLabel: 'Log today to continue',
    instruction: {
      title: 'Try it',
      body:
        'Tap “Log today” at the bottom. Watch today’s cell in the grid and the count at the top — that one tap is the whole daily habit.',
    },
    instructionDone: {
      title: 'Logged',
      body:
        'The grid and the count moved the moment you tapped. This day is practice and won’t be saved — your real contract month is untouched.',
    },
    render: ({ onLogged }) => (
      <Fill>
        <CommitmentContract bare practice onLogged={onLogged} />
      </Fill>
    ),
  },
  {
    id: 'pools',
    title: 'Two allowances',
    instruction: {
      title: 'One rule to keep',
      body: 'The single most useful thing to know before you book on your own.',
    },
    render: () => <PoolsStep />,
  },
  doneStep,
];

export const PARENT_STEPS = [
  welcomeStep([
    'Book training and tournament blocks for your athletes — two separate allowances, always shown as two numbers.',
    'See each athlete’s Commitment Contract standing at a glance.',
    'Manage billing and choose exactly how the academy reaches you.',
  ]),
  {
    id: 'family',
    title: 'Your family',
    instruction: {
      title: 'Look at the balances',
      body:
        'One card per athlete. Notice Reese: training sessions left, tournament entries at zero — and her next session is a tournament. The two pools never substitute, which is why every balance is two numbers.',
    },
    render: () => (
      <Fill>
        <ParentDashboard bare variant="three" />
      </Fill>
    ),
  },
  bookStep(
    'Book a block the way you would for your athlete: pick a day, tap an open block, reach the confirmation. Each block says which pool it spends before you commit.'
  ),
  {
    id: 'billing',
    title: 'Billing & notifications',
    instruction: {
      title: 'Two quick stops',
      body:
        'Billing shows your membership, payment method, and invoices — and exactly where a failed payment stands, if that ever happens. Below it, Notifications is where you choose email or text per category. Scroll through, then continue.',
    },
    render: () => (
      <Flow>
        <Billing bare variant="active" />
        <NotificationPreferences bare variant="default" />
      </Flow>
    ),
  },
  doneStep,
];
