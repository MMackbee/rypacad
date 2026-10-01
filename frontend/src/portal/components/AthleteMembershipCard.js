import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import { useAssignPackages, useHouseholdSettings, useIssueTokens } from '../hooks';
import { useHouseholdFacility } from '../hooks/billing';
import Button from './Button';
import { Toggle } from './Toggle';
import Field, { SelectField } from './Field';
import NumericField from './NumericField';
import SavedToast from './SavedToast';
import Segmented from './Segmented';
import { Body, Card, SectionLabel } from './Primitives';
import { ALL_PACKAGES, FACILITY_ACCESS, packageById, periodFor } from '../data/packages';
import { addDaysISO, todayISO } from '../data/calendar';
import { facilitySourceLabel, householdFacility } from '../data/facility';

/**
 * AthleteDetail's staff-side Membership card (Sprint 12 pin, TEAM.md
 * "Sprint 12 pins — the token model", contract v2.0). Rewritten from the
 * Sprint 11 two-select (golf + fitness) editor: ONE package select spanning
 * the whole catalogue (t-6 … t-16, elite, single — `ALL_PACKAGES` from
 * data/packages.js, names + price with "pending" when the catalogue flags
 * it), plus a period-anchor-day control (1-28) that calls
 * useHouseholdSettings().setPeriodAnchorDay. Save -> useAssignPackages().
 * assign(athleteId, { packageId }) — one field now, not two.
 *
 * ops/owner get the editor; coach/mental see the identical facts read-only;
 * parent/athlete see nothing here (their own view is screens/Membership.js).
 *
 * The period anchor control writes through useHouseholdSettings(householdId)
 * (routing lane; wired at Sprint 12 integration). The household and its
 * current anchor arrive on the athlete-detail payload (householdId,
 * periodAnchorDay), which is why the card needs no household hook of its own.
 *
 * Sprint 13 (contract v2.1, pin C/H): two more ops/owner-only controls below
 * the anchor rule. "Issue tokens" (the cash/comp case, pin C) - period select
 * (this period / next, derived client-side via periodFor(today, anchorDay)
 * off the athlete's own periodAnchorDay, since useAthleteDetail's payload
 * carries no periodKey/nextPeriod field of its own), granted prefilled from
 * the assigned package's `tokens`. Hidden for Elite (tokens: null - contract
 * §C: "Elite athletes get no doc"). Issues through useIssueTokens() (routing
 * lane; wired at Sprint 13 integration). The household's Stripe customer/subscription id fields (pin H)
 * save through useHouseholdSettings(householdId).setStripeIds(...) - an
 * EXISTING hook gaining a method, coded directly per the same lesson's other
 * half, same as setPeriodAnchorDay above.
 */

const PACKAGE_SELECT_OPTIONS = ALL_PACKAGES.map((p) => ({
  value: p.id,
  label: `${p.name} — $${p.price}${p.pending ? ' (pending)' : ''}`,
}));

export default function AthleteMembershipCard({ athleteId, athlete, role }) {
  const canEdit = role === 'ops' || role === 'owner';
  const canView = canEdit || role === 'coach' || role === 'mental';
  // Facility access is the FAMILY's (owner ruling 2026-09-30): one add-on or
  // a live Elite membership covers every athlete in the household, so the
  // card reads the household and names the source. Where the household did
  // not load (a coach cannot list one) the athlete's own record still
  // answers: its flag, or its own paid Elite membership - never a sibling's.
  const household = useHouseholdFacility(canView ? athlete?.householdId ?? null : null);
  if (!canView) return null;
  const own = { id: athleteId, packageId: athlete?.packageId, billing: { status: athlete?.billingStatus }, facilityAccess: athlete?.facilityAccess === true };
  const family = household.data?.access ? household.data : householdFacility([own]);
  const familyFacility = family.access ? `Yes - ${facilitySourceLabel(family)}` : 'No';

  const currentPackageId = athlete?.packageId ?? null;

  if (!canEdit) {
    const packageName = ALL_PACKAGES.find((p) => p.id === currentPackageId)?.name ?? '—';
    return (
      <Card large>
        <SectionLabel style={{ marginBottom: 12 }}>Membership</SectionLabel>
        <ReadOnlyRow label="Package" value={packageName} />
        <ReadOnlyRow label="Facility access" value={familyFacility} style={{ marginTop: 8 }} />
      </Card>
    );
  }

  return (
    <>
      <MembershipEditor
        athleteId={athleteId}
        currentPackageId={currentPackageId}
        householdId={athlete?.householdId ?? null}
        initialAnchorDay={athlete?.periodAnchorDay ?? 1}
        initialFacilityAccess={Boolean(athlete?.facilityAccess)}
        hasConsent={Boolean(athlete?.facilityAccessConsent)}
        familyFacility={familyFacility}
      />
      {athlete?.householdId ? <HouseholdBillingLink householdId={athlete.householdId} /> : null}
    </>
  );
}

/**
 * Sprint 17 (contract v2.5): the staff view of the household's Billing hub -
 * tokens left per athlete and the Stripe standing, exactly what the parent
 * sees. Same green-link row idiom as the Settings rows.
 */
