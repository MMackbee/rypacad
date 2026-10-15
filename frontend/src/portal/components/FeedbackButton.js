import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import useAuthSession from '../hooks/useAuthSession';
import { isLive } from '../hooks/live';
import { callSubmitFeedback } from '../hooks/callables';
import { captureScreenshot } from '../hooks/feedbackCapture';
import {
  FEEDBACK_GAP,
  FEEDBACK_SPACE_ATTR,
  FEEDBACK_UI_ATTR,
  cleanPage,
  feedbackEnabled,
  feedbackPayload,
  measureLayout,
  shouldShowFeedback,
} from '../hooks/feedback';
import { TOUCH_MIN, color, font, radius } from '../tokens';
import { Spinner } from './Button';
import SavedToast from './SavedToast';
import FeedbackSheet from './FeedbackSheet';
import { BARE_MAX_WIDTH } from './PhoneFrame';

export const THANKS = 'Thanks - sent to the RYP team.';
const THANKS_MS = 4000;
const UI = { [FEEDBACK_UI_ATTR]: '' };
const PRINT_CSS = `@media print { [${FEEDBACK_UI_ATTR}] { display: none !important; } }`;
// The button's bottom edge is FEEDBACK_GAP over a pinned footer's top (the
// scroll area's bottom), or FEEDBACK_GAP + 4 over the safe area with none.
const SPACE_OVER_FOOTER = `${TOUCH_MIN + 2 * FEEDBACK_GAP}px`;
const SPACE_OVER_EDGE = `calc(${TOUCH_MIN + 2 * FEEDBACK_GAP + 4}px + env(safe-area-inset-bottom, 0px))`;

/**
 * The style rule that sizes every top-level frame's FeedbackSpace
 * (PhoneFrame.js) while the button shows: the button's height and a gap on
 * each side, so a screen's last row can scroll clear of it (UX review
 * 2026-10-15). It mounts and unmounts with the button, so a screen without
 * the button keeps no extra room. Screen media only: printing has no button.
 */
export function feedbackSpaceCss(footerClearance) {
  const height = footerClearance > 0 ? SPACE_OVER_FOOTER : SPACE_OVER_EDGE;
  return `@media screen { [${FEEDBACK_SPACE_ATTR}] { height: ${height}; } }`;
}
// Inside the phone column on a wide screen (PhoneFrame centres it at
// BARE_MAX_WIDTH), at the viewport's edge on a phone.
const RIGHT = `max(${FEEDBACK_GAP}px, calc((100vw - ${BARE_MAX_WIDTH}px) / 2 + ${FEEDBACK_GAP}px))`;

const frame = (fn) => (typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(fn) : setTimeout(fn, 16));
const cancelFrame = (id) => (typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame(id) : clearTimeout(id));

/**
 * Where the button sits, kept current: re-measured (at most once a frame)
 * whenever the page's elements change or the window resizes, so it rides
 * above whichever tab bar or pinned CTA the screen has - however tall - and
 * steps aside while one of the screen's own bottom sheets is open.
 */
function useFeedbackLayout() {
  const [layout, setLayout] = useState(() => measureLayout());
  useEffect(() => {
    let pending = 0;
    const measure = () => {
      pending = 0;
      const next = measureLayout();
      setLayout((prev) => (prev.bottom === next.bottom && prev.covered === next.covered ? prev : next));
    };
    const schedule = () => {
      if (!pending) pending = frame(measure);
    };
    measure();
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
    if (observer) observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', schedule);
      if (pending) cancelFrame(pending);
    };
  }, []);
  return layout;
}

