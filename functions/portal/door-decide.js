/**
 * Who may open the facility door from the portal, and the first reason
 * they may not (spec 5.1, docs/portal/plans/2026-11-17-door-button/
 * 00-spec.md). Pure: door.js reads the documents and asks here; the
 * callable never opens the door on any other answer.
 *
 * Owner rulings (2026-11-14/17): only households with PAID facility access
 * (a live Elite membership, comped Elite included, or a live facility
 * add-on); a kid's own login only at 16 and up on the Chicago day; only at
 * the academy. Owner and ops pass from anywhere (spec 3). Every family
 * login signs the door rules once, and a 16-17 athlete also needs a parent
 * in the household to have signed.
 */
'use strict';

const {householdFacility} = require('./facility');
const {ageAt} = require('./lib');
const {DEFAULT_RADIUS_M, reach, validLocation} = require('./door-geo');

/** Kept equal to the app's `data/doorRules.js` (a jest test compares). */
const DOOR_TERMS_VERSION = 'door-2026-11-17';
/** Pass from anywhere, with no household, rules or location check. */
const STAFF_DOOR_ROLES = ['owner', 'ops'];
/** `doorConfig/main` fields when absent (spec 4). */
const DEFAULTS = {radiusM: DEFAULT_RADIUS_M, openSeconds: 5};
/**
 * The open time's whole-second range: Alta's Entry open duration (1 s to
 * 10 min). firestore.rules and the app's data/doorAdmin.js keep the same.
 */
const OPEN_SECONDS_MIN = 1;
const OPEN_SECONDS_MAX = 600;
const FAMILY_ROLES = ['parent', 'athlete'];
const LIVE_MODES = ['staff', 'all'];
const ELITE_ID = 'elite';
const MIN_AGE = 16;
const ADULT_AGE = 18;

const PHONE = '(612) 234-1644';
const DIDNT_ANSWER = 'The door didn\'t answer. If you heard the lock ' +
    `click, go in. Otherwise try once more, or call or text ${PHONE}.`;
/**
 * Every `details.reason` the two door callables throw, with its HttpsError
 * code and the plain copy the app may show as it is.
 * @const {!Object<string, {code: string, message: string}>}
 */
const REFUSALS = {
  'signed-out': {code: 'unauthenticated',
    message: 'Sign in to unlock the door.'},
  'not-provisioned': {code: 'permission-denied',
    message: 'Finish setting up your account, then try again.'},
  'bad-request': {code: 'invalid-argument',
    message: 'That press didn\'t go through. Hold Unlock again.'},
  'off': {code: 'failed-precondition',
    message: 'Door unlocking is switched off right now.'},
  'not-eligible': {code: 'failed-precondition',
    message: 'This account can\'t unlock the door.'},
  'no-access': {code: 'failed-precondition',
    message: 'Unlocking the door comes with facility access. Call or text ' +
        `the academy at ${PHONE} to ask about it.`},
  'under-16': {code: 'failed-precondition',
    message: 'Athletes under 16 come in with a parent or guardian.'},
  'paused': {code: 'failed-precondition',
    message: 'Door unlocking is paused for your family. Call or text the ' +
        `academy at ${PHONE}.`},
  'sign-rules': {code: 'failed-precondition',
    message: 'Read and sign the door rules once to turn on Unlock.'},
  'guardian-rules': {code: 'failed-precondition',
    message: 'A parent needs to sign the door rules in their own app first.'},
  'not-set-up': {code: 'failed-precondition',
    message: 'Door unlocking isn\'t set up yet.'},
  'location-needed': {code: 'failed-precondition',
    message: 'Turn on Location for this site so the app can check you\'re ' +
        'at the academy.'},
  'too-far': {code: 'failed-precondition',
    message: 'You need to be at the academy to unlock the door.'},
  'misconfigured': {code: 'failed-precondition', message: DIDNT_ANSWER},
  'rate-limited': {code: 'resource-exhausted',
    message: `Too many unlocks for now. Call or text the academy at ${PHONE}.`},
  'alta-error': {code: 'unavailable', message: DIDNT_ANSWER},
  'alta-timeout': {code: 'unavailable', message: DIDNT_ANSWER},
  'in-progress': {code: 'unavailable', message: DIDNT_ANSWER},
  'stale-terms': {code: 'failed-precondition',
    message: 'Reload the app to see the latest rules.'},
};

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Paid facility access for the door: `householdFacility` (facility.js) over
 * the athletes, with an Elite athlete that has no `billing` map treated as
 * not Elite (hostile review B2: a legacy row is not proof of payment).
 * @param {?Array<?Object>} athletes The household's athlete docs, with ids.
 * @return {!Object} householdFacility's answer.
 */
function doorFacility(athletes) {
  const list = (athletes || []).filter(Boolean).map((a) =>
    a.packageId === ELITE_ID && !a.billing ?
        Object.assign({}, a, {packageId: null}) : a);
  return householdFacility(list);
}