function HouseholdBillingLink({ householdId }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/portal/admin/households/${householdId}`)}
      style={{
        background: 'none',
        border: 'none',
        padding: '10px 2px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        font: `500 13px ${font.body}`,
        color: color.primary,
        cursor: 'pointer',
      }}
    >
      <span>View household billing — tokens left, standing</span>
      <span aria-hidden="true" style={{ color: color.textTertiary }}>
        ›
      </span>
    </button>
  );
}

function ReadOnlyRow({ label, value, style }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, ...style }}>
      <span style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>{label}</span>
      <span style={{ font: `600 13px ${font.body}`, color: color.text }}>{value}</span>
    </div>
  );
}

function MembershipEditor({ athleteId, currentPackageId, householdId, initialAnchorDay, initialFacilityAccess = false, hasConsent = false, familyFacility = 'No' }) {
  const [packageId, setPackageId] = useState(currentPackageId ?? '');
  // v2.0.1 (Sprint 18): the $300 facility-access add-on, switchable only
  // once the signed waiver is on the athlete (rules enforce the same).
  const [facilityAccess, setFacilityAccess] = useState(Boolean(initialFacilityAccess));
  React.useEffect(() => {
    setFacilityAccess(Boolean(initialFacilityAccess));
  }, [initialFacilityAccess]);
  // The athlete record loads after mount, so the select follows the loaded
  // value once it arrives - and after a save, when the bump refetches it (a
  // no-op then, since it already matches what was just chosen).
  React.useEffect(() => {
    setPackageId(currentPackageId ?? '');
  }, [currentPackageId]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const savedTimer = React.useRef(null);
  React.useEffect(() => () => savedTimer.current && clearTimeout(savedTimer.current), []);

  const assignState = useAssignPackages();
  const dirty = packageId !== (currentPackageId ?? '') || facilityAccess !== Boolean(initialFacilityAccess);

  const handleSave = async () => {
    if (!packageId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await assignState.assign(athleteId, { packageId, facilityAccess });
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The membership could not be saved. Try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>Membership</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <SelectField label="Package" value={packageId} options={PACKAGE_SELECT_OPTIONS} onChange={setPackageId} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `600 13px ${font.body}`, color: color.text }}>Facility access</div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
              {hasConsent
                ? `+$${FACILITY_ACCESS.price} / month · waiver on file`
                : 'Needs the signed facility-access waiver (enrollment consent) before it can be switched on'}
            </div>
          </div>
          {hasConsent ? (
            <Toggle checked={facilityAccess} onChange={setFacilityAccess} label="Facility access" />
          ) : (
            <span style={{ font: `500 12px ${font.body}`, color: color.textTertiary }}>{facilityAccess ? 'On' : 'Off'}</span>
          )}
        </div>
        {/* What the household has - the switch above is this athlete's own record. */}
        <ReadOnlyRow label="Family facility access" value={familyFacility} />
      </div>

      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 12 }}>
          {error}
        </Body>
      ) : null}

      {saved ? <SavedToast message="Membership saved" style={{ marginTop: 13 }} /> : null}

      <Button
        height={46}
        disabled={!packageId || !dirty}
        loading={saving}
        onClick={handleSave}
        style={{ marginTop: 13 }}
      >
        {saving ? 'Saving' : 'Save membership'}
      </Button>

      <div style={{ height: 1, background: color.rule, margin: '16px 0' }} />

      <PeriodAnchorEditor householdId={householdId} initialAnchorDay={initialAnchorDay} />

      <div style={{ height: 1, background: color.rule, margin: '16px 0' }} />

      <IssueTokensEditor
        athleteId={athleteId}
        packageId={currentPackageId}
        anchorDay={initialAnchorDay}
      />

      <div style={{ height: 1, background: color.rule, margin: '16px 0' }} />

      <StripeIdsEditor householdId={householdId} />
    </Card>
  );
}

/**
 * "Issue tokens" (Sprint 13 pin C) — the cash/comp case: ops writes a
 * `tokenPeriods` doc directly rather than waiting on Stripe. Period select
 * defaults to the CURRENT period; granted defaults to the assigned
 * package's own token count, editable (a comp grant may differ from the
 * catalogue). Elite has no tokenPeriods doc (unlimited already), so this
 * control does not render for it.
 */
function IssueTokensEditor({ athleteId, packageId, anchorDay }) {
  const pkg = packageById(packageId);
  const today = todayISO();
  const thisPeriod = periodFor(today, anchorDay);
  const nextPeriod = periodFor(addDaysISO(thisPeriod.periodEnd, 1), anchorDay);
  const [periodChoice, setPeriodChoice] = useState('this');
  const periodKey = periodChoice === 'this' ? thisPeriod.periodKey : nextPeriod.periodKey;

  const [granted, setGranted] = useState(pkg?.tokens ?? 0);
  React.useEffect(() => {
    setGranted(pkg?.tokens ?? 0);
  }, [packageId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [issuing, setIssuing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const issueState = useIssueTokens();

  if (!pkg || pkg.tokens === null) return null;

  const handleIssue = async () => {
    setIssuing(true);
    setError(null);
    setSaved(false);
    try {
      await issueState.issue(athleteId, periodKey, granted);
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'Tokens could not be issued. Try again.'
      );
    } finally {
      setIssuing(false);
    }
  };

  return (
    <div>
      <SectionLabel style={{ marginBottom: 10 }}>Issue tokens</SectionLabel>
      <Body size={11} tone={color.textTertiary} style={{ marginBottom: 10 }}>
        Writes a token grant directly — the cash/comp path, alongside Stripe's own
        invoice.paid issuance.
      </Body>
      <Segmented
        value={periodChoice}
        onChange={setPeriodChoice}
        options={[
          ['this', `This period · ${thisPeriod.periodKey}`],
          ['next', `Next period · ${nextPeriod.periodKey}`],
        ]}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <NumericField label="Granted" value={granted} onChange={(v) => setGranted(Math.max(0, Number(v) || 0))} />
        </div>
        <Button height={44} loading={issuing} onClick={handleIssue} style={{ flex: 'none', width: 120 }}>
          {issuing ? 'Issuing' : 'Issue'}
        </Button>
      </div>
      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 11 }}>
          {error}
        </Body>
      ) : null}
      {saved ? <SavedToast message="Tokens issued" style={{ marginTop: 11 }} /> : null}
    </div>
  );
}

/**
 * Household Stripe customer/subscription id (Sprint 13 pin H) — how a
 * webhook resolves an event to a household (`where stripeCustomerId ==
 * event.data.object.customer`). No prefill source exists yet (the
 * athlete-detail payload carries no stripeCustomerId/stripeSubscriptionId
 * field) — blank renders as visibly unset rather than a fabricated value,
 * per the team's own "unset values render as visibly unset" rule.
 */
function StripeIdsEditor({ householdId }) {
  const [stripeCustomerId, setStripeCustomerId] = useState('');
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState('');
  const settings = useHouseholdSettings(householdId);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaved(false);
    setError(null);
    try {
      await settings.setStripeIds({ stripeCustomerId: stripeCustomerId || null, stripeSubscriptionId: stripeSubscriptionId || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The Stripe ids could not be saved. Try again.'
      );
    }
  };

  return (
    <div>
      <SectionLabel style={{ marginBottom: 10 }}>Stripe (household)</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Field label="Stripe customer id" value={stripeCustomerId} placeholder="cus_…" onChange={setStripeCustomerId} />
        <Field
          label="Stripe subscription id"
          value={stripeSubscriptionId}
          placeholder="sub_…"
          onChange={setStripeSubscriptionId}
        />
      </div>
      <Button
        height={44}
        disabled={!householdId || (!stripeCustomerId && !stripeSubscriptionId)}
        loading={settings.saving}
        onClick={handleSave}
        style={{ marginTop: 12 }}
      >
        {settings.saving ? 'Saving' : 'Save Stripe ids'}
      </Button>
      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 11 }}>
          {error}
        </Body>
      ) : null}
      {saved ? <SavedToast message="Stripe ids saved" style={{ marginTop: 11 }} /> : null}
    </div>
  );
}

/**
 * Period anchor day (1-28) — the household's token-period start (contract
 * v2.0 pin B), written through useHouseholdSettings(householdId).
 */
function PeriodAnchorEditor({ householdId, initialAnchorDay }) {
  const [anchorDay, setAnchorDay] = useState(initialAnchorDay);
  // The athlete record (and its household's anchor) loads after mount.
  React.useEffect(() => {
    setAnchorDay(initialAnchorDay);
  }, [initialAnchorDay]);
  const settings = useHouseholdSettings(householdId);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const dirty = anchorDay !== initialAnchorDay;

  const handleSave = async () => {
    setSaved(false);
    setError(null);
    try {
      await settings.setPeriodAnchorDay(anchorDay);
      setSaved(true);
      setTimeout(() => setSaved(false), 2600);
    } catch (err) {
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The anchor day could not be saved. Try again.'
      );
    }
  };

  return (
    <div>
      <SectionLabel style={{ marginBottom: 10 }}>Period anchor</SectionLabel>
      <Body size={11} tone={color.textTertiary} style={{ marginBottom: 10 }}>
        Day of the month the household's token period starts and tokens expire (1-28).
      </Body>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <NumericField
            label="Anchor day"
            value={anchorDay}
            unit="1-28"
            onChange={(v) => setAnchorDay(Math.min(28, Math.max(1, Number(v) || 1)))}
          />
        </div>
        <Button
          height={44}
          disabled={!dirty || !householdId}
          loading={settings.saving}
          onClick={handleSave}
          style={{ flex: 'none', width: 120 }}
        >
          {settings.saving ? 'Saving' : 'Save'}
        </Button>
      </div>
      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 11 }}>
          {error}
        </Body>
      ) : null}
      {saved ? <SavedToast message="Anchor day saved" style={{ marginTop: 11 }} /> : null}
    </div>
  );
}
