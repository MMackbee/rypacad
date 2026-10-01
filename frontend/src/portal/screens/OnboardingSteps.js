import React from 'react';
import { color, font } from '../tokens';
import { FrameEmbedContext } from '../components/PhoneFrame';
import AllowancePools from '../components/AllowancePools';
import { Body, Card, SectionLabel, Tick } from '../components/Primitives';
import AthleteDashboard from './AthleteDashboard';
import BookSession from './BookSession';
import CommitmentContract from './CommitmentContract';
import ParentDashboard from './ParentDashboard';
import TourStandings from './TourStandings';
import NotificationPreferences from './NotificationPreferences';
import { useSchedule } from '../hooks';
// Pure calendar helpers, not response data — the seam rule from BookSession.
import { BEHIND_BUFFER_DAYS, longDayLabel } from '../data/calendar';
import { contractEnabled } from '../data/contractFlag';

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
 *   day logged). Copy is plain language and keeps the one-token wording
 *   (Sprint 12): every session, of any kind, spends one token.
 * - Practice data is the existing Whitfield seed. Nothing here invents data,
 *   and copy that names a sample athlete names one the step renders.
 *
 * A step: `{ id, title, instruction, [instructionDone], [gate], [gateLabel],
 * render(ctx) }` where ctx carries `{ track, booking, loggedDay, onBooked,
 * onLogged }` from the flow.
 *
 * While the Commitment Contract is hidden (data/contractFlag.js, owner
 * 2026-09-30) the athlete track skips its log step and no step's copy
 * mentions the contract. The lists are built per call, so the flag is read
 * when the walkthrough renders.
 *
 * `unlimited` (an Elite family, hooks/elite.js; tester Mike 2026-09-30): an
 * Elite member holds no tokens, so their track has no tokens step and none
 * of this file's own copy names one. The practice screens still show the
 * sample family, tokens and all.
 */

/* ----------------------------------------------------------- step content -- */

/** A real screen filling the space under the chrome, via the PhoneFrame seam. */
function Fill({ children }) {
  return <FrameEmbedContext.Provider value="fill">{children}</FrameEmbedContext.Provider>;
}

/** Real screens stacked in one scroll (parent Tour + notifications step). */
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

/**
 * Luke's 60-second welcome, once it exists: REACT_APP_WELCOME_VIDEO_URL is a
 * direct video file or a YouTube/Vimeo embed link. Unset, the step shows no
 * video at all (a tester met the striped placeholder on the live site,
 * 2026-09-30).
 */
export const WELCOME_VIDEO_URL = (process.env.REACT_APP_WELCOME_VIDEO_URL || '').trim();

function WelcomeVideo({ url }) {
  if (!url) return null;
  const embed = /youtube\.com|youtu\.be|vimeo\.com/.test(url);
  const style = { width: '100%', height: 190, border: 0, borderRadius: 10, background: '#000', display: 'block' };
  return embed
    ? <iframe title="Welcome from Luke" src={url} style={style} allow="autoplay; fullscreen" allowFullScreen />
    : <video controls playsInline preload="metadata" src={url} style={style} aria-label="Welcome from Luke" />;
}

/** Welcome — the handoff's 03 new-athlete welcome step. */
function WelcomeStep({ bullets }) {
  return (
    <OwnStep>
      <WelcomeVideo url={WELCOME_VIDEO_URL} />
      <Card large>
        <SectionLabel style={{ marginBottom: 12 }}>What the portal does</SectionLabel>
        <BulletList items={bullets} />
      </Card>
    </OwnStep>
  );
}

/**
 * The tokens explainer. The position is the seed's, read through the pinned
 * practice seam — the same numbers every real screen in this walkthrough shows.
 */