/**
 * @param {?Object} r A `doorRules` doc.
 * @param {string} householdId The caller's household.
 * @return {boolean} Whether it is the current rules, for this household.
 */
function signedCurrent(r, householdId) {
  return Boolean(r) && r.termsVersion === DOOR_TERMS_VERSION &&
      r.householdId === householdId;
}

/**
 * The door decision. The first failing check wins, in the spec's order:
 * off, staff, not-eligible / off (staff-only mode), no-access, under-16,
 * paused, sign-rules, guardian-rules, not-set-up, then (unlock only)
 * location-needed and too-far.
 * @param {{user: ?Object, household: ?Object, athletes: ?Array<!Object>,
 *     config: ?Object, paused: boolean, myRules: ?Object,
 *     householdRules: ?Array<!Object>, today: string, location: *,
 *     mode: string}} args `today` is the Chicago 'YYYY-MM-DD'; `mode` is
 *     'check' or 'unlock' (the location is checked on 'unlock' only).
 * @return {{ok: boolean, reason: ?string, staff: boolean, test: boolean,
 *     distanceM: ?number, accuracyM: ?number}} The answer. `test` marks a
 *     test household (or a test athlete's own login); it is checked like
 *     any other and only door.js treats it differently.
 */
function decide(args) {
  const a = args || {};
  const user = a.user || {};
  const config = a.config || null;
  const athletes = (a.athletes || []).filter(Boolean);
  const family = FAMILY_ROLES.includes(user.role);
  const athleteLogin = user.role === 'athlete';
  const own = athleteLogin ?
      athletes.find((x) => x.id === user.athleteId) || null : null;
  const test = family && ((a.household && a.household.test === true) ||
      (own !== null && own.test === true));
  const answer = (reason, extra) => Object.assign({
    ok: !reason, reason: reason || null, staff: false, test: Boolean(test),
    distanceM: null, accuracyM: null,
  }, extra);

  if (!config || !LIVE_MODES.includes(config.mode)) return answer('off');
  if (STAFF_DOOR_ROLES.includes(user.role)) {
    return answer(null, {staff: true, test: false});
  }
  if (!family || !user.householdId) return answer('not-eligible');
  if (config.mode === 'staff') return answer('off');
  if (!doorFacility(athletes).access) return answer('no-access');
  let age = null;
  if (athleteLogin) {
    age = ageAt(own ? own.dob : null, a.today);
    if (!finite(age) || age < MIN_AGE) return answer('under-16');
  }
  if (a.paused) return answer('paused');
  if (!signedCurrent(a.myRules, user.householdId)) return answer('sign-rules');
  if (athleteLogin && age < ADULT_AGE &&
      !(a.householdRules || []).some((r) => r && r.role === 'parent' &&
          signedCurrent(r, user.householdId))) {
    return answer('guardian-rules');
  }
  if (!finite(config.lat) || !finite(config.lng)) return answer('not-set-up');
  if (a.mode === 'unlock') {
    if (!validLocation(a.location)) return answer('location-needed');
    const r = reach(a.location, config);
    return answer(r.ok ? null : 'too-far',
        {distanceM: r.distanceM, accuracyM: r.accuracyM});
  }
  return answer(null);
}

/**
 * Whether an athlete login needs a parent's signature (16 or 17 today), so
 * door.js reads the household's rules only then.
 * @param {?Object} user `users/{uid}`.
 * @param {?Array<!Object>} athletes The household's athlete docs.
 * @param {string} today Chicago 'YYYY-MM-DD'.
 * @return {boolean} True for a 16-17 athlete login.
 */
function needsGuardian(user, athletes, today) {
  if (!user || user.role !== 'athlete') return false;
  const own = (athletes || []).find((x) => x && x.id === user.athleteId);
  const age = ageAt(own ? own.dob : null, today);
  return finite(age) && age >= MIN_AGE && age < ADULT_AGE;
}

/**
 * The open time the app counts down: `openSeconds` when it is a whole
 * number in OPEN_SECONDS_MIN..OPEN_SECONDS_MAX (the range firestore.rules
 * allows), else 5.
 * @param {?Object} config `doorConfig/main`.
 * @return {number} Seconds.
 */
function openSecondsOf(config) {
  const s = config && config.openSeconds;
  return Number.isInteger(s) && s >= OPEN_SECONDS_MIN &&
      s <= OPEN_SECONDS_MAX ? s : DEFAULTS.openSeconds;
}

module.exports = {
  ADULT_AGE, DEFAULTS, DOOR_TERMS_VERSION, FAMILY_ROLES, OPEN_SECONDS_MAX,
  OPEN_SECONDS_MIN, REFUSALS, STAFF_DOOR_ROLES, decide, doorFacility,
  needsGuardian, openSecondsOf,
};
