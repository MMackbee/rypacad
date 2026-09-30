import React, { useEffect, useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import Button, { Spinner } from '../components/Button';
import Field, { SelectField } from '../components/Field';
import PackageCard from '../components/PackageCard';
import { Body, Card, SectionLabel } from '../components/Primitives';
import { Toggle } from '../components/Toggle';
import { useEnrollmentForm } from '../hooks';
import { ALL_PACKAGES, SINGLE_ON_SALE, packageById } from '../data/packages';
import {
  ADULT_REQUIRED, CHILD_LOGIN_ENABLED, U13_HELPER, ageOnDate, joinNames, toEmergencyForm, validateAthleteEntry,
  validateEmergencyContact,
} from '../data/signup';
import { FacilityAddOn } from './RegistrationFacility';

/**
 * Registration's step components (Sprint 20, spec 2.1), cut out of
 * Registration.js so each file stays under 500 lines. Pure presentation over
 * the form state Registration.js owns; every validation message comes from
 * data/signup.js so the function's re-check and the form agree. The consent
 * step and its sheet live in RegistrationConsent.js, the Commitment
 * Contract step in RegistrationContract.js and the package step's facility
 * add-on in RegistrationFacility.js (same 500-line rule); all are
 * re-exported here so Registration.js imports every step from one place.
 */
export { ConsentInfoSheet, ConsentStep } from './RegistrationConsent';
export { ContractStep } from './RegistrationContract';
export { FacilityAddOn };

/** Step 1 (spec 2.1): parent or guardian, or the adult athlete signing up for themselves. */
export function WhoStep({ mode, onChange }) {
  const options = [
    ['parent', 'Parent or guardian', 'You enroll one or more athletes and manage their account.'],
    ['athlete', "I'm the athlete (18+)", 'You sign up for yourself. Under 18? A parent or guardian enrolls you.'],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {options.map(([value, title, blurb]) => {
        const on = mode === value;
        return (
          <button key={value} type="button" aria-pressed={on} aria-label={title} onClick={() => onChange(value)}
            style={{ textAlign: 'left', borderRadius: radius.cardLarge, padding: 17, cursor: 'pointer',
              border: `1px solid ${on ? color.primary : color.border}`, background: on ? tint.green : color.surface }}>
            <div style={{ font: `600 15px ${font.body}`, color: color.text }}>{title}</div>
            <Body size={12} style={{ marginTop: 5 }}>{blurb}</Body>
          </button>
        );
      })}
    </div>
  );
}

export function ContactStep({ mode, contact, onChange, showErrors }) {
  const { data } = useEnrollmentForm();
  const set = (field) => (v) => onChange((prev) => ({ ...prev, [field]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field
        label="Your name"
        value={contact.name}
        onChange={set('name')}
        error={showErrors && contact.name.trim() === '' ? 'Your name is required.' : undefined}
      />
      <Field
        label="Email"
        type="email"
        value={contact.email}
        onChange={set('email')}
        error={
          showErrors && !/^\S+@\S+\.\S+$/.test(contact.email.trim())
            ? 'A valid email is required.'
            : undefined
        }
        hint="Prefilled from your login. Change it if the family should be reached somewhere else."
      />
      <Field
        label="Mobile"
        type="tel"
        value={contact.phone}
        onChange={set('phone')}
        error={showErrors && contact.phone.trim() === '' ? 'A mobile number is required.' : undefined}
        hint="So the academy can reach you. You can change it anytime in Settings."
      />
      {mode === 'parent' ? (
        <SelectField
          label="Relationship to athlete"
          value={contact.relationship}
          options={data?.relationships ?? []}
          onChange={set('relationship')}
        />
      ) : null}
    </div>
  );
}

/**
 * Athlete step - a real add/remove LIST (Sprint 10 pin A), now with the
 * Sprint 20 fields (spec 2.1 step 3): handicap, the own-login toggle with the
 * child's email, the derived age (U13 / 13+), and the 18+ check in athlete
 * mode (with the switch back to parent mode). Emergency contact and the
 * medical note stay single, household-level fields; the contact is name,
 * mobile and relationship (owner, 2026-09-30), and `onEmergencyContact`
 * takes a partial update.
 */
export function AthleteStep({
  mode,
  linkMode = false,
  athletes,
  onUpdate,
  onAdd,
  onRemove,
  emergencyContact,
  onEmergencyContact,
  medical,
  onMedical,
  showErrors,
  todayISO,
  guardianEmail,
  onSwitchToParent,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {athletes.map((athlete, i) => {
        const age = ageOnDate(athlete.dob, todayISO);
        const errors = validateAthleteEntry(athlete, { todayISO, guardianEmail, siblings: athletes, mode });
        return (
          <Card key={athlete.key} large>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 13 }}>
              <SectionLabel style={{ flex: 1 }}>
                {mode === 'athlete' ? 'Your details' : athletes.length > 1 ? `Athlete ${i + 1}` : 'Athlete details'}
              </SectionLabel>
              {mode === 'parent' && athletes.length > 1 ? (
                <button
                  type="button"
                  onClick={() => onRemove(athlete.key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px 2px',
                    font: `500 12px ${font.body}`,
                    color: color.error,
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field
                label="Athlete name"
                value={athlete.name}
                onChange={(v) => onUpdate(athlete.key, { name: v })}
                error={showErrors && errors.name ? errors.name : undefined}
              />
              {/*
                Date of birth is required because it determines U13 vs 13+
                eligibility (and 18+ in athlete mode). The adult message shows
                WITHOUT showErrors so the switch button appears the moment a
                minor's DOB is typed.
              */}
              <Field
                label="Date of birth"
                type="date"
                value={athlete.dob}
                onChange={(v) => onUpdate(athlete.key, { dob: v })}
                error={errors.dob === ADULT_REQUIRED || showErrors ? errors.dob : undefined}
                hint={age != null && age >= 0 ? `Age ${age} · ${age < 13 ? 'U13' : '13+'}` : undefined}
              />
              {errors.dob === ADULT_REQUIRED ? (
                <Button variant="outline" height={44} onClick={onSwitchToParent} style={{ boxShadow: 'none' }}>
                  I'm a parent or guardian
                </Button>
              ) : null}
              <Field
                label="Handicap"
                type="number"
                value={athlete.handicap}
                placeholder="none yet"
                onChange={(v) => onUpdate(athlete.key, { handicap: v })}
                error={errors.handicap}
                hint="Current handicap, 0-54. Leave blank for none yet."
              />
              {mode === 'parent' && CHILD_LOGIN_ENABLED ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: `600 13px ${font.body}`, color: color.text }}>Own login?</div>
                    <Body size={11} tone={color.textTertiary}>
                      Off: your account runs {athlete.name.trim() || 'this athlete'}. On: they sign in with their own email.
                    </Body>
                  </div>
                  <Toggle checked={athlete.ownLogin} onChange={(v) => onUpdate(athlete.key, { ownLogin: v })} label="Own login?" />
                </div>
              ) : null}
              {athlete.ownLogin ? (
                <>
                  <Field
                    label="Login email"
                    type="email"
                    value={athlete.loginEmail}
                    onChange={(v) => onUpdate(athlete.key, { loginEmail: v })}
                    error={errors.loginEmail}
                  />
                  {age != null && age < 13 ? <Body size={11} tone={color.textTertiary}>{U13_HELPER}</Body> : null}
                </>
              ) : null}
            </div>
          </Card>
        );
      })}

      {mode === 'parent' ? (
        <button
          type="button"
          onClick={onAdd}
          style={{
            border: `1px dashed ${color.border}`,
            background: 'transparent',
            borderRadius: radius.card,
            padding: '15px 0',
            font: `500 13px ${font.body}`,
            color: color.primary,
            cursor: 'pointer',
          }}
        >
          + Add another athlete
        </button>
      ) : null}

      <EmergencyContactCard mode={mode} linkMode={linkMode} value={emergencyContact} onChange={onEmergencyContact} showErrors={showErrors} />

      <Card>
        <div style={CARD_HEADING}>Allergies or medical conditions</div>
        <textarea
          rows={3}
          value={medical}
          onChange={(e) => onMedical(e.target.value)}
          style={{
            width: '100%',
            height: 70,
            background: color.track,
            border: `1px solid ${color.rule}`,
            borderRadius: radius.input,
            padding: 11,
            font: `400 16px ${font.body}`, // 16px: no iOS zoom on focus
            color: color.text,
            outline: 'none',
            resize: 'none',
            boxSizing: 'border-box',
          }}
        />
        <Body size={11} tone={color.textTertiary} style={{ marginTop: 9 }}>
          Visible to on-site coaching staff during live sessions only. Not shown in admin views.
        </Body>
      </Card>
    </div>
  );
}

const CARD_HEADING = {
  font: `500 11px ${font.body}`,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: color.textSecondary,
  marginBottom: 9,
};

/** Optional as a block; name and mobile errors show only after an invalid Continue. */
function EmergencyContactCard({ mode, linkMode, value, onChange, showErrors }) {
  const ec = toEmergencyForm(value);
  const errors = showErrors ? validateEmergencyContact(ec) : {};
  const help = linkMode
    ? 'Leave blank to use the contact from your sign-up.'
    : mode === 'athlete' ? 'Someone we can call in an emergency.' : "A second adult we can call if we can't reach you.";
  return (
    <Card>
      <div style={CARD_HEADING}>Emergency contact</div>
      <Body size={11} tone={color.textTertiary}>{help}</Body>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
        <Field label="Emergency contact name" value={ec.name} onChange={(v) => onChange({ name: v })} error={errors.name} />
        <Field label="Emergency contact mobile" type="tel" value={ec.phone} onChange={(v) => onChange({ phone: v })} error={errors.phone} />
        <Field
          label={mode === 'athlete' ? 'Relationship to you' : 'Relationship to athlete'}
          value={ec.relationship}
          placeholder="e.g. Grandparent, aunt, neighbor"
          onChange={(v) => onChange({ relationship: v })}
        />
      </div>
    </Card>
  );
}

/**
 * Package pick, per athlete (Sprint 10 pin A/B: athletes[].packageId;
 * Sprint 12 pin, contract v2.0: ONE token pool, ONE package catalogue).
 * `usePackages()` is dropped — `ALL_PACKAGES` (data/packages.js) is already
 * the static catalogue seam both data modes build against (its own header
 * comment: "both data modes call it"), so there is nothing left for a
 * seed/live hook to wrap. Renders the four token packages (t-6…t-16) plus
 * Elite, which REPLACES a token pick rather than stacking — same one-of-N
 * rule PackageStep (below) uses. The contract tier (20/45/90, spec 9) moved
 * to its own step, ContractStep (owner feedback 2026-09-30): under these
 * tabs it often landed on the wrong child.
 *
 * Until one-time checkout ships (SINGLE_ON_SALE), the single token card is
 * shown greyed out and cannot be picked: a family on it could never pay.
 */
const SINGLE_OFF_SALE_NOTE = 'On sale before booking opens Sat, Oct 10. Pick a monthly package now, or come back then.';

/** What a token is and that it does not carry over (tokens-and-billing-contract.md), before the parent picks 6, 12 or 16. */
const TOKEN_EXPLAINER = "1 token = 1 session: a training block, a tournament, or a session with Phil or Yannick. Tokens refresh on the 1st of each month; unused tokens don't carry over. Elite is unlimited.";

/** Still needs a pick: none yet, one no longer in the catalogue, or the single token before it is on sale. */
function needsPackage(athlete) {
  const pkg = athlete.packageId == null ? null : packageById(athlete.packageId);
  return !pkg || (pkg.kind === 'single' && !SINGLE_ON_SALE);
}

export function PackageStep({ athletes, onUpdate, showErrors }) {
  const [activeKey, setActiveKey] = useState(athletes[0]?.key);
  const active = athletes.find((a) => a.key === activeKey) ?? athletes[0];
  const missing = athletes.filter(needsPackage);
  const firstMissing = missing[0]?.key;
  // An invalid Continue opens the first athlete still without a package, so
  // the cards on screen are the ones that need the tap (UX review 2026-09-30:
  // Continue looked dead while child 2 had nothing picked).
  useEffect(() => {
    if (showErrors && firstMissing != null) setActiveKey(firstMissing);
    // Only when showErrors turns on; after that, the chips and Next move the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showErrors]);
  if (!active) return null;

  const label = (a) => a.name.trim() || `Athlete ${athletes.indexOf(a) + 1}`;
  // A pick stays on screen, box and dot lit together (tester S4, 2026-09-30):
  // jumping to the next athlete on the tap showed their empty cards instead,
  // so the pick looked like it never took. Next moves on when they are ready.
  const pick = (id) => onUpdate(active.key, { packageId: id });
  const at = athletes.indexOf(active);
  const nextUp = needsPackage(active)
    ? null
    : [...athletes.slice(at + 1), ...athletes.slice(0, at)].find(needsPackage) ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {athletes.length > 1 ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {athletes.map((a, i) => {
            const on = a.key === active.key;
            const done = !needsPackage(a);
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => setActiveKey(a.key)}
                style={{
                  height: 34,
                  padding: '0 14px',
                  borderRadius: radius.pill,
                  border: `1px solid ${on ? color.primary : color.border}`,
                  background: on ? color.primary : 'transparent',
                  font: `${on ? 600 : 500} 12px ${font.body}`,
                  color: on ? '#000' : done ? color.text : color.textTertiary,
                  cursor: 'pointer',
                }}
              >
                {a.name.trim() || `Athlete ${i + 1}`}
                {done ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
      ) : null}

      <SectionLabel>Package{active.name.trim() ? ` — ${active.name.trim()}` : ''}</SectionLabel>
      <Body size={12} style={{ marginTop: -6 }}>{TOKEN_EXPLAINER}</Body>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: -6 }}>
        {ALL_PACKAGES.map((p) => {
          const offSale = p.kind === 'single' && !SINGLE_ON_SALE;
          return (
            <PackageCard
              key={p.id}
              pkg={p}
              selected={!offSale && active.packageId === p.id}
              onSelect={offSale ? undefined : () => pick(p.id)}
              footnote={offSale ? SINGLE_OFF_SALE_NOTE : undefined}
            />
          );
        })}
      </div>
      {/* The facility add-on, under the cards (owner 2026-09-30). */}
      <FacilityAddOn athlete={active} name={label(active)} onUpdate={onUpdate} />

      {nextUp ? (
        <Button variant="outline" height={46} onClick={() => setActiveKey(nextUp.key)} style={{ boxShadow: 'none' }}>
          {`Next: ${label(nextUp)}`}
        </Button>
      ) : null}

      {showErrors && missing.length ? (
        <div data-field-error>
          <Body size={12} tone={color.error}>
            {athletes.length > 1
              ? `Pick a package for ${joinNames(missing.map(label))}${missing.length < athletes.length ? ' too' : ''} - tap their name above.`
              : `Pick a package for ${active.name.trim() || 'this athlete'} to continue.`}
          </Body>
        </div>
      ) : null}
    </div>
  );
}

export function SubmittingOverlay({ mode = 'signup' }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: tint.overlay,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <Card
        large
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          textAlign: 'center',
        }}
      >
        <Spinner size={26} track={color.rule} head={color.primary} />
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>
          {mode === 'link' ? 'Adding to your family' : 'Creating the account'}
        </div>
        <Body size={11}>
          Do not close this. Your family and consents are written together in one step.
        </Body>
      </Card>
    </div>
  );
}
