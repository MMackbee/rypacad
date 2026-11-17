/**
 * The Facility door staff screen's pure half (docs/portal/plans/
 * 2026-11-17-door-button/00-spec.md 4, 6, 7): doorConfig/main as the screen
 * reads it, the write firestore.rules accepts, and the activity and pause
 * rows in plain words. Times are the academy's (America/Chicago).
 */

/** doorConfig's defaults when a field is absent (spec 4). */
export const DOOR_DEFAULTS = { radiusM: 200, openSeconds: 5 };
/** Who can unlock: [mode, label]. */
export const MODES = [
  ['off', 'Off'],
  ['staff', 'Staff only'],
  ['all', 'Everyone'],
];
/** The reach choices, metres. */
export const RADIUS_OPTIONS = [100, 200, 300, 500];
export const OPEN_SECONDS_MIN = 1;
export const OPEN_SECONDS_MAX = 30;

export const NEEDS_LOCATION = 'Set the academy location first.';

/**
 * The roughest phone reading the screen saves as the academy's location
 * (review 2026-11-17 app-1, spec-3): a Wi-Fi fix indoors is often 65 m; an
 * IP-based or laptop fix is hundreds of metres off and never saved.
 */
export const LOCATION_FIX_MAX_M = 75;
/** Above this a saved reading shows in the warning tone. */
export const LOCATION_FIX_WARN_M = 30;

const MODE_IDS = MODES.map(([id]) => id);
const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const isLat = (n) => typeof n === 'number' && Number.isFinite(n) && n >= -90 && n <= 90;
const isLng = (n) => typeof n === 'number' && Number.isFinite(n) && n >= -180 && n <= 180;

/** A Firestore Timestamp, a Date or epoch ms as ms; null otherwise. */
export function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return null;
}

/**
 * doorConfig/main (or null) as `{ mode, lat, lng, radiusM, openSeconds,
 * updatedAtMs, updatedByUid }`. Missing or an unknown mode is Off (fail
 * closed, as the server reads it); a location needs both numbers in range.
 */
export function normalizeConfig(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const located = isLat(c.lat) && isLng(c.lng);
  return {
    mode: MODE_IDS.includes(c.mode) ? c.mode : 'off',
    lat: located ? c.lat : null,
    lng: located ? c.lng : null,
    radiusM: isInt(c.radiusM, 50, 1000) ? c.radiusM : DOOR_DEFAULTS.radiusM,
    openSeconds: isInt(c.openSeconds, OPEN_SECONDS_MIN, OPEN_SECONDS_MAX) ? c.openSeconds : DOOR_DEFAULTS.openSeconds,
    updatedAtMs: toMs(c.updatedAt),
    updatedByUid: typeof c.updatedByUid === 'string' ? c.updatedByUid : null,
  };
}

/** Whether the academy location is set. */
export function locationSet(config) {
  return Boolean(config) && isLat(config.lat) && isLng(config.lng);
}

/**
 * The config fields to write after `patch` (the hook adds updatedAt and
 * updatedByUid): exactly what the rules allow. Throws on a change the rules
 * would refuse, and on Everyone before the academy location is set. An open
 * time is clamped to 1..30 whole seconds.
 */
export function configWrite(config, patch) {
  const next = { ...normalizeConfig(config), ...patch };
  if (!MODE_IDS.includes(next.mode)) throw new Error(`Unknown mode ${next.mode}.`);
  if (!isInt(next.radiusM, 50, 1000)) throw new Error(`A reach of ${next.radiusM} m is out of range.`);
  const located = next.lat != null || next.lng != null;
  if (located && !(isLat(next.lat) && isLng(next.lng))) throw new Error('That location is out of range.');
  if (next.mode === 'all' && !located) throw new Error(NEEDS_LOCATION);
  const secs = Math.round(Number(next.openSeconds));
  return {
    mode: next.mode,
    lat: located ? next.lat : null,
    lng: located ? next.lng : null,
    radiusM: next.radiusM,
    openSeconds: Math.min(OPEN_SECONDS_MAX, Math.max(OPEN_SECONDS_MIN, Number.isFinite(secs) ? secs : DOOR_DEFAULTS.openSeconds)),
  };
}

