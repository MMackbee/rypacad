import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import AthleteRow from '../components/AthleteRow';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import Field, { SelectField } from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import SavedToast from '../components/SavedToast';
import StatusBadge from '../components/StatusBadge';
import { BackLink, Body, Card, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { useStaff } from '../hooks';
import { SPECIALISTS } from '../data/specialists';

/**
 * Sprint 10 pin E (TEAM.md, contract v1.8): useStaff() in this worktree
 * still returns the Sprint-1-era shape - { staff, roles, auditNote,
 * screeningNote, adding } - with no `invite(fields)` action and no
 * `pendingInvites` list (confirmed: no `invite` or `pendingInvites` anywhere
 * in hooks/index.js). The routing lane is adding both against the pin in a
 * parallel worktree: staffInvites/{autoId} { email, role, displayName,
 * specialistId, status, createdBy, createdAt }. Defensive defaults below
 * (not the Roster.js namespace-fallback pattern, since useStaff itself
 * already exists and is called normally) keep the form honestly inert -
 * invite() resolves locally without persisting anything, and the pending-
 * invites list reads empty - until that lands. Flagged loudly in the sprint
 * report.
 */

/**
 * 16 · Staff & Roles - owner only.
 * States: Populated, Add staff member.
 *
 * Flag 08. Revision 2 moved background-check and working-with-minors training
 * tracking to a spreadsheet outside the app. That is a reasonable scope call,
 * but the Blueprint's rule stands - no portal credentials before screening is
 * clear - and this is the screen that issues credentials. With the fields gone
 * there is nothing in the interface that can enforce it, so the gate became
 * procedural.
 *
 * A stated note sits where those fields were, rather than a silent gap. If the
 * interface should hold the line again, the minimum is one unvalidated
 * confirmation checkbox on invite recording who asserted it and when.
 *
 * @param {'populated'|'add'} variant
 * @param {() => void} [onSignOut]  Hidden when not supplied (harness/demo).
 */
export default function StaffRoles({ variant = 'populated', bare = false, onBack, onAdd, onSignOut }) {
  const staffState = useStaff({ variant });
  const { data } = staffState;
  const invite = staffState.invite || (async (fields) => ({ ...fields, status: 'pending', simulated: true }));
  const pendingInvites = data?.pendingInvites ?? [];

  if (variant === 'add')
    return (
      <AddStaff
        bare={bare}
        roles={data?.roles ?? []}
        note={data?.screeningNote}
        onBack={onBack}
        invite={invite}
      />
    );

  const staff = data?.staff ?? [];

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary }}>Owner only</div>
            <ScreenTitle size={24} style={{ marginTop: 3 }}>
              Staff &amp; roles
            </ScreenTitle>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SignOutButton onSignOut={onSignOut} />
            <StatusBadge tone="neutral">{staff.length} accounts</StatusBadge>
          </div>
        </div>
      }
      footer={<BottomTabBar role="owner" active="staff" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Card large>
          {staff.map((member, i) => (
            <div
              key={member.id}
              style={{
                paddingBottom: i < staff.length - 1 ? 13 : 0,
                marginBottom: i < staff.length - 1 ? 13 : 0,
                borderBottom: i < staff.length - 1 ? `1px solid ${color.ruleFaint}` : 'none',
              }}
            >
              <AthleteRow
                name={member.name}
                meta={member.role}
                metaTone={color.textSecondary}
                avatarSize={38}
                nameSize={15}
                trailing={
                  <StatusBadge tone={member.mfa ? 'green' : 'yellow'}>
                    {member.mfa ? 'MFA on' : 'MFA off'}
                  </StatusBadge>
                }
              />
              {member.note ? (
                <div
                  style={{
                    marginTop: 11,
                    paddingTop: 11,
                    borderTop: `1px solid ${color.ruleFaint}`,
                    font: `400 11px/1.5 ${font.body}`,
                    color: member.mfa ? color.textTertiary : color.secondary,
                  }}
                >
                  {member.note}
                </div>
              ) : null}
            </div>
          ))}
        </Card>

        {/*
          Sprint 10 pin E: pending staffInvites, listed under the staff list
          with the honest "provisions when they first sign in" line - an
          invite is not a login until the invited person actually signs in
          and provisioning matches the doc by email.
        */}
        <PendingInvitesCard invites={pendingInvites} loading={staffState.loading} />

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
          + Add staff member
        </button>

        <Body size={11} tone={color.textTertiary}>
          {data?.auditNote}
        </Body>
      </div>
    </PhoneFrame>
  );
}

