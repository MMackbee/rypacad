import React, { useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from '../components/Button';
import Field from '../components/Field';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import { AlertGlyph, Body } from '../components/Primitives';
import useAuthSession from '../hooks/useAuthSession';

/**
 * 01 · Sign In - public.
 * States: Default, Loading, Invalid credentials, Account locked.
 *
 * First impression for a parent who just received the enrollment email.
 *
 * @param {'idle'|'loading'|'invalid'|'locked'} variant
 */
export default function SignIn({ variant = 'idle', bare = false, onStartEnrollment }) {
  const { authState, attemptsLeft } = useAuthSession({ variant });
  const [email, setEmail] = useState('dana@email.com');

  const loading = authState === 'loading';
  const invalid = authState === 'invalid';
  const locked = authState === 'locked';
  const dimPassword = loading || locked;

  return (
    <PhoneFrame bare={bare}>
      <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div
          style={{
            flex: 'none',
            padding: '50px 0 38px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
          }}
        >
          <MediaPlaceholder
            height={76}
            style={{ width: 76, borderRadius: 18 }}
            caption={'RYP\nMARK'}
          />
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                font: `700 15px ${font.head}`,
                color: color.text,
                letterSpacing: '.28em',
                textTransform: 'uppercase',
              }}
            >
              RYP Academy
            </div>
            <div
              style={{
                font: `400 13px ${font.body}`,
                color: color.textSecondary,
                marginTop: 7,
              }}
            >
              Reach Your Potential
            </div>
          </div>
        </div>

        {locked ? (
          <div
            style={{
              flex: 'none',
              background: tint.redStrong,
              border: `1px solid ${color.error}`,
              borderRadius: 10,
              padding: 14,
              marginBottom: 20,
            }}
          >
            <div style={{ font: `600 13px ${font.body}`, color: color.error, marginBottom: 5 }}>
              Account locked
            </div>
            <Body size={12}>
              Five failed attempts. Locked for 30 minutes, or reset your password now.
            </Body>
          </div>
        ) : null}

        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Email" value={email} onChange={setEmail} dimmed={locked} />

          <div>
            <div
              style={{
                font: `500 11px ${font.body}`,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: color.textSecondary,
                marginBottom: 7,
              }}
            >
              Password
            </div>
            <div
              style={{
                height: 52,
                background: dimPassword ? color.dimmed : color.surface,
                border: `1px solid ${
                  invalid ? color.error : dimPassword ? color.rule : color.border
                }`,
                borderRadius: radius.input,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 15px',
                font: `400 15px ${font.body}`,
                color: dimPassword ? color.mutedText : color.text,
              }}
            >
              <span>••••••••</span>
              {/* The reveal affordance is hidden while the field is inert. */}
              {dimPassword ? null : (
                <span style={{ font: `500 13px ${font.body}`, color: color.primary }}>Show</span>
              )}
            </div>

            {invalid ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                <AlertGlyph />
                <span style={{ font: `400 12px ${font.body}`, color: color.error }}>
                  Email or password is incorrect. {attemptsLeft} attempts left.
                </span>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ font: `500 13px ${font.body}`, color: color.primary, cursor: 'pointer' }}>
              Forgot password
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 'none',
            marginTop: 26,
            display: 'flex',
            flexDirection: 'column',
            gap: 13,
          }}
        >
          {/*
            The locked state disables the button rather than hiding it. A greyed
            control the parent can see explains the wall better than a missing one.
          */}
          <Button loading={loading} disabled={locked}>
            {loading ? 'Signing in' : 'Sign in'}
          </Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
            <div style={{ flex: 1, height: 1, background: color.border }} />
            <div
              style={{
                font: `400 11px ${font.body}`,
                color: color.textTertiary,
                letterSpacing: '.08em',
              }}
            >
              OR
            </div>
            <div style={{ flex: 1, height: 1, background: color.border }} />
          </div>

          <Button variant="outline" style={{ boxShadow: 'none' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <MediaPlaceholder height={18} round style={{ width: 18 }} />
              <span style={{ font: `500 15px ${font.body}`, color: color.text }}>
                Continue with Google
              </span>
            </span>
          </Button>
        </div>

        <div style={{ flex: 1, minHeight: 20 }} />

        <div
          style={{
            flex: 'none',
            textAlign: 'center',
            font: `400 13px ${font.body}`,
            color: color.textSecondary,
            paddingTop: 20,
          }}
        >
          New family?{' '}
          <span
            onClick={onStartEnrollment}
            style={{ color: color.primary, fontWeight: 600, cursor: 'pointer' }}
          >
            Start enrollment
          </span>
        </div>
      </div>
    </PhoneFrame>
  );
}
