import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { color, font } from '../tokens';
import * as hooks from '../hooks';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import { Banner, Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import useAuthSession from '../hooks/useAuthSession';
import { BrandHeader } from './SignIn';

/**
 * Sprint 10 pin A (TEAM.md, contract v1.8 §A): see Registration.js's own
 * doc comment for the full fallback rationale - useEnrollment() does not
 * exist anywhere in this worktree's hooks/index.js yet. Shared shape here:
 * { data: { status: 'none'|'pending'|'declined'|'approved', request } |
 * null, loading, error, submit(request) }.
 */
function useEnrollmentFallback() {
  return {
    data: { status: 'none', request: null },
    loading: false,
    error: null,
    submit: async (request) => ({ ...request, status: 'pending', simulated: true }),
  };
}
const useEnrollment = hooks.useEnrollment || useEnrollmentFallback;

/**
 * Not provisioned - signed in, no portal role.
 *
 * The honest state for a Google account that authenticated but has no users/
 * doc (TEAM.md, Sprint 4 pins: `provisioned: false`). The routing lane's guard
 * redirects here.
 *
 * Sprint 10 pin A: this screen is now the real dead-end fix, not just a
 * polite wall. It reads useEnrollment() and shows the request's real state -
 * `none` gets a "start enrollment" CTA into Registration; `pending` shows
 * exactly what was submitted under "under review"; `declined` shows the
 * reason plus a real resubmit action (sets status back to pending - the
 * pinned rules only allow a submitter to edit their OWN pending request, so
 * a true field-level edit-before-resubmit needs Registration pre-filled from
 * the declined request, which is flagged as an open question in the sprint
 * report; the resubmit action itself is real and always available here).
 * Sign-out remains available in every state.
 *
 * Same real/demo split as SignIn: a `variant` prop (review harness) renders
 * a fixed demo state and never reads the live auth/enrollment seam; without
 * it the screen runs on useAuthSession() + useEnrollment().
 *
 * @param {'none'|'pending'|'declined'} [variant] Demo state; omit to run on
 *   the real seam. (Legacy 'default' still maps to 'none'.)
 * @param {() => void} [onStartEnrollment]  'none' state only - navigates to
 *   /portal/register. Hidden (falls back to a disabled-looking note) without
 *   it, per the optional-affordance convention.
 */
export default function NotProvisioned({ variant, ...rest }) {
  if (variant != null) return <DemoNotProvisioned variant={variant} {...rest} />;
  return <LiveNotProvisioned {...rest} />;
}

function LiveNotProvisioned({ bare = false, onStartEnrollment }) {
  const { user, signOut } = useAuthSession();
  const enrollment = useEnrollment();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/portal/signin', { replace: true });
    } catch (e) {
      // Still signed in - re-enable the button rather than stranding it.
      setSigningOut(false);
    }
  };

  return (
    <NotProvisionedBody
      bare={bare}
      email={user?.email ?? null}
      status={enrollment.loading ? null : enrollment.data?.status ?? 'none'}
      request={enrollment.data?.request ?? null}
      submit={enrollment.submit}
      onStartEnrollment={onStartEnrollment}
      onSignOut={handleSignOut}
      signingOut={signingOut}
    />
  );
}

/** Harness states: the demo guardian persona (same address SignIn seeds). */
const DEMO_REQUEST = {
  guardian: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148' },
  athletes: [{ name: 'Jordan Whitfield', dob: '2013-06-02' }],
  declineReason: 'The athlete ID on the guardian contact card did not match our roster — front desk is following up.',
  createdAt: null,
};

function DemoNotProvisioned({ bare = false, variant = 'none' }) {
  const status = variant === 'default' ? 'none' : variant;
  return (
    <NotProvisionedBody
      bare={bare}
      email="dana@email.com"
      status={status}
      request={status === 'none' ? null : DEMO_REQUEST}
      submit={async () => {}}
      onStartEnrollment={() => {}}
      onSignOut={() => {}}
      signingOut={false}
    />
  );
}

