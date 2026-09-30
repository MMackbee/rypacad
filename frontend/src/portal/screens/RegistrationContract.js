import React from 'react';
import { format, parseISO } from 'date-fns';
import { color, font, radius, tint } from '../tokens';
import { Body, Card, SectionLabel } from '../components/Primitives';
import { CONTRACT_TIERS } from '../data/athlete';
import { SEASON_BOUNDS } from '../data/season';
import { TIER_MINUTES, contractAnswered, joinNames } from '../data/signup';

/**
 * Registration's Commitment Contract step (owner feedback 2026-09-30), right
 * after the package step - in its own file for the 500-line rule, like
 * RegistrationConsent.js, and re-exported from RegistrationSteps.js. It
 * replaces the unexplained optional tier row under the package cards, which
 * followed the package tabs and so often landed on the wrong child: here
 * every athlete has a card, all on screen at once, and each needs an answer -
 * a daily goal, or "Not yet" (no contract; one can be started later in the
 * app). The copy follows the owner's rulings of 2026-09-30: the contract
 * counts from the season start, or from the day it is picked if later; an
 * athlete is Behind only after more than 5 missed weekdays in a month; late
 * entries count. Only the athlete's own login can log minutes (firestore
 * rules), hence the warning for a child the parent's account runs.
 */
const SEASON_START_LABEL = format(parseISO(SEASON_BOUNDS.start), 'EEE, MMM d');
const SMALL_PRINT = "It's a promise, not a payment. Nothing is billed, and your package doesn't change.";

function howItWorks(self, todayISO) {
  const started = Boolean(todayISO) && todayISO >= SEASON_BOUNDS.start;
  const picked = self ? 'the day you pick it' : "the day it's picked";
  return [
    `${self ? 'Pick' : 'Each athlete picks'} a daily goal: 20, 45 or 90 minutes, Monday to Friday. Weekends are off.`,
    `Any practice counts, with us or at home. ${self ? 'You log' : 'They log'} it in the app.`,
    started ? `It counts from ${picked}.` : `It counts from ${SEASON_START_LABEL}, or from ${picked} if that's later.`,
    self
      ? 'Missed a day? You can log it late that month. You only show as Behind after more than 5 missed weekdays in a month.'
      : 'Missed a day? They can log it late that month. They only show as Behind after more than 5 missed weekdays in a month.',
  ];
}

export function ContractStep({ mode, athletes, onUpdate, showErrors, todayISO }) {
  const self = mode === 'athlete';
  const label = (a) => a.name.trim() || `Athlete ${athletes.indexOf(a) + 1}`;
  const missing = athletes.filter((a) => !contractAnswered(a));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Body size={13}>
        {self
          ? 'The Commitment Contract is your promise to put the work in. We hold you to it.'
          : "You shouldn't have to nag about practice. That's our job, and the Commitment Contract is how we do it."}
      </Body>

      <Card>
        <SectionLabel style={{ marginBottom: 10 }}>How it works</SectionLabel>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {howItWorks(self, todayISO).map((line) => (
            <li key={line} style={{ font: `400 12px/1.55 ${font.body}`, color: color.textSecondary }}>{line}</li>
          ))}
        </ol>
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>{SMALL_PRINT}</Body>
      </Card>

      <div>
        <SectionLabel>{self ? 'Pick your daily goal' : 'Pick a daily goal'}</SectionLabel>
        {self ? null : <Body size={12} style={{ marginTop: 6 }}>Best chosen together. It's their promise to keep.</Body>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {CONTRACT_TIERS.map((t) => (
            <div key={t.minutes} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span style={{ flex: 'none', width: 54, font: `700 14px ${font.head}`, color: color.text }}>{t.minutes} min</span>
              <Body size={12}>{t.description}</Body>
            </div>
          ))}
        </div>
      </div>

      {athletes.map((a) => (
        <GoalCard key={a.key} athlete={a} name={label(a)} self={self}
          onPick={(m) => onUpdate(a.key, { contractMinutes: m, contractPicked: true })} />
      ))}

      {showErrors && missing.length ? (
        <div data-field-error>
          <Body size={12} tone={color.error}>
            {self ? 'Pick your daily goal, or tap Not yet.' : `Pick a daily goal for ${joinNames(missing.map(label))}, or tap Not yet.`}
          </Body>
        </div>
      ) : null}
    </div>
  );
}

/** One athlete's answer: 20 / 45 / 90 or Not yet, one-of-four like a radio group (no tap-again-to-clear). */
function GoalCard({ athlete, name, self, onPick }) {
  const goal = TIER_MINUTES.includes(athlete.contractMinutes) ? athlete.contractMinutes : null;
  const notYet = athlete.contractPicked === true && athlete.contractMinutes == null;
  const options = [...TIER_MINUTES.map((m) => [m, `${m} min a day for ${name}`]), [null, `Not yet for ${name}`]];
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>{self ? 'Your daily goal' : name}</SectionLabel>
      <div role="radiogroup" aria-label={`Daily goal for ${name}`} style={{ display: 'flex', gap: 8 }}>
        {options.map(([m, aria]) => {
          const on = m == null ? notYet : goal === m;
          return (
            <button
              key={aria}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={aria}
              onClick={() => onPick(m)}
              style={{
                flex: 1,
                minWidth: 0,
                height: 54,
                borderRadius: radius.card,
                border: `1px solid ${on ? color.primary : color.border}`,
                background: on ? tint.green : color.surface,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {m == null ? (
                <span style={{ font: `600 13px ${font.body}`, color: on ? color.primary : color.text }}>Not yet</span>
              ) : (
                <>
                  <span style={{ font: `700 18px ${font.head}`, color: on ? color.primary : color.text }}>{m}</span>
                  <span style={{ font: `400 10px ${font.body}`, color: color.textTertiary }}>min / day</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {notYet ? (
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>
          {self
            ? 'No contract for now. Start one any time from your Contract tab.'
            : `No contract for now. Start one any time from ${name}'s card on your family page.`}
        </Body>
      ) : null}
      {goal != null && !self && !athlete.ownLogin ? (
        <Body size={11} tone={color.secondary} style={{ marginTop: 10 }}>
          {`${name} logs minutes from their own login. Go back to Athletes and turn on Own login.`}
        </Body>
      ) : null}
    </Card>
  );
}
