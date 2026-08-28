import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { color, font } from '../tokens';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { BackLink, Banner, Body, ScreenTitle } from '../components/Primitives';
import useOnboardingStatus from '../hooks/onboarding';
import { ATHLETE_STEPS, PARENT_STEPS } from './OnboardingSteps';

/**
 * Onboarding walkthrough — the guided first run (docs/portal/TEAM.md,
 * "Onboarding program v1"). Not a numbered handoff screen: it wraps the REAL
 * screens in practice mode rather than duplicating any of them. The step
 * definitions and their content live in ./OnboardingSteps.js.
 *
 * Two tracks, chosen on entry or via ?track=. Each step is a real screen (or a
 * short explainer) under the walkthrough's own chrome: the Registration
 * step-header pattern (progress segments + step title), a green instruction
 * Banner saying what to do in plain language, and a persistent PRACTICE badge
 * so nothing on screen reads as real.
 *
 * The rules this file exists to hold (all pinned in TEAM.md):
 * - Practice performs ZERO Firestore writes. The practice booking and the
 *   practice contract day live in component state inside the real screens
 *   (BookSession's `booked`, CommitmentContract's `practiceLogged`) and are
 *   gone the moment the step unmounts. Data reads go through the pinned
 *   `{ practice: true }` hook option, which pins the seed source.
 * - Action steps advance ONLY on the real action completing — the booking
 *   confirmation rendering, the day being logged — never on "Next" alone.
 *   Orientation steps use a plain Continue. Skip is always available (44px
 *   floor) and leaves for the track's home without marking complete.
 * - Practice data is the existing Whitfield seed. Nothing here invents a
 *   name, a price, a date, or a count.
 *
 * @param {null|'parent'|'athlete'} track  null renders the track chooser.
 * @param {boolean} bare  Full-viewport shell, as on every screen.
 * @param {number} [initialStep]  Harness/dev affordance: mount on a later step.
 *   Deep-mounting never marks a track complete — completion is only written
 *   when the learner advances into Done through the flow itself.
 * @param {(path) => void} [onNavigate]  Where Skip and the end CTA go. Wired by
 *   the route wrapper below; without it (harness) those controls are inert,
 *   like every unwired navigation CTA in the gallery.
 */
export default function OnboardingFlow({ track = null, bare = false, initialStep = 0, onNavigate }) {
  const { markComplete } = useOnboardingStatus();
  const [chosen, setChosen] = useState(null);
  const [stepIndex, setStepIndex] = useState(initialStep);
  // What the learner practiced, kept only to recap it on Done. The entries
  // themselves already evaporated with the screens that held them.
  const [booking, setBooking] = useState(null);
  const [loggedDay, setLoggedDay] = useState(null);

  const activeTrack = track ?? chosen;
  const homePath = activeTrack === 'parent' ? '/portal/family' : '/portal/home';
  const skip = () => onNavigate && onNavigate(homePath);

  if (!activeTrack) {
    return (
      <PhoneFrame bare={bare} header={<ChooserHeader onSkip={skip} />}>
        <TrackChooser
          onPick={(t) => {
            setChosen(t);
            setStepIndex(0);
          }}
        />
      </PhoneFrame>
    );
  }

  const steps = activeTrack === 'parent' ? PARENT_STEPS : ATHLETE_STEPS;
  // Clamped once and used everywhere — an out-of-range initialStep lands on
  // the last step rather than mislabeling the counter.
  const index = Math.min(Math.max(stepIndex, 0), steps.length - 1);
  const step = steps[index];
  const gateDone =
    step.gate === 'book' ? Boolean(booking) : step.gate === 'log' ? Boolean(loggedDay) : true;

  const back = () => {
    if (index > 0) return setStepIndex(index - 1);
    if (!track) {
      // Entered via the chooser — back out to it, dropping the practice run.
      setChosen(null);
      setBooking(null);
      setLoggedDay(null);
    }
    return undefined;
  };

  const advance = () => {
    const nextIndex = index + 1;
    if (nextIndex >= steps.length) return;
    // Completion is written on advancing INTO Done — a finished run, not a
    // deep-mounted recap. Skip never reaches here, so skip never marks.
    if (steps[nextIndex].id === 'done') markComplete(activeTrack);
    setStepIndex(nextIndex);
  };

  const instruction =
    step.gate && gateDone && step.instructionDone ? step.instructionDone : step.instruction;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <StepHeader
          title={step.title}
          stepIndex={index}
          stepCount={steps.length}
          onBack={index > 0 || !track ? back : undefined}
          onSkip={step.id === 'done' ? undefined : skip}
          instruction={instruction}
        />
      }
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          {step.id === 'done' ? (
            <Button onClick={() => onNavigate && onNavigate(homePath)}>
              {activeTrack === 'parent' ? 'Go to your family' : 'Go to your dashboard'}
            </Button>
          ) : (
            <Button disabled={!gateDone} onClick={advance}>
              {gateDone ? 'Continue' : step.gateLabel}
            </Button>
          )}
        </div>
      }
    >
      {step.render({
        track: activeTrack,
        booking,
        loggedDay,
        onBooked: setBooking,
        onLogged: (entry) => setLoggedDay(entry.iso),
      })}
    </PhoneFrame>
  );
}

