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

  /**
   * Suggested age groups (owner, 2026-09-22). Two hues that mean nothing else
   * in this app: green is "tappable / on track", yellow is caution, red is
   * error and amber #FA9931 is the payment retry ladder, so an age hint gets
   * its own space rather than borrowing a meaning. Both are legible small on
   * both grounds - blue 6.85:1 on the card surface and 8.3:1 on the page,
   * lavender 7.8:1 and 9.4:1. Colour is never the only signal: the chip always
   * carries "13+" or "U13", which is what a red-green colour-blind viewer (and
   * anyone glancing at a phone in sunlight) actually reads.
   */
  ageOlder: '#5AA9E6',
  ageYounger: '#C79BF2',

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

  /** Age-group chips (2026-09-22): a wash, never a solid fill - a solid fill
   *  reads as "tap me", and an age hint is not a control. */
  ageOlder: 'rgba(90,169,230,.13)',
  ageOlderBorder: 'rgba(90,169,230,.45)',
  ageYounger: 'rgba(199,155,242,.13)',
  ageYoungerBorder: 'rgba(199,155,242,.45)',
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
 * Flag 07 (handoff "Open Decisions"), Sprint 1-11 shape: three weekday
 * afternoon blocks, Monday-Thursday. KEPT AS-IS (Sprint 12): data/seed.js
 * (db lane, not touched this sprint) still indexes `BLOCKS[0..2]` for the
 * coach-dashboard demo blocks — changing this array's shape would break that
 * file's runtime with no edit access to fix it. It no longer describes the
 * real academy week (see WEEKLY_SCHEDULE below, which does) — it is now
 * scoped to that one seed fixture only. The db lane's own Sprint 12 pass
 * (pin J) moves schedule.js to per-day blocks; this array can retire once
 * seed.js follows.
 */
export const BLOCKS = ['3:00 PM', '4:00 PM', '5:00 PM'];

/**
 * The real locked weekly schedule (Sprint 12 pin J, owner ruling
 * 2026-09-15; amendment v2.0.3, 2026-09-22: a fourth weekday block — Mon/Wed
 * gain 6 PM, Tue/Thu gain 7 PM): 60-minute blocks. Mon/Wed 3-7 PM, Tue/Thu
 * 4-8 PM, Fri 3-5 PM, Sat 9 AM-2 PM. Tue/Thu 3 PM stays RESERVED for the
 * invite-only group (v2.0.2) and is not listed, so the sentence this drives
 * never offers a family a block it cannot book — it used to say "Tue/Thu 3-7
 * PM", which included that reserved hour. (9 AM training + four more 60-min
 * Saturday blocks — the 2-4 PM
 * college/Elite Am/Mid Am pair is adult, in-person Stripe, not bookable in
 * the app, so it is not listed here). Production sessions come from the
 * Google Calendar sync — the schedule is a calendar edit by the owner, not a
 * code change (pin J) — so this is the frontend's own copy of those hours,
 * for empty-state and summary copy only. Values are 24h block-start hours.
 */
export const WEEKLY_SCHEDULE = {
  Monday: [15, 16, 17, 18],
  Tuesday: [16, 17, 18, 19],
  Wednesday: [15, 16, 17, 18],
  Thursday: [16, 17, 18, 19],
  Friday: [15, 16],
  Saturday: [9, 10, 11, 12, 13],
};

export const SCHEDULE_DAYS = Object.keys(WEEKLY_SCHEDULE);

const SHORT_DAY = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

function hour12(h) {
  return ((h + 11) % 12) + 1;
}

/** One day's span, honestly crossing noon: "3-6 PM" / "9 AM-2 PM". */
function daySpanLabel(day) {
  const hours = WEEKLY_SCHEDULE[day];
  if (!hours || !hours.length) return null;
  const start = hours[0];
  const end = hours[hours.length - 1] + 1; // every block is 60 minutes
  const startsPM = start >= 12;
  const endsPM = end >= 12;
  if (startsPM === endsPM) return `${hour12(start)}-${hour12(end)} ${endsPM ? 'PM' : 'AM'}`;
  return `${hour12(start)} ${startsPM ? 'PM' : 'AM'}-${hour12(end)} ${endsPM ? 'PM' : 'AM'}`;
}

/**
 * "Mon/Wed 3-6 PM, Tue/Thu 3-7 PM, Fri 3-5 PM, Sat 9 AM-2 PM" — derived from
 * WEEKLY_SCHEDULE so this sentence can never hardcode a schedule the
 * calendar has since moved past (WEEKLY_SCHEDULE above is the one place to
 * edit; pin J: the schedule itself is a calendar edit, not a code change).
 * Replaces the old BLOCK_RANGE_LABEL, which derived only Mon-Thu 3-6 PM.
 */
export const WEEKLY_SCHEDULE_LABEL = (() => {
  const groups = [];
  for (const day of SCHEDULE_DAYS) {
    const span = daySpanLabel(day);
    const last = groups[groups.length - 1];
    if (last && last.span === span) last.days.push(day);
    else groups.push({ span, days: [day] });
  }
  return groups.map((g) => `${g.days.map((d) => SHORT_DAY[d]).join('/')} ${g.span}`).join(', ');
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