function PoolsStep() {
  const { data } = useSchedule({ practice: true });
  return (
    <OwnStep>
      <Card large>
        <SectionLabel style={{ marginBottom: 12 }}>Your tokens this period</SectionLabel>
        <AllowancePools tokens={data?.tokens} />
      </Card>
      <Card large>
        <Body size={13}>
          Every session spends one token - training, Tour events, Phil's performance
          sessions and Yannick's mental game sessions alike. Tokens are issued each billing
          period and expire when it ends, and every balance in the portal is that one number.
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
function DoneStep({ track, booking, loggedDay, unlimited = false }) {
  const contract = contractEnabled();
  const untouched = unlimited
    ? contract
      ? 'Your real schedule and the Commitment Contract are exactly as they were.'
      : 'Your real schedule is exactly as it was.'
    : contract
    ? 'Your real schedule, the Commitment Contract, and your token balance are exactly as they were.'
    : 'Your real schedule and your token balance are exactly as they were.';
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
                ? `Practice booking - ${booking.name} · ${booking.when}${unlimited ? '' : ' · would have spent 1 token'}`
                : 'No practice booking was made'
            }
          />
          {track === 'athlete' && contract ? (
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
          Those entries were practice, and they are already gone. {untouched}
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
const bookStep = (instructionBody, unlimited = false) => ({
  id: 'book',
  title: 'Book a session',
  gate: 'book',
  gateLabel: 'Book a block to continue',
  instruction: { title: 'Try it', body: instructionBody },
  instructionDone: {
    title: 'Booked',
    body: unlimited
      ? 'That confirmation is exactly what a real booking shows. This one is practice: nothing was reserved.'
      : 'That confirmation is exactly what a real booking shows - including the token it spends. This one is practice: nothing was reserved and nothing was spent.',
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
    body: WELCOME_VIDEO_URL
      ? 'Luke’s welcome is a minute long. Everything you try in this walkthrough is practice — nothing becomes real.'
      : 'Everything you try in this walkthrough is practice — nothing becomes real.',
  },
  render: () => <WelcomeStep bullets={bullets} />,
});

const doneStep = (unlimited = false) => ({
  id: 'done',
  title: 'That was practice',
  instruction: null,
  render: (ctx) => <DoneStep {...ctx} unlimited={unlimited} />,
});

/** The logging step: the REAL Contract screen in practice mode. Contract on only. */
const logStep = {
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
};

/** The athlete's home-screen line: with the contract, with tokens, or neither. */
function dashboardBody(contract, unlimited) {
  if (unlimited) {
    return contract
      ? 'This is your home screen: your next session and your Commitment Contract. Scroll it, then continue.'
      : 'This is your home screen: your next session and what you have coming up. Scroll it, then continue.';
  }
  return contract
    ? 'This is your home screen: your next session, your Commitment Contract, and the tokens you have left this period. Scroll it, then continue.'
    : 'This is your home screen: your next session and the tokens you have left this period. Scroll it, then continue.';
}

export function athleteSteps(unlimited = false) {
  const contract = contractEnabled();
  return [
    welcomeStep([
      unlimited
        ? 'Book training blocks and Tour events.'
        : 'Book training blocks and Tour events - every session spends one token from your period.',
      ...(contract
        ? ['Log your Commitment Contract day in one tap.', 'Log your practice minutes and watch your commitment streak build.']
        : []),
    ]),
    {
      id: 'dashboard',
      title: 'Your dashboard',
      instruction: { title: 'Look around', body: dashboardBody(contract, unlimited) },
      render: () => (
        <Fill>
          <AthleteDashboard bare variant="populated" practice />
        </Fill>
      ),
    },
    bookStep(
      unlimited
        ? 'Book a block for real: pick a day, tap an open block, and land on the confirmation. Each block says what it includes before you commit.'
        : 'Book a block for real: pick a day, tap an open block, and land on the confirmation. Each block says what it spends - one token - before you commit.',
      unlimited
    ),
    ...(contract ? [logStep] : []),
    // Elite holds no tokens: no tokens step.
    ...(unlimited
      ? []
      : [
          {
            id: 'pools',
            title: 'Your tokens',
            instruction: {
              title: 'One rule to keep',
              body: 'The single most useful thing to know before you book on your own.',
            },
            render: () => <PoolsStep />,
          },
        ]),
    doneStep(unlimited),
  ];
}

export function parentSteps(unlimited = false) {
  const contract = contractEnabled();
  // The Behind badge is contract copy: it and its sentence go while hidden.
  const behind = contract
    ? ` Her yellow Behind badge means she has missed more than ${BEHIND_BUFFER_DAYS} weekdays of her Commitment Contract this month.`
    : '';
  return [
    welcomeStep([
      unlimited
        ? 'Book training blocks and Tour events for your athletes.'
        : 'Book training blocks and Tour events for your athletes - every session spends one token from that athlete\'s period.',
      ...(contract ? ['See each athlete’s Commitment Contract standing at a glance.'] : []),
      'Follow the RYP Tour - the season leaderboard for Tour events - and choose exactly how the academy reaches you.',
    ]),
    {
      id: 'family',
      title: 'Your family',
      instruction: unlimited
        ? {
            title: 'Look at the cards',
            body: `One card per athlete. Notice Reese: her next session is a Tour event.${behind}`,
          }
        : {
            title: 'Look at the balances',
            body: `One card per athlete. Notice Reese: her Tokens row is what she has left this period - every session spends one, and her next one is a Tour event.${behind}`,
          },
      // `practice` pins the Whitfield seed (tester report 2026-09-30): without
      // it a signed-in parent saw their own family here, and no Reese.
      render: () => (
        <Fill>
          <ParentDashboard bare variant="three" practice />
        </Fill>
      ),
    },
    bookStep(
      unlimited
        ? 'Book a block the way you would for your athlete: pick a day, tap an open block, reach the confirmation. Each block says what it includes before you commit.'
        : 'Book a block the way you would for your athlete: pick a day, tap an open block, reach the confirmation. Each block says what it spends - one token - before you commit.',
      unlimited
    ),
    {
      // Billing's old walkthrough slot (Sprint 7: billing is parked, its tab
      // replaced by the Tour) — the step teaches the two remaining tabs the
      // family step and book step haven't already covered.
      id: 'tour',
      title: 'The RYP Tour & notifications',
      instruction: {
        title: 'Two quick stops',
        body:
          'The Tour tab is the season leaderboard: every Tour event banks points toward the standings, and the whole academy is on the board. Below it, Notifications is where you choose email or push per category. Scroll through, then continue.',
      },
      // The standings are academy-public, the same board for every family.
      // Notifications is the parent's own, so `practice` pins the seed and keeps
      // the toggles local: no save, and none of the account cards and rows
      // (review 2026-09-30 - it read and wrote the signed-in parent's settings).
      render: () => (
        <Flow>
          <TourStandings bare role="parent" practice />
          <NotificationPreferences bare variant="default" practice />
        </Flow>
      ),
    },
    doneStep(unlimited),
  ];
}