/* ---------------------------------------------------------------- chrome -- */

/**
 * Registration's step-header pattern, reused: back/skip row, equal 3px
 * progress segments, then the step title. The PRACTICE badge sits in the top
 * row on every step — the walkthrough's one non-negotiable piece of chrome —
 * and the instruction Banner rides below the title so it never scrolls away
 * with the screen under it.
 */
function StepHeader({ title, stepIndex, stepCount, onBack, onSkip, instruction }) {
  return (
    <div style={{ padding: '12px 22px 14px', borderBottom: `1px solid ${color.frameRule}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onBack ? <BackLink onClick={onBack}>‹ Back</BackLink> : null}
        <div style={{ flex: 1 }} />
        <StatusBadge tone="yellow">Practice</StatusBadge>
        {onSkip ? <SkipLink onSkip={onSkip} /> : null}
      </div>

      <div style={{ display: 'flex', gap: 5, marginTop: 13 }}>
        {Array.from({ length: stepCount }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= stepIndex ? color.primary : color.rule,
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 12 }}>
        <ScreenTitle size={24} style={{ flex: 1, minWidth: 0 }}>
          {title}
        </ScreenTitle>
        <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary, flex: 'none' }}>
          Step {stepIndex + 1} of {stepCount}
        </span>
      </div>

      {instruction ? (
        <Banner tone="green" title={instruction.title} style={{ marginTop: 12 }}>
          {instruction.body}
        </Banner>
      ) : null}
    </div>
  );
}

/** Skip, on BackLink's 44px-bleed pattern so the target never drops to 16px. */
function SkipLink({ onSkip }) {
  return (
    <BackLink onClick={onSkip} style={{ padding: '0 0 0 14px', color: color.textTertiary }}>
      Skip
    </BackLink>
  );
}

function ChooserHeader({ onSkip }) {
  return (
    <div style={{ padding: '12px 22px 14px', borderBottom: `1px solid ${color.frameRule}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <StatusBadge tone="yellow">Practice</StatusBadge>
        <div style={{ flex: 1 }} />
        <SkipLink onSkip={onSkip} />
      </div>
      <ScreenTitle size={24} style={{ marginTop: 14 }}>
        Welcome to the portal
      </ScreenTitle>
      <Body size={13} style={{ marginTop: 8 }}>
        A short walkthrough on the real screens. Everything you try is practice — nothing you do
        here becomes real.
      </Body>
    </div>
  );
}

/* --------------------------------------------------------------- chooser -- */

function TrackChooser({ onPick }) {
  const tracks = [
    {
      id: 'parent',
      title: 'I’m a parent',
      body: 'Your family’s view: each athlete’s standing, booking for them, billing, and how the academy reaches you.',
    },
    {
      id: 'athlete',
      title: 'I’m an athlete',
      body: 'Your view: the dashboard, booking a block, and logging your Commitment Contract day.',
    },
  ];

  return (
    <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 13 }}>
      {tracks.map((t) => (
        <div
          key={t.id}
          role="button"
          tabIndex={0}
          onClick={() => onPick(t.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPick(t.id);
            }
          }}
          style={{
            background: color.surface,
            border: `1px solid ${color.border}`,
            borderRadius: 16,
            padding: 17,
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            cursor: 'pointer',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `700 17px ${font.head}`, color: color.text }}>{t.title}</div>
            <Body size={12} style={{ marginTop: 6 }}>
              {t.body}
            </Body>
          </div>
          <span style={{ font: `400 18px ${font.body}`, color: color.textTertiary, flex: 'none' }}>
            ›
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ route -- */

/**
 * The /portal/welcome element: reads ?track= and wires navigation, keeping
 * router coupling out of the flow itself (screens take callbacks, per the
 * codebase convention). Added to PortalRoutes under the standing PM exception
 * for that one route line.
 */
export function OnboardingWelcomeRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const t = params.get('track');
  return (
    <OnboardingFlow
      bare
      track={t === 'parent' || t === 'athlete' ? t : null}
      onNavigate={navigate}
    />
  );
}
