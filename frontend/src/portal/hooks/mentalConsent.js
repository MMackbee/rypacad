/**
 * Mental consent hooks for the family (spec 4): the rows behind the family
 * screen, the list and the booking lines; one athlete's flow; and the
 * standalone writes Yannick's card calls (countersign, the withdrawal, the
 * reminder). Ops and the owner read through ./mentalConsentStaff.js.
 *
 * Seed mode (isLive() false) reads mentalFixtures (data/seed.js) and
 * consentSeedRecords (data/consentSeed.js) and keeps writes in this module
 * for the session; the parent is the Whitfield parent `u-dana`, the
 * athlete login is Jordan. Live mode reads and writes through
 * ./mentalConsentLive.js.
 *
 * Reads (Review Focus 2): a parent ONLY through the householdId query, never
 * a get by id; an athlete login gets its own record. One `now` per load
 * feeds the Chicago date (bookings, "today") and the UTC date (ages).
 * `demoViewer`, `demoNoRecord` and `demoDraft` are the review harness's and
 * only the seed branch reads them.
 */
import { useCallback } from 'react';
import { auth } from '../../firebase';
import {
  ERR, LiveDataError, fetchAthlete, fetchBookings, fetchCurrentUser, fetchHousehold, fetchHouseholdAthletes, fetchHouseholdBookings, isLive, requireUser,
} from './live';
import { fetchLoginInvite } from './signups';
import { bump, useInvalidation } from './invalidate';
import useSeedResource from './useSeedResource';
import { callRequestMentalConsent } from './callables';
import { MENTAL_CONSENT_KEY, consentStamp, createConsent, fetchHouseholdConsents, fetchOwnConsent, updateConsent } from './mentalConsentLive';
import { mentalFixtures } from '../data/seed';
import { consentSeedRecords } from '../data/consentSeed';
import { academyDateISO } from '../data/calendar';
import { isAdultOnDate } from '../data/signup';
import { CONSENT_VERSION, familyLine, familyRows, flowFacts, signerFor, utcTodayISO } from '../data/mentalConsent';
import { adultResign, choicesUpdate, countersignUpdate, portalRecord, withdrawalUpdate } from '../data/mentalConsentWrites';
import { assentFromFlow, choicesFromFlow, clearDraft, draftFromFlow, draftState, readDraft, writeDraft } from '../data/consentFlow';

const SIGNABLE = ['sign', 'continue', 'restart'];
const idOf = (r) => r?.athleteId ?? r?.id;
const isAdultBranch = (branch) => branch === 'adult' || branch === 'adult-handover';
const stampFor = (live) => (live ? consentStamp() : new Date());
const need = (data) => {
  if (!data) throw new LiveDataError(ERR.INVALID, 'Mental consent: nothing is loaded yet.');
  return data;
};

/* ---------------------------------------------------- seed mode's store -- */

/** Seed mode: this session's writes, over the seed records. */
const seedEdits = new Map();

/** Seed mode: the seed records with this session's writes on top, by athlete id. */
export function seedConsentRecordMap() {
  const out = consentSeedRecords();
  seedEdits.forEach((record, id) => { out[id] = record; });
  return out;
}

/** Seed mode's createConsent: a second signature answers 'already', as the rules refuse it. */
export function seedConsentCreate(athleteId, record) {
  const existing = seedConsentRecordMap()[athleteId];
  if (existing) return { status: 'already', record: existing };
  seedEdits.set(athleteId, { id: athleteId, ...record });
  bump(MENTAL_CONSENT_KEY);
  return { status: 'signed' };
}

/** Seed mode's updateConsent. */
export function seedConsentUpdate(athleteId, build) {
  const current = seedConsentRecordMap()[athleteId];
  if (!current) throw new LiveDataError(ERR.NOT_FOUND, `No seed consent record for ${athleteId}.`);
  seedEdits.set(athleteId, { ...current, ...build(current) });
  bump(MENTAL_CONSENT_KEY);
}

const SEED_PARENTS = {
  whitfield: { uid: 'u-dana', displayName: 'Dana Whitfield', email: 'dana@email.com' },
  parker: { uid: 'u-sam', displayName: 'Sam Parker', email: 'sam.parker@example.com' },
};

/* -------------------------------------------------------------- inputs -- */

