/**
 * What a coach may type into a trial (spec 4.4). The SAME ranges
 * firestore.rules enforces on athletes/{id}/assessments - change one, change
 * the other. A refused value is never sent: the rules check the whole
 * section a write carries, so one typo would otherwise fail the save of
 * every trial typed beside it.
 */

export const RANGES = {
  grip: { lo: 0, hi: 100, unit: 'kg', name: 'Grip' },
  standing: { lo: 90, hi: 215, unit: 'cm', name: 'Standing height' },
  mass: { lo: 15, hi: 160, unit: 'kg', name: 'Body mass' },
  sittingRaw: { lo: 40, hi: 140, unit: 'cm', name: 'Seated height' },
  boxHeight: { lo: 20, hi: 80, unit: 'cm', name: 'Box height' },
  arm: { lo: 40, hi: 110, unit: 'cm', name: 'Arm length' },
  hand: { lo: 10, hi: 25, unit: 'cm', name: 'Hand length' },
  cmjHeight: { lo: 0, hi: 90, unit: 'cm', name: 'Jump height' },
  rsiMod: { lo: 0, hi: 2, unit: '', name: 'RSImod' },
  timeToTakeoffMs: { lo: 100, hi: 2000, unit: 'ms', name: 'Time to take-off' },
  peakPowerW: { lo: 0, hi: 8000, unit: 'W', name: 'Peak power' },
  peakPowerWkg: { lo: 0, hi: 100, unit: 'W/kg', name: 'Peak power' },
  asymmetryPct: { lo: 0, hi: 60, unit: '%', name: 'Asymmetry' },
  rsi: { lo: 0, hi: 5, unit: '', name: 'RSI' },
  gctMs: { lo: 80, hi: 600, unit: 'ms', name: 'Contact time' },
  medballSpeed: { lo: 0, hi: 60, unit: 'mph', name: 'Throw speed' },
  medballDistance: { lo: 0, hi: 25, unit: 'm', name: 'Throw distance' },
  mcgill: { lo: 0, hi: 300, unit: 's', name: 'Hold' },
  clubhead: { lo: 30, hi: 140, unit: 'mph', name: 'Clubhead speed' },
  parallax: { lo: 0, hi: 100, unit: '', name: 'Parallax composite' },
  fps: { lo: 30, hi: 1000, unit: 'fps', name: 'Frame rate' },
  samplingHz: { lo: 1, hi: 5000, unit: 'Hz', name: 'Sampling rate' },
  weeklyHours: { lo: 0, hi: 60, unit: 'h', name: 'Weekly hours' },
  hoursSinceHard: { lo: 0, hi: 336, unit: 'h', name: 'Hours since a hard session' },
  sessions: { lo: 0, hi: 200, unit: '', name: 'RYP sessions' },
  otherSportHours: { lo: 0, hi: 40, unit: 'h', name: 'Other sport hours' },
};

/** "0-100 kg". */
export function rangeLabel(rangeKey) {
  const r = RANGES[rangeKey];
  return r ? `${r.lo}-${r.hi}${r.unit ? ` ${r.unit}` : ''}` : '';
}

const NUMBER = /^(\d+(\.\d+)?|\.\d+)$/;

/**
 * A typed trial: blank is null (clears the trial); a comma decimal is a
 * decimal point (tablet keyboards); a unit, a sign or any other character is
 * refused; a value outside the range is refused with the range.
 */
export function parseTrial(text, rangeKey) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { ok: true, value: null };
  const normalized = raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw;
  if (!NUMBER.test(normalized)) return { ok: false, error: 'Numbers only, like 32.5' };
  const value = Number(normalized);
  const r = RANGES[rangeKey];
  if (r && (value < r.lo || value > r.hi)) return { ok: false, error: `${r.name} is ${rangeLabel(rangeKey)}` };
  return { ok: true, value };
}

/** Typed text: trimmed, capped at `max`, blank is null. */
export function parseText(text, max) {
  const t = String(text ?? '').trim().slice(0, max).trim();
  return t === '' ? null : t;
}

/** `list` with `value` in slot `index`, at least `length` long, untyped slots null. */
export function setAt(list, index, value, length) {
  const src = Array.isArray(list) ? list : [];
  const n = Math.max(length, index + 1, src.length);
  const out = Array.from({ length: n }, (_, i) => (src[i] === undefined ? null : src[i]));
  out[index] = value;
  return out;
}
