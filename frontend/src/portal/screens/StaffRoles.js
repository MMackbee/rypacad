import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import AthleteRow from '../components/AthleteRow';
import Button from '../components/Button';
import Field from '../components/Field';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { BackLink, Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useStaff } from '../hooks';

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
 */
export default function StaffRoles({ variant = 'populated', bare = false, onBack }) {
  const { data } = useStaff({ variant });

  if (variant === 'add') return <AddStaff bare={bare} roles={data?.roles ?? []} note={data?.screeningNote} onBack={onBack} />;

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
          <StatusBadge tone="neutral">{staff.length} accounts</StatusBadge>
        </div>
      }
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

        <button
          type="button"
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

function AddStaff({ bare, roles, note, onBack }) {
  const [role, setRole] = useState(null);

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
          <Button disabled={!role}>Send invite</Button>
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Name" value="" placeholder="Full name" onChange={() => {}} />
        <Field label="Work email" type="email" value="" placeholder="name@rypgolf.com" onChange={() => {}} />

        <SectionLabel style={{ marginTop: 4 }}>Role</SectionLabel>
        {roles.map((r) => (
          <RoleCard key={r.id} role={r} selected={role === r.id} onSelect={() => setRole(r.id)} />
        ))}

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