/** Everything one viewer's rows are made of, from the seed. */
function seedInputs({ as, today, utcToday, now, athleteId = null, householdId = 'whitfield' }) {
  const f = mentalFixtures(today);
  const records = Object.values(seedConsentRecordMap());
  const base = { today, utcToday, now, authUser: {}, bookings: f.bookings };
  if (as === 'athlete') {
    const athlete = f.athletes.find((a) => a.id === (athleteId || 'jordan'));
    const id = athlete?.id ?? athleteId;
    const user = { uid: `athlete-${id}`, role: 'athlete', athleteId: id, householdId: athlete?.householdId ?? null, displayName: athlete?.name ?? null, email: null };
    return { ...base, viewer: 'athlete', user, uid: user.uid, householdId: user.householdId, athletes: athlete ? [athlete] : [], records: records.filter((r) => idOf(r) === id), claimed: { [id]: true } };
  }
  const parent = SEED_PARENTS[householdId] || SEED_PARENTS.whitfield;
  const user = { uid: parent.uid, role: 'parent', householdId, athleteId: null, displayName: parent.displayName, email: parent.email };
  const athletes = f.athletes.filter((a) => a.householdId === householdId);
  const ids = new Set(athletes.map((a) => a.id));
  return { ...base, viewer: 'parent', user, uid: user.uid, householdId, athletes, records: records.filter((r) => ids.has(idOf(r))), claimed: {} };
}

/** The same from Firestore: the caller's role decides whose rows; staff roles see none. */
async function liveInputs(now) {
  const user = await fetchCurrentUser();
  const base = { user, uid: user.uid, today: academyDateISO(now), utcToday: utcTodayISO(now), now, authUser: auth.currentUser };
  if (user.role === 'athlete' && user.athleteId) {
    const id = user.athleteId;
    // An own-athlete booking read carries the athleteId filter alone (live.js fetchBookings).
    const [athlete, record, bookings] = await Promise.all([fetchAthlete(id), fetchOwnConsent(id), fetchBookings(id)]);
    return { ...base, viewer: 'athlete', householdId: athlete.householdId ?? null, athletes: [athlete], records: record ? [record] : [], bookings, claimed: { [id]: true } };
  }
  if (user.role === 'parent' && user.householdId) {
    const hh = user.householdId;
    const [athletes, records, bookings] = await Promise.all([fetchHouseholdAthletes(hh), fetchHouseholdConsents(hh), fetchHouseholdBookings(hh)]);
    // "Claimed" is one test everywhere: loginInvites/{loginEmail}.status == 'claimed'.
    const invites = await Promise.all(athletes.map((a) => fetchLoginInvite(a.loginEmail).catch(() => null)));
    const claimed = Object.fromEntries(athletes.map((a, i) => [a.id, invites[i]?.status === 'claimed']));
    return { ...base, viewer: 'parent', householdId: hh, athletes, records, bookings, claimed };
  }
  return { ...base, viewer: null, householdId: null, athletes: [], records: [], bookings: [], claimed: {} };
}

/**
 * This device's draft state per unsigned athlete. Read only: a draft from before the athlete turned 18,
 * or an expired one, is cleared by the flow as it reads it (flowPayload), so the flow can say why it starts over.
 */
function draftStatesFor(inputs, nowMs) {
  const out = {};
  for (const a of inputs.athletes) {
    if (inputs.records.some((r) => idOf(r) === a.id)) continue;
    out[a.id] = draftState(readDraft(inputs.uid, a.id), { version: CONSENT_VERSION, adultNow: isAdultOnDate(a.dob, inputs.utcToday), nowMs });
  }
  return out;
}

const rowsOf = (inputs, draftStates) => familyRows({
  viewer: inputs.viewer, athletes: inputs.athletes, records: inputs.records, bookings: inputs.bookings, claimed: inputs.claimed,
  draftStates, utcToday: inputs.utcToday, today: inputs.today,
});

function familyPayload(inputs, nowMs) {
  const rows = rowsOf(inputs, draftStatesFor(inputs, nowMs));
  return { viewer: inputs.viewer, rows, byId: Object.fromEntries(rows.map((r) => [r.athleteId, r])) };
}

/* ------------------------------------------------------- family rows -- */

/** Seed mode's `{ viewer, rows, byId }` (the harness's `demoDraft` marks one athlete waiting for their agreement). */
export function seedFamilyConsents({ as = 'parent', today, utcToday, demoDraft = null }) {
  const payload = familyPayload(seedInputs({ as, today, utcToday, now: new Date() }), Date.now());
  if (!demoDraft || !payload.byId[demoDraft] || payload.byId[demoDraft].record) return payload;
  const rows = payload.rows.map((r) => (r.athleteId === demoDraft ? { ...r, draft: 'fresh' } : r));
  return { ...payload, rows, byId: Object.fromEntries(rows.map((r) => [r.athleteId, r])) };
}

async function liveFamilyConsents() {
  const now = new Date();
  return familyPayload(await liveInputs(now), now.getTime());
}

