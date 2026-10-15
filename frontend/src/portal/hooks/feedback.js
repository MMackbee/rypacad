/**
 * The Feedback button's plain helpers (owner-approved design, 2026-10-15;
 * docs/portal/plans/2026-10-15-feedback/00-spec.md): who sees the button,
 * where it sits, and the payload submitFeedback takes. No React, no
 * Firebase - components/FeedbackButton.js wires them up, and the screenshot
 * itself is hooks/feedbackCapture.js.
 */

export const FEEDBACK_NOTE_MAX = 2000;
export const FEEDBACK_PAGE_MAX = 300;

/**
 * Where the button never shows: the sign-in, sign-up and not-provisioned
 * screens, and the bare index (it only redirects). /portal/register is a
 * sign-up for an account that is not provisioned yet, so the session check
 * below hides it there too - except a parent's "Link another athlete",
 * which is a signed-in screen like any other.
 */
const HIDDEN_SEGMENTS = new Set(['', 'signin', 'signup', 'not-provisioned']);

/** Query parameters whose values never leave the address bar (the server drops them too). */
const SECRET_PARAMS = ['token', 'code', 'oobcode', 'apikey', 'session'];

/**
 * The PhoneFrame footer wrapper (a tab bar or a pinned CTA) and every
 * bottom sheet's overlay carry these, so the button can sit above the one
 * and step aside for the other.
 */
export const FRAME_FOOTER_ATTR = 'data-portal-frame-footer';
export const OVERLAY_ATTR = 'data-portal-overlay';
/** The Feedback button, its panel and its toast: never in a screenshot, never printed. */
export const FEEDBACK_UI_ATTR = 'data-feedback-ui';

/** Gap between the button and whatever it sits above, in px. */
export const FEEDBACK_GAP = 12;

/** True when the signed-in, provisioned session is on a screen that gets the button. */
export function shouldShowFeedback({ live, loading, user, provisioned, pathname }) {
  if (!live || loading || !user || !provisioned) return false;
  const segment = String(pathname || '').split('/')[2] || '';
  return !HIDDEN_SEGMENTS.has(segment);
}

/** The page as the payload names it: path and query, no fragment, no secret values, 300 chars at most. */
export function cleanPage(pathname, search) {
  const params = new URLSearchParams(search || '');
  for (const key of Array.from(params.keys())) {
    if (SECRET_PARAMS.includes(key.toLowerCase())) params.delete(key);
  }
  const query = params.toString();
  return `${pathname || '/'}${query ? `?${query}` : ''}`.slice(0, FEEDBACK_PAGE_MAX);
}

/** "390x844 @3x" - the layout viewport and, when it is not 1, the pixel ratio. */
export function viewportOf(win = window) {
  const w = Math.round(win.innerWidth || 0);
  const h = Math.round(win.innerHeight || 0);
  const dpr = Number(win.devicePixelRatio) || 1;
  return `${w}x${h}${dpr !== 1 ? ` @${Math.round(dpr * 100) / 100}x` : ''}`;
}

/**
 * Which build the sender had: REACT_APP_VERSION when Railway sets one,
 * otherwise the content hash in the production bundle's file name
 * (`/static/js/main.<hash>.js`), which changes with every deploy. 'dev'
 * under `npm start`.
 */
export function appVersionOf(doc = document, env = process.env) {
  if (env && env.REACT_APP_VERSION) return String(env.REACT_APP_VERSION).slice(0, 60);
  const scripts = Array.from((doc && doc.scripts) || []);
  for (const s of scripts) {
    const m = /\/static\/js\/main\.([0-9a-f]+)\.js/.exec(s.src || '');
    if (m) return `build ${m[1].slice(0, 12)}`;
  }
  return 'dev';
}

/** Send needs a note, or a screenshot that is still included. */
export function canSendFeedback(note, includeShot, shot) {
  return Boolean(String(note || '').trim()) || Boolean(includeShot && shot && shot.dataUrl);
}

/**
 * submitFeedback's payload. The image rides along only while "Include
 * screenshot" is on. Identity is never sent: the function reads it from
 * the users doc.
 */
export function feedbackPayload({ note, page, shot, includeShot, win = window, doc = document }) {
  const payload = {
    note: String(note || '').trim().slice(0, FEEDBACK_NOTE_MAX),
    page: String(page || '').slice(0, FEEDBACK_PAGE_MAX),
    viewport: viewportOf(win),
    userAgent: String((win.navigator && win.navigator.userAgent) || '').slice(0, 400),
    appVersion: appVersionOf(doc),
  };
  if (includeShot && shot && shot.dataUrl) {
    payload.image = { dataUrl: shot.dataUrl, width: shot.width, height: shot.height };
  }
  return payload;
}

export const SEND_FAILED = 'Your feedback did not send. Check your connection and try again.';

/**
 * The panel's error line. The function's own refusals are plain sentences
 * ("Feedback is not set up yet.", the hourly limit) and show as they are;
 * a bare SDK code ('internal', 'deadline-exceeded') or the callable
 * wrapper's "submitFeedback failed." becomes one plain line.
 */
export function sendErrorMessage(err) {
  const m = err && typeof err.message === 'string' ? err.message.trim() : '';
  return /\s/.test(m) && !m.includes('submitFeedback') ? m : SEND_FAILED;
}

/**
 * Where the button goes, read from the page as it is laid out now:
 * `bottom` is how far above the viewport's bottom edge the topmost visible
 * frame footer starts (0 with none; capped at 60% of the viewport so an
 * in-flow footer cannot push the button off the top), and `covered` is
 * whether a bottom sheet is open.
 */
export function measureLayout(doc = document, win = window) {
  const vh = win.innerHeight || 0;
  let clearance = 0;
  doc.querySelectorAll(`[${FRAME_FOOTER_ATTR}]`).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!(r.height > 0) || r.top >= vh || r.bottom <= 0) return;
    clearance = Math.max(clearance, vh - r.top);
  });
  return {
    bottom: Math.round(Math.min(clearance, vh * 0.6)),
    covered: Boolean(doc.querySelector(`[${OVERLAY_ATTR}]`)),
  };
}