const CONFIG_KEYS = ['mode', 'lat', 'lng', 'radiusM', 'openSeconds'];

/**
 * Only the fields `patch` changes, checked and cleaned as configWrite does
 * them (review 2026-11-17 rules-1, app-2): the hook merges them into
 * doorConfig/main with the stamp, so a screen loaded before another staff
 * member's change never writes that change back. lat and lng go together.
 */
export function configPatch(config, patch) {
  const full = configWrite(config, patch);
  const out = {};
  for (const key of CONFIG_KEYS) if (patch && key in patch) out[key] = full[key];
  if ('lat' in out || 'lng' in out) {
    out.lat = full.lat;
    out.lng = full.lng;
  }
  return out;
}

const EARTH_RADIUS_M = 6371008.8;
const rad = (deg) => (deg * Math.PI) / 180;

/** Metres between two `{ lat, lng }` (haversine; functions/portal/door-geo.js's formula). */
export function distanceM(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * This phone against the academy, the way unlockDoor checks a family
 * (spec 5.1 step 10: within the reach plus the reading's accuracy, at most
 * 150 m of it): `{ distanceM (rounded to 10), accuracyM, ok }`, or null
 * with no academy location.
 */
export function phoneCheck(fix, config) {
  if (!locationSet(config)) return null;
  const d = distanceM(fix, config);
  const accuracy = Math.max(0, Number(fix.accuracy) || 0);
  return {
    distanceM: Math.round(d / 10) * 10,
    accuracyM: Math.round(accuracy),
    ok: d <= config.radiusM + Math.min(accuracy, 150),
  };
}

const CHICAGO = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** 'Nov 17, 6:42 PM' on the academy's clock; '' for no time. */
export function chicagoTime(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '';
  return CHICAGO.format(new Date(ms)).replace(' at ', ', ');
}

export const OUTCOME_LABELS = {
  opened: 'Opened',
  coalesced: 'Already open',
  test: 'Test (not opened)',
  denied: 'Refused',
  error: 'Door error',
  pending: 'Waiting on the door',
};

const OUTCOME_TONES = { opened: 'green', coalesced: 'green', test: 'neutral', denied: 'red', error: 'red', pending: 'yellow' };

/** Why, for staff: the server's reason codes in words. A code not listed shows as itself. */
export const REASON_LABELS = {
  off: 'switched off',
  'not-eligible': 'not a family login',
  'no-access': 'no paid facility access',
  'under-16': 'under 16',
  paused: 'family paused',
  'sign-rules': 'door rules not signed',
  'guardian-rules': 'no parent has signed',
  'not-set-up': 'academy location not set',
  'location-needed': 'no location from the phone',
  'too-far': 'too far away',
  'rate-limited': 'too many tries',
  'alta-error': 'the door system said no',
  'alta-timeout': 'the door system timed out',
  misconfigured: 'the door link is not set up',
  'in-progress': 'still working',
};

/** One doorEvents doc as a Recent activity row. Distances are already rounded to 10 m by the server. */
export function eventRow(e) {
  const outcome = typeof e?.outcome === 'string' ? e.outcome : null;
  const reason = typeof e?.reason === 'string' && e.reason ? e.reason : null;
  return {
    id: e?.id ?? '',
    when: chicagoTime(typeof e?.atMs === 'number' ? e.atMs : toMs(e?.at)),
    name: e?.name || 'Someone',
    family: e?.householdName || 'Staff',
    outcome: OUTCOME_LABELS[outcome] || outcome || 'Unknown',
    reason: reason ? REASON_LABELS[reason] || reason : null,
    distance: Number.isFinite(e?.distanceM) ? `${e.distanceM} m away` : null,
    test: e?.test === true,
    tone: OUTCOME_TONES[outcome] || 'neutral',
  };
}

/** One doorPauses doc as a Paused families row; `names` maps householdId to the family's name. */
export function pausedRow(p, names) {
  const at = toMs(p?.pausedAt);
  return {
    householdId: p?.householdId ?? '',
    name: (names && names[p?.householdId]) || p?.householdId || '',
    since: at == null ? 'Paused' : `Paused ${chicagoTime(at)}`,
  };
}