/**
 * `{ data: { viewer, rows: FamilyRow[], byId } | null, loading, error }`; `as` picks the seed viewer ('parent' | 'athlete').
 * `practice` (the onboarding walkthrough's homes) reads nothing and answers no rows: no live read, and no line out to a real flow.
 */
export function useFamilyConsents({ as = 'parent', demoDraft = null, practice = false } = {}) {
  const live = !practice && isLive();
  const now = new Date();
  const today = academyDateISO(now);
  const consentsGen = useInvalidation(MENTAL_CONSENT_KEY);
  const bookingsGen = useInvalidation('bookings');
  return useSeedResource(
    live || practice ? null : seedFamilyConsents({ as, today, utcToday: utcTodayISO(now), demoDraft }),
    live ? { source: liveFamilyConsents, deps: ['family-consents', as, today, consentsGen, bookingsGen] } : undefined
  );
}

/* ------------------------------------------------------------ the flow -- */

/** One athlete's flow payload. The record is read before the draft: a record deletes the draft and opens as signed. */
function flowPayload({ inputs, athlete, household, nowMs, demoNoRecord = false }) {
  const { viewer, uid } = inputs;
  const stored = inputs.records.find((r) => idOf(r) === athlete.id) || null;
  const record = demoNoRecord ? null : stored;
  const facts = flowFacts({ viewer, athlete, record, claimedLogin: Boolean(inputs.claimed[athlete.id]), now: inputs.now });
  let draft = null;
  let ds = null;
  if (record) {
    clearDraft(uid, athlete.id); // signed on another device, by the other parent or on the athlete's own login
  } else {
    draft = readDraft(uid, athlete.id);
    ds = draftState(draft, { version: CONSENT_VERSION, adultNow: isAdultOnDate(athlete.dob, facts.utcToday), nowMs });
    // Read once: the flow says why it starts over, and the family line stops offering "Start again".
    if (ds === 'adult-changed' || ds === 'expired') clearDraft(uid, athlete.id);
    if (ds !== 'fresh' && ds !== 'version-changed') draft = null;
  }
  const rows = rowsOf(demoNoRecord ? { ...inputs, records: inputs.records.filter((r) => r !== stored) } : inputs, draftStatesFor(inputs, nowMs));
  const signer = signerFor({ userDoc: inputs.user, authUser: inputs.authUser, household });
  const ec = household?.emergencyContact;
  const next = viewer === 'parent' ? rows.find((r) => r.athleteId !== athlete.id && SIGNABLE.includes(familyLine(r).action)) : null;
  return {
    viewer, uid,
    athlete: { id: athlete.id, name: athlete.name ?? '', dob: athlete.dob ?? null, householdId: athlete.householdId ?? null },
    signerName: signer.name, signerEmail: signer.email,
    guardianName: household?.guardian?.name ?? null,
    emergencyContact: ec && typeof ec === 'object' && ec.name ? { name: ec.name, phone: ec.phone ?? null, relationship: ec.relationship ?? null } : null,
    selfManaged: viewer === 'athlete' && Boolean(household) && household.createdBy === uid,
    record, status: facts.status, branch: facts.branch, drivingAsked: facts.drivingAsked, under13: facts.under13,
    draft, draftState: ds,
    nextAthleteId: next?.athleteId ?? null,
    nextName: next?.firstName ?? null,
    listCount: rows.length,
  };
}

function seedConsentFlow(athleteId, { demoViewer, demoNoRecord, now }) {
  const today = academyDateISO(now);
  const f = mentalFixtures(today);
  const athlete = f.athletes.find((a) => a.id === athleteId);
  if (!athlete) return null;
  const inputs = seedInputs({ as: demoViewer === 'athlete' ? 'athlete' : 'parent', today, utcToday: utcTodayISO(now), now, athleteId, householdId: athlete.householdId });
  return flowPayload({ inputs, athlete, household: f.households[athlete.householdId] || null, nowMs: now.getTime(), demoNoRecord });
}

async function liveConsentFlow(athleteId) {
  const now = new Date();
  const inputs = await liveInputs(now);
  if (!inputs.viewer) throw new LiveDataError(ERR.PERMISSION, 'useConsentFlow: the consent is signed on a parent or athlete login.');
  const athlete = inputs.athletes.find((a) => a.id === athleteId);
  if (!athlete) return null; // not this login's athlete: the screen shows not found
  const household = athlete.householdId ? await fetchHousehold(athlete.householdId).catch(() => null) : null;
  return flowPayload({ inputs, athlete, household, nowMs: now.getTime() });
}

