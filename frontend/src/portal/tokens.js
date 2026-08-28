// Design tokens for the RYP member portal.
//
// Source of truth: docs/portal/design-handoff.md ("Design Tokens").
// The base palette is taken verbatim from ../styles/theme.js, which the design
// was drawn against. Everything added here is a value the design uses that the
// 2025 theme did not name.

/**
 * Flag 01 (handoff "Open Decisions"): #333 hairlines on #000 measure ~1.3:1 and
 * #3D3D3D ~1.6:1 — neither clears 3:1. A hairline separator is exempt from that
 * threshold, but outlines must not be the only thing separating a card from the
 * page. So: `surface` fill carries the separation, `border` is secondary, and the
 * token is switchable from one place.
 */
export const BORDER_TOKEN = '#3D3D3D';

export const color = {
  primary: '#00AF51',
  secondary: '#F4EE19',
  error: '#FF4444',

  /**
   * Flag 04: the Stripe retry ladder needs a mid state between caution and
   * alarm. Four escalating states across ten days cannot all be #FF4444 — a
   * parent shown maximum alarm at retry 1 ignores it by retry 3.
   */
  errorMid: '#FA9931',

  bg: '#000000',
  surface: '#1A1A1A',
  border: BORDER_TOKEN,

  text: '#FFFFFF',
  textSecondary: '#CCCCCC',
  textTertiary: '#888888',

  // Supporting values, used consistently across the artboards.
  track: '#111111',       // meter tracks, inset fields
  dimmed: '#141414',      // disabled / closed surfaces
  frameRule: '#222222',   // frame dividers
  toggleOff: '#242424',
  rule: '#2A2A2A',        // nested rules
  ruleSoft: '#262626',
  ruleFaint: '#2E2E2E',
  rowRule: '#1E1E1E',     // roster row separators
  controlBorder: '#3A3A3A', // unmarked control outlines
  disabledText: '#777777',
  mutedText: '#666666',
  faintText: '#555555',
  captionText: '#6F6F6F',
};

/** Tinted fills — every "state" treatment in the design uses one of these. */
export const tint = {
  greenSoft: 'rgba(0,175,81,.09)',
  green: 'rgba(0,175,81,.12)',
  greenStrong: 'rgba(0,175,81,.15)',
  yellow: 'rgba(244,238,25,.10)',
  yellowSoft: 'rgba(244,238,25,.07)',
  yellowBorder: 'rgba(244,238,25,.4)',
  red: 'rgba(255,68,68,.08)',
  redStrong: 'rgba(255,68,68,.10)',
  redBorder: 'rgba(255,68,68,.45)',
  overlay: 'rgba(0,0,0,.55)',
  /**
   * The loading CTA fill, verbatim from the handoff (02's submitting step:
   * "CTA becomes rgba(0,175,81,.45) with a spinner"). Strong enough over the
   * black frame to keep the black label and spinner legible.
   */
  greenLoading: 'rgba(0,175,81,.45)',
};

export const font = {
  head: "Raleway, sans-serif",
  body: "'Work Sans', sans-serif",
  mono: 'ui-monospace, Menlo, monospace',
};

/**
 * The brand signature: green-tinted elevation. Used only on primary emphasis —
 * applying it broadly is what makes it stop reading as emphasis.
 */
export const glow = {
  liveCard: '0 6px 20px rgba(0,175,81,.12)',
  heroCard: '0 10px 30px rgba(0,175,81,.16)',
  emphasisCard: '0 8px 26px rgba(0,175,81,.14)',
  nowCard: '0 8px 24px rgba(0,175,81,.14)',
  tierCard: '0 6px 20px rgba(0,175,81,.14)',
  datePill: '0 6px 18px rgba(0,175,81,.26)',
  buttonSecondary: '0 8px 22px rgba(0,175,81,.26)',
  buttonPrimary: '0 8px 26px rgba(0,175,81,.30)',
  buttonPinned: '0 10px 28px rgba(0,175,81,.32)',
};

export const radius = {
  badge: '5px',
  pill: '6px',
  input: '8px',
  control: '9px',
  counter: '10px',
  card: '12px',
  cardLarge: '16px',
  round: '999px',
  frame: '30px',
};

/**
 * Flag 07 (handoff "Open Decisions"): revision 2 says three weekday afternoon
 * blocks without naming them. The academy runs junior programming only, and the
 * three junior blocks on the Blueprint's afternoon grid are these.
 *
 * Every schedule, booking and roster screen reads from here. If the real answer
 * is 3:30/4:30/5:30, or the three are not consecutive, this is the only edit.
 */
export const BLOCKS = ['3:00 PM', '4:00 PM', '5:00 PM'];
export const BLOCK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday'];
export const BLOCK_DAYS_SHORT = BLOCK_DAYS.map((d) => d.slice(0, 3));

/**
 * "3-6 PM", derived so it cannot drift from BLOCKS.
 *
 * Note: the handoff still says "3-7 PM" in two places (02's success step and
 * 12's flow caption). That is a leftover from the four-block grid — three
 * one-hour blocks starting at 3:00 end at 6:00, not 7:00. Deriving the label
 * keeps the copy correct if the block list changes again.
 */
export const BLOCK_RANGE_LABEL = (() => {
  const first = parseInt(BLOCKS[0], 10);
  const last = parseInt(BLOCKS[BLOCKS.length - 1], 10);
  return `${first}-${last + 1} PM`;
})();

/** The three training environments an athlete rotates through. */
export const ROTATIONS = ['The Workshop', 'The Lab', 'The Arena'];

/** Placeholder treatment — marks where real content lands. Never ships as-is. */
export const placeholder = {
  background: 'repeating-linear-gradient(45deg,#131313 0 5px,#1b1b1b 5px 10px)',
  border: `1px dashed ${color.border}`,
  borderRadius: radius.input,
};

/** Minimum touch target. Attendance IN/OUT is deliberately larger (64x48). */
export const TOUCH_MIN = 44;