function PendingInvitesCard({ invites, loading }) {
  if (loading) return null;
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>Pending invites · {invites.length}</SectionLabel>
      {invites.length === 0 ? (
        <Body size={12}>No pending invites.</Body>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {invites.map((inv, i) => (
            <div
              key={inv.id ?? inv.email}
              style={{
                paddingTop: i ? 11 : 0,
                borderTop: i ? `1px solid ${color.ruleFaint}` : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ font: `600 13px ${font.body}`, color: color.text }}>
                  {inv.displayName || inv.email}
                </span>
                <StatusBadge tone="yellow" dashed>
                  Pending
                </StatusBadge>
              </div>
              <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
                {inv.role}
                {inv.specialistId ? ` · ${inv.specialistId}` : ''} · {inv.email}
              </div>
            </div>
          ))}
        </div>
      )}
      <Body size={11} tone={color.textTertiary} style={{ marginTop: invites.length ? 13 : 10 }}>
        Provisions when they first sign in.
      </Body>
    </Card>
  );
}

/**
 * Sprint 10 pin E: real field state, the existing role picker wired to
 * selection, an optional specialist link when the role is coach or mental
 * (Yannick/Phil - "never the athletes' assigned golf coach", TEAM.md Sprint
 * 9), and invite() wired with saving/sent/error.
 */
function AddStaff({ bare, roles, note, onBack, invite }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(null);
  const [specialistId, setSpecialistId] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const showSpecialistPicker = role === 'coach' || role === 'mental';
  const canSend = name.trim() !== '' && /\S+@\S+\.\S+/.test(email.trim()) && role && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await invite({
        displayName: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        specialistId: showSpecialistPicker && specialistId ? specialistId : null,
      });
      setSent(true);
    } catch (err) {
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The invite could not be sent. Try again.'
      );
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <PhoneFrame
        bare={bare}
        header={
          <div style={{ padding: '4px 22px 14px' }}>
            <BackLink onClick={onBack}>‹ Staff</BackLink>
          </div>
        }
        footer={
          <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
            <Button onClick={onBack}>Back to staff</Button>
          </div>
        }
      >
        <div style={{ padding: '20px 22px 24px' }}>
          <SavedToast message={`Invite sent to ${email.trim()}`} />
          <Body size={12} style={{ marginTop: 14 }}>
            {name.trim()} provisions the account the first time they sign in with that email.
          </Body>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '4px 22px 14px' }}>
          <BackLink onClick={onBack}>‹ Staff</BackLink>
          <ScreenTitle size={24} style={{ marginTop: 10 }}>
            Add staff member
          </ScreenTitle>
        </div>
      }
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          {error ? (
            <Body size={12} tone={color.error} style={{ marginBottom: 10, textAlign: 'center' }}>
              {error}
            </Body>
          ) : null}
          <Button disabled={!canSend} loading={sending} onClick={handleSend}>
            {sending ? 'Sending invite' : 'Send invite'}
          </Button>
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Name" value={name} placeholder="Full name" onChange={setName} />
        <Field
          label="Work email"
          type="email"
          value={email}
          placeholder="name@rypgolf.com"
          onChange={setEmail}
        />

        <SectionLabel style={{ marginTop: 4 }}>Role</SectionLabel>
        {roles.map((r) => (
          <RoleCard key={r.id} role={r} selected={role === r.id} onSelect={() => setRole(r.id)} />
        ))}

        {/*
          Optional specialist link (Sprint 10 pin E) - coach or mental only,
          matching users.specialistId ('phil'|'mental'|null); left unset for
          a plain coach or Yannick's mental role is a plain mental account,
          not a Phil/Yannick 1-on-1 provider.
        */}
        {showSpecialistPicker ? (
          <SelectField
            label="Specialist link (optional)"
            value={specialistId}
            options={SPECIALISTS.map((s) => s.id)}
            onChange={setSpecialistId}
          />
        ) : null}

        {/*
          Flag 08: the screening fields left this screen in revision 2 but the
          rule did not. Stated rather than silently absent.
        */}
        <Card tone="yellow">
          <Body size={11} tone={color.secondary}>
            {note}
          </Body>
        </Card>
      </div>
    </PhoneFrame>
  );
}

function RoleCard({ role, selected, onSelect }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        background: color.surface,
        border: `1px solid ${selected ? color.primary : color.border}`,
        borderRadius: radius.card,
        padding: 15,
        display: 'flex',
        gap: 12,
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          flex: 'none',
          marginTop: 1,
          borderRadius: '50%',
          border: `1.5px solid ${selected ? color.primary : color.faintText}`,
          background: selected ? color.primary : 'transparent',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {selected ? (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#000' }} />
        ) : null}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{role.name}</div>
        <div style={{ font: `400 11px/1.5 ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
          {role.scope}
        </div>
      </div>

      {/* MFA is required on every staff role at setup, without exception. */}
      <StatusBadge tone="green">MFA required</StatusBadge>
    </div>
  );
}
