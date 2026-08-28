import React from 'react';
import { TOUCH_MIN, color, font, radius, tint } from '../tokens';
import Button from './Button';

/**
 * Header back affordance ("‹ Today", "‹ Cancel", "‹ Back").
 *
 * The label is only ~16px tall, which is well under the 44px touch floor. The
 * negative vertical margins cancel the extra height back out of the layout, so
 * the tap target is a full 44px while the text still sits where the artboards
 * put it. Do not replace this with a bare <button> - that is how the target
 * silently drops back to 16px.
 */
export function BackLink({ children, onClick, style }) {
  const bleed = -(TOUCH_MIN - 16) / 2;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: '0 14px 0 0',
        minHeight: TOUCH_MIN,
        marginTop: bleed,
        marginBottom: bleed,
        display: 'inline-flex',
        alignItems: 'center',
        font: `500 14px ${font.body}`,
        color: color.textSecondary,
        cursor: 'pointer',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/** Card. Every card in the design is this: surface fill, hairline, 12-16px radius. */
export function Card({ tone = 'default', large = false, children, style, onClick }) {
  const tones = {
    default: { border: `1px solid ${color.border}`, background: color.surface },
    green: { border: `1px solid ${color.primary}`, background: color.surface },
    yellow: { border: `1px solid ${tint.yellowBorder}`, background: tint.yellowSoft },
    red: { border: `1px solid ${color.error}`, background: tint.red },
    dashed: { border: `1px dashed ${color.border}`, background: 'transparent' },
    dimmed: { border: `1px solid ${color.rule}`, background: color.dimmed },
  };

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: large ? radius.cardLarge : radius.card,
        padding: large ? 17 : 15,
        ...tones[tone],
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Card section label: 600/10px, .14em tracking, uppercase, #CCC. */
export function SectionLabel({ tone, children, style }) {
  return (
    <div
      style={{
        font: `600 10px ${font.body}`,
        letterSpacing: '.14em',
        textTransform: 'uppercase',
        color: tone || color.textSecondary,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Screen title: Raleway 700, 22-26px, .01em tracking. */
export function ScreenTitle({ size = 22, children, style }) {
  return (
    <h1
      style={{
        font: `700 ${size}px ${font.head}`,
        letterSpacing: '.01em',
        color: color.text,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </h1>
  );
}

export function Body({ size = 12, tone, children, style }) {
  return (
    <div
      style={{
        font: `400 ${size}px/1.55 ${font.body}`,
        color: tone || color.textSecondary,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Persistent banner. Used for the booking tier rule (05), household billing
 * (08) and academy cancellations (04). Never a dismissible toast — a limited
 * tier hits its ceiling on every visit, so the rule has to be standing context
 * rather than something the parent dismissed once and forgot.
 */
export function Banner({ tone = 'neutral', title, children, action, style }) {
  const tones = {
    neutral: { bg: color.surface, bd: color.border, fg: color.textSecondary },
    green: { bg: tint.green, bd: color.primary, fg: color.primary },
    yellow: { bg: tint.yellowSoft, bd: tint.yellowBorder, fg: color.secondary },
    red: { bg: tint.red, bd: color.error, fg: color.error },
  };
  const t = tones[tone] || tones.neutral;

  return (
    <div
      style={{
        background: t.bg,
        border: `1px solid ${t.bd}`,
        borderRadius: radius.card,
        padding: 14,
        ...style,
      }}
    >
      {title ? (
        <div
          style={{
            font: `600 11px ${font.body}`,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: t.fg,
            marginBottom: 5,
          }}
        >
          {title}
        </div>
      ) : null}
      <Body size={12}>{children}</Body>
      {action ? <div style={{ marginTop: 12 }}>{action}</div> : null}
    </div>
  );
}

/**
 * The load-failure treatment — screens 03, 04, 05, 08 when their hook reports
 * `error`.
 *
 * A red-tinted Banner, not a bare line of text, because a failed fetch changes
 * what the whole screen can claim and deserves the same standing weight as the
 * booking rule or a billing flag. The copy is plain language the screen chooses
 * for its own context; whatever the hook's error object carries (a stack, a
 * Firestore code) stays out of the UI.
 *
 * "Try again" renders only when a retry handler is actually wired — a dead
 * retry button would be the UI inventing a capability it does not have.
 */
export function ErrorNotice({ title = "This didn't load", children, onRetry, style }) {
  return (
    <Banner
      tone="red"
      title={title}
      style={style}
      action={
        onRetry ? (
          <Button variant="outline" height={46} onClick={onRetry} style={{ font: `600 14px ${font.body}` }}>
            Try again
          </Button>
        ) : null
      }
    >
      {children ?? 'Check your connection and try again.'}
    </Banner>
  );
}

export function Rule({ color: c, style }) {
  return <div style={{ height: 1, background: c || color.frameRule, ...style }} />;
}

/** Circular "!" badge used beside every inline validation message. */
export function AlertGlyph({ size = 14, tone }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        border: `1px solid ${tone || color.error}`,
        display: 'grid',
        placeItems: 'center',
        font: `700 ${Math.round(size * 0.64)}px ${font.body}`,
        color: tone || color.error,
      }}
    >
      !
    </span>
  );
}

/** CSS tick, used in consent checkboxes and success circles. */
export function Tick({ size = 12, color: c = '#000', thickness = 2 }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size * 0.5,
        height: size * 0.8,
        borderRight: `${thickness}px solid ${c}`,
        borderBottom: `${thickness}px solid ${c}`,
        transform: 'rotate(45deg) translate(-10%, -10%)',
        display: 'inline-block',
      }}
    />
  );
}
