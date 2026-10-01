/**
 * Sign-up form rules (Sprint 20, spec 2.1/2.2) - PURE. The function
 * re-checks everything; this is the client's first pass so the form can say
 * what is wrong before the round trip. Payload shapes are contract 1.2/1.3.
 * While the Commitment Contract is hidden (contractFlag.js) the contract
 * fields are ignored: not validated, and sent as null. `contract` overrides
 * the flag (the harness's contract step); it defaults to it at call time.
 */
import { ALL_PACKAGES, ELITE, packageById } from './packages';
import { contractEnabled } from './contractFlag';
import { householdFacility } from './facility';

export const EMAIL_RE = /^\S+@\S+\.\S+$/;
export const TIER_MINUTES = [20, 45, 90];
export const ADULT_AGE = 18;
export const HANDICAP_MIN = 0;
export const HANDICAP_MAX = 54;
/** Spec 13 cut line: flip to false to hide the own-login toggle if claimInvite slips. */
export const CHILD_LOGIN_ENABLED = true;
export const U13_HELPER =
  'Under 13? A Google account needs Family Link permission for third-party sign-in; a new password login works either way.';
export const ADULT_REQUIRED = 'Student sign-up is 18+. A parent or guardian needs to complete this for you.';
const DOB_REQUIRED = 'Date of birth is required — it determines U13 vs U18 eligibility.';

let seq = 0;
/** `contractPicked` is form-only (never sent): it tells "Not yet" apart from no answer. */
export function newAthleteEntry() {
  seq += 1;
  return {
    key: `new-${seq}`, name: '', dob: '', packageId: null, contractMinutes: null, contractPicked: false, handicap: '', ownLogin: false, loginEmail: '',
  };
}

/**
 * The form's family facility tick (`form.facilityRequested`) as a saved draft
 * restores it. The tick was once per athlete: a draft from that form (still
 * draft v1, no family field) restores ticked when any of its athletes was;
 * one from before the add-on existed restores unticked. Once the family
 * field is there it alone decides - the old per-athlete ticks stay behind on
 * the entries, unread.
 */
export function restoredFacilityTick(form) {
  if (!form) return false;
  if (typeof form.facilityRequested === 'boolean') return form.facilityRequested;
  return Array.isArray(form.athletes) && form.athletes.some((a) => a?.facilityRequested === true);
}

/**
 * The $300/month facility add-on, ticked under the package cards (owner
 * request, Mike 2026-09-30). 'offer' on the monthly token packages;
 * 'included' for Elite (24/7 access is part of it); null for the one-time
 * single token, which never has it, and for no pick yet. A tick is a request,
 * never a charge: the add-on's checkout opens once the membership is paid
 * (checkout.js refuses 'billing-not-active').
 */
export function facilityOptionFor(packageId) {
  const kind = packageId == null ? null : packageById(packageId)?.kind;
  if (kind === 'tokens') return 'offer';
  return kind === 'elite' ? 'included' : null;
}

/**
 * It is a FAMILY add-on (owner ruling 2026-09-30): one tick for the whole
 * form, offered once, never once per child. 'included' when any athlete in
 * the form is on Elite (Elite covers the family); 'offer' when someone is on
 * a 6, 12 or 16 token package; null otherwise. `existing` (link mode) is the
 * athletes already in the family: a live Elite membership there includes it
 * too, and anything that makes addAthletes store no request - an Elite
 * athlete still to pay, a request already made, an add-on already paid -
 * means it is not offered again. null while unknown: addAthletes decides.
 */
export function familyFacilityOption(athletes, existing = null) {
  const options = (athletes || []).map((a) => facilityOptionFor(a?.packageId));
  const there = (existing || []).filter(Boolean);
  const family = householdFacility(there);
  if (options.includes('included') || family.source === 'elite') return 'included';
  if (!options.includes('offer')) return null;
  const blocked = family.access || there.some((a) => a.facilityRequested === true || (a.packageId === ELITE.id && a.billing?.status !== 'lapsed'));
  return blocked ? null : 'offer';
}

/** The family tick that still counts: one left on before an Elite pick, or with nobody on a token package, means nothing (createFamily stores false too). */
export function wantsFacility(form) {
  return Boolean(form) && form.facilityRequested === true && familyFacilityOption(form.athletes) === 'offer';
}

/** Which athlete the request is sent on - the add-on bills on one athlete: the first with a 6, 12 or 16 token package. -1 == nobody. */
export function facilityHolderIndex(form) {
  return wantsFacility(form) ? form.athletes.findIndex((a) => facilityOptionFor(a?.packageId) === 'offer') : -1;
}

/** The consent step's facility waiver turns required once the family keeps the add-on. */
export function facilityWaiverRequired(form) {
  return wantsFacility(form);
}
export const FACILITY_WAIVER_FOOTNOTE = 'Needed for the facility access you picked';
export const FACILITY_WAIVER_REQUIRED =
  'Tick the facility access waiver to keep the add-on, or untick facility access on the package step.';

/** The contract step is answered by a goal (20/45/90) or by "Not yet"; a stale 95 is not an answer. */
export function contractAnswered(a) {
  return TIER_MINUTES.includes(a.contractMinutes) || (a.contractPicked === true && a.contractMinutes == null);
}

/** 'Nico', 'Nico and Reese', 'Nico, Reese and Sam'. */
export function joinNames(names) {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';
}

/**
 * Emergency contact (owner, 2026-09-30: its own mobile and relationship
 * fields). Optional as a block; once any field is filled, name and mobile are
 * both required. Drafts saved before the split hold one string, which becomes
 * the name.
 */