function FeedbackControl({ pathname, search }) {
  // 'idle' -> 'capturing' (the screenshot, before the panel exists) -> 'open'.
  const [phase, setPhase] = useState('idle');
  const [draft, setDraft] = useState(null);
  const [thanks, setThanks] = useState(false);
  const buttonRef = useRef(null);
  const alive = useRef(true);
  const refocus = useRef(false);
  const layout = useFeedbackLayout();

  useEffect(() => () => {
    alive.current = false;
  }, []);

  useEffect(() => {
    if (!thanks) return undefined;
    const timer = setTimeout(() => setThanks(false), THANKS_MS);
    return () => clearTimeout(timer);
  }, [thanks]);

  // Focus returns to the button when the panel closes.
  useEffect(() => {
    if (phase === 'idle' && refocus.current) {
      refocus.current = false;
      if (buttonRef.current) buttonRef.current.focus();
    }
  }, [phase]);

  const start = async () => {
    if (phase !== 'idle') return;
    // The page is the one the tap was on, whatever happens while the panel is open.
    const page = cleanPage(pathname, search);
    setThanks(false);
    setPhase('capturing');
    let shot = null;
    try {
      shot = await captureScreenshot();
    } catch (err) {
      shot = null;
    }
    if (!alive.current) return;
    setDraft({ shot, page });
    setPhase('open');
  };

  const close = () => {
    refocus.current = true;
    setDraft(null);
    setPhase('idle');
  };

  const send = (note, includeShot) =>
    callSubmitFeedback(feedbackPayload({ note, page: draft.page, shot: draft.shot, includeShot }));

  const capturing = phase === 'capturing';
  // One of the screen's own sheets is open: its buttons sit where this one would.
  const hidden = layout.covered && phase === 'idle';
  const bottom = layout.bottom > 0 ? layout.bottom + FEEDBACK_GAP : `calc(${FEEDBACK_GAP + 4}px + env(safe-area-inset-bottom, 0px))`;
  const toastBottom = layout.bottom > 0
    ? layout.bottom + FEEDBACK_GAP + TOUCH_MIN + 8
    : `calc(${FEEDBACK_GAP + 4 + TOUCH_MIN + 8}px + env(safe-area-inset-bottom, 0px))`;

  return (
    <>
      <style {...UI}>{`${PRINT_CSS}\n${feedbackSpaceCss(layout.bottom)}`}</style>
      {phase !== 'open' && !hidden ? (
        <button
          {...UI}
          ref={buttonRef}
          type="button"
          aria-label="Send feedback"
          aria-busy={capturing || undefined}
          aria-disabled={capturing || undefined}
          onClick={start}
          style={{
            position: 'fixed',
            right: RIGHT,
            bottom,
            zIndex: 40,
            height: TOUCH_MIN,
            padding: '0 15px',
            boxSizing: 'border-box',
            borderRadius: radius.round,
            border: `1px solid ${color.border}`,
            background: color.surface,
            color: color.text,
            font: `600 13px ${font.body}`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: capturing ? 'progress' : 'pointer',
            boxShadow: '0 6px 18px rgba(0,0,0,.5)',
          }}
        >
          {capturing ? (
            <Spinner size={13} track={color.rule} head={color.primary} />
          ) : (
            <span
              aria-hidden="true"
              style={{ width: 13, height: 11, border: `1.5px solid ${color.primary}`, borderRadius: '4px 4px 4px 1px', boxSizing: 'border-box' }}
            />
          )}
          <span>Feedback</span>
        </button>
      ) : null}
      {thanks && phase === 'idle' ? (
        // An opaque backing: the toast's own green wash is see-through, and here it floats over the screen.
        <div
          {...UI}
          style={{ position: 'fixed', right: RIGHT, bottom: toastBottom, zIndex: 40, maxWidth: 'calc(100vw - 24px)', background: color.bg, borderRadius: 10 }}
        >
          <SavedToast message={THANKS} />
        </div>
      ) : null}
      {phase === 'open' && draft ? (
        <FeedbackSheet
          shot={draft.shot}
          onClose={close}
          onSend={send}
          onSent={() => {
            close();
            setThanks(true);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The Feedback button (owner-approved design, 2026-10-15;
 * docs/portal/plans/2026-10-15-feedback/00-spec.md), mounted ONCE in
 * PortalRoutes, beside the routes. Every signed-in, provisioned role gets
 * it on every screen except sign-in, sign-up and not-provisioned; seed
 * mode (the review harness) never does. Nobody does until
 * REACT_APP_FEEDBACK=true (hooks/feedback.js feedbackEnabled): the switch
 * stays off until the function and its Slack settings are live.
 *
 * It renders into <body>, outside #root, so the screenshot - a picture of
 * #root - can never contain it, and a fixed position that no screen's
 * frame clips. A tap takes the screenshot first, then opens the panel
 * (FeedbackSheet); a failed capture opens the panel without one and says
 * so. Sent, the panel closes and a toast thanks the sender.
 *
 * Same rules-of-hooks discipline as RequireRole: isLive() is a build-time
 * constant, so the session hook's mode never flips across renders.
 */
export default function FeedbackButton() {
  const live = isLive();
  const { user, provisioned, loading } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { pathname, search } = useLocation();
  if (!shouldShowFeedback({ enabled: feedbackEnabled(), live, loading, user, provisioned, pathname })) return null;
  return createPortal(<FeedbackControl pathname={pathname} search={search} />, document.body);
}