/** The viewer's own read of one record, for createConsent's refusal: the household query for a parent, the own get for an athlete login. */
function rereadFor(viewer, athleteId, householdId) {
  if (viewer === 'athlete') return () => fetchOwnConsent(athleteId);
  return () => fetchHouseholdConsents(householdId).then((list) => list.find((r) => idOf(r) === athleteId) ?? null);
}

/**
 * One athlete's flow: `{ data, loading, error, sign(state), saveDraft(state),
 * dropDraft(), change(edits) }` (data shape in the plan's Task 10). `sign`
 * resolves `{ status: 'signed' }` or `{ status: 'already', record }` and
 * clears this device's draft either way; a needs-adult record is re-signed
 * (adultResign), anything else created (portalRecord). `change({ choices,
 * assentAudio?, adultConfirmName? })` appends the old values to history.
 */
export function useConsentFlow(athleteId, { demoViewer = null, demoNoRecord = false } = {}) {
  const live = isLive();
  const consentsGen = useInvalidation(MENTAL_CONSENT_KEY);
  const state = useSeedResource(
    live ? null : seedConsentFlow(athleteId, { demoViewer, demoNoRecord: Boolean(demoNoRecord), now: new Date() }),
    live ? { source: () => liveConsentFlow(athleteId), deps: ['consent-flow', athleteId, consentsGen] } : undefined
  );
  const data = state.data;

  const sign = useCallback(async (flow) => {
    const d = need(data);
    const choices = choicesFromFlow(flow);
    let result;
    if (d.status === 'needs-adult') {
      const build = (current) => adultResign({ current, uid: d.uid, name: flow.signature.name, choices, stamp: stampFor(live) });
      if (live) await updateConsent({ athleteId, build });
      else seedConsentUpdate(athleteId, build);
      result = { status: 'signed' };
    } else {
      const adult = isAdultBranch(d.branch);
      const doc = portalRecord({
        athleteId, householdId: d.athlete.householdId, uid: d.uid, adult, signerName: flow.signature.name, choices,
        assent: adult ? null : assentFromFlow(flow), stamp: stampFor(live),
      });
      result = live ? await createConsent({ athleteId, doc, reread: rereadFor(d.viewer, athleteId, d.athlete.householdId) }) : seedConsentCreate(athleteId, doc);
    }
    clearDraft(d.uid, athleteId);
    return result;
  }, [data, live, athleteId]);

  const saveDraft = useCallback((flow) => {
    const d = need(data);
    writeDraft(d.uid, athleteId, draftFromFlow(flow));
    bump(MENTAL_CONSENT_KEY);
  }, [data, athleteId]);

  const dropDraft = useCallback(() => {
    const d = need(data);
    clearDraft(d.uid, athleteId);
    bump(MENTAL_CONSENT_KEY);
  }, [data, athleteId]);

  const change = useCallback(async ({ choices, assentAudio, adultConfirmName } = {}) => {
    const d = need(data);
    const build = (current) => choicesUpdate({ current, uid: d.uid, choices, assentAudio, adultConfirmName, stamp: stampFor(live) });
    if (live) await updateConsent({ athleteId, build });
    else seedConsentUpdate(athleteId, build);
  }, [data, live, athleteId]);

  return { ...state, sign, saveDraft, dropDraft, change };
}

/* -------------------------------------------------- Yannick's actions -- */

/** Yannick's countersignature (role mental). Resolves `{ athleteId }`. */
export async function countersignConsent(athleteId) {
  if (!isLive()) {
    seedConsentUpdate(athleteId, () => countersignUpdate({ uid: 'mental', stamp: new Date() }));
    return { athleteId };
  }
  const { uid } = requireUser();
  await updateConsent({ athleteId, build: () => countersignUpdate({ uid, stamp: consentStamp() }) });
  return { athleteId };
}

/** A minor's own recording answer to no (the athlete's login or Yannick); never back to yes. Resolves `{ athleteId }`. */
export async function withdrawRecording(athleteId) {
  if (!isLive()) {
    seedConsentUpdate(athleteId, (current) => withdrawalUpdate({ current, uid: 'mental', stamp: new Date() }));
    return { athleteId };
  }
  const { uid } = requireUser();
  await updateConsent({ athleteId, build: (current) => withdrawalUpdate({ current, uid, stamp: consentStamp() }) });
  return { athleteId };
}

/** Yannick's "Send a reminder": `{ status: 'sent' | 'duplicate' }`; a refusal is a LiveDataError with the callable's `reason`. */
export async function sendConsentReminder(athleteId) {
  if (!isLive()) return { status: 'sent' };
  return callRequestMentalConsent({ athleteId });
}