export function emptyEmergencyContact() {
  return { name: '', phone: '', relationship: '' };
}
export function toEmergencyForm(v) {
  if (typeof v === 'string') return { ...emptyEmergencyContact(), name: v };
  if (!v || typeof v !== 'object') return emptyEmergencyContact();
  const text = (x) => (typeof x === 'string' ? x : '');
  return { name: text(v.name), phone: text(v.phone), relationship: text(v.relationship) };
}
export function validateEmergencyContact(ec) {
  const e = toEmergencyForm(ec);
  const blank = (s) => s.trim() === '';
  if (blank(e.name) && blank(e.phone) && blank(e.relationship)) return {};
  const errors = {};
  if (blank(e.name)) errors.name = 'Add their name, or clear the other emergency fields.';
  if (blank(e.phone)) errors.phone = 'Add a mobile number we can call.';
  return errors;
}
/** Contract 1.2/1.3 `emergencyContact`: trimmed, or null when all three are blank. */
export function emergencyBody(ec) {
  const e = toEmergencyForm(ec);
  const [name, phone, relationship] = [e.name.trim(), e.phone.trim(), e.relationship.trim()];
  return name || phone || relationship ? { name, phone, relationship: relationship || null } : null;
}

/** Whole years old on `todayISO`; null for anything but 'yyyy-MM-dd'. No Date.now(). */
export function ageOnDate(dob, todayISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob || '') || !/^\d{4}-\d{2}-\d{2}$/.test(todayISO || '')) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = todayISO.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age;
}

export function isAdultOnDate(dob, todayISO) {
  const age = ageOnDate(dob, todayISO);
  return age != null && age >= ADULT_AGE;
}

/** '' -> null; an integer 0..54 -> itself; anything else -> undefined (invalid). */
export function normalizeHandicap(raw) {
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= HANDICAP_MIN && n <= HANDICAP_MAX && String(raw).trim() !== '' ? n : undefined;
}

const lower = (s) => (s || '').trim().toLowerCase();

export function validateAthleteEntry(a, { todayISO, guardianEmail = '', siblings = [], mode = 'parent', contract = contractEnabled() } = {}) {
  const errors = {};
  if (!a.name || a.name.trim() === '') errors.name = 'Athlete name is required.';
  const age = ageOnDate(a.dob, todayISO);
  if (age == null) errors.dob = DOB_REQUIRED;
  else if (a.dob > todayISO) errors.dob = 'That date is in the future - check the year.';
  else if (mode === 'athlete' && age < ADULT_AGE) errors.dob = ADULT_REQUIRED;
  if (a.packageId != null && !ALL_PACKAGES.some((p) => p.id === a.packageId)) errors.packageId = 'Pick a package from the list.';
  if (contract && a.contractMinutes != null && !TIER_MINUTES.includes(a.contractMinutes)) errors.contractMinutes = 'Pick 20, 45 or 90 minutes.';
  if (normalizeHandicap(a.handicap) === undefined) errors.handicap = 'Handicap is a whole number from 0 to 54, or leave it blank.';
  // Own login is a parent-mode choice (the adult athlete IS the login); a
  // toggle left on before switching to athlete mode is ignored, as the
  // payload builder and createFamily ignore it.
  if (mode === 'parent' && a.ownLogin) {
    const email = lower(a.loginEmail);
    if (!EMAIL_RE.test(email)) errors.loginEmail = 'Enter the email the athlete will sign in with.';
    else if (email === lower(guardianEmail)) errors.loginEmail = "Use a different email from the guardian's.";
    else if (siblings.some((s) => s !== a && s.ownLogin && lower(s.loginEmail) === email)) errors.loginEmail = 'Each athlete needs their own email.';
  }
  return errors;
}

function athleteBody(a, contract, facilityRequested) {
  return {
    name: a.name.trim(),
    dob: a.dob,
    packageId: a.packageId,
    // Hidden: null for everyone, even a goal a restored draft still holds.
    contractMinutes: contract ? a.contractMinutes ?? null : null,
    handicap: normalizeHandicap(a.handicap) ?? null,
    loginEmail: a.ownLogin && a.loginEmail ? lower(a.loginEmail) : null,
    facilityRequested,
  };
}

/** Every athlete's body; the family facility tick rides on exactly one of them (facilityHolderIndex). */
function athleteBodies(form, contract) {
  const holder = facilityHolderIndex(form);
  return form.athletes.map((a, i) => athleteBody(a, contract, i === holder));
}

/** Contract 1.2 request body. Athlete mode: no relationship, no child login (the caller IS the login). */
export function buildCreateFamilyPayload(form, { contract = contractEnabled() } = {}) {
  const parent = form.mode === 'parent';
  return {
    mode: form.mode,
    contact: {
      name: form.contact.name.trim(),
      email: form.contact.email.trim(),
      phone: form.contact.phone.trim(),
      relationship: parent ? form.contact.relationship || null : null,
    },
    athletes: athleteBodies(form, contract).map((a) => (parent ? a : { ...a, loginEmail: null })),
    emergencyContact: emergencyBody(form.emergencyContact),
    medical: form.medical.trim() || null,
    consents: {
      dataCollection: Boolean(form.consents.dataCollection),
      videoCapture: Boolean(form.consents.videoCapture),
      mediaRelease: Boolean(form.consents.mediaRelease),
      facilityAccess: Boolean(form.consents.facilityAccess),
    },
    signatureName: form.signatureName.trim(),
  };
}

/** Contract 1.3 request body (Settings' "Link another athlete"). A null contact means "use the household's". */
export function buildAddAthletesPayload(form, { contract = contractEnabled() } = {}) {
  return {
    athletes: athleteBodies(form, contract),
    emergencyContact: emergencyBody(form.emergencyContact),
    medical: form.medical.trim() || null,
  };
}
