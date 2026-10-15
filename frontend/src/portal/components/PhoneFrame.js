import React, { createContext, useContext } from 'react';
import { color, font, glow, radius } from '../tokens';
import { FEEDBACK_SPACE_ATTR, FRAME_FOOTER_ATTR } from '../hooks/feedback';

/**
 * Global chrome — 390pt x 812px. Content area scrolls; header and bottom tab
 * bar are fixed.
 *
 * The frame is the review harness, not the shipping shell: on a real device the
 * app fills the viewport. `bare` renders the same layout without the device
 * bezel so a screen can be dropped straight into a full-viewport route.
 */

/**
 * Embedding seam for the onboarding walkthrough (docs/portal/TEAM.md,
 * "Onboarding program v1"): OnboardingFlow wraps the REAL screens under its own
 * stepper chrome, and a screen's bare frame is hard-sized to the viewport
 * (100dvh) — two of those nested means two viewports. A provider lets the host
 * re-size the bare frame without any wrapped screen changing:
 *
 * - 'fill': the frame fills its flex parent (one screen under the stepper,
 *   internal scrolling intact — pinned CTAs and tab bars stay pinned).
 * - 'flow': the frame takes its natural height so several screens can stack in
 *   one scroll (the parent scrolls; the frame does not).
 *
 * Default null leaves every existing use — routes and harness — untouched.
 */
export const FrameEmbedContext = createContext(null);

/**
 * min-height beats height, and on phones 100vh is the tall viewport with the
 * browser toolbar hidden - so `minHeight: 100vh` stretched the bare frame past
 * the visible screen and the pinned footer (Continue, Sign and submit, the tab
 * bar) sat partly under the toolbar (UX review 2026-09-30). Where dvh works
 * it alone sizes the frame; older browsers drop the dvh height and keep the
 * 100vh floor as before.
 */
const SUPPORTS_DVH = typeof CSS !== 'undefined' && Boolean(CSS.supports) && CSS.supports('height', '100dvh');

/** The bare frame's phone column on a wide screen. The Feedback button lines up with it. */
export const BARE_MAX_WIDTH = 430;

export default function PhoneFrame({
  width = 390,
  height = 812,
  bare = false,
  header,
  footer,
  children,
  style,
}) {
  const embed = useContext(FrameEmbedContext);
  // Bare mode is the shipping shell: the app fills the viewport. It sizes to
  // the dynamic viewport rather than 100% because the ancestors (.App, body)
  // have auto height — 100% against those collapses instead of filling, and
  // dvh also accounts for mobile browser chrome showing and hiding.
  //
  // Capped at a phone-ish column on wide viewports: these screens are
  // phone-native by intent (the handoff is explicit that 07 and 13 must not be
  // re-laid-out for desktop), and unconstrained they stretch a month grid
  // across 1400px, which is how the contract calendar ended up with
  // 190px-square day cells in desktop testing.
  const frame = bare
    ? embed === 'fill'
      ? {
          // Fills the host's flex column (OnboardingFlow's content area) —
          // definite height from the parent, so internal scrolling still works.
          width: '100%',
          maxWidth: BARE_MAX_WIDTH,
          margin: '0 auto',
          flex: '1 1 auto',
          minHeight: 0,
          background: color.bg,
        }
      : embed === 'flow'
      ? {
          // Natural height: the host scrolls a stack of screens as one page.
          width: '100%',
          maxWidth: BARE_MAX_WIDTH,
          margin: '0 auto',
          flex: 'none',
          background: color.bg,
        }
      : {
          width: '100%',
          maxWidth: BARE_MAX_WIDTH,
          margin: '0 auto',
          height: '100dvh',
          minHeight: SUPPORTS_DVH ? undefined : '100vh',
          background: color.bg,
        }
    : {
        width,
        height,
        background: color.bg,
        border: `1px solid ${color.border}`,
        borderRadius: radius.frame,
        boxShadow: glow.heroCard,
      };

  return (
    // position: relative — Sprint 11 browser-verification fix: every bottom
    // sheet in the app (CancelSheet, DetailSheet, CommitmentContract's
    // DaySheet/LogSheet) is `position: absolute; inset: 0`, meant to overlay
    // this frame. Without a positioned ancestor here, that absolute
    // positioning resolved against the page's initial containing block
    // instead — invisible in the harness gallery (many frames stacked on
    // one long page, so the sheet rendered off in whatever the FIRST
    // positioned ancestor up the tree happened to be, nowhere near its own
    // frame) and only accidentally looked right in a routed `bare` view
    // where the frame already fills the viewport. Confirmed via the DOM
    // (the sheet's own content and disabled/enabled state were always
    // correct) — this was a pure CSS containment gap, not a logic bug, and
    // predates this sprint; fixed here since every sheet in the app shares
    // this one root. Each sheet's overlay also carries data-portal-overlay
    // (2026-10-15): the Feedback button steps aside while one is open, so a
    // new sheet should carry it too.
    <div style={{ ...frame, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', ...style }}>
      {bare ? null : <StatusBar />}
      {header ? <div style={{ flex: 'none' }}>{header}</div> : null}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          scrollbarWidth: 'thin',
          scrollbarColor: `${color.rule} transparent`,
        }}
      >
        {children}
        {embed ? null : <FeedbackSpace />}
      </div>
      {footer ? <div {...footerMark(embed)} style={{ flex: 'none' }}>{footer}</div> : null}
    </div>
  );
}

/**
 * The Feedback button (FeedbackButton.js) floats above the footer of the
 * screen's outermost frame, so only that frame marks its footer and keeps
 * room for the button. An embedded frame (the walkthrough's real screens)
 * sits inside a host frame that already does both: its own footer is not
 * pinned to the screen's bottom, and the host's room keeps the button clear
 * of it.
 */
function footerMark(embed) {
  return embed ? {} : { [FRAME_FOOTER_ATTR]: '' };
}

/**
 * The room at the end of the scroll area that lets the last row scroll
 * clear of the Feedback button (UX review 2026-10-15: the last athlete's
 * IN/OUT on the coach roster sat under it). No height of its own: the
 * button's style rule sizes it while the button shows, and nothing else
 * ever does.
 */
function FeedbackSpace() {
  return <div aria-hidden="true" {...{ [FEEDBACK_SPACE_ATTR]: '' }} style={{ flex: 'none' }} />;
}

/** Time at left, placeholder glyphs at right. Cosmetic — review harness only. */
export function StatusBar({ time = '9:41' }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '13px 22px 4px',
        font: `500 12px ${font.body}`,
        color: color.text,
        flex: 'none',
      }}
    >
      <span>{time}</span>
      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
        <div style={{ width: 15, height: 8, border: `1px solid ${color.mutedText}`, borderRadius: 2 }} />
      </div>
    </div>
  );
}