function NotProvisionedBody({
  bare,
  email,
  status,
  request,
  submit,
  onStartEnrollment,
  onSignOut,
  signingOut,
}) {
  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandHeader />

        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <ScreenTitle size={22} style={{ marginBottom: 10 }}>
            {status === 'pending'
              ? 'Enrollment under review'
              : status === 'declined'
              ? 'Enrollment not approved'
              : 'Account not linked yet'}
          </ScreenTitle>
          <Body size={13}>
            {status === 'pending'
              ? "Your Google account is signed in. Phil reviews new enrollments within one business day - you'll get an email when the account is active."
              : status === 'declined'
              ? "Your Google account is signed in, but the enrollment below wasn't approved as submitted."
              : "Your Google account is signed in, but it isn't linked to an academy family or staff role yet."}
          </Body>
        </div>

        <Card style={{ marginBottom: 14 }}>
          <SectionLabel style={{ marginBottom: 7 }}>Signed in as</SectionLabel>
          {/* Seam data can be null on first render - unset shows as unset. */}
          <div style={{ font: `500 14px ${font.body}`, color: email ? color.text : color.mutedText }}>
            {email ?? '—'}
          </div>
        </Card>

        {status == null ? (
          <Card>
            <Body size={12}>Checking your enrollment status…</Body>
          </Card>
        ) : status === 'none' ? (
          <NoneState onStartEnrollment={onStartEnrollment} />
        ) : status === 'pending' ? (
          <PendingState request={request} />
        ) : status === 'declined' ? (
          <DeclinedState request={request} submit={submit} />
        ) : (
          <Banner tone="green" title="Approved">
            Your enrollment was approved. Sign out and sign back in to pick it up.
          </Banner>
        )}

        <div style={{ flex: 1, minHeight: 24 }} />

        <Button variant="outline" disabled={signingOut} onClick={onSignOut} style={{ flex: 'none' }}>
          {signingOut ? 'Signing out' : 'Sign out'}
        </Button>
      </div>
    </PhoneFrame>
  );
}

function NoneState({ onStartEnrollment }) {
  return (
    <>
      <Banner tone="neutral" title="No enrollment on file">
        New family? Start enrollment below. Already part of the academy? The front desk can link
        your account instead.
      </Banner>
      {onStartEnrollment ? (
        <Button onClick={onStartEnrollment} style={{ marginTop: 14 }}>
          Start enrollment
        </Button>
      ) : null}
    </>
  );
}

/** What was submitted, read back plainly - the pending state's whole job. */
function PendingState({ request }) {
  const athletes = request?.athletes ?? [];
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 10 }}>What you submitted</SectionLabel>
      <div style={{ font: `600 14px ${font.body}`, color: color.text }}>
        {request?.guardian?.name ?? '—'}
      </div>
      <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
        {request?.guardian?.email ?? '—'}
      </div>
      <div style={{ borderTop: `1px solid ${color.rule}`, marginTop: 12, paddingTop: 12 }}>
        {athletes.length === 0 ? (
          <Body size={12}>No athletes listed.</Body>
        ) : (
          athletes.map((a) => (
            <div key={a.name} style={{ font: `400 13px ${font.body}`, color: color.textSecondary }}>
              {a.name}
              {a.dob ? ` · born ${a.dob}` : ''}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

/**
 * Declined: the reason, then a real resubmit (contract v1.8 §A: "sets status
 * back to pending"). Resubmits the SAME request content unchanged - a true
 * edit-then-resubmit needs Registration pre-filled from the declined
 * request, flagged as an open question in the sprint report.
 */
function DeclinedState({ request, submit }) {
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleResubmit = async () => {
    setResubmitting(true);
    setError(null);
    try {
      await submit(request);
      setResubmitted(true);
    } catch (err) {
      setError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'The request could not be resubmitted. Try again.'
      );
    } finally {
      setResubmitting(false);
    }
  };

  if (resubmitted) {
    return (
      <Banner tone="green" title="Back under review">
        Your enrollment was resubmitted and is back under review.
      </Banner>
    );
  }

  return (
    <Card tone="red" large>
      <SectionLabel tone={color.error} style={{ marginBottom: 8 }}>
        Reason
      </SectionLabel>
      <Body size={12}>{request?.declineReason || 'No reason was recorded.'}</Body>
      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
          {error}
        </Body>
      ) : null}
      <Button
        variant="outline"
        height={46}
        loading={resubmitting}
        onClick={handleResubmit}
        style={{ marginTop: 14, boxShadow: 'none' }}
      >
        {resubmitting ? 'Resubmitting' : 'Resubmit for review'}
      </Button>
    </Card>
  );
}
